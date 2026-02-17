import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler';
import { sendVerificationEmail } from '../services/email.service';
import { log } from '../utils/logger';

export const authRouter = Router();
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function maskEmail(email: string): string {
  const [name, domain] = email.split('@');
  if (!name || !domain) return 'invalid-email';
  if (name.length <= 2) return `${name[0] || '*'}*@${domain}`;
  return `${name.slice(0, 2)}***@${domain}`;
}

authRouter.post('/send-verification', asyncHandler(async (req, res) => {
  const rawEmail = typeof req.body?.email === 'string' ? req.body.email : '';
  const displayName = typeof req.body?.displayName === 'string' ? req.body.displayName : '';
  const email = rawEmail.trim().toLowerCase();

  if (!email) {
    return res.status(400).json({ error: 'email is required' });
  }

  if (!EMAIL_REGEX.test(email)) {
    return res.status(400).json({ error: 'invalid email format' });
  }

  try {
    const { messageId } = await sendVerificationEmail(email, displayName);
    res.json({ success: true, messageId });
  } catch (err: any) {
    log.warn(`[Auth] Failed to send verification email to ${maskEmail(email)}: ${err?.message || err}`);
    res.status(502).json({
      success: false,
      error: 'Unable to send verification email right now',
    });
  }
}));
