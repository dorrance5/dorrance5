/* Recipes — the page: the list, the recipe sheet, the editor and Settings.
   The data file and the GitHub calls are in data.js (window.RecipeData). */
(function () {
  'use strict';
  const D = window.RecipeData;
  const $ = id => document.getElementById(id);
  const root = document.documentElement;
  const TOKEN = 'recipes-token', CACHE = 'recipes-cache';
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} }
  };
  const token = () => store.get(TOKEN) || '';
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const ICON = {
    chev: '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>',
    tick: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
    out: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>'
  };

  /* ---- theme: the site setting, key "theme" = auto | light | dark | aurora. Aurora shows as Night. ---- */
  const metas = document.querySelectorAll('meta[name="theme-color"]');
  const shownTheme = () => { const t = store.get('theme'); return t === 'aurora' ? 'dark' : t === 'light' || t === 'dark' ? t : 'auto'; };
  function applyTheme() {
    const t = shownTheme();
    if (t === 'auto') delete root.dataset.theme; else root.dataset.theme = t;
    // a forced theme colors the browser bar with the page background
    const bg = getComputedStyle(document.body).backgroundColor;
    metas.forEach(m => { m.content = t === 'auto' ? (m.media.includes('dark') ? '#141a16' : '#f3f5f2') : bg; });
    document.querySelectorAll('#themeSeg [data-t]').forEach(b => {
      b.classList.toggle('on', b.dataset.t === t);
      b.setAttribute('aria-pressed', b.dataset.t === t);
    });
  }
  $('themeSeg').addEventListener('click', e => {
    const b = e.target.closest('[data-t]');
    if (b) { store.set('theme', b.dataset.t); applyTheme(); }
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
  addEventListener('storage', e => { if (e.key === 'theme') applyTheme(); });

  /* ---- data ---- */
  let data = null, recipes = [];
  function setData(d, fromCache) {
    data = d;
    recipes = D.forView(d);
    if (!fromCache) store.set(CACHE, JSON.stringify(d));
    renderList();
    if (viewId && isOpen(view)) renderView(viewId);
  }
  function note(msg) { $('notice').hidden = !msg; $('notice').textContent = msg; }

  // The saved copy shows at once. With a token the file comes from the API, so a change shows before the site updates.
  async function load() {
    try { setData(D.parse(store.get(CACHE)), true); } catch (e) { $('none').textContent = 'Loading…'; $('none').hidden = false; }
    const tok = token();
    if (tok) {
      try { setData((await D.github(tok).read()).data); note(''); return; }
      catch (e) {
        if (e.code === 'network') return offline();
        note(`${e.message} Showing the copy on the site. Open the menu to fix the token.`);
      }
    }
    let res;
    try { res = await fetch('recipes.json', { cache: 'no-cache' }); } catch (e) { return offline(); }
    try {
      if (!res.ok) throw new Error(res.status);
      setData(D.parse(await res.text()));
    } catch (e) {
      note(data ? 'The recipes could not be loaded. Showing the copy saved on this phone.' : 'The recipes could not be loaded.');
      if (!data) $('none').hidden = true;
    }
  }
  function offline() {
    note(data ? 'No connection. Showing the copy saved on this phone.' : 'No connection, and this phone has no saved copy yet.');
    if (!data) $('none').hidden = true;
  }

  /* ---- list ---- */
  const list = $('list'), q = $('q');
  function sub(r, m, t) {
    if (m && m.ingredients.length) return m.ingredients.map(i => D.hl(i, t)).join(', ');
    const bits = r.tags.map(x => `<span class="tg">${D.hl(x, t)}</span>`);
    bits.push(r.ingredients.length ? plural(r.ingredients.length, 'ingredient') : '<i>No ingredients yet</i>');
    if (m && m.snippet) bits.push(D.hl(m.snippet, t));
    return bits.join(' · ');
  }
  function renderList() {
    const t = q.value.trim();
    const rows = [];
    for (const r of recipes) {
      const m = t ? D.match(r, t) : null;
      if (!t || m) rows.push(`<li><button class="row" type="button" data-id="${D.esc(r.id)}"><span class="txt"><span class="nm">${D.hl(r.name, t)}</span><span class="sub">${sub(r, m, t)}</span></span>${ICON.chev}</button></li>`);
    }
    list.innerHTML = rows.join('');
    $('count').textContent = t ? `${rows.length} of ${plural(recipes.length, 'recipe')}` : plural(recipes.length, 'recipe');
    $('none').hidden = rows.length > 0;
    $('none').textContent = recipes.length ? 'No recipes match that search.' : 'No recipes yet. Tap Add recipe.';
  }
  q.addEventListener('input', renderList);
  q.addEventListener('keydown', e => {
    if (e.key === 'Enter') q.blur();
    if (e.key === 'Escape' && q.value) { q.value = ''; renderList(); }
  });
  list.addEventListener('click', e => { const b = e.target.closest('.row'); if (b) openView(b.dataset.id); });

  // a line under the search field once it sticks to the top
  const searchbar = $('searchbar');
  let ticking = false;
  addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      searchbar.classList.toggle('stuck', scrollY > 0 && searchbar.getBoundingClientRect().top <= parseFloat(getComputedStyle(searchbar).top) + 0.5);
    });
  }, { passive: true });

  /* ---- sheets ---- */
  // Each open sheet is one history entry, so the Android back button closes the top sheet.
  const page = $('page'), fab = $('addBtn'), view = $('view'), editor = $('editor'), settings = $('settings');
  const layers = [view, editor, settings];
  const stack = [];
  let quiet = false;   // the next popstate closes without asking: Cancel and Save already decided
  const top = () => stack[stack.length - 1];
  const isOpen = l => stack.includes(l);
  function setInert() {
    page.inert = fab.inert = stack.length > 0;
    layers.forEach(l => { l.inert = l !== top(); });
    root.classList.toggle('locked', stack.length > 0);
  }
  function show(l, opener) {
    l.opener = opener;
    l.hidden = false;
    l.style.zIndex = 20 + stack.length;
    setInert();
    void l.offsetWidth;   // start the slide from below
    l.classList.add('open');
    l.querySelector('.sheet').focus({ preventScroll: true });
  }
  function hide(l, refocus = true) {
    const sheet = l.querySelector('.sheet');
    sheet.style.transform = '';
    l.classList.remove('open');
    setInert();
    const done = () => { if (!l.classList.contains('open')) l.hidden = true; };
    if (reduceMotion.matches) done(); else setTimeout(done, 340);
    if (refocus && l.opener && l.opener.matches('button, a') && document.contains(l.opener)) l.opener.focus({ preventScroll: true });
    if (l === view) wake(false);
  }
  function open(l) {
    if (isOpen(l)) return;
    const opener = document.activeElement;
    stack.push(l);
    history.pushState({ sheets: stack.length }, '');
    show(l, opener);
  }
  // Puts another sheet in place of the top one, at the same history depth.
  function swap(l) {
    const old = stack.pop();
    stack.push(l);
    hide(old, false);
    show(l, old.opener);
  }
  function back(force) { if (!stack.length) return; quiet = !!force; history.back(); }
  function closeAll() { if (!stack.length) return; quiet = true; history.go(-stack.length); }
  addEventListener('popstate', e => {
    const n = (e.state && e.state.sheets) || 0, force = quiet;
    quiet = false;
    while (stack.length > n) {
      if (top() === editor && !force && dirty() && !confirm('Discard the changes to this recipe?')) {
        history.pushState({ sheets: stack.length }, '');
        return;
      }
      hide(stack.pop());
    }
  });
  if (history.state && history.state.sheets) history.replaceState(null, '');
  layers.forEach(l => l.addEventListener('click', e => { if (e.target.closest('[data-close]')) back(); }));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && stack.length) { e.preventDefault(); back(); } });

  // Drag a sheet down by its top bar to close it.
  layers.forEach(l => {
    const bar = l.querySelector('[data-drag]'), sheet = l.querySelector('.sheet');
    if (!bar) return;
    let y0 = null, dy = 0, t0 = 0;
    bar.addEventListener('pointerdown', e => {
      if (e.button || e.target.closest('button, a')) return;
      y0 = e.clientY; dy = 0; t0 = e.timeStamp;
      sheet.classList.add('dragging');
      bar.setPointerCapture(e.pointerId);
    });
    bar.addEventListener('pointermove', e => {
      if (y0 === null) return;
      dy = Math.max(0, e.clientY - y0);
      sheet.style.transform = `translateY(${dy}px)`;
    });
    const end = e => {
      if (y0 === null) return;
      y0 = null;
      sheet.classList.remove('dragging');
      if (e.type === 'pointerup' && (dy > 90 || (dy > 30 && dy / Math.max(1, e.timeStamp - t0) > 0.5))) back();
      else sheet.style.transform = '';
    };
    bar.addEventListener('pointerup', end);
    bar.addEventListener('pointercancel', end);
  });

  // a line under a sheet's top bar once its body scrolls
  layers.forEach(l => {
    const bar = l.querySelector('.bar'), body = l.querySelector('.body');
    body.addEventListener('scroll', () => bar.classList.toggle('edge', body.scrollTop > 0), { passive: true });
  });

  // Keep the sheets inside the visual viewport, above the phone keyboard.
  const vv = window.visualViewport;
  if (vv) {
    const fit = () => { root.style.setProperty('--vvh', vv.height + 'px'); root.style.setProperty('--vvt', vv.offsetTop + 'px'); };
    vv.addEventListener('resize', fit);
    vv.addEventListener('scroll', fit);
    fit();
  }

  let toastT;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('on'), 2800);
  }

  /* ---- keep the screen on while a recipe is open ---- */
  let lock = null;
  async function wake(on) {
    if (!on) { const l = lock; lock = null; if (l) l.release().catch(() => {}); return; }
    if (lock || !navigator.wakeLock) return;
    try {
      const l = await navigator.wakeLock.request('screen');
      if (!isOpen(view) || lock) { l.release().catch(() => {}); return; }
      lock = l;
      l.addEventListener('release', () => { if (lock === l) lock = null; });
    } catch (e) {}   // refused (low battery, page hidden): the screen can sleep as usual
  }
  // the phone drops the lock when the page is hidden
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && isOpen(view)) wake(true); });

  /* ---- one recipe ---- */
  let viewId = null;
  const vBody = $('vBody');
  const host = u => new URL(u).hostname.replace(/^www\./, '');
  function renderView(id) {
    const r = recipes.find(x => x.id === id);
    if (!r) return false;
    viewId = id;
    const meta = [];
    if (r.servings) meta.push(`<span class="chip plain">${D.esc(/^\d/.test(r.servings) ? 'Serves ' + r.servings : r.servings)}</span>`);
    r.tags.forEach(t => meta.push(`<span class="chip">${D.esc(t)}</span>`));
    const head = (title, hint) => `<div class="v-head"><h3>${title}</h3>${hint ? `<span class="hint">${hint}</span>` : ''}</div>`;
    let html = `<h2 class="v-name" id="vName">${D.esc(r.name)}</h2>${meta.length ? `<div class="v-meta">${meta.join('')}</div>` : ''}`;
    html += head('Ingredients', r.ingredients.length ? 'Tap to check off' : '');
    html += r.ingredients.length
      ? `<ul class="checks">${r.ingredients.map(i => `<li><label><input type="checkbox"><span class="box" aria-hidden="true">${ICON.tick}</span><span class="t">${D.esc(i)}</span></label></li>`).join('')}</ul>`
      : '<p class="empty">No ingredients yet.</p>';
    if (r.steps.length) html += head('Steps') + `<ol class="steps">${r.steps.map(s => `<li><span>${D.esc(s)}</span></li>`).join('')}</ol>`;
    if (r.notes) html += head('Notes') + `<p class="notes">${D.esc(r.notes)}</p>`;
    if (r.source) {
      const url = D.safeUrl(r.source);
      html += head('Source') + (url
        ? `<a class="source" href="${D.esc(url)}" target="_blank" rel="noopener">${ICON.out}${D.esc(host(url))}</a>`
        : `<p class="notes">${D.esc(r.source)}</p>`);
    }
    vBody.innerHTML = html;
    return true;
  }
  function openView(id) {
    if (!renderView(id)) return;
    open(view);
    vBody.scrollTop = 0;
    wake(true);
  }
  $('editBtn').addEventListener('click', () => openEditor(recipes.find(x => x.id === viewId)));

  /* ---- add and edit ---- */
  const F = { name: $('fName'), servings: $('fServings'), tags: $('fTags'), ingredients: $('fIngredients'), steps: $('fSteps'), notes: $('fNotes'), source: $('fSource') };
  const eSave = $('eSave'), eCancel = $('eCancel'), eDelete = $('eDelete'), eBody = $('eBody'), eError = $('eError');
  let editId = null, start = '', busy = false, armT = 0;
  const values = () => Object.fromEntries(Object.keys(F).map(k => [k, F[k].value]));
  const dirty = () => JSON.stringify(values()) !== start;
  // "5 ingredients" and "4 steps" under the fields, so a long step that wraps still counts as one.
  function counts() {
    editor.querySelectorAll('[data-count]').forEach(b => {
      const n = D.lines(F[b.dataset.count].value).length;
      b.textContent = n ? plural(n, b.dataset.count === 'steps' ? 'step' : 'ingredient') : '';
    });
  }
  function grow(ta) {
    const y = eBody.scrollTop;
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 3 + 'px';
    eBody.scrollTop = y;
  }
  function openEditor(r) {
    if (!token()) return openSettings(true);
    editId = r ? r.id : null;
    const v = D.toForm(r || {});
    for (const k in F) { F[k].value = v[k]; F[k].classList.remove('bad'); }
    start = JSON.stringify(values());
    $('eTitle').textContent = r ? 'Edit recipe' : 'New recipe';
    eDelete.hidden = !r;
    disarm();
    error('');
    open(editor);
    editor.querySelectorAll('textarea').forEach(grow);
    counts();
    eBody.scrollTop = 0;
    if (!r) F.name.focus({ preventScroll: true });   // a new recipe starts with the keyboard up
  }
  function error(msg, withSettings) {
    eError.hidden = !msg;
    eError.innerHTML = msg ? D.esc(msg) + (withSettings ? '<br><button class="btn" type="button" data-settings>Open Settings</button>' : '') : '';
    if (msg) eBody.scrollTop = 0;
  }
  eError.addEventListener('click', e => { if (e.target.closest('[data-settings]')) openSettings(false); });
  function setBusy(btn, label) {
    busy = !!label;
    [eSave, eCancel, eDelete].forEach(b => { b.disabled = busy; });
    btn.textContent = label || btn.dataset.label;
  }
  eSave.dataset.label = 'Save';
  eDelete.dataset.label = 'Delete recipe';
  const failText = (e, what) => {
    if (!e.code) console.error(e);
    return `${e.code ? e.message : 'Something went wrong.'} ${what}`;
  };
  const needsSettings = e => e.code === 401 || e.code === 403 || e.code === 404;

  editor.querySelectorAll('textarea').forEach(ta => ta.addEventListener('input', () => { grow(ta); counts(); }));
  // A pasted list loses its leading "-", "•", "*", "1." and "1)" marks, one item on each line.
  [F.ingredients, F.steps].forEach(ta => ta.addEventListener('paste', e => {
    const text = e.clipboardData && e.clipboardData.getData('text/plain');
    if (!text) return;
    const many = /[\r\n]/.test(text.trim());
    if (!many && D.cleanLine(text) === text.trim()) return;
    e.preventDefault();
    let clean = D.cleanPaste(text);
    const s = ta.selectionStart, end = ta.selectionEnd, v = ta.value;
    if (many) {   // a list starts and ends on its own lines
      if (s > 0 && v[s - 1] !== '\n') clean = '\n' + clean;
      if (end < v.length && v[end] !== '\n') clean += '\n';
    }
    if (!document.execCommand('insertText', false, clean)) {
      ta.setRangeText(clean, s, end, 'end');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }));
  // The return key moves to the next field instead of saving.
  [F.name, F.servings, F.tags].forEach((el, i, a) => el.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.isComposing) return;
    e.preventDefault();
    (a[i + 1] || F.ingredients).focus();
  }));
  F.source.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); F.source.blur(); } });
  F.name.addEventListener('input', () => F.name.classList.remove('bad'));

  eCancel.addEventListener('click', () => {
    if (dirty() && !confirm('Discard the changes to this recipe?')) return;
    back(true);
  });
  eSave.addEventListener('click', async () => {
    if (busy) return;
    const v = values();
    if (!v.name.trim()) { error('Give the recipe a name.'); F.name.classList.add('bad'); F.name.focus(); return; }
    const tok = token();
    if (!tok) return openSettings(true);
    error('');
    setBusy(eSave, 'Saving…');
    try {
      const out = await D.github(tok).save(editId ? { type: 'edit', id: editId, form: v } : { type: 'add', form: v });
      start = JSON.stringify(values());
      setData(out.data);
      toast('Saved. The site updates in about a minute.');
      if (!isOpen(editor)) return;
      renderView(out.recipe.id);
      if (editId) back(true);
      else { swap(view); wake(true); }   // show the new recipe
    } catch (e) {
      error(failText(e, 'The change is not saved.'), needsSettings(e));
    } finally {
      setBusy(eSave, '');
    }
  });
  function disarm() { clearTimeout(armT); eDelete.classList.remove('armed'); eDelete.textContent = eDelete.dataset.label; }
  // Delete asks for a second tap.
  eDelete.addEventListener('click', async () => {
    if (busy) return;
    if (!eDelete.classList.contains('armed')) {
      eDelete.classList.add('armed');
      eDelete.textContent = 'Tap again to delete';
      armT = setTimeout(disarm, 4000);
      return;
    }
    disarm();
    const tok = token();
    if (!tok) return openSettings(true);
    error('');
    setBusy(eDelete, 'Deleting…');
    try {
      const out = await D.github(tok).save({ type: 'delete', id: editId });
      setData(out.data);
      toast(out.recipe ? `Deleted ${out.recipe.name}.` : 'Deleted.');
      viewId = null;
      closeAll();
    } catch (e) {
      error(failText(e, 'The recipe is not deleted.'), needsSettings(e));
    } finally {
      setBusy(eDelete, '');
    }
  });
  fab.addEventListener('click', () => openEditor(null));

  /* ---- settings ---- */
  const tok = $('tok'), tokSave = $('tokSave'), sResult = $('sResult');
  function statusLine() {
    $('sStatus').innerHTML = token()
      ? `Connected. Saves go to <b>${D.REPO}</b>.`
      : 'Not connected. Anyone can read the recipes. To add or edit them, paste a GitHub token.';
  }
  function result(msg, kind) {
    sResult.hidden = !msg;
    sResult.textContent = msg;
    sResult.className = 'alert' + (kind ? ' ' + kind : '');
  }
  function openSettings(need) {
    $('sNeed').hidden = !need;
    tok.value = token();
    result('');
    statusLine();
    applyTheme();
    open(settings);
  }
  $('menuBtn').addEventListener('click', () => openSettings(false));
  async function saveToken() {
    const t = tok.value.trim();
    if (!t) { result('Paste a token first.'); return; }
    if (!/^[\x21-\x7e]+$/.test(t)) { result('That does not look like a GitHub token. Copy it again from GitHub.'); return; }
    tokSave.disabled = true;
    tokSave.textContent = 'Testing…';
    result('');
    try {
      const gh = D.github(t);
      const { data: d } = await gh.read();
      store.set(TOKEN, t);
      setData(d);
      note('');
      $('sNeed').hidden = true;
      statusLine();
      try { await gh.canWrite(); result('Connected. You can add and edit recipes now.', 'ok'); }
      catch (e) {
        if (e.code === 403 || e.code === 404) result('Saved, but this token can only read. In GitHub, set Contents to “Read and write”, or saves will fail.');
        else result('Connected. You can add and edit recipes now.', 'ok');
      }
    } catch (e) {
      result(failText(e, 'The token is not saved.'));
    } finally {
      tokSave.disabled = false;
      tokSave.textContent = 'Save and test';
    }
  }
  tokSave.addEventListener('click', saveToken);
  tok.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); saveToken(); } });
  $('tokOff').addEventListener('click', () => {
    store.del(TOKEN);
    tok.value = '';
    statusLine();
    result('Disconnected. The token is removed from this phone.', 'ok');
  });

  applyTheme();
  load();
})();
