import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../entities/User.js';

function generateToken(user) {
  return jwt.sign(
    { userId: user.userId, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await User.findByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Incorrect email or password' });
    }

    if (user.isSuspended) {
      return res.status(403).json({ error: 'This account has been suspended' });
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      return res.status(401).json({ error: 'Incorrect email or password' });
    }

    const token = generateToken(user);
    return res.status(200).json({ user: user.toJSON(), token });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Failed to log in' });
  }
}

export default login;
