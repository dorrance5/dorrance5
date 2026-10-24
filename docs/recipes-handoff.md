# Handoff: Recipes page at dorrance.me/recipes

## Goal

Make `recipes/` a mobile-first recipe book that the owner can edit on his phone. He must be able to add, edit and delete recipes on the page. Give the page its own icon and favicon.

## Decisions from the owner

- **Recipes is standalone.** It is not one of the apps. Do not add a `manifest.json` or a `sw.js`. Do not add it to the home page grid. Do not use `shared/base.css` or `shared/base.js`.
- **The theme setting is shared.** The page reads the `theme` key in localStorage (`auto`, `light`, `dark`, `aurora`). Aurora is a hidden theme, as in the apps: five taps on "Theme" in Settings turn it on, and an Aurora button then shows in the theme row until another theme is picked. The page writes `auto`, `light`, `dark` or `aurora` to that key. Do not change the format of that key.
- **Mobile first.** The owner uses the page on his phone. Desktop must work, but phone width (390 × 844) is the main target.
- **Editing must be easy.** The owner adds recipes from his phone. Some recipes have quantities and steps. Some recipes have only a list of ingredient names. Both must be valid.
- **Accounts with a name and a password.** The owner is the admin. Anyone can ask for an account on the page; it waits until the admin approves it in Settings. Approved people can add, edit and delete recipes. Reading needs no account.

## Current state

This handoff is done. The page reads `recipes/recipes.json` and saves to it from the phone.

- `recipes/index.html` has the markup and the styles. `recipes/app.js` runs the page. `recipes/data.js` has the data format, the search and the calls to the API Worker, and Node can test it.
- `worker/recipes.js` is the Recipes part of the dorrance.me API Worker (`worker/`, on the route `dorrance.me/api/*`). It keeps the accounts in KV and holds the GitHub token. `worker/README.md` has the setup.
- The checks are in `recipes/test/`. `CLAUDE.md` has the commands.
- The page design is an aged recipe book. Day is sepia paper with a fine grain and darker edges. Night is warm brown. Aurora is a night sky with moving northern lights behind dark glass cards. Color tokens are on `:root`, with `prefers-color-scheme` and `data-theme` overrides. Keep this design and its tokens.
- The title "Dorrance Family Recipe Book" uses IM Fell English from Google Fonts. The other text uses Iowan Old Style, the Apple Books font, with Palatino and Georgia as fallbacks.
- The list is a deck of index cards leaning back in a recipe box, as in the owner's drawing. Each card shows only its name over a red double rule. The next card in the list lies on top of it and covers the rest, so the bottom of a card never shows in the list. Each card is drawn as a flat trapezoid, narrower at the bottom than at the top, with a thin edge and a shadow on its top edge, so the cards stand apart. Do not use 3D transforms for this: perspective makes the letters look italic.
- As the list scrolls, the cards that go past the search field pile up under it. Each card in the pile is squashed further and darker, and its name fades out. Three edges stay in view. Below the pile, the cards come up as usual.
- The recipe sheet is the whole card. It grows out of the strip that was tapped and goes back into it when it closes. With reduced motion, the cards do not pile up and the sheet slides up as usual.

## Data format

`recipes/recipes.json` is the only copy of the recipes. The page reads it. The owner's Claude chats also read and edit it.

```json
{
  "recipes": [
    {
      "id": "megans-zuppa-toscana",
      "name": "Megan's zuppa toscana",
      "servings": "6",
      "tags": ["Soup"],
      "ingredients": ["5 strips bacon (thick-cut)", "1 lb Italian sausage (casings removed)"],
      "steps": ["Cut the bacon into small pieces."],
      "notes": "Half-and-half works in place of cream.",
      "source": "https://www.saltandlavender.com/sausage-bacon-potato-and-kale-soup/"
    }
  ]
}
```

- Only `id`, `name` and `ingredients` are required. Leave out the other fields when they are empty.
- `ingredients` can be an empty array. The page shows "No ingredients yet" for an empty array.
- Make the `id` from the name: lower case, remove apostrophes, put a hyphen in place of other characters that are not letters or numbers. If the `id` already exists, add `-2`, `-3` and so on.
- Write the file with 2-space indentation and a newline at the end, so that the diffs are easy to read.

