const axios = require('axios');
const coderService = require('../coder-service');

/**
 * Drape Agent Client
 * Communicates with the in-workspace agent via HTTP for instant execution.
 * Replaces slow SSH tunnels.
 */
class AgentClient {
    constructor() {
        this.coderUrl = process.env.CODER_API_URL || 'http://localhost:3000';
        // Token cache: { [userId]: { token, expiresAt } }
        this.tokenCache = new Map();
    }

    /**
     * Get cached token or generate new one
     */
    async getToken(userId) {
        const cached = this.tokenCache.get(userId);
        if (cached && cached.expiresAt > Date.now()) {
            return cached.token;
        }

        // Generate new token (valid for 24h, cache for 5 min)
        const token = await coderService.createUserToken(userId);
        this.tokenCache.set(userId, {
            token,
            expiresAt: Date.now() + 5 * 60 * 1000 // 5 minutes
        });
        return token;
    }

    /**
     * Get an authorized axios instance for talking to the agent
     */
    async getClient(owner, wsName, userId) {
        // 1. Get a cached session token
        const token = await this.getToken(userId);

        // 2. Construct the Agent URL
        const agentUrl = `${this.coderUrl}/@${owner}/${wsName}/apps/agent`;

        // 3. Create client with auth cookie
        return axios.create({
            baseURL: agentUrl,
            headers: {
                'Cookie': `coder_session_token=${token}`,
                'Content-Type': 'application/json'
            },
            timeout: 10000 // 10s timeout
        });
    }

    /**
     * Execute a shell command using the Agent Gateway
     * The gateway runs in GKE and forwards requests directly to workspace pods
     */
    async exec(owner, wsName, userId, command, cwd = '/home/coder/project') {
        try {
            // Get admin token for API calls
            const adminToken = process.env.CODER_SESSION_TOKEN;

            // First, get the workspace to find the workspace ID
            const wsRes = await axios.get(`${this.coderUrl}/api/v2/workspaces`, {
                params: { q: `name:${wsName}` },
                headers: { 'Coder-Session-Token': adminToken }
            });

            const workspace = wsRes.data?.workspaces?.[0];
            if (!workspace) {
                throw new Error(`Workspace ${wsName} not found`);
            }

            // Get gateway URL from environment or use default
            const gatewayUrl = process.env.AGENT_GATEWAY_URL || 'http://drape-agent-gateway.coder.svc.cluster.local';

            // Call the gateway with workspace ID
            const execUrl = `${gatewayUrl}/exec/${workspace.id}`;

            console.log(`   🔗 Calling gateway: POST ${execUrl}`);

            const res = await axios.post(execUrl,
                { command: `cd ${cwd} 2>/dev/null; ${command}` },
                {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 60000
                }
            );

            return {
                stdout: res.data.stdout || '',
                stderr: res.data.stderr || '',
                exitCode: res.data.exitCode || (res.data.success ? 0 : 1)
            };
        } catch (error) {
            const msg = error.response?.data?.error || error.message;
            console.error(`🛑 Agent exec failed: ${msg}`);
            return {
                stdout: '',
                stderr: `Agent Error: ${msg}`,
                exitCode: 1
            };
        }
    }

    /**
     * Check if agent is alive
     */
    async waitForAgent(owner, wsName, userId, timeoutMs = 60000) {
        const start = Date.now();
        console.log(`   ⏳ Connecting to Drape Agent...`);

        while (Date.now() - start < timeoutMs) {
            try {
                const client = await this.getClient(owner, wsName, userId);
                await client.get('/health', { timeout: 2000 });
                console.log(`   ✅ Drape Agent connected!`);
                return true;
            } catch (e) {
                if ((Date.now() - start) % 5000 < 1500) { // Log every ~5s
                    console.log(`   🔸 Agent retry: ${e.message} (Status: ${e.response?.status}) URL: ${e.config?.baseURL}${e.config?.url}`);
                }
                // Wait 1s and retry
                await new Promise(r => setTimeout(r, 1000));
            }
        }
        return false;
    }

    /**
     * Get list of project files (for AI context)
     */
    async getProjectFiles(owner, wsName, userId, maxDepth = 3) {
        try {
            const client = await this.getClient(owner, wsName, userId);
            const res = await client.get(`/files?depth=${maxDepth}`);
            return res.data.files || [];
        } catch (error) {
            console.error(`🛑 Agent getProjectFiles failed: ${error.message}`);
            return [];
        }
    }

    /**
     * Read a file's content
     */
    async readFile(owner, wsName, userId, filePath) {
        try {
            const client = await this.getClient(owner, wsName, userId);
            const res = await client.get(`/read?path=${encodeURIComponent(filePath)}`);
            return res.data.content || '';
        } catch (error) {
            return '';
        }
    }

    /**
     * Get full project context for AI (files + key contents)
     */
    async getProjectContext(owner, wsName, userId) {
        const context = {
            files: [],
            contents: {}
        };

        try {
            // Get file list
            context.files = await this.getProjectFiles(owner, wsName, userId);

            // Read important files for context
            const importantPatterns = [
                /package\.json$/,
                /README\.md$/i,
                /\.env\.example$/,
                /tsconfig\.json$/,
                /vite\.config\./,
                /next\.config\./,
                /app\.(js|ts|tsx)$/,
                /index\.(js|ts|tsx|html)$/,
                /main\.(js|ts|py)$/
            ];

            const importantFiles = context.files.filter(f =>
                importantPatterns.some(p => p.test(f))
            ).slice(0, 10); // Max 10 files

            for (const file of importantFiles) {
                const content = await this.readFile(owner, wsName, userId, file);
                if (content) {
                    // Truncate to 500 chars per file
                    context.contents[file] = content.substring(0, 500);
                }
            }

            return context;
        } catch (error) {
            console.error(`🛑 getProjectContext failed: ${error.message}`);
            return context;
        }
    }
}

module.exports = new AgentClient();
