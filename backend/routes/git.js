/**
 * Git Routes
 * Git operations on workstations
 */

const express = require('express');
const router = express.Router();

const { asyncHandler, NotFoundError } = require('../middleware/errorHandler');
const { validateParams, schema } = require('../middleware/validator');
const { cleanWorkspaceName, execAsync } = require('../utils/helpers');

/**
 * Wrap command for SSH execution
 */
function wrapSsh(wsName, command) {
    const CODER_CLI_PATH = process.env.CODER_CLI_PATH || 'coder';
    const escapedCmd = command.replace(/'/g, "'\\''");
    return `ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=10 -o ProxyCommand="${CODER_CLI_PATH} ssh --stdio ${wsName}" coder.${wsName} '${escapedCmd}'`;
}

/**
 * Execute git command on workspace
 */
// Lazy load orchestrator
let orchestrator = null;
function getOrchestrator() {
    if (!orchestrator) orchestrator = require('../services/workspace-orchestrator');
    return orchestrator;
}

/**
 * Execute git command on workspace
 * Supports both Holy Grail (via Orchestrator) and legacy Coder (via SSH)
 */
async function executeGitCommand(projectId, gitCommand) {
    // Holy Grail path only (Legacy SSH removed as it times out on Fly)
    const orch = getOrchestrator();
    try {
        const start = Date.now();
        const result = await orch.exec(projectId, `git ${gitCommand}`);
        console.log(`⏱️ [Git] ${gitCommand} took ${Date.now() - start}ms`);

        // Check for git errors in exit code
        if (result.exitCode !== 0) {
            console.warn(`⚠️ [Git] Exit code ${result.exitCode}: ${result.stderr}`);
            // Don't throw for status/log as they might just be empty, handling is up to caller
            // But caller expects { stdout, stderr }, which we return.
        }
        return result;
    } catch (error) {
        console.error(`❌ [Git] Orchestrator exec failed: ${error.message}`);
        throw error;
    }
}

/**
 * GET /git/status/:projectId
 * Get git status
 */
router.get('/status/:projectId', asyncHandler(async (req, res) => {
    let { projectId } = req.params;
    const wsName = cleanWorkspaceName(projectId);

    console.log(`☁️  Git Status in cloud: ${wsName}`);

    // Use detailed git log format: hash|author|email|date|message
    const [statusResult, branchResult, logResult] = await Promise.all([
        executeGitCommand(projectId, 'status --porcelain'),
        executeGitCommand(projectId, 'branch --show-current'),
        executeGitCommand(projectId, 'log --format="%H|%an|%ae|%aI|%s" -20')
    ]);

    console.log(`🔍 [Git] Status Raw Output: "${statusResult.stdout}"`);
    console.log(`🔍 [Git] Log Raw Output: "${logResult.stdout}"`);

    // Parse status into categorized arrays (frontend expects this format)
    const statusLines = statusResult.stdout.split('\n').filter(l => l.trim());
    const staged = [];
    const modified = [];
    const untracked = [];
    const deleted = [];

    // Also keep raw changes for backward compatibility
    const changes = [];

    for (const line of statusLines) {
        const indexStatus = line[0];  // Status in staging area
        const workTreeStatus = line[1];  // Status in working tree
        const file = line.substring(3);

        changes.push({ status: line.substring(0, 2).trim(), file });

        // Categorize by status
        // ? = untracked
        if (indexStatus === '?') {
            untracked.push(file);
        }
        // Staged changes (index has M, A, D, R, C)
        else if (['M', 'A', 'R', 'C'].includes(indexStatus)) {
            staged.push(file);
        }
        // Deleted in index
        else if (indexStatus === 'D') {
            deleted.push(file);
            staged.push(file);
        }
        // Modified in working tree (not staged)
        else if (workTreeStatus === 'M') {
            modified.push(file);
        }
        // Deleted in working tree
        else if (workTreeStatus === 'D') {
            deleted.push(file);
        }
    }

    // Build status object in the format frontend expects
    const status = { staged, modified, untracked, deleted };

    // Parse commits with full details
    const currentBranch = (branchResult.stdout || 'main').trim();
    const commits = logResult.stdout.split('\n').filter(l => l.trim()).map((line, index) => {
        const parts = line.split('|');
        const hash = parts[0] || '';
        const author = parts[1] || 'Unknown';
        const authorEmail = parts[2] || '';
        const date = parts[3] || new Date().toISOString();
        const message = parts.slice(4).join('|') || 'No message';

        return {
            hash,
            shortHash: hash.substring(0, 7),
            message,
            author,
            authorEmail,
            date,
            isHead: index === 0,
            branch: index === 0 ? currentBranch : undefined
        };
    });

    res.json({
        success: true,
        isGitRepo: true,
        branch: currentBranch,
        currentBranch,
        changes,
        status,  // Categorized status for frontend
        hasChanges: changes.length > 0,
        commits
    });
}));

/**
 * Helper to configure git credentials for authenticated operations
 * Temporarily sets the remote URL with token for GitHub repos
 * Auto-configures remote from Firestore if not set
 */
async function withGitCredentials(projectId, token, operation) {
    const orch = getOrchestrator();
    const storageService = require('../services/storage-service');

    // Get current remote URL
    const remoteResult = await orch.exec(projectId, 'git remote get-url origin 2>/dev/null || echo ""');
    let remoteUrl = remoteResult.stdout.trim();

    // If no remote configured, try to get from Firestore and set it up
    if (!remoteUrl) {
        console.log(`   🔍 [Git] No remote configured, checking Firestore...`);
        const metadata = await storageService.getProjectMetadata(projectId);

        if (metadata.success && metadata.data) {
            const repoUrl = metadata.data.repositoryUrl || metadata.data.githubUrl;
            if (repoUrl) {
                console.log(`   🔗 [Git] Found repo URL in Firestore: ${repoUrl}`);
                // Configure the remote
                await orch.exec(projectId, `git remote add origin "${repoUrl}"`);
                remoteUrl = repoUrl;
            }
        }

        if (!remoteUrl) {
            throw new Error('No remote configured. Add a remote first: git remote add origin <url>');
        }
    }

    let authenticatedUrl = remoteUrl;
    let needsRestore = false;

    // If GitHub URL and we have a token, inject it
    if (token && remoteUrl.includes('github.com') && !remoteUrl.includes('@')) {
        // Convert https://github.com/user/repo.git to https://TOKEN@github.com/user/repo.git
        authenticatedUrl = remoteUrl.replace('https://github.com/', `https://${token}@github.com/`);

        // Temporarily set authenticated URL
        await orch.exec(projectId, `git remote set-url origin "${authenticatedUrl}"`);
        needsRestore = true;
        console.log(`   🔑 [Git] Configured credentials for ${remoteUrl.split('/').slice(-2).join('/')}`);
    }

    try {
        // Run the actual git operation
        const result = await operation();
        return result;
    } finally {
        // Always restore original URL (without token) for security
        if (needsRestore) {
            await orch.exec(projectId, `git remote set-url origin "${remoteUrl}"`);
            console.log(`   🔒 [Git] Restored original remote URL`);
        }
    }
}

/**
 * Extract token from Authorization header
 */
function extractToken(req) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        return authHeader.substring(7);
    }
    return null;
}

