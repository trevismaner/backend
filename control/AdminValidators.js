import { AdminError } from './AdminControlHelpers.js';
import { REWARD_TYPES } from '../entities/Reward.js';
import { ROLES } from '../entities/User.js';

const has = (body, key) => body[key] !== undefined;
const isNonNegativeInt = (v) => Number.isInteger(v) && v >= 0;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function requireBoolean(value, label) {
  if (typeof value !== 'boolean') throw AdminError.validation(`${label} must be true or false`);
  return value;
}

export function requireRole(role) {
  if (!Object.values(ROLES).includes(role)) {
    throw AdminError.validation(`role must be one of: ${Object.values(ROLES).join(', ')}`);
  }
  return role;
}

export function requireOneOf(value, allowed, label) {
  if (!allowed.includes(value)) {
    throw AdminError.validation(`${label} must be one of: ${allowed.join(', ')}`);
  }
  return value;
}

function requiredText(body, key, max) {
  const value = body[key];
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    throw AdminError.validation(`${key} is required (max ${max} characters)`);
  }
  return value.trim();
}

function optionalText(body, key, max) {
  const value = body[key];
  if (value === null) return null;
  if (typeof value !== 'string' || (max && value.trim().length > max)) {
    throw AdminError.validation(`${key} must be text${max ? ` (max ${max} characters)` : ''} or null`);
  }
  return value.trim() || null;
}

function finish(out, partial) {
  if (partial && Object.keys(out).length === 0) {
    throw AdminError.validation('No valid fields to update');
  }
  return out;
}

export function validateNewUser(body = {}) {
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!EMAIL_REGEX.test(email)) throw AdminError.validation('A valid email is required');
  const name = requiredText(body, 'name', 100);
  if (typeof body.password !== 'string' || body.password.length < 8) {
    throw AdminError.validation('Password must be at least 8 characters');
  }
  const role = requireRole(body.role ?? ROLES.REGISTERED_USER);
  return { email, name, password: body.password, role };
}

/**
 * Reward input. With partial=true only the fields present are validated/returned.
 * null clears optional fields (description, rewardType, stock = unlimited).
 */
export function validateReward(body = {}, { partial = false } = {}) {
  const out = {};

  if (!partial || has(body, 'name')) out.name = requiredText(body, 'name', 100);

  if (!partial || has(body, 'pointsRequired')) {
    if (!isNonNegativeInt(body.pointsRequired)) {
      throw AdminError.validation('pointsRequired must be a whole number, 0 or more');
    }
    out.pointsRequired = body.pointsRequired;
  }

  if (has(body, 'description')) out.description = optionalText(body, 'description');

  if (has(body, 'rewardType')) {
    if (body.rewardType !== null && !REWARD_TYPES.includes(body.rewardType)) {
      throw AdminError.validation(`rewardType must be one of: ${REWARD_TYPES.join(', ')}, or null`);
    }
    out.rewardType = body.rewardType;
  }

  if (has(body, 'stock')) {
    if (body.stock !== null && !isNonNegativeInt(body.stock)) {
      throw AdminError.validation('stock must be a whole number, 0 or more, or null for unlimited');
    }
    out.stock = body.stock;
  }

  if (has(body, 'isActive')) out.isActive = requireBoolean(body.isActive, 'isActive');

  return finish(out, partial);
}

export function validateBadge(body = {}, { partial = false } = {}) {
  const out = {};

  if (!partial || has(body, 'name')) out.name = requiredText(body, 'name', 100);
  if (has(body, 'description')) out.description = optionalText(body, 'description');

  if (has(body, 'iconUrl')) {
    const url = optionalText(body, 'iconUrl', 2000);
    if (url !== null && !/^https?:\/\/\S+$/i.test(url)) {
      throw AdminError.validation('iconUrl must be an http(s) URL or null');
    }
    out.iconUrl = url;
  }

  return finish(out, partial);
}

export function validateAnnouncement(body = {}) {
  const title = requiredText(body, 'title', 200);
  const message = requiredText(body, 'body', 5000);
  const role = body.role ?? null;
  if (role !== null) requireRole(role);
  return { title, body: message, role };
}

/**
 * SA-06 user edit: name, email, password, bio. Only the fields present are returned.
 * Role and suspension are deliberately excluded — they have their own use cases.
 */
export function validateUserEdit(body = {}) {
  const out = {};

  if (has(body, 'name')) out.name = requiredText(body, 'name', 100);

  if (has(body, 'email')) {
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!EMAIL_REGEX.test(email)) throw AdminError.validation('A valid email is required');
    out.email = email;
  }

  if (has(body, 'password')) {
    if (typeof body.password !== 'string' || body.password.length < 8) {
      throw AdminError.validation('Password must be at least 8 characters');
    }
    out.password = body.password;
  }

  if (has(body, 'bio')) out.bio = optionalText(body, 'bio', 2000);

  return finish(out, true);
}

/** SA-21 group edit: name, description, maxMembers (null clears the limit). */
export function validateGroupEdit(body = {}) {
  const out = {};

  if (has(body, 'name')) out.name = requiredText(body, 'name', 100);
  if (has(body, 'description')) out.description = optionalText(body, 'description');

  if (has(body, 'maxMembers')) {
    if (body.maxMembers !== null && (!Number.isInteger(body.maxMembers) || body.maxMembers < 1)) {
      throw AdminError.validation('Max members must be a whole number of 1 or more, or null for no limit');
    }
    out.maxMembers = body.maxMembers;
  }

  return finish(out, true);
}

/**
 * SA-12 / SA-14 public event. With partial=true only the fields present are validated,
 * and at least one must be given. null clears an optional field.
 */
export function validatePublicEvent(body = {}, { partial = false } = {}) {
  const out = {};

  if (!partial || has(body, 'name')) out.name = requiredText(body, 'name', 100);
  if (has(body, 'description')) out.description = optionalText(body, 'description');

  if (has(body, 'maxParticipants')) {
    if (body.maxParticipants !== null
        && (!Number.isInteger(body.maxParticipants) || body.maxParticipants < 1)) {
      throw AdminError.validation('Max participants must be a whole number of 1 or more, or null for no limit');
    }
    out.maxParticipants = body.maxParticipants;
  }

  const dates = {};
  for (const key of ['registrationDeadline', 'startDate', 'endDate']) {
    if (!has(body, key)) continue;
    if (body[key] === null) { out[key] = null; continue; }
    const d = new Date(body[key]);
    if (Number.isNaN(d.getTime())) throw AdminError.validation(`${key} must be a valid date`);
    out[key] = body[key];
    dates[key] = d;
  }
  if (dates.startDate && dates.endDate && dates.endDate < dates.startDate) {
    throw AdminError.validation('End date cannot be before the start date');
  }
  if (dates.registrationDeadline && dates.startDate && dates.registrationDeadline > dates.startDate) {
    throw AdminError.validation('Registration deadline cannot be after the start date');
  }

  return finish(out, partial);
}
