import { getRequestHandoff, publicSummary } from '../../../lib/handoff';

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'private, no-store, max-age=0');
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ message: 'Method not allowed.' });
  }
  try {
    const { handoff } = await getRequestHandoff(request);
    if (!handoff) return response.status(404).json({ message: 'Open payment again from your private booking page.' });
    return response.status(200).json({ checkout: publicSummary(handoff) });
  } catch {
    return response.status(503).json({ message: 'Secure payment is briefly unavailable. Your booking record is unchanged.' });
  }
}
