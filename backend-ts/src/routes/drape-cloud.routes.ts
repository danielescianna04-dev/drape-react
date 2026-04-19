/**
 * Drape Cloud public API — mounted at /v1/*
 *
 * This router is hit by GENERATED APPS, not the Drape UI. Every
 * request must carry `x-drape-project-key`; every mutating request
 * also goes through quota enforcement. There is NO cross-project
 * escape hatch on this router — all row access goes through a
 * ScopedRowStore built from the project resolved from the key.
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { log } from '../utils/logger';
import { config } from '../config';
import { isDrapeCloudConfigured } from '../services/drape-cloud/client';
import { resolveApiKey, type DrapeApiKey } from '../services/drape-cloud/api-key.service';
import {
  ensureAnonUser,
  resolveSession,
  signIn,
  signOut,
  signUp,
  AuthError,
  type EndUser,
} from '../services/drape-cloud/auth.service';
import {
  assertRequestQuota,
  assertRowQuota,
  QuotaExceededError,
} from '../services/drape-cloud/quota.service';
import {
  FilterParseError,
  ScopedRowStore,
  ScopedValidationError,
} from '../services/drape-cloud/scoped-query';

// Augment Request with the resolved project + end user so handlers
// don't have to re-parse headers.
declare module 'express-serve-static-core' {
  interface Request {
    drapeProject?: DrapeApiKey;
    drapeEndUser?: EndUser | null;
  }
}

function sendError(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ error: { code, message } });
}

async function requireDrapeCloudKey(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!isDrapeCloudConfigured() || !config.drapeCloudEnabled) {
    sendError(res, 503, 'cloud_disabled', 'Drape Cloud is disabled on this server');
    return;
  }
  const headerValue = req.header('x-drape-project-key');
  const project = await resolveApiKey(headerValue).catch(() => null);
  if (!project) {
    sendError(res, 401, 'invalid_project_key', 'Missing or invalid x-drape-project-key');
    return;
  }
  try {
    await assertRequestQuota(project.projectId);
  } catch (err) {
    if (err instanceof QuotaExceededError) {
      sendError(res, err.status, err.code, err.message);
      return;
    }
    log.warn(`[DrapeCloud] Quota counter failed for ${project.projectId}: ${(err as Error).message}`);
    // Soft-fail: keep serving if the quota counter itself crashes.
  }
  req.drapeProject = project;
  next();
}

async function attachEndUser(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = req.header('x-drape-session-token');
  if (!token || !req.drapeProject) {
    req.drapeEndUser = null;
    return next();
  }
  req.drapeEndUser = await resolveSession(req.drapeProject.projectId, token).catch(() => null);
  next();
}

function handleKnownError(res: Response, err: unknown): boolean {
  if (err instanceof AuthError) {
    sendError(res, err.status, err.code, err.message);
    return true;
  }
  if (err instanceof QuotaExceededError) {
    sendError(res, err.status, err.code, err.message);
    return true;
  }
  if (err instanceof FilterParseError) {
    sendError(res, 400, 'bad_filter', err.message);
    return true;
  }
  if (err instanceof ScopedValidationError) {
    sendError(res, 400, 'bad_input', err.message);
    return true;
  }
  return false;
}

export function createDrapeCloudRouter(): Router {
  const router = Router();
  router.use(requireDrapeCloudKey);
  router.use(attachEndUser);

  // ---------- /v1/auth ----------
  router.post('/auth/anon', async (req, res) => {
    try {
      const user = await ensureAnonUser(req.drapeProject!.projectId, req.body?.anonId);
      // Don't issue a session for anon — SDK tracks the anonymous id
      // client-side. Sessions cost a DB insert we don't need.
      res.json({ user });
    } catch (err) {
      if (handleKnownError(res, err)) return;
      log.error('[DrapeCloud] /auth/anon failed:', err);
      sendError(res, 500, 'internal', 'Unexpected error');
    }
  });

  router.post('/auth/signup', async (req, res) => {
    try {
      const { email, password, displayName, anonId } = req.body || {};
      const result = await signUp({
        projectId: req.drapeProject!.projectId,
        email,
        password,
        displayName,
        promoteAnonId: typeof anonId === 'string' ? anonId : null,
      });
      res.json(result);
    } catch (err) {
      if (handleKnownError(res, err)) return;
      log.error('[DrapeCloud] /auth/signup failed:', err);
      sendError(res, 500, 'internal', 'Unexpected error');
    }
  });

  router.post('/auth/signin', async (req, res) => {
    try {
      const { email, password } = req.body || {};
      const result = await signIn({
        projectId: req.drapeProject!.projectId,
        email,
        password,
      });
      res.json(result);
    } catch (err) {
      if (handleKnownError(res, err)) return;
      log.error('[DrapeCloud] /auth/signin failed:', err);
      sendError(res, 500, 'internal', 'Unexpected error');
    }
  });

  router.post('/auth/signout', async (req, res) => {
    const token = req.header('x-drape-session-token');
    if (typeof token === 'string' && token.length > 0) {
      await signOut(token).catch(() => {});
    }
    res.json({ ok: true });
  });

  router.get('/auth/me', (req, res) => {
    res.json({ user: req.drapeEndUser || null });
  });

  // ---------- /v1/data/:table ----------
  router.get('/data/:table', async (req, res) => {
    try {
      const store = new ScopedRowStore(req.drapeProject!.projectId);
      const whereRaw = req.query.where;
      const where = typeof whereRaw === 'string' && whereRaw.length > 0 ? JSON.parse(whereRaw) : undefined;
      const endUserId =
        req.query.mine === '1' || req.query.mine === 'true'
          ? req.drapeEndUser?.id || null
          : undefined;
      const result = await store.list({
        tableName: req.params.table,
        where,
        orderBy: req.query.orderBy,
        limit: req.query.limit,
        offset: req.query.offset,
        endUserId,
      });
      res.json(result);
    } catch (err) {
      if (err instanceof SyntaxError) {
        sendError(res, 400, 'bad_where', 'where must be valid JSON');
        return;
      }
      if (handleKnownError(res, err)) return;
      log.error('[DrapeCloud] list failed:', err);
      sendError(res, 500, 'internal', 'Unexpected error');
    }
  });

  router.get('/data/:table/:id', async (req, res) => {
    try {
      const store = new ScopedRowStore(req.drapeProject!.projectId);
      const row = await store.get(req.params.table, req.params.id);
      if (!row) {
        sendError(res, 404, 'not_found', 'Row not found');
        return;
      }
      res.json({ row });
    } catch (err) {
      if (handleKnownError(res, err)) return;
      log.error('[DrapeCloud] get failed:', err);
      sendError(res, 500, 'internal', 'Unexpected error');
    }
  });

  router.post('/data/:table', async (req, res) => {
    try {
      await assertRowQuota(req.drapeProject!.projectId);
      const mine = req.body?.mine === true;
      if (mine && !req.drapeEndUser) {
        sendError(res, 401, 'auth_required', 'mine=true requires a signed-in end user');
        return;
      }
      const store = new ScopedRowStore(req.drapeProject!.projectId);
      const row = await store.insert({
        tableName: req.params.table,
        data: req.body?.data,
        endUserId: mine ? req.drapeEndUser!.id : null,
      });
      res.json({ row });
    } catch (err) {
      if (handleKnownError(res, err)) return;
      log.error('[DrapeCloud] insert failed:', err);
      sendError(res, 500, 'internal', 'Unexpected error');
    }
  });

  router.patch('/data/:table/:id', async (req, res) => {
    try {
      const store = new ScopedRowStore(req.drapeProject!.projectId);
      const row = await store.update({
        tableName: req.params.table,
        id: req.params.id,
        data: req.body?.data,
      });
      if (!row) {
        sendError(res, 404, 'not_found', 'Row not found');
        return;
      }
      res.json({ row });
    } catch (err) {
      if (handleKnownError(res, err)) return;
      log.error('[DrapeCloud] update failed:', err);
      sendError(res, 500, 'internal', 'Unexpected error');
    }
  });

  router.delete('/data/:table/:id', async (req, res) => {
    try {
      const store = new ScopedRowStore(req.drapeProject!.projectId);
      const deleted = await store.delete(req.params.table, req.params.id);
      res.json({ deleted });
    } catch (err) {
      if (handleKnownError(res, err)) return;
      log.error('[DrapeCloud] delete failed:', err);
      sendError(res, 500, 'internal', 'Unexpected error');
    }
  });

  return router;
}
