/*
 * Auto tour: once the page has fully loaded, the key inserts itself into the
 * lock (same as a tap), the invitation opens, and the page scrolls slowly from
 * top to bottom.
 *
 * - Any user interaction (wheel, touch, click, key) pauses the scroll; it
 *   resumes after RESUME_AFTER_MS of inactivity.
 * - It stays paused while the guest is typing in the RSVP form.
 * - Music cannot autoplay without a real tap (browser rule), so it starts on
 *   the guest's first touch/click/key press instead.
 */
(function () {
  "use strict";

  var START_DELAY_MS = 1200;   // pause after full load before the key turns
  var SCROLL_DELAY_MS = 1800;  // pause after the invitation opens before scrolling
  var RESUME_AFTER_MS = 5000;  // resume auto-scroll after user stops interacting
  var SPEED_DESKTOP = 70;      // px per second
  var SPEED_MOBILE = 55;       // px per second

  var reduceMotion = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function $(sel) { return document.querySelector(sel); }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function waitFor(test, timeoutMs) {
    return new Promise(function (resolve) {
      var t0 = Date.now();
      (function check() {
        if (test()) return resolve(true);
        if (Date.now() - t0 > timeoutMs) return resolve(false);
        setTimeout(check, 100);
      })();
    });
  }

  function pageLoaded() {
    return new Promise(function (resolve) {
      if (document.readyState === "complete") resolve();
      else window.addEventListener("load", function () { resolve(); }, { once: true });
    }).then(function () {
      return document.fonts && document.fonts.ready ? document.fonts.ready : null;
    });
  }

  // React attaches its handlers during hydration; clicking before that does nothing.
  function isHydrated(el) {
    if (!el) return false;
    for (var k in el) if (k.indexOf("__reactProps") === 0) return true;
    return false;
  }

  /* ---------------- music on first real gesture ---------------- */
  var musicTried = false;
  function startMusicOnce() {
    if (musicTried) return;
    musicTried = true;
    var btn = $(".music-toggle-btn");
    if (btn && btn.classList.contains("is-paused")) btn.click();
  }

  /* ---------------- slow auto-scroll ---------------- */
  var scrolling = false, paused = false, resumeTimer = null, lastTs = 0, pos = 0, rafId = 0;

  function atBottom() {
    var max = document.documentElement.scrollHeight - window.innerHeight;
    return window.scrollY >= max - 2;
  }

  function formFocused() {
    var a = document.activeElement;
    return a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName);
  }

  function step(ts) {
    if (!scrolling) return;
    if (paused || formFocused()) { lastTs = 0; rafId = requestAnimationFrame(step); return; }
    if (!lastTs) { lastTs = ts; pos = window.scrollY; }
    var dt = Math.min(ts - lastTs, 100) / 1000;
    lastTs = ts;
    var speed = window.innerWidth < 768 ? SPEED_MOBILE : SPEED_DESKTOP;
    pos += speed * dt;
    window.scrollTo({ top: pos, left: 0, behavior: "instant" });
    if (atBottom()) return stopScroll();
    rafId = requestAnimationFrame(step);
  }

  function startScroll() {
    if (scrolling || atBottom()) return;
    scrolling = true; paused = false; lastTs = 0;
    document.documentElement.style.scrollBehavior = "auto";
    rafId = requestAnimationFrame(step);
  }

  function stopScroll() {
    scrolling = false;
    cancelAnimationFrame(rafId);
    clearTimeout(resumeTimer);
    document.documentElement.style.scrollBehavior = "";
    removeUserListeners();
  }

  function onUserInteract() {
    startMusicOnce();
    if (!scrolling) return;
    paused = true;
    clearTimeout(resumeTimer);
    resumeTimer = setTimeout(function () {
      if (atBottom()) return stopScroll();
      paused = false; lastTs = 0;
    }, RESUME_AFTER_MS);
  }

  var userEvents = ["wheel", "touchstart", "mousedown", "keydown"];
  function addUserListeners() {
    userEvents.forEach(function (ev) {
      window.addEventListener(ev, onUserInteract, { passive: true });
    });
  }
  function removeUserListeners() {
    userEvents.forEach(function (ev) {
      window.removeEventListener(ev, onUserInteract, { passive: true });
    });
  }

  /* ---------------- run ---------------- */
  addUserListeners();

  pageLoaded()
    .then(function () { return wait(START_DELAY_MS); })
    .then(function () {
      return waitFor(function () { return isHydrated($(".lock-button")); }, 15000);
    })
    .then(function () {
      var site = $("main.site");
      var lock = $(".lock-button");
      if (site && lock && !site.classList.contains("is-unlocking") &&
          !site.classList.contains("is-open")) {
        lock.click(); // key slides in and turns, same as a tap
      }
      return waitFor(function () {
        var s = $("main.site");
        return s && s.classList.contains("is-open");
      }, 20000);
    })
    .then(function (opened) {
      if (!opened || reduceMotion) return;
      return wait(SCROLL_DELAY_MS).then(startScroll);
    });
})();
