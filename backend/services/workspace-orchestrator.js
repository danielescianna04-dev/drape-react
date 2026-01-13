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
const fileWatcherService = require('./file-watcher');
const axios = require('axios');
const serverLogService = require('./server-log-service');
const archiver = require('archiver');
const { PassThrough } = require('stream');

// Cache of active VMs per project
const activeVMs = new Map();

// Locks to prevent race conditions on getOrCreateVM (one caller at a time per project)
const vmLocks = new Map(); // projectId -> Promise

class WorkspaceOrchestrator {
    constructor() {
        this.vmTimeout = 24 * 60 * 60 * 1000; // 24 hours idle timeout (keep VMs alive longer to avoid cold starts)
    }

    /**
     * Auto-detect memory requirements based on project's package.json
     * @param {string} projectId - Project ID
     * @returns {number} Memory in MB (2048, 4096, or 8192)
     */
    async _detectMemoryRequirements(projectId) {
        try {
            // Try to read package.json from storage
            const result = await storageService.readFile(projectId, 'package.json');

            if (!result.success || !result.content) {
                console.log(`   ℹ️ [Orchestrator] No package.json found, using default memory (2GB)`);
                return 2048;
            }

            const packageJson = JSON.parse(result.content);
            const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
            const depCount = Object.keys(deps).length;

            // Heavy frameworks that need more memory
            const heavyFrameworks = {
                'next': { name: 'Next.js', memory: 4096 },
                '@angular/core': { name: 'Angular', memory: 4096 },
                '@nuxt/': { name: 'Nuxt', memory: 4096 },
                'gatsby': { name: 'Gatsby', memory: 4096 }
            };

            // Check for heavy frameworks
            for (const [dep, config] of Object.entries(heavyFrameworks)) {
                if (Object.keys(deps).some(d => d.startsWith(dep))) {
                    console.log(`   🔍 [Orchestrator] Detected ${config.name} → ${config.memory}MB RAM`);
                    return config.memory;
                }
            }

            // React/Vue with large dependency count = more memory
            if ((deps['react'] || deps['vue']) && depCount > 50) {
                console.log(`   🔍 [Orchestrator] Detected React/Vue with ${depCount} deps → 4GB RAM`);
                return 4096;
            }

            // TypeScript with many dependencies
            if (deps['typescript'] && depCount > 40) {
                console.log(`   🔍 [Orchestrator] Detected TypeScript with ${depCount} deps → 4GB RAM`);
                return 4096;
            }

            // Default for smaller projects
            console.log(`   🔍 [Orchestrator] Standard project (${depCount} deps) → 2GB RAM`);
            return 2048;

        } catch (error) {
            console.warn(`   ⚠️ [Orchestrator] Failed to detect memory requirements: ${error.message}`);
            return 2048; // Safe default
        }
    }

    /**
     * Detect project type to determine which Docker image to use
     * @param {string} projectId - Project ID
     * @returns {string} Project type ('nodejs', 'python', 'go', etc.)
     */
    async _detectProjectType(projectId) {
        try {
            // Check for package.json (Node.js/Next.js/React)
            const packageResult = await storageService.readFile(projectId, 'package.json');
            if (packageResult.success) {
                const packageJson = JSON.parse(packageResult.content);
                const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

                // Check for specific frameworks
                if (Object.keys(deps).some(d => d.startsWith('next'))) {
                    console.log(`   🔍 [Orchestrator] Detected Next.js project`);
                    return 'nextjs';
                }
                if (deps['react']) {
                    console.log(`   🔍 [Orchestrator] Detected React project`);
                    return 'react';
                }
                console.log(`   🔍 [Orchestrator] Detected Node.js project`);
                return 'nodejs';
            }

            // Check for Python (requirements.txt, pyproject.toml, setup.py)
            const pythonFiles = ['requirements.txt', 'pyproject.toml', 'setup.py'];
            for (const file of pythonFiles) {
                const result = await storageService.readFile(projectId, file);
                if (result.success) {
                    console.log(`   🔍 [Orchestrator] Detected Python project (${file})`);
                    return 'python';
                }
            }

            // Check for Go (go.mod)
            const goResult = await storageService.readFile(projectId, 'go.mod');
            if (goResult.success) {
                console.log(`   🔍 [Orchestrator] Detected Go project`);
                return 'go';
            }

            // Check for Rust (Cargo.toml)
            const rustResult = await storageService.readFile(projectId, 'Cargo.toml');
            if (rustResult.success) {
                console.log(`   🔍 [Orchestrator] Detected Rust project`);
                return 'rust';
            }

            // Default to nodejs (most common)
            console.log(`   🔍 [Orchestrator] Unknown project type, defaulting to Node.js`);
            return 'nodejs';

        } catch (error) {
            console.warn(`   ⚠️ [Orchestrator] Failed to detect project type: ${error.message}`);
            return 'nodejs'; // Safe default
        }
    }

