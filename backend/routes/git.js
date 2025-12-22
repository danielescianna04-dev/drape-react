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
async function executeGitCommand(wsName, gitCommand) {
    const fullCmd = wrapSsh(wsName, `cd /home/coder/project && git ${gitCommand}`);

    const { stdout, stderr } = await execAsync(fullCmd, {
        env: { ...process.env },
        timeout: 30000
    });

    return { stdout: stdout.trim(), stderr: stderr.trim() };
}

/**
 * GET /git/status/:projectId
 * Get git status
 */
router.get('/status/:projectId', asyncHandler(async (req, res) => {
    let { projectId } = req.params;
    const wsName = cleanWorkspaceName(projectId);

    console.log(`☁️  Git Status in cloud: ${wsName}`);

    const [statusResult, branchResult, logResult] = await Promise.all([
        executeGitCommand(wsName, 'status --porcelain'),
        executeGitCommand(wsName, 'branch --show-current'),
        executeGitCommand(wsName, 'log --oneline -10')
    ]);

    // Parse status
    const statusLines = statusResult.stdout.split('\n').filter(l => l.trim());
    const changes = statusLines.map(line => {
        const status = line.substring(0, 2).trim();
        const file = line.substring(3);
        return { status, file };
    });

    // Parse commits
    const commits = logResult.stdout.split('\n').filter(l => l.trim()).map(line => {
        const [hash, ...messageParts] = line.split(' ');
        return { hash, message: messageParts.join(' ') };
    });

    res.json({
        success: true,
        branch: branchResult.stdout || 'main',
        changes,
        hasChanges: changes.length > 0,
        commits
    });
}));

/**
 * POST /git/fetch/:projectId
 * Fetch from remote
 */
router.post('/fetch/:projectId', asyncHandler(async (req, res) => {
    const { projectId } = req.params;
    const wsName = cleanWorkspaceName(projectId);

    console.log(`☁️  Git Fetch in cloud: ${wsName}`);
    await executeGitCommand(wsName, 'fetch --all');

    res.json({ success: true, message: 'Fetch completed' });
}));

/**
 * POST /git/pull/:projectId
 * Pull from remote
 */
router.post('/pull/:projectId', asyncHandler(async (req, res) => {
    const { projectId } = req.params;
    const wsName = cleanWorkspaceName(projectId);

    console.log(`☁️  Git Pull in cloud: ${wsName}`);
    const result = await executeGitCommand(wsName, 'pull');

    res.json({
        success: true,
        message: 'Pull completed',
        output: result.stdout
    });
}));

/**
 * POST /git/push/:projectId
 * Push to remote
 */
router.post('/push/:projectId', asyncHandler(async (req, res) => {
    const { projectId } = req.params;
    const wsName = cleanWorkspaceName(projectId);

    console.log(`☁️  Git Push in cloud: ${wsName}`);
    const result = await executeGitCommand(wsName, 'push');

    res.json({
        success: true,
        message: 'Push completed',
        output: result.stdout
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
    await executeGitCommand(wsName, 'add -A');

    // Commit
    const escapedMessage = message.replace(/"/g, '\\"');
    const result = await executeGitCommand(wsName, `commit -m "${escapedMessage}"`);

    res.json({
        success: true,
        message: 'Commit created',
        output: result.stdout
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
    const result = await executeGitCommand(wsName, command);

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
        executeGitCommand(wsName, 'branch'),
        executeGitCommand(wsName, 'branch --show-current')
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

    const result = await executeGitCommand(wsName, command);

    res.json({
        success: true,
        message: `Stash ${action} completed`,
        output: result.stdout
    });
}));

module.exports = router;
