# Design handoff: make every app look like TV Mount

## Goal

Restyle the other apps on dorrance.me so that they look like TV Mount (`tvmount/`). The owner likes the TV Mount design. Keep what each app does. Change only how it looks.

| App | What to do |
|---|---|
| Converter (`converter/`) | Full restyle. |
| Triangle (`triangle/`) | Full restyle. |
| Counter (`counter/`) | Full restyle. |
| Home page (`index.html`) | Full restyle. |
| Calculator (`calculator/`) | Colors only. Keep its glass look and its layout. |
| Parking (`parking/`) | Do not change. It must keep its current look. |
| TV Mount (`tvmount/`) | The model. Only move its shared parts to `shared/`. |

## Decisions from the owner

- **Aurora is a secret theme.** Remove it from every theme picker. Keep it in the code. A hidden gesture turns it on (see "Secret Aurora" below). TV Mount does not get Aurora at all.
- **Calculator gets new colors only.** Keep its glass look, its layout and its keys. Change the colors of its Day and Night themes to the TV Mount colors.
- **Parking is not included.** It must look the same after your work as it does now.
- **Triangle and Converter keep the phone keyboard.** Do not give them the TV Mount keypad.

## Before you start

1. Read `CLAUDE.md`. It has the push rule, the cache rule and the choice rule.
2. Open TV Mount at phone size (390 × 844) in Day and in Night. Look at Simple mode first. The owner uses Simple mode most.
3. Make reference screenshots of TV Mount with `tvmount/test/shots.cjs`. The commands are in `CLAUDE.md`.
4. Make Day and Night screenshots of every app at 390 × 844, Parking included. You need them to compare later.

## What the TV Mount design is

All of it is in `tvmount/index.html` (styles) and `tvmount/app.js` (`card()`, `ICON`, `HUE`, `seg()`).

### Colors

- There are two themes in the picker, Day and Night. Auto follows the phone.
- The grays are neutral. Do not use blue grays.
- The accent colors come from Atlassian's palette.
- Blue is for selection outside a card, the main result card, and the main button (for example Done).
- Red is only for drilling and for danger.

| Name | Neutral token | Day | Night |
|---|---|---|---|
| Page | `--bg` | `#F4F4F5` | `#141517` |
| Card | `--tile` | `#FFFFFF` | `#1F2023` |
| Text | `--text` | `#1E2126` | `#E6E7E9` |
| Muted text | `--muted` | `#60646C` | `#A0A3A9` |

| Hue | Day text | Day background | Night text | Night background |
|---|---|---|---|---|
| blue | `#0C66E4` | `#E9F2FF` | `#85B8FF` | `#1C2B41` |
| teal | `#227D9B` | `#E7F9FF` | `#6CC3E0` | `#1A2E36` |
| purple | `#6E5DC6` | `#F3F0FF` | `#B8ACF6` | `#2B273F` |
| magenta | `#AE4787` | `#FFECF8` | `#F797D2` | `#3D2232` |
| orange | `#C25100` | `#FFF3EB` | `#FEA362` | `#3A2B1F` |
| yellow | `#946F00` | `#FFF7D6` | `#F5CD47` | `#36301A` |
| lime | `#4C6B1F` | `#EFFFD6` | `#B3DF72` | `#28311B` |
| green | `#1F845A` | `#DCFFF1` | `#7EE2B8` | `#1C3329` |
| red | `#C9372C` | `#FFECEB` | `#FD9891` | `rgba(248,113,104,.16)` |

### Cards with a color

- Each part of the form is a card (`section.card.sec`). The header has an icon tile, a title and a fold arrow.
- Each card has one hue, set by the class `hue-<name>`.
- The icon tile is 28 px with an 8 px radius. It shows the hue on its background color.
- Selected buttons, selected chips and the field being typed in use the hue of their card. The variables are `--hc`, `--hbg` and `--hl`.
- Give the cards that people use most five different hues.
- Use the same hue for the part of the screen that the card controls. In TV Mount, the center line card is magenta, and the center line on the sketch is magenta.
- A result label takes the hue of the card that it comes from (`.li.h-<name>`).

### Results

- The main result is a `.hero` card. It has a blue-to-purple background, a small uppercase label, and a 40 px value.
- A second result can use a smaller `.hero` in another hue. In TV Mount, the soundbar drill height uses teal.
- Small facts go in `.tri` tiles and in a `.list` card with `.li` rows.

### Choices

- A row of choices is a `.seg`.
- Put the default choice on the left, in every row.

### Type and shape

- The font is `--ui`, the system rounded font.
- Cards have a 20 px radius. Buttons and chips have a 13 to 14 px radius.
- Use sentence case. Small section labels are uppercase.

### Keypad

- The TV Mount keypad is for TV Mount only. Do not add it to other apps.

## Secret Aurora

- Every theme picker shows Auto, Day and Night only.
- Tap the "Theme" label five times within 2 seconds to turn Aurora on. Show a short toast: "Aurora".
- While Aurora is on, show an extra "Aurora" button in the picker, selected. When the owner picks another theme, hide that button again.
- The setting stays in the shared `theme` key as `aurora`, so it carries to the other apps.
- TV Mount ignores Aurora and shows Night (`App.init({ aurora: false })` does this now). Keep that.
- `shared/base.js`, Calculator, Counter and the home page each have theme code. Do the same thing in each.

## Plan

1. Freeze Parking first. Copy `shared/base.css` and `shared/base.js` to `parking/base.css` and `parking/base.js`. Point `parking/index.html` and `parking/sw.js` at the copies. Increase its `CACHE`. Make Parking screenshots again. They must match the ones from before.
2. Move the shared parts from `tvmount/index.html` to `shared/base.css`:
   - the Day and Night tokens, but not the sketch tokens (`--tv`, `--wood`, `--stud` and the others),
   - `.pro`, `.ic` and the `hue-*` classes,
   - the card header (`.sec`), `.fld`, `.hero`, `.tri`, `.fact` and `.li` with `h-*`.

   Keep the sketch and keypad styles in `tvmount/index.html`. Then make TV Mount screenshots again. They must match the reference screenshots.
3. Make Aurora secret in `shared/base.js`, as "Secret Aurora" says.
4. Restyle Converter and Triangle. They use `shared/`.
5. Restyle Counter. It has its own styles and theme code. Move it onto `shared/base.css` and `shared/base.js` if the change stays small. If not, copy the tokens into it.
6. Recolor Calculator. Change only the colors in its `body[data-theme="day"]` and `body[data-theme="night"]` rules and in its theme picker. Make Aurora secret in its own theme code.
7. Restyle the home page: the icon grid, the menu and the theme picker. Make Aurora secret there too.

## Rules

- Do not change the localStorage keys or the format of saved data in any app.
- Do not change Parking, except for step 1 of the plan.
- Every app must still work offline. Increase `CACHE` in the `sw.js` of each app that you change.
- Keep the `prefers-reduced-motion` support.
- Commit each app on its own. Start the title with the app name.
- Push as `CLAUDE.md` says.

## How to check

- TV Mount: run its unit tests and browser checks. They must pass.
- Other apps have no tests. For each app:
  - make Day and Night screenshots at 390 × 844, before and after,
  - use the main functions in a browser,
  - make sure there are no console errors.
- Check the secret Aurora gesture in each app that has a theme picker.
- Check that Parking looks the same as before.
- Send the owner the before and after screenshots.
