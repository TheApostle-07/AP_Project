import crypto from 'node:crypto';
import { query } from './db';

export const HANDOFF_COOKIE = process.env.NODE_ENV === 'production'
  ? '__Host-alina_payment_handoff'
  : 'alina_payment_handoff';

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
    if (key === name) {
      try { return decodeURIComponent(parts.join('=')); } catch { return null; }
    }
  }
  return null;
}

export function setHandoffCookie(response, token, expiresAt) {
  const expires = new Date(expiresAt);
  const maxAge = Math.max(0, Math.min(31 * 60, Math.floor((expires.getTime() - Date.now()) / 1000)));
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  response.setHeader(
    'Set-Cookie',
    `${HANDOFF_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Priority=High; Max-Age=${maxAge}; Expires=${expires.toUTCString()}${secure}`,
  );
}

export function clearHandoffCookie(response) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  response.setHeader('Set-Cookie', `${HANDOFF_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Priority=High; Max-Age=0${secure}`);
}

export function requestIsSameOrigin(request) {
  const origin = request.headers.origin;
  try {
    const fetchSite = request.headers['sec-fetch-site'];
    if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') return false;
    const host = String(request.headers.host || '').trim();
    if (!host) return false;
    const hostname = new URL(`https://${host}`).hostname;
    const local = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
    const expected = `${local ? 'http' : 'https'}://${host}`;
    if (origin) return new URL(origin).origin === new URL(expected).origin;
    const referer = request.headers.referer;
    return Boolean(referer && new URL(referer).origin === new URL(expected).origin);
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

export function enforceRequestRateLimit(request, route, limit) {
  const ip = String(request.headers['x-vercel-forwarded-for'] || request.headers['x-forwarded-for'] || request.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  return enforceTokenRateLimit(handoffTokenHash(`request-ip:${ip}`), route, limit);
}

export async function readWebhookBody(request, maxBytes = 65_536) {
  if (Number(request.headers['content-length']) > maxBytes) return null;
  const chunks = [];
  let bytes = 0;
  for await (const value of request) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    bytes += chunk.length;
    if (bytes > maxBytes) return null;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, bytes).toString('utf8');
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
