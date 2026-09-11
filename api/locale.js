export function preferredLocale(countryHeader) {
  const value = typeof countryHeader === 'string' ? countryHeader.trim().toUpperCase() : '';
  const valid = /^[A-Z]{2}$/.test(value) && !['XX', 'ZZ'].includes(value);
  const country = valid ? value : 'PL';
  return { country, language: country === 'PL' ? 'pl' : 'en', source: valid ? 'country' : 'default' };
}

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('CDN-Cache-Control', 'no-store');
  res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
  res.setHeader('Vary', 'X-Vercel-IP-Country');
  if (req.method !== 'GET') return res.status(405).json({ ok: false });
  // Vercel supplies the country code. No GPS permission or IP storage is used.
  return res.status(200).json({ ok: true, ...preferredLocale(req.headers?.['x-vercel-ip-country']) });
}
