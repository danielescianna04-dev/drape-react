const axios = require('axios');
const path = require('path');
const fs = require('fs');

/**
 * Service to interact with Coder API (Self-Hosted Cloud Workstations)
 * Documentation: https://coder.com/docs/coder-oss/latest/api-guides
 */
class CoderService {
    constructor() {
        this.apiUrl = process.env.CODER_API_URL || 'http://localhost:3000'; // Will be LoadBalancer IP
        this.apiToken = process.env.CODER_SESSION_TOKEN; // Admin token

        this.client = axios.create({
            baseURL: this.apiUrl,
            headers: {
                'Coder-Session-Token': this.apiToken,
                'Content-Type': 'application/json'
            }
        });
    }

    /**
     * Check if Coder is reachable
     */
    async healthCheck() {
        try {
            const res = await this.client.get('/api/v2/buildinfo');
            return { status: 'ok', version: res.data.version };
        } catch (error) {
            console.error('Coder health check failed:', error.message);
            return { status: 'error', error: error.message };
        }
    }

    /**
     * Create or get a Coder user for the given email
      */
    async ensureUser(email, username) {
        try {
            // Search for user
            const searchRes = await this.client.get('/api/v2/users', {
                params: { q: email }
            });

            if (searchRes.data.length > 0) {
                return searchRes.data[0];
            }

            // Create user
            const createRes = await this.client.post('/api/v2/users', {
                email,
                username,
                password: Math.random().toString(36).slice(-10) + "Aa1!", // Random persistent password
                login_type: 'password'
            });

            return createRes.data;
        } catch (error) {
            console.error('Error ensuring Coder user:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Create a workspace for a user
     */
    async createWorkspace(userId, workspaceName, repoUrl) {
        try {
            // 1. Get the template (we assume 'standard-workspace' exists)
            // In production, you'd cache this ID
            const templatesRes = await this.client.get('/api/v2/organizations/default/templates');
            const template = templatesRes.data.find(t => t.name === 'standard-workspace');

            if (!template) {
                throw new Error('Template "standard-workspace" not found. Please upload it first.');
            }

            // 2. Create the workspace
            const res = await this.client.post(`/api/v2/template/${template.id}/workspaces`, {
                name: workspaceName,
                owner_id: userId,
                autostart_if_dormant: true,
                ttl_ms: 15 * 60 * 1000, // 15 minutes shutdown policy
                rich_parameter_values: [
                    // Example of passing parameters if defined in template
                    // { name: "repo_url", value: repoUrl }
                ]
            });

            return res.data;
        } catch (error) {
            // If workspace already exists, try to start it
            if (error.response?.status === 409) { // Conflict
                return this.getWorkspaceByName(userId, workspaceName);
            }
            console.error('Error creating workspace:', error.response?.data || error.message);
            throw error;
        }
    }

    async getWorkspaceByName(userId, workspaceName) {
        // Coder doesn't strictly support "get by name for user" easily in v2 without filtering
        // But we can filter by owner_id and name
        const res = await this.client.get('/api/v2/workspaces', {
            params: { q: `owner:me name:${workspaceName}` } // 'me' works if acting as user, but we are admin
        });
        // Admin filter: q=owner_id:<id> name:<name>
        // ... implementation detail
        return res.data[0];
    }

    /**
     * Start a stopped workspace
     */
    async startWorkspace(workspaceId) {
        const buildRes = await this.client.post(`/api/v2/workspaces/${workspaceId}/builds`, {
            transition: 'start'
        });
        return buildRes.data;
    }
}

module.exports = new CoderService();
