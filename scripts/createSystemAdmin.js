/**
 * Bootstrap the first system admin (the API can't do it, since it needs an admin).
 *
 * Usage (run from the backend root so dotenv finds .env):
 *   node scripts/createSystemAdmin.js admin@example.com "StrongPass123" "System Admin"
 * or set ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME in the environment.
 *
 * If the email already exists, that user is promoted to system_admin and unsuspended.
 */
import bcrypt from 'bcryptjs';
import pool from '../config/db.js';
import User, { ROLES } from '../entities/User.js';

const [, , argEmail, argPassword, argName] = process.argv;
const email = (argEmail ?? process.env.ADMIN_EMAIL ?? '').trim().toLowerCase();
const password = argPassword ?? process.env.ADMIN_PASSWORD;
const name = argName ?? process.env.ADMIN_NAME ?? 'System Admin';

async function main() {
  if (!email) throw new Error('Email is required');

  const existing = await User.findByEmail(email);

  if (existing) {
    await User.setRole(existing.userId, ROLES.SYSTEM_ADMIN);
    await User.setSuspended(existing.userId, false);
    console.log(`Promoted existing user ${email} to system_admin.`);
    return;
  }

  if (!password || password.length < 8) {
    throw new Error('Password must be at least 8 characters for a new admin');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const admin = await User.create({ email, passwordHash, name, role: ROLES.SYSTEM_ADMIN });
  console.log(`Created system admin ${admin.email} (id: ${admin.userId}).`);
}

main()
  .catch((err) => {
    console.error('Failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
