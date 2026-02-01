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
     * Calcola hash univoco da package.json + lockfile + package manager
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

            // Rileva package manager e leggi lockfile
            let lockContent = '';
            let packageManager = 'npm'; // default
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

            // CRITICAL: Include package manager in hash to prevent cross-contamination
            // Different package managers create incompatible node_modules structures
            const combined = `PM:${packageManager}\n${pkgResult.content}\n${lockContent}`;
            const hash = crypto.createHash('md5').update(combined).digest('hex');

            console.log(`   🔑 [Cache] Hash calcolato: ${hash} (${packageManager})`);
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

            // Use fast compression (gzip -1) for 2-3x faster extraction
            const createTarCmd = `
                cd /home/coder/project && \
                tar -cf - node_modules/ 2>/dev/null | gzip -1 > ${tarballPath} || echo "tar failed"
            `.trim();

            await flyService.exec(vmAgentUrl, createTarCmd, '/home/coder', machineId, 300000);

            // 4. Verifica tarball creato
            const checkCmd = `ls -lh ${tarballPath} 2>/dev/null || echo "not found"`;
            const checkResult = await flyService.exec(vmAgentUrl, checkCmd, '/home/coder', machineId, 10000, true);

            if (checkResult.stdout.includes('not found')) {
                throw new Error('Tarball creation failed');
            }

            const sizeMatch = checkResult.stdout.match(/(\d+\.?\d*[KMG]?)\s+/);
            const size = sizeMatch ? sizeMatch[1] : 'unknown';
            console.log(`   ✅ [Cache] Tarball created: ${size}`);

            // 5. Genera signed URL per upload diretto dalla VM
            console.log(`   🔗 [Cache] Generating signed URL for upload...`);
            const fileName = `${this.cachePrefix}${hash}.tar.gz`;
            const file = bucket.file(fileName);

            // Signed URL per upload, valido 15 minuti
            const [signedUrl] = await file.getSignedUrl({
                action: 'write',
                expires: Date.now() + 15 * 60 * 1000, // 15 min
                contentType: 'application/gzip',
            });

            console.log(`   ✅ [Cache] Signed URL generated`);

            // 6. La VM carica direttamente su Firebase Storage via curl
            console.log(`   ☁️ [Cache] VM uploading to Firebase Storage...`);
            const uploadCmd = `curl -X PUT -H "Content-Type: application/gzip" --data-binary @${tarballPath} "${signedUrl}" && echo "UPLOAD_SUCCESS"`;

            const uploadResult = await flyService.exec(
                vmAgentUrl,
                uploadCmd,
                '/home/coder',
                machineId,
                300000, // 5 min timeout per upload
                true
            );

            if (!uploadResult?.stdout?.includes('UPLOAD_SUCCESS')) {
                throw new Error(`VM upload failed: ${uploadResult?.stderr || uploadResult?.stdout || 'unknown error'}`);
            }

            console.log(`   ✅ [Cache] Uploaded to Firebase Storage`);

            // 7. Cleanup tarball su VM
            await flyService.exec(vmAgentUrl, `rm -f ${tarballPath}`, '/home/coder', machineId, 10000, true);

            const elapsed = Date.now() - startTime;
            console.log(`   ✅ [Cache] Saved in ${elapsed}ms (hash: ${hash})`);

            return {
                success: true,
                hash,
                size: size, // size from tarball check (e.g., "38M")
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

            // 1.5. TIER 3: VM-to-VM direct transfer (10-20x faster than TIER 2)
            // Try to find another VM in the pool that has this hash cached
            const vmPoolManager = require('./vm-pool-manager');
            const pool = vmPoolManager.pool || [];

            // Find a running VM with the same hash (not the current VM)
            const sourceVM = pool.find(vm =>
                !vm.isCacheMaster &&
                !vm.stopped &&
                vm.machineId !== machineId &&
                vm.nodeModulesHash === hash
            );

            if (sourceVM) {
                console.log(`   🚀 [TIER 3] Found VM ${sourceVM.machineId} with matching hash, using direct VM-to-VM transfer`);

                try {
                    const axios = require('axios');
                    const response = await axios.post('http://localhost:3000/api/cache-copy', {
                        workerMachineId: machineId,
                        sourceMachineId: sourceVM.machineId,
                        type: 'node_modules'
                    }, {
                        timeout: 300000 // 5 minutes
                    });

                    if (response.data.success) {
                        console.log(`   ✅ [TIER 3] VM-to-VM transfer completed: ${response.data.finalSizeMB}MB in ${response.data.elapsed}ms`);
                        return {
                            success: true,
                            tier: 3,
                            elapsed: response.data.elapsed,
                            sizeMB: response.data.finalSizeMB
                        };
                    }
                } catch (tier3Error) {
                    console.warn(`   ⚠️ [TIER 3] VM-to-VM transfer failed: ${tier3Error.message}, falling back to TIER 2.5`);
                }
            } else {
                console.log(`   ℹ️ [TIER 3] No VM with matching hash found, using TIER 2.5 (Firebase Storage)`);
            }

            // FALLBACK: TIER 2.5 - Firebase Storage with streaming extraction
            // 2. Genera signed URL per download diretto dalla VM
            console.log(`   🔗 [Cache] Generating signed URL...`);
            const fileName = `${this.cachePrefix}${hash}.tar.gz`;
            const file = bucket.file(fileName);

            // Signed URL valido per 15 minuti
            const [signedUrl] = await file.getSignedUrl({
                action: 'read',
                expires: Date.now() + 15 * 60 * 1000, // 15 min
            });

            console.log(`   ✅ [Cache] Signed URL generated`);

            // Get file size to understand download time
            const [metadata] = await file.getMetadata();
            const fileSizeMB = Math.round(metadata.size / 1024 / 1024);
            console.log(`   📦 [Cache] File size: ${fileSizeMB}MB (${metadata.size} bytes)`);

            // 3. TIER 2.5: Streaming extraction - download + extract in parallel (save 20-30s)
            console.log(`   🚀 [Cache] Streaming download + extraction (TIER 2.5)...`);

            // Prepara directory
            const prepareCmd = `mkdir -p /home/coder/project && cd /home/coder/project && rm -rf node_modules 2>&1 && echo "PREP_OK"`;
            const prepResult = await flyService.exec(vmAgentUrl, prepareCmd, '/home/coder', machineId, 60000, true);
            console.log(`   📋 [Cache] Prepare result:`, prepResult?.stdout?.trim() || 'no output');

            // Stream download directly to tar extraction in BACKGROUND (avoids timeout + saves time)
            // This pipes curl output directly to tar, so extraction starts while downloading
            const streamExtractCmd = `cd /home/coder/project && (curl -sL "${signedUrl}" | tar -xzf - > /tmp/tar_extract.log 2>&1; echo "DONE" > /tmp/tar_extract.done) & echo "EXTRACTION_STARTED"`;
            console.log(`   📝 [Cache DEBUG] About to execute streaming extraction command...`);
            const startResult = await flyService.exec(vmAgentUrl, streamExtractCmd, '/home/coder', machineId, 90000, true);
            console.log(`   📝 [Cache DEBUG] Stream command returned:`, startResult?.stdout?.substring(0, 100));

            if (!startResult?.stdout?.includes('EXTRACTION_STARTED')) {
                console.error(`   ❌ [Cache DEBUG] EXTRACTION_STARTED not found in output!`);
                throw new Error(`Failed to start tar extraction: ${startResult?.stdout || startResult?.stderr || 'unknown'}`);
            }
            console.log(`   🚀 [Cache] Tar extraction started in background`);

            // Poll per completamento (max 5 minuti)
            const maxWaitMs = 300000; // 5 min
            const pollIntervalMs = 3000; // 3 sec
            const startWait = Date.now();
            let extractionComplete = false;
            let lastLogLine = '';
            let lastSize = 0;

            while (Date.now() - startWait < maxWaitMs) {
                await new Promise(r => setTimeout(r, pollIntervalMs));

                // Check if extraction is done
                const checkDone = await flyService.exec(vmAgentUrl,
                    `test -f /tmp/tar_extract.done && cat /tmp/tar_extract.done || echo "PENDING"`,
                    '/home/coder', machineId, 5000, true);

                if (checkDone?.stdout?.includes('DONE')) {
                    extractionComplete = true;
                    const totalTime = Math.round((Date.now() - startWait)/1000);
                    const avgSpeedMBps = fileSizeMB / totalTime;
                    console.log(`   ✅ [Cache] Tar extraction completed after ${totalTime}s (avg ${avgSpeedMBps.toFixed(1)} MB/s)`);
                    break;
                }

                // Show progress every 10 seconds with download speed
                const elapsed = Math.round((Date.now() - startWait) / 1000);
                if (elapsed % 10 === 0 && elapsed > 0) {
                    // Check current size of node_modules to estimate download progress
                    const sizeCheck = await flyService.exec(vmAgentUrl,
                        `du -sm /home/coder/project/node_modules 2>/dev/null | cut -f1 || echo "0"`,
                        '/home/coder', machineId, 5000, true);
                    const currentSizeMB = parseInt(sizeCheck?.stdout?.trim() || '0');
                    const deltaMB = currentSizeMB - lastSize;
                    const speedMBps = deltaMB / (pollIntervalMs * (10 / 3) / 1000); // MB per second over last 10s
                    lastSize = currentSizeMB;

                    console.log(`   ⏳ [Cache] Extracting... ${elapsed}s - ${currentSizeMB}MB/${fileSizeMB}MB (${speedMBps.toFixed(1)} MB/s)`);
                }
            }

            if (!extractionComplete) {
                // Check log for errors
                const logResult = await flyService.exec(vmAgentUrl,
                    `cat /tmp/tar_extract.log 2>/dev/null | tail -20 || echo "no log"`,
                    '/home/coder', machineId, 5000, true);
                console.error(`   ❌ [Cache] Tar extraction timed out. Log:`, logResult?.stdout?.substring(0, 500));
                throw new Error('Tar extraction timed out after 5 minutes');
            }

            // Check for extraction errors in log
            const tarLog = await flyService.exec(vmAgentUrl,
                `cat /tmp/tar_extract.log 2>/dev/null || echo ""`,
                '/home/coder', machineId, 5000, true);
            if (tarLog?.stdout && tarLog.stdout.includes('error')) {
                console.warn(`   ⚠️ [Cache] Tar had some warnings:`, tarLog.stdout.substring(0, 200));
            }

            // Cleanup temp files and permissions (no tarball to remove with streaming)
            const cleanupCmd = `rm -f /tmp/tar_extract.log /tmp/tar_extract.done && (chown -R coder:coder /home/coder/project/node_modules 2>/dev/null || true) && echo "CLEANUP_OK"`;
            await flyService.exec(vmAgentUrl, cleanupCmd, '/home/coder', machineId, 60000, true);

            // 5. Verifica estrazione
            const verifyCmd = `ls -la /home/coder/project/node_modules 2>&1 | head -5; test -d /home/coder/project/node_modules && echo "VERIFY_SUCCESS" || echo "VERIFY_FAILED"`;
            const verifyResult = await flyService.exec(vmAgentUrl, verifyCmd, '/home/coder', machineId, 10000, true);
            console.log(`   🔍 [Cache] Verify result:`, verifyResult?.stdout?.substring(0, 200));

            if (!verifyResult?.stdout?.includes('VERIFY_SUCCESS')) {
                throw new Error(`Extraction verification failed: ${verifyResult?.stdout || 'node_modules not found'}`);
            }

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
