import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../entities/User.js';

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
    const { email, password, name, accountType } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }

    const existing = await User.findByEmail(email);
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const role = accountType === 'instructor' ? 'instructor' : 'registered_user';

    const user = await User.create({ email, passwordHash, name, role });
    const token = generateToken(user);

    return res.status(201).json({ user: user.toJSON(), token });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ error: 'Failed to create account' });
  }
}

export default register;
