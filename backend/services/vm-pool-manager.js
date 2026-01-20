/**
 * VM Pool Manager - Maintains warm VM pool for instant preview creation
 *
 * Performance Impact:
 * - Cold start: ~38s (VM creation + image pull + boot)
 * - Pool allocation: ~0.5s (instant allocation from pool)
 * - 75x faster for first preview!
 *
 * Cost: ~$50-75/month for 5 warm VMs (affordable for production)
 */

const flyService = require('./fly-service');

class VMPoolManager {
    constructor() {
        this.pool = []; // { machineId, agentUrl, createdAt, allocatedTo: null, prewarmed: false, isCacheMaster: false }

        // Dynamic pool sizing for scalability
        this.BASE_POOL_SIZE = 3; // Minimum worker VMs
        this.MAX_POOL_SIZE = 15; // Maximum worker VMs (safety limit)
        this.CACHE_MASTERS_COUNT = 1; // Dedicated cache master VMs
        this.activeUsers = 0; // Tracked from sessions

        this.MAX_VM_AGE_MS = 2 * 60 * 60 * 1000; // 2 hours max age
        this.VM_IDLE_TIMEOUT_MS = 2 * 60 * 1000; // 2 min idle timeout (for session pooling)
        this.isInitialized = false;
    }

    /**
     * Calculate dynamic pool size based on active users
     */
    calculateTargetPoolSize() {
        // Scale: 30% of active users (rounded up), clamped to min/max
        const dynamicSize = Math.ceil(this.activeUsers * 0.3);
        return Math.max(this.BASE_POOL_SIZE, Math.min(dynamicSize, this.MAX_POOL_SIZE));
    }

    /**
     * Update active users count (called by metrics service)
     */
    updateActiveUsers(count) {
        this.activeUsers = count;
        console.log(`📊 [VM Pool] Active users: ${count}, Target pool: ${this.calculateTargetPoolSize()}`);
    }

    /**
     * Initialize the VM Pool (call on server startup)
     */
    async initialize() {
        if (this.isInitialized) return;

        console.log('🏊 [VM Pool] Initializing VM Pool...');

        // PHASE 2.1 Adoption: Detect existing pool machines on Fly.io (survives restarts)
        try {
            const machines = await flyService.listMachines();
            const poolMachines = machines.filter(m => m.name.startsWith('ws-pool-') && m.state !== 'destroyed');

            for (const vm of poolMachines) {
                if (!this.pool.find(p => p.machineId === vm.id)) {
                    // Check if this VM is a cache master
                    const isCacheMaster = vm.config?.env?.CACHE_MASTER === 'true';
                    const vmType = isCacheMaster ? 'Cache Master' : 'warm VM';
                    console.log(`🏊 [VM Pool] Adopting existing ${vmType}: ${vm.id}`);

                    this.pool.push({
                        machineId: vm.id,
                        agentUrl: 'https://drape-workspaces.fly.dev',
                        createdAt: Date.parse(vm.created_at) || Date.now(),
                        allocatedTo: null,
                        allocatedAt: null,
                        prewarmed: true, // Assume pre-warmed if it exists from previous run
                        isCacheMaster: isCacheMaster, // Dedicated cache master never allocated to projects
                        image: vm.config?.image || flyService.DRAPE_IMAGE
                    });
                }
            }
        } catch (e) {
            console.warn(`⚠️ [VM Pool] Failed to adopt orphans: ${e.message}`);
        }

        // Start the pool replenisher
        this.startPoolReplenisher();

        // Initial pool warmup (async, don't wait)
        this.replenishPool().catch(e => {
            console.warn(`⚠️ [VM Pool] Initial warmup failed: ${e.message}`);
        });

        this.isInitialized = true;
        console.log('✅ [VM Pool] VM Pool initialized');
    }

