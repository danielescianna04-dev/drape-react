/**
 * Container Pool Manager
 * Maintains a warm pool of Docker containers on Hetzner for instant workspace allocation.
 *
 * Architecture:
 * - Containers run on Hetzner dedicated servers with shared NVMe volumes
 * - pnpm store is a shared read-only mount (/data/pnpm-store) - zero cache setup
 * - Containers start in <1s - no need for stopped/warm states
 * - Each container gets a unique host port mapping for agent (13338) and preview (3000)
 */

const containerService = require('./container-service');

class ContainerPoolManager {
    constructor() {
        this.pool = []; // { machineId, agentUrl, previewUrl, server, createdAt, allocatedTo, allocatedAt }
        this.TOTAL_POOL_SIZE = parseInt(process.env.DOCKER_POOL_SIZE) || 10;
        this.MAX_POOL_SIZE = 100;
        this.activeUsers = 0;

        // Auto-scaling
        this.WATERMARK_STEP = 3;
        this.WATERMARK_ADD = 5;
        this.BURST_THRESHOLD = 10;
        this.burstMode = false;
        this.projectsCreating = new Map();

        this.VM_IDLE_TIMEOUT_MS = 20 * 60 * 1000;
        this.isInitialized = false;
    }

    // ============ BURST DETECTION ============

    trackProjectCreation(projectId) {
        this.projectsCreating.set(projectId, Date.now());
        console.log(`📊 [Auto-Scale] Tracking project creation: ${projectId} (${this.projectsCreating.size} creating)`);
        this.checkBurstMode();
    }

    removeProjectCreation(projectId) {
        this.projectsCreating.delete(projectId);
        console.log(`📊 [Auto-Scale] Project creation finished: ${projectId} (${this.projectsCreating.size} creating)`);
        this.checkBurstMode();
    }

    checkBurstMode() {
        const shouldEnterBurst = this.projectsCreating.size >= this.BURST_THRESHOLD;
        if (shouldEnterBurst && !this.burstMode) {
            console.log(`🚀 [BURST MODE] ${this.projectsCreating.size} projects creating - scaling up!`);
            this.burstMode = true;
            this.scaleToTarget(this.TOTAL_POOL_SIZE).catch(e => {
                console.warn(`⚠️ [BURST MODE] Failed to scale: ${e.message}`);
            });
        } else if (!shouldEnterBurst && this.burstMode) {
            console.log(`📉 [BURST MODE] Exiting burst mode`);
            this.burstMode = false;
        }
    }

    calculateTargetRunningContainers() {
        const allocatedCount = this.pool.filter(c => c.allocatedTo).length;
        if (this.burstMode) return this.TOTAL_POOL_SIZE;

        const watermarkBonus = Math.floor(allocatedCount / this.WATERMARK_STEP) * this.WATERMARK_ADD;
        const target = Math.min(this.TOTAL_POOL_SIZE + watermarkBonus, this.MAX_POOL_SIZE);

        console.log(`📊 [Auto-Scale] Allocated: ${allocatedCount}, Target running: ${target}`);
        return target;
    }

    async scaleToTarget(targetRunning) {
        const currentRunning = this.pool.length;
        const needed = targetRunning - currentRunning;

        if (needed <= 0) {
            console.log(`✅ [Auto-Scale] Already at target: ${currentRunning}/${targetRunning} running`);
            return;
        }

        const canCreate = Math.min(needed, this.MAX_POOL_SIZE - currentRunning);
        if (canCreate > 0) {
            console.log(`🏗️ [Auto-Scale] Creating ${canCreate} Docker containers...`);
            const results = await Promise.allSettled(
                Array(canCreate).fill(null).map(() => this.createContainer())
            );
            const created = results.filter(r => r.status === 'fulfilled').length;
            console.log(`✅ [Auto-Scale] Created ${created}/${canCreate}`);
        }
    }

    updateActiveUsers(count) {
        this.activeUsers = count;
        console.log(`📊 [Pool] Active users: ${count}`);
    }

    // ============ INITIALIZATION ============

