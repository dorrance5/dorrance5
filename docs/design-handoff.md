# Design handoff: make every app look like TV Mount

## Goal

Restyle the other apps on dorrance.me so that they look like TV Mount (`tvmount/`). The owner likes the TV Mount design. Keep what each app does. Change only how it looks.

The apps to restyle are Calculator, Converter, Counter, Triangle, Parking and the home page (`index.html`).

## Before you start

1. Read `CLAUDE.md`. It has the push rule, the cache rule and the choice rule.
2. Open TV Mount at phone size (390 × 844) in Day and in Night. Look at Simple mode first. The owner uses Simple mode most.
3. Make reference screenshots of TV Mount with `tvmount/test/shots.cjs`. The commands are in `CLAUDE.md`.
4. Ask the owner these questions before you change code:
   - TV Mount has no Aurora theme. Remove Aurora from all apps? Calculator, Counter and the home page use Aurora now.
   - Calculator has its own glass look and its own theme code. Restyle all of it, or only its colors?
   - Parking is not on the home page. Restyle it too?
   - Triangle and Converter take numbers with the phone keyboard. Give them the TV Mount keypad, or keep the phone keyboard?

## What the TV Mount design is

All of it is in `tvmount/index.html` (styles) and `tvmount/app.js` (`card()`, `ICON`, `HUE`, `seg()`).

### Colors

- There are two themes, Day and Night. Auto follows the phone.
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

### Keypad

- The TV Mount keypad follows Calculator. Whole numbers are on the left. The numerator and the denominator are on the right, with a teal-to-purple bar between them.
- Numerator digits are teal. Denominator digits are purple.
- The keypad is 313 px tall on an iPhone 13.

### Type and shape

- The font is `--ui`, the system rounded font.
- Cards have a 20 px radius. Buttons and chips have a 13 to 14 px radius.
- Use sentence case. Small section labels are uppercase.

## Plan

1. Move the shared parts from `tvmount/index.html` to `shared/base.css`:
   - the Day and Night tokens, but not the sketch tokens (`--tv`, `--wood`, `--stud` and the others),
   - `.pro`, `.ic` and the `hue-*` classes,
   - the card header (`.sec`), `.fld`, `.hero`, `.tri`, `.fact` and `.li` with `h-*`.

   Keep the sketch and keypad styles in `tvmount/index.html`. Then make TV Mount screenshots again. They must match the reference screenshots.
2. Restyle the apps that use `shared/`: Converter, Triangle and Parking.
3. Restyle Counter and Calculator. They have their own styles and theme code. Move them onto `shared/base.css` and `shared/base.js` if the owner agrees. This keeps one source for the look.
4. Restyle the home page: the icon grid, the menu and the theme picker.
5. If the owner removes Aurora everywhere:
   - remove it from `THEMES` in `shared/base.js` and from `shared/base.css`,
   - remove it from Calculator, Counter and the home page,
   - show a stored `aurora` setting as Night. TV Mount already does this with `App.init({ aurora: false })`.

## Rules

- Do not change the localStorage keys or the format of saved data in any app.
- Do not change the sync code or the web app address in Parking. It writes to the owner's Google Sheet.
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
- Send the owner the before and after screenshots.
