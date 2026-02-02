/**
 * Node Modules Cache Service
 * Local NVMe cache on Hetzner — zero network transfers
 * Hash-based: same package.json = same cache
 *
 * Cache stored at /data/cache/node-modules/{hash}.tar.gz
 * Shared volume mounted in all containers — restore is a local tar extract
 */

const crypto = require('crypto');
const storageService = require('./storage-service');

const CACHE_DIR = '/data/cache/node-modules';

class NodeModulesCacheService {
    constructor() {
        this.enabled = true;
    }

    /**
     * Calculate unique hash from package.json + lockfile + package manager
     * @param {string} projectId - Project ID
     * @returns {Promise<string>} MD5 hash
     */
    async calculateHash(projectId) {
        // Read package.json from Firebase Storage (project source of truth)
        const pkgResult = await storageService.readFile(projectId, 'package.json');
        if (!pkgResult.success) {
            throw new Error('package.json not found');
        }

        // Detect package manager and read lockfile
        let lockContent = '';
        let packageManager = 'npm';
        const lockfiles = [
            { file: 'pnpm-lock.yaml', pm: 'pnpm' },
            { file: 'package-lock.json', pm: 'npm' },
            { file: 'yarn.lock', pm: 'yarn' }
        ];

        for (const { file, pm } of lockfiles) {
            const lockResult = await storageService.readFile(projectId, file);
            if (lockResult.success) {
                lockContent = lockResult.content;
                packageManager = pm;
                console.log(`   📦 [Cache] Detected package manager: ${packageManager}`);
                break;
            }
        }

        const combined = `PM:${packageManager}\n${pkgResult.content}\n${lockContent}`;
        const hash = crypto.createHash('md5').update(combined).digest('hex');

        console.log(`   🔑 [Cache] Hash calcolato: ${hash} (${packageManager})`);
        return hash;
    }

    /**
     * Check if cache exists for this hash (local NVMe)
     * @param {string} hash - MD5 hash
     * @param {string} agentUrl - Agent URL (to check on the container's mounted volume)
     * @param {string} machineId - Container ID
     * @returns {Promise<boolean>}
     */
    async exists(hash, agentUrl, machineId) {
        try {
            const containerService = require('./container-service');
            const cachePath = `${CACHE_DIR}/${hash}.tar.gz`;

            const result = await containerService.exec(agentUrl,
                `test -f ${cachePath} && stat -c '%s' ${cachePath} || echo "NOT_FOUND"`,
                '/home/coder', machineId, 5000, true);

            const output = (result.stdout || '').trim();
            const exists = output !== 'NOT_FOUND' && output !== '';

            if (exists) {
                const sizeMB = Math.round(parseInt(output) / 1024 / 1024);
                console.log(`   ✅ [Cache] Hash ${hash}: FOUND (${sizeMB}MB, local NVMe)`);
            } else {
                console.log(`   ❌ [Cache] Hash ${hash}: NOT FOUND`);
            }

            return exists;
        } catch (error) {
            console.error(`❌ [Cache] Error checking existence:`, error.message);
            return false;
        }
    }

    /**
     * Save node_modules to local NVMe cache
     * @param {string} projectId - Project ID
     * @param {string} vmAgentUrl - VM agent URL
     * @param {string} machineId - Container ID
     * @returns {Promise<object>} Result with hash
     */
    async save(projectId, vmAgentUrl, machineId) {
        const startTime = Date.now();
        console.log(`\n💾 [Cache] Saving node_modules for ${projectId} (local NVMe)...`);

        try {
            const containerService = require('./container-service');

            // 1. Calculate hash
            const hash = await this.calculateHash(projectId);

            // 2. Check if already cached
            if (await this.exists(hash, vmAgentUrl, machineId)) {
                console.log(`   ⚡ [Cache] Hash ${hash} already cached, skipping`);
                return { success: true, hash, cached: true, skipped: true };
            }

            // 3. Create tarball directly to shared cache volume
            console.log(`   📦 [Cache] Creating tarball on NVMe...`);
            const cachePath = `${CACHE_DIR}/${hash}.tar.gz`;
            const tempPath = `${CACHE_DIR}/${hash}.tmp.tar.gz`;

            const createCmd = `mkdir -p ${CACHE_DIR} && cd /home/coder/project && tar -cf - node_modules/ 2>/dev/null | gzip -1 > ${tempPath} && mv ${tempPath} ${cachePath} && ls -lh ${cachePath} | awk '{print $5}'`;

            const result = await containerService.exec(vmAgentUrl, createCmd, '/home/coder', machineId, 300000, true);
            const size = (result.stdout || '').trim();

            const elapsed = Date.now() - startTime;
            console.log(`   ✅ [Cache] Saved in ${elapsed}ms (${size}, hash: ${hash})`);

            return { success: true, hash, size, elapsed, cached: true };
        } catch (error) {
            console.error(`❌ [Cache] Save failed:`, error.message);
            return { success: false, error: error.message, cached: false };
        }
    }

