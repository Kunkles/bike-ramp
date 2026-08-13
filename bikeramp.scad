// ============================================================================
//  bikeramp.scad  --  printable coasting hill for a toddler balance bike
//
//  Generates a smooth cosine "roller" hill, auto-split into bed-sized tiles
//  that lock together with drop-in dovetails.
//
//  Render one tile:   openscad -D 'part="tile"' -D tile_i=0 -D tile_j=0 -o t.stl bikeramp.scad
//  Preview the hill:  openscad -D 'part="hill"' bikeramp.scad
//  See ./render.sh for batch export.
// ============================================================================

/* [Hill] */
shape       = "roller";  // "roller" = up and back down
                         // "drop"   = rise, flat deck, then a vertical step off
                         // "kicker" = curved launch, steepest at the lip
deck        = 150;   // drop only: flat run before the edge (mm)
hill_length = 600;   // total run, front toe to back toe (mm)
hill_width  = 300;   // riding width (mm)
hill_height = 45;    // crest height (mm)
humps       = 1;     // 1 = single hill, 2 = camel back, ...
bevel_run   = 90;    // side taper: outer this-many mm slope down to the floor. 0 = vertical sides
edge_lip    = 1.2;   // thickness at the toe and outer edges. Raising it makes the edge
                     // sturdier but shrinks the fully-solid zone near the toe

/* [Printer] */
bed_x       = 250;   // usable bed along the run.   X1C is 256; 250 leaves margin
bed_y       = 250;   // usable bed across the width. A MK4 would be 244 x 204

/* [Joints] */
tab_depth   = 12;
tab_neck    = 18;    // width where the dovetail meets the tile (narrow)
tab_tip     = 26;    // width at the tip (wide -> locks)
fit         = 0.35;  // clearance cut into the matching socket, per side
min_tab_h   = 10;    // skip dovetails where the hill is shorter than this

/* [Ground spikes] */
spike_len     = 0;    // spike protrusion below the tile, mm. 0 = no sockets at all
socket_depth  = 11;
socket_roof   = 5;    // material left between socket ceiling and riding surface
socket_gon    = 24;
spike_clear   = 0.25; // radial clearance, spike to socket
thread_lead   = 1.5;  // plain bore at the mouth, to start the screw
thread_relief = 1.5;  // plain bore at the far end, so the ceiling closes flat
spike_inset   = 30;   // keep sockets clear of tile edges and their dovetails
spike_scan    = 10;   // grid the tile is searched on for its thickest point
spike_minor   = 6.5;  // thread core radius
spike_major   = 7.45; // thread crest radius
spike_pitch   = 3.0;
spike_stud    = 10;
spike_chamfer = 1.5;
spike_flange_r= 9.0;  // hex flange, circumradius. Grip it to screw the spike in
spike_flange_h= 1.5;
spike_cone_r  = 7.5;
spike_tip_r   = 0.6;

/* [Decals] */
decal        = "none";  // "none" | "text" | "checker" | "both"
decal_text   = "LITTLE RIPPER";
decal_relief = 1.2;     // how far the decal stands proud of the flank (mm)

/* [Grip] */
grip_depth  = 0;     // 0 = smooth. 0.6 gives shallow traction grooves
grip_pitch  = 14;
grip_width  = 4;

/* [Output] */
part      = "tile";  // "tile" | "hill" | "mono" | "spike" | "body"
body_rel  = 0;       // "body": which relief level to skin, for multi-material
body_skin = 0.9;     // how deep that skin runs
tile_i = 0;          // tile index along the run
tile_j = 0;          // tile index across the width

/* [Hidden] */
$fn = 32;
STEPS = 160;         // profile resolution
BIG   = 1000;

