# dorrance.me API worker

This Cloudflare Worker stores the shared TV Mount library of saved TVs and mounts.

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
