import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { asyncHandler } from '../middleware/async-handler';
import { log } from '../utils/logger';
import { config } from '../config';

export const gitlabRouter = Router();

const GITLAB_AUTH_URL = 'https://gitlab.com/oauth/authorize';
const GITLAB_TOKEN_URL = 'https://gitlab.com/oauth/token';

/**
 * POST /gitlab/authorize
 * Generate GitLab OAuth authorization URL
 */
gitlabRouter.post('/authorize', asyncHandler(async (req: Request, res: Response) => {
  try {
    const clientId = config.gitlabClientId || req.body.client_id;
    const redirectUri = req.body.redirect_uri || config.gitlabRedirectUri;
    const scope = req.body.scope || 'api read_user read_repository write_repository';

    if (!clientId) {
      res.status(400).json({ error: 'client_id is required or GITLAB_CLIENT_ID must be set' });
      return;
    }

    const state = crypto.randomBytes(16).toString('hex');

    const authUrl = new URL(GITLAB_AUTH_URL);
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', scope);
    authUrl.searchParams.set('state', state);

    log.info('[GitLab] Generated authorization URL');

    res.json({
      auth_url: authUrl.toString(),
      state,
    });
  } catch (error: any) {
    log.error('[GitLab] Authorize error:', error);
    res.status(500).json({ error: 'Failed to generate authorization URL' });
  }
}));

/**
 * POST /gitlab/callback
 * Exchange authorization code for access token
 */
gitlabRouter.post('/callback', asyncHandler(async (req: Request, res: Response) => {
  try {
    const { code, redirect_uri } = req.body;
    const clientId = config.gitlabClientId || req.body.client_id;
    const clientSecret = config.gitlabClientSecret;
    const finalRedirectUri = redirect_uri || config.gitlabRedirectUri;

    if (!code) {
      res.status(400).json({ error: 'code is required' });
      return;
    }

    if (!clientId) {
      res.status(400).json({ error: 'client_id is required' });
      return;
    }

    if (!clientSecret) {
      res.status(500).json({ error: 'OAuth client secret not configured on server' });
      return;
    }

    log.info('[GitLab] Exchanging code for token...');

    const response = await fetch(GITLAB_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: finalRedirectUri,
      }),
    });

    const data = await response.json();

    if (data.access_token) {
      log.info('[GitLab] Access token obtained');
      res.json({
        access_token: data.access_token,
        token_type: data.token_type,
        refresh_token: data.refresh_token,
        expires_in: data.expires_in,
        scope: data.scope,
      });
    } else {
      log.warn('[GitLab] Token exchange failed:', data);
      res.status(400).json({
        error: data.error || 'token_exchange_failed',
        error_description: data.error_description || 'Failed to exchange code for token',
      });
    }
  } catch (error: any) {
    log.error('[GitLab] Callback error:', error);
    res.status(500).json({ error: 'Failed to exchange code for token' });
  }
}));

/**
 * POST /gitlab/refresh
 * Refresh access token using refresh token
 */
gitlabRouter.post('/refresh', asyncHandler(async (req: Request, res: Response) => {
  try {
    const { refresh_token } = req.body;
    const clientId = config.gitlabClientId || req.body.client_id;
    const clientSecret = config.gitlabClientSecret;

    if (!refresh_token) {
      res.status(400).json({ error: 'refresh_token is required' });
      return;
    }

    if (!clientId) {
      res.status(400).json({ error: 'client_id is required' });
      return;
    }

    if (!clientSecret) {
      res.status(500).json({ error: 'OAuth client secret not configured on server' });
      return;
    }

    log.info('[GitLab] Refreshing token...');

    const response = await fetch(GITLAB_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token,
        grant_type: 'refresh_token',
      }),
    });

    const data = await response.json();

    if (data.access_token) {
      log.info('[GitLab] Token refreshed');
      res.json({
        access_token: data.access_token,
        token_type: data.token_type,
        refresh_token: data.refresh_token,
        expires_in: data.expires_in,
        scope: data.scope,
      });
    } else {
      log.warn('[GitLab] Token refresh failed:', data);
      res.status(400).json({
        error: data.error || 'refresh_failed',
        error_description: data.error_description || 'Failed to refresh token',
      });
    }
  } catch (error: any) {
    log.error('[GitLab] Refresh error:', error);
    res.status(500).json({ error: 'Failed to refresh token' });
  }
}));

/**
 * GET /gitlab/user
 * Get authenticated user info
 */
gitlabRouter.get('/user', asyncHandler(async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Authorization header required' });
      return;
    }

    const token = authHeader.substring(7);

    const response = await fetch('https://gitlab.com/api/v4/user', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
    });

    const data = await response.json();
    res.json(data);
  } catch (error: any) {
    log.error('[GitLab] Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
}));

/**
 * GET /gitlab/repos
 * List user's projects (repositories)
 */
gitlabRouter.get('/repos', asyncHandler(async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Authorization header required' });
      return;
    }

    const token = authHeader.substring(7);
    const { membership = 'true', order_by = 'updated_at', sort = 'desc', per_page = '30', page = '1' } = req.query;

    const url = new URL('https://gitlab.com/api/v4/projects');
    url.searchParams.set('membership', String(membership));
    url.searchParams.set('order_by', String(order_by));
    url.searchParams.set('sort', String(sort));
    url.searchParams.set('per_page', String(per_page));
    url.searchParams.set('page', String(page));

    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
    });

    const data = await response.json();
    res.json(data);
  } catch (error: any) {
    log.error('[GitLab] Get repos error:', error);
    res.status(500).json({ error: 'Failed to get repos' });
  }
}));
