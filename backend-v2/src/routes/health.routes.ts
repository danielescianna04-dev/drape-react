import { Router } from 'express';
import { supabaseAdmin } from '../lib/supabase';
import { appwriteManagementService } from '../services/appwrite-management.service';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  res.json({ ok: true, service: 'bynot-backend-v2' });
});

healthRouter.get('/deep', async (_req, res) => {
  const [supaResult, appwriteResult] = await Promise.allSettled([
    supabaseAdmin.from('profiles').select('id', { count: 'exact', head: true }).limit(1),
    appwriteManagementService.health(),
  ]);

  const supabase =
    supaResult.status === 'fulfilled' && !supaResult.value.error
      ? { ok: true }
      : { ok: false, error: supaResult.status === 'fulfilled' ? supaResult.value.error?.message : 'rejected' };

  const appwrite = appwriteResult.status === 'fulfilled' ? appwriteResult.value : { ok: false, error: 'rejected' };

  res.json({ ok: supabase.ok && appwrite.ok, supabase, appwrite });
});
