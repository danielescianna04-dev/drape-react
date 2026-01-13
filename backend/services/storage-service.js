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
     * Check if a file is binary based on extension
     */
    _isBinaryFile(filePath) {
        const binaryExtensions = [
            '.ico', '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg',
            '.woff', '.woff2', '.ttf', '.otf', '.eot',
            '.pdf', '.zip', '.tar', '.gz', '.mp3', '.mp4', '.avi', '.mov',
            '.exe', '.dll', '.so', '.dylib'
        ];
        return binaryExtensions.some(ext => filePath.toLowerCase().endsWith(ext));
    }

    /**
     * Check if a file should be ignored/excluded from sync
     * @param {string} filePath - File path to check
     * @returns {boolean} True if file should be ignored
     */
    _shouldIgnoreFile(filePath) {
        const ignoredExtensions = ['.ico']; // Exclude .ico files (often corrupted and cause Next.js issues)
        return ignoredExtensions.some(ext => filePath.toLowerCase().endsWith(ext));
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
            const isBinary = this._isBinaryFile(filePath);
            let contentToSave;

            if (typeof content === 'string') {
                contentToSave = content;
            } else {
                // Buffer: convert to base64 if binary, utf-8 if text
                contentToSave = isBinary ? content.toString('base64') : content.toString('utf-8');
            }

            await collection.doc(docId).set({
                path: filePath,
                content: contentToSave,
                isBinary: isBinary,
                size: content.length,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            return { success: true, path: filePath, isBinary };
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
                size: data.size,
                isBinary: data.isBinary || false
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

            const files = snapshot.docs
                .map(doc => {
                    const data = doc.data();
                    return {
                        path: data.path,
                        size: data.size || 0,
                        updatedAt: data.updatedAt?.toDate?.()?.toISOString() || null
                    };
                })
                .filter(file => !this._shouldIgnoreFile(file.path)); // Exclude ignored files

            return { success: true, files };
        } catch (error) {
            console.error(`❌ [Storage] List error:`, error.message);
            return { success: false, files: [], error: error.message };
        }
    }

    /**
     * Get all files with content (for bulk syncing)
     * @param {string} projectId - Project ID
     */
    async getAllFilesWithContent(projectId) {
        const collection = this._getFilesCollection(projectId);

        try {
            const snapshot = await collection.get();

            const files = snapshot.docs
                .map(doc => {
                    const data = doc.data();
                    return {
                        path: data.path,
                        content: data.content,
                        size: data.size || (data.content ? data.content.length : 0),
                        updatedAt: data.updatedAt?.toDate?.()?.toISOString() || null
                    };
                })
                .filter(file => !this._shouldIgnoreFile(file.path)); // Exclude ignored files

            return { success: true, files };
        } catch (error) {
            console.error(`❌ [Storage] Get all files error:`, error.message);
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
        // Filter out ignored files (e.g., .ico files that cause issues)
        const filteredFiles = files.filter(f => !this._shouldIgnoreFile(f.path));
        const ignoredCount = files.length - filteredFiles.length;

        if (ignoredCount > 0) {
            console.log(`⏭️ [Storage] Ignoring ${ignoredCount} files (.ico, etc.)`);
        }

        console.log(`💾 [Storage] Saving ${filteredFiles.length} files for project ${projectId}`);

        const db = this._getDb();
        const collection = this._getFilesCollection(projectId);
        const BATCH_LIMIT = 450; // Firestore limit is 500, use 450 for safety margin

        let successCount = 0;
        let batchIndex = 0;

        // Chunk files into groups of BATCH_LIMIT
        for (let i = 0; i < filteredFiles.length; i += BATCH_LIMIT) {
            const chunk = filteredFiles.slice(i, i + BATCH_LIMIT);
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
     * Create a folder (placeholder in storage)
     * Note: Folders are implicit in the path structure, but we create a .keep file
     * @param {string} projectId - Project ID
     * @param {string} folderPath - Folder path to create
     */
    async createFolder(projectId, folderPath) {
        // Create a .keep file to ensure the folder exists
        const keepFilePath = `${folderPath}/.keep`;
        return await this.saveFile(projectId, keepFilePath, '');
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

        const bundle = [];

        for (const file of files) {
            const result = await this.readFile(projectId, file.path);

            if (!result.success || !result.content) {
                console.warn(`   ⚠️ Failed to read ${file.path}, skipping`);
                continue;
            }

            // Detect binary files: use flag if present, otherwise detect by extension
            const isBinary = result.isBinary || this._isBinaryFile(file.path);

            // Binary files are stored as base64 in Firestore, decode them to Buffer
            if (isBinary) {
                try {
                    const buffer = Buffer.from(result.content, 'base64');
                    bundle.push({ path: file.path, content: buffer, isBinary: true });
                } catch (e) {
                    console.warn(`   ⚠️ Failed to decode binary ${file.path}: ${e.message}`);
                }
            } else {
                // Text files as-is
                bundle.push({ path: file.path, content: result.content, isBinary: false });
            }
        }

        console.log(`   📦 Bundle created: ${bundle.length} files (${bundle.filter(f => f.isBinary).length} binary)`);
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
        const archiver = require('archiver');
        const bundle = await this.createBundle(projectId);

        if (bundle.length === 0) {
            console.log(`⚠️ [Storage] No files to sync for ${projectId}`);
            return { success: true, syncedCount: 0 };
        }

        const startTime = Date.now();
        console.log(`🔄 [Storage] Syncing ${bundle.length} files to VM (tar.gz)...`);

        // Headers for Fly.io routing
        const headers = machineId ? { 'Fly-Force-Instance-Id': machineId } : {};

        try {
            // Create tar.gz archive in memory
            const archive = archiver('tar', { gzip: true, gzipOptions: { level: 6 } });
            const chunks = [];

            archive.on('data', chunk => chunks.push(chunk));

            // Add all files to archive
            for (const file of bundle) {
                archive.append(file.content, { name: file.path });
            }

            await archive.finalize();

            // Wait for archive to complete
            await new Promise((resolve, reject) => {
                archive.on('end', resolve);
                archive.on('error', reject);
            });

            const buffer = Buffer.concat(chunks);
            const base64Archive = buffer.toString('base64');

            console.log(`   📦 Archive: ${bundle.length} files, ${(buffer.length / 1024).toFixed(1)}KB compressed`);

            // Send to VM
            const response = await axios.post(`${agentUrl}/extract`, {
                archive: base64Archive
            }, {
                timeout: 30000,
                headers,
                maxContentLength: 50 * 1024 * 1024,
                maxBodyLength: 50 * 1024 * 1024
            });

            const elapsed = Date.now() - startTime;
            console.log(`✅ [Storage] Synced ${response.data.filesExtracted || bundle.length} files in ${elapsed}ms`);
            return { success: true, syncedCount: bundle.length, failedCount: 0 };

        } catch (e) {
            console.warn(`⚠️ [Storage] Bulk sync failed, falling back to parallel: ${e.message}`);

            // Fallback to parallel file sync
            const PARALLEL_LIMIT = 20;
            let syncedCount = 0;
            let failedFiles = [];

            const syncFile = async (file) => {
                try {
                    await axios.post(`${agentUrl}/file`, {
                        path: file.path,
                        content: file.content
                    }, { timeout: 10000, headers });
                    return { success: true };
                } catch (error) {
                    return { success: false, path: file.path };
                }
            };

            for (let i = 0; i < bundle.length; i += PARALLEL_LIMIT) {
                const batch = bundle.slice(i, i + PARALLEL_LIMIT);
                const results = await Promise.all(batch.map(syncFile));
                for (const r of results) {
                    if (r.success) syncedCount++;
                    else failedFiles.push(r.path);
                }
            }

            console.log(`✅ [Storage] Fallback synced ${syncedCount}/${bundle.length} files`);
            return { success: true, syncedCount, failedCount: failedFiles.length };
        }
    }
}

module.exports = new StorageService();
