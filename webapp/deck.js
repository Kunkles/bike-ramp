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
    crestFlat: 0,         // mm of flat held at each crest
    sheet: 3.175,         // mm, 1/8 inch plywood
    maxSpan: 108,         // mm, the sag limit for that sheet under a wheel
    ribThick: 12,         // mm, so a screw has real material either side of it
    screwsPerRib: 3,
    baseH: 6,             // mm, base strip height -- the bottom plane
    baseW: 30,            // mm, base strip width
    tenon: 4,             // mm, how far a rib foot drops into a strip
    fit: 0.25,            // mm, slop per side on tenon and mortise
    endRun: 80,           // mm, threshold run-in; it climbs the base too
    bedX: 250             // mm, longest printable base segment
  };

  function prof(p, x) {
    return BR.profX({ shape: 'roller', humps: p.humps, hillLength: p.hillLength,
                      hillHeight: p.hillHeight, edgeLip: 1.2, bevelRun: 0,
                      deck: 0, crestFlat: p.crestFlat || 0 }, x);
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

  // Ear clipping, so a slotted outline can be a single solid rather than a pile
  // of overlapping boxes. The outlines here are rectilinear and simple, which
  // is the case ear clipping handles without fuss.
  function area2(poly) {
    var a = 0, n = poly.length, i;
    for (i = 0; i < n; i++) {
      var j = (i + 1) % n;
      a += poly[i][0] * poly[j][1] - poly[j][0] * poly[i][1];
    }
    return a;
  }
  function inTri(px, py, a, b, c) {
    var d = (b[1]-c[1])*(a[0]-c[0]) + (c[0]-b[0])*(a[1]-c[1]);
    if (Math.abs(d) < 1e-12) return false;
    var u = ((b[1]-c[1])*(px-c[0]) + (c[0]-b[0])*(py-c[1])) / d;
    var v = ((c[1]-a[1])*(px-c[0]) + (a[0]-c[0])*(py-c[1])) / d;
    return u > 1e-9 && v > 1e-9 && u + v < 1 - 1e-9;
  }
  function earClip(poly) {
    var pts = poly.slice();
    if (area2(pts) < 0) pts.reverse();              // work counter-clockwise
    var idx = pts.map(function (_, i) { return i; }), out = [], guard = 0;
    while (idx.length > 3 && guard++ < 5000) {
      var clipped = false;
      for (var i = 0; i < idx.length; i++) {
        var ia = idx[(i + idx.length - 1) % idx.length],
            ib = idx[i], ic = idx[(i + 1) % idx.length];
        var a = pts[ia], b = pts[ib], c = pts[ic];
        var cross = (b[0]-a[0])*(c[1]-a[1]) - (b[1]-a[1])*(c[0]-a[0]);
        if (cross <= 1e-12) continue;               // reflex or collinear
        var ok = true;
        for (var k = 0; k < idx.length && ok; k++) {
          var m = idx[k];
          if (m === ia || m === ib || m === ic) continue;
          if (inTri(pts[m][0], pts[m][1], a, b, c)) ok = false;
        }
        if (!ok) continue;
        out.push([ia, ib, ic]);
        idx.splice(i, 1);
        clipped = true;
        break;
      }
      if (!clipped) break;
    }
    if (idx.length === 3) out.push([idx[0], idx[1], idx[2]]);
    return { pts: pts, tris: out };
  }

  // Sweep a section polygon along one axis. `map(u, v, w)` places a section
  // point (u,v) at sweep position w into world x/y/z.
  function extrude(poly, w0, w1, map) {
    var e = earClip(poly), pts = e.pts, m = mesh(), i;
    var A = pts.map(function (q) { return map(q[0], q[1], w0); });
    var B = pts.map(function (q) { return map(q[0], q[1], w1); });
    e.tris.forEach(function (t) {
      m.tri(A[t[0]], A[t[2]], A[t[1]]);
      m.tri(B[t[0]], B[t[1]], B[t[2]]);
    });
    for (i = 0; i < pts.length; i++) {
      var j = (i + 1) % pts.length;
      m.quad(A[i], A[j], B[j], B[i]);
    }
    return m.tris;
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

  // Where the two base strips run along the length.
  function baseYs(p) {
    var a = Math.max(12, p.hillWidth * 0.16);
    return [[a, a + p.baseW], [p.hillWidth - a - p.baseW, p.hillWidth - a]];
  }

  // Rib section in the y-z plane, swept across the rib's thickness. The feet
  // drop through the base strips: a mortise and tenon, not a plate balanced on
  // edge. That is what fixes the spacing and stops the frame racking before
  // the plywood is anywhere near it.
  function ribSection(p, h) {
    var ys = baseYs(p), W = p.hillWidth, t = p.tenon, f = p.fit;
    var pts = [[0, 0]], i;
    for (i = 0; i < ys.length; i++) {
      var a = ys[i][0] + f, b = ys[i][1] - f;
      pts.push([a, 0], [a, -t], [b, -t], [b, 0]);
    }
    pts.push([W, 0], [W, h], [0, h]);
    return pts;
  }
  function ribAt(p, x) {
    // No minimum here: a clamped rib stands proud of the deck and holds the
    // sheet off the rest of the frame. Ribs too short to be worth printing are
    // dropped in build() instead.
    var h = ribTop(p, x) - p.baseH;
    return extrude(ribSection(p, h), x - p.ribThick / 2, x + p.ribThick / 2,
      function (y, z, xx) { return [xx, y, z + p.baseH]; });
  }

  // A base strip: a flat bar on the ground with a mortise under every rib it
  // passes. This is the bottom plane, and it is what makes the frame a frame.
  function stripSection(p, x0, x1, stations) {
    var pts = [[x0, 0], [x1, 0], [x1, p.baseH]], i;
    var half = p.ribThick / 2 + p.fit;
    for (i = stations.length - 1; i >= 0; i--) {
      var c = stations[i];
      if (c - half <= x0 + 1 || c + half >= x1 - 1) continue;
      pts.push([c + half, p.baseH], [c + half, p.baseH - p.tenon],
               [c - half, p.baseH - p.tenon], [c - half, p.baseH]);
    }
    pts.push([x0, p.baseH]);
    return pts;
  }
  function stripAt(p, x0, x1, stations, y0, y1) {
    return extrude(stripSection(p, x0, x1, stations), y0, y1,
      function (x, z, yy) { return [x, yy, z]; });
  }

  function thresholdMesh(p) {
    return prism([[0, 0], [p.endRun, 0], [p.endRun, p.baseH + p.sheet]],
                 0, p.hillWidth);
  }

  // The bent sheet itself, for the preview: top follows the ramp surface,
  // underside follows the rib tops, so it visibly sits on them.
  function sheetMesh(p) {
    var m = mesh(), N = Math.max(60, Math.round(p.hillLength / 4)), i;
    var W = p.hillWidth, L = p.hillLength;
    // Where the ramp is shallower than the sheet is thick, the sheet lies on
    // the ground and its own thickness sets the surface -- so drive the top
    // face off the underside, not off the ramp profile.
    // The sheet's underside is exactly the rib tops, so in the preview the two
    // surfaces z-fight and the ribs show through. This mesh is drawn, never
    // printed, so lift it clear by a hair.
    var bot = function (x) { return Math.max(p.baseH, ribTop(p, x)) + 0.25; };
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
      var x = i * step, h = ribTop(p, x) - p.baseH;
      // Near a trough the deck is already down on the base ladder, so a rib
      // there has nothing to carry -- and anything shorter than this is not
      // worth printing.
      if (h < 6) { skipped++; continue; }
      var tris = ribAt(p, x), out = tris.slice();
      for (k = 0; k < out.length; k += 3) out[k] -= x - p.ribThick / 2;
      ribs.push({ name: 'rib_' + (ribs.length < 10 ? '0' : '') + ribs.length,
                  x: x, height: h, tris: out, placed: tris });
    }
    // Screws land on the rib's own top face, well inboard of its edges.
    var sy = [], m = p.screwsPerRib;
    for (k = 0; k < m; k++) sy.push(20 + (p.hillWidth - 40) * k / (m - 1));

    // Base strips, cut into bed-length runs. A joint always falls midway
    // between two ribs, so the ribs either side pin it.
    var stations = ribs.map(function (b) { return b.x; });
    var strips = [], ys = baseYs(p), si, sj;
    // Cut by length, not by rib count: ribs are skipped at the troughs, so
    // counting bays lets one segment straddle the gap and overrun the bed.
    var maxSeg = Math.max(120, (p.bedX || 250) - 30);
    var half2 = p.ribThick / 2 + p.fit + 3;
    // Candidate joints: midway between neighbouring ribs, so a rib always pins
    // the joint. Take the furthest candidate that still fits the bed.
    var cand = [];
    for (si = 1; si < stations.length; si++)
      cand.push((stations[si - 1] + stations[si]) / 2);
    var cuts = [0], safety = 0;
    while (p.hillLength - cuts[cuts.length - 1] > maxSeg && safety++ < 200) {
      var from = cuts[cuts.length - 1], pick = -1;
      for (si = 0; si < cand.length; si++)
        if (cand[si] > from + 1 && cand[si] - from <= maxSeg) pick = cand[si];
      if (pick < 0) {
        // no rib gap within reach: cut on plain bar, clear of any mortise
        pick = from + maxSeg;
        for (si = 0; si < stations.length; si++)
          if (Math.abs(pick - stations[si]) < half2) pick = stations[si] - half2;
      }
      cuts.push(pick);
    }
    cuts.push(p.hillLength);

    // Normalise: drop any cut that leaves a runt, then split anything left
    // over the bed limit. A greedy walk alone produces both.
    var minSeg = 45, changed = true, gg = 0;
    while (changed && gg++ < 50) {
      changed = false;
      for (si = 1; si < cuts.length; si++) {
        if (cuts[si] - cuts[si - 1] >= minSeg) continue;
        cuts.splice(si === cuts.length - 1 ? si - 1 : si, 1);
        changed = true;
        break;
      }
      for (si = 1; si < cuts.length; si++) {
        if (cuts[si] - cuts[si - 1] <= maxSeg) continue;
        var a3 = cuts[si - 1], b4 = cuts[si];
        var k3 = Math.ceil((b4 - a3) / maxSeg), ins = [];
        for (sj = 1; sj < k3; sj++) ins.push(a3 + (b4 - a3) * sj / k3);
        cuts.splice.apply(cuts, [si, 0].concat(ins));
        changed = true;
        break;
      }
    }

    for (si = 0; si + 1 < cuts.length; si++) {
      for (sj = 0; sj < ys.length; sj++) {
        var tris = stripAt(p, cuts[si], cuts[si + 1], stations, ys[sj][0], ys[sj][1]);
        var out = tris.slice();
        for (k = 0; k < out.length; k += 3) out[k] -= cuts[si];
        strips.push({ name: 'base_' + si + (sj ? 'R' : 'L'),
                      x0: cuts[si], x1: cuts[si + 1], side: sj,
                      tris: out, placed: tris });
      }
    }
    return { params: p, ribs: ribs, strips: strips, step: step, screwY: sy,
             skipped: skipped, baseYs: ys,
             threshold: { name: 'threshold_x2', tris: thresholdMesh(p) },
             sheetTris: sheetMesh(p),
             sheet: { length: p.hillLength, width: p.hillWidth, thick: p.sheet } };
  }

  // Everything the viewport draws, already positioned on the ground.
  function parts(r) {
    var p = r.params, out = [];
    r.ribs.forEach(function (b) { out.push({ name: b.name, tris: b.placed, ci: 0, kind: 'rib' }); });
    r.strips.forEach(function (b) { out.push({ name: b.name, tris: b.placed, ci: 2, kind: 'base' }); });
    // The thresholds lead UP to the deck from the ground, so they belong
    // outside the run. Left inside it they sit buried under the sheet and the
    // ramp just ends at a 9 mm cliff.
    var th = r.threshold.tris, a = th.slice(), b2 = th.slice(), i;
    for (i = 0; i < a.length; i += 3) a[i] -= p.endRun;
    for (i = 0; i < b2.length; i += 3) b2[i] = p.hillLength + p.endRun - b2[i];
    // match the sheet's display lift so the joint reads flush in the preview
    for (i = 2; i < a.length; i += 3) a[i] += 0.25;
    for (i = 2; i < b2.length; i += 3) b2[i] += 0.25;
    out.push({ name: 'threshold (near)', tris: a, ci: 0, kind: 'end', dir: -1 });
    out.push({ name: 'threshold (far)', tris: b2, ci: 0, kind: 'end', dir: 1 });
    out.push({ name: 'plywood deck', tris: r.sheetTris, ci: 1, sheet: true });
    return out;
  }

  // Filament for the printed parts only -- the sheet is not printed.
  function estimate(r, print) {
    var g = 0, h = 0, plates = 1;
    r.ribs.concat(r.strips).concat([r.threshold, r.threshold]).forEach(function (b) {
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
