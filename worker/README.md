# dorrance.me API worker

This Cloudflare Worker stores the shared TV Mount library of saved TVs and mounts. It also runs the Recipes
accounts and saves (`recipes.js`): see `docs/recipes-handoff.md`.

## Set up

1. Open the Cloudflare dashboard.
2. Go to Storage & Databases > KV.
3. Create a namespace with the name `tvmount-lib`.
4. Copy the ID of the namespace into `id` in `wrangler.toml`.
5. In this folder, run `npx wrangler login`.
6. Run `npx wrangler secret put PASSCODE`. Type the passcode for saves and deletes.
7. Run `npx wrangler deploy`.
8. Open `https://dorrance.me/api/tvmount/lib`. You see `{"tvs":[],"mounts":[]}`.

The route `dorrance.me/api/*` sends only these requests to the worker. GitHub Pages serves all other pages.

## Recipes setup

The Recipes routes are `dorrance.me/api/recipes/*`. They keep their accounts in the same KV namespace, under keys that
start with `recipes:`. The admin's name is the var `RECIPES_ADMIN` in `wrangler.toml`.

1. Make a GitHub token at https://github.com/settings/personal-access-tokens/new: "Only select repositories" >
   `dorrance5/dorrance5`, and "Contents" set to "Read and write".
2. Add two secrets. In the Cloudflare dashboard: Workers & Pages > `dorrance-api` > Settings > Variables and Secrets.
   Or in this folder:
   - `npx wrangler secret put GITHUB_TOKEN`, then paste the token.
   - `npx wrangler secret put RECIPES_ADMIN_PASSWORD`, then type the admin password.
3. Open `https://dorrance.me/api/recipes/me`. You see `{"error":"signin"}`.

A change to this folder goes live only with `npx wrangler deploy`. A push to `main` does not deploy the Worker.