    /**
     * Restore node_modules from local NVMe cache
     * @param {string} hash - MD5 hash
     * @param {string} vmAgentUrl - VM agent URL
     * @param {string} machineId - Container ID
     * @returns {Promise<object>} Result
     */
    async restore(hash, vmAgentUrl, machineId) {
        const startTime = Date.now();
        console.log(`\n♻️ [Cache] Restoring node_modules (hash: ${hash}, local NVMe)...`);

        try {
            const containerService = require('./container-service');
            const cachePath = `${CACHE_DIR}/${hash}.tar.gz`;

            // 1. Verify cache file exists
            if (!await this.exists(hash, vmAgentUrl, machineId)) {
                return { success: false, error: 'Cache not found' };
            }

            // 2. Extract directly from NVMe — no network, no download
            const extractCmd = `cd /home/coder/project && rm -rf node_modules && tar -xzf ${cachePath} && echo "EXTRACT_OK"`;
            const result = await containerService.exec(vmAgentUrl, extractCmd, '/home/coder', machineId, 120000, true);

            if (!result?.stdout?.includes('EXTRACT_OK')) {
                throw new Error(`Extraction failed: ${result?.stdout || result?.stderr || 'unknown'}`);
            }

            // 3. Verify
            const verifyCmd = `ls /home/coder/project/node_modules 2>/dev/null | wc -l`;
            const verifyResult = await containerService.exec(vmAgentUrl, verifyCmd, '/home/coder', machineId, 5000, true);
            const pkgCount = parseInt(verifyResult?.stdout?.trim() || '0');

            const elapsed = Date.now() - startTime;
            console.log(`   ✅ [Cache] Restored in ${elapsed}ms (${pkgCount} packages, local NVMe)`);

            return { success: true, hash, elapsed, fromCache: true };
        } catch (error) {
            console.error(`❌ [Cache] Restore failed:`, error.message);
            return { success: false, error: error.message, fromCache: false };
        }
    }

    /**
     * List all cached node_modules (local NVMe)
     */
    async list(agentUrl, machineId) {
        try {
            const containerService = require('./container-service');
            const result = await containerService.exec(agentUrl,
                `ls -lhS ${CACHE_DIR}/*.tar.gz 2>/dev/null || echo "empty"`,
                '/home/coder', machineId, 10000, true);

            if (result.stdout?.includes('empty')) return [];

            return (result.stdout || '').trim().split('\n').map(line => {
                const parts = line.split(/\s+/);
                const name = parts[parts.length - 1] || '';
                const hash = name.replace(`${CACHE_DIR}/`, '').replace('.tar.gz', '');
                return { hash, size: parts[4], name };
            });
        } catch (error) {
            return [];
        }
    }

    /**
     * Cleanup old caches (keep most recent N)
     */
    async cleanup(agentUrl, machineId, keepCount = 50) {
        try {
            const containerService = require('./container-service');
            // Delete oldest files beyond keepCount
            const cleanCmd = `cd ${CACHE_DIR} && ls -t *.tar.gz 2>/dev/null | tail -n +${keepCount + 1} | xargs -r rm -f && echo "CLEANED"`;
            await containerService.exec(agentUrl, cleanCmd, '/home/coder', machineId, 30000, true);
            console.log(`   ✅ [Cache] Cleanup done (keeping ${keepCount} most recent)`);
        } catch (error) {
            console.error(`❌ [Cache] Cleanup failed:`, error.message);
        }
    }

    /**
     * Get cache statistics
     */
    async getStats(agentUrl, machineId) {
        try {
            const containerService = require('./container-service');
            const result = await containerService.exec(agentUrl,
                `ls ${CACHE_DIR}/*.tar.gz 2>/dev/null | wc -l && du -sh ${CACHE_DIR} 2>/dev/null | cut -f1 || echo "0"`,
                '/home/coder', machineId, 10000, true);

            const lines = (result.stdout || '').trim().split('\n');
            return {
                enabled: true,
                backend: 'nvme',
                totalCaches: parseInt(lines[0] || '0'),
                totalSize: lines[1] || '0'
            };
        } catch (error) {
            return { enabled: true, backend: 'nvme', error: error.message };
        }
    }
}

module.exports = new NodeModulesCacheService();
