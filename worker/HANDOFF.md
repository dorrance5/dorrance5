# Handoff: deploy the shared library for TV Mount

This file is for Claude Code on the owner's computer. A cloud session wrote it. That session has no access to Cloudflare, and its network cannot reach dorrance.me.

## Goal

Make `https://dorrance.me/api/tvmount/lib` answer with JSON from the Cloudflare Worker in this folder. Then saved TVs and mounts in TV Mount are shared with everyone who uses the site.

## What is done

- The app code is live on dorrance.me. GitHub Pages deploys `main` with `.github/workflows/static.yml`. The repo has a `CNAME` file for `dorrance.me`.
- The app calls the relative path `/api/tvmount/lib`. See `const API` in `tvmount/app.js`.
- The Worker code is `worker/index.js`. The config is `worker/wrangler.toml`. The general setup notes are in `worker/README.md`.
- The KV namespace ID in `wrangler.toml` is still `PASTE_KV_ID_HERE`.
- The owner started the setup in the Cloudflare dashboard. They probably created a KV namespace with the name `tvmount-lib`. They stopped before they created the Worker.

## What the Cloudflare account has

This list comes from a screenshot of Workers & Pages in the dashboard.

- A Pages project `dorrance5`. It is connected to the GitHub repo `dorrance5/dorrance5`. Its domains are `dorrance5.pages.dev` and one more domain. Its last build is the latest commit on `main`.
- A Pages project `main`. It is connected to `dorrance5/main` and is one year old. It is not related to this task.
- No Worker with the name `dorrance-api`.

## What the app needs from the server

| Request | Who can send it | Answer |
|---|---|---|
| `GET /api/tvmount/lib` | Anyone | `{"tvs":[...],"mounts":[...]}` |
| `PUT /api/tvmount/lib/tv` or `/mount`, JSON body with `model` | Passcode only | `{"item":{...},"lib":{...}}`. It saves by model number and ignores case. |
| `DELETE /api/tvmount/lib/tv/<id>` or `/mount/<id>` | Passcode only | `{"lib":{...}}` |

- The app sends the passcode in the header `X-Passcode`.
- A wrong or missing passcode gets `403` and `{"error":"passcode"}`. The app then clears the passcode that it stored on the phone.
- If the answer is not JSON, or not OK, the app keeps the save on the phone. It tries again later.
- The Worker keeps all data in one KV value with the key `tvmount.lib`. The KV binding is `LIB`. The secret is `PASSCODE`.

## Rules

- Do not put the passcode in the chat, in a file, in a commit, or on a command line. The owner types it.
- Ask the owner before you change DNS records, SSL settings, or the GitHub Pages setup.
- Follow `CLAUDE.md` at the root of the repo.

## Steps

1. Open the local clone of `dorrance5/dorrance5`.
2. Run `git pull origin main`.
3. Go to the `worker` folder.
4. Run `npx wrangler login`. The owner approves the login in the browser.
5. Run `npx wrangler whoami`. Make sure that the account is the owner's account.
6. Run `npx wrangler kv namespace list`.
7. If `tvmount-lib` is in the list, copy its `id`.
8. If `tvmount-lib` is not in the list, run `npx wrangler kv namespace create tvmount-lib`. Copy the `id` from the output.
9. If wrangler asks to add the binding to the config, answer no. The binding name must stay `LIB`.
10. In `wrangler.toml`, replace `PASTE_KV_ID_HERE` with the `id`.
11. Run `npx wrangler deploy`. This creates the Worker `dorrance-api` and the route `dorrance.me/api/*`.
12. If the deploy says that it cannot find the zone `dorrance.me`, stop. Tell the owner. The zone is not in this account, or it is not on Cloudflare.

Do not run the next command yourself. It asks for the passcode, and the passcode must stay out of the chat.

13. Ask the owner to open a separate terminal in the `worker` folder.
14. Ask the owner to run `npx wrangler secret put PASSCODE` and type a passcode.

Until the owner sets the passcode, the Worker refuses every save with `403`. This is safe.

## Checks

1. Run `curl -s https://dorrance.me/api/tvmount/lib`. The answer must be `{"tvs":[],"mounts":[]}`, or a list with saved items.
2. Run this command. The answer must be `403`.

   ```sh
   curl -s -o /dev/null -w "%{http_code}\n" -X PUT https://dorrance.me/api/tvmount/lib/tv -H "content-type: application/json" -d '{"model":"x"}'
   ```

3. Run `curl -s -o /dev/null -w "%{http_code}\n" https://dorrance.me/tvmount/`. The answer must be `200`. This shows that the site still loads.
4. Ask the owner to open TV Mount on the phone in Pro mode.
5. Ask the owner to fill in a TV with a model number and tap Save. The app asks for the passcode one time.
6. Ask the owner to open the saved TVs on a second device or in a private window. The TV must be in the list.

## If check 1 gives a web page and not JSON

The route did not catch the request. Find out what serves `dorrance.me`.

1. Run `curl -sI https://dorrance.me/`.
2. If the headers have no `cf-ray`, the DNS record for `dorrance.me` is not proxied. Workers routes run only on proxied traffic.
3. In that case, tell the owner. To proxy GitHub Pages, set the record to Proxied. Set the SSL/TLS mode to Full. The mode Flexible causes a redirect loop.
4. If the headers have `x-github-request-id`, GitHub Pages serves the site.
5. Run `npx wrangler pages project list`. If `dorrance.me` is a domain of the Pages project `dorrance5`, Cloudflare Pages serves the site.
6. If Cloudflare Pages serves the site and the route does not run, tell the owner. One fix is a Pages Function in `functions/api/tvmount/lib/[[path]].js`. It calls the same handler as `worker/index.js`. It needs the KV binding `LIB` and the secret `PASSCODE` in the settings of the Pages project. Get the owner's approval before you add it.

## Finish

1. Commit `worker/wrangler.toml` with the KV namespace ID. The ID is not a secret.
2. Delete this file in the same commit.
3. Use the commit title `TV Mount: connect the shared library to its KV namespace`.
4. Push to `main`.
5. Make sure that the "Deploy static content to Pages" run starts.
6. Tell the owner the result of each check.
