/**
 * Drape Backend - Tool Executor Service
 * Unified tool execution for AI agents
 * 
 * Supports three modes:
 * 1. Local: Direct filesystem access
 * 2. Cloud (Coder): SSH to Coder workspace (legacy)
 * 3. Holy Grail: Use Fly.io orchestrator/storage (new)
 */

const fs = require('fs').promises;
const path = require('path');
const { glob } = require('glob');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);
const { cleanProjectId, unescapeString, getRepoPath } = require('../utils/helpers');
const { FILE_LIMITS, IGNORED_DIRS } = require('../utils/constants');

// Holy Grail services (lazy loaded to avoid circular deps)
let orchestrator = null;
let storageService = null;

function getOrchestrator() {
    if (!orchestrator) orchestrator = require('./workspace-orchestrator');
    return orchestrator;
}

function getStorageService() {
    if (!storageService) storageService = require('./storage-service');
    return storageService;
}

/**
 * Tool execution cache for read-only operations
 */
const toolCache = new Map();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes
const MAX_CACHE_SIZE = 200;

/**
 * Get cached tool result
 */
function getCached(toolName, input) {
    const key = `${toolName}:${JSON.stringify(input)}`;
    const cached = toolCache.get(key);

    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        console.log(`💾 Cache HIT for ${toolName}`);
        return cached.result;
    }

    return null;
}

/**
 * Set cached tool result
 */
function setCache(toolName, input, result) {
    const key = `${toolName}:${JSON.stringify(input)}`;

    if (toolCache.size >= MAX_CACHE_SIZE) {
        const oldestKey = toolCache.keys().next().value;
        toolCache.delete(oldestKey);
    }

    toolCache.set(key, { result, timestamp: Date.now() });
}

/**
 * Clear cache for a specific project or all
 */
function clearCache(projectId = null) {
    if (projectId) {
        for (const key of toolCache.keys()) {
            if (key.includes(projectId)) {
                toolCache.delete(key);
            }
        }
    } else {
        toolCache.clear();
    }
}

/**
 * Execute command on remote Coder workspace
 */
async function executeRemoteCommand(wsName, command, options = {}) {
    const CODER_CLI_PATH = process.env.CODER_CLI_PATH || 'coder';
    const CODER_SESSION_TOKEN = process.env.CODER_SESSION_TOKEN;

    const escapedCmd = command.replace(/'/g, "'\\''");
    const sshCmd = `ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=10 -o ProxyCommand="${CODER_CLI_PATH} ssh --stdio ${wsName}" coder.${wsName} '${escapedCmd}'`;

    try {
        const { stdout, stderr } = await execAsync(sshCmd, {
            env: { ...process.env, CODER_SESSION_TOKEN },
            timeout: options.timeout || FILE_LIMITS.COMMAND_TIMEOUT,
            maxBuffer: 10 * 1024 * 1024
        });

        return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode: 0 };
    } catch (error) {
        return {
            stdout: error.stdout?.toString().trim() || '',
            stderr: error.stderr?.toString().trim() || error.message,
            exitCode: error.code || 1
        };
    }
}

/**
 * Read file from remote workspace
 */
async function readRemoteFile(wsName, filePath) {
    const result = await executeRemoteCommand(wsName, `cat "${filePath}"`);
    if (result.exitCode !== 0) {
        throw new Error(`Failed to read file: ${result.stderr}`);
    }
    return result.stdout;
}

/**
 * Write file to remote workspace
 */
async function writeRemoteFile(wsName, filePath, content) {
    const { spawn } = require('child_process');
    const base64Content = Buffer.from(content).toString('base64');

    // Ensure directory exists
    const dir = path.dirname(filePath);
    await executeRemoteCommand(wsName, `mkdir -p "${dir}"`);

    return new Promise((resolve, reject) => {
        const proc = spawn('coder', ['ssh', wsName, '--', `base64 -d > "${filePath}"`], {
            env: { ...process.env, CODER_SESSION_TOKEN: process.env.CODER_SESSION_TOKEN },
            stdio: ['pipe', 'pipe', 'pipe']
        });

        proc.stdin.write(base64Content);
        proc.stdin.end();

        proc.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`Write failed with exit code ${code}`));
        });

        proc.on('error', reject);
    });
}

/**
 * Tool definitions
 */
