/**
 * Workstation Routes
 * File operations and workstation management
 */

const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const { glob } = require('glob');
const router = express.Router();

const { asyncHandler, NotFoundError, ValidationError } = require('../middleware/errorHandler');
const { validateBody, schema, commonSchemas } = require('../middleware/validator');
const { cleanProjectId, unescapeString, getRepoPath, execAsync } = require('../utils/helpers');
const { FILE_LIMITS, IGNORED_DIRS } = require('../utils/constants');
const { executeTool, createContext } = require('../services/tool-executor');

/**
 * GET /workstation/:projectId/files
 * List files in project
 */
router.get('/:projectId/files', asyncHandler(async (req, res) => {
    let { projectId } = req.params;
    const { repositoryUrl } = req.query;

    projectId = cleanProjectId(projectId);
    const repoPath = getRepoPath(projectId);

    console.log(`📖 GET /workstation/${projectId}/files`);
    console.log('📂 Getting files for project:', projectId);

    // PRE-WARM: Start workspace in background when user opens a project
    const workstationId = `ws-${projectId.toLowerCase()}`;
    (async () => {
        try {
            const coderService = require('../coder-service');
            const userEmail = req.query.userEmail || req.query.userId || `${workstationId}@drape.ide`;
            const username = userEmail.split('@')[0].replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();

            console.log(`🔥 [Background] Pre-warming workspace for recent project: ${workstationId}`);
            const coderUser = await coderService.ensureUser(userEmail, username);
            const ws = await coderService.createWorkspace(coderUser.id, workstationId, repositoryUrl);

            if (ws.latest_build?.job?.status !== 'succeeded') {
                console.log(`   [Background] Starting workspace ${ws.id}...`);
                await coderService.startWorkspace(ws.id);
            }
            console.log(`✅ [Background] Workspace pre-warm initiated for recent project!`);
        } catch (bgError) {
            // Silent fail - don't block the files response
            console.warn(`⚠️ [Background] Pre-warm failed: ${bgError.message}`);
        }
    })();

    // Check if directory exists locally
    let localDirExists = false;
    try {
        await fs.access(repoPath);
        localDirExists = true;
    } catch {
        // Directory doesn't exist locally - try to read from Coder workspace
        console.log(`   📂 Local path not found, trying Coder workspace...`);

        try {
            const agentClient = require('../services/agent-client');
            const coderService = require('../coder-service');

            // Use admin user for now
            const targetEmail = 'daniele.scianna04@gmail.com';
            const targetUsername = 'admin';
            const coderUser = await coderService.ensureUser(targetEmail, targetUsername);

            // The workstationId might be the projectId itself (for Firestore-created workstations)
            const wsName = projectId;

            // Try to get files from Coder workspace
            const lsResult = await agentClient.exec(coderUser.username, wsName, coderUser.id,
                'find /home/coder/project -maxdepth 4 -type f -not -path "*/.*" -not -path "*/node_modules/*" 2>/dev/null | head -200');

            if (lsResult.exitCode === 0 && lsResult.stdout) {
                const files = lsResult.stdout.split('\n')
                    .filter(f => f.trim() && f.includes('/home/coder/project/'))
                    .map(f => {
                        const relativePath = f.replace('/home/coder/project/', '');
                        const name = relativePath.split('/').pop();
                        return {
                            name,
                            type: 'file',
                            path: relativePath
                        };
                    });

                console.log(`   ✅ Found ${files.length} files in Coder workspace`);
                return res.json({ success: true, files });
            }
        } catch (coderError) {
            console.warn(`   ⚠️ Could not read from Coder workspace: ${coderError.message}`);
        }

        // Fallback to Firestore
        if (repositoryUrl) {
            try {
                const admin = require('firebase-admin');
                const db = admin.firestore();
                const doc = await db.collection('workstation_files').doc(projectId).get();
                if (doc.exists) {
                    const data = doc.data();
                    console.log(`📂 Found ${data.files?.length || 0} files in Firestore for project`);
                    return res.json({ success: true, files: data.files || [] });
                }
            } catch (fsError) {
                console.error('Error reading from Firestore:', fsError.message);
            }
        }
        throw new NotFoundError('Project');
    }


    // Read directory recursively
    async function readDirectory(dirPath, basePath = '') {
        const files = [];
        const entries = await fs.readdir(dirPath, { withFileTypes: true });

        for (const entry of entries) {
            if (IGNORED_DIRS.includes(entry.name)) continue;

            const fullPath = path.join(dirPath, entry.name);
            const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name;

            if (entry.isDirectory()) {
                const subFiles = await readDirectory(fullPath, relativePath);
                files.push(...subFiles);
            } else {
                files.push({
                    name: entry.name,
                    type: 'file',
                    path: relativePath
                });
            }
        }

        return files;
    }

    const files = await readDirectory(repoPath);
    res.json({ success: true, files });
}));

