const axios = require('axios');

const AGENT_URL = 'https://drape-workspaces.fly.dev';
const WORKING_VM = '56834d13f67618';
const BROKEN_VM = 'e2861545b69ed8';

async function exec(machineId, command, cwd = '/home/coder') {
    try {
        const response = await axios.post(`${AGENT_URL}/exec`, {
            command,
            cwd
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Fly-Force-Instance-Id': machineId
            },
            timeout: 5000
        });
        return response.data;
    } catch (error) {
        return { exitCode: -1, stdout: '', stderr: error.message };
    }
}

async function compareVMs() {
    console.log('=== Comparing Working vs Broken VM ===\n');

    console.log(`Working VM: ${WORKING_VM}`);
    console.log('1. Check bash:');
    let result = await exec(WORKING_VM, 'which bash');
    console.log('  ', result.stdout?.trim() || 'NOT FOUND');

    console.log('2. Check agent process:');
    result = await exec(WORKING_VM, 'ps aux | grep drape-agent | grep -v grep');
    console.log('  ', result.stdout?.trim() || 'NO PROCESS');

    console.log('3. Agent version:');
    result = await exec(WORKING_VM, 'head -5 /drape-agent.js 2>&1');
    console.log('  ', result.stdout?.split('\n')[2] || 'UNKNOWN');

    console.log('\n' + '='.repeat(50) + '\n');

    console.log(`Broken VM: ${BROKEN_VM}`);
    console.log('1. Check bash:');
    result = await exec(BROKEN_VM, 'which bash');
    console.log('  ', result.stdout?.trim() || 'NOT FOUND');

    console.log('2. Check agent process:');
    result = await exec(BROKEN_VM, 'ps aux | grep drape-agent | grep -v grep');
    console.log('  ', result.stdout?.trim() || 'NO PROCESS');

    console.log('3. Agent version:');
    result = await exec(BROKEN_VM, 'head -5 /drape-agent.js 2>&1');
    console.log('  ', result.stdout?.split('\n')[2] || 'UNKNOWN');

    console.log('\n4. Check if /bin/sh exists on broken VM:');
    result = await exec(BROKEN_VM, 'test -f /bin/sh && echo "EXISTS" || echo "NOT FOUND"');
    console.log('  ', result.stdout?.trim() || 'UNKNOWN');
}

compareVMs();
