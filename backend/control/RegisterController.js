import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../entities/User.js';
import { passwordRejection } from './PasswordPolicy.js';
import { validateEmail, validateText, MAX_NAME_LENGTH } from './InputPolicy.js';
import { isRequired as emailVerificationRequired, proofCoversEmail } from './EmailVerification.js';

const SALT_ROUNDS = 10;

function generateToken(user) {
  return jwt.sign(
    { userId: user.userId, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

async function register(req, res) {
  try {
    const { email: rawEmail, password, name: rawName, accountType, verificationToken } = req.body;

    if (!rawEmail || !password || !rawName) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }

    // Shape and length, before anything touches the database. Until this was here `a@`,
    // `@uow.edu.au` and `a b@uow.edu.au` each created a working account, and the address is
    // the login identifier and the only route for a password reset — so an account created
    // at `a@` could never be recovered.
    const checkedEmail = validateEmail(rawEmail);
    if (!checkedEmail.ok) {
      return res.status(400).json({ error: checkedEmail.problem });
    }
    // The normalised form is what gets stored and what every later lookup compares against,
    // so `Bob@uow.edu.au` and `bob@uow.edu.au` are one account rather than two.
    const email = checkedEmail.value;

    const checkedName = validateText(rawName, { label: 'Name', max: MAX_NAME_LENGTH });
    if (!checkedName.ok) {
      return res.status(400).json({ error: checkedName.problem });
    }
    const name = checkedName.value;

    // The duplicate check comes next deliberately. "You already have an account" is the
    // more useful thing to tell someone than "that password is too weak" — it sends them to
    // sign-in instead of to think up a better password for an account they already have.
    // It runs on the normalised address, so a second sign-up in different case is caught.
    const existing = await User.findByEmail(email);
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    // The password rule, shared with the admin paths and `admin:create`.
    const rejected = passwordRejection(password, { email, name });
    if (rejected) return res.status(400).json(rejected);

    // When verification is switched on, the address must come with a proof minted by
    // /auth/verification/confirm for that same address. Checked here rather than trusting
    // any flag from the client.
    if (emailVerificationRequired() && !proofCoversEmail(verificationToken, email)) {
      return res.status(403).json({
        error: 'Verify your email address before creating the account.',
        needsEmailVerification: true,
      });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const role = accountType === 'instructor' ? 'instructor' : 'registered_user';

    const user = await User.create({ email, passwordHash, name, role });

    // Record that the address was confirmed, so the fact survives the verification rows
    // being cleaned up later.
    if (verificationToken && proofCoversEmail(verificationToken, email)) {
      await User.markEmailVerified(user.userId);
    }

    const token = generateToken(user);

    return res.status(201).json({ user: user.toJSON(), token });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ error: 'Failed to create account' });
  }
}

export default register;
