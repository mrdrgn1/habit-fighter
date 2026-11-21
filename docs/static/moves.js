/* ==========================================================================
   moves.js  —  the two habits and their move (session) library.

   Only STUDY and GYM exist, and both trainers must fight on the same type, so
   a match is one habit versus the same habit. Every move is a real length of
   work: 15 minutes of warm-up, a 2-hour library lock-in, a 6-hour all-nighter.
   Damage comes straight out of that length — longer session, harder hit — so
   the move list is a trade: big damage costs you hours you cannot pick again
   until the timer runs out.
   ========================================================================== */

window.HF = window.HF || {};

(function (HF) {
  'use strict';

  const TYPES = ['STUDY', 'GYM'];

  /* Long work hits harder, but sub-linearly: 20 minutes is a jab, six hours
     ends the argument. 20 → 17, 2 h → 37, 6 h → 61. */
  const powerFor = (mins) => Math.round(4 + Math.sqrt(mins) * 3);

  /** 90 → "1H 30M", 120 → "2H", 15 → "15M". Used on every button. */
  function durLabel(mins) {
    const m = Math.max(0, Math.round(Number(mins) || 0));
    if (m < 60) return m + 'M';
    const h = Math.floor(m / 60);
    const rest = m % 60;
    return rest ? `${h}H ${rest}M` : `${h}H`;
  }

  const RAW = {
    STUDY: [
      {
        id: 'flashcards', name: 'FLASHCARD DRILL', mins: 20, pp: 8,
        desc: 'Twenty minutes of cards. A quick 17-damage jab you can throw 8 times.',
      },
      {
        id: 'readings', name: 'READING SPRINT', mins: 40, pp: 7,
        effect: { status: 'PARALYSIS', chance: 0.4 },
        desc: '40 minutes. 23 damage and a 40% chance to PARALYSE them (they may lose a session).',
      },
      {
        id: 'silentfloor', name: 'SILENT FLOOR', mins: 60, pp: 5, heal: 18,
        noDamage: true,
        desc: 'A full quiet hour. No damage — heals you 18 HP.',
      },
      {
        id: 'wikihole', name: '3AM WIKI HOLE', mins: 75, pp: 6,
        effect: { status: 'POISON', chance: 0.6 },
        desc: '75 minutes down a rabbit hole. 30 damage, 60% chance to leave them DOOMSCROLLED (-4 HP a session).',
      },
      {
        id: 'pastpaper', name: 'PAST PAPER RUN', mins: 90, pp: 5,
        desc: 'An hour and a half of past papers. 32 damage, no side effects.',
      },
      {
        id: 'libgrind', name: 'LIBRARY LOCK-IN', mins: 120, pp: 4,
        desc: 'Two hours locked in the library. 37 damage — and a LOCKED IN steal if they are already statused.',
      },
      {
        id: 'deepwork', name: 'DEEP WORK BLOCK', mins: 180, pp: 3,
        effect: { status: 'BURNOUT', chance: 0.4 },
        desc: 'Three hours of deep work. 44 damage, 40% chance to BURN them out (-5 HP a session).',
      },
      {
        id: 'allnighter', name: 'ALL-NIGHTER', mins: 360, pp: 2,
        self: { status: 'SNOOZE' },
        desc: 'The whole night, six hours. 61 damage — the biggest hit in the game — then you SNOOZE.',
      },
    ],
    GYM: [
      {
        id: 'warmup', name: 'WARM-UP SET', mins: 15, pp: 8,
        desc: 'Fifteen minutes to warm up. 16 damage, 8 uses.',
      },
      {
        id: 'coldshower', name: 'COLD SHOWER', mins: 20, pp: 6, cure: true,
        desc: 'Twenty minutes. 17 damage and clears any status on you.',
      },
      {
        id: 'treadmill', name: 'TREADMILL 5K', mins: 30, pp: 7,
        desc: 'Thirty minutes on the treadmill. 20 damage, boring and reliable.',
      },
      {
        id: 'protein', name: 'PROTEIN SHAKE', mins: 30, pp: 5, heal: 16,
        noDamage: true,
        desc: 'Thirty minutes of recovery. No damage — heals you 16 HP.',
      },
      {
        id: 'sparring', name: 'SPARRING ROUND', mins: 45, pp: 6,
        effect: { status: 'BURNOUT', chance: 0.35 },
        desc: '45 minutes of sparring. 24 damage, 35% chance to BURN them out (-5 HP a session).',
      },
      {
        id: 'gymsession', name: 'KCL GYM SESSION', mins: 60, pp: 5, heal: 8,
        desc: 'An hour in the KCL gym. 27 damage and heals you 8 HP at the same time.',
      },
      {
        id: 'onemore', name: 'ONE MORE REP', mins: 90, pp: 4,
        desc: 'Ninety minutes, one more rep every time. 32 damage, 4 uses.',
      },
      {
        id: 'legday', name: 'LEG DAY', mins: 120, pp: 2, self: { status: 'SNOOZE' },
        desc: 'Two hours of legs, the longest gym session there is. 37 damage, then you SNOOZE.',
      },
    ],
  };

  /* Every pool entry is a finished move: the lobby picker and the battle
     buttons read the same object, so a name or a damage number can never
     disagree between the two screens. */
  const POOLS = {};
  TYPES.forEach((type) => {
    POOLS[type] = RAW[type].map((move) => Object.assign({
      type,
      power: move.noDamage ? 0 : powerFor(move.mins),
      dur: durLabel(move.mins),
    }, move));
  });

  const MOVES = TYPES.reduce((all, type) => all.concat(POOLS[type]), []);

  HF.TYPES = TYPES;
  HF.POOLS = POOLS;
  HF.MOVES = MOVES;
  HF.powerFor = powerFor;
  HF.durLabel = durLabel;
})(window.HF);
