require('dotenv').config();
const flyService = require('./services/fly-service');

async function injectErrorHandler() {
    const vmId = '784975ec43e718';
    console.log(`🚑 INJECTING ERROR HANDLER on VM ${vmId} ...`);

    const agentUrl = `https://${flyService.appName}.fly.dev`;

    const indexTsx = `
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './components/App'

// --- ERROR HANDLER START ---
const showError = (msg) => {
    const errorBox = document.createElement('div');
    errorBox.style.position = 'fixed';
    errorBox.style.top = '0';
    errorBox.style.left = '0';
    errorBox.style.width = '100%';
    errorBox.style.backgroundColor = 'rgba(255,0,0,0.9)';
    errorBox.style.color = 'white';
    errorBox.style.padding = '20px';
    errorBox.style.zIndex = '999999';
    errorBox.style.fontSize = '14px';
    errorBox.style.whiteSpace = 'pre-wrap';
    errorBox.innerText = '🚨 RUNTIME ERROR:\\n' + msg;
    document.body.appendChild(errorBox);
}

window.onerror = (msg, url, line, col, error) => {
    const str = msg + '\\nAt: ' + url + ':' + line + ':' + col + '\\n' + (error?.stack || '');
    showError(str);
    return false;
};

window.addEventListener('unhandledrejection', (event) => {
    showError('Unhandled Rejection: ' + event.reason);
});
// --- ERROR HANDLER END ---

const container = document.getElementById('root') as HTMLDivElement
if (container) {
    try {
        const root = createRoot(container)
        root.render(<App />)
    } catch (e) {
        showError('Render Error: ' + e);
    }
} else {
    showError('Failed to find root element');
}
`;

    const b64 = Buffer.from(indexTsx).toString('base64');

    try {
        await flyService.exec(agentUrl, `echo "${b64}" | base64 -d > /home/coder/project/src/index.tsx`, '/home/coder', vmId);
        console.log('✅ Injected Error Handler into src/index.tsx');
    } catch (e) {
        console.error('Error:', e.message);
    }
}

injectErrorHandler();
