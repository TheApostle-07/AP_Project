import crypto from 'node:crypto';
import { query } from './db';

export const HANDOFF_COOKIE = 'alina_payment_handoff';

export function handoffTokenHash(token) {
  return crypto.createHash('sha256').update(`payment-handoff:${token}`).digest('hex');
}

export function isValidHandoffToken(token) {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);
}

export function readCookie(request, name) {
  const cookies = String(request.headers.cookie || '').split(';');
  for (const entry of cookies) {
    const [key, ...parts] = entry.trim().split('=');
    if (key === name) return decodeURIComponent(parts.join('='));
  }
  return null;
}

export function setHandoffCookie(response, token, expiresAt) {
  const expires = new Date(expiresAt);
  const maxAge = Math.max(0, Math.min(31 * 60, Math.floor((expires.getTime() - Date.now()) / 1000)));
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  response.setHeader(
    'Set-Cookie',
    `${HANDOFF_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}; Expires=${expires.toUTCString()}${secure}`,
  );
}

export function clearHandoffCookie(response) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  response.setHeader('Set-Cookie', `${HANDOFF_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
}

export function requestIsSameOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return true;
  try {
    const host = request.headers['x-forwarded-host'] || request.headers.host;
    const local = String(host || '').startsWith('localhost') || String(host || '').startsWith('127.0.0.1');
    const expected = `${request.headers['x-forwarded-proto'] || (local ? 'http' : 'https')}://${host}`;
    return new URL(origin).origin === new URL(expected).origin;
  } catch {
    return false;
  }
}

export async function enforceTokenRateLimit(tokenHash, route, limit) {
  const rows = await query(
    `INSERT INTO request_rate_limits (key_hash, route, window_start, count)
     VALUES ($1, $2, date_trunc('minute', now()), 1)
     ON CONFLICT (key_hash, route, window_start)
     DO UPDATE SET count = request_rate_limits.count + 1
     RETURNING count`,
    [tokenHash, route],
  );
  return Number(rows[0]?.count || 1) <= limit;
}

export function normalizedEmail(value) {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export function safeEqualHex(expected, received) {
  if (!/^[a-f0-9]{64}$/i.test(received || '')) return false;
  const left = Buffer.from(expected, 'hex');
  const right = Buffer.from(received, 'hex');
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
