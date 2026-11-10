/*
 * Shared admin sign-in for every /admin/* page (plain script, no bundler).
 *
 *   AdminAuth.require({ onReady(user) { ... } })
 *     Probes GET /api/admin/session. 200 -> onReady({username}); 401 -> shared
 *     login overlay; any other failure -> "service unavailable" + Retry (never
 *     a login form that silently fails). onReady runs every time the page goes
 *     from signed-out to signed-in (first load, sign-in here, sign-in in
 *     another tab), so it must be safe to call more than once.
 *   AdminAuth.requireLogin()  call when a feature API returns 401
 *   AdminAuth.logout()        POST /api/admin/logout, then tell other tabs
 *   AdminAuth.user()          {username} or null
 *
 * Cross-tab sync: BroadcastChannel('cyndi-admin-auth'), falling back to the
 * localStorage 'storage' event. A 'login' / 'logout' message makes every other
 * open admin tab re-probe the session. Tabs also re-probe when they become
 * visible again, which catches an expired (8 h) session.
 *
 * The session cookie (logistics_admin, HttpOnly) is never read here; the
 * server is the only source of truth. User data is rendered via textContent.
 */
(function () {
  'use strict';

  var SESSION_URL = '/api/admin/session';
  var LOGIN_URL = '/api/admin/login';
  var LOGOUT_URL = '/api/admin/logout';
  var CHANNEL = 'cyndi-admin-auth';

  var opts = { onReady: function () {} };
  var state = 'init';        // init | probing | authed | anon | error
  var current = null;        // { username }
  var probeSeq = 0;
  var ui = null;             // overlay elements
  var bc = null;

  // ---------- styles ----------
  var CSS = ''
    + '.aa-overlay{position:fixed;inset:0;z-index:1000;background:#eef6fb;display:flex;align-items:center;justify-content:center;padding:16px;font-family:Arial,sans-serif;color:#1a2a3a}'
    + '.aa-overlay[hidden]{display:none}'
    + '.aa-card{width:100%;max-width:420px;background:#fff;border-radius:12px;padding:24px;box-shadow:0 8px 24px #0f1f3a12}'
    + '.aa-brand{font-size:11px;letter-spacing:1.5px;font-weight:700;color:#1e5a8a;margin:0 0 10px}'
    + '.aa-card h1{margin:0 0 6px;font-size:22px;color:#0f1f3a}'
    + '.aa-sub{color:#71849a;font-size:13px;margin:0 0 16px;line-height:1.5}'
    + '.aa-field{margin-bottom:12px}.aa-field label{display:block;font-size:12px;color:#71849a;margin-bottom:4px}'
    + '.aa-field input{width:100%;box-sizing:border-box;padding:10px;border:1px solid #dce8f0;border-radius:8px;font-size:14px}'
    + '.aa-card button{border:0;border-radius:8px;padding:9px 14px;background:#0f1f3a;color:#fff;font-weight:700;cursor:pointer;font-size:13px}'
    + '.aa-card button:disabled{opacity:.55;cursor:wait}'
    + '.aa-card button:focus-visible,.aa-field input:focus-visible,.aa-logout:focus-visible{outline:2px solid #e07a3a;outline-offset:2px}'
    + '.aa-msg{margin-top:12px;padding:10px;border-radius:8px;font-size:13px;background:#fff1eb;color:#9a3d22}'
    + '.aa-msg[hidden]{display:none}'
    + '.aa-who{display:inline-flex;gap:12px;align-items:center;font-size:14px;color:#cfe0ee}'
    + '.aa-who[hidden]{display:none}'
    + '.aa-user{color:#fff;font-weight:700}'
    + '.aa-logout{color:#cfe0ee;text-decoration:none;font-size:14px;background:none;border:0;padding:0;cursor:pointer;font-family:inherit}'
    + '.aa-logout:hover{color:#fff}';

  function el(tag, props, kids) {
    var n = document.createElement(tag);
    if (props) Object.keys(props).forEach(function (k) {
      if (k === 'text') n.textContent = props[k];
      else if (k === 'class') n.className = props[k];
      else n.setAttribute(k, props[k]);
    });
    (kids || []).forEach(function (c) { n.appendChild(c); });
    return n;
  }

  function buildUi() {
    if (ui) return ui;
    var style = el('style', { text: CSS });
    document.head.appendChild(style);

    var msg = el('div', { class: 'aa-msg', role: 'alert', hidden: '' });

    // Login form
    var user = el('input', { id: 'aa-username', type: 'text', autocomplete: 'username', required: '' });
    var pass = el('input', { id: 'aa-password', type: 'password', autocomplete: 'current-password', required: '' });
    var submit = el('button', { type: 'submit', text: 'Sign in' });
    var form = el('form', { novalidate: '' }, [
      el('div', { class: 'aa-field' }, [el('label', { for: 'aa-username', text: 'Admin username' }), user]),
      el('div', { class: 'aa-field' }, [el('label', { for: 'aa-password', text: 'Admin password' }), pass]),
      submit
    ]);

    // Error / retry
    var retry = el('button', { type: 'button', text: 'Retry' });
    var errBox = el('div', { hidden: '' }, [retry]);

    var title = el('h1', { id: 'aa-title', text: 'Admin login' });
    var sub = el('p', { class: 'aa-sub', text: 'Sign in once to use every admin page and tab.' });
    var card = el('div', { class: 'aa-card' }, [
      el('p', { class: 'aa-brand', text: 'CYNDI GLOBAL — ADMIN' }), title, sub, form, errBox, msg
    ]);
    var overlay = el('div', { class: 'aa-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'aa-title', hidden: '' }, [card]);
    document.body.appendChild(overlay);

    // Signed-in user + Log out, placed in the page header nav
    var who = el('span', { class: 'aa-who', hidden: '' });
    var whoName = el('span', { class: 'aa-user' });
    var logoutBtn = el('button', { type: 'button', class: 'aa-logout', text: 'Log out' });
    who.appendChild(whoName);
    who.appendChild(logoutBtn);
    var slot = document.querySelector('[data-admin-auth-slot]')
      || (document.querySelector('header') && document.querySelector('header').lastElementChild);
    if (slot) slot.appendChild(who);

    form.addEventListener('submit', function (e) { e.preventDefault(); doLogin(); });
    retry.addEventListener('click', function () { probe(); });
    logoutBtn.addEventListener('click', function () { logout(); });

    ui = { overlay: overlay, title: title, sub: sub, form: form, user: user, pass: pass, submit: submit,
      errBox: errBox, retry: retry, msg: msg, who: who, whoName: whoName };
    return ui;
  }

  function setMsg(text) {
    if (text) { ui.msg.textContent = text; ui.msg.hidden = false; }
    else { ui.msg.textContent = ''; ui.msg.hidden = true; }
  }

  // Keep keyboard / screen-reader focus inside the overlay while it is open.
  function setInert(on) {
    Array.prototype.forEach.call(document.body.children, function (c) {
      if (c === ui.overlay || c.tagName === 'SCRIPT' || c.tagName === 'STYLE') return;
      if (on) { c.setAttribute('inert', ''); c.setAttribute('aria-hidden', 'true'); }
      else { c.removeAttribute('inert'); c.removeAttribute('aria-hidden'); }
    });
  }

  function openOverlay() {
    var wasHidden = ui.overlay.hidden;
    ui.overlay.hidden = false;
    setInert(true);
    return wasHidden;
  }

  function closeOverlay() {
    ui.overlay.hidden = true;
    setInert(false);
    setMsg('');
    ui.pass.value = '';
  }

  function showLogin(message) {
    var fromError = ui.form.hidden;
    ui.who.hidden = true;
    ui.title.textContent = 'Admin login';
    ui.sub.textContent = 'Sign in once to use every admin page and tab.';
    ui.form.hidden = false;
    ui.errBox.hidden = true;
    var opened = openOverlay();
    if (opened || fromError || message) setMsg(message || '');
    // Do not wipe what the user is typing on a background re-probe.
    if (opened || fromError) (ui.user.value ? ui.pass : ui.user).focus();
  }

  function showError(message) {
    ui.title.textContent = 'Admin service unavailable';
    ui.sub.textContent = 'Could not check your sign-in status. Your session may still be valid.';
    ui.form.hidden = true;
    ui.errBox.hidden = false;
    openOverlay();
    setMsg(message);
    ui.retry.focus();
  }

  function becomeAuthed(user) {
    var was = state;
    state = 'authed';
    current = { username: user.username };
    ui.whoName.textContent = current.username;
    ui.who.hidden = false;
    if (!ui.overlay.hidden) closeOverlay();
    if (was !== 'authed') {
      try { opts.onReady(current); } catch (e) { if (window.console) console.error(e); }
    }
  }

  function becomeAnon(message) {
    state = 'anon';
    current = null;
    showLogin(message);
  }

  function describe(status) { return 'The admin service returned HTTP ' + status + '. Please retry.'; }

  // ---------- server calls ----------
  // Resolves to { kind: 'authed', user } | { kind: 'anon' } | { kind: 'error', message }
  function checkSession() {
    return fetch(SESSION_URL, { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } })
      .then(function (r) {
        if (r.status === 401) return { kind: 'anon' };
        if (!r.ok) return { kind: 'error', message: describe(r.status) };
        return r.json().then(function (b) {
          if (b && b.authenticated === true && typeof b.username === 'string') return { kind: 'authed', user: { username: b.username } };
          return { kind: 'error', message: 'Unexpected response from the admin service. Please retry.' };
        }, function () { return { kind: 'error', message: 'Unexpected response from the admin service. Please retry.' }; });
      }, function () {
        return { kind: 'error', message: 'Network error — could not reach the admin service. Check your connection and retry.' };
      });
  }

  function probe() {
    var seq = ++probeSeq;
    var prev = state;
    if (prev !== 'authed' && prev !== 'anon') state = 'probing';
    return checkSession().then(function (res) {
      if (seq !== probeSeq) return res;   // a newer probe superseded this one
      if (res.kind === 'authed') becomeAuthed(res.user);
      else if (res.kind === 'anon') becomeAnon();
      else if (prev === 'authed' || prev === 'anon') {
        // Transient failure on a background re-check: keep the current screen
        // (page content or the login form, which reports its own errors).
        state = prev;
      } else { state = 'error'; showError(res.message); }
      return res;
    });
  }

  function doLogin() {
    var username = ui.user.value.trim();
    var password = ui.pass.value;
    if (!username || !password) { setMsg('Enter your admin username and password.'); return; }
    ui.submit.disabled = true;
    setMsg('');
    fetch(LOGIN_URL, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username, password: password })
    }).then(function (r) {
      if (r.status === 401) { setMsg('Invalid username or password.'); ui.pass.value = ''; ui.pass.focus(); return; }
      if (!r.ok) { setMsg(describe(r.status)); return; }
      return checkSession().then(function (res) {
        if (res.kind === 'authed') { becomeAuthed(res.user); broadcast('login'); }
        else if (res.kind === 'anon') {
          // Login succeeded but the cookie did not stick (e.g. Secure cookie over plain http).
          setMsg('Signed in, but the browser did not keep the session cookie. Use HTTPS (or Chrome on localhost) and try again.');
        } else setMsg(res.message);
      });
    }, function () {
      setMsg('Network error — could not reach the admin service. Please retry.');
    }).then(function () { ui.submit.disabled = false; });
  }

  function logout() {
    return fetch(LOGOUT_URL, { method: 'POST', credentials: 'same-origin' })
      .then(function (r) { if (r.ok) broadcast('logout'); }, function () {})
      .then(function () { return probe(); });   // the server decides what we show
  }

  // ---------- cross-tab sync ----------
  var STORAGE_KEY = CHANNEL;
  function broadcast(type) {
    var msg = { type: type, t: Date.now() };
    if (bc) { try { bc.postMessage(msg); } catch (e) {} return; }
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(msg)); } catch (e) {}
  }

  function onRemote(data) {
    if (!data || (data.type !== 'login' && data.type !== 'logout')) return;
    probe();
  }

  function listen() {
    if (typeof window.BroadcastChannel === 'function') {
      try {
        bc = new window.BroadcastChannel(CHANNEL);
        bc.onmessage = function (e) { onRemote(e.data); };
      } catch (e) { bc = null; }
    }
    if (!bc) {
      window.addEventListener('storage', function (e) {
        if (e.key !== STORAGE_KEY || !e.newValue) return;
        try { onRemote(JSON.parse(e.newValue)); } catch (err) {}
      });
    }
    // Re-check when the tab is shown again (missed messages, 8 h expiry).
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && state !== 'probing' && state !== 'init') probe();
    });
  }

  // ---------- public API ----------
  var started = false;
  function requireAuth(options) {
    if (options && typeof options.onReady === 'function') opts.onReady = options.onReady;
    if (started) return;
    started = true;
    var go = function () { buildUi(); listen(); probe(); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go);
    else go();
  }

  // Feature code calls this when one of its own API requests returns 401.
  function requireLogin() {
    if (!ui) return;
    if (state === 'anon') { showLogin(); return; }
    probe();
  }

  window.AdminAuth = {
    require: requireAuth,
    requireLogin: requireLogin,
    logout: logout,
    user: function () { return current ? { username: current.username } : null; }
  };
})();