const tools = {
    /**
     * Read file contents
     */
    async read_file({ filePath }, context) {
        const { projectPath, isCloud, isHolyGrail, projectId, wsName } = context;

        // Check cache
        const cacheKey = { filePath, projectPath };
        const cached = getCached('read_file', cacheKey);
        if (cached) return cached;

        let content;
        const cleanFilePath = filePath.replace(/^\.\//, '');

        if (isHolyGrail) {
            // Holy Grail: Read from Firestore storage
            const storage = getStorageService();
            const result = await storage.readFile(projectId, cleanFilePath);
            if (!result.success) {
                return `❌ Error: File not found: ${filePath}`;
            }
            content = result.content;
        } else if (isCloud) {
            const fullPath = path.posix.join('/home/coder/project', cleanFilePath);
            content = await readRemoteFile(wsName, fullPath);
        } else {
            const fullPath = path.join(projectPath, cleanFilePath);
            content = await fs.readFile(fullPath, 'utf8');
        }

        // Truncate if too large
        if (content.length > 50000) {
            content = content.substring(0, 50000) + '\n\n... [Truncated - file too large]';
        }

        const result = `📄 File: ${filePath}\n${'─'.repeat(40)}\n${content}`;
        setCache('read_file', cacheKey, result);

        return result;
    },

    /**
     * Write file contents
     */
    async write_file({ filePath, content }, context) {
        const { projectPath, isCloud, isHolyGrail, projectId, wsName } = context;
        const unescapedContent = unescapeString(content);
        const cleanFilePath = filePath.replace(/^\.\//, '');

        if (isHolyGrail) {
            // Holy Grail: Write to storage + sync to VM if active
            const orch = getOrchestrator();
            await orch.writeFile(projectId, cleanFilePath, unescapedContent);
        } else if (isCloud) {
            const fullPath = path.posix.join('/home/coder/project', cleanFilePath);
            await writeRemoteFile(wsName, fullPath, unescapedContent);
        } else {
            const fullPath = path.join(projectPath, cleanFilePath);
            const dir = path.dirname(fullPath);
            await fs.mkdir(dir, { recursive: true });
            await fs.writeFile(fullPath, unescapedContent, 'utf8');
        }

        // Invalidate cache for this file
        clearCache(filePath);

        const lines = unescapedContent.split('\n').length;
        return `✅ File ${filePath} written successfully (${lines} lines)`;
    },

    /**
     * Edit file with search/replace
     */
    async edit_file({ filePath, oldText, newText }, context) {
        const { projectPath, isCloud, isHolyGrail, projectId, wsName } = context;
        const cleanFilePath = filePath.replace(/^\.\//, '');

        let originalContent;

        // Read the original file
        if (isHolyGrail) {
            const storage = getStorageService();
            const result = await storage.readFile(projectId, cleanFilePath);
            if (!result.success) {
                return `❌ Error: File not found: ${filePath}`;
            }
            originalContent = result.content;
        } else if (isCloud) {
            const fullPath = path.posix.join('/home/coder/project', cleanFilePath);
            originalContent = await readRemoteFile(wsName, fullPath);
        } else {
            const fullPath = path.join(projectPath, cleanFilePath);
            originalContent = await fs.readFile(fullPath, 'utf8');
        }

        const unescapedOld = unescapeString(oldText);
        const unescapedNew = unescapeString(newText);

        // Try exact match first, then trimmed
        let newContent;
        if (originalContent.includes(unescapedOld)) {
            newContent = originalContent.replace(unescapedOld, unescapedNew);
        } else {
            const trimmedOld = unescapedOld.trim();
            if (!originalContent.includes(trimmedOld)) {
                return `❌ Error: Text not found in file ${filePath}. Make sure to copy the EXACT text to replace.`;
            }
            newContent = originalContent.replace(trimmedOld, unescapedNew.trim());
        }

        // Write the modified file
        if (isHolyGrail) {
            const orch = getOrchestrator();
            await orch.writeFile(projectId, cleanFilePath, newContent);
        } else if (isCloud) {
            const fullPath = path.posix.join('/home/coder/project', cleanFilePath);
            await writeRemoteFile(wsName, fullPath, newContent);
        } else {
            const fullPath = path.join(projectPath, cleanFilePath);
            await fs.writeFile(fullPath, newContent, 'utf8');
        }

        // Invalidate cache
        clearCache(filePath);

        return `✅ File ${filePath} edited successfully`;
    },

    /**
     * Find files with glob pattern
     */
    async glob_files({ pattern }, context) {
        const { projectPath, isCloud, isHolyGrail, projectId, wsName } = context;

        // Check cache
        const cacheKey = { pattern, projectPath };
        const cached = getCached('glob_files', cacheKey);
        if (cached) return cached;

        let files;

        if (isHolyGrail) {
            const orch = getOrchestrator();
            // Convert simple glob patterns to find arguments
            // This is an approximation. For full glob support we should filter in JS.
            let findName = '';
            if (pattern.match(/\*\.[a-zA-Z0-9]+$/)) {
                // Extracts extension like *.css from **/*.css
                const ext = pattern.match(/\*\.([a-zA-Z0-9]+)$/)[1];
                findName = `-name "*.${ext}"`;
            }

            const cmd = `find . -type f ${findName} -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/dist/*' | head -100`;
            const result = await orch.exec(projectId, cmd);
            files = result.stdout.split('\n').filter(f => f && f !== '.');
        } else if (isCloud) {
            const result = await executeRemoteCommand(wsName,
                `cd /home/coder/project && find . -maxdepth 5 -not -path '*/.*' -not -path '*/node_modules/*' -type f | head -100`
            );
            files = result.stdout.split('\n').filter(f => f && f !== '.');
        } else {
            files = await glob(pattern, {
                cwd: projectPath,
                ignore: IGNORED_DIRS.map(d => `**/${d}/**`),
                nodir: true
            });
        }

        const result = files.length > 0
            ? `Found ${files.length} files:\n${files.slice(0, 50).join('\n')}${files.length > 50 ? '\n...(more)' : ''}`
            : 'No files found matching pattern';

        setCache('glob_files', cacheKey, result);
        return result;
    },

    /**
     * Search in files
     */
    async search_in_files({ pattern }, context) {
        const { projectPath, isCloud, isHolyGrail, projectId, wsName } = context;

        // Check cache
        const cacheKey = { pattern, projectPath };
        const cached = getCached('search_in_files', cacheKey);
        if (cached) return cached;

        const escapedPattern = pattern.replace(/"/g, '\\"');
        const grepCmd = `grep -rn "${escapedPattern}" --exclude-dir=node_modules --exclude-dir=.git . 2>/dev/null | head -30`;

        let stdout;

        if (isHolyGrail) {
            const orch = getOrchestrator();
            // Escape double quotes for shell
            const cleanPattern = pattern.replace(/"/g, '\\"');
            const cmd = `grep -rn "${cleanPattern}" --exclude-dir=node_modules --exclude-dir=.git . 2>/dev/null | head -30`;
            const result = await orch.exec(projectId, cmd);
            stdout = result.stdout;
        } else if (isCloud) {
            const result = await executeRemoteCommand(wsName, `cd /home/coder/project && ${grepCmd}`);
            stdout = result.stdout;
        } else {
            try {
                const result = await execAsync(`cd "${projectPath}" && ${grepCmd}`, {
                    timeout: 10000,
                    maxBuffer: 5 * 1024 * 1024
                });
                stdout = result.stdout;
            } catch (error) {
                // grep returns 1 if no matches
                stdout = error.stdout?.toString() || '';
            }
        }

        const result = stdout.trim() || 'No results found';
        setCache('search_in_files', cacheKey, result);
        return result;
    },

    /**
     * Execute shell command
     */
    async execute_command({ command }, context) {
        const { projectPath, isCloud, isHolyGrail, projectId, wsName } = context;

        console.log(`💻 Executing: ${command}`);

        let result;

        if (isHolyGrail) {
            const orch = getOrchestrator();
            result = await orch.exec(projectId, command);
        } else if (isCloud) {
            result = await executeRemoteCommand(wsName, `cd /home/coder/project && ${command}`);
        } else {
            try {
                const { stdout, stderr } = await execAsync(`cd "${projectPath}" && ${command}`, {
                    timeout: FILE_LIMITS.COMMAND_TIMEOUT,
                    maxBuffer: 10 * 1024 * 1024
                });
                result = { stdout: stdout.trim(), stderr: stderr.trim(), exitCode: 0 };
            } catch (error) {
                result = {
                    stdout: error.stdout?.toString().trim() || '',
                    stderr: error.stderr?.toString().trim() || error.message,
                    exitCode: error.code || 1
                };
            }
        }

        // Truncate output if too long
        let output = result.stdout;
        if (output.length > 10000) {
            output = output.substring(0, 10000) + '\n... [Truncated]';
        }

        if (result.exitCode === 0) {
            return `✅ Command completed:\n${output}`;
        } else {
            return `❌ Command failed (exit ${result.exitCode}):\n${result.stderr || output}`;
        }
    }
};

/**
 * Execute a tool by name
 */
async function executeTool(toolName, args, context) {
    const tool = tools[toolName];

    if (!tool) {
        return `❌ Unknown tool: ${toolName}`;
    }

    try {
        console.log(`🔧 Executing tool: ${toolName}`, JSON.stringify(args).substring(0, 100));
        const result = await tool(args, context);
        console.log(`✅ Tool ${toolName} completed`);
        return result;
    } catch (error) {
        console.error(`❌ Tool ${toolName} error:`, error.message);
        return `❌ Error in ${toolName}: ${error.message}`;
    }
}

/**
 * Create execution context
 * @param {string} projectId - Project ID
 * @param {object} options - Context options including isHolyGrail flag
 */
function createContext(projectId, options = {}) {
    const cleanId = cleanProjectId(projectId);
    const projectPath = options.projectPath || getRepoPath(cleanId);

    // Holy Grail mode takes precedence over Cloud mode
    const isHolyGrail = options.isHolyGrail || false;

    const isCloud = !isHolyGrail && (options.isCloud !== undefined
        ? options.isCloud
        : !require('fs').existsSync(projectPath));

    let wsName = options.wsName || cleanId;
    // Multi-user support: Prefix with owner if provided and not already present
    if (options.owner && !wsName.includes('/')) {
        wsName = `${options.owner}/${wsName}`;
    }

    return {
        projectId: cleanId,
        projectPath: isHolyGrail ? '/home/coder/project' : (isCloud ? '/home/coder/project' : projectPath),
        isCloud,
        isHolyGrail,
        wsName,
        machineId: options.machineId // For Fly.io routing
    };
}

module.exports = {
    tools,
    executeTool,
    createContext,
    executeRemoteCommand,
    readRemoteFile,
    writeRemoteFile,
    clearCache,
    getCached,
    setCache
};
