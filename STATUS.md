# Status

*Last updated: 2026-10-19*

| Field | Value |
|:--|:--|
| Phase | building |
| Version | v1.3.3 |
| Build | n/a |
| Tests | none |
| Deployed | https://iso3200.net/drive-challenge/ (FTPS via rclone `ftp_iso3200.net`, 2026-10-19; records API since 2026-10-19) |
| Blocker | none |

## Notes

Fully playable end to end, with chiptune music per season (1P and 2P, all four stages, championship flow), checked in
headless Chrome. Hand play-tested all three cars: the AI was too hard to beat, so it was slowed
(lower skill, slower in bends), the Evo got more top speed and the Viper more
acceleration in rain and snow. Needs another hand play-test; gamepad untested.

Online records (personal bests, top 10 per table) are kept by `api/records.php` in SQLite
on the server, with an admin page for deletes. Tested against PHP 8.3 in Docker: the API
cases (validation, personal bests, renames, rate limit) and a full championship in the
browser that records every table. The live server needs `pdo_sqlite` enabled in cPanel.
Hand play-tested the Lotus and the Lancer Evo: both well balanced. The Viper was
hopeless in the wet (dropped to 12th+ in the first bends), so cars now have an optional wet
cornering rating and the Viper's is 3½. On autopilot it went from never qualifying in rain
or snow (11th–15th) to 5th–9th; the dry stages are unchanged. Re-tested by hand: good.
That left the Viper cornering as well as the Lotus in the wet, so the Lotus's cornering went
from 3 to 3½ (1.3.3). On autopilot it now beats the Viper by about 4 s in rain and snow and
matches it on Autumn; the Viper is still quicker on Summer.
MIT licensed.

Players can be renamed on the car-select screen. Each profile is a UUID plus a name, kept in
`localStorage`, and championship points are keyed by the UUID. The rename flow (typing, the
letter picker, the name rules, persistence) and id-keyed standings were checked headlessly;
the gamepad letter picker hasn't been tried on real hardware.
