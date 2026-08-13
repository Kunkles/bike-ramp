// ---------------------------------------------------------------------------
//  deck.js -- deck-on-ribs construction.
//
//  Instead of printing the ramp as a solid, print only transverse ribs and bend
//  a plywood sheet over them. The sheet becomes the riding surface, which
//  deletes the printed top skin -- and on a solid hill the top skin alone is
//  roughly half the filament.
//
//  With square sides there is no cross-slope, so a rib's top edge is level all
//  the way across. Each rib is therefore a simple prism: a quadrilateral in the
//  x-z plane (flat on the ground, top face tilted to the local slope so the
//  sheet seats on it) swept across the width.
//
//  The sheet is the structure. Screwed down at every rib it ties them upright
//  and holds their spacing, the way a skate ramp's deck does.
//
//  Runs in node (module.exports) and in the browser (window.BikeRampDeck).
// ---------------------------------------------------------------------------
(function (root) {
  'use strict';

  var BR = (typeof module === 'object' && module.exports)
    ? require('./geom.js') : root.BikeRamp;

  var DEFAULTS = {
    hillLength: 1100,     // mm, whole run
    hillWidth: 250,       // mm, across -- also the sheet width
    hillHeight: 35,       // mm, at the crest, to the top of the SHEET
    humps: 2,
    sheet: 3.175,         // mm, 1/8 inch plywood
    maxSpan: 108,         // mm, the sag limit for that sheet under a wheel
    ribThick: 8,          // mm, thick enough to take a screw without splitting
    screwsPerRib: 3,
    endRun: 25            // mm, threshold wedge run-in
  };

  function prof(p, x) {
    return BR.profX({ shape: 'roller', humps: p.humps, hillLength: p.hillLength,
                      hillHeight: p.hillHeight, edgeLip: 1.2, bevelRun: 0,
                      deck: 0 }, x);
  }
  // The ramp surface is the top of the SHEET, so a rib stops short of it by one
  // sheet thickness measured perpendicular -- a slightly larger drop vertically.
  function slope(p, x) {
    var d = 0.5;
    return Math.atan2(prof(p, x + d) - prof(p, x - d), 2 * d);
  }
  function ribTop(p, x) {
    return prof(p, x) - p.sheet / Math.cos(slope(p, x));
  }

  function mesh() {
    var t = [];
    return {
      tris: t,
      tri: function (a, b, c) {
        t.push(a[0],a[1],a[2], b[0],b[1],b[2], c[0],c[1],c[2]);
      },
      quad: function (a, b, c, d) { this.tri(a,b,c); this.tri(a,c,d); }
    };
  }

  // Polygon in the x-z plane swept from y0 to y1. Convex here, so a fan works.
  function prism(poly, y0, y1) {
    var m = mesh(), i, n = poly.length;
    var A = poly.map(function (q) { return [q[0], y0, q[1]]; });
    var B = poly.map(function (q) { return [q[0], y1, q[1]]; });
    for (i = 1; i + 1 < n; i++) { m.tri(A[0], A[i+1], A[i]); m.tri(B[0], B[i], B[i+1]); }
    for (i = 0; i < n; i++) {
      var j = (i + 1) % n;
      m.tri(A[i], A[j], B[j]); m.tri(A[i], B[j], B[i]);
    }
    return m.tris;
  }

  function ribAt(p, x) {
    var h = p.ribThick / 2, x0 = x - h, x1 = x + h;
    var z0 = Math.max(1.5, ribTop(p, x0)), z1 = Math.max(1.5, ribTop(p, x1));
    return prism([[x0, 0], [x1, 0], [x1, z1], [x0, z0]], 0, p.hillWidth);
  }

  function thresholdMesh(p) {
    return prism([[0, 0], [p.endRun, 0], [p.endRun, p.sheet]], 0, p.hillWidth);
  }

  // The bent sheet itself, for the preview: top follows the ramp surface,
  // underside follows the rib tops, so it visibly sits on them.
  function sheetMesh(p) {
    var m = mesh(), N = Math.max(60, Math.round(p.hillLength / 4)), i;
    var W = p.hillWidth, L = p.hillLength;
    // Where the ramp is shallower than the sheet is thick, the sheet lies on
    // the ground and its own thickness sets the surface -- so drive the top
    // face off the underside, not off the ramp profile.
    var bot = function (x) { return Math.max(0, ribTop(p, x)); };
    var top = function (x) { return bot(x) + p.sheet / Math.cos(slope(p, x)); };
    for (i = 0; i < N; i++) {
      var a = L * i / N, b = L * (i + 1) / N;
      var ta = top(a), tb = top(b), ba = bot(a), bb = bot(b);
      m.quad([a,0,ta], [b,0,tb], [b,W,tb], [a,W,ta]);          // riding face
      m.quad([a,0,ba], [a,W,ba], [b,W,bb], [b,0,bb]);          // underside
      m.quad([a,0,ba], [b,0,bb], [b,0,tb], [a,0,ta]);          // y = 0 edge
      m.quad([a,W,ba], [a,W,ta], [b,W,tb], [b,W,bb]);          // y = W edge
    }
    m.quad([0,0,bot(0)], [0,0,top(0)], [0,W,top(0)], [0,W,bot(0)]);
    m.quad([L,0,bot(L)], [L,W,bot(L)], [L,W,top(L)], [L,0,top(L)]);
    return m.tris;
  }

  function build(opts) {
    var p = Object.assign({}, DEFAULTS, opts || {});
    // Land ribs exactly on crests and troughs: divide the half-hump, which puts
    // a rib at every peak -- most load, tightest bend -- and every low point.
    var half = p.hillLength / p.humps / 2;
    var perHalf = Math.max(1, Math.ceil(half / p.maxSpan));
    var step = half / perHalf;
    var n = Math.round(p.hillLength / step) + 1;
    var ribs = [], skipped = 0, i, k;
    for (i = 0; i < n; i++) {
      var x = i * step, h = ribTop(p, x);
      // Where the ramp is shallower than the sheet is thick there is nothing
      // for a rib to do -- the sheet simply lies on the ground.
      if (h < 5) { skipped++; continue; }
      var tris = ribAt(p, x), out = tris.slice();
      for (k = 0; k < out.length; k += 3) out[k] -= x - p.ribThick / 2;
      ribs.push({ name: 'rib_' + (ribs.length < 10 ? '0' : '') + ribs.length,
                  x: x, height: h, tris: out, placed: tris });
    }
    var sy = [], m = p.screwsPerRib;
    for (k = 0; k < m; k++) sy.push(20 + (p.hillWidth - 40) * k / (m - 1));
    return { params: p, ribs: ribs, step: step, screwY: sy, skipped: skipped,
             threshold: { name: 'threshold_x2', tris: thresholdMesh(p) },
             sheetTris: sheetMesh(p),
             sheet: { length: p.hillLength, width: p.hillWidth, thick: p.sheet } };
  }

  // Everything the viewport draws, already positioned on the ground.
  function parts(r) {
    var p = r.params, out = [];
    r.ribs.forEach(function (b) { out.push({ name: b.name, tris: b.placed, ci: 0 }); });
    var th = r.threshold.tris, a = th.slice(), b2 = th.slice(), i;
    for (i = 0; i < b2.length; i += 3) b2[i] = p.hillLength - b2[i];
    out.push({ name: 'threshold (near)', tris: a, ci: 0 });
    out.push({ name: 'threshold (far)', tris: b2, ci: 0 });
    out.push({ name: 'plywood deck', tris: r.sheetTris, ci: 1, sheet: true });
    return out;
  }

  // Filament for the printed parts only -- the sheet is not printed.
  function estimate(r, print) {
    var g = 0, h = 0, plates = 1;
    r.ribs.concat([r.threshold, r.threshold]).forEach(function (b) {
      var e = BR.estimate(BR.measure(b.tris),
        Object.assign({ infill: 0.25, topLayers: 6, flow: 11, plates: 0 }, print || {}));
      g += e.grams; h += e.hours;
    });
    return { grams: g, hours: h + plates * 0.1 };
  }

  var api = { DEFAULTS: DEFAULTS, build: build, parts: parts, estimate: estimate,
              prof: prof, ribTop: ribTop, sheetMesh: sheetMesh };

  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BikeRampDeck = api;
})(this);
