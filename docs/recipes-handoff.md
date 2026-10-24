# Handoff: Recipes page at dorrance.me/recipes

## Goal

`recipes/` is a mobile-first family recipe book that the owner edits from a phone: add, edit and delete recipes, and cook from them one step at a time.

This is version 2. Version 1, the aged recipe book with the Rolodex deck, stays at dorrance.me/oldrecipes (`oldrecipes/`). Both read and save the same `recipes/recipes.json`.

## Decisions from the owner

- **Recipes is standalone.** It is not one of the apps. Do not add a `manifest.json` or a `sw.js`. Do not add it to the home page grid. Do not use `shared/base.css` or `shared/base.js`.
- **The theme setting is shared.** The page reads the `theme` key in localStorage (`auto`, `light`, `dark`, `aurora`) and writes `auto`, `light` or `dark`. Settings has Auto, Day and Night, with Auto on the left. This page has no Aurora look: a saved `aurora` shows as Night, with Night picked, and stays saved until another theme is picked. Do not change the format of that key.
- **Mobile first.** Phone width (390 × 844) is the main target. Desktop must work; the content is at most 640 px wide.
- **Editing must be easy.** Some recipes have amounts and steps. Some have only a list of ingredient names. Both must be valid.
- **Accounts with a name and a password.** Recipes uses the dorrance.me accounts (`docs/accounts.md`), one sign-in for the whole site. The owner is the admin. Anyone can ask for an account; it waits until the admin approves it in Settings. Approved people can add, edit and delete recipes. Reading needs no account.
- **The design is the "Recipes v2" canvas** (a claude.ai Design artifact): a warm kitchen app. The owner approved it on 2026-10-24.

## Plan for version 2

1. **Done:** v1 moved to `/oldrecipes`. The new look: the recipe box, the recipe card, cooking mode with timers, add and edit, and Settings.
2. **Next:** the meal plan and the grocery list, kept by the Worker, for the owner and one other account (Nicole) only. The tab bar then has four items for those two: Recipes, Meal plan, Grocery list, Settings. Admin Settings gets "Meal plan and grocery list" with a chip for each account to pick the partner. The recipe card gets "Add to grocery list". The canvas has both screens.
   - The meal plan is one shared week of dinners, Monday to Sunday, this week and next. Each dinner shows who planned it. A day can hold a recipe or a note ("Leftovers").
   - The grocery list merges the same item from several recipes, has "Add something else", and moves items to "Got it".
   - Mind the KV limits in `CLAUDE.md`: no KV write, delete or list on a page load.
3. **Later:** import from a link, for signed-in people only. The Worker reads the page's schema.org Recipe data and the form fills in.
- Still open: an "Add to meal plan" button on the recipe card.

## Current state

- `recipes/index.html` has the markup and the styles. `recipes/app.js` runs the page. `recipes/data.js` has the data format, the search, the amounts and timers, and the saves, and Node can test it. The page loads `shared/account.js` for the sign-in.
- `oldrecipes/` is a frozen copy of version 1 (`index.html`, `app.js`, `data.js`, the icons and its checks in `oldrecipes/test/`). It reads `../recipes/recipes.json` and saves through the same Worker route. Change it only to keep it working.
- `worker/recipes.js` is the Recipes part of the dorrance.me API Worker (`worker/`, on the route `dorrance.me/api/*`). It holds the GitHub token. The accounts are in `worker/auth.js`. `worker/README.md` has the setup.
- The checks are in `recipes/test/`. `CLAUDE.md` has the commands.

## Look

- Colors are tokens on `:root`, with Night under `prefers-color-scheme: dark` (when the theme is not `light`) and under `data-theme="dark"` and `"aurora"`.
  - Tomato `#C63A24` with cream `#FFF6E6` text; butter `#F6C945` and carrot `#E07B2E` with ink `#2A1D17` text.
  - Day: cream ground `#FBF3E4`, surface `#FFFBF4`, ink `#2A1D17`, soft text `#6B5348`, lines `#E8D9BF`, input borders `#9C826A`, focus ring `#2F6FD0`.
  - Night: ground `#1C1512`, surface `#2A201B`, text `#F6EBDA`, soft `#C8B6A3`, lines `#3D3029`, links `#F2836B`, focus ring `#8FB8FF`.
- Fonts from Google Fonts: Fraunces (`'SOFT' 100`, weight 800 for titles) and Figtree for the rest.
- **Category colors.** Soup is tomato, Crock pot is carrot, and a recipe with no category is butter. Any other category gets one of basil `#4F7A3A`, blueberry `#3B5B8C`, plum `#7A3B69`, teal `#2F6B66` or cinnamon `#8A4B2A`, picked by a hash of its name, so it keeps its color. Each has cream text at 4.5:1 or more. A recipe takes the color of its first category.

