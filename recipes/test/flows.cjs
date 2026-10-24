// Drives the Recipes page in WebKit at 390 × 844 against the API Worker run in Node (worker/test/harness.cjs), with a stand-in for GitHub:
// search, the deck of cards and the pile, the recipe sheet, theme and Aurora, accounts and the admin, add, edit, delete,
// a 409, errors and the back button.
// Exits 1 on a failed check or a console error.
//   NODE_PATH=/path/to/node_modules node recipes/test/flows.cjs
const { webkit, devices } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const FILE = fs.readFileSync(path.join(root, 'recipes', 'recipes.json'), 'utf8');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(fs.readFileSync(f));
});

const results = [];
const check = (name, ok, info) => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${info !== undefined && !ok ? ' — ' + JSON.stringify(info) : ''}`); };
const decoded = body => Buffer.from(body.content, 'base64').toString('utf8');
const recipeIn = (text, id) => JSON.parse(text).recipes.find(r => r.id === id);

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/recipes/`;
  const api = await require('../../worker/test/harness.cjs')(FILE), gh = api.gh;
  await api.addUser('Madi', 'madi-password');
  await api.addUser('Jen', 'jen-password', true);
  const user = key => api.kv.get('auth:user:' + key, 'json');
  const sessions = () => [...api.kv.m.keys()].filter(k => k.startsWith('auth:session:')).length;
  const browser = await webkit.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 } });
  await ctx.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: '' }));
  await ctx.route('**/api/**', api.route);
  // a GitHub token left on the phone from before accounts, which the page removes
  await ctx.addInitScript(() => { if (!sessionStorage.getItem('old')) { sessionStorage.setItem('old', '1'); localStorage.setItem('recipes-token', 'github_pat_OLD'); } });
  // a wake lock that the test can refuse or grant
  await ctx.addInitScript(() => {
    window.__wake = { requests: 0, releases: 0, refuse: true };
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async () => {
      __wake.requests++;
      if (__wake.refuse) throw new DOMException('Not allowed', 'NotAllowedError');
      const s = new EventTarget();
      s.release = async () => { __wake.releases++; s.dispatchEvent(new Event('release')); };
      return s;
    } } });
  });
  const page = await ctx.newPage();
  const errors = [];
  // A failed status from the API shows in the console as "Failed to load resource"; that is the test, not a bug.
  page.on('console', m => { if (m.type() === 'error' && !(/^Failed to load resource/.test(m.text()) && /\/api\//.test(m.location().url || ''))) errors.push(m.text()); });
  const urls = [];
  page.on('request', r => urls.push(r.url()));
  page.on('pageerror', e => errors.push(e.message));
  let answer = null;   // the reply to the next confirm()
  page.on('dialog', d => { (answer ? d.accept() : d.dismiss()).catch(() => {}); answer = null; });

  const names = () => page.$$eval('#list .card .nm', els => els.map(e => e.textContent));
  const tap = sel => page.tap(sel);
  const opened = id => page.waitForSelector(`#${id}.open`);
  const closed = id => page.waitForSelector(`#${id}`, { state: 'hidden' });
  const openRecipe = async name => { await page.tap(`#list .card:has-text("${name}")`); await opened('view'); };
  const paste = (sel, text) => page.evaluate(([sel, text]) => {
    const ta = document.querySelector(sel);
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
    const dt = new DataTransfer();
    dt.setData('text/plain', text);
    ta.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    return ta.value;
  }, [sel, text]);
  // Phone rules for whatever is on screen now.
  async function phoneRules(where) {
    const r = await page.evaluate(() => {
      const visible = el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[inert], [hidden]');
      const small = [...document.querySelectorAll('button, a, .checks label, input:not([type=checkbox]), textarea')].filter(visible)
        .map(el => ({ el, b: el.getBoundingClientRect() })).filter(({ b }) => b.height < 44 || b.width < 44)
        .map(({ el, b }) => `${el.id || el.className || el.tagName} ${Math.round(b.width)}x${Math.round(b.height)}`);
      const fonts = [...document.querySelectorAll('input, textarea')].map(el => parseFloat(getComputedStyle(el).fontSize)).filter(s => s < 16);
      const wide = [...document.querySelectorAll('.sheet .body')].filter(visible).filter(b => b.scrollWidth > b.clientWidth + 1).length;
      return { small, fonts, sideways: document.documentElement.scrollWidth - innerWidth, wide };
    });
    check(`${where}: tap targets are 44 px or more`, r.small.length === 0, r.small);
    check(`${where}: no sideways scroll at 390`, r.sideways <= 0 && r.wide === 0, r);
    if (where === 'list') check('inputs are 16 px or more, so iOS does not zoom', r.fonts.length === 0, r.fonts);
  }

  /* ---- reading, no token ---- */
  await page.goto(base);
  await page.waitForSelector('#list .card');
  const first = await names();
  check('11 recipes from the site file, sorted by name', first.length === 11 && first.join() === [...first].sort((a, b) => a.localeCompare(b)).join(), first);
  check('count line', (await page.textContent('#count')) === '11 recipes');
  check('without a search each card shows only its name', await page.$$eval('#list .card .face', fs => fs.every(f => f.children.length === 1 && f.firstElementChild.className === 'nm')));
  await openRecipe('Jen');
  check('a recipe with no ingredients says so', (await page.textContent('#vBody')).includes('No ingredients yet'));
  await page.goBack();
  await closed('view');
  check('the file comes from the site without a sign-in', gh.gets === 0);
  check('an old GitHub token is removed from the phone', (await page.evaluate(() => localStorage.getItem('recipes-token'))) === null);
  await phoneRules('list');
  const addBtn = await page.$eval('#addBtn', b => { const r = b.getBoundingClientRect(); return { right: innerWidth - r.right, bottom: innerHeight - r.bottom }; });
  check('Add recipe floats at the bottom right', addBtn.right >= 16 && addBtn.bottom >= 16, addBtn);
  await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
  const lastClear = await page.evaluate(() => document.querySelector('#list li:last-child').getBoundingClientRect().bottom <= document.getElementById('addBtn').getBoundingClientRect().top);
  check('the last card scrolls clear of the Add button', lastClear);

  /* ---- the cards are a deck of name strips, and they pile up under the search field as the list scrolls ---- */
  // Each card: its place on screen, its transform, how tall its name is on screen, how much of it shows above the
  // next card, and which card a tap on the part that shows, or just below it, would reach.
  const deck = (p = page) => p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => {
    const cards = [...document.querySelectorAll('#list .card')];
    const at = (x, y) => { const c = document.elementFromPoint(x, y)?.closest('.card'); return c ? cards.indexOf(c) : -1; };
    const T = document.getElementById('searchbar').getBoundingClientRect().bottom + 16;   // where the pile is
    r({ T, cards: cards.map((c, i) => {
      const b = c.getBoundingClientRect(), nm = c.querySelector('.nm').getBoundingClientRect().height;
      const shows = cards[i + 1] ? cards[i + 1].getBoundingClientRect().top - b.top : b.height;
      const f = c.style.getPropertyValue('--fade'), fade = f === '' ? 1 : +f;
      return { i, top: b.top, height: b.height, transform: c.style.transform, nm, shows, fade,
        onName: at(b.left + 60, b.top + shows / 2), onNext: at(b.left + 60, b.top + shows + 4) };
    }) });
  }))));
  const flat = c => c.transform === 'scaleY(0.86)';   // tipped back, but not in the pile
  await page.evaluate(() => scrollTo(0, 0));
  let { cards } = await deck();
  const strips = cards.slice(0, -1).filter(c => c.top + c.shows < 844);
  check('at the top of the page every card tips back in its place', cards.every(flat), cards.filter(c => !flat(c)));
  check('each card shows only its name, never its bottom edge', strips.length >= 6 && strips.every(c => c.shows >= 44 && c.shows < c.nm + 14 && c.shows < c.height - 1), strips.map(c => [c.i, Math.round(c.shows), Math.round(c.nm), Math.round(c.height)]));
  check('a lower card lies on top of the one above', strips.every(c => c.onName === c.i && c.onNext === c.i + 1), strips.map(c => [c.i, c.onName, c.onNext]));

  // a second phone with 30 recipes, so the list scrolls far enough to pile up
  const many = require('./many.cjs');
  const ctx2 = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 } });
  await ctx2.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: '' }));
  await ctx2.route('**/recipes/recipes.json', r => r.fulfill({ contentType: 'application/json', body: many(FILE) }));
  const page2 = await ctx2.newPage();
  page2.on('pageerror', e => errors.push(e.message));
  await page2.goto(base);
  await page2.waitForSelector('#list .card');
  check('the long list has 30 recipes', (await page2.$$('#list .card')).length === 30);
  await page2.evaluate(() => scrollTo(0, 900));
  let pile = await deck(page2);
  const piled = pile.cards.filter(c => !flat(c)), on = pile.cards.filter(c => flat(c) && c.top < 844);
  check('cards that go past the search field pile up under it', piled.length >= 8 && piled.every(c => c.top >= pile.T - 16 && c.top <= pile.T + 0.5), { T: pile.T, tops: piled.map(c => Math.round(c.top)) });
  check('names in the pile fade out', piled.slice(0, -1).every(c => c.fade < 1) && piled.some(c => c.fade === 0), piled.map(c => c.fade));
  check('below the pile the cards come up as usual', on.length >= 6 && on.every(c => c.top > pile.T), on.map(c => Math.round(c.top)));
  const pileTop = await page2.evaluate(y => {
    const cards = [...document.querySelectorAll('#list .card')];
    const under = cards.filter(c => { const b = c.getBoundingClientRect(); return b.top <= y && b.bottom > y; });
    return { hit: cards.indexOf(document.elementFromPoint(100, y)?.closest('.card')), newest: cards.indexOf(under.at(-1)), under: under.length };
  }, pile.T - 6);
  check('in the pile a lower card lies on top too', pileTop.under >= 2 && pileTop.hit === pileTop.newest, pileTop);
  await page2.emulateMedia({ reducedMotion: 'reduce' });
  pile = await deck(page2);
  check('with reduced motion the cards do not pile up', pile.cards.every(flat), pile.cards.filter(c => !flat(c)).map(c => c.transform));
  await ctx2.close();

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openRecipe('Salmon bowls');
  check('with reduced motion the card is not pulled out', (await page.$$('#list .card.out')).length === 0);
  await page.goBack();
  await closed('view');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => scrollTo(0, 0));

  await page.fill('#q', 'red onion');
  check('search for an ingredient', (await names()).join() === "Madi's pasta salad,Sheet pan breakfast burritos", await names());
  check('the matching ingredient shows and is marked', (await page.innerHTML('.card:has-text("Madi") .hit')) === '<mark>Red onion</mark>');
  await page.fill('#q', 'garnish');
  check('a match in the notes shows a piece of the note', (await page.innerHTML('.card:has-text("Tacos") .hit')).includes('<mark>garnish</mark>'));
  await page.fill('#q', 'zzz');
  check('no match says so', await page.isVisible('#none') && (await page.textContent('#count')) === '0 of 11 recipes');
  await page.fill('#q', '');

  const wake0 = await page.evaluate(() => __wake.requests);
  await openRecipe("Megan's zuppa toscana");
  const v = await page.evaluate(() => ({
    name: document.getElementById('vName').textContent,
    chips: [...document.querySelectorAll('#vBody .chip')].map(c => c.textContent),
    ings: document.querySelectorAll('#vBody .checks li').length,
    steps: document.querySelectorAll('#vBody .steps li').length,
    notes: !!document.querySelector('#vBody .notes'),
    src: document.querySelector('#vBody a.source')?.textContent,
    srcTarget: document.querySelector('#vBody a.source')?.target
  }));
  check('the recipe sheet shows everything', v.name === "Megan's zuppa toscana" && v.chips.join() === 'Serves 6,Soup' && v.ings === 11 && v.steps === 9 && v.notes && v.src === 'saltandlavender.com' && v.srcTarget === '_blank', v);
  check('the tapped card is out of the list while its recipe is open', (await page.$$eval('#list .card.out', cs => cs.map(c => c.dataset.id))).join() === 'megans-zuppa-toscana');
  await page.waitForTimeout(500);
  const full = await page.evaluate(() => { const s = document.querySelector('#view .sheet'), b = s.getBoundingClientRect(); return { clip: s.style.clipPath, transform: s.style.transform, bottom: Math.round(b.bottom), cls: s.className }; });
  check('the card grows into the full recipe sheet', full.clip === '' && full.transform === '' && full.bottom === 844 && full.cls === 'sheet', full);
  await tap('#vBody .checks li:nth-child(2) label');
  check('tap an ingredient to check it off', await page.isChecked('#vBody .checks li:nth-child(2) input'));
  check('a wake lock is asked for, and a refusal is fine', (await page.evaluate(() => __wake.requests)) === wake0 + 1);
  check('the page behind the sheet is inert', await page.evaluate(() => document.getElementById('page').inert && document.getElementById('addBtn').inert));
  await phoneRules('recipe');
  await page.goBack();
  await closed('view');
  check('the back button closes the sheet', !(await page.evaluate(() => document.documentElement.classList.contains('locked'))));
  const backIn = await page.evaluate(() => ({ out: document.querySelectorAll('#list .card.out').length, sheet: document.querySelector('#view .sheet').getAttribute('style') }));
  check('the card goes back into the list', backIn.out === 0 && !backIn.sheet, backIn);
  await openRecipe("Megan's zuppa toscana");
  check('checks are not saved', !(await page.isChecked('#vBody .checks li:nth-child(2) input')));
  await tap('#view button[data-close]');
  await closed('view');
  check('the close button leaves no extra history', await page.evaluate(() => !history.state || !history.state.sheets));

  const asked = await page.evaluate(() => { __wake.refuse = false; return __wake.requests; });
  await openRecipe('Salmon bowls');
  await page.waitForFunction(n => __wake.requests === n + 1, asked);
  await page.keyboard.press('Escape');
  await closed('view');
  check('a granted wake lock is released on close', (await page.evaluate(() => __wake.releases)) === 1);

  await openRecipe('Salmon bowls');
  await tap('#editBtn');
  await opened('settings');
  check('Edit without a sign-in opens Settings and says why', await page.isVisible('#sNeed') && (await page.textContent('#sNeed')).includes('Sign in to add or edit recipes.'));
  await page.goBack();
  await closed('settings');
  await page.goBack();
  await closed('view');
  await tap('#addBtn');
  await opened('settings');
  check('Add without a sign-in opens Settings too', await page.isVisible('#sNeed'));
  await phoneRules('settings');

  /* ---- theme ---- */
  const seg = await page.$$eval('#themeSeg button', bs => bs.filter(b => !b.hidden).map(b => b.textContent + (b.classList.contains('on') ? '*' : '')));
  check('theme row is Auto, Day, Night with Auto on the left and on; Aurora is hidden', seg.join() === 'Auto*,Day,Night', seg);
  await tap('#themeSeg [data-t="dark"]');
  let th = await page.evaluate(() => ({ key: localStorage.getItem('theme'), attr: document.documentElement.dataset.theme, meta: [...document.querySelectorAll('meta[name="theme-color"]')].map(m => m.content), bg: getComputedStyle(document.body).backgroundColor }));
  check('Night writes "dark" and colors the browser bar with the page', th.key === 'dark' && th.attr === 'dark' && th.meta.every(c => c === th.bg) && th.bg === 'rgb(24, 19, 15)', th);
  await tap('#themeSeg [data-t="auto"]');
  th = await page.evaluate(() => ({ key: localStorage.getItem('theme'), attr: document.documentElement.dataset.theme, meta: [...document.querySelectorAll('meta[name="theme-color"]')].map(m => m.content) }));
  check('Auto writes "auto" and follows the phone', th.key === 'auto' && th.attr === undefined && th.meta.join() === '#eadcc2,#18130f', th);

  /* ---- accounts ---- */
  const said = async kind => { await page.waitForSelector(`#sResult${kind === 'ok' ? '.ok' : ':not(.ok)'}:not([hidden])`); const t = await page.textContent('#sResult'); return t; };
  const signIn = async (name, pw) => { await page.fill('#aName', name); await page.fill('#aPass', pw); await tap('#aGo'); };
  const form0 = await page.evaluate(() => ({ form: !document.getElementById('aForm').hidden, signedIn: !document.getElementById('aIn').hidden, go: document.getElementById('aGo').textContent,
    type: document.getElementById('aPass').type, ac: document.getElementById('aPass').autocomplete }));
  check('signed out, Settings has the sign-in form', form0.form && !form0.signedIn && form0.go === 'Sign in' && form0.type === 'password' && form0.ac === 'current-password', form0);
  await tap('#aSwap');
  const form1 = await page.evaluate(() => ({ go: document.getElementById('aGo').textContent, ac: document.getElementById('aPass').autocomplete, hint: !document.getElementById('aPassHint').hidden }));
  check('"Create an account" turns it into the new account form', form1.go === 'Create account' && form1.ac === 'new-password' && form1.hint, form1);
  await page.fill('#aName', 'Megan');
  await page.fill('#aPass', 'short');
  await tap('#aGo');
  check('a short password is refused on the phone', (await said()).includes('8 characters') && !(await user('megan')));
  await page.fill('#aPass', 'pasta-night-42');
  await tap('#aGo');
  let msg = await said('ok');
  check('a new account waits for the admin', msg.includes('waiting for Mitchell to approve it') && (await user('megan')).status === 'pending', msg);
  check('then the form is back to Sign in, with the name kept', (await page.textContent('#aGo')) === 'Sign in' && (await page.inputValue('#aName')) === 'Megan' && (await page.inputValue('#aPass')) === '');
  await signIn('Megan', 'pasta-night-42');
  msg = await said();
  check('before approval, sign in says the account is waiting', msg === 'Your account is waiting for approval.' && !(await page.evaluate(() => localStorage.getItem('dorrance-session'))), msg);
  await tap('#aSwap');
  await page.fill('#aName', 'madi');
  await page.fill('#aPass', 'another-password');
  await tap('#aGo');
  check('a name in use is refused', (await said()).includes('That name is taken'));
  await tap('#aSwap');
  await signIn('Madi', 'wrong-password');
  check('a wrong password gets a plain message', (await said()) === 'That name and password do not match.');
  await signIn('Madi', 'madi-password');
  msg = await said('ok');
  const sess = await page.evaluate(() => JSON.parse(localStorage.getItem('dorrance-session')));
  check('sign in keeps a sign-in on the phone', msg.startsWith('Signed in') && sess && sess.name === 'Madi' && sess.admin === false && /^[\w-]{40,}$/.test(sess.token), sess);
  check('Settings says who is signed in; no Accounts list for Madi', (await page.textContent('#aWho')).startsWith('Signed in as Madi.') && await page.isHidden('#aForm') && await page.isHidden('#aAdmin'));
  check('the phone never gets the GitHub token', !(await page.evaluate(() => JSON.stringify(localStorage))).includes(api.env.GITHUB_TOKEN));
  await phoneRules('settings, signed in');
  await page.goBack();
  await closed('settings');

  /* ---- add ---- */
  await tap('#addBtn');
  await opened('editor');
  check('a new recipe starts in the Name field', await page.evaluate(() => document.activeElement.id === 'fName'));
  check('a new recipe has no Delete button', !(await page.isVisible('#eDelete')));
  await phoneRules('editor');
  await page.fill('#fName', 'Grandma’s crème brûlée');
  await page.fill('#fTags', 'Dessert, French');
  const ingText = await paste('#fIngredients', '• 4 egg yolks\n• 2 cups heavy cream\n\n- 1/2 cup sugar\n* 1 tsp vanilla');
  check('pasted ingredients lose their bullets', ingText === '4 egg yolks\n2 cups heavy cream\n1/2 cup sugar\n1 tsp vanilla', ingText);
  check('the field counts its lines', (await page.textContent('[data-count="ingredients"]')) === '4 ingredients');
  await page.fill('#fSteps', 'Heat the oven to 325.');
  const stepText = await paste('#fSteps', '1. Heat the cream.\n2) Whisk the yolks and sugar.\n3. Bake 40 minutes.');
  check('a pasted list goes on its own lines without numbers', stepText === 'Heat the oven to 325.\nHeat the cream.\nWhisk the yolks and sugar.\nBake 40 minutes.', stepText);
  await page.fill('#fSource', 'example.com/brulee');
  await tap('#eSave');
  await page.waitForSelector('#view.open #vName');
  await closed('editor');
  let put = gh.puts.at(-1), saved = decoded(put);
  let parsed = null;
  try { parsed = JSON.parse(saved); } catch (e) {}
  const brulee = parsed && parsed.recipes.find(r => r.id === 'grandmas-creme-brulee');
  check('add: the PUT body decodes to valid JSON', !!parsed && saved.endsWith('}\n') && saved.includes('\n  "recipes": [\n'));
  check('add: accents and the apostrophe survive', !!brulee && brulee.name === 'Grandma’s crème brûlée', brulee);
  check('add: the recipe is saved in file order', !!brulee && JSON.stringify(brulee) === JSON.stringify({ id: 'grandmas-creme-brulee', name: 'Grandma’s crème brûlée', tags: ['Dessert', 'French'], ingredients: ['4 egg yolks', '2 cups heavy cream', '1/2 cup sugar', '1 tsp vanilla'], steps: ['Heat the oven to 325.', 'Heat the cream.', 'Whisk the yolks and sugar.', 'Bake 40 minutes.'], source: 'https://example.com/brulee' }), brulee);
  check('add: commit title with the name, sha and branch', put.message === 'Recipes: add Grandma’s crème brûlée (Madi)' && put.sha === 's0' && put.branch === 'main', { message: put.message, sha: put.sha });
  check('add: the other recipes are untouched', JSON.stringify(parsed.recipes.slice(0, 11)) === JSON.stringify(JSON.parse(FILE).recipes));
  check('add: the new recipe opens', (await page.textContent('#vName')) === 'Grandma’s crème brûlée' && await page.isHidden('#editor'));
  check('add: it is in the list and in the saved copy', (await names()).includes('Grandma’s crème brûlée') && (await page.evaluate(() => localStorage.getItem('recipes-cache'))).includes('grandmas-creme-brulee'));
  check('add: a toast says it saved', (await page.textContent('#toast')).startsWith('Saved'));
  check('the sign-in is never in a URL, and the page never calls GitHub itself', urls.every(u => !u.includes(sess.token) && !u.includes('github.com/repos')));
  await page.goBack();
  await closed('view');
  check('add: back from the new recipe goes to the list', await page.evaluate(() => !history.state || !history.state.sheets));

  /* ---- edit ---- */
  await openRecipe('Salmon bowls');
  await tap('#editBtn');
  await opened('editor');
  check('Edit fills the form', (await page.inputValue('#fIngredients')) === 'Salmon\nRice\nMayo\nSriracha\nCucumbers' && (await page.textContent('#eTitle')) === 'Edit recipe');
  await page.fill('#fServings', '2');
  await page.fill('#fIngredients', 'Salmon\nRice\nMayo\nSriracha\nCucumbers\nAvocado');
  const before = gh.text;
  await tap('#eSave');
  await closed('editor');
  put = gh.puts.at(-1);
  const salmon = recipeIn(decoded(put), 'salmon-bowls');
  check('edit: the change is in the PUT', put.message === 'Recipes: edit Salmon bowls (Madi)' && salmon.servings === '2' && salmon.ingredients.at(-1) === 'Avocado', salmon);
  const others = t => JSON.stringify(JSON.parse(t).recipes.filter(r => r.id !== 'salmon-bowls'));
  check('edit: only that recipe changed', others(decoded(put)) === others(before));
  check('edit: the sheet shows the change', (await page.textContent('#vBody .chip')) === 'Serves 2' && (await page.$$('#vBody .checks li')).length === 6);

  /* ---- 409 on the first PUT ---- */
  gh.putQueue.push(409);
  const gets0 = gh.gets, puts0 = gh.puts.length, sha0 = gh.sha;
  await tap('#editBtn');
  await opened('editor');
  await page.fill('#fNotes', 'Use the good soy sauce.');
  await tap('#eSave');
  await closed('editor');
  check('409: read again and saved on the second PUT', gh.gets - gets0 === 2 && gh.puts.length - puts0 === 2 && gh.puts.at(-2).sha === sha0 && gh.puts.at(-1).sha !== sha0, { gets: gh.gets - gets0, puts: gh.puts.length - puts0 });
  check('409: both changes are in the file', recipeIn(gh.text, 'salmon-bowls').notes === 'Use the good soy sauce.' && recipeIn(gh.text, 'burgers-and-fries').ingredients.includes('Ketchup'));
  await page.goBack();
  await closed('view');
  await openRecipe('Burgers');
  check('409: the page has the other change too', (await page.textContent('#vBody .checks')).includes('Ketchup'));
  await page.goBack();
  await closed('view');

  /* ---- errors keep the editor open ---- */
  await openRecipe('Tacos and beans');
  await tap('#editBtn');
  await opened('editor');
  await page.fill('#fNotes', 'Add any garnish wanted. Lime!');
  const tacosBefore = gh.text;
  api.env.GITHUB_TOKEN = 'github_pat_TEST_wrong';
  await tap('#eSave');
  await page.waitForSelector('#eError:not([hidden])');
  check('a bad GitHub token in the Worker: plain message, nothing saved', (await page.textContent('#eError')).includes('check its GitHub token. The change is not saved.') && !(await page.isVisible('#eError [data-settings]')) && gh.text === tacosBefore, await page.textContent('#eError'));
  api.env.GITHUB_TOKEN = 'github_pat_TEST_good';
  gh.getStatus = 403;
  await tap('#eSave');
  await page.waitForFunction(() => document.getElementById('eError').textContent.includes('hourly limit'));
  check('GitHub’s rate limit: says to try later', true);
  gh.getStatus = 0;
  gh.offline = true;
  await tap('#eSave');
  await page.waitForFunction(() => document.getElementById('eError').textContent.startsWith('No connection.'));
  check('offline: "No connection. The change is not saved."', (await page.textContent('#eError')).startsWith('No connection. The change is not saved.'));
  check('the editor keeps what was typed', (await page.inputValue('#fNotes')) === 'Add any garnish wanted. Lime!' && await page.isVisible('#editor'));
  gh.offline = false;

  /* ---- unsaved changes ---- */
  answer = false;
  await tap('#eCancel');
  await page.waitForTimeout(150);
  check('Cancel with changes asks first; "no" keeps the editor', await page.isVisible('#editor.open'));
  answer = false;
  await page.goBack();
  await page.waitForTimeout(400);
  check('the back button asks too; "no" keeps the editor', await page.isVisible('#editor.open'));
  answer = true;
  await page.goBack();
  await closed('editor');
  check('"yes" discards and goes back to the recipe', await page.isVisible('#view.open') && gh.text === tacosBefore);

  /* ---- delete ---- */
  await tap('#editBtn');
  await opened('editor');
  await tap('#eDelete');
  check('Delete asks for a second tap', (await page.textContent('#eDelete')) === 'Tap again to delete' && gh.text === tacosBefore);
  await tap('#eDelete');
  await closed('view');
  check('delete: one PUT with the recipe gone', gh.puts.at(-1).message === 'Recipes: delete Tacos and beans (Madi)' && !recipeIn(gh.text, 'tacos-and-beans') && JSON.parse(gh.text).recipes.length === 11);
  check('delete: both sheets close and the card is gone', await page.isHidden('#editor') && !(await names()).includes('Tacos and beans') && await page.evaluate(() => !history.state || !history.state.sheets));

  /* ---- signed in, the file comes through the Worker ---- */
  gh.text = gh.text.replace('"name": "Burgers and fries"', '"name": "Burgers and fries (from chat)"');
  await page.reload();
  await page.waitForFunction(() => [...document.querySelectorAll('#list .nm')].some(e => e.textContent.includes('from chat')));
  check('signed in, a change from chat shows at once', true);

  /* ---- a sign-in that ended ---- */
  for (const k of [...api.kv.m.keys()]) if (k.startsWith('auth:session:')) api.kv.m.delete(k);
  await openRecipe('Salmon bowls');
  await tap('#editBtn');
  await opened('editor');
  await page.fill('#fServings', '3');
  await tap('#eSave');
  await page.waitForSelector('#eError:not([hidden])');
  check('an ended sign-in: plain message and a Settings button', (await page.textContent('#eError')).includes('You are signed out. Sign in again. The change is not saved.') && await page.isVisible('#eError [data-settings]'));
  check('and the phone forgets the sign-in', !(await page.evaluate(() => localStorage.getItem('dorrance-session'))));
  await tap('#eError [data-settings]');
  await opened('settings');
  check('the button opens the sign-in form', await page.isVisible('#aForm'));

  /* ---- the admin approves accounts ---- */
  await signIn('mitchell', api.ADMIN_PASSWORD);
  await said('ok');
  await page.waitForSelector('#people [data-approve]');
  const rows = () => page.$$eval('#people li', ls => ls.map(l => l.querySelector('b').textContent + ':' + [...l.querySelectorAll('button')].map(b => b.textContent).join('/')));
  check('the admin sees who is waiting first, then who can edit', (await rows()).join() === 'Jen:Approve/Deny,Megan:Approve/Deny,Madi:Remove', await rows());
  check('Settings says Mitchell is the admin', (await page.textContent('#aWho')).startsWith('Signed in as Mitchell, the admin.'));
  const dot = () => page.evaluate(() => ({ on: document.getElementById('menuBtn').classList.contains('dot'), label: document.getElementById('menuBtn').getAttribute('aria-label') }));
  check('a dot on the menu button says accounts are waiting', (await dot()).on && (await dot()).label === 'Menu, 2 accounts waiting for approval', await dot());
  await phoneRules('settings for the admin');
  await tap('#people [data-approve="megan"]');
  await page.waitForFunction(() => document.getElementById('toast').textContent.startsWith('Megan can'));
  check('Approve lets Megan in', (await user('megan')).status === 'approved' && (await rows()).join() === 'Jen:Approve/Deny,Madi:Remove,Megan:Remove', await rows());
  await tap('#people [data-remove="jen"]');
  check('Deny asks for a second tap', (await page.textContent('#people [data-remove="jen"]')) === 'Tap again' && !!(await user('jen')));
  await tap('#people [data-remove="jen"]');
  await page.waitForFunction(() => !document.querySelector('#people [data-remove="jen"]'));
  check('Deny removes the account; no one is waiting, so no dot', !(await user('jen')) && !(await dot()).on);
  await tap('#people [data-remove="madi"]');
  await tap('#people [data-remove="madi"]');
  await page.waitForFunction(() => !document.querySelector('#people [data-remove="madi"]'));
  check('Remove takes an account away', !(await user('madi')) && (await rows()).join() === 'Megan:Remove');
  await page.goBack();
  await closed('settings');
  answer = true;
  await page.goBack();   // the editor from before asks about its change: "yes"
  await closed('editor');
  await page.goBack();
  await closed('view');

  /* ---- Aurora: a secret theme, as in the apps ---- */
  const aurora = () => page.evaluate(() => {
    const b = document.querySelector('#themeSeg [data-t="aurora"]');
    return { key: localStorage.getItem('theme'), attr: document.documentElement.dataset.theme, shown: !b.hidden, on: document.querySelector('#themeSeg .on')?.textContent,
      bg: getComputedStyle(document.body).backgroundColor, meta: [...document.querySelectorAll('meta[name="theme-color"]')].map(m => m.content), blobs: getComputedStyle(document.querySelector('.aurora')).display };
  });
  await page.evaluate(() => localStorage.setItem('theme', 'aurora'));
  await page.reload();
  await page.waitForSelector('#list .card');
  th = await aurora();
  check('a saved "aurora" shows the Aurora theme, not Night', th.attr === 'aurora' && th.bg === 'rgb(14, 10, 30)' && th.meta.every(c => c === th.bg) && th.blobs !== 'none', th);
  await tap('#menuBtn');
  await opened('settings');
  th = await aurora();
  check('Settings shows the Aurora button, picked', th.shown && th.on === 'Aurora', th);
  await tap('#themeSeg [data-t="light"]');
  th = await aurora();
  check('picking Day hides the Aurora button again', th.key === 'light' && th.attr === 'light' && !th.shown && th.blobs === 'none', th);
  for (let i = 0; i < 4; i++) await tap('#themeLabel');
  th = await aurora();
  check('four taps on "Theme" do nothing', th.key === 'light' && !th.shown, th);
  await tap('#themeLabel');
  th = await aurora();
  check('the fifth tap turns Aurora on and shows its button', th.key === 'aurora' && th.attr === 'aurora' && th.shown && th.on === 'Aurora' && (await page.textContent('#toast')) === 'Aurora', th);
  await phoneRules('settings in Aurora');
  const live = sessions();
  await tap('#aOut');
  check('Sign out forgets the sign-in on the phone', !(await page.evaluate(() => localStorage.getItem('dorrance-session'))) && await page.isVisible('#aForm') && (await page.textContent('#sResult')) === 'Signed out.');
  await page.waitForTimeout(300);
  check('and on the Worker', sessions() === live - 1, { live, now: sessions() });

  check('no console errors', errors.length === 0, errors);
  await browser.close();
  server.close();
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
