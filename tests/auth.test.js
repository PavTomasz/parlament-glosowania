import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { requireAccess, accountHasAccess } from '../lib/auth.js';
import accountHandler from '../api/account.js';
import configHandler from '../api/auth-config.js';
import sejm from '../api/sejm.js';
import senat from '../api/senat.js';
import ai from '../api/ai.js';
import deficit from '../api/deficit.js';

const originalFetch = globalThis.fetch;
const originalUrl = process.env.SUPABASE_URL;
const originalKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const token = 'test-user-token-123456789';
const confirmedUser = { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', email: 'test@example.com', email_confirmed_at: '2026-01-01T00:00:00Z', is_anonymous: false };
let calls;

beforeEach(() => {
  calls = [];
  process.env.SUPABASE_URL = 'https://auth.example.test';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
  globalThis.fetch = async () => { throw new Error('Unexpected network request'); };
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = originalUrl;
  if (originalKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY; else process.env.SUPABASE_PUBLISHABLE_KEY = originalKey;
});

function response() {
  return { statusCode: 200, headers: {}, body: null,
    setHeader(key, value) { this.headers[key.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}
function request(extra = {}) {
  return { method: 'GET', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, query: {}, ...extra };
}
function upstream({ user = confirmedUser, userStatus = 200, account = { account_type: 'private' }, settings = { external: { email: true } }, tableStatus = 200 } = {}) {
  let currentAccount = account;
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    assert.equal(new URL(url).origin, 'https://auth.example.test');
    assert.equal(options.headers.apikey, 'sb_publishable_test');
    if (url.endsWith('/auth/v1/settings')) return Response.json(settings);
    assert.equal(options.headers.Authorization, `Bearer ${token}`);
    if (url.endsWith('/auth/v1/user')) return Response.json(user, { status: userStatus });
    assert.ok(url.includes('/rest/v1/parlament_accounts'));
    if (tableStatus !== 200) return Response.json({ message: 'internal detail' }, { status: tableStatus });
    if (options.method === 'POST') {
      const body = JSON.parse(options.body);
      currentAccount = { account_type: body.account_type, subscription_status: 'inactive', paid_until: null };
      return new Response(null, { status: 201 });
    }
    return Response.json(currentAccount ? [currentAccount] : []);
  };
}
function noCache(res) {
  assert.match(res.headers['cache-control'], /private.*no-store/);
  assert.equal(res.headers['vercel-cdn-cache-control'], 'no-store');
  assert.equal(res.headers.vary, 'Authorization');
}

for (const [name, handler] of [['Sejm', sejm], ['Senat', senat], ['AI', ai], ['Deficit', deficit]]) {
  test(`${name}: no token means no data, even with auth unconfigured`, async () => {
    delete process.env.SUPABASE_URL;
    const res = response();
    await handler(request({ headers: {}, method: name === 'AI' ? 'POST' : 'GET' }), res);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.code, 'LOGIN_REQUIRED');
    noCache(res);
  });
}

test('forged token is verified upstream and rejected', async () => {
  upstream({ user: { message: 'Invalid JWT' }, userStatus: 401 });
  const res = response();
  assert.equal(await requireAccess(request(), res), null);
  assert.equal(res.statusCode, 401);
  assert.equal(calls.length, 1);
  noCache(res);
});

for (const user of [{ ...confirmedUser, is_anonymous: true }, { ...confirmedUser, email_confirmed_at: null }]) {
  test(`rejects ${user.is_anonymous ? 'anonymous' : 'unconfirmed'} identity`, async () => {
    upstream({ user });
    const res = response();
    assert.equal(await requireAccess(request(), res), null);
    assert.equal(res.statusCode, 403);
    assert.equal(calls.length, 1);
  });
}

test('new user must select an account before data access', async () => {
  upstream({ account: null });
  const res = response();
  assert.equal(await requireAccess(request(), res), null);
  assert.equal(res.body.code, 'ACCOUNT_SETUP_REQUIRED');
});

test('verified private user receives free access', async () => {
  upstream();
  const res = response();
  const identity = await requireAccess(request(), res);
  assert.equal(identity.user.id, confirmedUser.id);
  assert.equal(identity.account.account_type, 'private');
  noCache(res);
});

test('company access requires active status and a future paid-until date', async () => {
  const now = Date.parse('2026-06-01T00:00:00Z');
  assert.equal(accountHasAccess({ account_type: 'company', subscription_status: 'active', paid_until: '2026-06-02T00:00:00Z' }, now), true);
  for (const [status, until] of [['inactive', '2099-01-01'], ['active', '2026-06-01T00:00:00Z'], ['active', '2025-01-01'], ['active', null], ['active', 'invalid']]) {
    const account = { account_type: 'company', subscription_status: status, paid_until: until };
    assert.equal(accountHasAccess(account, now), false);
    upstream({ account });
    const res = response();
    assert.equal(await requireAccess(request(), res), null);
    assert.equal(res.statusCode, 402);
  }
});

test('missing account table fails closed and conceals upstream details', async () => {
  upstream({ tableStatus: 404 });
  const res = response();
  assert.equal(await requireAccess(request(), res), null);
  assert.equal(res.statusCode, 503);
  assert.ok(!JSON.stringify(res.body).includes('internal detail'));
});

test('account creation always uses verified identity and no billing fields', async () => {
  upstream({ account: null });
  const res = response();
  await accountHandler(request({ method: 'POST', body: { accountType: 'private' } }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.access, true);
  const insert = calls.find(call => call.options.method === 'POST');
  assert.deepEqual(JSON.parse(insert.options.body), { user_id: confirmedUser.id, account_type: 'private' });
});

test('company onboarding registers the account without granting paid access', async () => {
  upstream({ account: null });
  const res = response();
  await accountHandler(request({ method: 'POST', body: { accountType: 'company' } }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.access, false);
});

test('client cannot spoof identity, subscription or account type', async () => {
  for (const body of [{ accountType: 'private', user_id: 'another-user' }, { accountType: 'company', subscription_status: 'active' }, { accountType: 'company', paid_until: '2099-01-01' }, { accountType: 'admin' }, '{bad-json']) {
    upstream({ account: null });
    const res = response();
    await accountHandler(request({ method: 'POST', body }), res);
    assert.equal(res.statusCode, 400);
    assert.equal(calls.filter(call => call.options.method === 'POST').length, 0);
  }
});

test('company cannot change its existing account to free private access', async () => {
  upstream({ account: { account_type: 'company', subscription_status: 'inactive', paid_until: null } });
  const res = response();
  await accountHandler(request({ method: 'POST', body: { accountType: 'private' } }), res);
  assert.equal(res.body.account.account_type, 'company');
  assert.equal(res.body.access, false);
  assert.equal(calls.filter(call => call.options.method === 'POST').length, 0);
});

test('public login configuration shows only enabled providers', async () => {
  upstream({ settings: { external: { email: true, google: true, github: false, linkedin_oidc: true, anonymous: true } } });
  const res = response();
  await configHandler(request({ headers: {} }), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.providers.map(p => p.id), ['google', 'linkedin_oidc']);
  assert.equal(res.body.publishableKey, 'sb_publishable_test');
  noCache(res);
});

test('secret and legacy service keys are never returned to the browser', async () => {
  const legacySecret = `header.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.signature`;
  for (const key of ['sb_secret_do_not_expose', legacySecret]) {
    process.env.SUPABASE_PUBLISHABLE_KEY = key;
    const res = response();
    await configHandler(request(), res);
    assert.equal(res.statusCode, 503);
    assert.ok(!JSON.stringify(res.body).includes(key));
    assert.equal(calls.length, 0);
  }
});
