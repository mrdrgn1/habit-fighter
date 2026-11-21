# Habit Fighter

A Game Boy-styled, two-player habit battle for **KCL Hack 2026 - Track 02 - Retro Remix**.

Two trainers, two phones, one shared battle. Habits are the moves, the screen is
160x144 in four shades of DMG green, and every sound is a square wave. Claim a
habit your rival does not believe? They call cap, and you either show proof with
the camera or take the hit. Every match is also a 10-token wager.

- **Play it:** https://habit-fighter-1ev30m.freebuff.site
- **Static mirror:** https://mrdrgn1.github.io/habit-fighter/

## How a round works

| | |
| --- | --- |
| Types | STUDY beats LECTURE beats GYM beats COMMUTE beats SOCIAL beats STUDY. 1.5x, 2.25x on a rival who already has a status. |
| Moves | Maughan Grind, 9AM Bush House, KCL Gym Session, Strand Lecture, All-Nighter, SU Bar Decomp. |
| Status | SNOOZE, PARALYSIS, BURNOUT, DOOMSCROLL, FRAUD. |
| Call Cap | 3 per match. The accused shows proof (the accuser loses 15 HP) or concedes (-25 HP and FRAUD). No jury: with two players a vote is a coin flip, so the camera decides. |
| Focus Duel | Reaction test, the slower trainer takes 12 HP and falls asleep. |
| Doomscroll | Leave the tab for 4+ seconds mid-battle and take 6 HP. |
| Printer | The match prints as a Game Boy receipt PNG. |

There is an in-game **HOW TO PLAY** page with the full nine-step manual.

## The token wager (no real money)

Both trainers start with **10 tokens**. Before the battle each picks an ante of
**1, 3 or 5**, and both antes go into the central **Match Pot**.

| Event | Tokens |
| --- | --- |
| LOCKED IN combo (super effective on a statused rival) | attacker steals 1 from the defender |
| Cap verdict: caught lying (no proof) | liar pays 2 to the accuser |
| Cap verdict: false accusation (proof lands) | accuser pays 1 to the accused |
| Doomscroll tax | 1 out of the wallet, into the pot |
| KO | winner sweeps the whole pot |

A wallet never goes below zero. At **0 tokens** the trainer is **BANKRUPT**, gets a
badge on the token bar, and cannot call cap any more. The receipt prints a
**TOKEN LEDGER** (start, ante, combos, caps, tax, pot, final, net) with a flavour
verdict from **GENERATIONAL DEBT** up to **HABIT TYCOON**.

A collapsible **DEV - TOKEN LAB** panel under the device can fire any of those
rules on cue for demos.

## How it is built

Plain HTML, CSS and vanilla JS. Flask or a Cloudflare Worker only serves the files
and holds the shared room state - no framework, no build step, no bundler.

```
docs/                      the game as published by Pages: index.html, config.js, static/
docs/static/game.js        rules, rooms, turns, call cap, tokens, focus duel
docs/static/firebase.js    three sync drivers: room API, Firebase, local
docs/static/camera.js      160x144 Bayer-dithered proof photos
docs/static/ui.js          HP bars, text box, token pops, square-wave sound engine
```

Rooms are random five-letter codes with no auth. That is fine for a five-hour
demo: anyone holding a code can read and write that one room.

## Why docs/ and not the usual src/

GitHub Pages cannot run the room server, so this repo publishes the game as a
static mirror. The page talks to the production API directly (`apiBase` in
`config.js`, CORS headers in the Worker), so two phones still sync on the
`github.io` URL.

`.github/workflows/pages.yml` pulls the live build into `docs/` on every push and
Pages serves `main` /docs. The game itself is authored and deployed from the
Freebuff project; after changing it there, run that workflow again (Actions tab ->
*Publish the game to GitHub Pages* -> Run workflow) to refresh this mirror.
