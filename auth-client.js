import { translateText, t, getLanguage } from './i18n.js';
import { createClient } from '@supabase/supabase-js';

const $ = selector => document.querySelector(selector);
let client;
let config;
let app;
let userId = null;
let access = false;
let epoch = 0;
let checkNumber = 0;
let authEventNumber = 0;
let emailCooldown;
let statusOriginal = '';
export function hasAccountAccess(){return access;}
function authEvent(){document.dispatchEvent(new CustomEvent('parlament:auth',{detail:{signedIn:Boolean(userId),access}}));}
const pending = new Set();
const redirectTo = `${window.location.origin}/`;

function message(text = '', error = false) {
  statusOriginal = text;
  $('#authStatus').removeAttribute('data-i18n');
  $('#authStatus').textContent = translateText(text);
  $('#authStatus').classList.toggle('error', error);
}

function panel(name) {
  $('#loginContent').hidden = name !== 'login';
  $('#accountSetupForm').hidden = name !== 'setup';
  $('#companyPending').hidden = name !== 'company';
  $('#authRetry').hidden = true;
  if (['setup','company'].includes(name)) $('#loginPanel').showModal?.();
}

function lock() {
  access = false;
  epoch++;
  for (const controller of pending) controller.abort();
  pending.clear();
  $('#appMain').hidden = true;
  if ($('#deficitMain')) $('#deficitMain').hidden = true;
  $('#welcome').hidden = false;
  if ($('#modal').open) $('#modal').close();
  $('#modalContent').replaceChildren();
  $('#results').replaceChildren();
  app?.resetApp();
  authEvent();
}

function signedOut() {
  authEventNumber++;
  checkNumber++;
  userId = null;
  lock();
  panel('login');
  $('#accountNav').hidden = true;
  $('#accountLabel').textContent = '';
  $('#loginEmail').value = '';
  clearTimeout(emailCooldown);
  emailCooldown = undefined;
  setLoginBusy(false);
}

function cancelled() {
  return new DOMException('Sesja została zmieniona.', 'AbortError');
}

async function request(path, token, options = {}) {
  const url = new URL(path, window.location.origin);
  if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/')) {
    throw new Error('Nieprawidłowy adres danych.');
  }
  const controller = new AbortController();
  pending.add(controller);
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const headers = new Headers(options.headers);
    headers.set('Authorization', `Bearer ${token}`);
    const response = await fetch(url, { ...options, headers, cache: 'no-store', signal: controller.signal });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
      const error = new Error(data.error || `Nie udało się pobrać danych (HTTP ${response.status}).`);
      error.status = response.status;
      error.code = data.code;
      throw error;
    }
    return data;
  } catch (error) {
    if (controller.signal.aborted && pending.has(controller)) throw new Error('Odpowiedź serwera trwa zbyt długo. Spróbuj ponownie.');
    throw error;
  } finally {
    clearTimeout(timeout);
    pending.delete(controller);
  }
}

export async function authenticatedJSON(path, options) {
  const started = epoch;
  if (!client || !access) throw cancelled();
  try {
    const { data, error } = await client.auth.getSession();
    if (error || !data.session) throw Object.assign(new Error('Zaloguj się ponownie.'), { status: 401 });
    if (started !== epoch || !access) throw cancelled();
    const result = await request(path, data.session.access_token, options);
    // A response from an earlier session must never refill the interface.
    if (started !== epoch || !access) throw cancelled();
    return result;
  } catch (error) {
    if (started !== epoch) throw cancelled();
    if (error.status === 401) {
      await signOut('Sesja wygasła. Zaloguj się ponownie.');
      throw cancelled();
    }
    if (error.status === 402 || error.status === 403) {
      lock();
      await refreshSession();
      throw cancelled();
    }
    throw error;
  }
}

async function showAccount(data, currentCheck) {
  if (currentCheck !== checkNumber) return;
  $('#accountNav').hidden = false;
  $('#accountLabel').textContent = data.user.email;
  if (!data.account) {
    panel('setup');
    message();
    return;
  }
  if (!data.access) {
    panel('company');
    message();
    return;
  }
  // app.js loads only after the server has verified both identity and access.
  const appPath = '/app.js';
  app = app || await import(appPath);
  if (currentCheck !== checkNumber) return;
  access = true;
  $('#loginPanel').close?.();
  $('#welcome').hidden = true;
  $('#appMain').hidden = false;
  message();
  await app.startApp();
  if(currentCheck === checkNumber) authEvent();
}

async function handleSession(session, force = false) {
  if (!session) { signedOut(); return; }
  if (!force && access && userId === session.user.id) return;
  const currentCheck = ++checkNumber;
  userId = session.user.id;
  lock();
  panel(null);
  $('#accountNav').hidden = false;
  $('#accountLabel').textContent = '';
  message('Sprawdzam konto…');
  try {
    const data = await request('/api/account', session.access_token);
    await showAccount(data, currentCheck);
  } catch (error) {
    if (currentCheck !== checkNumber || error.name === 'AbortError') return;
    if (error.status === 401) return signOut('Link lub sesja wygasły. Zaloguj się ponownie.');
    message(error.message, true);
    $('#authRetry').hidden = false;
  }
}

