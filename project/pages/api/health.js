// Public liveness must not wake the shared database. Dependency readiness is
// checked explicitly on Alina's authenticated /api/internal/readiness endpoint.
export default function handler(request, response) {
  if (request.method !== 'GET') return response.status(405).json({ status: 'method_not_allowed' });
  response.setHeader('Cache-Control', 'public, max-age=60');
  response.setHeader('Vercel-CDN-Cache-Control', 'public, s-maxage=300');
  return response.status(200).json({ status: 'ok', check: 'liveness', dependencies: 'not_checked' });
}
