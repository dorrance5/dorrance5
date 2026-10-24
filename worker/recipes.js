/* Recipes accounts and saves for dorrance.me/recipes. index.js sends /api/recipes/* here.
   Anyone can ask for an account. The admin approves it, and then that person can add, edit and delete recipes.
   The admin is the var RECIPES_ADMIN with the secret RECIPES_ADMIN_PASSWORD. The GitHub token is the secret
   GITHUB_TOKEN: it stays here and never goes to a phone.

   POST   /api/recipes/signup            { name, password }         -> 201 { name, admin }       (anyone)
   POST   /api/recipes/login             { name, password }         -> { token, name, admin }    (anyone)
   GET    /api/recipes/me                                           -> { name, admin, waiting }  (signed in)
   POST   /api/recipes/logout                                       -> { ok }                    (signed in)
   GET    /api/recipes/file                                         -> { content, sha }          (signed in)
   PUT    /api/recipes/file              { message, content, sha }  -> { content: { sha } }      (signed in)
   GET    /api/recipes/users                                        -> { users }                 (admin)
   POST   /api/recipes/users/KEY/approve                            -> { ok }                    (admin)
   DELETE /api/recipes/users/KEY                                    -> { ok }                    (admin)

   A signed-in request has the header "Authorization: Bearer TOKEN". An error is { error: CODE } with a status;
   recipes/data.js has the words for each code.
   KV (the LIB binding) keeps:
     recipes:user:KEY     { id, name, salt, hash, status: 'pending' | 'approved', created }, and { name, status, created }
                          as metadata for the list. KEY is the name in lower case.
     recipes:session:SHA  { key, id } or { key, admin, pw } for a year. SHA is the SHA-256 of the token, so KV never
                          holds a token that works. A removed account, or a new admin password, ends its sessions.
     recipes:tries:IP     failed sign-ins and new accounts from one address in the last 15 minutes. */
