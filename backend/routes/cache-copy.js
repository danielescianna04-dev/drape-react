const express = require('express');
const router = express.Router();
const axios = require('axios');

/**
 * Copy cache from source VM to worker VM via direct VM-to-VM transfer
 * POST /api/cache-copy
 * Body: { workerMachineId, sourceMachineId, type: 'pnpm' | 'node_modules' }
 */
router.post('/cache-copy', async (req, res) => {
    const { workerMachineId, sourceMachineId, cacheMasterMachineId, type = 'pnpm' } = req.body;

    // Support both sourceMachineId and cacheMasterMachineId for backward compatibility
    const sourceVM = sourceMachineId || cacheMasterMachineId;

    if (!workerMachineId || !sourceVM) {
        return res.status(400).json({ error: 'Missing workerMachineId or sourceMachineId' });
    }

    try {
        console.log(`📦 [Cache Copy] Direct VM-to-VM transfer (${type}) from ${sourceVM} to ${workerMachineId}`);
        const startTime = Date.now();
        const agentUrl = 'https://drape-workspaces.fly.dev';

        // Direct VM-to-VM transfer: worker downloads directly from source VM
        // This avoids backend proxy timeout and is much faster (internal Fly.io network)
        console.log(`   Executing direct download on worker VM...`);

        let downloadCmd, targetDir, verifyCmd, minSizeMB;

        if (type === 'node_modules') {
            // node_modules transfer
            targetDir = '/home/coder/project';
            downloadCmd = `mkdir -p ${targetDir} && ` +
                         `curl -sS --fail --max-time 600 -H "Fly-Force-Instance-Id: ${sourceVM}" ` +
                         `"${agentUrl}/download?type=node_modules" | ` +
                         `tar -xzf - -C ${targetDir} 2>&1`;
            verifyCmd = 'du -sm /home/coder/project/node_modules 2>/dev/null | cut -f1 || echo "0"';
            minSizeMB = 10; // At least 10MB for valid node_modules
        } else {
            // pnpm transfer (default)
            targetDir = '/home/coder/volumes/pnpm-store';
            // Download endpoint now serves gzip for universal compatibility
            downloadCmd = `mkdir -p ${targetDir} && ` +
                         `curl -sS --fail --max-time 900 -H "Fly-Force-Instance-Id: ${sourceVM}" ` +
                         `"${agentUrl}/download?type=pnpm" | ` +
                         `tar -xzf - -C ${targetDir} 2>&1`;
            verifyCmd = 'du -sm /home/coder/volumes/pnpm-store 2>/dev/null | cut -f1 || echo "0"';
            minSizeMB = 500; // At least 500MB for valid pnpm cache
        }

        console.log(`   Command: ${downloadCmd}`);

        const execResponse = await axios.post(`${agentUrl}/exec`, {
            command: downloadCmd,
            cwd: '/home/coder',
            timeout: 900000 // 15 minutes for exec (large cache ~4.8GB)
        }, {
            headers: { 'Fly-Force-Instance-Id': workerMachineId },
            timeout: 930000 // 15.5 minutes total
        });

        if (execResponse.data.exitCode !== 0) {
            throw new Error(`Transfer failed: ${execResponse.data.stderr || execResponse.data.stdout}`);
        }

        console.log(`   ✅ Direct transfer completed`);

        // Verify cache size on worker
        const verifyResponse = await axios.post(`${agentUrl}/exec`, {
            command: verifyCmd,
            cwd: '/home/coder'
        }, {
            timeout: 10000,
            headers: { 'Fly-Force-Instance-Id': workerMachineId }
        });

        const finalSizeMB = parseInt(verifyResponse.data?.stdout?.trim() || '0');
        const elapsed = Date.now() - startTime;
        const success = finalSizeMB >= minSizeMB;

        console.log(`   ${success ? '✅' : '❌'} ${type} copy ${success ? 'completed' : 'failed'}: ${finalSizeMB}MB in ${elapsed}ms`);

        res.json({
            success,
            finalSizeMB,
            elapsed,
            type,
            message: success ? `${type} copied successfully` : `${type} copy incomplete`
        });

    } catch (error) {
        console.error(`❌ [Cache Copy] Error:`, error.message);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
