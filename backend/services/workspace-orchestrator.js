/**
 * Workspace Orchestrator
 * Holy Grail Architecture - Central coordinator
 * 
 * This is the brain that connects:
 * - Firebase Storage (persistent files)
 * - Fly.io MicroVMs (compute)
 * - Drape Agent (execution)
 * 
 * It replaces the old Coder-based workflow with instant MicroVM spawning.
 */

const flyService = require('./fly-service');
const storageService = require('./storage-service');
const redisService = require('./redis-service');
const axios = require('axios');
const serverLogService = require('./server-log-service');

// Cache of active VMs per project
const activeVMs = new Map();

class WorkspaceOrchestrator {
    constructor() {
        this.vmTimeout = 30 * 60 * 1000; // 30 minutes idle timeout
    }

    /**
     * Get or create a VM for a project
     * This is the main entry point - handles everything automatically
     * 
     * @param {string} projectId - Project ID
     * @param {object} options - Options like forceNew, githubToken, etc.
     * @returns {object} VM info with agentUrl
     */
    async getOrCreateVM(projectId, options = {}) {
        const startTime = Date.now();
        console.log(`\n🚀 [Orchestrator] Getting VM for project: ${projectId}`);

        // Anti-Collision: Ensure only this project's machine is running
        // [DEPRECATED Phase 2]: Gateway now routes traffic via private IP/Header.
        const machineName = `ws-${projectId}`.substring(0, 30);
        // await flyService.ensureSingleActiveMachine(machineName);

        // Check if we already have an active VM for this project
        const cached = activeVMs.get(projectId);
        if (cached && !options.forceNew) {
            // Verify it's still alive
            try {
                await axios.get(`${cached.agentUrl}/health`, { timeout: 5000 });
                console.log(`✅ [Orchestrator] Using cached VM (${Date.now() - startTime}ms)`);
                cached.lastUsed = Date.now();
                return cached;
            } catch {
                console.log(`⚠️ [Orchestrator] Cached VM dead, creating new one`);
                activeVMs.delete(projectId);
            }
        }

        // Create new MicroVM or adopt existing one
        // machineName already defined at start of function
        console.log(`📦 [Orchestrator] checking for existing VM: ${machineName}...`);

        let vm;

        // Check Fly API for existing machine to avoid 409 Conflict
        const machines = await flyService.listMachines();
        const existing = machines.find(m => m.name === machineName);

        if (existing && existing.state !== 'destroyed') {
            console.log(`♻️ [Orchestrator] Found existing Fly machine: ${existing.id}`);
            vm = existing;

            // If stopped, start it?
            if (existing.state === 'stopped') {
                // flyService doesn't have startMachine exposed yet, assuming we use it as is or handle it
                // For now, let's assume valid state or auto-start on request? NO.
                // We should probably start it if stopped.
                // But wait, createMachine handles "auto_destroy". 
                // Let's just use it. If it's stopped, we might need to restart it.
                // For now, let's just adopt it.
            }
        } else {
            console.log(`📦 [Orchestrator] Creating new MicroVM...`);
            vm = await flyService.createMachine(projectId, {
                env: {
                    PROJECT_ID: projectId
                }
            });
        }

        // Wait for it to be ready
        await flyService.waitForMachine(vm.id, 30000);

        // Use the common app URL - all traffic goes through drape-workspaces.fly.dev
        // We'll use the machine ID to route requests via Fly-Force-Instance-Id header
        const agentUrl = 'https://drape-workspaces.fly.dev';

        // Wait for agent to be healthy (passing machine ID for routing)
        await this._waitForAgent(agentUrl, 30000, vm.id);

        // VM info to cache
        const vmInfo = {
            id: vm.id,
            name: vm.name,
            agentUrl,
            machineId: vm.id, // Store for routing
            projectId,
            createdAt: Date.now(),
            lastUsed: Date.now()
        };

        // Cache it
        activeVMs.set(projectId, vmInfo);

        // Schedule cleanup
        this._scheduleCleanup(projectId);

        const elapsed = Date.now() - startTime;
        console.log(`✅ [Orchestrator] VM ready in ${elapsed}ms`);

        return vmInfo;
    }

