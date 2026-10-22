// Run: node --test recipes/test/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const D = require('../data.js');

const FILE = fs.readFileSync(path.join(__dirname, '..', 'recipes.json'), 'utf8');
const form = o => ({ name: '', servings: '', tags: '', ingredients: '', steps: '', notes: '', source: '', ...o });

test('recipes.json is valid and in the written format', () => {
  const data = D.parse(FILE);
  assert.equal(D.serialize(data), FILE, 'the file round-trips byte for byte: 2 spaces and a newline at the end');
  const ids = new Set();
  for (const r of data.recipes) {
    assert.ok(r.id && r.name && Array.isArray(r.ingredients), r.id);
    assert.ok(!ids.has(r.id), 'duplicate id ' + r.id);
    ids.add(r.id);
  }
});

test('ids come from the name', () => {
  assert.equal(D.slug("Megan's zuppa toscana"), 'megans-zuppa-toscana');
  assert.equal(D.slug('Madi’s pasta salad'), 'madis-pasta-salad');
  assert.equal(D.slug('Crème brûlée'), 'creme-brulee');
  assert.equal(D.slug('  Mac & cheese (baked!) '), 'mac-cheese-baked');
  assert.equal(D.slug('🍕'), 'recipe');
  const list = [{ id: 'tacos' }, { id: 'tacos-2' }];
  assert.equal(D.uniqueId('Tacos', list), 'tacos-3');
  assert.equal(D.uniqueId('Nachos', list), 'nachos');
});

test('pasted lists lose their marks', () => {
  assert.equal(D.cleanPaste('- 1 cup rice\n• 2 eggs\r\n* salt\n\n1. Boil water\n2) Add rice\n10. Serve\n▢ 1 lb beef'),
    '1 cup rice\n2 eggs\nsalt\nBoil water\nAdd rice\nServe\n1 lb beef');
  assert.equal(D.cleanLine('1.5 lb flour'), '1.5 lb flour');
  assert.equal(D.cleanLine('2 eggs'), '2 eggs');
  assert.equal(D.cleanLine('1.'), '');
});

test('the form makes a recipe in file order and leaves out empty fields', () => {
  const r = D.fromForm(form({ name: ' Toast ', ingredients: 'Bread\n\n Butter \n' }), 'toast');
  assert.deepEqual(r, { id: 'toast', name: 'Toast', ingredients: ['Bread', 'Butter'] });
  assert.deepEqual(Object.keys(r), ['id', 'name', 'ingredients']);
  const full = D.fromForm(form({ name: 'Soup', servings: '4', tags: 'Soup, soup, Quick,', ingredients: 'Water', steps: 'Boil\nServe', notes: 'Hot.', source: 'example.com/soup' }), 'soup');
  assert.deepEqual(Object.keys(full), ['id', 'name', 'servings', 'tags', 'ingredients', 'steps', 'notes', 'source']);
  assert.deepEqual(full.tags, ['Soup', 'Quick']);
  assert.equal(full.source, 'https://example.com/soup');
  assert.deepEqual(D.fromForm(form({ name: 'Bare' }), 'bare').ingredients, []);
  const back = D.toForm(full);
  assert.deepEqual(D.fromForm(back, 'soup'), full);
});

test('one change applies to fresh data and keeps the rest', () => {
  const data = D.parse(FILE);
  data.recipes[0].photo = 'chili.jpg';   // a field the page does not know
  const add = D.apply(data, { type: 'add', form: form({ name: 'Salmon bowls', ingredients: 'Salmon' }) });
  assert.equal(add.recipe.id, 'salmon-bowls-2');
  assert.equal(add.message, 'Recipes: add Salmon bowls');
  assert.equal(add.data.recipes.length, data.recipes.length + 1);
  assert.equal(data.recipes.length, 11, 'the input is not changed');

  const edit = D.apply(data, { type: 'edit', id: 'white-chicken-chili', form: form({ name: 'White chicken chili', servings: '8', ingredients: 'Chicken' }) });
  assert.equal(edit.message, 'Recipes: edit White chicken chili');
  assert.deepEqual(edit.data.recipes[0], { id: 'white-chicken-chili', name: 'White chicken chili', servings: '8', ingredients: ['Chicken'], photo: 'chili.jpg' });
  assert.deepEqual(edit.data.recipes.slice(1), data.recipes.slice(1));
  assert.throws(() => D.apply(data, { type: 'edit', id: 'nope', form: form({ name: 'X' }) }), e => e.code === 'gone');

  const del = D.apply(data, { type: 'delete', id: 'salmon-bowls' });
  assert.equal(del.message, 'Recipes: delete Salmon bowls');
  assert.ok(!del.data.recipes.some(r => r.id === 'salmon-bowls'));
  assert.equal(D.apply(data, { type: 'delete', id: 'nope' }).message, null);
});

test('base64 keeps accents and apostrophes', () => {
  const s = '{"name":"Crème brûlée – Megan’s 🍮"}\n';
  assert.equal(D.fromBase64(D.toBase64(s)), s);
  assert.equal(D.toBase64(s), Buffer.from(s, 'utf8').toString('base64'));
  // GitHub wraps the base64 at 60 characters
  assert.equal(D.fromBase64(Buffer.from(FILE).toString('base64').replace(/(.{60})/g, '$1\n')), FILE);
});

