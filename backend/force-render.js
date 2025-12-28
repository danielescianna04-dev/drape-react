require('dotenv').config();
const flyService = require('./services/fly-service');

async function forceRender() {
    const vmId = '784975ec43e718';
    console.log(`☢️  NUCLEAR OPTION: Forcing Hello World on VM ${vmId} ...`);

    const agentUrl = `https://${flyService.appName}.fly.dev`;

    const simpleIndex = `
import { createRoot } from 'react-dom/client'

// Bypass everything else
const container = document.getElementById('root')
if (!container) {
    console.error('Root element not found!')
} else {
    const root = createRoot(container)
    root.render(
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: 'white', color: 'black' }}>
        <h1 style={{ fontSize: '32px', color: 'red', marginBottom: '20px' }}>HELLO FROM DEBUGGER</h1>
        <p style={{ fontSize: '18px' }}>If you see this, React is MOUNTED.</p>
        <button onClick={() => alert('Interactivity check!')} style={{ padding: '10px 20px', fontSize: '16px', cursor: 'pointer', marginTop: '20px' }}>
          Click Me
        </button>
      </div>
    )
}
`;

    const b64 = Buffer.from(simpleIndex).toString('base64');

    try {
        await flyService.exec(agentUrl, `echo "${b64}" | base64 -d > /home/coder/project/src/index.tsx`, '/home/coder', vmId);
        console.log('✅ Overwrote src/index.tsx with Hello World');
    } catch (e) {
        console.error('Error:', e.message);
    }
}

forceRender();
