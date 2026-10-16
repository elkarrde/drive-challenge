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

## Architecture

Classic `<script>` files (not ES modules, so `file://` works) that share top-level
`const`s. Load order matters and is set in `index.html`:

| File | Role |
|:--|:--|
| `js/util.js` | `U`: math, seeded RNG (mulberry32), colour helpers, formatting |
| `js/data.js` | Constants, `SURFACES`, `CARS` (ratings, paint, gearing, engine voice), `SEASONS`, AI names |
| `js/physics.js` | `Physics.derive` maps the 1–5 ratings to numbers; `stepCar` is shared by humans and AI |
| `js/sprites.js` | Procedural pixel art: scenery, three car rear views (steer poses, brake lights), parallax backgrounds |
| `js/track.js` | `Track`: seeded segment course per season, closed loop, scenery placement |
| `js/race.js` | `Race`: grid, countdown, AI driver, collisions, checkpoint timing, results |
| `js/render.js` | Segment-based pseudo-3D renderer (Jake Gordon style), weather, HUD; one `view` per screen half |
| `js/audio.js` | `Sfx`: synthesised engines, tyre squeal, effects, rain |
| `js/input.js` | Keyboard (`e.code`) + Gamepad API; per-player `drive()` / `menu()` |
| `js/screens.js` | `Game` state machine and screens: title (attract race), setup, stage card, race, results, standings, end |
| `js/main.js` | Canvas scaling, font wait, fixed 60 Hz loop |

Rendering is at 480×300 and scaled up with `image-rendering: pixelated`. `Render.world()`
draws in view-local coordinates — the caller translates and clips (see `RaceScreen.draw`).

## Conventions

- The three cars differ **only** through `stats` (speed, corner, accelDry, accelWet).
  Change handling by changing `Physics.derive`, not by special-casing car ids.
- Tracks are deterministic per season (`season.seed`); AI behaviour uses `Math.random`.
- Keys are physical codes; never bind Ctrl (Ctrl+W closes the tab).

## Balance

Autopilot finishing positions (human car on `aiControl`, from the back of the grid) are
the quick sanity check after any physics or timing change: the Lotus should qualify on
every stage, the Evo should struggle on dry stages and the Viper on wet ones, and nobody
should run out of time. Time allowances come from `RACE.PACE_KMH` × `surface.pace`.

## Housekeeping

Update `STATUS.md` (and tick `TODO.md`) as part of any change that alters
build, test, version, or deploy state.