/**
 * POST /git/fetch/:projectId
 * Fetch from remote
 */
router.post('/fetch/:projectId', asyncHandler(async (req, res) => {
    const { projectId } = req.params;
    const wsName = cleanWorkspaceName(projectId);
    const token = extractToken(req);

    console.log(`☁️  Git Fetch in cloud: ${wsName}`);

    const result = await withGitCredentials(projectId, token, async () => {
        return await executeGitCommand(projectId, 'fetch --all');
    });

    res.json({
        success: result.exitCode === 0,
        message: result.exitCode === 0 ? 'Fetch completed' : 'Fetch failed',
        output: result.stdout,
        error: result.stderr
    });
}));

/**
 * POST /git/pull/:projectId
 * Pull from remote
 */
router.post('/pull/:projectId', asyncHandler(async (req, res) => {
    const { projectId } = req.params;
    const wsName = cleanWorkspaceName(projectId);
    const token = extractToken(req);

    console.log(`☁️  Git Pull in cloud: ${wsName}`);

    const result = await withGitCredentials(projectId, token, async () => {
        return await executeGitCommand(projectId, 'pull');
    });

    res.json({
        success: result.exitCode === 0,
        message: result.exitCode === 0 ? 'Pull completed' : 'Pull failed',
        output: result.stdout,
        error: result.stderr
    });
}));

