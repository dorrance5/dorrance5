// Run: node --test worker/test/*.test.js
// The meal plans and the grocery lists: the Worker side (worker/meals.js) run in Node with KV in memory, and the page's
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
const EMPTY = { recipes: [], extra: [], got: [], gone: [] };
const NONE = { with: null, invite: null, asked: null };

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
  const t = {
    api, as, raw, login,
    admin: await login('Mitchell', api.ADMIN_PASSWORD),
    nicole: await login('Nicole', 'nicole-password'),
    madi: await login('Madi', 'madi-password')
  };
  // `a` asks `b`, and `b` says yes
  t.pair = async (a, b, key) => { await t.as(a).share('ask', key); return t.as(b).share('join'); };
  return t;
}
const code = p => p.then(() => 'ok', e => e.code);
const plans = api => [...api.kv.m.keys()].filter(k => k.startsWith('meals:plan:'));

test('everyone signed in has a plan of their own, and no one else sees it', async () => {
  const t = await setup();
  assert.deepEqual(await t.raw(null, 'GET', ''), { status: 401, body: { error: 'signin' } });
  assert.deepEqual(await t.raw(null, 'GET', '/people'), { status: 401, body: { error: 'signin' } });
  for (const [token, name] of [[t.admin, 'Mitchell'], [t.nicole, 'Nicole'], [t.madi, 'Madi']]) {
    assert.deepEqual(await t.as(token).get(), { people: [name], days: {}, list: EMPTY, share: NONE }, name);
  }
  await t.as(t.madi).send([{ op: 'day', date: TODAY, note: 'Pizza' }]);
  assert.deepEqual((await t.as(t.madi).get()).days, { [TODAY]: { note: 'Pizza', by: 'Madi' } });
  assert.deepEqual((await t.as(t.nicole).get()).days, {}, 'Nicole does not see Madi’s plan');
  assert.deepEqual((await t.as(t.admin).get()).days, {}, 'and neither does the admin');
  assert.deepEqual(await t.as(t.nicole).people(), { people: [{ key: 'madi', name: 'Madi' }, { key: 'mitchell', name: 'Mitchell' }] });
});

test('asking, then saying yes: two people share one plan, which starts as the asker’s', async () => {
  const t = await setup();
  await t.as(t.admin).send([{ op: 'day', date: TODAY, recipe: 'tacos-and-beans', name: 'Tacos and beans' }]);
  await t.as(t.nicole).send([{ op: 'day', date: day(1), note: 'Soup night' }]);
  assert.equal(await code(t.as(t.admin).share('ask', 'mitchell')), 'body', 'not yourself');
  assert.equal(await code(t.as(t.admin).share('ask', 'nobody')), 'nobody');
  let out = await t.as(t.admin).share('ask', 'nicole');
  assert.deepEqual(out.share, { with: null, invite: null, asked: { key: 'nicole', name: 'Nicole' } });
  assert.deepEqual((await t.as(t.nicole).get()).share, { with: null, invite: { key: 'mitchell', name: 'Mitchell' }, asked: null });
  assert.equal(await code(t.as(t.madi).share('ask', 'nicole')), 'asked', 'one ask at a time for Nicole');

  out = await t.as(t.nicole).share('join');
  assert.deepEqual(out.people, ['Mitchell', 'Nicole']);
  assert.deepEqual(out.share, { with: { key: 'mitchell', name: 'Mitchell' }, invite: null, asked: null });
  assert.deepEqual(Object.keys(out.days), [TODAY], 'the shared plan starts as Mitchell’s');
  assert.deepEqual((await t.as(t.admin).get()).share, { with: { key: 'nicole', name: 'Nicole' }, invite: null, asked: null });

  await t.as(t.nicole).send([{ op: 'day', date: day(2), recipe: 'salmon-bowls', name: 'Salmon bowls' }]);
  out = await t.as(t.admin).send([{ op: 'day', date: day(3), note: 'Leftovers' }]);
  assert.deepEqual(out.days, {
    [TODAY]: { recipe: 'tacos-and-beans', name: 'Tacos and beans', by: 'Mitchell' },
    [day(2)]: { recipe: 'salmon-bowls', name: 'Salmon bowls', by: 'Nicole' },
    [day(3)]: { note: 'Leftovers', by: 'Mitchell' }
  });
  assert.deepEqual((await t.as(t.nicole).get()).days, out.days, 'both change one plan');
  assert.deepEqual((await t.as(t.madi).get()).days, {}, 'Madi sees neither');
  assert.equal(await code(t.as(t.admin).share('ask', 'madi')), 'sharing', 'pairs only');
});

test('no thanks, taking an ask back, and stopping', async () => {
  const t = await setup();
  await t.as(t.admin).share('ask', 'madi');
  let out = await t.as(t.madi).share('decline');
  assert.deepEqual(out.share, NONE);
  assert.deepEqual((await t.as(t.admin).get()).share, NONE, 'the ask is gone on both sides');
  await t.as(t.admin).share('ask', 'madi');
  await t.as(t.admin).share('cancel');
  assert.deepEqual((await t.as(t.madi).get()).share, NONE);
  assert.equal(await code(t.as(t.madi).share('join')), 'gone');
  await t.as(t.admin).share('ask', 'madi');
  await t.as(t.admin).share('ask', 'nicole');
  assert.equal((await t.as(t.madi).get()).share.invite, null, 'asking someone else takes the first ask back');
  assert.equal(await code(t.as(t.madi).share('wave')), 'body');

  // Stopping: the one who stops gets their own plan back; the other keeps the shared one.
  await t.as(t.nicole).send([{ op: 'day', date: TODAY, note: 'Nicole’s own' }]);
  await t.as(t.nicole).share('join');
  await t.as(t.admin).send([{ op: 'day', date: day(1), note: 'Shared' }]);
  out = await t.as(t.nicole).share('leave');
  assert.deepEqual(out.people, ['Nicole']);
  assert.deepEqual(out.share, NONE);
  assert.deepEqual(out.days, { [TODAY]: { note: 'Nicole’s own', by: 'Nicole' } });
  out = await t.as(t.admin).get();
  assert.deepEqual(out.people, ['Mitchell']);
  assert.deepEqual(Object.keys(out.days), [day(1)]);
  assert.deepEqual(out.share, NONE);
  assert.equal(await code(t.as(t.admin).share('ask', 'madi')), 'ok', 'free to ask again');
});