// ---------------------------------------------------------------- tiling ----
// Tiles carry a dovetail past their nominal pitch, so the printable span is the
// bed less one tab. Beds are often oblong, so lay the grid out both ways round
// and keep whichever needs fewer plates.
bx = max(1, bed_x - tab_depth);
by = max(1, bed_y - tab_depth);
nx_a = max(1, ceil(hill_length / bx));  ny_a = max(1, ceil(hill_width / by));
nx_b = max(1, ceil(hill_length / by));  ny_b = max(1, ceil(hill_width / bx));
turned = nx_b * ny_b < nx_a * ny_a;

nx = turned ? nx_b : nx_a;
ny = turned ? ny_b : ny_a;
px = hill_length / nx;   // tile pitch along the run
py = hill_width  / ny;   // tile pitch across the width

// ---------------------------------------------------------------- profile ---
// Three lengthwise profiles. "roller" returns to the ground; "drop" and
// "kicker" both finish at full height, so the far end is a vertical face.
function prof_x(x) =
    let (h = hill_height - edge_lip, L = hill_length)
    shape == "drop"
      ? let (rise = max(1, L - min(deck, L * 0.8)))
        (x >= rise ? hill_height
                   : edge_lip + h * 0.5 * (1 - cos(180 * min(1, max(0, x / rise)))))
  : shape == "kicker"
      ? (h < 0.01 ? edge_lip
         : let (R = (L * L + h * h) / (2 * h), xx = min(max(x, 0), L))
           edge_lip + R - sqrt(max(0, R * R - xx * xx)))
  : edge_lip + h / 2 * (1 - cos(360 * humps * x / L));

// Steepest gradient the rider meets: the lip on a kicker, the approach on a drop.
function max_slope() =
    let (h = hill_height - edge_lip, L = hill_length)
    shape == "drop"   ? atan(PI * h / (2 * max(1, L - min(deck, L * 0.8))))
  : shape == "kicker" ? (h < 0.01 ? 0
                         : let (R = (L * L + h * h) / (2 * h))
                           atan(L / max(1e-9, R - h)))
  : atan(PI * humps * h / L);

// Crosswise: flat in the middle, tapering to the floor over bevel_run.
function prof_y(y) =
    bevel_run <= 0
      ? hill_height
      : edge_lip + (hill_height - edge_lip)
          * min(1, max(0, min(y, hill_width - y) / bevel_run));

function h_at(x, y) = min(prof_x(x), prof_y(y));

// ------------------------------------------------------------ hill solid ----
// The lengthwise sweep is floored at z=0, so it alone bounds the solid below.
// The crosswise sweep runs well below zero, which lets it be raised by the
// decal relief without lifting the underside off the bed.
module sweep_x() {
    translate([0, hill_width + BIG, 0])
        rotate([90, 0, 0])
            linear_extrude(hill_width + 2 * BIG)
                polygon(concat(
                    [[0, 0]],
                    [for (i = [0 : STEPS])
                        let (x = i * hill_length / STEPS) [x, prof_x(x)]],
                    [[hill_length, 0]]
                ));
}
module sweep_y() {
    translate([-BIG, 0, 0])
        rotate([0, 0, 90]) rotate([90, 0, 0])
            linear_extrude(hill_length + 2 * BIG)
                polygon(concat(
                    [[0, -BIG]],
                    [for (i = [0 : STEPS])
                        let (y = i * hill_width / STEPS) [y, prof_y(y)]],
                    [[hill_width, -BIG]]
                ));
}

module hill_solid() {
    if (decal == "none" || bevel_run <= 0 || len(decal_rects()) == 0) {
        intersection() { sweep_x(); sweep_y(); }
    } else {
        // h = min(prof_x, prof_y + relief) inside the decal blocks, h unchanged
        // outside -- so union the plain hill with the raised hill clipped to
        // the blocks. The min() is what keeps a decal from ever standing above
        // the riding surface.
        // One pass per distinct relief. Checker squares stand at half the
        // relief and letters at all of it, so raising every proud block by the
        // same amount would lift the checker twice as far as it should.
        difference() {
            union() {
                intersection() { sweep_x(); sweep_y(); }
                for (lv = [decal_relief / 2, decal_relief])
                    intersection() {                   // proud blocks
                        sweep_x();
                        translate([0, 0, lv]) sweep_y();
                        decal_prisms_at(lv);
                    }
            }
            intersection() {                           // sunk blocks
                difference() {
                    decal_prisms_at(decal_down());
                    decal_prisms_at(decal_relief / 2);
                    decal_prisms_at(decal_relief);
                }
                difference() {
                    intersection() { sweep_x(); sweep_y(); }
                    intersection() {
                        sweep_x();
                        translate([0, 0, decal_down()]) sweep_y();
                    }
                }
            }
        }
    }
}

