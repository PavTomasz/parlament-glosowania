import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

// DOM integration tests: no live Supabase project, emails or OAuth redirects.
// The SDK is replaced at its boundary; the actual controller and HTML run.
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const entry = new URL('../auth-client.js', import.meta.url);
const source = await readFile(entry, 'utf8');
const appStub = 'data:text/javascript,' + encodeURIComponent('export function startApp(){globalThis.__test.starts++} export function resetApp(){globalThis.__test.resets++}');
const bundle = await build({
  stdin: { contents: source.replace("const appPath = '/app.js';", `const appPath = ${JSON.stringify(appStub)};`), resolveDir: process.cwd(), loader: 'js' },
  bundle: true, format: 'esm', platform: 'browser', write: false,
  plugins: [{ name: 'test-sdk', setup(builder) {
    builder.onResolve({ filter: /^@supabase\/supabase-js$/ }, () => ({ path: 'sdk', namespace: 'test' }));
    builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: 'export const createClient = (...args) => globalThis.__test.createClient(...args);', loader: 'js' }));
  } }]
});
const moduleURL = 'data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64');
const originals = Object.fromEntries(['window', 'document', 'FormData', 'CustomEvent', 'fetch', 'setTimeout'].map(key => [key, globalThis[key]]));
const currentSession = { access_token: 'test-session-token', user: { id: 'confirmed-user', email: 'private@example.com' } };
let dom;
let timers = [];
let scenario = 0;

afterEach(() => {
  timers.forEach(clearTimeout);
  timers = [];
  dom?.window.close();
  for (const [key, value] of Object.entries(originals)) {
    if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
  }
  delete globalThis.__test;
});

const $ = selector => document.querySelector(selector);
async function until(check) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (check()) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.fail(`UI did not settle: ${$('#authStatus')?.textContent}`);
}

