// auth.js — password hashing (scrypt) + signed session tokens (HMAC), zero dependencies
const crypto = require('node:crypto');

const SECRET = process.env.AUTH_SECRET || 'dev-secret-change-me-in-production';
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

function verifyPassword(password, hash, salt) {
  const candidate = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(hash));
}

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function sign(payloadObj) {
  const payload = { ...payloadObj, exp: Date.now() + TOKEN_TTL_MS };
  const body = base64url(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verify(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!payload.exp || Date.now() > payload.exp) return null;
  return payload;
}

module.exports = { hashPassword, verifyPassword, sign, verify };
