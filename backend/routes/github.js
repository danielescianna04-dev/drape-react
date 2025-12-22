/**
 * GitHub Routes
 * OAuth and GitHub API integration
 */

const express = require('express');
const axios = require('axios');
const router = express.Router();

const { asyncHandler } = require('../middleware/errorHandler');
const { validateBody, schema } = require('../middleware/validator');
const { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET } = require('../utils/constants');

/**
 * POST /github/device-code
 * Start GitHub OAuth device flow
 */
router.post('/device-code', asyncHandler(async (req, res) => {
    const clientId = GITHUB_CLIENT_ID || req.body.client_id;

    if (!clientId) {
        return res.status(400).json({
            error: 'client_id is required or GITHUB_CLIENT_ID must be set'
        });
    }

    console.log('🔐 Starting GitHub device flow...');

    const response = await axios.post(
        'https://github.com/login/device/code',
        {
            client_id: clientId,
            scope: 'repo read:user user:email'
        },
        {
            headers: { 'Accept': 'application/json' }
        }
    );

    console.log('✅ Device code generated');
    res.json(response.data);
}));

/**
 * POST /github/token
 * Exchange device code for access token
 */
router.post('/token', asyncHandler(async (req, res) => {
    const { device_code, client_id } = req.body;
    const clientId = client_id || GITHUB_CLIENT_ID;

    if (!clientId || !device_code) {
        return res.status(400).json({
            error: 'client_id and device_code are required'
        });
    }

    console.log('🔐 Exchanging device code for token...');

    const response = await axios.post(
        'https://github.com/login/oauth/access_token',
        {
            client_id: clientId,
            device_code: device_code,
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
        },
        {
            headers: { 'Accept': 'application/json' }
        }
    );

    if (response.data.access_token) {
        console.log('✅ Access token obtained');
    } else {
        console.log('⏳ Token not ready:', response.data.error);
    }

    res.json(response.data);
}));

/**
 * GET /github/user
 * Get authenticated user info
 */
router.get('/user', asyncHandler(async (req, res) => {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authorization header required' });
    }

    const token = authHeader.substring(7);

    const response = await axios.get('https://api.github.com/user', {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github.v3+json'
        }
    });

    res.json(response.data);
}));

/**
 * GET /github/repos
 * List user's repositories
 */
router.get('/repos', asyncHandler(async (req, res) => {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authorization header required' });
    }

    const token = authHeader.substring(7);
    const { type = 'all', sort = 'updated', per_page = 30, page = 1 } = req.query;

    const response = await axios.get('https://api.github.com/user/repos', {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github.v3+json'
        },
        params: { type, sort, per_page, page }
    });

    res.json(response.data);
}));

/**
 * Check if repository is private
 */
async function checkRepoVisibility(repositoryUrl, githubToken = null) {
    try {
        const match = repositoryUrl.match(/github\.com\/([^\/]+)\/([^\/]+?)(?:\.git)?$/);
        if (!match) {
            return { isPrivate: false, requiresAuth: false };
        }

        const [, owner, repo] = match;
        const apiUrl = `https://api.github.com/repos/${owner}/${repo}`;

        const headers = {
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'Drape-IDE'
        };

        if (githubToken) {
            headers['Authorization'] = `token ${githubToken}`;
        }

        const response = await axios.get(apiUrl, { headers, timeout: 5000 });
        const isPrivate = response.data.private === true;

        return {
            isPrivate,
            requiresAuth: isPrivate && !githubToken,
            repoInfo: {
                name: response.data.name,
                fullName: response.data.full_name,
                private: isPrivate,
                defaultBranch: response.data.default_branch
            }
        };
    } catch (error) {
        if (error.response?.status === 404) {
            return { isPrivate: true, requiresAuth: !githubToken };
        }
        if (error.response?.status === 401) {
            return { isPrivate: true, requiresAuth: true };
        }
        return { isPrivate: false, requiresAuth: false };
    }
}

module.exports = router;
module.exports.checkRepoVisibility = checkRepoVisibility;
