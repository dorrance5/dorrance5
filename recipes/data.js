/* Recipes — the data file and the calls to the API Worker. Plain functions, no DOM.
   recipes/recipes.json is the only copy of the recipes. The page reads it, and saves one change at a time to GitHub
   through the Worker (worker/recipes.js), so edits that Claude makes to the file from chat are kept. The Worker
   holds the GitHub token and the accounts; the page holds only a sign-in.
   Browser: window.RecipeData. Node: require('./data.js'). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RecipeData = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const REPO = 'dorrance5/dorrance5';
  const API = '/api/recipes/';
  // Field order in the file. Fields the page does not know about go after these and are kept as they are.
  const ORDER = ['id', 'name', 'servings', 'tags', 'ingredients', 'steps', 'notes', 'source'];

  /* ---- ids ---- */
  // "Megan's zuppa toscana" -> "megans-zuppa-toscana". Accents fold to plain letters: "Crème brûlée" -> "creme-brulee".
  function slug(name) {
    const s = String(name).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
      .replace(/['’‘`]/g, '').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
    return s || 'recipe';
  }
  function uniqueId(name, recipes) {
    const base = slug(name), taken = new Set(recipes.map(r => r && r.id));
    if (!taken.has(base)) return base;
    let n = 2;
    while (taken.has(`${base}-${n}`)) n++;
    return `${base}-${n}`;
  }

  /* ---- the editor's text fields ---- */
  // List marks that come along when a list is pasted: "-", "•", "*", "1." and "1)", and the boxes some recipe sites put
  // before each ingredient. "1.5 lb" keeps its number, because a mark needs a space after it.
  const MARK = /^\s*(?:[-•*·◦▪‣–—▢☐□]\s*|\d{1,3}[.)](?:\s+|$))/;
  const cleanLine = line => line.replace(MARK, '').trim();
  const cleanPaste = text => String(text).split(/\r\n|\r|\n/).map(cleanLine).filter(Boolean).join('\n');
  const lines = text => String(text || '').split(/\r\n|\r|\n/).map(s => s.trim()).filter(Boolean);
  function tagList(text) {
    const seen = new Set();
    return String(text || '').split(',').map(s => s.trim()).filter(t => t && !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase()));
  }
  function normUrl(text) {
    const s = String(text || '').trim();
    if (!s) return '';
    return /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : 'https://' + s;
  }
  // Only http and https links are shown as links.
  function safeUrl(s) {
    try { const u = new URL(s); return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null; } catch (e) { return null; }
  }

  // The editor's fields to a recipe in file order. Empty optional fields are left out.
  // `old` is the recipe as it is in the file now; fields this page does not know about are kept.
  function fromForm(f, id, old) {
    const r = { id, name: String(f.name || '').trim() };
    const servings = String(f.servings || '').trim();
    if (servings) r.servings = servings;
    const tags = tagList(f.tags);
    if (tags.length) r.tags = tags;
    r.ingredients = lines(f.ingredients);
    const steps = lines(f.steps);
    if (steps.length) r.steps = steps;
    const notes = String(f.notes || '').replace(/\r\n?/g, '\n').trim();
    if (notes) r.notes = notes;
    const source = normUrl(f.source);
    if (source) r.source = source;
    if (old) for (const k of Object.keys(old)) if (!ORDER.includes(k)) r[k] = old[k];
    return r;
  }
  // A recipe to the editor's fields.
  function toForm(r) {
    return {
      name: r.name || '', servings: r.servings || '', tags: (r.tags || []).join(', '),
      ingredients: (r.ingredients || []).join('\n'), steps: (r.steps || []).join('\n'), notes: r.notes || '', source: r.source || ''
    };
  }

  /* ---- the file ---- */
  function parse(text) {
    const data = JSON.parse(text);
    if (!data || typeof data !== 'object' || !Array.isArray(data.recipes)) throw new Error('recipes.json has no "recipes" list');
    return data;
  }
  // 2-space indentation and a newline at the end, so that the diffs are easy to read.
  const serialize = data => JSON.stringify(data, null, 2) + '\n';

  // The recipes for the page: every one with a name and a list of ingredients, sorted by name.
  function forView(data) {
    const strs = a => Array.isArray(a) ? a.filter(x => x != null && x !== '').map(String) : [];
    return data.recipes.filter(r => r && typeof r === 'object' && r.id && r.name).map(r => ({
      ...r, id: String(r.id), name: String(r.name), tags: strs(r.tags), ingredients: strs(r.ingredients), steps: strs(r.steps),
      servings: r.servings == null ? '' : String(r.servings), notes: r.notes == null ? '' : String(r.notes), source: r.source ? String(r.source) : ''
    })).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }));
  }

  // Applies one change to the data that was just read from GitHub. Returns { data, recipe, message };
  // message is null when there is nothing to commit (the recipe to delete is gone already).
  //   { type: 'add', form } | { type: 'edit', id, form } | { type: 'delete', id }
  function apply(data, change) {
    const list = data.recipes.slice();
    const at = list.findIndex(r => r && r.id === change.id);
    if (change.type === 'add') {
      const recipe = fromForm(change.form, uniqueId(change.form.name, list));
      list.push(recipe);
      return { data: { ...data, recipes: list }, recipe, message: `Recipes: add ${recipe.name}` };
    }
    if (change.type === 'edit') {
      if (at < 0) throw fail('gone');
      const recipe = fromForm(change.form, change.id, list[at]);
      list[at] = recipe;
      return { data: { ...data, recipes: list }, recipe, message: `Recipes: edit ${recipe.name}` };
    }
    if (change.type === 'delete') {
      if (at < 0) return { data, recipe: null, message: null };
      const [gone] = list.splice(at, 1);
      return { data: { ...data, recipes: list }, recipe: gone, message: `Recipes: delete ${gone.name}` };
    }
    throw new Error('unknown change ' + change.type);
  }

  /* ---- search ---- */
  const reFor = (term, flags) => new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Escaped HTML with each match of `term` in a <mark>.
  function hl(text, term) {
    text = String(text);
    if (!term) return esc(text);
    const re = reFor(term, 'gi');
    let out = '', last = 0, m;
    while ((m = re.exec(text))) {
      out += esc(text.slice(last, m.index)) + '<mark>' + esc(m[0]) + '</mark>';
      last = m.index + m[0].length;
    }
    return out + esc(text.slice(last));
  }
  // null when the recipe does not match. Otherwise the ingredients that match, and a short piece of the step or
  // note that matches when nothing else does.
  function match(r, term) {
    const re = reFor(term, 'i');
    const ingredients = r.ingredients.filter(i => re.test(i));
    if (ingredients.length || re.test(r.name) || r.tags.some(t => re.test(t))) return { ingredients, snippet: null };
    const hit = [...r.steps, r.notes].find(s => s && re.test(s));
    if (!hit) return null;
    const at = hit.search(re), from = Math.max(0, hit.lastIndexOf(' ', Math.max(0, at - 24)) + 1);
    const end = Math.min(hit.length, at + term.length + 40);
    return { ingredients, snippet: (from > 0 ? '…' : '') + hit.slice(from, end) + (end < hit.length ? '…' : '') };
  }

  /* ---- base64 that keeps non-ASCII text (plain atob and btoa work on bytes, not on UTF-8 text) ---- */
  function toBase64(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function fromBase64(b64) {
    const bin = atob(String(b64).replace(/\s+/g, ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

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
    setup: 'Saving is not set up yet. The admin needs to finish the setup.',
    github: 'The recipe book cannot reach GitHub. The admin needs to check its GitHub token.',
    changed: 'recipes.json kept changing on GitHub during the save.',
    rate: 'GitHub’s hourly limit is used up. Try again later.',
    json: 'recipes.json on GitHub is not valid JSON. Fix it in GitHub first.',
    file: 'The change would break recipes.json, so it is not saved.',
    gone: 'This recipe is no longer in recipes.json. Someone deleted it after this page loaded.'
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

  /* ---- the API Worker ---- */
  // `token` is the sign-in that login() gave; it goes only in the Authorization header. `fetchFn` is for tests.
  function api(token, fetchFn) {
    const f = fetchFn || ((url, opts) => fetch(url, opts));
    async function call(path, method = 'GET', body) {
      const headers = {};
      if (token) headers.Authorization = 'Bearer ' + token;
      if (body) headers['Content-Type'] = 'application/json';
      try { return await f(API + path, { method, headers, cache: 'no-store', body: body ? JSON.stringify(body) : undefined }); }
      catch (e) { throw fail('network'); }
    }
    async function send(path, method, body) {
      const res = await call(path, method, body);
      if (!res.ok) throw await failFrom(res);
      return res.json();
    }

    // The file on main and its sha.
    async function read() {
      const body = await send('file');
      let data;
      try { data = parse(fromBase64(body.content)); } catch (e) { throw fail('json'); }
      return { data, sha: body.sha };
    }
    // Reads the file, applies the one change, and writes it back. A 409 means the file changed in between
    // (Claude saved from chat, or another phone): read and apply once more.
    async function save(change) {
      for (let attempt = 1; ; attempt++) {
        const { data, sha } = await read();
        const out = apply(data, change);
        if (!out.message) return out;
        const res = await call('file', 'PUT', { message: out.message, content: toBase64(serialize(out.data)), sha });
        if (res.status === 409 && attempt < 2) continue;
        if (!res.ok) throw await failFrom(res);
        return out;
      }
    }
    const at = key => 'users/' + encodeURIComponent(key);
    return {
      read, save,
      signup: (name, password) => send('signup', 'POST', { name, password }),
      login: (name, password) => send('login', 'POST', { name, password }),
      me: () => send('me'),
      logout: () => send('logout', 'POST'),
      users: async () => (await send('users')).users,
      approve: key => send(at(key) + '/approve', 'POST'),
      remove: key => send(at(key), 'DELETE')
    };
  }

  return { REPO, API, slug, uniqueId, cleanLine, cleanPaste, lines, tagList, normUrl, safeUrl, fromForm, toForm, parse, serialize,
    forView, apply, hl, esc, match, toBase64, fromBase64, fail, api };
});
