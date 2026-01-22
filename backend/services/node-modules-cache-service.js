/**
 * Node Modules Cache Service
 * Gestisce cache di node_modules su Firebase Storage
 * Hash-based: stesso package.json = stessa cache
 *
 * LIVELLO 2 del sistema ibrido a 3 livelli
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const tar = require('tar');
const { bucket, isInitialized } = require('../firebase-admin-config');
const storageService = require('./storage-service');

class NodeModulesCacheService {
    constructor() {
        this.cachePrefix = 'node-modules-cache/';
        this.tempDir = '/tmp/drape-cache';
        this.enabled = isInitialized();

        if (!this.enabled) {
            console.warn('⚠️ [Cache] Firebase not initialized, cache disabled');
        }
    }

    /**
     * Calcola hash univoco da package.json + lockfile
     * @param {string} projectId - Project ID
     * @returns {Promise<string>} Hash MD5
     */
    async calculateHash(projectId) {
        try {
            if (!this.enabled) {
                throw new Error('Firebase not initialized');
            }

            // Leggi package.json
            const pkgResult = await storageService.readFile(projectId, 'package.json');
            if (!pkgResult.success) {
                throw new Error('package.json not found');
            }

            // Leggi lockfile (se esiste)
            let lockContent = '';
            const lockfiles = ['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock'];
            for (const lockfile of lockfiles) {
                const lockResult = await storageService.readFile(projectId, lockfile);
                if (lockResult.success) {
                    lockContent = lockResult.content;
                    break;
                }
            }

            // Combina e calcola hash
            const combined = pkgResult.content + lockContent;
            const hash = crypto.createHash('md5').update(combined).digest('hex');

            console.log(`   🔑 [Cache] Hash calcolato: ${hash}`);
            return hash;

        } catch (error) {
            console.error(`❌ [Cache] Error calculating hash:`, error.message);
            throw error;
        }
    }

    /**
     * Controlla se cache esiste per questo hash
     * @param {string} hash - Hash MD5
     * @returns {Promise<boolean>} True se esiste
     */
    async exists(hash) {
        try {
            if (!this.enabled) {
                return false;
            }

            const fileName = `${this.cachePrefix}${hash}.tar.gz`;
            const file = bucket.file(fileName);
            const [exists] = await file.exists();

            console.log(`   ${exists ? '✅' : '❌'} [Cache] Hash ${hash}: ${exists ? 'FOUND' : 'NOT FOUND'}`);
            return exists;

        } catch (error) {
            console.error(`❌ [Cache] Error checking existence:`, error.message);
            return false;
        }
    }

    /**
     * Salva node_modules su Firebase Storage
     * @param {string} projectId - Project ID
     * @param {string} vmAgentUrl - VM agent URL
     * @param {string} machineId - Fly machine ID
     * @returns {Promise<object>} Result con hash
     */
    async save(projectId, vmAgentUrl, machineId) {
        const startTime = Date.now();
        console.log(`\n💾 [Cache] Saving node_modules for ${projectId}...`);

        try {
            if (!this.enabled) {
                console.log(`   ⚠️ [Cache] Firebase not initialized, skipping save`);
                return { success: false, error: 'Firebase not initialized', cached: false };
            }

            const flyService = require('./fly-service');

            // 1. Calcola hash
            const hash = await this.calculateHash(projectId);

            // 2. Controlla se già esiste (skip se già cached)
            if (await this.exists(hash)) {
                console.log(`   ⚡ [Cache] Hash ${hash} already exists, skipping upload`);
                return { success: true, hash, cached: true, skipped: true };
            }

            // 3. Crea tarball su VM (in project dir così è accessibile via storage)
            console.log(`   📦 [Cache] Creating tarball on VM...`);
            const tarballPath = `/home/coder/project/node_modules_cache_${hash}.tar.gz`;

            const createTarCmd = `
                cd /home/coder/project && \
                tar -czf ${tarballPath} node_modules/ 2>/dev/null || echo "tar failed"
            `.trim();

            await flyService.exec(vmAgentUrl, createTarCmd, '/home/coder', machineId, 180000);

            // 4. Verifica tarball creato
            const checkCmd = `ls -lh ${tarballPath} 2>/dev/null || echo "not found"`;
            const checkResult = await flyService.exec(vmAgentUrl, checkCmd, '/home/coder', machineId, 10000, true);

            if (checkResult.stdout.includes('not found')) {
                throw new Error('Tarball creation failed');
            }

            const sizeMatch = checkResult.stdout.match(/(\d+\.?\d*[KMG]?)\s+/);
            const size = sizeMatch ? sizeMatch[1] : 'unknown';
            console.log(`   ✅ [Cache] Tarball created: ${size}`);

            // 5. Download tarball dalla VM al backend usando base64
            console.log(`   📥 [Cache] Downloading tarball from VM...`);
            const localPath = path.join(this.tempDir, `${hash}.tar.gz`);

            // Crea temp dir se non esiste
            if (!fs.existsSync(this.tempDir)) {
                fs.mkdirSync(this.tempDir, { recursive: true });
            }

            // Download via exec + base64 (chunked per file grandi)
            const chunkSize = 10 * 1024 * 1024; // 10MB chunks
            const base64Cmd = `base64 < ${tarballPath}`;
            const result = await flyService.exec(vmAgentUrl, base64Cmd, '/home/coder', machineId, 300000, true);

            if (!result.stdout) {
                throw new Error('Failed to read tarball from VM');
            }

            // Decode base64 and write to file
            const buffer = Buffer.from(result.stdout, 'base64');
            fs.writeFileSync(localPath, buffer);

            const stats = fs.statSync(localPath);
            console.log(`   ✅ [Cache] Downloaded: ${(stats.size / 1024 / 1024).toFixed(1)}MB`);

            // 6. Upload a Firebase Storage
            console.log(`   ☁️ [Cache] Uploading to Firebase Storage...`);
            const fileName = `${this.cachePrefix}${hash}.tar.gz`;
            await bucket.upload(localPath, {
                destination: fileName,
                metadata: {
                    contentType: 'application/gzip',
                    metadata: {
                        projectId,
                        hash,
                        createdAt: new Date().toISOString(),
                        size: stats.size
                    }
                }
            });

            // 7. Cleanup
            fs.unlinkSync(localPath);
            await flyService.exec(vmAgentUrl, `rm -f ${tarballPath}`, '/home/coder', machineId, 10000, true);

            const elapsed = Date.now() - startTime;
            console.log(`   ✅ [Cache] Saved in ${elapsed}ms (hash: ${hash})`);

            return {
                success: true,
                hash,
                size: stats.size,
                elapsed,
                cached: true
            };

        } catch (error) {
            console.error(`❌ [Cache] Save failed:`, error.message);
            return {
                success: false,
                error: error.message,
                cached: false
            };
        }
    }

    /**
     * Ripristina node_modules dalla cache
     * @param {string} hash - Hash MD5
     * @param {string} vmAgentUrl - VM agent URL
     * @param {string} machineId - Fly machine ID
     * @returns {Promise<object>} Result
     */
    async restore(hash, vmAgentUrl, machineId) {
        const startTime = Date.now();
        console.log(`\n♻️ [Cache] Restoring node_modules (hash: ${hash})...`);

        try {
            if (!this.enabled) {
                console.log(`   ⚠️ [Cache] Firebase not initialized, skipping restore`);
                return { success: false, error: 'Firebase not initialized' };
            }

            const flyService = require('./fly-service');

            // 1. Controlla se cache esiste
            if (!await this.exists(hash)) {
                console.log(`   ❌ [Cache] Hash ${hash} not found`);
                return { success: false, error: 'Cache not found' };
            }

            // 2. Download da Firebase Storage
            console.log(`   📥 [Cache] Downloading from Firebase Storage...`);
            const fileName = `${this.cachePrefix}${hash}.tar.gz`;
            const localPath = path.join(this.tempDir, `${hash}.tar.gz`);

            if (!fs.existsSync(this.tempDir)) {
                fs.mkdirSync(this.tempDir, { recursive: true });
            }

            await bucket.file(fileName).download({ destination: localPath });

            const stats = fs.statSync(localPath);
            console.log(`   ✅ [Cache] Downloaded: ${(stats.size / 1024 / 1024).toFixed(1)}MB`);

            // 3. Upload tarball alla VM
            console.log(`   📤 [Cache] Uploading to VM...`);
            const vmTarballPath = `/tmp/node_modules_restore_${hash}.tar.gz`;

            // Usa curl per upload (più efficiente per file grandi)
            const uploadScript = `
                cat > ${vmTarballPath}
            `.trim();

            const tarballContent = fs.readFileSync(localPath);

            // Upload via exec con stdin
            await flyService.exec(
                vmAgentUrl,
                uploadScript,
                '/home/coder',
                machineId,
                120000,
                false,
                tarballContent.toString('base64')
            );

            console.log(`   ✅ [Cache] Uploaded to VM`);

            // 4. Estrai tarball su VM
            console.log(`   📦 [Cache] Extracting on VM...`);
            const extractCmd = `
                cd /home/coder/project && \
                rm -rf node_modules && \
                tar -xzf ${vmTarballPath} && \
                rm -f ${vmTarballPath} && \
                chown -R coder:coder node_modules
            `.trim();

            await flyService.exec(vmAgentUrl, extractCmd, '/home/coder', machineId, 180000);

            // 5. Verifica estrazione
            const verifyCmd = `test -d /home/coder/project/node_modules && echo "success" || echo "failed"`;
            const verifyResult = await flyService.exec(vmAgentUrl, verifyCmd, '/home/coder', machineId, 10000, true);

            if (!verifyResult.stdout.includes('success')) {
                throw new Error('Extraction verification failed');
            }

            // 6. Cleanup locale
            fs.unlinkSync(localPath);

            const elapsed = Date.now() - startTime;
            console.log(`   ✅ [Cache] Restored in ${elapsed}ms`);

            return {
                success: true,
                hash,
                elapsed,
                fromCache: true
            };

        } catch (error) {
            console.error(`❌ [Cache] Restore failed:`, error.message);
            return {
                success: false,
                error: error.message,
                fromCache: false
            };
        }
    }

    /**
     * Lista tutte le cache salvate (debug/admin)
     * @returns {Promise<Array>} Lista cache
     */
    async list() {
        try {
            if (!this.enabled) {
                console.log(`   ⚠️ [Cache] Firebase not initialized`);
                return [];
            }

            const [files] = await bucket.getFiles({ prefix: this.cachePrefix });

            const caches = files.map(file => ({
                hash: file.name.replace(this.cachePrefix, '').replace('.tar.gz', ''),
                name: file.name,
                size: file.metadata.size,
                created: file.metadata.timeCreated,
                updated: file.metadata.updated
            }));

            console.log(`   📋 [Cache] Found ${caches.length} cached node_modules`);
            return caches;

        } catch (error) {
            console.error(`❌ [Cache] List failed:`, error.message);
            return [];
        }
    }

    /**
     * Cleanup cache vecchie (> 90 giorni)
     * @returns {Promise<number>} Numero cache eliminate
     */
    async cleanup(maxAgeDays = 90) {
        try {
            if (!this.enabled) {
                console.log(`   ⚠️ [Cache] Firebase not initialized, skipping cleanup`);
                return 0;
            }

            console.log(`\n🗑️ [Cache] Cleanup started (max age: ${maxAgeDays} days)...`);

            const [files] = await bucket.getFiles({ prefix: this.cachePrefix });
            const cutoffDate = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);

            let deletedCount = 0;

            for (const file of files) {
                const createdDate = new Date(file.metadata.timeCreated);

                if (createdDate < cutoffDate) {
                    const ageInDays = Math.floor((Date.now() - createdDate) / 86400000);
                    console.log(`   🗑️ Deleting ${file.name} (age: ${ageInDays} days)`);
                    await file.delete();
                    deletedCount++;
                }
            }

            console.log(`   ✅ [Cache] Cleanup complete: ${deletedCount} deleted`);
            return deletedCount;

        } catch (error) {
            console.error(`❌ [Cache] Cleanup failed:`, error.message);
            return 0;
        }
    }

    /**
     * Get cache statistics
     * @returns {Promise<object>} Statistics
     */
    async getStats() {
        try {
            if (!this.enabled) {
                return {
                    enabled: false,
                    totalCaches: 0,
                    totalSize: 0
                };
            }

            const caches = await this.list();

            const totalSize = caches.reduce((sum, c) => sum + parseInt(c.size || 0), 0);

            return {
                enabled: true,
                totalCaches: caches.length,
                totalSize,
                totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
                oldest: caches.length > 0 ? caches[0].created : null,
                newest: caches.length > 0 ? caches[caches.length - 1].created : null
            };

        } catch (error) {
            console.error(`❌ [Cache] Stats failed:`, error.message);
            return {
                enabled: false,
                error: error.message
            };
        }
    }
}

module.exports = new NodeModulesCacheService();
