/**
 * Sending email, with a provider chosen by what is configured.
 *
 * Three modes, picked in this order:
 *
 *   RESEND_API_KEY   send over Resend's HTTPS API. This is the recommended one for a free
 *                    host: it needs no SMTP ports, which platforms including Render block or
 *                    restrict, and it has a free tier.
 *
 *   SMTP_URL         send over SMTP via nodemailer, imported dynamically so the dependency
 *                    is only needed by people who choose this route.
 *
 *   neither          "console" mode. Nothing is sent; the message is logged. This keeps
 *                    local development and the test suites working without a mail account,
 *                    and it is refused in production (see assertUsableInProduction) so a
 *                    deployment cannot silently stop emailing anyone.
 *
 * Every send returns { delivered, via, error } rather than throwing, because a sign-up
 * should not 500 because a mail provider had a bad minute — the caller decides what to tell
 * the person.
 */

const FROM = process.env.MAIL_FROM?.trim() || 'Run League <onboarding@resend.dev>';

export function activeProvider() {
  if (process.env.RESEND_API_KEY?.trim()) return 'resend';
  if (process.env.SMTP_URL?.trim()) return 'smtp';
  return 'console';
}

/**
 * Called at startup. A production deployment that cannot send mail while email verification
 * is required would accept sign-ups and then never let anyone finish one, which looks like a
 * broken app rather than a missing setting — so say so loudly instead.
 */
export function assertUsableInProduction({ requireEmailVerification }) {
  if (!requireEmailVerification) return null;
  if (process.env.NODE_ENV !== 'production') return null;
  if (activeProvider() !== 'console') return null;
  return 'REQUIRE_EMAIL_VERIFICATION is on but no mail provider is configured '
       + '(set RESEND_API_KEY or SMTP_URL). Sign-up would collect an address and then never '
       + 'deliver a code.';
}

async function sendViaResend({ to, subject, text, html }) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY.trim()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM, to: [to], subject, text, html }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Resend answered ${response.status}: ${body.slice(0, 300)}`);
  }
  return response.json().catch(() => ({}));
}

async function sendViaSmtp({ to, subject, text, html }) {
  let nodemailer;
  try {
    nodemailer = (await import('nodemailer')).default;
  } catch {
    throw new Error('SMTP_URL is set but nodemailer is not installed. Run `npm install nodemailer`.');
  }
  const transport = nodemailer.createTransport(process.env.SMTP_URL.trim());
  return transport.sendMail({ from: FROM, to, subject, text, html });
}

function sendViaConsole({ to, subject, text }) {
  // Deliberately readable in a terminal: this is how you finish a sign-up in development.
  console.log('');
  console.log('  ┌─ email (not sent — no mail provider configured) ─────────────');
  console.log(`  │ to:      ${to}`);
  console.log(`  │ subject: ${subject}`);
  for (const line of text.split('\n')) console.log(`  │ ${line}`);
  console.log('  └──────────────────────────────────────────────────────────────');
  console.log('');
  return { logged: true };
}

export async function sendMail({ to, subject, text, html }) {
  const via = activeProvider();
  try {
    if (via === 'resend') await sendViaResend({ to, subject, text, html });
    else if (via === 'smtp') await sendViaSmtp({ to, subject, text, html });
    else sendViaConsole({ to, subject, text });
    return { delivered: true, via, error: null };
  } catch (err) {
    console.error(`Mail send failed via ${via}:`, err.message);
    return { delivered: false, via, error: err.message };
  }
}

/** The verification email itself. Plain text first — it is what most clients will show. */
export function verificationEmail({ code, minutes }) {
  const text = [
    'Your Run League verification code is:',
    '',
    `    ${code}`,
    '',
    `It expires in ${minutes} minutes.`,
    '',
    'If you did not try to create a Run League account, you can ignore this email —',
    'nothing has been created and no further action is needed.',
  ].join('\n');

  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;line-height:1.5">
  <p>Your Run League verification code is:</p>
  <p style="font-size:30px;font-weight:700;letter-spacing:5px;margin:20px 0">${code}</p>
  <p>It expires in ${minutes} minutes.</p>
  <p style="color:#666;font-size:13px">If you did not try to create a Run League account, you can
  ignore this email — nothing has been created and no further action is needed.</p>
</div>`;

  return { subject: `Your Run League code: ${code}`, text, html };
}

export default { sendMail, verificationEmail, activeProvider, assertUsableInProduction };
