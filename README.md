# Habit Fighter — Game Boy edition

Track 02 · Retro Remix. A 2026 accountability battle rebuilt out of 1989 hardware:
160×144 camera proof, 4-shade green, square-wave sound effects, and a printer
receipt for the payout. Two trainers, one shared HP bar.

Vanilla HTML/CSS/JS + Flask to serve it. No React, no Node, no build step.

## Run it

```bash
pip install -r requirements.txt
python app.py
```

Open <http://localhost:5000>. Works on `localhost` because the camera needs a
secure context.

### If it says `No module named flask`

Flask went into a different Python than the one running `app.py`. Install with the
same interpreter, using `-m pip`:

```bash
python -m pip install -r requirements.txt
python app.py
```

Windows, if `python` is not recognised: `py -3 -m pip install -r requirements.txt`
then `py -3 app.py`.

macOS/Linux, or if pip complains about an *externally managed environment*:

```bash
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
python -m pip install -r requirements.txt
python app.py
```

In VS Code pick the same interpreter: `Ctrl+Shift+P` → **Python: Select
Interpreter** → the one you installed into, then F5.

Joining someone's **Live Share** session? You don't need Flask at all — the host
runs `app.py`, you open the forwarded URL.

On a Mac, follow **`MAC-SETUP.md`** instead — macOS ships Python 3.9, and these
requirements need 3.10+ because of `click`.

## How two devices sync

| Mode | How | When |
| --- | --- | --- |
| **api** (default) | `PUT`/`GET /api/room/<CODE>` — Cloudflare D1 when hosted, an in-memory Python dict under Flask | Any two devices. Nothing to configure, no account. |
| **firebase** (optional) | Firebase Realtime Database REST URL | Only if you already have a Firebase project. |
| **local** (fallback) | `localStorage` + `BroadcastChannel` | An API-less host, or `index.html` opened off disk. Two tabs, one device. |

The title screen tells you which one is live. Rooms are open by code — anyone
with the code can read and write that match — so codes are random five-letter
strings and there is no login. Fine for a demo; not a security model.

Firebase instead? Put the URL in `public/config.js`, or open
`https://your-site/?db=https://your-db.firebaseio.com` once on each device.

## Put it on the internet

`public/` is the site: `index.html`, `config.js`, `static/`. `worker.js` adds the
room API on `/api/room/<CODE>` and stores rooms in D1 (binding `DB`; the `rooms`
table creates itself on first request). `site.json` is the Freebuff Sites manifest.

- **Same host as the game** (current deploy): two phones sync, zero setup.
- **Netlify / Cloudflare Pages / GitHub Pages (static only):** the page, camera
  and printer work, but rooms stay per-device until you also deploy `worker.js`
  with a D1 binding. The GitHub Pages copy says `STATIC DEMO` on the title screen
  instead of pretending it can sync.
- **Flask:** `python app.py` mirrors the same endpoint in memory, so a local run
  also syncs across two devices on your network (the camera still needs
  `localhost` or HTTPS, so use the hosted URL for real phones).

Flask and the hosted site serve the same folder — never edit a copy.

**Live (production):** <https://habit-fighter-1ev30m.freebuff.site>
**Staging:** <https://habit-fighter-1ev30m-preview.freebuff.site>

Both are public HTTPS URLs — anyone can open one and start a match, no account.
Each environment has its own database, so a room code made on one URL does not
exist on the other. Share the production link.

## Share it with your team (VS Code Live Share)

Open **`habit-fighter.code-workspace`** (`File → Open Workspace from File`). VS Code
will offer the Live Share and Python extensions from `.vscode/extensions.json`.
Everyone signs in with a Microsoft or GitHub account.

**Host — the person with the folder:**

1. Press **F5** and pick *Run Habit Fighter (reload on save)*, or just run `python app.py`.
2. Click **Live Share** in the status bar (bottom left) → **Share** → copy the link.
3. In the Live Share panel, share the terminal (`Shared Terminals → +`) so the team
   watches the Flask log, and share the server on port **5000** (`Shared Servers → +`).
4. Paste the session link into your group chat.

**Guests:**

1. Open the link → Join. Only the Live Share extension is needed.
2. Edit the files you own (table below); changes appear on the host instantly.
3. Open the **forwarded** `localhost:5000` URL Live Share gives you, not the host's
   own localhost. It is HTTPS, so the camera prompt works on your phone.

Set a guest to **read-only** (Live Share panel → participant → Read-only) when you
want one person to drive the whole demo.

No git history yet — `.gitignore` is ready when you want it:
`git init && git add -A && git commit -m "Habit Fighter starter"`.

## Who owns what

| Person | Files | Scope |
| --- | --- | --- |
| P1 — battle UI and look | `public/index.html`, `public/static/style.css`, `public/static/ui.js` | Screen layout, HP bars, text box, shake, sound engine, title screen |
| P2 — camera and art | `public/static/camera.js`, `public/static/receipt.js` | Game Boy filter, poses, timestamped proof, printer receipt PNG |
| P3 — logic and sync | `public/static/game.js`, `public/static/firebase.js`, `public/static/moves.js` | Rooms, loadouts, session timers, damage, statuses, Call Cap, Focus Duel, wallet |

Each person edits only their own files, so merges stay boring.

## What is in the demo

- **One habit per fight**: only STUDY and GYM exist, and both trainers must pick
  the **same type** — a mismatch never starts a battle. If the types clash the
  lobby says so and one tap on `↺ SWITCH TO …` joins their habit.
