/**
 * The password rules, for showing the person what is required as they type.
 *
 * The server is the authority — backend/control/PasswordPolicy.js — and it serves its rules
 * from GET /api/auth/config, which the sign-up screen fetches. This module exists so the
 * screen can tick requirements off live without a round trip per keystroke, and so it still
 * works when the config request has not finished or has failed.
 *
 * The defaults below mirror the server's. Where the fetched config differs, the fetched one
 * wins: a server that tightens its rule should not need a new app build to be obeyed. The
 * client check is a courtesy to the person, never the enforcement — submitting is still
 * judged by the server.
 */

export const DEFAULT_POLICY = {
  minLength: 8,
  maxBytes: 72,
  requiresLetter: true,
  requiresNumber: true,
  rejectsCommon: true,
  rejectsPersonal: true,
};

/** A small subset of the server's list — enough to catch the obvious ones before submitting. */
const COMMON = new Set([
  'password', 'password1', 'password123', 'passw0rd', 'p@ssword', 'p@ssw0rd',
  '12345678', '123456789', '1234567890', 'qwerty123', 'qwertyui', 'abc12345',
  'iloveyou', 'letmein1', 'welcome1', 'admin123', 'runleague', 'runleague1', 'runleague123',
]);

function byteLength(str) {
  // No Buffer in React Native. This counts UTF-8 bytes the way the server's cap does.
  let bytes = 0;
  for (const ch of str) {
    const c = ch.codePointAt(0);
    if (c < 0x80) bytes += 1;
    else if (c < 0x800) bytes += 2;
    else if (c < 0x10000) bytes += 3;
    else bytes += 4;
  }
  return bytes;
}

function personalFragments({ email, name } = {}) {
  const parts = [];
  if (typeof email === 'string' && email.includes('@')) {
    const local = email.split('@')[0].trim().toLowerCase();
    if (local.length >= 4) parts.push(local);
  }
  if (typeof name === 'string') {
    for (const word of name.toLowerCase().split(/\s+/)) {
      if (word.length >= 4) parts.push(word);
    }
  }
  return parts;
}

/**
 * Returns a list of { label, met } for the screen to render as a live checklist, so the
 * person can see what is still missing instead of submitting and being told.
 */
export function checkRequirements(password, { policy = DEFAULT_POLICY, email, name } = {}) {
  const value = typeof password === 'string' ? password : '';
  const lower = value.toLowerCase();
  const p = { ...DEFAULT_POLICY, ...(policy || {}) };

  const list = [
    { label: `At least ${p.minLength} characters`, met: value.length >= p.minLength },
  ];
  if (p.requiresLetter) list.push({ label: 'At least one letter', met: /\p{L}/u.test(value) });
  if (p.requiresNumber) list.push({ label: 'At least one number', met: /\d/.test(value) });

  // Only shown once there is something to judge — flagging "not a common password" against
  // an empty field reads as an error the person has not made yet.
  if (p.rejectsCommon) {
    list.push({ label: 'Not a commonly used password', met: value.length === 0 ? false : !COMMON.has(lower) });
  }
  if (p.rejectsPersonal) {
    const fragments = personalFragments({ email, name });
    const clean = value.length === 0
      ? false
      : !fragments.some((f) => lower.includes(f));
    list.push({ label: 'Does not contain your name or email', met: clean });
  }
  if (p.maxBytes && byteLength(value) > p.maxBytes) {
    list.push({ label: `No longer than ${p.maxBytes} bytes`, met: false });
  }

  return list;
}

/** Everything satisfied? Used to enable the Continue button. */
export function meetsPolicy(password, options) {
  return checkRequirements(password, options).every((r) => r.met);
}

export default { checkRequirements, meetsPolicy, DEFAULT_POLICY };
