/* ============================================================
   ×͜×  — burning
   A continuous flame on the real glyph: buoyancy, drag, a noise
   flow field, temperature-based colour, and motion blur.
   No dependencies.
   ============================================================ */
(function () {
  'use strict';

  var REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var DPR = Math.min(1.5, window.devicePixelRatio || 1);   // a soft glow doesn't need 2x pixels

  /* while the page is being scrolled the flame eases to ~9fps and goes back to
     full speed the moment scrolling stops — scrolling stays smooth, the flame
     looks identical at rest */
  var scrolling = false, scrollTimer = 0;
  window.addEventListener('scroll', function () {
    scrolling = true;
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(function () { scrolling = false; }, 160);
  }, { passive: true });
  var FALLBACK = '\u00d7\u035c\u00d7';          // ×͜×
  var FIX_SMILE = true;                        // draw the smile ourselves, dead centre
  var BLINK = true;                            // the crosses blink, every few seconds
  var TARGET = '.topbar__logo .glyph';                       // which marks burn
                                               // '.topbar__logo .glyph' = header only

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  /* ---------------- fire palette: temperature → colour ---------------- */
  var RAMP = [
    [0.00,   2,   6,  26],
    [0.10,   8,  28,  96],
    [0.24,  14,  66, 190],
    [0.40,  26, 118, 255],
    [0.56,  62, 172, 255],
    [0.72, 118, 212, 255],
    [0.88, 186, 238, 255],
    [1.00, 244, 253, 255]
  ];
  function ramp(h) {
    if (h <= 0) return [RAMP[0][1], RAMP[0][2], RAMP[0][3]];
    for (var i = 1; i < RAMP.length; i++) {
      if (h <= RAMP[i][0]) {
        var a = RAMP[i - 1], b = RAMP[i], t = (h - a[0]) / (b[0] - a[0] || 1);
        return [
          Math.round(a[1] + (b[1] - a[1]) * t),
          Math.round(a[2] + (b[2] - a[2]) * t),
          Math.round(a[3] + (b[3] - a[3]) * t)
        ];
      }
    }
    var l = RAMP[RAMP.length - 1];
    return [l[1], l[2], l[3]];
  }

  var NS = 20;
  var SPRITES = (function () {
    var arr = [], i, c, s, g, grd;
    for (i = 0; i < NS; i++) {
      c = ramp(i / (NS - 1));
      s = document.createElement('canvas');
      s.width = s.height = 32;
      g = s.getContext('2d');
      grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
      grd.addColorStop(0,    'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',1)');
      grd.addColorStop(0.22, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',0.80)');
      grd.addColorStop(0.50, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',0.26)');
      grd.addColorStop(0.78, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',0.05)');
      grd.addColorStop(1,    'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, 32, 32);
      arr.push(s);
    }
    return arr;
  })();

  /* ---------------- a small smooth noise field, generated once ---------------- */
  var NZ = 64, NOISE = new Float32Array(NZ * NZ);
  (function () {
    var g = [], i, x, y;
    for (i = 0; i < NZ * NZ; i++) NOISE[i] = Math.random();
    /* two blur passes so the field is smooth, not white */
    for (var pass = 0; pass < 2; pass++) {
      g = new Float32Array(NZ * NZ);
      for (y = 0; y < NZ; y++) {
        for (x = 0; x < NZ; x++) {
          var s = 0;
          for (var dy = -1; dy <= 1; dy++)
            for (var dx = -1; dx <= 1; dx++)
              s += NOISE[((y + dy + NZ) % NZ) * NZ + ((x + dx + NZ) % NZ)];
          g[y * NZ + x] = s / 9;
        }
      }
      NOISE = g;
    }
    var mn = 1, mx = 0;
    for (i = 0; i < NOISE.length; i++) { if (NOISE[i] < mn) mn = NOISE[i]; if (NOISE[i] > mx) mx = NOISE[i]; }
    for (i = 0; i < NOISE.length; i++) NOISE[i] = (NOISE[i] - mn) / (mx - mn || 1);
  })();
  function noise2(x, y) {
    var xi = Math.floor(x), yi = Math.floor(y);
    var fx = x - xi, fy = y - yi;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    var x0 = ((xi % NZ) + NZ) % NZ, x1 = (x0 + 1) % NZ;
    var y0 = ((yi % NZ) + NZ) % NZ, y1 = (y0 + 1) % NZ;
    var a = NOISE[y0 * NZ + x0], b = NOISE[y0 * NZ + x1];
    var c = NOISE[y1 * NZ + x0], d = NOISE[y1 * NZ + x1];
    return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy;
  }

  /* ---------------- what does the mark say? ---------------- */
  function readMark(el) {
    if (el.querySelector('.hx-x')) return '\u00d7\u00d7';    // split for blinking
    var cs = window.getComputedStyle(el, '::before');
    var txt = (cs.content || '').replace(/^["']|["']$/g, '');
    if (!txt || txt === 'none' || txt === 'normal') txt = FALLBACK;
    return txt;
  }
  function markFont(el) {
    var cs = window.getComputedStyle(el, '::before');
    return (cs.fontStyle || 'normal') + ' ' + (cs.fontWeight || '600') + ' ' +
           (cs.fontSize || '16px') + ' ' + (cs.fontFamily || 'sans-serif');
  }

  /* draw the mark's text exactly where the browser puts it: each × is its own
     element, so use that element's real box + the font's real baseline.
     (centring by ink would sit the mask/sparks a few px off the visible crosses) */
  function fillMark(g, el, cw, ch) {
    var xs = el.querySelectorAll('.hx-x');
    if (xs.length) {
      g.textBaseline = 'alphabetic';
      for (var i = 0; i < xs.length; i++) {
        var sp = xs[i], cs = getComputedStyle(sp), fs = parseFloat(cs.fontSize) || 16;
        g.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
        var m = g.measureText(sp.textContent);
        var fa = m.fontBoundingBoxAscent, fd = m.fontBoundingBoxDescent;
        if (fa == null) { fa = fs * 0.9; fd = fs * 0.25; }
        var lh = parseFloat(cs.lineHeight); if (!(lh > 0)) lh = fa + fd;
        g.fillText(sp.textContent, sp.offsetLeft, sp.offsetTop + (lh - (fa + fd)) / 2 + fa);
      }
      return;
    }
    g.font = markFont(el);
    g.textBaseline = 'alphabetic';
    var mt = g.measureText(readMark(el));
    var asc = mt.actualBoundingBoxAscent || 10, desc = mt.actualBoundingBoxDescent || 3;
    g.fillText(readMark(el), (cw - mt.width) / 2, (ch - (asc + desc)) / 2 + asc);
  }

  /* ---------------- sample the ink of the real glyph ---------------- */
  function drawFaceInk(g, w, h) {
    var k = Math.min(w / 36, h / 19), ox = (w - 36 * k) / 2, oy = (h - 19 * k) / 2;
    g.save();
    g.translate(ox, oy); g.scale(k, k);
    g.strokeStyle = '#000'; g.lineWidth = 2.8; g.lineCap = 'round';
    var seg = [[6.3, 3.5, 13.7, 10.9], [13.7, 3.5, 6.3, 10.9],
               [22.3, 3.5, 29.7, 10.9], [29.7, 3.5, 22.3, 10.9]];
    g.beginPath();
    for (var i = 0; i < seg.length; i++) { g.moveTo(seg[i][0], seg[i][1]); g.lineTo(seg[i][2], seg[i][3]); }
    g.stroke();
    g.beginPath(); g.moveTo(7.2, 12.3); g.quadraticCurveTo(18, 18.7, 28.8, 12.3); g.stroke();
    g.restore();
  }

  function sampleInk(el, w, h) {
    var cw = Math.max(4, Math.ceil(w)), ch = Math.max(4, Math.ceil(h));
    var c = document.createElement('canvas');
    c.width = cw; c.height = ch;
    var g = c.getContext('2d');
    if (el.querySelector('.hxface__svg')) {
      drawFaceInk(g, cw, ch);
    } else {
      fillMark(g, el, cw, ch);
    }
    var data = g.getImageData(0, 0, cw, ch).data;
    var pts = [], x, y;
    for (y = 0; y < ch; y++) {
      for (x = 0; x < cw; x++) {
        if (data[(y * cw + x) * 4 + 3] > 110) pts.push(x + 0.5, y + 0.5);
      }
    }
    if (!pts.length) for (y = 1; y < ch; y += 2) for (x = 1; x < cw; x += 2) pts.push(x, y);
    return { pts: pts, cw: cw, ch: ch };
  }

  /* ---------------- the smile, drawn (the font's is never centred) ---------------- */
  function ensureSmile(el) {
    var s = el.querySelector('.hx-smile');
    if (!s) {
      s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      s.setAttribute('class', 'hx-smile');
      s.setAttribute('aria-hidden', 'true');
      s.setAttribute('overflow', 'visible');
      var pth = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      pth.setAttribute('fill', 'none');
      pth.setAttribute('stroke', 'currentColor');
      pth.setAttribute('stroke-linecap', 'round');
      s.appendChild(pth);
      el.appendChild(s);
    }
    return s;
  }

  /* the arc the fire should burn on, in element-local px */
  function smileGeom(bbox, w, h) {
    var left = bbox.x0, right = bbox.x1, top = bbox.y0, bot = bbox.y1;
    var sw = (right - left), sh = (bot - top) || h * 0.3;
    /* the crosses decide where the face is; the smile is centred under them,
       twice as wide as before, and sitting well below their baseline */
    var WIDE = 0.56;               // smile width, as a multiple of the cross span (unchanged)
    var LOW = 0.30;                // how far below the crosses it starts
    var DEEP = 0.19;               // how deep the curve is
    var cx2 = (left + right) / 2;
    var x0 = cx2 - (sw * WIDE) / 2, x1 = cx2 + (sw * WIDE) / 2;
    var y0 = bot + sh * LOW;
    var dip = sh * DEEP;
    var cx = (x0 + x1) / 2;
    return { x0: x0, x1: x1, y0: y0, cy: y0 + dip * 2, cx: cx2, lw: Math.max(0.85, sh * 0.125) };
  }

  function drawSmile(svg, g) {
    svg.setAttribute('viewBox', '0 0 ' + Math.ceil(g.x1 + g.lw) + ' ' + Math.ceil(g.cy));
    svg.setAttribute('width', Math.ceil(g.x1 + g.lw));
    svg.setAttribute('height', Math.ceil(g.cy));
    svg.style.left = '0px';
    svg.style.top = '0px';
    var pth = svg.firstChild;
    pth.setAttribute('d', 'M' + g.x0.toFixed(2) + ' ' + g.y0.toFixed(2) +
                          'Q' + g.cx.toFixed(2) + ' ' + g.cy.toFixed(2) +
                          ' ' + g.x1.toFixed(2) + ' ' + g.y0.toFixed(2));
    pth.setAttribute('stroke-width', g.lw.toFixed(2));
  }

  /* ---------------- one flame per mark ---------------- */
  function Flame(el) {
    if (el.__hxFire) return;
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';

    /* the body burns BEHIND the real glyph, so the ×͜× stays exactly your ×͜×;
       only the hot sparks cross in front of it */
    var smileSvg = null;
    if (FIX_SMILE && !el.querySelector('.hxface__svg')) {
      /* two ×'s, one element each — that is what lets them blink */
      el.classList.add('hx-split');
      if (!el.querySelector('.hx-x')) {
        var xa = document.createElement('span');
        xa.className = 'hx-x'; xa.textContent = '\u00d7';
        var xb = document.createElement('span');
        xb.className = 'hx-x'; xb.textContent = '\u00d7';
        el.appendChild(xa); el.appendChild(xb);
      }
      smileSvg = ensureSmile(el);
    }

    /* ---- blinking, on an uneven interval ---- */
    if (BLINK) {
      var blinking = false;
      var blink = function (len) {
        if (blinking) return;
        blinking = true;
        el.classList.add('is-blink');
        setTimeout(function () {
          el.classList.remove('is-blink');
          setTimeout(function () { blinking = false; }, 90);
        }, len || 105);
      };
      (function schedule() {
        setTimeout(function () {
          blink();
          if (Math.random() < 0.22) setTimeout(blink, 250);   // sometimes twice
          schedule();
        }, rnd(3200, 8600));
      })();
      el.__hxBlink = blink;
    }

    var cv = document.createElement('canvas');      // body — behind
    cv.className = 'hx-fire hx-fire--back';
    cv.setAttribute('aria-hidden', 'true');
    var ctx = cv.getContext('2d');
    el.appendChild(cv);

    var cvF = document.createElement('canvas');     // sparks — in front
    cvF.className = 'hx-fire hx-fire--front';
    cvF.setAttribute('aria-hidden', 'true');
    var ctxF = cvF.getContext('2d');
    el.appendChild(cvF);

    var W = 0, H = 0, padX = 0, padT = 0, padB = 0, sc = 1, density = 1, inkW = 1, inkH = 1, glowW = 0, glowH = 0;
    var pts = [], P = [], acc = 0, flare = 0, tNow = 0, last = 0, running = true;
    var gustA = 0, gustT = 9, nextGust = rnd(0.6, 1.8), nextFlare = rnd(2.5, 6);
    /* pointer / touch: the flame bends away from it and is dragged along by it */
    var pX = null, pY = null, pVX = 0, pVY = 0, pT = 0, pLife = 0;
    var emberCv = null, glowCv = null, maskCv = null, maskPad = 0, lastDraw = 0;
    var MAX = 620;

    /* the glyph itself, glowing like it is made of embers */
    function buildEmber() {
      var cw = Math.max(4, Math.ceil(inkW)), ch = Math.max(4, Math.ceil(inkH));
      var ink = sampleInk(el, inkW, inkH);
      pts = ink.pts;

      /* where are the crosses, exactly? then hang the smile under them */
      if (smileSvg && pts.length) {
        var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, k;
        for (k = 0; k < pts.length; k += 2) {
          if (pts[k] < x0) x0 = pts[k];
          if (pts[k] > x1) x1 = pts[k];
          if (pts[k + 1] < y0) y0 = pts[k + 1];
          if (pts[k + 1] > y1) y1 = pts[k + 1];
        }
        var g = smileGeom({ x0: x0, x1: x1, y0: y0, y1: y1 }, inkW, inkH);
        drawSmile(smileSvg, g);
        smileSvg.style.display = '';
      }

      /* the ink, as a mask — the flame never covers the letters themselves */
      var mk = document.createElement('canvas');
      mk.width = Math.round(cw * DPR * 2); mk.height = Math.round(ch * DPR * 2);
      var mg = mk.getContext('2d');
      mg.scale(DPR * 2, DPR * 2);
      mg.fillStyle = '#000';
      if (el.querySelector('.hxface__svg')) {
        drawFaceInk(mg, cw, ch);
      } else {
        fillMark(mg, el, cw, ch);
      }
      maskCv = mk;
      /* blur the mask ONCE here — a canvas blur filter every frame is very expensive */
      try {
        var bpx = 0.55 * sc * DPR * 2;                       // blur radius in mask pixels
        var mgn = Math.ceil(bpx * 3);                        // margin so the soft edge isn't clipped
        var bm = document.createElement('canvas');
        bm.width = mk.width + mgn * 2; bm.height = mk.height + mgn * 2;
        var bg = bm.getContext('2d');
        bg.filter = 'blur(' + bpx.toFixed(2) + 'px)';
        bg.drawImage(mk, mgn, mgn);
        bg.filter = 'none';
        maskCv = bm;
        maskPad = mgn / (DPR * 2);                           // margin in CSS px
      } catch (e) { maskPad = 0; }

      /* the ink silhouette, tinted with a vertical heat gradient */
      var c = document.createElement('canvas');
      c.width = Math.round(cw * DPR * 2);
      c.height = Math.round(ch * DPR * 2);
      var g = c.getContext('2d');
      g.scale(DPR * 2, DPR * 2);
      g.fillStyle = '#000';
      g.font = '';
      /* re-draw the glyph shape into this canvas */
      if (el.querySelector('.hxface__svg')) {
        drawFaceInk(g, cw, ch);
      } else {
        fillMark(g, el, cw, ch);
      }
      g.globalCompositeOperation = 'source-in';
      var grd = g.createLinearGradient(0, ch, 0, 0);
      grd.addColorStop(0, 'rgba(226,250,255,1)');
      grd.addColorStop(0.45, 'rgba(128,208,255,1)');
      grd.addColorStop(0.8, 'rgba(44,128,255,1)');
      grd.addColorStop(1, 'rgba(20,56,180,1)');
      g.fillStyle = grd;
      g.fillRect(0, 0, cw, ch);
      emberCv = c;
    }

    function measure() {
      /* if logo.js turned the mark into its SVG face, it brings its own smile */
      if (smileSvg && el.querySelector('.hxface__svg')) {
        if (smileSvg.parentNode) smileSvg.parentNode.removeChild(smileSvg);
        el.classList.remove('hx-split');
        smileSvg = null;
      }
      var w = el.offsetWidth || 16, h = el.offsetHeight || 10;
      inkW = w; inkH = h;
      sc = clamp(w / 26, 1.0, 3.0);
      density = clamp(w / 20, 1, 1.25);
      padX = Math.max(10, w * 0.60);          // gusts throw the flame sideways too
      padT = clamp(h * 3.2, 26, 96);          // room to rise and die well inside
      /* never let the canvas start above the viewport — a screen edge is still a cut */
      var vtop = (el.getBoundingClientRect().top || 0) - window.scrollY;
      if (vtop > 0) padT = Math.min(padT, Math.max(16, vtop - 1));
      padB = Math.max(8, h * 0.9);
      W = w + padX * 2;
      H = h + padT + padB;
      [cv, cvF].forEach(function (c) {
        c.style.width = W + 'px';
        c.style.height = H + 'px';
        c.style.left = (-padX) + 'px';
        c.style.top = (-padT) + 'px';
        c.width = Math.round(W * DPR);
        c.height = Math.round(H * DPR);
      });
      buildEmber();
      /* the haze on the stroke, pre-rendered (a gradient per frame is not free) */
      var gw = Math.ceil(Math.max(inkW * 1.6, 26)), gh = gw;
      glowCv = document.createElement('canvas');
      glowCv.width = Math.round(gw * DPR); glowCv.height = Math.round(gh * DPR);
      var gg = glowCv.getContext('2d');
      gg.scale(DPR, DPR);
      var grd2 = gg.createRadialGradient(gw / 2, gh / 2, 0, gw / 2, gh / 2, gw / 2);
      grd2.addColorStop(0, 'rgba(150,226,255,0.34)');
      grd2.addColorStop(0.5, 'rgba(40,130,255,0.16)');
      grd2.addColorStop(1, 'rgba(16,52,190,0)');
      gg.fillStyle = grd2;
      gg.fillRect(0, 0, gw, gh);
      glowW = gw; glowH = gh;
      for (var i = 0; i < P.length; i++) {
        if (P[i].u !== undefined) { P[i].x = padX + P[i].u * w; P[i].y = padT + P[i].v * h; }
      }
    }

    function spawn(n, cap) {
      var np = pts.length / 2;
      for (var i = 0; i < n && P.length < cap; i++) {
        var j = (Math.random() * np) | 0;
        var px = pts[j * 2], py = pts[j * 2 + 1];
        var roll = Math.random();
        var ember = roll < 0.085, core = !ember && roll < 0.36;
        P.push({
          u: px / inkW, v: py / inkH,
          x0: padX + px,
          x: padX + px + rnd(-0.7, 0.7) * sc,
          y: padT + py + rnd(-0.7, 0.7) * sc,
          vx: rnd(-4.5, 4.5) * sc,
          vy: rnd(-22, -7) * sc,
          age: 0,
          life: ember ? rnd(0.45, 0.85) : core ? rnd(0.14, 0.26) : rnd(0.18, 0.38),
          size: ember ? rnd(0.24, 0.44) : core ? rnd(0.75, 1.15) : rnd(0.52, 0.98),
          d: rnd(0.72, 1.3),          // depth: nearer particles are bigger and brighter
          seed: rnd(0, 6.283),
          ember: ember
        });
      }
    }

    function frame(now) {
      if (!running) return;
      if (cv.parentNode !== el) { running = false; return; }   // markup was replaced
      if (now - lastDraw < (scrolling ? 110 : 28) || document.documentElement.classList.contains('signature-opening')) {
        requestAnimationFrame(frame); return;
      }
      lastDraw = now;
      var dt = Math.min(0.05, (now - last) / 1000 || 0.016);
      last = now;
      tNow += dt;
      flare = Math.max(0, flare - dt * 1.5);

      /* gusts — the air around the mark is never still */
      if (tNow > nextGust) {
        gustA = rnd(-1, 1) * rnd(70, 210);
        gustT = 0;
        nextGust = tNow + rnd(0.9, 3.0);
      }
      gustT += dt;
      var gust = gustA * Math.exp(-gustT * 1.5);

      /* the pointer's effect fades when it stops moving */
      pLife *= Math.exp(-dt * 1.6);
      pVX *= Math.exp(-dt * 2.2);
      pVY *= Math.exp(-dt * 2.2);

      /* it catches on its own now and then, no pointer needed */
      if (tNow > nextFlare) {
        flare = Math.max(flare, rnd(0.25, 0.8));
        nextFlare = tNow + rnd(2.5, 7);
      }

      /* irregular breathing: the fire never pulses on a clean beat */
      var breathe = 0.72 + 0.55 * noise2(tNow * 0.9, 3.1);
      var cap = Math.round(MAX * density);
      var rate = (1500 + flare * 1000) * density * breathe;
      acc += rate * dt;
      var n = acc | 0;
      if (n) { acc -= n; spawn(n, cap); }

      var i, p, heat, turb;
      var lift = 0.85 + 0.3 * noise2(tNow * 1.6, 5.3);

      for (i = P.length - 1; i >= 0; i--) {
        p = P[i];
        p.age += dt;
        heat = 1 - p.age / p.life;
        if (heat <= 0) { P[i] = P[P.length - 1]; P.pop(); continue; }

        /* buoyancy — hotter gas lifts harder */
        p.vy -= (155 + 135 * heat) * heat * sc * p.d * lift * dt;

        /* flow field: two octaves of smooth noise, scrolling upward */
        var nx = p.x * 0.062 * (1 / sc) + 10;
        var ny = p.y * 0.062 * (1 / sc) - tNow * 1.15;
        var a1 = noise2(nx, ny);
        var a2 = noise2(nx * 2.3 + 31, ny * 2.3 + 7);
        var a3 = noise2(nx * 4.7 + 13, ny * 4.1 + 91);
        turb = ((a1 - 0.5) * 2 * 300 + (a2 - 0.5) * 2 * 175 + (a3 - 0.5) * 2 * 90) *
               (0.35 + 1.15 * (1 - heat));
        p.vx += turb * dt * sc;
        /* a slow sideways shear in the air, so the plume leans and recovers */
        p.vx += Math.sin(tNow * 0.9 + p.y * 0.02) * 55 * dt * sc;
        /* the gust hits the hot gas hardest, the ash drifts through it */
        p.vx += gust * dt * (0.55 + 0.9 * (1 - heat)) * sc;

        /* a pointer near the mark pushes the flame away and drags it along */
        if (pX !== null && pLife > 0.02) {
          var ddx = p.x - pX, ddy = p.y - pY;
          var R = Math.max(70, inkW * 6);
          var dd2 = ddx * ddx + ddy * ddy;
          if (dd2 < R * R && dd2 > 0.01) {
            var dd3 = Math.sqrt(dd2);
            var f = 1 - dd3 / R;
            f = f * f * pLife;
            p.vx += (ddx / dd3) * f * 430 * dt * sc;
            p.vy += (ddy / dd3) * f * 300 * dt * sc;
            p.vx += pVX * 0.10 * f * dt;
            p.vy += pVY * 0.06 * f * dt;
          }
        }

        /* the flame stays attached while it is hot */
        p.vx += (p.x0 - p.x) * (1.2 + 3.4 * heat) * dt;

        var drag = 1 - (p.ember ? 1.1 : 2.6) * dt;
        p.vx = p.vx * drag - 8 * sc * dt;
        p.vy *= drag;

        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }

      /* ---------------- draw ---------------- */
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctxF.setTransform(DPR, 0, 0, DPR, 0, 0);

      /* motion blur that keeps the canvas transparent */
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, 0, W, H);
      ctxF.clearRect(0, 0, W, H);

      ctx.globalCompositeOperation = 'lighter';
      ctxF.globalCompositeOperation = 'lighter';

      var flick = 0.5 + 0.5 * noise2(tNow * 4.2, 11.7);

      /* a warm cast over the letters — light, not paint, so ×͜× stays ×͜× */
      if (emberCv) {
        ctxF.globalAlpha = 0.03 + 0.04 * flick;
        ctxF.drawImage(emberCv, padX + (Math.random() - 0.5) * 0.4, padT + (Math.random() - 0.5) * 0.4, inkW, inkH);
        ctxF.globalAlpha = 1;
      }

      /* the ink glowing at the root of the flame — anchors it to the mark */
      if (emberCv) {
        ctx.globalAlpha = 0.18 + 0.14 * flick;
        ctx.drawImage(emberCv, padX, padT, inkW, inkH);
        ctx.globalAlpha = 1;
      }

      /* the haze the fire throws on the stroke */
      if (glowCv) {
        var gx = padX + inkW / 2 - glowW / 2, gy = padT + inkH * 0.5 - glowH / 2;
        ctx.globalAlpha = 0.44 + 0.36 * flick;
        ctx.drawImage(glowCv, gx, gy, glowW, glowH);
        ctx.globalAlpha = 1;
      }

      var i, p, heat, si, r, ry, a, br, bry, hh;
      for (i = 0; i < P.length; i++) {
        p = P[i];
        heat = 1 - p.age / p.life;

        /* embers and the hottest cores also fly in front of the letters */
        var front = p.ember;

        hh = p.ember ? Math.min(1, heat * 1.6) : heat;
        si = clamp((hh * (NS - 1)) | 0, 0, NS - 1);
        r = p.size * sc * p.d * (0.7 + (1 - heat) * 1.55);
        ry = r * 1.5;
        a = Math.pow(Math.max(0, heat), 0.78) * Math.min(1, p.age / 0.04) * (p.ember ? 0.72 : 0.56) * (0.55 + 0.5 * p.d);
        /* a soft falloff before the canvas edge, so the plume never shows a border */
        var ex = Math.min(p.x, W - p.x), ey = Math.min(p.y, H - p.y);
        a *= clamp(ex / (W * 0.22), 0, 1) * clamp(ey / (H * 0.26), 0, 1);
        if (a <= 0.008) continue;

        /* the body always burns behind the letters */
        if (heat > 0.55) {
          br = r * 1.9; bry = ry * 1.9;
          ctx.globalAlpha = Math.min(1, a * 0.16);
          ctx.drawImage(SPRITES[si], p.x - br, p.y - bry, br * 2, bry * 2);
        }
        ctx.globalAlpha = Math.min(1, a);
        ctx.drawImage(SPRITES[si], p.x - r, p.y - ry, r * 2, ry * 2);

        /* the hot ones also spill over the letters, so the ink looks alight */
        if (front) {
          ctxF.globalAlpha = Math.min(1, a * 0.22);
          ctxF.drawImage(SPRITES[si], p.x - r, p.y - ry, r * 2, ry * 2);
        }
      }
      ctx.globalAlpha = 1;

      /* the letters stay clear: the fire is cut away exactly where the ink is,
         so the two crosses read sharp against black with flame around them */
      if (maskCv) {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.globalAlpha = 0.9;
        ctx.drawImage(maskCv, padX - maskPad, padT - maskPad, inkW + maskPad * 2, inkH + maskPad * 2);
        ctx.globalCompositeOperation = 'lighter';
      }

      ctxF.globalAlpha = 1;

      requestAnimationFrame(frame);
    }

    measure();
    el.__hxFire = {
      ink: function () { return pts.length / 2; },
      live: function () { return P.length; },
      remeasure: measure
    };
    requestAnimationFrame(function (t) { last = t; requestAnimationFrame(frame); });

    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
    var rz;
    window.addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(measure, 180); });

    var host = el.closest('a') || el;
    host.addEventListener('pointerenter', function () { flare = 1; });
    host.addEventListener('focus', function () { flare = 1; });

    function trackPointer(e) {
      var r = cv.getBoundingClientRect();
      var x = e.clientX - r.left, y = e.clientY - r.top;
      var now = performance.now(), dts = Math.max(8, now - pT) / 1000;
      if (pX !== null) {
        pVX = pVX * 0.6 + ((x - pX) / dts) * 0.4;
        pVY = pVY * 0.6 + ((y - pY) / dts) * 0.4;
      }
      pX = x; pY = y; pT = now; pLife = 1;      // 1 = fresh, decays in the loop
    }
    window.addEventListener('pointermove', trackPointer, { passive: true });
    host.addEventListener('pointerdown', function (e) {
      flare = Math.max(flare, 1.3);
      trackPointer(e);
    }, { passive: true });
    window.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'touch') flare = Math.max(flare, 1.3);
    }, { passive: true });

    if (REDUCE) {
      running = false;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      var g3 = ctx.createRadialGradient(W / 2, H * 0.62, 0, W / 2, H * 0.62, W * 0.5);
      g3.addColorStop(0, 'rgba(255,150,60,0.16)');
      g3.addColorStop(1, 'rgba(255,80,0,0)');
      ctx.fillStyle = g3;
      ctx.fillRect(0, 0, W, H);
      return;
    }

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) running = false;
      else if (!running) { running = true; last = performance.now(); requestAnimationFrame(frame); }
    });
  }

  function light() {
    var marks = document.querySelectorAll(TARGET);
    for (var i = 0; i < marks.length; i++) Flame(marks[i]);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', light);
  else light();

  window.HXFire = { light: light };
})();
