# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running / building

No build step. Serve the folder and open it:

```sh
python3 -m http.server 8000
```

There is no test suite. Logic can be exercised headlessly in the page console, e.g. by
constructing a `Race` and stepping `race.update(1/60, [race.aiControl(car)])` to run a
human car on autopilot (see "Balance" below). When testing in a browser, disable the
cache — stale `js/*.js` files are easy to mistake for bugs.

Asset links in `index.html` (and the font URL in `css/style.css`) carry `?v=<content
hash>`. Run `./stamp.sh` after changing any file under `js/`, `css/` or `fonts/`, and
before committing; `./stamp.sh --check` verifies. New script tags get a hash on the next run.

Deploy with `./deploy.sh` (FTPS via rclone `ftp_iso3200.net`). That remote is rooted at
the whole site's web root, so never point rclone anywhere but `drive-challenge/`.

## Architecture

Classic `<script>` files (not ES modules, so `file://` works) that share top-level
`const`s. Load order matters and is set in `index.html`:

| File | Role |
|:--|:--|
| `js/util.js` | `U`: math, seeded RNG (mulberry32), colour helpers, formatting |
| `js/data.js` | Constants, `SURFACES`, `CARS` (ratings, paint, gearing, engine voice), `SEASONS`, AI names |
| `js/profiles.js` | `Profiles`: one player profile per slot (UUID + name) in `localStorage`; name rules |
| `js/physics.js` | `Physics.derive` maps the 1–5 ratings to numbers; `stepCar` is shared by humans and AI |
| `js/sprites.js` | Procedural pixel art: scenery, three car rear views (steer poses, brake lights), parallax backgrounds |
| `js/track.js` | `Track`: seeded segment course per season, closed loop, scenery placement |
| `js/race.js` | `Race`: grid, countdown, AI driver, collisions, checkpoint timing, results |
| `js/render.js` | Segment-based pseudo-3D renderer (Jake Gordon style), weather, HUD; one `view` per screen half |
| `js/audio.js` | `Sfx`: synthesised engines, tyre squeal, effects, rain |
| `js/music.js` | `Music`: step-sequenced chiptune, one song per season plus title; `SONGS` data at the top |
| `js/records.js` | `Records`: loads and submits online records (`api/records.php`); fails quietly offline |
| `js/input.js` | Keyboard (`e.code`) + Gamepad API; per-player `drive()` / `menu()` |
| `js/screens.js` | `Game` state machine and screens: title (attract race), setup, stage card, race, results, standings, end |
| `js/main.js` | Canvas scaling, font wait, fixed 60 Hz loop |

The records server is `api/`: `lib.php` (rules, storage, validation), `records.php` (public
GET/POST) and `admin.php` (password-protected deletes). It uses SQLite in `api/data/`, which
is git-ignored except its `.htaccess`, and which the deploy never touches. To test it, serve
the repo with PHP (the local PHP has no SQLite; use the official image):
`docker run --rm -u $(id -u):$(id -g) -v $PWD:/app -p 8099:8099 php:8.3-cli php -S 0.0.0.0:8099 -t /app`.

Rendering is at 480×300 and scaled up with `image-rendering: pixelated`. `Render.world()`
draws in view-local coordinates — the caller translates and clips (see `RaceScreen.draw`).

## Conventions

- The three cars differ **only** through `stats` (speed, corner, accelDry, accelWet).
  Change handling by changing `Physics.derive`, not by special-casing car ids.
- Tracks are deterministic per season (`season.seed`); AI behaviour uses `Math.random`.
- Keys are physical codes; never bind Ctrl (Ctrl+W closes the tab).
- Championship points are keyed by id (profile UUID for humans, `ai-<n>` for the roster),
  never by name. Names are display labels only.
- While a text field has focus, `Input.typing` is set and global hotkeys (M, N) stand down.
- Bump `RECORDS_VERSION` in `js/data.js` **and** `api/lib.php` together when a physics or
  timing change makes old records unfair. The fastest plausible times in `api/lib.php`
  (`MIN_LAP`, `MIN_RACE`) are 80% of the autopilot's best; re-measure them after such a change.

## Balance

Autopilot finishing positions (human car on `aiControl`, from the back of the grid) are
the quick sanity check after any physics or timing change: the Lotus should qualify on
every stage, the Evo should struggle on dry stages and the Viper on wet ones, and nobody
should run out of time. Time allowances come from `RACE.PACE_KMH` × `surface.pace`.

## Housekeeping

Update `STATUS.md` (and tick `TODO.md`) as part of any change that alters
build, test, version, or deploy state.
