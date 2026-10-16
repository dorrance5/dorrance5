// Renders docs/icons/<app>.svg to <app>/icon-512.png and <app>/icon-180.png.
// Needs Playwright on NODE_PATH (see CLAUDE.md):  NODE_PATH=<folder> node docs/icons/render.cjs
const { webkit } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..', '..');
const APPS = ['calculator', 'counter', 'converter', 'triangle', 'parking', 'tvmount'];

(async () => {
  const browser = await webkit.launch();
  for (const size of [512, 180]) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    for (const app of APPS) {
      const svg = fs.readFileSync(path.join(__dirname, app + '.svg'), 'utf8');
      await page.setContent(`<style>html,body{margin:0;background:#000}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
      await page.screenshot({ path: path.join(root, app, `icon-${size}.png`) });
    }
    await page.close();
  }
  await browser.close();
  console.log(`Rendered ${APPS.length} icons at 512 and 180.`);
})().catch(e => { console.error(e); process.exit(1); });
