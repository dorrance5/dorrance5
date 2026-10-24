// Phone-size screenshots of the Recipes page in WebKit, Day and Night; exits 1 on any console error or page error.
// The API Worker runs in Node (worker/test/harness.cjs) with a stand-in for GitHub, so nothing is saved. The fonts load from Google
// when there is a connection.
//   NODE_PATH=/path/to/node_modules node recipes/test/shots.cjs [outdir]
const { webkit, devices } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const out = path.resolve(process.argv[2] || path.join(__dirname, 'shots'));
fs.mkdirSync(out, { recursive: true });
const FILE = fs.readFileSync(path.join(root, 'recipes', 'recipes.json'), 'utf8');
const MANY = require('./many.cjs')(FILE);   // 30 recipes, for the scenes with "many"

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(f).pipe(res);
});

const ZUPPA = "Megan's zuppa toscana";
const openRecipe = name => async p => { await p.click(`#deck .rc:has-text("${name}")`); await p.waitForSelector('#view.open'); };
const layerEnd = id => p => p.evaluate(id => { const l = document.getElementById(id); l.scrollTop = l.scrollHeight; }, id);
const cook = name => async p => { await openRecipe(name)(p); await p.click('#cookBtn'); await p.waitForSelector('#cook.open'); };
const settings = async p => { await p.click('#navSettings, #signInBtn >> visible=true'); await p.waitForSelector('#settings.open'); };
const scenes = [
  { name: '01-box-signed-out-day' },
  { name: '02-box-signed-in-day', as: 'Madi' },
  { name: '03-box-scrolled-day', as: 'Madi', many: true, act: async p => { await p.evaluate(() => scrollTo(0, 700)); } },
  { name: '04-box-soup-day', many: true, act: async p => { await p.click('#tabs [data-tab="Soup"]'); } },
  { name: '05-search-day', act: async p => { await p.fill('#q', 'onion'); } },
  { name: '06-box-night', theme: 'dark', as: 'Madi', many: true },
  { name: '07-recipe-day', act: openRecipe(ZUPPA) },
  { name: '08-recipe-steps-day', as: 'Madi', act: async p => { await openRecipe(ZUPPA)(p); await p.click('#vBody [data-half="steps"]'); } },
  { name: '09-recipe-end-day', act: async p => { await openRecipe(ZUPPA)(p); await layerEnd('view')(p); } },
  { name: '10-recipe-plain-day', act: openRecipe('Burgers and fries') },
  { name: '11-recipe-night', theme: 'dark', as: 'Madi', act: openRecipe('Pepperoncini roast') },
  { name: '12-cooking-night', theme: 'dark', act: cook(ZUPPA) },
  { name: '13-cooking-timer-night', theme: 'dark', act: async p => { await cook(ZUPPA)(p); await p.click('#cGo'); await p.waitForTimeout(2100); await p.click('#cNext'); await p.click('#cNext'); } },
  { name: '14-cooking-ingredients-night', theme: 'dark', act: async p => { await cook(ZUPPA)(p); await p.click('#cIngBtn'); await p.waitForSelector('#cookIng.open'); } },
  { name: '15-cooking-day', act: async p => { await cook('Pepperoncini roast')(p); for (let i = 0; i < 3; i++) await p.click('#cNext'); } },
  { name: '16-new-day', as: 'Madi', act: async p => { await p.click('#addBtn'); await p.waitForSelector('#editor.open'); await p.fill('#fName', 'Grandma’s crème brûlée'); await p.click('#fCats [data-new]'); await p.fill('#fNew', 'Dessert'); } },
  { name: '17-edit-day', as: 'Madi', act: async p => { await openRecipe(ZUPPA)(p); await p.click('#editBtn'); await p.waitForSelector('#editor.open'); } },
  { name: '18-edit-end-night', theme: 'dark', as: 'Madi', act: async p => { await openRecipe(ZUPPA)(p); await p.click('#editBtn'); await p.waitForSelector('#editor.open'); await layerEnd('editor')(p); await p.click('#eDelete'); } },
  { name: '19-save-error-day', as: 'Madi', act: async p => { await openRecipe('Salmon bowls')(p); await p.click('#editBtn'); await p.waitForSelector('#editor.open'); signOutAll(); await p.click('#eSave'); await p.waitForSelector('#eError:not([hidden])'); } },
  { name: '20-settings-admin-day', as: 'Mitchell', act: async p => { await settings(p); await p.waitForSelector('#sWaitList [data-approve]'); } },
  { name: '21-settings-family-night', theme: 'dark', as: 'Madi', act: settings },
  { name: '22-settings-signed-out-day', act: settings },
  { name: '23-ask-account-day', act: async p => { await settings(p); await p.click('#aSwap'); await p.fill('#aName', 'Megan'); await p.fill('#aPass', 'pasta-night-42'); await p.click('#aGo'); await p.waitForSelector('#aResult.ok'); } },
  { name: '24-desktop-day', desktop: true, act: openRecipe(ZUPPA) }
];
let signOutAll;   // ends every sign-in on the Worker, for the scene where a save finds the sign-in gone

(async () => {
  await new Promise(res => server.listen(0, '127.0.0.1', res));
  const base = `http://127.0.0.1:${server.address().port}/recipes/`;
  const api = await require('../../worker/test/harness.cjs')(FILE);
  await api.addUser('Madi', 'madi-password');
  await api.addUser('Nicole', 'nicole-password');
  await api.addUser('Jen', 'jen-password', true);
  signOutAll = () => { for (const k of [...api.kv.m.keys()]) if (k.startsWith('auth:session:')) api.kv.m.delete(k); };
  const PASSWORDS = { Madi: 'madi-password', Mitchell: api.ADMIN_PASSWORD };
  const browser = await webkit.launch();
  const problems = [];
  for (const sc of scenes) {
    const ctx = await browser.newContext(sc.desktop
      ? { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 }
      : { ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    let session = null;
    if (sc.as) {
      const res = await api.call('http://x/api/auth/login', { method: 'POST', body: JSON.stringify({ name: sc.as, password: PASSWORDS[sc.as] }) });
      const { token, name, admin } = await res.json();
      session = { token, name, admin };
    }
    await ctx.addInitScript(([theme, session]) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.clear();
      if (theme) localStorage.setItem('theme', theme);
      if (session) localStorage.setItem('dorrance-session', JSON.stringify(session));
    }, [sc.theme || null, session]);
    await ctx.route('**/api/**', api.route);
    if (sc.many) {
      await ctx.route('**/recipes/recipes.json', r => r.fulfill({ contentType: 'application/json', body: MANY }));
      api.gh.text = MANY;
    } else api.gh.text = FILE;
    const page = await ctx.newPage();
    page.on('console', m => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) problems.push(`${sc.name}: console: ${m.text()}`); });
    page.on('pageerror', e => problems.push(`${sc.name}: page error: ${e.message}`));
    await page.goto(base, { waitUntil: 'load' });
    await page.waitForSelector('#deck .rc');
    await page.evaluate(() => document.fonts.ready);
    if (sc.act) await sc.act(page);
    await page.waitForTimeout(sc.wait || 600);
    await page.screenshot({ path: path.join(out, sc.name + '.png') });
    await ctx.close();
  }
  await browser.close();
  server.close();
  console.log(`${scenes.length} screenshots in ${out}`);
  if (problems.length) { console.log(problems.join('\n')); process.exit(1); }
  console.log('No console errors.');
})().catch(e => { console.error(e); process.exit(1); });
