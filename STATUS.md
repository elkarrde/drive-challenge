# Status

*Last updated: 2026-10-19*

| Field | Value |
|:--|:--|
| Phase | building |
| Version | untagged |
| Build | n/a |
| Tests | none |
| Deployed | https://iso3200.net/drive-challenge/ (FTPS via rclone `ftp_iso3200.net`, 2026-10-19) |
| Blocker | none |

## Notes

Fully playable end to end, with chiptune music per season (1P and 2P, all four stages, championship flow), checked in
headless Chrome. Hand play-tested all three cars: the AI was too hard to beat, so it was slowed
(lower skill, slower in bends), the Evo got more top speed and the Viper more
acceleration in rain and snow. Needs another hand play-test; gamepad untested.

Players can be renamed on the car-select screen. Each profile is a UUID plus a name, kept in
`localStorage`, and championship points are keyed by the UUID. The rename flow (typing, the
letter picker, the name rules, persistence) and id-keyed standings were checked headlessly;
the gamepad letter picker hasn't been tried on real hardware.