## Screens

1. **Recipe box.** A tomato header: "Dorrance Family" over "Recipe Book", a search field, and on the right a butter + (signed in) or a "Sign in" pill (signed out). Under it, divider tabs that stick to the top: All on the left, then each category A to Z, each with its count. The open tab is taller and filled with its color, and a band of that color runs under the tabs. Then the deck: cards 104 px tall that overlap so that each shows a 58 px strip with its name and its first category. A search shows why each card matched (the ingredients, a piece of a step or note, or a category) under the name, and that card's strip grows to show it.
2. **Recipe card.** "‹ Recipe box" and, signed in, a pencil to edit. An index card: a strip in the recipe's color, chips for the categories and "Serves", the name, a red rule, an Ingredients · N / Steps · N switch (only when there are steps), then the list on blue lines. The amount at the start of each ingredient is bold, and 1/4 shows as ¼. Below: "Start cooking" (only with steps), the notes on butter, and "From saltandlavender.com ↗" (a link opens in a new tab; text that is not a link shows as "From Grandma Dorrance").
3. **Cooking mode.** Slides up. × to leave, the recipe name, and Ingredients (a sheet over the step). A progress bar, "Step N of M", the step in large Fraunces, Back and Next step (Done on the last step, which goes back to the card). The left and right arrow keys move between steps.
   - **Timers.** The first time a step names ("5 minutes", "10 to 15 minutes", "20-25 mins", "6 hours", "1 hour 30 minutes", "30 seconds") gives the step a timer, starting at the shorter time of a range. Start, Pause, Resume, Again and Reset. A timer keeps running on another step; a button at the top shows it and goes back to it. At the end it says "Time’s up", buzzes the phone and beeps. Leaving cooking mode while a timer runs asks first, and leaving stops the timers.
4. **Add and edit.** A full screen: Cancel, "New recipe" or "Edit recipe", Save. Fields: Name, Category (chips: None on the left, each category in the box, and "New" for a new one; more than one can be picked, and the first picked colors the card), Serves, Ingredients and Steps (one per line, with a count), Notes, and "Where it’s from" (a link, a cookbook or a person). Pasted lists lose their `-`, `•`, `*`, `1.` and `1)` marks. Edit has "Delete recipe", which asks for a second tap. Cancel or the back button with changes asks first.
5. **Settings.** A tab for anyone signed in; for someone signed out, a screen with "‹ Recipe box". Opened over the editor to sign in again during a save, it has "‹ Back" and no tab bar.
   - Signed in: a card with who is signed in ("Admin · signed in" or "Signed in") and Sign out.
   - The admin: "Waiting for you" (a card for each account that waits, with Approve and Deny), then "Accounts" (each with Remove). Deny and Remove ask for a second tap. A dot on Settings in the tab bar while accounts wait.
   - Signed out: "Sign in", or "Ask for an account" with "New here? Ask for an account".
   - "Theme on this phone": Auto, Day, Night. A link to the old recipe book.
6. **Tab bar.** Signed in: Recipes and Settings, on the box and on Settings. Signed out: no tab bar. Step 2 adds Meal plan and Grocery list for the two meal planners.

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
- `tags` are the categories shown on the page. "Soup" and "soup" are one category.
- `ingredients` can be an empty array. The page shows "No ingredients yet." for an empty array.
- `source` is a link, or plain text such as a cookbook or a person. Text that looks like a web address without `https://` gets it; other text stays as typed.
- Make the `id` from the name: lower case, remove apostrophes, put a hyphen in place of other characters that are not letters or numbers. If the `id` already exists, add `-2`, `-3` and so on.
- Fields the page does not know are kept when a recipe is edited.
- Write the file with 2-space indentation and a newline at the end, so that the diffs are easy to read.

## How saving works

The site is static, so the page saves through the API Worker, and the Worker saves to GitHub with the contents API.

- The page calls `/api/recipes/file` with `Authorization: Bearer <sign-in>`. `worker/recipes.js` lists its routes.
- The Worker calls `https://api.github.com/repos/dorrance5/dorrance5/contents/recipes/recipes.json` with the GitHub token in the secret `GITHUB_TOKEN`: a fine-grained personal access token for the `dorrance5/dorrance5` repo only, with "Contents: Read and write". The token never goes to a phone. The page deletes an old `recipes-token` that it finds in localStorage.
- Keep the last good copy of the data under `recipes-cache` (shared with the old book).
- Save steps:
  1. GET the file. Read `content` and `sha`.
  2. Decode the content as base64 UTF-8. Do not use plain `atob`. It breaks non-ASCII text.
  3. Apply the one change (add, edit or delete one recipe by `id`) to the data from step 1. Do not save the whole local copy. This keeps the edits that Claude makes from chat.
  4. PUT `message`, `content` (base64 UTF-8) and `sha`. The Worker checks that the content is JSON with a `recipes` list, adds the person's name to the message, and commits to `main`.
  5. If the PUT returns 409, do steps 1 to 4 one more time.
