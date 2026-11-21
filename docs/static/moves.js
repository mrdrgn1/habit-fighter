/* ==========================================================================
   moves.js  —  the type wheel and the move library.

   Four types, four habits. Every type has its own eight moves, so a GYM
   trainer never ends up throwing a library swing. Each trainer picks six of
   their eight before the match and the rival has to approve the loadout.
   `desc` is the plain-English line shown while picking.
   ========================================================================== */

window.HF = window.HF || {};

(function (HF) {
  'use strict';

  /* Each type beats exactly one other: a four-step wheel, no dead ends. */
  const TYPES = ['STUDY', 'LECTURE', 'GYM', 'SOCIAL'];

  const BEATS = {
    STUDY: 'LECTURE',
    LECTURE: 'GYM',
    GYM: 'SOCIAL',
    SOCIAL: 'STUDY',
  };

  const POOLS = {
    STUDY: [
      { id: 'libgrind', name: 'MAUGHAN GRIND', power: 24, pp: 8, note: 'STEADY HIT', desc: 'Solid 24-power hit, 8 uses. Your bread and butter.' },
      { id: 'allnighter', name: 'ALL-NIGHTER', power: 34, pp: 3, self: { status: 'SNOOZE' }, note: 'SNOOZES YOU', desc: 'Huge 34 power in 3 shots — but you wake up SNOOZED.' },
      { id: 'flashcards', name: 'FLASHCARD DRILL', power: 18, pp: 10, note: 'CHEAP AND SAFE', desc: 'Only 18 power, but 10 uses. Save it for long fights.' },
      { id: 'pastpaper', name: 'PAST PAPER RUN', power: 26, pp: 6, note: 'NO GIMMICKS', desc: '26 power, no side effects. Nothing fancy.' },
      { id: 'wikihole', name: '3AM WIKI HOLE', power: 20, pp: 7, effect: { status: 'POISON', chance: 0.6 }, note: '60% DOOMSCROLL', desc: '20 power and a 60% chance to leave them DOOMSCROLLED (-4 HP a round).' },
      { id: 'silentfloor', name: 'SILENT FLOOR', power: 0, pp: 5, heal: 14, note: 'HEALS 14', desc: 'No damage — heals you 14 HP instead.' },
      { id: 'groupchat', name: 'GROUP CHAT GRIND', power: 22, pp: 7, effect: { status: 'PARALYSIS', chance: 0.4 }, note: '40% PARALYSED', desc: '22 power, 40% chance to PARALYSE them (they may lose a move).' },
      { id: 'deadline', name: 'DEADLINE PANIC', power: 30, pp: 4, note: 'BIG HIT', desc: '30 power, 4 uses. Your finisher.' },
    ],
    LECTURE: [
      { id: 'nineam', name: '9AM LECTURE', power: 26, pp: 7, note: 'RELIABLE', desc: '26 power, 7 uses. A reliable opener.' },
      { id: 'slidedeck', name: 'SLIDE DECK SKIM', power: 20, pp: 9, effect: { status: 'BURNOUT', chance: 0.35 }, note: '35% BURNOUT', desc: '20 power, 35% chance to BURN them out (-5 HP a round).' },
      { id: 'panopto', name: 'PANOPTO REWATCH', power: 0, pp: 5, heal: 12, cure: true, note: 'HEAL + CURE', desc: 'No damage — heals 12 HP and clears any status on you.' },
      { id: 'handout', name: 'HANDOUT HOARD', power: 18, pp: 10, note: 'CHEAP AND SAFE', desc: '18 power, 10 uses. Cheap chip damage.' },
      { id: 'strand', name: 'STRAND SPRINT', power: 24, pp: 7, note: 'STEADY HIT', desc: '24 power, no side effects.' },
      { id: 'backrow', name: 'BACK ROW NAP', power: 28, pp: 5, self: { status: 'SNOOZE' }, note: 'SNOOZES YOU', desc: '28 power, 5 uses — but it SNOOZES you after.' },
      { id: 'noteswap', name: 'NOTE SWAP', power: 22, pp: 8, effect: { status: 'PARALYSIS', chance: 0.3 }, note: '30% PARALYSED', desc: '22 power, 30% chance to PARALYSE them.' },
      { id: 'questiontime', name: 'QUESTION TIME', power: 32, pp: 4, note: 'BIG HIT', desc: '32 power finisher, only 4 uses.' },
    ],
    GYM: [
      { id: 'gymsession', name: 'KCL GYM SESSION', power: 28, pp: 6, heal: 6, note: 'HEALS 6', desc: '28 power and heals you 6 HP at the same time.' },
      { id: 'legday', name: 'LEG DAY', power: 36, pp: 3, self: { status: 'SNOOZE' }, note: 'SNOOZES YOU', desc: 'The biggest hit in the game (36) — and it SNOOZES you.' },
      { id: 'treadmill', name: 'TREADMILL 5K', power: 24, pp: 8, note: 'STEADY HIT', desc: '24 power, 8 uses. Boring and reliable.' },
      { id: 'protein', name: 'PROTEIN SHAKE', power: 0, pp: 5, heal: 16, note: 'HEALS 16', desc: 'No damage — heals you 16 HP.' },
      { id: 'warmup', name: 'WARM-UP SET', power: 18, pp: 10, note: 'CHEAP AND SAFE', desc: '18 power, 10 uses. Your cheapest attack.' },
      { id: 'sparring', name: 'SPARRING ROUND', power: 26, pp: 7, effect: { status: 'BURNOUT', chance: 0.3 }, note: '30% BURNOUT', desc: '26 power, 30% chance to BURN them out (-5 HP a round).' },
      { id: 'coldshower', name: 'COLD SHOWER', power: 20, pp: 8, cure: true, note: 'CURES STATUS', desc: '20 power and clears any status on you.' },
      { id: 'onemore', name: 'ONE MORE REP', power: 32, pp: 4, note: 'BIG HIT', desc: '32 power, 4 uses. Finisher.' },
    ],
    SOCIAL: [
      { id: 'sumbar', name: 'SU BAR DECOMP', power: 0, pp: 5, heal: 16, cure: true, note: 'HEAL + CURE', desc: 'No damage — heals 16 HP and clears any status.' },
      { id: 'mixer', name: 'SOCIETY MIXER', power: 22, pp: 8, effect: { status: 'PARALYSIS', chance: 0.4 }, note: '40% PARALYSED', desc: '22 power, 40% chance to PARALYSE them.' },
      { id: 'flatpres', name: 'FLAT PRES', power: 26, pp: 7, note: 'STEADY HIT', desc: '26 power, no side effects.' },
      { id: 'nightout', name: 'NIGHT OUT', power: 34, pp: 3, self: { status: 'SNOOZE' }, note: 'SNOOZES YOU', desc: '34 power in 3 shots — but it SNOOZES you.' },
      { id: 'coffeechat', name: 'COFFEE CHAT', power: 20, pp: 9, effect: { status: 'POISON', chance: 0.35 }, note: '35% DOOMSCROLL', desc: '20 power, 35% chance to leave them DOOMSCROLLED (-4 HP a round).' },
      { id: 'groupwork', name: 'GROUP PROJECT', power: 28, pp: 5, effect: { status: 'BURNOUT', chance: 0.3 }, note: '30% BURNOUT', desc: '28 power, 30% chance to BURN them out (-5 HP a round).' },
      { id: 'facetime', name: '2AM FACETIME', power: 24, pp: 6, effect: { status: 'SNOOZE', chance: 0.35 }, note: '35% SNOOZE', desc: '24 power, 35% chance to put them to SNOOZE.' },
      { id: 'smalltalk', name: 'SMALL TALK', power: 18, pp: 10, note: 'CHEAP AND SAFE', desc: '18 power, 10 uses. Cheap chip damage.' },
    ],
  };

  const MOVES = TYPES.reduce((all, type) => {
    POOLS[type].forEach((move) => all.push(Object.assign({ type }, move)));
    return all;
  }, []);

  HF.TYPES = TYPES;
  HF.BEATS = BEATS;
  HF.POOLS = POOLS;
  HF.MOVES = MOVES;
})(window.HF);
