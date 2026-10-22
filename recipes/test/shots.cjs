// Phone-size screenshots of the Recipes page in WebKit, Day and Night; exits 1 on any console error or page error.
// The GitHub API is a stand-in, so nothing is saved. The fonts load from Google when there is a connection.
//   NODE_PATH=/path/to/node_modules node recipes/test/shots.cjs [outdir]
const { webkit, devices } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const out = path.resolve(process.argv[2] || path.join(__dirname, 'shots'));
fs.mkdirSync(out, { recursive: true });
const FILE = fs.readFileSync(path.join(root, 'recipes', 'recipes.json'), 'utf8');

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(f).pipe(res);
});

const openRecipe = name => async p => { await p.click(`#list .row:has-text("${name}")`); await p.waitForSelector('#view.open'); };
const scenes = [
  { name: '01-list-day' },
  { name: '02-list-night', theme: 'dark' },
  { name: '03-search-day', act: async p => { await p.fill('#q', 'red onion'); } },
  { name: '04-search-night', theme: 'dark', act: async p => { await p.fill('#q', 'onion'); } },
  { name: '05-list-end-day', act: async p => { await p.evaluate(() => scrollTo(0, document.body.scrollHeight)); } },
  { name: '06-recipe-day', act: async p => { await openRecipe("Megan's zuppa toscana")(p); await p.click('#vBody .checks li:nth-child(1) label'); await p.click('#vBody .checks li:nth-child(3) label'); } },
  { name: '07-recipe-steps-day', act: async p => { await openRecipe("Megan's zuppa toscana")(p); await p.evaluate(() => document.querySelector('#vBody .steps').scrollIntoView()); } },
  { name: '08-recipe-night', theme: 'dark', act: openRecipe('Pepperoncini roast') },
  { name: '09-recipe-no-ingredients-night', theme: 'dark', act: openRecipe("Jen's tortellini pasta salad") },
  { name: '10-edit-day', token: true, act: async p => { await openRecipe("Megan's zuppa toscana")(p); await p.click('#editBtn'); await p.waitForSelector('#editor.open'); } },
  { name: '11-edit-bottom-night', theme: 'dark', token: true, act: async p => { await openRecipe('Pepperoncini roast')(p); await p.click('#editBtn'); await p.waitForSelector('#editor.open'); await p.evaluate(() => { const b = document.getElementById('eBody'); b.scrollTop = b.scrollHeight; }); await p.click('#eDelete'); } },
  { name: '12-new-day', token: true, act: async p => { await p.click('#addBtn'); await p.waitForSelector('#editor.open'); await p.fill('#fName', 'Grandma’s crème brûlée'); } },
  { name: '13-save-error-day', token: true, apiStatus: 401, act: async p => { await openRecipe('Salmon bowls')(p); await p.click('#editBtn'); await p.waitForSelector('#editor.open'); await p.click('#eSave'); await p.waitForSelector('#eError:not([hidden])'); } },
  { name: '14-settings-need-day', act: async p => { await p.click('#addBtn'); await p.waitForSelector('#settings.open'); } },
  { name: '15-settings-connected-night', theme: 'dark', token: true, act: async p => { await p.click('#menuBtn'); await p.waitForSelector('#settings.open'); } },
  { name: '16-desktop-day', desktop: true, act: openRecipe("Megan's zuppa toscana") }
];

(async () => {
  await new Promise(res => server.listen(0, '127.0.0.1', res));
  const base = `http://127.0.0.1:${server.address().port}/recipes/`;
  const browser = await webkit.launch();
  const problems = [];
  for (const sc of scenes) {
    const ctx = await browser.newContext(sc.desktop
      ? { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 }
      : { ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    await ctx.addInitScript(([theme, token]) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.clear();
      if (theme) localStorage.setItem('theme', theme);
      if (token) localStorage.setItem('recipes-token', 'github_pat_SHOTS');
    }, [sc.theme || null, !!sc.token]);
    await ctx.route('https://api.github.com/**', r => {
      const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, PUT', 'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, X-GitHub-Api-Version' };
      if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
      if (sc.apiStatus && r.request().method() === 'PUT') return r.fulfill({ status: sc.apiStatus, headers: cors, contentType: 'application/json', body: '{}' });
      if (sc.apiStatus && sc.loaded) return r.fulfill({ status: sc.apiStatus, headers: cors, contentType: 'application/json', body: '{}' });
      sc.loaded = true;
      return r.fulfill({ headers: cors, contentType: 'application/json', body: JSON.stringify({ sha: 's0', content: Buffer.from(FILE).toString('base64') }) });
    });
    const page = await ctx.newPage();
    page.on('console', m => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) problems.push(`${sc.name}: console: ${m.text()}`); });
    page.on('pageerror', e => problems.push(`${sc.name}: page error: ${e.message}`));
    await page.goto(base, { waitUntil: 'load' });
    await page.waitForSelector('#list .row');
    if (sc.act) await sc.act(page);
    await page.waitForTimeout(450);
    await page.screenshot({ path: path.join(out, sc.name + '.png') });
    await ctx.close();
  }
  await browser.close();
  server.close();
  console.log(`${scenes.length} screenshots in ${out}`);
  if (problems.length) { console.log(problems.join('\n')); process.exit(1); }
  console.log('No console errors.');
})().catch(e => { console.error(e); process.exit(1); });
