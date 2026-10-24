// Phone-size screenshots of the Recipes page in WebKit, Day, Night and Aurora; exits 1 on any console error or page error.
// The API Worker runs in Node (worker/test/harness.cjs) with a stand-in for GitHub, so nothing is saved. The fonts load from Google
// when there is a connection.
//   NODE_PATH=/path/to/node_modules node oldrecipes/test/shots.cjs [outdir]
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

const openRecipe = name => async p => { await p.click(`#list .card:has-text("${name}")`); await p.waitForSelector('#view.open'); };
const scroll = y => async p => { await p.evaluate(y => scrollTo(0, y), y); };
const settings = async p => { await p.click('#menuBtn'); await p.waitForSelector('#settings.open'); };
const scenes = [
  { name: '01-list-day' },
  { name: '02-pile-day', many: true, act: scroll(900) },
  { name: '03-pile-night', theme: 'dark', many: true, act: scroll(900) },
  { name: '04-pile-aurora', theme: 'aurora', many: true, act: scroll(900) },
  { name: '05-search-day', act: async p => { await p.fill('#q', 'red onion'); } },
  { name: '06-search-night', theme: 'dark', act: async p => { await p.fill('#q', 'onion'); } },
  { name: '07-list-end-day', act: async p => { await p.evaluate(() => scrollTo(0, document.body.scrollHeight)); } },
  { name: '08-recipe-day', act: async p => { await openRecipe("Megan's zuppa toscana")(p); await p.click('#vBody .checks li:nth-child(1) label'); await p.click('#vBody .checks li:nth-child(3) label'); } },
  { name: '09-recipe-steps-day', act: async p => { await openRecipe("Megan's zuppa toscana")(p); await p.evaluate(() => document.querySelector('#vBody .steps').scrollIntoView()); } },
  { name: '10-recipe-night', theme: 'dark', act: openRecipe('Pepperoncini roast') },
  { name: '11-recipe-aurora', theme: 'aurora', act: openRecipe("Megan's zuppa toscana") },
  { name: '12-recipe-no-ingredients-night', theme: 'dark', act: openRecipe("Jen's tortellini pasta salad") },
  { name: '13-pulling-out-day', wait: 140, act: async p => { await p.evaluate(() => scrollTo(0, 300)); await p.waitForTimeout(100); await p.click('#list .card:has-text("Salmon bowls")'); } },
  { name: '14-edit-day', as: 'Madi', act: async p => { await openRecipe("Megan's zuppa toscana")(p); await p.click('#editBtn'); await p.waitForSelector('#editor.open'); } },
  { name: '15-edit-bottom-night', theme: 'dark', as: 'Madi', act: async p => { await openRecipe('Pepperoncini roast')(p); await p.click('#editBtn'); await p.waitForSelector('#editor.open'); await p.evaluate(() => { const b = document.getElementById('eBody'); b.scrollTop = b.scrollHeight; }); await p.click('#eDelete'); } },
  { name: '16-new-day', as: 'Madi', act: async p => { await p.click('#addBtn'); await p.waitForSelector('#editor.open'); await p.fill('#fName', 'Grandma’s crème brûlée'); } },
  { name: '17-save-error-day', as: 'Madi', act: async p => { await openRecipe('Salmon bowls')(p); await p.click('#editBtn'); await p.waitForSelector('#editor.open'); signOutAll(); await p.click('#eSave'); await p.waitForSelector('#eError:not([hidden])'); } },
  { name: '18-settings-need-day', act: async p => { await p.click('#addBtn'); await p.waitForSelector('#settings.open'); } },
  { name: '19-settings-admin-night', theme: 'dark', as: 'Mitchell', act: async p => { await settings(p); await p.waitForSelector('#people [data-approve]'); await p.evaluate(() => { const b = document.querySelector('#settings .body'); b.scrollTop = b.scrollHeight; }); } },
  { name: '20-settings-aurora', theme: 'aurora', as: 'Madi', act: settings },
  { name: '21-desktop-day', desktop: true, act: openRecipe("Megan's zuppa toscana") },
  { name: '22-new-account-day', act: async p => { await settings(p); await p.click('#aSwap'); await p.fill('#aName', 'Megan'); await p.fill('#aPass', 'pasta-night-42'); await p.click('#aGo'); await p.waitForSelector('#sResult.ok'); } },
  { name: '23-menu-dot-day', as: 'Mitchell', act: async p => { await p.waitForSelector('#menuBtn.dot'); } }
];
let signOutAll;   // ends every sign-in on the Worker, for the scene where a save finds the sign-in gone

(async () => {
  await new Promise(res => server.listen(0, '127.0.0.1', res));
  const base = `http://127.0.0.1:${server.address().port}/oldrecipes/`;
  const api = await require('../../worker/test/harness.cjs')(FILE);
  await api.addUser('Madi', 'madi-password');
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
    if (sc.many) await ctx.route('**/recipes/recipes.json', r => r.fulfill({ contentType: 'application/json', body: MANY }));
    const page = await ctx.newPage();
    page.on('console', m => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) problems.push(`${sc.name}: console: ${m.text()}`); });
    page.on('pageerror', e => problems.push(`${sc.name}: page error: ${e.message}`));
    await page.goto(base, { waitUntil: 'load' });
    await page.waitForSelector('#list .card');
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
