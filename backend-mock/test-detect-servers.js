// Test script per detectRunningServers
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

async function detectRunningServers() {
    try {
        // Use netstat alternative: check /proc/net/tcp
        const result = await execAsync('cat /proc/net/tcp | tail -n +2');
        const lines = result.stdout.split('\n').filter(line => line.trim());
        
        const exposedPorts = {};
        const loadBalancerUrl = 'http://warp-flutter-alb-1904513476.us-west-2.elb.amazonaws.com';
        
        for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            if (parts.length < 4) continue;
            
            // Parse local address (format: hex_ip:hex_port)
            const localAddr = parts[1];
            const [, hexPort] = localAddr.split(':');
            if (!hexPort) continue;
            
            const port = parseInt(hexPort, 16);
            
            // Check if port is in LISTEN state (0A = LISTEN)
            const state = parts[3];
            if (state === '0A' && port >= 3000 && port <= 9999) {
                console.log(`🌐 Detected server on port ${port}`);
                exposedPorts[`${port}/tcp`] = `${loadBalancerUrl}/proxy/${port}`;
            }
        }
        
        return exposedPorts;
    } catch (error) {
        console.error('Error detecting servers:', error.message);
        return {};
    }
}

// Test
detectRunningServers().then(ports => {
    console.log('\n📊 Risultato:');
    console.log(JSON.stringify(ports, null, 2));
    
    if (Object.keys(ports).length > 0) {
        console.log('\n✅ Server rilevati!');
    } else {
        console.log('\n⚠️ Nessun server rilevato');
    }
});
