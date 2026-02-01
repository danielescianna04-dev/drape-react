const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const NEW_IMAGE = 'registry.fly.io/drape-workspaces:deployment-01KG55WT9Q8E448T4NJ2PDF7FG';
const APP_NAME = 'drape-workspaces';

// Test with one stopped VM first
const TEST_VM = '185946da132138'; // stopped VM

async function updateMachine(machineId) {
    console.log(`Updating ${machineId}...`);

    try {
        // Update machine with new image
        const cmd = `flyctl machine update ${machineId} --image ${NEW_IMAGE} --app ${APP_NAME} --skip-health-checks --yes`;
        const { stdout, stderr } = await execPromise(cmd);

        console.log(`  ✅ Updated successfully`);
        if (stdout) console.log(`  ${stdout.trim()}`);
        return true;
    } catch (error) {
        console.log(`  ❌ Failed: ${error.message}`);
        return false;
    }
}

async function testUploadEndpoint(vmId) {
    console.log(`\nTesting /upload endpoint on ${vmId}...`);

    const axios = require('axios');

    try {
        // Start the machine first
        console.log('  Starting machine...');
        await execPromise(`flyctl machine start ${vmId} --app ${APP_NAME}`);
        await new Promise(r => setTimeout(r, 5000)); // Wait 5s for startup

        // Test health
        const health = await axios.get('https://drape-workspaces.fly.dev/health', {
            headers: { 'Fly-Force-Instance-Id': vmId },
            timeout: 5000
        });
        console.log(`  ✅ Agent UP - ${JSON.stringify(health.data)}`);

        // Test upload with tiny file
        const testData = Buffer.from('test');
        const upload = await axios.post(
            'https://drape-workspaces.fly.dev/upload?path=/tmp/test&extract=false',
            testData,
            {
                headers: {
                    'Fly-Force-Instance-Id': vmId,
                    'Content-Type': 'application/gzip'
                },
                timeout: 5000
            }
        );

        console.log(`  ✅ /upload works! Response:`, upload.data);
        return true;

    } catch (error) {
        console.log(`  ❌ Test failed: ${error.message}`);
        if (error.response) {
            console.log(`     Status: ${error.response.status}`);
        }
        return false;
    }
}

async function main() {
    console.log('🚀 Updating VM to v2.13 with /upload endpoint\n');
    console.log(`New image: ${NEW_IMAGE}`);
    console.log(`Test VM: ${TEST_VM}\n`);

    // Update test VM
    const updated = await updateMachine(TEST_VM);
    if (!updated) {
        console.log('\n❌ Update failed');
        return;
    }

    // Test the endpoint
    await new Promise(r => setTimeout(r, 2000));
    const works = await testUploadEndpoint(TEST_VM);

    if (works) {
        console.log('\n✅ TEST SUCCESS! v2.13 agent with /upload is working!');
        console.log('\nReady to update all other VMs in the pool.');
    } else {
        console.log('\n❌ Test failed - check logs before proceeding');
    }
}

main().catch(console.error);