/**
 * POST /workstation/read-file
 * Read file contents
 */
router.post('/read-file',
    validateBody({
        projectId: commonSchemas.projectId(),
        filePath: commonSchemas.filePath()
    }),
    asyncHandler(async (req, res) => {
        const { projectId, filePath, maxLines } = req.body;
        const context = createContext(projectId);

        try {
            const fullPath = path.join(context.projectPath, filePath);
            let content = await fs.readFile(fullPath, 'utf8');

            // Limit lines if requested
            if (maxLines) {
                const lines = content.split('\n');
                if (lines.length > maxLines) {
                    content = lines.slice(0, maxLines).join('\n') + `\n\n... (${lines.length - maxLines} more lines)`;
                }
            }

            res.json({
                success: true,
                content,
                lines: content.split('\n').length
            });
        } catch (error) {
            if (error.code === 'ENOENT') {
                throw new NotFoundError('File');
            }
            throw error;
        }
    })
);

/**
 * POST /workstation/write-file
 * Write file contents
 */
router.post('/write-file',
    validateBody({
        projectId: commonSchemas.projectId(),
        filePath: commonSchemas.filePath(),
        content: schema().required().string()
    }),
    asyncHandler(async (req, res) => {
        const { projectId, filePath, content } = req.body;
        const context = createContext(projectId);

        const unescapedContent = unescapeString(content);
        const fullPath = path.join(context.projectPath, filePath);

        // Create directory if needed
        const dir = path.dirname(fullPath);
        await fs.mkdir(dir, { recursive: true });

        // Generate diff info
        let diffInfo = { added: 0, removed: 0, diff: '' };
        try {
            const originalContent = await fs.readFile(fullPath, 'utf8');
            const oldLines = originalContent.split('\n');
            const newLines = unescapedContent.split('\n');

            diffInfo.added = Math.max(0, newLines.length - oldLines.length);
            diffInfo.removed = Math.max(0, oldLines.length - newLines.length);
        } catch {
            // New file
            diffInfo.added = unescapedContent.split('\n').length;
        }

        await fs.writeFile(fullPath, unescapedContent, 'utf8');

        res.json({
            success: true,
            message: 'File written successfully',
            diffInfo
        });
    })
);

/**
 * POST /workstation/edit-file
 * Edit file using search & replace
 */
router.post('/edit-file',
    validateBody({
        projectId: commonSchemas.projectId(),
        filePath: commonSchemas.filePath(),
        oldString: schema().required().string(),
        newString: schema().required().string()
    }),
    asyncHandler(async (req, res) => {
        const { projectId, filePath, oldString, newString } = req.body;
        const context = createContext(projectId);

        const result = await executeTool('edit_file', {
            filePath,
            oldText: oldString,
            newText: newString
        }, context);

        const success = result.startsWith('✅');

        res.json({
            success,
            message: success ? 'File edited successfully' : result,
            ...(success && { diffInfo: { added: 1, removed: 1, diff: '' } })
        });
    })
);

/**
 * POST /workstation/list-directory
 * List directory contents
 */
router.post('/list-directory', asyncHandler(async (req, res) => {
    const { projectId, directory = '.' } = req.body;
    const repoPath = getRepoPath(cleanProjectId(projectId));
    const fullPath = path.join(repoPath, directory);

    console.log('📁 Listing directory:', fullPath);

    const entries = await fs.readdir(fullPath, { withFileTypes: true });
    const files = entries.map(entry => ({
        name: entry.name,
        type: entry.isDirectory() ? 'directory' : 'file',
        path: path.join(directory, entry.name)
    }));

    res.json({ success: true, files });
}));

/**
 * POST /workstation/glob-files
 * Search files with glob pattern
 */
router.post('/glob-files', asyncHandler(async (req, res) => {
    const { projectId, pattern } = req.body;
    const repoPath = getRepoPath(cleanProjectId(projectId));

    console.log('🔍 Glob search:', pattern);

    const files = await glob(pattern, {
        cwd: repoPath,
        ignore: IGNORED_DIRS.map(d => `${d}/**`),
        nodir: true
    });

    res.json({ success: true, files });
}));

