# dorrance.me

This is a static site of small phone apps. GitHub Pages deploys `main` with `.github/workflows/static.yml`. The owner is the only user.

## Push rule

- Push every finished change to `main`. Do not ask first. The owner gave this permission for all sessions.
- Run the checks for the app before you push. Push only when they pass.
- If the session has its own branch, push that branch too.
- Do not rewrite the history of `main`. Fast-forward it or add commits.
- After the push, check that the "Deploy static content to Pages" run starts.

## Layout

- Each app is a folder with its own `index.html`, `manifest.json` and `sw.js`.
- Converter, Parking, Triangle and TV Mount use `shared/base.css` and `shared/base.js`. A change in `shared/` affects all four apps.
- Calculator and Counter have their own styles and scripts.
- All apps share one theme setting, the `theme` key in localStorage.

## Choices

- In every row of choice buttons, put the default option on the left.

## Offline cache

- When you change a file that an app uses, increase `CACHE` in the `sw.js` of that app. Example: `tvmount-v6` becomes `tvmount-v7`.

## TV Mount checks

- Run the unit tests: `node --test tvmount/test/*.test.js`
- Run the browser checks: `NODE_PATH=<folder with playwright> node tvmount/test/flows.cjs`
- Make the screenshots: `NODE_PATH=<folder with playwright> node tvmount/test/shots.cjs <output folder>`
- Look at the screenshots before you push.
- The browser scripts ask for WebKit. If only Chromium is installed, make a `playwright` module that exports `chromium` as `webkit`, and put it on `NODE_PATH`.

## Commits

- Start the commit title with the app name, for example `TV Mount: measure to the soundbar bottom`.
