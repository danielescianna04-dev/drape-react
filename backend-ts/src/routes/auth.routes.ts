import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler';
import { sendVerificationEmail } from '../services/email.service';

export const authRouter = Router();

authRouter.post('/send-verification', asyncHandler(async (req, res) => {
  const { email, displayName } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'email is required' });
  }

  await sendVerificationEmail(email, displayName || '');

  res.json({ success: true });
}));
