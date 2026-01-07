/**
 * Project Storage Service
 * Holy Grail Architecture - File persistence layer
 * 
 * Uses Firestore to persist project files (more reliable than Storage buckets).
 * Files are stored as documents with content as base64 for binary safety.
 */

const admin = require('firebase-admin');

class StorageService {
    constructor() {
        this._db = null;
    }

    /**
     * Get Firestore database (lazy loading)
     */
    _getDb() {
        if (!this._db) {
            this._db = admin.firestore();
        }
        return this._db;
    }

    /**
     * Get the collection path for a project's files
     * @param {string} projectId - Project ID
     */
    _getFilesCollection(projectId) {
        return this._getDb().collection('projects').doc(projectId).collection('files');
    }

    /**
     * Encode file path to be Firestore-safe (no slashes in doc IDs)
     */
    _encodeFilePath(filePath) {
        return filePath.replace(/\//g, '__SLASH__');
    }

    /**
     * Decode Firestore doc ID back to file path
     */
    _decodeFilePath(docId) {
        return docId.replace(/__SLASH__/g, '/');
    }

    /**
     * Save a single file to storage
     * @param {string} projectId - Project ID
     * @param {string} filePath - Path within project (e.g., "src/App.tsx")
     * @param {string|Buffer} content - File content
     */
    async saveFile(projectId, filePath, content) {
        const collection = this._getFilesCollection(projectId);
        const docId = this._encodeFilePath(filePath);

        try {
            await collection.doc(docId).set({
                path: filePath,
                content: typeof content === 'string' ? content : content.toString('utf-8'),
                size: content.length,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            return { success: true, path: filePath };
        } catch (error) {
            console.error(`❌ [Storage] Save failed for ${filePath}:`, error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Read a file from storage
     * @param {string} projectId - Project ID
     * @param {string} filePath - Path within project
     */
    async readFile(projectId, filePath) {
        const collection = this._getFilesCollection(projectId);
        const docId = this._encodeFilePath(filePath);

        try {
            const doc = await collection.doc(docId).get();

            if (!doc.exists) {
                return { success: false, error: 'File not found' };
            }

            const data = doc.data();
            return {
                success: true,
                content: data.content,
                path: data.path,
                size: data.size
            };
        } catch (error) {
            console.error(`❌ [Storage] Read failed for ${filePath}:`, error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * List all files in a project
     * @param {string} projectId - Project ID
     */
    async listFiles(projectId) {
        const collection = this._getFilesCollection(projectId);

        try {
            const snapshot = await collection.get();

            const files = snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    path: data.path,
                    size: data.size || 0,
                    updatedAt: data.updatedAt?.toDate?.()?.toISOString() || null
                };
            });

            return { success: true, files };
        } catch (error) {
            console.error(`❌ [Storage] List error:`, error.message);
            return { success: false, files: [], error: error.message };
        }
    }

    /**
     * Save multiple files at once (for cloning repos)
     * Uses chunked batches to handle Firestore's 500 operations limit
     * @param {string} projectId - Project ID
     * @param {Array} files - Array of {path, content} objects
     */
    async saveFiles(projectId, files) {
        console.log(`💾 [Storage] Saving ${files.length} files for project ${projectId}`);

        const db = this._getDb();
        const collection = this._getFilesCollection(projectId);
        const BATCH_LIMIT = 450; // Firestore limit is 500, use 450 for safety margin

        let successCount = 0;
        let batchIndex = 0;

        // Chunk files into groups of BATCH_LIMIT
        for (let i = 0; i < files.length; i += BATCH_LIMIT) {
            const chunk = files.slice(i, i + BATCH_LIMIT);
            const batch = db.batch();
            batchIndex++;

            for (const { path: filePath, content } of chunk) {
                try {
                    const docId = this._encodeFilePath(filePath);
                    const docRef = collection.doc(docId);

                    batch.set(docRef, {
                        path: filePath,
                        content: typeof content === 'string' ? content : content.toString('utf-8'),
                        size: content.length,
                        updatedAt: admin.firestore.FieldValue.serverTimestamp()
                    });

                    successCount++;
                } catch (error) {
                    console.warn(`⚠️ [Storage] Skipping ${filePath}: ${error.message}`);
                }
            }

            try {
                await batch.commit();
                console.log(`   📦 Batch ${batchIndex}: ${chunk.length} files committed`);
            } catch (error) {
                console.error(`❌ [Storage] Batch ${batchIndex} failed:`, error.message);
                successCount -= chunk.length; // Rollback count for failed batch
            }
        }

        console.log(`✅ [Storage] Saved ${successCount}/${files.length} files in ${batchIndex} batch(es)`);
        return { success: true, savedCount: successCount };
    }

    /**
     * Delete a file from storage
     * @param {string} projectId - Project ID
     * @param {string} filePath - Path within project
     */
    async deleteFile(projectId, filePath) {
        const collection = this._getFilesCollection(projectId);
        const docId = this._encodeFilePath(filePath);

        try {
            await collection.doc(docId).delete();
            return { success: true };
        } catch (error) {
            console.error(`❌ [Storage] Delete failed for ${filePath}:`, error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Delete all files for a project
     * @param {string} projectId - Project ID
     */
    async deleteProject(projectId) {
        const collection = this._getFilesCollection(projectId);

        try {
            const snapshot = await collection.get();
            const batch = this._getDb().batch();

            snapshot.docs.forEach(doc => {
                batch.delete(doc.ref);
            });

            await batch.commit();
            console.log(`🗑️ [Storage] Deleted project: ${projectId}`);
            return { success: true };
        } catch (error) {
            console.error(`❌ [Storage] Delete project error:`, error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Save project metadata (like repositoryUrl)
     * @param {string} projectId - Project ID
     * @param {Object} metadata - Metadata to save
     */
    async saveProjectMetadata(projectId, metadata) {
        try {
            await this._getDb().collection('projects').doc(projectId).set(metadata, { merge: true });
            return { success: true };
        } catch (error) {
            console.error(`❌ [Storage] Save metadata failed:`, error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get project metadata (repositoryUrl, etc.)
     * Searches both 'projects' and 'workstations' collections
     * @param {string} projectId - Project ID
     */
    async getProjectMetadata(projectId) {
        try {
            // First try projects collection
            const projectDoc = await this._getDb().collection('projects').doc(projectId).get();
            if (projectDoc.exists) {
                return { success: true, data: projectDoc.data() };
            }

            // Try lowercase
            const projectDocLower = await this._getDb().collection('projects').doc(projectId.toLowerCase()).get();
            if (projectDocLower.exists) {
                return { success: true, data: projectDocLower.data() };
            }

            // Fallback: search workstations collection by projectId field
            const wsSnapshot = await this._getDb()
                .collection('workstations')
                .where('projectId', '==', projectId)
                .limit(1)
                .get();

            if (!wsSnapshot.empty) {
                return { success: true, data: wsSnapshot.docs[0].data() };
            }

            return { success: false, error: 'Project not found' };
        } catch (error) {
            console.error(`❌ [Storage] Get metadata failed:`, error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Create a bundle of all project files (for syncing to VM)
     * @param {string} projectId - Project ID
     */
    async createBundle(projectId) {
        const { success, files } = await this.listFiles(projectId);

        if (!success || !files.length) {
            return [];
        }

        // Skip binary files that get corrupted during text-based sync
        const SKIP_EXTENSIONS = [
            // Images
            '.ico', '.icns', '.cur', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.tiff', '.svg',
            // Fonts
            '.woff', '.woff2', '.ttf', '.otf', '.eot',
            // Other binary
            '.pdf', '.zip', '.tar', '.gz', '.mp3', '.mp4', '.wav', '.mov', '.avi'
        ];

        const bundle = [];

        for (const file of files) {
            // Skip problematic binary files
            const ext = file.path.substring(file.path.lastIndexOf('.')).toLowerCase();
            if (SKIP_EXTENSIONS.includes(ext)) {
                console.log(`   ⏭️ Skipping binary: ${file.path}`);
                continue;
            }

            const { content } = await this.readFile(projectId, file.path);
            if (content) {
                bundle.push({ path: file.path, content });
            }
        }

        return bundle;
    }

    /**
     * Sync files from storage to a MicroVM
     * Uses parallel batching for faster sync (10 files at a time)
     * @param {string} projectId - Project ID
     * @param {string} agentUrl - URL of the Drape Agent on the VM
     * @param {string} machineId - Optional machine ID for routing header
     */
    async syncToVM(projectId, agentUrl, machineId = null) {
        const axios = require('axios');
        const bundle = await this.createBundle(projectId);

        if (bundle.length === 0) {
            console.log(`⚠️ [Storage] No files to sync for ${projectId}`);
            return { success: true, syncedCount: 0 };
        }

        console.log(`🔄 [Storage] Syncing ${bundle.length} files to VM (parallel)...`);

        const PARALLEL_LIMIT = 20; // Sync 20 files concurrently (was 10)
        const MAX_RETRIES = 2;    // Reduced retries for speed
        const RETRY_DELAY = 500;  // Faster retry

        let syncedCount = 0;
        let failedFiles = [];

        // Helper for delay
        const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

        // Headers for Fly.io routing
        const headers = machineId ? { 'Fly-Force-Instance-Id': machineId } : {};

        // Sync a single file with retries
        const syncFile = async (file) => {
            for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
                try {
                    await axios.post(`${agentUrl}/file`, {
                        path: file.path,
                        content: file.content
                    }, { timeout: 10000, headers }); // Reduced from 30s to 10s
                    return { success: true, path: file.path };
                } catch (error) {
                    if (attempt < MAX_RETRIES) {
                        await delay(RETRY_DELAY);
                    } else {
                        return { success: false, path: file.path, error: error.message };
                    }
                }
            }
        };

        // Process files in parallel batches
        for (let i = 0; i < bundle.length; i += PARALLEL_LIMIT) {
            const batch = bundle.slice(i, i + PARALLEL_LIMIT);
            const batchNum = Math.floor(i / PARALLEL_LIMIT) + 1;
            const totalBatches = Math.ceil(bundle.length / PARALLEL_LIMIT);

            // Execute batch in parallel
            const results = await Promise.all(batch.map(syncFile));

            // Count successes and collect failures
            for (const result of results) {
                if (result.success) {
                    syncedCount++;
                } else {
                    failedFiles.push(result.path);
                }
            }

            console.log(`   📦 Batch ${batchNum}/${totalBatches}: ${results.filter(r => r.success).length}/${batch.length} synced`);
        }

        if (failedFiles.length > 0) {
            console.warn(`⚠️ [Storage] Failed to sync ${failedFiles.length} files: ${failedFiles.slice(0, 5).join(', ')}${failedFiles.length > 5 ? '...' : ''}`);
        }

        console.log(`✅ [Storage] Synced ${syncedCount}/${bundle.length} files to VM`);
        return { success: true, syncedCount, failedCount: failedFiles.length };
    }
}

module.exports = new StorageService();
