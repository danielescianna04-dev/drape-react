import { Router, Request, Response } from 'express';
import { log } from '../utils/logger';
import { config } from '../config';

export const bitbucketRouter = Router();

const BITBUCKET_AUTH_URL = 'https://bitbucket.org/site/oauth2/authorize';
const BITBUCKET_TOKEN_URL = 'https://bitbucket.org/site/oauth2/access_token';

/**
 * POST /bitbucket/authorize
 * Generate Bitbucket OAuth authorization URL
 */
bitbucketRouter.post('/authorize', async (req: Request, res: Response) => {
  try {
    const clientId = config.bitbucketClientId || req.body.client_id;
    const redirectUri = req.body.redirect_uri || config.bitbucketRedirectUri;
    // Bitbucket scopes: account, repository, repository:write, pullrequest, etc.
    const scope = req.body.scope || 'account repository repository:write';

    if (!clientId) {
      res.status(400).json({ error: 'client_id is required or BITBUCKET_CLIENT_ID must be set' });
      return;
    }

    const state = Math.random().toString(36).substring(2, 15);

    const authUrl = new URL(BITBUCKET_AUTH_URL);
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', scope);
    authUrl.searchParams.set('state', state);

    log.info('[Bitbucket] Generated authorization URL');

    res.json({
      auth_url: authUrl.toString(),
      state,
    });
  } catch (error: any) {
    log.error('[Bitbucket] Authorize error:', error.message);
    res.status(500).json({ error: 'Failed to generate authorization URL', message: error.message });
  }
});

/**
 * POST /bitbucket/callback
 * Exchange authorization code for access token
 */
bitbucketRouter.post('/callback', async (req: Request, res: Response) => {
  try {
    const { code, redirect_uri } = req.body;
    const clientId = config.bitbucketClientId || req.body.client_id;
    const clientSecret = config.bitbucketClientSecret || req.body.client_secret;
    const finalRedirectUri = redirect_uri || config.bitbucketRedirectUri;

    if (!code) {
      res.status(400).json({ error: 'code is required' });
      return;
    }

    if (!clientId || !clientSecret) {
      res.status(400).json({ error: 'client_id and client_secret are required' });
      return;
    }

    log.info('[Bitbucket] Exchanging code for token...');

    // Bitbucket requires Basic auth with client_id:client_secret
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const response = await fetch(BITBUCKET_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: finalRedirectUri,
      }).toString(),
    });

    const data = await response.json();

    if (data.access_token) {
      log.info('[Bitbucket] Access token obtained');
      res.json({
        access_token: data.access_token,
        token_type: data.token_type,
        refresh_token: data.refresh_token,
        expires_in: data.expires_in,
        scopes: data.scopes,
      });
    } else {
      log.warn('[Bitbucket] Token exchange failed:', data);
      res.status(400).json({
        error: data.error || 'token_exchange_failed',
        error_description: data.error_description || 'Failed to exchange code for token',
      });
    }
  } catch (error: any) {
    log.error('[Bitbucket] Callback error:', error.message);
    res.status(500).json({ error: 'Failed to exchange code for token', message: error.message });
  }
});

/**
 * POST /bitbucket/refresh
 * Refresh access token using refresh token
 */
bitbucketRouter.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refresh_token } = req.body;
    const clientId = config.bitbucketClientId || req.body.client_id;
    const clientSecret = config.bitbucketClientSecret || req.body.client_secret;

    if (!refresh_token) {
      res.status(400).json({ error: 'refresh_token is required' });
      return;
    }

    if (!clientId || !clientSecret) {
      res.status(400).json({ error: 'client_id and client_secret are required' });
      return;
    }

    log.info('[Bitbucket] Refreshing token...');

    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const response = await fetch(BITBUCKET_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token,
      }).toString(),
    });

    const data = await response.json();

    if (data.access_token) {
      log.info('[Bitbucket] Token refreshed');
      res.json({
        access_token: data.access_token,
        token_type: data.token_type,
        refresh_token: data.refresh_token,
        expires_in: data.expires_in,
        scopes: data.scopes,
      });
    } else {
      log.warn('[Bitbucket] Token refresh failed:', data);
      res.status(400).json({
        error: data.error || 'refresh_failed',
        error_description: data.error_description || 'Failed to refresh token',
      });
    }
  } catch (error: any) {
    log.error('[Bitbucket] Refresh error:', error.message);
    res.status(500).json({ error: 'Failed to refresh token', message: error.message });
  }
});

/**
 * GET /bitbucket/user
 * Get authenticated user info
 */
bitbucketRouter.get('/user', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Authorization header required' });
      return;
    }

    const token = authHeader.substring(7);

    const response = await fetch('https://api.bitbucket.org/2.0/user', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
    });

    const data = await response.json();
    res.json(data);
  } catch (error: any) {
    log.error('[Bitbucket] Get user error:', error.message);
    res.status(500).json({ error: 'Failed to get user', message: error.message });
  }
});

/**
 * GET /bitbucket/repos
 * List user's repositories
 */
bitbucketRouter.get('/repos', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Authorization header required' });
      return;
    }

    const token = authHeader.substring(7);
    const { role = 'member', sort = '-updated_on', pagelen = '30', page = '1' } = req.query;

    const url = new URL('https://api.bitbucket.org/2.0/repositories');
    url.searchParams.set('role', String(role));
    url.searchParams.set('sort', String(sort));
    url.searchParams.set('pagelen', String(pagelen));
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
    log.error('[Bitbucket] Get repos error:', error.message);
    res.status(500).json({ error: 'Failed to get repos', message: error.message });
  }
});
