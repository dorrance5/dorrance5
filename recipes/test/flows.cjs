// Drives the Recipes page in WebKit at 390 × 844 against a stand-in for the GitHub contents API:
// search, the stack of cards, the recipe sheet, theme and Aurora, token, add, edit, delete, a 409, 401/403/offline errors
// and the back button.
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

const GOOD = 'github_pat_TEST_good', BAD = 'github_pat_TEST_bad';
const results = [];
const check = (name, ok, info) => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${info !== undefined && !ok ? ' — ' + JSON.stringify(info) : ''}`); };

// The stand-in for api.github.com: one file with a sha, like the contents API.
const gh = { text: FILE, sha: 's0', n: 0, gets: 0, puts: [], urls: [], getStatus: 0, putQueue: [], offline: false };
const wrap = s => Buffer.from(s).toString('base64').replace(/(.{60})/g, '$1\n');
const decoded = body => Buffer.from(body.content, 'base64').toString('utf8');
const recipeIn = (text, id) => JSON.parse(text).recipes.find(r => r.id === id);
async function api(route) {
  const req = route.request();
  gh.urls.push(req.url());
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, PUT', 'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, X-GitHub-Api-Version', 'Access-Control-Expose-Headers': 'x-ratelimit-remaining' };
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
  if (gh.offline) return route.abort('internetdisconnected');
  const reply = (status, body) => route.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(body) });
  if (req.headers().authorization !== 'Bearer ' + GOOD) return reply(401, { message: 'Bad credentials' });
  if (req.method() === 'GET') {
    gh.gets++;
    if (gh.getStatus) return reply(gh.getStatus, { message: 'nope' });
    return reply(200, { sha: gh.sha, encoding: 'base64', content: wrap(gh.text) });
  }
  const body = JSON.parse(req.postData());
  if (!body.content) return reply(422, { message: 'Invalid request.' });   // the write test in Settings
  gh.puts.push(body);
  const forced = gh.putQueue.shift();
  if (forced === 409) {   // someone else saved first: Claude adds Ketchup to the burgers
    gh.text = gh.text.replace('"Fries"', '"Fries",\n        "Ketchup"');
    gh.sha = 's' + ++gh.n;
    return reply(409, { message: 'conflict' });
  }
  if (forced) return reply(forced, { message: 'nope' });
  if (body.sha !== gh.sha || body.branch !== 'main') return reply(409, { message: 'sha' });
  gh.text = decoded(body);
  gh.sha = 's' + ++gh.n;
  return reply(200, { content: { sha: gh.sha } });
}

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/recipes/`;
  const browser = await webkit.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 } });
  await ctx.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: '' }));
  await ctx.route('https://api.github.com/**', api);
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
  // A failed status from the stand-in API shows in the console as "Failed to load resource"; that is the test, not a bug.
  page.on('console', m => { if (m.type() === 'error' && !(/^Failed to load resource/.test(m.text()) && /api\.github\.com/.test(m.location().url || ''))) errors.push(m.text()); });
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
  check('a recipe with no ingredients says so', (await page.textContent('.card:has-text("Jen") .sub')).includes('No ingredients yet'));
  check('the zuppa card shows its tag and ingredient count', (await page.textContent('.card:has-text("zuppa") .sub')) === 'Soup · 11 ingredients');
  check('API not called without a token', gh.gets === 0);
  await phoneRules('list');
  const addBtn = await page.$eval('#addBtn', b => { const r = b.getBoundingClientRect(); return { right: innerWidth - r.right, bottom: innerHeight - r.bottom }; });
  check('Add recipe floats at the bottom right', addBtn.right >= 16 && addBtn.bottom >= 16, addBtn);
  await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
  const lastClear = await page.evaluate(() => document.querySelector('#list li:last-child').getBoundingClientRect().bottom <= document.getElementById('addBtn').getBoundingClientRect().top);
  check('the last card scrolls clear of the Add button', lastClear);

  /* ---- the cards stack up under the search field as the list scrolls ---- */
  // Each card: its place on screen, how far it leans back, the height of its name, how much of it shows above the
  // next card, and which card a tap on the part that shows, or just below it, would reach.
  const deck = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => {
    const cards = [...document.querySelectorAll('#list .card')];
    const at = (x, y) => { const c = document.elementFromPoint(x, y)?.closest('.card'); return c ? cards.indexOf(c) : -1; };
    r(cards.map((c, i) => {
      const b = c.getBoundingClientRect(), nm = c.querySelector('.nm').offsetHeight, m = /rotateX\((-?[\d.]+)deg\)/.exec(c.style.transform);
      const shows = cards[i + 1] ? Math.min(b.height, cards[i + 1].getBoundingClientRect().top - b.top) : b.height;
      return { top: b.top, height: b.height, flat: c.offsetHeight, lean: m ? -m[1] : 0, moved: !!c.style.transform, nm, shows,
        onName: at(b.left + 60, b.top + shows / 2), onNext: at(b.left + 60, b.top + shows + 6) };
    }));
  }))));
  await page.evaluate(() => scrollTo(0, 0));
  let cards = await deck();
  check('at the top of the page the cards lie as usual', cards.every(c => !c.moved), cards);
  await page.evaluate(() => scrollTo(0, 560));
  cards = await deck();
  const T = await page.evaluate(() => document.getElementById('searchbar').getBoundingClientRect().bottom);
  const names2 = cards.map((c, i) => ({ ...c, i })).filter(c => c.lean === 36);   // in the stack, not tucking in
  check('stacked cards lean back like cards in a box', names2.length >= 3 && names2.every(c => c.height < c.flat * 0.8) && cards.some(c => c.lean > 36), names2.map(c => [c.i, c.lean, Math.round(c.height), c.flat]));
  check('stacked cards show only their names', names2.every(c => c.shows > 28 && c.shows < c.nm), names2.map(c => [c.i, Math.round(c.shows), c.nm]));
  check('a lower card lies on top of the one above', names2.every(c => c.onName === c.i && c.onNext === c.i + 1), names2.map(c => [c.i, c.onName, c.onNext]));
  check('older cards tuck in under the top of the stack', cards.some(c => c.moved && c.top < T + 10) && cards.every(c => c.top >= T - 9 || c.top > 844), { T, tops: cards.map(c => Math.round(c.top)) });
  const below = cards.filter(c => c.top > 400 && c.top < 844);
  check('below the stack the cards come up as usual', below.length >= 3 && below.every(c => !c.moved), below);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  cards = await deck();
  check('with reduced motion the cards do not stack', cards.every(c => !c.moved), cards.filter(c => c.moved));
  await openRecipe('Salmon bowls');
  check('with reduced motion the card is not pulled out', (await page.$$('#list .card.out')).length === 0);
  await page.goBack();
  await closed('view');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => scrollTo(0, 0));

  await page.fill('#q', 'red onion');
  check('search for an ingredient', (await names()).join() === "Madi's pasta salad,Sheet pan breakfast burritos", await names());
  check('the matching ingredient shows and is marked', (await page.innerHTML('.card:has-text("Madi") .sub')) === '<mark>Red onion</mark>');
  await page.fill('#q', 'garnish');
  check('a match in the notes shows a piece of the note', (await page.innerHTML('.card:has-text("Tacos") .pre')).includes('<mark>garnish</mark>'));
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
  check('Edit without a token opens Settings and says why', await page.isVisible('#sNeed') && (await page.textContent('#sNeed')).includes('Connect GitHub to add or edit recipes.'));
  await page.goBack();
  await closed('settings');
  await page.goBack();
  await closed('view');
  await tap('#addBtn');
  await opened('settings');
  check('Add without a token opens Settings too', await page.isVisible('#sNeed'));
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

  /* ---- token ---- */
  await page.fill('#tok', BAD);
  await tap('#tokSave');
  await page.waitForSelector('#sResult:not([hidden])');
  check('a wrong token gets a plain 401 message and is not kept', (await page.textContent('#sResult')).includes('wrong or expired') && !(await page.evaluate(() => localStorage.getItem('recipes-token'))));
  await page.fill('#tok', GOOD);
  await tap('#tokSave');
  await page.waitForSelector('#sResult.ok');
  check('Save and test connects', (await page.textContent('#sResult')).includes('Connected') && (await page.evaluate(() => localStorage.getItem('recipes-token'))) === GOOD);
  check('the token is a password field', (await page.getAttribute('#tok', 'type')) === 'password');
  check('Save and test makes no commit', gh.puts.length === 0 && gh.text === FILE);
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
  check('add: commit title, sha and branch', put.message === 'Recipes: add Grandma’s crème brûlée' && put.sha === 's0' && put.branch === 'main', { message: put.message, sha: put.sha });
  check('add: the other recipes are untouched', JSON.stringify(parsed.recipes.slice(0, 11)) === JSON.stringify(JSON.parse(FILE).recipes));
  check('add: the new recipe opens', (await page.textContent('#vName')) === 'Grandma’s crème brûlée' && await page.isHidden('#editor'));
  check('add: it is in the list and in the saved copy', (await names()).includes('Grandma’s crème brûlée') && (await page.evaluate(() => localStorage.getItem('recipes-cache'))).includes('grandmas-creme-brulee'));
  check('add: a toast says it saved', (await page.textContent('#toast')).startsWith('Saved'));
  check('the token is never in a URL', gh.urls.every(u => !u.includes('TEST')));
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
  check('edit: the change is in the PUT', put.message === 'Recipes: edit Salmon bowls' && salmon.servings === '2' && salmon.ingredients.at(-1) === 'Avocado', salmon);
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
  check('409: the list has the other change too', (await page.textContent('.card:has-text("Burgers") .sub')) === '4 ingredients');

  /* ---- errors keep the editor open ---- */
  await openRecipe('Tacos and beans');
  await tap('#editBtn');
  await opened('editor');
  await page.fill('#fNotes', 'Add any garnish wanted. Lime!');
  const tacosBefore = gh.text;
  gh.getStatus = 401;
  await tap('#eSave');
  await page.waitForSelector('#eError:not([hidden])');
  check('401: plain message, Settings button, nothing saved', (await page.textContent('#eError')).includes('wrong or expired. The change is not saved.') && await page.isVisible('#eError [data-settings]') && gh.text === tacosBefore, await page.textContent('#eError'));
  gh.getStatus = 403;
  await tap('#eSave');
  await page.waitForFunction(() => document.getElementById('eError').textContent.includes('Read and write'));
  check('403: says the token cannot reach the repo or write', true);
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
  check('delete: one PUT with the recipe gone', gh.puts.at(-1).message === 'Recipes: delete Tacos and beans' && !recipeIn(gh.text, 'tacos-and-beans') && JSON.parse(gh.text).recipes.length === 11);
  check('delete: both sheets close and the card is gone', await page.isHidden('#editor') && !(await names()).includes('Tacos and beans') && await page.evaluate(() => !history.state || !history.state.sheets));

  /* ---- with a token the file comes from the API ---- */
  gh.text = gh.text.replace('"name": "Burgers and fries"', '"name": "Burgers and fries (from chat)"');
  await page.reload();
  await page.waitForFunction(() => [...document.querySelectorAll('#list .nm')].some(e => e.textContent.includes('from chat')));
  check('with a token, a change from chat shows at once', true);

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
  await tap('#tokOff');
  check('Disconnect removes the token', !(await page.evaluate(() => localStorage.getItem('recipes-token'))) && (await page.textContent('#sStatus')).startsWith('Not connected'));

  check('no console errors', errors.length === 0, errors);
  await browser.close();
  server.close();
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