- Commit titles: `Recipes: add <recipe> (<person>)`, `Recipes: edit <recipe> (<person>)`, `Recipes: delete <recipe> (<person>)`.
- Each save starts a Pages deploy. The live file updates in about 1 minute. Signed in, the page loads the data through the Worker, so the change shows at once. Signed out, it loads `recipes.json` from the site.
- Show plain errors. `recipes/data.js` has the words for each error code from the Worker, for example:
  - signed out: "You are signed out. Sign in again." with a "Sign in again" button that opens Settings over the editor.
  - a bad GitHub token in the Worker: "The recipe book cannot reach GitHub. The admin needs to check its GitHub token."
  - no connection: "No connection. The change is not saved."
- **Waiting accounts.** `GET /api/auth/me` counts them with a KV list, so a page load asks at most once every 6 hours (`recipes-waiting` in localStorage). Opening Settings as the admin always loads the list.

## Mobile rules

- Set inputs and textareas to a font size of 16 px or more, so that iOS does not zoom.
- Make tap targets 44 px or more. In the deck, each card's visible strip is 44 px or more.
- Use `env(safe-area-inset-*)` on the header, the screens, the tab bar and cooking mode.
- Meta tags: `apple-mobile-web-app-capable`, `mobile-web-app-capable`, `apple-mobile-web-app-title` = "Recipes", and one `theme-color` that the page sets to the color at the top of the screen (tomato on the box).
- Each screen over the box is one history entry, so the phone's back button closes it. A tapped card gets the focus back when its recipe closes.
- Keep the screen on (wake lock) while a recipe or cooking mode is open, and accept a refusal.
- Do not let the page scroll sideways at 390 px. The divider tabs scroll sideways inside their row when there are many.
- Respect `prefers-reduced-motion`: the screens appear without sliding.

## Icon

- The icon is still version 1's: a cream bowl (`#f4e5c6`) with three steam lines on sepia brown. A tomato version would fit version 2 better; the owner has not asked for it yet.
- `recipes/favicon.svg`: a rounded square (radius 14 on a 64 viewBox). `recipes/favicon-32.png` and `recipes/apple-touch-icon.png` (180 × 180, full bleed) are rendered from `docs/icons/recipes.svg` and `recipes/favicon.svg` by `docs/icons/render-recipes.cjs`.

## Rules

- Follow `CLAUDE.md` for pushes, commits and costs. Start each commit title with `Recipes:`.
- Do not change other apps, `shared/`, or the home page.
- Do not put the GitHub token, a password or a sign-in in the repo, in a URL, or in a log.

## How to check

1. Run the unit tests, the browser checks and the screenshots in `CLAUDE.md`, for `recipes/` and `oldrecipes/`. Look at the screenshots in Day and in Night.
2. The browser checks run the Worker in Node with KV in memory and a stand-in for GitHub (`worker/test/harness.cjs`), and route the page's `/api/**` requests to it. They cover: the box, dividers and search; the recipe card; cooking mode and its timers (on a test clock); the theme; asking for an account, signing in, a wrong password, an account that waits; approve, deny and remove as the admin; add, edit and delete; a 409 on the first PUT; a sign-in that ended, a bad GitHub token and no connection; the back button; tap sizes and sideways scroll.
3. There must be no console errors. A blocked Google Fonts request in the sandbox is not an error.
4. Push, then check that the "Deploy static content to Pages" run starts.

## Setup for the owner

Do this once, after the Worker is deployed. `worker/README.md` has the same steps.

1. Make a GitHub token: open https://github.com/settings/personal-access-tokens/new. Set "Repository access" to "Only select repositories" and select `dorrance5/dorrance5`. Under "Permissions", set "Contents" to "Read and write". Generate the token and copy it.
2. Open the Cloudflare dashboard. Go to Workers & Pages > `dorrance-api` > Settings > Variables and Secrets.
3. Add a secret `GITHUB_TOKEN` with the token.
4. Add a secret `ADMIN_PASSWORD` with the admin password, for the dorrance.me accounts.
5. On the phone, open dorrance.me/recipes. Tap Sign in. Sign in as Mitchell with that password.
