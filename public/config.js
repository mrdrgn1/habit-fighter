/* Habit Fighter configuration — the only file you edit to go multi-device.

   firebaseUrl: a Firebase Realtime Database URL in TEST MODE, for example
       "https://habit-fighter-default-rtdb.firebaseio.com"

   Leave it as "" to run in LOCAL mode: two tabs, one device, zero setup.
   You can also set it per device without editing this file by opening
       https://your-site/?db=https://your-db.firebaseio.com
   once — the URL is remembered in localStorage on that device.          */

window.HF_CONFIG = {
  firebaseUrl: "",

  /* Only used when the page is served from somewhere with no room server of
     its own (GitHub Pages). Those builds call the production API instead, so a
     static copy still syncs two phones. Leave it alone for the real deploy. */
  apiBase: "https://habit-fighter-1ev30m.freebuff.site",
};
