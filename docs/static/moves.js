/* ==========================================================================
   moves.js  —  the type wheel and the move library.

   Four types, four habits. Every type has its own eight moves, so a GYM
   trainer never ends up throwing a library swing. Each trainer picks six of
   their eight before the match and the rival has to approve the loadout.
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
      { id: 'libgrind', name: 'MAUGHAN GRIND', power: 24, pp: 8, note: 'STEADY HIT' },
      { id: 'allnighter', name: 'ALL-NIGHTER', power: 34, pp: 3, self: { status: 'SNOOZE' }, note: 'SNOOZES YOU' },
      { id: 'flashcards', name: 'FLASHCARD DRILL', power: 18, pp: 10, note: 'CHEAP AND SAFE' },
      { id: 'pastpaper', name: 'PAST PAPER RUN', power: 26, pp: 6, note: 'NO GIMMICKS' },
      { id: 'wikihole', name: '3AM WIKI HOLE', power: 20, pp: 7, effect: { status: 'POISON', chance: 0.6 }, note: '60% DOOMSCROLL' },
      { id: 'silentfloor', name: 'SILENT FLOOR', power: 0, pp: 5, heal: 14, note: 'HEALS 14' },
      { id: 'groupchat', name: 'GROUP CHAT GRIND', power: 22, pp: 7, effect: { status: 'PARALYSIS', chance: 0.4 }, note: '40% PARALYSED' },
      { id: 'deadline', name: 'DEADLINE PANIC', power: 30, pp: 4, note: 'BIG HIT' },
    ],
    LECTURE: [
      { id: 'nineam', name: '9AM LECTURE', power: 26, pp: 7, note: 'RELIABLE' },
      { id: 'slidedeck', name: 'SLIDE DECK SKIM', power: 20, pp: 9, effect: { status: 'BURNOUT', chance: 0.35 }, note: '35% BURNOUT' },
      { id: 'panopto', name: 'PANOPTO REWATCH', power: 0, pp: 5, heal: 12, cure: true, note: 'HEAL + CURE' },
      { id: 'handout', name: 'HANDOUT HOARD', power: 18, pp: 10, note: 'CHEAP AND SAFE' },
      { id: 'strand', name: 'STRAND SPRINT', power: 24, pp: 7, note: 'STEADY HIT' },
      { id: 'backrow', name: 'BACK ROW NAP', power: 28, pp: 5, self: { status: 'SNOOZE' }, note: 'SNOOZES YOU' },
      { id: 'noteswap', name: 'NOTE SWAP', power: 22, pp: 8, effect: { status: 'PARALYSIS', chance: 0.3 }, note: '30% PARALYSED' },
      { id: 'questiontime', name: 'QUESTION TIME', power: 32, pp: 4, note: 'BIG HIT' },
    ],
    GYM: [
      { id: 'gymsession', name: 'KCL GYM SESSION', power: 28, pp: 6, heal: 6, note: 'HEALS 6' },
      { id: 'legday', name: 'LEG DAY', power: 36, pp: 3, self: { status: 'SNOOZE' }, note: 'SNOOZES YOU' },
      { id: 'treadmill', name: 'TREADMILL 5K', power: 24, pp: 8, note: 'STEADY HIT' },
      { id: 'protein', name: 'PROTEIN SHAKE', power: 0, pp: 5, heal: 16, note: 'HEALS 16' },
      { id: 'warmup', name: 'WARM-UP SET', power: 18, pp: 10, note: 'CHEAP AND SAFE' },
      { id: 'sparring', name: 'SPARRING ROUND', power: 26, pp: 7, effect: { status: 'BURNOUT', chance: 0.3 }, note: '30% BURNOUT' },
      { id: 'coldshower', name: 'COLD SHOWER', power: 20, pp: 8, cure: true, note: 'CURES STATUS' },
      { id: 'onemore', name: 'ONE MORE REP', power: 32, pp: 4, note: 'BIG HIT' },
    ],
    SOCIAL: [
      { id: 'sumbar', name: 'SU BAR DECOMP', power: 0, pp: 5, heal: 16, cure: true, note: 'HEAL + CURE' },
      { id: 'mixer', name: 'SOCIETY MIXER', power: 22, pp: 8, effect: { status: 'PARALYSIS', chance: 0.4 }, note: '40% PARALYSED' },
      { id: 'flatpres', name: 'FLAT PRES', power: 26, pp: 7, note: 'STEADY HIT' },
      { id: 'nightout', name: 'NIGHT OUT', power: 34, pp: 3, self: { status: 'SNOOZE' }, note: 'SNOOZES YOU' },
      { id: 'coffeechat', name: 'COFFEE CHAT', power: 20, pp: 9, effect: { status: 'POISON', chance: 0.35 }, note: '35% DOOMSCROLL' },
      { id: 'groupwork', name: 'GROUP PROJECT', power: 28, pp: 5, effect: { status: 'BURNOUT', chance: 0.3 }, note: '30% BURNOUT' },
      { id: 'facetime', name: '2AM FACETIME', power: 24, pp: 6, effect: { status: 'SNOOZE', chance: 0.35 }, note: '35% SNOOZE' },
      { id: 'smalltalk', name: 'SMALL TALK', power: 18, pp: 10, note: 'CHEAP AND SAFE' },
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
