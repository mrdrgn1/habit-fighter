/* ==========================================================================
   receipt.js  —  Owner: P2 (camera and art)
   The Game Boy Printer: turns the match into a paper receipt PNG.
   Layout is DOM + CSS; html2canvas turns it into an image on one line.
   ========================================================================== */

window.HF = window.HF || {};

(function (HF) {
  'use strict';

  const $ = HF.$;
  const esc = (value) =>
    String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
    ));

  let lastCode = '-----';

  function barcode(seed) {
    let h = 0;
    for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    let bars = '';
    for (let i = 0; i < 22; i += 1) {
      h = (h * 1103515245 + 12345) >>> 0;
      const w = 1 + (h % 3);
      bars += `<i style="width:${w}px"></i>`;
    }
    return bars;
  }

  function timeLabel(ts) {
    const d = new Date(ts || Date.now());
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function row(label, value) {
    return `<div class="r-row"><span>${esc(label)}</span><span>${esc(value)}</span></div>`;
  }

  const signed = (n) => (n > 0 ? '+' : '') + n;

  /** Retro flavour for the night's net swing. 0 is a very bad place to be. */
  function tokenVerdict(net, tokens) {
    if (HF.verdict) return HF.verdict(net, tokens);
    if (tokens <= 0) return 'GENERATIONAL DEBT';
    if (net >= 15) return 'HABIT TYCOON';
    if (net >= 8) return 'COMPOUND INTEREST';
    if (net > 0) return 'IN THE GREEN';
    if (net === 0) return 'EXACTLY EVEN';
    return 'IN THE RED';
  }

  const receipt = {
    show(match, seat) {
      if (!match) return;
      lastCode = match.code || '-----';
      const me = match[seat] || {};
      const foe = match[seat === 'a' ? 'b' : 'a'] || {};
      const won = match.zone === 'over' && match.winner === seat;
      const tok = me.tok || {};
      const tokens = me.tokens == null ? 0 : me.tokens;
      const START = me.startTokens == null ? tokens : me.startTokens;
      const net = tokens - START;

      const paper = $('receipt-paper');
      paper.innerHTML = `
        <h3>HABIT FIGHTER</h3>
        <p class="r-sub">GAME BOY PRINTER · No. 0198</p>
        <hr>
        ${row('ROOM', match.code || '-----')}
        ${row('PRINTED', timeLabel(Date.now()))}
        ${row('TRAINER', (me.name || '—') + ' · ' + (me.type || ''))}
        ${row('RIVAL', (foe.name || '—') + ' · ' + (foe.type || ''))}
        <hr>
        <p class="r-win">${match.zone === 'over'
          ? (won ? 'YOU WIN! ★' : 'YOU FAINTED…')
          : 'MATCH IN PROGRESS'}</p>
        ${row('HP LEFT', (me.hp || 0) + ' / ' + (me.maxHp || 0))}
        ${row('HITS LANDED', String(me.hits || 0))}
        ${row('SUPER EFFECTIVE', String(me.supers || 0))}
        ${row('PROOFS SENT', String(me.proofs || 0))}
        ${row('CAP CALLS LEFT', String(me.bluff == null ? 3 : me.bluff))}
        ${row('STATUS', me.status && me.status !== 'none' ? me.status : 'CLEAN')}
        <hr>
        <p class="r-sub">TOKEN LEDGER</p>
        ${row('LOADOUT', (me.moves || []).length + ' MOVES · ' + (me.type || '—'))}
        ${row('STARTING', START + ' 🪙')}
        ${row('ANTE PAID', signed(tok.ante || 0) + ' 🪙')}
        ${row('LOCKED IN COMBOS', signed(tok.combo || 0) + ' 🪙')}
        ${row('CAP VERDICTS', signed(tok.cap || 0) + ' 🪙')}
        ${row('MATCH POT WON', signed(tok.pot || 0) + ' 🪙')}
        ${row('FINAL BALANCE', tokens + ' 🪙')}
        ${row('NET', signed(net) + ' 🪙')}
        <p class="r-win">${esc(tokenVerdict(net, tokens))}</p>
        <hr>
        <p class="r-sub">THANKS FOR PLAYING</p>
        <div class="r-barcode">${barcode(match.code || 'x')}</div>
        <p class="r-foot">TRACK 02 · RETRO REMIX · KCL 2026</p>
      `;
      $('receipt-hint').textContent = 'SAVE PNG to drop the receipt into your submission.';
      HF.ui.overlay('receipt', true);
      HF.sound.play('select');
    },

    async save() {
      const paper = $('receipt-paper');
      const hint = $('receipt-hint');
      if (!window.html2canvas) {
        hint.textContent = 'html2canvas has not loaded — screenshot the receipt instead.';
        return;
      }
      hint.textContent = 'PRINTING…';
      try {
        const canvas = await window.html2canvas(paper, {
          backgroundColor: '#e9e7d3',
          scale: 3,
          useCORS: true,
        });
        const url = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = url;
        link.download = `habit-fighter-${lastCode}.png`;
        link.click();
        hint.textContent = 'PRINTED ✓ receipt downloaded.';
        HF.sound.play('win');
      } catch (err) {
        hint.textContent = 'PRINT JAM: ' + err.message;
      }
    },
  };

  HF.receipt = receipt;
})(window.HF);
