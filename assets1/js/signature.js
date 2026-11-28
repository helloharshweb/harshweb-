/* =========================================================================
   HARSH — SIGNATURE INTRO  (v6.2 "swarm signature")
   Drop-in replacement for assets1/js/signature.js

   Beat sheet (3.56s, then hands the site over):
     0.00s  HUD fades in, cream dust ignites
     0.44s  dust gathers into a rotating 3D swarm sphere + orbit ring
     1.30s  the sphere is crushed to a single point
     1.44s  it bursts outward and the particles spell "×͜× harsh"
     2.32s  dust settles away, the crisp lockup resolves out of it
     2.62s  hairline rule draws under the mark, counter hits 100
     3.04s  everything bursts forward, streaks
     3.30s  bloom of light from the mark as the site comes up
     3.56s  hand off  ➜  document 'harsh:signature-done'

   All the knobs live in CONFIG / T below. Nothing else needs editing.
   ========================================================================= */
(function () {
  'use strict';

  var root = document.documentElement;
  if (!document.getElementById('hx-intro')) { return; }
  var overlay = document.getElementById('hx-intro');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* --------------------------------------------------------------- config */
  var CONFIG = {
    mark: '×͜× harsh',      // sampled into particles, and used for the crisp lockup
    particles: 5200,        // desktop
    particlesMobile: 2200,  // phones / coarse pointers
    cream: '#f0e5c4',       // accent — matches the site's --cream
    brightness: 86,         // base lightness of the dust
    sphere: 0.17,           // swarm sphere radius, fraction of the short edge
    ring: true,             // orbit ring around the sphere
    sparks: false,          // hot motes shed by the ash (off = same look as before, cheaper)
    hud: false,             // corner labels, counter, progress hairline, skip button
    grain: true,            // film grain over the whole intro
    rule: false,            // hairline under the lockup (off)
    crispMark: false,       // false = the wordmark is only particles (no solid text on top)
    outro: 'snap',          // 'snap' = the mark crumbles into ash · 'burst' = light-speed streaks
    flash: true,            // bloom of light at the hand-off (burst outro only)
    pace: 1.22,             // 1 = original speed · >1 slower · <1 faster
    maxFps: 0,              // 0 = unlocked, runs as fast as the display (60/120/240Hz)
    oncePerSession: false,  // true = only the first page view per tab shows it
    sessionKey: 'hx-intro-seen'
  };

  /* timings in ms — scale them all together to make the whole thing faster */
  var T = (CONFIG.outro === 'snap')
    ? {
        swarm: 400,          // the dust finds a shape and starts turning
        flow: 1020,          // the swarm begins pouring into the wordmark
        spread: 620,         // how long that pour takes, particle by particle
        rule: 2000,          // hairline + counter
        snap: 2850,          // the gust arrives
        sweep: 700,          // how long the gust takes to cross the mark
        ashLife: 800,        // how long a flake of ash survives
        end: 3750            // hand-off — starts while the dust is still in the air
      }
    : {
        swarm: 400, flow: 1020, spread: 640, rule: 2000,
        burst: 2500, flash: 2800, end: 3200
      };

  /* one knob slows down (or speeds up) every beat below */
  if (CONFIG.pace && CONFIG.pace !== 1) {
    for (var tk in T) { if (typeof T[tk] === 'number') T[tk] = Math.round(T[tk] * CONFIG.pace); }
  }

  /* ------------------------------------------------------------- hand-off */
  function handOffNow() {
    root.classList.remove('signature-opening', 'swarm-zero');
    document.dispatchEvent(new Event('harsh:signature-done'));
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
  }

  if (!overlay || reduce) { handOffNow(); return; }
  if (!root.classList.contains('signature-opening')) {
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    return;
  }
  if (CONFIG.oncePerSession) {
    try {
      if (sessionStorage.getItem(CONFIG.sessionKey) === '1') { handOffNow(); return; }
      sessionStorage.setItem(CONFIG.sessionKey, '1');
    } catch (e) {}
  }

  /* ------------------------------------------------------------------ dom */
  var canvas = overlay.querySelector('.hx-cv');
  var ctx = canvas ? (canvas.getContext('2d', { alpha: false }) || canvas.getContext('2d')) : null;
  var lock = overlay.querySelector('.hx-lock');
  var rule = overlay.querySelector('.hx-rule');
  var bar = overlay.querySelector('.hx-progress i');
  var ink = null;              // the sampled lockup points (used by the snap outro)
  var _dprFloor = 0, _slow = 0;
  var inkX0 = 0, inkX1 = 1;    // ink bounds in particle space, for the eroding front
  var sparks = [];             // hot motes shed by the front itself
  var sparkAcc = 0;
  var countEl = overlay.querySelector('#hx-count');
  var phaseEl = overlay.querySelector('#hx-phase');
  var flash = overlay.querySelector('.hx-flash');
  var skip = overlay.querySelector('.hx-skip');

  /* the mark split into the two pieces the crisp lockup uses */
  var markText = String(CONFIG.mark);
  var facePart = (markText.match(/^\s*([×xX✕✖✗]{1,2}[^\sA-Za-z0-9]*)/) || [])[1] || '×͜×';
  var namePart = markText.replace(facePart, '').trim() || markText;
  var faceEl = overlay.querySelector('.hx-lock__face');
  var nameEl = overlay.querySelector('.hx-lock__name');
  if (faceEl) faceEl.textContent = facePart.trim();
  if (nameEl) nameEl.textContent = namePart;
  overlay.style.setProperty('--hx-cream', CONFIG.cream);
  if (!CONFIG.crispMark) overlay.classList.add('no-lock');
  if (!CONFIG.hud) overlay.classList.add('no-hud');
  if (!CONFIG.grain) overlay.classList.add('no-grain');

  /* cream → hsl so the dust matches whatever accent you pick */
  var dust = (function (hex) {
    var h = String(hex).replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var r = parseInt(h.slice(0, 2), 16) / 255,
        g = parseInt(h.slice(2, 4), 16) / 255,
        b = parseInt(h.slice(4, 6), 16) / 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    var hue = 0, sat = 0, lig = (mx + mn) / 2;
    if (d) {
      sat = lig > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) hue = (g - b) / d + (g < b ? 6 : 0);
      else if (mx === g) hue = (b - r) / d + 2;
      else hue = (r - g) / d + 4;
      hue *= 60;
    }
    return { h: Math.round(hue), s: Math.round(sat * 100) };
  })(CONFIG.cream);

  /* Colour strings are the expensive part of a 5000-particle frame, so they are
     built once and looked up: 18 lightness bins × 13 alpha bins for the dust,
     and a small ember ramp for the ash. Keeps the loop cheap enough for 240Hz. */
  var DUST_COL = (function () {
    var t = [], li, ai, lum;
    for (li = 0; li < 18; li++) {
      lum = 58 + li * 2.35;
      t[li] = [];
      for (ai = 0; ai <= 12; ai++) {
        t[li][ai] = 'hsla(' + dust.h + ',' + dust.s + '%,' + lum.toFixed(1) + '%,' + (ai / 12).toFixed(3) + ')';
      }
    }
    return t;
  })();
  function dustCol(l, a) {
    var li = l < 58 ? 0 : l > 98 ? 17 : ((l - 58) / 2.35) | 0;
    var ai = a <= 0 ? 0 : a >= 1 ? 12 : (a * 12) | 0;
    return DUST_COL[li][ai];
  }

  var EMBER = (function () {
    var t = [], hb, ab, heat, sat, lm, alpha;
    for (hb = 0; hb < 3; hb++) {
      heat = (hb + 0.5) / 3;
      sat = 6 + 34 * heat;              // fresh dust is warm, old dust is grey
      lm = 46 + 50 * heat;
      t[hb] = [];
      for (ab = 0; ab < 6; ab++) {
        alpha = (ab + 0.5) / 6;
        t[hb][ab] = {
          line: 'hsla(' + dust.h + ',' + sat.toFixed(0) + '%,' + lm.toFixed(0) + '%,' + (alpha * 0.45).toFixed(3) + ')',
          head: 'hsla(' + dust.h + ',' + sat.toFixed(0) + '%,' + Math.min(100, lm + 10).toFixed(0) + '%,' + alpha.toFixed(3) + ')'
        };
      }
    }
    return t;
  })();
  /* same trick for the normal dust: 6 lightness bins × 6 alpha bins */
  var DUST_COLS = (function () {
    var t = [], li, ai, lum;
    for (li = 0; li < 6; li++) {
      lum = 58 + (li + 0.5) * (40 / 6);
      t[li * 6 + ai] = null;
      for (ai = 0; ai < 6; ai++) {
        t[li * 6 + ai] = 'hsla(' + dust.h + ',' + dust.s + '%,' + lum.toFixed(1) + '%,' + ((ai + 0.5) / 6).toFixed(3) + ')';
      }
    }
    return t;
  })();
  var dustPaths = [];                      // one Path2D bucket per dust colour
  var emberPaths = [];                     // one Path2D bucket per ember colour

  /* ---------------------------------------------------------------- engine */
  var PERSP = 1100;
  var W = 0, H = 0, DPR = 1, cx = 0, cy = 0;
  var coarse = window.matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 720;
  var N = Math.max(200, Math.round(coarse ? CONFIG.particlesMobile : CONFIG.particles));
  var P = [];
  var mode = 'dust';
  var rotX = 0, rotY = 0, spin = 0, rotLock = null, trailCur = 0.64;
  var mx = 0, my = 0, smx = 0, smy = 0;
  var done = false, raf = 0, t0 = 0, last = 0;
  var timers = [];
  var ac = ('AbortController' in window) ? new AbortController() : null;
  var sig = ac ? { signal: ac.signal } : {};

  function rnd(a, b) { return a + Math.random() * (b - a); }
  /* 128-point sine table — the per-particle wobble would otherwise be ~10k
     Math.sin calls every frame */
  var SINT = new Float32Array(128);
  for (var si0 = 0; si0 < 128; si0++) SINT[si0] = Math.sin(si0 * 0.049087385);
  function fsin(x) { return SINT[((x * 20.371833) | 0) & 127]; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = (Math.random() * (i + 1)) | 0;
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function at(ms, fn) { timers.push(setTimeout(function () { if (!done) fn(); }, ms)); }

  for (var i = 0; i < N; i++) {
    P.push({
      x: rnd(-1, 1) * innerWidth, y: rnd(-1, 1) * innerHeight, z: rnd(-500, 900),
      vx: 0, vy: 0, vz: 0, tx: 0, ty: 0, tz: 0,
      w: 2.2, size: rnd(0.9, 2.1), l: rnd(78, 92), a: rnd(0.5, 1),
      ph: rnd(0, 6.283), fade: 1,
      /* pre-declared so every particle has one stable shape (no per-frame shape changes) */
      sx: undefined, sy: undefined, sz: undefined, dim: undefined, heat: undefined,
      on: false, ghost: false, detach: 0, life: 0, sw: 0, px: 0, py: 0, bx: 0, by: 0, go: 0
    });
  }

  /* text → points, using the site's own display font */
  var FONT_STACK = (getComputedStyle(root).getPropertyValue('--font-display') || '').trim() ||
    '"Inter Tight","Helvetica Neue",Helvetica,Arial,sans-serif';
  var LOCK_LS = -0.055;   // mirrors .signature-name tracking

  var _sampleCache = null;
  function sampleTextCached(text, maxW, maxH) {
    var key = text + '|' + Math.round(maxW) + '|' + Math.round(maxH);
    if (_sampleCache && _sampleCache.key === key) return _sampleCache.val;
    var v = sampleText(text, maxW, maxH);
    _sampleCache = { key: key, val: v };
    return v;
  }
  function lockBox() {
    return { w: Math.min(W * 0.82, 1180), h: Math.min(H * 0.26, 230) };
  }
  /* do the canvas read + shuffle well before the pour, never during it */
  function warmLock() {
    var b = lockBox();
    var v = sampleTextCached(markText, b.w, b.h);
    if (!v._shuffled) { shuffle(v.pts); v._shuffled = true; }
    return v;
  }

  function sampleText(text, maxW, maxH) {
    var c = document.createElement('canvas');
    var g = c.getContext('2d');
    var probe = 100;
    g.font = '800 ' + probe + 'px ' + FONT_STACK;
    if ('letterSpacing' in g) g.letterSpacing = (LOCK_LS * probe) + 'px';
    var wRef = g.measureText(text).width || 1;
    var fs = Math.min(probe * maxW / wRef, maxH);

    g.font = '800 ' + fs + 'px ' + FONT_STACK;
    if ('letterSpacing' in g) g.letterSpacing = (LOCK_LS * fs) + 'px';
    var tw = g.measureText(text).width;

    c.width = Math.ceil(tw + fs * 0.4);
    c.height = Math.ceil(fs * 1.6);
    g.font = '800 ' + fs + 'px ' + FONT_STACK;
    if ('letterSpacing' in g) g.letterSpacing = (LOCK_LS * fs) + 'px';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#fff';
    g.fillText(text, c.width / 2, c.height / 2);

    var d = g.getImageData(0, 0, c.width, c.height).data;
    var pts = [], step = 2, minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    for (var y = 0; y < c.height; y += step) {
      for (var x = 0; x < c.width; x += step) {
        if (d[(y * c.width + x) * 4 + 3] > 140) {
          var px = x - c.width / 2, py = y - c.height / 2;
          pts.push({ x: px, y: py });
          if (px < minX) minX = px; if (px > maxX) maxX = px;
          if (py < minY) minY = py; if (py > maxY) maxY = py;
        }
      }
    }
    /* re-centre on the ink, not the em box */
    var ox = -(minX + maxX) / 2, oy = -(minY + maxY) / 2;
    for (var j = 0; j < pts.length; j++) { pts[j].x += ox; pts[j].y += oy; }
    return { pts: pts, w: maxX - minX, h: maxY - minY, fs: fs };
  }

  /* --------------------------------------------------------------- targets */
  function assignDust() {
    for (var i = 0; i < N; i++) {
      var p = P[i];
      p.tx = rnd(-W * 0.7, W * 0.7); p.ty = rnd(-H * 0.7, H * 0.7); p.tz = rnd(-700, 700);
      p.w = rnd(1.7, 2.6);
      p.l = rnd(CONFIG.brightness - 14, CONFIG.brightness + 4);
      p.a = rnd(0.25, 0.7);
    }
  }

  function assignSphere(stagger) {
    var R = Math.min(W, H) * CONFIG.sphere;
    var count = Math.floor(N * 0.86);
    var ga = Math.PI * (3 - Math.sqrt(5));
    for (var i = 0; i < N; i++) {
      var p = P[i];
      if (stagger) {
        /* each speck keeps drifting where it was until its own turn comes,
           so the orb condenses out of the dust instead of snapping in */
        p.sx = p.tx; p.sy = p.ty; p.sz = p.tz;
        p.go = T.swarm + rnd(0, 780);
      }
      if (i < count) {
        var y = 1 - (i / (count - 1)) * 2;
        var r = Math.sqrt(Math.max(0, 1 - y * y));
        var th = ga * i;
        p.tx = Math.cos(th) * r * R; p.ty = y * R; p.tz = Math.sin(th) * r * R;
        p.a = rnd(0.32, 0.78);            // dimmer body so the orb doesn't blow out
      } else if (CONFIG.ring) {
        var a = rnd(0, 6.283), rr = R * rnd(1.24, 1.72), tilt = 0.44;
        var x = Math.cos(a) * rr, z = Math.sin(a) * rr, yy = rnd(-5, 5);
        p.tx = x;
        p.ty = yy * Math.cos(tilt) - z * Math.sin(tilt);
        p.tz = yy * Math.sin(tilt) + z * Math.cos(tilt);
        p.a = rnd(0.8, 1);                // ring stays crisp on top of the body
      } else {
        p.tx = rnd(-W * 0.8, W * 0.8); p.ty = rnd(-H * 0.8, H * 0.8); p.tz = rnd(-900, 900);
      }
      p.w = rnd(4.2, 5.6);
      p.l = rnd(CONFIG.brightness - 6, CONFIG.brightness + 10);
      if (p.a === undefined) p.a = rnd(0.5, 1);
    }
  }

  function assignLock(fromSwarm) {
    var s = warmLock();
    ink = s;                     // kept for the snap outro
    if (lock && s.fs) lock.style.fontSize = s.fs + 'px';

    var minX = 1e9, maxX = -1e9, i;
    for (i = 0; i < s.pts.length; i++) {
      if (s.pts[i].x < minX) minX = s.pts[i].x;
      if (s.pts[i].x > maxX) maxX = s.pts[i].x;
    }
    var span = Math.max(1, maxX - minX);

    var use = Math.min(s.pts.length, Math.floor(N * 0.9));
    for (i = 0; i < N; i++) {
      var p = P[i];
      if (i < use) {
        var q = s.pts[i];
        if (fromSwarm) {
          /* remember where it is in the swarm, and when its turn comes */
          p.sx = p.tx; p.sy = p.ty; p.sz = p.tz;
          p.go = T.flow + 30 + ((q.x - minX) / span) * T.spread + rnd(-55, 55);
          /* a sideways kick so it spirals out of the swarm instead of
             shooting in a straight line */
          var dx = q.x - p.x, dy = q.y - p.y;
          var inv = 1 / (Math.sqrt(dx * dx + dy * dy) || 1);
          p.vx += -dy * inv * 330;
          p.vy += dx * inv * 330;
        }
        /* a touch of scatter so the sample grid never reads as a lattice */
        p.tx = q.x + rnd(-1.1, 1.1); p.ty = q.y + rnd(-1.1, 1.1); p.tz = rnd(-14, 14);
        p.l = rnd(CONFIG.brightness, CONFIG.brightness + 12);
        p.a = rnd(0.85, 1);
        p.fade = 1;
        p.ink = true;                         // this one is part of the mark
        p.size = rnd(0.9, 1.9);
      } else {
        var a2 = rnd(0, 6.283), r2 = rnd(700, 1400);
        p.tx = Math.cos(a2) * r2; p.ty = Math.sin(a2) * r2 * 0.55;
        p.tz = rnd(-700, 700); p.w = rnd(1.6, 3.2);
        p.l = rnd(CONFIG.brightness - 26, CONFIG.brightness - 8);
        p.a = rnd(0.12, 0.3);
        p.ink = false;
        if (fromSwarm) { p.sx = p.tx; p.sy = p.ty; p.sz = p.tz; }
      }
    }
  }

  function burst() {
    for (var i = 0; i < N; i++) {
      var p = P[i];
      var d = Math.sqrt(p.x * p.x + p.y * p.y) || 1;
      var s = rnd(600, 1600);
      p.vx = (p.x / d) * s + rnd(-260, 260);
      p.vy = (p.y / d) * s + rnd(-260, 260);
      p.vz = -rnd(1200, 3800);  // toward the camera
    }
  }

  /* ---- SNAP OUTRO ---------------------------------------------------------
     The crisp lockup is wiped away by a soft vertical front travelling left to
     right; exactly at that front the ink "becomes" ash — particles sitting on
     the same sampled points flip on and start curling upward, then fade.
     Nothing flies in or out: the material just crumbles where it stands.
     ---------------------------------------------------------------------- */
  function snapBegin() {
    if (!ink) return;
    var pts = ink.pts, minX = 1e9, maxX = -1e9, i, p, q;
    for (i = 0; i < pts.length; i++) {
      if (pts[i].x < minX) minX = pts[i].x;
      if (pts[i].x > maxX) maxX = pts[i].x;
    }
    var span = Math.max(1, maxX - minX);
    inkX0 = minX; inkX1 = maxX;
    var use = Math.min(pts.length, Math.floor(N * 0.95));

    for (i = 0; i < N; i++) {
      p = P[i];
      p.detach = Infinity;
      /* where it actually is, right now — nothing gets re-placed, nothing
         teleports, z is left alone, so there is no jump at the hand-over */
      p.bx = p.x; p.by = p.y;
      if (i < use) {
        p.on = false;
        /* with no solid text to fall back on, the ink stays lit until its turn
           comes — otherwise the word would vanish the instant the snap starts */
        if (!CONFIG.crispMark) p.a = 1;
        p.dim = 1;
        q = pts[i];
        /* the gust reaches this point at this moment — mostly left to right,
           but with a ragged boundary instead of a straight front */
        var rel = (q.x - minX) / span;
        var rough = 0.5 + 0.5 * Math.sin(q.y * 0.055 + q.x * 0.011);
        p.detach = T.snap + 60 + (rel * 0.88 + rough * 0.12) * T.sweep;
      } else {
        /* spare dust: it just fades out where it stands instead of vanishing */
        p.ghost = true;
      }
    }

    sparks.length = 0; sparkAcc = 0;
    mode = 'snap';
    if (lock && CONFIG.crispMark) lock.classList.add('is-wiping');
    if (rule) rule.classList.add('is-gone');
    setPhase('snap');
  }

  function resize() {
    /* 2x on a big screen means 4x the fill cost for a field this dense,
       which is what made the pour stutter on laptops — cap by area. */
    var wantDpr = Math.min(window.devicePixelRatio || 1, 2);
    var area = (window.innerWidth || 1) * (window.innerHeight || 1);
    if (area > 1100000) wantDpr = Math.min(wantDpr, 1.5);
    if (area > 2200000) wantDpr = Math.min(wantDpr, 1.25);
    DPR = _dprFloor ? Math.min(wantDpr, _dprFloor) : wantDpr;
    W = overlay.clientWidth || innerWidth;
    H = overlay.clientHeight || innerHeight;
    cx = W / 2; cy = H / 2;
    if (canvas) {
      canvas.width = Math.floor(W * DPR);
      canvas.height = Math.floor(H * DPR);
      if (ctx) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = '#050505'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    }
    if (mode === 'swarm') assignSphere(false);
    if (mode === 'flow') assignLock(false);
  }

  /* -------------------------------------------------------------- timeline */
  function setPhase(label) { if (phaseEl) phaseEl.textContent = '[ ' + label + ' ]'; }

  function finish() {
    if (done) return;
    done = true;
    if (skip) skip.tabIndex = -1;
    overlay.classList.add('is-quiet', 'is-out');
    root.classList.remove('signature-opening', 'swarm-zero');
    document.dispatchEvent(new Event('harsh:signature-done'));
    timers.push(setTimeout(function () {
      if (raf) cancelAnimationFrame(raf);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }, 1350));
  }

  function start() {
    warmLock();            // pay the cost now, while there is nothing to see
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { overlay.classList.add('is-hud'); });
    });

    assignDust();
    mode = 'dust';

    at(T.swarm, function () { mode = 'swarm'; assignSphere(true); setPhase('swarm'); warmLock(); });
    at(T.flow, function () {
      /* no crush, no explosion — the swarm simply starts pouring itself into
         the wordmark, particle by particle, left to right */
      mode = 'flow';
      assignLock(true);
      setPhase('signature');
    });
    at(T.rule, function () {
      setPhase('settling');
      if (lock) lock.classList.add('is-in');
      if (CONFIG.rule && rule) {
        var w, rTop;
        if (lock && CONFIG.crispMark) {
          var r = lock.getBoundingClientRect();
          w = Math.max(140, Math.min(r.width, W * 0.7));
          rTop = r.bottom + 18;
        } else if (ink) {
          /* particles only — take the geometry from the sampled ink */
          w = Math.max(140, Math.min(ink.w, W * 0.7));
          rTop = cy + (ink.h || 200) / 2 + 24;
        }
        if (w && rule) {
          rule.style.width = w + 'px';
          rule.style.top = Math.min(rTop, H - 60) + 'px';
          rule.classList.add('is-in');
        }
      }
      if (countEl) countEl.textContent = '100';
      if (bar) bar.style.width = '100%';
    });
    if (CONFIG.outro === 'snap') {
      at(T.snap, snapBegin);
    } else {
      at(T.burst, function () { mode = 'burst'; burst(); setPhase('ready'); });
      if (CONFIG.flash) at(T.flash, function () { if (flash) flash.classList.add('is-on'); });
    }
    at(Math.max(0, T.end - 520), function () {
      overlay.classList.add('is-quiet');       // labels + rule go first
    });
    at(T.end, finish);
  }

  /* ------------------------------------------------------------------ loop */
  var minGap = CONFIG.maxFps > 0 ? (1000 / CONFIG.maxFps) : 0;

  function frame(now) {
    raf = requestAnimationFrame(frame);   // schedule first: we may skip this one
    if (!t0) { t0 = now; last = now; }
    if (minGap && now - last < minGap - 0.5) return;
    var t = now - t0;
    var dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    var f = dt * 60;

    /* if the pour is dropping frames, step the resolution down once and
       keep the motion smooth rather than keep the pixels sharp */
    if (!_dprFloor && (mode === 'swarm' || mode === 'flow')) {
      if (dt > 0.034) { if (++_slow > 10) { _dprFloor = 1; resize(); } }
      else if (_slow > 0) _slow--;
    }

    /* HUD counter + progress */
    var pct;
    if (t < T.flow) pct = (t / T.flow) * 80;
    else if (t < T.rule) pct = 80 + ((t - T.flow) / Math.max(1, T.rule - T.flow)) * 20;
    else pct = 100;
    if (countEl && t < T.rule) countEl.textContent = String(Math.floor(pct)).padStart(3, '0');
    if (bar && t < T.rule) bar.style.width = pct.toFixed(2) + '%';

    /* pointer parallax + rotation */
    smx += (mx - smx) * 0.05 * f;
    smy += (my - smy) * 0.05 * f;

    if (mode === 'dust') { rotY += dt * 0.12; rotX += (-0.1 - rotX) * 0.02 * f; }
    else if (mode === 'swarm') { spin += dt * 1.15; rotY = spin + smx * 0.22; rotX += (0.2 - smy * 0.18 - rotX) * 0.045 * f; }
    else if (mode === 'flow') {
      /* the cloud eases back to dead level, and it arrives at EXACTLY zero
         before the snap — an exponential ease never quite gets there, and the
         leftover fraction of a degree used to snap flat all at once */
      if (!rotLock) rotLock = { y: rotY, x: rotX, t: t };
      var rk = clamp((t - rotLock.t) / Math.max(1, T.rule - rotLock.t - 160), 0, 1);
      var re = 1 - Math.pow(1 - rk, 3);
      rotY = rotLock.y * (1 - re);
      rotX = rotLock.x * (1 - re);
    }
    else { rotY += (smx * 0.16 - rotY) * 0.13 * f; rotX += (-smy * 0.12 - rotX) * 0.13 * f; }

    /* while the ash is falling the mark must stay axis-aligned with the ink */
    if (mode === 'snap') { rotY = 0; rotX = 0; }

    var cY = Math.cos(rotY), sY = Math.sin(rotY), cX = Math.cos(rotX), sX = Math.sin(rotX);

    /* the wipe front on the crisp lockup tracks the ash exactly */
    var frontScr = null, frontOn = 0;
    if (mode === 'snap') {
      var wp = clamp((t - T.snap - 60) / Math.max(1, T.sweep), 0, 1);
      frontOn = (wp > 0 && wp < 1) ? 1 : 0;
      frontScr = cx + inkX0 - 26 + wp * ((inkX1 - inkX0) + 52);
      if (lock && CONFIG.crispMark) {
        lock.style.setProperty('--hx-wipe', (wp * 112).toFixed(2) + '%');
        if (wp >= 1) lock.style.visibility = 'hidden';
      }
    }

    /* clear (full clear while streaking, soft trail elsewhere) */
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    var trailTgt = mode === 'burst' ? 1 : mode === 'snap' ? 0.56 : mode === 'flow' ? 0.72 : 0.64;
    trailCur += (trailTgt - trailCur) * Math.min(1, 0.16 * f);   // no visible step
    ctx.fillStyle = 'rgba(5,5,5,' + trailCur + ')';
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';

    /* hot motes shed by the breaking ink — they live a fraction of a second */
    for (var si = sparks.length - 1; si >= 0; si--) {
      var sp = sparks[si];
      sp.age += dtc;
      if (sp.age >= sp.life) { sparks.splice(si, 1); continue; }
      sp.vy -= 70 * dtc;                                  // heat rises
      sp.vx += Math.sin(sp.age * 11 + sp.ph) * 46 * dtc;
      sp.x += sp.vx * dtc; sp.y += sp.vy * dtc;
    }

    var streak = mode === 'burst';
    var dtc = Math.min(dt, 0.1);
    var zeta = 0.86;                       // a whisper of overshoot keeps it alive
    var sub = Math.max(1, Math.min(3, Math.ceil(dtc / 0.016)));  // stable at any fps
    var h = dtc / sub;

    for (var i = 0; i < N; i++) {
      var p = P[i];

      if (mode === 'burst') {
        var acc = Math.pow(1.7, dtc);
        p.x += p.vx * dtc; p.y += p.vy * dtc; p.z += p.vz * dtc;
        p.vx *= acc; p.vy *= acc; p.vz *= acc;
      } else if (mode === 'snap') {
        /* sits on the ink until the wipe front reaches it, then crumbles */
        if (t >= p.detach) {
          if (!p.on) {
            p.on = true;
            /* it lets go gently — the gust does the rest. The kick is ADDED
               to the drift it already had, so its velocity never jumps. */
            p.vx += rnd(-30, 8); p.vy += rnd(-28, 4); p.vz = rnd(-10, 10);
            p.life = T.ashLife * rnd(0.5, 0.95);   // no two flakes die together
            p.sw = rnd(0.4, 1.6);                  // per-flake offset into the wind
            p.px = p.x; p.py = p.y;
            /* a few hot motes come off the break */
            if (CONFIG.sparks && sparks.length < 320 && Math.random() < 0.12) {
              sparks.push({
                x: p.x, y: p.y,
                vx: rnd(-60, 60), vy: -rnd(40, 170),
                age: 0, life: rnd(0.22, 0.6), sz: rnd(0.7, 1.5),
                ph: rnd(0, 6.283)
              });
            }
          }
          var age = t - p.detach;
          /* THE GUST — one smooth flow field that neighbouring flakes share,
             so they leave in threads and streamers instead of scattering */
          var wvx = -135 + 85 * Math.sin(p.y * 0.0075 + now * 0.00105 + p.sw)
                          + 45 * Math.sin((p.x + p.y) * 0.012 - now * 0.0017);
          var wvy = -270 + 75 * Math.cos(p.x * 0.009 - now * 0.0008 + p.sw * 2)
                          + 45 * Math.sin(p.y * 0.015 + now * 0.0013);
          var ad = 2.2 * dtc; if (ad > 1) ad = 1;   // eased, not yanked
          p.vx += (wvx - p.vx) * ad;
          p.vy += (wvy - p.vy) * ad;
          p.vz += (0 - p.vz) * ad;
          p.px = p.x; p.py = p.y;
          p.x += p.vx * dtc; p.y += p.vy * dtc; p.z += p.vz * dtc;
          /* cream → pale gold → grey, and thin out as it travels */
          p.heat = Math.max(0, 1 - age / 380);
          var k = age / (p.life || T.ashLife);
          p.a = 0.75 * Math.min(1, age / 110) * (k > 0.5 ? Math.max(0, 1 - (k - 0.5) / 0.5) : 1);
        } else {
          /* Not its turn yet. It is still held in place — but by the SAME
             spring that has been holding it all along, so the hand-over from
             the pour is invisible. The air starts pushing it, and the hold
             loosens, well before it lets go. */
          if (p.ghost) p.a = Math.max(0, p.a - dtc * 1.6);
          var lead = p.detach - t;
          var rise = clamp((t - T.snap) / 700, 0, 1);
          var breeze = rise * rise * 34;                    // px/s of drift, growing
          var loosen = lead < 460 ? 1 - lead / 460 : 0;      // the grip gives way first
          var wob = p.ph + now * 0.0011;
          var hx = p.bx + fsin(wob) * 0.8;
          var hy = p.by + fsin(wob * 1.3 + 1.5708) * 0.8;
          var sp2 = 8.6 * (1 - loosen * 0.9);
          var ow2 = sp2 * sp2, dw2 = 2 * zeta * sp2;
          for (var k2 = 0; k2 < sub; k2++) {
            p.vx += (ow2 * (hx - p.x) - dw2 * p.vx - breeze * 0.55) * h;
            p.vy += (ow2 * (hy - p.y) - dw2 * p.vy - breeze * 0.85) * h;
            p.x += p.vx * h; p.y += p.vy * h;
          }
        }
      } else {
        /* ONE stream: until its turn comes a particle keeps orbiting the
           swarm; after it, it pours into its place in the word. No mode
           change, no teleport — just a different target. */
        var going = t >= (p.go || 0);      // one rule for every hand-off in the flow
        var spring = (mode === 'flow' && going) ? 8.6 : p.w;
        var ow = spring * spring, dw = 2 * zeta * spring;
        var wob = p.ph + now * 0.0011;
        var jit = going ? 0.8 : 0.6;
        var tgx = going ? p.tx : (p.sx === undefined ? p.tx : p.sx);
        var tgy = going ? p.ty : (p.sy === undefined ? p.ty : p.sy);
        var tgz = going ? p.tz : (p.sz === undefined ? p.tz : p.sz);
        var tx = tgx + fsin(wob) * jit;
        var ty = tgy + fsin(wob * 1.3 + 1.5708) * jit;
        /* how far from home is it? far = dim and hazy, home = crisp and bright */
        if (mode === 'flow' && going) {
          var ddx = tgx - p.x, ddy = tgy - p.y, dd = ddx * ddx + ddy * ddy;
          p.dim = dd < 900 ? 1 : dd < 12000 ? 1 - (dd - 900) / 11100 * 0.55 : 0.45;
        } else if (p.dim !== undefined) p.dim = 1;
        for (var k = 0; k < sub; k++) {
          p.vx += (ow * (tx - p.x) - dw * p.vx) * h;
          p.vy += (ow * (ty - p.y) - dw * p.vy) * h;
          p.vz += (ow * (tgz - p.z) - dw * p.vz) * h;
          p.x += p.vx * h; p.y += p.vy * h; p.z += p.vz * h;
        }
      }

      if (mode === 'burst') p.a += (p.fade - p.a) * 0.05 * f;

      /* project */
      var x1 = p.x * cY - p.z * sY;
      var z1 = p.x * sY + p.z * cY;
      var y1 = p.y * cX - z1 * sX;
      z1 = p.y * sX + z1 * cX;
      var dz = PERSP + z1;
      if (dz < 24) continue;
      var sc = PERSP / dz;
      var X = cx + x1 * sc, Y = cy + y1 * sc;
      if (X < -40 || X > W + 40 || Y < -40 || Y > H + 40) continue;

      var alpha = clamp(p.a * Math.min(1, sc * 1.1) * (p.dim === undefined ? 1 : p.dim), 0, 1);
      if (alpha < 0.015) continue;
      var lum = p.l;

      if (streak) {
        var bk = 0.042;
        var bx = p.x - p.vx * bk, by = p.y - p.vy * bk, bz = p.z - p.vz * bk;
        var bx1 = bx * cY - bz * sY, bz1 = bx * sY + bz * cY;
        var by1 = by * cX - bz1 * sX; bz1 = by * sX + bz1 * cX;
        var bdz = PERSP + bz1;
        if (bdz < 24) continue;
        var bsc = PERSP / bdz;
        ctx.strokeStyle = dustCol(lum, alpha * 0.85);
        ctx.lineWidth = Math.max(0.6, p.size * sc * 0.8);
        ctx.beginPath();
        ctx.moveTo(X, Y);
        ctx.lineTo(cx + bx1 * bsc, cy + by1 * bsc);
        ctx.stroke();
      } else if (mode === 'snap' && p.on) {
        /* ember: a warm head with a short tail, cooling to grey ash.
           The tails are batched into colour buckets — one stroke per colour. */
        var heat = p.heat === undefined ? 0 : p.heat;
        var hb = heat > 0.66 ? 2 : heat > 0.33 ? 1 : 0;
        var ab = alpha > 0.83 ? 5 : (alpha * 6) | 0;
        var slot = hb * 6 + ab;
        if (p.sw > 1.2) {
          /* only some flakes carry a visible thread — all of them read as hatching */
          var path = emberPaths[slot] || (emberPaths[slot] = new Path2D());
          path.moveTo(X, Y);
          path.lineTo(X - p.vx * sc * 0.010, Y - p.vy * sc * 0.010);
        }
        var sz2 = Math.max(0.9, p.size * sc * (0.95 + 1.0 * heat));
        ctx.fillStyle = EMBER[hb][ab].head;
        ctx.fillRect(X - sz2 / 2, Y - sz2 / 2, sz2, sz2);
      } else {
        /* near-camera specks used to blow up into chunky squares — cap them */
        var sz = Math.max(0.7, Math.min(p.size * sc, 2.9));
        var dl = lum < 58 ? 0 : lum > 98 ? 5 : ((lum - 58) / (40 / 6)) | 0;
        var da = alpha > 0.83 ? 5 : (alpha * 6) | 0;
        var db = dl * 6 + da;
        var dpath = dustPaths[db] || (dustPaths[db] = new Path2D());
        dpath.rect(X - sz / 2, Y - sz / 2, sz, sz);
      }
    }

    /* flush the batched dust quads (one fill per colour bucket) */
    for (var db2 = 0; db2 < dustPaths.length; db2++) {
      if (!dustPaths[db2]) continue;
      ctx.fillStyle = DUST_COLS[db2];
      ctx.fill(dustPaths[db2]);
      dustPaths[db2] = null;
    }

    /* flush the batched ember tails (one stroke per colour bucket) */
    if (mode === 'snap') {
      for (var eb = 0; eb < emberPaths.length; eb++) {
        if (!emberPaths[eb]) continue;
        ctx.strokeStyle = EMBER[(eb / 6) | 0][eb % 6].line;
        ctx.lineWidth = 1.1;
        ctx.lineCap = 'round';            // soft ends: strands, not scratches
        ctx.stroke(emberPaths[eb]);
        emberPaths[eb] = null;
      }
    }

    /* the motes go on last so they read as sparks, not dust */
    for (var sj = 0; sj < sparks.length; sj++) {
      var sk = sparks[sj], kk = sk.age / sk.life;
      var aa = (1 - kk) * 0.95;
      var sl = 96 - 34 * kk;
      ctx.strokeStyle = 'hsla(' + dust.h + ',76%,' + sl + '%,' + (aa * 0.85) + ')';
      ctx.lineWidth = Math.max(0.6, sk.sz);
      ctx.beginPath();
      ctx.moveTo(cx + sk.x, cy + sk.y);
      ctx.lineTo(cx + sk.x - sk.vx * 0.028, cy + sk.y - sk.vy * 0.028);
      ctx.stroke();
      ctx.fillStyle = 'hsla(' + dust.h + ',70%,' + Math.min(100, sl + 6) + '%,' + aa + ')';
      ctx.fillRect(cx + sk.x - sk.sz * 0.5, cy + sk.y - sk.sz * 0.5, sk.sz, sk.sz);
    }

  }

  /* ---------------------------------------------------------------- events */
  if (skip) {
    skip.tabIndex = 0;
    skip.addEventListener('click', function (e) { e.preventDefault(); finish(); });
  }
  overlay.addEventListener('click', function (e) {
    if (e.target.closest('.hx-skip')) return;
    finish();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' || e.key === 'Enter') finish();
  }, sig);
  window.addEventListener('pointermove', function (e) {
    var r = overlay.getBoundingClientRect();
    mx = ((e.clientX - r.left) / Math.max(1, W)) * 2 - 1;
    my = ((e.clientY - r.top) / Math.max(1, H)) * 2 - 1;
  }, ac ? { signal: ac.signal, passive: true } : { passive: true });
  window.addEventListener('resize', function () { _sampleCache = null; resize(); }, sig);

  resize();
  if (ctx) raf = requestAnimationFrame(frame);
  start();
})();
