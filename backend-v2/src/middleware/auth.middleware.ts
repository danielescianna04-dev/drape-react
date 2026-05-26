import type { NextFunction, Request, Response } from 'express';
import { supabaseAdmin } from '../lib/supabase';

export interface AuthedRequest extends Request {
  userId?: string;
  userEmail?: string;
  accessToken?: string;
}

/**
 * Middleware: estrae bearer token Supabase, verifica via getUser(),
 * popola req.userId / req.userEmail.
 */
export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: 'Missing bearer token' });
    return;
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  req.userId = data.user.id;
  req.userEmail = data.user.email ?? undefined;
  req.accessToken = token;
  next();
}
