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
     * Usa signed URLs per upload diretto dalla VM (evita base64 truncation)
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

            // Exclude large unnecessary files, use fast compression (gzip -1) for 2-3x faster extraction
            const createTarCmd = `
                cd /home/coder/project && \
                tar -cf - \
                    --exclude='.next/cache/webpack' \
                    --exclude='.next/cache/fetch-cache' \
                    --exclude='.next/trace' \
                    .next/ 2>/dev/null | gzip -1 > ${tarballPath} || echo "tar failed"
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

            // 4. Generate signed URL for upload
            console.log(`   🔗 [NextCache] Generating signed URL for upload...`);
            const fileName = this.getCacheKey(projectId);
            const file = bucket.file(fileName);

            // Signed URL per upload, valido 15 minuti
            const [signedUrl] = await file.getSignedUrl({
                action: 'write',
                expires: Date.now() + 15 * 60 * 1000, // 15 min
                contentType: 'application/gzip',
            });

            console.log(`   ✅ [NextCache] Signed URL generated`);

            // 5. VM uploads directly to Firebase Storage via curl
            console.log(`   ☁️ [NextCache] VM uploading to Firebase Storage...`);
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

            console.log(`   ✅ [NextCache] Uploaded to Firebase Storage`);

            // 6. Cleanup tarball on VM
            await flyService.exec(vmAgentUrl, `rm -f ${tarballPath}`, '/home/coder', machineId, 10000, true);

            // TIER 2.6: Save source hash after successful save (enables persistent .next)
            try {
                const hashCmd = `cd /home/coder/project && (find app src pages components public styles -type f 2>/dev/null | sort | xargs -r stat -c '%Y %n' 2>/dev/null | md5sum | cut -d' ' -f1 || echo "none") > .next-source-hash`;
                await flyService.exec(vmAgentUrl, hashCmd, '/home/coder', machineId, 10000, true);
                console.log(`   💾 [NextCache] Saved source hash for persistent cache`);
            } catch (hashError) {
                console.log(`   ⚠️ [NextCache] Failed to save source hash: ${hashError.message}`);
            }

            const elapsed = Date.now() - startTime;
            console.log(`   ✅ [NextCache] Saved in ${elapsed}ms`);

            return {
                success: true,
                projectId,
                size: tarballSize,
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
     * Usa signed URLs per download diretto dalla VM (evita base64 truncation)
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

            // 2. Generate signed URL for direct download from VM
            console.log(`   🔗 [NextCache] Generating signed URL for download...`);
            const fileName = this.getCacheKey(projectId);
            const file = bucket.file(fileName);

            // Signed URL valido per 15 minuti
            const [signedUrl] = await file.getSignedUrl({
                action: 'read',
                expires: Date.now() + 15 * 60 * 1000, // 15 min
            });

            console.log(`   ✅ [NextCache] Signed URL generated`);

            // 3. TIER 2.5: Streaming extraction - download + extract in parallel (save 20-30s)
            console.log(`   🚀 [NextCache] Streaming download + extraction (TIER 2.5)...`);

            // Prepare directory
            const prepareCmd = `cd /home/coder/project && rm -rf .next 2>&1 && echo "PREP_OK"`;
            const prepResult = await flyService.exec(vmAgentUrl, prepareCmd, '/home/coder', machineId, 30000, true);
            console.log(`   📋 [NextCache] Prepare result:`, prepResult?.stdout?.trim() || 'no output');

            // Stream download directly to tar extraction in BACKGROUND (avoids timeout + saves time)
            // This pipes curl output directly to tar, so extraction starts while downloading
            const streamExtractCmd = `cd /home/coder/project && (curl -sL "${signedUrl}" | tar -xzf - > /tmp/tar_next_extract.log 2>&1; echo "DONE" > /tmp/tar_next_extract.done) & echo "EXTRACTION_STARTED"`;
            const startResult = await flyService.exec(vmAgentUrl, streamExtractCmd, '/home/coder', machineId, 30000, true);

            if (!startResult?.stdout?.includes('EXTRACTION_STARTED')) {
                throw new Error(`Failed to start tar extraction: ${startResult?.stdout || startResult?.stderr || 'unknown'}`);
            }
            console.log(`   🚀 [NextCache] Tar extraction started in background`);

            // Poll per completamento (max 3 minuti - .next è più piccolo di node_modules)
            const maxWaitMs = 180000; // 3 min
            const pollIntervalMs = 2000; // 2 sec
            const startWait = Date.now();
            let extractionComplete = false;

            while (Date.now() - startWait < maxWaitMs) {
                await new Promise(r => setTimeout(r, pollIntervalMs));

                // Check if extraction is done
                const checkDone = await flyService.exec(vmAgentUrl,
                    `test -f /tmp/tar_next_extract.done && cat /tmp/tar_next_extract.done || echo "PENDING"`,
                    '/home/coder', machineId, 5000, true);

                if (checkDone?.stdout?.includes('DONE')) {
                    extractionComplete = true;
                    console.log(`   ✅ [NextCache] Tar extraction completed after ${Math.round((Date.now() - startWait)/1000)}s`);
                    break;
                }

                // Show progress every 10 seconds
                const elapsed = Math.round((Date.now() - startWait) / 1000);
                if (elapsed % 10 === 0 && elapsed > 0) {
                    console.log(`   ⏳ [NextCache] Extracting... (${elapsed}s)`);
                }
            }

            if (!extractionComplete) {
                const logResult = await flyService.exec(vmAgentUrl,
                    `cat /tmp/tar_next_extract.log 2>/dev/null | tail -10 || echo "no log"`,
                    '/home/coder', machineId, 5000, true);
                console.error(`   ❌ [NextCache] Tar extraction timed out. Log:`, logResult?.stdout?.substring(0, 300));
                throw new Error('Tar extraction timed out after 3 minutes');
            }

            // Cleanup temp files and permissions (no tarball to remove with streaming)
            const cleanupCmd = `rm -f /tmp/tar_next_extract.log /tmp/tar_next_extract.done && (chown -R coder:coder /home/coder/project/.next 2>/dev/null || true) && echo "CLEANUP_OK"`;
            await flyService.exec(vmAgentUrl, cleanupCmd, '/home/coder', machineId, 30000, true);

            // 5. Verify extraction
            const verifyCmd = `ls -la /home/coder/project/.next 2>&1 | head -5; test -d /home/coder/project/.next && echo "VERIFY_SUCCESS" || echo "VERIFY_FAILED"`;
            const verifyResult = await flyService.exec(vmAgentUrl, verifyCmd, '/home/coder', machineId, 10000, true);
            console.log(`   🔍 [NextCache] Verify result:`, verifyResult?.stdout?.substring(0, 200));

            if (!verifyResult?.stdout?.includes('VERIFY_SUCCESS')) {
                throw new Error(`Extraction verification failed: ${verifyResult?.stdout || '.next not found'}`);
            }

            // TIER 2.6: Save source hash after successful restore (enables persistent .next)
            try {
                const hashCmd = `cd /home/coder/project && (find app src pages components public styles -type f 2>/dev/null | sort | xargs -r stat -c '%Y %n' 2>/dev/null | md5sum | cut -d' ' -f1 || echo "none") > .next-source-hash`;
                await flyService.exec(vmAgentUrl, hashCmd, '/home/coder', machineId, 10000, true);
                console.log(`   💾 [NextCache] Saved source hash for persistent cache`);
            } catch (hashError) {
                console.log(`   ⚠️ [NextCache] Failed to save source hash: ${hashError.message}`);
            }

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
