# Changelog

Versions are `major.minor.build`: major for breaking changes (something players had no
longer carries over, such as a records reset), minor for new features, build for fixes and
balance tweaks. The version is `VERSION` in `js/data.js` and shows on the title screen.

## 1.3.3 — 2026-10-19

- Lotus: cornering 3½ (was 3), dry and wet. Since 1.3.0 the Viper cornered as well as the
  Lotus in rain and snow. On autopilot the Lotus is now about 4 s quicker than the Viper in
  the wet and level with it on Autumn; the Viper is still quicker on Summer.
- The records server's fastest plausible times were re-measured for the quicker Lotus.
  Existing records stay.

## 1.3.2 — 2026-10-19

- M now steps the music and N the sound effects (they were the other way round).
- Fixed: changing the music level while a song played stopped the game (the level shared its
  name with the song's beat counter).
- Fixed: "phantom" cars, standing still on the track and passing through you. They were left
  behind by a race that ended early, such as the demo behind the title screen.

## 1.3.1 — 2026-10-19

- Sound levels: M steps the sound effects (engines and effects) and N the music through
  high, off, low and mid, each on its own (high is the old full volume). M no longer silences
  the music. The levels are remembered; a saved "music off" carries over.

## 1.3.0 — 2026-10-19

- Cars can corner differently on rain and snow (`cornerWet`). The Viper's wet cornering is now
  3½ (was 2, as in the dry): it used to drop out of the top 10 in the first bends and never
  qualified in the wet.
- The car-select screen shows five ratings: top speed, cornering dry and wet, acceleration dry
  and wet. Half ratings show as half blocks.
- The version is shown on the title screen.

## 1.2.1 — 2026-10-19

- Records admin: sessions are kept in `api/data/sessions`, as the host's default session
  directory didn't keep them and the login never worked.

## 1.2.0 — 2026-10-19

- Online records: fastest laps and race times per season, and championship totals, kept as
  personal bests on the server (PHP + SQLite). RECORDS on the title screen; new top-10 places
  flash on the results screen; admin page for deletes.
- MIT licence.

## 1.1.2 — 2026-10-19

- Fix: checking a player name before the profiles were loaded could throw.

## 1.1.1 — 2026-10-19

- Controls screen: the last row no longer overlaps the notes below it.

## 1.1.0 — 2026-10-19

- Players can be renamed (keyboard or letter picker); names are saved in the browser.
  Championship points are kept by profile UUID.

## 1.0.0 — 2026-10-17

- First release: pseudo-3D renderer, three cars, four seasons, 20-car field, checkpoint
  timing, championship, two-player split screen, chiptune music, bundled font, versioned
  asset links, `deploy.sh`.
