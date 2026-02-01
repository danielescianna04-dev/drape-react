const http = require('http');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

// Simulate the agent's upload endpoint
const server = http.createServer(async (req, res) => {
    if (req.url.startsWith('/upload') && req.method === 'POST') {
        const url = new URL(req.url, 'http://localhost:13338');
        const targetPath = url.searchParams.get('path');
        const shouldExtract = url.searchParams.get('extract') === 'true';

        console.log(`[Test Agent] Upload request: path=${targetPath}, extract=${shouldExtract}`);

        if (!targetPath) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'path parameter required' }));
            return;
        }

        const startTime = Date.now();
        const tempFile = path.join(os.tmpdir(), `cache-upload-test-${Date.now()}.tar.gz`);
        console.log(`[Test Agent] Temp file: ${tempFile}`);

        try {
            console.log(`[Test Agent] Creating write stream...`);

            // Write incoming stream to temp file
            const fsStream = require('fs');
            const writeStream = fsStream.createWriteStream(tempFile);

            await new Promise((resolve, reject) => {
                req.pipe(writeStream);
                writeStream.on('finish', () => {
                    console.log(`[Test Agent] ✅ Stream finished`);
                    resolve();
                });
                writeStream.on('error', (err) => {
                    console.log(`[Test Agent] ❌ Write stream error: ${err.message}`);
                    reject(err);
                });
                req.on('error', (err) => {
                    console.log(`[Test Agent] ❌ Request stream error: ${err.message}`);
                    reject(err);
                });
            });

            console.log(`[Test Agent] Checking file stats...`);
            const stats = await fs.stat(tempFile);
            const sizeMB = (stats.size / 1024 / 1024).toFixed(1);
            console.log(`[Test Agent] ✅ Received ${sizeMB}MB archive`);

            const elapsed = Date.now() - startTime;

            // Cleanup
            await fs.unlink(tempFile).catch(() => {});

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                sizeMB: parseFloat(sizeMB),
                elapsed
            }));

        } catch (error) {
            console.error(`[Test Agent] ❌ Upload error: ${error.message}`);
            console.error(error.stack);

            // Cleanup on error
            await fs.unlink(tempFile).catch(() => {});

            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: error.message }));
        }
    } else {
        res.writeHead(404);
        res.end('Not found');
    }
});

server.listen(13338, async () => {
    console.log('🧪 Test agent listening on http://localhost:13338');
    console.log('Testing upload...\n');

    // Test with axios like the backend does
    const axios = require('axios');

    // Create a small test file
    const testFile = path.join(os.tmpdir(), 'test-upload.tar.gz');
    await fs.writeFile(testFile, Buffer.from('test content'));

    try {
        const testData = await fs.readFile(testFile);
        const res = await axios.post(
            'http://localhost:13338/upload?path=/tmp/test&extract=false',
            testData,
            {
                headers: {
                    'Content-Type': 'application/gzip',
                    'Content-Length': testData.length
                },
                timeout: 5000
            }
        );

        console.log('\n✅ Upload test SUCCESS!');
        console.log('Response:', res.data);
    } catch (error) {
        console.log('\n❌ Upload test FAILED!');
        console.log('Error:', error.response?.data || error.message);
    } finally {
        await fs.unlink(testFile).catch(() => {});
        server.close();
        process.exit(0);
    }
});
