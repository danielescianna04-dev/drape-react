/**
 * Angular Build Cache Service
 * Local NVMe cache on Hetzner — zero network transfers
 * Per-project .angular cache to skip recompilation on VM switch
 *
 * Cache stored at /data/cache/angular-build/{projectId}.tar.gz
 * Shared volume mounted in all containers
 */

const CACHE_DIR = '/data/cache/angular-build';

class AngularCacheService {
    constructor() {
        this.enabled = true;
        this.maxCacheAgeDays = 7;
    }

    /**
     * Check if cache exists for this project (local NVMe)
     */
    async exists(projectId, agentUrl, machineId) {
        try {
            const containerService = require('./container-service');
            const cachePath = `${CACHE_DIR}/${projectId}.tar.gz`;

            const result = await containerService.exec(agentUrl,
                `test -f ${cachePath} && stat -c '%Y %s' ${cachePath} || echo "NOT_FOUND"`,
                '/home/coder', machineId, 5000, true);

            const output = (result.stdout || '').trim();
            if (output === 'NOT_FOUND') {
                return { exists: false };
            }

            const [mtime, size] = output.split(' ');
            const ageMs = Date.now() - parseInt(mtime) * 1000;
            const ageDays = ageMs / (1000 * 60 * 60 * 24);

            if (ageDays > this.maxCacheAgeDays) {
                console.log(`   ⚠️ [AngularCache] Cache for ${projectId} is stale (${ageDays.toFixed(1)} days old)`);
                return { exists: false, stale: true, ageDays };
            }

            console.log(`   ✅ [AngularCache] Cache found for ${projectId} (${ageDays.toFixed(1)} days old)`);
            return { exists: true, ageDays, size: parseInt(size) };
        } catch (error) {
            console.error(`❌ [AngularCache] Error checking existence:`, error.message);
            return { exists: false };
        }
    }

    /**
     * Save .angular cache to local NVMe
     */
    async save(projectId, vmAgentUrl, machineId) {
        const startTime = Date.now();
        console.log(`\n💾 [AngularCache] Saving .angular for ${projectId} (local NVMe)...`);

        try {
            const containerService = require('./container-service');

            // 1. Check if .angular exists
            const checkCmd = `test -d /home/coder/project/.angular && du -sh /home/coder/project/.angular | cut -f1 || echo "not found"`;
            const checkResult = await containerService.exec(vmAgentUrl, checkCmd, '/home/coder', machineId, 10000, true);

            if (checkResult.stdout.includes('not found')) {
                console.log(`   ⚠️ [AngularCache] No .angular folder found, skipping save`);
                return { success: false, error: '.angular not found' };
            }

            const folderSize = checkResult.stdout.trim();
            console.log(`   📦 [AngularCache] .angular folder size: ${folderSize}`);

            // 2. Create tarball directly to NVMe cache
            const cachePath = `${CACHE_DIR}/${projectId}.tar.gz`;
            const tempPath = `${CACHE_DIR}/${projectId}.tmp.tar.gz`;

            const createCmd = `mkdir -p ${CACHE_DIR} && cd /home/coder/project && tar -cf - --exclude='*.lock' --exclude='*.tmp' .angular/ 2>/dev/null | gzip -1 > ${tempPath} && mv ${tempPath} ${cachePath} && ls -lh ${cachePath} | awk '{print $5}'`;

            const result = await containerService.exec(vmAgentUrl, createCmd, '/home/coder', machineId, 120000, true);
            const tarballSize = (result.stdout || '').trim();

            const elapsed = Date.now() - startTime;
            console.log(`   ✅ [AngularCache] Saved in ${elapsed}ms (${tarballSize})`);

            return { success: true, projectId, size: tarballSize, elapsed };
        } catch (error) {
            console.error(`❌ [AngularCache] Save failed:`, error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Restore .angular cache from local NVMe
     */
    async restore(projectId, vmAgentUrl, machineId) {
        const startTime = Date.now();
        console.log(`\n♻️ [AngularCache] Restoring .angular for ${projectId} (local NVMe)...`);

        try {
            const containerService = require('./container-service');

            // 1. Check if cache exists
            const cacheInfo = await this.exists(projectId, vmAgentUrl, machineId);
            if (!cacheInfo.exists) {
                console.log(`   ❌ [AngularCache] No cache found for ${projectId}`);
                return { success: false, error: 'Cache not found' };
            }

            // 2. Extract directly from NVMe
            const cachePath = `${CACHE_DIR}/${projectId}.tar.gz`;
            const extractCmd = `cd /home/coder/project && rm -rf .angular && tar -xzf ${cachePath} && echo "EXTRACT_OK"`;
            const result = await containerService.exec(vmAgentUrl, extractCmd, '/home/coder', machineId, 60000, true);

            if (!result?.stdout?.includes('EXTRACT_OK')) {
                throw new Error(`Extraction failed: ${result?.stdout || result?.stderr || 'unknown'}`);
            }

            const elapsed = Date.now() - startTime;
            console.log(`   ✅ [AngularCache] Restored in ${elapsed}ms`);

            return { success: true, projectId, elapsed, fromCache: true };
        } catch (error) {
            console.error(`❌ [AngularCache] Restore failed:`, error.message);
            return { success: false, error: error.message, fromCache: false };
        }
    }

    /**
     * Delete cache for a project
     */
    async delete(projectId, agentUrl, machineId) {
        try {
            const containerService = require('./container-service');
            await containerService.exec(agentUrl,
                `rm -f ${CACHE_DIR}/${projectId}.tar.gz`,
                '/home/coder', machineId, 5000, true);
            console.log(`   🗑️ [AngularCache] Deleted cache for ${projectId}`);
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Cleanup old caches
     */
    async cleanup(agentUrl, machineId) {
        try {
            const containerService = require('./container-service');
            const cleanCmd = `find ${CACHE_DIR} -name '*.tar.gz' -mtime +${this.maxCacheAgeDays} -delete 2>/dev/null; echo "CLEANED"`;
            await containerService.exec(agentUrl, cleanCmd, '/home/coder', machineId, 30000, true);
            console.log(`   ✅ [AngularCache] Cleanup complete`);
        } catch (error) {
            console.error(`❌ [AngularCache] Cleanup failed:`, error.message);
        }
    }
}

module.exports = new AngularCacheService();
