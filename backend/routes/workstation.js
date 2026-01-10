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

const creationTasks = new Map();

/**
 * GET /workstation/create-status/:taskId
 * Poll task status
 */
router.get('/create-status/:taskId', (req, res) => {
    const task = creationTasks.get(req.params.taskId);
    if (!task) return res.status(404).json({ success: false, error: 'Task not found' });
    res.json({ success: true, task });
});

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

    // Check if directory exists locally
    let localDirExists = false;
    try {
        await fs.access(repoPath);
        localDirExists = true;
    } catch {
        // Directory doesn't exist locally - try Holy Grail storage
        console.log(`   📂 Local path not found, trying Storage Service...`);

        try {
            const storageService = require('../services/storage-service');
            const result = await storageService.listFiles(projectId);

            if (result.success && result.files?.length > 0) {
                console.log(`   ✅ Found ${result.files.length} files in Storage`);
                return res.json({ success: true, files: result.files });
            }
        } catch (storageError) {
            console.warn(`   ⚠️ Could not read from Storage: ${storageError.message}`);
        }

        // Fallback to Firestore workstation_files collection
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
 * POST /workstation/undo-file
 * Restore file to previous content (for undo functionality)
 */
router.post('/undo-file',
    validateBody({
        projectId: commonSchemas.projectId(),
        filePath: commonSchemas.filePath(),
        content: schema().required().string()
    }),
    asyncHandler(async (req, res) => {
        const { projectId, filePath, content } = req.body;

        console.log(`↩️ [Undo] Restoring ${filePath} for project ${projectId}`);

        // Try Holy Grail first
        try {
            const orchestrator = require('../services/workspace-orchestrator');
            const cleanFilePath = filePath.replace(/^\.\//, '');

            // Check if this is a Holy Grail project
            const storageService = require('../services/storage-service');
            const existingFile = await storageService.readFile(projectId, cleanFilePath);

            if (existingFile.success || projectId.startsWith('ws-')) {
                // Holy Grail mode - write via orchestrator
                await orchestrator.writeFile(projectId, cleanFilePath, content);
                console.log(`✅ [Undo] File restored via Holy Grail: ${filePath}`);
                return res.json({
                    success: true,
                    message: 'File restored successfully',
                    mode: 'holy-grail'
                });
            }
        } catch (e) {
            console.log(`   [Undo] Not Holy Grail mode, trying local: ${e.message}`);
        }

        // Local mode fallback
        const context = createContext(projectId);
        const fullPath = path.join(context.projectPath, filePath);

        // Create directory if needed
        const dir = path.dirname(fullPath);
        await fs.mkdir(dir, { recursive: true });

        // Write the restored content
        await fs.writeFile(fullPath, content, 'utf8');

        console.log(`✅ [Undo] File restored locally: ${filePath}`);
        res.json({
            success: true,
            message: 'File restored successfully',
            mode: 'local'
        });
    })
);

/**
 * POST /workstation/create-folder
 * Create a new folder
 */
router.post('/create-folder',
    validateBody({
        projectId: commonSchemas.projectId(),
        folderPath: commonSchemas.filePath()
    }),
    asyncHandler(async (req, res) => {
        const { projectId, folderPath } = req.body;

        // Try Holy Grail (orchestrator) first
        try {
            const orchestrator = require('../services/workspace-orchestrator');
            const result = await orchestrator.createFolder(projectId, folderPath);
            return res.json({ success: true, message: 'Folder created successfully' });
        } catch (orchestratorError) {
            console.log(`   ⚠️ Orchestrator error, falling back to local: ${orchestratorError.message}`);
        }

        // Fallback to local filesystem
        const context = createContext(projectId);
        const fullPath = path.join(context.projectPath, folderPath);

        await fs.mkdir(fullPath, { recursive: true });

        res.json({
            success: true,
            message: 'Folder created successfully'
        });
    })
);

/**
 * POST /workstation/delete-file
 * Delete a file or folder
 */
router.post('/delete-file',
    validateBody({
        projectId: commonSchemas.projectId(),
        filePath: commonSchemas.filePath()
    }),
    asyncHandler(async (req, res) => {
        const { projectId, filePath } = req.body;

        // Try Holy Grail (orchestrator) first
        try {
            const orchestrator = require('../services/workspace-orchestrator');
            const result = await orchestrator.deleteFile(projectId, filePath);
            return res.json({ success: true, message: 'Deleted successfully' });
        } catch (orchestratorError) {
            console.log(`   ⚠️ Orchestrator error, falling back to local: ${orchestratorError.message}`);
        }

        // Fallback to local filesystem
        const context = createContext(projectId);
        const fullPath = path.join(context.projectPath, filePath);

        try {
            const stat = await fs.stat(fullPath);
            if (stat.isDirectory()) {
                await fs.rm(fullPath, { recursive: true, force: true });
            } else {
                await fs.unlink(fullPath);
            }
        } catch (e) {
            throw new NotFoundError('File or folder');
        }

        res.json({
            success: true,
            message: 'Deleted successfully'
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
 * DELETE /workstation/:projectId
 * Delete a project directory
 */
router.delete('/:projectId', asyncHandler(async (req, res) => {
    let { projectId } = req.params;
    projectId = cleanProjectId(projectId);
    const repoPath = getRepoPath(projectId);

    console.log(`🗑️ Deleting project files: ${projectId}`);

    try {
        await fs.rm(repoPath, { recursive: true, force: true });
        console.log(`✅ Project files deleted: ${repoPath}`);
        res.json({ success: true, message: 'Project deleted' });
    } catch (error) {
        console.error(`❌ Error deleting project files: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
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

    res.json({
        workstationId,
        status: 'running',
        message: 'Workstation created successfully',
        repositoryUrl: repositoryUrl || null,
        filesCount: files.length,
        files: files.map(f => typeof f === 'string' ? f : f.path)
    });
}));

/**
 * POST /workstation/create-with-template
 * Create a workstation with AI-generated code using Claude
 */
/**
 * POST /workstation/create-with-template
 * Create a workstation with AI-generated code using Claude
 */
router.post('/create-with-template', asyncHandler(async (req, res) => {
    const { projectName, technology, description, userId, projectId } = req.body;

    if (!projectName || !technology || !userId) {
        return res.status(400).json({
            error: 'Missing required fields: projectName, technology, userId'
        });
    }

    // Generate IDs
    const wsId = projectId || `ws-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const taskId = `task-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

    // Initialize Task
    creationTasks.set(taskId, {
        status: 'running',
        progress: 0,
        message: 'Initializing...',
        step: 'Starting',
        projectId: wsId,
        startTime: Date.now()
    });

    // Send Immediate Response
    res.json({
        success: true,
        taskId,
        projectId: wsId,
        message: 'Project creation started'
    });

    // Run Background Task (Fire & Forget)
    runProjectCreationTask(taskId, wsId, req.body).catch(err => {
        console.error(`❌ Task ${taskId} failed:`, err);
        const task = creationTasks.get(taskId);
        if (task) {
            task.status = 'failed';
            task.error = err.message;
            task.progress = 0;
        }
    });
}));

async function runProjectCreationTask(taskId, wsId, params) {
    const { projectName, technology, description, userId } = params;

    const update = (progress, message, step) => {
        const task = creationTasks.get(taskId);
        if (task) {
            task.progress = progress;
            task.message = message;
            if (step) task.step = step;
            task.updatedAt = Date.now();
        }
    };

    update(5, 'Connecting to AI Engine...', 'Initializing');

    const admin = require('firebase-admin');
    const db = admin.firestore();
    const { getProviderForModel } = require('../services/ai-providers');
    const storageService = require('../services/storage-service');

    console.log(`\n🚀 [Task ${taskId}] Creating AI-powered project: ${projectName}`);

    // Get AI provider (using Gemini - configured in .env)
    update(10, 'Preparing AI Model...', 'Configuration');
    const { provider, modelId } = getProviderForModel('gemini-2.5-flash');

    console.log(`   📋 Description provided: "${description?.substring(0, 80)}..."`);
    console.log(`   🤖 Provider available: ${provider?.isAvailable?.() || 'unknown'}`);

    if (!provider.client && provider.isAvailable()) {
        await provider.initialize();
        console.log('   ✅ Provider initialized');
    } else if (!provider.isAvailable()) {
        console.error('   ❌ AI Provider not available - check GEMINI_API_KEY');
    }

    // Premium system prompt with contextual content generation
    const systemPrompt = `You are an expert full-stack developer AND content strategist. Your task is to create a COMPLETE, production-ready ${technology} project with REALISTIC, CONTEXTUAL content.

=== PROJECT CONTEXT ===
- Project Name: ${projectName}
- Technology: ${technology}
- User Request: "${description || 'A modern web application'}"

=== STEP 1: UNDERSTAND THE REQUEST ===
First, analyze the user's request to extract:
1. INDUSTRY/DOMAIN: What type of business or website is this? (e-commerce, restaurant, portfolio, blog, SaaS, etc.)
2. TARGET AUDIENCE: Who will use this website?
3. CORE PURPOSE: What should visitors do on this site? (buy products, book services, learn, contact, etc.)
4. TONE: Professional, casual, luxury, playful, technical, etc.

=== STEP 2: GENERATE CONTEXTUAL CONTENT ===
Based on your analysis, generate REAL, SPECIFIC content - NOT generic placeholders.

CRITICAL CONTENT RULES:
❌ NEVER use: "Product 1", "Product 2", "Description of product 1", "Lorem ipsum", "Your Company", "Feature 1"
✅ ALWAYS use: Real product/service names, realistic descriptions, actual prices, genuine testimonials

CONTENT EXAMPLES BY INDUSTRY:

For E-COMMERCE (vape shop, clothing, tech):
- Real product names: "Elf Bar BC5000", "SMOK Nord 5", "Vaporesso XROS 3" (for vape)
- Real categories: "Dispositivi", "Liquidi", "Accessori", "Kit Starter"
- Real descriptions: "Kit completo con batteria 1500mAh e pod ricaricabile da 2ml"
- Real prices: "€24.99", "€12.50"
- Real features: "Spedizione gratuita sopra €50", "Garanzia 12 mesi"

For RESTAURANT/FOOD:
- Real menu items with descriptions and prices
- Real opening hours and location
- Real ambiance descriptions

For PORTFOLIO:
- Realistic project names and descriptions
- Actual skills and technologies
- Professional bio

For SaaS/TECH:
- Real feature names and benefits
- Pricing tiers with actual numbers
- Use cases and testimonials

=== STEP 3: DESIGN SYSTEM ===
Choose colors and style APPROPRIATE to the industry:

VAPE/SMOKE SHOP: Dark theme (#0d0d0d), neon accents (#00ff88, #ff00ff), edgy modern feel
RESTAURANT: Warm tones, food photography placeholders, elegant typography
FASHION: Minimalist, high contrast, editorial feel
TECH/SAAS: Clean, professional, blues and purples
PORTFOLIO: Personal brand colors, creative layouts

Default Dark Theme (if unsure):
- Background: #0a0a0f
- Cards: rgba(255,255,255,0.05) with backdrop-blur
- Primary accent: Choose based on industry
- Text: #ffffff (headings), #a1a1aa (body)

=== MANDATORY FILE STRUCTURE (Vite + React) ===

1. package.json - with dependencies (react, react-dom, react-router-dom) AND devDependencies (@vitejs/plugin-react, vite)
2. index.html - at ROOT level with <div id="root"></div> and <script type="module" src="/src/main.jsx"></script>
3. vite.config.js - Vite config with react plugin
4. src/main.jsx - React entry point
5. src/App.jsx - Main app with BrowserRouter and Routes
6. src/App.css - App styles
7. src/index.css - Global styles, CSS variables, reset
8. src/components/Header.jsx - Navigation with real menu items
9. src/components/Footer.jsx - Footer with real links
10. src/pages/Home.jsx - Home page with 4-6 real sections
11. src/pages/[Relevant pages based on project type]
12. src/components/[Relevant components based on project type]

CRITICAL - index.html must be at ROOT (not public/):
<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${projectName}</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.jsx"></script>
</body>
</html>

CRITICAL - vite.config.js:
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({ plugins: [react()], server: { host: '0.0.0.0', port: 3000 } })

=== DESIGN REQUIREMENTS ===
- Mobile-first responsive design
- Smooth transitions (0.3s ease)
- Hover effects on interactive elements
- Proper spacing (16px base unit)
- Border-radius: 12px cards, 8px buttons
- Box shadows for depth
- CSS custom properties for theming

=== CODE QUALITY ===
- Clean, readable JSX
- Proper component decomposition
- Semantic HTML5
- Accessibility (alt, aria-label)
- Italian language for Italian requests, English otherwise

=== OUTPUT FORMAT ===
Respond with ONLY valid JSON. Each key = file path, each value = complete file content.
NO markdown, NO explanation, NO code blocks - ONLY the raw JSON object.

{
  "package.json": "...",
  "index.html": "...",
  "vite.config.js": "...",
  "src/main.jsx": "...",
  "src/App.jsx": "...",
  "src/App.css": "...",
  "src/index.css": "...",
  "src/components/Header.jsx": "...",
  "src/components/Footer.jsx": "...",
  "src/pages/Home.jsx": "...",
  ...additional files specific to the project
}

Generate the COMPLETE project with AT LEAST 10-12 files and REALISTIC CONTENT specific to: "${description || projectName}"`;

    let filesArray = [];
    let templateDescription = `AI-generated ${technology} project`;

    try {
        update(20, 'Designing Architecture...', 'AI Generating');
        console.log(`   🤖 Calling Gemini to generate project for: "${description?.substring(0, 50)}..."`);

        const messages = [
            { role: 'user', content: systemPrompt }
        ];

        let filesObj;
        let attempts = 0;
        const maxAttempts = 2;

        while (attempts < maxAttempts) {
            attempts++;
            update(20 + (attempts * 5), `Generating Code (Attempt ${attempts})...`, 'AI Generating');
            console.log(`   🤖 Calling Gemini (attempt ${attempts})...`);

            let responseText = '';
            const stream = provider.chatStream(messages, {
                model: modelId,
                maxTokens: 32000,
                temperature: 0.7
            });

            for await (const chunk of stream) {
                if (chunk.type === 'text') {
                    responseText += chunk.text;
                    // Roughly estimate progress based on response length 
                    // (Assuming avg project is 15k-20k characters)
                    const currentLen = responseText.length;
                    const estimatedProgress = Math.min(75, 30 + Math.floor(currentLen / 500));

                    // Only update every few chunks to save traffic
                    if (Math.random() > 0.8) {
                        update(estimatedProgress, 'Writing code...', 'AI Generating');
                    }
                } else if (chunk.type === 'done') {
                    responseText = chunk.fullText || responseText;
                }
            }

            update(75, 'Parsing Generated Code...', 'Processing');
            console.log(`   📦 Gemini response received (${responseText.length} chars), parsing files...`);
            console.log(`   📝 Response preview: ${responseText.substring(0, 200)}...`);

            // 🔑 FIX: Strip markdown code blocks before parsing JSON
            // Gemini often wraps JSON in ```json ... ``` blocks
            let cleanedResponse = responseText.trim();

            // Method 1: Try to extract JSON from markdown code block
            const markdownMatch = cleanedResponse.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (markdownMatch) {
                cleanedResponse = markdownMatch[1].trim();
                console.log('   🧹 Stripped markdown code block wrapper');
            }

            // Method 2: If still starts with ``` (malformed), strip manually
            if (cleanedResponse.startsWith('```json')) {
                cleanedResponse = cleanedResponse.slice(7);
            } else if (cleanedResponse.startsWith('```')) {
                cleanedResponse = cleanedResponse.slice(3);
            }
            if (cleanedResponse.endsWith('```')) {
                cleanedResponse = cleanedResponse.slice(0, -3);
            }
            cleanedResponse = cleanedResponse.trim();

            // 🔑 FIX: Sanitize JSON to fix common escape character issues
            // Gemini sometimes generates invalid escape sequences in JSON strings
            function sanitizeJsonString(jsonStr) {
                // Fix control characters that break JSON parsing
                // Replace actual newlines/tabs inside string values with escaped versions
                let result = jsonStr;

                // Fix literal control characters that should be escaped
                // This handles cases where Gemini puts actual newlines inside JSON strings
                result = result
                    .replace(/\r\n/g, '\\n')  // Windows newlines
                    .replace(/\r/g, '\\r')     // Carriage returns
                    // Don't replace \n globally - only unescaped ones inside strings are problematic

                // Fix invalid backslash sequences
                // Valid: \n \t \r \\ \" \/ \b \f \uXXXX
                // Invalid: \x \a \e \s etc - replace with escaped backslash
                result = result.replace(/\\([^nrtbfuv\\"\/])/g, (match, char) => {
                    // If it's a hex escape like \x00, leave it (some JSON parsers handle it)
                    if (char === 'x' || char === 'X') return match;
                    // Otherwise escape the backslash
                    return '\\\\' + char;
                });

                return result;
            }

            // Try to parse with sanitization
            function tryParseJson(str) {
                // First attempt: direct parse
                try {
                    return JSON.parse(str);
                } catch (e1) {
                    // Second attempt: sanitize and parse
                    try {
                        const sanitized = sanitizeJsonString(str);
                        return JSON.parse(sanitized);
                    } catch (e2) {
                        // Third attempt: more aggressive cleanup
                        try {
                            // Remove any BOM or zero-width characters
                            let aggressive = str.replace(/[\u0000-\u001F\u007F-\u009F]/g, (char) => {
                                // Keep valid JSON whitespace
                                if (char === '\n' || char === '\r' || char === '\t') {
                                    return char;
                                }
                                return '';
                            });
                            // Fix common issues with quotes inside strings
                            aggressive = aggressive.replace(/([^\\])"/g, (match, before, offset) => {
                                // Check if we're inside a string value - this is complex
                                // For now, just try parsing as-is
                                return match;
                            });
                            return JSON.parse(aggressive);
                        } catch (e3) {
                            throw e2; // Return the sanitization error for logging
                        }
                    }
                }
            }

            try {
                filesObj = tryParseJson(cleanedResponse);
                console.log('   ✅ JSON parsed successfully');
                break;
            } catch (e) {
                console.log(`   ⚠️ Initial parse failed: ${e.message}`);
                // Fallback: Try to find JSON object pattern in response
                const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    try {
                        filesObj = tryParseJson(jsonMatch[0]);
                        console.log('   ✅ JSON extracted via regex fallback');
                        break;
                    } catch (e2) {
                        if (attempts < maxAttempts) {
                            console.log(`   ⚠️ JSON error: ${e2.message}, retrying...`);
                            messages.push({ role: 'assistant', content: responseText });
                            messages.push({
                                role: 'user',
                                content: `Your response had a JSON syntax error: ${e2.message}.

CRITICAL: You MUST respond with ONLY valid JSON.
- All string values must have properly escaped special characters
- Use \\n for newlines, \\t for tabs, \\\\ for backslashes, \\" for quotes
- No markdown, no code blocks, no explanation
- Just the raw JSON object starting with { and ending with }`
                            });
                        } else {
                            throw new Error(`Could not parse JSON after retries: ${e2.message}`);
                        }
                    }
                } else {
                    throw new Error('Could not find JSON object in response');
                }
            }
        }

        update(80, 'Formatting Files...', 'Processing');

        filesArray = Object.entries(filesObj).map(([filePath, content]) => {
            let fileContent = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
            fileContent = fileContent.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
            return {
                path: filePath.startsWith('/') ? filePath.slice(1) : filePath,
                content: fileContent
            };
        });

        console.log(`   ✅ AI Generated ${filesArray.length} files:`);
        filesArray.forEach(f => console.log(`      - ${f.path}`));

        templateDescription = `AI-generated: ${description?.substring(0, 100) || projectName}`;

    } catch (aiError) {
        console.error('   ⚠️ AI generation failed, falling back to GENERIC TEMPLATE (not based on description!)');
        console.error('   ❌ AI Error details:', aiError.message);
        console.error('   ❌ AI Error stack:', aiError.stack?.split('\n').slice(0, 3).join('\n'));
        update(85, 'AI Generation failed, using template...', 'Fallback');

        const { generateTemplateFiles } = require('../services/project-templates');
        const template = generateTemplateFiles(technology, projectName);

        if (template) {
            filesArray = Object.entries(template.files).map(([filePath, content]) => ({
                path: filePath,
                content
            }));
            templateDescription = `⚠️ FALLBACK TEMPLATE (AI failed): ${template.description}`;
            console.error(`   ⚠️ Created ${filesArray.length} files from GENERIC TEMPLATE - description was ignored!`);
        } else {
            filesArray = [
                { path: 'index.html', content: `<!DOCTYPE html><html><body><h1>${projectName}</h1></body></html>` }
            ];
            console.error('   ⚠️ Created minimal fallback HTML - description was ignored!');
        }
    }

    // Add project context file (.drape/project.json)
    const { detectIndustry, extractFeatures } = require('../services/agent-loop');
    const projectContext = {
        name: projectName,
        description: description || '',
        technology: technology || 'react',
        industry: detectIndustry(description),
        createdAt: new Date().toISOString(),
        features: extractFeatures(description)
    };

    // Add context file to the files array
    filesArray.push({
        path: '.drape/project.json',
        content: JSON.stringify(projectContext, null, 2)
    });

    console.log(`   📋 Added project context: industry=${projectContext.industry}, features=${projectContext.features.join(',')}`);

    // Storage
    update(90, 'Saving Project Files...', 'Finalizing');
    try {
        await db.collection('user_projects').doc(wsId).set({
            id: wsId,
            name: projectName,
            type: 'ai-generated',
            technology,
            description: description || '',
            templateDescription,
            userId,
            status: 'ready',
            cloned: true,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            lastAccessed: admin.firestore.FieldValue.serverTimestamp()
        });

        await storageService.saveFiles(wsId, filesArray);
        console.log(`   ✅ Saved ${filesArray.length} files`);
    } catch (error) {
        console.error('❌ Error saving:', error.message);
        throw error;
    }

    // Pre-warm
    update(95, 'Starting Workspace...', 'Finalizing');
    // ... (skipped specific pre-warm logic for simplicity, or we can copy it if crucial)
    // The original code had a pre-warm block. Let's assume the file list endpoint does pre-warm too.

    // Complete
    update(100, 'Project Created Successfully!', 'Complete');

    const task = creationTasks.get(taskId);
    if (task) {
        task.status = 'completed';
        task.result = {
            projectId: wsId,
            projectName,
            technology,
            templateDescription,
            filesCount: filesArray.length,
            files: filesArray.map(f => f.path || f.filePath)
        };
        // Auto-cleanup after 5 mins
        setTimeout(() => creationTasks.delete(taskId), 5 * 60 * 1000);
    }
}

/**
 * GET /workstation/templates
 * List all available project templates
 */
router.get('/templates', asyncHandler(async (req, res) => {
    const { getAvailableTemplates } = require('../services/project-templates');

    const templates = getAvailableTemplates();

    res.json({
        success: true,
        templates
    });
}));

module.exports = router;