    /**
     * Get a VM from the pool (instant) or create new one if pool empty
     * @param {string} projectId - Project ID to allocate to
     * @returns {Promise<object>} VM object with { machineId, agentUrl }
     */
    async allocateVM(projectId) {
        // CRITICAL: Never allocate cache masters to projects - they're reserved for cache copying only
        // Try to get prewarmed worker VM first (has npm cache ready)
        let pooledVM = this.pool.find(vm => !vm.allocatedTo && vm.prewarmed && !vm.isCacheMaster);

        // If no prewarmed worker VM, fallback to any available worker VM
        if (!pooledVM) {
            pooledVM = this.pool.find(vm => !vm.allocatedTo && !vm.isCacheMaster);
        }

        if (pooledVM) {
            // VM is about to be used, mark it as RESERVED to prevent cleanup tasks from touching it
            // during the async verification check
            pooledVM.allocatedTo = 'RESERVED';
            pooledVM.allocatedAt = Date.now();

            // Verify VM is still alive before fully allocating
            try {
                const flyService = require('./fly-service');
                const machine = await flyService.getMachine(pooledVM.machineId);

                if (!machine || machine.state !== 'started') {
                    console.warn(`⚠️ [VM Pool] VM ${pooledVM.machineId} is dead/stopped, removing from pool`);
                    this.pool = this.pool.filter(v => v.machineId !== pooledVM.machineId);
                    // Try again with next available VM
                    return await this.allocateVM(projectId);
                }
            } catch (e) {
                console.warn(`⚠️ [VM Pool] VM ${pooledVM.machineId} check failed: ${e.message}, removing from pool`);
                this.pool = this.pool.filter(v => v.machineId !== pooledVM.machineId);
                // Try again with next available VM
                return await this.allocateVM(projectId);
            }

            // VM is alive, allocate it!
            pooledVM.allocatedTo = projectId;

            const prewarmStatus = pooledVM.prewarmed ? '⚡ with npm cache' : '🔄 pre-warming in progress';
            console.log(`⚡ [VM Pool] Allocated VM ${pooledVM.machineId} to ${projectId} (${prewarmStatus})`);

            // Trigger async replenishment (don't wait)
            this.replenishPool().catch(e => {
                console.warn(`⚠️ [VM Pool] Replenish failed: ${e.message}`);
            });

            return {
                machineId: pooledVM.machineId,
                agentUrl: pooledVM.agentUrl,
                prewarmed: pooledVM.prewarmed
            };
        }

        // Pool empty - create new VM (cold start)
        console.log(`🐢 [VM Pool] Pool empty, creating new VM (cold start)...`);
        const newVM = await this.createWarmVM();

        // CRITICAL: Wait for pre-warming to complete before allocating
        // This ensures the VM has the pnpm cache copied from cache master
        const poolEntry = this.pool.find(v => v.machineId === newVM.machineId);
        if (poolEntry && !poolEntry.prewarmed) {
            console.log(`⏳ [VM Pool] Waiting for pre-warming to complete for ${newVM.machineId}...`);

            // Poll until prewarmed is true (max 60 seconds)
            const startWait = Date.now();
            while (!poolEntry.prewarmed && (Date.now() - startWait) < 60000) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            if (poolEntry.prewarmed) {
                console.log(`✅ [VM Pool] Pre-warming completed in ${Date.now() - startWait}ms`);
            } else {
                console.warn(`⚠️ [VM Pool] Pre-warming timeout after ${Date.now() - startWait}ms, allocating anyway`);
            }
        }

        // Mark as allocated
        if (poolEntry) {
            poolEntry.allocatedTo = projectId;
            poolEntry.allocatedAt = Date.now();
        }

        return newVM;
    }

    /**
     * Release a VM back to the pool (for reuse)
     * @param {string} machineId - Machine ID to release
     * @param {boolean} keepNodeModules - Whether to keep node_modules (default: true)
     */
    async releaseVM(machineId, keepNodeModules = true) {
        const vm = this.pool.find(v => v.machineId === machineId);

        if (!vm) {
            console.warn(`⚠️ [VM Pool] Cannot release VM ${machineId} - not in pool`);
            return;
        }

        // Mark as available
        vm.allocatedTo = null;
        vm.allocatedAt = null;

        // Clean up project folder but preserve node_modules for speed (Phase 2.3)
        if (keepNodeModules) {
            try {
                const cleanCmd = `find /home/coder/project -mindepth 1 -maxdepth 1 -not -name 'node_modules' -not -name '.git' -not -name '.package-json-hash' -exec rm -rf {} +`;
                await flyService.exec(vm.agentUrl, cleanCmd, '/home/coder', machineId);
                console.log(`🧹 [VM Pool] Released VM ${machineId} (node_modules preserved)`);
            } catch (e) {
                console.warn(`⚠️ [VM Pool] Cleanup failed for ${machineId}: ${e.message}`);
            }
        } else {
            console.log(`♻️ [VM Pool] Released VM ${machineId} (will be cleaned on next use)`);
        }
    }

