const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const NEW_IMAGE = 'registry.fly.io/drape-workspaces:deployment-01KG55WT9Q8E448T4NJ2PDF7FG';
const APP_NAME = 'drape-workspaces';

// All worker VMs (excluding cache master 3287d475f96d68 and already updated 185946da132138)
const WORKER_VMS = [
    '48e3376f2e4768',
    '68395d3cd59598',
    'd8d3e76b257028',
    '080e324b769518',
    'd899947b747068',
    '68301eec416238',
    '4d8921e1b9e918',
    'e2861672b56668',
    '148e659eb07de8',
    '17810132fdd728',
    'e7846ed3c01038',
    '3287d427c5ed48',
    'd890129b0601e8',
    'e2861502a46738',
    '1859d7df129918',
    '080506db1e3dd8',
    '17810162ad9d58',
    'e825e25a161798',
    '3d8de710f96d08',
    '4d8921edf9ed58',
    '28650e0f42ee58'
];

async function updateMachine(machineId, index, total) {
    console.log(`[${index + 1}/${total}] Updating ${machineId}...`);

    try {
        const cmd = `flyctl machine update ${machineId} --image ${NEW_IMAGE} --app ${APP_NAME} --skip-health-checks --yes`;
        await execPromise(cmd);
        console.log(`  ✅ Updated`);
        return true;
    } catch (error) {
        console.log(`  ❌ Failed: ${error.message}`);
        return false;
    }
}

async function main() {
    console.log('🔄 Updating all worker VMs to v2.13\n');
    console.log(`Total VMs: ${WORKER_VMS.length}`);
    console.log(`Image: ${NEW_IMAGE}\n`);

    let success = 0;
    let failed = 0;

    for (let i = 0; i < WORKER_VMS.length; i++) {
        const result = await updateMachine(WORKER_VMS[i], i, WORKER_VMS.length);
        if (result) {
            success++;
        } else {
            failed++;
        }
        // Small delay between updates
        await new Promise(r => setTimeout(r, 500));
    }

    console.log(`\n✅ Update complete!`);
    console.log(`   Success: ${success}`);
    console.log(`   Failed: ${failed}`);

    if (failed === 0) {
        console.log(`\n🎉 All VMs updated! TIER 3 cache copy is now ready to use.`);
    }
}

main().catch(console.error);