// --------------------------------------------------------------- decals -----
// A blocky 5x7 stencil: every edge is axis-aligned, which keeps the letters
// crisp and matches the mesh generator block for block.
DECAL_KEYS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -.'!";
DECAL_FONT = [
    [".###.","#...#","#...#","#####","#...#","#...#","#...#"],
    ["####.","#...#","####.","#...#","#...#","#...#","####."],
    [".####","#....","#....","#....","#....","#....",".####"],
    ["####.","#...#","#...#","#...#","#...#","#...#","####."],
    ["#####","#....","####.","#....","#....","#....","#####"],
    ["#####","#....","####.","#....","#....","#....","#...."],
    [".####","#....","#....","#..##","#...#","#...#",".####"],
    ["#...#","#...#","#####","#...#","#...#","#...#","#...#"],
    ["#####","..#..","..#..","..#..","..#..","..#..","#####"],
    ["####.","...#.","...#.","...#.","...#.","#..#.",".##.."],
    ["#...#","#..#.","##...","##...","#.#..","#..#.","#...#"],
    ["#....","#....","#....","#....","#....","#....","#####"],
    ["#...#","##.##","#.#.#","#...#","#...#","#...#","#...#"],
    ["#...#","##..#","#.#.#","#..##","#...#","#...#","#...#"],
    [".###.","#...#","#...#","#...#","#...#","#...#",".###."],
    ["####.","#...#","#...#","####.","#....","#....","#...."],
    [".###.","#...#","#...#","#...#","#.#.#","#..#.",".##.#"],
    ["####.","#...#","#...#","####.","#.#..","#..#.","#...#"],
    [".####","#....","#....",".###.","....#","....#","####."],
    ["#####","..#..","..#..","..#..","..#..","..#..","..#.."],
    ["#...#","#...#","#...#","#...#","#...#","#...#",".###."],
    ["#...#","#...#","#...#","#...#","#...#",".#.#.","..#.."],
    ["#...#","#...#","#...#","#...#","#.#.#","##.##","#...#"],
    ["#...#",".#.#.","..#..","..#..","..#..",".#.#.","#...#"],
    ["#...#",".#.#.","..#..","..#..","..#..","..#..","..#.."],
    ["#####","....#","...#.","..#..",".#...","#....","#####"],
    [".###.","#..##","#.#.#","#.#.#","##..#","#...#",".###."],
    ["..#..",".##..","..#..","..#..","..#..","..#..",".###."],
    [".###.","#...#","....#","...#.","..#..",".#...","#####"],
    ["####.","....#","....#",".###.","....#","....#","####."],
    ["#..#.","#..#.","#..#.","#####","...#.","...#.","...#."],
    ["#####","#....","####.","....#","....#","#...#",".###."],
    [".###.","#....","####.","#...#","#...#","#...#",".###."],
    ["#####","....#","...#.","..#..",".#...",".#...",".#..."],
    [".###.","#...#","#...#",".###.","#...#","#...#",".###."],
    [".###.","#...#","#...#",".####","....#","....#",".###."],
    [".....",".....",".....",".....",".....",".....","....."],
    [".....",".....",".....","#####",".....",".....","....."],
    [".....",".....",".....",".....",".....",".##..",".##.."],
    ["..#..","..#..",".....",".....",".....",".....","....."],
    ["..#..","..#..","..#..","..#..","..#..",".....","..#.."]
];