/**
 * POST /workstation/search-files
 * Search in files using grep
 */
router.post('/search-files', asyncHandler(async (req, res) => {
    const { projectId, pattern } = req.body;
    const repoPath = getRepoPath(cleanProjectId(projectId));

    console.log('🔍 Searching for:', pattern);

    try {
        const { stdout } = await execAsync(
            `cd "${repoPath}" && grep -rn "${pattern}" --include="*.js" --include="*.jsx" --include="*.ts" --include="*.tsx" --include="*.json" --exclude-dir=node_modules --exclude-dir=.git . || true`,
            { maxBuffer: 10 * 1024 * 1024 }
        );

        const results = stdout.split('\n').filter(l => l.trim()).map(line => {
            const [file, ...rest] = line.split(':');
            return { file, match: rest.join(':') };
        });

        const limited = results.slice(0, FILE_LIMITS.MAX_SEARCH_RESULTS);

        res.json({
            success: true,
            results: limited,
            totalCount: results.length,
            truncated: results.length > FILE_LIMITS.MAX_SEARCH_RESULTS
        });
    } catch (error) {
        res.json({ success: true, results: [], totalCount: 0 });
    }
}));

/**
 * POST /workstation/execute-command
 * Execute shell command
 */
router.post('/execute-command',
    validateBody({
        projectId: commonSchemas.projectId(),
        command: commonSchemas.command()
    }),
    asyncHandler(async (req, res) => {
        const { projectId, command } = req.body;
        const context = createContext(projectId);

        console.log('💻 Executing:', command);

        const result = await executeTool('execute_command', { command }, context);
        const success = result.startsWith('✅');

        // Parse output
        const lines = result.split('\n');
        const output = lines.slice(1).join('\n');

        res.json({
            success,
            stdout: success ? output : '',
            stderr: success ? '' : output,
            exitCode: success ? 0 : 1
        });
    })
);

/**
 * POST /workstation/read-multiple-files
 * Read multiple files at once
 */
router.post('/read-multiple-files', asyncHandler(async (req, res) => {
    const { projectId, filePaths } = req.body;
    const repoPath = getRepoPath(cleanProjectId(projectId));

    console.log('📚 Reading multiple files:', filePaths);

    const results = [];

    for (const filePath of filePaths) {
        try {
            const content = await fs.readFile(path.join(repoPath, filePath), 'utf8');
            results.push({
                filePath,
                success: true,
                content,
                lines: content.split('\n').length
            });
        } catch (error) {
            results.push({
                filePath,
                success: false,
                error: error.message
            });
        }
    }

    res.json({
        success: true,
        results,
        totalFiles: filePaths.length,
        successCount: results.filter(r => r.success).length
    });
}));

/**
 * POST /workstation/edit-multiple-files
 * Edit multiple files atomically
 */
router.post('/edit-multiple-files', asyncHandler(async (req, res) => {
    const { projectId, edits } = req.body;
    const repoPath = getRepoPath(cleanProjectId(projectId));

    console.log('📝 Editing multiple files:', edits.length);

    const results = [];
    const backups = [];

    // Backup phase
    for (const edit of edits) {
        const fullPath = path.join(repoPath, edit.filePath);
        try {
            const content = await fs.readFile(fullPath, 'utf8');
            backups.push({ filePath: edit.filePath, content });
        } catch {
            backups.push({ filePath: edit.filePath, content: null });
        }
    }

    // Apply phase
    try {
        for (let i = 0; i < edits.length; i++) {
            const edit = edits[i];
            const fullPath = path.join(repoPath, edit.filePath);

            if (edit.type === 'write') {
                await fs.writeFile(fullPath, edit.content, 'utf8');
                results.push({ filePath: edit.filePath, success: true, type: 'write' });
            } else if (edit.type === 'edit') {
                const original = backups[i].content;
                if (!original) throw new Error(`File ${edit.filePath} not found`);

                const newContent = original.replace(edit.oldString, edit.newString);
                await fs.writeFile(fullPath, newContent, 'utf8');
                results.push({ filePath: edit.filePath, success: true, type: 'edit' });
            }
        }

        res.json({ success: true, results, totalFiles: edits.length });
    } catch (error) {
        // Rollback
        for (const backup of backups) {
            if (backup.content !== null) {
                await fs.writeFile(path.join(repoPath, backup.filePath), backup.content, 'utf8');
            }
        }

        res.status(500).json({
            success: false,
            error: error.message,
            rolledBack: true
        });
    }
}));