    async initialize() {
        if (this.isInitialized) return;

        console.log(`🏊 [Pool] Initializing Docker container pool...`);

        // Ensure Docker network exists
        await containerService.initializeNetwork();

        // Adopt existing containers and start stopped ones
        try {
            const containers = await containerService.listContainers();
            const workspaceContainers = containers.filter(c =>
                c.labels?.drape === 'workspace' && c.state !== 'destroyed'
            );

            const stoppedContainers = [];

            for (const c of workspaceContainers) {
                if (this.pool.find(p => p.machineId === c.id)) continue;

                this.pool.push({
                    machineId: c.id,
                    agentUrl: c.agentUrl || null,
                    previewUrl: c.previewUrl || null,
                    server: c.region || c.labels?.['drape.server'],
                    createdAt: Date.parse(c.created_at) || Date.now(),
                    allocatedTo: c.labels?.['drape.project']?.startsWith('pool-') ? null : (c.labels?.['drape.project'] || null),
                    allocatedAt: null
                });

                console.log(`🏊 [Pool] Adopted container: ${c.id.substring(0, 12)} (${c.state})`);

                // Track stopped containers for auto-start
                if (c.state === 'stopped' || !c.agentUrl) {
                    stoppedContainers.push(c.id);
                }
            }

            console.log(`📊 [Pool] Adopted ${workspaceContainers.length} Docker containers`);

            // Auto-start stopped containers in parallel (non-blocking)
            if (stoppedContainers.length > 0) {
                console.log(`▶️ [Pool] Starting ${stoppedContainers.length} stopped containers...`);
                this._startStoppedContainers(stoppedContainers);
            }
        } catch (e) {
            console.warn(`⚠️ [Pool] Failed to adopt containers: ${e.message}`);
        }

        this.startPoolReplenisher();
        await this.replenishPool().catch(e => {
            console.warn(`⚠️ [Pool] Initial warmup failed: ${e.message}`);
        });

        this.isInitialized = true;
        console.log(`✅ [Pool] Pool initialized (Docker)`);
    }

    /**
     * Start stopped containers in background and update their agentUrl
     */
    async _startStoppedContainers(containerIds) {
        const startPromises = containerIds.map(async (id) => {
            try {
                await containerService.startContainer(id);
                const info = await this._refreshContainerInfo(id);
                if (info?.agentUrl) {
                    console.log(`   ✅ [Pool] Started ${id.substring(0, 12)} → ${info.agentUrl}`);
                }
            } catch (e) {
                console.warn(`   ⚠️ [Pool] Failed to start ${id.substring(0, 12)}: ${e.message}`);
            }
        });
        // Run in parallel, don't await in init (non-blocking)
        Promise.all(startPromises).then(() => {
            const running = this.pool.filter(p => p.agentUrl).length;
            console.log(`✅ [Pool] All containers started. ${running}/${this.pool.length} running`);
        }).catch(() => {});
    }

    /**
     * Refresh container info (port mappings) from Docker after start
     */
    async _refreshContainerInfo(containerId) {
        try {
            const containers = await containerService.listContainers();
            const c = containers.find(c => c.id === containerId);
            if (c?.agentUrl) {
                const poolEntry = this.pool.find(p => p.machineId === containerId);
                if (poolEntry) {
                    poolEntry.agentUrl = c.agentUrl;
                    poolEntry.previewUrl = c.previewUrl;
                }
                return c;
            }
        } catch (e) {
            console.warn(`⚠️ [Pool] Failed to refresh info for ${containerId.substring(0, 12)}: ${e.message}`);
        }
        return null;
    }

    // ============ ALLOCATION ============

    async allocateVM(projectId) {
        const now = Date.now();
        const axios = require('axios');

        // Find unallocated container — prioritize those with agentUrl (running)
        const candidates = this.pool.filter(c =>
            !c.allocatedTo &&
            (!c.gracePeriodEnds || now > c.gracePeriodEnds)
        );

        // Sort: containers WITH agentUrl first (likely running), then without
        candidates.sort((a, b) => {
            if (a.agentUrl && !b.agentUrl) return -1;
            if (!a.agentUrl && b.agentUrl) return 1;
            return 0;
        });

        let container = null;

        // Try each candidate with health check
        for (const candidate of candidates) {
            if (!candidate.agentUrl) {
                // Stopped container — try to start it
                try {
                    console.log(`▶️ [Pool] Starting stopped container ${candidate.machineId.substring(0, 12)}...`);
                    await containerService.startContainer(candidate.machineId);
                    // Get updated info with port mappings
                    const updatedInfo = await this._refreshContainerInfo(candidate.machineId);
                    if (updatedInfo?.agentUrl) {
                        candidate.agentUrl = updatedInfo.agentUrl;
                        candidate.previewUrl = updatedInfo.previewUrl;
                        // Wait for agent to be ready
                        await containerService.waitForContainer(candidate.machineId, 5000, 10000);
                        container = candidate;
                        break;
                    }
                } catch (e) {
                    console.warn(`⚠️ [Pool] Failed to start ${candidate.machineId.substring(0, 12)}: ${e.message}`);
                    continue;
                }
            }

            try {
                const healthCheck = await axios.get(`${candidate.agentUrl}/health`, {
                    timeout: 2000
                });
                if (healthCheck.status === 200) {
                    container = candidate;
                    break;
                }
            } catch (e) {
                console.warn(`⚠️ [Pool] Container ${candidate.machineId.substring(0, 12)} not responding, skipping`);
                continue;
            }
        }

        if (container) {
            container.allocatedTo = projectId;
            container.allocatedAt = Date.now();

            console.log(`⚡ [Pool] Allocated container ${container.machineId.substring(0, 12)} to ${projectId}`);

            // Async replenish
            this.replenishPool().catch(e => {
                console.warn(`⚠️ [Pool] Replenish failed: ${e.message}`);
            });

            return {
                machineId: container.machineId,
                agentUrl: container.agentUrl,
                previewUrl: container.previewUrl,
                prewarmed: true
            };
        }

        console.log(`🐢 [Pool] Pool empty, no containers available`);
        return null;
    }

