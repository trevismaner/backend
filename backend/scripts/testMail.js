/**
 * Sends one test email, to check a mail provider is configured before relying on it.
 *
 *   npm run mail:test -- you@example.com
 *
 * Why this is worth a script: with REQUIRE_EMAIL_VERIFICATION on, a misconfigured provider
 * shows up as a sign-up that collects an address and then appears to hang — the person waits
 * for a code that was never delivered, and the failure is buried in the server log behind
 * three screens of app flow. This isolates the one question: can this server send an email
 * to that address, and if not, exactly what did the provider say.
 *
 * It sends the real verification template with a dummy code, so what arrives is what a
 * person would actually receive — including how it renders and whether it lands in spam.
 */
import dotenv from 'dotenv';
import { sendMail, verificationEmail, activeProvider } from '../control/Mailer.js';

dotenv.config();

const to = process.argv[2] || process.env.MAIL_TEST_TO;

if (!to || !to.includes('@')) {
  console.error('\n  Usage: npm run mail:test -- you@example.com\n');
  console.error('  Sends one test email so you can check the provider works before turning');
  console.error('  REQUIRE_EMAIL_VERIFICATION on.\n');
  process.exit(1);
}

const provider = activeProvider();

console.log('');
console.log(`  Provider : ${provider}`);
console.log(`  From     : ${process.env.MAIL_FROM?.trim() || 'Run League <onboarding@resend.dev>'}`);
console.log(`  To       : ${to}`);
console.log('');

if (provider === 'console') {
  console.log('  No mail provider is configured, so nothing will actually be sent — the message');
  console.log('  is printed below instead. That is the mode the test suites use. Set RESEND_API_KEY');
  console.log('  or SMTP_URL in .env to send for real.');
}

const { subject, text, html } = verificationEmail({ code: '123456', minutes: 10 });
const result = await sendMail({ to, subject, text, html });

console.log('');
if (result.delivered && provider !== 'console') {
  console.log('  Sent. Check the inbox — and the spam folder, which is where a first message from');
  console.log('  a new sender often lands.');
  console.log('');
  console.log('  If nothing arrives within a minute or two, the usual causes are:');
  console.log('    · the provider accepted it but will not deliver to this address yet. Resend');
  console.log('      only sends to your own account address until you have verified a domain.');
  console.log('    · MAIL_FROM is not an address the provider has authorised for you.');
  console.log('    · it was delivered and filtered. Check spam before assuming it failed.');
} else if (result.delivered) {
  console.log('  Printed above rather than sent (no provider configured).');
} else {
  console.log(`  FAILED via ${result.via}: ${result.error}`);
  console.log('');
  console.log('  Common causes:');
  console.log('    · a "from" address on a domain you have not verified with the provider —');
  console.log('      without a domain, use the provider\'s own test sender, or a provider that');
  console.log('      lets you verify a single email address rather than a whole domain.');
  console.log('    · a wrong or revoked API key.');
  console.log('    · for SMTP: the wrong port, or a host that blocks outbound SMTP. Port 465 or');
  console.log('      587 usually works where 25 does not.');
  console.log('    · for SMTP with Gmail: an ordinary account password will not work. It needs');
  console.log('      2-step verification turned on and an App Password.');
  process.exit(1);
}
console.log('');
