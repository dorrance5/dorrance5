// Run: node --test worker/test/*.test.js
// The meal plan and the grocery list: the Worker side (worker/meals.js) run in Node with KV in memory, and the page's
// calls (recipes/meals.js) against it.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const makeApi = require('./harness.cjs');
const M = require('../../recipes/meals.js');

const FILE = fs.readFileSync(path.join(__dirname, '..', '..', 'recipes', 'recipes.json'), 'utf8');
const TODAY = new Date().toISOString().slice(0, 10);
const day = n => new Date(Date.parse(TODAY + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);

// The admin, Nicole and Madi signed in; `as(token)` makes the page's calls with that sign-in.
async function setup() {
  const api = await makeApi(FILE);
  await api.addUser('Nicole', 'nicole-password');
  await api.addUser('Madi', 'madi-password');
  const login = async (name, password) => (await (await api.call('http://x/api/auth/login', { method: 'POST', body: JSON.stringify({ name, password }) })).json()).token;
  const as = token => M.api(token, (url, opts) => api.call('http://x' + url, opts));
  const raw = async (token, method, p, body) => {
    const res = await api.call('http://x/api/meals' + p, { method, headers: token ? { authorization: 'Bearer ' + token } : {}, body });
    return { status: res.status, body: await res.json() };
  };
  return {
    api, as, raw, login,
    admin: await login('Mitchell', api.ADMIN_PASSWORD),
    nicole: await login('Nicole', 'nicole-password'),
    madi: await login('Madi', 'madi-password')
  };
}
const code = p => p.then(() => 'ok', e => e.code);

test('only the admin and the partner the admin picks see the meal plan', async () => {
  const t = await setup();
  assert.deepEqual(await t.raw(null, 'GET', ''), { status: 401, body: { error: 'signin' } });
  assert.equal(await code(t.as(t.nicole).get()), 'planner', 'no partner yet');
  const mine = await t.as(t.admin).get();
  assert.deepEqual(mine, { people: ['Mitchell'], days: {}, list: { recipes: [], extra: [], got: [], gone: [] }, partner: null });

  assert.equal(await code(t.as(t.madi).partner('madi')), 'admin', 'only the admin picks');
  assert.equal(await code(t.as(t.admin).partner('nobody')), 'nobody');
  assert.deepEqual(await t.as(t.admin).partner('nicole'), { partner: { key: 'nicole', name: 'Nicole' } });
  assert.deepEqual((await t.as(t.nicole).get()).people, ['Mitchell', 'Nicole']);
  assert.ok(!('partner' in await t.as(t.nicole).get()), 'the partner does not get the admin’s setting');
  assert.deepEqual((await t.as(t.admin).get()).partner, { key: 'nicole', name: 'Nicole' });
  assert.equal(await code(t.as(t.madi).get()), 'planner');
  assert.equal(await code(t.as(t.madi).send([{ op: 'day', date: TODAY, note: 'Pizza' }])), 'planner');

  // A removed account is not the partner, and neither is a new account that takes the name.
  await t.raw(t.admin, 'GET', '');
  await t.api.call('http://x/api/auth/users/nicole', { method: 'DELETE', headers: { authorization: 'Bearer ' + t.admin } });
  assert.deepEqual((await t.as(t.admin).get()).people, ['Mitchell']);
  assert.equal((await t.as(t.admin).get()).partner, null);
  await t.api.addUser('Nicole', 'someone-else-pw');
  const other = await t.login('Nicole', 'someone-else-pw');
  assert.equal(await code(t.as(other).get()), 'planner');

  assert.deepEqual(await t.as(t.admin).partner('madi'), { partner: { key: 'madi', name: 'Madi' } });
  assert.equal(await code(t.as(t.madi).get()), 'ok');
  assert.deepEqual(await t.as(t.admin).partner(''), { partner: null });
  assert.equal(await code(t.as(t.madi).get()), 'planner');
});

test('a dinner shows who planned it, and both planners change one plan', async () => {
  const t = await setup();
  await t.as(t.admin).partner('nicole');
  let out = await t.as(t.admin).send([
    { op: 'day', date: TODAY, recipe: 'tacos-and-beans', name: 'Tacos and beans' },
    { op: 'day', date: day(1), note: '  Leftovers ' }
  ]);
  out = await t.as(t.nicole).send([{ op: 'day', date: day(2), recipe: 'salmon-bowls', name: 'Salmon bowls' }]);
  assert.deepEqual(out.days, {
    [TODAY]: { recipe: 'tacos-and-beans', name: 'Tacos and beans', by: 'Mitchell' },
    [day(1)]: { note: 'Leftovers', by: 'Mitchell' },
    [day(2)]: { recipe: 'salmon-bowls', name: 'Salmon bowls', by: 'Nicole' }
  });
  out = await t.as(t.nicole).send([{ op: 'day', date: day(1) }, { op: 'day', date: TODAY, note: 'Out for pizza' }]);
  assert.deepEqual(Object.keys(out.days).sort(), [TODAY, day(2)]);
  assert.deepEqual(out.days[TODAY], { note: 'Out for pizza', by: 'Nicole' });
  assert.deepEqual((await t.as(t.admin).get()).days, out.days);
});

test('a page load only reads, and a batch of changes is one write', async () => {
  const t = await setup();
  await t.as(t.admin).partner('nicole');
  const puts = t.api.kv.puts.length;
  for (let i = 0; i < 5; i++) { await t.as(t.admin).get(); await t.as(t.nicole).get(); }
  assert.equal(t.api.kv.puts.length, puts, 'no KV write on a GET');
  await t.as(t.nicole).send([
    { op: 'add', recipe: 'tacos-and-beans', name: 'Tacos and beans', keys: ['ground beef', 'tortillas'] },
    { op: 'extra', text: 'Milk', key: 'milk' },
    { op: 'got', key: 'milk', on: true }
  ]);
  assert.deepEqual(t.api.kv.puts.slice(puts), ['meals:data']);
});

test('the grocery list: recipes, extras, got it and clear', async () => {
  const t = await setup();
  const me = t.as(t.admin);
  let out = await me.send([
    { op: 'add', recipe: 'tacos-and-beans', name: 'Tacos and beans', keys: ['ground beef', 'tortillas'] },
    { op: 'add', recipe: 'burgers-and-fries', name: 'Burgers and fries', keys: ['burgers', 'buns'] },
    { op: 'add', recipe: 'tacos-and-beans', name: 'Tacos and beans', keys: ['ground beef'] },
    { op: 'extra', text: 'Paper towels', key: 'paper towels' },
    { op: 'got', key: 'tortillas', on: true },
    { op: 'got', key: 'paper towels', on: true },
    { op: 'got', key: 'buns', on: true },
    { op: 'got', key: 'buns', on: false }
  ]);
  assert.deepEqual(out.list, {
    recipes: [{ id: 'tacos-and-beans', name: 'Tacos and beans' }, { id: 'burgers-and-fries', name: 'Burgers and fries' }],
    extra: [{ key: 'paper towels', text: 'Paper towels' }],
    got: ['tortillas', 'paper towels'],
    gone: []
  });
  out = await me.send([{ op: 'clear', keys: ['tortillas', 'paper towels'], recipes: [] }]);
  assert.deepEqual(out.list.extra, [], 'a cleared extra is gone');
  assert.deepEqual(out.list.gone, ['tortillas', 'paper towels']);
  assert.deepEqual(out.list.got, []);
  out = await me.send([{ op: 'extra', text: 'Tortillas', key: 'tortillas' }]);
  assert.deepEqual(out.list.gone, ['paper towels'], 'adding it again brings it back');
  out = await me.send([{ op: 'drop', recipe: 'tacos-and-beans' }, { op: 'clear', keys: ['tortillas'], recipes: ['burgers-and-fries'] }]);
  assert.deepEqual(out.list, { recipes: [], extra: [], got: [], gone: [] }, 'an empty list forgets its ticks');
});

test('the Worker refuses a strange change and keeps the data small', async () => {
  const t = await setup();
  const bad = [
    { op: 'day', date: '2026-02-30', note: 'x' }, { op: 'day', date: 'today' }, { op: 'day', date: TODAY, note: ' ' },
    { op: 'day', date: TODAY, note: 'x'.repeat(81) }, { op: 'day', date: TODAY, recipe: '<b>', name: 'x' },
    { op: 'add', recipe: 'a', name: 'A' }, { op: 'got', key: 'milk', on: 'yes' }, { op: 'extra', text: 'Milk', key: ' milk' },
    { op: 'clear', keys: 'milk', recipes: [] }, { op: 'nope' }, null
  ];
  for (const op of bad) assert.deepEqual(await t.raw(t.admin, 'POST', '', JSON.stringify({ ops: [op] })), { status: 400, body: { error: 'body' } }, JSON.stringify(op));
  assert.equal((await t.raw(t.admin, 'POST', '', '{oops')).status, 400);
  assert.equal((await t.raw(t.admin, 'POST', '', JSON.stringify({ ops: Array(101).fill({ op: 'drop', recipe: 'a' }) }))).status, 400);
  assert.equal((await t.raw(t.admin, 'POST', '', 'x'.repeat(70000))).status, 400);
  assert.equal((await t.raw(t.admin, 'DELETE', '')).status, 405);
  assert.equal((await t.raw(t.admin, 'GET', '/other')).status, 404);
  assert.equal(t.api.kv.m.get('meals:data'), undefined, 'nothing was written');

  // Days from more than 2 weeks ago go.
  t.api.kv.m.set('meals:data', { value: JSON.stringify({ days: { [day(-20)]: { note: 'Old', by: 'Mitchell' }, [day(-3)]: { note: 'Soup', by: 'Nicole' } } }) });
  const out = await t.as(t.admin).send([{ op: 'day', date: TODAY, note: 'Tacos' }]);
  assert.deepEqual(Object.keys(out.days).sort(), [day(-3), TODAY]);
});

test('a write that KV refuses is busy or full, and the data is as it was', async () => {
  const t = await setup();
  await t.as(t.admin).send([{ op: 'day', date: TODAY, note: 'Tacos' }]);
  t.api.kv.kvFail.push('KV PUT failed: 429 Too Many Requests');
  assert.equal(await code(t.as(t.admin).send([{ op: 'day', date: TODAY }])), 'busy');
  t.api.kv.kvFail.push('KV put() limit exceeded for the day.');
  assert.equal(await code(t.as(t.admin).send([{ op: 'day', date: TODAY }])), 'full');
  assert.deepEqual((await t.as(t.admin).get()).days[TODAY], { note: 'Tacos', by: 'Mitchell' });
});
