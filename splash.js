/* Recipe Book — welcome splash controller (vanilla, drop-in)
 *
 * Markup it expects (see splash.html / README):
 *   <div id="rbSplash" class="rb-splash"> ... </div>
 *
 * Public API (window.recipeSplash):
 *   recipeSplash.show()              -> show / reset the splash
 *   recipeSplash.ready()             -> play the "done" reveal, then fade out
 *   recipeSplash.setTone(name)       -> 'warm' | 'playful' | 'minimal'
 *   recipeSplash.setAccent(name)     -> 'coral' | 'sage' | 'gold'
 *
 * Typical use in app.js:
 *   // splash is visible on page load (markup is in index.html)
 *   await loadEverything();
 *   window.recipeSplash.ready();     // reveal + fade out
 *
 * Demo / fallback: if nothing calls ready() within AUTO_REVEAL_MS, it reveals
 * on its own so the user never gets stuck on the loader.
 *
 * Calls made before this script's own init() has run (e.g. a fast-resolving
 * cached auth session calling ready() before DOMContentLoaded, since the
 * Firebase module script that triggers it runs before DOMContentLoaded but
 * splash.js's own init() is deferred to DOMContentLoaded) are queued and
 * replayed once init() completes, so the reveal sequence is never skipped.
 */
(function () {
  var AUTO_REVEAL_MS = 6000;    // safety net; set to Infinity to disable
  var MIN_VISIBLE_MS = 1100;    // guarantee the loading state is actually seen
  var DONE_TEXT = 'Your kitchen is ready';

  var TONES = {
    warm:    ['Gathering your recipes', 'Folding in your collections', 'Setting the table'],
    playful: ['Preheating the oven', 'Whisking it all together', 'Almost plated'],
    minimal: ['Loading your kitchen', 'Syncing your recipes', 'Just a moment'],
  };
  var ACCENTS = { coral: '#e27c6c', sage: '#bbe183', gold: '#d8b96f' };

  var root, steam, check, statusEl;
  var tone = 'warm', idx = 0, phase = 'loading';
  var cycleT, fadeT, autoT, hideT, minWaitT;
  var initialized = false;
  var pending = [];
  // Best proxy for "first visible" — this script runs right after the splash
  // markup (first child of <body>) has been parsed, well before any later
  // script or DOMContentLoaded. show() resets this on subsequent reveals.
  var shownAt = Date.now();

  function $(sel) { return root ? root.querySelector(sel) : null; }
  function phrases() { return TONES[tone] || TONES.warm; }

  // Defers a call until init() has wired up the DOM refs, so nothing silently
  // no-ops if it's invoked while the document is still being parsed.
  function whenReady(fn) {
    return function () {
      var args = arguments;
      if (!initialized) { pending.push(function () { fn.apply(null, args); }); return; }
      fn.apply(null, args);
    };
  }

  function setStatus(text) {
    if (!statusEl) return;
    statusEl.style.opacity = '0';
    clearTimeout(fadeT);
    fadeT = setTimeout(function () {
      if (statusEl) { statusEl.textContent = text; statusEl.style.opacity = '1'; }
    }, 280);
  }

  function startCycle() {
    clearInterval(cycleT);
    cycleT = setInterval(function () {
      if (phase !== 'loading') return;
      idx = (idx + 1) % phrases().length;
      setStatus(phrases()[idx]);
    }, 2400);
  }

  var show = whenReady(function () {
    if (!root) return;
    phase = 'loading';
    idx = 0;
    shownAt = Date.now();
    clearTimeout(autoT); clearTimeout(hideT); clearTimeout(minWaitT);
    root.classList.remove('rb-splash-hidden');
    if (steam) steam.style.opacity = '1';
    if (check) {
      check.style.opacity = '0';
      var p = check.querySelector('path');
      if (p) { p.style.animation = 'none'; p.style.strokeDashoffset = '40'; }
    }
    if (statusEl) statusEl.textContent = phrases()[0];
    startCycle();
    if (isFinite(AUTO_REVEAL_MS)) autoT = setTimeout(ready, AUTO_REVEAL_MS);
  });

  var ready = whenReady(function () {
    if (phase !== 'loading') return;

    // Don't let a too-fast resolution (e.g. a cached/instant auth session)
    // cut the animation short before the user has had a chance to see it.
    var elapsed = Date.now() - shownAt;
    if (elapsed < MIN_VISIBLE_MS) {
      clearTimeout(minWaitT);
      minWaitT = setTimeout(ready, MIN_VISIBLE_MS - elapsed);
      return;
    }

    phase = 'done';
    clearTimeout(autoT);
    setStatus(DONE_TEXT);
    if (steam) steam.style.opacity = '0';
    if (check) {
      check.style.opacity = '1';
      var p = check.querySelector('path');
      if (p) p.style.animation = 'rbRingCheck .5s ease .2s forwards';
    }
    hideT = setTimeout(function () {
      if (root) root.classList.add('rb-splash-hidden');
    }, 1500);
  });

  var setTone = whenReady(function (name) {
    tone = TONES[name] ? name : 'warm';
    idx = 0;
    if (phase === 'loading') setStatus(phrases()[0]);
  });
  var setAccent = whenReady(function (name) {
    if (root) root.style.setProperty('--rb-accent', ACCENTS[name] || ACCENTS.coral);
  });

  function init() {
    root = document.getElementById('rbSplash');
    if (!root) return;
    steam = $('.rb-splash-steam');
    check = $('.rb-splash-check');
    statusEl = $('.rb-splash-status');
    if (statusEl) statusEl.textContent = phrases()[0];
    initialized = true;
    startCycle();
    if (isFinite(AUTO_REVEAL_MS)) autoT = setTimeout(ready, AUTO_REVEAL_MS);

    // Replay anything that was called before we were ready (e.g. ready()
    // fired by a fast auth resolution before DOMContentLoaded).
    var queued = pending;
    pending = [];
    queued.forEach(function (fn) { fn(); });
  }

  window.recipeSplash = { show: show, ready: ready, setTone: setTone, setAccent: setAccent };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