const GH = 'https://api.github.com/repos/dorrance5/dorrance5/contents/recipes/recipes.json';
const USER = 'recipes:user:', SESSION = 'recipes:session:', TRIES = 'recipes:tries:';
const YEAR = 365 * 24 * 3600, WINDOW = 15 * 60, MAX_TRIES = 8, MAX_WAITING = 25;
const ROUNDS = 50000;   // PBKDF2 rounds: slow to guess, and still well inside a Worker's CPU time

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
});
const enc = new TextEncoder();
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const random = n => crypto.getRandomValues(new Uint8Array(n));
const sha256 = async s => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
async function pbkdf2(password, salt) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bytes = Uint8Array.from(salt.match(/../g), h => parseInt(h, 16));
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: bytes, iterations: ROUNDS }, key, 256));
}
// Two hex strings compared in constant time.
function same(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// The name as typed, tidied: 2 to 24 letters, numbers, spaces and . ' _ -, starting with a letter or number.
function cleanName(s) {
  const name = String(s || '').normalize('NFC').trim().replace(/\s+/g, ' ');
  return /^[\p{L}\p{N}][\p{L}\p{N} .'’_-]{1,23}$/u.test(name) ? name : null;
}
const keyOf = name => name.toLowerCase();
const adminName = env => cleanName(env.RECIPES_ADMIN) || 'Mitchell';
const isAdminName = (env, name) => keyOf(name) === keyOf(adminName(env));

async function body(req) {
  try { const b = await req.json(); return b && typeof b === 'object' ? b : {}; } catch { return {}; }
}
const triesKey = req => TRIES + (req.headers.get('cf-connecting-ip') || 'local');
const tries = async (env, req) => +(await env.LIB.get(triesKey(req))) || 0;
async function tried(env, req) {
  await env.LIB.put(triesKey(req), String(await tries(env, req) + 1), { expirationTtl: WINDOW });
}

async function users(env) {
  const out = [];
  let cursor;
  do {
    const page = await env.LIB.list({ prefix: USER, cursor });
    for (const k of page.keys) out.push({ key: k.name.slice(USER.length), ...k.metadata });
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  return out;
}
const saveUser = (env, key, u) => env.LIB.put(USER + key, JSON.stringify(u), { metadata: { name: u.name, status: u.status, created: u.created } });

// The person signed in on this request, or null.
async function who(req, env) {
  const m = /^Bearer ([\w-]{20,100})$/.exec(req.headers.get('authorization') || '');
  if (!m) return null;
  const sid = await sha256(m[1]);
  const s = await env.LIB.get(SESSION + sid, 'json');
  if (!s) return null;
  if (s.admin) {
    const ok = env.RECIPES_ADMIN_PASSWORD && s.key === keyOf(adminName(env)) && s.pw === await sha256('pw:' + env.RECIPES_ADMIN_PASSWORD);
    return ok ? { sid, name: adminName(env), admin: true } : null;
  }
  const u = await env.LIB.get(USER + s.key, 'json');
  return u && u.id === s.id && u.status === 'approved' ? { sid, name: u.name, admin: false } : null;
}

async function signup(req, env) {
  if (await tries(env, req) >= MAX_TRIES) return json({ error: 'tries' }, 429);
  const { name, password } = await body(req);
  const n = cleanName(name);
  if (!n) return json({ error: 'name' }, 400);
  if (typeof password !== 'string' || password.length < 8 || password.length > 200) return json({ error: 'password' }, 400);
  const key = keyOf(n);
  if (isAdminName(env, n) || await env.LIB.get(USER + key)) return json({ error: 'taken' }, 409);
  if ((await users(env)).filter(u => u.status === 'pending').length >= MAX_WAITING) return json({ error: 'full' }, 429);
  await tried(env, req);   // a new account counts as a try, so one address cannot ask for many
  const salt = hex(random(16));
  await saveUser(env, key, { id: hex(random(8)), name: n, salt, hash: await pbkdf2(password, salt), status: 'pending', created: new Date().toISOString().slice(0, 10) });
  return json({ name: n, admin: adminName(env) }, 201);
}

async function login(req, env) {
  if (await tries(env, req) >= MAX_TRIES) return json({ error: 'tries' }, 429);
  const { name, password } = await body(req);
  const n = cleanName(name), pw = typeof password === 'string' ? password : '';
  let session = null, shown;
  if (n && isAdminName(env, n)) {
    if (!env.RECIPES_ADMIN_PASSWORD) return json({ error: 'setup' }, 503);
    if (same(await sha256(pw), await sha256(env.RECIPES_ADMIN_PASSWORD))) {
      session = { key: keyOf(n), admin: true, pw: await sha256('pw:' + env.RECIPES_ADMIN_PASSWORD) };
      shown = adminName(env);
    }
  } else if (n) {
    const u = await env.LIB.get(USER + keyOf(n), 'json');
    if (u && same(await pbkdf2(pw, u.salt), u.hash)) {
      if (u.status !== 'approved') return json({ error: 'waiting' }, 403);
      session = { key: keyOf(n), id: u.id };
      shown = u.name;
    }
  }
  if (!session) { await tried(env, req); return json({ error: 'wrong' }, 401); }
  const token = btoa(String.fromCharCode(...random(32))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  await env.LIB.put(SESSION + await sha256(token), JSON.stringify(session), { expirationTtl: YEAR });
  return json({ token, name: shown, admin: !!session.admin });
}

// GitHub's answer when it is not OK, as one of our errors.
function ghFail(res) {
  if (res.status === 409) return json({ error: 'changed' }, 409);
  if (res.status === 429 || (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0')) return json({ error: 'rate' }, 429);
  return json({ error: 'github', status: res.status }, 502);
}
// recipes.json as base64: valid JSON with a "recipes" list.
function validFile(b64) {
  try {
    const bin = atob(b64.replace(/\s+/g, ''));
    const data = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))));
    return !!data && Array.isArray(data.recipes);
  } catch { return false; }
}
async function file(req, env, me) {
  if (!env.GITHUB_TOKEN) return json({ error: 'setup' }, 503);
  const gh = (method, b) => fetch(method === 'GET' ? GH + '?ref=main' : GH, {
    method,
    headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + env.GITHUB_TOKEN, 'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'dorrance-api', ...(b ? { 'Content-Type': 'application/json' } : {}) },
    body: b ? JSON.stringify(b) : undefined
  });
  if (req.method === 'GET') {
    const res = await gh('GET');
    if (!res.ok) return ghFail(res);
    const f = await res.json();
    return json({ content: f.content, sha: f.sha });
  }
  if (req.method !== 'PUT') return json({ error: 'method' }, 405);
  const { message, content, sha } = await body(req);
  if (typeof message !== 'string' || !/^Recipes: [^\r\n]{1,150}$/.test(message) || typeof sha !== 'string' || typeof content !== 'string') return json({ error: 'body' }, 400);
  if (content.length > 2e6 || !validFile(content)) return json({ error: 'file' }, 400);
  // The commit says who made the change: "Recipes: add Banana bread (Megan)".
  const res = await gh('PUT', { message: `${message} (${me.name})`, content, sha, branch: 'main' });
  if (!res.ok) return ghFail(res);
  const out = await res.json();
  return json({ content: { sha: out.content && out.content.sha } });
}

export async function recipes(req, env, url) {
  const path = url.pathname.replace(/^\/api\/recipes\/?/, '').replace(/\/$/, '');
  if (path === 'signup' && req.method === 'POST') return signup(req, env);
  if (path === 'login' && req.method === 'POST') return login(req, env);

  const me = await who(req, env);
  if (!me) return json({ error: 'signin' }, 401);
  if (path === 'me' && req.method === 'GET') {
    const waiting = me.admin ? (await users(env)).filter(u => u.status === 'pending').length : 0;
    return json({ name: me.name, admin: me.admin, waiting });
  }
  if (path === 'logout' && req.method === 'POST') { await env.LIB.delete(SESSION + me.sid); return json({ ok: true }); }
  if (path === 'file') return file(req, env, me);

  const m = /^users(?:\/([^/]+)(\/approve)?)?$/.exec(path);
  if (!m) return json({ error: 'not found' }, 404);
  if (!me.admin) return json({ error: 'admin' }, 403);
  if (!m[1] && req.method === 'GET') {
    const list = (await users(env)).sort((a, b) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1) || a.name.localeCompare(b.name));
    return json({ users: list });
  }
  let key;
  try { key = decodeURIComponent(m[1] || ''); } catch { return json({ error: 'nobody' }, 404); }
  const u = key && await env.LIB.get(USER + key, 'json');
  if (!u) return json({ error: 'nobody' }, 404);
  if (m[2] && req.method === 'POST') { await saveUser(env, key, { ...u, status: 'approved' }); return json({ ok: true }); }
  if (!m[2] && req.method === 'DELETE') { await env.LIB.delete(USER + key); return json({ ok: true }); }
  return json({ error: 'method' }, 405);
}
