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
     * @param {string} projectId - Project ID
     * @param {Array} files - Array of {path, content} objects
     */
    async saveFiles(projectId, files) {
        console.log(`💾 [Storage] Saving ${files.length} files for project ${projectId}`);

        const db = this._getDb();
        const batch = db.batch();
        const collection = this._getFilesCollection(projectId);

        let successCount = 0;

        for (const { path: filePath, content } of files) {
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
            console.log(`✅ [Storage] Saved ${successCount}/${files.length} files`);
            return { success: true, savedCount: successCount };
        } catch (error) {
            console.error(`❌ [Storage] Batch save failed:`, error.message);
            return { success: false, savedCount: 0, error: error.message };
        }
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
            const { content } = await this.readFile(projectId, file.path);
            if (content) {
                bundle.push({ path: file.path, content });
            }
        }

        return bundle;
    }

    /**
     * Sync files from storage to a MicroVM
     * @param {string} projectId - Project ID
     * @param {string} agentUrl - URL of the Drape Agent on the VM
     */
    async syncToVM(projectId, agentUrl) {
        const axios = require('axios');
        const bundle = await this.createBundle(projectId);

        if (bundle.length === 0) {
            console.log(`⚠️ [Storage] No files to sync for ${projectId}`);
            return { success: true, syncedCount: 0 };
        }

        console.log(`🔄 [Storage] Syncing ${bundle.length} files to VM...`);

        let syncedCount = 0;
        const RETRY_DELAY = 1000;
        const MAX_RETRIES = 3;

        // Helper for delay
        const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

        // Write each file to the VM
        for (const file of bundle) {
            let attempt = 0;
            let saved = false;

            while (attempt < MAX_RETRIES && !saved) {
                try {
                    attempt++;
                    await axios.post(`${agentUrl}/file`, {
                        path: file.path,
                        content: file.content
                    }, { timeout: 30000 }); // Increased to 30s

                    saved = true;
                    syncedCount++;
                } catch (error) {
                    const isLastAttempt = attempt === MAX_RETRIES;
                    console.warn(`⚠️ [Storage] Failed to sync ${file.path} (Attempt ${attempt}/${MAX_RETRIES}): ${error.message}`);

                    if (!isLastAttempt) {
                        await delay(RETRY_DELAY);
                    }
                }
            }
        }

        console.log(`✅ [Storage] Synced ${syncedCount}/${bundle.length} files to VM`);
        return { success: true, syncedCount };
    }
}

module.exports = new StorageService();