async function refreshSession() {
  try {
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    await handleSession(data.session, true);
  } catch {
    lock();
    message('Nie udało się odczytać sesji. Odśwież stronę lub spróbuj ponownie.', true);
    $('#authRetry').hidden = false;
  }
}

async function signOut(text = 'Wylogowano.') {
  authEventNumber++;
  checkNumber++;
  lock();
  panel(null);
  message('Wylogowuję…');
  $('#signOutBtn').disabled = true;
  try {
    const { error } = await client.auth.signOut({ scope: 'local' });
    if (error) throw error;
    signedOut();
    message(text);
  } catch {
    message('Nie udało się zakończyć sesji. Sprawdź połączenie i kliknij „Wyloguj” ponownie.', true);
  } finally { $('#signOutBtn').disabled = false; }
}

function setLoginBusy(busy) {
  $('#emailLoginBtn').disabled = busy || !config?.email || Boolean(emailCooldown);
  $('#loginEmail').disabled = busy;
  $('#socialProviders').querySelectorAll('button').forEach(button => { button.disabled = busy; });
}

async function socialLogin(provider) {
  setLoginBusy(true);
  message('Przekierowuję do logowania…');
  try {
    const options = { redirectTo };
    if (provider === 'azure') options.scopes = 'email';
    const { error } = await client.auth.signInWithOAuth({ provider, options });
    if (error) throw error;
  } catch {
    message('Nie udało się rozpocząć logowania. Spróbuj ponownie lub użyj adresu e-mail.', true);
    setLoginBusy(false);
  }
}

function renderProviders() {
  const container = $('#socialProviders');
  container.replaceChildren();
  for (const provider of config.providers) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'provider-button';
    button.textContent = provider.label;
    button.setAttribute('aria-label', t('auth.provider',{provider:provider.label}));
    button.addEventListener('click', () => socialLogin(provider.id));
    container.append(button);
  }
  container.hidden = config.providers.length === 0;
  $('#emailSeparator').hidden = !config.email || !config.providers.length;
  $('#emailLoginForm').hidden = !config.email;
  setLoginBusy(false);
}

async function boot() {
  $('#authRetry').hidden = true;
  message('Sprawdzam dostępność logowania…');
  try {
    const response = await fetch('/api/auth-config', { cache: 'no-store', signal: AbortSignal.timeout(20000) });
    config = await response.json();
    if (!response.ok || !config.ok) throw new Error(config.error || 'Logowanie jest w przygotowaniu.');
    client = createClient(config.url, config.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    renderProviders();
    const callbackError = new URLSearchParams(window.location.hash.slice(1)).get('error')
      || new URL(window.location.href).searchParams.get('error');
    client.auth.onAuthStateChange((event, session) => {
      const eventNumber = ++authEventNumber;
      if (event === 'SIGNED_OUT') signedOut();
      // Supabase callbacks run inside its auth lock: do not await SDK calls here.
      else if (event !== 'INITIAL_SESSION') setTimeout(() => {
        if (eventNumber === authEventNumber) void handleSession(session);
      }, 0);
    });
    await refreshSession();
    if (callbackError && !access) {
      window.history.replaceState({}, '', '/');
      message('Logowanie nie zostało zakończone albo link wygasł. Spróbuj ponownie.', true);
    } else if (!config.email && !config.providers.length) {
      message('Logowanie jest w przygotowaniu. Spróbuj później.');
    } else if (!userId) message();
  } catch {
    signedOut();
    message('Logowanie jest jeszcze w przygotowaniu lub chwilowo niedostępne. Spróbuj ponownie później.', true);
    $('#emailLoginBtn').disabled = true;
    $('#authRetry').hidden = false;
  }
}

$('#emailLoginForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (!client || !config.email || emailCooldown || !event.currentTarget.reportValidity()) return;
  const email = $('#loginEmail').value.trim();
  setLoginBusy(true);
  message('Wysyłam link…');
  try {
    const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo, shouldCreateUser: true } });
    if (error) throw error;
    message(t('auth.sent',{email}));
    emailCooldown = setTimeout(() => { emailCooldown = undefined; setLoginBusy(false); }, 60000);
  } catch {
    message('Nie udało się wysłać linku. Sprawdź adres i spróbuj ponownie za minutę. Jeśli problem wraca, dostawca poczty może nie być jeszcze skonfigurowany.', true);
  } finally { setLoginBusy(false); }
});

$('#accountSetupForm').addEventListener('submit', async event => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button');
  const accountType = new FormData(event.currentTarget).get('accountType');
  const currentCheck = ++checkNumber;
  button.disabled = true;
  message('Zapisuję konto…');
  try {
    const { data, error } = await client.auth.getSession();
    if (currentCheck !== checkNumber) return;
    if (error || !data.session) return signOut('Zaloguj się ponownie, aby dokończyć tworzenie konta.');
    const account = await request('/api/account', data.session.access_token, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountType })
    });
    await showAccount(account, currentCheck);
  } catch (error) {
    if (currentCheck === checkNumber && error.name !== 'AbortError') message(error.message, true);
  } finally { button.disabled = false; }
});

$('#signOutBtn').addEventListener('click', () => { void signOut(); });
$('#authRetry').addEventListener('click', () => { void (client ? refreshSession() : boot()); });
document.addEventListener('parlament:language',()=>{ $('#authStatus').textContent=translateText(statusOriginal); if(config)renderProviders(); });
void boot();