    // ============ VM STATE ============

    getVMState(machineId) {
        return this.pool.find(v => v.machineId === machineId) || null;
    }

    getCacheMaster() {
        return null; // No cache masters - shared NVMe volume
    }

    // ============ RELEASE ============

    async releaseVM(machineId, keepNodeModules = true) {
        const vm = this.pool.find(v => v.machineId === machineId);
        if (!vm) {
            console.warn(`⚠️ [Pool] Cannot release ${machineId} - not in pool`);
            return;
        }

        // Kill dev server
        console.log(`🔪 [Pool] Killing dev server on ${machineId.substring(0, 12)}...`);
        try {
            const killCmd = 'lsof -ti:3000 | xargs -r kill -9 2>/dev/null || fuser -k 3000/tcp 2>/dev/null || true';
            await containerService.exec(vm.agentUrl, killCmd, '/home/coder', machineId, 3000);
        } catch (e) {
            console.warn(`⚠️ [Pool] Kill failed: ${e.message}`);
        }

        vm.allocatedTo = null;
        vm.allocatedAt = null;
        vm.lastReleasedAt = Date.now();
        vm.gracePeriodEnds = Date.now() + 2000;

        if (keepNodeModules) {
            try {
                const cleanCmd = `find /home/coder/project -mindepth 1 -maxdepth 1 -not -name 'node_modules' -not -name '.git' -not -name '.package-json-hash' -exec rm -rf {} +`;
                await containerService.exec(vm.agentUrl, cleanCmd, '/home/coder', machineId);
                console.log(`🧹 [Pool] Released ${machineId.substring(0, 12)} (node_modules preserved)`);
            } catch (e) {
                console.warn(`⚠️ [Pool] Cleanup failed: ${e.message}`);
            }
        }
    }

    markVMAllocated(machineId, projectId, agentUrl = null) {
        const vm = this.pool.find(v => v.machineId === machineId);
        if (!vm) {
            console.log(`📌 [Pool] Adding recovered container ${machineId.substring(0, 12)} to pool`);
            this.pool.push({
                machineId,
                agentUrl: agentUrl || null,
                createdAt: Date.now(),
                allocatedTo: projectId,
                allocatedAt: Date.now()
            });
            return true;
        }

        vm.allocatedTo = projectId;
        vm.allocatedAt = Date.now();
        if (agentUrl) vm.agentUrl = agentUrl;
        console.log(`📌 [Pool] Marked ${machineId.substring(0, 12)} as allocated to ${projectId}`);
        return true;
    }

    // ============ REPLENISHMENT ============

    async replenishPool() {
        const total = this.pool.length;
        const running = this.pool.filter(c => c.agentUrl).length;

        console.log(`📊 [Pool] Status: ${running} running, ${total} total (target: ${this.TOTAL_POOL_SIZE})`);

        const newNeeded = this.TOTAL_POOL_SIZE - total;
        if (newNeeded > 0) {
            console.log(`🏊 [Pool] Creating ${newNeeded} new containers...`);
            const results = await Promise.allSettled(
                Array(newNeeded).fill(null).map(() => this.createContainer())
            );
            const successful = results.filter(r => r.status === 'fulfilled').length;
            if (successful > 0) console.log(`✅ [Pool] Added ${successful} containers`);
        }

        const target = this.calculateTargetRunningContainers();
        await this.scaleToTarget(target);
    }

    // ============ CREATE CONTAINER ============

