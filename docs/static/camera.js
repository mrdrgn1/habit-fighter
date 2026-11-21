/* ==========================================================================
   camera.js  —  Owner: P2 (camera and art)
   The Game Boy Camera: getUserMedia -> 160x144 canvas -> 4-shade dither.
   The filter is ~30 lines of maths, everything else is plumbing.
   ========================================================================== */

window.HF = window.HF || {};

(function (HF) {
  'use strict';

  const $ = HF.$;

  /* DMG palette, darkest -> lightest */
  const PALETTE = [
    [15, 56, 15],
    [48, 98, 48],
    [139, 172, 15],
    [155, 188, 15],
  ];

  /* 4x4 Bayer matrix: the dither that makes it look like 1989 hardware. */
  const BAYER = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
  ];

  /* Random poses — so an old photo from the camera roll can't be reused. */
  const POSES = [
    'PEACE SIGN',
    'THUMBS UP',
    'HOLD UP 2 FINGERS',
    'TOUCH YOUR LEFT EAR',
    'POINT AT YOUR NOTES',
    'BOTH HANDS UP',
    'ONE EYEBROW RAISED',
  ];

  const W = 160;
  const PHOTO_H = 120; // 144 total minus the 24px timestamp strip

  const canvas = $('cam-canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const work = document.createElement('canvas');
  work.width = W;
  work.height = PHOTO_H;
  const wctx = work.getContext('2d', { willReadFrequently: true });
  const video = $('cam-video');

  let stream = null;
  let raf = 0;
  let live = false;
  let frozen = null;
  let pose = '';
  let onCapture = null;
  let openedAt = 0;

  const pad = (n) => String(n).padStart(2, '0');

  function stamp() {
    const d = new Date();
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} · KCL26`;
  }

  /** Luminance -> Bayer-dithered -> 4 DMG shades. */
  function quantize(imageData) {
    const d = imageData.data;
    for (let y = 0; y < PHOTO_H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const i = (y * W + x) * 4;
        const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        const dither = (BAYER[y % 4][x % 4] / 16 - 0.5) * 48;
        const v = Math.max(0, Math.min(255, (lum - 128) * 1.22 + 128 + dither));
        const colour = PALETTE[v < 64 ? 0 : v < 128 ? 1 : v < 192 ? 2 : 3];
        d[i] = colour[0];
        d[i + 1] = colour[1];
        d[i + 2] = colour[2];
      }
    }
  }

  /** Photo on top, timestamp strip at the bottom — like a real Game Boy print. */
  function compose() {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(work, 0, 0);

    ctx.fillStyle = '#9bbc0f';
    ctx.fillRect(0, PHOTO_H, W, 24);
    ctx.fillStyle = '#0f380f';
    ctx.fillRect(0, PHOTO_H, W, 2);

    ctx.textBaseline = 'top';
    ctx.font = '8px monospace';
    ctx.fillText(stamp(), 5, PHOTO_H + 5);
    ctx.font = '7px monospace';
    ctx.fillText(pose, 5, PHOTO_H + 14);
  }

  function drawFrame() {
    if (!live || !video.videoWidth) {
      if (live) raf = requestAnimationFrame(drawFrame);
      return;
    }

    // cover-crop into 160x120
    const ratio = W / PHOTO_H;
    let sw = video.videoWidth;
    let sh = video.videoHeight;
    if (sw / sh > ratio) sw = sh * ratio;
    else sh = sw / ratio;
    const sx = (video.videoWidth - sw) / 2;
    const sy = (video.videoHeight - sh) / 2;

    wctx.save();
    wctx.translate(W, 0);
    wctx.scale(-1, 1); // mirror, like every front camera ever
    wctx.drawImage(video, sx, sy, sw, sh, 0, 0, W, PHOTO_H);
    wctx.restore();

    const frame = wctx.getImageData(0, 0, W, PHOTO_H);
    quantize(frame);
    wctx.putImageData(frame, 0, 0);
    compose();

    raf = requestAnimationFrame(drawFrame);
  }

  function drawWaiting() {
    ctx.fillStyle = '#9bbc0f';
    ctx.fillRect(0, 0, W, 144);
    ctx.fillStyle = '#0f380f';
    ctx.textAlign = 'center';
    ctx.font = '8px monospace';
    ctx.fillText('STARTING', W / 2, 58);
    ctx.fillText('CAMERA…', W / 2, 74);
    ctx.font = '7px monospace';
    ctx.fillText('ALLOW THE PROMPT', W / 2, 96);
    ctx.textAlign = 'left';
  }

  function drawFallback(error) {
    live = false;
    cancelAnimationFrame(raf);
    ctx.fillStyle = '#9bbc0f';
    ctx.fillRect(0, 0, W, 144);
    ctx.fillStyle = '#0f380f';
    ctx.fillRect(0, 0, W, 144);
    ctx.fillStyle = '#9bbc0f';
    ctx.fillRect(4, 4, W - 8, 136);

    ctx.fillStyle = '#0f380f';
    ctx.textAlign = 'center';
    ctx.font = '8px monospace';
    ctx.fillText('NO CAMERA', W / 2, 42);
    ctx.fillText('SIGNAL', W / 2, 56);
    ctx.font = '7px monospace';
    ctx.fillText('DEMO FRAME', W / 2, 78);
    ctx.fillText(stamp(), W / 2, 96);

    // static noise bars
    for (let i = 0; i < 7; i += 1) {
      ctx.fillRect(16 + i * 18, 112 + (i % 2) * 6, 12, 4);
    }
    ctx.textAlign = 'left';

    const el = $('cam-error');
    el.hidden = false;
    el.textContent =
      'CAMERA BLOCKED (' + (error && error.name ? error.name : 'NO DEVICE') + '). ' +
      'Needs HTTPS or localhost. A demo frame will be sent instead.';
    frozen = null;
  }

  async function open(options) {
    const opts = options || {};
    onCapture = opts.onCapture || null;
    pose = opts.pose || POSES[Math.floor(Math.random() * POSES.length)];
    frozen = null;
    openedAt = Date.now();

    $('cam-pose').textContent = 'POSE: ' + pose;
    $('cam-error').hidden = true;
    $('btn-shutter').hidden = false;
    $('btn-shutter').disabled = false;
    $('btn-cam-send').hidden = true;
    HF.ui.overlay('camera', true);
    drawWaiting();

    // If the permission prompt is ignored forever, fall back instead of hanging.
    const giveUp = setTimeout(() => {
      if (!live) drawFallback({ name: 'PERMISSION TIMEOUT' });
    }, 5000);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('getUserMedia unavailable');
      }
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      video.srcObject = stream;
      await video.play();
      clearTimeout(giveUp);
      live = true;
      drawFrame();
    } catch (err) {
      clearTimeout(giveUp);
      drawFallback(err);
    }
  }

  function snap() {
    if (live) {
      live = false;
      cancelAnimationFrame(raf);
      compose();
    }
    frozen = canvas.toDataURL('image/png');
    $('btn-shutter').hidden = true;
    $('btn-cam-send').hidden = false;
    HF.sound.play('capture');
  }

  function close() {
    live = false;
    cancelAnimationFrame(raf);
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }
    video.srcObject = null;
    HF.ui.overlay('camera', false);
  }

  function send() {
    if (!frozen) {
      snap();
      return;
    }
    const payload = { src: frozen, pose, at: Date.now(), latency: Date.now() - openedAt };
    close();
    if (onCapture) onCapture(payload);
  }

  HF.camera = { open, close, snap, send, POSES };
})(window.HF);