## Accounts

The admin is the name in the Worker var `RECIPES_ADMIN` ("Mitchell"), with the password in the Worker secret `RECIPES_ADMIN_PASSWORD`. Other people make their own account on the page.

- **Ask for an account:** a name (2 to 24 letters, numbers, spaces and `. ' _ -`) and a password (8 characters or more). The name cannot be one in use or the admin's. The account waits for approval.
- **Approve:** the admin signs in and opens Settings. Under "Accounts", people who are waiting come first, with Approve and Deny. Approved people have Remove. Deny and Remove ask for a second tap. A dot on the menu button shows while someone is waiting.
- **Sign in:** a name and a password. The Worker gives the phone a sign-in that lasts a year. The page keeps it in localStorage under `recipes-session` as `{ token, name, admin }`. Sign out ends it on the phone and on the Worker.
- **Safety:** the Worker keeps passwords as PBKDF2 hashes with a salt, and sign-ins as SHA-256 hashes, so KV holds nothing that works as typed. Eight failed sign-ins or new accounts from one address lock that address for 15 minutes. At most 25 accounts can wait at once. Removing an account ends its sign-ins, even if someone takes the name again. A new admin password ends the admin's sign-ins.

## How saving works

The site is static, so the page saves through the API Worker, and the Worker saves to GitHub with the contents API.

- The page calls `/api/recipes/file` with `Authorization: Bearer <sign-in>`. `worker/recipes.js` lists every route.
- The Worker calls `https://api.github.com/repos/dorrance5/dorrance5/contents/recipes/recipes.json` with the GitHub token in the secret `GITHUB_TOKEN`: a fine-grained personal access token for the `dorrance5/dorrance5` repo only, with "Contents: Read and write". The token never goes to a phone. The page deletes an old `recipes-token` that it finds in localStorage.
- Keep the last good copy of the data under `recipes-cache`.
- Save steps:
  1. GET the file. Read `content` and `sha`.
  2. Decode the content as base64 UTF-8. Do not use plain `atob`. It breaks non-ASCII text.
  3. Apply the one change (add, edit or delete one recipe by `id`) to the data from step 1. Do not save the whole local copy. This keeps the edits that Claude makes from chat.
  4. PUT `message`, `content` (base64 UTF-8) and `sha`. The Worker checks that the content is JSON with a `recipes` list, adds the person's name to the message, and commits to `main`.
  5. If the PUT returns 409, do steps 1 to 4 one more time.
- Commit titles: `Recipes: add <recipe> (<person>)`, `Recipes: edit <recipe> (<person>)`, `Recipes: delete <recipe> (<person>)`.
- Each save starts a Pages deploy. The live file updates in about 1 minute. Signed in, the page loads the data through the Worker, so the change shows at once. Signed out, it loads `recipes.json` from the site.
- Show plain errors. `recipes/data.js` has the words for each error code from the Worker, for example:
  - signed out: "You are signed out. Sign in again." with a button that opens Settings.
  - a bad GitHub token in the Worker: "The recipe book cannot reach GitHub. The admin needs to check its GitHub token."
  - Network error: no connection. The change is not saved.

## Screens

1. **List.** Large title, then a sticky search field. Show the recipes in one list of cards, sorted by name. Each card shows only the name. When a search matches an ingredient, show the matching ingredients on a line under the name and highlight the match. When it matches a step or a note, show that piece of text on that line. When it matches only a tag, show the tag. Put a menu button in the header.
2. **Recipe.** Tap a card to open the recipe in a bottom sheet. Show the name, servings, tags, ingredients, numbered steps, notes and a link to the source site. Tap an ingredient to check it off. Do not save this state. Put an Edit button in the sheet. While the sheet is open, request a screen wake lock, and accept a rejection.
3. **Editor.** Fields: Name, Servings, Tags (comma-separated), Ingredients (a textarea with one item on each line), Steps (one step on each line), Notes, Source link. When the owner pastes text, remove leading `-`, `•`, `*`, `1.` and `1)` from each line. Buttons: Save, Cancel. For an existing recipe, add a Delete button that asks for a second tap.
4. **Add button.** Put a floating "Add recipe" button at the bottom right. Keep it above the safe area. Leave space below the list so that the button does not cover the last card.
5. **Settings.** Open it from the menu button. It has a theme row (Auto, Day, Night, with Auto on the left, and Aurora on the right once it is turned on), then the account: the sign-in form with "New here? Create an account", or who is signed in with "Sign out". For the admin, the list of accounts follows.
6. If no one is signed in, Edit and Add open Settings with the message "Sign in to add or edit recipes."