    async createContainer() {
        const poolId = `pool-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        const vm = await containerService.createContainer(poolId, {
            memory_mb: parseInt(process.env.DOCKER_CONTAINER_MEMORY) || 4096,
            cpus: parseInt(process.env.DOCKER_CONTAINER_CPUS) || 4,
            env: {
                POOL_VM: 'true',
                INFRA_BACKEND: 'docker',
                NODE_OPTIONS: '--max-old-space-size=3072',
                NEXT_TELEMETRY_DISABLED: '1',
                UV_THREADPOOL_SIZE: '4',
                PNPM_HOME: '/home/coder/.local/share/pnpm'
            }
        });

        // Wait for agent to be healthy
        const axios = require('axios');
        for (let i = 0; i < 10; i++) {
            try {
                await axios.get(`${vm.agentUrl}/health`, { timeout: 2000 });
                break;
            } catch (e) {
                if (i === 9) throw new Error('Agent not ready after 20s');
                await new Promise(r => setTimeout(r, 2000));
            }
        }

        const poolEntry = {
            machineId: vm.id,
            agentUrl: vm.agentUrl,
            previewUrl: vm.previewUrl || null,
            server: vm.server,
            createdAt: Date.now(),
            allocatedTo: null,
            allocatedAt: null
        };
        this.pool.push(poolEntry);

        console.log(`🔥 [Pool] Created container ${vm.id.substring(0, 12)} (cache ready via volume mount)`);
        return { machineId: vm.id, agentUrl: vm.agentUrl };
    }

    // ============ PERIODIC TASKS ============

    startPoolReplenisher() {
        setInterval(() => {
            this.replenishPool().catch(e => console.warn(`⚠️ [Pool] Replenish failed: ${e.message}`));
            this.cleanupOldContainers().catch(e => console.warn(`⚠️ [Pool] Cleanup failed: ${e.message}`));

            try {
                const metricsService = require('./metrics-service');
                metricsService.trackVMPool(this.getStats()).catch(() => {});
            } catch (e) {}
        }, 2 * 60 * 1000);
    }

    // ============ CLEANUP ============

    async cleanupOldContainers() {
        const unallocated = this.pool.filter(c => !c.allocatedTo);
        const excess = unallocated.length - this.TOTAL_POOL_SIZE;

        if (excess <= 0) return;

        // Sort by idle time, destroy oldest first
        const sorted = unallocated.sort((a, b) => (a.lastReleasedAt || a.createdAt) - (b.lastReleasedAt || b.createdAt));

        for (let i = 0; i < excess; i++) {
            const c = sorted[i];
            try {
                await containerService.destroyContainer(c.machineId);
                this.pool = this.pool.filter(v => v.machineId !== c.machineId);
                console.log(`🗑️ [Cleanup] Destroyed excess container ${c.machineId.substring(0, 12)}`);
            } catch (e) {
                console.warn(`⚠️ Failed to destroy ${c.machineId.substring(0, 12)}: ${e.message}`);
            }
        }
    }

    // ============ RECYCLE ALL ============

    async recycleAll() {
        const unallocated = this.pool.filter(c => !c.allocatedTo);
        console.log(`♻️ [Pool] Recycling ${unallocated.length} unallocated containers...`);

        let destroyed = 0;
        for (const c of unallocated) {
            try {
                await containerService.destroyContainer(c.machineId);
                this.pool = this.pool.filter(v => v.machineId !== c.machineId);
                destroyed++;
                console.log(`🗑️ [Pool] Destroyed ${c.machineId.substring(0, 12)} (${destroyed}/${unallocated.length})`);
            } catch (e) {
                console.warn(`⚠️ [Pool] Failed to destroy ${c.machineId.substring(0, 12)}: ${e.message}`);
            }
        }

        console.log(`♻️ [Pool] Destroyed ${destroyed} containers, creating new ones...`);
        await this.replenishPool();

        return { destroyed, newPool: this.pool.length };
    }

    // ============ STATS ============

    getStats() {
        const allocated = this.pool.filter(c => c.allocatedTo);
        const available = this.pool.filter(c => !c.allocatedTo);

        return {
            backend: 'docker',
            total: this.pool.length,
            workers: {
                total: this.pool.length,
                running: this.pool.length,
                stopped: 0,
                availableRunning: available.length,
                availableStopped: 0,
                allocated: allocated.length,
                targetTotal: this.TOTAL_POOL_SIZE,
                minRunning: this.TOTAL_POOL_SIZE
            },
            cacheMasters: { total: 0, prewarmed: 0, targetSize: 0 },
            activeUsers: this.activeUsers,
            config: {
                totalPoolSize: this.TOTAL_POOL_SIZE,
                minRunningVMs: this.TOTAL_POOL_SIZE,
                idleTimeoutMin: this.VM_IDLE_TIMEOUT_MS / 60000
            }
        };
    }
}

module.exports = new ContainerPoolManager();
