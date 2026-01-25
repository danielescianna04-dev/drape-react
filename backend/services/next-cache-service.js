/**
 * Next.js Build Cache Service
 * Gestisce cache di .next (output compilato) su Firebase Storage
 * Permette di evitare la ricompilazione quando si cambia VM
 *
 * LIVELLO 4: Build cache per Next.js
 */

const fs = require('fs');
const path = require('path');
const { bucket, isInitialized } = require('../firebase-admin-config');

class NextCacheService {
    constructor() {
        this.cachePrefix = 'next-build-cache/';
        this.tempDir = '/tmp/drape-next-cache';
        this.enabled = isInitialized();
        this.maxCacheAgeDays = 7; // Cache valida per 7 giorni

        if (!this.enabled) {
            console.warn('⚠️ [NextCache] Firebase not initialized, cache disabled');
        }
    }

    /**
     * Genera chiave cache per progetto
     * @param {string} projectId - Project ID
     * @returns {string} Cache key
     */
    getCacheKey(projectId) {
        return `${this.cachePrefix}${projectId}.tar.gz`;
    }

    /**
     * Controlla se cache esiste per questo progetto
     * @param {string} projectId - Project ID
     * @returns {Promise<{exists: boolean, age?: number}>}
     */
    async exists(projectId) {
        try {
            if (!this.enabled) {
                return { exists: false };
            }

            const fileName = this.getCacheKey(projectId);
            const file = bucket.file(fileName);
            const [exists] = await file.exists();

            if (!exists) {
                return { exists: false };
            }

            // Check age
            const [metadata] = await file.getMetadata();
            const createdAt = new Date(metadata.timeCreated);
            const ageMs = Date.now() - createdAt.getTime();
            const ageDays = ageMs / (1000 * 60 * 60 * 24);

            if (ageDays > this.maxCacheAgeDays) {
                console.log(`   ⚠️ [NextCache] Cache for ${projectId} is stale (${ageDays.toFixed(1)} days old)`);
                return { exists: false, stale: true, ageDays };
            }

            console.log(`   ✅ [NextCache] Cache found for ${projectId} (${ageDays.toFixed(1)} days old)`);
            return { exists: true, ageDays, size: metadata.size };

        } catch (error) {
            console.error(`❌ [NextCache] Error checking existence:`, error.message);
            return { exists: false };
        }
    }

