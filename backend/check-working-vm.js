const axios = require('axios');

const AGENT_URL = 'https://drape-workspaces.fly.dev';
const MACHINE_ID = '56834d13f67618'; // This one works!

async function exec(command, cwd = '/home/coder/project') {
    const response = await axios.post(`${AGENT_URL}/exec`, {
        command,
        cwd
    }, {
        headers: {
            'Content-Type': 'application/json',
            'Fly-Force-Instance-Id': MACHINE_ID
        },
        timeout: 10000
    });
    return response.data;
}

async function checkProject() {
    console.log('=== Checking Working VM 56834d13f67618 ===\n');

    console.log('1. /home/coder contents:');
    let result = await exec('ls -lah', '/home/coder');
    console.log(result.stdout);
    console.log('');

    console.log('2. Project directory contents:');
    result = await exec('ls -lah | head -20');
    console.log(result.stdout);
    console.log('');

    console.log('3. Check package.json:');
    result = await exec('cat package.json | jq .name,.version,.scripts.dev 2>&1');
    console.log(result.stdout || result.stderr);
    console.log('');

    console.log('4. Check node_modules:');
    result = await exec('test -d node_modules && du -sh node_modules && echo "Packages:" && ls node_modules | wc -l');
    console.log(result.stdout);
    console.log('');

    console.log('5. Check for running processes:');
    result = await exec('ps aux | grep -E "node|pnpm|next" | grep -v grep', '/home/coder');
    console.log(result.stdout || 'No processes');
    console.log('');

    console.log('6. Check install status:');
    result = await exec('ls -lh /home/coder/install.* 2>&1 ; test -f /home/coder/install.done && cat /home/coder/install.done', '/home/coder');
    console.log(result.stdout);
    console.log('');

    console.log('7. File count:');
    result = await exec('find . -type f | wc -l');
    console.log('Files:', result.stdout.trim());
}

checkProject().then(() => {
    console.log('\n✅ Check complete');
    process.exit(0);
}).catch(err => {
    console.error('Fatal error:', err.message);
    process.exit(1);
});
