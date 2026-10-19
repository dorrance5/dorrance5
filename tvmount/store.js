/* TV Mount — saved data. Plain functions; the app hands in localStorage.
   Everything lives in one JSON doc under "tvmount.data" with a version number.
   An older doc is copied to "tvmount.backup.v<N>" untouched, then migrated forward.
   Browser: window.Store. Node: require('./store.js'). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./geometry.js'));
  else root.Store = factory(root.Geo);
})(typeof self !== 'undefined' ? self : this, function (Geo) {
  'use strict';

  const VERSION = 2;
  const KEY = 'tvmount.data';
  const isNum = v => typeof v === 'number' && isFinite(v);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const clone = o => JSON.parse(JSON.stringify(o));

  // VESA hole spacing is in millimeters, as TV specs list it. It was in inches before version 2:
  // a measured 15 3/4" becomes 400, the standard size within 7 mm, or else whole millimeters.
  const VESA_SIZES = [50, 75, 100, 150, 200, 250, 300, 350, 400, 450, 500, 600, 700, 800];
  function vesaMm(inches) {
    if (!isNum(inches)) return inches;
    const mm = inches * 25.4, std = VESA_SIZES.reduce((a, b) => Math.abs(b - mm) < Math.abs(a - mm) ? b : a);
    return Math.abs(std - mm) <= 7 ? std : Math.round(mm);
  }
  function vesaToMm(tv) { if (tv && typeof tv === 'object') { tv.vesaW = vesaMm(tv.vesaW); tv.vesaH = vesaMm(tv.vesaH); } }

  // STEPS[n] turns a version-n doc into version n+1.
  const STEPS = {
    // unversioned: a bare array of tabs, or a doc saved before the version field existed
    0: d => Object.assign(Array.isArray(d) ? { tabs: d } : Object.assign({}, d), { version: 1 }),
    // VESA spacing from inches to millimeters, in the tabs and the saved TVs
    1: d => {
      (Array.isArray(d.tabs) ? d.tabs : []).forEach(t => t && vesaToMm(t.tv));
      (d.lib && Array.isArray(d.lib.tvs) ? d.lib.tvs : []).forEach(vesaToMm);
      return Object.assign(d, { version: 2 });
    }
  };

  const SETTINGS = { mode: 'simple', prec: 16, dec: false, shot: 'client' };
  const TV_ITEM = { model: '', w: null, h: null, vesaTop: null, vesaW: null, vesaH: null };
  const MOUNT_ITEM = {
    model: '', holesFrom: 'top', holesToTop: null, holesToBottom: null, hookDrop: null, armDrop: null, sag: null, plateW: null, plateH: null,
    holeDown: null, rowGap: null, lagSpan: null, slide: null, adjUp: null, adjDown: null, studsNeeded: null
  };

  // Fill missing fields from a template and keep fields it doesn't know (a newer app may have
  // written them). Template null = number field: finite number or null.
  function conform(tpl, val) {
    const out = val && typeof val === 'object' && !Array.isArray(val) ? Object.assign({}, val) : {};
    for (const k of Object.keys(tpl)) {
      const d = tpl[k], v = out[k];
      if (d === null) out[k] = isNum(v) ? v : null;
      else if (Array.isArray(d)) out[k] = Array.isArray(v) ? v.filter(isNum) : d.slice();
      else if (typeof d === 'object') out[k] = conform(d, v);
      else out[k] = typeof v === typeof d ? v : d;
    }
    return out;
  }

  function newTab(name) { return Object.assign({ id: 't' + uid() }, Geo.newTab(name)); }
  // Fills fields a saved tab lacks. New tabs start on a standard size, half a distance and the
  // TV bottom; a saved tab without those fields came from before, when the defaults were measured,
  // two marks, and the TV center on the floor and TV top under the ceiling.
  const SAVED_TAB = (() => {
    const t = Geo.newTab();
    t.tv.src = 'measured'; t.center.mode = 'two'; t.ref.floor.edge = 'center'; t.ref.ceiling.edge = 'top';
    return t;
  })();
  function blank() {
    const t = newTab('Living room');
    return { version: VERSION, settings: Object.assign({}, SETTINGS), tabs: [t], current: t.id, lib: { tvs: [], mounts: [] } };
  }

  function items(list, tpl, prefix) {
    const seen = new Set();
    return (Array.isArray(list) ? list : []).filter(x => x && typeof x === 'object').map(x => {
      const c = conform(tpl, x);
      c.id = typeof x.id === 'string' && x.id && !seen.has(x.id) ? x.id : prefix + uid();
      seen.add(c.id);
      return c;
    });
  }

  function normalize(d, opts) {
    d = d && typeof d === 'object' ? d : {};
    const doc = Object.assign({}, d);
    doc.version = Math.max(VERSION, isNum(d.version) ? d.version : 0);   // never lower a newer doc's version
    doc.settings = conform(SETTINGS, d.settings);
    if (![8, 16, 32].includes(doc.settings.prec)) doc.settings.prec = 16;
    if (!['simple', 'pro'].includes(doc.settings.mode)) doc.settings.mode = 'simple';
    if (!['client', 'crew'].includes(doc.settings.shot)) doc.settings.shot = 'client';   // who the screenshot is for
    doc.tabs = items(d.tabs, SAVED_TAB, 't').map(t => {
      if (!t.name.trim()) t.name = 'TV';
      return t;
    });
    if (!doc.tabs.length && !(opts && opts.allowEmpty)) doc.tabs.push(newTab('Living room'));
    if (!doc.tabs.some(t => t.id === doc.current)) doc.current = doc.tabs.length ? doc.tabs[0].id : null;
    const lib = d.lib && typeof d.lib === 'object' ? d.lib : {};
    doc.lib = Object.assign({}, lib, { tvs: items(lib.tvs, TV_ITEM, 'v'), mounts: items(lib.mounts, MOUNT_ITEM, 'm') });
    return doc;
  }

  const versionOf = d => Array.isArray(d) ? 0 : d && isNum(d.version) ? d.version : 0;

  function migrate(d, opts) {
    if (!d || typeof d !== 'object') return normalize({}, opts);
    let doc = clone(d), v = versionOf(doc);
    while (v < VERSION) { doc = STEPS[v](doc); v = versionOf(doc); }
    return normalize(doc, opts);
  }

  function load(storage) {
    let raw = null;
    try { raw = storage.getItem(KEY); } catch (e) {}
    if (!raw) return { doc: blank(), fresh: true };
    let d;
    try { d = JSON.parse(raw); } catch (e) {
      keep(storage, 'unreadable', raw);
      return { doc: blank(), error: 'Saved data couldn’t be read. A copy was kept as a backup.' };
    }
    const v = versionOf(d);
    if (v < VERSION) keep(storage, 'v' + v, raw);
    return { doc: migrate(d), from: v < VERSION ? v : null };
  }
  function keep(storage, tag, raw) { try { storage.setItem('tvmount.backup.' + tag, raw); } catch (e) {} }
  function save(storage, doc) { try { storage.setItem(KEY, JSON.stringify(doc)); return true; } catch (e) { return false; } }

  /* ---------- backup files ---------- */

  function exportText(doc) {
    return JSON.stringify(Object.assign({ app: 'tvmount', exported: new Date().toISOString() }, doc), null, 2);
  }
  function parseImport(text) {
    let d;
    try { d = JSON.parse(text); } catch (e) { throw new Error('That file isn’t a TV Mount backup.'); }
    const ok = Array.isArray(d) || (d && typeof d === 'object' && (Array.isArray(d.tabs) || (d.lib && typeof d.lib === 'object')));
    if (!ok || (d.app && d.app !== 'tvmount')) throw new Error('That file isn’t a TV Mount backup.');
    const doc = migrate(d, { allowEmpty: true });
    delete doc.app; delete doc.exported;
    return doc;
  }
  // Imported tabs and saved items replace ones with the same id; the rest are added.
  function mergeDocs(cur, inc) {
    const out = clone(cur);
    const put = (list, x) => { const i = list.findIndex(y => y.id === x.id); if (i >= 0) list[i] = clone(x); else list.push(clone(x)); };
    for (const t of inc.tabs) put(out.tabs, t);
    for (const x of inc.lib.tvs) put(out.lib.tvs, x);
    for (const x of inc.lib.mounts) put(out.lib.mounts, x);
    return normalize(out);
  }
  function replaceDoc(cur, inc) {
    const out = normalize(clone(inc));
    out.settings = Object.assign({}, cur.settings, inc.settings);
    return out;
  }

  /* ---------- tabs ---------- */

  function addTab(doc, name) { const t = newTab(name || nextName(doc)); doc.tabs.push(t); doc.current = t.id; return t; }
  function duplicateTab(doc, id) {
    const src = doc.tabs.find(t => t.id === id);
    if (!src) return null;
    const t = Object.assign(clone(src), { id: 't' + uid(), name: src.name + ' copy' });
    doc.tabs.splice(doc.tabs.indexOf(src) + 1, 0, t);
    doc.current = t.id;
    return t;
  }
  function deleteTab(doc, id) {
    const i = doc.tabs.findIndex(t => t.id === id);
    if (i < 0) return;
    doc.tabs.splice(i, 1);
    if (!doc.tabs.length) doc.tabs.push(newTab('Living room'));
    if (doc.current === id) doc.current = doc.tabs[Math.min(i, doc.tabs.length - 1)].id;
  }
  function nextName(doc) {
    let n = doc.tabs.length + 1;
    while (doc.tabs.some(t => t.name === 'TV ' + n)) n++;
    return 'TV ' + n;
  }

  /* ---------- saved TVs and mounts ---------- */

  const pick = (tpl, src) => { const o = {}; for (const k of Object.keys(tpl)) o[k] = src[k] === undefined ? tpl[k] : src[k]; return conform(tpl, o); };
  const tvFromTab = tab => pick(TV_ITEM, tab.tv);
  const mountFromTab = tab => pick(MOUNT_ITEM, tab.mount);
  function applyTV(tab, item) {
    for (const k of Object.keys(TV_ITEM)) tab.tv[k] = item[k] === undefined ? TV_ITEM[k] : item[k];
    tab.tv.src = 'measured';
  }
  function applyMount(tab, item) {
    for (const k of Object.keys(MOUNT_ITEM)) tab.mount[k] = item[k] === undefined ? MOUNT_ITEM[k] : item[k];
    if (isNum(item.hookDrop) && isNum(item.armDrop) && !isNum(item.holesToTop) && !isNum(item.holesToBottom)) tab.mount.chain = 'split';
  }
  // Save by model number: an existing entry with the same model (any case) is updated.
  function upsert(list, item) {
    const key = String(item.model || '').trim().toLowerCase();
    const i = list.findIndex(x => String(x.model || '').trim().toLowerCase() === key);
    if (i >= 0) { list[i] = Object.assign({}, item, { id: list[i].id }); return list[i]; }
    const x = Object.assign({ id: 'l' + uid() }, item);
    list.push(x);
    return x;
  }

  return {
    VERSION, KEY, STEPS, SETTINGS, TV_ITEM, MOUNT_ITEM, vesaMm,
    conform, normalize, migrate, load, save, blank, newTab,
    exportText, parseImport, mergeDocs, replaceDoc,
    addTab, duplicateTab, deleteTab, nextName,
    tvFromTab, mountFromTab, applyTV, applyMount, upsert
  };
});
