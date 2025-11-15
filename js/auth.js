// Proxy-based passwordless auth (phone + code) via backend/auth-proxy
const Auth = (() => {
  const LS_KEY = 'watchman_auth';
  const API_BASE = localStorage.getItem('auth_api_base') || 'https://oy4qoewlgir6gkd5jew452kaay0ffoed.lambda-url.us-east-1.on.aws'; //'http://localhost:4000';

  function save(session) {
    localStorage.setItem(LS_KEY, JSON.stringify(session));
  }
  function load() {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }
  function clear() {
    localStorage.removeItem(LS_KEY);
  }

  async function initiate(phone) {
    const resp = await fetch(`${API_BASE}/auth/initiate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone })
    });
    if (!resp.ok) throw new Error('Initiate failed');
    const data = await resp.json();
    const current = load() || {};
    save({ ...current, phone, session: data.session });
    return data;
  }

  async function respond(code) {
    const current = load();
    if (!current || !current.session || !current.phone) throw new Error('No pending session');
    const resp = await fetch(`${API_BASE}/auth/respond`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: current.phone, session: current.session, code })
    });
    if (!resp.ok) throw new Error('Respond failed');
    const data = await resp.json();
    const next = {
      phone: current.phone,
      idToken: data.idToken,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      session: null,
      issuedAt: Date.now(),
    };
    save(next);
    return next;
  }

  function getIdentity() {
    const s = load();
    if (!s || !s.idToken) return null;
    return { phone: s.phone, idToken: s.idToken, accessToken: s.accessToken };
  }

  return { initiate, respond, clear, load, getIdentity, save };
})();

// Wire up UI
window.addEventListener('DOMContentLoaded', () => {
  const phoneInput = document.getElementById('authPhone');
  const loginBtn = document.getElementById('authLoginBtn');
  const codeRow = document.getElementById('authCodeRow');
  const codeInput = document.getElementById('authCode');
  const confirmBtn = document.getElementById('authConfirmBtn');
  const statusEl = document.getElementById('authStatus');
  const userEl = document.getElementById('authUser');
  const logoutBtn = document.getElementById('authLogout');

  function setLoggedIn(phone) {
    document.getElementById('authControls').classList.add('hidden');
    document.getElementById('authLogged').classList.remove('hidden');
    userEl.textContent = phone;
    statusEl.textContent = '';
  }
  function setLoggedOut() {
    document.getElementById('authControls').classList.remove('hidden');
    document.getElementById('authLogged').classList.add('hidden');
    statusEl.textContent = '';
    phoneInput.value = '';
  }

  const ident = Auth.getIdentity();
  if (ident) setLoggedIn(ident.phone);

  loginBtn?.addEventListener('click', async () => {
    const phone = phoneInput.value.trim();
    if (!phone) { statusEl.textContent = 'Enter phone in E.164 format, e.g. +5511...'; return; }
    statusEl.textContent = 'Sending code...';
    try {
      await Auth.initiate(phone);
      statusEl.textContent = 'Code sent. Check your SMS.';
      codeRow.classList.remove('hidden');
      codeInput.focus();
    } catch (e) {
      statusEl.textContent = 'Failed to send code.';
      console.error(e);
    }
  });

  confirmBtn?.addEventListener('click', async () => {
    const code = codeInput.value.trim();
    if (!code) { statusEl.textContent = 'Enter the code.'; return; }
    statusEl.textContent = 'Verifying...';
    try {
      const s = await Auth.respond(code);
      statusEl.textContent = 'Logged in';
      setLoggedIn(s.phone);
      // notify listeners (e.g., sync layer)
      window.dispatchEvent(new CustomEvent('auth:login', { detail: s }));
    } catch (e) {
      statusEl.textContent = 'Invalid code';
      console.error(e);
    }
  });

  logoutBtn?.addEventListener('click', () => {
    Auth.clear();
    setLoggedOut();
    window.dispatchEvent(new Event('auth:logout'));
  });
});