function decal_glyph(ch) =
    let (i = search(ch, DECAL_KEYS)) len(i) == 0 ? undef : DECAL_FONT[i[0]];

// Blocks in (x, d), d being distance in from the nearer side, so one list
// serves both flanks and each reads the right way round from its own side.
// Never sink so far that the flank meets the ground.
function decal_down() =
    -min(decal_relief / 2, max(0, prof_y(bevel_run * 0.08) - 0.6));

// Every square is either proud or sunk -- raising only the odd ones leaves the
// rest indistinguishable from the flank, so the band has no edge. Each square
// is inset so a flat grout line runs between them: butted up, four would meet
// at a point with alternating heights, which no surface can close.
function decal_checker() =
    (decal != "checker" && decal != "both") ? []
    : let (sq = max(6, min(14, bevel_run * 0.11)),
           d0 = bevel_run * 0.08,
           n  = floor(hill_length / sq),
           pad = (hill_length - n * sq) / 2,
           e = 0.15, half = decal_relief / 2,
           bx1 = pad + n * sq, bd1 = d0 + 2 * sq)
      concat(
        // proud squares, grown inward only so the band keeps a clean outer edge
        [for (i = [0 : max(0, n - 1)], r = [0 : 1]) if ((i + r) % 2 == 0)
           let (a = pad + i * sq, b = d0 + r * sq)
           [max(pad, a - e), max(d0, b - e),
            min(bx1, a + sq + e), min(bd1, b + sq + e), half]],
        [for (i = [0 : max(0, n - 1)], r = [0 : 1]) if ((i + r) % 2 != 0)
           let (a = pad + i * sq, b = d0 + r * sq)
           [a, b, a + sq, b + sq, decal_down()]]);

function decal_words() =
    let (raw = [for (w = split_words(decal_text)) [for (c = [0 : max(0, len(w) - 1)])
                  if (!is_undef(decal_glyph(w[c]))) w[c]]])
    [for (w = raw) if (len(w) > 0) w];

function split_words(t, i = 0, cur = "", acc = []) =
    i >= len(t) ? (cur == "" ? acc : concat(acc, [cur]))
    : t[i] == " " ? split_words(t, i + 1, "", cur == "" ? acc : concat(acc, [cur]))
    : split_words(t, i + 1, str(cur, t[i]), acc);

// The widest run of hill that no joint interrupts, preferring the tallest --
// lettering on a toe would be clamped flat by the riding surface.
function text_cuts() =
    let (pad = tab_depth + 1.5)
    concat([0], [for (i = [1 : max(1, nx - 1)]) if (i < nx) each [i * px - pad, i * px + pad]],
           [hill_length]);

function text_span() =
    let (c = text_cuts(),
         iv = [for (i = [0 : 2 : len(c) - 2]) if (c[i + 1] - c[i] >= 20) [c[i], c[i + 1]]],
         best = max([for (v = iv) prof_x((v[0] + v[1]) / 2)]))
    len(iv) == 0 ? [0, hill_length]
    : [for (v = iv) if (prof_x((v[0] + v[1]) / 2) >= best - 1e-9) v][0];

