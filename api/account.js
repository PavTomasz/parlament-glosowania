import { verifiedUser, readAccount, createAccount, accountHasAccess, authFailure, noStore, AuthError } from '../lib/auth.js';
export default async function handler(req, res) {
  noStore(res);
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ ok: false, error: 'Użyj GET lub POST.' });
  try {
    const identity = await verifiedUser(req);
    let account;
    if (req.method === 'POST') {
      if (!String(req.headers['content-type'] || '').startsWith('application/json')) throw new AuthError(415, 'JSON_REQUIRED', 'Nieprawidłowe żądanie.');
      let body;
      try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
      catch { throw new AuthError(400, 'INVALID_JSON', 'Nieprawidłowe dane konta.'); }
      if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => key !== 'accountType')) throw new AuthError(400, 'INVALID_FIELDS', 'Nieprawidłowe dane konta.');
      account = await createAccount(identity, body.accountType);
    } else account = await readAccount(identity);
    return res.status(200).json({ ok: true, user: { id: identity.user.id, email: identity.user.email }, account, access: accountHasAccess(account) });
  } catch (error) { return authFailure(res, error); }
}
