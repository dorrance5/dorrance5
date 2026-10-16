// Run: node --test tvmount/test/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../store.js');
const G = require('../geometry.js');

function memStorage(init) {
  const m = new Map(Object.entries(init || {}));
  return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), map: m };
}

test('first run gives one empty tab', () => {
  const { doc, fresh } = S.load(memStorage());
  assert.ok(fresh);
  assert.equal(doc.version, S.VERSION);
  assert.equal(doc.tabs.length, 1);
  assert.equal(doc.current, doc.tabs[0].id);
  assert.deepEqual(doc.settings, { mode: 'simple', prec: 16, dec: false });
});

test('save then load round-trips', () => {
  const st = memStorage();
  const doc = S.blank();
  doc.tabs[0].tv.w = 57.125; doc.tabs[0].ref.floor.value = 42; doc.settings.mode = 'pro';
  S.addTab(doc, 'Bedroom');
  assert.ok(S.save(st, doc));
  const back = S.load(st).doc;
  assert.deepEqual(back, doc);
  assert.ok(st.map.has('tvmount.data'));
});

test('unversioned data is backed up then migrated', () => {
  const old = [{ id: 'a1', name: 'Den', tv: { w: 50, h: 29 }, mount: { holesToTop: 3 } }];
  const st = memStorage({ 'tvmount.data': JSON.stringify(old) });
  const { doc, from } = S.load(st);
  assert.equal(from, 0);
  assert.equal(st.map.get('tvmount.backup.v0'), JSON.stringify(old));
  assert.equal(doc.version, 1);
  assert.equal(doc.tabs[0].id, 'a1');
  assert.equal(doc.tabs[0].tv.w, 50);
  assert.equal(doc.tabs[0].tv.src, 'measured');          // filled from the template
  assert.equal(doc.tabs[0].ref.mantle.edge, 'bottom');
  assert.deepEqual(doc.tabs[0].studs.list, []);
  assert.equal(doc.tabs[0].bar.kind, 'none');           // tabs saved before the soundbar get one, off
  assert.equal(doc.tabs[0].center.mode, 'two');         // the old defaults, not the new ones
  assert.equal(doc.tabs[0].ref.floor.edge, 'center');
  assert.equal(doc.tabs[0].ref.ceiling.edge, 'top');
  assert.equal(doc.tabs[0].mount.holesFrom, 'top');
  const fresh = S.blank().tabs[0];
  assert.equal(fresh.tv.src, 'size');                    // new tabs start on a standard size
  assert.equal(fresh.center.mode, 'half');
  for (const k of ['floor', 'mantle', 'ceiling']) assert.equal(fresh.ref[k].edge, 'bottom');
});

test('fields a newer app wrote are kept, bad numbers dropped', () => {
  const d = S.blank();
  d.tabs[0].tv.w = 'wide'; d.tabs[0].futureThing = { x: 1 }; d.tabs[0].studs.list = [1, 'x', 17];
  d.lib.tvs.push({ model: 'QN65', w: 57.1, extra: true });
  const n = S.normalize(JSON.parse(JSON.stringify(d)));
  assert.equal(n.tabs[0].tv.w, null);
  assert.deepEqual(n.tabs[0].futureThing, { x: 1 });
  assert.deepEqual(n.tabs[0].studs.list, [1, 17]);
  assert.equal(n.lib.tvs[0].extra, true);
  assert.ok(n.lib.tvs[0].id);
  const newer = S.normalize({ version: 7, tabs: [] });
  assert.equal(newer.version, 7);
});

test('unreadable data is kept and a fresh doc starts', () => {
  const st = memStorage({ 'tvmount.data': '{nope' });
  const r = S.load(st);
  assert.ok(r.error);
  assert.equal(st.map.get('tvmount.backup.unreadable'), '{nope');
  assert.equal(r.doc.tabs.length, 1);
});

test('export and import, merge and replace', () => {
  const a = S.blank(); a.tabs[0].name = 'Living'; a.tabs[0].tv.w = 57;
  const b = S.blank(); b.tabs[0].name = 'Garage';
  b.lib.mounts.push(Object.assign({ id: 'm1' }, S.MOUNT_ITEM, { model: 'XYZ', sag: 0.125 }));
  const text = S.exportText(b);
  assert.match(text, /"app": "tvmount"/);
  const inc = S.parseImport(text);
  assert.equal(inc.app, undefined);
  const merged = S.mergeDocs(a, inc);
  assert.deepEqual(merged.tabs.map(t => t.name), ['Living', 'Garage']);
  assert.equal(merged.lib.mounts[0].model, 'XYZ');
  // importing the same file again updates instead of duplicating
  assert.equal(S.mergeDocs(merged, inc).tabs.length, 2);
  const rep = S.replaceDoc(a, inc);
  assert.deepEqual(rep.tabs.map(t => t.name), ['Garage']);
  // a library-only file adds no blank tab
  const libOnly = S.parseImport(JSON.stringify({ app: 'tvmount', version: 1, lib: { tvs: [{ model: 'A1', w: 40 }] } }));
  assert.equal(S.mergeDocs(a, libOnly).tabs.length, 1);
  assert.throws(() => S.parseImport('hello'), /backup/);
  assert.throws(() => S.parseImport('{"app":"counter","tabs":[]}'), /backup/);
});

test('tab add, duplicate, delete', () => {
  const d = S.blank();
  const t2 = S.addTab(d);
  assert.equal(t2.name, 'TV 2');
  assert.equal(d.current, t2.id);
  t2.tv.w = 60;
  const t3 = S.duplicateTab(d, t2.id);
  assert.equal(t3.name, 'TV 2 copy');
  assert.equal(t3.tv.w, 60);
  assert.notEqual(t3.id, t2.id);
  S.deleteTab(d, t3.id);
  assert.equal(d.tabs.length, 2);
  assert.equal(d.current, t2.id);
  S.deleteTab(d, d.tabs[0].id); S.deleteTab(d, d.tabs[0].id);
  assert.equal(d.tabs.length, 1);   // never zero tabs
});

test('saved TVs and mounts by model number', () => {
  const d = S.blank(), t = d.tabs[0];
  Object.assign(t.tv, { model: 'QN65Q80C', w: 57.1, h: 32.7, vesaTop: 7.25, vesaLeft: 18.5, vesaRight: 18.6 });
  const item = S.upsert(d.lib.tvs, S.tvFromTab(t));
  assert.equal(d.lib.tvs.length, 1);
  S.upsert(d.lib.tvs, Object.assign(S.tvFromTab(t), { model: 'qn65q80c ', h: 32.75 }));
  assert.equal(d.lib.tvs.length, 1);
  assert.equal(d.lib.tvs[0].h, 32.75);
  assert.equal(d.lib.tvs[0].id, item.id);
  const t2 = S.addTab(d);
  S.applyTV(t2, d.lib.tvs[0]);
  assert.equal(t2.tv.vesaTop, 7.25);
  assert.equal(t2.tv.src, 'measured');
  Object.assign(t.mount, { model: 'MNT-1', hookDrop: 1.25, armDrop: 0.5, sag: 0.125, slide: 3 });
  S.upsert(d.lib.mounts, S.mountFromTab(t));
  S.applyMount(t2, d.lib.mounts[0]);
  assert.equal(t2.mount.chain, 'split');
  assert.equal(t2.mount.slide, 3);
  // the copied values drive the math the same way
  t2.ref.floor.value = 42;
  const r = G.compute(t2, { mode: 'pro' });
  assert.ok(r.ok);
});
