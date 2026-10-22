// Renders the Recipes icons: docs/icons/recipes.svg to recipes/apple-touch-icon.png (180, full bleed; iOS rounds
// the corners) and recipes/favicon.svg to recipes/favicon-32.png (32, rounded, transparent corners).
// Recipes is not one of the apps, so it is not in the APPS list of render.cjs.
// Needs Playwright on NODE_PATH (see CLAUDE.md):  NODE_PATH=<folder> node docs/icons/render-recipes.cjs
const { webkit } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..', '..');
const JOBS = [
  { src: path.join(__dirname, 'recipes.svg'), out: 'recipes/apple-touch-icon.png', size: 180 },
  { src: path.join(root, 'recipes', 'favicon.svg'), out: 'recipes/favicon-32.png', size: 32 }
];

(async () => {
  const browser = await webkit.launch();
  for (const { src, out, size } of JOBS) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    const svg = fs.readFileSync(src, 'utf8');
    await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
    await page.screenshot({ path: path.join(root, out), omitBackground: true });
    await page.close();
  }
  await browser.close();
  console.log(`Rendered ${JOBS.map(j => j.out).join(' and ')}.`);
})().catch(e => { console.error(e); process.exit(1); });
