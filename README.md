# Habit Fighter

A Game Boy-styled, two-player habit battle for **KCL Hack 2026 - Track 02 - Retro Remix**.

Two trainers, two phones, one shared battle. Habits are the moves, the screen is
160x144 in four shades of DMG green, and every sound is a square wave. Claim a
habit your rival does not believe? They call cap, and you either show proof with
the camera or take the hit.

- **Live game:** https://habit-fighter-1ev30m.freebuff.site
- **Static mirror:** https://mrdrgn1.github.io/habit-fighter/

## How a round works

| | |
| --- | --- |
| Types | STUDY beats LECTURE beats GYM beats COMMUTE beats SOCIAL beats STUDY. 1.5x, 2.25x on a rival who already has a status. |
| Moves | Maughan Grind, 9AM Bush House, KCL Gym Session, Strand Lecture, All-Nighter, SU Bar Decomp. |
| Status | SNOOZE, PARALYSIS, BURNOUT, DOOMSCROLL, FRAUD. |
| Call Cap | 3 per match. The accused shows proof (the accuser loses 15 HP) or concedes (-25 HP and FRAUD). No jury: with two players a vote is a coin flip, so the photo decides. |
| Focus Duel | Reaction test, the slower trainer takes 12 HP and falls asleep. |
| Doomscroll | Leave the tab for 4+ seconds mid-battle and take 6 HP. |
| Printer | The match prints as a Game Boy receipt PNG. |

Read the in-game **HOW TO PLAY** page for the full eight-step manual.

## How it is built

Plain HTML, CSS and vanilla JS with Flask or a Cloudflare Worker only to serve the
files and hold the shared room state. No framework, no build step, no bundler.

```
public/                    the whole game: index.html, config.js, static/
public/static/game.js      rules, rooms, turns, call cap, focus duel
public/static/firebase.js  three sync drivers: room API, Firebase, local
public/static/camera.js    160x144 Bayer-dithered proof photos
public/static/ui.js        HP bars, text box, square-wave sound engine
worker.js                  /api/room/<CODE> on Cloudflare with D1, plus assets
app.py                     the same API in memory for local development
```

Rooms are random five-letter codes with no auth, which is fine for a five-hour
demo: anyone with the code can read and write that one room.

## This GitHub Pages copy

github.io/habit-fighter is a static mirror: GitHub Pages cannot run the room
server, so the page calls the production API directly (see `apiBase` in
`public/config.js` and the CORS headers in `worker.js`). Two phones still sync.

The mirror is produced by `.github/workflows/pages.yml`, which copies the live
build into `public/` and publishes it on every push.
