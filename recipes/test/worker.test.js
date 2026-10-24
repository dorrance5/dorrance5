// Run: node --test recipes/test/*.test.js
// The Recipes part of the API Worker (worker/recipes.js), run in Node with KV in memory and a stand-in for GitHub.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const D = require('../data.js');
const makeApi = require('./api.cjs');

const FILE = fs.readFileSync(path.join(__dirname, '..', 'recipes.json'), 'utf8');
const form = o => ({ name: '', servings: '', tags: '', ingredients: '', steps: '', notes: '', source: '', ...o });

// Calls to the Worker as the page makes them. `ip` is the address the request comes from.
function client(api, ip = '1.1.1.1') {
  const send = async (method, p, { token, body } = {}) => {
    const headers = { 'cf-connecting-ip': ip };
    if (token) headers.authorization = 'Bearer ' + token;
    const res = await api.call('http://x/api/recipes/' + p, { method, headers, body: body && JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };
  return {
    send,
    signup: (name, password) => send('POST', 'signup', { body: { name, password } }),
    login: (name, password) => send('POST', 'login', { body: { name, password } }),
    // data.js against the real Worker
    page: token => D.api(token, (url, opts) => api.call('http://x' + url, { ...opts, headers: { ...opts.headers, 'cf-connecting-ip': ip } }))
  };
}
const kvText = api => [...api.kv.m.entries()].map(([k, v]) => k + ' ' + v.value).join('\n');

test('a new account waits for the admin, then can sign in', async () => {
  const api = await makeApi(FILE), c = client(api);
  assert.deepEqual(await c.signup('  Megan ', 'pasta-night-42'), { status: 201, body: { name: 'Megan', admin: 'Mitchell' } });
  const u = await api.kv.get('recipes:user:megan', 'json');
  assert.equal(u.status, 'pending');
  assert.match(u.hash, /^[0-9a-f]{64}$/);
  assert.ok(!kvText(api).includes('pasta-night-42'), 'the password is not kept as typed');
  assert.deepEqual(await c.login('megan', 'pasta-night-42'), { status: 403, body: { error: 'waiting' } });

  const admin = (await c.login('MITCHELL', api.ADMIN_PASSWORD)).body;
  assert.equal(admin.name, 'Mitchell');
  assert.equal(admin.admin, true);
  assert.deepEqual((await c.send('GET', 'me', { token: admin.token })).body, { name: 'Mitchell', admin: true, waiting: 1 });
  const list = (await c.send('GET', 'users', { token: admin.token })).body.users;
  assert.deepEqual(list.map(x => [x.key, x.name, x.status]), [['megan', 'Megan', 'pending']]);
  assert.equal((await c.send('POST', 'users/megan/approve', { token: admin.token })).status, 200);

  const megan = await c.login('Megan', 'pasta-night-42');
  assert.equal(megan.status, 200);
  assert.deepEqual((await c.send('GET', 'me', { token: megan.body.token })).body, { name: 'Megan', admin: false, waiting: 0 });
  assert.ok(!kvText(api).includes(megan.body.token) && !kvText(api).includes(admin.token), 'KV never holds a sign-in that works');
});

test('names and passwords are checked', async () => {
  const api = await makeApi(FILE), c = client(api);
  await api.addUser('Madi', 'madi-password');
  for (const name of ['', 'a', '<b>Jo</b>', 'x'.repeat(25), ' -Jo']) assert.deepEqual(await c.signup(name, 'long-enough'), { status: 400, body: { error: 'name' } }, name);
  assert.deepEqual(await c.signup('Jo', 'short'), { status: 400, body: { error: 'password' } });
  assert.deepEqual(await c.signup('MADI', 'long-enough'), { status: 409, body: { error: 'taken' } });
  assert.deepEqual(await c.signup('mitchell', 'long-enough'), { status: 409, body: { error: 'taken' } }, 'no one can take the admin name');
  assert.equal((await c.signup("Jo O'Neil-Smith", 'long-enough')).status, 201);
  assert.deepEqual(await c.login('Madi', 'wrong-password'), { status: 401, body: { error: 'wrong' } });
  assert.deepEqual(await c.login('Nobody', 'madi-password'), { status: 401, body: { error: 'wrong' } });
  assert.deepEqual(await c.login('Mitchell', 'madi-password'), { status: 401, body: { error: 'wrong' } });
});

test('too many tries lock one address for a while', async () => {
  const api = await makeApi(FILE), c = client(api, '9.9.9.9');
  await api.addUser('Madi', 'madi-password');
  for (let i = 0; i < 8; i++) assert.equal((await c.login('Madi', 'guess-' + i)).status, 401);
  assert.deepEqual(await c.login('Madi', 'madi-password'), { status: 429, body: { error: 'tries' } });
  assert.deepEqual(await c.signup('Spam', 'long-enough'), { status: 429, body: { error: 'tries' } });
  assert.equal((await client(api, '2.2.2.2').login('Madi', 'madi-password')).status, 200, 'another address still works');
});

test('only the admin sees and changes accounts', async () => {
  const api = await makeApi(FILE), c = client(api);
  await api.addUser('Madi', 'madi-password');
  await api.addUser('Jen', 'jen-password', true);
  const madi = (await c.login('Madi', 'madi-password')).body.token;
  assert.deepEqual(await c.send('GET', 'users', { token: madi }), { status: 403, body: { error: 'admin' } });
  assert.deepEqual(await c.send('POST', 'users/jen/approve', { token: madi }), { status: 403, body: { error: 'admin' } });
  assert.deepEqual(await c.send('DELETE', 'users/jen', { token: madi }), { status: 403, body: { error: 'admin' } });
  assert.deepEqual(await c.send('GET', 'users'), { status: 401, body: { error: 'signin' } });
  assert.deepEqual(await c.send('GET', 'users', { token: 'x'.repeat(43) }), { status: 401, body: { error: 'signin' } });
  assert.equal((await api.kv.get('recipes:user:jen', 'json')).status, 'pending');
});

test('removing an account ends its sign-in, also when someone takes the name again', async () => {
  const api = await makeApi(FILE), c = client(api);
  await api.addUser('Madi', 'madi-password');
  const madi = (await c.login('Madi', 'madi-password')).body.token;
  const admin = (await c.login('Mitchell', api.ADMIN_PASSWORD)).body.token;
  assert.equal((await c.send('GET', 'me', { token: madi })).status, 200);
  assert.equal((await c.send('DELETE', 'users/madi', { token: admin })).status, 200);
  assert.deepEqual(await c.send('GET', 'me', { token: madi }), { status: 401, body: { error: 'signin' } });
  assert.deepEqual(await c.send('DELETE', 'users/madi', { token: admin }), { status: 404, body: { error: 'nobody' } });
  await api.addUser('Madi', 'another-password');
  assert.equal((await c.send('GET', 'me', { token: madi })).status, 401);
});

test('sign out, and a new admin password, end a sign-in', async () => {
  const api = await makeApi(FILE), c = client(api);
  await api.addUser('Madi', 'madi-password');
  const madi = (await c.login('Madi', 'madi-password')).body.token;
  assert.equal((await c.send('POST', 'logout', { token: madi })).status, 200);
  assert.equal((await c.send('GET', 'me', { token: madi })).status, 401);
  const admin = (await c.login('Mitchell', api.ADMIN_PASSWORD)).body.token;
  api.env.RECIPES_ADMIN_PASSWORD = 'a-new-admin-password';
  assert.equal((await c.send('GET', 'me', { token: admin })).status, 401);
  delete api.env.RECIPES_ADMIN_PASSWORD;
  assert.deepEqual(await c.login('Mitchell', ''), { status: 503, body: { error: 'setup' } });
});

test('a save goes to GitHub with the Worker’s token, on main, with the name in the commit', async () => {
  const api = await makeApi(FILE), c = client(api);
  await api.addUser('Madi', 'madi-password');
  const token = (await c.login('Madi', 'madi-password')).body.token;
  const read = await c.send('GET', 'file', { token });
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
  assert.equal((await c.send('GET', 'file')).status, 401, 'no sign-in, no file from the Worker');
});

test('the Worker refuses a broken file or a strange commit title', async () => {
  const api = await makeApi(FILE), c = client(api);
  await api.addUser('Madi', 'madi-password');
  const token = (await c.login('Madi', 'madi-password')).body.token;
  const b64 = s => Buffer.from(s).toString('base64');
  const put = body => c.send('PUT', 'file', { token, body: { sha: 's0', ...body } });
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

test('the TV Mount library is still there', async () => {
  const api = await makeApi(FILE);
  const res = await api.call('http://x/api/tvmount/lib');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { tvs: [], mounts: [] });
});
