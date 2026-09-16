import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { findArtwork } from '../../../lib/artwork-catalog.mjs';
import { accessHash, ArtworkError, validAccessToken } from '../../../lib/artwork-orders.mjs';
import { artworkService } from '../../../lib/artwork-server';
import { enforceTokenRateLimit, readCookie, requestIsSameOrigin } from '../../../lib/security';
import { publicKey, razorpayMode } from '../../../lib/paymentGateway';

export const config = { api: { bodyParser: { sizeLimit: '8kb' }, responseLimit: '4mb' }, maxDuration: 60 };

function cookieName(id) {
  return `${process.env.NODE_ENV === 'production' ? '__Host-' : ''}alina_art_${id}`;
}

function setAccess(response, id, token) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  response.setHeader('Set-Cookie', `${cookieName(id)}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000${secure}`);
}

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'private, no-store, max-age=0');
  response.setHeader('Vary', 'Cookie, Origin');
  response.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  const action = request.query.action;
  if (!['order', 'status', 'verify', 'download'].includes(action)) return response.status(404).json({ message: 'Not found.' });
  const method = action === 'download' ? 'GET' : 'POST';
  if (request.method !== method) { response.setHeader('Allow', method); return response.status(405).json({ message: 'Method not allowed.' }); }
  if ((method === 'POST' && !requestIsSameOrigin(request)) || request.headers['sec-fetch-site'] === 'cross-site') return response.status(403).json({ message: 'This request could not be verified.' });
  const artwork = findArtwork(method === 'GET' ? request.query.artworkId : request.body?.artworkId);
  if (!artwork) return response.status(404).json({ message: 'Artwork not found.' });
  try {
    const mode = razorpayMode();
    publicKey(); // Readiness check; never return the secret key.
    let cookie;
    try { cookie = readCookie(request, cookieName(artwork.id)); } catch { cookie = null; }
    const suppliedToken = request.body?.token;
    if (suppliedToken !== undefined && !validAccessToken(suppliedToken)) throw new ArtworkError(400, 'This private purchase link is invalid.');
    const token = suppliedToken || cookie;
    const ip = String(request.headers['x-vercel-forwarded-for'] || request.headers['x-forwarded-for'] || request.socket?.remoteAddress || 'unknown').split(',')[0].trim();
    const rateKey = createHash('sha256').update(`artwork-ip:${ip}`).digest('hex');
    if (!(await enforceTokenRateLimit(rateKey, `artwork-${action}`, action === 'order' ? 10 : 60))) throw new ArtworkError(429, 'Please wait a minute before trying again.');
    if (action === 'order') {
      if (!validAccessToken(token)) throw new ArtworkError(400, 'Please reopen artwork checkout.');
      // Preserve an already-paid purchase on this browser instead of silently selling it twice.
      const owned = validAccessToken(cookie) ? await artworkService.purchaseForToken(artwork.id, cookie) : null;
      if (owned?.status === 'PAID' && token !== cookie) throw new ArtworkError(409, 'You already have this artwork. Refresh to open your purchase.');
      const result = await artworkService.start(artwork.id, token);
      setAccess(response, artwork.id, token);
      return response.status(200).json(result);
    }
    let purchase = await artworkService.purchaseForToken(artwork.id, token);
    if (!purchase) {
      if (action === 'status' && !suppliedToken) return response.status(200).json({ mode, purchase: null });
      throw new ArtworkError(404, 'Open your private purchase link to access this artwork.');
    }
    if (!(await enforceTokenRateLimit(accessHash(token), 'artwork-access', 60))) throw new ArtworkError(429, 'Please wait a minute before checking again.');
    purchase = action === 'verify'
      ? await artworkService.verify(purchase, request.body)
      : await artworkService.reconcile(purchase);
    if (action === 'download') {
      if (purchase.status !== 'PAID') throw new ArtworkError(403, 'A verified, non-refunded payment is required to download this artwork.');
      // Paths come only from our catalog allowlist, never from a client filename.
      const file = await readFile(path.join(process.cwd(), 'assets', 'artwork', `${artwork.id}.png`));
      response.setHeader('Content-Type', 'image/png');
      response.setHeader('Content-Disposition', `attachment; filename="alina-${artwork.id}.png"`);
      response.setHeader('Content-Length', file.length);
      response.setHeader('X-Content-Type-Options', 'nosniff');
      return response.status(200).send(file);
    }
    setAccess(response, artwork.id, token);
    return response.status(200).json({ mode, purchase: artworkService.summary(purchase), accessToken: token });
  } catch (error) {
    if (error instanceof ArtworkError) return response.status(error.status).json({ message: error.message });
    console.error('artwork_checkout_unavailable', { action, code: typeof error?.code === 'string' ? error.code : 'SERVICE_UNAVAILABLE' });
    return response.status(503).json({ message: 'Artwork checkout is temporarily unavailable. If you attempted payment, don’t pay again—check the payment status shortly.' });
  }
}