    /**
     * Clone a repository into a project
     * 1. Fetches files from GitHub
     * 2. Saves to Firebase Storage
     * 3. Optionally syncs to VM if active
     * 
     * @param {string} projectId - Project ID
     * @param {string} repoUrl - GitHub repository URL
     * @param {string} githubToken - Optional auth token
     */
    async cloneRepository(projectId, repoUrl, githubToken = null) {
        console.log(`\n📂 [Orchestrator] Cloning ${repoUrl} to ${projectId}`);
        const startTime = Date.now();

        // Extract owner/repo from URL (handles .git suffix and dots in repo name)
        const match = repoUrl.match(/github\.com[\/:]([^\/]+)\/([^\/]+?)(?:\.git)?$/);
        if (!match) {
            throw new Error('Invalid GitHub URL');
        }
        const [, owner, repo] = match;

        // Fetch files from GitHub API
        const files = await this._fetchGitHubFiles(owner, repo, githubToken);
        console.log(`📥 [Orchestrator] Fetched ${files.length} files from GitHub`);

        // Save to Firebase Storage
        await storageService.saveFiles(projectId, files);

        // If there's an active VM, sync files to it
        const cached = activeVMs.get(projectId);
        if (cached) {
            console.log(`🔄 [Orchestrator] Syncing to active VM...`);
            await storageService.syncToVM(projectId, cached.agentUrl);
        }

        const elapsed = Date.now() - startTime;
        console.log(`✅ [Orchestrator] Clone complete in ${elapsed}ms`);

        return {
            success: true,
            filesCount: files.length,
            elapsed
        };
    }

    /**
     * Execute a command in the project's VM
     * Creates VM if needed
     * 
     * @param {string} projectId - Project ID
     * @param {string} command - Command to execute
     * @param {string} cwd - Working directory
     */
    async exec(projectId, command, cwd = '/home/coder/project') {
        const vm = await this.getOrCreateVM(projectId);

        console.log(`🔗 [Orchestrator] Exec: ${command.substring(0, 50)}...`);

        // Pass machineId for routing via Fly-Force-Instance-Id header
        return await flyService.exec(vm.agentUrl, command, cwd, vm.machineId);
    }

    /**
     * Read a file from a project
     * Prefers storage, falls back to VM if file was modified there
     * 
     * @param {string} projectId - Project ID
     * @param {string} filePath - File path
     */
    async readFile(projectId, filePath) {
        // Try storage first (faster, persistent)
        const storageResult = await storageService.readFile(projectId, filePath);
        if (storageResult.success) {
            return storageResult;
        }

        // Fall back to VM if it exists
        const cached = activeVMs.get(projectId);
        if (cached) {
            try {
                const response = await axios.get(`${cached.agentUrl}/file`, {
                    params: { path: filePath },
                    timeout: 10000
                });
                return response.data;
            } catch {
                return { success: false, error: 'File not found' };
            }
        }

        return { success: false, error: 'File not found' };
    }

    /**
     * Write a file to a project
     * Saves to storage AND syncs to VM if active
     * 
     * @param {string} projectId - Project ID
     * @param {string} filePath - File path
     * @param {string} content - File content
     */
    async writeFile(projectId, filePath, content) {
        // Save to persistent storage
        await storageService.saveFile(projectId, filePath, content);

        // Sync to VM if active (for hot reload)
        let vm = await redisService.getVMSession(projectId);

        // Recovery: If not in cache, check if VM exists in Fly
        if (!vm) {
            try {
                const machineName = `ws-${projectId}`.substring(0, 30);
                const machines = await flyService.listMachines();
                const existing = machines.find(m => m.name === machineName && m.state === 'started');
                if (existing) {
                    console.log(`♻️ [Orchestrator] Recovered active VM session for write: ${existing.id}`);
                    vm = {
                        id: existing.id,
                        machineId: existing.id,
                        // Use App URL (Traffic routed via Fly-Force-Instance-Id header)
                        agentUrl: `https://${flyService.appName}.fly.dev`
                    };
                    activeVMs.set(projectId, vm);
                }
            } catch (e) {
                console.warn(`⚠️ [Orchestrator] Failed to recover VM session: ${e.message}`);
            }
        }

        if (vm) {
            try {
                // Ensure we send the Instance ID header for proper routing if using shared domain
                const headers = { 'Fly-Force-Instance-Id': vm.machineId };

                await axios.post(`${vm.agentUrl}/file`, {
                    path: filePath,
                    content
                }, {
                    timeout: 30000,
                    headers
                });
                console.log(`   ✅ [HotReload] Synced ${filePath} to VM`);
            } catch (error) {
                console.warn(`⚠️ [Orchestrator] Failed to sync to VM:`, error.message);
            }
        }

        return { success: true };
    }

