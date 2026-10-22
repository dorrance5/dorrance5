# Handoff: Recipes page at dorrance.me/recipes

## Goal

Make `recipes/` a mobile-first recipe book that the owner can edit on his phone. He must be able to add, edit and delete recipes on the page. Give the page its own icon and favicon.

## Decisions from the owner

- **Recipes is standalone.** It is not one of the apps. Do not add a `manifest.json` or a `sw.js`. Do not add it to the home page grid. Do not use `shared/base.css` or `shared/base.js`.
- **The theme setting is shared.** The page reads the `theme` key in localStorage (`auto`, `light`, `dark`, `aurora`). Show `aurora` as dark. The page can write `auto`, `light` or `dark` to that key. Do not change the format of that key.
- **Mobile first.** The owner uses the page on his phone. Desktop must work, but phone width (390 × 844) is the main target.
- **Editing must be easy.** The owner adds recipes from his phone. Some recipes have quantities and steps. Some recipes have only a list of ingredient names. Both must be valid.

## Current state

This handoff is done. The page reads `recipes/recipes.json` and saves to it from the phone.

- `recipes/index.html` has the markup and the styles. `recipes/app.js` runs the page. `recipes/data.js` has the data format, the search and the GitHub calls, and Node can test it.
- The checks are in `recipes/test/`. `CLAUDE.md` has the commands.
- The page design: green accent, Bricolage Grotesque for headings, Atkinson Hyperlegible for body text, a sticky search field, and one list of recipes. Day and Night tokens are on `:root`, with `prefers-color-scheme` and `data-theme` overrides. Keep this design and its color tokens.

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

## How saving works

The site is static, so the page saves directly to GitHub with the contents API.

- Endpoint: `https://api.github.com/repos/dorrance5/dorrance5/contents/recipes/recipes.json`
- Auth: a fine-grained personal access token. Scope it to the `dorrance5/dorrance5` repo only, with "Contents: Read and write".
- Keep the token in localStorage under `recipes-token`. Keep the last good copy of the data under `recipes-cache`.
- Save steps:
  1. GET the file with `?ref=main` and `cache: 'no-store'`. Read `content` and `sha`.
  2. Decode the content as base64 UTF-8. Do not use plain `atob`. It breaks non-ASCII text.
  3. Apply the one change (add, edit or delete one recipe by `id`) to the data from step 1. Do not save the whole local copy. This keeps the edits that Claude makes from chat.
  4. PUT the file with `message`, `content` (base64 UTF-8), `sha` and `branch: "main"`.
  5. If the PUT returns 409, do steps 1 to 4 one more time.
- Commit titles: `Recipes: add <name>`, `Recipes: edit <name>`, `Recipes: delete <name>`.
- Each save starts a Pages deploy. The live file updates in about 1 minute. With a token, load the data from the API so the owner sees his change at once. Without a token, load `recipes.json` from the site.
- Show plain errors:
  - 401: the token is wrong or expired.
  - 403 or 404: the token cannot reach the repo, or it does not have "Contents: Read and write".
  - Network error: no connection. The change is not saved.

## Screens

1. **List.** Large title, then a sticky search field. Show the recipes in one list, sorted by name. Each row shows the name and a second line with the tags and the ingredient count. When a search matches an ingredient, show the matching ingredients on the second line and highlight the match. Put a menu button in the header.
2. **Recipe.** Tap a row to open the recipe in a bottom sheet. Show the name, servings, tags, ingredients, numbered steps, notes and a link to the source site. Tap an ingredient to check it off. Do not save this state. Put an Edit button in the sheet. While the sheet is open, request a screen wake lock, and accept a rejection.
3. **Editor.** Fields: Name, Servings, Tags (comma-separated), Ingredients (a textarea with one item on each line), Steps (one step on each line), Notes, Source link. When the owner pastes text, remove leading `-`, `•`, `*`, `1.` and `1)` from each line. Buttons: Save, Cancel. For an existing recipe, add a Delete button that asks for a second tap.
4. **Add button.** Put a floating "Add recipe" button at the bottom right. Keep it above the safe area. Leave space below the list so that the button does not cover the last row.
5. **Settings.** Open it from the menu button. It has a theme row (Auto, Day, Night, with Auto on the left), a token field (type `password`), "Save and test", "Disconnect", and a link to `https://github.com/settings/personal-access-tokens/new` with short setup steps.
6. If there is no token, Edit and Add open Settings with the message "Connect GitHub to add or edit recipes."

## Mobile rules

- Set inputs and textareas to a font size of 16 px or more, so that iOS does not zoom.
- Make tap targets 44 px or more.
- Use `env(safe-area-inset-*)` on the header, the sheets and the add button.
- Add these meta tags: `apple-mobile-web-app-capable`, `mobile-web-app-capable`, `apple-mobile-web-app-title` = "Recipes", and two `theme-color` tags (light and dark). When the theme is forced, set `theme-color` to the page background.
- Make the Android back button close an open sheet. Use `history.pushState` when a sheet opens and close the sheet on `popstate`.
- Do not let the page body scroll sideways at 390 px.
- Keep the `prefers-reduced-motion` support.

## Icon

- Draw it as an SVG: a cream bowl with three steam lines on the green accent (`#2f6b45`).
- `recipes/favicon.svg`: a rounded square (radius 14 on a 64 viewBox).
- `recipes/favicon-32.png`: render it from the SVG.
- `recipes/apple-touch-icon.png`: 180 × 180, full bleed, no rounded corners. iOS rounds the corners.
- Put the source in `docs/icons/recipes.svg`. Render the PNGs with Playwright, as `docs/icons/render.cjs` does. Do not add Recipes to the `APPS` list in `render.cjs`.
- Link the icons from `recipes/index.html` with `rel="icon"` and `rel="apple-touch-icon"`.

## Rules

- Follow `CLAUDE.md` for pushes and commits. Start each commit title with `Recipes:`.
- Do not change other apps, `shared/`, or the home page.
- Do not put the token in the repo, in a URL, or in a log.

## How to check

1. Open the page at 390 × 844 in Day and in Night. Make screenshots and look at them.
2. Mock the GitHub API in Playwright (`page.route`). Test these cases:
   - add a recipe,
   - edit a recipe,
   - delete a recipe,
   - a 409 on the first PUT, then success on the second,
   - a 401.
3. Check that the PUT body decodes to valid JSON with the change in it, and that a name with an apostrophe or an accent saves correctly.
4. Check that there are no console errors. A blocked Google Fonts request in the sandbox is not an error.
5. Push, then check that the "Deploy static content to Pages" run starts.
6. Send the owner the screenshots and the token setup steps.

## Token setup for the owner

1. Open https://github.com/settings/personal-access-tokens/new.
2. Set "Repository access" to "Only select repositories".
3. Select `dorrance5/dorrance5`.
4. Under "Permissions", set "Contents" to "Read and write".
5. Generate the token. Copy it.
6. On the phone, open dorrance.me/recipes. Open Settings. Paste the token. Tap "Save and test".
