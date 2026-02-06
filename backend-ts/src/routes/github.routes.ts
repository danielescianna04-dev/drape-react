import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/async-handler';
import { log } from '../utils/logger';
import { config } from '../config';

export const githubRouter = Router();

/**
 * POST /github/device-flow
 * Start GitHub OAuth device flow
 */
githubRouter.post('/device-flow', asyncHandler(async (req: Request, res: Response) => {
  try {
    const clientId = config.githubClientId || req.body.client_id;
    const scope = req.body.scope || 'repo read:user user:email';

    if (!clientId) {
      res.status(400).json({ error: 'client_id is required or GITHUB_CLIENT_ID must be set' });
      return;
    }

    log.info('[GitHub] Starting device flow...');

    const response = await fetch('https://github.com/login/device/code', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ client_id: clientId, scope }),
    });

    const data = await response.json();

    if (data.device_code) {
      log.info('[GitHub] Device code generated');
    } else {
      log.warn('[GitHub] Device flow error:', data);
    }

    res.json(data);
  } catch (error: any) {
    log.error('[GitHub] Device flow error:', error);
    res.status(500).json({ error: 'Failed to start device flow' });
  }
}));

/**
 * POST /github/poll-device
 * Exchange device code for access token (poll)
 */
githubRouter.post('/poll-device', asyncHandler(async (req: Request, res: Response) => {
  try {
    const { device_code, client_id } = req.body;
    const clientId = client_id || config.githubClientId;

    if (!clientId || !device_code) {
      res.status(400).json({ error: 'client_id and device_code are required' });
      return;
    }

    log.info('[GitHub] Polling for token...');

    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        device_code,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    });

    const data = await response.json();

    if (data.access_token) {
      log.info('[GitHub] Access token obtained');
    } else if (data.error === 'authorization_pending') {
      log.debug('[GitHub] Token not ready, authorization pending');
    } else {
      log.warn('[GitHub] Token poll result:', data.error || data);
    }

    res.json(data);
  } catch (error: any) {
    log.error('[GitHub] Poll device error:', error);
    res.status(500).json({ error: 'Failed to poll device' });
  }
}));

/**
 * GET /github/user
 * Get authenticated user info
 */
githubRouter.get('/user', asyncHandler(async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Authorization header required' });
      return;
    }

    const token = authHeader.substring(7);

    const response = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });

    const data = await response.json();
    res.json(data);
  } catch (error: any) {
    log.error('[GitHub] Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
}));

/**
 * GET /github/repos
 * List user's repositories
 */
githubRouter.get('/repos', asyncHandler(async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Authorization header required' });
      return;
    }

    const token = authHeader.substring(7);
    const { type = 'all', sort = 'updated', per_page = '30', page = '1' } = req.query;

    const url = new URL('https://api.github.com/user/repos');
    url.searchParams.set('type', String(type));
    url.searchParams.set('sort', String(sort));
    url.searchParams.set('per_page', String(per_page));
    url.searchParams.set('page', String(page));

    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });

    const data = await response.json();
    res.json(data);
  } catch (error: any) {
    log.error('[GitHub] Get repos error:', error);
    res.status(500).json({ error: 'Failed to get repos' });
  }
}));
