/* ==========================================================================
   moves.js  —  the two habits and their move (session) library.

   Only STUDY and GYM exist, and both trainers must fight on the same type, so
   a match is one habit versus the same habit. Every move is a real length of
   work; its damage, healing and uses are fixed per move and printed on the
   button, and picking it locks you in for the full timer.

   STUDY has nine sessions (pick six), GYM has seven (pick six).
   ========================================================================== */

window.HF = window.HF || {};

(function (HF) {
  'use strict';

  const TYPES = ['STUDY', 'GYM'];

  /** 90 → "1H 30M", 120 → "2H", 5 → "5M". Used on every button. */
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
        id: 'break10', name: '10 MIN BREAK', mins: 10, pp: 4, heal: 10,
        noDamage: true,
        desc: 'Ten minutes off your feet. Heals 10 HP, 4 uses a match.',
      },
      {
        id: 'flashcards', name: '20 FLASHCARDS', mins: 30, pp: 5, power: 15,
        desc: '30 minutes making 20 cards. 15 damage, 5 uses.',
      },
      {
        id: 'quiz', name: 'FINISH QUIZ', mins: 30, pp: 5, power: 10, heal: 5,
        desc: '30 minutes. 10 damage and heals you 5 HP.',
      },
      {
        id: 'lecture', name: 'WATCH LECTURE', mins: 30, pp: 2, heal: 20,
        noDamage: true,
        desc: '30 minutes watching it back. Heals 20 HP — only 2 uses a match.',
      },
      {
        id: 'pastpaper', name: 'PAST PAPER', mins: 60, pp: 4, power: 30,
        desc: 'An hour of past papers. 30 damage, 4 uses.',
      },
      {
        id: 'notes', name: 'MAKE NOTES', mins: 60, pp: 4, power: 30,
        desc: 'An hour of notes. 30 damage, 4 uses.',
      },
      {
        id: 'deeplearning', name: 'DEEP LEARNING', mins: 60, pp: 4, power: 30,
        desc: 'An hour of deep learning. 30 damage, 4 uses.',
      },
      {
        id: 'commitcode', name: 'COMMIT CODE', mins: 60, pp: 4, power: 20, heal: 10,
        desc: 'An hour of coding. 20 damage and heals you 10 HP.',
      },
      {
        id: 'coursework', name: 'COURSEWORK', mins: 120, pp: 3, power: 60,
        desc: 'Two hours of coursework. 60 damage, 3 uses. The biggest study hit.',
      },
    ],
    GYM: [
      {
        id: 'stretching', name: 'STRETCHING', mins: 5, pp: 8, power: 5,
        desc: '5 minutes. 5 damage, 8 uses.',
      },
      {
        id: 'pushups', name: '20 PUSH-UPS', mins: 5, pp: 8, power: 5,
        desc: '5 minutes. 5 damage, 8 uses.',
      },
      {
        id: 'rest', name: 'REST', mins: 5, pp: 6, heal: 5, noDamage: true,
        desc: '5 minutes sitting down. Heals 5 HP, 6 uses.',
      },
      {
        id: 'oneset', name: 'ONE SET', mins: 10, pp: 6, power: 10,
        desc: '10 minutes for one set. 10 damage, 6 uses.',
      },
      {
        id: 'treadmill', name: 'TREADMILL 5K', mins: 30, pp: 4, power: 30,
        desc: '30 minutes. 30 damage, 4 uses.',
      },
      {
        id: 'sparring', name: 'SPARRING SESSION', mins: 30, pp: 4, power: 30,
        desc: '30 minutes. 30 damage, 4 uses.',
      },
      {
        id: 'protein', name: 'PROTEIN SHAKE', mins: 1, pp: 1, heal: 10,
        noDamage: true,
        desc: 'One minute. Heals 10 HP — once per match.',
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
      power: move.power || 0,
      dur: durLabel(move.mins),
    }, move));
  });

  const MOVES = TYPES.reduce((all, type) => all.concat(POOLS[type]), []);

  const totals = (type) => POOLS[type].reduce((acc, move) => ({
    mins: acc.mins + move.mins,
    power: acc.power + move.power,
  }), { mins: 0, power: 0 });

  HF.TYPES = TYPES;
  HF.POOLS = POOLS;
  HF.MOVES = MOVES;
  HF.durLabel = durLabel;
  HF.poolTotals = totals;
})(window.HF);
