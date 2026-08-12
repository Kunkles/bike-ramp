// ============================================================================
//  geom.js -- the bikeramp.scad model, reimplemented as a mesh generator.
//
//  The tile is a solid between two height fields over a polygonal footprint, so
//  it needs no CSG. Mesh the footprint on a grid whose lines fall on every
//  dovetail, socket and profile kink; clip the few straddling cells against a
//  single half-plane each; split cells that straddle the fold in the surface;
//  then lift the result. Every cut is computed from geometry the neighbouring
//  cell shares, so the mesh stays watertight.
//
//  Two things are not height fields and are built directly: the socket wall,
//  which is lofted so its bore can follow a helix, and the spike itself.
//
//  Runs in node (module.exports) and in the browser (window.BikeRamp).
// ============================================================================
(function (root) {
  'use strict';

  var DEFAULTS = {
    shape: 'roller',   // 'roller' | 'drop' | 'kicker'
    deck: 150,         // drop only: flat run before the edge
    hillLength: 600, hillWidth: 300, hillHeight: 45, humps: 1,
    bevelRun: 90, edgeLip: 1.2,
    bedX: 250, bedY: 250,      // usable bed, after edge margin
    tabDepth: 12, tabNeck: 18, tabTip: 26, fit: 0.35, minTabH: 10,
    spikeLen: 0,       // ground spike protrusion, mm. 0 = no spike mounts
    flow: 8,           // average volumetric throughput, mm^3/s -- see estimate()
    decal: 'none',     // 'none' | 'text' | 'checker' | 'both'
    decalText: 'LITTLE RIPPER',
    decalRelief: 1.2,  // how far the decal stands proud of the flank, mm
    cell: 8,           // coarsest mesh cell, mm. Refined automatically below
    chord: 0.05        // most a flat facet may sag below the true surface, mm
  };

  // Screw-in ground spikes. The socket carries a real matching thread: its wall
  // is lofted rather than extruded, so the bore radius can follow the helix
  // while its rim still lands exactly on the plan polygon.
  var SPIKE = {
    socketDepth: 11, gon: 24,
    roof: 5,           // material left between socket ceiling and riding surface
    scan: 10,          // grid the tile is searched on for its thickest point
    inset: 30,         // keep clear of tile edges and their dovetails

    minor: 6.5, major: 7.45,       // spike thread: root and crest radius
    clear: 0.25,                   // radial clearance, spike to socket
    pitch: 3.0, studH: 10, lead: 2.5,
    threadLead: 1.5,   // plain bore at the mouth, to start the screw
    threadRelief: 1.5, // plain bore at the far end, so the ceiling closes flat

    chamfer: 1.5, flangeR: 9.0, flangeH: 1.5, coneR: 7.5, tipR: 0.6,
    seg: 72, zStep: 0.25
  };
  // The socket is the spike's own profile pushed out by the clearance, so the
  // two forms are identical and mate at every point.
  SPIKE.socketCrestR = SPIKE.minor + SPIKE.clear;   // bore at its tightest
  SPIKE.socketR      = SPIKE.major + SPIKE.clear;   // groove, and the plain bore

  function threadCrest(th, z) {
    var u = z / SPIKE.pitch - th / (2 * Math.PI);
    u -= Math.floor(u);
    return 1 - Math.abs(2 * u - 1);       // symmetric, so handedness cannot bite
  }
  // Material radius on the spike's stud, tapering out over the first turn so
  // the screw starts easily.
  function spikeRadius(th, z) {
    return SPIKE.minor + (SPIKE.major - SPIKE.minor) *
           Math.min(1, z / SPIKE.lead) * threadCrest(th, z);
  }
  // Bore radius on the socket wall. Plain at both ends so the rim and the
  // ceiling land exactly on the plan polygon.
  function socketRadius(th, z) {
    if (z <= SPIKE.threadLead || z >= SPIKE.socketDepth - SPIKE.threadRelief)
      return SPIKE.socketR;
    return SPIKE.socketCrestR +
           (SPIKE.socketR - SPIKE.socketCrestR) * threadCrest(th, z);
  }

  // --------------------------------------------------------------- decals ---
  // Raised graphics live on the side flanks only. Nothing goes on the riding
  // surface: a relief pattern under a 12" wheel is a bump and a trip edge.
  //
  // A blocky 5x7 stencil keeps every edge axis-aligned, so each one lands on a
  // mesh grid line exactly and the letters come out crisp rather than serrated.
  var FONT = {"A":[".###.","#...#","#...#","#####","#...#","#...#","#...#"],
    "B":["####.","#...#","####.","#...#","#...#","#...#","####."],
    "C":[".####","#....","#....","#....","#....","#....",".####"],
    "D":["####.","#...#","#...#","#...#","#...#","#...#","####."],
    "E":["#####","#....","####.","#....","#....","#....","#####"],
    "F":["#####","#....","####.","#....","#....","#....","#...."],
    "G":[".####","#....","#....","#..##","#...#","#...#",".####"],
    "H":["#...#","#...#","#####","#...#","#...#","#...#","#...#"],
    "I":["#####","..#..","..#..","..#..","..#..","..#..","#####"],
    "J":["####.","...#.","...#.","...#.","...#.","#..#.",".##.."],
    "K":["#...#","#..#.","##...","##...","#.#..","#..#.","#...#"],
    "L":["#....","#....","#....","#....","#....","#....","#####"],
    "M":["#...#","##.##","#.#.#","#...#","#...#","#...#","#...#"],
    "N":["#...#","##..#","#.#.#","#..##","#...#","#...#","#...#"],
    "O":[".###.","#...#","#...#","#...#","#...#","#...#",".###."],
    "P":["####.","#...#","#...#","####.","#....","#....","#...."],
    "Q":[".###.","#...#","#...#","#...#","#.#.#","#..#.",".##.#"],
    "R":["####.","#...#","#...#","####.","#.#..","#..#.","#...#"],
    "S":[".####","#....","#....",".###.","....#","....#","####."],
    "T":["#####","..#..","..#..","..#..","..#..","..#..","..#.."],
    "U":["#...#","#...#","#...#","#...#","#...#","#...#",".###."],
    "V":["#...#","#...#","#...#","#...#","#...#",".#.#.","..#.."],
    "W":["#...#","#...#","#...#","#...#","#.#.#","##.##","#...#"],
    "X":["#...#",".#.#.","..#..","..#..","..#..",".#.#.","#...#"],
    "Y":["#...#",".#.#.","..#..","..#..","..#..","..#..","..#.."],
    "Z":["#####","....#","...#.","..#..",".#...","#....","#####"],
    "0":[".###.","#..##","#.#.#","#.#.#","##..#","#...#",".###."],
    "1":["..#..",".##..","..#..","..#..","..#..","..#..",".###."],
    "2":[".###.","#...#","....#","...#.","..#..",".#...","#####"],
    "3":["####.","....#","....#",".###.","....#","....#","####."],
    "4":["#..#.","#..#.","#..#.","#####","...#.","...#.","...#."],
    "5":["#####","#....","####.","....#","....#","#...#",".###."],
    "6":[".###.","#....","####.","#...#","#...#","#...#",".###."],
    "7":["#####","....#","...#.","..#..",".#...",".#...",".#..."],
    "8":[".###.","#...#","#...#",".###.","#...#","#...#",".###."],
    "9":[".###.","#...#","#...#",".####","....#","....#",".###."],
    " ":[".....",".....",".....",".....",".....",".....","....."],
    "-":[".....",".....",".....","#####",".....",".....","....."],
    ".":[".....",".....",".....",".....",".....",".##..",".##.."],
    "'":["..#..","..#..",".....",".....",".....",".....","....."],
    "!":["..#..","..#..","..#..","..#..","..#..",".....","..#.."]};

  // Decal rectangles in (x, d) where d is distance in from the nearer side, so
  // one list serves both flanks and each reads the right way round from its own
  // side. Returned as [x0, d0, x1, d1].
  function decalRects(p) {
    if (p.decal === 'none' || p.bevelRun <= 0) return [];
    var out = [], L = p.hillLength, B = p.bevelRun;

    if (p.decal === 'checker' || p.decal === 'both') {
      var sq = Math.max(6, Math.min(14, B * 0.11));
      var d0 = B * 0.06, n = Math.floor(L / sq);
      var pad = (L - n * sq) / 2;
      for (var i = 0; i < n; i++)
        for (var r = 0; r < 2; r++)
          if ((i + r) % 2 === 0)
            out.push([pad + i * sq, d0 + r * sq, pad + (i + 1) * sq, d0 + (r + 1) * sq]);
    }

    if (p.decal === 'text' || p.decal === 'both') {
      // One word per line. A single long line has to cross the joints, where
      // it gets trimmed away; stacked words make a compact block that sits
      // inside one tile.
      var words = String(p.decalText || '').toUpperCase().split(/\s+/)
        .map(function (w) {
          return w.split('').filter(function (c) { return FONT[c]; });
        })
        .filter(function (w) { return w.length; });
      if (!words.length) return finishRects(p, out);

      var span = textSpan(p);
      var lo = p.decal === 'both' ? B * 0.36 : B * 0.26;

      // Keep the block below the fold. Above it the riding surface takes over
      // and min() clamps the relief flat, so lettering there simply vanishes.
      var hMin = Infinity, q;
      for (q = 0; q <= 8; q++)
        hMin = Math.min(hMin, profX(p, span[0] + (span[1] - span[0]) * (0.1 + 0.1 * q)));
      var dFold = B * Math.max(0, Math.min(1,
        (hMin - p.edgeLip) / Math.max(1e-6, p.hillHeight - p.edgeLip)));
      var hi = Math.min(B * 0.82, dFold - 2);
      if (hi - lo < 6) return finishRects(p, out);      // no room to letter

      var gap = 2, nl = words.length;
      var rowsTot = nl * 7 + (nl - 1) * gap;
      var widest = words.reduce(function (m, w) { return Math.max(m, w.length); }, 0);
      var px = Math.min((hi - lo) / rowsTot,
                        (span[1] - span[0]) * 0.9 / (widest * 6 - 1));
      var base = lo + ((hi - lo) - rowsTot * px) / 2;
      var mid = (span[0] + span[1]) / 2;

      words.forEach(function (w, li) {
        var x0 = mid - ((w.length * 6 - 1) * px) / 2;
        var yl = base + (nl - 1 - li) * (7 + gap) * px;   // first word on top
        w.forEach(function (ch, k) {
          var rows = FONT[ch];
          for (var r = 0; r < 7; r++) {
            var run = -1;
            for (var c = 0; c <= 5; c++) {
              var on = c < 5 && rows[6 - r].charAt(c) === '#';
              if (on && run < 0) run = c;
              if (!on && run >= 0) {
                out.push([x0 + (k * 6 + run) * px, yl + r * px,
                          x0 + (k * 6 + c) * px,   yl + (r + 1) * px]);
                run = -1;
              }
            }
          }
        });
      });
    }
    return finishRects(p, out);
  }

  // The widest run of hill that no joint interrupts, preferring the tallest --
  // lettering on a toe would be clamped flat by the riding surface.
  function textSpan(p) {
    var t = tiling(p), pad = p.tabDepth + 1.5, cuts = [0], i;
    for (i = 1; i < t.nx; i++) cuts.push(i * t.px - pad, i * t.px + pad);
    cuts.push(p.hillLength);
    var best = null;
    for (i = 0; i + 1 < cuts.length; i += 2) {
      var a = cuts[i], b = cuts[i + 1];
      if (b - a < 20) continue;
      var score = profX(p, (a + b) / 2);
      if (!best || score > best.score + 1e-9 ||
          (Math.abs(score - best.score) < 1e-9 && b - a > best.b - best.a))
        best = { a: a, b: b, score: score };
    }
    return best ? [best.a, best.b] : [0, p.hillLength];
  }

  function finishRects(p, out) {
    var B = p.bevelRun;
    // Checker squares, and diagonal strokes in letters like X and Z, touch
    // corner to corner. That is a non-manifold vertex, so grow every block a
    // hair: diagonal neighbours then overlap along a real edge instead.
    // Growing in x alone is enough: a diagonal neighbour then shares a real
    // edge segment rather than a point. Growing in d as well would leave a
    // 2e-wide sliver between stacked pixels of the same stroke.
    var e = 0.15;
    out = out.map(function (r) { return [r[0] - e, r[1], r[2] + e, r[3]]; });

    // Keep decals out of the joint zone -- the seam itself and the dovetail
    // reach either side of it. Two reasons. Relief on a tab or in a socket
    // fouls the fit; and a block crossing the tile's plan boundary steps the
    // side wall by the relief at a single point, which is a T-junction. The
    // tiles are separate prints with clearance anyway, so a letter spanning a
    // joint would read as broken however it was meshed.
    var t = tiling(p), pad = p.tabDepth + 1.5, cutX = [], cutD = [], i;
    for (i = 1; i < t.nx; i++) cutX.push(i * t.px);
    for (i = 1; i < t.ny; i++) { cutD.push(i * t.py); cutD.push(p.hillWidth - i * t.py); }
    return trimRects(trimRects(out, cutX, 0, pad), cutD, 1, pad);
  }

  // Cut rectangles clear of each seam, dropping slivers.
  function trimRects(rects, cuts, axis, gap) {
    if (!cuts.length) return rects;
    var lo = axis ? 1 : 0, hi = axis ? 3 : 2, out = [];
    rects.forEach(function (r) {
      var parts = [r];
      cuts.forEach(function (c) {
        var next = [];
        parts.forEach(function (q) {
          if (q[hi] <= c - gap || q[lo] >= c + gap) { next.push(q); return; }
          if (q[lo] < c - gap) { var a = q.slice(); a[hi] = c - gap; next.push(a); }
          if (q[hi] > c + gap) { var b = q.slice(); b[lo] = c + gap; next.push(b); }
        });
        parts = next;
      });
      parts.forEach(function (q) { if (q[hi] - q[lo] > 0.4) out.push(q); });
    });
    return out;
  }

  // Height added to the flank at (x,y). Zero everywhere else.
  function reliefAt(p, x, y) {
    var rects = p._decal;
    if (!rects || !rects.length) return 0;
    var d = Math.min(y, p.hillWidth - y);
    for (var i = 0; i < rects.length; i++) {
      var r = rects[i];
      if (x >= r[0] && x <= r[2] && d >= r[1] && d <= r[3]) return p.decalRelief;
    }
    return 0;
  }

  // -------------------------------------------------------------- profile ---
  // Three lengthwise profiles. 'roller' comes back down to the ground; 'drop'
  // and 'kicker' both finish at full height, so the far end of the last tile is
  // a vertical face.
  function profX(p, x) {
    var H = p.hillHeight, lip = p.edgeLip, L = p.hillLength, h = H - lip;

    if (p.shape === 'drop') {
      // Smooth rise -- zero slope at the toe and at the deck -- then flat to
      // the edge, where it simply stops.
      var rise = Math.max(1, L - Math.min(p.deck, L * 0.8));
      if (x >= rise) return H;
      var t = Math.min(1, Math.max(0, x / rise));
      return lip + h * 0.5 * (1 - Math.cos(Math.PI * t));
    }

    if (p.shape === 'kicker') {
      // Circular arc, tangent to the ground at the toe, steepest at the lip.
      if (h < 0.01) return lip;
      var R = (L * L + h * h) / (2 * h);
      var xx = Math.min(Math.max(x, 0), L);
      return lip + R - Math.sqrt(Math.max(0, R * R - xx * xx));
    }

    return lip + h / 2 * (1 - Math.cos(2 * Math.PI * p.humps * x / L));
  }
  function profY(p, y) {
    if (p.bevelRun <= 0) return p.hillHeight;
    var t = Math.min(1, Math.max(0, Math.min(y, p.hillWidth - y) / p.bevelRun));
    return p.edgeLip + (p.hillHeight - p.edgeLip) * t;
  }
  function flankAt(p, x, y) { return profY(p, y) + reliefAt(p, x, y); }
  function hAt(p, x, y) { return Math.min(profX(p, x), flankAt(p, x, y)); }
  // Surface height for a piece that carries one relief value throughout.
  function topOf(p, rel, x, y) { return Math.min(profX(p, x), profY(p, y) + rel); }

  // Steepest gradient the rider meets. For a kicker that is the lip, i.e. the
  // takeoff angle; for a drop it is the approach, not the edge itself.
  function maxSlopeDeg(p) {
    var L = p.hillLength, h = p.hillHeight - p.edgeLip, t;
    if (p.shape === 'drop') {
      t = Math.PI * h / (2 * Math.max(1, L - Math.min(p.deck, L * 0.8)));
    } else if (p.shape === 'kicker') {
      if (h < 0.01) return 0;
      var R = (L * L + h * h) / (2 * h);
      t = L / Math.max(1e-9, R - h);
    } else {
      t = Math.PI * p.humps * h / L;
    }
    return Math.atan(t) * 180 / Math.PI;
  }

  // A flat facet sags below a curved surface by about h''*cell^2/8, so pick the
  // cell from the sharpest curvature in the profile. A long gentle hill stays
  // coarse and fast; a short steep one refines itself.
  function meshCell(p) {
    var e = p.hillLength / 400, k = 0;
    for (var i = 1; i < 400; i++) {
      var x = i * p.hillLength / 400;
      var d2 = Math.abs(profX(p, x + e) - 2 * profX(p, x) + profX(p, x - e)) / (e * e);
      if (d2 > k) k = d2;
    }
    if (k < 1e-9) return p.cell;
    return Math.max(1.5, Math.min(p.cell, Math.sqrt(8 * p.chord / k)));
  }

  // --------------------------------------------------------------- tiling ---
  // Tiles carry a dovetail past their nominal pitch, so the printable span is
  // the bed less one tab. Beds are often oblong (a MK4 is 250x210), so try the
  // tile grid both ways round and keep whichever needs fewer plates.
  function tiling(p) {
    var bx = Math.max(1, p.bedX - p.tabDepth), by = Math.max(1, p.bedY - p.tabDepth);
    var fit = function (a, b) {
      return [Math.max(1, Math.ceil(p.hillLength / a)), Math.max(1, Math.ceil(p.hillWidth / b))];
    };
    var a = fit(bx, by), b = fit(by, bx);
    var turn = b[0] * b[1] < a[0] * a[1];
    var n = turn ? b : a;
    return { nx: n[0], ny: n[1], px: p.hillLength / n[0], py: p.hillWidth / n[1],
             turned: turn };
  }

  function nTabs(span) { return Math.max(1, Math.round(span / 120)); }
  function tabOffsets(span) {
    var n = nTabs(span), out = [];
    for (var k = 0; k < n; k++) out.push((k + 0.5) * span / n);
    return out;
  }
  // Dovetails on a seam at constant x, positioned along y (and vice versa).
  // Skipped where the hill is too thin to make a useful tab.
  function xseamTabs(p, xs, y0, span) {
    return tabOffsets(span).map(function (t) { return y0 + t; })
      .filter(function (q) { return hAt(p, xs, q) >= p.minTabH; });
  }
  function yseamTabs(p, ys, x0, span) {
    return tabOffsets(span).map(function (t) { return x0 + t; })
      .filter(function (q) { return hAt(p, q, ys) >= p.minTabH; });
  }

  // ------------------------------------------------------------- dovetail ---
  function lineIntersect(a, b) {
    var d = a[2] * b[3] - a[3] * b[2];
    var s = ((b[0] - a[0]) * b[3] - (b[1] - a[1]) * b[2]) / d;
    return [a[0] + a[2] * s, a[1] + a[3] * s];
  }
  // Offset a CCW convex polygon outward by g (OpenSCAD's offset(delta=g)).
  function offsetConvexCCW(pts, g) {
    var n = pts.length, lines = [], i;
    for (i = 0; i < n; i++) {
      var a = pts[i], b = pts[(i + 1) % n];
      var dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
      lines.push([a[0] + (dy / L) * g, a[1] - (dx / L) * g, dx, dy]);
    }
    var out = [];
    for (i = 0; i < n; i++) out.push(lineIntersect(lines[(i - 1 + n) % n], lines[i]));
    return out;
  }

  // A dovetail rooted on a seam. axis 'x' points +X, axis 'y' points +Y.
  // Vertices stay CCW; edges 0 and 2 are always the two slanted flanks.
  function dovetail(p, axis, rootCoord, centre, grow) {
    var n2 = p.tabNeck / 2, t2 = p.tabTip / 2, D = p.tabDepth;
    var pts = [[0, -n2], [D, -t2], [D, t2], [0, n2]];
    if (grow) pts = offsetConvexCCW(pts, grow);
    if (axis === 'y') pts = pts.map(function (q) { return [-q[1], q[0]]; });
    var ox = axis === 'x' ? rootCoord : centre;
    var oy = axis === 'x' ? centre : rootCoord;
    return pts.map(function (q) { return [q[0] + ox, q[1] + oy]; });
  }

  function feature(p, kind, axis, rootCoord, centre, grow) {
    var poly = dovetail(p, axis, rootCoord, centre, grow);
    var xs = poly.map(function (q) { return q[0]; });
    var ys = poly.map(function (q) { return q[1]; });
    // The two flanks mirror across this axis; a grid line on it guarantees each
    // cell is cut by at most one of them.
    var splitAxis = axis === 'x' ? 'y' : 'x';
    var k = splitAxis === 'x' ? 0 : 1;
    var e0 = [poly[0], poly[1]], e2 = [poly[2], poly[3]];
    var m0 = (e0[0][k] + e0[1][k]) / 2, m2 = (e2[0][k] + e2[1][k]) / 2;
    return {
      kind: kind, poly: poly,
      bbox: [Math.min.apply(null, xs), Math.min.apply(null, ys),
             Math.max.apply(null, xs), Math.max.apply(null, ys)],
      splitAxis: splitAxis, splitAt: centre,
      low: m0 < m2 ? e0 : e2,      // flank on the low side of splitAt
      high: m0 < m2 ? e2 : e0
    };
  }

  // ------------------------------------------------------ tile footprint ----
  function tileFeatures(p, t, i, j) {
    var f = [], x0 = i * t.px, x1 = (i + 1) * t.px, y0 = j * t.py, y1 = (j + 1) * t.py;
    if (i < t.nx - 1) xseamTabs(p, x1, y0, t.py).forEach(function (c) {
      f.push(feature(p, 'tab', 'x', x1, c, 0)); });
    if (j < t.ny - 1) yseamTabs(p, y1, x0, t.px).forEach(function (c) {
      f.push(feature(p, 'tab', 'y', y1, c, 0)); });
    if (i > 0) xseamTabs(p, x0, y0, t.py).forEach(function (c) {
      f.push(feature(p, 'socket', 'x', x0, c, p.fit)); });
    if (j > 0) yseamTabs(p, y0, x0, t.px).forEach(function (c) {
      f.push(feature(p, 'socket', 'y', y0, c, p.fit)); });
    return f;
  }

  // ----------------------------------------------------------- half-plane ---
  // Keep the side of directed edge a->b that the CCW interior is on (left),
  // or its complement when cutting a socket away.
  function clipHalf(poly, a, b, keepLeft) {
    if (!poly.length) return poly;
    var s = keepLeft ? 1 : -1;
    var side = function (q) {
      return s * ((b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]));
    };
    var out = [], n = poly.length;
    for (var i = 0; i < n; i++) {
      var c = poly[i], d = poly[(i + 1) % n], sc = side(c), sd = side(d);
      if (sc >= 0) out.push(c);
      if ((sc > 0 && sd < 0) || (sc < 0 && sd > 0)) {
        var u = sc / (sc - sd);
        out.push([c[0] + (d[0] - c[0]) * u, c[1] + (d[1] - c[1]) * u]);
      }
    }
    return out;
  }

  // -------------------------------------------------------- spike sockets ---
  function regularGon(cx, cy, r, n) {
    var pts = [];
    for (var k = 0; k < n; k++) {
      var a = 2 * Math.PI * k / n;
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    return pts;                                   // CCW
  }

  function pointInConvex(q, poly) {
    for (var i = 0; i < poly.length; i++) {
      var a = poly[i], b = poly[(i + 1) % poly.length];
      if ((b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]) < 0) return false;
    }
    return true;
  }

  // One socket per tile, at the thickest point of the area that clears the tile
  // edges and their dovetails, scanned on a 10 mm grid. The toes are a
  // millimetre or two thick and get none -- the dovetails tie them to the tiles
  // that are pegged down.
  function spikeSpots(p, t, i, j) {
    if (!p.spikeLen) return [];
    var x0 = i * t.px + SPIKE.inset, x1 = (i + 1) * t.px - SPIKE.inset;
    var y0 = j * t.py + SPIKE.inset, y1 = (j + 1) * t.py - SPIKE.inset;
    if (x1 < x0 || y1 < y0) return [];

    var nx = Math.floor((x1 - x0) / SPIKE.scan), ny = Math.floor((y1 - y0) / SPIKE.scan);
    var best = null;
    for (var a = 0; a <= nx; a++) {
      for (var b = 0; b <= ny; b++) {
        var x = x0 + a * SPIKE.scan, y = y0 + b * SPIKE.scan, h = hAt(p, x, y);
        if (!best || h > best[2] + 1e-9) best = [x, y, h];
      }
    }
    return best && best[2] >= SPIKE.socketDepth + SPIKE.roof ? [[best[0], best[1]]] : [];
  }

  function pocketsFor(p, t, i, j) {
    return spikeSpots(p, t, i, j).map(function (c) {
      var poly = regularGon(c[0], c[1], SPIKE.socketR, SPIKE.gon);
      var xs = poly.map(function (q) { return q[0]; });
      var ys = poly.map(function (q) { return q[1]; });
      var edges = poly.map(function (a, k) {
        var b = poly[(k + 1) % poly.length];
        return { a: a, b: b,
                 box: [Math.min(a[0], b[0]), Math.min(a[1], b[1]),
                       Math.max(a[0], b[0]), Math.max(a[1], b[1])] };
      });
      return {
        poly: poly, edges: edges, depth: SPIKE.socketDepth, c: c,
        bbox: [Math.min.apply(null, xs), Math.min.apply(null, ys),
               Math.max.apply(null, xs), Math.max.apply(null, ys)]
      };
    });
  }

  // ------------------------------------------------------------- crease -----
  // h is min(profX, profY), so the surface folds along the curve where the two
  // are equal. A flat triangle cannot span that fold, and because the fold runs
  // diagonally to the grid it comes out serrated. Split every straddling cell
  // along it: each half then lies on one smooth branch.
  //
  // The cut point on a shared edge is interpolated from that edge's endpoints
  // alone, so the neighbouring cell computes an identical point and the surface
  // stays closed.
  function splitAtCrease(p, poly, rel) {
    var g = poly.map(function (q) { return profX(p, q[0]) - (profY(p, q[1]) + rel); });
    var pos = false, neg = false, i, j;
    for (i = 0; i < g.length; i++) {
      if (g[i] > 0) pos = true;
      if (g[i] < 0) neg = true;
    }
    if (!pos || !neg) return null;

    var A = [], B = [];
    for (i = 0; i < poly.length; i++) {
      j = (i + 1) % poly.length;
      if (g[i] >= 0) A.push(poly[i]);
      if (g[i] <= 0) B.push(poly[i]);
      if ((g[i] > 0 && g[j] < 0) || (g[i] < 0 && g[j] > 0)) {
        var t = g[i] / (g[i] - g[j]);
        var c = [poly[i][0] + (poly[j][0] - poly[i][0]) * t,
                 poly[i][1] + (poly[j][1] - poly[i][1]) * t];
        A.push(c); B.push(c);
      }
    }
    // Validate rather than predict: a vertex sitting exactly on the fold, or a
    // fold that doubles back inside one cell, both break a crossing count. If
    // the two halves do not tile the original, leave the cell alone.
    if (A.length < 3 || B.length < 3) return null;
    var ar = Math.abs(area(poly));
    if (Math.abs(Math.abs(area(A)) + Math.abs(area(B)) - ar) > 1e-6 * (ar + 1))
      return null;
    return [A, B];
  }

  // A vertex landing exactly on a cut line gets emitted by both the clip and
  // the split, leaving a repeated point that fans out into a zero-area
  // triangle. Harmless to a slicer, but it puts four faces on an edge and makes
  // the mesh non-manifold, so drop repeats before building anything.
  function dedupe(poly) {
    var Q = 1e4, out = [], i;
    var same = function (a, b) {
      return Math.round(a[0] * Q) === Math.round(b[0] * Q) &&
             Math.round(a[1] * Q) === Math.round(b[1] * Q);
    };
    for (i = 0; i < poly.length; i++)
      if (!out.length || !same(out[out.length - 1], poly[i])) out.push(poly[i]);
    while (out.length > 1 && same(out[0], out[out.length - 1])) out.pop();
    return out;
  }

  function area(poly) {
    var a = 0;
    for (var i = 0; i < poly.length; i++) {
      var b = poly[(i + 1) % poly.length];
      a += poly[i][0] * b[1] - b[0] * poly[i][1];
    }
    return a / 2;
  }

  // ---------------------------------------------------------- grid lines ----
  function gridLines(lo, hi, critical, cell) {
    var vals = critical.filter(function (v) { return v > lo + 1e-9 && v < hi - 1e-9; });
    vals.push(lo, hi);
    vals.sort(function (a, b) { return a - b; });
    var uniq = [vals[0]];
    for (var i = 1; i < vals.length; i++)
      if (vals[i] - uniq[uniq.length - 1] > 1e-7) uniq.push(vals[i]);
    var out = [uniq[0]];
    for (i = 1; i < uniq.length; i++) {
      var a = uniq[i - 1], b = uniq[i], n = Math.max(1, Math.ceil((b - a) / cell));
      for (var k = 1; k <= n; k++) out.push(a + (b - a) * k / n);
    }
    return out;
  }

  // ---------------------------------------------------------------- mesh ----
  function tileMesh(p, t, i, j) {
    var feats = tileFeatures(p, t, i, j);
    var rx0 = i * t.px, rx1 = (i + 1) * t.px, ry0 = j * t.py, ry1 = (j + 1) * t.py;

    var bx0 = rx0, bx1 = rx1, by0 = ry0, by1 = ry1;
    feats.forEach(function (f) {
      if (f.kind !== 'tab') return;
      bx0 = Math.min(bx0, f.bbox[0]); by0 = Math.min(by0, f.bbox[1]);
      bx1 = Math.max(bx1, f.bbox[2]); by1 = Math.max(by1, f.bbox[3]);
    });

    var pockets = pocketsFor(p, t, i, j);
    var cx = [rx0, rx1], cy = [ry0, ry1];
    feats.forEach(function (f) {
      f.poly.forEach(function (q) { cx.push(q[0]); cy.push(q[1]); });
      (f.splitAxis === 'x' ? cx : cy).push(f.splitAt);
    });
    // A line on every socket vertex leaves each cell crossed by at most one of
    // its edges, so the same single-half-plane split works here too.
    pockets.forEach(function (pk) {
      pk.poly.forEach(function (q) { cx.push(q[0]); cy.push(q[1]); });
    });
    // and on the kinks in the profiles themselves
    if (p.bevelRun > 0) { cy.push(p.bevelRun); cy.push(p.hillWidth - p.bevelRun); }
    // decal blocks are axis-aligned, so a line on each edge makes them crisp
    if (p._decal) p._decal.forEach(function (r) {
      cx.push(r[0], r[2]);
      cy.push(r[1], r[3], p.hillWidth - r[1], p.hillWidth - r[3]);
    });
    if (p.shape === 'drop')
      cx.push(p.hillLength - Math.min(p.deck, p.hillLength * 0.8));
    var xs = gridLines(bx0, bx1, cx, p.cell);
    var ys = gridLines(by0, by1, cy, p.cell);
    var levels = (p._decal && p._decal.length) ? [0, p.decalRelief] : [0];

    var pieces = [];
    for (var a = 0; a < xs.length - 1; a++) {
      for (var b = 0; b < ys.length - 1; b++) {
        var x0 = xs[a], x1 = xs[a + 1], y0 = ys[b], y1 = ys[b + 1];
        var mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
        var poly = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
        var inside = mx > rx0 && mx < rx1 && my > ry0 && my < ry1;

        for (var k = 0; k < feats.length; k++) {
          var f = feats[k];
          if (mx < f.bbox[0] || mx > f.bbox[2] || my < f.bbox[1] || my > f.bbox[3]) continue;
          var hi = (f.splitAxis === 'x' ? mx : my) > f.splitAt;
          var e = hi ? f.high : f.low;
          if (f.kind === 'tab') { inside = true; poly = clipHalf(poly, e[0], e[1], true); }
        }
        if (!inside) continue;
        for (k = 0; k < feats.length; k++) {
          var g = feats[k];
          if (g.kind !== 'socket') continue;
          if (mx < g.bbox[0] || mx > g.bbox[2] || my < g.bbox[1] || my > g.bbox[3]) continue;
          var hi2 = (g.splitAxis === 'x' ? mx : my) > g.splitAt;
          poly = clipHalf(poly, (hi2 ? g.high : g.low)[0], (hi2 ? g.high : g.low)[1], false);
        }
        if (poly.length < 3) continue;

        var floor = 0, split = null;
        for (k = 0; k < pockets.length; k++) {
          var pk = pockets[k];
          if (mx < pk.bbox[0] || mx > pk.bbox[2] || my < pk.bbox[1] || my > pk.bbox[3])
            continue;
          var cross = pk.edges.filter(function (e) {
            return mx > e.box[0] && mx < e.box[2] && my > e.box[1] && my < e.box[3];
          });
          if (cross.length === 1) { split = { e: cross[0], d: pk.depth }; }
          else if (pointInConvex([mx, my], pk.poly)) { floor = pk.depth; }
          break;
        }

        // Grid lines sit on every decal edge, so a cell is wholly in or out of
        // each block and its centre settles the relief for the whole piece.
        var rel = reliefAt(p, mx, my);
        // Split at the fold for *every* relief level in play, not just this
        // cell's. Near the toes the fold runs through the decal bands, and if
        // each cell split only at its own fold two neighbours would cut their
        // shared edge in different places and tear the mesh open.
        var push = function (q, fl) {
          if (q.length < 3) return;
          var work = [q];
          levels.forEach(function (lv) {
            var next = [];
            work.forEach(function (w) {
              var halves = splitAtCrease(p, w, lv);
              if (!halves) { next.push(w); return; }
              if (halves[0].length >= 3) next.push(halves[0]);
              if (halves[1].length >= 3) next.push(halves[1]);
            });
            work = next;
          });
          work.forEach(function (w) {
            var c = dedupe(w);
            if (c.length >= 3) pieces.push({ poly: c, floor: fl, rel: rel });
          });
        };

        if (split) {
          push(clipHalf(poly, split.e.a, split.e.b, true), split.d);
          push(clipHalf(poly, split.e.a, split.e.b, false), 0);
        } else {
          push(poly, floor);
        }
      }
    }
    return buildSolid(p, pieces, pockets);
  }

  // Lift each plan piece onto the height field over its own floor, cap the
  // underside, and wall in whatever a neighbour does not cover: the outside of
  // the tile from floor to surface, and the step wherever two floors differ.
  function buildSolid(p, pieces, pockets) {
    var tris = [], edges = new Map(), Q = 1e4;
    var key = function (x, y) { return Math.round(x * Q) + ':' + Math.round(y * Q); };

    // A triangle with a repeated vertex -- a fan over a duplicated point, a wall
    // whose two heights coincide -- carries an edge and its reverse, so it
    // cancels against itself and can be dropped. Test for that, not for small
    // area: a genuinely thin sliver has three live edges, and deleting it tears
    // a hole in the surface.
    function tri(ax, ay, az, bx, by, bz, cx2, cy2, cz) {
      var q = function (v) { return Math.round(v * 1e4); };
      var A = q(ax) + ',' + q(ay) + ',' + q(az);
      var Bv = q(bx) + ',' + q(by) + ',' + q(bz);
      var C = q(cx2) + ',' + q(cy2) + ',' + q(cz);
      if (A === Bv || Bv === C || C === A) return;
      tris.push(ax, ay, az, bx, by, bz, cx2, cy2, cz);
    }
    // Vertical quad along a->b. Interior lies left of a->b, so this faces out.
    function wall(a, b, za0, zb0, za1, zb1) {
      tri(a[0], a[1], za0, b[0], b[1], zb0, b[0], b[1], zb1);
      tri(a[0], a[1], za0, b[0], b[1], zb1, a[0], a[1], za1);
    }

    // Which socket, if either, this plan edge runs along.
    // Grid lines cut the polygon edges into sub-segments whose ends sit on a
    // chord, inside the circumradius -- so test the whole boundary band, not
    // just the vertices. Getting this wrong leaves some of the rim extruded
    // flat and some lofted, which tears the mesh open.
    function pocketOn(a, b) {
      if (!pockets) return null;
      var inner = SPIKE.socketR * Math.cos(Math.PI / SPIKE.gon) - 0.05;
      var outer = SPIKE.socketR + 0.05;
      var on = function (q, c) {
        var d = Math.hypot(q[0] - c[0], q[1] - c[1]);
        return d >= inner && d <= outer;
      };
      for (var k = 0; k < pockets.length; k++)
        if (on(a, pockets[k].c) && on(b, pockets[k].c)) return pockets[k];
      return null;
    }

    // The socket wall, lofted instead of extruded: each plan point is pushed
    // along its own radius by however much the thread differs from the plain
    // bore. That offset is zero at both ends, so the rim and the ceiling still
    // land exactly on the plan polygon and the mesh stays one closed body.
    function threadWall(pk, a, b, z0, z1) {
      var c = pk.c;
      var ta = Math.atan2(a[1] - c[1], a[0] - c[0]);
      var tb = Math.atan2(b[1] - c[1], b[0] - c[0]);
      var ua = [Math.cos(ta), Math.sin(ta)], ub = [Math.cos(tb), Math.sin(tb)];
      var at = function (q, u, th, z) {
        var d = socketRadius(th, z) - SPIKE.socketR;
        return [q[0] + u[0] * d, q[1] + u[1] * d];
      };
      var zs = [z0], z;
      for (z = z0 + SPIKE.zStep; z < z1 - 1e-9; z += SPIKE.zStep) zs.push(z);
      zs.push(z1);
      for (var k = 0; k < zs.length - 1; k++) {
        var lo = zs[k], hi = zs[k + 1];
        var a0 = at(a, ua, ta, lo), b0 = at(b, ub, tb, lo);
        var a1 = at(a, ua, ta, hi), b1 = at(b, ub, tb, hi);
        tri(a0[0], a0[1], lo, b0[0], b0[1], lo, b1[0], b1[1], hi);
        tri(a0[0], a0[1], lo, b1[0], b1[1], hi, a1[0], a1[1], hi);
      }
    }

    pieces.forEach(function (pc) {
      var poly = pc.poly, f = pc.floor, rel = pc.rel || 0, n = poly.length, i;
      var h = poly.map(function (q) { return topOf(p, rel, q[0], q[1]); });
      for (i = 1; i < n - 1; i++) {
        tri(poly[0][0], poly[0][1], h[0],
            poly[i][0], poly[i][1], h[i],
            poly[i + 1][0], poly[i + 1][1], h[i + 1]);                 // surface
        tri(poly[0][0], poly[0][1], f,
            poly[i + 1][0], poly[i + 1][1], f,
            poly[i][0], poly[i][1], f);                                // underside
      }
      for (i = 0; i < n; i++) {
        var a = poly[i], b = poly[(i + 1) % n];
        var ka = key(a[0], a[1]), kb = key(b[0], b[1]);
        if (ka === kb) continue;
        var rev = kb + '|' + ka;
        if (edges.has(rev)) {
          var o = edges.get(rev);
          edges.delete(rev);
          if (Math.abs(o.f - f) > 1e-9) {          // socket wall
            var lo = f < o.f ? { a: a, b: b, f: f } : { a: o.a, b: o.b, f: o.f };
            var top = Math.max(f, o.f);
            var pk = pocketOn(lo.a, lo.b);
            if (pk) threadWall(pk, lo.a, lo.b, lo.f, top);
            else wall(lo.a, lo.b, lo.f, lo.f, top, top);
          }
          if (Math.abs(o.rel - rel) > 1e-9) {      // decal step, at the surface
            var hi = rel > o.rel ? { a: a, b: b, r: rel } : { a: o.a, b: o.b, r: o.rel };
            var lr = Math.min(rel, o.rel);
            wall(hi.a, hi.b,
                 topOf(p, lr, hi.a[0], hi.a[1]), topOf(p, lr, hi.b[0], hi.b[1]),
                 topOf(p, hi.r, hi.a[0], hi.a[1]), topOf(p, hi.r, hi.b[0], hi.b[1]));
          }
        } else edges.set(ka + '|' + kb, { a: a, b: b, f: f, rel: rel });
      }
    });

    edges.forEach(function (e) {
      var a = e.a, b = e.b, r = e.rel || 0;
      wall(a, b, e.f, e.f, topOf(p, r, a[0], a[1]), topOf(p, r, b[0], b[1]));
    });
    return tris;
  }

  // ------------------------------------------------------------ measures ----
  function measure(tris) {
    var vol = 0, areaUp = 0, areaDown = 0, areaSide = 0;
    var lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (var i = 0; i < tris.length; i += 9) {
      var ax = tris[i], ay = tris[i + 1], az = tris[i + 2];
      var bx = tris[i + 3], by = tris[i + 4], bz = tris[i + 5];
      var cx = tris[i + 6], cy = tris[i + 7], cz = tris[i + 8];
      vol += (ax * (by * cz - cy * bz) - ay * (bx * cz - cx * bz)
              + az * (bx * cy - cx * by)) / 6;
      var ux = bx - ax, uy = by - ay, uz = bz - az;
      var vx = cx - ax, vy = cy - ay, vz = cz - az;
      var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      var m = Math.hypot(nx, ny, nz);
      if (m > 0) {
        if (nz > 0.7 * m) areaUp += m / 2;
        else if (nz < -0.7 * m) areaDown += m / 2;
        else areaSide += m / 2;
      }
      for (var k = 0; k < 3; k++) {
        var v = [tris[i + k * 3], tris[i + k * 3 + 1], tris[i + k * 3 + 2]];
        for (var d = 0; d < 3; d++) {
          if (v[d] < lo[d]) lo[d] = v[d];
          if (v[d] > hi[d]) hi[d] = v[d];
        }
      }
    }
    return {
      volume: Math.abs(vol), areaUp: areaUp, areaDown: areaDown, areaSide: areaSide,
      size: [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]], min: lo
    };
  }

  // Filament from the actual shell the slicer will lay down, not a flat fudge
  // factor: top/bottom skins over their own areas, perimeters over the walls,
  // infill through whatever volume is left.
  var PRINT = { layer: 0.28, topLayers: 6, botLayers: 4, walls: 3, lineW: 0.42,
                infill: 0.15, density: 1.24e-3, flow: 8, plateMins: 6, plates: 0 };

  // Time is extruded volume over an average throughput, plus a fixed cost per
  // plate for heat-up, levelling and purge. `flow` is the one number that
  // carries the printer: it is a rough class figure, meant to be corrected from
  // a real slice.
  function estimate(m, print) {
    var s = Object.assign({}, PRINT, print || {});
    var shell = m.areaUp * s.topLayers * s.layer
              + m.areaDown * s.botLayers * s.layer
              + m.areaSide * s.walls * s.lineW;
    shell = Math.min(shell, m.volume);
    var used = shell + Math.max(0, m.volume - shell) * s.infill;
    return {
      volume: used,
      grams: used * s.density,
      hours: used / Math.max(0.1, s.flow) / 3600 + s.plates * s.plateMins / 60
    };
  }

  // ----------------------------------------------------------- spike part ---
  // A lofted tube: rings of radii up the z axis, so the helical thread is just
  // r(theta, z). Printed stud-down, tapering upward, so nothing overhangs.
  function spikeMesh(params) {
    var S = SPIKE, L = (params && params.spikeLen) || 6;
    var zChamf = S.studH, zFlange = zChamf + S.chamfer;
    var zTop = zFlange + S.flangeH, total = zTop + L;
    var inr = S.flangeR * Math.cos(Math.PI / 6);          // hex inradius

    function hexR(th) {
      var a = ((th % (Math.PI / 3)) + Math.PI / 3) % (Math.PI / 3);
      return inr / Math.cos(a - Math.PI / 6);
    }
    var threadR = spikeRadius;
    function rAt(th, z, band) {
      if (band === 'thread') return threadR(th, z);
      if (band === 'chamfer') {
        var t = (z - zChamf) / S.chamfer;
        return (1 - t) * threadR(th, zChamf) + t * hexR(th);
      }
      if (band === 'flange') return hexR(th);
      var u = (z - zTop) / L;
      return S.coneR + (S.tipR - S.coneR) * u;
    }

    var levels = [], z;
    for (z = 0; z < zChamf - 1e-9; z += S.pitch / 12) levels.push([z, 'thread']);
    levels.push([zChamf, 'thread']);
    for (z = zChamf + S.chamfer / 3; z < zFlange - 1e-9; z += S.chamfer / 3)
      levels.push([z, 'chamfer']);
    levels.push([zFlange, 'flange']);
    levels.push([zTop, 'flange']);
    levels.push([zTop, 'cone']);                          // flat step under the spike
    for (z = zTop + L / 8; z < total - 1e-9; z += L / 8) levels.push([z, 'cone']);
    levels.push([total, 'cone']);

    var N = S.seg, tris = [], i, k;
    var ring = levels.map(function (lv) {
      var pts = [];
      for (var a = 0; a < N; a++) {
        var th = 2 * Math.PI * a / N;
        var r = rAt(th, lv[0], lv[1]);
        pts.push([r * Math.cos(th), r * Math.sin(th), lv[0]]);
      }
      return pts;
    });
    function tri(a, b, c) { tris.push(a[0],a[1],a[2], b[0],b[1],b[2], c[0],c[1],c[2]); }

    for (k = 0; k < ring.length - 1; k++)
      for (i = 0; i < N; i++) {
        var j = (i + 1) % N;
        tri(ring[k][i], ring[k][j], ring[k + 1][j]);
        tri(ring[k][i], ring[k + 1][j], ring[k + 1][i]);
      }
    var bot = [0, 0, 0], top = [0, 0, total], last = ring[ring.length - 1];
    for (i = 0; i < N; i++) {
      var j2 = (i + 1) % N;
      tri(bot, ring[0][j2], ring[0][i]);                  // faces -z
      tri(top, last[i], last[j2]);                        // faces +z
    }
    return tris;
  }

  // ------------------------------------------------------------- export ----
  function stlBinary(tris, off) {
    var n = tris.length / 9, buf = new ArrayBuffer(84 + n * 50), dv = new DataView(buf);
    var enc = 'bikeramp';
    for (var c = 0; c < enc.length; c++) dv.setUint8(c, enc.charCodeAt(c));
    dv.setUint32(80, n, true);
    var p = 84;
    for (var i = 0; i < tris.length; i += 9) {
      var ax=tris[i],ay=tris[i+1],az=tris[i+2],bx=tris[i+3],by=tris[i+4],bz=tris[i+5],
          cx=tris[i+6],cy=tris[i+7],cz=tris[i+8];
      var ux=bx-ax,uy=by-ay,uz=bz-az,vx=cx-ax,vy=cy-ay,vz=cz-az;
      var nx=uy*vz-uz*vy, ny=uz*vx-ux*vz, nz=ux*vy-uy*vx;
      var m=Math.hypot(nx,ny,nz)||1;
      dv.setFloat32(p,nx/m,true); dv.setFloat32(p+4,ny/m,true); dv.setFloat32(p+8,nz/m,true);
      p += 12;
      for (var v = 0; v < 3; v++) {
        dv.setFloat32(p, tris[i+v*3]-off[0], true);
        dv.setFloat32(p+4, tris[i+v*3+1]-off[1], true);
        dv.setFloat32(p+8, tris[i+v*3+2]-off[2], true);
        p += 12;
      }
      dv.setUint16(p, 0, true); p += 2;
    }
    return new Uint8Array(buf);
  }

  var CRC = (function () {
    var t = new Int32Array(256);
    for (var i = 0; i < 256; i++) {
      var c = i;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[i] = c;
    }
    return function (b) {
      var c = -1;
      for (var i = 0; i < b.length; i++) c = (c >>> 8) ^ t[(c ^ b[i]) & 255];
      return (c ^ -1) >>> 0;
    };
  })();

  // Store-only ZIP. STL is already dense; compression would buy little.
  function zip(files) {
    var parts = [], central = [], offset = 0, enc = new TextEncoder();
    files.forEach(function (f) {
      var name = enc.encode(f.name), crc = CRC(f.data), n = f.data.length;
      var h = new Uint8Array(30 + name.length), d = new DataView(h.buffer);
      d.setUint32(0, 0x04034b50, true); d.setUint16(4, 20, true);
      d.setUint32(14, crc, true); d.setUint32(18, n, true); d.setUint32(22, n, true);
      d.setUint16(26, name.length, true);
      h.set(name, 30);
      parts.push(h, f.data);

      var cd = new Uint8Array(46 + name.length), c = new DataView(cd.buffer);
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true);
      c.setUint32(16, crc, true); c.setUint32(20, n, true); c.setUint32(24, n, true);
      c.setUint16(28, name.length, true); c.setUint32(42, offset, true);
      cd.set(name, 46);
      central.push(cd);
      offset += h.length + n;
    });
    var csize = central.reduce(function (s, c) { return s + c.length; }, 0);
    var end = new Uint8Array(22), e = new DataView(end.buffer);
    e.setUint32(0, 0x06054b50, true);
    e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
    e.setUint32(12, csize, true); e.setUint32(16, offset, true);
    return new Blob(parts.concat(central, [end]), { type: 'application/zip' });
  }


  // ----------------------------------------------------------------- api ----
  function build(params) {
    var q = params || {};
    var p = Object.assign({}, DEFAULTS, q);
    if (q.maxPrint != null) {        // convenience alias for a square bed
      if (q.bedX == null) p.bedX = q.maxPrint;
      if (q.bedY == null) p.bedY = q.maxPrint;
    }
    p._decal = decalRects(p);
    p.cell = meshCell(p);
    var t = tiling(p);
    var tiles = [], total = { volume: 0, areaUp: 0, areaDown: 0, areaSide: 0 };
    for (var i = 0; i < t.nx; i++) {
      for (var j = 0; j < t.ny; j++) {
        var tris = tileMesh(p, t, i, j);
        var m = measure(tris);
        tiles.push({ i: i, j: j, name: 'tile_' + i + j, tris: tris, m: m,
                     spots: spikeSpots(p, t, i, j),
                     origin: [i * t.px, j * t.py] });
        total.volume += m.volume; total.areaUp += m.areaUp;
        total.areaDown += m.areaDown; total.areaSide += m.areaSide;
      }
    }
    var biggest = tiles.reduce(function (a, b) {
      return Math.max(b.m.size[0], b.m.size[1]) > Math.max(a.m.size[0], a.m.size[1]) ? b : a;
    });
    // A tile can be turned on the plate, so compare long-to-long, short-to-short.
    var tw = Math.max(biggest.m.size[0], biggest.m.size[1]);
    var th = Math.min(biggest.m.size[0], biggest.m.size[1]);
    var bw = Math.max(p.bedX, p.bedY), bh = Math.min(p.bedX, p.bedY);
    return {
      params: p, tiling: t, tiles: tiles, total: total,
      slope: maxSlopeDeg(p),
      slopeLabel: p.shape === 'kicker' ? 'Takeoff'
                : p.shape === 'drop' ? 'Approach' : 'Max slope',
      biggest: biggest,
      spikes: tiles.reduce(function (n, q) { return n + q.spots.length; }, 0),
      fits: tw <= bw + 1e-6 && th <= bh + 1e-6,
      // fits, but only if you rotate it on the bed
      turn: !(biggest.m.size[0] <= p.bedX + 1e-6 && biggest.m.size[1] <= p.bedY + 1e-6),
      over: Math.max(tw - bw, th - bh),
      estimate: estimate(total, { flow: p.flow, plates: tiles.length })
    };
  }

  var api = { DEFAULTS: DEFAULTS, PRINT: PRINT, build: build, tiling: tiling,
              hAt: hAt, profX: profX, profY: profY, maxSlopeDeg: maxSlopeDeg,
              measure: measure, estimate: estimate, tileMesh: tileMesh,
              stlBinary: stlBinary, zip: zip,
              SPIKE: SPIKE, spikeSpots: spikeSpots, spikeMesh: spikeMesh,
              socketRadius: socketRadius, spikeRadius: spikeRadius,
              decalRects: decalRects, reliefAt: reliefAt,
              threadCrest: threadCrest,
              xseamTabs: xseamTabs, yseamTabs: yseamTabs };

  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BikeRamp = api;
})(this);