function decal_letters() =
    (decal != "text" && decal != "both") ? []
    : let (ws = decal_words(), nl = len(ws))
      nl == 0 ? []
      : let (sp = text_span(),
             lo = (decal == "both") ? bevel_run * 0.36 : bevel_run * 0.26,
             hmin = min([for (q = [0 : 8]) prof_x(sp[0] + (sp[1] - sp[0]) * (0.1 + 0.1 * q))]),
             dfold = bevel_run * max(0, min(1, (hmin - edge_lip)
                                            / max(1e-6, hill_height - edge_lip))),
             hi = min(bevel_run * 0.82, dfold - 2))
        (hi - lo < 6) ? []
        : let (gap = 2,
               rows_tot = nl * 7 + (nl - 1) * gap,
               widest = max([for (w = ws) len(w)]),
               pxu = min((hi - lo) / rows_tot, (sp[1] - sp[0]) * 0.9 / (widest * 6 - 1)),
               base = lo + ((hi - lo) - rows_tot * pxu) / 2,
               mid = (sp[0] + sp[1]) / 2)
          [for (li = [0 : nl - 1], k = [0 : len(ws[li]) - 1], r = [0 : 6], c = [0 : 4])
             if (decal_glyph(ws[li][k])[6 - r][c] == "#")
               let (x0 = mid - ((len(ws[li]) * 6 - 1) * pxu) / 2,
                    yl = base + (nl - 1 - li) * (7 + gap) * pxu)
               // grow in x only: a diagonal neighbour then shares a real edge
               // rather than a point, with no sliver between stacked rows
               [x0 + (k * 6 + c) * pxu - 0.15, yl + r * pxu,
                x0 + (k * 6 + c + 1) * pxu + 0.15, yl + (r + 1) * pxu,
                decal_relief]];

// Keep decals out of the joint zone -- the seam and the dovetail either side of
// it. Relief on a tab or in a socket fouls the fit, and the tiles are separate
// prints anyway, so a letter spanning a joint would read as broken regardless.
function trim_x(rects, c, pad) =
    [for (r = rects) each
       (r[2] <= c - pad || r[0] >= c + pad) ? [r]
       : concat(r[0] < c - pad ? [[r[0], r[1], c - pad, r[3], r[4]]] : [],
                r[2] > c + pad ? [[c + pad, r[1], r[2], r[3], r[4]]] : [])];
function trim_d(rects, c, pad) =
    [for (r = rects) each
       (r[3] <= c - pad || r[1] >= c + pad) ? [r]
       : concat(r[1] < c - pad ? [[r[0], r[1], r[2], c - pad, r[4]]] : [],
                r[3] > c + pad ? [[r[0], c + pad, r[2], r[3], r[4]]] : [])];
function fold_x(rects, cuts, pad, i = 0) =
    i >= len(cuts) ? rects : fold_x(trim_x(rects, cuts[i], pad), cuts, pad, i + 1);
function fold_d(rects, cuts, pad, i = 0) =
    i >= len(cuts) ? rects : fold_d(trim_d(rects, cuts[i], pad), cuts, pad, i + 1);

function decal_rects() =
    let (pad = tab_depth + 1.5,
         cx = [for (i = [1 : max(1, nx - 1)]) if (i < nx) i * px],
         cd = [for (i = [1 : max(1, ny - 1)]) if (i < ny) each [i * py, hill_width - i * py]],
         a = fold_x(concat(decal_checker(), decal_letters()), cx, pad),
         b = fold_d(a, cd, pad))
    [for (r = b) if (r[2] - r[0] > 0.4 && r[3] - r[1] > 0.4) r];

// The far flank is viewed from the opposite direction, where the run reads the
// other way, so it is mirrored along the length -- otherwise the lettering comes
// out backwards on that side.
module decal_prisms_at(rel) {
    union()
        for (r = decal_rects()) if (abs(r[4] - rel) < 1e-9) {
            translate([r[0], r[1], -1])
                cube([r[2] - r[0], r[3] - r[1], BIG]);
            translate([hill_length - r[2], hill_width - r[3], -1])
                cube([r[2] - r[0], r[3] - r[1], BIG]);
        }
}

// --------------------------------------------------------------- dovetail ---
// 2D dovetail pointing +X, root centred on the origin.
module dovetail_2d(grow = 0) {
    offset(delta = grow)
        polygon([[0, -tab_neck / 2],
                 [tab_depth,  -tab_tip / 2],
                 [tab_depth,   tab_tip / 2],
                 [0,  tab_neck / 2]]);
}

