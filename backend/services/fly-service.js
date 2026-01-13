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

    get DRAPE_IMAGE_NODEJS() {
        // Lightweight Node.js image (102MB) for Next.js, React, Vue projects
        return 'registry.fly.io/drape-workspaces:deployment-01KETB6Y0X8VYZFF704M543V1T';
    }

    get DRAPE_IMAGE_OPTIMIZED() {
        // Node.js 20 full image with 100% npm compatibility (~450MB)
        // Includes Python3, build tools (gcc, g++, make) for native modules
        // Supports: sharp, bcrypt, canvas, node-sass, and all npm packages
        return 'registry.fly.io/drape-workspaces:node20-production';
    }

    get DRAPE_IMAGE_FULL() {
        // Universal image (1.6GB) for Python, Go, Rust, PHP, etc.
        return 'registry.fly.io/drape-workspaces:deployment-01KET4Q1G6KFJNZ2JGAQMAWFY8';
    }

    get DRAPE_IMAGE() {
        // Default image (optimized for fast preview)
        return this.DRAPE_IMAGE_OPTIMIZED;
    }

    /**
     * Get the appropriate Docker image based on project type
     * @param {string} projectType - Type of project ('nodejs', 'python', 'go', etc.)
     * @returns {string} Docker image URL
     */
    getImageForProject(projectType) {
        if (projectType === 'nodejs' || projectType === 'nextjs' || projectType === 'react') {
            console.log(`   🐳 [Fly] Using optimized image with pnpm + cached deps`);
            return this.DRAPE_IMAGE_OPTIMIZED;
        } else {
            console.log(`   🐳 [Fly] Using universal image for ${projectType || 'unknown'} (1.6GB)`);
            return this.DRAPE_IMAGE_FULL;
        }
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
     * Check if app is suspended and auto-resume if needed
     * @returns {boolean} true if app is ready, false if failed to resume
     */
    async ensureAppNotSuspended() {
        try {
            // Use GraphQL API to check app status (machines API doesn't expose this)
            const graphqlClient = axios.create({
                baseURL: 'https://api.fly.io/graphql',
                headers: {
                    'Authorization': `Bearer ${process.env.FLY_API_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            });

            const query = `
                query GetApp($name: String!) {
                    app(name: $name) {
                        id
                        name
                        status
                    }
                }
            `;

            const response = await graphqlClient.post('', {
                query,
                variables: { name: this.appName }
            });

            const app = response.data?.data?.app;
            if (!app) {
                console.error(`❌ [Fly] App ${this.appName} not found`);
                return false;
            }

            console.log(`📊 [Fly] App status: ${app.status}`);

            if (app.status === 'suspended') {
                console.log(`⏸️ [Fly] App is suspended, resuming...`);

                // Resume the app using GraphQL mutation
                const resumeMutation = `
                    mutation ResumeApp($appId: ID!) {
                        resumeApp(input: { appId: $appId }) {
                            app {
                                id
                                status
                            }
                        }
                    }
                `;

                await graphqlClient.post('', {
                    query: resumeMutation,
                    variables: { appId: app.id }
                });

                console.log(`✅ [Fly] App resumed successfully`);

                // Wait a bit for the app to fully resume
                await new Promise(r => setTimeout(r, 2000));
            }

            return true;
        } catch (error) {
            console.error(`❌ [Fly] Failed to check/resume app:`, error.message);
            // Don't block - try to create machine anyway
            return true;
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

        // AUTO-RESUME: Check if app is suspended and resume if needed
        await this.ensureAppNotSuspended();

        const memoryMb = options.memory_mb || DEFAULT_MACHINE_CONFIG.guest.memory_mb;
        const image = options.image || this.DRAPE_IMAGE_NODEJS; // Default to Node.js image

        console.log(`🚀 [Fly] Creating MicroVM: ${machineId} in ${this.FLY_REGION}...`);
        console.log(`   📦 Image: ${image}`);
        console.log(`   💾 Memory: ${memoryMb}MB`);
        const startTime = Date.now();

        try {
            const config = {
                name: machineId,
                region: this.FLY_REGION,
                config: {
                    ...DEFAULT_MACHINE_CONFIG,
                    guest: {
                        ...DEFAULT_MACHINE_CONFIG.guest,
                        memory_mb: memoryMb
                    },
                    image: image,
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
     * Start a stopped machine
     * @param {string} machineId - Fly machine ID
     */
    async startMachine(machineId) {
        console.log(`▶️ [Fly] Starting machine: ${machineId}`);
        try {
            await this.client.post(
                `/apps/${this.appName}/machines/${machineId}/start`
            );
            console.log(`✅ [Fly] Machine start requested`);
        } catch (error) {
            console.error(`❌ [Fly] Start failed:`, error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Wait for machine to be ready (started state)
     * Uses a two-phase approach:
     * - Phase 1: Fast polling (500ms) for initial timeout
     * - Phase 2: Slower polling (1s) continues until maxTimeout
     * Never throws timeout errors - keeps trying silently
     *
     * @param {string} machineId - Fly machine ID
     * @param {number} initialTimeout - Fast polling phase (default 30s)
     * @param {number} maxTimeout - Total max wait time (default 120s)
     */
    async waitForMachine(machineId, initialTimeout = 30000, maxTimeout = 120000) {
        const startTime = Date.now();
        let phase = 1;

        while (Date.now() - startTime < maxTimeout) {
            try {
                const machine = await this.getMachine(machineId);

                if (!machine) {
                    // Machine not found - wait and retry (might be creating)
                    await new Promise(r => setTimeout(r, 1000));
                    continue;
                }

                if (machine.state === 'started') {
                    const elapsed = Date.now() - startTime;
                    console.log(`✅ [Fly] Machine ${machineId} ready in ${elapsed}ms`);
                    return machine;
                }

                // Only fail on terminal states
                if (machine.state === 'failed' || machine.state === 'destroyed') {
                    throw new Error(`Machine ${machineId} failed: ${machine.state}`);
                }

                // Log phase transition
                const elapsed = Date.now() - startTime;
                if (phase === 1 && elapsed > initialTimeout) {
                    phase = 2;
                    console.log(`⏳ [Fly] Phase 2: continuing to poll ${machineId} (state: ${machine.state})...`);
                }

                // Phase 1: fast polling, Phase 2: slower polling
                const pollInterval = phase === 1 ? 500 : 1000;
                await new Promise(r => setTimeout(r, pollInterval));
            } catch (e) {
                // Network errors - just retry
                if (!e.message?.includes('failed:')) {
                    await new Promise(r => setTimeout(r, 1000));
                    continue;
                }
                throw e;
            }
        }

        // After max timeout, throw (but this is very long - 2 minutes)
        throw new Error(`Machine ${machineId} not ready after ${maxTimeout / 1000}s`);
    }

    /**
     * Execute a command inside a running machine
     * Uses the Drape Agent running inside the VM
     * @param {string} agentUrl - URL of the Drape Agent
     * @param {string} command - Command to execute
     * @param {string} cwd - Working directory
     * @param {string} machineId - Fly machine ID for routing
     */
    async exec(agentUrl, command, cwd = '/home/coder/project', machineId = null, timeout = 60000, silent = false) {
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
            if (!silent) {
                console.error(`❌ [Fly] Exec failed:`, error.message);
            }
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