test('saying yes ends a plan you shared, and an asker who shares now cannot be joined', async () => {
  const t = await setup();
  await t.pair(t.admin, t.nicole, 'nicole');
  await t.as(t.admin).send([{ op: 'day', date: TODAY, note: 'Ours' }]);
  await t.as(t.madi).send([{ op: 'day', date: day(1), note: 'Madi’s' }]);
  let out = await t.pair(t.madi, t.nicole, 'nicole');
  assert.deepEqual(out.people, ['Madi', 'Nicole']);
  assert.deepEqual(Object.keys(out.days), [day(1)], 'Nicole now plans with Madi, on Madi’s plan');
  out = await t.as(t.admin).get();
  assert.deepEqual(out.people, ['Mitchell']);
  assert.deepEqual(Object.keys(out.days), [TODAY], 'Mitchell keeps the plan Nicole left');

  // Mitchell asks Madi, but Madi already shares with Nicole: Madi cannot ask while sharing, and Mitchell's ask waits.
  await t.as(t.admin).share('ask', 'madi');
  assert.equal(await code(t.as(t.madi).share('ask', 'mitchell')), 'sharing');
  // Mitchell joins someone else while the ask waits; then Madi's yes finds Mitchell taken.
  const jen = (await t.api.addUser('Jen', 'jen-password'), await t.login('Jen', 'jen-password'));
  await t.as(jen).share('ask', 'mitchell');
  await t.as(t.admin).share('join');
  assert.equal(await code(t.as(t.madi).share('join')), 'taken');
  // The plan Mitchell was left with when Nicole went is Mitchell's own now, so it comes back when Mitchell stops.
  const back = await t.as(t.admin).share('leave');
  assert.deepEqual(back.people, ['Mitchell']);
  assert.deepEqual(back.days, { [TODAY]: { note: 'Ours', by: 'Mitchell' } });
});

test('a removed account no longer shares, and a new account with its name is someone else', async () => {
  const t = await setup();
  await t.pair(t.admin, t.nicole, 'nicole');
  await t.as(t.nicole).send([{ op: 'day', date: TODAY, note: 'Tacos' }]);
  await t.api.call('http://x/api/auth/users/nicole', { method: 'DELETE', headers: { authorization: 'Bearer ' + t.admin } });
  let out = await t.as(t.admin).get();
  assert.deepEqual(out.people, ['Mitchell']);
  assert.equal(out.share.with, null);
  assert.deepEqual(Object.keys(out.days), [TODAY], 'Mitchell keeps the plan');
  await t.api.addUser('Nicole', 'someone-else-pw');
  out = await t.as(await t.login('Nicole', 'someone-else-pw')).get();
  assert.deepEqual(out, { people: ['Nicole'], days: {}, list: EMPTY, share: NONE });
  assert.equal(await code(t.as(t.admin).share('ask', 'madi')), 'ok', 'Mitchell can ask someone new');
});

test('a page load only reads, and a batch of changes is one write', async () => {
  const t = await setup();
  await t.pair(t.admin, t.nicole, 'nicole');
  const puts = t.api.kv.puts.length;
  for (let i = 0; i < 5; i++) { await t.as(t.admin).get(); await t.as(t.nicole).get(); await t.as(t.madi).get(); }
  assert.equal(t.api.kv.puts.length, puts, 'no KV write on a GET');
  await t.as(t.nicole).send([
    { op: 'add', recipe: 'tacos-and-beans', name: 'Tacos and beans', keys: ['ground beef', 'tortillas'] },
    { op: 'extra', text: 'Milk', key: 'milk' },
    { op: 'got', key: 'milk', on: true }
  ]);
  const wrote = t.api.kv.puts.slice(puts);
  assert.equal(wrote.length, 1);
  assert.ok(wrote[0].startsWith('meals:plan:p'), wrote[0]);
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
  assert.deepEqual(out.list, EMPTY, 'an empty list forgets its ticks');
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
  assert.equal((await t.raw(t.admin, 'GET', '/share')).status, 405);
  assert.equal((await t.raw(t.admin, 'POST', '/people')).status, 405);
  assert.equal((await t.raw(t.admin, 'GET', '/other')).status, 404);
  assert.deepEqual(plans(t.api), [], 'nothing was written');

  // Days from more than 2 weeks ago go.
  t.api.kv.m.set('meals:plan:solo.mitchell.admin', { value: JSON.stringify({ days: { [day(-20)]: { note: 'Old', by: 'Mitchell' }, [day(-3)]: { note: 'Soup', by: 'Nicole' } } }) });
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
  t.api.kv.kvFail.push('KV PUT failed: 429 Too Many Requests');
  assert.equal(await code(t.as(t.admin).share('ask', 'madi')), 'busy', 'sharing too');
});