    /**
     * Salva .next cache su Firebase Storage
     * @param {string} projectId - Project ID
     * @param {string} vmAgentUrl - VM agent URL
     * @param {string} machineId - Fly machine ID
     * @returns {Promise<object>} Result
     */
    async save(projectId, vmAgentUrl, machineId) {
        const startTime = Date.now();
        console.log(`\n💾 [NextCache] Saving .next for ${projectId}...`);

        try {
            if (!this.enabled) {
                console.log(`   ⚠️ [NextCache] Firebase not initialized, skipping save`);
                return { success: false, error: 'Firebase not initialized' };
            }

            const flyService = require('./fly-service');

            // 1. Check if .next exists on VM
            const checkCmd = `test -d /home/coder/project/.next && du -sh /home/coder/project/.next | cut -f1 || echo "not found"`;
            const checkResult = await flyService.exec(vmAgentUrl, checkCmd, '/home/coder', machineId, 10000, true);

            if (checkResult.stdout.includes('not found')) {
                console.log(`   ⚠️ [NextCache] No .next folder found, skipping save`);
                return { success: false, error: '.next not found' };
            }

            const folderSize = checkResult.stdout.trim();
            console.log(`   📦 [NextCache] .next folder size: ${folderSize}`);

            // 2. Create tarball on VM (excluding cache/trace files to reduce size)
            console.log(`   📦 [NextCache] Creating tarball on VM...`);
            const tarballPath = `/tmp/next_cache_${projectId}.tar.gz`;

            // Exclude large unnecessary files
            const createTarCmd = `
                cd /home/coder/project && \
                tar -czf ${tarballPath} \
                    --exclude='.next/cache/webpack' \
                    --exclude='.next/cache/fetch-cache' \
                    --exclude='.next/trace' \
                    .next/ 2>/dev/null || echo "tar failed"
            `.trim();

            await flyService.exec(vmAgentUrl, createTarCmd, '/home/coder', machineId, 120000);

            // 3. Verify tarball created
            const verifySizeCmd = `ls -lh ${tarballPath} 2>/dev/null | awk '{print $5}' || echo "not found"`;
            const sizeResult = await flyService.exec(vmAgentUrl, verifySizeCmd, '/home/coder', machineId, 10000, true);

            if (sizeResult.stdout.includes('not found')) {
                throw new Error('Tarball creation failed');
            }

            const tarballSize = sizeResult.stdout.trim();
            console.log(`   ✅ [NextCache] Tarball created: ${tarballSize}`);

            // 4. Download tarball from VM
            console.log(`   📥 [NextCache] Downloading from VM...`);

            if (!fs.existsSync(this.tempDir)) {
                fs.mkdirSync(this.tempDir, { recursive: true });
            }

            const localPath = path.join(this.tempDir, `${projectId}.tar.gz`);

            // Download via base64
            const base64Cmd = `base64 < ${tarballPath}`;
            const result = await flyService.exec(vmAgentUrl, base64Cmd, '/home/coder', machineId, 300000, true);

            if (!result.stdout) {
                throw new Error('Failed to read tarball from VM');
            }

            const buffer = Buffer.from(result.stdout, 'base64');
            fs.writeFileSync(localPath, buffer);

            const stats = fs.statSync(localPath);
            console.log(`   ✅ [NextCache] Downloaded: ${(stats.size / 1024 / 1024).toFixed(1)}MB`);

            // 5. Upload to Firebase Storage
            console.log(`   ☁️ [NextCache] Uploading to Firebase Storage...`);
            const fileName = this.getCacheKey(projectId);

            await bucket.upload(localPath, {
                destination: fileName,
                metadata: {
                    contentType: 'application/gzip',
                    metadata: {
                        projectId,
                        createdAt: new Date().toISOString(),
                        originalSize: folderSize,
                        compressedSize: stats.size
                    }
                }
            });

            // 6. Cleanup
            fs.unlinkSync(localPath);
            await flyService.exec(vmAgentUrl, `rm -f ${tarballPath}`, '/home/coder', machineId, 10000, true);

            const elapsed = Date.now() - startTime;
            console.log(`   ✅ [NextCache] Saved in ${elapsed}ms`);

            return {
                success: true,
                projectId,
                size: stats.size,
                elapsed
            };

        } catch (error) {
            console.error(`❌ [NextCache] Save failed:`, error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Ripristina .next cache dalla storage
     * @param {string} projectId - Project ID
     * @param {string} vmAgentUrl - VM agent URL
     * @param {string} machineId - Fly machine ID
     * @returns {Promise<object>} Result
     */
    async restore(projectId, vmAgentUrl, machineId) {
        const startTime = Date.now();
        console.log(`\n♻️ [NextCache] Restoring .next for ${projectId}...`);

        try {
            if (!this.enabled) {
                console.log(`   ⚠️ [NextCache] Firebase not initialized, skipping restore`);
                return { success: false, error: 'Firebase not initialized' };
            }

            const flyService = require('./fly-service');

            // 1. Check if cache exists
            const cacheInfo = await this.exists(projectId);
            if (!cacheInfo.exists) {
                console.log(`   ❌ [NextCache] No cache found for ${projectId}`);
                return { success: false, error: 'Cache not found' };
            }

            // 2. Download from Firebase Storage
            console.log(`   📥 [NextCache] Downloading from Firebase Storage...`);
            const fileName = this.getCacheKey(projectId);

            if (!fs.existsSync(this.tempDir)) {
                fs.mkdirSync(this.tempDir, { recursive: true });
            }

            const localPath = path.join(this.tempDir, `${projectId}.tar.gz`);
            await bucket.file(fileName).download({ destination: localPath });

            const stats = fs.statSync(localPath);
            console.log(`   ✅ [NextCache] Downloaded: ${(stats.size / 1024 / 1024).toFixed(1)}MB`);

            // 3. Upload to VM and extract
            console.log(`   📤 [NextCache] Uploading to VM...`);
            const vmTarballPath = `/tmp/next_restore_${projectId}.tar.gz`;

            // Read file and convert to base64
            const tarballContent = fs.readFileSync(localPath);
            const base64Content = tarballContent.toString('base64');

            // Write via echo and base64 decode
            const uploadCmd = `echo '${base64Content}' | base64 -d > ${vmTarballPath}`;
            await flyService.exec(vmAgentUrl, uploadCmd, '/home/coder', machineId, 180000);

            // 4. Extract tarball
            console.log(`   📦 [NextCache] Extracting on VM...`);
            const extractCmd = `
                cd /home/coder/project && \
                rm -rf .next && \
                tar -xzf ${vmTarballPath} && \
                rm -f ${vmTarballPath} && \
                chown -R coder:coder .next
            `.trim();

            await flyService.exec(vmAgentUrl, extractCmd, '/home/coder', machineId, 120000);

            // 5. Verify extraction
            const verifyCmd = `test -d /home/coder/project/.next && echo "success" || echo "failed"`;
            const verifyResult = await flyService.exec(vmAgentUrl, verifyCmd, '/home/coder', machineId, 10000, true);

            if (!verifyResult.stdout.includes('success')) {
                throw new Error('Extraction verification failed');
            }

            // 6. Cleanup local
            fs.unlinkSync(localPath);

            const elapsed = Date.now() - startTime;
            console.log(`   ✅ [NextCache] Restored in ${elapsed}ms`);

            return {
                success: true,
                projectId,
                elapsed,
                fromCache: true
            };

        } catch (error) {
            console.error(`❌ [NextCache] Restore failed:`, error.message);
            return {
                success: false,
                error: error.message,
                fromCache: false
            };
        }
    }

    /**
     * Delete cache for a project
     * @param {string} projectId - Project ID
     * @returns {Promise<boolean>}
     */
    async delete(projectId) {
        try {
            if (!this.enabled) return false;

            const fileName = this.getCacheKey(projectId);
            const file = bucket.file(fileName);
            const [exists] = await file.exists();

            if (exists) {
                await file.delete();
                console.log(`   🗑️ [NextCache] Deleted cache for ${projectId}`);
                return true;
            }

            return false;
        } catch (error) {
            console.error(`❌ [NextCache] Delete failed:`, error.message);
            return false;
        }
    }

    /**
     * Cleanup old caches
     * @returns {Promise<number>} Number of deleted caches
     */
    async cleanup() {
        try {
            if (!this.enabled) return 0;

            console.log(`\n🗑️ [NextCache] Cleanup started (max age: ${this.maxCacheAgeDays} days)...`);

            const [files] = await bucket.getFiles({ prefix: this.cachePrefix });
            const cutoffDate = new Date(Date.now() - this.maxCacheAgeDays * 24 * 60 * 60 * 1000);

            let deletedCount = 0;

            for (const file of files) {
                const createdDate = new Date(file.metadata.timeCreated);

                if (createdDate < cutoffDate) {
                    await file.delete();
                    deletedCount++;
                }
            }

            console.log(`   ✅ [NextCache] Cleanup complete: ${deletedCount} deleted`);
            return deletedCount;

        } catch (error) {
            console.error(`❌ [NextCache] Cleanup failed:`, error.message);
            return 0;
        }
    }
}

module.exports = new NextCacheService();
