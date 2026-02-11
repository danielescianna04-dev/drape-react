import { Resend } from 'resend';
import { config } from '../config';
import { firebaseService } from './firebase.service';

const resend = config.resendApiKey ? new Resend(config.resendApiKey) : null;

const VERIFICATION_EMAIL_HTML = (displayName: string, link: string) => `
<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="dark only">
  <meta name="supported-color-schemes" content="dark only">
  <title>Verify your email — Drape</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <style>table,td{border-collapse:collapse;}</style>
  <![endif]-->
  <style>
    :root{color-scheme:dark only}
    body,html{margin:0;padding:0;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;background:#0A0A0C!important}
    img{border:0;height:auto;line-height:100%;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic}
    a{text-decoration:none}
    u+.body .gm-bg{background:#0A0A0C!important}
    @media only screen and (max-width:520px){
      .email-container{width:100%!important;padding:16px!important}
      .card{padding:32px 24px!important}
      .btn{padding:14px 32px!important}
    }
    @media(prefers-color-scheme:light){
      .body,body,html,.gm-bg{background:#0A0A0C!important}
      .card-bg{background-color:#161619!important}
    }
  </style>
</head>
<body class="body" style="margin:0;padding:0;word-spacing:normal;background-color:#0A0A0C;">
  <div role="article" aria-roledescription="email" aria-label="Verify your email" lang="en" class="gm-bg" style="font-size:16px;font-size:1rem;background-color:#0A0A0C;">

    <!-- Outer wrapper -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0A0A0C;" bgcolor="#0A0A0C">
      <tr>
        <td align="center" style="padding:48px 16px;background-color:#0A0A0C;" bgcolor="#0A0A0C">

          <!-- Email container -->
          <table role="presentation" class="email-container" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;">

            <!-- Drape wordmark -->
            <tr>
              <td align="center" style="padding:0 0 40px;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:28px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">
                      Drape
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Main card -->
            <tr>
              <td class="card card-bg" style="background-color:#161619;border-radius:20px;border:1px solid #222228;padding:44px 36px;" bgcolor="#161619">

                <!-- Envelope circle -->
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td align="center" style="padding:0 0 28px;">
                      <table role="presentation" cellpadding="0" cellspacing="0">
                        <tr>
                          <td style="width:64px;height:64px;border-radius:32px;background-color:#1E1530;text-align:center;vertical-align:middle;font-size:30px;line-height:64px;color:#A78BFA;" bgcolor="#1E1530">
                            &#9993;
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>

                <!-- Heading -->
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:24px;font-weight:700;color:#F0F0F5;text-align:center;padding:0 0 12px;">
                      Verify your email
                    </td>
                  </tr>
                </table>

                <!-- Body text -->
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:15px;line-height:24px;color:#9494AE;text-align:center;padding:0 0 32px;">
                      Hey ${displayName}, welcome to Drape!<br>
                      Tap the button below to verify your email address and start building with AI.
                    </td>
                  </tr>
                </table>

                <!-- CTA button -->
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td align="center" style="padding:0 0 28px;">
                      <!--[if mso]>
                      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${link}" style="height:52px;width:220px;v-text-anchor:middle;" arcsize="50%" fillcolor="#7C3AED">
                        <w:anchorlock/>
                        <center style="color:#ffffff;font-family:sans-serif;font-size:15px;font-weight:bold;">Verify my email</center>
                      </v:roundrect>
                      <![endif]-->
                      <!--[if !mso]><!-->
                      <a class="btn" href="${link}" style="display:inline-block;background-color:#7C3AED;color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:15px;font-weight:600;line-height:1;text-align:center;text-decoration:none;padding:16px 44px;border-radius:28px;mso-hide:all;">
                        Verify my email
                      </a>
                      <!--<![endif]-->
                    </td>
                  </tr>
                </table>

                <!-- Divider -->
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="border-top:1px solid #222228;padding:0;height:1px;font-size:0;line-height:0;">&nbsp;</td>
                  </tr>
                </table>

                <!-- Fallback link -->
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:12px;line-height:18px;color:#6A6A82;text-align:center;padding:20px 0 0;word-break:break-all;">
                      If the button doesn't work, copy and paste this link into your browser:<br>
                      <a href="${link}" style="color:#A78BFA;">${link}</a>
                    </td>
                  </tr>
                </table>

              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="padding:28px 0 0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:12px;line-height:18px;color:#6A6A82;text-align:center;">
                      This link expires in 24 hours.
                    </td>
                  </tr>
                  <tr>
                    <td style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:12px;line-height:18px;color:#6A6A82;text-align:center;padding:4px 0 0;">
                      If you didn't create a Drape account, you can safely ignore this email.
                    </td>
                  </tr>
                  <tr>
                    <td style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:11px;line-height:16px;color:#4A4A62;text-align:center;padding:20px 0 0;">
                      &copy; ${new Date().getFullYear()} Drape &middot; Code with AI
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>

  </div>
</body>
</html>
`;

export async function sendVerificationEmail(email: string, displayName: string): Promise<void> {
  if (!resend) {
    throw new Error('Resend API key not configured');
  }

  const auth = firebaseService.getAuth();
  const link = await auth.generateEmailVerificationLink(email);

  await resend.emails.send({
    from: 'Drape <noreply@drape-dev.it>',
    to: email,
    subject: 'Verify your email — Drape',
    html: VERIFICATION_EMAIL_HTML(displayName || 'there', link),
  });
}
