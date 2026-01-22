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

        // Persistent volume for Cache Master (survives restarts!)
        this.CACHE_VOLUME_ID = 'vol_45lp07o8k6oq38qr'; // 5GB in fra region

        // HARDCODED Cache Master protection - NEVER delete these!
        this.PROTECTED_CACHE_MASTERS = new Set([
            '90804e96fdde98', // ws-cache-* with vol_45lp07o8k6oq38qr (3GB pnpm cache)
            '3287d475fe1698', // ws-cache-master-v28 (legacy, keep for safety)
        ]);
        this.CACHE_MASTER_NAME_PATTERN = /^ws-cache-/; // Match all cache master names

        this.MAX_VM_AGE_MS = 30 * 60 * 1000; // 30 min max age (cost optimization)
        this.VM_IDLE_TIMEOUT_MS = 2 * 60 * 1000; // 2 min idle timeout (for session pooling)
        this.isInitialized = false;
    }

    /**
     * Check if a VM has pnpm cache (>500MB in store)
     * @param {string} machineId - Machine ID to check
     * @returns {Promise<{hasCache: boolean, sizeMB: number}>}
     */
    async checkVMHasCache(machineId) {
        try {
            const axios = require('axios');
            const agentUrl = 'https://drape-workspaces.fly.dev';

            const checkResult = await axios.post(`${agentUrl}/exec`, {
                command: 'du -sb /home/coder/volumes/pnpm-store 2>/dev/null | cut -f1 || echo "0"',
                cwd: '/home/coder'
            }, {
                timeout: 15000,
                headers: { 'Fly-Force-Instance-Id': machineId }
            });

            const bytes = parseInt(checkResult.data?.stdout?.trim() || '0', 10);
            const sizeMB = Math.round(bytes / 1024 / 1024);
            // Mega-cache è 1.2GB - richiediamo almeno 1GB per considerare il cache completo
            const hasCache = bytes > 1000 * 1024 * 1024; // >1GB

            return { hasCache, sizeMB };
        } catch (e) {
            console.warn(`   ⚠️ [Cache Check] Failed for ${machineId}: ${e.message}`);
            return { hasCache: false, sizeMB: 0 };
        }
    }

    /**
     * Check if a machine should NEVER be destroyed (hardened protection)
     * @param {string} machineId - Machine ID to check
     * @param {string} machineName - Machine name (optional, for pattern matching)
     * @returns {boolean} - true if protected
     */
    isProtectedCacheMaster(machineId, machineName = null) {
        // Check hardcoded list
        if (this.PROTECTED_CACHE_MASTERS.has(machineId)) {
            console.log(`🛡️ [PROTECTION] Machine ${machineId} is HARDCODED protected!`);
            return true;
        }

        // Check name pattern
        if (machineName && this.CACHE_MASTER_NAME_PATTERN.test(machineName)) {
            console.log(`🛡️ [PROTECTION] Machine ${machineId} (${machineName}) matches cache master pattern!`);
            return true;
        }

        // Check if in pool as cache master
        const inPool = this.pool.find(vm => vm.machineId === machineId);
        if (inPool?.isCacheMaster) {
            console.log(`🛡️ [PROTECTION] Machine ${machineId} is marked as cache master in pool!`);
            return true;
        }

        return false;
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
            // Include both worker VMs (ws-pool-*) and cache masters (ws-cache-*)
            const poolMachines = machines.filter(m =>
                (m.name.startsWith('ws-pool-') || m.name.startsWith('ws-cache-')) &&
                m.state !== 'destroyed'
            );

            // Adopt VMs in parallel with cache check
            // PRIORITY: Process protected cache masters first to ensure they're in pool before workers
            const protectedFirst = poolMachines.sort((a, b) => {
                const aProtected = this.PROTECTED_CACHE_MASTERS.has(a.id) ? 0 : 1;
                const bProtected = this.PROTECTED_CACHE_MASTERS.has(b.id) ? 0 : 1;
                return aProtected - bProtected;
            });

            const adoptPromises = protectedFirst
                .filter(vm => !this.pool.find(p => p.machineId === vm.id))
                .map(async (vm) => {
                    // Check if this VM is a cache master (by env var OR by name pattern OR protected list)
                    const isProtected = this.PROTECTED_CACHE_MASTERS.has(vm.id);
                    const isCacheMaster = isProtected || vm.config?.env?.CACHE_MASTER === 'true' || vm.name.startsWith('ws-cache-');
                    const vmType = isCacheMaster ? (isProtected ? 'Cache Master (PROTECTED)' : 'Cache Master') : 'warm VM';

                    // FIX: Check if VM actually has cache before marking as prewarmed
                    // Protected cache masters are ALWAYS prewarmed (they have the volume)
                    let prewarmed = isProtected || isCacheMaster;
                    if (!isCacheMaster && vm.state === 'started') {
                        const { hasCache, sizeMB } = await this.checkVMHasCache(vm.id);
                        prewarmed = hasCache;
                        console.log(`🏊 [VM Pool] Adopting ${vmType}: ${vm.id} (${vm.name}) - cache: ${sizeMB}MB, prewarmed: ${prewarmed}`);
                    } else {
                        console.log(`🏊 [VM Pool] Adopting ${vmType}: ${vm.id} (${vm.name}) - state: ${vm.state}`);
                    }

                    return {
                        machineId: vm.id,
                        agentUrl: 'https://drape-workspaces.fly.dev',
                        createdAt: Date.parse(vm.created_at) || Date.now(),
                        allocatedTo: null,
                        allocatedAt: null,
                        prewarmed: prewarmed,
                        cacheReady: prewarmed, // If has cache, it's ready for allocation
                        isCacheMaster: isCacheMaster,
                        image: vm.config?.image || flyService.DRAPE_IMAGE
                    };
                });

            const adoptedVMs = await Promise.all(adoptPromises);
            this.pool.push(...adoptedVMs);
        } catch (e) {
            console.warn(`⚠️ [VM Pool] Failed to adopt orphans: ${e.message}`);
        }

        // LOG: Show adoption results BEFORE replenishing
        const adoptedWorkers = this.pool.filter(vm => !vm.isCacheMaster);
        const adoptedCacheMasters = this.pool.filter(vm => vm.isCacheMaster);
        console.log(`📊 [VM Pool] Adoption complete: ${adoptedWorkers.length} workers, ${adoptedCacheMasters.length} cache masters`);

        // PHASE 2.2: Ensure adopted workers have cache (copy from cache master if missing)
        this.ensureCacheOnAdoptedWorkers().catch(e => {
            console.warn(`⚠️ [VM Pool] Failed to ensure cache on workers: ${e.message}`);
        });

        // Start the pool replenisher
        this.startPoolReplenisher();

        // Initial pool warmup - WAIT for it to complete to avoid race conditions
        // This ensures we don't create duplicates if adoption found VMs
        await this.replenishPool().catch(e => {
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
        // CRITICAL: Never allocate VMs that are still downloading cache (cacheReady must be true)
        // Try to get prewarmed worker VM first (has npm cache ready)
        let pooledVM = this.pool.find(vm =>
            !vm.allocatedTo &&
            vm.prewarmed &&
            vm.cacheReady === true && // MUST have cache fully downloaded (1GB+)
            !vm.isCacheMaster
        );

        // If no prewarmed worker VM, fallback to any available worker VM WITH cache ready
        if (!pooledVM) {
            pooledVM = this.pool.find(vm =>
                !vm.allocatedTo &&
                vm.cacheReady === true && // MUST have cache fully downloaded (1GB+)
                !vm.isCacheMaster
            );
        }

        // Log if VMs exist but aren't ready (helps debugging)
        if (!pooledVM) {
            const downloadingVMs = this.pool.filter(vm => !vm.allocatedTo && vm.cacheReady === false && !vm.isCacheMaster);
            if (downloadingVMs.length > 0) {
                console.log(`⏳ [VM Pool] ${downloadingVMs.length} VMs still downloading cache, not available yet`);
            }
            // DEBUG: Show all VMs in pool
            console.log(`🔍 [DEBUG] Pool has ${this.pool.length} VMs total:`);
            for (const vm of this.pool) {
                console.log(`   - ${vm.machineId}: allocated=${vm.allocatedTo}, prewarmed=${vm.prewarmed}, cacheReady=${vm.cacheReady}, isCacheMaster=${vm.isCacheMaster}`);
            }
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

                if (!machine) {
                    // VM was destroyed - remove from pool
                    console.warn(`⚠️ [VM Pool] VM ${pooledVM.machineId} is destroyed, removing from pool`);
                    this.pool = this.pool.filter(v => v.machineId !== pooledVM.machineId);
                    // Try again with next available VM
                    return await this.allocateVM(projectId);
                }

                if (machine.state !== 'started') {
                    // VM is stopped - try to restart it
                    console.log(`🔄 [VM Pool] VM ${pooledVM.machineId} is ${machine.state}, restarting...`);
                    try {
                        await flyService.startMachine(pooledVM.machineId);
                        await flyService.waitForMachine(pooledVM.machineId, 15000, 30000);
                        console.log(`✅ [VM Pool] VM ${pooledVM.machineId} restarted successfully`);
                    } catch (startErr) {
                        console.warn(`⚠️ [VM Pool] Failed to restart ${pooledVM.machineId}: ${startErr.message}, removing from pool`);
                        this.pool = this.pool.filter(v => v.machineId !== pooledVM.machineId);
                        return await this.allocateVM(projectId);
                    }
                }
            } catch (e) {
                console.warn(`⚠️ [VM Pool] VM ${pooledVM.machineId} check failed: ${e.message}, removing from pool`);
                this.pool = this.pool.filter(v => v.machineId !== pooledVM.machineId);
                // Try again with next available VM
                return await this.allocateVM(projectId);
            }

            // 🔑 NEW: Verify agent is responsive before allocating (avoid slow/busy VMs)
            try {
                const axios = require('axios');
                const startHealth = Date.now();
                const healthCheck = await axios.get(`${pooledVM.agentUrl}/health`, {
                    timeout: 5000,
                    headers: { 'Fly-Force-Instance-Id': pooledVM.machineId }
                });
                if (healthCheck.status !== 200) {
                    throw new Error(`Health check returned ${healthCheck.status}`);
                }
                console.log(`   ✅ Agent health check passed for ${pooledVM.machineId} (${Date.now() - startHealth}ms)`);
            } catch (healthErr) {
                console.warn(`⚠️ [VM Pool] VM ${pooledVM.machineId} agent not responding (${healthErr.message}), skipping...`);
                // Don't remove - might be temporarily busy
                // Try next available VM
                const nextVM = this.pool.find(vm =>
                    !vm.allocatedTo &&
                    vm.machineId !== pooledVM.machineId &&
                    vm.cacheReady !== false &&
                    !vm.isCacheMaster
                );
                if (nextVM) {
                    console.log(`🔄 [VM Pool] Trying next VM: ${nextVM.machineId}`);
                    pooledVM = nextVM;
                } else {
                    console.log(`⚠️ [VM Pool] No other VMs available, using busy VM ${pooledVM.machineId} anyway`);
                }
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

        // Pool empty - return null to let orchestrator handle with user-friendly error
        // This prevents cold-start VM creation during high demand
        console.log(`🐢 [VM Pool] Pool empty, no VMs available for allocation`);
        return null;
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
     * Mark a VM as allocated to a project (for recovered sessions from Redis)
     * This prevents the cleanup task from destroying VMs that are in use
     * @param {string} machineId - Machine ID to mark
     * @param {string} projectId - Project ID to allocate to
     * @returns {boolean} - true if VM was found and marked
     */
    markVMAllocated(machineId, projectId) {
        const vm = this.pool.find(v => v.machineId === machineId);

        if (!vm) {
            // VM not in pool - might have been created before pool manager started
            // Add it to the pool as allocated
            console.log(`📌 [VM Pool] Adding recovered VM ${machineId} to pool (allocated to ${projectId})`);
            this.pool.push({
                machineId,
                agentUrl: 'https://drape-workspaces.fly.dev',
                createdAt: Date.now(),
                allocatedTo: projectId,
                allocatedAt: Date.now(),
                prewarmed: true, // Assume prewarmed since it was being used
                cacheReady: true,
                isCacheMaster: false,
                image: flyService.DRAPE_IMAGE
            });
            return true;
        }

        // Mark as allocated
        vm.allocatedTo = projectId;
        vm.allocatedAt = Date.now();
        console.log(`📌 [VM Pool] Marked VM ${machineId} as allocated to ${projectId}`);
        return true;
    }

    /**
     * Ensure adopted workers have pnpm cache (copy from cache master if missing)
     * This fixes the case where workers are adopted but don't have the cache
     */
    async ensureCacheOnAdoptedWorkers() {
        const cacheMaster = this.pool.find(vm => vm.isCacheMaster && vm.prewarmed);
        if (!cacheMaster) {
            console.log(`⏳ [Cache] No cache master available yet, will retry later`);
            return;
        }

        // Get unallocated workers that might need cache
        const workers = this.pool.filter(vm => !vm.isCacheMaster && !vm.allocatedTo);
        if (workers.length === 0) {
            return;
        }

        console.log(`🔍 [Cache] Checking ${workers.length} adopted workers for cache...`);

        const axios = require('axios');
        const agentUrl = 'https://drape-workspaces.fly.dev';

        for (const worker of workers) {
            try {
                // Check if worker has cache
                const checkResult = await axios.post(`${agentUrl}/exec`, {
                    command: 'du -s /home/coder/volumes/pnpm-store 2>/dev/null | cut -f1',
                    cwd: '/home/coder'
                }, {
                    timeout: 10000,
                    headers: { 'Fly-Force-Instance-Id': worker.machineId }
                });

                const cacheSize = parseInt(checkResult.data?.stdout?.trim() || '0');

                if (cacheSize > 1000) { // > 1KB means cache exists
                    console.log(`   ✅ Worker ${worker.machineId} has cache (${Math.round(cacheSize/1024)}MB)`);
                    continue;
                }

                // Copy cache from cache master via internal Fly.io network (IPv6)
                console.log(`   📦 Worker ${worker.machineId} missing cache, copying from cache master...`);
                const startTime = Date.now();

                // Setup cache directory structure first
                const setupCmd = `
                    mkdir -p /home/coder/volumes/pnpm-store &&
                    mkdir -p /home/coder/.local/share/pnpm &&
                    ln -snf /home/coder/volumes/pnpm-store /home/coder/.local/share/pnpm/store
                `.replace(/\s+/g, ' ').trim();

                await axios.post(`${agentUrl}/exec`, {
                    command: setupCmd,
                    cwd: '/home/coder'
                }, {
                    timeout: 10000,
                    headers: { 'Fly-Force-Instance-Id': worker.machineId }
                });

                // Download cache from cache master via internal network
                const cacheUrl = `http://${cacheMaster.machineId}.vm.drape-workspaces.internal:13338`;
                const downloadCmd = `curl --max-time 600 -sS "${cacheUrl}/download?type=pnpm" -o /tmp/cache.tar.gz 2>&1 && tar -xzf /tmp/cache.tar.gz -C /home/coder/volumes/ 2>&1 && rm /tmp/cache.tar.gz && echo "CACHE_COPY_SUCCESS" || echo "CACHE_COPY_FAILED: curl exit code=$?"`;

                const downloadResult = await axios.post(`${agentUrl}/exec`, {
                    command: downloadCmd,
                    cwd: '/home/coder',
                    timeout: 600000 // 10 min exec timeout for large cache
                }, {
                    timeout: 650000, // HTTP timeout slightly longer than exec timeout
                    headers: { 'Fly-Force-Instance-Id': worker.machineId }
                });

                const elapsed = Date.now() - startTime;
                // Debug: log full response to understand failures
                console.log(`   📋 [Cache DEBUG] Response: stdout='${downloadResult.data?.stdout?.slice(0,200)}' stderr='${downloadResult.data?.stderr?.slice(0,200)}' exitCode=${downloadResult.data?.exitCode}`);
                const result = downloadResult.data?.stdout?.trim() || 'unknown';
                console.log(`   ${result === 'CACHE_COPY_SUCCESS' ? '✅' : '⚠️'} Cache copy completed in ${elapsed}ms: ${result}`);

            } catch (e) {
                console.warn(`   ⚠️ Failed to check/copy cache for ${worker.machineId}: ${e.message}`);
            }
        }
    }

    /**
     * Ensure we have the required number of cache masters
     * CRITICAL: Wait for at least one cache master to be prewarmed before returning
     * This ensures workers can auto-fetch cache on startup
     */
    async ensureCacheMasters() {
        const cacheMasters = this.pool.filter(vm => vm.isCacheMaster);
        const needed = this.CACHE_MASTERS_COUNT - cacheMasters.length;

        // Check if we already have a prewarmed cache master
        const prewarmedCacheMaster = this.pool.find(vm => vm.isCacheMaster && vm.prewarmed);
        if (prewarmedCacheMaster && needed <= 0) {
            return; // We have enough cache masters and at least one is ready
        }

        if (needed > 0) {
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

        // CRITICAL: Wait for at least one cache master to be prewarmed
        // This ensures workers can get CACHE_MASTER_ID env var for auto-fetch
        console.log(`⏳ [Cache Master] Waiting for cache master to be prewarmed...`);
        const startWait = Date.now();
        const maxWait = 120000; // 2 minutes max

        while (Date.now() - startWait < maxWait) {
            const readyCacheMaster = this.pool.find(vm => vm.isCacheMaster && vm.prewarmed);
            if (readyCacheMaster) {
                console.log(`✅ [Cache Master] Cache master ${readyCacheMaster.machineId} is ready (prewarmed)`);
                return;
            }
            await new Promise(resolve => setTimeout(resolve, 2000)); // Check every 2s
        }

        console.warn(`⚠️ [Cache Master] Timeout waiting for cache master prewarming (continuing anyway)`);
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
        } else {
            // WORKERS: Pass cache master ID for auto-fetch on startup
            // This bypasses Fly.io proxy issues by using internal IPv6 network
            // PRIORITY: Prefer protected cache masters (have volume with cache) over any other
            let cacheMaster = this.pool.find(v =>
                v.isCacheMaster && v.prewarmed && this.PROTECTED_CACHE_MASTERS.has(v.machineId)
            );
            // Fallback to any prewarmed cache master
            if (!cacheMaster) {
                cacheMaster = this.pool.find(v => v.isCacheMaster && v.prewarmed);
            }
            if (cacheMaster) {
                envVars.CACHE_MASTER_ID = cacheMaster.machineId;
                const isProtected = this.PROTECTED_CACHE_MASTERS.has(cacheMaster.machineId);
                console.log(`   📦 [Worker] Will auto-fetch cache from ${cacheMaster.machineId}${isProtected ? ' (with volume)' : ''}`);
            }
        }

        // Build machine options
        const machineOptions = {
            memory_mb: 2048,
            image: flyService.DRAPE_IMAGE,
            env: envVars,
            // CRITICAL: Disable auto-stop for cache masters to keep them running
            disableAutoStop: isCacheMaster
        };

        // PERSISTENCE: Mount volume on Cache Master for persistent pnpm cache
        if (isCacheMaster && this.CACHE_VOLUME_ID) {
            machineOptions.mounts = [{
                volume: this.CACHE_VOLUME_ID,
                path: '/home/coder/volumes/pnpm-store'
            }];
            console.log(`   💾 [Cache Master] Mounting persistent volume: ${this.CACHE_VOLUME_ID}`);
        }

        // Log auto-stop configuration
        if (isCacheMaster) {
            console.log(`   🛡️ [Cache Master] Auto-stop DISABLED (will stay running)`);
        }

        const vm = await flyService.createMachine(poolId, machineOptions);

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

        // FIX: Add VM to pool but NOT available for allocation until cache is ready
        const poolEntry = {
            machineId: vm.id,
            agentUrl,
            createdAt: Date.now(),
            allocatedTo: null,
            allocatedAt: null,
            prewarmed: false, // Will be set to true when pre-warming completes
            cacheReady: false, // CRITICAL: VM not available until cache download completes!
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

                // Wait for agent to be ready with retry (longer delay for Fly.io proxy warmup)
                const waitForAgent = async (maxRetries = 8, delayMs = 3000) => {
                    for (let i = 0; i < maxRetries; i++) {
                        try {
                            const resp = await axios.get(`${agentUrl}/health`, {
                                timeout: 5000,
                                headers: { 'Fly-Force-Instance-Id': vm.id }
                            });
                            if (resp.data?.status === 'ok') {
                                console.log(`   ✅ Agent ready for ${vm.id} after ${i + 1} attempts`);
                                // Extra delay to let Fly.io proxy fully stabilize
                                await new Promise(r => setTimeout(r, 2000));
                                return true;
                            }
                        } catch (e) {
                            console.log(`   ⏳ Waiting for agent ${vm.id} (attempt ${i + 1}/${maxRetries}): ${e.message}`);
                            if (i < maxRetries - 1) {
                                await new Promise(r => setTimeout(r, delayMs));
                            }
                        }
                    }
                    return false;
                };

                // Wait for VM agent to be fully ready
                const agentReady = await waitForAgent();
                if (!agentReady) {
                    console.warn(`   ⚠️ [VM Pool] Agent not ready for ${vm.id}, skipping pre-warm`);
                    return;
                }

                // Workers with CACHE_MASTER_ID auto-fetch cache on startup (handled by drape-agent.js)
                // WAIT for cache to be FULLY downloaded and extracted before marking worker as prewarmed
                const hasCacheMasterEnv = envVars.CACHE_MASTER_ID;
                if (hasCacheMasterEnv && !isCacheMaster) {
                    console.log(`   ⏳ [Auto-Cache] Worker ${vm.id} fetching cache from ${hasCacheMasterEnv}...`);
                    console.log(`      (Via internal IPv6: ${hasCacheMasterEnv}.vm.drape-workspaces.internal)`);

                    // Poll until cache extraction is COMPLETE (size stops growing)
                    const pollInterval = 5000; // Check every 5 seconds
                    const maxWaitTime = 360000; // Max 6 minutes (download + extraction)
                    const startTime = Date.now();
                    const minCacheSize = 1000 * 1024 * 1024; // 1GB minimum (mega-cache è 1.2GB)

                    let lastSize = 0;
                    let stableCount = 0; // Count consecutive polls with same size
                    const stableThreshold = 3; // Need 3 consecutive same-size polls (15 seconds stable)

                    while (Date.now() - startTime < maxWaitTime) {
                        try {
                            const checkCmd = `du -sb /home/coder/volumes/pnpm-store 2>/dev/null | cut -f1 || echo "0"`;
                            const result = await flyService.exec(agentUrl, checkCmd, '/tmp', vm.id, 15000, true);
                            const bytes = parseInt(result.stdout?.trim() || '0', 10);
                            const mb = (bytes / 1024 / 1024).toFixed(0);

                            // Check if size is stable (extraction complete)
                            if (bytes > 0 && bytes === lastSize) {
                                stableCount++;
                                if (stableCount >= stableThreshold && bytes >= minCacheSize) {
                                    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                                    console.log(`   ✅ [Cache Ready] Worker ${vm.id}: ${mb}MB cache fully extracted in ${elapsed}s`);
                                    poolEntry.prewarmed = true;
                                    poolEntry.cacheReady = true; // NOW available for allocation!
                                    return;
                                }
                            } else {
                                stableCount = 0; // Reset if size changed
                            }
                            lastSize = bytes;

                            // Log progress every 15 seconds
                            const elapsed = Date.now() - startTime;
                            if (elapsed > 0 && elapsed % 15000 < pollInterval) {
                                const status = stableCount > 0 ? `stable ${stableCount}/${stableThreshold}` : 'extracting...';
                                console.log(`      ⏳ Worker ${vm.id}: cache ${mb}MB (${status})`);
                            }
                        } catch (err) {
                            // Ignore errors during polling - VM might still be starting up
                            console.log(`      ⚠️ Worker ${vm.id}: poll error (${err.message}), retrying...`);
                            stableCount = 0; // Reset on error
                        }

                        await new Promise(resolve => setTimeout(resolve, pollInterval));
                    }

                    // Timeout - mark as ready ONLY if has at least 1GB cache
                    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                    const finalMb = (lastSize / 1024 / 1024).toFixed(0);

                    if (lastSize >= minCacheSize) {
                        console.log(`   ✅ [Cache Ready] Worker ${vm.id}: ${finalMb}MB cache (timeout but sufficient)`);
                        poolEntry.prewarmed = true;
                        poolEntry.cacheReady = true;
                    } else {
                        console.warn(`   ❌ [Cache Failed] Worker ${vm.id}: only ${finalMb}MB after ${elapsed}s (< 1GB required), NOT ready`);
                        poolEntry.prewarmed = false;
                        poolEntry.cacheReady = false;
                    }
                    return;
                }

                // Cache master needs full install to populate the cache
                if (!isCacheMaster) {
                    // Worker without CACHE_MASTER_ID - shouldn't happen, but skip prewarming
                    console.log(`   ⚠️ [Worker] No cache master configured, skipping prewarm`);
                    return;
                }

                // Cache master: Full pnpm install to populate the global store
                console.log(`   📦 [Cache Master] Doing full pnpm install to populate cache...`);
                const prewarmCmd = `
                    # Setup pnpm global store location (shared across all projects)
                    mkdir -p /home/coder/volumes/pnpm-store
                    mkdir -p /home/coder/.local/share/pnpm
                    ln -snf /home/coder/volumes/pnpm-store /home/coder/.local/share/pnpm/store

                    # Create temp project for pre-warming
                    cd /home/coder/project &&

                    # MEGA package.json - ALL popular packages for React/Next.js ecosystem
                    cat > package.json << 'PKGJSON'
{
  "name": "prewarm-cache",
  "version": "1.0.0",
  "dependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0",
    "next": "14.2.18",
    "typescript": "^5.0.0",
    "@types/react": "^18.0.0",
    "@types/react-dom": "^18.0.0",
    "@types/node": "^20.0.0",

    "tailwindcss": "^3.4.0",
    "@tailwindcss/typography": "latest",
    "@tailwindcss/forms": "latest",
    "postcss": "latest",
    "autoprefixer": "latest",
    "tailwind-merge": "latest",
    "class-variance-authority": "latest",
    "clsx": "latest",

    "lucide-react": "latest",
    "@heroicons/react": "latest",
    "react-icons": "latest",

    "framer-motion": "latest",
    "@react-spring/web": "latest",

    "zustand": "latest",
    "jotai": "latest",
    "@tanstack/react-query": "latest",
    "swr": "latest",

    "react-hook-form": "latest",
    "zod": "latest",
    "@hookform/resolvers": "latest",
    "yup": "latest",

    "axios": "latest",
    "ky": "latest",

    "@supabase/supabase-js": "latest",
    "@supabase/auth-helpers-nextjs": "latest",
    "next-auth": "latest",
    "@clerk/nextjs": "latest",
    "@auth/core": "latest",

    "prisma": "latest",
    "@prisma/client": "latest",
    "drizzle-orm": "latest",
    "drizzle-kit": "latest",

    "@radix-ui/react-dialog": "latest",
    "@radix-ui/react-dropdown-menu": "latest",
    "@radix-ui/react-popover": "latest",
    "@radix-ui/react-tooltip": "latest",
    "@radix-ui/react-select": "latest",
    "@radix-ui/react-tabs": "latest",
    "@radix-ui/react-accordion": "latest",
    "@radix-ui/react-avatar": "latest",
    "@radix-ui/react-checkbox": "latest",
    "@radix-ui/react-label": "latest",
    "@radix-ui/react-slot": "latest",
    "@radix-ui/react-switch": "latest",
    "@radix-ui/react-toast": "latest",

    "@headlessui/react": "latest",

    "date-fns": "latest",
    "dayjs": "latest",
    "lodash": "latest",
    "uuid": "latest",
    "nanoid": "latest",

    "sharp": "latest",
    "next-themes": "latest",
    "sonner": "latest",
    "react-hot-toast": "latest",
    "cmdk": "latest",
    "vaul": "latest",
    "embla-carousel-react": "latest",
    "recharts": "latest",
    "@tremor/react": "latest",
    "react-markdown": "latest",
    "highlight.js": "latest",
    "prismjs": "latest",

    "stripe": "latest",
    "@stripe/stripe-js": "latest",

    "resend": "latest",
    "@react-email/components": "latest",

    "openai": "latest",
    "@anthropic-ai/sdk": "latest",
    "ai": "latest",

    "socket.io-client": "latest",
    "pusher-js": "latest",

    "i18next": "latest",
    "react-i18next": "latest",
    "next-intl": "latest"
  }
}
PKGJSON

                    pnpm config set store-dir /home/coder/volumes/pnpm-store &&
                    pnpm config set package-import-method copy &&
                    CI=true pnpm install --no-frozen-lockfile &&

                    # Also pre-install Next 15 and 16 to global store
                    pnpm store add next@15.1.0 next@15.3.0 next@16.0.0 next@16.1.0 2>/dev/null || true &&

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
                poolEntry.cacheReady = true; // Cache master is now ready
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
        // NOTE: Don't call replenishPool() here - it's already called by initialize()
        // This prevents duplicate cache master creation from race conditions

        // Replenish every 2 minutes
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
     * Also cleans up ORPHAN VMs on Fly.io that aren't in our pool (prevents duplicates!)
     */
    async cleanupOldVMs() {
        const now = Date.now();

        // DEBUG: Log pool state before cleanup
        console.log(`🔍 [Cleanup DEBUG] Pool state before cleanup:`);
        this.pool.forEach(vm => {
            const ageMinutes = Math.round((now - vm.createdAt) / 60000);
            console.log(`   - ${vm.machineId}: isCacheMaster=${vm.isCacheMaster}, allocated=${vm.allocatedTo || 'none'}, age=${ageMinutes}min`);
        });

        // PHASE 1: Clean up ORPHAN VMs on Fly.io that aren't in our pool
        // This prevents duplicate VMs from being created when adoption fails
        try {
            const machines = await flyService.listMachines();
            const poolMachines = machines.filter(m =>
                (m.name.startsWith('ws-pool-') || m.name.startsWith('ws-cache-')) &&
                m.state !== 'destroyed'
            );

            const poolMachineIds = new Set(this.pool.map(vm => vm.machineId));
            const orphanVMs = poolMachines.filter(m => !poolMachineIds.has(m.id));

            if (orphanVMs.length > 0) {
                console.log(`🧹 [Cleanup] Found ${orphanVMs.length} potential ORPHAN VMs on Fly.io (not in pool):`);
                for (const orphan of orphanVMs) {
                    // HARDENED SAFETY: Use multi-layer protection for cache masters
                    if (this.isProtectedCacheMaster(orphan.id, orphan.name)) {
                        console.log(`   🛡️ Adopting protected cache master: ${orphan.id} (${orphan.name})`);
                        // Re-adopt it instead of destroying
                        this.pool.push({
                            machineId: orphan.id,
                            agentUrl: 'https://drape-workspaces.fly.dev',
                            createdAt: Date.parse(orphan.created_at) || Date.now(),
                            allocatedTo: null,
                            allocatedAt: null,
                            prewarmed: true,
                            cacheReady: true, // Cache masters are always ready
                            isCacheMaster: true,
                            image: orphan.config?.image || flyService.DRAPE_IMAGE
                        });
                        continue;
                    }

                    // CRITICAL FIX: Don't destroy VMs that were just created (grace period: 5 minutes)
                    const vmAge = Date.now() - Date.parse(orphan.created_at);
                    const GRACE_PERIOD_MS = 5 * 60 * 1000; // 5 minutes
                    if (vmAge < GRACE_PERIOD_MS) {
                        const ageMinutes = Math.round(vmAge / 60000);
                        console.log(`   ⏰ Skipping recent VM: ${orphan.id} (age: ${ageMinutes}min < 5min grace period)`);
                        // ADOPT instead of destroying - it might be a valid VM that just wasn't added to pool yet
                        console.log(`   🔄 Adopting recent VM: ${orphan.id} (${orphan.name})`);
                        this.pool.push({
                            machineId: orphan.id,
                            agentUrl: 'https://drape-workspaces.fly.dev',
                            createdAt: Date.parse(orphan.created_at) || Date.now(),
                            allocatedTo: null, // We don't know if it's allocated, mark as available for now
                            allocatedAt: null,
                            prewarmed: false, // Might still be pre-warming
                            cacheReady: false, // NOT available - might still be downloading cache
                            isCacheMaster: false,
                            image: orphan.config?.image || flyService.DRAPE_IMAGE
                        });
                        continue;
                    }

                    // Adopt orphan VMs based on state
                    if (orphan.state === 'started') {
                        // Running VM - check cache and adopt
                        const { hasCache, sizeMB } = await this.checkVMHasCache(orphan.id);
                        console.log(`   🔄 VM ${orphan.id} is STARTED but not in pool - adopting (cache: ${sizeMB}MB, cacheReady: ${hasCache})`);
                        this.pool.push({
                            machineId: orphan.id,
                            agentUrl: 'https://drape-workspaces.fly.dev',
                            createdAt: Date.parse(orphan.created_at) || Date.now(),
                            allocatedTo: null,
                            allocatedAt: null,
                            prewarmed: hasCache,
                            cacheReady: hasCache, // Only available if has cache
                            isCacheMaster: false,
                            image: orphan.config?.image || flyService.DRAPE_IMAGE
                        });
                        continue;
                    }

                    // Stopped VM - adopt it instead of destroying (allocateVM can restart it)
                    // With auto_destroy: false, stopped VMs are kept by Fly.io
                    // We adopt them so they can be restarted on demand
                    const ageMinutesOrphan = Math.round(vmAge / 60000);
                    if (ageMinutesOrphan < 30) {
                        // VM is stopped but not too old - adopt it
                        // Set cacheReady: true so allocateVM will consider it (as fallback)
                        // allocateVM will check actual state and restart if needed
                        console.log(`   🔄 VM ${orphan.id} is ${orphan.state} (age: ${ageMinutesOrphan}min) - adopting for restart on demand`);
                        this.pool.push({
                            machineId: orphan.id,
                            agentUrl: 'https://drape-workspaces.fly.dev',
                            createdAt: Date.parse(orphan.created_at) || Date.now(),
                            allocatedTo: null,
                            allocatedAt: null,
                            prewarmed: false, // Not prewarmed - will be fallback choice
                            cacheReady: true, // Allow selection - allocateVM will restart if stopped
                            isCacheMaster: false,
                            image: orphan.config?.image || flyService.DRAPE_IMAGE
                        });
                        continue;
                    }

                    // Only destroy if: very old (>30 min) AND stopped
                    console.log(`   🗑️ Destroying old orphan worker: ${orphan.id} (${orphan.name}) - age: ${ageMinutesOrphan}min, state: ${orphan.state}`);
                    try {
                        await flyService.destroyMachine(orphan.id);
                        console.log(`   ✅ Deleted orphan VM ${orphan.id}`);
                    } catch (e) {
                        console.warn(`   ⚠️ Failed to delete orphan ${orphan.id}: ${e.message}`);
                    }
                }
            }
        } catch (e) {
            console.warn(`   ⚠️ Failed to check for orphan VMs: ${e.message}`);
        }

        // PHASE 2: Clean up old VMs in our pool
        // Count available workers BEFORE cleanup
        const availableWorkers = this.pool.filter(vm => !vm.isCacheMaster && !vm.allocatedTo);
        const targetSize = this.calculateTargetPoolSize();

        // Sort workers by age (oldest first) for cleanup
        const sortedWorkers = availableWorkers
            .filter(vm => !vm.isCacheMaster)
            .sort((a, b) => a.createdAt - b.createdAt);

        // Calculate how many EXCESS VMs we have beyond target
        const excessCount = Math.max(0, availableWorkers.length - targetSize);

        const oldVMs = [];
        let deletedCount = 0;

        for (const vm of sortedWorkers) {
            // HARDENED: NEVER remove cache masters
            if (vm.isCacheMaster || this.isProtectedCacheMaster(vm.machineId)) {
                console.log(`   🛡️ [Cleanup] Protecting cache master: ${vm.machineId}`);
                continue;
            }

            // Skip allocated VMs
            if (vm.allocatedTo) {
                continue;
            }

            const ageMinutes = Math.round((now - vm.createdAt) / 60000);

            // Delete VM if:
            // 1. Pool exceeds target AND this is one of the oldest excess VMs
            // 2. OR VM is older than MAX_VM_AGE_MS (30 min) AND pool is above BASE_POOL_SIZE
            const isExcess = deletedCount < excessCount;
            const isOld = (now - vm.createdAt) > this.MAX_VM_AGE_MS;
            const aboveMinimum = (availableWorkers.length - deletedCount) > this.BASE_POOL_SIZE;

            if (isExcess || (isOld && aboveMinimum)) {
                const reason = isExcess ? `excess (pool: ${availableWorkers.length} > target: ${targetSize})` : `age: ${ageMinutes}min > 30min`;
                console.log(`   🗑️ [Cleanup] Marking for deletion: ${vm.machineId} (${reason})`);
                oldVMs.push(vm);
                deletedCount++;
            } else {
                console.log(`   💎 [Cleanup] Keeping worker: ${vm.machineId} (age: ${ageMinutes}min, prewarmed: ${vm.prewarmed})`);
            }
        }

        if (oldVMs.length === 0) {
            console.log(`   ✅ [Cleanup] No old VMs to clean up`);
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

                // HARDENED SAFETY: Triple-check it's not a cache master before destroying
                if (currentVM.isCacheMaster || this.isProtectedCacheMaster(vm.machineId)) {
                    console.error(`   🚨 [CRITICAL BUG] Attempted to destroy cache master ${vm.machineId}! Aborting.`);
                    continue;
                }

                console.log(`   🗑️ [Cleanup] Destroying VM ${vm.machineId}...`);
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
