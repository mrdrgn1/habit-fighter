/* Small wrapper around the vendored qrcode-generator (public/static/qrcode.js).
 * Renders a crisp SVG QR into an element; used for the jury link so judges can
 * scan instead of typing a URL with a code in it. */

window.HF = window.HF || {};

(function (HF) {
  'use strict';

  HF.qr = {
    render(el, text) {
      if (!el) return false;
      el.innerHTML = '';

      if (typeof qrcode !== 'function') {
        el.textContent = 'QR UNAVAILABLE';
        return false;
      }

      try {
        const qr = qrcode(0, 'M'); // 0 = pick the smallest version that fits
        qr.addData(text);
        qr.make();
        el.innerHTML = qr.createSvgTag({
          cellSize: 4,
          margin: 1,
          scalable: true,
          alt: 'Jury link',
        });
        return true;
      } catch (err) {
        el.textContent = 'QR ERROR';
        return false;
      }
    },
  };
})(window.HF);