async function launch(options = {}) {
  dom = new JSDOM(html, { url: 'https://parlament-glosowania.vercel.app/' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.FormData = dom.window.FormData;
  globalThis.CustomEvent = dom.window.CustomEvent;
  globalThis.setTimeout = (fn, ms, ...args) => {
    const timer = originals.setTimeout(fn, ms, ...args);
    timers.push(timer);
    return timer;
  };
  const fixture = {
    session: options.session || null, account: options.account || null, starts: 0, resets: 0,
    requests: [], emails: [], oauth: [], signouts: 0,
    createClient(url, key) {
      assert.equal(url, 'https://auth.example.test');
      assert.equal(key, 'sb_publishable_test');
      return { auth: {
        getSession: async () => ({ data: { session: fixture.session }, error: null }),
        onAuthStateChange: callback => { fixture.callback = callback; },
        signOut: async () => { fixture.signouts++; fixture.session = null; fixture.callback('SIGNED_OUT', null); return { error: null }; },
        signInWithOtp: async args => { fixture.emails.push(args); return { error: null }; },
        signInWithOAuth: async args => { fixture.oauth.push(args); return { error: null }; }
      } };
    },
    emit(event, session) { fixture.session = session; fixture.callback(event, session); }
  };
  globalThis.__test = fixture;
  globalThis.fetch = async (input, init = {}) => {
    const path = new URL(input, window.location.origin).pathname;
    fixture.requests.push({ path, init });
    if (path === '/api/auth-config') {
      if (options.unconfigured) return Response.json({ ok: false, error: 'Not configured' }, { status: 503 });
      return Response.json({ ok: true, url: 'https://auth.example.test', publishableKey: 'sb_publishable_test', email: true, providers: options.providers || [] });
    }
    if (path === '/api/account') {
      if (options.invalidSession) return Response.json({ ok: false, error: 'Expired' }, { status: 401 });
      assert.equal(init.headers.get('Authorization'), `Bearer ${currentSession.access_token}`);
      if (init.method === 'POST') fixture.account = { account_type: JSON.parse(init.body).accountType };
      return Response.json({ ok: true, user: currentSession.user, account: fixture.account, access: fixture.account?.account_type === 'private' });
    }
    if (fixture.protectedResponse) return fixture.protectedResponse();
    throw new Error(`Unexpected request: ${path}`);
  };
  fixture.module = await import(`${moduleURL}#scenario-${scenario++}`);
  return fixture;
}

test('signed-out landing offers free registration and does not fetch parliamentary data', async () => {
  const fixture = await launch();
  await until(() => !$('#emailLoginBtn').disabled);
  assert.equal($('#appMain').hidden, true);
  assert.equal($('#welcome').hidden, false);
  assert.equal($('#socialProviders').hidden, true);
  assert.match($('#welcome').textContent, /Bezpłatnie dla osób prywatnych/);
  assert.deepEqual(fixture.requests.map(r => r.path), ['/api/auth-config']);
});

test('missing project configuration keeps the site locked', async () => {
  await launch({ unconfigured: true });
  await until(() => !$('#authRetry').hidden);
  assert.equal($('#appMain').hidden, true);
  assert.equal($('#emailLoginBtn').disabled, true);
});

test('email form requests a real magic link with the site callback', async () => {
  const fixture = await launch();
  await until(() => !$('#emailLoginBtn').disabled);
  $('#loginEmail').value = 'reader@example.com';
  $('#emailLoginForm').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await until(() => $('#authStatus').textContent.includes('Sprawdź skrzynkę'));
  assert.deepEqual(fixture.emails, [{ email: 'reader@example.com', options: { emailRedirectTo: 'https://parlament-glosowania.vercel.app/', shouldCreateUser: true } }]);
  assert.equal($('#appMain').hidden, true);
  assert.equal($('#emailLoginBtn').disabled, true);
});

test('only enabled social providers are rendered and use SDK OAuth', async () => {
  const fixture = await launch({ providers: [{ id: 'google', label: 'Google' }] });
  await until(() => !$('#socialProviders').hidden);
  const buttons = [...$('#socialProviders').querySelectorAll('button')];
  assert.deepEqual(buttons.map(b => b.textContent), ['Google']);
  buttons[0].click();
  await until(() => fixture.oauth.length === 1);
  assert.deepEqual(fixture.oauth[0], { provider: 'google', options: { redirectTo: 'https://parlament-glosowania.vercel.app/' } });
});

test('confirmed new user chooses private account before the app opens', async () => {
  const fixture = await launch({ session: currentSession });
  await until(() => !$('#accountSetupForm').hidden);
  assert.equal($('#appMain').hidden, true);
  $('#accountSetupForm').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await until(() => !$('#appMain').hidden);
  assert.equal(fixture.starts, 1);
  assert.equal($('#welcome').hidden, true);
  assert.equal($('#accountLabel').textContent, currentSession.user.email);
});

test('company without paid access sees the pending plan screen', async () => {
  const fixture = await launch({ session: currentSession, account: { account_type: 'company' } });
  await until(() => !$('#companyPending').hidden);
  assert.equal($('#appMain').hidden, true);
  assert.equal(fixture.starts, 0);
});

test('a cached session rejected by the server cannot open the app', async () => {
  const fixture = await launch({ session: currentSession, invalidSession: true });
  await until(() => fixture.signouts === 1 && !$('#loginContent').hidden);
  assert.equal(fixture.starts, 0);
  assert.equal($('#appMain').hidden, true);
});

test('logout clears content and ignores an older queued sign-in event', async () => {
  const fixture = await launch({ session: currentSession, account: { account_type: 'private' } });
  await until(() => !$('#appMain').hidden);
  $('#results').textContent = 'Previously loaded voting records';
  fixture.emit('SIGNED_IN', currentSession);
  $('#signOutBtn').click();
  await until(() => !$('#loginContent').hidden && $('#authStatus').textContent === 'Wylogowano.');
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal($('#results').textContent, '');
  assert.equal($('#appMain').hidden, true);
  assert.equal($('#accountNav').hidden, true);
  assert.equal(fixture.starts, 1);
});

test('a response finishing after logout is discarded', async () => {
  const fixture = await launch({ session: currentSession, account: { account_type: 'private' } });
  await until(() => !$('#appMain').hidden);
  let finishBody;
  fixture.protectedResponse = () => ({ ok: true, json: () => new Promise(resolve => { finishBody = resolve; }) });
  const result = fixture.module.authenticatedJSON('/api/sejm?action=latest');
  const rejected = assert.rejects(result, error => error.name === 'AbortError');
  await until(() => Boolean(finishBody));
  $('#signOutBtn').click();
  finishBody({ ok: true, votes: ['must not render'] });
  await rejected;
  assert.equal($('#appMain').hidden, true);
});
