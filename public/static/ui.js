/* ==========================================================================
   ui.js  —  Owner: P1 (battle UI and look)
   Small rendering primitives + the square-wave sound engine.
   No framework: everything here is a plain function on window.HF.ui.
   ========================================================================== */

window.HF = window.HF || {};

(function (HF) {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const $$ = (sel, root) => [...(root || document).querySelectorAll(sel)];

  /* ---------------------------------------------------------------------- */
  /* 1. Sound — Web Audio API square waves, no audio files                  */
  /* ---------------------------------------------------------------------- */

  let ctx = null;

  function audio() {
    if (!ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      ctx = new AudioCtx();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  /** One square-wave blip with a short attack/release so it never clicks. */
  function tone(freq, dur, when = 0, type = 'square', gain = 0.05, slideTo = null) {
    const ac = audio();
    if (!ac) return;
    const t0 = ac.currentTime + when;
    const osc = ac.createOscillator();
    const amp = ac.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t0 + dur);

    amp.gain.setValueAtTime(0.0001, t0);
    amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    osc.connect(amp).connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  const SFX = {
    select: () => { tone(520, 0.05); tone(760, 0.06, 0.05); },
    hit: () => { tone(200, 0.1, 0, 'square', 0.06, 90); tone(120, 0.08, 0.06, 'square', 0.05); },
    super: () => { tone(240, 0.07); tone(360, 0.07, 0.07); tone(540, 0.09, 0.14); tone(720, 0.12, 0.22); },
    miss: () => tone(180, 0.14, 0, 'triangle', 0.05, 80),
    heal: () => { tone(523, 0.06); tone(659, 0.06, 0.06); tone(784, 0.1, 0.12); },
    poison: () => { tone(300, 0.06); tone(240, 0.06, 0.07); tone(170, 0.14, 0.14, 'square', 0.06, 90); },
    capture: () => { tone(980, 0.03, 0, 'square', 0.04); tone(1400, 0.05, 0.04, 'square', 0.035); },
    // coin: two bright steps up, the classic "got it" blip.
    coin: () => { tone(1046, 0.045, 0, 'square', 0.05); tone(1568, 0.09, 0.05, 'square', 0.045); },
    coinDown: () => { tone(784, 0.05, 0, 'square', 0.045); tone(523, 0.1, 0.05, 'square', 0.04); },
    win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, i * 0.14, 'square', 0.055)),
    lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.2, i * 0.16, 'square', 0.05)),
    join: () => { tone(400, 0.06); tone(600, 0.08, 0.07); tone(900, 0.12, 0.14); },
    error: () => { tone(160, 0.12, 0, 'sawtooth', 0.04); tone(120, 0.16, 0.12, 'sawtooth', 0.04); },
  };

  let muted = localStorage.getItem('hf:muted') === '1';

  const sound = {
    play(name) {
      if (muted) return;
      const fn = SFX[name];
      if (fn) fn();
    },
    isMuted: () => muted,
    toggle() {
      muted = !muted;
      localStorage.setItem('hf:muted', muted ? '1' : '0');
      if (!muted) sound.play('select');
      return muted;
    },
  };

  /* ---------------------------------------------------------------------- */
  /* 2. Screen primitives                                                   */
  /* ---------------------------------------------------------------------- */

  const layers = {
    title: $('layer-title'),
    howto: $('layer-howto'),
    history: $('layer-history'),
    lobby: $('layer-lobby'),
    battle: $('layer-battle'),
  };

  function showLayer(name) {
    Object.entries(layers).forEach(([key, el]) => {
      if (el) el.classList.toggle('is-active', key === name);
    });
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  }

  function overlay(id, open) {
    const el = $(id);
    if (!el) return;
    el.hidden = !open;
    el.classList.toggle('is-open', !!open);
    document.body.style.overflow = open ? 'hidden' : '';
  }

  const toastEl = $('toast');
  let toastTimer = null;
  function toast(message, isError = false) {
    toastEl.textContent = message;
    toastEl.classList.toggle('is-error', isError);
    toastEl.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('is-visible'), 2600);
  }

  function shake() {
    const lcd = $('lcd');
    if (!lcd) return;
    lcd.classList.remove('is-shaking');
    void lcd.offsetWidth; // restart the animation
    lcd.classList.add('is-shaking');
    setTimeout(() => lcd.classList.remove('is-shaking'), 340);
  }

  function hitSprite(which) {
    const el = which === 'foe' ? $('foe-sprite') : $('me-sprite');
    if (!el) return;
    el.classList.remove('is-hit');
    void el.offsetWidth;
    el.classList.add('is-hit');
    setTimeout(() => el.classList.remove('is-hit'), 540);
  }

  function faintSprite(which) {
    const el = which === 'foe' ? $('foe-sprite') : $('me-sprite');
    if (el) el.classList.add('is-fainted');
  }

  function reviveSprites() {
    ['foe-sprite', 'me-sprite'].forEach((id) => {
      const el = $(id);
      if (el) el.classList.remove('is-fainted');
    });
  }

  /** HP bar + number for one side. */
  function setHP(side, hp, maxHp) {
    const bar = $(side === 'foe' ? 'foe-hp' : 'me-hp');
    const num = $(side === 'foe' ? 'foe-hpnum' : 'me-hpnum');
    const pct = Math.max(0, Math.min(100, (hp / maxHp) * 100));
    bar.style.width = pct + '%';
    bar.classList.toggle('is-low', pct <= 25);
    num.textContent = `${Math.max(0, hp)}/${maxHp}`;
  }

  function setStatus(side, label) {
    const el = $(side === 'foe' ? 'foe-status' : 'me-status');
    el.textContent = label || '';
    el.classList.toggle('is-on', !!label);
  }

  /**
   * Text box: newest at the bottom, old entries dimmed. Short screens (a phone
   * with browser chrome) only get room for the two newest entries, so those go
   * into the bottom slots and the top one stays empty.
   */
  function setText(lines) {
    const compact = window.matchMedia('(max-height: 800px)').matches;
    const picked = compact ? lines.slice(-2) : lines.slice(-3);
    const slots = compact ? [2, 3] : [1, 2, 3];
    [1, 2, 3].forEach((i) => {
      const el = $('line-' + i);
      el.textContent = '';
      el.className = 'line';
    });
    slots.forEach((slot, idx) => {
      const entry = picked[idx];
      if (!entry) return;
      const el = $('line-' + slot);
      el.textContent = entry.text;
      el.className = 'line' + (entry.tone ? ' ' + entry.tone : '');
    });
  }

  HF.$ = $;
  HF.$$ = $$;
  HF.ui = { showLayer, overlay, toast, shake, hitSprite, faintSprite, reviveSprites, setHP, setStatus, setText };
  HF.sound = sound;
})(window.HF);
