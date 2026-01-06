const lancedb = require('@lancedb/lancedb');
const path = require('path');
const fs = require('fs').promises;
const { glob } = require('glob');
const { getProvider } = require('./ai-providers');

/**
 * Super Pro Vector Database Service 🚀
 * Handles RAG (Retrieval Augmented Generation) for the codebase.
 */
class VectorStore {
    constructor() {
        this.db = null;
        this.table = null;
        this.TABLE_NAME = 'code_vectors';
        this.DB_PATH = path.join(__dirname, '../../.drape/vectors');
        this.isReady = false;
    }

    /**
     * Initialize the DB and open table
     */
    async initialize() {
        try {
            await fs.mkdir(this.DB_PATH, { recursive: true });

            console.log(`📦 [VectorStore] Connecting to LanceDB at ${this.DB_PATH}...`);
            try {
                // Initialize LanceDB
                this.db = await lancedb.connect(this.DB_PATH);
                console.log('📦 [VectorStore] Connection successful.');
            } catch (dbError) {
                console.error('❌ [VectorStore] CRITICAL: LanceDB connection failed:', dbError);
                throw dbError;
            }

            // Check if table exists, create if not
            const tableNames = await this.db.tableNames();
            if (tableNames.includes(this.TABLE_NAME)) {
                this.table = await this.db.openTable(this.TABLE_NAME);
            } else {
                // Initial schema implies empty data
                // LanceDB schemas are inferred from first insertion usually, 
                // but we can create empty if supported or wait for indexProject
                // For now, we'll wait for indexProject to create it.
                console.log('📦 [VectorStore] Table not found, waiting for first index...');
            }

            this.isReady = true;
            console.log(`🚀 [VectorStore] Initialized at ${this.DB_PATH}`);

            // Trigger background indexing
            this.indexProject().catch(e => console.error('Background indexing failed:', e));

        } catch (error) {
            console.error('❌ [VectorStore] Init failed:', error);
        }
    }

    /**
     * Index a specific project by path
     */
    async indexProject(projectPath = process.cwd(), projectId = 'main') {
        if (!this.db) return;

        console.log(`🧠 [VectorStore] Indexing project: ${projectId} at ${projectPath}`);
        const gemini = getProvider('gemini');

        try {
            // Ensure path exists
            try {
                await fs.access(projectPath);
            } catch {
                console.warn(`⚠️ [VectorStore] Path not found: ${projectPath}`);
                return;
            }

            // Find all relevant source files
            const files = await glob('**/*.{js,ts,tsx,css,md,json,html,py}', {
                cwd: projectPath,
                ignore: ['node_modules/**', 'dist/**', 'build/**', '.git/**', '.drape/**']
            });

            console.log(`🧠 [VectorStore] Found ${files.length} files in ${projectId}.`);

            let vectors = [];

            // Process files in batches
            for (const file of files) {
                const content = await fs.readFile(path.join(projectPath, file), 'utf-8');
                if (content.length > 50000) continue; // Skip massive files

                // Create chunks (simplified sentence/paragraph splitter for now)
                const chunks = this.chunkText(content, 1000);

                for (const chunk of chunks) {
                    try {
                        const embedding = await gemini.embed(chunk);
                        vectors.push({
                            id: `${file}-${Date.now()}-${Math.random()}`,
                            vector: embedding,
                            text: chunk,
                            metadata: { file, timestamp: Date.now() }
                        });
                    } catch (e) {
                        // limit checks or api errors
                    }
                }

                // Flush every 50 vectors
                if (vectors.length >= 50) {
                    await this.upsertVectors(vectors);
                    vectors = [];
                }
            }

            // Final flush
            if (vectors.length > 0) await this.upsertVectors(vectors);

            console.log('✅ [VectorStore] Indexing complete!');

        } catch (error) {
            console.error('❌ [VectorStore] Indexing error:', error);
        }
    }

    /**
     * Upsert vectors to LanceDB
     */
    async upsertVectors(vectors) {
        if (!this.table) {
            // Create table on first insert
            this.table = await this.db.createTable(this.TABLE_NAME, vectors);
        } else {
            await this.table.add(vectors);
        }
    }

    /**
     * Search for relevant context
     */
    async search(query, limit = 5) {
        if (!this.table || !this.isReady) return [];

        try {
            const gemini = getProvider('gemini');
            const queryEmbedding = await gemini.embed(query);

            const results = await this.table.search(queryEmbedding)
                .limit(limit)
                .execute();

            if (!Array.isArray(results)) {
                if (results && results.length === 0) return [];
                // Handle potential weird return types or future API changes
                console.warn('[VectorStore] Unexpected search result type:', typeof results);
                return [];
            }

            return results.map(r => ({
                text: r.text,
                file: r.metadata.file,
                score: r._distance // LanceDB returns distance (lower is better usually)
            }));
        } catch (error) {
            console.error('search error', error);
            return [];
        }
    }

    /**
     * Simple chunker
     */
    chunkText(text, maxLength) {
        const chunks = [];
        let current = '';
        const lines = text.split('\n');

        for (const line of lines) {
            if ((current.length + line.length) > maxLength) {
                chunks.push(current);
                current = '';
            }
            current += line + '\n';
        }
        if (current) chunks.push(current);
        return chunks;
    }
}

module.exports = new VectorStore();
