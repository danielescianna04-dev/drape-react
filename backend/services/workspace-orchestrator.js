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
const vmPoolManager = require('./vm-pool-manager');
const axios = require('axios');
const serverLogService = require('./server-log-service');
const archiver = require('archiver');
const { PassThrough } = require('stream');

// Cache of active VMs per project
const activeVMs = new Map();

// Locks to prevent race conditions on getOrCreateVM (one caller at a time per project)
const vmLocks = new Map(); // projectId -> Promise
const setupLocks = new Map(); // projectId -> Promise


class WorkspaceOrchestrator {
    constructor() {
        this.vmTimeout = 15 * 60 * 1000; // 15 minutes idle timeout (Improved resource efficiency)
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
     * Detect project metadata (type, start command, etc.)
     * This logic is shared between background warming and actual preview start.
     * Uses session caching to avoid re-detection when possible.
     * @param {string} projectId - Project ID
     * @param {boolean} forceRefresh - Force re-detection even if cached
     * @returns {object} projectInfo
     */
    async detectProjectMetadata(projectId, forceRefresh = false) {
        console.log(`\n🔍 [Orchestrator] Detecting project metadata for: ${projectId}`);

        // SESSION CACHING: Check if we already have detected project info
        // DISABLED: Cache causing issues with VM reuse - always re-detect for now
        if (false && !forceRefresh) {
            try {
                const cachedSession = await redisService.getVMSession(projectId);
                if (cachedSession?.projectInfo?.type && cachedSession.projectInfo.type !== 'static') {
                    // CRITICAL: Validate cache - if cached type requires package.json but it doesn't exist in storage,
                    // invalidate cache and re-detect (fixes issue where VM reuse caused wrong detection)
                    const needsPackageJson = ['nextjs', 'vite', 'nodejs', 'react'].includes(cachedSession.projectInfo.type);
                    if (needsPackageJson) {
                        const pkgCheck = await storageService.readFile(projectId, 'package.json');
                        if (!pkgCheck.success) {
                            console.log(`   ❌ [Cache Invalid] Cached type "${cachedSession.projectInfo.type}" requires package.json but none found in storage - re-detecting`);
                            // Fall through to re-detection
                        } else {
                            console.log(`   💾 [Cache Hit] Using cached detection: ${cachedSession.projectInfo.type}`);
                            console.log(`      startCommand: ${cachedSession.projectInfo.startCommand}`);
                            return cachedSession.projectInfo;
                        }
                    } else {
                        console.log(`   💾 [Cache Hit] Using cached detection: ${cachedSession.projectInfo.type}`);
                        console.log(`      startCommand: ${cachedSession.projectInfo.startCommand}`);
                        return cachedSession.projectInfo;
                    }
                }
            } catch (e) {
                // Ignore cache errors - fall through to detection
            }
        }

        // Helper for robust timeouts
        const withTimeout = async (promise, timeoutMs, label) => {
            const timeout = new Promise((_, reject) =>
                setTimeout(() => reject(new Error(`${label} timeout after ${timeoutMs}ms`)), timeoutMs)
            );
            return Promise.race([promise, timeout]);
        };

        // Get file list for project detection FROM STORAGE (not VM!)
        // This prevents detecting files from previous projects on reused VMs
        let fileNames = [];
        let configFiles = {};
        try {
            // Use storageService to list files from Firebase Storage, not from VM
            const storageFiles = await storageService.listFiles(projectId);
            fileNames = storageFiles.success ? storageFiles.files.map(f => f.path) : [];
            console.log(`   📂 [Detection] Found ${fileNames.length} files in storage`);

            // Fallback to VM listing if storage returns empty (shouldn't happen but safety first)
            if (fileNames.length === 0) {
                console.warn(`   ⚠️ [Detection] No files in storage, falling back to VM listing`);
                const listResult = await withTimeout(this.listFiles(projectId), 15000, 'listFiles (detecting)');
                fileNames = (listResult.files || []).map(f => f.path);
            }

            // Read config files for detection FROM STORAGE (not VM!)
            // This ensures we detect based on actual project files, not leftovers from previous projects
            const configReadResults = { success: [], failed: [] };
            for (const configName of ['package.json', 'requirements.txt', 'go.mod', 'vite.config.js', 'vite.config.ts', 'next.config.js', 'next.config.mjs', 'next.config.ts']) {
                try {
                    // Use storageService instead of this.readFile (VM)
                    const result = await storageService.readFile(projectId, configName);
                    if (result.success && result.content) {
                        configFiles[configName] = { content: result.content };
                        configReadResults.success.push(configName);
                    }
                } catch (e) {
                    // Log failed reads for debugging (helps identify timeout issues)
                    if (configName === 'package.json') {
                        configReadResults.failed.push(`${configName}: ${e.message}`);
                    }
                }
            }
            // Log detection results for debugging
            if (configReadResults.success.length > 0) {
                console.log(`   📦 [Detection] Read ${configReadResults.success.length} config files: ${configReadResults.success.join(', ')}`);
            }
            if (configReadResults.failed.length > 0) {
                console.warn(`   ⚠️ [Detection] Failed to read: ${configReadResults.failed.join(', ')}`);
            }
        } catch (e) {
            console.warn(`   ⚠️ Detection data gathering failed: ${e.message}`);
        }

        let viteConfig = (configFiles['vite.config.js'] && configFiles['vite.config.js'].content) ? { name: 'vite.config.js', content: configFiles['vite.config.js'].content } :
            ((configFiles['vite.config.ts'] && configFiles['vite.config.ts'].content) ? { name: 'vite.config.ts', content: configFiles['vite.config.ts'].content } : null);

        let nextConfig = (configFiles['next.config.js'] && configFiles['next.config.js'].content) ? { name: 'next.config.js', content: configFiles['next.config.js'].content } :
            ((configFiles['next.config.mjs'] && configFiles['next.config.mjs'].content) ? { name: 'next.config.mjs', content: configFiles['next.config.mjs'].content } :
                ((configFiles['next.config.ts'] && configFiles['next.config.ts'].content) ? { name: 'next.config.ts', content: configFiles['next.config.ts'].content } : null));

        // Smart fallback based on config files
        let projectInfo = {
            type: 'static',
            startCommand: 'npx http-server . -p 3000 -a 0.0.0.0',
            port: 3000
        };

        // Check for Next.js
        if (nextConfig || configFiles['package.json']?.content?.includes('"next"')) {
            projectInfo = {
                type: 'nextjs',
                description: 'Next.js Application',
                startCommand: 'npx next dev --turbo -H 0.0.0.0 --port 3000',
                port: 3000
            };

            // Version check
            if (configFiles['package.json']?.content) {
                try {
                    const pkg = JSON.parse(configFiles['package.json'].content);
                    const nextVersion = pkg.dependencies?.next || pkg.devDependencies?.next;
                    if (nextVersion) {
                        const versionMatch = nextVersion.match(/(\d+)\.(\d+)\.(\d+)/);
                        if (versionMatch) {
                            const [, major, minor, patch] = versionMatch;
                            if (parseInt(major) === 16 && parseInt(minor) <= 1) {
                                projectInfo.nextJsVersionWarning = {
                                    version: `${major}.${minor}.${patch}`,
                                    message: 'Next.js 16.0-16.1 has known dev server hanging issues',
                                    recommendation: 'Consider downgrading to Next.js 15.3.0',
                                    link: 'https://github.com/vercel/next.js/discussions/77102'
                                };
                                // Next.js 16.x still uses Webpack by default (Turbopack is opt-in with --turbo)
                                // No need for --no-turbo flag, just use default Webpack mode
                                projectInfo.startCommand = 'npx next dev -H 0.0.0.0 --port 3000';
                                projectInfo.disableTurbopack = true;
                            }
                        }
                    }
                } catch (e) { }
            }
        }
        // Check for Vite/React
        else if (viteConfig || configFiles['package.json']?.content?.includes('"vite"')) {
            projectInfo = {
                type: 'vite',
                description: 'Vite Application',
                startCommand: 'npx vite --host 0.0.0.0 --port 3000',
                port: 3000
            };
        }
        // Check for generic Node.js
        else if (configFiles['package.json']) {
            projectInfo = {
                type: 'nodejs',
                description: 'Node.js Application',
                startCommand: 'npm run dev -- --host 0.0.0.0 --port 3000',
                port: 3000
            };
        }

        // Try AI detection to override smart fallback
        try {
            const { analyzeProjectWithAI } = require('./project-analyzer');
            if (fileNames.length > 0) {
                const simplifiedConfigs = {};
                for (const [k, v] of Object.entries(configFiles)) simplifiedConfigs[k] = v.content;

                const detected = await withTimeout(analyzeProjectWithAI(fileNames, simplifiedConfigs), 5000, 'analyzeProjectWithAI');
                if (detected) {
                    projectInfo = { ...projectInfo, ...detected };
                    console.log(`   🧠 AI Detection: ${projectInfo.description}`);
                }
            }
        } catch (e) {
            console.log(`   ⚠️ AI detection failed, using smart fallback: ${projectInfo.type}`);
        }

        // SESSION CACHING: Save detected projectInfo to session for future use
        // Only save if we detected a non-static type (to allow re-detection for static fallback)
        if (projectInfo.type !== 'static') {
            try {
                const existingSession = await redisService.getVMSession(projectId);
                if (existingSession) {
                    await redisService.saveVMSession(projectId, {
                        ...existingSession,
                        projectInfo,
                        detectedAt: Date.now()
                    });
                    console.log(`   💾 [Cache Save] Saved detection to session: ${projectInfo.type}`);
                }
            } catch (e) {
                // Ignore save errors - detection still works
            }
        }

        return projectInfo;
    }

    /**
     * Proactive Project Warming
     * Triggered when a project is opened (at /clone stage)
     * Starts VM, syncs files, AND installs dependencies in background
     */
    async prewarmProjectServer(projectId) {
        console.log(`\n🔥 [Orchestrator] Proactive warming for: ${projectId}`);

        try {
            // 1. Get/Create VM
            const vm = await this.getOrCreateVM(projectId);

            // 2. CRITICAL: Clean project folder before sync to prevent stale file detection
            // When reusing a VM from a different project, old files (especially package.json)
            // can cause incorrect project type detection
            console.log(`🧹 [Orchestrator] Cleaning project folder on VM (preserving node_modules)...`);
            try {
                const cleanCmd = `find /home/coder/project -mindepth 1 -maxdepth 1 -not -name 'node_modules' -not -name '.git' -not -name '.package-json-hash' -exec rm -rf {} +`;
                await flyService.exec(vm.agentUrl, cleanCmd, '/home/coder', vm.machineId);
                console.log(`   ✅ Project folder cleaned (node_modules preserved)`);
            } catch (e) {
                console.warn(`   ⚠️ Cleanup failed: ${e.message}`);
            }

            // 3. Sync files to VM (CRITICAL - needed before install)
            console.log(`📂 [Orchestrator] Syncing files to VM for warming...`);
            const syncResult = await storageService.syncToVM(projectId, vm.agentUrl, vm.machineId);
            console.log(`   ✅ Synced ${syncResult.syncedCount} files`);

            // 4. Detect project type (now reads clean files from VM)
            const projectInfo = await this.detectProjectMetadata(projectId);

            // 5. Store project metadata in Redis for startPreview to pick up
            await redisService.saveVMSession(projectId, { ...vm, projectInfo, lastUsed: Date.now() });

            // 6. Background: Install dependencies + Patch configs
            // We DON'T await this so the /clone response returns immediately
            setImmediate(async () => {
                try {
                    console.log(`🔥 [Orchestrator] Background warming starting for ${projectId}...`);

                    // Patch configs for Fly.io proxy
                    await this.patchConfigFiles(projectId, projectInfo);

                    // Run npm install
                    if (projectInfo.type !== 'static') {
                        console.log(`🔥 [Orchestrator] Background install starting for ${projectId}...`);
                        // Set a lock to prevent parallel installs during Start Preview
                        await this.optimizedSetup(projectId, vm.agentUrl, vm.machineId, projectInfo, (step, msg) => {
                            // Only log locally
                            console.log(`   [Warming ${projectId}] ${step}: ${msg}`);
                        }, true); // Use staySilent=true to skip wait for dev server

                        // Update lastUsed after install completes to prevent idle cleanup
                        const session = await redisService.getVMSession(projectId);
                        if (session) {
                            session.lastUsed = Date.now();
                            await redisService.saveVMSession(projectId, session);
                        }

                        console.log(`✅ [Orchestrator] Background warming complete for ${projectId}`);
                    }
                } catch (e) {
                    console.warn(`⚠️ [Orchestrator] Background warming failed for ${projectId}: ${e.message}`);
                }
            });

            return { success: true, machineId: vm.machineId };
        } catch (e) {
            console.error(`❌ [Orchestrator] Proactive warming failed: ${e.message}`);
            return { success: false, error: e.message };
        }
    }

    /**
     * Patch project configs for Fly.io proxying
     */
    async patchConfigFiles(projectId, projectInfo) {
        try {
            // 1. Vite Patch
            let viteConfigJS = await this.readFile(projectId, 'vite.config.js');
            let viteConfigTS = !viteConfigJS.success ? await this.readFile(projectId, 'vite.config.ts') : { success: false };
            let viteConfig = viteConfigJS.success ? { name: 'vite.config.js', content: viteConfigJS.content } :
                (viteConfigTS.success ? { name: 'vite.config.ts', content: viteConfigTS.content } : null);

            if (viteConfig && viteConfig.content) {
                let content = viteConfig.content;
                if (!content.includes('allowedHosts') && !content.includes('drape-workspaces.fly.dev')) {
                    console.log(`   🔧 [Orchestrator] Patching ${viteConfig.name} for allowedHosts...`);
                    if (content.includes('server: {')) {
                        content = content.replace('server: {', `server: {\n    allowedHosts: ['drape-workspaces.fly.dev', 'all'],`);
                    } else if (content.includes('defineConfig({')) {
                        content = content.replace('defineConfig({', `defineConfig({\n  server: {\n    allowedHosts: ['drape-workspaces.fly.dev', 'all']\n  },`);
                    }

                    if (content !== viteConfig.content) {
                        await this.writeFile(projectId, viteConfig.name, content);
                        console.log(`   ✅ [Orchestrator] ${viteConfig.name} patched.`);
                    }
                }
            }

            // 2. Next.js Patch (support .js, .mjs, .ts)
            let nextConfigJS = await this.readFile(projectId, 'next.config.js');
            let nextConfigMJS = !nextConfigJS.success ? await this.readFile(projectId, 'next.config.mjs') : { success: false };
            let nextConfigTS = !nextConfigJS.success && !nextConfigMJS.success ? await this.readFile(projectId, 'next.config.ts') : { success: false };
            let nextConfig = nextConfigJS.success ? { name: 'next.config.js', content: nextConfigJS.content } :
                (nextConfigMJS.success ? { name: 'next.config.mjs', content: nextConfigMJS.content } :
                    (nextConfigTS.success ? { name: 'next.config.ts', content: nextConfigTS.content } : null));

            if (nextConfig && nextConfig.content) {
                let content = nextConfig.content;
                let needsWrite = false;

                // Patch 2a: Add allowedOrigins for Fly.io CORS
                if (!content.includes('allowedOrigins')) {
                    console.log(`   🔧 [Orchestrator] Patching ${nextConfig.name} for allowedOrigins...`);
                    if (content.includes('const nextConfig = {')) {
                        content = content.replace('const nextConfig = {', `const nextConfig = {\n  experimental: { allowedOrigins: ['drape-workspaces.fly.dev', '*.fly.dev'] },`);
                        needsWrite = true;
                    } else if (content.includes('module.exports = {')) {
                        content = content.replace('module.exports = {', `module.exports = {\n  experimental: { allowedOrigins: ['drape-workspaces.fly.dev', '*.fly.dev'] },`);
                        needsWrite = true;
                    } else if (content.includes('export default {')) {
                        content = content.replace('export default {', `export default {\n  experimental: { allowedOrigins: ['drape-workspaces.fly.dev', '*.fly.dev'] },`);
                        needsWrite = true;
                    }
                }

                // Patch 2b: Add turbopack.root for Next.js 16 (fixes App Router root inference bug)
                // This prevents Turbopack from confusing /app directory with project root
                if (!content.includes('turbopack:') && !content.includes('turbopack.root')) {
                    console.log(`   🔧 [Orchestrator] Patching ${nextConfig.name} for turbopack.root...`);
                    if (content.includes('const nextConfig = {')) {
                        content = content.replace('const nextConfig = {', `const nextConfig = {\n  turbopack: { root: '/home/coder/project' },`);
                        needsWrite = true;
                    } else if (content.includes('module.exports = {')) {
                        content = content.replace('module.exports = {', `module.exports = {\n  turbopack: { root: '/home/coder/project' },`);
                        needsWrite = true;
                    } else if (content.includes('export default {')) {
                        content = content.replace('export default {', `export default {\n  turbopack: { root: '/home/coder/project' },`);
                        needsWrite = true;
                    }
                }

                if (needsWrite) {
                    await this.writeFile(projectId, nextConfig.name, content);
                    console.log(`   ✅ [Orchestrator] ${nextConfig.name} patched.`);
                }
            }
        } catch (e) {
            console.warn(`   ⚠️ [Orchestrator] Config patch error for ${projectId}: ${e.message}`);
        }
    }

    /**
     * Legacy/Internal helper
     */
    async _detectProjectType(projectId) {
        const info = await this.detectProjectMetadata(projectId);
        return info.type;
    }


    /**
     * Stop all machines that don't belong to the current project
     * This ensures only one project's VM is active at a time (single-tenant mode)
     * Required because all VMs share the same public URL on Fly.io
     */
    async stopOtherMachines(currentProjectId, currentMachineId = null) {
        const machineName = `ws-${currentProjectId}`.substring(0, 30);

        // Use provided machineId if available (prevents race conditions during allocation)
        // Otherwise fallback to activeVMs lookup
        if (!currentMachineId) {
            const currentVM = activeVMs.get(currentProjectId);
            currentMachineId = currentVM?.machineId;
        }

        try {
            const machines = await flyService.listMachines();
            const startedMachines = machines.filter(m =>
                m.state === 'started' &&
                !m.name.startsWith('ws-pool-') &&
                m.name !== 'ws-cache-master'
            );

            // Allow up to 3 concurrent active project VMs
            const MAX_CONCURRENT_VMS = 3;
            if (startedMachines.length <= MAX_CONCURRENT_VMS) {
                return;
            }

            // If we have too many, stop the oldest ones (excluding current)
            const otherMachines = startedMachines
                .filter(m => m.id !== currentMachineId)
                .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

            const toStop = otherMachines.slice(0, startedMachines.length - MAX_CONCURRENT_VMS);

            if (toStop.length > 0) {
                console.log(`🛑 [Orchestrator] Concurrency limit reached. Stopping ${toStop.length} oldest VM(s)...`);
                for (const machine of toStop) {
                    try {
                        await flyService.stopMachine(machine.id);
                        // Also remove from cache
                        for (const [pid, vm] of activeVMs) {
                            if (vm.machineId === machine.id) {
                                activeVMs.delete(pid);
                            }
                        }
                    } catch (e) {
                        console.warn(`   ⚠️ Failed to stop machine ${machine.id}: ${e.message}`);
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

            // 1. Check if we already have an active VM for this project (HIGHEST PRIORITY)
            let cached = activeVMs.get(projectId);

            // If not in memory, try Redis (survives server restarts)
            if (!cached) {
                const persisted = await redisService.getVMSession(projectId);
                if (persisted) {
                    console.log(`♻️ [Orchestrator] Recovered VM session from Redis: ${persisted.machineId}`);
                    // Check if it's the right image VERSION before adopting
                    const savedImage = persisted.image;
                    if (savedImage && savedImage !== flyService.DRAPE_IMAGE) {
                        console.log(`⚠️ [Orchestrator] Recovered VM image outdated (saved): ${savedImage} !== ${flyService.DRAPE_IMAGE}. Skipping cache.`);
                        await redisService.removeVMSession(projectId);
                    } else if (!savedImage) {
                        // Legacy session without image field - verify via API
                        try {
                            const machine = await flyService.getMachine(persisted.machineId);
                            if (machine && machine.config?.image !== flyService.DRAPE_IMAGE) {
                                console.log(`⚠️ [Orchestrator] Recovered VM image outdated (API): ${machine.config?.image}. Skipping cache.`);
                                await redisService.removeVMSession(projectId);
                            } else {
                                // Update session with image info for future checks
                                persisted.image = machine?.config?.image || flyService.DRAPE_IMAGE;
                                cached = persisted;
                                activeVMs.set(projectId, cached);
                                await redisService.saveVMSession(projectId, cached);
                                // CRITICAL: Mark VM as allocated in pool manager to prevent cleanup from destroying it!
                                vmPoolManager.markVMAllocated(persisted.machineId, projectId);
                            }
                        } catch (e) {
                            console.warn(`   ⚠️ Status check for recovered VM failed: ${e.message}`);
                            await redisService.removeVMSession(projectId);
                        }
                    } else {
                        // Image matches - use cached session
                        console.log(`✅ [Orchestrator] Recovered VM image matches: ${savedImage}`);
                        cached = persisted;
                        activeVMs.set(projectId, cached);
                        // CRITICAL: Mark VM as allocated in pool manager to prevent cleanup from destroying it!
                        vmPoolManager.markVMAllocated(persisted.machineId, projectId);
                    }
                }
            }

            if (cached && !options.forceNew) {
                // Verify it's still alive on Fly.io
                try {
                    const machine = await flyService.getMachine(cached.machineId);
                    if (machine && machine.state !== 'destroyed' && machine.state !== 'destroying') {
                        console.log(`✅ [Orchestrator] Using existing active VM: ${cached.machineId}`);
                        this._scheduleCleanup(projectId);
                        return cached;
                    }
                } catch (e) {
                    console.log(`⚠️ [Orchestrator] Active VM verification failed: ${e.message}`);
                }

                // If we're here, cache was invalid
                activeVMs.delete(projectId);
                await redisService.removeVMSession(projectId);
                cached = null;
            }

            // 2. Try to get VM from pool first (FALLBACK for new sessions)
            let pooledVM = null;
            try {
                const poolStats = vmPoolManager.getStats();
                // Only check pool if there are available VMs
                if (poolStats.available === 0) {
                    console.log(`🐢 [Orchestrator] Pool empty (${poolStats.total} total, ${poolStats.allocated} allocated)`);
                    const error = new Error('Stiamo ricevendo tante richieste. Riprova tra qualche minuto!');
                    error.code = 'POOL_EXHAUSTED';
                    error.statusCode = 503;
                    throw error;
                }
                pooledVM = await vmPoolManager.allocateVM(projectId);
                if (pooledVM) {
                    const prewarmStatus = pooledVM.prewarmed ? '⚡ prewarmed' : '🔄 warming';
                    console.log(`⚡ [Orchestrator] Using VM from pool (${prewarmStatus}) (${Date.now() - startTime}ms)`);

                    const vmInfo = {
                        id: pooledVM.machineId,
                        name: `ws-${projectId}`.substring(0, 30),
                        agentUrl: pooledVM.agentUrl,
                        machineId: pooledVM.machineId,
                        projectId,
                        createdAt: Date.now(),
                        lastUsed: Date.now(),
                        fromPool: true,
                        prewarmed: pooledVM.prewarmed || false,
                        image: pooledVM.image || flyService.DRAPE_IMAGE // Track image version
                    };

                    // Cache it
                    activeVMs.set(projectId, vmInfo);
                    await redisService.saveVMSession(projectId, vmInfo);
                    this._scheduleCleanup(projectId);

                    // Ensure file watcher is running
                    try {
                        await fileWatcherService.startWatching(projectId, pooledVM.agentUrl, pooledVM.machineId);
                    } catch (e) {
                        console.warn(`⚠️ File watcher start failed: ${e.message}`);
                    }

                    return vmInfo;
                }
                // Pool returned null - throw error
                const error = new Error('Stiamo ricevendo tante richieste. Riprova tra qualche minuto!');
                error.code = 'POOL_EXHAUSTED';
                error.statusCode = 503;
                throw error;
            } catch (e) {
                // Re-throw POOL_EXHAUSTED errors to show user-friendly message
                if (e.code === 'POOL_EXHAUSTED') {
                    throw e;
                }
                console.log(`   Pool check failed: ${e.message}, trying cached/new VM...`);
            }


            // Create new MicroVM or adopt existing one
            // machineName already defined at start of function
            console.log(`📦 [Orchestrator] checking for existing VM: ${machineName}...`);

            let vm;
            let isFromPool = false; // FIX: Define outside if/else so it's available for all paths

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
                        // Quick health check with retry
                        let healthOk = false;
                        for (let attempt = 1; attempt <= 2; attempt++) {
                            try {
                                await axios.get(`${agentUrl}/health`, {
                                    timeout: 2000 + (attempt * 1000), // 3s, 4s
                                    headers: { 'Fly-Force-Instance-Id': existing.id } // FIX: consistent capitalization
                                });
                                healthOk = true;
                                break;
                            } catch (e) {
                                if (attempt < 2) {
                                    await new Promise(resolve => setTimeout(resolve, 500));
                                } else {
                                    throw e;
                                }
                            }
                        }

                        if (!healthOk) {
                            throw new Error("Health check failed");
                        }

                        console.log(`⚡ [Orchestrator] VM already running! Fast path. (${Date.now() - startTime}ms)`);

                        const vmInfo = {
                            id: existing.id,
                            name: existing.name,
                            agentUrl,
                            machineId: existing.id,
                            projectId,
                            createdAt: Date.now(),
                            lastUsed: Date.now(),
                            fromPool: false // Existing VM, not from pool
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
                        console.log(`   ⚠️ Health check failed: ${e.message}, will wait for agent...`);
                    }
                }

                // If stopped, start it
                if (vm && existing.state === 'stopped') {
                    console.log(`   🔄 Starting stopped machine...`);
                    await flyService.startMachine(existing.id);
                }
            } else {
                console.log(`📦 [Orchestrator] Creating new MicroVM...`);

                // Try to allocate from VM pool first (Phase 2.1: VM Pool)
                try {
                    const pooledVM = await vmPoolManager.allocateVM(projectId);
                    if (pooledVM) {
                        console.log(`⚡ [Orchestrator] Got VM from pool (instant!)`);
                        vm = {
                            id: pooledVM.machineId,
                            name: machineName, // Use project-specific name for tracking
                            state: 'started'
                        };
                        isFromPool = true; // FIX #2: Track pool VMs
                        // Skip creation, go directly to agent wait
                    }
                } catch (e) {
                    console.log(`   Pool allocation failed: ${e.message}, creating new VM with persistent volume...`);
                }

                // If pool didn't work, create VM with persistent volume
                if (!vm) {
                    console.log(`💾 [Orchestrator] Pool exhausted, creating VM with persistent volume...`);

                    try {
                        // Detect memory requirements
                        const memoryMb = await this._detectMemoryRequirements(projectId);

                        // Detect project type for image
                        const projectType = await this._detectProjectType(projectId);
                        const dockerImage = flyService.getImageForProject(projectType);

                        // Create VM with persistent volume
                        const result = await flyService.createVMWithVolume(projectId, {
                            image: dockerImage,
                            memory_mb: memoryMb,
                            cpus: 2
                        });

                        vm = result.machine;
                        isFromPool = false;

                        console.log(`   ✅ VM created with persistent volume: ${vm.id}`);

                    } catch (createError) {
                        console.error(`   ❌ VM creation failed: ${createError.message}`);
                        const error = new Error('Impossibile creare workspace. Riprova tra qualche minuto.');
                        error.code = 'VM_CREATION_FAILED';
                        error.statusCode = 503;
                        throw error;
                    }
                }

                // DISABLED: Cold-start VM creation (keeping code for reference)
                if (false) {
                    // Auto-detect memory requirements based on project
                    const memoryMb = await this._detectMemoryRequirements(projectId);

                    // Auto-detect project type to select Docker image
                    const projectType = await this._detectProjectType(projectId);
                    const dockerImage = flyService.getImageForProject(projectType);

                    // HOLY GRAIL: Shared Global Volume (10GB)
                    // All projects share the same pnpm store - first project downloads deps,
                    // all subsequent projects get near-instant installs (~2s)
                    let mounts = [];
                    try {
                        const SHARED_VOLUME_NAME = 'drape_global_store';
                        const SHARED_VOLUME_SIZE = 10; // 10GB for all deps

                        const volumes = await flyService.listVolumes();
                        let globalVolume = volumes.find(v => v.name === SHARED_VOLUME_NAME && v.region === flyService.FLY_REGION);

                        if (!globalVolume) {
                            console.log(`📦 [Orchestrator] Creating shared global volume (${SHARED_VOLUME_SIZE}GB)...`);
                            globalVolume = await flyService.createVolume(SHARED_VOLUME_NAME, flyService.FLY_REGION, SHARED_VOLUME_SIZE);
                        }

                        if (globalVolume) {
                            mounts.push({
                                volume: globalVolume.id,
                                path: '/home/coder/volumes' // Shared: pnpm-store + next-cache subdirs
                            });
                            console.log(`   ✅ Using shared global volume: ${globalVolume.id}`);
                        }
                    } catch (e) {
                        console.warn(`   ⚠️ Volume orchestration failed: ${e.message}`);
                    }

                    vm = await flyService.createMachine(projectId, {
                        memory_mb: memoryMb,
                        image: dockerImage,
                        auto_destroy: mounts.length > 0 ? false : true, // Keep machine if it has volume (faster restart)
                        mounts,
                        env: {
                            PROJECT_ID: projectId,
                            // HOLY GRAIL: Memory tuning
                            NODE_OPTIONS: '--max-old-space-size=3072',
                            NEXT_TELEMETRY_DISABLED: '1',
                            // HOLY GRAIL: Parallelism cap (prevent CPU saturation on MicroVMs)
                            NEXT_WEBPACK_WORKERS: '2',
                            UV_THREADPOOL_SIZE: '4',
                            // HOLY GRAIL: pnpm global store path
                            PNPM_HOME: '/home/coder/.local/share/pnpm'
                        }
                    });
                } // END of if (false) - DISABLED cold-start
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
                lastUsed: Date.now(),
                fromPool: isFromPool, // FIX #2: Track if VM came from pool
                image: vm.config?.image || flyService.DRAPE_IMAGE // Store image for version check
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
     * @param {function} onProgress - Optional progress callback (step, message)
     */
    async startPreview(projectId, projectInfo, onProgress = null) {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`🚀 [DEBUG] START PREVIEW for ${projectId}`);
        console.log(`${'='.repeat(60)}`);
        console.log(`   📋 projectInfo:`, JSON.stringify(projectInfo, null, 2));

        // CRITICAL: Get/Create VM FIRST, then stop others
        // This ensures we don't stop the VM we just allocated from the pool
        const vm = await this.getOrCreateVM(projectId);

        // === DEBUG: Check VM initial state ===
        console.log(`\n🔍 [DEBUG] VM INITIAL STATE CHECK for ${vm.machineId}`);
        try {
            const debugCmd = `
echo "=== VM DEBUG INFO ==="
echo "📅 Current time: $(date)"
echo ""
echo "=== PROCESSES ==="
ps aux | grep -E "(node|pnpm|npm|next|vite)" | grep -v grep || echo "No node/npm/pnpm processes"
echo ""
echo "=== PORT 3000 ==="
fuser 3000/tcp 2>/dev/null && echo "Port 3000 is IN USE" || echo "Port 3000 is FREE"
echo ""
echo "=== PROJECT FOLDER ==="
ls -la /home/coder/project/ 2>/dev/null | head -20 || echo "Project folder empty or not exists"
echo ""
echo "=== NODE_MODULES ==="
if [ -d /home/coder/project/node_modules ]; then
  echo "node_modules EXISTS"
  echo "Package count: $(ls /home/coder/project/node_modules 2>/dev/null | wc -l)"
  echo "Size: $(du -sh /home/coder/project/node_modules 2>/dev/null | cut -f1)"
else
  echo "node_modules DOES NOT EXIST"
fi
echo ""
echo "=== PACKAGE.JSON HASH ==="
cat /home/coder/project/.package-json-hash 2>/dev/null || echo "No hash file"
echo ""
echo "=== DISK SPACE ==="
df -h /home/coder | tail -1
echo ""
echo "=== MEMORY ==="
free -m | head -2
echo "=== END DEBUG ==="
            `.trim();
            const debugResult = await flyService.exec(vm.agentUrl, debugCmd, '/home/coder', vm.machineId, 15000, true);
            console.log(debugResult.stdout || '(no output)');
        } catch (e) {
            console.log(`   ⚠️ Debug check failed: ${e.message}`);
        }
        console.log(`${'='.repeat(60)}\n`);

        // CRITICAL: Update lastUsed to prevent idle cleanup during long operations
        // This resets the 15-minute idle timer
        const vmSession = await redisService.getVMSession(projectId);
        if (vmSession) {
            vmSession.lastUsed = Date.now();
            await redisService.saveVMSession(projectId, vmSession);
            console.log(`⏰ [Orchestrator] Reset idle timer for ${projectId}`);
        }

        // CRITICAL: Stop all other VMs to ensure correct routing
        // Pass the current VM's machineId to avoid race conditions
        await this.stopOtherMachines(projectId, vm.machineId);

        // CRITICAL: Wait for any background warming to complete before cleaning/syncing
        // This prevents race conditions where we delete files while background install is running
        let hadBackgroundWarming = false;
        if (setupLocks.has(projectId)) {
            console.log(`🔒 [Orchestrator] Waiting for background warming to complete...`);
            await setupLocks.get(projectId);
            hadBackgroundWarming = true;
            console.log(`   ✅ Background warming complete - skipping clean/sync (files already fresh)`);
        }

        // CRITICAL: Only clean and sync if background warming didn't just complete
        // Background warming already synced files and installed deps, so re-syncing would delete them
        let syncResult;
        if (!hadBackgroundWarming) {
            // CRITICAL: Clean project folder before sync but PRESERVE node_modules and .git for speed
            console.log(`🧹 [Orchestrator] Cleaning project folder on VM (preserving node_modules)...`);
            try {
                const cleanCmd = `find /home/coder/project -mindepth 1 -maxdepth 1 -not -name 'node_modules' -not -name '.git' -not -name '.package-json-hash' -exec rm -rf {} +`;
                await flyService.exec(vm.agentUrl, cleanCmd, '/home/coder', vm.machineId);
                console.log(`   ✅ Project folder cleaned (node_modules preserved)`);
            } catch (e) {
                console.warn(`   ⚠️ Cleanup failed: ${e.message}`);
            }

            // HOLY GRAIL: VM Hardening (Swap + Volume Prep + Logs)
            await this.hardenVM(projectId, vm.agentUrl, vm.machineId);

            // Sync files from storage to VM
            console.log(`📂 [Orchestrator] Syncing files to VM...`);
            syncResult = await storageService.syncToVM(projectId, vm.agentUrl, vm.machineId);
            console.log(`   Sync result: ${syncResult.syncedCount} files synced`);
        } else {
            console.log(`⚡ [Orchestrator] Skipping clean/sync - using warm VM with existing files`);
            // Fake a successful sync result for warm VM
            syncResult = { syncedCount: 65, success: true };
        }

        // HOLY GRAIL: Link Next.js cache to volume
        try {
            const linkCacheCmd = `
                mkdir -p /home/coder/project/.next
                ln -snf /home/coder/volumes/next-cache /home/coder/project/.next/cache
                chown -R coder:coder /home/coder/project/.next
            `.replace(/\s+/g, ' ').trim();
            await flyService.exec(vm.agentUrl, linkCacheCmd, '/home/coder', vm.machineId, 10000);
        } catch (e) { }

        // OPTIMIZATION: Skip file integrity check if we used warm VM or tar.gz sync succeeded
        // The tar.gz sync is atomic and reliable - verification is redundant and slow (35s)
        if (!hadBackgroundWarming && (syncResult.syncedCount === 0 || syncResult.error)) {
            // Only verify if sync had issues
            console.log(`🔍 [Orchestrator] Verifying file integrity on VM (sync had issues)...`);
            try {
                // Fast check: just count files instead of listing them all
                const countResult = await flyService.exec(
                    vm.agentUrl,
                    'find . -type f -not -path "*/node_modules/*" -not -path "*/.git/*" | wc -l',
                    '/home/coder/project',
                    vm.machineId,
                    10000
                );
                const vmFileCount = parseInt(countResult.stdout.trim()) || 0;

                // Get expected count from storage
                const { files: storageFiles } = await storageService.listFiles(projectId);
                const expectedCount = storageFiles.length;

                if (vmFileCount >= expectedCount * 0.9) { // 90% threshold
                    console.log(`✅ [Orchestrator] File count OK: ${vmFileCount}/${expectedCount} files`);
                } else {
                    console.warn(`⚠️ [Orchestrator] File count mismatch: ${vmFileCount}/${expectedCount}, triggering full resync...`);
                    await storageService.syncToVM(projectId, vm.agentUrl, vm.machineId);
                }
            } catch (error) {
                console.warn(`⚠️ [Orchestrator] Integrity check warning: ${error.message}`);
            }
        } else {
            console.log(`✅ [Orchestrator] File integrity verified. All files present.`);
        }

        // CRITICAL FIX: Only force-restore package.json if we didn't use warm VM
        // If background warming just completed, package.json is already fresh from install
        if (!hadBackgroundWarming) {
            try {
                console.log('🔨 [Orchestrator] Force-restoring package.json...');
                const mkPkg = await storageService.readFile(projectId, 'package.json');
                if (mkPkg.success) {
                    await axios.post(`${vm.agentUrl}/file`, {
                        path: 'package.json',
                        content: mkPkg.content
                    }, { headers: { 'Fly-Force-Instance-Id': vm.machineId } });
                    console.log('   ✅ Restored package.json');
                } else {
                    console.error('   ❌ Could not read package.json from storage');
                }
            } catch (e) {
                console.warn('   ⚠️ Failed to restore package.json:', e.message);
            }
        } else {
            console.log('⚡ [Orchestrator] Skipping package.json restore - using version from warm VM');
        }

        // Setup (Install + Start) via Optimized pnpm (Async)
        if (projectInfo.installCommand || projectInfo.startCommand) {
            // Check if workspace was already prepared in background
            const vmSession = await redisService.getVMSession(projectId);
            const isPrepared = vmSession?.preparedAt && (Date.now() - vmSession.preparedAt) < 300000; // 5 min validity

            if (isPrepared && !hadBackgroundWarming) {
                console.log(`⚡ [Orchestrator] Workspace already prepared! Skipping install, starting server directly...`);

                // Just start the dev server (staySilent=false, but we'll call only the start portion)
                // We need to call optimizedSetup but tell it to skip install
                // For now, let's call it normally - optimizedSetup will detect existing node_modules and skip
                await this.optimizedSetup(projectId, vm.agentUrl, vm.machineId, projectInfo, onProgress, false);
            } else {
                // Use optimized setup with pnpm (pass progress callback)
                // Don't catch errors - let them propagate to the caller
                await this.optimizedSetup(projectId, vm.agentUrl, vm.machineId, projectInfo, onProgress);
            }

            // Start log streaming
            this.startLogStreaming(projectId, vm);
        }


        // Construct preview URL
        const previewUrl = `${vm.agentUrl}`;

        return {
            success: true,
            machineId: vm.machineId,
            previewUrl: `https://${process.env.FLY_APP_NAME}.fly.dev`,
            agentUrl: `https://${process.env.FLY_APP_NAME}.fly.dev`,
            projectType: projectInfo.description || projectInfo.type,
            port: projectInfo.port,
            isHolyGrail: true // Metadata for UI
        };
    }

    /**
     * Prepare workspace in background (install deps but don't start server)
     * Called when user selects/opens a project to give installation a head start
     * @param {string} projectId - Project ID
     * @param {object} projectInfo - Project metadata
     * @param {function} onProgress - Optional progress callback (step, message)
     * @returns {object} Result with preparation status
     */
    async prepareWorkspace(projectId, projectInfo, onProgress = null) {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`🚀 [DEBUG] PREPARE WORKSPACE (Background) for ${projectId}`);
        console.log(`${'='.repeat(60)}`);

        try {
            // CRITICAL: Get/Create VM FIRST
            const vm = await this.getOrCreateVM(projectId);

            // Update lastUsed to prevent idle cleanup
            const vmSession = await redisService.getVMSession(projectId);
            if (vmSession) {
                vmSession.lastUsed = Date.now();
                vmSession.preparingInBackground = true; // Mark as preparing
                await redisService.saveVMSession(projectId, vmSession);
            }

            // Stop other VMs to ensure correct routing
            await this.stopOtherMachines(projectId, vm.machineId);

            // Check if already preparing/prepared
            if (setupLocks.has(projectId)) {
                console.log(`⚡ [Orchestrator] Workspace already being prepared, skipping...`);
                return { success: true, status: 'already_preparing', machineId: vm.machineId };
            }

            // Clean project folder (preserve node_modules and .git)
            console.log(`🧹 [Orchestrator] Cleaning project folder on VM...`);
            try {
                const cleanCmd = `find /home/coder/project -mindepth 1 -maxdepth 1 -not -name 'node_modules' -not -name '.git' -not -name '.package-json-hash' -exec rm -rf {} +`;
                await flyService.exec(vm.agentUrl, cleanCmd, '/home/coder', vm.machineId);
                console.log(`   ✅ Project folder cleaned`);
            } catch (e) {
                console.warn(`   ⚠️ Cleanup failed: ${e.message}`);
            }

            // Harden VM
            await this.hardenVM(projectId, vm.agentUrl, vm.machineId);

            // Sync files from storage to VM
            console.log(`📂 [Orchestrator] Syncing files to VM...`);
            const syncResult = await storageService.syncToVM(projectId, vm.agentUrl, vm.machineId);
            console.log(`   Sync result: ${syncResult.syncedCount} files synced`);

            // Link Next.js cache to volume
            try {
                const linkCacheCmd = `mkdir -p /home/coder/project/.next && ln -snf /home/coder/volumes/next-cache /home/coder/project/.next/cache && chown -R coder:coder /home/coder/project/.next`.replace(/\s+/g, ' ').trim();
                await flyService.exec(vm.agentUrl, linkCacheCmd, '/home/coder', vm.machineId, 10000);
            } catch (e) { }

            // Force-restore package.json
            try {
                console.log('🔨 [Orchestrator] Force-restoring package.json...');
                const mkPkg = await storageService.readFile(projectId, 'package.json');
                if (mkPkg.success) {
                    await axios.post(`${vm.agentUrl}/file`, {
                        path: 'package.json',
                        content: mkPkg.content
                    }, { headers: { 'Fly-Force-Instance-Id': vm.machineId } });
                    console.log('   ✅ Restored package.json');
                }
            } catch (e) {
                console.warn('   ⚠️ Failed to restore package.json:', e.message);
            }

            // Install dependencies (staySilent=true means NO dev server start)
            if (projectInfo.installCommand || projectInfo.startCommand) {
                console.log(`📦 [Orchestrator] Installing dependencies in background...`);
                await this.optimizedSetup(projectId, vm.agentUrl, vm.machineId, projectInfo, onProgress, true);
                console.log(`✅ [Orchestrator] Background installation complete!`);
            }

            // Mark workspace as prepared
            if (vmSession) {
                vmSession.preparingInBackground = false;
                vmSession.preparedAt = Date.now();
                await redisService.saveVMSession(projectId, vmSession);
            }

            console.log(`${'='.repeat(60)}\n`);

            return {
                success: true,
                status: 'prepared',
                machineId: vm.machineId,
                agentUrl: vm.agentUrl
            };

        } catch (error) {
            console.error('❌ Prepare workspace failed:', error);

            // Clear preparing flag on error
            const vmSession = await redisService.getVMSession(projectId);
            if (vmSession) {
                vmSession.preparingInBackground = false;
                await redisService.saveVMSession(projectId, vmSession);
            }

            return {
                success: false,
                status: 'error',
                error: error.message
            };
        }
    }

    /**
     * VM Hardening: Create swap space and prepare project directories
     */
    async hardenVM(projectId, agentUrl, machineId) {
        const startTime = Date.now();
        console.log(`🛡️ [Orchestrator] Hardening VM ${machineId}...`);
        const hardenCmd = `
            # 1. Create Swap Space (2GB) for OOM protection
            if [ ! -f /swapfile ]; then
                echo "🔧 Creating 2GB swap file..."
                fallocate -l 2G /swapfile
                chmod 600 /swapfile
                mkswap /swapfile
                swapon /swapfile
                echo "✅ Swap active"
            fi

            # 2. Prepare Project Directories & Volume Links
            mkdir -p /home/coder/project
            mkdir -p /home/coder/volumes/pnpm-store
            mkdir -p /home/coder/volumes/next-cache
            touch /home/coder/server.log

            # 3. Link pnpm store to volume for persistence
            if [ -d /home/coder/volumes/pnpm-store ]; then
                mkdir -p /home/coder/.local/share/pnpm
                ln -snf /home/coder/volumes/pnpm-store /home/coder/.local/share/pnpm/store
            fi

            # 4. Permissions (Robust: Ensure coder owns everything in project)
            # Ensure coder owns all volumes and log files
            chown coder:coder /home/coder/server.log /home/coder/volumes 2>/dev/null || true
            
            # Recursive chown on project is necessary for correct tool behavior
            # We avoid Volumes recursion but Project recursion is required.
            chown -R coder:coder /home/coder/project 2>/dev/null || true
        `.replace(/\s+/g, ' ').trim();

        try {
            await flyService.exec(agentUrl, hardenCmd, '/home/coder', machineId, 30000);
            console.log(`   ✅ VM Hardening complete (${Date.now() - startTime}ms)`);
        } catch (e) {
            console.warn(`   ⚠️ VM Hardening warning: ${e.message}`);
        }
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
     * Release a project's VM back to the pool (for project switching)
     * Lighter than stopVM - stops dev server, cleans files, releases VM to pool
     * @param {string} projectId - Project ID
     */
    async releaseProjectVM(projectId) {
        const cached = activeVMs.get(projectId);
        if (!cached) {
            console.log(`ℹ️ [Orchestrator] No active VM for ${projectId}`);
            return { success: true, message: 'No active VM' };
        }

        try {
            console.log(`🔄 [Orchestrator] Releasing VM for project ${projectId}`);

            // HARDENED SAFETY: Check if this VM is a cache master
            const isCacheMaster = vmPoolManager.isProtectedCacheMaster
                ? vmPoolManager.isProtectedCacheMaster(cached.machineId)
                : vmPoolManager.pool?.some(vm => vm.machineId === cached.machineId && vm.isCacheMaster);

            if (isCacheMaster) {
                console.log(`🛡️ [Orchestrator] Skipping release for cache master ${cached.machineId}`);
                activeVMs.delete(projectId);
                await redisService.removeVMSession(projectId);
                return { success: true, message: 'Cache master protected' };
            }

            // 1. Stop dev server
            console.log(`   🛑 Stopping dev server on port 3000...`);
            try {
                await flyService.exec(
                    cached.agentUrl,
                    'fuser -k 3000/tcp 2>/dev/null || true; pkill -9 -f "next-server" || true; pkill -9 -f "vite" || true',
                    '/home/coder',
                    cached.machineId,
                    10000,
                    true
                );
            } catch (e) {
                console.warn(`⚠️ [Orchestrator] Failed to stop dev server: ${e.message}`);
            }

            // 2. Release VM back to pool (cleans files, preserves cache)
            const isPoolVM = cached.fromPool === true;
            if (isPoolVM) {
                console.log(`♻️ [Orchestrator] Releasing VM ${cached.machineId} back to pool`);
                await vmPoolManager.releaseVM(cached.machineId, true); // Keep node_modules
            } else {
                console.log(`🗑️ [Orchestrator] Non-pool VM ${cached.machineId}, destroying`);
                await flyService.destroyMachine(cached.id);
            }

            // 3. Remove from active sessions
            activeVMs.delete(projectId);
            await redisService.removeVMSession(projectId);

            console.log(`✅ [Orchestrator] Released VM ${cached.machineId} from project ${projectId}`);
            return { success: true, released: isPoolVM, machineId: cached.machineId };
        } catch (error) {
            console.error(`❌ [Orchestrator] Release failed:`, error.message);
            return { success: false, error: error.message };
        }
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
            console.log(`⏹️ [Orchestrator] Stopping preview for ${projectId}`);

            // HARDENED SAFETY: Check if this VM is a cache master (NEVER destroy cache masters!)
            // Use multi-layer protection from vmPoolManager
            const isCacheMaster = vmPoolManager.isProtectedCacheMaster
                ? vmPoolManager.isProtectedCacheMaster(cached.machineId)
                : vmPoolManager.pool?.some(vm => vm.machineId === cached.machineId && vm.isCacheMaster);
            if (isCacheMaster) {
                console.log(`🛡️ [Orchestrator] Skipping stopVM for cache master ${cached.machineId}`);
                activeVMs.delete(projectId);
                await redisService.removeVMSession(projectId);
                return { success: true, message: 'Cache master protected' };
            }

            // Check if this VM is tracked by the pool
            const isPoolVM = cached.fromPool === true;

            if (isPoolVM) {
                // Release back to pool instead of destroying (FIX #1)
                console.log(`♻️ [Orchestrator] Releasing VM ${cached.machineId} back to pool`);
                await vmPoolManager.releaseVM(cached.machineId, true); // Keep node_modules
            } else {
                // Non-pool VM, destroy it
                console.log(`🗑️ [Orchestrator] Destroying non-pool VM ${cached.machineId}`);
                await flyService.destroyMachine(cached.id);
            }

            // Remove from active VMs
            activeVMs.delete(projectId);
            await redisService.removeVMSession(projectId);

            return { success: true, released: isPoolVM };
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
     * Broadcasts session_expired event to notify frontend clients before cleanup
     */
    _scheduleCleanup(projectId) {
        setTimeout(async () => {
            const cached = await redisService.getVMSession(projectId);
            if (!cached) return;

            const idleTime = Date.now() - cached.lastUsed;
            if (idleTime > this.vmTimeout) {
                console.log(`🧹 [Orchestrator] Cleaning up idle VM for ${projectId}`);

                // Notify frontend clients that session is being released due to inactivity
                serverLogService.broadcastEvent(projectId, 'session_expired', {
                    reason: 'idle_timeout',
                    message: 'Sessione terminata per inattività',
                    machineId: cached.machineId
                });

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
                // Only care about started workspace machines (skip pool machines and ALL cache masters, managed by VMPoolManager)
                // FIX: Skip ALL ws-cache-* machines, not just 'ws-cache-master'
                if (!machine.name.startsWith('ws-') || machine.name.startsWith('ws-pool-') || machine.name.startsWith('ws-cache-') || machine.state !== 'started') continue;

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

                    // HYDRATION FIX: Make sure it's in our in-memory map!
                    activeVMs.set(session.projectId, session);
                    // Also restart stream if needed
                    if (!this.logStreams?.has(session.projectId)) {
                        this.startLogStreaming(session.projectId, session);
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
                        lastUsed: now, // Give it a fresh lease on life since we just adopted it (maybe user just connected)
                        image: machine.config?.image || flyService.DRAPE_IMAGE // Track image version
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
     * @param {function} onProgress - Optional progress callback (step, message)
     * @param {boolean} staySilent - If true, only install deps, don't start server (for pre-warming)
     * @returns {object} Result
     */
    async optimizedSetup(projectId, agentUrl, machineId, projectInfo, onProgress = null, staySilent = false) {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`🔧 [DEBUG] OPTIMIZED SETUP for ${projectId}`);
        console.log(`${'='.repeat(60)}`);
        console.log(`   📋 machineId: ${machineId}`);
        console.log(`   📋 staySilent: ${staySilent}`);
        console.log(`   📋 projectInfo:`, JSON.stringify(projectInfo, null, 2));

        // CRITICAL: Skip installation for static HTML projects (no package.json)
        if (projectInfo.type === 'static') {
            console.log(`   ⚡ Static HTML project - SKIP INSTALLATION!`);
            console.log(`   📂 Files already synced, starting server directly...`);

            if (onProgress) onProgress('install', '✅ Sito HTML statico - nessuna installazione necessaria');

            // For static projects, start the http server directly
            if (staySilent) {
                console.log(`   ⏭️ staySilent = true: Skipping http-server start`);
                return {
                    success: true,
                    skipInstall: true,
                    static: true,
                    serverReady: false,
                    message: 'Static HTML project - no installation needed'
                };
            }

            // Start http-server for static files
            console.log(`   🚀 Starting static file server...`);
            if (onProgress) onProgress('starting', 'Avvio del server HTTP...');

            const finalStart = projectInfo.startCommand || 'npx http-server . -p 3000 -a 0.0.0.0';

            // Kill any existing process on port 3000
            console.log(`   🔪 Killing any process on port 3000...`);
            await flyService.exec(agentUrl, 'fuser -k 3000/tcp 2>/dev/null || true', '/home/coder/project', machineId, 15000, true);

            // Create startup script for http-server
            const startupScript = `/home/coder/start-server.sh`;
            const startupScriptContent = `#!/bin/bash
cd /home/coder/project || exit 1

# Kill any existing http-server processes
pkill -9 -f "http-server" || true
fuser -k 3000/tcp 2>/dev/null || true
sleep 1

# Start http-server in background and DETACH from parent process
nohup ${finalStart} > /home/coder/server.log 2>&1 &
disown
echo "HTTP server started in background"`;

            console.log(`\n   📝 [DEBUG] HTTP-SERVER STARTUP SCRIPT:\n${'─'.repeat(40)}\n${startupScriptContent}\n${'─'.repeat(40)}`);

            await flyService.exec(agentUrl, `cat > ${startupScript} << 'EOFSCRIPT'
${startupScriptContent}
EOFSCRIPT
chmod +x ${startupScript}`, '/home/coder', machineId, 10000, true);

            // Execute startup script
            try {
                await flyService.exec(agentUrl, startupScript, '/home/coder', machineId, 10000, true);
                console.log(`   ✅ HTTP server script triggered successfully`);
            } catch (execErr) {
                if (execErr.code === 'ECONNABORTED' || execErr.message?.includes('timeout') || execErr.message?.includes('socket hang up')) {
                    console.log(`   ⏱️ Exec timeout/hangup (expected) - server starting in background...`);
                } else {
                    throw execErr;
                }
            }

            // Wait for server to initialize
            await new Promise(r => setTimeout(r, 2000));

            // Health check for http-server (shorter timeout for static content)
            const isReady = await this.waitForDevServer(agentUrl, machineId, 30000);

            if (!isReady) {
                const logs = await flyService.exec(agentUrl, 'tail -n 30 /home/coder/server.log', '/home/coder', machineId, 5000, true);
                console.error(`❌[Health Check] HTTP server failed! Last logs: \n${logs.stdout}`);
                throw new Error(`HTTP server failed to start. Check project logs.`);
            }

            console.log(`   ✅ HTTP server is ready and responding`);
            return {
                success: true,
                skipInstall: true,
                static: true,
                serverReady: true,
                message: 'Static HTML project - http-server started'
            };
        }

        // === LOCK: Prevent parallel setup for same project ===
        while (setupLocks.has(projectId)) {
            console.log(`🔒 [Orchestrator] Waiting for setup lock on ${projectId}...`);
            await setupLocks.get(projectId);
        }
        let resolveLock;
        const lockPromise = new Promise(r => { resolveLock = r; });
        setupLocks.set(projectId, lockPromise);

        try {
            const axios = require('axios');
            const headers = machineId ? { 'Fly-Force-Instance-Id': machineId } : {};
            const cacheService = require('./node-modules-cache-service');

            // === STEP 1: LIVELLO 1 - Controlla node_modules esistente (Persistent Workspace) ===
            console.log(`\n🔍 [Setup] Step 1: Checking for existing node_modules (LIVELLO 1)...`);

            const checkNodeModulesCmd = 'test -d /home/coder/project/node_modules && ls /home/coder/project/node_modules 2>/dev/null | wc -l';
            const checkResult = await flyService.exec(agentUrl, checkNodeModulesCmd, '/home/coder/project', machineId, 10000, true);

            const packageCount = parseInt(checkResult.stdout?.trim() || '0');

            if (packageCount > 50) {
                // node_modules esiste e sembra valido!
                console.log(`   ✅ [Setup] node_modules already exists (${packageCount} packages)`);
                console.log(`   ⚡ LIVELLO 1: Persistent Workspace - SKIP INSTALL!`);

                if (onProgress) onProgress('install', '✅ Dipendenze già installate (persistent workspace)');

                // Vai direttamente a start server
                if (!staySilent && projectInfo.startCommand) {
                    console.log(`   🚀 Starting dev server...`);
                    // Start server code viene dopo
                    // Per ora ritorna success
                }

                return {
                    success: true,
                    skipInstall: true,
                    level: 1,
                    persistent: true,
                    message: 'Using persistent node_modules'
                };
            }

            console.log(`   ❌ [Setup] node_modules not found or incomplete (${packageCount} packages)`);

            // === STEP 2: LIVELLO 2 - Prova cache node_modules tarball ===
            console.log(`\n♻️ [Setup] Step 2: Trying node_modules cache (LIVELLO 2)...`);

            try {
                const hash = await cacheService.calculateHash(projectId);
                const cacheExists = await cacheService.exists(hash);

                if (cacheExists) {
                    console.log(`   ✨ [Setup] Cache found! (hash: ${hash})`);
                    console.log(`   ⚡ LIVELLO 2: Restoring from tarball cache...`);

                    if (onProgress) onProgress('install', '♻️ Ripristino dipendenze dalla cache...');

                    const restoreResult = await cacheService.restore(hash, agentUrl, machineId);

                    if (restoreResult.success) {
                        console.log(`   ✅ [Setup] Cache restored in ${restoreResult.elapsed}ms`);

                        // Vai a start server
                        if (!staySilent && projectInfo.startCommand) {
                            console.log(`   🚀 Starting dev server...`);
                            // Start server code viene dopo
                        }

                        return {
                            success: true,
                            fromCache: true,
                            level: 2,
                            elapsed: restoreResult.elapsed,
                            hash,
                            message: 'Restored from cache'
                        };
                    } else {
                        console.log(`   ⚠️ [Setup] Cache restore failed, falling back to install`);
                    }
                } else {
                    console.log(`   ❌ [Setup] Cache not found for hash ${hash}`);
                }

            } catch (cacheError) {
                console.log(`   ⚠️ [Setup] Cache check failed: ${cacheError.message}`);
            }

            // === STEP 3: LIVELLO 3 - Install da zero con mega-cache ===
            console.log(`\n📦 [Setup] Step 3: Installing with mega-cache (LIVELLO 3)...`);

            if (onProgress) onProgress('install', '📦 Installazione dipendenze (prima volta)...');

            // Auto-detect package manager from lock files
            const filesResult = await this.listFiles(projectId);
            const fileNames = filesResult.files.map(f => f.path);



            let installCmd;
            let pkgManager = 'pnpm'; // HOLY GRAIL: pnpm is now MANDATORY for all projects (faster + global store)
            // CI=true prevents pnpm from asking for TTY confirmation when removing/replacing node_modules
            // CRITICAL: Pass --store-dir directly to pnpm install (more reliable than pnpm config set)
            // This ensures pnpm uses the prewarmed cache immediately without config persistence issues
            // HOLY GRAIL: Use --offline first to force using ONLY cached packages (no network = fast)
            // If cache is missing something, the install script has automatic fallback to --prefer-offline
            installCmd = 'mkdir -p /home/coder/volumes/pnpm-store /home/coder/.local/share/pnpm && ln -snf /home/coder/volumes/pnpm-store /home/coder/.local/share/pnpm/store && CI=true pnpm install --store-dir /home/coder/volumes/pnpm-store --offline';

            if (fileNames.includes('pnpm-lock.yaml')) {
                installCmd += ' --frozen-lockfile';
                console.log('   ⚡ Using pnpm --offline with fallback (detected pnpm-lock.yaml)');
            } else if (fileNames.includes('yarn.lock') || fileNames.includes('package-lock.json')) {
                console.log(`   ⚡ Using pnpm --offline with fallback (converted from ${fileNames.includes('yarn.lock') ? 'yarn' : 'npm'})`);
            } else {
                console.log('   ⚡ Using pnpm --offline with fallback (default - leverages global store)');
            }

            // Note: build cache disabled (Fly.io supports only 1 volume per machine)
            // Using pnpm cache which provides bigger performance gain
            const cacheCmd = 'true';

            // Get start command using detected package manager
            // For Next.js, use direct path to binary (npm run dev has PATH issues on VMs)
            let defaultStart = `${pkgManager} run dev -- --host 0.0.0.0 --port 3000`;

            // Check if this is a Next.js project by reading package.json
            // Use longer timeout (60s) and retry - VM might be busy with cache extraction
            let pkgJsonResult = null;
            for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                    pkgJsonResult = await flyService.exec(agentUrl, 'cat /home/coder/project/package.json', '/home/coder/project', machineId, 60000, true);
                    break;
                } catch (readErr) {
                    if (attempt < 3 && (readErr.code === 'ECONNABORTED' || readErr.message?.includes('timeout'))) {
                        console.log(`   ⏱️ package.json read attempt ${attempt}/3 timed out, retrying...`);
                        await new Promise(r => setTimeout(r, 2000));
                    } else {
                        throw readErr;
                    }
                }
            }
            if (pkgJsonResult && pkgJsonResult.stdout) {
                try {
                    const pkg = JSON.parse(pkgJsonResult.stdout);
                    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
                    if (deps.next) {
                        // Use npx for Next.js - works even with temporary symlinks from failed npm install
                        // npm install can fail with exit code 1 and create .next-XXXXX instead of next
                        // Use -H 0.0.0.0 for binding (Next.js specific)
                        projectInfo.type = 'nextjs'; // Tag it for later logic

                        // Check Next.js version - disable Turbopack for 16.0-16.1 (crash bugs)
                        const nextVersion = deps.next;
                        const versionMatch = nextVersion.match(/(\d+)\.(\d+)/);
                        const major = versionMatch ? parseInt(versionMatch[1]) : 0;
                        const minor = versionMatch ? parseInt(versionMatch[2]) : 0;

                        if (major === 16 && minor <= 1) {
                            // Next.js 16.0-16.1 - use Webpack (default, Turbopack is opt-in with --turbo)
                            // No --no-turbo flag needed, Webpack is already the default
                            defaultStart = `npx next dev -H 0.0.0.0 --port 3000`;
                            // CRITICAL: Override startCommand to ensure runtime detection takes precedence
                            projectInfo.startCommand = defaultStart;
                            console.log(`   🎯 Detected Next.js ${major}.${minor} - using Webpack (default mode)`);
                        } else {
                            // HOLY GRAIL: Enable Turbopack for stable versions
                            defaultStart = `npx next dev --turbo -H 0.0.0.0 --port 3000`;
                            // CRITICAL: Override startCommand to ensure runtime detection takes precedence
                            projectInfo.startCommand = defaultStart;
                            console.log(`   🎯 Detected Next.js - using Turbopack ⚡`);
                        }
                    }
                } catch (e) {
                    console.log(`   ⚠️ Could not parse package.json, using default start command`);
                }
            }

            let start = projectInfo.startCommand || defaultStart;

            // SAFETY: Strip any legacy fuser/kill prefixes from startCommand
            // (Old session data may have these - startup script handles killing now)
            start = start.replace(/^\(fuser -k 3000\/tcp[^)]*\)\s*&&\s*/i, '');
            start = start.replace(/^fuser -k 3000\/tcp[^&]*&&\s*/i, '');

            // Ensure proper binding for common frameworks
            let finalStart = start;
            if ((start.includes('npm start') || start.includes('react-scripts start') || start.includes('vite')) && !start.includes('--host')) {
                finalStart = `${start} -- --host 0.0.0.0`;
            }


            // Phase 2.3: Smart npm install - skip if node_modules exists and package.json unchanged
            let shouldInstall = true;
            let nodeModulesExists = false;

            try {
                // Check if node_modules exists AND contains packages
                const checkNodeModules = await flyService.exec(
                    agentUrl,
                    'test -d node_modules && ls node_modules 2>/dev/null | wc -l',
                    '/home/coder/project',
                    machineId,
                    10000,
                    true
                );

                const packageCount = parseInt(checkNodeModules.stdout?.trim() || '0');
                nodeModulesExists = packageCount > 0;

                if (nodeModulesExists) {
                    console.log(`   📦 node_modules exists with ${packageCount} packages`);

                    // node_modules exists, check if package.json changed
                    const packageJson = await this.readFile(projectId, 'package.json');
                    if (packageJson.success) {
                        // Calculate hash of current package.json
                        const crypto = require('crypto');
                        const currentHash = crypto.createHash('md5').update(packageJson.content).digest('hex');

                        // Get stored hash from VM
                        const storedHashResult = await flyService.exec(
                            agentUrl,
                            'cat .package-json-hash 2>/dev/null || echo ""',
                            '/home/coder/project',
                            machineId,
                            10000,
                            true
                        );

                        const storedHash = storedHashResult.stdout?.trim();

                        if (storedHash === currentHash) {
                            console.log(`   ⚡ package.json unchanged (hash: ${currentHash.substring(0, 8)}...) - SKIPPING install`);
                            shouldInstall = false;
                        } else {
                            if (storedHash) {
                                console.log(`   🔄 package.json CHANGED (${storedHash.substring(0, 8)}... → ${currentHash.substring(0, 8)}...) - running install`);
                            } else {
                                console.log(`   🆕 First install for this project - running install`);
                            }
                            // Store the new hash after install
                            installCmd = `${installCmd} && echo "${currentHash}" > .package-json-hash`;
                        }
                    } else {
                        console.log(`   ⚠️ Could not read package.json, running install to be safe`);
                    }
                } else {
                    console.log(`   📦 node_modules empty or missing - running install`);
                }
            } catch (e) {
                console.log(`   ⚠️ Could not check node_modules state: ${e.message}`);
                console.log(`   Running install to be safe`);
                shouldInstall = true;
            }

            // Setup script - conditionally include install
            // Wrap in timeout and add explicit logging
            // OPTIMIZATION: npm install works WITH existing node_modules (much faster than npm ci)
            // Never clean node_modules - npm install will reuse it intelligently
            const installPart = shouldInstall
                ? `echo "📦 Installing dependencies with ${pkgManager}..." && ${installCmd}`
                : `echo "⚡ Skipping install (node_modules up-to-date)"`;

            // Final execution - log to /home/coder/server.log so it appears in IDE logs
            const backgroundStart = `bash -c 'cd /home/coder/project && export PATH="/home/coder/project/node_modules/.bin:$PATH" && ${finalStart} >> /home/coder/server.log 2>&1 < /dev/null & disown' && sleep 2 && echo "Dev server started in background"`;

            console.log(`🚀 [Orchestrator] Triggering Optimized Setup (via /exec)`);


            if (onProgress) onProgress('installing', `Installazione dipendenze(${pkgManager})...`);

            if (shouldInstall) {
                try {
                    if (installCmd.includes('npm ci')) {
                        console.log(`   🧹 Removing node_modules for clean npm ci...`);
                        await flyService.exec(agentUrl, 'rm -rf node_modules', '/home/coder/project', machineId, 10000, true);
                    }

                    // === DEBUG: Cache status BEFORE install ===
                    console.log(`\n   ${'═'.repeat(50)}`);
                    console.log(`   🔍 [DEBUG] PNPM CACHE STATUS (BEFORE INSTALL)`);
                    console.log(`   ${'═'.repeat(50)}`);
                    let detectedLayout = 'unknown';  // Will be set during cache detection
                    try {
                        // Check cache store size
                        const cacheSize = await flyService.exec(agentUrl, 'du -sh /home/coder/volumes/pnpm-store 2>/dev/null || echo "Cache not found"', '/home/coder', machineId, 10000, true);
                        console.log(`   📦 Cache Store Size: ${cacheSize.stdout?.trim() || 'N/A'}`);

                        // Detect pnpm store layout with debug output:
                        // - pnpm 10.x: files/, index/, projects/ (layout "pnpm10")
                        // - pnpm 9.x: v3/ (layout "v3") or v10/ (layout "v10")
                        // Note: Workers may have nested structure (pnpm-store/pnpm-store/v10/) due to rsync copy
                        const layoutCheck = await flyService.exec(agentUrl, `
                            BASE="/home/coder/volumes/pnpm-store" &&
                            echo "DIRS:" && ls -1 $BASE/ 2>/dev/null | head -10 &&
                            if [ -d $BASE/files ]; then echo "LAYOUT:pnpm10";
                            elif [ -d $BASE/v3 ]; then echo "LAYOUT:v3";
                            elif [ -d $BASE/v10 ]; then echo "LAYOUT:v10";
                            elif [ -d $BASE/pnpm-store/files ]; then echo "LAYOUT:nested-pnpm10";
                            elif [ -d $BASE/pnpm-store/v3 ]; then echo "LAYOUT:nested-v3";
                            elif [ -d $BASE/pnpm-store/v10 ]; then echo "LAYOUT:nested-v10";
                            else echo "LAYOUT:unknown"; fi
                        `.replace(/\n\s+/g, ' '), '/home/coder', machineId, 10000, true);
                        const layoutOutput = layoutCheck.stdout?.trim() || '';
                        const dirsMatch = layoutOutput.match(/DIRS:\n?([\s\S]*?)LAYOUT:/);
                        const dirs = dirsMatch ? dirsMatch[1].trim() : 'N/A';
                        console.log(`   📂 Store directories: ${dirs.replace(/\n/g, ', ')}`);
                        const layoutMatch = layoutOutput.match(/LAYOUT:([\w-]+)/);
                        detectedLayout = layoutMatch ? layoutMatch[1] : 'unknown';
                        console.log(`   🏗️ Store Layout: ${detectedLayout}`);

                        // Count files in cache based on detected layout
                        // pnpm10: files are in /pnpm-store/files/
                        // v10: files are in /pnpm-store/v10/files/
                        // nested-*: files are in /pnpm-store/pnpm-store/*/files/
                        let filesDir;
                        switch (detectedLayout) {
                            case 'pnpm10': filesDir = 'files'; break;
                            case 'v10': filesDir = 'v10/files'; break;
                            case 'v3': filesDir = 'v3/files'; break;
                            case 'nested-pnpm10': filesDir = 'pnpm-store/files'; break;
                            case 'nested-v10': filesDir = 'pnpm-store/v10/files'; break;
                            case 'nested-v3': filesDir = 'pnpm-store/v3/files'; break;
                            default: filesDir = 'files';
                        }
                        const fileCount = await flyService.exec(agentUrl, `ls /home/coder/volumes/pnpm-store/${filesDir} 2>/dev/null | wc -l || echo "0"`, '/home/coder', machineId, 10000, true);
                        console.log(`   📁 Cached File Hashes: ${fileCount.stdout?.trim() || '0'}`);

                        // List some cached files
                        const cachedPkgs = await flyService.exec(agentUrl, `ls /home/coder/volumes/pnpm-store/${filesDir} 2>/dev/null | head -10 || echo "(empty)"`, '/home/coder', machineId, 10000, true);
                        console.log(`   📋 Sample cached hashes:\n      ${cachedPkgs.stdout?.trim().split('\n').join('\n      ') || '(none)'}`);
                    } catch (e) {
                        console.log(`   ⚠️ Could not read cache status: ${e.message}`);
                    }
                    console.log(`   ${'─'.repeat(50)}\n`);

                    // FIX: Adjust store path for nested layouts
                    // Workers may have pnpm-store/pnpm-store/v10/ due to how the cache was created
                    if (detectedLayout.startsWith('nested-')) {
                        console.log(`   🔧 Detected nested cache layout, adjusting --store-dir and symlink paths...`);
                        // Fix --store-dir argument
                        installCmd = installCmd.replace(
                            /--store-dir \/home\/coder\/volumes\/pnpm-store(?!\/pnpm-store)/g,
                            '--store-dir /home/coder/volumes/pnpm-store/pnpm-store'
                        );
                        // Fix symlink target (ln -snf TARGET LINK)
                        installCmd = installCmd.replace(
                            /ln -snf \/home\/coder\/volumes\/pnpm-store \/home\/coder\/.local\/share\/pnpm\/store/g,
                            'ln -snf /home/coder/volumes/pnpm-store/pnpm-store /home/coder/.local/share/pnpm/store'
                        );
                        console.log(`   ✅ Store paths updated for nested layout`);
                    }

                    console.log(`   📦 Installing dependencies with ${pkgManager}...`);
                    const installTimeout = 600000; // 10 minutes (Holy Grail: handle large projects)
                    const startTime = Date.now();

                    // installCmd already contains --store-dir flag for pnpm (set above)
                    // CI=true prevents pnpm from asking for TTY confirmation
                    let fullInstallCmd = installCmd;

                    // HOLY GRAIL: Handle Next.js 16 + TypeScript config files
                    // If next.config.ts is present, Next.js requires typescript for transpilation.
                    const hasTsConfig = fileNames.some(f => f.includes('next.config.ts'));
                    const isNextJs = projectInfo.type === 'nextjs' || fileNames.some(f => f.includes('next.config'));

                    if (pkgManager === 'pnpm' && isNextJs) {
                        // Use shamefully-hoist for Next.js to solve complex module resolution in MicroVMs
                        fullInstallCmd = fullInstallCmd.replace('pnpm install', 'pnpm install --shamefully-hoist');
                    }

                    if (hasTsConfig && !fullInstallCmd.includes('typescript')) {
                        console.log(`   💡 Next.js 16 TypeScript config detected - ensuring typescript dependency`);
                        const tsStoreDir = detectedLayout.startsWith('nested-')
                            ? '/home/coder/volumes/pnpm-store/pnpm-store'
                            : '/home/coder/volumes/pnpm-store';
                        fullInstallCmd = pkgManager === 'pnpm'
                            ? `${fullInstallCmd} && CI=true pnpm install --store-dir ${tsStoreDir} --offline typescript`
                            : `${fullInstallCmd} && ${pkgManager} install typescript`;
                    }

                    // HOLY GRAIL: Run install in background to avoid HTTP timeouts (Fly.io proxy 30s limit)
                    console.log(`   📦 Triggering ${pkgManager} install in background...`);
                    const installLog = '/home/coder/install.log';
                    const installMarker = '/home/coder/install.done';

                    // Launch install in background
                    // 🔑 Robustness: Kill any existing dev servers or stalled installs
                    // DO NOT use killall node as it kills the agent!
                    // NOTE: Removed "wait for background install" check - it was detecting the MEGA pnpm install
                    // from cache warming and blocking forever. pnpm has its own locking mechanism.

                    // Cleanup old markers (don't wait too long - VM might be busy)
                    try {
                        await flyService.exec(agentUrl, `rm -f ${installMarker} ${installLog}`, '/home/coder', machineId, 10000, true);
                    } catch (cleanupErr) {
                        console.log(`   ⚠️ Marker cleanup timed out (VM busy) - continuing anyway`);
                    }

                    // Kill dev servers (but NOT package managers if install might be running)
                    const killCmd = 'fuser -k 3000/tcp || true; pkill -9 -f next-server || true; pkill -9 -f vite || true';
                    console.log(`\n   🔪 [DEBUG] EXECUTING KILL CMD:\n   ${killCmd}`);
                    await flyService.exec(agentUrl, killCmd, '/home/coder', machineId, 20000, true);

                    // Create install script on VM (avoids complex shell escaping)
                    const installScript = `/home/coder/install.sh`;
                    // FIXED: Wrap in subshell () to capture ALL output, not just last command
                    // HOLY GRAIL: Fallback strategy - try --offline first (fast), fallback to --prefer-offline if cache misses
                    const offlineInstallCmd = fullInstallCmd;
                    const onlineInstallCmd = fullInstallCmd.replace(/--offline/g, '--prefer-offline');
                    const scriptContent = `#!/bin/bash
cd /home/coder/project
echo "🚀 Attempting --offline install (using cache only)..."
(${offlineInstallCmd}) > ${installLog} 2>&1
OFFLINE_EXIT=$?
if [ $OFFLINE_EXIT -ne 0 ]; then
    echo "" >> ${installLog}
    echo "⚠️ --offline failed (exit $OFFLINE_EXIT), retrying with --prefer-offline to fetch missing packages..." >> ${installLog}
    echo "🌐 Fallback: running --prefer-offline install..."
    (${onlineInstallCmd}) >> ${installLog} 2>&1
    echo $? > ${installMarker}
else
    echo "✅ --offline install succeeded!" >> ${installLog}
    echo 0 > ${installMarker}
fi`;

                    console.log(`\n   📝 [DEBUG] INSTALL SCRIPT CONTENT:\n${'─'.repeat(40)}\n${scriptContent}\n${'─'.repeat(40)}`);

                    await flyService.exec(agentUrl, `cat > ${installScript} << 'EOFSCRIPT'
${scriptContent}
EOFSCRIPT
chmod +x ${installScript}`, '/home/coder', machineId, 10000, true);

                    console.log(`   🛠️ BG Install Script: ${installScript}`);
                    // Run in background (detached from parent)
                    // Use nohup for proper detachment, increased timeout, and catch timeout errors gracefully
                    try {
                        await flyService.exec(agentUrl, `nohup ${installScript} > /dev/null 2>&1 &`, '/home/coder', machineId, 15000, true);
                        console.log(`   ✅ Install script triggered successfully`);
                    } catch (triggerErr) {
                        // Ignore timeout errors - the script is likely running in background
                        if (triggerErr.code === 'ECONNABORTED' || triggerErr.message?.includes('timeout') || triggerErr.message?.includes('socket hang up')) {
                            console.log(`   ⏱️ Install trigger timeout/hangup (expected) - script running in background...`);
                        } else {
                            console.error(`   ❌ Install trigger failed: ${triggerErr.message}`);
                            throw triggerErr;
                        }
                    }

                    // Poll for completion
                    let pollCount = 0;
                    const maxPolls = 120; // 10 minutes (5s interval)
                    let installSuccess = false;

                    while (pollCount < maxPolls) {
                        const checkMarker = await flyService.exec(agentUrl, `cat ${installMarker} 2>/dev/null || echo "PENDING"`, '/home/coder', machineId, 30000, true);
                        const status = checkMarker.stdout?.trim();

                        if (status && status !== 'PENDING') {
                            // Use regex to strictly extract numbers (ignore any whitespace or garbage)
                            const match = status.match(/(-?\d+)/);
                            const exitCode = match ? parseInt(match[1]) : NaN;

                            if (isNaN(exitCode)) {
                                console.log(`   ⏳ Status marker contains invalid value: "${status}" - continuing to poll...`);
                                await new Promise(r => setTimeout(r, 2000));
                                pollCount++;
                                continue;
                            }

                            const duration = Math.round((Date.now() - startTime) / 1000);
                            console.log(`   ⏱️ ${pkgManager} install finished in ${duration}s (Exit code: ${exitCode})`);

                            if (exitCode === 0) {
                                installSuccess = true;
                            } else {
                                // Check if it's a "soft" failure
                                const checkResult = await flyService.exec(agentUrl, '[ -d node_modules ] && [ "$(ls -A node_modules)" ]', '/home/coder/project', machineId, 10000, true);
                                if (checkResult.exitCode === 0) {
                                    console.log(`   ⚠️ ${pkgManager} install had warnings/soft error (${exitCode}) but node_modules exists. Proceeding...`);
                                    installSuccess = true;
                                } else {
                                    const errorLogs = await flyService.exec(agentUrl, `tail -n 20 ${installLog}`, '/home/coder', machineId, 5000, true);
                                    throw new Error(`${pkgManager} install failed (code ${match ? match[1] : 'unknown'}). Logs:\n${errorLogs.stdout}`);
                                }
                            }
                            break;
                        }

                        await new Promise(r => setTimeout(r, 5000));
                        pollCount++;
                        if (pollCount % 3 === 0 && onProgress) {
                            onProgress('installing', `Installazione dipendenze (${Math.round(pollCount * 5)}s)...`);
                        }
                    }

                    if (!installSuccess && pollCount >= maxPolls) {
                        throw new Error(`${pkgManager} install timed out after 10 minutes`);
                    }

                    // === DEBUG: Show install.log output ===
                    console.log(`\n   📋 [DEBUG] INSTALL.LOG (last 50 lines):`);
                    try {
                        const installLogs = await flyService.exec(agentUrl, `tail -n 50 ${installLog}`, '/home/coder', machineId, 5000, true);
                        console.log(`${'─'.repeat(40)}\n${installLogs.stdout || '(empty)'}\n${'─'.repeat(40)}`);
                    } catch (e) {
                        console.log(`   (could not read install.log: ${e.message})`);
                    }

                    // === DEBUG: Cache status AFTER install ===
                    console.log(`\n   ${'═'.repeat(50)}`);
                    console.log(`   🔍 [DEBUG] PNPM CACHE STATUS (AFTER INSTALL)`);
                    console.log(`   ${'═'.repeat(50)}`);
                    try {
                        // Check cache store size after
                        const cacheSizeAfter = await flyService.exec(agentUrl, 'du -sh /home/coder/volumes/pnpm-store 2>/dev/null || echo "Cache not found"', '/home/coder', machineId, 10000, true);
                        console.log(`   📦 Cache Store Size: ${cacheSizeAfter.stdout?.trim() || 'N/A'}`);

                        // Check node_modules size
                        const nodeModulesSize = await flyService.exec(agentUrl, 'du -sh /home/coder/project/node_modules 2>/dev/null || echo "not found"', '/home/coder', machineId, 10000, true);
                        console.log(`   📁 node_modules Size: ${nodeModulesSize.stdout?.trim() || 'N/A'}`);

                        // Count packages installed
                        const installedPkgs = await flyService.exec(agentUrl, 'ls /home/coder/project/node_modules 2>/dev/null | wc -l || echo "0"', '/home/coder', machineId, 10000, true);
                        console.log(`   📊 Packages in node_modules: ${installedPkgs.stdout?.trim() || '0'}`);

                        // Check pnpm store status (packages count)
                        const storeStatus = await flyService.exec(agentUrl, 'pnpm store status 2>&1 | head -5 || echo "N/A"', '/home/coder/project', machineId, 15000, true);
                        console.log(`   🗄️ Store Status:\n      ${storeStatus.stdout?.trim().split('\n').join('\n      ') || 'N/A'}`);
                    } catch (e) {
                        console.log(`   ⚠️ Could not read post-install status: ${e.message}`);
                    }
                    console.log(`   ${'─'.repeat(50)}\n`);

                    console.log(`   ✅ Dependencies installed successfully`);
                } catch (installError) {
                    console.error(`   ❌ Install failed: ${installError.message}`);
                    throw installError;
                }
            } else {
                console.log(`   ⚡ Skipping install (node_modules up-to-date)`);
            }

            // === SAVE CACHE: After successful install, save node_modules to cache ===
            // IMPORTANTE: Salvare PRIMA dell'avvio server, così funziona anche se il server non si avvia
            // (es. Next.js 16.1.1 hanging bug)
            // Se shouldInstall=true e siamo qui, l'install è riuscito → node_modules esiste
            if (shouldInstall) {
                try {
                    console.log(`\n💾 [Setup] Saving node_modules to cache for future use...`);

                    const hash = await cacheService.calculateHash(projectId);
                    const saveResult = await cacheService.save(projectId, agentUrl, machineId);

                    if (saveResult.success && !saveResult.skipped) {
                        console.log(`   ✅ [Setup] Cache saved (hash: ${hash})! Next time will be faster ⚡`);
                    } else if (saveResult.skipped) {
                        console.log(`   ⏭️ [Setup] Cache already exists, skipped upload`);
                    }

                } catch (saveError) {
                    console.log(`   ⚠️ [Setup] Failed to save cache: ${saveError.message}`);
                    // Non bloccare se salvataggio fallisce
                }
            }

            console.log(`   🔪 Killing any process on port 3000...`);
            await flyService.exec(agentUrl, 'fuser -k 3000/tcp 2>/dev/null || true', '/home/coder/project', machineId, 15000, true);

            if (staySilent) {
                console.log(`   ⏭️[Orchestrator] staySilent = true: Skipping dev server start`);
                return { success: true, serverReady: false };
            }

            console.log(`   🚀 Starting dev server in background...`);
            if (onProgress) onProgress('starting', 'Avvio del dev server...');

            // Create startup script on VM (same pattern as install.sh - avoids complex shell escaping)
            const startupScript = `/home/coder/start-server.sh`;
            const startupScriptContent = `#!/bin/bash
cd /home/coder/project || exit 1
export PATH="/home/coder/project/node_modules/.bin:$PATH"

# Kill ANY existing vite/dev server processes (not just port 3000)
pkill -9 -f "vite" || true
pkill -9 -f "npm.*dev" || true
pkill -9 -f "node.*dev" || true
fuser -k 3000/tcp 2>/dev/null || true
sleep 1

# CRITICAL: Clean build caches to avoid "Cannot find module" errors
# Next.js .next cache and Vite cache can get corrupted when files are synced from storage
rm -rf .next .vite 2>/dev/null || true

# Start dev server in background and DETACH from parent process
# nohup + disown ensures the process survives even if parent exits
nohup ${finalStart} > /home/coder/server.log 2>&1 &
disown
echo "Dev server started in background"`;

            console.log(`\n   📝 [DEBUG] STARTUP SCRIPT CONTENT:\n${'─'.repeat(40)}\n${startupScriptContent}\n${'─'.repeat(40)}`);

            await flyService.exec(agentUrl, `cat > ${startupScript} << 'EOFSCRIPT'
${startupScriptContent}
EOFSCRIPT
chmod +x ${startupScript}`, '/home/coder', machineId, 10000, true);

            console.log(`   🛠️ Startup Script: ${startupScript}`);

            // 🔑 FIX: Fire-and-forget execution - don't wait for response
            // The script runs the server in background with nohup, so we don't need to wait
            // If exec times out, the server is still starting - health check will verify
            try {
                await flyService.exec(agentUrl, startupScript, '/home/coder', machineId, 10000, true);
                console.log(`   ✅ Startup script triggered successfully`);
            } catch (execErr) {
                // Ignore timeout/hangup errors - the script is running, health check will verify
                if (execErr.code === 'ECONNABORTED' || execErr.message?.includes('timeout') || execErr.message?.includes('socket hang up')) {
                    console.log(`   ⏱️ Exec timeout/hangup (expected) - server starting in background...`);
                } else {
                    // Re-throw non-timeout errors
                    throw execErr;
                }
            }

            // Wait a bit for the server to initialize
            await new Promise(r => setTimeout(r, 2000));

            const healthCheckTimeout = projectInfo.type === 'nextjs' ? 180000 : 90000;
            const isReady = await this.waitForDevServer(agentUrl, machineId, healthCheckTimeout);

            if (!isReady) {
                const logs = await flyService.exec(agentUrl, 'tail -n 30 /home/coder/server.log', '/home/coder', machineId, 5000, true);
                console.error(`❌[Health Check] Dev server failed! Last logs: \n${logs.stdout} `);
                throw new Error(`Dev server failed to start.Check project logs.`);
            }

            // === DEBUG: Show server.log output ===
            console.log(`\n   📋 [DEBUG] SERVER.LOG (last 20 lines):`);
            try {
                const serverLogs = await flyService.exec(agentUrl, 'tail -n 20 /home/coder/server.log', '/home/coder', machineId, 5000, true);
                console.log(`${'─'.repeat(40)}\n${serverLogs.stdout || '(empty)'}\n${'─'.repeat(40)}`);
            } catch (e) {
                console.log(`   (could not read server.log: ${e.message})`);
            }

            console.log(`   ✅ Dev server is ready and responding`);
            console.log(`${'='.repeat(60)}\n`);
            return { success: true, serverReady: true };
        } catch (error) {
            console.error(`❌[Orchestrator] Optimized setup failed: ${error.message} `);
            throw error;
        } finally {
            setupLocks.delete(projectId);
            if (resolveLock) resolveLock();
        }
    }

    /**
     * Wait for dev server to be ready
     */
    async waitForDevServer(agentUrl, machineId, maxWaitMs = 120000) {
        const axios = require('axios');
        const headers = machineId ? { 'Fly-Force-Instance-Id': machineId } : {};
        const startTime = Date.now();
        const checkInterval = 2000;

        console.log(`⏳[Health Check] Verifying app at ${machineId}...`);

        while (Date.now() - startTime < maxWaitMs) {
            try {
                const checkStart = Date.now();
                const response = await axios.get(agentUrl, {
                    timeout: 4000,
                    headers,
                    validateStatus: () => true // Catch all statuses
                });

                // Accept 2xx, 3xx (success/redirect) OR 404 (server responding, but no content on root)
                // 404 is common for SPA frameworks (Vite, Vue, React) that don't serve content on root
                if ((response.status >= 200 && response.status < 400) || response.status === 404) {
                    console.log(`✅ [Health Check] App ready! (${response.status}) after ${Date.now() - startTime}ms`);
                    return true;
                } else {
                    if (Date.now() - startTime > 30000 && (Date.now() - startTime) % 10000 < 2000) {
                        console.log(`⏳ [Health Check] App not ready (Status: ${response.status}) at ${Math.round((Date.now() - startTime) / 1000)}s`);
                    }
                }
            } catch (error) {
                if (Date.now() - startTime > 30000 && (Date.now() - startTime) % 10000 < 2000) {
                    console.log(`⏳ [Health Check] Connection error: ${error.message} at ${Math.round((Date.now() - startTime) / 1000)}s`);
                }
            }
            await new Promise(r => setTimeout(r, checkInterval));
        }
        return false;
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
