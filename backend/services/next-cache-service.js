/**
 * Next.js Build Cache Service
 * Local NVMe cache on Hetzner — zero network transfers
 * Per-project .next cache to skip recompilation on VM switch
 *
 * Cache stored at /data/cache/next-build/{projectId}.tar.gz
 * Shared volume mounted in all containers
 */

const CACHE_DIR = '/data/cache/next-build';

class NextCacheService {
    constructor() {
        this.enabled = true;
        this.maxCacheAgeDays = 7;
    }

    /**
     * Check if cache exists for this project (local NVMe)
     * @param {string} projectId - Project ID
     * @param {string} agentUrl - Agent URL
     * @param {string} machineId - Container ID
     * @returns {Promise<{exists: boolean, age?: number}>}
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
                console.log(`   ⚠️ [NextCache] Cache for ${projectId} is stale (${ageDays.toFixed(1)} days old)`);
                return { exists: false, stale: true, ageDays };
            }

            console.log(`   ✅ [NextCache] Cache found for ${projectId} (${ageDays.toFixed(1)} days old)`);
            return { exists: true, ageDays, size: parseInt(size) };
        } catch (error) {
            console.error(`❌ [NextCache] Error checking existence:`, error.message);
            return { exists: false };
        }
    }

    /**
     * Save .next cache to local NVMe
     * @param {string} projectId - Project ID
     * @param {string} vmAgentUrl - VM agent URL
     * @param {string} machineId - Container ID
     */
    async save(projectId, vmAgentUrl, machineId) {
        const startTime = Date.now();
        console.log(`\n💾 [NextCache] Saving .next for ${projectId} (local NVMe)...`);

        try {
            const containerService = require('./container-service');

            // 1. Check if .next exists
            const checkCmd = `test -d /home/coder/project/.next && du -sh /home/coder/project/.next | cut -f1 || echo "not found"`;
            const checkResult = await containerService.exec(vmAgentUrl, checkCmd, '/home/coder', machineId, 10000, true);

            if (checkResult.stdout.includes('not found')) {
                console.log(`   ⚠️ [NextCache] No .next folder found, skipping save`);
                return { success: false, error: '.next not found' };
            }

            const folderSize = checkResult.stdout.trim();
            console.log(`   📦 [NextCache] .next folder size: ${folderSize}`);

            // 2. Create tarball directly to NVMe cache
            const cachePath = `${CACHE_DIR}/${projectId}.tar.gz`;
            const tempPath = `${CACHE_DIR}/${projectId}.tmp.tar.gz`;

            const createCmd = `mkdir -p ${CACHE_DIR} && cd /home/coder/project && tar -cf - --exclude='.next/cache/webpack' --exclude='.next/cache/fetch-cache' --exclude='.next/trace' .next/ 2>/dev/null | gzip -1 > ${tempPath} && mv ${tempPath} ${cachePath} && ls -lh ${cachePath} | awk '{print $5}'`;

            const result = await containerService.exec(vmAgentUrl, createCmd, '/home/coder', machineId, 120000, true);
            const tarballSize = (result.stdout || '').trim();

            // 3. Save source hash for persistent .next detection
            try {
                const hashCmd = `cd /home/coder/project && (find app src pages components public styles -type f 2>/dev/null | sort | xargs -r stat -c '%Y %n' 2>/dev/null | md5sum | cut -d' ' -f1 || echo "none") > .next-source-hash`;
                await containerService.exec(vmAgentUrl, hashCmd, '/home/coder', machineId, 10000, true);
                console.log(`   💾 [NextCache] Saved source hash for persistent cache`);
            } catch (hashError) {
                console.log(`   ⚠️ [NextCache] Failed to save source hash: ${hashError.message}`);
            }

            const elapsed = Date.now() - startTime;
            console.log(`   ✅ [NextCache] Saved in ${elapsed}ms (${tarballSize})`);

            return { success: true, projectId, size: tarballSize, elapsed };
        } catch (error) {
            console.error(`❌ [NextCache] Save failed:`, error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Restore .next cache from local NVMe
     * @param {string} projectId - Project ID
     * @param {string} vmAgentUrl - VM agent URL
     * @param {string} machineId - Container ID
     */
    async restore(projectId, vmAgentUrl, machineId) {
        const startTime = Date.now();
        console.log(`\n♻️ [NextCache] Restoring .next for ${projectId} (local NVMe)...`);

        try {
            const containerService = require('./container-service');

            // 1. Check if cache exists
            const cacheInfo = await this.exists(projectId, vmAgentUrl, machineId);
            if (!cacheInfo.exists) {
                console.log(`   ❌ [NextCache] No cache found for ${projectId}`);
                return { success: false, error: 'Cache not found' };
            }

            // 2. Extract directly from NVMe
            const cachePath = `${CACHE_DIR}/${projectId}.tar.gz`;
            const extractCmd = `cd /home/coder/project && rm -rf .next && tar -xzf ${cachePath} && echo "EXTRACT_OK"`;
            const result = await containerService.exec(vmAgentUrl, extractCmd, '/home/coder', machineId, 60000, true);

            if (!result?.stdout?.includes('EXTRACT_OK')) {
                throw new Error(`Extraction failed: ${result?.stdout || result?.stderr || 'unknown'}`);
            }

            // 3. Save source hash
            try {
                const hashCmd = `cd /home/coder/project && (find app src pages components public styles -type f 2>/dev/null | sort | xargs -r stat -c '%Y %n' 2>/dev/null | md5sum | cut -d' ' -f1 || echo "none") > .next-source-hash`;
                await containerService.exec(vmAgentUrl, hashCmd, '/home/coder', machineId, 10000, true);
                console.log(`   💾 [NextCache] Saved source hash for persistent cache`);
            } catch (hashError) {
                console.log(`   ⚠️ [NextCache] Failed to save source hash: ${hashError.message}`);
            }

            const elapsed = Date.now() - startTime;
            console.log(`   ✅ [NextCache] Restored in ${elapsed}ms`);

            return { success: true, projectId, elapsed, fromCache: true };
        } catch (error) {
            console.error(`❌ [NextCache] Restore failed:`, error.message);
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
            console.log(`   🗑️ [NextCache] Deleted cache for ${projectId}`);
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
            const cutoffDays = this.maxCacheAgeDays;
            const cleanCmd = `find ${CACHE_DIR} -name '*.tar.gz' -mtime +${cutoffDays} -delete 2>/dev/null; echo "CLEANED"`;
            await containerService.exec(agentUrl, cleanCmd, '/home/coder', machineId, 30000, true);
            console.log(`   ✅ [NextCache] Cleanup complete (removed caches older than ${cutoffDays} days)`);
        } catch (error) {
            console.error(`❌ [NextCache] Cleanup failed:`, error.message);
        }
    }
}

module.exports = new NextCacheService();