// How many dovetails fit on a seam of the given span, and where.
function n_tabs(span) = max(1, round(span / 120));
function tab_pos(span, k) = (k + 0.5) * span / n_tabs(span);

// Seam at constant x = xs, running in y from y0 to y0+span.
// Only keep tabs where there is enough material to make them worthwhile.
function xseam_tabs(xs, y0, span) =
    [for (k = [0 : n_tabs(span) - 1])
        let (p = y0 + tab_pos(span, k))
        if (h_at(xs, p) >= min_tab_h) p];

// Seam at constant y = ys, running in x from x0 to x0+span.
function yseam_tabs(ys, x0, span) =
    [for (k = [0 : n_tabs(span) - 1])
        let (p = x0 + tab_pos(span, k))
        if (h_at(p, ys) >= min_tab_h) p];

// ------------------------------------------------------- tile footprint -----
// Plan-view outline of tile (i,j): the rectangle, plus dovetails on its +X and
// +Y seams, minus sockets on its -X and -Y seams. Neighbours therefore always
// agree, and every tile still drops straight down into place.
module tile_footprint(i, j) {
    x0 = i * px;  x1 = (i + 1) * px;
    y0 = j * py;  y1 = (j + 1) * py;

    difference() {
        union() {
            square([px, py]);

            if (i < nx - 1)
                for (p = xseam_tabs(x1, y0, py))
                    translate([px, p - y0]) dovetail_2d();

            if (j < ny - 1)
                for (p = yseam_tabs(y1, x0, px))
                    translate([p - x0, py]) rotate(90) dovetail_2d();
        }

        if (i > 0)
            for (p = xseam_tabs(x0, y0, py))
                translate([0, p - y0]) dovetail_2d(fit);

        if (j > 0)
            for (p = yseam_tabs(y0, x0, px))
                translate([p - x0, 0]) rotate(90) dovetail_2d(fit);
    }
}

module tile_prism(i, j, inset = 0) {
    translate([i * px, j * py, -BIG / 2])
        linear_extrude(BIG)
            offset(delta = -inset)
                tile_footprint(i, j);
}

// --------------------------------------------------------- spike sockets ----
// One socket per tile, at the thickest point of the area that clears the tile
// edges and their dovetails. Tiles too thin to swallow one simply get none.
function spike_cands(i, j) =
    let (x0 = i * px + spike_inset, x1 = (i + 1) * px - spike_inset,
         y0 = j * py + spike_inset, y1 = (j + 1) * py - spike_inset)
    (x1 < x0 || y1 < y0) ? []
    : [for (a = [0 : floor((x1 - x0) / spike_scan)],
            b = [0 : floor((y1 - y0) / spike_scan)])
         let (x = x0 + a * spike_scan, y = y0 + b * spike_scan) [x, y, h_at(x, y)]];

function spike_spot(i, j) =
    let (c = spike_cands(i, j))
    len(c) == 0 ? []
    : let (best = max([for (q = c) q[2]]))
      best < socket_depth + socket_roof ? []
      : [ [for (q = c) if (q[2] >= best - 1e-9) [q[0], q[1]]][0] ];

// The socket carries the spike's own thread form, pushed out by the clearance,
// so the two mate at every point. Plain bore at both ends: a lead-in to start
// the screw, and a relief so the ceiling closes flat.
socket_crest_r = spike_minor + spike_clear;   // bore at its tightest
socket_r       = spike_major + spike_clear;   // groove, and the plain bore

function socket_profile(n) =
    [for (k = [0 : n - 1])
        let (a = 360 * k / n, u = k / n, t = 1 - abs(2 * u - 1),
             r = socket_crest_r + (socket_r - socket_crest_r) * t)
        [r * cos(a), r * sin(a)]];

