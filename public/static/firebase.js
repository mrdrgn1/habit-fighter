/* ==========================================================================
   firebase.js  —  Owner: P3 (game logic and sync)
   Keeps the room identical on two devices.

   Three drivers, chosen automatically:
     · "api"      — /api/room/<CODE> on whatever host served this page.
                    The deployed site stores rooms in D1; Flask keeps them in
                    memory. This is what phones use.
     · "firebase" — Firebase Realtime Database REST URL (optional, if you set
                    one in config.js or with ?db=).
     · "local"    — localStorage + BroadcastChannel, used only when there is no
                    API at all (e.g. opening index.html straight from disk).

   Everyone writes the whole room object, which is fine because only one
   trainer can act per turn. Keep it that simple.
   ========================================================================== */

window.HF = window.HF || {};

(function (HF) {
  'use strict';

  const CHANNEL_NAME = 'habit-fighter';
  const ROOM_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const storageKey = (code) => 'hf:room:' + code;

  const net = {
    mode: 'api',
    firebaseUrl: '',
    code: null,
    lastRaw: '',
    degraded: false,

    /**
     * Pick the driver once, at boot.
     * A `?db=<url>` in the address bar wins and is remembered on this device, so
     * a hosted build can be pointed at Firebase without redeploying.
     */
    init(firebaseUrl) {
      let url = (firebaseUrl || '').trim();
      const fromQuery = new URLSearchParams(location.search).get('db');
      try {
        if (fromQuery) {
          localStorage.setItem('hf:firebase', fromQuery);
          url = fromQuery;
        } else {
          url = localStorage.getItem('hf:firebase') || url;
        }
      } catch (err) {
        /* private mode: fall back to whatever config.js said */
      }
      this.firebaseUrl = url.replace(/\/+$/, '');

      // A static mirror (GitHub Pages) has no /api of its own. If config.js
      // names an apiBase, rooms live there instead; otherwise stay local and
      // say so up front rather than failing the first fetch.
      const staticHost = /\.github\.io$/i.test(location.hostname);
      const configured = (window.HF_CONFIG && window.HF_CONFIG.apiBase) || '';
      this.apiBase = staticHost && configured ? String(configured).replace(/\/+$/, '') : '';
      this.mode = this.firebaseUrl ? 'firebase' : staticHost && !this.apiBase ? 'local' : 'api';
      return this.mode;
    },

    hint() {
      if (this.mode === 'firebase') {
        if (this.degraded) return 'FIREBASE UNREACHABLE — CHECK THE DATABASE RULES';
        return 'LIVE MODE · FIREBASE · ANY TWO DEVICES SYNC';
      }
      if (this.mode === 'local') {
        return 'STATIC DEMO · ONE DEVICE · TWO TABS ONLY';
      }
      if (this.apiBase) {
        return 'LIVE MODE · ROOMS VIA THE GAME SERVER · ANY TWO DEVICES SYNC';
      }
      return 'LIVE MODE · SHARED ROOMS ON THIS SITE · ANY TWO DEVICES SYNC';
    },

    newCode() {
      let out = '';
      for (let i = 0; i < 5; i += 1) {
        out += ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)];
      }
      return out;
    },

    /* ------------------------------------------------------------ API driver */

    async apiRead(code) {
      const res = await fetch(`${this.apiBase}/api/room/${code}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('room read ' + res.status);
      const data = await res.json();
      return data.state || null;
    },

    async apiWrite(code, state) {
      const res = await fetch(`${this.apiBase}/api/room/${code}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state),
      });
      if (!res.ok) throw new Error('room write ' + res.status);
    },

    /* ---------------------------------------------------------- local driver */

    localRead(code) {
      const raw = localStorage.getItem(storageKey(code));
      return raw ? JSON.parse(raw) : null;
    },

    localWrite(code, state) {
      localStorage.setItem(storageKey(code), JSON.stringify(state));
      if (this.channel) this.channel.postMessage({ code });
    },

    /** No API on this host (static file, file://): keep going on localStorage. */
    fallBackToLocal(err) {
      if (this.mode !== 'api') return;
      this.mode = 'local';
      this.degraded = true;
      HF.ui.toast('SHARED SYNC OFF — ' + err.message, true);
    },

    /* -------------------------------------------------------------- contract */

    async read(code) {
      if (this.mode === 'firebase') {
        const res = await fetch(`${this.firebaseUrl}/rooms/${code}.json`, { cache: 'no-store' });
        if (!res.ok) throw new Error('firebase read ' + res.status);
        return (await res.json()) || null;
      }
      if (this.mode === 'api') {
        try {
          return await this.apiRead(code);
        } catch (err) {
          this.fallBackToLocal(err);
          return this.localRead(code);
        }
      }
      return this.localRead(code);
    },

    async write(code, state) {
      state.updatedAt = Date.now();

      if (this.mode === 'firebase') {
        const res = await fetch(`${this.firebaseUrl}/rooms/${code}.json`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(state),
        });
        if (!res.ok) throw new Error('firebase write ' + res.status + ' (are your rules in test mode?)');
        this.lastRaw = JSON.stringify(state);
        return;
      }

      if (this.mode === 'api') {
        try {
          await this.apiWrite(code, state);
          this.lastRaw = JSON.stringify(state);
          return;
        } catch (err) {
          this.fallBackToLocal(err);
        }
      }

      this.localWrite(code, state);
      this.lastRaw = JSON.stringify(state);
    },

    /** Read → mutate → write. Returns the state you just saved. */
    async mutate(code, fn) {
      const current = await this.read(code);
      const next = current ? JSON.parse(JSON.stringify(current)) : {};
      fn(next);
      await this.write(code, next);
      return next;
    },

    /* ------------------------------------------------------------ subscription */

    start(code, onState) {
      this.stop();
      this.code = code;
      this.lastRaw = '';
      this.onState = onState;

      if (!this.channel && 'BroadcastChannel' in window) {
        this.channel = new BroadcastChannel(CHANNEL_NAME);
        this.channel.onmessage = (event) => {
          if (event.data && event.data.code === this.code) this.poll();
        };
      }

      const interval = this.mode === 'firebase' ? 1100 : this.mode === 'api' ? 900 : 600;
      this.pollTimer = setInterval(() => this.poll(), interval);
      this.poll();
    },

    async poll() {
      if (!this.code) return;
      try {
        const state = await this.read(this.code);
        if (!state) return;
        const raw = JSON.stringify(state);
        if (raw === this.lastRaw) return;
        this.lastRaw = raw;
        if (this.onState) this.onState(state);
        if (this.degraded && this.mode !== 'local') {
          this.degraded = false;
          HF.ui.toast('SYNC BACK ONLINE');
        }
      } catch (err) {
        if (!this.degraded) {
          this.degraded = true;
          HF.ui.toast('SYNC ERROR — ' + err.message, true);
        }
      }
    },

    stop() {
      if (this.pollTimer) clearInterval(this.pollTimer);
      this.pollTimer = null;
      this.code = null;
    },

    /** Plain invite link: #room=CODE fills the join box on the other phone. */
    inviteLink(code) {
      const base = location.origin + location.pathname;
      return `${base}#room=${code}`;
    },
  };

  net.channel = null;
  net.apiBase = '';
  HF.net = net;
})(window.HF);
