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

  const receipt = {
    show(match, seat) {
      if (!match) return;
      lastCode = match.code || '-----';
      const me = match[seat] || {};
      const foe = match[seat === 'a' ? 'b' : 'a'] || {};
      const won = match.zone === 'over' && match.winner === seat;
      const verdict = match.jury && match.jury.verdict ? match.jury.verdict : 'NONE';

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
        ${row('BLUFFS LEFT', String(me.bluff == null ? 3 : me.bluff))}
        ${row('JURY VERDICT', verdict)}
        ${row('STATUS', me.status && me.status !== 'none' ? me.status : 'CLEAN')}
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
