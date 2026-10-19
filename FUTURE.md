# Future Planning

Ideas and directions for future development. Not committed to, not prioritised —
just captured so they aren't forgotten.

## Course editor / RECS

Lotus III's "RECS" let players generate courses from a few sliders. `Track` is already
driven by `curvy` / `hilly` / `straights` and a seed, so a setup screen exposing those
would get most of the way there.

## More weather

Fog stage (night or mist), wind gusts that push the car, a wet-to-dry track.

## Records: high scores and fastest laps

A permanent record table: championship high scores (points total, car, date) and the
fastest lap / race time per season (and maybe per car). Where it lives is undecided:

- `localStorage` only: simple and offline, but it stays on one browser.
- A small server endpoint on iso3200.net: a shared hall of fame, but it needs a backend,
  anti-cheat sanity checks and moderation of names.
- Both: local first, with an optional upload.

Key entries by the player profile's UUID (`Profiles`), not the name, so a rename carries
the record along. `car.bestLap` is already tracked in `Race`, and `Championship` has the
final points. Open questions: seed-locked tracks make times comparable across players,
but a physics or balance change would make old records stale. Version the table?
