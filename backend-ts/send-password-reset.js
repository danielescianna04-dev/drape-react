// Send branded password reset emails to all email/password users
const admin = require('firebase-admin');
const { Resend } = require('resend');
require('dotenv').config({ path: './.env' });

const NEW_SA = require('./new-sa.json');
const app = admin.initializeApp({ credential: admin.credential.cert(NEW_SA) }, 'reset');
const auth = admin.auth(app);
const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.RESEND_FROM_EMAIL || 'Drape <noreply@drape-dev.it>';

const EMAIL_HTML = (displayName, link) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset your password — Drape</title>
  <style>
    body,html{margin:0;padding:0;background:#0A0A0C!important}
    a{text-decoration:none}
  </style>
</head>
<body style="margin:0;padding:0;background-color:#0A0A0C;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0A0A0C;">
    <tr><td align="center" style="padding:48px 16px;">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;">
        <tr><td align="center" style="padding:0 0 40px;">
          <span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:28px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">Drape</span>
        </td></tr>
        <tr><td style="background-color:#161619;border-radius:20px;border:1px solid #222228;padding:44px 36px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center" style="padding:0 0 28px;">
              <div style="width:64px;height:64px;border-radius:32px;background-color:#1E1530;text-align:center;line-height:64px;font-size:30px;">🔑</div>
            </td></tr>
            <tr><td style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:24px;font-weight:700;color:#F0F0F5;text-align:center;padding:0 0 12px;">
              Reset your password
            </td></tr>
            <tr><td style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;line-height:24px;color:#9494AE;text-align:center;padding:0 0 32px;">
              Hey ${displayName}, we've upgraded our infrastructure.<br>Please set a new password to continue using Drape.
            </td></tr>
            <tr><td align="center" style="padding:0 0 28px;">
              <a href="${link}" style="display:inline-block;background-color:#7C3AED;color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;font-weight:600;text-align:center;text-decoration:none;padding:16px 44px;border-radius:28px;">
                Reset my password
              </a>
            </td></tr>
            <tr><td style="border-top:1px solid #222228;padding:20px 0 0;">
              <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:12px;line-height:18px;color:#6A6A82;text-align:center;margin:0;">
                This link expires in 1 hour. If you didn't request this, you can safely ignore this email.
              </p>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:20px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:11px;color:#4A4A62;text-align:center;">
          © ${new Date().getFullYear()} Drape · Code with AI
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

async function run() {
  const { users } = await auth.listUsers(1000);
  const emailUsers = users.filter(u => u.providerData.some(p => p.providerId === 'password'));

  console.log(`📧 Invio reset password a ${emailUsers.length} utenti...\n`);

  for (const user of emailUsers) {
    try {
      const link = await auth.generatePasswordResetLink(user.email);
      const name = user.displayName || user.email.split('@')[0];
      await resend.emails.send({
        from: FROM,
        to: user.email,
        subject: 'Action required: reset your Drape password',
        html: EMAIL_HTML(name, link),
      });
      console.log(`  ✅ ${user.email}`);
    } catch (err) {
      console.error(`  ❌ ${user.email}: ${err.message}`);
    }
    await new Promise(r => setTimeout(r, 300));
  }

  console.log('\n✅ Reset email inviate!');
  process.exit(0);
}

run().catch(e => { console.error(e.message); process.exit(1); });
