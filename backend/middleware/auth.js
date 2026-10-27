import jwt from 'jsonwebtoken';
import User from '../entities/User.js';

export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.userId);

    if (!user) {
      return res.status(401).json({ error: 'User no longer exists' });
    }
    if (user.isSuspended) {
      return res.status(403).json({ error: 'Account is suspended' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

export function requireGroupAdmin(req, res, next) {
  if (!req.user || !req.user.isGroupAdmin) {
    return res.status(403).json({ error: 'Group Admin permissions required' });
  }
  next();
}
