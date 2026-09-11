// The publishable key identifies the app. User identity and paid access are
// verified on the server for EVERY protected request.
export class AuthError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

export function noStore(res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('CDN-Cache-Control', 'no-store');
  res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
  res.setHeader('Vary', 'Authorization');
}

export function authConfig() {
  const rawUrl = (process.env.SUPABASE_URL || '').trim();
  const key = (process.env.SUPABASE_PUBLISHABLE_KEY || '').trim();
  let url;
  try { url = new URL(rawUrl); } catch { throw new AuthError(503, 'AUTH_NOT_CONFIGURED', 'Logowanie jest w przygotowaniu. Spróbuj później.'); }
  let isPublic = key.startsWith('sb_publishable_');
  // Accept an existing legacy anon key, but NEVER expose service_role/secret.
  if (!isPublic && key.split('.').length === 3) {
    try { isPublic = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role === 'anon'; } catch { isPublic = false; }
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/' || !isPublic) {
    throw new AuthError(503, 'AUTH_NOT_CONFIGURED', 'Logowanie jest w przygotowaniu. Spróbuj później.');
  }
  return { url: url.origin, key };
}

async function supabaseRequest(path, { token, method = 'GET', body } = {}) {
  const config = authConfig();
  const headers = { apikey: config.key, Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  let response;
  try {
    response = await fetch(config.url + path, {
      method, headers, body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(12000), redirect: 'error'
    });
  } catch { throw new AuthError(503, 'AUTH_UNAVAILABLE', 'Nie można teraz sprawdzić konta. Spróbuj ponownie.'); }
  const data = await response.json().catch(() => null);
  return { response, data };
}

export async function verifiedUser(req) {
  const header = req.headers?.authorization;
  if (typeof header !== 'string' || !/^Bearer \S{16,16384}$/.test(header)) {
    throw new AuthError(401, 'LOGIN_REQUIRED', 'Zaloguj się, aby korzystać z serwisu.');
  }
  const token = header.slice(7);
  const { response, data: user } = await supabaseRequest('/auth/v1/user', { token });
  if (response.status === 401 || response.status === 403) {
    throw new AuthError(401, 'SESSION_EXPIRED', 'Sesja wygasła. Zaloguj się ponownie.');
  }
  if (!response.ok || !user || typeof user.id !== 'string') {
    throw new AuthError(503, 'AUTH_UNAVAILABLE', 'Nie można teraz sprawdzić konta. Spróbuj ponownie.');
  }
  if (user.is_anonymous || !user.email || !user.email_confirmed_at) {
    throw new AuthError(403, 'EMAIL_CONFIRMATION_REQUIRED', 'Potwierdź adres e-mail, aby uzyskać dostęp.');
  }
  return { user, token };
}

export function accountHasAccess(account, now = Date.now()) {
  if (account?.account_type === 'private') return true;
  return account?.account_type === 'company' && account.subscription_status === 'active'
    && Number.isFinite(Date.parse(account.paid_until)) && Date.parse(account.paid_until) > now;
}

export async function readAccount(identity) {
  const { response, data } = await supabaseRequest(
    `/rest/v1/parlament_accounts?user_id=eq.${encodeURIComponent(identity.user.id)}&select=account_type,subscription_status,paid_until&limit=1`,
    { token: identity.token }
  );
  if (!response.ok || !Array.isArray(data)) {
    throw new AuthError(503, 'ACCOUNTS_UNAVAILABLE', 'Nie można teraz odczytać danych konta. Spróbuj ponownie później.');
  }
  return data[0] || null;
}

export async function createAccount(identity, accountType) {
  if (!['private', 'company'].includes(accountType)) throw new AuthError(400, 'INVALID_ACCOUNT_TYPE', 'Wybierz rodzaj konta.');
  // Onboarding is one-time. No client route can change type, set a price,
  // activate a subscription or supply a different user's identity.
  const existing = await readAccount(identity);
  if (existing) return existing;
  const { response } = await supabaseRequest('/rest/v1/parlament_accounts', {
    token: identity.token, method: 'POST', body: { user_id: identity.user.id, account_type: accountType }
  });
  if (!response.ok && response.status !== 409) throw new AuthError(503, 'ACCOUNT_CREATE_FAILED', 'Nie udało się zapisać konta. Spróbuj ponownie.');
  const account = await readAccount(identity);
  if (!account) throw new AuthError(503, 'ACCOUNT_CREATE_FAILED', 'Nie udało się zapisać konta. Spróbuj ponownie.');
  return account;
}

export function authFailure(res, error) {
  noStore(res);
  const status = error instanceof AuthError ? error.status : 503;
  return res.status(status).json({ ok: false, code: error instanceof AuthError ? error.code : 'AUTH_UNAVAILABLE', error: error instanceof AuthError ? error.message : 'Logowanie jest chwilowo niedostępne.' });
}

export async function requireAccess(req, res) {
  noStore(res);
  try {
    const identity = await verifiedUser(req);
    const account = await readAccount(identity);
    if (!account) throw new AuthError(403, 'ACCOUNT_SETUP_REQUIRED', 'Wybierz rodzaj konta, aby kontynuować.');
    if (!accountHasAccess(account)) throw new AuthError(402, 'COMPANY_PLAN_REQUIRED', 'Konto firmowe wymaga aktywnego płatnego planu.');
    return { ...identity, account };
  } catch (error) { authFailure(res, error); return null; }
}

export async function enabledProviders() {
  const { response, data } = await supabaseRequest('/auth/v1/settings');
  if (!response.ok || !data?.external) throw new AuthError(503, 'AUTH_UNAVAILABLE', 'Logowanie jest chwilowo niedostępne.');
  const known = [
    ['google', 'Google'], ['apple', 'Apple'], ['facebook', 'Facebook'],
    ['azure', 'Microsoft'], ['linkedin_oidc', 'LinkedIn'], ['twitter', 'X'],
    ['github', 'GitHub'], ['discord', 'Discord']
  ];
  return { email: data.external.email === true, providers: known.filter(([id]) => data.external[id] === true).map(([id, label]) => ({ id, label })) };
}
