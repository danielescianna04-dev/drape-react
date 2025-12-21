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

            // Check if users array exists and has items
            const users = searchRes.data?.users || searchRes.data || [];
            if (users.length > 0) {
                return users[0];
            }

            // Get default organization ID (required by Coder v2.29+)
            let organizationId;
            try {
                const orgsRes = await this.client.get('/api/v2/organizations');
                const orgs = orgsRes.data || [];
                const defaultOrg = orgs.find(o => o.is_default) || orgs[0];
                organizationId = defaultOrg?.id;
            } catch (orgError) {
                console.warn('Could not fetch organizations, trying without:', orgError.message);
            }

            // Create user with organization
            const userData = {
                email,
                username,
                password: Math.random().toString(36).slice(-10) + "Aa1!", // Random persistent password
                login_type: 'password'
            };

            // Add organization_ids if we have one
            if (organizationId) {
                userData.organization_ids = [organizationId];
            }

            const createRes = await this.client.post('/api/v2/users', userData);

            return createRes.data;
        } catch (error) {
            // Handle 409 Conflict - user already exists
            if (error.response?.status === 409) {
                console.log(`   User "${email}" already exists, fetching...`);
                const searchRes = await this.client.get('/api/v2/users', {
                    params: { q: username }
                });
                const users = searchRes.data?.users || searchRes.data || [];
                if (users.length > 0) {
                    return users[0];
                }
            }
            console.error('Error ensuring Coder user:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Create a workspace for a user
     */
    async createWorkspace(userId, workspaceName, repoUrl) {
        try {
            // 1. Get the default organization
            const orgsRes = await this.client.get('/api/v2/organizations');
            const orgs = orgsRes.data || [];
            const defaultOrg = orgs.find(o => o.is_default) || orgs[0];

            if (!defaultOrg) {
                throw new Error('No organization found in Coder');
            }

            // 2. Get the template (we assume 'standard-workspace' exists)
            const templatesRes = await this.client.get(`/api/v2/organizations/${defaultOrg.id}/templates`);
            const templates = templatesRes.data || [];
            const template = templates.find(t => t.name === 'standard-workspace');

            if (!template) {
                throw new Error('Template "standard-workspace" not found. Please upload it first.');
            }

            // 3. Create the workspace - only required fields
            // POST /api/v2/organizations/{organization}/members/{user}/workspaces
            const res = await this.client.post(`/api/v2/organizations/${defaultOrg.id}/members/${userId}/workspaces`, {
                name: workspaceName,
                template_id: template.id
            });

            return res.data;
        } catch (error) {
            // If workspace already exists (409 Conflict or 400 with name validation), try to get it
            const isConflict = error.response?.status === 409;
            const isNameTaken = error.response?.status === 400 &&
                error.response?.data?.validations?.some(v => v.field === 'name');

            if (isConflict || isNameTaken) {
                console.log(`   Workspace "${workspaceName}" already exists, fetching...`);
                return this.getWorkspaceByName(userId, workspaceName);
            }
            console.error('Error creating workspace:', error.response?.data || error.message);
            throw error;
        }
    }

    async getWorkspaceByName(userId, workspaceName) {
        // Search by name (Coder API returns { workspaces: [...] })
        const res = await this.client.get('/api/v2/workspaces', {
            params: { q: `name:${workspaceName}` }
        });

        const workspaces = res.data?.workspaces || res.data || [];
        const workspace = workspaces.find(w => w.name === workspaceName);

        if (!workspace) {
            throw new Error(`Workspace "${workspaceName}" not found`);
        }

        return workspace;
    }

    /**
     * Start a stopped workspace
     */
    async startWorkspace(workspaceId) {
        try {
            const buildRes = await this.client.post(`/api/v2/workspaces/${workspaceId}/builds`, {
                transition: 'start'
            });
            return buildRes.data;
        } catch (error) {
            // 409 = "A workspace build is already active" - workspace is already starting
            if (error.response?.status === 409) {
                console.log('   ⏳ Workspace build already in progress, waiting...');
                return { status: 'already_building' };
            }
            throw error;
        }
    }
}

module.exports = new CoderService();