    /**
     * Ensure we have the required number of cache masters
     */
    async ensureCacheMasters() {
        const cacheMasters = this.pool.filter(vm => vm.isCacheMaster);
        const needed = this.CACHE_MASTERS_COUNT - cacheMasters.length;

        if (needed <= 0) {
            return; // We have enough cache masters
        }

        console.log(`💾 [Cache Master] Creating ${needed} cache master(s)...`);

        // Create cache masters in parallel
        const createPromises = [];
        for (let i = 0; i < needed; i++) {
            createPromises.push(this.createWarmVM(true)); // true = cache master
        }

        const results = await Promise.allSettled(createPromises);
        const successful = results.filter(r => r.status === 'fulfilled').length;

        if (successful > 0) {
            console.log(`✅ [Cache Master] Created ${successful} cache master(s)`);
        }
    }

    /**
     * Replenish the pool to target size (dynamic based on active users)
     */
    async replenishPool() {
        // PHASE 1: Ensure we have cache masters first (critical for performance)
        await this.ensureCacheMasters();

        // PHASE 2: Replenish worker VMs
        // Count only worker VMs (exclude cache masters from pool size calculation)
        const workerVMs = this.pool.filter(vm => !vm.isCacheMaster);
        const availableWorkers = workerVMs.filter(vm => !vm.allocatedTo);
        const targetSize = this.calculateTargetPoolSize();
        const needed = targetSize - availableWorkers.length;

        if (needed <= 0) {
            return; // Pool is full
        }

        console.log(`🏊 [VM Pool] Replenishing pool (need ${needed} more worker VMs, target: ${targetSize})...`);

        // Create VMs in parallel
        const createPromises = [];
        for (let i = 0; i < needed; i++) {
            createPromises.push(this.createWarmVM(false)); // false = not a cache master
        }

        const results = await Promise.allSettled(createPromises);

        const successful = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.filter(r => r.status === 'rejected').length;

        if (successful > 0) {
            console.log(`✅ [VM Pool] Added ${successful} warm VMs to pool`);
        }
        if (failed > 0) {
            console.warn(`⚠️ [VM Pool] Failed to create ${failed} VMs`);
        }
    }

