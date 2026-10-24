/* Recipes — the page: the list, the recipe sheet, the editor and Settings.
   The data file and the calls to the API Worker are in data.js (window.RecipeData). */
(function () {
  'use strict';
  const D = window.RecipeData;
  const $ = id => document.getElementById(id);
  const root = document.documentElement;
  const SESSION = 'recipes-session', CACHE = 'recipes-cache';
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} }
  };
  // The sign-in from the API Worker, { token, name, admin }, or null.
  function session() {
    try { const s = JSON.parse(store.get(SESSION)); return s && s.token ? s : null; } catch (e) { return null; }
  }
  const worker = () => D.api(session() && session().token);
  store.del('recipes-token');   // a GitHub token from before accounts: the Worker holds the token now
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const ICON = {
    tick: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
    out: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>'
  };

  /* ---- theme: the site setting, key "theme" = auto | light | dark | aurora ---- */
  // Aurora is secret, as in the apps: five taps on "Theme" in Settings within 2 seconds turn it on, and an
  // Aurora button shows, picked, until another theme is picked.
  const metas = document.querySelectorAll('meta[name="theme-color"]');
  const shownTheme = () => { const t = store.get('theme'); return ['light', 'dark', 'aurora'].includes(t) ? t : 'auto'; };
  function applyTheme() {
    const t = shownTheme();
    if (t === 'auto') delete root.dataset.theme; else root.dataset.theme = t;
    // a forced theme colors the browser bar with the page background
    const bg = getComputedStyle(document.body).backgroundColor;
    metas.forEach(m => { m.content = t === 'auto' ? (m.media.includes('dark') ? '#18130f' : '#eadcc2') : bg; });
    document.querySelectorAll('#themeSeg [data-t]').forEach(b => {
      b.classList.toggle('on', b.dataset.t === t);
      b.setAttribute('aria-pressed', b.dataset.t === t);
      if (b.dataset.t === 'aurora') b.hidden = t !== 'aurora';
    });
  }
  function setTheme(t) { store.set('theme', t); applyTheme(); }
  $('themeSeg').addEventListener('click', e => {
    const b = e.target.closest('[data-t]');
    if (b) setTheme(b.dataset.t);
  });
  let taps = [];
  $('themeLabel').addEventListener('click', () => {
    const now = Date.now();
    taps = taps.filter(x => now - x < 2000).concat(now);
    if (taps.length < 5) return;
    taps = [];
    setTheme('aurora');
    toast('Aurora');
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

  // The saved copy shows at once. Signed in, the file comes from GitHub through the Worker, so a change shows
  // before the site updates.
  async function load() {
    try { setData(D.parse(store.get(CACHE)), true); } catch (e) { $('none').textContent = 'Loading…'; $('none').hidden = false; }
    if (session()) {
      try { setData((await worker().read()).data); note(''); return; }
      catch (e) {
        if (e.code === 'network') return offline();
        if (e.code === 'signin') signOut();
        note(`${e.message} Showing the copy on the site.`);
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

  /* ---- list: a deck of index cards, one for each recipe ---- */
  const list = $('list'), q = $('q');
  // Under the name, a search shows why the recipe matched: the ingredients, a tag, or a piece of a step or note.
  function why(r, m, t) {
    if (!m) return '';
    if (m.ingredients.length) return m.ingredients.map(i => D.hl(i, t)).join(', ');
    if (m.snippet) return D.hl(m.snippet, t);
    if (D.hl(r.name, t).includes('<mark>')) return '';
    return r.tags.map(x => D.hl(x, t)).filter(x => x.includes('<mark>')).map(x => `<span class="tg">${x}</span>`).join(' · ');
  }
  function renderList() {
    const t = q.value.trim();
    const cards = [];
    for (const r of recipes) {
      const m = t ? D.match(r, t) : null;
      if (t && !m) continue;
      const w = why(r, m, t);
      cards.push(`<li><button class="card${r.id === pulledId ? ' out' : ''}" type="button" data-id="${D.esc(r.id)}"><span class="face"><span class="nm">${D.hl(r.name, t)}</span>${w ? `<span class="hit">${w}</span>` : ''}</span></button></li>`);
    }
    list.innerHTML = cards.join('');
    $('count').textContent = t ? `${cards.length} of ${plural(recipes.length, 'recipe')}` : plural(recipes.length, 'recipe');
    $('none').hidden = cards.length > 0;
    $('none').textContent = recipes.length ? 'No recipes match that search.' : 'No recipes yet. Tap Add recipe.';
    measure();
  }
  q.addEventListener('input', renderList);
  q.addEventListener('keydown', e => {
    if (e.key === 'Enter') q.blur();
    if (e.key === 'Escape' && q.value) { q.value = ''; renderList(); }
  });
  list.addEventListener('click', e => { const b = e.target.closest('.card'); if (b) openView(b.dataset.id, b); });

  // The deck: index cards leaning back in a box, seen from above, as in the owner's drawing. Each card shows only
  // its top, the name; the next card covers the rest, and a card lower in the list always lies on top. The cards come
  // up from the bottom as the list scrolls. At the top they fall onto each other: each card stops under the search
  // field, the next one slides over it, and older cards pile up behind as thin edges, tipped further back.
  // A card looks tipped back because it is squashed (SQUASH) and drawn narrower at the bottom (the CSS).
  const searchbar = $('searchbar');
  const SQUASH = 0.86, EDGE = 5, PILE = 3;   // the height a card keeps, px of each edge in the pile, edges in the pile
  // Each list item is as tall as its squashed card, less 2 px, so the next card's top edge lies on this card's bottom edge.
  function measure() {
    const cards = [...list.querySelectorAll('.card')];
    const tall = cards.map(c => c.offsetHeight);
    cards.forEach((c, i) => { c.parentElement.style.height = (tall[i] * SQUASH - 2).toFixed(1) + 'px'; });
    deck();
  }
  function deck() {
    const items = [...list.children];
    const base = list.getBoundingClientRect().top;   // the list itself never moves; offsetTop counts from it
    const T = searchbar.offsetHeight + (parseFloat(getComputedStyle(searchbar).top) || 0) + 16;   // where cards stop
    const at = items.map(li => base + li.offsetTop), tall = items.map(li => li.offsetHeight);   // read everything first
    items.forEach((li, i) => {
      // how many cards' worth this card has gone up past the stop; with reduced motion the cards do not pile up
      const k = reduceMotion.matches ? 0 : Math.max(0, (T - at[i]) / tall[i]), deep = Math.min(PILE, k);
      const c = li.firstElementChild;
      c.style.transform = k
        ? `translateY(${(T - EDGE * deep - at[i]).toFixed(1)}px) scale(${(1 - 0.02 * deep).toFixed(3)}, ${(SQUASH * (1 - 0.2 * deep)).toFixed(3)})`
        : `scaleY(${SQUASH})`;
      c.style.setProperty('--turn', Math.min(0.3, 0.1 * k).toFixed(3));
      c.style.setProperty('--fade', Math.max(0, 1 - k).toFixed(3));   // a name fades as the next card covers it
    });
  }
  // a line under the search field once it sticks to the top
  function stick() {
    searchbar.classList.toggle('stuck', scrollY > 0 && searchbar.getBoundingClientRect().top <= (parseFloat(getComputedStyle(searchbar).top) || 0) + 0.5);
  }
  let frame = 0;
  const onScroll = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; stick(); deck(); }); };
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', () => requestAnimationFrame(() => { stick(); measure(); }));
  reduceMotion.addEventListener('change', deck);
  if (document.fonts) document.fonts.ready.then(measure);

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
    const card = l === view ? putBack(sheet) : null;
    if (!card) sheet.style.transform = '';
    l.classList.remove('open');
    setInert();
    const opener = refocus && l.opener && l.opener.matches('button, a') ? l.opener : null;
    const focus = () => { if (opener && document.contains(opener)) opener.focus({ preventScroll: true }); };
    const done = () => {
      if (l.classList.contains('open')) return;
      l.hidden = true;
      if (card) { settle(sheet); focus(); }
    };
    if (reduceMotion.matches) done(); else setTimeout(done, card ? 440 : 340);
    if (!card) focus();   // a card that is still going back cannot take the focus yet
    if (l === view) wake(false);
  }

  // The recipe sheet grows out of the card that was tapped, and shrinks back into it when it closes.
  // The card stays hidden (class "out") while its recipe is open.
  let pulledId = null, pullT = 0;
  const cardFor = id => id ? list.querySelector(`.card[data-id="${CSS.escape(id)}"]`) : null;
  // the part of a card that shows: in the stack, the card below covers all but its name
  function shown(card) {
    const r = card.getBoundingClientRect(), li = card.parentElement.nextElementSibling;
    const below = li ? li.firstElementChild.getBoundingClientRect().top : Infinity;
    return below < r.bottom ? { top: r.top, left: r.left, right: r.right, bottom: below, height: Math.max(0, below - r.top) } : r;
  }
  // the clip that leaves only the part of the sheet over the card r
  const clipTo = (s, r) => `inset(0 ${Math.max(0, s.right - r.right)}px ${Math.max(0, s.height - r.height)}px ${Math.max(0, r.left - s.left)}px round 5px)`;
  function pullOut(card) {
    list.querySelectorAll('.card.out').forEach(c => c.classList.remove('out'));
    pulledId = null;
    if (reduceMotion.matches) return;
    const sheet = view.querySelector('.sheet');
    clearTimeout(pullT);
    sheet.classList.remove('pulling');
    sheet.classList.add('still');
    sheet.style.transform = sheet.style.clipPath = '';
    const s = sheet.getBoundingClientRect(), r = shown(card);
    sheet.style.transform = `translateY(${r.top - s.top}px)`;
    sheet.style.clipPath = clipTo(s, r);
    card.classList.add('out');
    pulledId = card.dataset.id;
    void sheet.offsetWidth;
    sheet.classList.replace('still', 'pulling');
    sheet.style.transform = '';
    sheet.style.clipPath = `inset(0 round ${getComputedStyle(sheet).borderRadius})`;
    pullT = setTimeout(() => { sheet.classList.remove('pulling'); sheet.style.clipPath = ''; }, 460);
  }
  // Starts the sheet back toward its card. Returns the card, or null when the sheet slides down as usual
  // (the recipe was deleted, the search hides it, or the card is off the screen).
  function putBack(sheet) {
    const card = reduceMotion.matches ? null : cardFor(pulledId);
    const r = card && shown(card);
    if (!card || r.bottom < 0 || r.top > innerHeight) { settle(sheet); return null; }
    clearTimeout(pullT);
    sheet.classList.remove('pulling');
    sheet.classList.add('still');
    const dragged = sheet.style.transform;
    sheet.style.transform = 'none';
    const s = sheet.getBoundingClientRect();
    sheet.style.transform = dragged;
    sheet.style.clipPath = `inset(0 round ${getComputedStyle(sheet).borderRadius})`;
    void sheet.offsetWidth;
    sheet.classList.replace('still', 'pulling');
    sheet.style.transform = `translateY(${r.top - s.top}px)`;
    sheet.style.clipPath = clipTo(s, r);
    return card;
  }
  function settle(sheet) {
    clearTimeout(pullT);
    sheet.classList.remove('pulling', 'still');
    sheet.style.transform = sheet.style.clipPath = '';
    const card = cardFor(pulledId);
    if (card) card.classList.remove('out');
    pulledId = null;
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
  function openView(id, card) {
    if (!renderView(id)) return;
    open(view);
    if (card) pullOut(card);
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
    if (!session()) return openSettings(true);
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
  // A save that failed because the sign-in ended: sign out here too, and offer Settings to sign in again.
  const needsSettings = e => { if (e.code === 'signin') signOut(); return e.code === 'signin'; };

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
    if (!session()) return openSettings(true);
    error('');
    setBusy(eSave, 'Saving…');
    try {
      const out = await worker().save(editId ? { type: 'edit', id: editId, form: v } : { type: 'add', form: v });
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
    if (!session()) return openSettings(true);
    error('');
    setBusy(eDelete, 'Deleting…');
    try {
      const out = await worker().save({ type: 'delete', id: editId });
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

  /* ---- settings: the theme, the account, and for the admin, the accounts to approve ---- */
  const aForm = $('aForm'), aName = $('aName'), aPass = $('aPass'), aGo = $('aGo'), aSwap = $('aSwap');
  const sResult = $('sResult'), people = $('people'), menuBtn = $('menuBtn');
  let making = false;   // the form asks for a new account instead of signing in
  let folks = [];       // the admin's list: { key, name, status, created }
  function result(msg, kind) {
    sResult.hidden = !msg;
    sResult.textContent = msg;
    sResult.className = 'alert' + (kind ? ' ' + kind : '');
  }
  const problem = e => { if (!e.code) console.error(e); return e.code ? e.message : 'Something went wrong.'; };
  function account() {
    const s = session();
    aForm.hidden = !!s;
    $('aIn').hidden = !s;
    $('aAdmin').hidden = !(s && s.admin);
    if (s) $('aWho').innerHTML = `Signed in as <b>${D.esc(s.name)}</b>${s.admin ? ', the admin' : ''}. You can add and edit recipes.`;
    $('aStatus').textContent = making ? 'Pick a name and a password. The admin approves new accounts.' : 'Sign in to add and edit recipes.';
    aPass.autocomplete = making ? 'new-password' : 'current-password';
    $('aPassHint').hidden = !making;
    aGo.textContent = making ? 'Create account' : 'Sign in';
    aSwap.textContent = making ? 'I have an account' : 'New here? Create an account';
  }
  function openSettings(need) {
    $('sNeed').hidden = !need;
    result('');
    making = false;
    account();
    if (session() && session().admin) loadFolks();
    applyTheme();
    open(settings);
  }
  menuBtn.addEventListener('click', () => openSettings(false));
  aSwap.addEventListener('click', () => { making = !making; result(''); account(); });
  aName.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); aPass.focus(); } });
  aForm.addEventListener('submit', async e => {
    e.preventDefault();
    if (aGo.disabled) return;
    const name = aName.value.trim().replace(/\s+/g, ' '), pw = aPass.value;
    if (!name) { result('Type your name.'); aName.focus(); return; }
    if (!pw) { result('Type your password.'); aPass.focus(); return; }
    if (making && pw.length < 8) { result(D.fail('password').message); aPass.focus(); return; }
    aGo.disabled = aSwap.disabled = true;
    aGo.textContent = making ? 'Creating…' : 'Signing in…';
    result('');
    try {
      if (making) {
        const out = await D.api().signup(name, pw);
        making = false;
        aPass.value = '';
        result(`Thanks, ${out.name}. Your account is waiting for ${out.admin} to approve it. Then sign in here.`, 'ok');
      } else {
        const out = await D.api().login(name, pw);
        store.set(SESSION, JSON.stringify({ token: out.token, name: out.name, admin: out.admin }));
        aPass.value = '';
        $('sNeed').hidden = true;
        result('Signed in. You can add and edit recipes now.', 'ok');
        if (out.admin) loadFolks();
        load();   // the newest copy, from GitHub
      }
    } catch (err) {
      result(problem(err));
    } finally {
      aGo.disabled = aSwap.disabled = false;
      account();
    }
  });
  function signOut() { store.del(SESSION); dot(0); }
  $('aOut').addEventListener('click', () => {
    const s = session();
    signOut();
    account();
    result('Signed out.', 'ok');
    if (s) D.api(s.token).logout().catch(() => {});   // ends the sign-in on the Worker too
  });

  // A dot on the menu button while accounts wait for the admin.
  function dot(n) {
    menuBtn.classList.toggle('dot', n > 0);
    menuBtn.setAttribute('aria-label', n > 0 ? `Menu, ${plural(n, 'account')} waiting for approval` : 'Menu');
  }
  async function checkWaiting() {
    const s = session();
    if (!s || !s.admin) return;
    try { dot((await D.api(s.token).me()).waiting); } catch (e) { if (e.code === 'signin') signOut(); }
  }
  async function loadFolks() {
    const s = session();
    people.innerHTML = '<li class="none">Loading…</li>';
    try { folks = await D.api(s.token).users(); }
    catch (e) {
      if (e.code === 'signin') { signOut(); account(); }
      people.innerHTML = `<li class="none">${D.esc(problem(e))}</li>`;
      return;
    }
    drawFolks();
  }
  const day = iso => { const d = new Date(iso + 'T12:00:00'); return isNaN(d) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); };
  function drawFolks() {
    const later = p => p.status === 'pending' ? 0 : 1;   // the people waiting come first
    folks.sort((a, b) => later(a) - later(b) || a.name.localeCompare(b.name));
    dot(folks.filter(p => p.status === 'pending').length);
    people.innerHTML = folks.length ? folks.map(p => {
      const k = D.esc(p.key), name = `<span class="who"><b>${D.esc(p.name)}</b>`;
      return p.status === 'pending'
        ? `<li>${name}<small>Asked ${day(p.created)}</small></span><button class="btn solid" type="button" data-approve="${k}">Approve</button><button class="btn" type="button" data-remove="${k}" data-label="Deny">Deny</button></li>`
        : `<li>${name}<small>Can add and edit</small></span><button class="btn" type="button" data-remove="${k}" data-label="Remove">Remove</button></li>`;
    }).join('') : '<li class="none">No one has asked for an account yet.</li>';
  }
  function unarm() { people.querySelectorAll('.armed').forEach(b => { b.classList.remove('armed'); b.textContent = b.dataset.label; }); }
  people.addEventListener('click', async e => {
    const b = e.target.closest('button'), s = session();
    if (!b || b.disabled || !s) return;
    const key = b.dataset.approve ?? b.dataset.remove, p = folks.find(x => x.key === key);
    if (b.dataset.remove != null && !b.classList.contains('armed')) {   // Deny and Remove ask for a second tap
      unarm();
      b.classList.add('armed');
      b.textContent = 'Tap again';
      return;
    }
    unarm();
    b.disabled = true;
    result('');
    try {
      if (b.dataset.approve != null) {
        await D.api(s.token).approve(key);
        p.status = 'approved';
        toast(`${p.name} can add and edit recipes now.`);
      } else {
        await D.api(s.token).remove(key);
        folks = folks.filter(x => x !== p);
        toast(p.status === 'pending' ? `${p.name} is turned down.` : `${p.name} is removed.`);
      }
      drawFolks();
    } catch (err) {
      result(problem(err));
      if (err.code === 'nobody') loadFolks(); else b.disabled = false;
    }
  });

  applyTheme();
  load();
  checkWaiting();
})();
