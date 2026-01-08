/**
 * Fly.io MicroVM Service
 * Holy Grail Architecture - Instant Cloud IDE
 * 
 * Handles creation, management, and destruction of Firecracker MicroVMs
 * for instant project execution.
 */

const axios = require('axios');

const FLY_API_URL = 'https://api.machines.dev/v1';

// Default machine config for workspaces
const DEFAULT_MACHINE_CONFIG = {
    guest: {
        cpus: 2,
        memory_mb: 2048,
        cpu_kind: 'shared'
    },
    auto_destroy: true, // Destroy when stopped
    restart: {
        policy: 'no' // Don't auto-restart
    }
};

class FlyService {
    constructor() {
        this.appName = 'drape-workspaces';
        this._client = null; // Lazy init
    }

    /**
     * Get or create the axios client (lazy loading to ensure env vars are ready)
     */
    _getClient() {
        if (!this._client) {
            const token = process.env.FLY_API_TOKEN;
            if (!token) {
                console.warn('⚠️ [Fly] FLY_API_TOKEN not set!');
            }
            this._client = axios.create({
                baseURL: FLY_API_URL,
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
        }
        return this._client;
    }

    get client() {
        return this._getClient();
    }

    get FLY_REGION() {
        return process.env.FLY_REGION || 'fra';
    }

    get DRAPE_IMAGE() {
        // Use the deployment tag from the latest flyctl deploy
        return process.env.FLY_IMAGE || 'registry.fly.io/drape-workspaces:deployment-01KEEMCGKQHSWJ13W3JRYZ1W3B';
    }

    /**
     * Initialize the Fly.io app (run once during setup)
     */
    async initializeApp() {
        try {
            // Check if app exists
            const response = await this.client.get(`/apps/${this.appName}`);
            console.log(`✅ Fly app "${this.appName}" exists`);
            return response.data;
        } catch (error) {
            if (error.response?.status === 404) {
                // Create the app
                console.log(`📦 Creating Fly app "${this.appName}"...`);
                const response = await this.client.post('/apps', {
                    app_name: this.appName,
                    org_slug: 'personal'
                });
                console.log(`✅ Fly app created: ${this.appName}`);
                return response.data;
            }
            throw error;
        }
    }

    /**
     * Create a new MicroVM for a project
     * @param {string} projectId - Unique project identifier
     * @param {object} options - Machine options
     * @returns {object} Machine details including ID and IP
     */
    async createMachine(projectId, options = {}) {
        const machineId = `ws-${projectId}`.substring(0, 30); // Fly has name limits

        console.log(`🚀 [Fly] Creating MicroVM: ${machineId} in ${this.FLY_REGION}...`);
        console.log(`   📦 Image: ${this.DRAPE_IMAGE}`);
        const startTime = Date.now();

        try {
            const config = {
                name: machineId,
                region: this.FLY_REGION,
                config: {
                    ...DEFAULT_MACHINE_CONFIG,
                    image: options.image || this.DRAPE_IMAGE,
                    env: {
                        PROJECT_ID: projectId,
                        DRAPE_AGENT_PORT: '13338',
                        ...options.env
                    },
                    // Expose ports to allow access via Fly's Public Load Balancer
                    // (Required for Local Backend to reach Remote VMs)
                    services: [
                        {
                            ports: [
                                { port: 443, handlers: ['tls', 'http'] },
                                { port: 80, handlers: ['http'] }
                            ],
                            protocol: 'tcp',
                            internal_port: 13338
                        }
                    ]
                }
            };

            const response = await this.client.post(
                `/apps/${this.appName}/machines`,
                config
            );

            const elapsed = Date.now() - startTime;
            console.log(`✅ [Fly] MicroVM created in ${elapsed}ms`);
            console.log(`   ID: ${response.data.id}`);
            console.log(`   IP: ${response.data.private_ip}`);

            return {
                id: response.data.id,
                name: response.data.name,
                state: response.data.state,
                region: response.data.region,
                privateIp: response.data.private_ip,
                createdAt: response.data.created_at,
                // Use Public URL + Fly-Force-Instance-Id header for routing
                agentUrl: `https://${this.appName}.fly.dev`
            };
        } catch (error) {
            console.error(`❌ [Fly] Failed to create MicroVM:`, error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Get machine status
     * @param {string} machineId - Fly machine ID
     */
    async getMachine(machineId) {
        try {
            const response = await this.client.get(
                `/apps/${this.appName}/machines/${machineId}`
            );
            return response.data;
        } catch (error) {
            if (error.response?.status === 404) {
                return null;
            }
            throw error;
        }
    }

    /**
     * Wait for machine to be ready (started state)
     * @param {string} machineId - Fly machine ID
     * @param {number} timeout - Max wait time in ms
     */
    async waitForMachine(machineId, timeout = 30000) {
        const startTime = Date.now();

        while (Date.now() - startTime < timeout) {
            const machine = await this.getMachine(machineId);

            if (!machine) {
                throw new Error(`Machine ${machineId} not found`);
            }

            if (machine.state === 'started') {
                console.log(`✅ [Fly] Machine ${machineId} is ready!`);
                return machine;
            }

            if (machine.state === 'failed' || machine.state === 'destroyed') {
                throw new Error(`Machine ${machineId} failed: ${machine.state}`);
            }

            // Wait 500ms before next check
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        throw new Error(`Timeout waiting for machine ${machineId}`);
    }

    /**
     * Execute a command inside a running machine
     * Uses the Drape Agent running inside the VM
     * @param {string} agentUrl - URL of the Drape Agent
     * @param {string} command - Command to execute
     * @param {string} cwd - Working directory
     * @param {string} machineId - Fly machine ID for routing
     */
    async exec(agentUrl, command, cwd = '/home/coder/project', machineId = null, timeout = 60000) {
        try {
            const headers = { 'Content-Type': 'application/json' };
            if (machineId) {
                headers['Fly-Force-Instance-Id'] = machineId;
            }

            const response = await axios.post(`${agentUrl}/exec`, {
                command,
                cwd
            }, {
                timeout, // Dynamic timeout
                headers
            });

            return {
                exitCode: response.data.exitCode || 0,
                stdout: response.data.stdout || '',
                stderr: response.data.stderr || ''
            };
        } catch (error) {
            console.error(`❌ [Fly] Exec failed:`, error.message);
            throw error;
        }
    }

    /**
     * Stop a machine (but keep it for potential restart)
     * @param {string} machineId - Fly machine ID
     */
    async stopMachine(machineId) {
        console.log(`⏸️ [Fly] Stopping machine: ${machineId}`);
        try {
            await this.client.post(
                `/apps/${this.appName}/machines/${machineId}/stop`
            );
            console.log(`✅ [Fly] Machine stopped`);
        } catch (error) {
            console.error(`❌ [Fly] Stop failed:`, error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * List all machines
     */
    async listMachines() {
        try {
            const response = await this.client.get(`/apps/${this.appName}/machines`);
            return response.data; // Array of machines
        } catch (error) {
            console.error(`❌ [Fly] List machines failed:`, error.message);
            return [];
        }
    }

    /**
     * Destroy a machine completely
     * @param {string} machineId - Fly machine ID
     */
    async destroyMachine(machineId) {
        console.log(`🗑️ [Fly] Destroying machine: ${machineId}`);
        try {
            await this.client.delete(
                `/apps/${this.appName}/machines/${machineId}`,
                { params: { force: true } }
            );
            console.log(`✅ [Fly] Machine destroyed`);
        } catch (error) {
            if (error.response?.status === 404) {
                console.log(`⚠️ [Fly] Machine already destroyed`);
                return;
            }
            console.error(`❌ [Fly] Destroy failed:`, error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Ensure only one machine is running (Virtual Single-Tenant Mode)
     * Stops all running machines except the one specified
     * @param {string} keepMachineName - Name of the machine to keep running (optional)
     */
    async ensureSingleActiveMachine(keepMachineName = '') {
        console.log(`🛡️ [Fly] Ensuring single active machine (keep: ${keepMachineName || 'none'})...`);
        try {
            const machines = await this.listMachines();
            const toStop = machines.filter(m =>
                m.state === 'started' &&
                m.name !== keepMachineName
            );

            if (toStop.length === 0) {
                return;
            }

            console.log(`   🛑 Stopping ${toStop.length} conflicting machines: ${toStop.map(m => m.name).join(', ')}`);

            // Stop in parallel
            await Promise.all(toStop.map(m => this.stopMachine(m.id)));
            console.log(`   ✅ Conflicting machines stopped`);
        } catch (error) {
            console.warn(`   ⚠️ Failed to ensure single active machine: ${error.message}`);
            // Don't block flow, but log warning
        }
    }

    /**
     * List all machines in the app
     */
    async listMachines() {
        try {
            const response = await this.client.get(
                `/apps/${this.appName}/machines`
            );
            return response.data || [];
        } catch (error) {
            console.error(`❌ [Fly] List failed:`, error.response?.data || error.message);
            return [];
        }
    }

    /**
     * Health check - verify Fly.io connectivity
     */
    async healthCheck() {
        try {
            await this.client.get(`/apps/${this.appName}`);
            return { healthy: true };
        } catch (error) {
            return {
                healthy: false,
                error: error.response?.data?.error || error.message
            };
        }
    }
}

// Export singleton instance
module.exports = new FlyService();