/**
 * POST /git/push/:projectId
 * Push to remote
 */
router.post('/push/:projectId', asyncHandler(async (req, res) => {
    const { projectId } = req.params;
    const wsName = cleanWorkspaceName(projectId);
    const token = extractToken(req);

    console.log(`☁️  Git Push in cloud: ${wsName}`);

    const result = await withGitCredentials(projectId, token, async () => {
        return await executeGitCommand(projectId, 'push');
    });

    res.json({
        success: result.exitCode === 0,
        message: result.exitCode === 0 ? 'Push completed' : 'Push failed',
        output: result.stdout,
        error: result.stderr
    });
}));

/**
 * POST /git/commit/:projectId
 * Create a commit
 */
router.post('/commit/:projectId', asyncHandler(async (req, res) => {
    const { projectId } = req.params;
    const { message } = req.body;
    const wsName = cleanWorkspaceName(projectId);

    if (!message) {
        return res.status(400).json({ error: 'Commit message is required' });
    }

    console.log(`☁️  Git Commit in cloud: ${wsName}`);

    // Stage all changes
    await executeGitCommand(projectId, 'add -A');

    // Commit
    const escapedMessage = message.replace(/"/g, '\\"');
    const result = await executeGitCommand(projectId, `commit -m "${escapedMessage}"`);

    res.json({
        success: result.exitCode === 0,
        message: result.exitCode === 0 ? 'Commit created' : 'Commit failed',
        output: result.stdout,
        error: result.stderr
    });
}));

/**
 * POST /git/checkout/:projectId
 * Checkout branch
 */
router.post('/checkout/:projectId', asyncHandler(async (req, res) => {
    const { projectId } = req.params;
    const { branch, create = false } = req.body;
    const wsName = cleanWorkspaceName(projectId);

    if (!branch) {
        return res.status(400).json({ error: 'Branch name is required' });
    }

    console.log(`☁️  Git Checkout in cloud: ${wsName} -> ${branch}`);

    const command = create ? `checkout -b ${branch}` : `checkout ${branch}`;
    const result = await executeGitCommand(projectId, command);

    res.json({
        success: true,
        message: `Switched to branch ${branch}`,
        output: result.stdout
    });
}));

/**
 * GET /git/branches/:projectId
 * List branches
 */
router.get('/branches/:projectId', asyncHandler(async (req, res) => {
    const { projectId } = req.params;
    const wsName = cleanWorkspaceName(projectId);

    console.log(`☁️  Git Branches in cloud: ${wsName}`);

    const [localResult, currentResult] = await Promise.all([
        executeGitCommand(projectId, 'branch'),
        executeGitCommand(projectId, 'branch --show-current')
    ]);

    const branches = localResult.stdout.split('\n')
        .filter(l => l.trim())
        .map(l => l.replace('*', '').trim());

    res.json({
        success: true,
        branches,
        current: currentResult.stdout.trim()
    });
}));

/**
 * POST /git/stash/:projectId
 * Stash changes
 */
router.post('/stash/:projectId', asyncHandler(async (req, res) => {
    const { projectId } = req.params;
    const { action = 'push', message } = req.body;
    const wsName = cleanWorkspaceName(projectId);

    console.log(`☁️  Git Stash ${action} in cloud: ${wsName}`);

    let command = 'stash';
    if (action === 'push' && message) {
        command = `stash push -m "${message.replace(/"/g, '\\"')}"`;
    } else if (action === 'pop') {
        command = 'stash pop';
    } else if (action === 'list') {
        command = 'stash list';
    }

    const result = await executeGitCommand(projectId, command);

    res.json({
        success: true,
        message: `Stash ${action} completed`,
        output: result.stdout
    });
}));

module.exports = router;