module socket_bore() {
    th = socket_depth - thread_lead - thread_relief;
    union() {
        translate([0, 0, -1])
            cylinder(h = thread_lead + 1, r = socket_r, $fn = socket_gon);
        translate([0, 0, thread_lead])
            linear_extrude(height = th, twist = -360 * th / spike_pitch,
                           slices = ceil(th * 12), convexity = 8)
                polygon(socket_profile(socket_gon));
        translate([0, 0, socket_depth - thread_relief])
            cylinder(h = thread_relief, r = socket_r, $fn = socket_gon);
    }
}

// A thin skin under the visible surface of one relief level, for AMS printing.
// It overlaps the tile rather than being cut from it -- a slicer resolves
// overlapping parts of one object in favour of the later part. Proud blocks are
// grown and win where they meet sunk ones, so a sunk skin has them removed.
module colour_body(rel, skin) {
    intersection() {
        difference() {
            decal_prisms_at(rel);
            if (rel < 0) {
                decal_prisms_at(decal_relief / 2);
                decal_prisms_at(decal_relief);
            }
        }
        difference() {
            intersection() { sweep_x(); translate([0, 0, rel]) sweep_y(); }
            intersection() { sweep_x(); translate([0, 0, rel - skin]) sweep_y(); }
        }
    }
}

module spike_sockets(i, j) {
    if (spike_len > 0)
        for (q = spike_spot(i, j))
            translate([q[0], q[1], 0]) socket_bore();
}

// The spike itself. Printed stud-down, tapering upward, so nothing overhangs.
// Its coarse thread forms its own groove in the plain socket and backs out again.
function thread_profile(n = 72) =
    [for (k = [0 : n - 1])
        let (a = 360 * k / n, u = k / n, t = 1 - abs(2 * u - 1),
             r = spike_minor + (spike_major - spike_minor) * t)
        [r * cos(a), r * sin(a)]];

module spike_part() {
    zf = spike_stud + spike_chamfer;
    zt = zf + spike_flange_h;
    union() {
        linear_extrude(height = spike_stud, twist = -360 * spike_stud / spike_pitch,
                       slices = ceil(spike_stud * 8), convexity = 8)
            polygon(thread_profile());
        translate([0, 0, spike_stud])
            cylinder(h = spike_chamfer, r1 = spike_major, r2 = spike_flange_r, $fn = 6);
        translate([0, 0, zf]) cylinder(h = spike_flange_h, r = spike_flange_r, $fn = 6);
        translate([0, 0, zt])
            cylinder(h = max(0.1, spike_len), r1 = spike_cone_r, r2 = spike_tip_r, $fn = 48);
    }
}

// ------------------------------------------------------------ grip combs ----
module grip_cut() {
    if (grip_depth > 0)
        intersection() {
            difference() {
                hill_solid();
                translate([0, 0, -grip_depth]) hill_solid();
            }
            for (x = [grip_pitch : grip_pitch : hill_length - grip_pitch])
                translate([x - grip_width / 2, -BIG / 2, -BIG / 2])
                    cube([grip_width, BIG, BIG]);
        }
}

// ----------------------------------------------------------------- tiles ----
module tile_solid(i, j) {
    difference() {
        intersection() { hill_solid(); tile_prism(i, j); }
        grip_cut();
        spike_sockets(i, j);
    }
}

module tile(i, j) {
    translate([-i * px, -j * py, 0])       // drop it on the origin for printing
        tile_solid(i, j);
}

// ------------------------------------------------------------------ main ----
if (part == "hill")
    for (i = [0 : nx - 1], j = [0 : ny - 1])
        translate([i * px, j * py, 0]) tile(i, j);
else if (part == "spike")
    spike_part();
else if (part == "body")
    colour_body(body_rel, body_skin);
else if (part == "mono")          // uncut hill, for checking the joints
    difference() { hill_solid(); grip_cut(); }
else
    tile(tile_i, tile_j);

echo(str("tiles: ", nx, " x ", ny, " = ", nx * ny,
         "   pitch ", px, " x ", py,
         "   printed extent up to ", px + tab_depth, " x ", py + tab_depth,
         "   ", shape, " max slope ", max_slope(), " deg"));
