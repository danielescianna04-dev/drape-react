const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const NEW_IMAGE = 'registry.fly.io/drape-workspaces:deployment-01KG5XVX2JA7XH7M3A7M8YKWBW';
const APP_NAME = 'drape-workspaces';

// All VMs including cache master
const ALL_VMS = [
    '3287d475f96d68',  // Cache master - IMPORTANT to update first!
    '48e3376f2e4768', '68395d3cd59598', 'd8d3e76b257028', '080e324b769518',
    'd899947b747068', '68301eec416238', '4d8921e1b9e918', 'e2861672b56668',
    '148e659eb07de8', '17810132fdd728', 'e7846ed3c01038', '3287d427c5ed48',
    'd890129b0601e8', 'e2861502a46738', '1859d7df129918', '080506db1e3dd8',
    '17810162ad9d58', 'e825e25a161798', '3d8de710f96d08', '4d8921edf9ed58',
    '28650e0f42ee58', '185946da132138'
];

async function updateMachine(machineId, index, total) {
    const label = machineId === '3287d475f96d68' ? '[CACHE MASTER]' : '';
    console.log(`[${index + 1}/${total}] ${label} Updating ${machineId}...`);
    try {
        const cmd = `flyctl machine update ${machineId} --image ${NEW_IMAGE} --app ${APP_NAME} --skip-health-checks --yes`;
        await execPromise(cmd);
        console.log(`  ✅`);
        return true;
    } catch (error) {
        console.log(`  ❌ ${error.message}`);
        return false;
    }
}

async function main() {
    console.log('🚀 Updating ALL VMs to zstd-optimized image (v2.14)\n');
    console.log(`Image: ${NEW_IMAGE}\n`);

    let success = 0;
    for (let i = 0; i < ALL_VMS.length; i++) {
        if (await updateMachine(ALL_VMS[i], i, ALL_VMS.length)) success++;
        await new Promise(r => setTimeout(r, 500));
    }

    console.log(`\n✅ Updated ${success}/${ALL_VMS.length} VMs with zstd!`);
    console.log(`\n🎯 Expected performance: 3-5x faster extraction (40-50s instead of 120s)`);
}

main().catch(console.error);
