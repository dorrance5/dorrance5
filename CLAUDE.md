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
- `shared/account.js` is the dorrance.me sign-in. Only pages that load it use it (Recipes). It does not affect the four apps above.
- All apps share one theme setting, the `theme` key in localStorage.

## Design

- TV Mount is the model for how every app looks. `docs/design-handoff.md` tells how to restyle the other apps.

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

## Recipes

- `recipes/` is a standalone page, not one of the apps. It has no `manifest.json` and no `sw.js`, so there is no `CACHE` to increase. Do not add it to the home page.
- `recipes/recipes.json` is the only copy of the recipes. The page saves to it through the API Worker (`worker/recipes.js`), which holds the GitHub token. `docs/recipes-handoff.md` has the data format.
- Run the unit tests: `node --test recipes/test/*.test.js`
- Run the browser checks: `NODE_PATH=<folder with playwright> node recipes/test/flows.cjs`
- Make the screenshots: `NODE_PATH=<folder with playwright> node recipes/test/shots.cjs <output folder>`
- Render the icons: `NODE_PATH=<folder with playwright> node docs/icons/render-recipes.cjs`

## Accounts and the API Worker

- `worker/` is the API Worker on `dorrance.me/api/*`: the TV Mount library, the dorrance.me accounts (`worker/auth.js`) and the Recipes saves. `docs/accounts.md` tells how the accounts work and how to use them in an app.
- Run the Worker checks: `node --test worker/test/*.test.js`
- A push does not deploy the Worker. After a change in `worker/`, run the Worker checks and the checks of the apps that use the changed routes, then run `npx wrangler deploy` in `worker/`. Then check that `https://dorrance.me/api/tvmount/lib` still answers.

## Commits

- Start the commit title with the app name, for example `TV Mount: measure to the soundbar bottom`.