    /**
     * List files in a project
     * @param {string} projectId - Project ID
     */
    async listFiles(projectId) {
        return await storageService.listFiles(projectId);
    }

    /**
     * Start a dev server for preview
     * @param {string} projectId - Project ID
     * @param {object} projectInfo - Project type info (from analyzer)
     */
    async startPreview(projectId, projectInfo) {
        const vm = await this.getOrCreateVM(projectId);

        // Sync files from storage to VM
        console.log(`📂 [Orchestrator] Syncing files to VM...`);
        const syncResult = await storageService.syncToVM(projectId, vm.agentUrl);
        console.log(`   Sync result: ${syncResult.syncedCount} files synced`);

        // Verify and Repair (Self-Healing)
        console.log(`🔍 [Orchestrator] Verifying file integrity on VM...`);
        try {
            // Get files from VM
            const findResult = await flyService.exec(vm.agentUrl, 'find . -type f -not -path "*/node_modules/*" -not -path "*/.git/*"', '/home/coder/project', vm.machineId);
            const vmFiles = findResult.stdout.split('\n')
                .map(f => f.trim().replace(/^\.\//, ''))
                .filter(f => f);

            // Get files from Storage
            const { files: storageFiles } = await storageService.listFiles(projectId);

            // Find missing files
            const missingFiles = storageFiles.filter(sf => !vmFiles.includes(sf.path));

            if (missingFiles.length > 0) {
                console.warn(`⚠️ [Orchestrator] Found ${missingFiles.length} missing files on VM: ${missingFiles.map(f => f.path).join(', ')}`);
                console.log(`🚑 [Orchestrator] Initiating repair sync...`);

                for (const missing of missingFiles) {
                    const fileContent = await storageService.readFile(projectId, missing.path);
                    if (fileContent.success) {
                        try {
                            await axios.post(`${vm.agentUrl}/file`, {
                                path: missing.path,
                                content: fileContent.content
                            }, {
                                timeout: 30000,
                                headers: { 'Fly-Force-Instance-Id': vm.machineId }
                            });
                            console.log(`   ✅ Repaired: ${missing.path}`);
                        } catch (e) {
                            console.error(`   ❌ Failed to repair ${missing.path}: ${e.message}`);
                        }
                    }
                }
            } else {
                console.log(`✅ [Orchestrator] File integrity verified. All files present.`);
            }
        } catch (error) {
            console.error(`⚠️ [Orchestrator] Verification failed: ${error.message}`);
        }

        // Setup (Install + Start) via Smart Agent (Async)
        if (projectInfo.installCommand || projectInfo.startCommand) {
            const install = projectInfo.installCommand || 'true';
            const start = projectInfo.startCommand || 'true';

            // Ensure proper binding for common frameworks
            let finalStart = start;
            if ((start.includes('npm start') || start.includes('react-scripts start') || start.includes('vite')) && !start.includes('--host')) {
                finalStart = `${start} -- --host 0.0.0.0`;
            }

            const setupCommand = `${install} && ${finalStart}`;
            console.log(`🚀 [Orchestrator] Triggering Async Setup: ${setupCommand}`);

            try {
                // Call the new /setup endpoint on the agent
                await axios.post(`${vm.agentUrl}/setup`, {
                    command: setupCommand
                }, {
                    timeout: 5000, // Short timeout, agent returns immediately
                    headers: { 'Fly-Force-Instance-Id': vm.machineId }
                });
                console.log(`   ✅ Setup triggered in background. Agent will handle the rest.`);

                // Start log streaming
                this.startLogStreaming(projectId, vm);
            } catch (e) {
                console.error(`   ⚠️ Failed to trigger setup: ${e.message}`);
            }
        }


        // Construct preview URL
        const previewUrl = `${vm.agentUrl}`;

        return {
            success: true,
            machineId: vm.machineId,
            previewUrl: `https://${process.env.FLY_APP_NAME}.fly.dev`,
            agentUrl: `https://${process.env.FLY_APP_NAME}.fly.dev`,
            projectType: projectInfo.description || projectInfo.type,
            port: projectInfo.port
        };
    }

    /**
     * Start log streaming from VM to server-log-service
     */
    async startLogStreaming(projectId, vm) {
        console.log(`📡 [Orchestrator] Starting log streaming for ${projectId}...`);

        let lastSize = 0;
        const logFile = '/home/coder/server.log';
        const workstationId = projectId; // Unified ID

        // Initial system log
        serverLogService.addLog(workstationId, '🔄 Connecting to server logs...', 'system');

        const tailInterval = setInterval(async () => {
            // Stop if VM is no longer in active cache
            if (!activeVMs.has(projectId)) {
                clearInterval(tailInterval);
                return;
            }

            try {
                // Read new logs using tail
                const result = await flyService.exec(vm.agentUrl, `tail -c +${lastSize + 1} ${logFile}`, '/home/coder', vm.machineId);

                if (result.stdout && result.stdout.trim()) {
                    const lines = result.stdout.split('\n').filter(l => l.trim());
                    lines.forEach(line => {
                        serverLogService.addLog(workstationId, line, 'output');
                    });

                    // Update size (best effort)
                    const sizeResult = await flyService.exec(vm.agentUrl, `wc -c < ${logFile}`, '/home/coder', vm.machineId);
                    const newSize = parseInt(sizeResult.stdout);
                    if (!isNaN(newSize)) lastSize = newSize;
                }
            } catch (err) {
                // Silent fail if file not ready yet
            }
        }, 3000);

        // Limit streaming to 30 mins to avoid leaks
        setTimeout(() => clearInterval(tailInterval), 30 * 60 * 1000);
    }


    /**
     * Stop and cleanup a project's VM
     * @param {string} projectId - Project ID
     */
    async stopVM(projectId) {
        const cached = activeVMs.get(projectId);
        if (!cached) {
            return { success: true, message: 'No active VM' };
        }

        try {
            await flyService.destroyMachine(cached.id);
            activeVMs.delete(projectId);
            return { success: true };
        } catch (error) {
            console.error(`❌ [Orchestrator] Stop failed:`, error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get status of all active VMs
     */
    getActiveVMs() {
        const vms = [];
        for (const [projectId, vm] of activeVMs) {
            vms.push({
                projectId,
                vmId: vm.id,
                agentUrl: vm.agentUrl,
                createdAt: vm.createdAt,
                lastUsed: vm.lastUsed,
                idleTime: Date.now() - vm.lastUsed
            });
        }
        return vms;
    }

    /**
     * Wait for the Drape Agent to be healthy
     * @param {string} agentUrl - Base URL for the agent
     * @param {number} timeout - Max wait time
     * @param {string} machineId - Fly machine ID for routing
     */
    async _waitForAgent(agentUrl, timeout = 30000, machineId = null) {
        const startTime = Date.now();
        console.log(`⏳ [Orchestrator] Waiting for agent at ${agentUrl} (machine: ${machineId})...`);

        const headers = machineId ? { 'Fly-Force-Instance-Id': machineId } : {};

        while (Date.now() - startTime < timeout) {
            try {
                const response = await axios.get(`${agentUrl}/health`, {
                    timeout: 3000,
                    headers
                });
                if (response.data.status === 'ok') {
                    console.log(`✅ [Orchestrator] Agent ready!`);
                    return true;
                }
            } catch {
                // Not ready yet
            }
            await new Promise(r => setTimeout(r, 500));
        }

        throw new Error('Agent timeout');
    }

    /**
     * Fetch files from GitHub repository using direct download (no API rate limits!)
     */
    async _fetchGitHubFiles(owner, repo, token = null) {
        const AdmZip = require('adm-zip');

        console.log(`📥 [GitHub] Fetching ${owner}/${repo}...`);

        try {
            // Use codeload.github.com - doesn't count against API rate limit!
            const zipUrl = `https://codeload.github.com/${owner}/${repo}/zip/refs/heads/main`;

            const headers = { 'User-Agent': 'Drape-IDE' };
            if (token) headers['Authorization'] = `token ${token}`;

            let zipResponse;
            try {
                zipResponse = await axios.get(zipUrl, {
                    headers,
                    responseType: 'arraybuffer',
                    timeout: 30000
                });
            } catch (e) {
                // Try 'master' branch if 'main' fails
                console.log(`   Trying 'master' branch...`);
                const masterUrl = `https://codeload.github.com/${owner}/${repo}/zip/refs/heads/master`;
                zipResponse = await axios.get(masterUrl, {
                    headers,
                    responseType: 'arraybuffer',
                    timeout: 30000
                });
            }

            // Extract the zip
            const zip = new AdmZip(Buffer.from(zipResponse.data));
            const entries = zip.getEntries();

            const files = [];
            const skipPatterns = ['node_modules/', '.git/', '__MACOSX/', '.DS_Store'];

            for (const entry of entries) {
                if (entry.isDirectory) continue;

                // Remove the root folder prefix (e.g., "owner-repo-abc123/")
                const fullPath = entry.entryName;
                const pathParts = fullPath.split('/');
                pathParts.shift(); // Remove first segment (root folder)
                const relativePath = pathParts.join('/');

                if (!relativePath) continue;

                // Skip unwanted files
                if (skipPatterns.some(p => relativePath.includes(p))) continue;

                // Skip binary files and large files
                if (entry.header.size > 500000) continue; // Skip files > 500KB

                try {
                    const content = entry.getData().toString('utf-8');
                    files.push({ path: relativePath, content });
                } catch {
                    // Skip files that can't be read as UTF-8 (binary)
                }
            }

            console.log(`✅ [GitHub] Fetched ${files.length} files from ${owner}/${repo}`);
            return files;

        } catch (error) {
            if (error.response?.status === 404) {
                const url = `https://github.com/${owner}/${repo}`;
                console.error(`❌ [GitHub] Repository not found at ${url}`);
                throw new Error(`GitHub repository not found: ${owner}/${repo}. Please verify the URL is correct and the repository is public.`);
            }
            console.error(`❌ [GitHub] Fetch failed:`, error.message);
            throw error;
        }
    }

    /**
     * Schedule automatic cleanup of idle VMs
     */
    /**
     * Schedule automatic cleanup of idle VMs
     */
    _scheduleCleanup(projectId) {
        setTimeout(async () => {
            const cached = await redisService.getVMSession(projectId);
            if (!cached) return;

            const idleTime = Date.now() - cached.lastUsed;
            if (idleTime > this.vmTimeout) {
                console.log(`🧹 [Orchestrator] Cleaning up idle VM for ${projectId}`);
                await this.stopVM(projectId);
            } else {
                // Reschedule
                this._scheduleCleanup(projectId);
            }
        }, 5 * 60 * 1000); // Check every 5 minutes
    }

    /**
     * Reconcile State (Hydration + Reaper)
     * 
     * 1. Fetches all running machines from Fly.io.
     * 2. Adopts any machines that aren't in our State (Cache).
     * 
     * This ensures that restarting the Backend doesn't kill user sessions.
     */
    async reconcileState() {
        console.log('🔄 [Orchestrator] Reconciling state with Fly.io...');
        try {
            const machines = await flyService.listMachines();
            const activeSessions = await redisService.getAllSessions();
            const sessionMap = new Map(activeSessions.map(s => [s.machineId, s]));

            let adoptedCount = 0;

            for (const machine of machines) {
                // Only care about started workspace machines
                if (!machine.name.startsWith('ws-') || machine.state !== 'started') continue;

                if (!sessionMap.has(machine.id)) {
                    // FOUND ORPHAN (Running in Cloud, missing in Cache)
                    // ADOPT IT!
                    const projectId = machine.config?.env?.PROJECT_ID || machine.name.substring(3); // recover ID

                    console.log(`👶 [Orchestrator] Adopting orphan VM: ${machine.name} (${machine.id})`);

                    const vmInfo = {
                        id: machine.id,
                        machineId: machine.id,
                        vmId: machine.id, // Legacy compat
                        name: machine.name,
                        projectId: projectId,
                        region: machine.region,
                        privateIp: machine.private_ip,
                        agentUrl: `https://${flyService.appName}.fly.dev`,
                        createdAt: machine.created_at,
                        lastUsed: Date.now() // Reset timeout
                    };

                    await redisService.saveVMSession(projectId, vmInfo);
                    activeVMs.set(projectId, vmInfo);

                    // Resume log streaming for this adopted VM
                    this.startLogStreaming(projectId, vmInfo);

                    adoptedCount++;

                }
            }

            if (adoptedCount > 0) {
                console.log(`✅ [Orchestrator] Adopted ${adoptedCount} active VMs. Persistence achieved.`);
            } else {
                // console.log('✅ [Orchestrator] State is in sync.');
            }

        } catch (error) {
            console.error('❌ [Orchestrator] Reconciliation failed:', error.message);
        }
    }

    /**
     * Start the Reaper Loop
     */
    startReaper() {
        // Run immediately on start
        this.reconcileState();

        // Then every 5 minutes
        setInterval(() => this.reconcileState(), 5 * 60 * 1000);
    }
}

module.exports = new WorkspaceOrchestrator();
