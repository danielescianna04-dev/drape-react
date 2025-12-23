/**
 * API Routes
 * Cloud workstation management via Coder API
 * 
 * IMPROVEMENTS:
 * - Cleaner API structure
 * - Better validation
 * - Consistent response format
 */

const express = require('express');
const router = express.Router();

const { asyncHandler, NotFoundError } = require('../middleware/errorHandler');
const { validateBody, schema } = require('../middleware/validator');
const coderService = require('../coder-service');
const { cleanWorkspaceName, getLocalIP } = require('../utils/helpers');

const LOCAL_IP = getLocalIP();

/**
 * GET /api/workstations
 * List all workstations
 */
router.get('/workstations', asyncHandler(async (req, res) => {
    const workspaces = await coderService.client.get('/api/v2/workspaces', {
        params: { q: 'owner:me' }
    });

    res.json({
        success: true,
        workspaces: workspaces.data?.workspaces || []
    });
}));

/**
 * POST /api/workstations
 * Create a new workstation
 */
router.post('/workstations',
    validateBody({
        name: schema().required().string().minLength(1).maxLength(32),
        repositoryUrl: schema().string()
    }),
    asyncHandler(async (req, res) => {
        const { name, repositoryUrl, userId } = req.body;

        console.log(`\n☁️ Creating workstation: ${name}`);

        // Ensure user exists
        const coderUser = await coderService.ensureUser(
            'daniele.scianna04@gmail.com',
            'admin'
        );

        // Clean workspace name
        const wsName = cleanWorkspaceName(name);

        // Create workspace
        const workspace = await coderService.createWorkspace(
            coderUser.id,
            wsName,
            repositoryUrl
        );

        console.log(`✅ Workspace created: ${workspace.id}`);

        // Build access URLs
        const PORT = process.env.PORT || 3000;
        const apiBase = `http://${LOCAL_IP}:${PORT}`;

        res.json({
            success: true,
            workspace: {
                id: workspace.id,
                name: wsName,
                status: workspace.latest_build?.job?.status || 'unknown',
                urls: {
                    vscode: `${apiBase}/@${coderUser.username}/${wsName}/apps/vscode/?folder=/home/coder`,
                    preview: `${apiBase}/@${coderUser.username}/${wsName}/apps/dev/`,
                    dev: `${apiBase}/@${coderUser.username}/${wsName}/apps/dev/`
                }
            }
        });
    })
);

/**
 * POST /api/workstations/:id/start
 * Start a stopped workstation
 */
router.post('/workstations/:id/start', asyncHandler(async (req, res) => {
    const { id } = req.params;

    console.log(`▶️ Starting workstation: ${id}`);

    const result = await coderService.startWorkspace(id);

    res.json({
        success: true,
        status: result.status || 'starting'
    });
}));

/**
 * POST /api/workstations/:id/stop
 * Stop a running workstation
 */
router.post('/workstations/:id/stop', asyncHandler(async (req, res) => {
    const { id } = req.params;

    console.log(`⏹️ Stopping workstation: ${id}`);

    const result = await coderService.client.post(`/api/v2/workspaces/${id}/builds`, {
        transition: 'stop'
    });

    res.json({
        success: true,
        status: 'stopping'
    });
}));

/**
 * DELETE /api/workstations/:id
 * Delete a workstation
 */
router.delete('/workstations/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;

    console.log(`🗑️ Deleting workstation: ${id}`);

    await coderService.client.delete(`/api/v2/workspaces/${id}`);

    res.json({
        success: true,
        deleted: id
    });
}));

/**
 * GET /api/workstations/:id
 * Get workstation details
 */
router.get('/workstations/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;

    try {
        const result = await coderService.client.get(`/api/v2/workspaces/${id}`);

        res.json({
            success: true,
            workspace: result.data
        });
    } catch (error) {
        if (error.response?.status === 404) {
            throw new NotFoundError('Workstation');
        }
        throw error;
    }
}));

/**
 * GET /api/templates
 * List available templates
 */
router.get('/templates', asyncHandler(async (req, res) => {
    const orgsRes = await coderService.client.get('/api/v2/organizations');
    const orgs = orgsRes.data || [];
    const defaultOrg = orgs.find(o => o.is_default) || orgs[0];

    if (!defaultOrg) {
        return res.json({ success: true, templates: [] });
    }

    const templatesRes = await coderService.client.get(
        `/api/v2/organizations/${defaultOrg.id}/templates`
    );

    res.json({
        success: true,
        templates: templatesRes.data || []
    });
}));

/**
 * GET /api/health
 * Coder connection health check
 */
router.get('/health', asyncHandler(async (req, res) => {
    const health = await coderService.healthCheck();

    res.json({
        success: health.status === 'ok',
        coder: health
    });
}));

module.exports = router;