- **Loadouts first**: each trainer picks exactly six of that type's moves —
  nine in the STUDY pool, seven in GYM — and every move shows its length, damage
  and a plain-English description while picking. The rival approves the loadout
  before the battle opens.
- **Every move is a timed session**: picking a move locks you in for its real
  length (20 min → 4 h). All move buttons stay dead until your own timer hits
  zero; then the hit lands and you pick again. Both phones run their own clock,
  so nobody waits a turn.
- **Fixed numbers per move** (no hidden formula): the damage, healing and uses
  are printed on the button and never derived from the clock. STUDY — 10 min
  break heals 10 (4 uses), 20 flashcards 15 dmg / 30 min, finish quiz 10 dmg +
  5 heal / 30 min, watch lecture heals 20 (2 uses, 30 min), past paper, make
  notes and deep learning each 30 dmg / 1 h, commit code 20 dmg + 10 heal / 1 h,
  coursework 60 dmg / 2 h (3 uses). GYM — stretching and 20 push-ups 5 dmg /
  5 min, one set 10 dmg / 10 min, rest heals 5 / 5 min, treadmill 5K and sparring
  session 30 dmg / 30 min, protein shake heals 10 / 1 min (once per match).
  Study work on a rival who already has a status is still a **LOCKED IN** combo
  when the session lasts 2 h (coursework): 1.5× and it steals 1 🪙.
- **Statuses**: SNOOZE, PARALYSIS, BURNOUT, DOOMSCROLL, FRAUD.
- **Game Boy Camera** proof with a random pose and a printed timestamp.
- **Call Cap**: three calls per match. The accused either shows a photo or takes
  -25 HP and a FRAUD flag. Nothing verifies the photo — the accuser judges it:
  accept (pays 1 🪙 to the accused) or reject (the call stands, accused pays
  2 🪙). The camera only opens while answering a cap call.
- **Focus Duel**: one per match, both phones arm themselves; the slower tap takes
  12 HP and falls asleep.
- **Printer**: the match becomes a receipt PNG via html2canvas.
- **Timing panel** on the title screen and the duration + damage printed on
  every move button, so the cost of a big hit is always visible.
- **Invite QR** on the lobby screen: the rival scans it and the join box fills
  itself in, so nobody types a room code on stage.
- **Device wallet**: 50 🪙 saved in `localStorage`, so the same phone is the same
  trainer next time. Ante 1, 3 or 5 into a Match Pot, a LOCKED IN combo steals
  1 🪙, cap fines move 1–2 🪙, the winner sweeps the pot, and 0 is BANKRUPT (no
  cap calls). Every battle lands in BATTLE HISTORY on the title screen. The
  receipt prints the ledger and a verdict from `GENERATIONAL DEBT` to `HABIT
  TYCOON`. No real money — tokens only.
- **Rematch** on the results screen only starts when **both** trainers tap it,
  and it goes back to the loadout screen so the type and six moves can change
  (the rival approves again).
- **Leave** from the battle screen is a two-tap forfeit: you forfeit the ante
  sitting in the pot *and* pay 2 🪙 on top, so the rival takes the pot, the fine
  and the match. On the results screen the same button becomes `◀ EXIT TO
  TITLE`.
- **HOW TO PLAY** page on the title screen: ten short steps covering the whole
  game, so a judge can read the rules without you narrating.

`public/static/qrcode.js` is the vendored MIT-licensed
[qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) by Kazuhiko
Arase; `public/static/qr.js` is the four-line wrapper that draws the invite QR.

## Try it in 90 seconds

1. `▶ NEW MATCH`, then `SOLO DEMO` (auto-rival plays the other side and mirrors
   your type).
2. Pick six moves and `🔒 LOCK LOADOUT` — the battle starts once the other side
   approves it (solo approves instantly).
3. Pick a move and watch the clock: the buttons are dead until it runs out. For
   a demo, open `DEV` → `DEMO CLOCK ON/OFF` (2 h runs for 5 s, 4 h for 10 s, and
   the flip is stored on the room so both phones agree), or `END MY TIMER` to
   cash your own session in on the spot.
4. `CALL CAP` → the rival either sends a photo or concedes −25 HP. If a photo
   lands, you accept or reject it yourself.
5. `PRINTER` → `SAVE PNG` for the submission screenshot.

## Known gaps

- **Rooms have no auth.** Anyone holding a code can read and write that match.
  Codes are random five letters, which is enough for a hackathon and nothing
  more — add an owner token per seat before this is public.
- The whole room object is written on every action (10–20 KB once a photo is in
  it). Fine for one match at a time; a real deployment wants per-field writes.
- Under Flask, rooms live in a Python dict and disappear when the process
  restarts. The hosted site uses D1, so those rooms persist.
- The D1 `rooms` table creates itself on the first request; if the schema ever
  needs migrating, do it deliberately rather than by editing that line.
- Nothing kicks a silent player: an unanswered cap call blocks moves until it is
  settled, and a Focus Duel waits for both taps.
- **Sessions use real time.** A 6-hour all-nighter really blocks you for six
  hours, and a closed tab does not pause it (the timer is stored on the room, so
  it keeps counting and resolves when either phone next looks). The DEV panel's
  `DEMO CLOCK ON/OFF` shortens every session to seconds (2 h = 5 s, 4 h = 10 s)
  for the stage, and `END MY TIMER` drops your own clock to zero.
- The camera falls back to a "NO CAMERA SIGNAL" demo frame if permission is
  refused, which keeps the demo alive but is obviously not proof.
