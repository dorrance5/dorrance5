// The API Worker (worker/index.js) run in Node, for the unit tests and the browser checks. KV is a Map, and GitHub is
// a stand-in with one file (recipes.json) and a sha, like the contents API. A page's requests to /api/** go to route().
//   const api = await require('../../worker/test/harness.cjs')(FILE);   await ctx.route('**/api/**', api.route);
const path = require('node:path');

const GITHUB_TOKEN = 'github_pat_TEST_good';
const ADMIN = 'Mitchell', ADMIN_PASSWORD = 'admin-test-password';

function memoryKV() {
  const m = new Map();   // key -> { value, metadata }
  return {
    m,
    async get(k, type) { const e = m.get(k); return e ? (type === 'json' ? JSON.parse(e.value) : e.value) : null; },
    async put(k, v, o = {}) { m.set(k, { value: String(v), metadata: o.metadata }); },
    async delete(k) { m.delete(k); },
    async list({ prefix = '' } = {}) {
      const keys = [...m.keys()].filter(k => k.startsWith(prefix)).sort().map(name => ({ name, metadata: m.get(name).metadata }));
      return { keys, list_complete: true };
    }
  };
}

module.exports = async function makeApi(text) {
  const { default: worker } = await import(path.join(__dirname, '..', 'index.js'));
  const kv = memoryKV();
  const env = { LIB: kv, GITHUB_TOKEN, ADMIN, ADMIN_PASSWORD };

  // GitHub: gets and puts count the calls. getStatus or putQueue force an answer; a forced 409 is someone else saving
  // first (Claude adds Ketchup to the burgers).
  const gh = { text, sha: 's0', n: 0, gets: 0, puts: [], getStatus: 0, putQueue: [], offline: false };
  const reply = (status, body, headers) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
  async function github(url, init = {}) {
    const auth = new Headers(init.headers).get('authorization');
    if (auth !== 'Bearer ' + GITHUB_TOKEN) return reply(401, { message: 'Bad credentials' });
    if ((init.method || 'GET') === 'GET') {
      gh.gets++;
      if (gh.getStatus) return reply(gh.getStatus, { message: 'nope' }, gh.getStatus === 403 ? { 'x-ratelimit-remaining': '0' } : {});
      return reply(200, { sha: gh.sha, encoding: 'base64', content: Buffer.from(gh.text).toString('base64').replace(/(.{60})/g, '$1\n') });
    }
    const body = JSON.parse(init.body);
    gh.puts.push(body);
    const forced = gh.putQueue.shift();
    if (forced === 409) {
      gh.text = gh.text.replace('"Fries"', '"Fries",\n        "Ketchup"');
      gh.sha = 's' + ++gh.n;
      return reply(409, { message: 'conflict' });
    }
    if (forced) return reply(forced, { message: 'nope' });
    if (body.sha !== gh.sha || body.branch !== 'main') return reply(409, { message: 'sha' });
    gh.text = Buffer.from(body.content, 'base64').toString('utf8');
    gh.sha = 's' + ++gh.n;
    return reply(200, { content: { sha: gh.sha } });
  }
  const call = (url, init) => worker.fetch(new Request(url, init), env);
  // The Worker's calls to GitHub go to the stand-in, and a plain fetch('/api/...') in Node goes to the Worker.
  const realFetch = globalThis.fetch;
  globalThis.fetch = (url, init) => {
    const u = String(url);
    if (u.startsWith('https://api.github.com/')) return github(u, init);
    if (u.startsWith('/api/')) return call('http://x' + u, init);
    return realFetch(url, init);
  };

  // Playwright route handler for the page's /api/** requests.
  async function route(r) {
    if (gh.offline) return r.abort('internetdisconnected');
    const req = r.request(), method = req.method();
    const res = await call(req.url(), { method, headers: req.headers(), body: method === 'GET' || method === 'HEAD' ? undefined : req.postDataBuffer() });
    return r.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: Buffer.from(await res.arrayBuffer()) });
  }
  // An account made the way a page makes one, then approved straight in KV unless `waiting`.
  let n = 0;
  async function addUser(name, password, waiting) {
    const res = await call('http://x/api/auth/signup', { method: 'POST', headers: { 'cf-connecting-ip': 'setup-' + ++n }, body: JSON.stringify({ name, password }) });
    if (res.status !== 201) throw new Error(`addUser ${name}: ${res.status} ${await res.text()}`);
    if (waiting) return;
    const key = 'auth:user:' + name.toLowerCase(), u = await kv.get(key, 'json');
    await kv.put(key, JSON.stringify({ ...u, status: 'approved' }), { metadata: { name: u.name, status: 'approved', created: u.created } });
  }
  return { env, kv, gh, call, route, addUser, ADMIN, ADMIN_PASSWORD };
};