test('search finds names, tags, ingredients, steps and notes', () => {
  const rs = D.forView(D.parse(FILE));
  assert.deepEqual(rs.map(r => r.name), [...rs.map(r => r.name)].sort((a, b) => a.localeCompare(b)));
  const burritos = rs.find(r => r.id === 'sheet-pan-breakfast-burritos');
  assert.deepEqual(D.match(burritos, 'red').ingredients, ['Red bell pepper', 'Red onion']);
  const roast = rs.find(r => r.id === 'pepperoncini-roast');
  assert.deepEqual(D.match(roast, 'crock pot'), { ingredients: [], snippet: null });
  const tacos = rs.find(r => r.id === 'tacos-and-beans');
  assert.match(D.match(tacos, 'garnish').snippet, /garnish/);
  assert.equal(D.match(tacos, 'kale'), null);
  assert.equal(D.hl('Mac & <b>cheese</b>', 'cheese'), 'Mac &amp; &lt;b&gt;<mark>cheese</mark>&lt;/b&gt;');
  assert.equal(D.hl('a+b', '+'), 'a<mark>+</mark>b');
  assert.equal(D.safeUrl('javascript:alert(1)'), null);
  assert.equal(D.safeUrl('https://example.com/x'), 'https://example.com/x');
});

// A stand-in for the GitHub contents API: one file with a sha.
function fakeGitHub(text, { status, conflicts = 0, putStatus } = {}) {
  const gh = { text, sha: 'sha0', gets: 0, puts: [], n: 0 };
  gh.fetch = async (url, opts) => {
    assert.match(url, /^https:\/\/api\.github\.com\/repos\/dorrance5\/dorrance5\/contents\/recipes\/recipes\.json/);
    assert.equal(opts.headers.Authorization, 'Bearer tok');
    assert.equal(opts.cache, 'no-store');
    const reply = (s, body) => ({ ok: s < 300, status: s, headers: new Map(), json: async () => body });
    if (status) return reply(status, {});
    if (!opts.method) {
      assert.match(url, /\?ref=main$/);
      gh.gets++;
      return reply(200, { sha: gh.sha, content: Buffer.from(gh.text).toString('base64').replace(/(.{60})/g, '$1\n') });
    }
    const body = JSON.parse(opts.body);
    gh.puts.push(body);
    if (putStatus) return reply(putStatus, {});
    if (conflicts > 0) { conflicts--; gh.text = gh.text.replace('"Fries"', '"Fries",\n        "Ketchup"'); gh.sha = 'sha' + ++gh.n; return reply(409, {}); }
    if (body.sha !== gh.sha) return reply(409, {});
    gh.text = Buffer.from(body.content, 'base64').toString('utf8');
    gh.sha = 'sha' + ++gh.n;
    return reply(200, { content: { sha: gh.sha } });
  };
  return gh;
}

test('save reads, applies one change and writes base64 UTF-8 to main', async () => {
  const gh = fakeGitHub(FILE);
  const out = await D.github('tok', gh.fetch).save({ type: 'add', form: form({ name: 'Crème brûlée', ingredients: '4 egg yolks\nMegan’s vanilla' }) });
  assert.equal(gh.puts.length, 1);
  const put = gh.puts[0];
  assert.equal(put.message, 'Recipes: add Crème brûlée');
  assert.equal(put.branch, 'main');
  assert.equal(put.sha, 'sha0');
  const saved = Buffer.from(put.content, 'base64').toString('utf8');
  assert.ok(saved.endsWith('}\n'));
  const r = JSON.parse(saved).recipes.find(x => x.id === 'creme-brulee');
  assert.deepEqual(r, { id: 'creme-brulee', name: 'Crème brûlée', ingredients: ['4 egg yolks', 'Megan’s vanilla'] });
  assert.equal(out.recipe.id, 'creme-brulee');
});

test('a 409 reads the file again, keeps the other change, and saves once more', async () => {
  const gh = fakeGitHub(FILE, { conflicts: 1 });
  await D.github('tok', gh.fetch).save({ type: 'edit', id: 'salmon-bowls', form: form({ name: 'Salmon bowls', ingredients: 'Salmon\nRice' }) });
  assert.equal(gh.gets, 2);
  assert.equal(gh.puts.length, 2);
  assert.equal(gh.puts[1].sha, 'sha1');
  const saved = JSON.parse(gh.text);
  assert.deepEqual(saved.recipes.find(x => x.id === 'salmon-bowls').ingredients, ['Salmon', 'Rice']);
  assert.ok(saved.recipes.find(x => x.id === 'burgers-and-fries').ingredients.includes('Ketchup'), 'the change made in between is kept');
});

test('two 409s in a row give up with a plain error', async () => {
  const gh = fakeGitHub(FILE, { conflicts: 2 });
  await assert.rejects(D.github('tok', gh.fetch).save({ type: 'delete', id: 'salmon-bowls' }), e => e.code === 409 && /kept changing/.test(e.message));
  assert.equal(gh.puts.length, 2);
});

test('errors are plain', async () => {
  await assert.rejects(D.github('tok', fakeGitHub(FILE, { status: 401 }).fetch).read(), e => e.code === 401 && /wrong or expired/.test(e.message));
  await assert.rejects(D.github('tok', fakeGitHub(FILE, { status: 404 }).fetch).read(), e => /Read and write/.test(e.message));
  await assert.rejects(D.github('tok', async () => { throw new TypeError('Load failed'); }).read(), e => e.code === 'network' && e.message === 'No connection.');
  await assert.rejects(D.github('tok', fakeGitHub('{oops').fetch).read(), e => e.code === 'json');
  const rate = { status: 403, headers: new Map([['x-ratelimit-remaining', '0']]) };
  assert.equal(D.fail(rate).code, 'rate');
  await assert.rejects(D.github('tok', fakeGitHub(FILE, { putStatus: 403 }).fetch).canWrite(), e => e.code === 403);
  assert.equal(await D.github('tok', fakeGitHub(FILE, { putStatus: 422 }).fetch).canWrite(), true);
});