    /**
     * Create a warm VM and add to pool
     * @param {boolean} isCacheMaster - Whether this VM is a dedicated cache master
     */
    async createWarmVM(isCacheMaster = false) {
        // Generate a unique pool VM ID
        const vmPrefix = isCacheMaster ? 'cache' : 'pool';
        const poolId = `${vmPrefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        const envVars = {
            PROJECT_ID: poolId,
            POOL_VM: 'true',
            // HOLY GRAIL: Same optimizations as project VMs
            NODE_OPTIONS: '--max-old-space-size=3072',
            NEXT_TELEMETRY_DISABLED: '1',
            NEXT_WEBPACK_WORKERS: '2',
            UV_THREADPOOL_SIZE: '4',
            PNPM_HOME: '/home/coder/.local/share/pnpm'
        };

        // Mark cache masters with special env var
        if (isCacheMaster) {
            envVars.CACHE_MASTER = 'true';
        }

        const vm = await flyService.createMachine(poolId, {
            memory_mb: 2048,
            image: flyService.DRAPE_IMAGE,
            env: envVars
        });

        // Wait for VM to be ready
        await flyService.waitForMachine(vm.id, 30000, 120000);

        const agentUrl = 'https://drape-workspaces.fly.dev';

        // Wait for agent
        const axios = require('axios');
        for (let i = 0; i < 30; i++) {
            try {
                await axios.get(`${agentUrl}/health`, {
                    timeout: 3000,
                    headers: { 'Fly-Force-Instance-Id': vm.id }
                });
                break;
            } catch (e) {
                if (i === 29) throw new Error('Agent not ready after 90s');
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
        }

        // FIX: Add VM to pool IMMEDIATELY (before pre-warming)
        // This makes the VM available instantly while pre-warming continues in background
        const poolEntry = {
            machineId: vm.id,
            agentUrl,
            createdAt: Date.now(),
            allocatedTo: null,
            allocatedAt: null,
            prewarmed: false, // Will be set to true when pre-warming completes
            isCacheMaster: isCacheMaster, // Dedicated cache master never allocated to projects
            image: flyService.DRAPE_IMAGE // Track image version for cache validation
        };
        this.pool.push(poolEntry);

        const vmLabel = isCacheMaster ? 'Cache Master' : 'Worker VM';
        console.log(`🔥 [VM Pool] Created ${vmLabel} ${vm.id} (pre-warming in background)`);

        // FIX: Pre-warm in background (don't await)
        // Install common dependencies to populate npm cache
        setImmediate(async () => {
            try {
                // SAFETY CHECK: If VM was already allocated to a project while we were preparing,
                // abort pre-warming to avoid conflicting with project files/sync
                if (poolEntry.allocatedTo) {
                    console.log(`   ⏭️ [VM Pool] Skipping pre-warm for ${vm.id} - already allocated to ${poolEntry.allocatedTo}`);
                    return;
                }

                console.log(`🔥 [VM Pool] Pre-warming ${vm.id} with common dependencies...`);

                // CACHE SHARING: Try to copy cache from an existing pre-warmed VM
                // Prefer cache masters (always available), then unallocated VMs (avoid interrupting active projects)
                const cacheMaster = this.pool.find(v => v.prewarmed && v.isCacheMaster && v.machineId !== vm.id);
                const unallocatedVM = this.pool.find(v => v.prewarmed && !v.allocatedTo && v.machineId !== vm.id);
                const sourceVM = cacheMaster || unallocatedVM;

                if (sourceVM) {
                    // Fast path: Copy cache from existing VM (30s vs 3min)
                    console.log(`   💾 [Cache] Copying cache from VM ${sourceVM.machineId} to ${vm.id}...`);
                    const startTime = Date.now();

                    try {
                        // Setup cache directory structure
                        const setupCmd = `
                            mkdir -p /home/coder/.npm-global &&
                            mkdir -p /home/coder/volumes/pnpm-store &&
                            mkdir -p /home/coder/.local/share/pnpm &&
                            ln -snf /home/coder/volumes/pnpm-store /home/coder/.local/share/pnpm/store
                        `.replace(/\s+/g, ' ').trim();

                        await axios.post(`${agentUrl}/exec`, {
                            command: setupCmd,
                            cwd: '/home/coder'
                        }, {
                            timeout: 10000,
                            headers: { 'Fly-Force-Instance-Id': vm.id }
                        });

                        // Download and extract cache from source VM
                        // Using internal Fly.io network for fast transfer
                        const sourceAgentUrl = `http://${sourceVM.machineId}.vm.drape-workspaces.internal:13338`;
                        const downloadCmd = `curl -s "${sourceAgentUrl}/download?type=pnpm" | tar -xz -C /home/coder/`;

                        await axios.post(`${agentUrl}/exec`, {
                            command: downloadCmd,
                            cwd: '/home/coder'
                        }, {
                            timeout: 60000, // 1 min for download + extract
                            headers: { 'Fly-Force-Instance-Id': vm.id }
                        });

                        const elapsed = Date.now() - startTime;
                        console.log(`   ✅ Cache setup complete in ${elapsed}ms`);

                        // Mark VM as prewarmed (cache ready)
                        poolEntry.prewarmed = true;
                        console.log(`   ✅ Pre-warm complete for ${vm.id} (cache copied ⚡)`);
                        return;
                    } catch (cacheError) {
                        console.warn(`   ⚠️ Cache copy failed: ${cacheError.message}, falling back to full install`);
                        // Fall through to full install below
                    }
                }

                // Slow path: Full install (first VM or cache copy failed)
                console.log(`   📦 [Cache] No source VM available, doing full install...`);
                const prewarmCmd = `
                    # Setup pnpm global store location (shared across all projects)
                    mkdir -p /home/coder/volumes/pnpm-store
                    mkdir -p /home/coder/.local/share/pnpm
                    ln -snf /home/coder/volumes/pnpm-store /home/coder/.local/share/pnpm/store

                    # Create temp project for pre-warming
                    cd /home/coder/project &&

                    # MEGA package.json with ALL common deps (Next 14, 15, 16 + UI libs)
                    echo '{"name":"prewarm","version":"1.0.0","dependencies":{
                        "react":"^18.0.0",
                        "react-dom":"^18.0.0",
                        "next":"14.2.18",
                        "typescript":"^5.0.0",
                        "@types/react":"^18.0.0",
                        "@types/react-dom":"^18.0.0",
                        "lucide-react":"latest",
                        "axios":"latest",
                        "tailwindcss":"latest",
                        "@tailwindcss/typography":"latest",
                        "postcss":"latest",
                        "autoprefixer":"latest",
                        "clsx":"latest",
                        "framer-motion":"latest",
                        "zustand":"latest",
                        "@supabase/supabase-js":"latest",
                        "@supabase/auth-helpers-nextjs":"latest",
                        "sharp":"latest"
                    }}' > package.json &&

                    pnpm config set store-dir /home/coder/volumes/pnpm-store &&
                    pnpm config set package-import-method copy &&
                    CI=true pnpm install --no-frozen-lockfile &&

                    # Also pre-install Next 15 and 16 to global store
                    pnpm store add next@15.1.0 next@16.0.0 2>/dev/null || true &&

                    # Cleanup
                    rm -rf package.json pnpm-lock.yaml node_modules &&
                    chown -R coder:coder /home/coder
                `.replace(/\\s+/g, ' ').trim();

                await axios.post(`${agentUrl}/exec`, {
                    command: prewarmCmd,
                    cwd: '/home/coder'
                }, {
                    timeout: 180000, // 3 min for all deps
                    headers: { 'Fly-Force-Instance-Id': vm.id }
                });

                // Mark VM as prewarmed (global store populated)
                poolEntry.prewarmed = true;
                console.log(`   ✅ Pre-warm complete for ${vm.id} (global store ready ⚡)`);
            } catch (e) {
                console.warn(`   ⚠️ Pre-warm failed for ${vm.id}: ${e.message} (continuing anyway)`);
                // prewarmed stays false
            }
        });

        return { machineId: vm.id, agentUrl };
    }

    /**
     * Start the pool replenisher (runs every 2 minutes)
     */
    startPoolReplenisher() {
        // Replenish immediately
        setImmediate(() => {
            this.replenishPool().catch(e => {
                console.warn(`⚠️ [VM Pool] Replenish failed: ${e.message}`);
            });
        });

        // Then every 2 minutes
        setInterval(() => {
            this.replenishPool().catch(e => {
                console.warn(`⚠️ [VM Pool] Replenish failed: ${e.message}`);
            });

            // Also clean up old VMs
            this.cleanupOldVMs().catch(e => {
                console.warn(`⚠️ [VM Pool] Cleanup failed: ${e.message}`);
            });

            // Track pool stats (Phase 3.1)
            const metricsService = require('./metrics-service');
            metricsService.trackVMPool(this.getStats()).catch(e => {
                console.warn(`⚠️ [VM Pool] Metrics tracking failed: ${e.message}`);
            });
        }, 2 * 60 * 1000);
    }

    /**
     * Clean up old VMs that are too old or stale
     */
    async cleanupOldVMs() {
        const now = Date.now();
        const oldVMs = this.pool.filter(vm => {
            // NEVER remove cache masters - they're permanent infrastructure
            if (vm.isCacheMaster) {
                return false;
            }
            // Remove if: unallocated worker VM and older than MAX_VM_AGE_MS
            if (!vm.allocatedTo && (now - vm.createdAt) > this.MAX_VM_AGE_MS) {
                return true;
            }
            return false;
        });

        if (oldVMs.length === 0) {
            return;
        }

        console.log(`🧹 [VM Pool] Cleaning up ${oldVMs.length} old VMs...`);

        // Delete old VMs
        for (const vm of oldVMs) {
            try {
                // RE-CHECK: Ensure VM wasn't allocated while we were busy destroying the previous one!
                const currentVM = this.pool.find(v => v.machineId === vm.machineId);
                if (!currentVM || currentVM.allocatedTo) {
                    console.log(`   ⏭️ Skipping cleanup of VM ${vm.machineId} (it was allocated or removed)`);
                    continue;
                }

                await flyService.destroyMachine(vm.machineId);
                this.pool = this.pool.filter(v => v.machineId !== vm.machineId);
                console.log(`   ✅ Deleted old VM ${vm.machineId}`);
            } catch (e) {
                console.warn(`   ⚠️ Failed to delete VM ${vm.machineId}: ${e.message}`);
            }
        }
    }

    /**
     * Get pool statistics
     */
    getStats() {
        const cacheMasters = this.pool.filter(vm => vm.isCacheMaster);
        const workers = this.pool.filter(vm => !vm.isCacheMaster);
        const availableWorkers = workers.filter(vm => !vm.allocatedTo).length;
        const allocatedWorkers = workers.filter(vm => vm.allocatedTo).length;

        return {
            total: this.pool.length,
            workers: {
                total: workers.length,
                available: availableWorkers,
                allocated: allocatedWorkers,
                targetSize: this.calculateTargetPoolSize()
            },
            cacheMasters: {
                total: cacheMasters.length,
                prewarmed: cacheMasters.filter(vm => vm.prewarmed).length,
                targetSize: this.CACHE_MASTERS_COUNT
            },
            activeUsers: this.activeUsers
        };
    }
}

module.exports = new VMPoolManager();
