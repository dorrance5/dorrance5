// Run: node --test recipes/test/*.test.js
// The Recipes part of the API Worker (worker/recipes.js), run in Node with KV in memory and a stand-in for GitHub.
// worker/test/auth.test.js checks the accounts.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const D = require('../data.js');
const makeApi = require('../../worker/test/harness.cjs');

const FILE = fs.readFileSync(path.join(__dirname, '..', 'recipes.json'), 'utf8');
const form = o => ({ name: '', servings: '', tags: '', ingredients: '', steps: '', notes: '', source: '', ...o });

// Calls to the Worker as the page makes them. `ip` is the address the request comes from.
function client(api, ip = '1.1.1.1') {
  const send = async (method, p, { token, body } = {}) => {
    const headers = { 'cf-connecting-ip': ip };
    if (token) headers.authorization = 'Bearer ' + token;
    const res = await api.call('http://x/api/' + p, { method, headers, body: body && JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };
  return {
    send,
    login: (name, password) => send('POST', 'auth/login', { body: { name, password } }),
    // data.js against the real Worker
    page: token => D.api(token, (url, opts) => api.call('http://x' + url, { ...opts, headers: { ...opts.headers, 'cf-connecting-ip': ip } }))
  };
}

test('a save goes to GitHub with the Worker’s token, on main, with the name in the commit', async () => {
  const api = await makeApi(FILE), c = client(api);
  await api.addUser('Madi', 'madi-password');
  const token = (await c.login('Madi', 'madi-password')).body.token;
  const read = await c.send('GET', 'recipes/file', { token });
  assert.deepEqual(Object.keys(read.body).sort(), ['content', 'sha']);
  assert.ok(!JSON.stringify(read.body).includes(api.env.GITHUB_TOKEN), 'the GitHub token never goes to the page');
  await c.page(token).save({ type: 'add', form: form({ name: 'Crème brûlée', ingredients: '4 egg yolks' }) });
  const put = api.gh.puts.at(-1);
  assert.equal(put.message, 'Recipes: add Crème brûlée (Madi)');
  assert.equal(put.branch, 'main');
  assert.ok(JSON.parse(api.gh.text).recipes.some(r => r.id === 'creme-brulee'));
  api.gh.putQueue.push(409);
  await c.page(token).save({ type: 'delete', id: 'creme-brulee' });
  assert.ok(!JSON.parse(api.gh.text).recipes.some(r => r.id === 'creme-brulee') && api.gh.text.includes('Ketchup'), 'a 409 reads again and keeps the other change');
  assert.equal((await c.send('GET', 'recipes/file')).status, 401, 'no sign-in, no file from the Worker');
});

test('the Worker refuses a broken file or a strange commit title', async () => {
  const api = await makeApi(FILE), c = client(api);
  await api.addUser('Madi', 'madi-password');
  const token = (await c.login('Madi', 'madi-password')).body.token;
  const b64 = s => Buffer.from(s).toString('base64');
  const put = body => c.send('PUT', 'recipes/file', { token, body: { sha: 's0', ...body } });
  assert.deepEqual(await put({ message: 'Recipes: x', content: b64('{oops') }), { status: 400, body: { error: 'file' } });
  assert.deepEqual(await put({ message: 'Recipes: x', content: b64('{"other":[]}') }), { status: 400, body: { error: 'file' } });
  assert.deepEqual(await put({ message: 'hello', content: b64(FILE) }), { status: 400, body: { error: 'body' } });
  assert.deepEqual(await put({ message: 'Recipes: a\nb', content: b64(FILE) }), { status: 400, body: { error: 'body' } });
  assert.equal(api.gh.puts.length, 0);
});

test('GitHub problems come back as plain errors', async () => {
  const api = await makeApi(FILE), c = client(api);
  await api.addUser('Madi', 'madi-password');
  const token = (await c.login('Madi', 'madi-password')).body.token;
  api.gh.getStatus = 403;
  await assert.rejects(c.page(token).read(), e => e.code === 'rate');
  api.gh.getStatus = 0;
  api.env.GITHUB_TOKEN = 'github_pat_wrong';
  await assert.rejects(c.page(token).read(), e => e.code === 'github');
  delete api.env.GITHUB_TOKEN;
  await assert.rejects(c.page(token).read(), e => e.code === 'setup');
});
