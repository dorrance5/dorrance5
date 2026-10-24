/* Recipes — the page: the recipe box, one recipe, cooking mode, the editor and Settings.
   The data file and the saves are in data.js (window.RecipeData). The dorrance.me sign-in is shared/account.js
   (window.Account): one sign-in for every page on the site. */
(function () {
  'use strict';
  const D = window.RecipeData, A = window.Account;
  const $ = id => document.getElementById(id);
  const root = document.documentElement;
  const CACHE = 'recipes-cache', WAITING = 'recipes-waiting';
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} }
  };
  const session = () => A.session();   // { token, name, admin }, or null
  const worker = () => D.api(session() && session().token);
  store.del('recipes-token');   // a GitHub token from before accounts: the Worker holds the token now
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const svg = (d, w = 2.2, size = 22) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICON = {
    out: svg('<path d="M14 5h5v5"/><path d="M19 5l-8 8"/><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>', 2.2, 18),
    pot: svg('<path d="M4 11h16v4a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M2 11h2M20 11h2"/><path d="M9 7c0-1.5 1-1.5 1-3M14 7c0-1.5 1-1.5 1-3"/>', 2.2, 24),
    next: svg('<path d="M9 5l7 7-7 7"/>', 2.6),
    tick: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 2.6),
    plus: svg('<path d="M12 5v14M5 12h14"/>', 2.6, 16)
  };

  /* ---- colors: each category has one; a recipe takes the color of its first category ---- */
  const BUTTER = ['#F6C945', '#2A1D17'];
  const FIXED = { soup: ['#C63A24', '#FFF6E6'], 'crock pot': ['#E07B2E', '#2A1D17'] };
  // basil, blueberry, plum, teal and cinnamon, each with cream text at 4.5:1 or more
  const MORE = [['#4F7A3A', '#FFF6E6'], ['#3B5B8C', '#FFF6E6'], ['#7A3B69', '#FFF6E6'], ['#2F6B66', '#FFF6E6'], ['#8A4B2A', '#FFF6E6']];
  const hash = s => { let h = 0; for (const ch of s) h = (h * 31 + ch.codePointAt(0)) >>> 0; return h; };
  function colorOf(tag) {
    if (!tag) return BUTTER;
    const k = tag.toLowerCase();
    return FIXED[k] || MORE[hash(k) % MORE.length];
  }
  const ALL = ['var(--solid)', 'var(--on-solid)'];   // the All divider: ink by day, cream at night
  const paint = ([c, f]) => `--c:${c};--cf:${f}`;
  const FACES = [['#C63A24', '#FFF6E6'], BUTTER, ['#E07B2E', '#2A1D17'], ['#2A1D17', '#FFF6E6'], ['#FCE7A6', '#2A1D17'], ...MORE];
  const face = name => FACES[hash(String(name).toLowerCase()) % FACES.length];

  /* ---- theme: the site setting, key "theme" = auto | light | dark | aurora ---- */
  // This page has Auto, Day and Night. Aurora, which the apps have, shows as Night here and stays saved.
  const meta = document.querySelector('meta[name="theme-color"]');
  const shownTheme = () => { const t = store.get('theme'); return ['light', 'dark', 'aurora'].includes(t) ? t : 'auto'; };
  function applyTheme() {
    const t = shownTheme();
    if (t === 'auto') delete root.dataset.theme; else root.dataset.theme = t;
    const on = t === 'aurora' ? 'dark' : t;
    document.querySelectorAll('#themeSeg [data-t]').forEach(b => b.setAttribute('aria-pressed', b.dataset.t === on));
    barColor();
  }
  $('themeSeg').addEventListener('click', e => {
    const b = e.target.closest('[data-t]');
    if (b) { store.set('theme', b.dataset.t); applyTheme(); }
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
  addEventListener('storage', e => { if (e.key === 'theme') applyTheme(); });
  // The browser bar takes the color at the top of the screen: the tomato header, or the screen that is open.
  function barColor() {
    const l = top();
    const el = !l ? document.querySelector('.hero') : l === settings ? settings.querySelector('.sethead') : l === cookIng ? cook : l;
    meta.content = getComputedStyle(el).backgroundColor;
  }

  /* ---- data ---- */
  let data = null, recipes = [], loaded = false;
  function setData(d, fromCache) {
    data = d;
    recipes = D.forView(d);
    loaded = true;
    if (!fromCache) store.set(CACHE, JSON.stringify(d));
    renderBox();
    if (viewId && isOpen(view) && !renderView(viewId) && top() === view) back(true);   // deleted on another phone
    if (isOpen(cook)) renderCook();
  }
  function note(msg) { $('notice').hidden = !msg; $('notice').textContent = msg; }

  // The saved copy shows at once. Signed in, the file comes from GitHub through the Worker, so a change shows
  // before the site updates.
  async function load() {
    try { setData(D.parse(store.get(CACHE)), true); } catch (e) { none.textContent = 'Loading…'; none.hidden = false; }
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
      if (!data) none.hidden = true;
    }
  }
  function offline() {
    note(data ? 'No connection. Showing the copy saved on this phone.' : 'No connection, and this phone has no saved copy yet.');
    if (!data) none.hidden = true;
  }

  /* ---- the recipe box: divider tabs, one for each category, and a deck of cards ---- */
  const deck = $('deck'), q = $('q'), none = $('none');
  let tab = '';   // the divider that is open: '' for All, or a category
  const same = (a, b) => a.toLowerCase() === b.toLowerCase();
  // The categories in the box, A to Z, with how many recipes each has. "soup" and "Soup" are one category.
  function categories() {
    const m = new Map();
    for (const r of recipes) for (const t of r.tags) {
      const k = t.toLowerCase();
      if (!m.has(k)) m.set(k, { name: t, n: 0 });
      m.get(k).n++;
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }
  const inTab = r => !tab || r.tags.some(t => same(t, tab));
  // Under the name, a search shows why the recipe matched: the ingredients, a category, or a piece of a step or note.
  function why(r, m, t) {
    if (!m) return '';
    if (m.ingredients.length) return m.ingredients.map(i => D.hl(i, t)).join(', ');
    if (m.snippet) return D.hl(m.snippet, t);
    if (D.hl(r.name, t).includes('<mark>')) return '';
    return r.tags.map(x => D.hl(x, t)).filter(x => x.includes('<mark>')).join(' · ');
  }
  function renderBox() {
    const cats = categories();
    if (tab && !cats.some(c => same(c.name, tab))) tab = '';
    const tabs = [{ name: '', label: 'All', n: recipes.length }, ...cats.map(c => ({ ...c, label: c.name }))];
    $('tabs').innerHTML = tabs.map(c => `<button type="button" data-tab="${D.esc(c.name)}" aria-pressed="${same(c.name, tab)}" style="${paint(c.name ? colorOf(c.name) : ALL)}"><span>${D.esc(c.label)}</span><span class="n">${c.n}</span></button>`).join('');
    $('band').style.cssText = paint(tab ? colorOf(tab) : ALL);
    const t = q.value.trim(), cards = [];
    for (const r of recipes) {
      if (!inTab(r)) continue;
      const m = t ? D.match(r, t) : null;
      if (t && !m) continue;
      const w = why(r, m, t), first = r.tags[0];
      cards.push(`<li><button class="rc" type="button" data-id="${D.esc(r.id)}" style="${paint(colorOf(first))}"><span class="rc-top"><span class="nm serif">${D.hl(r.name, t)}</span>${first ? `<span class="tg">${D.esc(first)}</span>` : ''}</span>${w ? `<span class="hit">${w}</span>` : ''}</button></li>`);
    }
    deck.innerHTML = cards.join('');
    const where = tab ? ` under ${tab}` : '';
    none.hidden = cards.length > 0 || !loaded;
    none.textContent = t ? `No recipe${where} has “${t}”.` : recipes.length ? `No recipes${where} yet.` : session() ? 'No recipes yet. Tap + to add one.' : 'No recipes yet.';
    $('qClear').hidden = !q.value;
  }
  q.addEventListener('input', renderBox);
  q.addEventListener('keydown', e => {
    if (e.key === 'Enter') q.blur();
    if (e.key === 'Escape' && q.value) { q.value = ''; renderBox(); }
  });
  $('qClear').addEventListener('click', () => { q.value = ''; renderBox(); q.focus(); });
  $('tabs').addEventListener('click', e => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    tab = b.dataset.tab;
    renderBox();
    $('tabs').querySelector(`[data-tab="${CSS.escape(tab)}"]`).focus({ preventScroll: true });
    // a shorter list: keep the dividers at the top of the screen, not past the end of the list
    const hero = document.querySelector('.hero').offsetHeight;
    if (scrollY > hero) scrollTo(0, hero);
  });
  deck.addEventListener('click', e => { const b = e.target.closest('.rc'); if (b) openView(b.dataset.id, b); });
  $('addBtn').addEventListener('click', () => openEditor(null));
  $('signInBtn').addEventListener('click', () => openSettings(false));

  /* ---- full screens over the box ---- */
  // Each open screen is one history entry, so the phone's back button closes the top one.
  const page = $('page'), nav = $('nav');
  const view = $('view'), cook = $('cook'), cookIng = $('cookIng'), editor = $('editor'), settings = $('settings');
  const layers = [view, cook, cookIng, editor, settings];
  const stack = [];
  let quiet = false;   // the next popstate closes without asking: Cancel, Save and Delete already decided
  const top = () => stack[stack.length - 1];
  const isOpen = l => stack.includes(l);
  function setInert() {
    page.inert = stack.length > 0;
    layers.forEach(l => { l.inert = l !== top(); });
    root.classList.toggle('locked', stack.length > 0);
    drawNav();
    barColor();
  }
  function show(l, opener) {
    l.opener = opener;
    l.hidden = false;
    l.style.zIndex = 20 + stack.length;
    l.scrollTop = 0;
    setInert();
    void l.offsetWidth;   // start the slide from off the screen
    l.classList.add('open');
    l.focus({ preventScroll: true });
  }
  function hide(l, refocus = true) {
    l.classList.remove('open');
    setInert();
    const o = refocus && l.opener;
    if (o && o.matches && o.matches('button, a, input') && document.contains(o) && !o.closest('[inert]')) o.focus({ preventScroll: true });
    const done = () => { if (!l.classList.contains('open')) l.hidden = true; };
    if (reduceMotion.matches) done(); else setTimeout(done, 340);
    if (l === cook) stopTimers();
    wakeCheck();
  }
  // `opener` gets the focus back when the screen closes. A tap does not focus a button in Safari, so a tapped button is
  // passed in.
  function open(l, opener = document.activeElement) {
    if (isOpen(l)) return;
    stack.push(l);
    history.pushState({ sheets: stack.length }, '');
    show(l, opener);
  }
  // Puts another screen in place of the top one, at the same history depth.
  function swap(l) {
    const old = stack.pop();
    stack.push(l);
    hide(old, false);
    show(l, old.opener);
  }
  function back(force) { if (!stack.length) return; quiet = !!force; history.back(); }
  function closeAll() { if (!stack.length) return; quiet = true; history.go(-stack.length); }
  // A screen that asks before it closes: the editor with changes, cooking mode with a timer that runs.
  function stays(l) {
    if (l === editor && dirty()) return !confirm('Discard the changes to this recipe?');
    if (l === cook && running()) return !confirm('A timer is running. Stop it and leave cooking mode?');
    return false;
  }
  addEventListener('popstate', e => {
    const n = (e.state && e.state.sheets) || 0, force = quiet;
    quiet = false;
    while (stack.length > n) {
      if (!force && stays(top())) { history.pushState({ sheets: stack.length }, ''); return; }
      hide(stack.pop());
    }
  });
  if (history.state && history.state.sheets) history.replaceState(null, '');
  layers.forEach(l => l.addEventListener('click', e => { if (e.target.closest('[data-close]')) back(); }));
  cookIng.addEventListener('click', e => { if (e.target === cookIng) back(); });   // a tap on the dim part
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && stack.length) { e.preventDefault(); back(); }
    if (top() === cook && !e.target.closest('input, textarea') && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      e.preventDefault();
      (e.key === 'ArrowRight' ? $('cNext') : $('cBack')).click();
    }
  });

  // The tab bar: Recipes and Settings, for anyone signed in, on the box and on Settings. Settings opened over another
  // screen (to sign in again during a save) has a back button instead, and so has Settings for someone signed out.
  function drawNav() {
    const s = !!session(), alone = top() === settings && stack.length === 1, on = s && (!top() || alone);
    nav.hidden = !on;
    nav.inert = !on;
    document.body.classList.toggle('has-nav', s);
    nav.querySelectorAll('[data-go]').forEach(b => {
      const here = b.dataset.go === 'settings' ? alone : !top();
      if (here) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    $('sBack').hidden = s && alone;
    $('sBackText').textContent = stack.length > 1 ? 'Back' : 'Recipe box';
  }
  nav.addEventListener('click', e => {
    const b = e.target.closest('[data-go]');
    if (!b) return;
    if (b.dataset.go === 'box') { if (top() === settings) closeAll(); else scrollTo({ top: 0, behavior: reduceMotion.matches ? 'auto' : 'smooth' }); }
    else if (top() !== settings) openSettings(false);
  });

  // Keep the screens inside the visual viewport, above the phone keyboard.
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

  /* ---- keep the screen on while a recipe or cooking mode is open ---- */
  let lock = null;
  const wanted = () => isOpen(view) || isOpen(cook);
  async function wakeCheck() {
    if (!wanted()) { const l = lock; lock = null; if (l) l.release().catch(() => {}); return; }
    if (lock || !navigator.wakeLock) return;
    try {
      const l = await navigator.wakeLock.request('screen');
      if (!wanted() || lock) { l.release().catch(() => {}); return; }
      lock = l;
      l.addEventListener('release', () => { if (lock === l) lock = null; });
    } catch (e) {}   // refused (low battery, page hidden): the screen can sleep as usual
  }
  // the phone drops the lock when the page is hidden
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') wakeCheck(); });

  /* ---- one recipe: an index card ---- */
  let viewId = null, half = 'ing';   // half: the ingredients or the steps
  const vBody = $('vBody');
  const host = u => new URL(u).hostname.replace(/^www\./, '');
  const ingLine = text => { const a = D.amount(text); return `<li>${a.qty ? `<strong>${D.esc(a.qty)}</strong>` : ''}<span>${D.esc(a.what)}</span></li>`; };
  function renderView(id) {
    const r = recipes.find(x => x.id === id);
    if (!r) return false;
    if (id !== viewId) half = 'ing';
    viewId = id;
    const chips = r.tags.map(t => `<span class="chip" style="${paint(colorOf(t))}">${D.esc(t)}</span>`);
    if (r.servings) chips.push(`<span class="chip plain">${D.esc(/^\d/.test(r.servings) ? 'Serves ' + r.servings : r.servings)}</span>`);
    const ings = r.ingredients.length ? `<ul class="lines">${r.ingredients.map(ingLine).join('')}</ul>` : '<p class="empty">No ingredients yet.</p>';
    const steps = `<ol class="lines steps">${r.steps.map((s, i) => `<li><span class="num serif">${i + 1}</span><span>${D.esc(s)}</span></li>`).join('')}</ol>`;
    const seg = r.steps.length
      ? `<div class="seg" role="group" aria-label="Show"><button type="button" data-half="ing" aria-pressed="${half === 'ing'}">Ingredients · ${r.ingredients.length}</button><button type="button" data-half="steps" aria-pressed="${half === 'steps'}">Steps · ${r.steps.length}</button></div>`
      : '';
    let html = `<article class="index" style="${paint(colorOf(r.tags[0]))}"><div class="strip"></div><div class="head">${chips.length ? `<div class="chips">${chips.join('')}</div>` : ''}<h1 class="serif" id="vName">${D.esc(r.name)}</h1></div><div class="rule"></div><div class="body">${seg}${r.steps.length && half === 'steps' ? steps : ings}</div></article>`;
    if (r.steps.length) html += `<button class="pill tomato big" id="cookBtn" type="button">${ICON.pot}<span>Start cooking</span></button>`;
    if (r.notes) html += `<section class="notes"><h2 class="serif">Notes</h2><p>${D.esc(r.notes)}</p></section>`;
    if (r.source) {
      const url = D.safeUrl(r.source);
      html += url
        ? `<a class="source" href="${D.esc(url)}" target="_blank" rel="noopener"><span>From ${D.esc(host(url))}</span>${ICON.out}</a>`
        : `<p class="source">From ${D.esc(r.source)}</p>`;
    }
    vBody.innerHTML = html;
    $('editBtn').hidden = !session();
    return true;
  }
  function openView(id, card) {
    if (!renderView(id)) return;
    open(view, card);
    wakeCheck();
  }
  vBody.addEventListener('click', e => {
    const b = e.target.closest('[data-half]');
    if (b) {
      half = b.dataset.half;
      renderView(viewId);
      vBody.querySelector(`[data-half="${half}"]`).focus({ preventScroll: true });
    }
    if (e.target.closest('#cookBtn')) openCook();
  });
  $('editBtn').addEventListener('click', () => openEditor(recipes.find(x => x.id === viewId)));

  /* ---- cooking mode: one step at a time, and a timer when the step names a time ---- */
  let cookId = null, at = 0, tick = 0, audio = null;
  const timers = new Map();   // step number -> { left: seconds, end: the time it ends while it runs, else 0 }
  const cooking = () => recipes.find(x => x.id === cookId);
  const leftOf = t => t.end ? Math.max(0, Math.ceil((t.end - Date.now()) / 1000)) : t.left;
  const running = () => [...timers.values()].some(t => t.end);
  function openCook() {
    const r = recipes.find(x => x.id === viewId);
    if (!r || !r.steps.length) return;
    cookId = r.id;
    at = 0;
    stopTimers();
    renderCook();
    open(cook);
    wakeCheck();
  }
  function renderCook() {
    const r = cooking();
    if (!r || !r.steps.length) return;
    const n = r.steps.length;
    at = Math.min(at, n - 1);
    $('cName').textContent = r.name;
    $('cProgress').innerHTML = r.steps.map((s, k) => `<span${k <= at ? ' class="done"' : ''}></span>`).join('');
    $('cKick').textContent = `Step ${at + 1} of ${n}`;
    $('cText').textContent = r.steps[at];
    $('cBack').disabled = at === 0;
    $('cNext').innerHTML = at === n - 1 ? `${ICON.tick}<span>Done</span>` : `<span>Next step</span>${ICON.next}`;
    $('cIngBtn').hidden = !r.ingredients.length;
    drawTimer();
  }
  function drawTimer() {
    const r = cooking();
    if (!r) return;
    const spec = D.timerFor(r.steps[at] || ''), box = $('cTimer');
    box.hidden = !spec;
    if (spec) {
      const t = timers.get(at), left = t ? leftOf(t) : spec.secs, up = !!t && left === 0;
      $('cWhat').textContent = up ? 'Time’s up' : spec.note;
      $('cClock').textContent = D.clock(left);
      box.classList.toggle('up', up);
      box.classList.toggle('long', spec.secs >= 3600);
      $('cGo').textContent = t && t.end && left ? 'Pause' : up ? 'Again' : t && left < spec.secs ? 'Resume' : 'Start';
    }
    // a timer on another step that runs or is up: a button that goes back to it
    const other = [...timers].filter(([k, t]) => k !== at && (t.end || t.left === 0)).map(([k, t]) => ({ k, left: leftOf(t) })).sort((a, b) => a.left - b.left)[0];
    const pill = $('cElse');
    pill.hidden = !other;
    if (other) {
      pill.dataset.step = other.k;
      pill.classList.toggle('up', other.left === 0);
      pill.textContent = other.left ? `Step ${other.k + 1} timer · ${D.clock(other.left)}` : `Step ${other.k + 1} · Time’s up`;
    }
  }
  function ticking() {
    if (running() && !tick) tick = setInterval(onTick, 250);
    if (!running() && tick) { clearInterval(tick); tick = 0; }
  }
  function onTick() {
    for (const t of timers.values()) if (t.end && t.end <= Date.now()) { t.end = 0; t.left = 0; ring(); }
    drawTimer();
    ticking();
  }
  function stopTimers() { timers.clear(); ticking(); }
  // A sound needs a tap first on a phone: Start makes the sound ready.
  function hearing() {
    try {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!audio && C) audio = new C();
      if (audio && audio.state === 'suspended') audio.resume();
    } catch (e) {}
  }
  function ring() {
    try { if (navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 300]); } catch (e) {}
    if (!audio) return;
    try {
      const t0 = audio.currentTime;
      [0, 0.4, 0.8].forEach(d => {
        const o = audio.createOscillator(), g = audio.createGain();
        o.frequency.value = 880;
        g.gain.setValueAtTime(0.0001, t0 + d);
        g.gain.exponentialRampToValueAtTime(0.3, t0 + d + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.3);
        o.connect(g).connect(audio.destination);
        o.start(t0 + d);
        o.stop(t0 + d + 0.32);
      });
    } catch (e) {}
  }
  $('cGo').addEventListener('click', () => {
    const spec = D.timerFor(cooking().steps[at]);
    if (!spec) return;
    hearing();
    const t = timers.get(at) || { left: spec.secs, end: 0 };
    if (t.end) { t.left = leftOf(t); t.end = 0; }   // pause
    else { if (t.left <= 0) t.left = spec.secs; t.end = Date.now() + t.left * 1000; }   // start, resume or again
    timers.set(at, t);
    drawTimer();
    ticking();
  });
  $('cReset').addEventListener('click', () => { timers.delete(at); drawTimer(); ticking(); });
  const goStep = i => { at = i; renderCook(); cook.scrollTop = 0; };
  $('cBack').addEventListener('click', () => { if (at > 0) goStep(at - 1); });
  $('cNext').addEventListener('click', () => { if (at < cooking().steps.length - 1) goStep(at + 1); else back(); });
  $('cElse').addEventListener('click', e => goStep(+e.currentTarget.dataset.step));
  $('cIngBtn').addEventListener('click', () => {
    $('ciList').innerHTML = cooking().ingredients.map(ingLine).join('');
    open(cookIng);
  });

  /* ---- add and edit ---- */
  const F = { name: $('fName'), servings: $('fServings'), ingredients: $('fIngredients'), steps: $('fSteps'), notes: $('fNotes'), source: $('fSource') };
  const eSave = $('eSave'), eCancel = $('eCancel'), eDelete = $('eDelete'), eError = $('eError'), cats = $('fCats'), newRow = $('fNewRow'), fNew = $('fNew');
  let editId = null, start = '', busy = false, armT = 0;
  let picked = [];   // the categories picked, in the order they were picked; the first one colors the card
  let made = [];     // categories made with New in this editor
  const values = () => ({ ...Object.fromEntries(Object.keys(F).map(k => [k, F[k].value])), tags: picked.join(', ') });
  const dirty = () => JSON.stringify(values()) !== start;
  function drawCats() {
    const names = categories().map(c => c.name);
    for (const t of [...picked, ...made]) if (!names.some(n => same(n, t))) names.push(t);
    const on = n => picked.some(p => same(p, n));
    cats.innerHTML = `<button type="button" data-cat="" aria-pressed="${!picked.length}" style="${paint(BUTTER)}"><i></i><span>None</span></button>`
      + names.map(n => `<button type="button" data-cat="${D.esc(n)}" aria-pressed="${on(n)}" style="${paint(colorOf(n))}"><i></i><span>${D.esc(n)}</span></button>`).join('')
      + `<button type="button" class="new" data-new aria-expanded="${!newRow.hidden}">${ICON.plus}<span>New</span></button>`;
  }
  cats.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.hasAttribute('data-new')) {
      newRow.hidden = !newRow.hidden;
      drawCats();
      if (!newRow.hidden) fNew.focus();
      return;
    }
    const n = b.dataset.cat;
    picked = !n ? [] : picked.some(p => same(p, n)) ? picked.filter(p => !same(p, n)) : [...picked, n];
    drawCats();
    cats.querySelector(`[data-cat="${CSS.escape(n)}"]`).focus({ preventScroll: true });
  });
  function addCat() {
    const n = fNew.value.replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
    if (!n) { fNew.focus(); return; }
    const known = [...categories().map(c => c.name), ...made].find(c => same(c, n)) || n;
    if (!made.some(c => same(c, known)) && !categories().some(c => same(c.name, known))) made.push(known);
    if (!picked.some(p => same(p, known))) picked.push(known);
    fNew.value = '';
    newRow.hidden = true;
    drawCats();
    cats.querySelector(`[data-cat="${CSS.escape(known)}"]`).focus({ preventScroll: true });
  }
  $('fNewAdd').addEventListener('click', addCat);
  fNew.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); addCat(); } });

  // "One per line · 5 ingredients" under the labels, so a long step that wraps still counts as one.
  function counts() {
    const n = D.lines(F.ingredients.value).length, s = D.lines(F.steps.value).length;
    $('fIngHint').textContent = `One per line${n ? ' · ' + plural(n, 'ingredient') : ''}`;
    $('fStepHint').textContent = `One per line${s ? ' · ' + plural(s, 'step') : ''}. A time like “15 minutes” gets a timer.`;
  }
  function grow(ta) {
    const y = editor.scrollTop;
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 3 + 'px';
    editor.scrollTop = y;
  }
  function openEditor(r) {
    if (!session()) return openSettings(true);
    editId = r ? r.id : null;
    const v = D.toForm(r || {});
    for (const k in F) { F[k].value = v[k]; F[k].classList.remove('bad'); }
    picked = r ? r.tags.slice() : [];
    made = [];
    fNew.value = '';
    newRow.hidden = true;
    drawCats();
    start = JSON.stringify(values());
    $('eTitle').textContent = r ? 'Edit recipe' : 'New recipe';
    eDelete.hidden = !r;
    disarm();
    error('');
    open(editor);
    editor.querySelectorAll('textarea').forEach(grow);
    counts();
    if (!r) F.name.focus({ preventScroll: true });   // a new recipe starts with the keyboard up
  }
  function error(msg, withSettings) {
    eError.hidden = !msg;
    eError.innerHTML = msg ? D.esc(msg) + (withSettings ? '<br><button class="pill solid" type="button" data-settings>Sign in again</button>' : '') : '';
    if (msg) editor.scrollTop = 0;
  }
  eError.addEventListener('click', e => { if (e.target.closest('[data-settings]')) openSettings(true); });
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
  // A save that failed because the sign-in ended: sign out here too, and offer to sign in again.
  const needsSignIn = e => { if (e.code === 'signin') signOut(); return e.code === 'signin'; };

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
  [[F.name, F.servings], [F.servings, F.ingredients]].forEach(([el, next]) => el.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.isComposing) return;
    e.preventDefault();
    next.focus();
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
      if (top() !== editor) return;
      renderView(out.recipe.id);
      if (editId) back(true);
      else { swap(view); wakeCheck(); }   // show the new recipe
    } catch (e) {
      error(failText(e, 'The change is not saved.'), needsSignIn(e));
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
      viewId = null;
      setData(out.data);
      toast(out.recipe ? `Deleted ${out.recipe.name}.` : 'Deleted.');
      closeAll();
    } catch (e) {
      error(failText(e, 'The recipe is not deleted.'), needsSignIn(e));
    } finally {
      setBusy(eDelete, '');
    }
  });

  /* ---- settings: the account, the theme, and for the admin, the accounts ---- */
  const aForm = $('aForm'), aName = $('aName'), aPass = $('aPass'), aGo = $('aGo'), aSwap = $('aSwap'), aResult = $('aResult');
  const say = $('sSay'), people = $('sPeople'), waitList = $('sWaitList');
  let making = false;   // the form asks for a new account instead of signing in
  let folks = [];       // the admin's list: { key, name, status, created }
  const problem = e => { if (!e.code) console.error(e); return e.code ? e.message : 'Something went wrong.'; };
  function result(msg, ok) {
    aResult.hidden = !msg;
    aResult.textContent = msg;
    aResult.classList.toggle('ok', !!ok);
  }
  function said(msg) { say.hidden = !msg; say.textContent = msg; }
  function account() {
    const s = session();
    $('sMe').hidden = !s;
    $('aBox').hidden = !!s;
    $('sAdmin').hidden = !(s && s.admin);
    if (s) {
      $('sMeAv').textContent = (s.name[0] || '?').toUpperCase();
      $('sMeAv').style.cssText = paint(face(s.name));
      $('sMeName').textContent = s.name;
      $('sMeRole').textContent = s.admin ? 'Admin · signed in' : 'Signed in';
    }
    $('aTitle').textContent = making ? 'Ask for an account' : 'Sign in';
    $('aNote').textContent = making ? 'Pick a name and a password. The admin approves new accounts.' : 'Anyone can read the recipes. Sign in to add and change them.';
    aPass.autocomplete = making ? 'new-password' : 'current-password';
    aPass.placeholder = making ? '8 characters or more' : '';
    aGo.textContent = making ? 'Ask for an account' : 'Sign in';
    aSwap.textContent = making ? 'I have an account' : 'New here? Ask for an account';
    $('addBtn').hidden = !s;
    $('signInBtn').hidden = !!s;
    drawNav();
    renderBox();
  }
  function openSettings(need) {
    $('sNeed').hidden = !need;
    result('');
    said('');
    making = false;
    account();
    if (session() && session().admin) loadFolks();
    applyTheme();
    open(settings);
  }
  aSwap.addEventListener('click', () => { making = !making; result(''); account(); });
  aName.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); aPass.focus(); } });
  aForm.addEventListener('submit', async e => {
    e.preventDefault();
    if (aGo.disabled) return;
    const name = aName.value.trim().replace(/\s+/g, ' '), pw = aPass.value;
    if (!name) { result('Type your name.'); aName.focus(); return; }
    if (!pw) { result('Type your password.'); aPass.focus(); return; }
    if (making && pw.length < 8) { result(A.fail('password').message); aPass.focus(); return; }
    aGo.disabled = aSwap.disabled = true;
    aGo.textContent = making ? 'Asking…' : 'Signing in…';
    result('');
    try {
      if (making) {
        const out = await A.api().signup(name, pw);
        making = false;
        aPass.value = '';
        result(`Thanks, ${out.name}. Your account is waiting for ${out.admin}. You can sign in once it’s approved.`, true);
      } else {
        const out = await A.signIn(name, pw);
        aPass.value = '';
        $('sNeed').hidden = true;
        toast(`Signed in as ${out.name}.`);
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
  // A sign-in that ended on the Worker: forget it here too.
  function signOut() { A.keep(null); dot(0); account(); }
  $('aOut').addEventListener('click', () => {
    A.signOut();   // here, and on the Worker
    dot(0);
    folks = [];
    account();
    said('');
    result('Signed out.', true);
  });

  // A dot on Settings in the tab bar while accounts wait for the admin. Counting them is a KV list on the Worker,
  // so a page load asks at most once every 6 hours; opening Settings always asks.
  function showDot(n) {
    const b = $('navSettings');
    b.classList.toggle('dot', n > 0);
    b.setAttribute('aria-label', n > 0 ? `Settings, ${plural(n, 'account')} waiting for approval` : 'Settings');
  }
  function dot(n) {
    showDot(n);
    const s = session();
    if (s && s.admin) store.set(WAITING, JSON.stringify({ name: s.name, n, at: Date.now() }));
    else store.del(WAITING);
  }
  async function checkWaiting() {
    const s = session();
    if (!s || !s.admin) return;
    let last = null;
    try { last = JSON.parse(store.get(WAITING)); } catch (e) {}
    if (last && last.name === s.name && Date.now() - last.at < 6 * 3600e3) return showDot(last.n);
    try { dot((await A.mine().me()).waiting); } catch (e) { if (e.code === 'signin') signOut(); }
  }
  async function loadFolks() {
    people.innerHTML = '<p class="nobody">Loading…</p>';
    waitList.innerHTML = '';
    $('sWaiting').hidden = true;
    try { folks = await A.mine().users(); }
    catch (e) {
      if (e.code === 'signin') signOut();
      people.innerHTML = `<p class="nobody">${D.esc(problem(e))}</p>`;
      return;
    }
    drawFolks();
  }
  // "today", "yesterday" or "on Oct 22"
  const day = iso => {
    const d = new Date(iso + 'T12:00:00');
    if (isNaN(d)) return '';
    const days = Math.round((new Date().setHours(12, 0, 0, 0) - d) / 864e5);
    return days <= 0 ? 'today' : days === 1 ? 'yesterday' : 'on ' + d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };
  const avatar = p => `<span class="av serif" aria-hidden="true" style="${paint(face(p.name))}">${D.esc((p.name[0] || '?').toUpperCase())}</span>`;
  function drawFolks() {
    const waiting = folks.filter(p => p.status === 'pending'), approved = folks.filter(p => p.status !== 'pending');
    waiting.sort((a, b) => a.name.localeCompare(b.name));
    approved.sort((a, b) => a.name.localeCompare(b.name));
    dot(waiting.length);
    $('sWaiting').hidden = !waiting.length;
    waitList.innerHTML = waiting.map(p => {
      const k = D.esc(p.key), asked = day(p.created);
      return `<div class="box waiting"><div class="row">${avatar(p)}<span class="who"><b>${D.esc(p.name)}</b><small>Asked for an account${asked ? ' ' + asked : ''}</small></span></div>`
        + `<div class="two"><button class="pill solid" type="button" data-approve="${k}">Approve</button><button class="pill" type="button" data-remove="${k}" data-label="Deny" data-armed="Tap again to deny" aria-label="Deny ${D.esc(p.name)}">Deny</button></div></div>`;
    }).join('');
    people.innerHTML = approved.length
      ? approved.map(p => `<div class="row">${avatar(p)}<span class="who"><b>${D.esc(p.name)}</b></span><button class="pill" type="button" data-remove="${D.esc(p.key)}" data-label="Remove" data-armed="Tap again" aria-label="Remove ${D.esc(p.name)}">Remove</button></div>`).join('')
      : '<p class="nobody">No other accounts yet.</p>';
  }
  function unarm() {
    settings.querySelectorAll('[data-remove].armed').forEach(b => {
      b.classList.remove('armed');
      b.textContent = b.dataset.label;
      b.setAttribute('aria-label', b.getAttribute('aria-label').replace(/^Tap again to (\w+)/, (m, w) => w[0].toUpperCase() + w.slice(1)));
    });
  }
  $('sAdmin').addEventListener('click', async e => {
    const b = e.target.closest('button'), s = session();
    if (!b || b.disabled || !s) return;
    const key = b.dataset.approve ?? b.dataset.remove, p = folks.find(x => x.key === key);
    if (!p) return;
    if (b.dataset.remove != null && !b.classList.contains('armed')) {   // Deny and Remove ask for a second tap
      unarm();
      b.classList.add('armed');
      b.textContent = b.dataset.armed;
      b.setAttribute('aria-label', `Tap again to ${b.dataset.label.toLowerCase()} ${p.name}`);
      return;
    }
    unarm();
    b.disabled = true;
    said('');
    try {
      if (b.dataset.approve != null) {
        await A.mine().approve(key);
        p.status = 'approved';
        said(`${p.name} can sign in now.`);
      } else {
        await A.mine().remove(key);
        folks = folks.filter(x => x !== p);
        said(p.status === 'pending' ? `${p.name}’s request is gone.` : `${p.name} can no longer sign in.`);
      }
      drawFolks();
    } catch (err) {
      said(problem(err));
      if (err.code === 'signin') signOut();
      else if (err.code === 'nobody') loadFolks();
      else b.disabled = false;
    }
  });

  applyTheme();
  account();
  load();
  checkWaiting();
})();
