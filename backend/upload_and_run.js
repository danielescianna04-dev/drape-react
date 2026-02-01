const axios = require('axios');
const fs = require('fs');

const projectId = '6DL9EYgf3zOFtWpIfxA0';
const script = fs.readFileSync('/var/folders/t7/jz767bxx5zncbx_v484ldgxr0000gn/T/claude/-Users-getmad-Projects-drape-react/ec89c055-8bd0-4c72-864f-e2032a52db07/scratchpad/start_dev_clean.sh', 'utf8');

// Upload script
axios.post(`http://localhost:3000/fly/project/${projectId}/file`, {
  path: '/tmp/start_dev.sh',
  content: script
}).then(() => {
  console.log('Script uploaded');
  // Make executable and run
  return axios.post(`http://localhost:3000/fly/project/${projectId}/exec`, {
    command: 'chmod +x /tmp/start_dev.sh && /tmp/start_dev.sh',
    cwd: '/home/coder'
  }, { timeout: 5000 });
}).then(r => {
  console.log('Executed:', r.data.stdout || r.data.stderr);
  // Wait and check logs
  setTimeout(() => {
    axios.post(`http://localhost:3000/fly/project/${projectId}/exec`, {
      command: 'tail -50 /tmp/dev-server.log',
      cwd: '/home/coder'
    }).then(r2 => {
      console.log('\n=== Dev Server Logs ===');
      console.log(r2.data.stdout);
    });
  }, 10000);
}).catch(e => console.error('Error:', e.message));
