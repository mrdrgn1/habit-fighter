/* ==========================================================================
   game.js  —  rooms, loadouts, simultaneous rounds, caps and the token wallet.

   Flow:
     title → (device account) → lobby → pick 4-type + 6 moves → rival approves
     → battle → both trainers pick a move each round → receipt.

   Everything is plain functions on window.HF. No classes, no framework.
   Only the acting client writes to the room; the other one polls it.
   ========================================================================== */

window.HF = window.HF || {};

(function (HF) {
  'use strict';

  const $ = HF.$;
  const $$ = HF.$$;

  const MAX_HP = 120;
  const LOADOUT_SIZE = 6;
  const CAP_DMG = 25;
  const CAP_FINE = 2;        // a caught liar pays the accuser
  const FALSE_CALL_FINE = 1; // a wrong call pays the accused
  const DUEL_DMG = 12;
  const HISTORY_MAX = 30;
  const ACCOUNT_KEY = 'hf:account';
  const ACCOUNT_START = 50;

  const TYPES = HF.TYPES;
  const BEATS = HF.BEATS;
  const POOLS = HF.POOLS;
  const MOVES = HF.MOVES;
  const moveById = (id) => MOVES.find((entry) => entry.id === id) || null;

  const STATUS_LABEL = {
    none: '',
    SNOOZE: 'SNOOZE',
    PARALYSIS: 'PARALYSED',
    BURNOUT: 'BURNOUT',
    POISON: 'DOOMSCROLL',
    FRAUD: 'FRAUD',
  };

  const session = {
    code: null,
    seat: null,
    name: 'TRAINER',
    type: 'STUDY',
    ante: 3,
    account: null,
    pick: { type: 'STUDY', moves: [] },
    recordedKey: null,
  };

  let state = null;
  let busy = false;
  let currentLayer = 'title';
  let seenCapKey = '';
  const lastTok = { a: null, b: null, pot: null };
  let autoTimer = null;
  let focusStart = 0;
  let focusArmed = false;
  let focusTimer = null;
  let builtKey = '';
  let pickerType = '';

  const other = (side) => (side === 'a' ? 'b' : 'a');
  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));

  /* ---------------------------------------------------------------------- */
  /* 1. Device account + battle history                                     */
  /* ---------------------------------------------------------------------- */

  function blankAccount(name) {
    return {
      name: String(name || 'TRAINER').toUpperCase().slice(0, 10),
      tokens: ACCOUNT_START,
      wins: 0,
      losses: 0,
      draws: 0,
      history: [],
      createdAt: Date.now(),
    };
  }

  function loadAccount() {
    try {
      const raw = localStorage.getItem(ACCOUNT_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved && typeof saved.tokens === 'number' && Array.isArray(saved.history)) {
          if (typeof saved.wins !== 'number') saved.wins = 0;
          if (typeof saved.losses !== 'number') saved.losses = 0;
          if (typeof saved.draws !== 'number') saved.draws = 0;
          if (!saved.name) saved.name = 'TRAINER';
          return saved;
        }
      }
    } catch (err) {
      /* corrupt or blocked storage: start fresh */
    }
    const fresh = blankAccount('TRAINER');
    try {
      localStorage.setItem(ACCOUNT_KEY, JSON.stringify(fresh));
    } catch (err) { /* private mode */ }
    return fresh;
  }

  function saveAccount() {
    if (!session.account) return;
    try {
      localStorage.setItem(ACCOUNT_KEY, JSON.stringify(session.account));
    } catch (err) { /* private mode: this session still counts */ }
  }

  /** Net-based flavour line, shared with the printer. */
  function verdict(net, finalTokens) {
    if (finalTokens <= 0) return 'GENERATIONAL DEBT';
    if (net >= 15) return 'HABIT TYCOON';
    if (net >= 8) return 'COMPOUND INTEREST';
    if (net > 0) return 'IN THE GREEN';
    if (net === 0) return 'EXACTLY EVEN';
    if (net <= -15) return 'GENERATIONAL DEBT';
    return 'IN THE RED';
  }

  HF.verdict = verdict;

  function renderAccountLine() {
    const acc = session.account;
    if (!acc) return;
    const line = $('acct-line');
    if (line) {
      line.textContent = `DEVICE TRAINER · ${acc.name} · ${acc.tokens} 🪙 · ${acc.wins}W-${acc.losses}L`;
    }
    const hint = $('ante-hint');
    if (hint) {
      hint.textContent = `Wallet: ${acc.tokens} 🪙 saved on this device. The ante comes out of it, and the winner sweeps the pot.`;
    }
  }

  /** Write the final wallet + one history row, once per battle. */
  function maybeRecord(match) {
    if (!match || match.zone !== 'over' || !session.seat || !session.account) return;
    const me = match[session.seat];
    if (!me) return;
    const key = `${match.code}:${match.createdAt}:${match.battleNo || 1}`;
    let stored = null;
    try { stored = localStorage.getItem('hf:recorded'); } catch (err) { /* private mode */ }
    if (session.recordedKey === key || stored === key) return;
    session.recordedKey = key;
    try { localStorage.setItem('hf:recorded', key); } catch (err) { /* private mode */ }

    const start = me.startTokens == null ? me.tokens : me.startTokens;
    const net = (me.tokens || 0) - start;
    const won = match.winner === session.seat;
    const draw = match.winner == null;

    session.account.tokens = Math.max(0, me.tokens || 0);
    if (won) session.account.wins += 1;
    else if (draw) session.account.draws += 1;
    else session.account.losses += 1;

    const foeSide = other(session.seat);
    const foe = match[foeSide] || {};
    session.account.history.unshift({
      at: Date.now(),
      code: match.code,
      rival: foe.name || 'RIVAL',
      rivalType: foe.type || '—',
      myType: me.type || '—',
      result: won ? 'WIN' : draw ? 'DRAW' : 'LOSS',
      net,
      tokens: session.account.tokens,
      verdict: verdict(net, session.account.tokens),
    });
    session.account.history = session.account.history.slice(0, HISTORY_MAX);
    saveAccount();
    renderAccountLine();
    renderHistory();
  }

  function renderHistory() {
    const acc = session.account;
    const list = $('hist-list');
    if (!acc || !list) return;
    const summary = $('hist-summary');
    if (summary) {
      summary.textContent = `${acc.name} · ${acc.tokens} 🪙 · ${acc.wins}W-${acc.losses}L-${acc.draws}D · ${acc.history.length} battle${acc.history.length === 1 ? '' : 's'} on this device`;
    }
    if (!acc.history.length) {
      list.innerHTML = '<p class="hist-empty">NO BATTLES YET. YOUR TOKENS WAIT AT 50 🪙.</p>';
      return;
    }
    list.innerHTML = acc.history.map((entry) => {
      const date = new Date(entry.at);
      const pad = (n) => String(n).padStart(2, '0');
      const when = `${pad(date.getDate())}/${pad(date.getMonth() + 1)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
      const sign = entry.net > 0 ? '+' : '';
      const tone = entry.result === 'WIN' ? 'is-win' : entry.result === 'LOSS' ? 'is-loss' : 'is-draw';
      return `<div class="hist-row">
        <span class="hist-when">${when}</span>
        <span class="hist-who">VS ${esc(entry.rival)}<br><em>${esc(entry.myType)} v ${esc(entry.rivalType)}</em></span>
        <span class="hist-res ${tone}">${esc(entry.result)}</span>
        <span class="hist-net">${sign}${Number(entry.net) || 0} 🪙</span>
      </div>`;
    }).join('');
  }

  /* ---------------------------------------------------------------------- */
  /* 2. State shape                                                         */
  /* ---------------------------------------------------------------------- */

  function fighter(name, type, tokens) {
    const wallet = Math.max(0, Number(tokens) || 0);
    return {
      name: String(name || 'TRAINER').toUpperCase().slice(0, 10) || 'TRAINER',
      type: type || 'STUDY',
      hp: MAX_HP,
      maxHp: MAX_HP,
      status: 'none',
      statusTurns: 0,
      moves: [],
      pp: {},
      hits: 0,
      supers: 0,
      proofs: 0,
      bluff: 3,
      fraud: false,
      tokens: wallet,
      startTokens: wallet,
      // signed per-category tally so the receipt can show where tokens went
      tok: { combo: 0, cap: 0, ante: 0, pot: 0 },
    };
  }

  function freshCap() {
    return { active: false, by: null, accused: null, stage: '', at: 0, result: null, proof: null };
  }

  function freshDuel() {
    return { active: false, by: null, at: 0, results: {} };
  }

  function newMatch(code, name, type, tokens) {
    const now = Date.now();
    return {
      code,
      createdAt: now,
      updatedAt: now,
      lastActAt: now,
      battleNo: 0,
      zone: 'lobby',
      round: 1,
      winner: null,
      autoRival: false,
      log: [],
      proof: null,
      ante: 3,
      pot: 0,
      choices: { a: null, b: null },
      loadout: { a: null, b: null },
      cap: freshCap(),
      duel: freshDuel(),
      duelUsed: false,
      rematch: { a: false, b: false },
      a: fighter(name, type, tokens),
      b: null,
    };
  }

  /**
   * Move tokens between a wallet and the pot. Wallets never go below zero, so a
   * trainer who cannot cover a fine pays what they have and nothing more.
   * from / to: 'a', 'b' or 'pot'.
   */
  function transfer(m, from, to, amount, opts) {
    const o = opts || {};
    const cat = o.category || 'misc';
    if (!amount || amount <= 0) return 0;

    const source = from === 'pot' ? m.pot : (m[from] && m[from].tokens) || 0;
    const moved = Math.min(amount, Math.max(0, source));
    if (moved <= 0) return 0;

    if (from === 'pot') {
      m.pot -= moved;
    } else {
      m[from].tokens -= moved;
      if (m[from].tok) m[from].tok[cat] = (m[from].tok[cat] || 0) - moved;
    }

    if (to === 'pot') {
      m.pot += moved;
    } else if (m[to]) {
      m[to].tokens += moved;
      if (m[to].tok) m[to].tok[cat] = (m[to].tok[cat] || 0) + moved;
    }

    if (o.log) pushLog(m, o.log.split('%n').join(String(moved)), o.tone || 'is-system');
    return moved;
  }

  function pushLog(match, text, tone) {
    const log = match.log || (match.log = []);
    log.push({ text, tone: tone || 'is-system', at: Date.now() });
    if (log.length > 24) log.splice(0, log.length - 24);
    match.lastActAt = Date.now();
  }

  function randomLoadout(type) {
    const pool = (POOLS[type] || POOLS.STUDY).slice();
    for (let i = pool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = pool[i];
      pool[i] = pool[j];
      pool[j] = tmp;
    }
    return pool.slice(0, LOADOUT_SIZE).map((move) => move.id);
  }

  function defaultMoves(type) {
    return (POOLS[type] || POOLS.STUDY).slice(0, LOADOUT_SIZE).map((move) => move.id);
  }

  /**
   * Opens a battle: both loadouts become the fighter's moveset, HP and PP are
   * fresh, and each side antes from the wallet it brought to the room.
   */
  function openBattle(m) {
    m.zone = 'battle';
    m.battleNo = (m.battleNo || 0) + 1;
    m.pot = 0;
    m.round = 1;
    m.choices = { a: null, b: null };
    m.winner = null;
    m.rematch = { a: false, b: false };
    m.proof = null;
    m.cap = freshCap();
    m.duel = freshDuel();
    m.duelUsed = false;

    ['a', 'b'].forEach((side) => {
      const f = m[side];
      if (!f) return;
      const load = m.loadout && m.loadout[side];
      f.startTokens = Math.max(0, f.tokens || 0);
      f.tok = { combo: 0, cap: 0, ante: 0, pot: 0 };
      f.hp = f.maxHp || MAX_HP;
      f.status = 'none';
      f.statusTurns = 0;
      f.pp = {};
      f.hits = 0;
      f.supers = 0;
      f.proofs = 0;
      f.bluff = 3;
      f.fraud = false;
      if (load) {
        f.type = load.type;
        f.moves = load.moves.slice();
      }
      if (!f.moves || !f.moves.length) f.moves = defaultMoves(f.type);
      f.moves.forEach((id) => {
        const move = moveById(id);
        if (move) f.pp[id] = move.pp;
      });
      const stake = Math.min(Number(m.ante) || 0, f.tokens || 0);
      transfer(m, side, 'pot', stake, { category: 'ante' });
    });

    lastTok.a = null;
    lastTok.b = null;
    lastTok.pot = null;
    pushLog(m, `Antes paid — the Match Pot holds ${m.pot} 🪙.`, 'is-system');
  }

  function startBattle(m) {
    m.zone = 'battle';
    m.winner = null;
    m.log = [];
    pushLog(m, `${m.a.name} (${m.a.type}) VS ${m.b.name} (${m.b.type})`, 'is-system');
    if (m.b && m.autoRival) pushLog(m, 'SOLO DEMO — the rival plays itself.', 'is-system');
    openBattle(m);
    pushLog(m, 'Both trainers pick a move each round. Combos steal 🪙.', 'is-system');
  }

  /* ---------------------------------------------------------------------- */
  /* 3. Rules                                                               */
  /* ---------------------------------------------------------------------- */

  function beats(attackType, defendType) {
    return BEATS[attackType] === defendType;
  }

  function damageFor(move, atk, def) {
    const effective = beats(move.type, def.type);
    const resisted = beats(def.type, move.type);
    const combo = effective && def.status !== 'none' && def.status !== 'FRAUD';

    let mult = effective ? 1.5 : resisted ? 0.75 : 1;
    if (combo) mult *= 1.5;
    if (atk.status === 'BURNOUT') mult *= 0.85;

    const jitter = 0.92 + Math.random() * 0.16;
    const dmg = Math.max(1, Math.round(move.power * mult * jitter));
    return { dmg, effective, resisted, combo };
  }

  function tickStatus(match, side, events) {
    const f = match[side];
    if (!f) return;
    if (f.status === 'BURNOUT') {
      f.hp = Math.max(0, f.hp - 5);
      pushLog(match, `${f.name} is BURNED OUT (-5 HP)`, 'is-miss');
      events.push('poison');
    }
    if (f.status === 'POISON') {
      f.hp = Math.max(0, f.hp - 4);
      pushLog(match, `${f.name} DOOMSCROLLED (-4 HP)`, 'is-miss');
      events.push('poison');
    }
    if (f.statusTurns > 0) {
      f.statusTurns -= 1;
      if (f.statusTurns === 0) f.status = 'none';
    }
  }

  function checkFaint(match) {
    if (match.zone !== 'battle') return;
    const sides = ['a', 'b'].filter((s) => match[s]);
    const dead = sides.filter((s) => match[s].hp <= 0);
    if (!dead.length) return;

    match.zone = 'over';
    match.choices = { a: null, b: null };
    const alive = sides.filter((s) => dead.indexOf(s) === -1);
    match.winner = alive.length === 1 ? alive[0] : null;

    dead.forEach((s) => pushLog(match, `${match[s].name} FAINTED!`, 'is-miss'));
    if (match.winner) {
      pushLog(match, `${match[match.winner].name} WINS THE MATCH!`, 'is-super');
      // Winner takes the whole pot. Double KOs leave it on the table.
      transfer(match, 'pot', match.winner, match.pot, {
        category: 'pot',
        log: `${match[match.winner].name} SWEEPS THE POT: %n 🪙`,
        tone: 'is-super',
      });
    } else {
      pushLog(match, 'DOUBLE FAINT. NOBODY WINS.', 'is-super');
    }
  }

  /** All six moves dry would soft-lock the round — hand out a second wind. */
  function refillIfEmpty(match, side) {
    const f = match[side];
    if (!f) return;
    const ids = f.moves && f.moves.length ? f.moves : defaultMoves(f.type);
    const total = ids.reduce((sum, id) => {
      const move = moveById(id);
      const max = move ? move.pp : 1;
      return sum + (f.pp[id] == null ? max : f.pp[id]);
    }, 0);
    if (total > 0) return;
    ids.forEach((id) => {
      const move = moveById(id);
      if (move) f.pp[id] = move.pp;
    });
    pushLog(match, `${f.name} catches a second wind — PP restored!`, 'is-system');
  }

  /** One trainer's half of a round. No turn flipping: both sides act. */
  function applyMove(match, side, moveId, events) {
    const foeSide = other(side);
    const atk = match[side];
    const def = match[foeSide];
    const move = moveById(moveId);
    if (!atk || !def || !move) return;
    if (atk.hp <= 0 || def.hp <= 0) return;

    if (atk.status === 'SNOOZE' && Math.random() < 0.35) {
      pushLog(match, `${atk.name} is SNOOZING… move lost!`, 'is-miss');
      events.push('miss');
      return;
    }
    if (atk.status === 'PARALYSIS' && Math.random() < 0.3) {
      pushLog(match, `${atk.name} is PARALYSED! Can't move!`, 'is-miss');
      events.push('miss');
      return;
    }

    if (atk.pp[moveId] === undefined) atk.pp[moveId] = move.pp;
    if (atk.pp[moveId] <= 0) {
      pushLog(match, `No PP left for ${move.name}!`, 'is-miss');
      events.push('error');
      return;
    }
    atk.pp[moveId] -= 1;

    pushLog(match, `${atk.name} used ${move.name}!`, 'is-system');

    if (move.cure) {
      atk.status = 'none';
      atk.statusTurns = 0;
      pushLog(match, `${atk.name} shook off every status!`, 'is-system');
    }

    if (move.heal) {
      const before = atk.hp;
      atk.hp = Math.min(atk.maxHp, atk.hp + move.heal);
      const gained = atk.hp - before;
      if (gained > 0) {
        pushLog(match, `Recovered ${gained} HP!`, 'is-system');
        events.push('heal');
      }
    }

    if (move.self && move.self.status) {
      atk.status = move.self.status;
      atk.statusTurns = 3;
      pushLog(match, `${atk.name} is ${STATUS_LABEL[move.self.status]}!`, 'is-miss');
    }

    if (move.power > 0) {
      const roll = damageFor(move, atk, def);
      def.hp = Math.max(0, def.hp - roll.dmg);
      atk.hits += 1;
      if (roll.effective) atk.supers += 1;

      if (roll.combo) {
        pushLog(match, `COMBO! It's super effective! -${roll.dmg} HP`, 'is-super');
        events.push('super');
        // LOCKED IN: a perfect type combo steals a token off the defender.
        transfer(match, foeSide, side, 1, {
          category: 'combo',
          log: `LOCKED IN! ${atk.name} steals %n 🪙 from ${def.name}.`,
          tone: 'is-super',
        });
      } else if (roll.effective) {
        pushLog(match, `It's super effective! -${roll.dmg} HP`, 'is-super');
        events.push('super');
      } else if (roll.resisted) {
        pushLog(match, `Not very effective… -${roll.dmg} HP`, 'is-hit');
        events.push('hit');
      } else {
        pushLog(match, `Hit for ${roll.dmg} damage.`, 'is-hit');
        events.push('hit');
      }
    }

    if (move.effect && def.hp > 0 && def.status === 'none') {
      const chance = move.effect.chance == null ? 1 : move.effect.chance;
      if (Math.random() < chance) {
        def.status = move.effect.status;
        def.statusTurns = 3;
        pushLog(match, `${def.name} is now ${STATUS_LABEL[def.status]}!`, 'is-miss');
      }
    }

    tickStatus(match, side, events);
    checkFaint(match);
  }

  /** Both picks are in: resolve them in alternating order, then open the next round. */
  function resolveRound(match, events) {
    const order = (match.round || 1) % 2 === 1 ? ['a', 'b'] : ['b', 'a'];
    order.forEach((side) => {
      if (match.zone !== 'battle') return;
      const moveId = match.choices && match.choices[side];
      if (!moveId) return;
      applyMove(match, side, moveId, events);
    });

    match.choices = { a: null, b: null };
    if (match.zone !== 'battle') return;
    match.round = (match.round || 1) + 1;
    ['a', 'b'].forEach((side) => refillIfEmpty(match, side));
  }

  /* ---------------------------------------------------------------------- */
  /* 4. Sync helpers                                                        */
  /* ---------------------------------------------------------------------- */

  async function publish(fn) {
    const next = await HF.net.mutate(session.code, fn);
    applyState(next, { local: true });
    return next;
  }

  function applyState(match, options) {
    const opts = options || {};
    if (!match) return;
    const prev = state;

    state = match;
    render(match);

    if (!opts.local && prev && prev.code === match.code) detectRemote(prev, match);
    maybeRecord(match);
    maybeAutoPlay();
  }

  /** Play sounds on the *other* phone when its HP moves. */
  function detectRemote(prev, next) {
    const foe = next[other(session.seat)];
    const foePrev = prev[other(session.seat)];
    const me = next[session.seat];
    const mePrev = prev[session.seat];

    if (foe && foePrev && foe.hp < foePrev.hp) {
      HF.ui.hitSprite('foe');
      HF.ui.shake();
      HF.sound.play(foe.hp <= 0 ? 'lose' : 'hit');
    }
    if (me && mePrev && me.hp < mePrev.hp) {
      HF.ui.hitSprite('me');
      HF.sound.play('poison');
    }
    if (prev.zone === 'battle' && next.zone === 'over') {
      const iWon = next.winner === session.seat;
      HF.sound.play(iWon ? 'win' : 'lose');
      HF.ui.toast(iWon ? 'YOU WIN! ★' : 'YOU FAINTED…');
    }
    if (next.cap && next.cap.active && (!prev.cap || !prev.cap.active)) {
      HF.sound.play('poison');
    }
  }

  /* ---------------------------------------------------------------------- */
  /* 5. Rendering                                                           */
  /* ---------------------------------------------------------------------- */

  function go(layer) {
    if (currentLayer === layer) return;
    currentLayer = layer;
    HF.ui.showLayer(layer);
  }

  function render(match) {
    if (!match) return;
    if (match.zone === 'lobby') {
      go('lobby');
      renderLobby(match);
      return;
    }
    if (currentLayer === 'title' || currentLayer === 'history') {
      renderHistory();
    }
    go('battle');
    renderBattle(match);
  }

  function renderLobby(match) {
    $('lobby-code').textContent = match.code;
    $('device-room').textContent = 'ROOM ' + match.code;
    $('slot-a-name').textContent = match.a ? `${match.a.name} · ${match.a.type}` : '—';
    $('slot-b-name').textContent = match.b ? `${match.b.name} · ${match.b.type}` : (match.autoRival ? 'RIVAL (AUTO)' : 'waiting…');
    $('slot-a-dot').classList.toggle('is-live', !!match.a);
    $('slot-b-dot').classList.toggle('is-live', !!match.b);
    $('lobby-hint').textContent = match.b
      ? 'Pick a type and six moves, then lock in. Your rival approves the loadout.'
      : 'Second trainer scans the QR or opens ' + HF.net.inviteLink(match.code);

    const qr = $('invite-qr');
    if (qr) {
      const link = HF.net.inviteLink(match.code);
      if (qr.dataset.link !== link) {
        qr.dataset.link = link;
        HF.qr.render(qr, link);
      }
    }

    renderLoadout(match);
  }

  /* ---------------------------------------------------------------- loadout */

  function myLoadout(match) {
    return (match.loadout && match.loadout[session.seat]) || null;
  }

  function buildMovePicker() {
    const wrap = $('ld-moves');
    if (!wrap) return;
    pickerType = session.pick.type;
    const pool = POOLS[session.pick.type] || POOLS.STUDY;
    wrap.innerHTML = pool.map((move) => (
      `<button class="btn mv-pick" type="button" data-mv="${move.id}">
        <span class="mv-name">${move.name}</span>
        <span class="mv-meta">PP ${move.pp} · ${move.note}</span>
      </button>`
    )).join('');
  }

  function renderLoadout(match) {
    if (!match || !match.a) return;
    const mine = myLoadout(match);

    if (!session.pick.type || TYPES.indexOf(session.pick.type) === -1) {
      session.pick.type = session.type || 'STUDY';
    }
    if (mine) {
      session.pick.type = mine.type;
      session.pick.moves = mine.moves.slice();
    }
    if (pickerType !== session.pick.type) buildMovePicker();

    // type buttons in the lobby mirror the live pick
    $$('#loadout-types .type-btn').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.type === session.pick.type);
      btn.disabled = !!(mine && mine.locked);
    });

    const count = session.pick.moves.length;
    $('ld-count').textContent = mine && mine.locked
      ? `LOCKED · ${session.pick.type} · ${count} MOVES`
      : `PICK 6 MOVES · ${count}/6`;
    $('btn-lock').disabled = !!(mine && mine.locked) || count !== LOADOUT_SIZE;
    $('btn-lock').textContent = mine && mine.locked ? '✓ LOADOUT LOCKED' : '🔒 LOCK LOADOUT';

    $$('#ld-moves .mv-pick').forEach((btn) => {
      const picked = session.pick.moves.indexOf(btn.dataset.mv) !== -1;
      btn.classList.toggle('is-picked', picked);
      btn.disabled = !!(mine && mine.locked) || (!picked && count >= LOADOUT_SIZE);
    });

    const otherSide = other(session.seat);
    const rival = (match.loadout && match.loadout[otherSide]) || null;
    const approved = !!(mine && mine.approved);
    const status = $('ld-status');

    if (mine && mine.locked) {
      if (approved) status.textContent = 'RIVAL APPROVED YOUR LOADOUT ✓';
      else if (!rival || !rival.locked) status.textContent = 'WAITING FOR YOUR RIVAL TO BUILD A LOADOUT…';
      else status.textContent = 'RIVAL HAS NOT APPROVED YOUR LOADOUT YET…';
    } else if (rival && rival.locked) {
      status.textContent = 'YOUR RIVAL IS READY. BUILD YOURS.';
    } else {
      status.textContent = 'SIX MOVES. NO MORE, NO LESS.';
    }

    const review = $('ld-review');
    if (rival && rival.locked) {
      review.hidden = false;
      const names = (rival.moves || []).map((id) => {
        const move = moveById(id);
        return move ? move.name : id;
      });
      $('ld-rival').textContent = `${rival.type} · ${names.join(' / ')}`;
      $('btn-approve').disabled = !!rival.approved || !(mine && mine.locked);
      $('btn-approve').textContent = rival.approved ? '✓ APPROVED' : 'APPROVE LOADOUT';
      $('btn-reject').disabled = !!rival.approved;
    } else {
      review.hidden = true;
    }
  }

  function pickMoveForLoadout(id) {
    if (!state || state.zone !== 'lobby') return;
    const mine = myLoadout(state);
    if (mine && mine.locked) return;
    const at = session.pick.moves.indexOf(id);
    if (at !== -1) session.pick.moves.splice(at, 1);
    else if (session.pick.moves.length < LOADOUT_SIZE) session.pick.moves.push(id);
    else {
      HF.ui.toast('SIX MOVES MAX — TAP ONE TO SWAP IT OUT', true);
      return;
    }
    HF.sound.play('select');
    renderLoadout(state);
  }

  /* ------------------------------------------------------------------ battle */

  function renderBattle(match) {
    const me = match[session.seat] || {};
    const foe = match[other(session.seat)] || {};

    $('device-room').textContent = 'ROOM ' + match.code;
    $('foe-name').textContent = foe.name || 'RIVAL';
    $('foe-name').nextElementSibling.textContent = foe.type || '—';
    $('me-name').textContent = me.name || 'YOU';
    $('me-type').textContent = me.type || 'STUDY';

    HF.ui.setHP('foe', foe.hp || 0, foe.maxHp || MAX_HP);
    HF.ui.setHP('me', me.hp || 0, me.maxHp || MAX_HP);
    HF.ui.setStatus('foe', STATUS_LABEL[foe.status] || '');
    HF.ui.setStatus('me', STATUS_LABEL[me.status] || '');

    const flag = $('turnflag');
    flag.classList.remove('is-rival', 'is-over');
    const capOpen = !!(match.cap && match.cap.active);

    if (match.zone === 'over') {
      flag.textContent = match.winner === session.seat ? 'VICTORY!' : match.winner ? 'DEFEAT…' : 'DRAW';
      flag.classList.add('is-over');
      HF.ui.faintSprite('foe');
    } else if (capOpen) {
      flag.textContent = 'CAP CALL!';
      flag.classList.add('is-rival');
    } else if (match.choices && match.choices[session.seat]) {
      flag.textContent = 'WAITING FOR RIVAL';
      flag.classList.add('is-rival');
    } else {
      flag.textContent = `ROUND ${match.round || 1} · PICK`;
    }

    HF.ui.setText((match.log || []).slice(-3));

    renderMoves(match);
    renderProof(match, me);
    renderTokens(match);
    renderRematch(match);

    const myTokens = me.tokens == null ? 0 : me.tokens;
    const canCall = !!me && (me.bluff || 0) > 0 && match.zone === 'battle' && myTokens > 0 && !capOpen;
    const btnBluff = $('btn-bluff');
    btnBluff.disabled = !canCall;
    btnBluff.textContent = capOpen ? 'CAP OPEN' : 'CALL CAP · ' + (me.bluff == null ? 3 : me.bluff);

    // Camera proof is only evidence when a cap call is pointed at you.
    const iAmAccused = capOpen && match.cap.accused === session.seat && match.cap.stage !== 'judge';
    $('btn-proof').disabled = !iAmAccused;
    $('btn-proof').textContent = iAmAccused ? 'SHOW PROOF' : 'CAM PROOF';

    $('btn-duel').disabled = match.zone !== 'battle' || match.duelUsed || !!(match.duel && match.duel.active) || capOpen;

    maybeCapOverlay(match);
    renderDuel(match);
  }

  /** Wallet + pot bar, with a floating pixel pop whenever a number moves. */
  function renderTokens(match) {
    const a = match.a || {};
    const b = match.b || {};
    const pot = match.pot || 0;
    const tokA = a.tokens == null ? 0 : a.tokens;
    const tokB = b.tokens == null ? 0 : b.tokens;

    $('tok-a').textContent = tokA;
    $('tok-b').textContent = tokB;
    $('tok-pot').textContent = pot;
    $('tok-a-name').textContent = (a.name || 'P1').slice(0, 7);
    $('tok-b-name').textContent = (b.name || 'P2').slice(0, 7);

    const brokeA = tokA <= 0;
    const brokeB = tokB <= 0;
    $('bankrupt-a').hidden = !brokeA;
    $('bankrupt-b').hidden = !brokeB;
    $('tok-a').classList.toggle('is-broke', brokeA);
    $('tok-b').classList.toggle('is-broke', brokeB);

    [['a', tokA], ['b', tokB], ['pot', pot]].forEach(([key, value]) => {
      const prev = lastTok[key];
      lastTok[key] = value;
      if (prev == null || prev === value) return;
      popTokens(key, value - prev);
    });
  }

  function popTokens(key, delta) {
    if (!delta) return;
    const host = $('tok-' + key).closest('.tok-cell');
    if (!host) return;
    const el = document.createElement('span');
    el.className = 'tok-pop' + (delta > 0 ? '' : ' is-down');
    el.textContent = (delta > 0 ? '+' : '-') + Math.abs(delta) + ' 🪙';
    host.appendChild(el);
    setTimeout(() => el.remove(), 900);
    HF.sound.play(delta > 0 ? 'coin' : 'coinDown');
  }

  function renderMoves(match) {
    const me = match[session.seat];
    const capOpen = !!(match.cap && match.cap.active);
    const chosen = !!(match.choices && match.choices[session.seat]);
    const canAct = match.zone === 'battle' && !capOpen && !chosen;

    const ids = (me && me.moves && me.moves.length) ? me.moves : defaultMoves(me ? me.type : 'STUDY');
    const key = ids.join(',');
    if (key !== builtKey) {
      builtKey = key;
      buildMoveButtons(ids);
    }

    $$('.move-btn').forEach((btn) => {
      const move = moveById(btn.dataset.move);
      if (!move) return;
      const pp = me && me.pp[move.id] != null ? me.pp[move.id] : move.pp;
      btn.querySelector('.pp').textContent = pp;
      btn.disabled = !canAct || pp <= 0;
      btn.classList.toggle('is-used', pp <= 0);
      btn.classList.toggle('is-picked', chosen && match.choices[session.seat] === move.id);
    });
  }

  function buildMoveButtons(ids) {
    const wrap = $('moves');
    if (!wrap) return;
    wrap.innerHTML = ids.map((id) => {
      const move = moveById(id);
      if (!move) return '';
      return `<button class="btn move-btn" type="button" data-move="${move.id}">
        <span class="mv-name">${move.name}</span>
        <span class="mv-meta">PP <span class="pp">${move.pp}</span> · ${move.type}</span>
        <span class="mv-note">${move.note}</span>
      </button>`;
    }).join('');
  }

  function renderRematch(match) {
    const btn = $('btn-rematch');
    if (!btn) return;
    if (match.zone !== 'over') {
      btn.hidden = true;
      return;
    }
    btn.hidden = false;
    const votes = match.rematch || {};
    const mine = !!votes[session.seat];
    const theirs = !!votes[other(session.seat)];
    btn.disabled = mine;
    btn.textContent = mine
      ? (theirs ? 'BOTH IN — STARTING…' : 'WAITING FOR RIVAL · 1/2')
      : (theirs ? '⟳ ACCEPT REMATCH · THEY ASKED' : '⟳ REMATCH');
  }

  function renderProof(match, me) {
    const strip = $('proofstrip');
    if (!match.proof || !match.proof.src) {
      strip.hidden = true;
      return;
    }
    strip.hidden = false;
    $('proof-thumb').src = match.proof.src;
    const who = match[match.proof.by] ? match[match.proof.by].name : 'SOMEONE';
    $('proof-meta').textContent = `${who} · ${match.proof.pose} · proofs sent: ${me.proofs || 0}`;
  }

  /* --------------------------------------------------------------------- cap */

  function maybeCapOverlay(match) {
    const cap = match.cap;
    if (!cap) return;
    const open = document.querySelector('#cap:not([hidden])');

    if (cap.active) {
      const key = `${cap.at}:${cap.stage}`;
      if (key !== seenCapKey) {
        seenCapKey = key;
        renderCap(match);
        HF.ui.overlay('cap', true);
      }
    } else {
      seenCapKey = '';
      if (open) {
        HF.ui.overlay('cap', false);
        if (cap.result) {
          HF.ui.toast(
            cap.result === 'legit' ? 'PROOF ACCEPTED — YOU PAID 1 🪙'
              : cap.result === 'guilty' ? 'CALL STOOD — THEY TOOK -25'
              : 'CALL DROPPED'
          );
        }
      }
    }
  }

  function renderCap(match) {
    const cap = match.cap || {};
    const accused = match[cap.accused] || {};
    const accuser = match[cap.by] || {};
    const iAmAccused = cap.accused === session.seat;
    const iAmAccuser = cap.by === session.seat;
    const stage = cap.stage || 'answer';
    const src = cap.proof || '';

    $('cap-head').textContent = stage === 'judge' ? 'PROOF SUBMITTED' : 'CALLED CAP';

    if (iAmAccused && stage === 'answer') {
      $('cap-sub').textContent = `${accuser.name || 'YOUR RIVAL'} says you're capping. No system checks the photo — you show it, they decide.`;
    } else if (iAmAccused) {
      $('cap-sub').textContent = `Photo sent. ${accuser.name || 'YOUR RIVAL'} is judging it now.`;
    } else if (iAmAccuser && stage === 'judge') {
      $('cap-sub').textContent = `${accused.name || 'THEY'} sent a photo. It proves nothing on its own — look at it and call it.`;
    } else {
      $('cap-sub').textContent = `You called cap on ${accused.name || 'your rival'}. Waiting for a photo or a concession.`;
    }

    const img = $('cap-img');
    if (src) img.src = src;
    else img.removeAttribute('src');
    $('cap-photo').classList.toggle('is-empty', !src);

    $('btn-cap-proof').hidden = !(iAmAccused && stage === 'answer');
    $('btn-cap-hit').hidden = !(iAmAccused && stage === 'answer');
    $('btn-cap-accept').hidden = !(iAmAccuser && stage === 'judge');
    $('btn-cap-reject').hidden = !(iAmAccuser && stage === 'judge');
    $('btn-cap-cancel').hidden = !iAmAccuser;

    $('cap-hint').textContent = iAmAccused && stage === 'answer'
      ? `No proof = -${CAP_DMG} HP, FRAUD and ${CAP_FINE} 🪙 to them. A photo buys you their judgement, not a free pass.`
      : iAmAccuser && stage === 'judge'
        ? `Accept it: you pay ${FALSE_CALL_FINE} 🪙, no damage. Reject it and the call stands: they take -${CAP_DMG} and pay you ${CAP_FINE}.`
        : iAmAccuser ? 'They either show a photo or take the hit. You can drop the call at any time.'
          : 'Your rival decides what the photo is worth.';
  }

  /* ------------------------------------------------------------ focus duel */

  function renderDuel(match) {
    const duel = match.duel || {};
    const btn = $('btn-focus-tap');
    if (!btn) return;

    if (!duel.active) {
      btn.hidden = true;
      focusArmed = false;
      focusStart = 0;
      clearTimeout(focusTimer);
      return;
    }

    const results = duel.results || {};
    const mine = results[session.seat];
    if (mine != null) {
      btn.hidden = false;
      btn.disabled = true;
      btn.textContent = 'FOCUS ' + Math.round(mine) + 'MS · WAITING';
      return;
    }

    btn.hidden = false;
    if (focusArmed) return; // leave WAIT… / TAP NOW! alone while the timer runs
    armFocus();
  }

  /* ---------------------------------------------------------------------- */
  /* 6. Actions                                                             */
  /* ---------------------------------------------------------------------- */

  async function createMatch() {
    try {
      const code = HF.net.newCode();
      const match = newMatch(code, session.name, session.type, session.account.tokens);
      match.ante = Math.min(Number(session.ante) || 3, session.account.tokens);
      pushLog(match, `${match.a.name} opens a match. Ante set to ${match.ante} 🪙 each.`, 'is-system');
      await HF.net.write(code, match);
      session.seat = 'a';
      session.code = code;
      session.pick = { type: session.type, moves: [] };
      session.recordedKey = null;
      sessionStorage.setItem('hf:seat:' + code, 'a');
      localStorage.setItem('hf:last', code);
      HF.net.start(code, applyState);
      state = match;
      go('lobby');
      renderLobby(match);
      HF.sound.play('join');
    } catch (err) {
      HF.ui.toast('COULD NOT CREATE ROOM: ' + err.message, true);
    }
  }

  async function joinMatch() {
    const code = ($('join-code').value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    if (code.length < 4) {
      HF.ui.toast('TYPE THE 5-LETTER ROOM CODE', true);
      return;
    }
    try {
      const match = await HF.net.read(code);
      if (!match) {
        HF.ui.toast('NO ROOM CALLED ' + code, true);
        return;
      }
      if (match.b) {
        HF.ui.toast('ROOM IS FULL — START YOUR OWN', true);
        return;
      }
      const next = await HF.net.mutate(code, (m) => {
        m.b = fighter(session.name, session.type, session.account.tokens);
        if (m.zone !== 'lobby') m.zone = 'lobby';
        pushLog(m, `${m.b.name} joins the match.`, 'is-system');
      });
      session.seat = 'b';
      session.code = code;
      session.pick = { type: session.type, moves: [] };
      session.recordedKey = null;
      sessionStorage.setItem('hf:seat:' + code, 'b');
      localStorage.setItem('hf:last', code);
      HF.net.start(code, applyState);
      state = next;
      go('lobby');
      renderLobby(next);
      HF.sound.play('join');
    } catch (err) {
      HF.ui.toast('JOIN FAILED: ' + err.message, true);
    }
  }

  function readyToFight(m) {
    const L = m.loadout || {};
    return !!(L.a && L.b && L.a.locked && L.b.locked && L.a.approved && L.b.approved);
  }

  async function lockLoadout() {
    if (!state || state.zone !== 'lobby') return;
    const type = session.pick.type;
    const moves = session.pick.moves.slice();
    if (moves.length !== LOADOUT_SIZE) {
      HF.ui.toast('PICK EXACTLY SIX MOVES', true);
      return;
    }
    await publish((m) => {
      if (m.zone !== 'lobby' || !m[session.seat]) return;
      m.loadout = m.loadout || { a: null, b: null };
      m.loadout[session.seat] = {
        type,
        moves,
        locked: true,
        approved: false,
      };
      m[session.seat].type = type;
      pushLog(m, `${m[session.seat].name} locked a ${type} loadout.`, 'is-system');
      if (m.autoRival && session.seat === 'a') {
        // One person playing both seats: approve instantly.
        m.loadout.a.approved = true;
        if (m.loadout.b) m.loadout.b.approved = true;
      }
      if (readyToFight(m)) startBattle(m);
    });
    HF.sound.play('join');
    if (state.zone === 'battle') HF.ui.reviveSprites();
  }

  async function approveLoadout() {
    if (!state || state.zone !== 'lobby') return;
    const rivalSide = other(session.seat);
    await publish((m) => {
      if (m.zone !== 'lobby' || !m.loadout || !m.loadout[rivalSide]) return;
      m.loadout[rivalSide].approved = true;
      pushLog(m, `${m[session.seat].name} approves the rival loadout.`, 'is-system');
      if (readyToFight(m)) startBattle(m);
    });
    HF.sound.play('select');
    if (state.zone === 'battle') HF.ui.reviveSprites();
  }

  async function rejectLoadout() {
    if (!state || state.zone !== 'lobby') return;
    const rivalSide = other(session.seat);
    await publish((m) => {
      if (!m.loadout || !m.loadout[rivalSide]) return;
      m.loadout[rivalSide].locked = false;
      m.loadout[rivalSide].approved = false;
      pushLog(m, `${m[session.seat].name} sent the rival back to the drawing board.`, 'is-system');
    });
    HF.ui.toast('LOADOUT REJECTED — THEY HAVE TO REBUILD', true);
    HF.sound.play('error');
  }

  async function startSolo() {
    if (!state || state.zone !== 'lobby') return;
    if (session.seat !== 'a') {
      HF.ui.toast('ONLY THE HOST CAN RUN THE SOLO DEMO', true);
      return;
    }
    const foeSide = other(session.seat);
    const pool = TYPES.filter((t) => t !== session.pick.type);
    const type = pool[Math.floor(Math.random() * pool.length)] || 'GYM';
    await publish((m) => {
      m[foeSide] = fighter('RIVAL', type, session.account.tokens);
      m.autoRival = true;
      m.loadout = m.loadout || { a: null, b: null };
      m.loadout[foeSide] = {
        type,
        moves: randomLoadout(type),
        locked: true,
        approved: true,
      };
      pushLog(m, `SOLO DEMO — ${m[foeSide].name} (${type}) steps up. AUTO-RIVAL ON.`, 'is-system');
    });
    HF.ui.toast('AUTO-RIVAL ON · build your loadout to start');
    HF.sound.play('join');
  }

  /**
   * A round of moves: each trainer locks exactly one move and the round fires
   * as soon as both are in, so nobody sits waiting for a turn.
   */
  async function pickMove(moveId) {
    if (busy || !state || state.zone !== 'battle') return;
    if (state.cap && state.cap.active) {
      HF.ui.toast('SETTLE THE CAP CALL FIRST', true);
      return;
    }
    if (state.choices && state.choices[session.seat]) {
      HF.ui.toast('MOVE ALREADY LOCKED — WAITING FOR RIVAL');
      return;
    }
    const me = state[session.seat];
    const move = moveById(moveId);
    if (!me || !move) return;
    if ((me.moves || []).indexOf(moveId) === -1) return;
    const pp = me.pp[moveId] == null ? move.pp : me.pp[moveId];
    if (pp <= 0) {
      HF.ui.toast('NO PP LEFT ON THAT MOVE', true);
      return;
    }

    busy = true;
    const events = [];
    try {
      await publish((m) => {
        if (m.zone !== 'battle') return;
        if (m.cap && m.cap.active) return;
        if (m.choices[session.seat]) return;
        m.choices[session.seat] = moveId;
        pushLog(m, `${m[session.seat].name} locks in ${move.name}.`, 'is-system');
        if (m.choices.a && m.choices.b) resolveRound(m, events);
      });
      events.forEach((name) => HF.sound.play(name));
      if (events.indexOf('hit') !== -1 || events.indexOf('super') !== -1) {
        HF.ui.hitSprite('foe');
        HF.ui.shake();
      }
    } catch (err) {
      HF.ui.toast('MOVE FAILED TO SYNC: ' + err.message, true);
    } finally {
      busy = false;
      maybeAutoPlay();
    }
  }

  /* ---------------------------------------------------------------- camera */

  function openCamera() {
    if (!state || state.zone !== 'battle') {
      HF.ui.toast('PROOF ONLY EXISTS IN A BATTLE', true);
      return;
    }
    const cap = state.cap || {};
    const allowed = cap.active && cap.accused === session.seat && cap.stage !== 'judge';
    if (!allowed) {
      HF.ui.toast('CAM PROOF IS ONLY FOR ANSWERING A CAP CALL', true);
      return;
    }
    HF.camera.open({
      onCapture: async (shot) => {
        try {
          await publish((m) => {
            if (!m.cap || !m.cap.active || m.cap.accused !== session.seat) return;
            m.cap.proof = shot.src;
            m.cap.stage = 'judge';
            m.proof = { src: shot.src, pose: shot.pose, by: session.seat, at: shot.at };
            const me = m[session.seat];
            me.proofs = (me.proofs || 0) + 1;
            pushLog(m, `PROOF SENT — ${shot.pose}. The accuser decides.`, 'is-system');
          });
          HF.ui.toast('PROOF SENT · WAITING FOR THEIR CALL');
          HF.sound.play('heal');
        } catch (err) {
          HF.ui.toast('PROOF FAILED TO SYNC', true);
        }
      },
    });
  }

  /** Closing the camera without a photo must not strand an open cap call. */
  function reopenCapIfOpen() {
    if (state && state.cap && state.cap.active && state.cap.accused === session.seat) {
      renderCap(state);
      HF.ui.overlay('cap', true);
    }
  }

  /* -------------------------------------------------------------------- cap */

  /**
   * Settles an open cap call in place.
   *   legit   → the accuser accepts the photo: pays 1 🪙, nobody bleeds.
   *   guilty  → the accused concedes or the photo is rejected: -25, FRAUD, -2 🪙.
   *   dropped → the accuser backs out, nobody is hurt.
   */
  function settleCap(m, kind) {
    const cap = m.cap || {};
    if (!cap.active) return;
    const accuser = m[cap.by];
    const accused = m[cap.accused];

    cap.active = false;
    cap.result = kind;
    cap.at = Date.now();

    if (kind === 'legit' && accuser) {
      pushLog(m, `PROOF ACCEPTED — ${accuser.name} stands down.`, 'is-system');
      transfer(m, cap.by, cap.accused, FALSE_CALL_FINE, {
        category: 'cap',
        log: `FALSE CALL FEE — ${accuser.name} pays %n 🪙 to ${accused.name}.`,
        tone: 'is-hit',
      });
    } else if (kind === 'guilty' && accused) {
      accused.hp = Math.max(0, accused.hp - CAP_DMG);
      accused.status = 'FRAUD';
      accused.statusTurns = 3;
      accused.fraud = true;
      pushLog(m, cap.proof
        ? `${accuser.name} REJECTS THE PHOTO — ${accused.name} takes -${CAP_DMG} HP and FRAUD.`
        : `NO PROOF — ${accused.name} was capping (-${CAP_DMG} HP, FRAUD).`, 'is-super');
      transfer(m, cap.accused, cap.by, CAP_FINE, {
        category: 'cap',
        log: `${accused.name} pays the %n 🪙 CAP FINE to ${accuser.name}.`,
        tone: 'is-super',
      });
    } else if (accuser) {
      pushLog(m, `${accuser.name} drops the call. No damage.`, 'is-system');
    }

    if (m.proof) m.proof.capResult = kind;
    m.cap.proof = null;
    checkFaint(m);
  }

  async function callCap() {
    if (!state || state.zone !== 'battle') return;
    if (state.cap && state.cap.active) {
      renderCap(state);
      HF.ui.overlay('cap', true);
      return;
    }

    const me = state[session.seat];
    if (!me || (me.bluff || 0) <= 0) {
      HF.ui.toast('OUT OF CAP CALLS', true);
      return;
    }
    if ((me.tokens || 0) <= 0) {
      HF.ui.toast('BANKRUPT - NO TOKENS TO STAKE', true);
      return;
    }

    await publish((m) => {
      const mine = m[session.seat];
      const foeSide = other(session.seat);
      mine.bluff = Math.max(0, (mine.bluff || 0) - 1);
      m.cap = {
        active: true,
        by: session.seat,
        accused: foeSide,
        stage: 'answer',
        at: Date.now(),
        result: null,
        proof: null,
      };
      pushLog(m, `${mine.name} CALLS CAP! ${m[foeSide].name} must show proof.`, 'is-super');
    });

    HF.sound.play('poison');
    if (state.cap) seenCapKey = `${state.cap.at}:${state.cap.stage}`;
    renderCap(state);
    HF.ui.overlay('cap', true);
  }

  async function answerCap(kind) {
    if (!state || !state.cap || !state.cap.active) return;
    const cap = state.cap;
    if (kind === 'cancel' || kind === 'legit' || kind === 'reject') {
      if (cap.by !== session.seat) return;
    } else if (cap.accused !== session.seat) {
      return;
    }

    const result = kind === 'reject' ? 'guilty' : kind;
    if (kind === 'reject' && !cap.proof) {
      HF.ui.toast('THERE IS NO PHOTO TO REJECT', true);
      return;
    }

    await publish((m) => settleCap(m, result));
    HF.ui.overlay('cap', false);
    HF.ui.toast(
      kind === 'concede' || kind === 'reject' ? 'CALL STOOD · -25 HP'
        : kind === 'legit' ? 'PROOF ACCEPTED · -1 🪙'
        : 'CALL DROPPED'
    );
    HF.sound.play(kind === 'concede' || kind === 'reject' ? 'miss' : 'select');
  }

  /* ------------------------------------------------------------ focus duel */

  async function startDuel() {
    if (!state || state.zone !== 'battle') return;
    if (state.duelUsed || (state.duel && state.duel.active)) return;
    if (state.cap && state.cap.active) {
      HF.ui.toast('SETTLE THE CAP CALL FIRST', true);
      return;
    }
    await publish((m) => {
      m.duelUsed = true;
      m.duel = { active: true, by: session.seat, results: {}, at: Date.now() };
      pushLog(m, 'FOCUS DUEL! Both phones wait for TAP NOW, then tap.', 'is-system');
    });
    HF.ui.toast('FOCUS DUEL · tap the panel when it turns green');
    HF.sound.play('select');
    armFocus();
  }

  /** Both clients arm themselves: first WAIT…, then TAP NOW! */
  function armFocus() {
    const duel = state && state.duel;
    if (!duel || !duel.active) return;
    if (duel.results && duel.results[session.seat] != null) return;
    if (focusArmed) return;

    focusArmed = true;
    focusStart = 0;
    const btn = $('btn-focus-tap');
    btn.hidden = false;
    btn.disabled = true;
    btn.textContent = 'WAIT…';

    clearTimeout(focusTimer);
    focusTimer = setTimeout(() => {
      if (!state || !state.duel || !state.duel.active) return;
      focusStart = performance.now();
      btn.disabled = false;
      btn.textContent = 'TAP NOW!';
      HF.sound.play('select');
    }, 1200 + Math.random() * 2400);
  }

  async function tapFocus() {
    const duel = state && state.duel;
    if (!duel || !duel.active) return;
    if (!focusStart) return;
    const ms = Math.round(performance.now() - focusStart);
    focusStart = 0;
    focusArmed = false;
    clearTimeout(focusTimer);
    $('btn-focus-tap').disabled = true;
    $('btn-focus-tap').textContent = 'FOCUS ' + ms + 'MS';

    let next = null;
    try {
      next = await publish((m) => {
        if (!m.duel || !m.duel.active) return;
        if (!m.duel.results) m.duel.results = {};
        m.duel.results[session.seat] = ms;
      });
    } catch (err) {
      HF.ui.toast('DUEL FAILED TO SYNC', true);
      return;
    }
    HF.sound.play('hit');
    if (next && next.duel && next.duel.results && next.duel.results.a != null && next.duel.results.b != null) {
      await resolveDuel();
    }
  }

  async function resolveDuel() {
    if (!state || !state.duel || !state.duel.active) return;
    const results = state.duel.results || {};
    if (results.a == null || results.b == null) return;

    await publish((m) => {
      const d = m.duel;
      if (!d || !d.active) return;
      if (!d.results || d.results.a == null || d.results.b == null) return;
      d.active = false;
      const loserSide = d.results.a <= d.results.b ? 'b' : 'a';
      const winnerSide = other(loserSide);
      const loser = m[loserSide];
      loser.hp = Math.max(0, loser.hp - DUEL_DMG);
      loser.status = 'SNOOZE';
      loser.statusTurns = 3;
      pushLog(m, `FOCUS DUEL: ${m[winnerSide].name} reacts faster (${d.results[winnerSide]}ms)`, 'is-super');
      pushLog(m, `${loser.name} takes ${DUEL_DMG} HP and falls asleep.`, 'is-hit');
      checkFaint(m);
    });
    HF.sound.play('super');
  }

  /* ---------------------------------------------------------------- rematch */

  async function rematch() {
    if (!state || state.zone !== 'over') return;
    await publish((m) => {
      if (m.zone !== 'over') return;
      m.rematch = m.rematch || { a: false, b: false };
      if (m.rematch[session.seat]) return;
      m.rematch[session.seat] = true;
      const votes = (m.rematch.a ? 1 : 0) + (m.rematch.b ? 1 : 0);
      pushLog(m, `${m[session.seat].name} wants a rematch (${votes}/2).`, 'is-system');

      if (m.rematch.a && m.rematch.b) {
        m.zone = 'battle';
        m.log = [];
        pushLog(m, 'REMATCH — both trainers agreed. Same loadouts, fresh HP.', 'is-system');
        openBattle(m);
      }
    });
    HF.sound.play('join');
    if (state.zone === 'battle') {
      HF.ui.reviveSprites();
      session.recordedKey = null;
    }
  }

  /* -------------------------------------------------------------- token lab */

  /** Dev-only: fire any token rule by hand so the demo can show them on cue. */
  async function tokenLab(kind) {
    if (!state || !session.code || state.zone !== 'battle') {
      HF.ui.toast('START A BATTLE FIRST', true);
      return;
    }
    const foe = other(session.seat);

    await publish((m) => {
      const me = m[session.seat];

      switch (kind) {
        case 'gain':
          transfer(m, 'pot', session.seat, 1, { category: 'pot', log: `DEV: ${me.name} pulls %n 🪙 out of the pot.` });
          break;
        case 'lose':
          transfer(m, session.seat, 'pot', 1, { category: 'ante', log: `DEV: ${me.name} drops %n 🪙 in the pot.` });
          break;
        case 'steal':
          transfer(m, foe, session.seat, 1, { category: 'combo', log: `DEV: LOCKED IN — ${me.name} steals %n 🪙.`, tone: 'is-super' });
          break;
        case 'cap-guilty':
          m.cap = { active: true, by: session.seat, accused: foe, stage: 'answer', at: Date.now(), result: null, proof: null };
          settleCap(m, 'guilty');
          break;
        case 'cap-legit':
          m.cap = { active: true, by: session.seat, accused: foe, stage: 'judge', at: Date.now(), result: null, proof: null };
          settleCap(m, 'legit');
          break;
        case 'sweep':
          transfer(m, 'pot', session.seat, m.pot, { category: 'pot', log: `DEV: ${me.name} sweeps the pot: %n 🪙.`, tone: 'is-super' });
          break;
        case 'bankrupt':
          transfer(m, session.seat, 'pot', me.tokens, { category: 'ante', log: `DEV: ${me.name} is BANKRUPT.` });
          break;
        case 'reset':
          me.tokens = 50;
          m.pot = 0;
          pushLog(m, 'DEV: wallet back to 50 🪙.', 'is-system');
          break;
        case 'ko':
          if (m[foe]) m[foe].hp = 0;
          checkFaint(m);
          break;
        default:
          break;
      }
    });

    HF.sound.play('select');
  }

  /* ------------------------------------------------------------- auto rival */

  function maybeAutoPlay() {
    if (!state || !state.autoRival || session.seat !== 'a') return;
    if (state.zone !== 'battle' && state.zone !== 'over') return;
    if (busy) return;

    if (state.zone === 'over') {
      if (state.rematch && state.rematch.a && !state.rematch.b && !autoTimer) {
        autoTimer = setTimeout(autoRematch, 1500);
      }
      return;
    }

    const cap = state.cap || {};
    if (cap.active && cap.accused === 'b' && cap.stage === 'answer') {
      if (!autoTimer) autoTimer = setTimeout(autoAnswerCap, 2400);
      return;
    }
    if (state.duel && state.duel.active) {
      const results = state.duel.results || {};
      if (results.b == null && !autoTimer) autoTimer = setTimeout(autoDuel, 2200);
      return;
    }
    if (state.choices && !state.choices.b) {
      if (!autoTimer) autoTimer = setTimeout(autoPick, 1400);
    }
  }

  async function autoAnswerCap() {
    autoTimer = null;
    if (!state || !state.cap || !state.cap.active || state.cap.accused !== 'b') return;
    const showsProof = Math.random() < 0.6;
    busy = true;
    try {
      await publish((m) => {
        if (!m.cap || !m.cap.active) return;
        if (showsProof) {
          m.cap.stage = 'judge';
          m.cap.proof = 'data:image/svg+xml;base64,' + btoa(
            '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="144">' +
            '<rect width="160" height="144" fill="#9bbc0f"/>' +
            '<rect x="8" y="8" width="144" height="128" fill="#8bac0f"/>' +
            '<text x="80" y="70" font-family="monospace" font-size="11" text-anchor="middle" fill="#0f380f">RIVAL PROOF</text>' +
            '<text x="80" y="88" font-family="monospace" font-size="9" text-anchor="middle" fill="#0f380f">HABIT TRACKER</text>' +
            '</svg>'
          );
          const rival = m.cap.accused;
          m.proof = { src: m.cap.proof, pose: 'HABIT TRACKER', by: rival, at: Date.now() };
          pushLog(m, `RIVAL SENT A PHOTO. YOU DECIDE IF IT COUNTS.`, 'is-system');
        } else {
          settleCap(m, 'guilty');
        }
      });
      HF.sound.play(showsProof ? 'select' : 'super');
    } finally {
      busy = false;
      maybeAutoPlay();
    }
  }

  async function autoDuel() {
    autoTimer = null;
    if (!state || !state.duel || !state.duel.active) return;
    busy = true;
    try {
      await publish((m) => {
        if (!m.duel || !m.duel.active) return;
        if (!m.duel.results) m.duel.results = {};
        m.duel.results.b = 180 + Math.floor(Math.random() * 320);
      });
      await resolveDuel();
    } finally {
      busy = false;
    }
  }

  async function autoRematch() {
    autoTimer = null;
    if (!state || state.zone !== 'over' || !state.rematch || state.rematch.b) return;
    busy = true;
    try {
      await publish((m) => {
        if (m.zone !== 'over') return;
        m.rematch.b = true;
        pushLog(m, 'RIVAL ACCEPTS THE REMATCH.', 'is-system');
        m.zone = 'battle';
        m.log = [];
        pushLog(m, 'REMATCH — both trainers agreed. Fresh HP.', 'is-system');
        openBattle(m);
      });
      HF.ui.reviveSprites();
      session.recordedKey = null;
    } finally {
      busy = false;
      maybeAutoPlay();
    }
  }

  async function autoPick() {
    autoTimer = null;
    if (busy || !state || state.zone !== 'battle' || !state.autoRival) return;
    if (state.cap && state.cap.active) return;
    if (state.choices.b) return;

    const foe = state.b;
    if (!foe) return;
    const ids = (foe.moves && foe.moves.length) ? foe.moves : defaultMoves(foe.type);
    const pool = ids.filter((id) => {
      const move = moveById(id);
      const pp = foe.pp[id] == null ? (move ? move.pp : 0) : foe.pp[id];
      return pp > 0;
    });
    const list = pool.length ? pool : ids;
    const moveId = list[Math.floor(Math.random() * list.length)];
    const events = [];

    busy = true;
    try {
      await publish((m) => {
        if (m.zone !== 'battle') return;
        if (m.choices.b) return;
        m.choices.b = moveId;
        const move = moveById(moveId);
        pushLog(m, `${m.b.name} locks in ${move ? move.name : moveId}.`, 'is-system');
        if (m.choices.a && m.choices.b) resolveRound(m, events);
      });
      events.forEach((name) => HF.sound.play(name));
      HF.ui.shake();
    } catch (err) {
      HF.ui.toast('AUTO-RIVAL STALLED', true);
    } finally {
      busy = false;
      const resolved = state && state.zone === 'over';
      if (!resolved) setTimeout(() => maybeAutoPlay(), 400);
    }
  }

  /* ---------------------------------------------------------------------- */
  /* 7. Wiring                                                              */
  /* ---------------------------------------------------------------------- */

  function bind() {
    $('trainer-name').addEventListener('input', (event) => {
      const raw = (event.target.value || 'TRAINER').toUpperCase().slice(0, 10);
      session.name = raw || 'TRAINER';
      if (session.account) {
        session.account.name = session.name;
        saveAccount();
        renderAccountLine();
      }
    });

    $$('#type-pick .type-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        session.type = btn.dataset.type;
        session.pick.type = btn.dataset.type;
        session.pick.moves = [];
        $$('#type-pick .type-btn').forEach((b) => b.classList.toggle('is-active', b === btn));
        HF.sound.play('select');
        if (state && state.zone === 'lobby') {
          buildMovePicker();
          renderLoadout(state);
        }
      });
    });

    $$('#loadout-types .type-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (state && state.zone !== 'lobby') return;
        session.pick.type = btn.dataset.type;
        session.pick.moves = [];
        HF.sound.play('select');
        buildMovePicker();
        if (state) renderLoadout(state);
      });
    });

    $('ld-moves').addEventListener('click', (event) => {
      const btn = event.target.closest('.mv-pick');
      if (btn) pickMoveForLoadout(btn.dataset.mv);
    });

    $('btn-lock').addEventListener('click', lockLoadout);
    $('btn-approve').addEventListener('click', approveLoadout);
    $('btn-reject').addEventListener('click', rejectLoadout);

    $('btn-create').addEventListener('click', createMatch);
    $('btn-howto').addEventListener('click', () => {
      HF.sound.play('select');
      go('howto');
    });
    $('btn-howto-back').addEventListener('click', () => {
      HF.sound.play('select');
      go('title');
    });
    $('btn-history').addEventListener('click', () => {
      HF.sound.play('select');
      renderHistory();
      go('history');
    });
    $('btn-history-back').addEventListener('click', () => {
      HF.sound.play('select');
      go('title');
    });

    $('btn-join').addEventListener('click', joinMatch);
    $('join-code').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') joinMatch();
    });

    $('btn-solo').addEventListener('click', startSolo);
    $('btn-leave').addEventListener('click', () => {
      // Keep the wallet honest when someone walks away mid-match.
      if (state && state[session.seat] && state.zone === 'battle') {
        session.account.tokens = Math.max(0, state[session.seat].tokens || 0);
        saveAccount();
      }
      HF.net.stop();
      session.code = null;
      session.seat = null;
      state = null;
      builtKey = '';
      go('title');
      renderAccountLine();
    });
    $('btn-copy').addEventListener('click', async () => {
      if (!state) return;
      const link = HF.net.inviteLink(state.code);
      try {
        await navigator.clipboard.writeText(link);
        HF.ui.toast('INVITE COPIED');
      } catch (err) {
        HF.ui.toast(link);
      }
    });

    $('moves').addEventListener('click', (event) => {
      const btn = event.target.closest('.move-btn');
      if (btn) pickMove(btn.dataset.move);
    });

    $('btn-proof').addEventListener('click', openCamera);
    $('btn-bluff').addEventListener('click', callCap);

    $$('#ante-pick .type-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        session.ante = Number(btn.dataset.ante) || 3;
        $$('#ante-pick .type-btn').forEach((b) => b.classList.toggle('is-active', b === btn));
        HF.sound.play('select');
      });
    });

    $('btn-dev').addEventListener('click', () => {
      const panel = $('dev-panel');
      const open = panel.hidden;
      panel.hidden = !open;
      $('btn-dev').setAttribute('aria-expanded', open ? 'true' : 'false');
      HF.sound.play('select');
    });
    $$('[data-tok]').forEach((btn) => {
      btn.addEventListener('click', () => tokenLab(btn.dataset.tok));
    });
    $('btn-duel').addEventListener('click', startDuel);
    $('btn-rematch').addEventListener('click', rematch);
    $('btn-focus-tap').addEventListener('click', tapFocus);
    $('btn-receipt').addEventListener('click', () => {
      if (state) HF.receipt.show(state, session.seat);
    });

    $('btn-mute').addEventListener('click', (event) => {
      const muted = HF.sound.toggle();
      event.currentTarget.setAttribute('aria-pressed', muted ? 'true' : 'false');
      event.currentTarget.textContent = muted ? 'OFF' : 'SFX';
    });
    $('btn-mute').setAttribute('aria-pressed', HF.sound.isMuted() ? 'true' : 'false');
    $('btn-mute').textContent = HF.sound.isMuted() ? 'OFF' : 'SFX';

    $$('[data-close]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.close;
        if (id === 'camera') {
          HF.camera.close();
          reopenCapIfOpen();
        } else if (id === 'cap') {
          if (state && state.cap && state.cap.active && state.cap.by === session.seat) {
            answerCap('cancel');
          } else if (state && state.cap && state.cap.active) {
            renderCap(state);
            HF.ui.overlay('cap', true);
          } else {
            HF.ui.overlay('cap', false);
          }
        } else HF.ui.overlay(id, false);
      });
    });

    $('btn-cam-close').addEventListener('click', () => {
      HF.camera.close();
      reopenCapIfOpen();
    });
    $('btn-shutter').addEventListener('click', () => HF.camera.snap());
    $('btn-cam-send').addEventListener('click', () => HF.camera.send());

    $('btn-cap-proof').addEventListener('click', () => {
      HF.ui.overlay('cap', false);
      openCamera();
    });
    $('btn-cap-hit').addEventListener('click', () => answerCap('concede'));
    $('btn-cap-accept').addEventListener('click', () => answerCap('legit'));
    $('btn-cap-reject').addEventListener('click', () => answerCap('reject'));
    $('btn-cap-cancel').addEventListener('click', () => answerCap('cancel'));

    $('btn-receipt-save').addEventListener('click', () => HF.receipt.save());
    $('btn-receipt-close').addEventListener('click', () => HF.ui.overlay('receipt', false));

    // Unlock audio on the first gesture (browsers block autoplay).
    const unlock = () => { HF.sound.play('select'); document.removeEventListener('pointerdown', unlock); };
    document.addEventListener('pointerdown', unlock);
  }

  /* ---------------------------------------------------------------------- */
  /* 8. Boot                                                                */
  /* ---------------------------------------------------------------------- */

  function init() {
    HF.net.init((window.HF_CONFIG && window.HF_CONFIG.firebaseUrl) || '');
    $('net-hint').textContent = HF.net.hint();

    session.account = loadAccount();
    session.name = session.account.name;
    session.type = 'STUDY';
    session.pick = { type: 'STUDY', moves: [] };
    $('trainer-name').value = session.name === 'TRAINER' ? '' : session.name;

    buildMovePicker();
    bind();
    renderAccountLine();
    renderHistory();

    const params = new URLSearchParams((location.hash || '').replace(/^#/, ''));
    const roomCode = params.get('room');

    if (roomCode) {
      $('join-code').value = roomCode.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
      $('trainer-name').focus();
      go('title');
      return;
    }

    // An accidental refresh mid-demo should not cost you your seat.
    const last = localStorage.getItem('hf:last');
    const lastSeat = last ? sessionStorage.getItem('hf:seat:' + last) : null;
    if (last && lastSeat) {
      HF.net.read(last)
        .then((match) => {
          // Rooms from before loadouts existed cannot be played on this build.
          if (!match || !match[lastSeat] || !match.loadout) {
            if (match) {
              try { localStorage.removeItem('hf:last'); } catch (err) { /* private mode */ }
              sessionStorage.removeItem('hf:seat:' + last);
            }
            go('title');
            return;
          }
          session.code = last;
          session.seat = lastSeat;
          const load = match.loadout && match.loadout[lastSeat];
          if (load) session.pick = { type: load.type, moves: load.moves.slice() };
          HF.net.start(last, applyState);
          applyState(match);
        })
        .catch(() => go('title'));
      return;
    }

    go('title');
  }

  /* Exposed for the console and the rule tests: no behaviour change. */
  HF.dev = {
    newMatch, fighter, applyMove, resolveRound, checkFaint, damageFor, beats,
    settleCap, openBattle, transfer, randomLoadout, defaultMoves, verdict,
    moves: MOVES, MAX_HP, LOADOUT_SIZE,
  };

  if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', init);
})(window.HF);