    /**
     * Stop all machines that don't belong to the current project
     * This ensures only one project's VM is active at a time (single-tenant mode)
     * Required because all VMs share the same public URL on Fly.io
     */
    async stopOtherMachines(currentProjectId) {
        const machineName = `ws-${currentProjectId}`.substring(0, 30);

        try {
            const machines = await flyService.listMachines();
            const otherMachines = machines.filter(m =>
                m.name !== machineName &&
                m.state !== 'destroyed' &&
                m.state !== 'stopped'
            );

            if (otherMachines.length > 0) {
                console.log(`🛑 [Orchestrator] Stopping ${otherMachines.length} other VM(s) to ensure correct routing...`);
                for (const machine of otherMachines) {
                    try {
                        await flyService.stopMachine(machine.id);
                        // Also remove from cache
                        for (const [pid, vm] of activeVMs) {
                            if (vm.machineId === machine.id) {
                                activeVMs.delete(pid);
                            }
                        }
                    } catch (e) {
                        console.warn(`   ⚠️ Failed to stop ${machine.name}: ${e.message}`);
                    }
                }
            }
        } catch (e) {
            console.warn(`⚠️ [Orchestrator] Failed to stop other machines: ${e.message}`);
        }
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
        // === LOCK: Prevent parallel creation for same project ===
        while (vmLocks.has(projectId)) {
            console.log(`🔒 [Orchestrator] Waiting for lock on ${projectId}...`);
            await vmLocks.get(projectId);
        }
        let resolveLock;
        const lockPromise = new Promise(r => { resolveLock = r; });
        vmLocks.set(projectId, lockPromise);
        // === END LOCK SETUP ===

        try {
            const startTime = Date.now();
            console.log(`\n🚀 [Orchestrator] Getting VM for project: ${projectId}`);

            // Anti-Collision: Ensure only this project's machine is running
            // [MULTI-PROJECT ENABLED] allow multiple VMs but rely on idle timeout
            const machineName = `ws-${projectId}`.substring(0, 30);
            // await flyService.ensureSingleActiveMachine(machineName);

            // Check if we already have an active VM for this project
            let cached = activeVMs.get(projectId);

            // If not in memory, try Redis (survives server restarts)
            if (!cached) {
                const persisted = await redisService.getVMSession(projectId);
                if (persisted) {
                    console.log(`♻️ [Orchestrator] Recovered VM session from Redis: ${persisted.machineId}`);
                    // Check if it's the right image VERSION before adopting
                    try {
                        const machine = await flyService.getMachine(persisted.machineId);
                        if (machine && machine.config?.image !== flyService.DRAPE_IMAGE) {
                            console.log(`⚠️ [Orchestrator] Recovered VM image outdated: ${machine.config?.image}. Skipping cache.`);
                            await redisService.removeVMSession(projectId);
                        } else {
                            cached = persisted;
                            activeVMs.set(projectId, cached);
                        }
                    } catch (e) {
                        console.warn(`   ⚠️ Status check for recovered VM failed: ${e.message}`);
                        await redisService.removeVMSession(projectId);
                    }
                }
            }

            if (cached && !options.forceNew) {
                // Verify it's still alive
                try {
                    // Double check image version even for memory-cached if it's not the first time
                    // (This handles image updates while server is running)
                    const machine = await flyService.getMachine(cached.machineId);
                    if (!machine || machine.config?.image !== flyService.DRAPE_IMAGE) {
                        throw new Error("Machine dead or outdated image");
                    }

                    await axios.get(`${cached.agentUrl}/health`, {
                        timeout: 3000, // Faster timeout for check
                        headers: { 'Fly-Force-Instance-Id': cached.machineId }
                    });
                    console.log(`✅ [Orchestrator] Using cached/recovered VM (${Date.now() - startTime}ms)`);
                    cached.lastUsed = Date.now();

                    // Ensure file watcher is running
                    try {
                        await fileWatcherService.startWatching(projectId, cached.agentUrl, cached.machineId);
                    } catch (e) {
                        console.warn(`⚠️ File watcher start failed: ${e.message}`);
                    }

                    return cached;
                } catch {
                    console.log(`⚠️ [Orchestrator] Cached VM dead or unreachable, creating/finding new one`);
                    activeVMs.delete(projectId);
                    await redisService.removeVMSession(projectId);
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
                console.log(`♻️ [Orchestrator] Found existing Fly machine: ${existing.id} (state: ${existing.state})`);

                // Detect project type to get the correct expected image
                const projectType = await this._detectProjectType(projectId);
                const expectedImage = flyService.getImageForProject(projectType);
                const currentImage = existing.config?.image;

                if (currentImage && currentImage !== expectedImage) {
                    console.log(`⚠️ [Orchestrator] Machine image mismatch. Current: ${currentImage}, Expected: ${expectedImage}`);
                    console.log(`🔄 [Orchestrator] Destroying old machine to force update...`);
                    try {
                        await flyService.destroyMachine(existing.id);
                        vm = null; // Force creation of new VM
                    } catch (e) {
                        console.warn(`⚠️ [Orchestrator] Failed to destroy old machine: ${e.message}`);
                        vm = existing; // Fallback to existing
                    }
                } else {
                    vm = existing;
                }

                // If machine is already running, fast-path: just check health and return
                if (vm && existing.state === 'started') {
                    const agentUrl = 'https://drape-workspaces.fly.dev';
                    try {
                        // Quick health check (2s timeout)
                        await axios.get(`${agentUrl}/health`, {
                            timeout: 2000,
                            headers: { 'fly-force-instance-id': existing.id }
                        });

                        console.log(`⚡ [Orchestrator] VM already running! Fast path. (${Date.now() - startTime}ms)`);

                        const vmInfo = {
                            id: existing.id,
                            name: existing.name,
                            agentUrl,
                            machineId: existing.id,
                            projectId,
                            createdAt: Date.now(),
                            lastUsed: Date.now()
                        };
                        activeVMs.set(projectId, vmInfo);
                        this._scheduleCleanup(projectId);

                        // Start file watching
                        try {
                            await fileWatcherService.startWatching(projectId, agentUrl, existing.id);
                        } catch (e) {
                            console.warn(`⚠️ File watcher start failed: ${e.message}`);
                        }

                        return vmInfo;
                    } catch (e) {
                        console.log(`   ⚠️ Health check failed, will wait for agent...`);
                    }
                }

                // If stopped, start it
                if (vm && existing.state === 'stopped') {
                    console.log(`   🔄 Starting stopped machine...`);
                    await flyService.startMachine(existing.id);
                }
            } else {
                console.log(`📦 [Orchestrator] Creating new MicroVM...`);

                // Auto-detect memory requirements based on project
                const memoryMb = await this._detectMemoryRequirements(projectId);

                // Auto-detect project type to select Docker image
                const projectType = await this._detectProjectType(projectId);
                const dockerImage = flyService.getImageForProject(projectType);

                vm = await flyService.createMachine(projectId, {
                    memory_mb: memoryMb,
                    image: dockerImage,
                    env: {
                        PROJECT_ID: projectId
                    }
                });
            }

            // Wait for machine to be ready (two-phase: 30s fast, then slower polling up to 120s)
            // This never shows errors to user - keeps trying silently
            await flyService.waitForMachine(vm.id, 30000, 120000);

            // Use the common app URL - all traffic goes through drape-workspaces.fly.dev
            const agentUrl = 'https://drape-workspaces.fly.dev';

            // Wait for agent to be healthy (same two-phase approach)
            await this._waitForAgent(agentUrl, 30000, 90000, vm.id);

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
            await redisService.saveVMSession(projectId, vmInfo);

            // Schedule cleanup
            this._scheduleCleanup(projectId);

            // CRITICAL: Sync files to the new VM from storage
            // Without this, the VM has no files and git status fails
            try {
                console.log(`📂 [Orchestrator] Syncing files to new VM...`);
                await this.forceSync(projectId, vmInfo);
            } catch (e) {
                console.warn(`⚠️ [Orchestrator] forceSync failed: ${e.message}`);
            }

            // Initialize Git Repo (Critical for UI "Changes" view)
            await this.ensureGitRepo(projectId, agentUrl, vm.id);

            // Start file watching for real-time updates
            try {
                await fileWatcherService.startWatching(projectId, agentUrl, vm.id);
                console.log(`👀 [Orchestrator] File watcher started for ${projectId}`);
            } catch (e) {
                console.warn(`⚠️ [Orchestrator] Failed to start file watcher: ${e.message}`);
            }

            const elapsed = Date.now() - startTime;
            console.log(`✅ [Orchestrator] VM ready in ${elapsed}ms`);

            return vmInfo;
        } finally {
            // === UNLOCK ===
            vmLocks.delete(projectId);
            resolveLock();
        }
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

        // Save project metadata (repositoryUrl) so ensureGitRepo can find it
        await storageService.saveProjectMetadata(projectId, { repositoryUrl: repoUrl });

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
            files: files,
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
    async exec(projectId, command, cwd = '/home/coder/project', silent = false) {
        const vm = await this.getOrCreateVM(projectId);

        if (!silent) {
            console.log(`🔗 [Orchestrator] Exec: ${command.substring(0, 50)}...`);
        }

        // Pass machineId for routing via Fly-Force-Instance-Id header
        return await flyService.exec(vm.agentUrl, command, cwd, vm.machineId, 60000, silent);
    }

    /**
     * Ensure the project has a valid git repository
     * This fixes "No changes" issue in UI by ensuring 'git status' works
     */
    async ensureGitRepo(projectId, agentUrl, machineId) {
        try {
            console.log(`🐙 [Orchestrator] ensuring git repo for ${projectId}...`);

            // Run permissions fix AND git check in parallel
            const [, status] = await Promise.all([
                flyService.exec(agentUrl, 'chown -R coder:coder /home/coder/project 2>/dev/null; git config --global --add safe.directory /home/coder/project 2>/dev/null', '/home/coder/project', machineId),
                flyService.exec(agentUrl, 'test -d .git && echo "EXISTS" || echo "MISSING"', '/home/coder/project', machineId)
            ]);

            if (status.stdout.trim() === 'MISSING') {
                console.log(`🐙 [Orchestrator] .git missing, initializing git repo...`);

                // Try to get the repo URL from Firestore first (needed for both paths)
                let repoUrl = null;
                try {
                    const admin = require('firebase-admin');
                    const db = admin.firestore();

                    let wsDoc = await db.collection('workstations').doc(projectId).get();
                    if (wsDoc.exists) {
                        repoUrl = wsDoc.data().repositoryUrl || wsDoc.data().githubUrl;
                    } else {
                        const snapshot = await db.collection('workstations')
                            .where('id', '==', projectId)
                            .limit(1)
                            .get();
                        if (!snapshot.empty) {
                            repoUrl = snapshot.docs[0].data().repositoryUrl || snapshot.docs[0].data().githubUrl;
                        }
                    }
                } catch (e) {
                    console.warn(`   ⚠️ Could not fetch repo URL: ${e.message}`);
                }

                // Check if files already exist (from forceSync)
                const fileCheck = await flyService.exec(agentUrl, 'ls -A /home/coder/project 2>/dev/null | head -1', '/home/coder', machineId);
                const hasFiles = fileCheck.stdout.trim().length > 0;

                if (hasFiles) {
                    // Files already synced - init git and connect to remote for real history
                    console.log(`   ⚡ Files exist from sync - using fast git init with remote history`);
                    await this._fallbackGitInit(agentUrl, machineId, repoUrl);
                } else {
                    // No files - need to clone (but use shallow clone for speed)
                    console.log(`   📦 No files found, attempting shallow clone...`);

                    if (repoUrl) {
                        // Use shallow clone (--depth 1) for speed
                        const cloneCmd = `cd /home/coder && rm -rf project && git clone --depth 1 ${repoUrl} project 2>&1`;
                        const cloneResult = await flyService.exec(agentUrl, cloneCmd, '/home/coder', machineId, 60000); // 1 min timeout

                        if (cloneResult.exitCode === 0) {
                            console.log(`   ✅ Shallow clone completed`);
                        } else {
                            console.warn(`   ⚠️ Clone failed, using git init with remote fetch`);
                            await this._fallbackGitInit(agentUrl, machineId, repoUrl);
                        }
                    } else {
                        await this._fallbackGitInit(agentUrl, machineId, null);
                    }
                }

                // Fix permissions again after clone/init
                await flyService.exec(agentUrl, 'chown -R coder:coder /home/coder/project', '/home/coder/project', machineId);
            } else {
                console.log(`   ✅ .git already exists`);

                // Check if we only have the placeholder "Initial sync" commit
                // If so, try to fetch real history from remote
                const logCheck = await flyService.exec(agentUrl, 'git log --oneline -1 2>/dev/null | head -1', '/home/coder/project', machineId);
                const lastCommit = logCheck.stdout.trim();

                if (lastCommit.includes('Initial sync')) {
                    console.log(`   🔄 Found placeholder commit, fetching real history...`);

                    // Get repo URL from Firestore
                    let repoUrl = null;
                    try {
                        const admin = require('firebase-admin');
                        const db = admin.firestore();
                        const wsDoc = await db.collection('workstations').doc(projectId).get();
                        if (wsDoc.exists) {
                            repoUrl = wsDoc.data().repositoryUrl || wsDoc.data().githubUrl;
                        }
                    } catch (e) {
                        console.warn(`   ⚠️ Could not fetch repo URL: ${e.message}`);
                    }

                    if (repoUrl) {
                        try {
                            // Ensure remote is configured
                            await flyService.exec(agentUrl, `git remote set-url origin "${repoUrl}" 2>/dev/null || git remote add origin "${repoUrl}"`, '/home/coder/project', machineId);

                            // Fetch real history
                            await flyService.exec(agentUrl, 'git fetch --depth=20 origin 2>&1 || true', '/home/coder/project', machineId, 30000);

                            // Get default branch
                            const branchResult = await flyService.exec(agentUrl, 'git remote show origin 2>/dev/null | grep "HEAD branch" | cut -d: -f2 | tr -d " " || echo "main"', '/home/coder/project', machineId);
                            const defaultBranch = branchResult.stdout.trim() || 'main';

                            // Reset to match remote (keeps files, replaces history)
                            await flyService.exec(agentUrl, `git reset --soft origin/${defaultBranch} 2>/dev/null || true`, '/home/coder/project', machineId);

                            console.log(`   ✅ Replaced placeholder with real GitHub history`);
                        } catch (e) {
                            console.warn(`   ⚠️ Could not fetch real history: ${e.message}`);
                        }
                    }
                }
            }
        } catch (e) {
            console.warn(`⚠️ [Orchestrator] failed to ensure git repo: ${e.message}`);
        }
    }

    /**
     * Fallback git init when no remote URL is available
     * Also tries to connect to GitHub and fetch real commit history
     */
    async _fallbackGitInit(agentUrl, machineId, repoUrl = null) {
        console.log(`   🔧 Initializing local git repo...`);

        // Basic git init with initial commit
        await flyService.exec(agentUrl, 'git init && git config user.email "bot@drape.ai" && git config user.name "Drape Bot" && git add . && git commit -m "Initial sync" --allow-empty', '/home/coder/project', machineId);

        // If we have a repo URL, add it as remote and fetch history
        if (repoUrl) {
            try {
                console.log(`   🔗 Connecting to remote: ${repoUrl}`);

                // Add remote origin
                await flyService.exec(agentUrl, `git remote add origin "${repoUrl}" 2>/dev/null || git remote set-url origin "${repoUrl}"`, '/home/coder/project', machineId);

                // Fetch the actual commit history (shallow fetch for speed)
                const fetchResult = await flyService.exec(agentUrl, 'git fetch --depth=20 origin 2>&1 || true', '/home/coder/project', machineId, 30000);
                console.log(`   📥 Fetch result: ${fetchResult.stdout.substring(0, 100)}`);

                // Get the default branch name from remote
                const branchResult = await flyService.exec(agentUrl, 'git remote show origin 2>/dev/null | grep "HEAD branch" | cut -d: -f2 | tr -d " " || echo "main"', '/home/coder/project', machineId);
                const defaultBranch = branchResult.stdout.trim() || 'main';
                console.log(`   🌿 Default branch: ${defaultBranch}`);

                // Reset to match remote history (keeps local files, replaces commit history)
                // This makes our local commits match GitHub's real history
                const resetResult = await flyService.exec(agentUrl, `git reset --soft origin/${defaultBranch} 2>/dev/null || true`, '/home/coder/project', machineId);

                console.log(`   ✅ Connected to remote, history synced`);
            } catch (e) {
                console.warn(`   ⚠️ Could not connect to remote (will use local commits): ${e.message}`);
            }
        }

        console.log(`   ✅ git repo initialized`);
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
     * Check if a file is binary based on extension
     */
    _isBinaryFile(filePath) {
        const binaryExtensions = [
            '.ico', '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg',
            '.woff', '.woff2', '.ttf', '.otf', '.eot',
            '.pdf', '.zip', '.tar', '.gz', '.mp3', '.mp4', '.avi', '.mov',
            '.exe', '.dll', '.so', '.dylib'
        ];
        return binaryExtensions.some(ext => filePath.toLowerCase().endsWith(ext));
    }

    /**
     * Write a file to a project
     * Saves to storage AND syncs to VM if active
     *
     * @param {string} projectId - Project ID
     * @param {string} filePath - File path
     * @param {string|Buffer} content - File content
     */
    async writeFile(projectId, filePath, content) {
        console.log(`📝 [Orchestrator] writeFile called: ${filePath} for project ${projectId}`);

        // Skip .ico files temporarily (known corruption issue)
        if (filePath.toLowerCase().endsWith('.ico')) {
            console.log(`   ⏭️ Skipping .ico file: ${filePath}`);
            return { success: true, skipped: true };
        }

        // Detect if binary
        const isBinary = this._isBinaryFile(filePath);
        if (isBinary) {
            console.log(`   🖼️ Binary file detected: ${filePath}`);
        }

        // Save to persistent storage (handles binary conversion)
        const saveResult = await storageService.saveFile(projectId, filePath, content);
        console.log(`   💾 Saved to Firebase storage`);

        // Sync to VM if active (for hot reload)
        // Check memory cache first (fastest)
        let vm = activeVMs.get(projectId);
        console.log(`   🔍 Memory cache lookup: ${vm ? 'FOUND' : 'NOT FOUND'}`);

        // Then check Redis
        if (!vm) {
            vm = await redisService.getVMSession(projectId);
            console.log(`   🔍 Redis cache lookup: ${vm ? 'FOUND' : 'NOT FOUND'}`);
        }

        // Recovery: If not in cache, check if VM exists in Fly
        if (!vm) {
            console.log(`   🔧 Attempting VM recovery from Fly.io...`);
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
                } else {
                    console.log(`   ❌ No active VM found in Fly.io`);
                }
            } catch (e) {
                console.warn(`⚠️ [Orchestrator] Failed to recover VM session: ${e.message}`);
            }
        }

        if (vm) {
            console.log(`   🚀 VM found, syncing to VM: ${vm.machineId}`);
            try {
                // Ensure we send the Instance ID header for proper routing if using shared domain
                const headers = { 'Fly-Force-Instance-Id': vm.machineId };

                // Prepare content for transmission
                let contentToSend = content;
                if (isBinary && typeof content !== 'string') {
                    // Convert Buffer to base64 for binary files
                    contentToSend = content.toString('base64');
                }

                await axios.post(`${vm.agentUrl}/file`, {
                    path: filePath,
                    content: contentToSend,
                    isBinary: isBinary
                }, {
                    timeout: 30000,
                    headers
                });
                console.log(`   ✅ [HotReload] Synced ${filePath} to VM${isBinary ? ' (binary)' : ''}`);

                // Notify file watcher immediately instead of waiting for next poll
                try {
                    fileWatcherService.notifyFileChange(projectId, filePath, 'created');
                } catch (e) {
                    console.warn(`⚠️ [Orchestrator] Failed to notify file watcher:`, e.message);
                }
            } catch (error) {
                console.warn(`⚠️ [Orchestrator] Failed to sync to VM:`, error.message);
            }
        } else {
            console.log(`   ⚠️ [Orchestrator] No VM found for ${projectId}, file only saved to Firebase`);
        }

        return { success: true };
    }

    /**
     * Create a folder in a project
     * @param {string} projectId - Project ID
     * @param {string} folderPath - Folder path to create
     */
    async createFolder(projectId, folderPath) {
        // Create in persistent storage
        await storageService.createFolder(projectId, folderPath);

        // Sync to VM if active
        let vm = await redisService.getVMSession(projectId);

        if (!vm) {
            try {
                const machineName = `ws-${projectId}`.substring(0, 30);
                const machines = await flyService.listMachines();
                const existing = machines.find(m => m.name === machineName && m.state === 'started');
                if (existing) {
                    console.log(`♻️ [Orchestrator] Recovered active VM session for createFolder: ${existing.id}`);
                    vm = {
                        id: existing.id,
                        machineId: existing.id,
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
                const headers = { 'Fly-Force-Instance-Id': vm.machineId };
                await axios.post(`${vm.agentUrl}/folder`, {
                    path: folderPath
                }, {
                    timeout: 30000,
                    headers
                });
                console.log(`   ✅ [Sync] Created folder ${folderPath} in VM`);
            } catch (error) {
                console.warn(`⚠️ [Orchestrator] Failed to sync folder to VM:`, error.message);
            }
        }

        return { success: true };
    }

    /**
     * Delete a file or folder in a project
     * @param {string} projectId - Project ID
     * @param {string} filePath - File/folder path to delete
     */
    async deleteFile(projectId, filePath) {
        // Delete from persistent storage
        await storageService.deleteFile(projectId, filePath);

        // Sync to VM if active
        let vm = await redisService.getVMSession(projectId);

        if (!vm) {
            try {
                const machineName = `ws-${projectId}`.substring(0, 30);
                const machines = await flyService.listMachines();
                const existing = machines.find(m => m.name === machineName && m.state === 'started');
                if (existing) {
                    console.log(`♻️ [Orchestrator] Recovered active VM session for deleteFile: ${existing.id}`);
                    vm = {
                        id: existing.id,
                        machineId: existing.id,
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
                const headers = { 'Fly-Force-Instance-Id': vm.machineId };
                await axios.post(`${vm.agentUrl}/delete`, {
                    path: filePath
                }, {
                    timeout: 30000,
                    headers
                });
                console.log(`   ✅ [Sync] Deleted ${filePath} from VM`);
            } catch (error) {
                console.warn(`⚠️ [Orchestrator] Failed to sync delete to VM:`, error.message);
            }
        }

        return { success: true };
    }

    /**
     * List files in a project
     * @param {string} projectId - Project ID
     */
    /**
     * List files in a project
     * Authoritative source: VM if active, Storage otherwise
     * @param {string} projectId - Project ID
     */
    async listFiles(projectId) {
        // Try active VM first for live file list
        let vm = activeVMs.get(projectId);

        // Then check Redis if not in memory
        if (!vm) {
            vm = await redisService.getVMSession(projectId);
        }

        if (vm) {
            try {
                // Get live files from VM
                // We use find to get all files. We exclude node_modules and .git for speed.
                const result = await flyService.exec(
                    vm.agentUrl,
                    'find . -type f -not -path "*/node_modules/*" -not -path "*/.git/*" | sort',
                    '/home/coder/project',
                    vm.machineId,
                    10000,
                    true // silent
                );

                if (result.exitCode === 0) {
                    const files = result.stdout.trim().split('\n')
                        .filter(f => f)
                        .map(f => f.replace(/^\.\//, ''));

                    console.log(`📂 [Orchestrator] Listed ${files.length} files from live VM for ${projectId}`);

                    // Return in same format as storageService.listFiles for compatibility
                    return {
                        success: true,
                        files: files.map(path => ({ path })),
                        source: 'vm'
                    };
                }
            } catch (e) {
                console.warn(`⚠️ [Orchestrator] VM listFiles failed for ${projectId}, falling back to storage: ${e.message}`);
            }
        }

        console.log(`📂 [Orchestrator] Listing files from storage for ${projectId}`);
        return await storageService.listFiles(projectId);
    }

    /**
     * Start a dev server for preview
     * @param {string} projectId - Project ID
     * @param {object} projectInfo - Project type info (from analyzer)
     */
    async startPreview(projectId, projectInfo) {
        // CRITICAL: Stop all other VMs first to ensure correct routing
        // All VMs share the same URL (drape-workspaces.fly.dev), so only one can be active
        await this.stopOtherMachines(projectId);

        const vm = await this.getOrCreateVM(projectId);

        // CRITICAL: Clean project folder before sync but PRESERVE node_modules and .git for speed
        console.log(`🧹 [Orchestrator] Cleaning project folder on VM (preserving node_modules)...`);
        try {
            const cleanCmd = `find /home/coder/project -mindepth 1 -maxdepth 1 -not -name 'node_modules' -not -name '.git' -exec rm -rf {} +`;
            await flyService.exec(vm.agentUrl, cleanCmd, '/home/coder', vm.machineId);
            console.log(`   ✅ Project folder cleaned (node_modules preserved)`);
        } catch (e) {
            console.warn(`   ⚠️ Cleanup failed: ${e.message}`);
        }

        // Pre-create log file to avoid tail errors
        try {
            await flyService.exec(vm.agentUrl, 'touch /home/coder/server.log && chown coder:coder /home/coder/server.log', '/home/coder', vm.machineId, 5000, true);
        } catch (e) {
            // ignore
        }

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
                console.log(`🚑 [Orchestrator] Initiating parallel repair sync (10 at a time)...`);

                const REPAIR_BATCH_SIZE = 10;
                let repairedCount = 0;
                let failedCount = 0;

                // Repair in batches of 10 in parallel
                for (let i = 0; i < missingFiles.length; i += REPAIR_BATCH_SIZE) {
                    const batch = missingFiles.slice(i, i + REPAIR_BATCH_SIZE);

                    const repairPromises = batch.map(async (missing) => {
                        try {
                            const fileContent = await storageService.readFile(projectId, missing.path);
                            if (!fileContent.success) {
                                throw new Error(`Failed to read from storage`);
                            }

                            await axios.post(`${vm.agentUrl}/file`, {
                                path: missing.path,
                                content: fileContent.content,
                                isBinary: fileContent.isBinary || false
                            }, {
                                timeout: 30000,
                                headers: { 'Fly-Force-Instance-Id': vm.machineId }
                            });

                            console.log(`   ✅ Repaired: ${missing.path}`);
                            return { success: true, path: missing.path };
                        } catch (e) {
                            console.error(`   ❌ Failed to repair ${missing.path}: ${e.message}`);
                            return { success: false, path: missing.path };
                        }
                    });

                    const results = await Promise.all(repairPromises);
                    repairedCount += results.filter(r => r.success).length;
                    failedCount += results.filter(r => !r.success).length;
                }

                console.log(`🚑 [Orchestrator] Repair complete: ${repairedCount} fixed, ${failedCount} failed`);
            } else {
                console.log(`✅ [Orchestrator] File integrity verified. All files present.`);
            }
        } catch (error) {
            console.error(`⚠️ [Orchestrator] Verification failed: ${error.message}`);
        }

        // Setup (Install + Start) via Optimized pnpm (Async)
        if (projectInfo.installCommand || projectInfo.startCommand) {
            try {
                // Use optimized setup with pnpm
                await this.optimizedSetup(projectId, vm.agentUrl, vm.machineId, projectInfo);

                // Start log streaming
                this.startLogStreaming(projectId, vm);
            } catch (e) {
                console.error(`   ⚠️ Failed to trigger optimized setup: ${e.message}`);
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
                // Read new logs using tail (silent=true to avoid terminal spam if file/VM not ready)
                // Use a larger tail buffer if lastSize is 0 to catch initial output
                const tailCmd = lastSize === 0
                    ? `tail -n 100 ${logFile} 2>/dev/null || echo ""`
                    : `tail -c +${lastSize + 1} ${logFile} 2>/dev/null || echo ""`;

                const result = await flyService.exec(vm.agentUrl, tailCmd, '/home/coder', vm.machineId, 5000, true);

                if (result.stdout && result.stdout.trim()) {
                    const lines = result.stdout.split('\n').filter(l => l.trim());
                    lines.forEach(line => {
                        // Extract message if it contains agent metadata prefix [timestamp] [stream]
                        let cleanLine = line;
                        if (line.includes('] [') && line.startsWith('[')) {
                            // Match: [2026-01-12T22:24:57.123Z] [stdout] My Message
                            const match = line.match(/^\[.*?\] \[(.*?)\] (.*)$/);
                            if (match) cleanLine = match[2];
                        }

                        // Avoid system noise from 'tail' or 'exec' in the log view
                        if (cleanLine.includes('[Agent]') || cleanLine.trim() === '') return;

                        serverLogService.addLog(workstationId, cleanLine, 'output');
                    });

                    // Update size (best effort, silent=true)
                    const sizeResult = await flyService.exec(vm.agentUrl, `wc -c < ${logFile}`, '/home/coder', vm.machineId, 5000, true);
                    const newSize = parseInt(sizeResult.stdout);
                    if (!isNaN(newSize) && newSize >= lastSize) {
                        lastSize = newSize;
                    } else if (!isNaN(newSize) && newSize < lastSize) {
                        // File was truncated/recreated
                        lastSize = newSize;
                    }
                }
            } catch (err) {
                // Silent fail if file not ready yet
            }
        }, 1500); // Polling faster (1.5s) for responsiveness

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
     * Two-phase approach: fast polling, then slower polling
     * Never throws timeout errors - keeps trying silently
     *
     * @param {string} agentUrl - Base URL for the agent
     * @param {number} initialTimeout - Fast polling phase (default 30s)
     * @param {number} maxTimeout - Total max wait time (default 90s)
     * @param {string} machineId - Fly machine ID for routing
     */
    async _waitForAgent(agentUrl, initialTimeout = 30000, maxTimeout = 90000, machineId = null) {
        const startTime = Date.now();
        let phase = 1;
        console.log(`⏳ [Orchestrator] Waiting for agent at ${agentUrl} (machine: ${machineId})...`);

        const headers = machineId ? { 'Fly-Force-Instance-Id': machineId } : {};

        while (Date.now() - startTime < maxTimeout) {
            try {
                const response = await axios.get(`${agentUrl}/health`, {
                    timeout: 3000,
                    headers
                });
                if (response.data.status === 'ok') {
                    const elapsed = Date.now() - startTime;
                    console.log(`✅ [Orchestrator] Agent ready in ${elapsed}ms`);

                    // Phase 3: Wait for Fly proxy to propagate the route
                    // This prevents PR04 "could not find candidate" errors
                    await this._waitForProxyRoute(agentUrl, machineId);

                    return true;
                }
            } catch {
                // Not ready yet - continue polling
            }

            // Phase transition logging
            const elapsed = Date.now() - startTime;
            if (phase === 1 && elapsed > initialTimeout) {
                phase = 2;
                console.log(`⏳ [Orchestrator] Phase 2: continuing to poll agent...`);
            }

            // Phase 1: fast polling (500ms), Phase 2: slower (1s)
            const pollInterval = phase === 1 ? 500 : 1000;
            await new Promise(r => setTimeout(r, pollInterval));
        }

        throw new Error(`Agent not ready after ${maxTimeout / 1000}s`);
    }

    /**
     * Wait for Fly.io proxy to register the machine route
     * This prevents PR04 "could not find a good candidate" errors
     *
     * @param {string} agentUrl - Base URL for the agent
     * @param {string} machineId - Fly machine ID for routing
     * @param {number} maxWait - Maximum wait time (default 10s)
     */
    async _waitForProxyRoute(agentUrl, machineId, maxWait = 10000) {
        if (!machineId) return;

        console.log(`🔗 [Orchestrator] Verifying proxy route for ${machineId}...`);
        const startTime = Date.now();
        let attempts = 0;

        while (Date.now() - startTime < maxWait) {
            attempts++;
            try {
                // Make a request through the public proxy WITH the routing header
                // This verifies the Fly edge proxy can route to our specific machine
                const response = await axios.get(`${agentUrl}/health`, {
                    timeout: 2000,
                    headers: { 'Fly-Force-Instance-Id': machineId },
                    // Disable any keep-alive to force fresh connection through proxy
                    httpAgent: new (require('http').Agent)({ keepAlive: false }),
                    httpsAgent: new (require('https').Agent)({ keepAlive: false })
                });

                if (response.data.status === 'ok') {
                    const elapsed = Date.now() - startTime;
                    console.log(`✅ [Orchestrator] Proxy route verified in ${elapsed}ms (${attempts} attempts)`);
                    return true;
                }
            } catch (e) {
                // Check if it's a PR04 error (proxy can't find machine)
                const isPR04 = e.message?.includes('PR04') ||
                    e.response?.status === 502 ||
                    e.response?.status === 503;

                if (isPR04) {
                    // Proxy not ready yet, wait longer
                    await new Promise(r => setTimeout(r, 500));
                    continue;
                }
                // Other errors - might be transient, retry
            }

            await new Promise(r => setTimeout(r, 300));
        }

        // Don't throw - just log warning and continue
        // Sometimes the route works even if verification times out
        console.warn(`⚠️ [Orchestrator] Proxy route verification timed out after ${attempts} attempts (continuing anyway)`);
    }

    /**
     * Fetch files from GitHub repository using direct download (no API rate limits!)
     */
    async _fetchGitHubFiles(owner, repo, token = null) {
        const AdmZip = require('adm-zip');

        console.log(`📥 [GitHub] Fetching ${owner}/${repo}...`);

        try {
            // 1. Get the default branch name
            let branch = 'main';
            try {
                const repoInfo = await axios.get(`https://api.github.com/repos/${owner}/${repo}`, {
                    headers: {
                        'User-Agent': 'Drape-IDE',
                        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                    }
                });
                branch = repoInfo.data.default_branch || 'main';
            } catch (e) {
                console.warn(`   ⚠️ Could not fetch repo info, defaulting to 'main': ${e.message}`);
            }

            // 2. Use API zipball endpoint (more reliable for all branch names)
            const zipUrl = `https://api.github.com/repos/${owner}/${repo}/zipball/${branch}`;

            const headers = {
                'User-Agent': 'Drape-IDE',
                'Accept': 'application/vnd.github.v3+json'
            };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            console.log(`   📥 Downloading ${branch} zipball...`);
            const zipResponse = await axios.get(zipUrl, {
                headers,
                responseType: 'arraybuffer',
                timeout: 60000
            });

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

                // The first part is always the root folder in GitHub zipballs
                if (pathParts.length > 1) {
                    pathParts.shift();
                } else {
                    // Skip if it's just the root folder itself
                    continue;
                }

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
                console.error(`❌ [GitHub] Repository not found at ${url} (Might be private)`);

                // Create a 401 error to trigger the auth flow in the frontend
                const authError = new Error(`GitHub repository not found or private: ${owner}/${repo}. Please verify the URL or authenticate.`);
                authError.statusCode = 401;
                authError.requiresAuth = true;
                authError.isOperational = true;
                throw authError;
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

    /**
     * Force sync files to a specific VM using tar.gz (10-20x faster)
     * Creates a tar.gz archive of all files and extracts on VM in one request
     */
    async forceSync(projectId, vm) {
        const startTime = Date.now();
        console.log(`💪 [Orchestrator] Force-syncing files to ${vm.machineId} (using tar.gz)...`);

        const { files } = await storageService.getAllFilesWithContent(projectId);

        if (!files || files.length === 0) {
            console.log(`   ⚠️ No files to sync`);
            return;
        }

        try {
            // Create tar.gz archive in memory
            const archive = archiver('tar', { gzip: true, gzipOptions: { level: 6 } });
            const chunks = [];

            // Collect archive data
            archive.on('data', chunk => chunks.push(chunk));

            // Add all files to archive
            for (const file of files) {
                if (file.content !== undefined) {
                    archive.append(file.content, { name: file.path });
                }
            }

            // Finalize archive
            await archive.finalize();

            // Wait for all data to be collected
            await new Promise((resolve, reject) => {
                archive.on('end', resolve);
                archive.on('error', reject);
            });

            // Combine chunks and convert to base64
            const buffer = Buffer.concat(chunks);
            const base64Archive = buffer.toString('base64');

            console.log(`   📦 Archive created: ${files.length} files, ${(buffer.length / 1024).toFixed(1)}KB compressed`);

            // Send to VM for extraction
            const response = await axios.post(`${vm.agentUrl}/extract`, {
                archive: base64Archive
            }, {
                timeout: 30000,
                headers: { 'Fly-Force-Instance-Id': vm.machineId },
                maxContentLength: 50 * 1024 * 1024, // 50MB max
                maxBodyLength: 50 * 1024 * 1024
            });

            const elapsed = Date.now() - startTime;
            console.log(`   ✅ Force-sync complete: ${response.data.filesExtracted || files.length} files in ${elapsed}ms`);

        } catch (e) {
            console.warn(`   ⚠️ Bulk sync failed, falling back to individual files: ${e.message}`);

            // Fallback to individual file sync
            let synced = 0;
            for (const file of files) {
                try {
                    const fileContent = await storageService.readFile(projectId, file.path);
                    if (fileContent.success) {
                        await axios.post(`${vm.agentUrl}/file`, {
                            path: file.path,
                            content: fileContent.content
                        }, {
                            timeout: 10000,
                            headers: { 'Fly-Force-Instance-Id': vm.machineId }
                        });
                        synced++;
                    }
                } catch (err) {
                    console.warn(`   ⚠️ Failed to sync ${file.path}: ${err.message}`);
                }
            }
            console.log(`   ✅ Fallback sync complete: ${synced}/${files.length} synced.`);
        }
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
            let reapedCount = 0;

            const now = Date.now();
            // Default timeout: 30 minutes, but for "zombies" (orphans) we can be stricter or looser
            // Let's stick to the instance timeout
            const MAX_AGE_MS = this.vmTimeout;

            for (const machine of machines) {
                // Only care about started workspace machines
                if (!machine.name.startsWith('ws-') || machine.state !== 'started') continue;

                // Check age
                const createdAt = new Date(machine.created_at).getTime();
                const uptime = now - createdAt;

                // If we have a session in Redis, trust its lastUsed
                if (sessionMap.has(machine.id)) {
                    const session = sessionMap.get(machine.id);
                    const lastUsed = session.lastUsed || now;
                    const idleTime = now - lastUsed;

                    if (idleTime > MAX_AGE_MS) {
                        console.log(`💀 [Orchestrator] Reaping IDLE session: ${machine.name} (Idle: ${Math.round(idleTime / 60000)}m)`);
                        await this.stopVM(session.projectId); // Uses stopVM to clean up gracefully
                        reapedCount++;
                        continue;
                    }
                } else {
                    // ORPHAN (No Redis Session). 
                    // If it's older than MAX_AGE_MS and has no active session, it's likely a TRUE zombie from a crash day ago.
                    // However, if we just restarted, we might have lost Redis state (if in-memory).
                    // Safe bet: If uptime > 2 hours and no session, kill it. 
                    // Or closer to standard timeout if we trust Fly's created_at as "last sign of life" start.

                    // IMPROVEMENT: Trust created_at as a baseline. 
                    if (uptime > MAX_AGE_MS) {
                        console.log(`🧟 [Orchestrator] Reaping ZOMBIE machine (No Session): ${machine.name} (Uptime: ${Math.round(uptime / 60000)}m)`);
                        // We don't know the projectId easily without parsing name or config, but destroyMachine takes ID.
                        // We also need to stop it. stopVM takes projectId. 
                        // Let's use flyService directly to stop.
                        await flyService.stopMachine(machine.id);
                        reapedCount++;
                        continue;
                    }

                    // ADOPT IT if it's young enough
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
                        lastUsed: now // Give it a fresh lease on life since we just adopted it (maybe user just connected)
                    };

                    await redisService.saveVMSession(projectId, vmInfo);
                    activeVMs.set(projectId, vmInfo);

                    // Resume log streaming for this adopted VM
                    this.startLogStreaming(projectId, vmInfo);
                    // Schedule cleanup logic for this new adoption
                    this._scheduleCleanup(projectId);

                    // FORCE SYNC: Ensure the VM has files (in case of ephemeral restart)
                    try {
                        await this.forceSync(projectId, vmInfo);
                    } catch (e) {
                        console.error(`⚠️ [Orchestrator] Failed to sync files to adopted VM: ${e.message}`);
                    }

                    adoptedCount++;
                }
            }

            if (reapedCount > 0 || adoptedCount > 0) {
                console.log(`✅ [Orchestrator] Reconciled: Adopted ${adoptedCount}, Reaped ${reapedCount} VMs.`);
            }

        } catch (error) {
            console.error('❌ [Orchestrator] Reconciliation failed:', error.message);
        }
    }

    /**
     * Check if package.json has only common dependencies
     * Used to determine if we can use symlink to base deps instead of full install
     * @param {string} projectId - Project ID
     * @returns {boolean} True if only common deps
     */
    async hasOnlyCommonDeps(projectId) {
        try {
            const result = await storageService.readFile(projectId, 'package.json');
            if (!result.success || !result.content) {
                return false;
            }

            const pkg = JSON.parse(result.content);
            const deps = { ...pkg.dependencies, ...pkg.devDependencies };

            const commonDeps = [
                'react', 'react-dom', 'next', 'vite', '@vitejs/plugin-react',
                'tailwindcss', 'postcss', 'autoprefixer', 'typescript',
                '@types/react', '@types/node'
            ];

            const allDeps = Object.keys(deps);
            const uncommonDeps = allDeps.filter(d =>
                !commonDeps.some(common => d.startsWith(common))
            );

            console.log(`   🔍 [Orchestrator] Found ${uncommonDeps.length} uncommon dependencies`);
            return uncommonDeps.length === 0;
        } catch (error) {
            console.warn(`   ⚠️ [Orchestrator] Failed to check deps: ${error.message}`);
            return false;
        }
    }

    /**
     * Optimized setup with pnpm (3-5x faster than npm)
     * Uses symlink for common-only deps, pnpm install for others
     * @param {string} projectId - Project ID
     * @param {string} agentUrl - VM agent URL
     * @param {string} machineId - Fly machine ID
     * @param {object} projectInfo - Project metadata
     * @returns {object} Result
     */
    async optimizedSetup(projectId, agentUrl, machineId, projectInfo) {
        const axios = require('axios');
        const headers = machineId ? { 'Fly-Force-Instance-Id': machineId } : {};

        try {
            // Check if has only common deps
            const onlyCommon = await this.hasOnlyCommonDeps(projectId);

            let installCmd;
            if (onlyCommon) {
                // Symlink node_modules base (instant)
                installCmd = 'ln -sf /base-deps/node_modules /home/coder/project/node_modules';
                console.log('   ⚡ Using base dependencies (symlink - instant!)');
            } else {
                // Install with pnpm (NO volume - each VM has its own store)
                // NOTE: Volume sharing not possible with Fly.io (1 volume = 1 machine)
                installCmd = 'pnpm install';
                console.log('   📦 Installing with pnpm (local store)');
            }

            // Note: build cache disabled (Fly.io supports only 1 volume per machine)
            // Using pnpm cache which provides bigger performance gain
            const cacheCmd = 'true';

            // Get start command
            const start = projectInfo.startCommand || 'npm run dev -- --host 0.0.0.0 --port 3000';

            // Ensure proper binding for common frameworks
            let finalStart = start;
            if ((start.includes('npm start') || start.includes('react-scripts start') || start.includes('vite')) && !start.includes('--host')) {
                finalStart = `${start} -- --host 0.0.0.0`;
            }

            // Setup completo ottimizzato
            const setupScript = `${installCmd} && ${cacheCmd} && (fuser -k 3000/tcp || true) && ${finalStart}`;

            console.log(`🚀 [Orchestrator] Triggering Optimized Setup (pnpm)`);

            // Call the /setup endpoint
            await axios.post(`${agentUrl}/setup`, {
                command: setupScript
            }, {
                timeout: 5000,
                headers
            });

            console.log(`   ✅ Optimized setup triggered. Expected time: 10-20s (vs 40-60s with npm)`);
            return { success: true };
        } catch (error) {
            console.error(`❌ [Orchestrator] Optimized setup failed: ${error.message}`);
            return { success: false, error: error.message };
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
