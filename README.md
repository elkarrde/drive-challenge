# Drive Challenge

A pseudo-3D arcade racer in the spirit of *Lotus III: The Ultimate Challenge*. Pick one
of three early-'90s cars and race a four-stage championship through the seasons against
19 computer drivers, alone or with a friend on a split screen.

Plain HTML5 canvas and JavaScript — no build step, no dependencies, no image or sound
files (just one bundled font). All art is drawn in code and all sound is synthesised with Web Audio, including a chiptune
soundtrack with its own tune for each season.

## Play

Open `index.html` in a browser. It also works straight from disk (`file://`), but
serving it is nicer:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

The pixel font, Press Start 2P, is bundled in `fonts/` (SIL Open Font License, see
`fonts/OFL.txt`), so the game makes no requests to other sites.

## Deploy

Copy `index.html`, `css/`, `js/` and `fonts/` to any static web host. Asset links carry a
content hash (`js/race.js?v=fe4a4b3f`) so browsers fetch only the files that changed.
After editing anything in `js/`, `css/` or `fonts/`, refresh the hashes before deploying:

```sh
./stamp.sh          # rewrite the ?v= hashes in index.html and css/style.css
./stamp.sh --check  # exit 1 if any hash is stale
```

The live copy at https://iso3200.net/drive-challenge/ is published with `./deploy.sh`
(`--dry-run` to preview). It refuses to run with stale hashes, mirrors the four game
paths over FTPS through the rclone remote `ftp_iso3200.net`, and checks the page answers.

## The cars

| | Top speed | Cornering | Accel (dry) | Accel (wet / snow) |
|:--|:--:|:--:|:--:|:--:|
| Lotus Esprit Turbo SE | 4 | 3 | 4 | 3 |
| Mitsubishi Lancer Evolution I | 2 | 5 | 4 | 5 |
| Dodge Viper RT/10 | 5 | 2 | 5 | 1 |

Cornering decides how much speed a car loses — and how far it drifts wide — whenever it
isn't driving straight. Each car can run an automatic or a manual gearbox; manual shifts
are near-instant, automatic shifts cost a moment of drive.

## The championship

| Stage | Season | Surface |
|:--|:--|:--|
| 1 | Autumn — forest roads | dry |
| 2 | Winter — mountain pass | snow |
| 3 | Spring — country lanes | rain |
| 4 | Summer — coastal highway | dry |

Each race is three laps from the back of a 20-car grid. A checkpoint every half lap adds
time to the clock; run out and you're out of the race. Finish in the top 10 to score
points (15-12-10-8-6-5-4-3-2-1) and go through to the next stage. In a two-player game the
championship goes on as long as either player qualifies.

## Controls

| | Player 1 | Player 2 |
|:--|:--|:--|
| Steer | ← → | A D |
| Accelerate | ↑ | W |
| Brake | ↓ | S |
| Gear up | Right Shift or / | E |
| Gear down | . | Q |
| Select | Enter | Space |

In a one-player game either set of keys works. Esc or P pauses, M mutes all sound, N toggles the music.
Gamepads work too: stick or D-pad steers, A / RT accelerates, X / LT brakes, RB / LB
change gear, Start pauses.

To rename a player, move up to the name at the top of the car-select panel and press fire.
Type the new name, or pick it a letter at a time: up/down changes a letter, right adds one, left
deletes one. Enter / A saves, Esc / B cancels. A name can be up to 12 characters, and it can't
match a computer driver or the other player. Names are saved in the browser (`localStorage`).
