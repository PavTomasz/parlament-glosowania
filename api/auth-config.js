import { authConfig, enabledProviders, authFailure, noStore } from '../lib/auth.js';
export default async function handler(req, res) {
  noStore(res);
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Użyj GET.' });
  try {
    const config = authConfig();
    const providers = await enabledProviders();
    return res.status(200).json({ ok: true, url: config.url, publishableKey: config.key, ...providers });
  } catch (error) { return authFailure(res, error); }
}