/**
 * POST /workstation/create
 * Create a workstation and fetch GitHub files
 */
router.post('/create', asyncHandler(async (req, res) => {
    const { repositoryUrl, userId, projectId, projectType, projectName, githubToken } = req.body;
    const axios = require('axios');
    const admin = require('firebase-admin');
    const db = admin.firestore();

    console.log('🚀 Creating workstation for:', projectType === 'git' ? repositoryUrl : projectName);

    const workstationId = `ws-${projectId.toLowerCase().replace(/[^a-z0-9-]/g, '-')}`;
    console.log('Workstation ID:', workstationId);

    // Fetch file list from GitHub API if it's a git project
    let files = [];
    if (projectType === 'git' && repositoryUrl) {
        try {
            const repoMatch = repositoryUrl.match(/github\.com\/([^\/]+)\/([^\/]+?)(?:\.git)?$/);
            if (repoMatch) {
                const [, owner, repo] = repoMatch;
                console.log(`📦 Fetching files from GitHub: ${owner}/${repo}`);

                const headers = { 'User-Agent': 'Drape-App' };
                if (githubToken) {
                    headers['Authorization'] = `Bearer ${githubToken}`;
                    console.log('🔐 Using GitHub token for authentication');
                }

                // Try main branch first, then master
                let githubResponse;
                try {
                    githubResponse = await axios.get(
                        `https://api.github.com/repos/${owner}/${repo}/git/trees/main?recursive=1`,
                        { headers }
                    );
                } catch (error) {
                    console.log('⚠️ main branch not found, trying master...');
                    githubResponse = await axios.get(
                        `https://api.github.com/repos/${owner}/${repo}/git/trees/master?recursive=1`,
                        { headers }
                    );
                }

                files = githubResponse.data.tree
                    .filter(item => item.type === 'blob')
                    .map(item => item.path)
                    .filter(path =>
                        !path.includes('node_modules/') &&
                        !path.startsWith('.git/') &&
                        !path.includes('/dist/') &&
                        !path.includes('/build/')
                    )
                    .slice(0, 500);

                console.log(`✅ Found ${files.length} files from GitHub`);
            }
        } catch (error) {
            console.error('⚠️ Error fetching GitHub files:', error.message);

            // Check if it's an authentication issue
            if (error.response?.status === 401 || error.response?.status === 403) {
                console.log('🔒 Authentication failed or insufficient permissions');
                return res.status(401).json({
                    error: 'Authentication required',
                    message: githubToken
                        ? 'The provided token does not have access to this repository'
                        : 'This repository requires authentication',
                    requiresAuth: true
                });
            }

            // Use basic structure as fallback
            files = ['README.md', 'package.json', '.gitignore', 'src/index.js', 'src/App.js'];
            console.log('📝 Using fallback file structure');
        }

        // Store files in Firestore
        try {
            await db.collection('workstation_files').doc(projectId).set({
                workstationId,
                files,
                repositoryUrl,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            console.log(`💾 Saved ${files.length} files to Firestore`);
        } catch (error) {
            console.error('⚠️ Error saving files to Firestore:', error.message);
        }
    }

    // OPTIMIZATION: Start Coder Workspace in Background (ALWAYS)
    // If no email provided, use a default based on workstationId
    const userEmail = req.body.email || req.body.targetEmail || req.body.userId || `${workstationId}@drape.ide`;
    (async () => {
        try {
            const coderService = require('../coder-service');
            console.log(`🚀 [Background] Pre-warming workspace ${workstationId}...`);

            // Generate Coder username from email
            const username = userEmail.split('@')[0].replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
            const coderUser = await coderService.ensureUser(userEmail, username);

            // Create/Start Workspace
            // IMPORTANT: Use workstationId directly (ws-xxx) to match preview.js logic
            const ws = await coderService.createWorkspace(coderUser.id, workstationId, repositoryUrl);

            if (ws.latest_build?.job?.status !== 'running' && ws.latest_build?.status !== 'running') {
                console.log(`   [Background] Starting workspace ${ws.id}...`);
                await coderService.startWorkspace(ws.id);
            }
            console.log(`✅ [Background] Workspace pre-warm initiated!`);
        } catch (bgError) {
            console.error(`⚠️ [Background] Pre-warm failed: ${bgError.message}`);
        }
    })();

    res.json({
        workstationId,
        status: 'running',
        message: 'Workstation created successfully',
        repositoryUrl: repositoryUrl || null,
        filesCount: files.length
    });
}));

module.exports = router;