## Mobile rules

- Set inputs and textareas to a font size of 16 px or more, so that iOS does not zoom.
- Make tap targets 44 px or more.
- Use `env(safe-area-inset-*)` on the header, the sheets and the add button.
- Add these meta tags: `apple-mobile-web-app-capable`, `mobile-web-app-capable`, `apple-mobile-web-app-title` = "Recipes", and two `theme-color` tags (light and dark). When the theme is forced, set `theme-color` to the page background.
- Make the Android back button close an open sheet. Use `history.pushState` when a sheet opens and close the sheet on `popstate`.
- Do not let the page body scroll sideways at 390 px.
- Keep the `prefers-reduced-motion` support.

## Icon

- Draw it as an SVG: a cream bowl (`#f4e5c6`) with three steam lines on sepia brown, a radial gradient from `#8d643b` in the middle to `#5c3d21` at the edges, like the aged page. The owner chose sepia over the first green.
- `recipes/favicon.svg`: a rounded square (radius 14 on a 64 viewBox).
- `recipes/favicon-32.png`: render it from the SVG.
- `recipes/apple-touch-icon.png`: 180 × 180, full bleed, no rounded corners. iOS rounds the corners.
- Put the source in `docs/icons/recipes.svg`. Render the PNGs with Playwright, as `docs/icons/render.cjs` does. Do not add Recipes to the `APPS` list in `render.cjs`.
- Link the icons from `recipes/index.html` with `rel="icon"` and `rel="apple-touch-icon"`.

## Rules

- Follow `CLAUDE.md` for pushes and commits. Start each commit title with `Recipes:`.
- Do not change other apps, `shared/`, or the home page.
- Do not put the GitHub token, a password or a sign-in in the repo, in a URL, or in a log.

## How to check

1. Open the page at 390 × 844 in Day and in Night. Make screenshots and look at them.
2. Run the Worker in Node with KV in memory and a stand-in for GitHub (`recipes/test/api.cjs`), and route the page's `/api/**` requests to it in Playwright. Test these cases:
   - ask for an account, sign in before and after approval, a wrong password, a name in use,
   - approve, deny and remove as the admin,
   - add, edit and delete a recipe,
   - a 409 on the first PUT, then success on the second,
   - a sign-in that ended, a bad GitHub token in the Worker, and no connection.
3. Check that the PUT body decodes to valid JSON with the change in it, and that a name with an apostrophe or an accent saves correctly.
4. Check that there are no console errors. A blocked Google Fonts request in the sandbox is not an error.
5. Push, then check that the "Deploy static content to Pages" run starts.
6. Send the owner the screenshots and the token setup steps.

## Setup for the owner

Do this once, after the Worker is deployed. `worker/README.md` has the same steps.

1. Make a GitHub token: open https://github.com/settings/personal-access-tokens/new. Set "Repository access" to "Only select repositories" and select `dorrance5/dorrance5`. Under "Permissions", set "Contents" to "Read and write". Generate the token and copy it.
2. Open the Cloudflare dashboard. Go to Workers & Pages > `dorrance-api` > Settings > Variables and Secrets.
3. Add a secret `GITHUB_TOKEN` with the token.
4. Add a secret `RECIPES_ADMIN_PASSWORD` with the admin password.
5. On the phone, open dorrance.me/recipes. Open Settings. Sign in as Mitchell with that password.
