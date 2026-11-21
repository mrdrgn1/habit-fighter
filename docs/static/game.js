/* ==========================================================================
   game.js  —  Owner: P3 (game logic and Firebase)
   Room codes, HP sync, damage formula, type matchups, status effects,
   Call Cap + proof, Doomscroll Poison and Focus Duel.

   Everything is plain functions on window.HF. No classes, no framework.
   Rule of thumb: only the trainer whose turn it is writes to the room.
   ========================================================================== */

window.HF = window.HF || {};

(function (HF) {
  'use strict';

  const $ = HF.$;
  const $$ = HF.$$;

  const MAX_HP = 120;

  /* Type wheel: each type beats exactly one other. */
  const BEATS = {
    STUDY: 'LECTURE',
    LECTURE: 'GYM',
    GYM: 'COMMUTE',
    COMMUTE: 'SOCIAL',
    SOCIAL: 'STUDY',
  };

  const STATUS_LABEL = {
    none: '',
    SNOOZE: 'SNOOZE',
    PARALYSIS: 'PARALYSED',
    BURNOUT: 'BURNOUT',
    POISON: 'DOOMSCROLL',
    FRAUD: 'FRAUD',
  };

  /* Six moves, named after places the judges actually go. */
  const MOVES = [
    { id: 'maughan', name: 'MAUGHAN GRIND', type: 'STUDY', power: 26, pp: 8, note: 'STEADY HIT' },
    { id: 'bush', name: '9AM BUSH HOUSE', type: 'COMMUTE', power: 22, pp: 10, effect: { status: 'PARALYSIS', chance: 0.5 }, note: '50% PARALYSED' },
    { id: 'gym', name: 'KCL GYM SESSION', type: 'GYM', power: 28, pp: 6, heal: 6, note: 'HEALS 6 HP' },
    { id: 'lecture', name: 'STRAND LECTURE', type: 'LECTURE', power: 24, pp: 8, effect: { status: 'BURNOUT', chance: 0.45 }, note: '45% BURNOUT' },
    { id: 'allnighter', name: 'ALL-NIGHTER', type: 'STUDY', power: 38, pp: 3, self: { status: 'SNOOZE' }, note: 'SNOOZES YOU' },
    { id: 'sumbar', name: 'SU BAR DECOMP', type: 'SOCIAL', power: 0, pp: 5, heal: 16, cure: true, note: 'HEAL + CURE' },
  ];

  const session = {
    code: null,
    seat: null,
    name: 'TRAINER',
    type: 'STUDY',
    voterId: (function () {
      let id = localStorage.getItem('hf:voter');
      if (!id) {
        id = 'v' + Math.random().toString(36).slice(2, 10);
        localStorage.setItem('hf:voter', id);
      }
      return id;
    })(),
  };

  let state = null;
  let busy = false;
  let currentLayer = 'title';
  let seenCapAt = 0;
  let autoTimer = null;
  let focusStart = 0;
  let focusArmed = false;
  let focusTimer = null;

  const other = (side) => (side === 'a' ? 'b' : 'a');

  /* ---------------------------------------------------------------------- */
  /* 1. State shape                                                         */
  /* ---------------------------------------------------------------------- */

  function fighter(name, type) {
    return {
      name: String(name || 'TRAINER').toUpperCase().slice(0, 10) || 'TRAINER',
      type: type || 'STUDY',
      hp: MAX_HP,
      maxHp: MAX_HP,
      status: 'none',
      statusTurns: 0,
      pp: {},
      hits: 0,
      supers: 0,
      proofs: 0,
      bluff: 3,
      fraud: false,
    };
  }

  function newMatch(code, name, type) {
    const now = Date.now();
    return {
      code,
      createdAt: now,
      updatedAt: now,
      lastActAt: now,
      zone: 'lobby',
      round: 1,
      turn: 'a',
      winner: null,
      autoRival: false,
      log: [],
      proof: null,
      cap: { active: false, by: null, accused: null, at: 0, result: null },
      duel: { active: false, by: null, results: {}, at: 0 },
      a: fighter(name, type),
      b: null,
    };
  }

  function pushLog(match, text, tone) {
    const log = match.log || (match.log = []);
    log.push({ text, tone: tone || 'is-system', at: Date.now() });
    if (log.length > 24) log.splice(0, log.length - 24);
    match.lastActAt = Date.now();
  }

  /* ---------------------------------------------------------------------- */
  /* 2. Rules                                                               */
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
      pushLog(match, `${f.name} took DOOMSCROLL damage (-4 HP)`, 'is-miss');
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
    const alive = sides.filter((s) => dead.indexOf(s) === -1);
    match.winner = alive.length === 1 ? alive[0] : null;

    dead.forEach((s) => pushLog(match, `${match[s].name} FAINTED!`, 'is-miss'));
    if (match.winner) pushLog(match, `${match[match.winner].name} WINS THE MATCH!`, 'is-super');
    else pushLog(match, 'DOUBLE FAINT. NOBODY WINS.', 'is-super');
  }

  /** Out of PP on every move would soft-lock the turn — hand out a second wind. */
  function refillIfEmpty(match, side) {
    const f = match[side];
    if (!f) return;
    const total = MOVES.reduce((sum, move) => sum + (f.pp[move.id] == null ? move.pp : f.pp[move.id]), 0);
    if (total > 0) return;
    MOVES.forEach((move) => { f.pp[move.id] = move.pp; });
    pushLog(match, `${f.name} catches a second wind — PP restored!`, 'is-system');
  }

  function endTurn(match, side) {
    checkFaint(match);
    if (match.zone === 'over') return;
    match.turn = other(side);
    match.round = (match.round || 1) + 1;
    match.lastActAt = Date.now();
    refillIfEmpty(match, match.turn);
  }

  /** The whole turn. Runs on the acting client, then gets published. */
  function resolveMove(match, side, moveId, events) {
    const foeSide = other(side);
    const atk = match[side];
    const def = match[foeSide];
    const move = MOVES.find((entry) => entry.id === moveId);
    if (!atk || !def || !move) return;

    if (atk.status === 'SNOOZE' && Math.random() < 0.35) {
      pushLog(match, `${atk.name} is SNOOZING… turn lost!`, 'is-miss');
      events.push('miss');
      endTurn(match, side);
      return;
    }
    if (atk.status === 'PARALYSIS' && Math.random() < 0.3) {
      pushLog(match, `${atk.name} is PARALYSED! Can't move!`, 'is-miss');
      events.push('miss');
      endTurn(match, side);
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
    endTurn(match, side);
  }

  /* ---------------------------------------------------------------------- */
  /* 3. Sync helpers                                                        */
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
    maybeAutoPlay();
  }

  /** Play sounds on the *other* phone when its HP moves. */
  function detectRemote(prev, next) {
    const me = next[other(session.seat)];
    const mePrev = prev[other(session.seat)];
    const mine = next[session.seat];
    const minePrev = prev[session.seat];

    if (me && mePrev && me.hp < mePrev.hp) {
      HF.ui.hitSprite('foe');
      HF.ui.shake();
      HF.sound.play(me.hp <= 0 ? 'lose' : 'hit');
    }
    if (mine && minePrev && mine.hp < minePrev.hp) {
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
  /* 4. Rendering                                                           */
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
    $('btn-begin').disabled = !(match.a && match.b);
    $('lobby-hint').textContent = match.b
      ? 'Both trainers ready. Hit BEGIN BATTLE.'
      : 'Second trainer scans the QR or opens ' + HF.net.inviteLink(match.code);

    const qr = $('invite-qr');
    if (qr) {
      const link = HF.net.inviteLink(match.code);
      if (qr.dataset.link !== link) {
        qr.dataset.link = link;
        HF.qr.render(qr, link);
      }
    }
  }

  function renderBattle(match) {
    const me = match[session.seat] || {};
    const foe = match[other(session.seat)] || {};

    $('device-room').textContent = 'ROOM ' + match.code;
    $('foe-name').textContent = foe.name || 'RIVAL';
    $('foe-name').nextElementSibling.textContent = foe.type || 'Lv.21';
    $('me-name').textContent = me.name || 'YOU';
    $('me-type').textContent = me.type || 'STUDY';

    HF.ui.setHP('foe', foe.hp || 0, foe.maxHp || MAX_HP);
    HF.ui.setHP('me', me.hp || 0, me.maxHp || MAX_HP);
    HF.ui.setStatus('foe', STATUS_LABEL[foe.status] || '');
    HF.ui.setStatus('me', STATUS_LABEL[me.status] || '');

    const flag = $('turnflag');
    flag.classList.remove('is-rival', 'is-over');
    if (match.zone === 'over') {
      flag.textContent = match.winner === session.seat ? 'VICTORY!' : match.winner ? 'DEFEAT…' : 'DRAW';
      flag.classList.add('is-over');
      HF.ui.faintSprite('foe');
    } else if (match.turn === session.seat) {
      flag.textContent = 'YOUR TURN';
    } else {
      flag.textContent = match.autoRival ? 'RIVAL THINKING…' : "RIVAL'S TURN";
      flag.classList.add('is-rival');
    }

    HF.ui.setText((match.log || []).slice(-3));

    renderMoves(match);
    renderProof(match, me);

    $('bluff-count').textContent = me.bluff == null ? 3 : me.bluff;
    $('btn-bluff').disabled = !me || (me.bluff || 0) <= 0 || match.zone !== 'battle';
    $('btn-duel').disabled = match.zone !== 'battle';
    $('btn-rematch').hidden = match.zone !== 'over';

    maybeCapOverlay(match);
    renderDuel(match);
    maybeAutoPlay();
  }

  function renderMoves(match) {
    const me = match[session.seat];
    const myTurn = match.zone === 'battle' && match.turn === session.seat;
    // You cannot play a move while a cap call against you is unanswered.
    const capped = !!(match.cap && match.cap.active && match.cap.accused === session.seat);

    $$('.move-btn').forEach((btn) => {
      const move = MOVES.find((entry) => entry.id === btn.dataset.move);
      if (!move) return;
      const pp = me && me.pp[move.id] != null ? me.pp[move.id] : move.pp;
      btn.querySelector('.pp').textContent = pp;
      btn.disabled = !myTurn || pp <= 0 || capped;
      btn.classList.toggle('is-used', pp <= 0);
    });
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

  function maybeCapOverlay(match) {
    const cap = match.cap;
    if (!cap) return;

    if (cap.active && cap.at !== seenCapAt) {
      seenCapAt = cap.at;
      renderCap(match);
      HF.ui.overlay('cap', true);
    }
    if (!cap.active && cap.result && !$('cap').hidden) {
      HF.ui.overlay('cap', false);
      HF.ui.toast(
        cap.result === 'proof' ? 'PROOF LANDED — FALSE CALL'
          : cap.result === 'concede' ? 'NO PROOF — -25 HP'
          : 'CALL DROPPED'
      );
    }
  }

  function renderCap(match) {
    const cap = match.cap || {};
    const accused = match[cap.accused] || {};
    const accuser = match[cap.by] || {};
    const iAmAccused = cap.accused === session.seat;
    const src = (match.proof && match.proof.src) || '';

    $('cap-sub').textContent = iAmAccused
      ? `${accuser.name || 'YOUR RIVAL'} says you're capping. Show proof or take the hit.`
      : `You called cap on ${accused.name || 'your rival'}. They have to show proof.`;

    const img = $('cap-img');
    if (src) img.src = src;
    else img.removeAttribute('src');
    $('cap-photo').classList.toggle('is-empty', !src);

    $('btn-cap-proof').hidden = !iAmAccused;
    $('btn-cap-concede').hidden = !iAmAccused;
    $('btn-cap-cancel').hidden = iAmAccused;

    $('cap-hint').textContent = iAmAccused
      ? 'No proof = -25 HP and FRAUD. Proof = your rival loses 15 instead.'
      : 'You cannot play a move until they answer.';
  }

  function renderDuel(match) {
    const duel = match.duel || {};
    const btn = $('btn-focus-tap');
    if (!duel.active) {
      btn.hidden = true;
      focusArmed = false;
      focusStart = 0;
      clearTimeout(focusTimer);
      return;
    }
    const mine = duel.results ? duel.results[session.seat] : null;
    if (mine != null) {
      btn.hidden = false;
      btn.disabled = true;
      btn.textContent = 'FOCUS ' + Math.round(mine) + 'MS · WAITING';
      return;
    }
    btn.hidden = false;
    if (focusArmed) return; // leave WAIT… / TAP NOW! alone while the timer runs
    btn.disabled = false;
    btn.textContent = 'FOCUS DUEL · TAP TO ARM';
    void match;
  }

  /* ---------------------------------------------------------------------- */
  /* 5. Actions                                                             */
  /* ---------------------------------------------------------------------- */

  async function createMatch() {
    try {
      const code = HF.net.newCode();
      const match = newMatch(code, session.name, session.type);
      pushLog(match, `${match.a.name} opens a match. Pick your moves carefully.`, 'is-system');
      await HF.net.write(code, match);
      session.seat = 'a';
      session.code = code;
      sessionStorage.setItem('hf:seat:' + code, 'a');
      localStorage.setItem('hf:last', code);
      HF.net.start(code, applyState);
      go('lobby');
      renderLobby(match);
      state = match;
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
        m.b = fighter(session.name, session.type);
        m.zone = 'lobby';
        pushLog(m, `${m.b.name} joins the match.`, 'is-system');
      });
      session.seat = 'b';
      session.code = code;
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

  async function beginBattle() {
    if (!state) return;
    if (!state.a || !state.b) {
      HF.ui.toast('NEED A RIVAL FIRST — OR USE SOLO DEMO', true);
      return;
    }
    await publish((m) => {
      m.zone = 'battle';
      m.turn = 'a';
      m.round = 1;
      m.log = [];
      pushLog(m, `${m.a.name} (${m.a.type}) VS ${m.b.name} (${m.b.type})`, 'is-system');
      pushLog(m, 'Snap a PROOF after every move. CALL BLUFF if it smells.', 'is-system');
    });
    HF.sound.play('join');
  }

  async function startSolo() {
    if (!state) return;
    const types = ['STUDY', 'GYM', 'SOCIAL'].filter((t) => t !== state.a.type);
    await publish((m) => {
      m.b = fighter('RIVAL', types[Math.floor(Math.random() * types.length)]);
      m.autoRival = true;
      m.zone = 'battle';
      m.turn = 'a';
      m.log = [];
      pushLog(m, `SOLO DEMO — ${m.b.name} (${m.b.type}) steps up. AUTO-RIVAL ON.`, 'is-system');
    });
    HF.ui.toast('AUTO-RIVAL ON · one person can demo both sides');
  }

  /** New round on the same room: everyone keeps their name, type and code. */
  async function rematch() {
    if (!state || state.zone !== 'over') return;
    await publish((m) => {
      ['a', 'b'].forEach((side) => {
        const f = m[side];
        if (!f) return;
        f.hp = f.maxHp;
        f.status = 'none';
        f.statusTurns = 0;
        f.pp = {};
        f.hits = 0;
        f.supers = 0;
        f.proofs = 0;
        f.bluff = 3;
        f.fraud = false;
      });
      m.zone = 'battle';
      m.winner = null;
      m.turn = 'a';
      m.round = 1;
      m.log = [];
      m.proof = null;
      m.cap = { active: false, by: null, accused: null, at: 0, result: null };
      m.duel = { active: false, by: null, results: {}, at: 0 };
      pushLog(m, 'REMATCH — HP, PP and statuses reset.', 'is-system');
    });
    HF.ui.reviveSprites();
    HF.sound.play('join');
  }

  async function act(moveId) {
    if (busy || !state || state.zone !== 'battle') return;
    if (state.turn !== session.seat) {
      HF.ui.toast('WAIT FOR YOUR TURN');
      return;
    }
    if (state.cap && state.cap.active && state.cap.accused === session.seat) {
      HF.ui.toast('ANSWER THE CAP CALL FIRST', true);
      renderCap(state);
      HF.ui.overlay('cap', true);
      return;
    }
    const me = state[session.seat];
    const move = MOVES.find((entry) => entry.id === moveId);
    if (!me || !move) return;
    const pp = me.pp[moveId] == null ? move.pp : me.pp[moveId];
    if (pp <= 0) {
      HF.ui.toast('NO PP LEFT ON THAT MOVE', true);
      return;
    }

    busy = true;
    const events = [];
    try {
      await publish((m) => resolveMove(m, session.seat, moveId, events));
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
      HF.ui.toast('PROOF OPENS ONCE THE BATTLE STARTS', true);
      return;
    }
    HF.camera.open({
      onCapture: async (shot) => {
        try {
          await publish((m) => {
            m.proof = { src: shot.src, pose: shot.pose, by: session.seat, at: shot.at };
            const me = m[session.seat];
            me.proofs = (me.proofs || 0) + 1;
            pushLog(m, `PROOF SENT — ${shot.pose} ✓`, 'is-system');
            // Proof answers an open cap call on the spot: no jury, no vote.
            if (m.cap && m.cap.active && m.cap.accused === session.seat) {
              settleCap(m, 'proof');
            }
          });
          HF.ui.toast('PROOF LOGGED · ' + shot.pose);
          HF.sound.play('heal');
        } catch (err) {
          HF.ui.toast('PROOF FAILED TO SYNC', true);
        }
      },
    });
  }

  /* ----------------------------------------------------------------- jury */

  /**
   * Settles an open cap call in place.
   *   proof   → the accused produced evidence: the accuser eats 15.
   *   concede → no evidence: the accused eats 25 and is flagged FRAUD.
   *   cancel  → the accuser backs out, nobody is hurt.
   */
  function settleCap(m, kind) {
    const cap = m.cap || {};
    if (!cap.active) return;
    const accuser = m[cap.by];
    const accused = m[cap.accused];

    cap.active = false;
    cap.result = kind;
    cap.at = Date.now();

    if (kind === 'proof' && accuser) {
      accuser.hp = Math.max(0, accuser.hp - 15);
      pushLog(m, `PROOF LANDED — ${accuser.name} called it wrong (-15 HP).`, 'is-hit');
    } else if (kind === 'concede' && accused) {
      accused.hp = Math.max(0, accused.hp - 25);
      accused.status = 'FRAUD';
      accused.statusTurns = 3;
      accused.fraud = true;
      pushLog(m, `NO PROOF — ${accused.name} was capping (-25 HP, FRAUD).`, 'is-super');
    } else if (accuser) {
      pushLog(m, `${accuser.name} drops the call. No damage.`, 'is-system');
    }

    if (m.proof) m.proof.capResult = kind;
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

    await publish((m) => {
      const mine = m[session.seat];
      const foeSide = other(session.seat);
      mine.bluff = Math.max(0, (mine.bluff || 0) - 1);
      m.cap = { active: true, by: session.seat, accused: foeSide, at: Date.now(), result: null };
      pushLog(m, `${mine.name} CALLS CAP! ${m[foeSide].name} must show proof.`, 'is-super');
    });

    HF.sound.play('poison');
    if (state.cap) seenCapAt = state.cap.at;
    renderCap(state);
    HF.ui.overlay('cap', true);
  }

  async function answerCap(kind) {
    if (!state || !state.cap || !state.cap.active) return;
    if (kind === 'cancel' && state.cap.by !== session.seat) return;
    if (kind !== 'cancel' && state.cap.accused !== session.seat) return;

    await publish((m) => settleCap(m, kind));
    HF.ui.overlay('cap', false);
    HF.ui.toast(kind === 'concede' ? 'YOU TOOK THE HIT · -25 HP' : 'CALL DROPPED');
    HF.sound.play(kind === 'concede' ? 'miss' : 'select');
  }

  /** Closing the camera without a photo must not strand an open cap call. */
  function reopenCapIfOpen() {
    if (state && state.cap && state.cap.active && state.cap.accused === session.seat) {
      renderCap(state);
      HF.ui.overlay('cap', true);
    }
  }

  /* ------------------------------------------------------------ focus duel */

  async function startDuel() {
    if (!state || state.zone !== 'battle') return;
    await publish((m) => {
      m.duel = { active: true, by: session.seat, results: {}, at: Date.now() };
      pushLog(m, 'FOCUS DUEL! Tap FOCUS, wait for TAP NOW, then tap.', 'is-system');
    });
    HF.ui.toast('FOCUS DUEL STARTED · fastest reaction wins');
    armFocus();
  }

  function armFocus() {
    if (focusArmed) return;
    if (!state || !state.duel || !state.duel.active) return;
    if (state.duel.results[session.seat] != null) return;

    focusArmed = true;
    const btn = $('btn-focus-tap');
    btn.hidden = false;
    btn.disabled = true;
    btn.textContent = 'WAIT…';
    focusStart = 0;

    clearTimeout(focusTimer);
    focusTimer = setTimeout(() => {
      focusStart = performance.now();
      btn.disabled = false;
      btn.textContent = 'TAP NOW!';
      HF.sound.play('select');
    }, 1200 + Math.random() * 2400);
  }

  async function tapFocus() {
    if (!state || !state.duel || !state.duel.active) return;
    if (!focusStart) {
      // first tap arms the reaction test — both trainers need this
      armFocus();
      return;
    }
    const ms = performance.now() - focusStart;
    focusStart = 0;
    focusArmed = false;
    $('btn-focus-tap').disabled = true;
    $('btn-focus-tap').textContent = 'FOCUS ' + Math.round(ms) + 'MS';

    await publish((m) => {
      if (!m.duel.results) m.duel.results = {};
      m.duel.results[session.seat] = Math.round(ms);
    });
    HF.sound.play('hit');
    await resolveDuel();
  }

  async function resolveDuel() {
    const duel = state && state.duel;
    if (!duel || !duel.active) return;
    if (duel.results.a == null || duel.results.b == null) return;

    await publish((m) => {
      const d = m.duel;
      d.active = false;
      const loserSide = d.results.a <= d.results.b ? 'b' : 'a';
      const winnerSide = other(loserSide);
      const loser = m[loserSide];
      loser.hp = Math.max(0, loser.hp - 12);
      loser.status = 'SNOOZE';
      loser.statusTurns = 3;
      pushLog(m, `FOCUS DUEL: ${m[winnerSide].name} reacts faster (${d.results[winnerSide]}ms)`, 'is-super');
      pushLog(m, `${loser.name} takes 12 HP and falls asleep.`, 'is-hit');
      checkFaint(m);
    });
    HF.sound.play('super');
  }

  /* ---------------------------------------------------------- doomscroll */

  let hiddenAt = 0;
  async function onVisibility() {
    if (document.hidden) {
      hiddenAt = Date.now();
      return;
    }
    if (!hiddenAt) return;
    const away = Date.now() - hiddenAt;
    hiddenAt = 0;
    if (away < 4000 || !state || state.zone !== 'battle' || !session.code) return;
    if (!state[session.seat]) return;

    HF.sound.play('poison');
    HF.ui.toast('DOOMSCROLL POISON! You left the battle for ' + Math.round(away / 1000) + 's', true);
    try {
      await publish((m) => {
        const me = m[session.seat];
        me.hp = Math.max(0, me.hp - 6);
        me.status = 'POISON';
        me.statusTurns = 3;
        pushLog(m, `DOOMSCROLL POISON! ${me.name} tabbed out for ${Math.round(away / 1000)}s (-6 HP)`, 'is-miss');
        checkFaint(m);
      });
    } catch (err) {
      /* offline: the poison will land next time we sync */
    }
  }

  /* ------------------------------------------------------------- auto rival */

  function maybeAutoPlay() {
    if (!state || !state.autoRival || state.zone !== 'battle') return;
    if (session.seat !== 'a') return;
    if (state.cap && state.cap.active && state.cap.accused !== session.seat) {
      if (!autoTimer) autoTimer = setTimeout(autoAnswerCap, 2600);
      return;
    }
    if (state.turn === session.seat || busy) return;
    if (autoTimer) return; // one rival brain, one timer
    autoTimer = setTimeout(autoPlay, 1500);
  }

  /** In SOLO DEMO the rival answers its own cap call, so the demo never sticks. */
  async function autoAnswerCap() {
    autoTimer = null;
    if (!state || !state.cap || !state.cap.active) return;
    const kind = Math.random() < 0.55 ? 'proof' : 'concede';
    busy = true;
    try {
      await publish((m) => settleCap(m, kind));
      HF.ui.toast(kind === 'proof' ? 'RIVAL SHOWED PROOF · FALSE CALL' : 'RIVAL HAD NO PROOF');
      HF.sound.play(kind === 'proof' ? 'miss' : 'super');
    } finally {
      busy = false;
      maybeAutoPlay();
    }
  }

  async function autoPlay() {
    autoTimer = null;
    if (busy || !state || state.zone !== 'battle' || !state.autoRival) return;
    if (state.turn === session.seat) return;

    const foeSide = other(session.seat);
    const foe = state[foeSide];
    if (!foe) return;

    const pool = MOVES.filter((move) => (foe.pp[move.id] == null ? move.pp : foe.pp[move.id]) > 0);
    const list = pool.length ? pool : MOVES;
    const move = list[Math.floor(Math.random() * list.length)];
    const events = [];

    busy = true;
    try {
      await publish((m) => resolveMove(m, foeSide, move.id, events));
      events.forEach((name) => HF.sound.play(name));
      HF.ui.shake();
    } catch (err) {
      HF.ui.toast('AUTO-RIVAL STALLED', true);
    } finally {
      busy = false;
      maybeAutoPlay();
    }
  }

  /* ---------------------------------------------------------------------- */
  /* 6. Wiring                                                              */
  /* ---------------------------------------------------------------------- */

  function buildMoves() {
    const wrap = $('moves');
    wrap.innerHTML = '';
    MOVES.forEach((move) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn move-btn';
      btn.dataset.move = move.id;
      btn.innerHTML =
        `<span class="mv-name">${move.name}</span>` +
        `<span class="mv-meta">${move.type} · PP <span class="pp">${move.pp}</span></span>` +
        `<span class="mv-note">${move.note}</span>`;
      wrap.appendChild(btn);
    });
  }

  function bind() {
    $('trainer-name').addEventListener('input', (event) => {
      session.name = (event.target.value || 'TRAINER').toUpperCase();
    });

    $$('.type-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        session.type = btn.dataset.type;
        $$('.type-btn').forEach((b) => b.classList.toggle('is-active', b === btn));
        HF.sound.play('select');
      });
    });

    $('btn-create').addEventListener('click', createMatch);
    $('btn-howto').addEventListener('click', () => {
      HF.sound.play('select');
      go('howto');
    });
    $('btn-howto-back').addEventListener('click', () => {
      HF.sound.play('select');
      go('title');
    });
    $('btn-join').addEventListener('click', joinMatch);
    $('join-code').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') joinMatch();
    });

    $('btn-begin').addEventListener('click', beginBattle);
    $('btn-solo').addEventListener('click', startSolo);
    $('btn-leave').addEventListener('click', () => {
      HF.net.stop();
      session.code = null;
      session.seat = null;
      state = null;
      go('title');
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
      if (btn) act(btn.dataset.move);
    });

    $('btn-proof').addEventListener('click', openCamera);
    $('btn-bluff').addEventListener('click', callCap);
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
        }
        else HF.ui.overlay(id, false);
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
    $('btn-cap-concede').addEventListener('click', () => answerCap('concede'));
    $('btn-cap-cancel').addEventListener('click', () => answerCap('cancel'));

    $('btn-receipt-save').addEventListener('click', () => HF.receipt.save());
    $('btn-receipt-close').addEventListener('click', () => HF.ui.overlay('receipt', false));

    document.addEventListener('visibilitychange', onVisibility);

    // Unlock audio on the first gesture (browsers block autoplay).
    const unlock = () => { HF.sound.play('select'); document.removeEventListener('pointerdown', unlock); };
    document.addEventListener('pointerdown', unlock);
  }

  /* ---------------------------------------------------------------------- */
  /* 7. Boot                                                                */
  /* ---------------------------------------------------------------------- */

  function init() {
    HF.net.init((window.HF_CONFIG && window.HF_CONFIG.firebaseUrl) || '');
    $('net-hint').textContent = HF.net.hint();

    buildMoves();
    bind();

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
          if (!match || !match[lastSeat]) {
            go('title');
            return;
          }
          session.code = last;
          session.seat = lastSeat;
          HF.net.start(last, applyState);
          applyState(match);
        })
        .catch(() => go('title'));
      return;
    }

    go('title');
  }

  /* Exposed for the console and the stress harness: no behaviour change. */
  HF.dev = { newMatch, fighter, resolveMove, endTurn, checkFaint, damageFor, beats, MOVES, MAX_HP };

  document.addEventListener('DOMContentLoaded', init);
})(window.HF);
