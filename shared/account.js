/* dorrance.me accounts, for any page on the site. The Worker side is worker/auth.js; docs/accounts.md tells how to use
   the accounts in an app. One sign-in works on every page: the pages share localStorage on dorrance.me, and the
   sign-in is kept under "dorrance-session" as { token, name, admin }, as the theme is kept under "theme".
   A page that does not load this file is not affected by it.
   Browser: window.Account. Node: require('../shared/account.js'). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Account = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const KEY = 'dorrance-session', API = '/api/auth/';

  /* ---- errors ---- */
  // The words for each error code. The Worker answers with { error: CODE }.
  const PROBLEMS = {
    network: 'No connection.',
    signin: 'You are signed out. Sign in again.',
    wrong: 'That name and password do not match.',
    waiting: 'Your account is waiting for approval.',
    tries: 'Too many tries. Wait 15 minutes, then try again.',
    taken: 'That name is taken. Pick another one.',
    name: 'Use 2 to 24 letters or numbers for your name.',
    password: 'Use 8 characters or more for your password.',
    full: 'Too many accounts are waiting for approval. Try again later.',
    admin: 'Only the admin can do that.',
    nobody: 'That account is gone already.',
    setup: 'Sign-in is not set up yet. The admin needs to finish the setup.'
  };
  // An Error with a plain message. `code` is one of the words above, or a status number.
  function fail(code) {
    const e = new Error(PROBLEMS[code] || `The server answered with error ${code}.`);
    e.code = code;
    return e;
  }
  async function failFrom(res) {
    let code = res.status;
    try { const b = await res.json(); if (b && PROBLEMS[b.error]) code = b.error; } catch (e) {}
    return fail(code);
  }

  /* ---- the sign-in on this phone ---- */
  function session() {
    try { const s = JSON.parse(localStorage.getItem(KEY)); return s && s.token ? s : null; } catch (e) { return null; }
  }
  // Keeps a sign-in from login(), or forgets it with null.
  function keep(s) {
    try {
      if (s) localStorage.setItem(KEY, JSON.stringify({ token: s.token, name: s.name, admin: !!s.admin }));
      else localStorage.removeItem(KEY);
    } catch (e) {}
  }
  // Headers for an app's own call to the Worker, as the person signed in here.
  function headers() {
    const s = session();
    return s ? { Authorization: 'Bearer ' + s.token } : {};
  }

  /* ---- the Worker ---- */
  // `token` is a sign-in from login(); it goes only in the Authorization header. `fetchFn` is for tests.
  function api(token, fetchFn) {
    const f = fetchFn || ((url, opts) => fetch(url, opts));
    async function send(path, method = 'GET', body) {
      const h = {};
      if (token) h.Authorization = 'Bearer ' + token;
      if (body) h['Content-Type'] = 'application/json';
      let res;
      try { res = await f(API + path, { method, headers: h, cache: 'no-store', body: body ? JSON.stringify(body) : undefined }); }
      catch (e) { throw fail('network'); }
      if (!res.ok) throw await failFrom(res);
      return res.json();
    }
    const at = key => 'users/' + encodeURIComponent(key);
    return {
      signup: (name, password) => send('signup', 'POST', { name, password }),
      login: (name, password) => send('login', 'POST', { name, password }),
      me: () => send('me'),
      logout: () => send('logout', 'POST'),
      users: async () => (await send('users')).users,
      approve: key => send(at(key) + '/approve', 'POST'),
      remove: key => send(at(key), 'DELETE')
    };
  }
  // The Worker as the person signed in on this phone.
  const mine = () => api(session() && session().token);

  // Signs in and keeps the sign-in on this phone. Returns { token, name, admin }.
  async function signIn(name, password) {
    const s = await api().login(name, password);
    keep(s);
    return s;
  }
  // Forgets the sign-in here at once, and ends it on the Worker when there is a connection.
  function signOut() {
    const s = session();
    keep(null);
    if (s) api(s.token).logout().catch(() => {});
  }

  return { KEY, API, PROBLEMS, fail, failFrom, session, keep, headers, api, mine, signIn, signOut };
});
