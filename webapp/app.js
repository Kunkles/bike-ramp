(function () {
  'use strict';
  var BR = window.BikeRamp;
  var DK = window.BikeRampDeck;

  // ------------------------------------------------------------------ state --
  var state = null, result = null;

  var PRESETS = {
    'First hill':  { shape:'roller', hillLength:600, hillWidth:300, hillHeight:45,
                     humps:1, bevelRun:90 },
    'Taller':      { shape:'roller', hillLength:800, hillWidth:340, hillHeight:70,
                     humps:1, bevelRun:100 },
    'Camel back':  { shape:'roller', hillLength:1000, hillWidth:300, hillHeight:50,
                     humps:2, bevelRun:90 },
    'Wide & low':  { shape:'roller', hillLength:700, hillWidth:480, hillHeight:35,
                     humps:1, bevelRun:130 },
    'Step drop':   { shape:'drop', hillLength:500, hillWidth:300, hillHeight:50,
                     deck:150, bevelRun:90 },
    'Little jump': { shape:'kicker', hillLength:350, hillWidth:300, hillHeight:40,
                     bevelRun:90 }
  };

  var SHAPES = [
    { v:'roller', label:'Roller',
      hint:'Up and back down. Nothing to catch a wheel at either end.' },
    { v:'drop',   label:'Step drop',
      hint:'Rises, runs flat, then stops at a vertical edge. Height is the drop.' },
    { v:'kicker', label:'Curved jump',
      hint:'Curved launch, steepest at the lip, vertical behind it.' }
  ];

  // Nominal bed sizes; BED_MARGIN comes off each axis for clearance at the edge.
  // `flow` is a rough throughput class in mm^3/s -- it is what makes the time
  // estimate differ between machines, and it is meant to be corrected from a
  // real slice.
  var BED_MARGIN = 6;
  var PRINTERS = [
    { name:'Bambu Lab X1C / X1E / P1S / P1P', x:256, y:256, flow:11 },
    { name:'Bambu Lab A1',                    x:256, y:256, flow:9 },
    { name:'Bambu Lab A1 mini',               x:180, y:180, flow:9 },
    { name:'Bambu Lab H2S',                   x:340, y:320, flow:12 },
    { name:'Bambu Lab H2D / H2D Pro',         x:325, y:320, flow:12,
      note:'H2D figures are the single-nozzle printable area. The headline ' +
           '350 mm width only applies with both nozzles loaded with the same ' +
           'filament.' },
    { name:'Prusa MK4S / MK4 / MK3S+',        x:250, y:210, flow:8 },
    { name:'Prusa MINI+',                     x:180, y:180, flow:5 },
    { name:'Prusa XL',                        x:360, y:360, flow:8 },
    { name:'Creality Ender 3 / V2 / S1',      x:220, y:220, flow:4 },
    { name:'Creality K1 / K1C',               x:220, y:220, flow:10 },
    { name:'Creality K1 Max',                 x:300, y:300, flow:10 },
    { name:'Voron 2.4 / Trident (350)',       x:350, y:350, flow:11 }
  ];

  // Start on the first machine in the list, so the dropdown, the bed and the
  // throughput all agree on load.
  state = Object.assign({}, BR.DEFAULTS, {
    bedX: PRINTERS[0].x - BED_MARGIN,
    bedY: PRINTERS[0].y - BED_MARGIN,
    flow: PRINTERS[0].flow,
    spikeLen: 6, infill: 0.25, ams: false, mode: 'assembled', isolate: null,
    build: 'solid',                 // 'solid' | 'deck'
    bike: true,                     // scale reference in the viewport
    colours: ['#FF2E88', '#25E3D8', '#FFE14D', '#1A1728'],
    paint: 0
  });

  // Which colour a point on the surface takes, matching the bodies the download
  // splits out: body, letters, proud squares, sunk squares.
  var REGIONS = [
    { i:0, label:'Body' },
    { i:1, label:'Letters', needs:['text', 'both'] },
    { i:2, label:'Checker A', needs:['checker', 'both'] },
    { i:3, label:'Checker B', needs:['checker', 'both'] }
  ];
  function regionAt(p, x, y) {
    if (!p._decal || !p._decal.length) return 0;
    var r = BR.reliefAt(p, x, y);
    if (Math.abs(r) < 1e-9) return 0;
    if (r > p.decalRelief * 0.75) return 1;
    return r > 0 ? 2 : 3;
  }

  var DECAL_OPTS = [
    { label:'None',    v:'none' },
    { label:'Checker', v:'checker' },
    { label:'Text',    v:'text' },
    { label:'Both',    v:'both' }
  ];

  var SPIKE_OPTS = [
    { label:'None',    v:0 },
    { label:'1/4 in',  v:6 },
    { label:'1/2 in',  v:13 },
    { label:'1 in',    v:25 }
  ];

  // Haro teal, hot magenta, acid yellow -- 1988 in a spool.
  var FILAMENTS = ['#FF2E88','#25E3D8','#FFE14D','#7A45E8','#39C85B','#FF6B1A',
                   '#F2EFE4','#1A1728'];

  var CONTROLS = [
    { group:'Hill', custom:'shape', items:[
      { k:'hillLength', label:'Length',     min:120, max:2000, step:10, unit:'mm',
        hint:'Toe to toe. Longer is gentler.' },
      { k:'deck',       label:'Deck',       min:30,  max:400,  step:10, unit:'mm',
        hint:'Flat run between the top of the rise and the edge.',
        show:function () { return state.shape === 'drop'; } },
      { k:'hillWidth',  label:'Width',      min:150, max:900,  step:10, unit:'mm' },
      { k:'hillHeight', label:'Height',     min:15,  max:150,  step:1,  unit:'mm' },
      { k:'humps',      label:'Humps',      min:1,   max:4,    step:1,  unit:'',
        hint:'More than one? Add length to match, or it gets steep.',
        show:function () { return state.shape === 'roller'; } },
      { k:'crestFlat',  label:'Flat top',   min:0,   max:400,  step:10, unit:'mm',
        hint:'A level run held at each crest. The curve is squeezed into what ' +
             'is left, so a long flat makes the approach steeper \u2014 watch ' +
             'the max slope.',
        show:function () { return state.shape === 'roller'; } },
      { k:'bevelRun',   label:'Side taper', min:0,   max:250,  step:5,  unit:'mm',
        hint:'How far the sides slope down to the floor. 0 gives a cliff edge.' },
      { k:'edgeLip',    label:'Toe thickness', min:1.2, max:5, step:0.2, unit:'mm',
        hint:'How thick the ramp is at its very edge. Sturdier when raised, but ' +
             'it also shrinks the fully-solid zone near the toe \u2014 so raise ' +
             'top layers with it.' }
    ]},
    { group:'Printer', custom:'printer', items:[
      { k:'fit', label:'Joint clearance', min:0.1, max:0.8, step:0.05, unit:'mm',
        hint:'Cut into each socket, per side, so twice this is the play across ' +
             'a dovetail. Assembly is straight down, so it is there for print ' +
             'error rather than sliding \u2014 drop to 0.15 if it still rattles.' }
    ]},
    { group:'Estimate', items:[
      { k:'infill', label:'Infill', min:0.05, max:0.4, step:0.01, unit:'%', pct:true },
      { k:'flow', label:'Average flow', min:2, max:25, step:0.5, unit:'mm\u00b3/s',
        hint:'Set from your printer, roughly. Slice one plate and nudge this ' +
             'until the time matches \u2014 everything else then follows.' }
    ]}
  ];

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var el = function (t, cls, txt) {
    var n = document.createElement(t);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = txt;
    return n;
  };

  // ------------------------------------------------------------------ bike --
  // A Strider 12 Comp, to scale, so the ramp is read against the thing that has
  // to ride it. Real numbers: 12 in wheels (305 mm), 550 mm wheelbase. It is
  // posed on the ramp itself, wheels riding the surface envelope, because that
  // is what shows how little of a short hump the bike actually feels.
  var BIKE = { wheelR: 152.5, wheelW: 34, base: 550, hub: 0 };

  function bikeBox(m, a, b, w, half) {
    // a and b are [x,z] in the bike's own side view; w is the tube width in y
    var dx = b[0]-a[0], dz = b[1]-a[1], L = Math.hypot(dx,dz) || 1;
    var nx = -dz/L*half, nz = dx/L*half;
    var c = [[a[0]-nx,a[1]-nz],[b[0]-nx,b[1]-nz],[b[0]+nx,b[1]+nz],[a[0]+nx,a[1]+nz]];
    var y0 = -w/2, y1 = w/2, i;
    for (i = 1; i + 1 < 4; i++) {
      m.tri([c[0][0],y0,c[0][1]], [c[i+1][0],y0,c[i+1][1]], [c[i][0],y0,c[i][1]]);
      m.tri([c[0][0],y1,c[0][1]], [c[i][0],y1,c[i][1]], [c[i+1][0],y1,c[i+1][1]]);
    }
    for (i = 0; i < 4; i++) {
      var j = (i+1)%4;
      m.quad([c[i][0],y0,c[i][1]], [c[j][0],y0,c[j][1]],
             [c[j][0],y1,c[j][1]], [c[i][0],y1,c[i][1]]);
    }
  }
  function bikeWheel(m, cx, cz, r, w) {
    var N = 28, i, y0 = -w/2, y1 = w/2;
    for (i = 0; i < N; i++) {
      var a = i/N*Math.PI*2, b = (i+1)/N*Math.PI*2;
      var p0 = [cx+Math.cos(a)*r, cz+Math.sin(a)*r];
      var p1 = [cx+Math.cos(b)*r, cz+Math.sin(b)*r];
      m.tri([cx,y0,cz], [p1[0],y0,p1[1]], [p0[0],y0,p0[1]]);
      m.tri([cx,y1,cz], [p0[0],y1,p0[1]], [p1[0],y1,p1[1]]);
      m.quad([p0[0],y0,p0[1]], [p1[0],y0,p1[1]], [p1[0],y1,p1[1]], [p0[0],y1,p0[1]]);
    }
  }
  function meshOf() {
    var t = [];
    return { tris:t,
      tri:function(a,b,c){ t.push(a[0],a[1],a[2],b[0],b[1],b[2],c[0],c[1],c[2]); },
      quad:function(a,b,c,d){ this.tri(a,b,c); this.tri(a,c,d); } };
  }

  // "STRIDER 12 COMP" along the top tube, as raised pixels off the same 5x7
  // font the ramp decals use -- so it is legible about which bike this is.
  function bikeLabel(m, a, b, w) {
    var txt = 'STRIDER 12 COMP', F = BR.FONT;
    var chars = txt.split('').filter(function (c) { return c === ' ' || F[c]; });
    var units = chars.length * 6 - 1;
    var dx = b[0]-a[0], dz = b[1]-a[1], L = Math.hypot(dx,dz) || 1;
    var ux = dx/L, uz = dz/L;               // along the tube
    var px = Math.min(L * 0.92 / units, 3.4);
    var run = units * px, x0 = a[0] + ux*(L-run)/2, z0 = a[1] + uz*(L-run)/2;
    var lift = 9;                            // sit the cap height on the tube
    chars.forEach(function (ch, k) {
      if (ch === ' ') return;
      var rows = F[ch];
      for (var r = 0; r < 7; r++) for (var c = 0; c < 5; c++) {
        if (rows[6-r].charAt(c) !== '#') continue;
        var d = (k*6 + c) * px;
        var cx = x0 + ux*d - uz*(lift + r*px);
        var cz = z0 + uz*d + ux*(lift + r*px);
        var ex = ux*px, ez = uz*px;
        var fx = -uz*px, fz = ux*px;
        var q = [[cx,cz],[cx+ex,cz+ez],[cx+ex+fx,cz+ez+fz],[cx+fx,cz+fz]];
        var y0v = w/2, y1v = w/2 + 1.2, i;
        for (i = 1; i+1 < 4; i++) {
          m.tri([q[0][0],y0v,q[0][1]], [q[i+1][0],y0v,q[i+1][1]], [q[i][0],y0v,q[i][1]]);
          m.tri([q[0][0],y1v,q[0][1]], [q[i][0],y1v,q[i][1]], [q[i+1][0],y1v,q[i+1][1]]);
        }
        for (i = 0; i < 4; i++) {
          var j = (i+1)%4;
          m.quad([q[i][0],y0v,q[i][1]], [q[j][0],y0v,q[j][1]],
                 [q[j][0],y1v,q[j][1]], [q[i][0],y1v,q[i][1]]);
        }
      }
    });
  }

  // Highest the wheel can sit without cutting into the surface -- the same
  // envelope a real wheel rolls on, so it bridges crests instead of dipping in.
  function surfaceAt(x) {
    if (state.build === 'deck') {
      var d = result.deck, L = d.params.hillLength;
      if (x < 0 || x > L) return 0;
      return Math.max(d.params.baseH, window.BikeRampDeck.ribTop(d.params, x))
             + d.params.sheet;
    }
    var p = result.params;
    if (x < 0 || x > p.hillLength) return 0;
    return BR.profX(p, x);
  }
  function wheelCentre(xc) {
    var r = BIKE.wheelR, best = r, d;
    for (d = -r; d <= r; d += 4) {
      var z = surfaceAt(xc + d) + Math.sqrt(Math.max(0, r*r - d*d));
      if (z > best) best = z;
    }
    return best;
  }

  function bikeMesh() {
    var m = meshOf(), lm = meshOf();
    var L = (state.build === 'deck' ? result.deck.params.hillLength : state.hillLength);
    var xr = Math.max(0, L * 0.5 - BIKE.base * 0.5);      // straddling the middle
    var zr = wheelCentre(xr), zf = wheelCentre(xr + BIKE.base);
    var ang = Math.atan2(zf - zr, BIKE.base);
    var ca = Math.cos(ang), sa = Math.sin(ang);
    var R = BIKE.wheelR;
    // side view in bike-local coords: rear axle at origin
    var rear = [0, 0], front = [BIKE.base, 0];
    var seat = [150, 150], head = [455, 205], bar = [470, 300], sadd = [140, 235];
    var frame = meshOf();
    bikeWheel(frame, rear[0], rear[1], R, BIKE.wheelW);
    bikeWheel(frame, front[0], front[1], R, BIKE.wheelW);
    bikeBox(frame, rear, seat, 22, 11);                    // rear stay
    bikeBox(frame, seat, head, 30, 15);                    // top tube -- the label
    bikeBox(frame, head, front, 22, 11);                   // fork
    bikeBox(frame, head, bar, 20, 10);                     // steerer
    bikeBox(frame, seat, sadd, 20, 10);                    // seat post
    bikeBox(frame, [sadd[0]-80, sadd[1]], [sadd[0]+70, sadd[1]+8], 60, 12); // saddle
    var handle = meshOf();
    bikeBox(handle, [bar[0], bar[1]], [bar[0], bar[1]+6], 300, 14);         // bars
    bikeLabel(lm, seat, head, 30);

    function place(src, out) {
      for (var i = 0; i < src.length; i += 3) {
        var x = src[i], y = src[i+1], z = src[i+2];
        out.push(xr + x*ca - z*sa, y + state.hillWidth/2, zr + x*sa + z*ca);
      }
    }
    var body = [], label = [];
    place(frame.tris, body); place(handle.tris, body);
    place(lm.tris, label);
    return [{ name:'strider 12 comp', tris:body, ci:4, flat:true, ghost:true },
            { name:'bike label', tris:label, ci:5, flat:true, ghost:true }];
  }

  // ------------------------------------------------------------- geometry ---
  // Deck-on-ribs. Only the ribs and thresholds are printed; the plywood is
  // drawn so the ramp reads as the finished thing rather than a bare frame.
  function rebuildDeck() {
    var d = DK.build({ hillLength: state.hillLength, hillWidth: state.hillWidth,
                       hillHeight: state.hillHeight, humps: state.humps,
                       crestFlat: state.crestFlat,
                       bedX: state.bedX, bedY: state.bedY });
    var ps = DK.parts(d);
    var tiles = ps.map(function (q, i) {
      return { name: q.name, tris: q.tris, i: i, j: 0, ci: q.ci, flat: true,
               kind: q.kind, dir: q.dir, sheet: !!q.sheet, m: BR.measure(q.tris) };
    });
    var e = DK.estimate(d, { infill: state.infill, flow: state.flow });
    result = {
      params: Object.assign({}, state, d.params), deck: d, tiles: tiles,
      tiling: { nx: tiles.length, ny: 1, px: d.params.hillLength, py: d.params.hillWidth },
      total: BR.measure(d.ribs.length ? d.ribs[0].placed : d.sheetTris),
      spikes: 0, estimate: e
    };
  }

  function rebuild() {
    if (state.build === 'deck') {
      rebuildDeck();
    } else {
      result = BR.build(state);
      result.estimate = BR.estimate(result.total, {
        infill: state.infill, flow: state.flow, plates: result.tiles.length
      });
    }
    applyVisibility();
    syncShape();
    if (paintSync) paintSync();
    renderReadouts();
    renderTiles();
    gl.upload(buildBuffers());
    draw();
  }

  function tileOffset(t) {
    if (state.mode !== 'exploded' || t.ghost) return [0, 0, 0];
    // The deck frame explodes along the way it goes together: ribs lift off
    // the base ladder so the mortises show, ends slide clear of the run.
    if (t.kind) {
      if (t.kind === 'rib') return [0, 0, 70];
      if (t.kind === 'end') return [(t.dir || 1) * 90, 0, 0];
      return [0, 0, 0];
    }
    var g = 55, tl = result.tiling;
    return [(t.i - (tl.nx - 1) / 2) * g, (t.j - (tl.ny - 1) / 2) * g, 0];
  }

  function visibleTiles() {
    var base = state.isolate == null ? result.tiles
      : result.tiles.filter(function (t) { return t.name === state.isolate; });
    // Exploded is for seeing the printed frame. The plywood is not printed and
    // only hides it, so drop it there.
    if (state.mode === 'exploded')
      base = base.filter(function (t) { return !t.sheet; });
    return (state.bike && state.mode !== 'exploded')
      ? base.concat(bikeMesh()) : base;
  }

  // Analytic surface normal, so the riding face shades smoothly while the cut
  // faces and the underside stay crisp. h is min(profX, profY): differencing it
  // across the fold would average the two branches and round off an edge that
  // is genuinely sharp, so pick the branch from the facet's own centre first.
  function topNormal(p, x, y, cx, cy, out) {
    var e = 0.05, gx = 0, gy = 0;
    if (BR.profX(p, cx) <= BR.profY(p, cy))
      gx = (BR.profX(p, x + e) - BR.profX(p, x - e)) / (2 * e);
    else
      gy = (BR.profY(p, y + e) - BR.profY(p, y - e)) / (2 * e);
    var m = Math.hypot(gx, gy, 1);
    out[0] = -gx / m; out[1] = -gy / m; out[2] = 1 / m;
  }

  function buildBuffers() {
    var tiles = visibleTiles(), p = result.params;
    var n = 0, i;
    for (i = 0; i < tiles.length; i++) n += tiles[i].tris.length / 3;
    var data = new Float32Array(n * 8), w = 0, nrm = [0, 0, 0];

    tiles.forEach(function (t) {
      var off = tileOffset(t);
      // The bike is a reference object: no checkerboard shading, and it stays
      // put when the parts explode.
      var shade = t.ghost ? 1
        : 1 - ((t.i + t.j) % 2) * (state.mode === 'exploded' ? 0.07 : 0.025);
      var tr = t.tris;
      for (var k = 0; k < tr.length; k += 9) {
        var ax=tr[k],ay=tr[k+1],az=tr[k+2],bx=tr[k+3],by=tr[k+4],bz=tr[k+5],
            cx=tr[k+6],cy=tr[k+7],cz=tr[k+8];
        var ux=bx-ax,uy=by-ay,uz=bz-az,vx=cx-ax,vy=cy-ay,vz=cz-az;
        var fx=uy*vz-uz*vy, fy=uz*vx-ux*vz, fz=ux*vy-uy*vx;
        var m = Math.hypot(fx,fy,fz) || 1;
        var smooth = fz / m > 0.15 && !t.flat;
        var mx = (ax + bx + cx) / 3, my = (ay + by + cy) / 3;
        // By plan position, so a raised letter carries its own colour down its
        // sides as well as across its face. Downward faces are excluded: the
        // lookup has no z, so without this the flat underside picks up the
        // pattern of whatever decal happens to sit above it.
        var ci = t.ci != null ? t.ci
               : fz / m < -0.15 ? 0 : regionAt(p, mx, my);
        for (var v = 0; v < 3; v++) {
          var x=tr[k+v*3], y=tr[k+v*3+1], z=tr[k+v*3+2];
          if (smooth) topNormal(p, x, y, mx, my, nrm);
          else { nrm[0]=fx/m; nrm[1]=fy/m; nrm[2]=fz/m; }
          data[w++]=x+off[0]; data[w++]=y+off[1]; data[w++]=z+off[2];
          data[w++]=nrm[0]; data[w++]=nrm[1]; data[w++]=nrm[2];
          data[w++]=shade; data[w++]=ci;
        }
      }
    });

    var bb = [Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity];
    for (i = 0; i < w; i += 8)
      for (var d = 0; d < 3; d++) {
        if (data[i+d] < bb[d]) bb[d] = data[i+d];
        if (data[i+d] > bb[3+d]) bb[3+d] = data[i+d];
      }
    return { data: data, count: n, bbox: bb };
  }

  function gridLines() {
    var p = state, pad = 150, s = 100;
    var x0 = Math.floor(-pad / s) * s, x1 = Math.ceil((p.hillLength + pad) / s) * s;
    var y0 = Math.floor(-pad / s) * s, y1 = Math.ceil((p.hillWidth + pad) / s) * s;
    var v = [], x, y;
    for (x = x0; x <= x1; x += s) v.push(x, y0, -0.5, x, y1, -0.5);
    for (y = y0; y <= y1; y += s) v.push(x0, y, -0.5, x1, y, -0.5);
    return new Float32Array(v);
  }

  // ---------------------------------------------------------------- webgl ---
  var gl = (function () {
    var canvas = null, g = null, prog = null, gprog = null;
    var vbo = null, gvbo = null, count = 0, gcount = 0, bbox = null;
    var cam = { yaw: -0.86, pitch: 0.42, zoom: 1 };

    var VS = '#version 300 es\n' +
      'in vec3 aPos; in vec3 aNrm; in float aShade; in float aCi;\n' +
      'uniform mat4 uMVP;\n' +
      'out vec3 vN; out float vS; flat out int vCi;\n' +
      'void main(){ vN=aNrm; vS=aShade; vCi=int(aCi+0.5);\n' +
      '  gl_Position=uMVP*vec4(aPos,1.0); }';
    var FS = '#version 300 es\nprecision highp float;\n' +
      'in vec3 vN; in float vS; flat in int vCi;\n' +
      'uniform vec3 uColor[6];\n' +
      'out vec4 o;\n' +
      'void main(){\n' +
      '  vec3 n=normalize(vN);\n' +
      '  float key=max(dot(n,normalize(vec3(-0.35,-0.75,0.78))),0.0);\n' +
      '  float rim=max(dot(n,normalize(vec3(0.75,0.5,0.15))),0.0);\n' +
      '  float sky=0.5+0.5*n.z;\n' +
      '  float fill=max(-n.z,0.0);\n' +
      '  vec3 base=uColor[vCi];\n' +
      '  vec3 c=base*(0.26+0.62*key+0.20*sky+0.20*fill)+vec3(0.10)*rim*0.5;\n' +
      '  o=vec4(clamp(c*vS,0.0,1.0),1.0);\n' +
      '}';
    var GVS = '#version 300 es\nin vec3 aPos; uniform mat4 uMVP;\n' +
      'void main(){ gl_Position=uMVP*vec4(aPos,1.0); }';
    var GFS = '#version 300 es\nprecision mediump float; uniform vec4 uC; out vec4 o;\n' +
      'void main(){ o=uC; }';

    function shader(src, type) {
      var s = g.createShader(type);
      g.shaderSource(s, src); g.compileShader(s);
      if (!g.getShaderParameter(s, g.COMPILE_STATUS)) throw new Error(g.getShaderInfoLog(s));
      return s;
    }
    function program(vs, fs) {
      var p = g.createProgram();
      g.attachShader(p, shader(vs, g.VERTEX_SHADER));
      g.attachShader(p, shader(fs, g.FRAGMENT_SHADER));
      g.linkProgram(p);
      if (!g.getProgramParameter(p, g.LINK_STATUS)) throw new Error(g.getProgramInfoLog(p));
      return p;
    }

    function mul(a, b) {
      var o = new Float32Array(16);
      for (var i = 0; i < 4; i++) for (var j = 0; j < 4; j++) {
        var s = 0;
        for (var k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k];
        o[i * 4 + j] = s;
      }
      return o;
    }
    function perspective(fov, asp, n, f) {
      var t = 1 / Math.tan(fov / 2);
      return new Float32Array([t/asp,0,0,0, 0,t,0,0, 0,0,(f+n)/(n-f),-1, 0,0,2*f*n/(n-f),0]);
    }
    function lookAt(e, c, u) {
      var z = [e[0]-c[0], e[1]-c[1], e[2]-c[2]];
      var zl = Math.hypot(z[0],z[1],z[2]); z = z.map(function (v) { return v/zl; });
      var x = [u[1]*z[2]-u[2]*z[1], u[2]*z[0]-u[0]*z[2], u[0]*z[1]-u[1]*z[0]];
      var xl = Math.hypot(x[0],x[1],x[2]) || 1; x = x.map(function (v) { return v/xl; });
      var y = [z[1]*x[2]-z[2]*x[1], z[2]*x[0]-z[0]*x[2], z[0]*x[1]-z[1]*x[0]];
      return new Float32Array([
        x[0],y[0],z[0],0, x[1],y[1],z[1],0, x[2],y[2],z[2],0,
        -(x[0]*e[0]+x[1]*e[1]+x[2]*e[2]),
        -(y[0]*e[0]+y[1]*e[1]+y[2]*e[2]),
        -(z[0]*e[0]+z[1]*e[1]+z[2]*e[2]), 1]);
    }

    function mvp() {
      var c = [(bbox[0]+bbox[3])/2, (bbox[1]+bbox[4])/2, (bbox[2]+bbox[5])/2];
      var r = Math.max(bbox[3]-bbox[0], bbox[4]-bbox[1], bbox[5]-bbox[2]) * 0.62 + 40;
      var d = r * 2.9 * cam.zoom;
      var cp = Math.cos(cam.pitch);
      var e = [c[0]+d*cp*Math.cos(cam.yaw), c[1]+d*cp*Math.sin(cam.yaw), c[2]+d*Math.sin(cam.pitch)];
      var asp = canvas.width / Math.max(1, canvas.height);
      // Tight frustum: the joints are 0.35mm apart and need the depth precision.
      var near = Math.max(r * 0.04, d - r * 2.2), far = d + r * 2.2;
      return mul(perspective(0.72, asp, near, far), lookAt(e, c, [0,0,1]));
    }

    function css(v) {
      var s = getComputedStyle(document.documentElement).getPropertyValue(v).trim();
      var m = /^#([0-9a-f]{6})$/i.exec(s);
      if (!m) return [0.5,0.5,0.5];
      var n = parseInt(m[1], 16);
      return [(n>>16&255)/255, (n>>8&255)/255, (n&255)/255];
    }

    function resize() {
      if (!canvas) return;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    }

    return {
      init: function (cv) {
        canvas = cv;
        g = cv.getContext('webgl2', { antialias: true, alpha: false });
        if (!g) return false;
        prog = program(VS, FS); gprog = program(GVS, GFS);
        vbo = g.createBuffer(); gvbo = g.createBuffer();
        g.enable(g.DEPTH_TEST);
        g.enable(g.CULL_FACE);
        this.bindPointer();
        return true;
      },
      upload: function (b) {
        bbox = b.bbox; count = b.count;
        g.bindBuffer(g.ARRAY_BUFFER, vbo);
        g.bufferData(g.ARRAY_BUFFER, b.data, g.DYNAMIC_DRAW);
        var gd = gridLines(); gcount = gd.length / 3;
        g.bindBuffer(g.ARRAY_BUFFER, gvbo);
        g.bufferData(g.ARRAY_BUFFER, gd, g.STATIC_DRAW);
      },
      draw: function () {
        if (!g || !bbox) return;
        resize();
        var bg = css('--vp-2');
        g.viewport(0, 0, canvas.width, canvas.height);
        g.clearColor(bg[0], bg[1], bg[2], 1);
        g.clear(g.COLOR_BUFFER_BIT | g.DEPTH_BUFFER_BIT);
        var m = mvp();

        g.useProgram(gprog);
        g.uniformMatrix4fv(g.getUniformLocation(gprog, 'uMVP'), false, m);
        var gc = css('--grid');
        g.uniform4f(g.getUniformLocation(gprog, 'uC'), gc[0], gc[1], gc[2], 0.5);
        g.bindBuffer(g.ARRAY_BUFFER, gvbo);
        var gp = g.getAttribLocation(gprog, 'aPos');
        g.enableVertexAttribArray(gp);
        g.vertexAttribPointer(gp, 3, g.FLOAT, false, 12, 0);
        if (cam.pitch > -0.05) g.drawArrays(g.LINES, 0, gcount);

        g.useProgram(prog);
        g.uniformMatrix4fv(g.getUniformLocation(prog, 'uMVP'), false, m);
        var cols = new Float32Array(18);
        // In deck mode index 1 is the plywood, not a decal colour.
        var pal = state.build === 'deck'
          ? [state.colours[0], '#8A5A2E', state.colours[2], '#25E3D8']
          : state.colours;
        pal = pal.concat(['#20202A', '#F2EFE4']);   // bike frame, bike label
        for (var q = 0; q < 6; q++) {
          var n = parseInt(pal[q].slice(1), 16);
          cols[q*3] = (n>>16&255)/255; cols[q*3+1] = (n>>8&255)/255;
          cols[q*3+2] = (n&255)/255;
        }
        g.uniform3fv(g.getUniformLocation(prog, 'uColor'), cols);
        g.bindBuffer(g.ARRAY_BUFFER, vbo);
        var ap = g.getAttribLocation(prog, 'aPos'),
            an = g.getAttribLocation(prog, 'aNrm'),
            as = g.getAttribLocation(prog, 'aShade'),
            ac = g.getAttribLocation(prog, 'aCi');
        [ap, an, as, ac].forEach(function (a) { g.enableVertexAttribArray(a); });
        g.vertexAttribPointer(ap, 3, g.FLOAT, false, 32, 0);
        g.vertexAttribPointer(an, 3, g.FLOAT, false, 32, 12);
        g.vertexAttribPointer(as, 1, g.FLOAT, false, 32, 24);
        g.vertexAttribPointer(ac, 1, g.FLOAT, false, 32, 28);
        g.drawArrays(g.TRIANGLES, 0, count);
      },
      setPitch: function (v) { cam.pitch = v; },
      bindPointer: function () {
        var pts = new Map(), last = null, pinch = 0;
        canvas.addEventListener('pointerdown', function (e) {
          canvas.setPointerCapture(e.pointerId);
          pts.set(e.pointerId, [e.clientX, e.clientY]);
          last = [e.clientX, e.clientY];
        });
        canvas.addEventListener('pointermove', function (e) {
          if (!pts.has(e.pointerId)) return;
          pts.set(e.pointerId, [e.clientX, e.clientY]);
          if (pts.size >= 2) {
            var a = Array.from(pts.values());
            var d = Math.hypot(a[0][0]-a[1][0], a[0][1]-a[1][1]);
            if (pinch) cam.zoom = Math.min(3, Math.max(0.35, cam.zoom * pinch / d));
            pinch = d;
          } else if (last) {
            cam.yaw -= (e.clientX - last[0]) * 0.008;
            cam.pitch = Math.min(1.5, Math.max(-1.3, cam.pitch + (e.clientY - last[1]) * 0.006));
            last = [e.clientX, e.clientY];
          }
          draw();
        });
        var end = function (e) { pts.delete(e.pointerId); last = null; pinch = 0; };
        canvas.addEventListener('pointerup', end);
        canvas.addEventListener('pointercancel', end);
        canvas.addEventListener('wheel', function (e) {
          e.preventDefault();
          cam.zoom = Math.min(3, Math.max(0.35, cam.zoom * (1 + Math.sign(e.deltaY) * 0.1)));
          draw();
        }, { passive: false });
      }
    };
  })();

  var pending = false;
  function draw() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(function () { pending = false; gl.draw(); });
  }

  // -------------------------------------------------------------- readouts --
  function slopeWord(d) {
    return d < 9 ? 'very gentle' : d < 15 ? 'gentle' : d < 21 ? 'moderate' : 'steep for a toddler';
  }
  function deckReadouts() {
    var r = result, e = r.estimate, d = r.deck;
    var printed = r.tiles.filter(function (t) { return !t.sheet; });
    var big = printed.reduce(function (m, t) {
      return t.m.size[2] > m.m.size[2] ? t : m; }, printed[0]);
    var sl = 0, L = d.params.hillLength, q;
    for (q = 0; q <= 200; q++) {
      var x = L * q / 200, g = (DK.prof(d.params, x + 0.5) - DK.prof(d.params, x - 0.5)) / 1;
      sl = Math.max(sl, Math.abs(Math.atan(g) * 180 / Math.PI));
    }
    $('#ro-tiles-label').textContent = 'Printed parts';
    $('#ro-tiles').innerHTML = printed.length +
      '<span class="sub">' + d.ribs.length + ' ribs, ' + d.strips.length +
      ' base, ' + d.channels.length + ' channel, 2 ends</span>';
    $('#ro-largest-label').textContent = 'Largest part';
    $('#ro-largest').innerHTML = big.m.size.map(function (v) { return Math.round(v); })
      .join(' \u00d7 ') + '<span class="sub">mm</span>';
    $('#ro-slope-label').textContent = 'Max slope';
    $('#ro-slope').innerHTML = sl.toFixed(1) + '\u00b0' +
      '<span class="sub">' + slopeWord(sl) + '</span>';
    $('#ro-filament').innerHTML = (e.grams / 1000).toFixed(2) +
      '<span class="sub">kg</span>';
    $('#ro-time').innerHTML = '\u2248' + Math.round(e.hours) + '<span class="sub">h</span>';
    $('#ro-spikes-label').textContent = 'Plywood';
    $('#ro-spikes').innerHTML = Math.round(d.sheet.length) + '\u00d7' +
      Math.round(d.sheet.width) + '<span class="sub">\u00d7 1/8 in</span>';
    $('#vp-dims').textContent = Math.round(d.params.hillLength) + ' \u00d7 ' +
      Math.round(d.params.hillWidth) + ' \u00d7 ' + Math.round(d.params.hillHeight) + ' mm';
  }

  function renderReadouts() {
    if (state.build === 'deck') { deckReadouts(); return; }
    $('#ro-tiles-label').textContent = 'Tiles';
    $('#ro-largest-label').textContent = 'Largest tile';
    $('#ro-spikes-label').textContent = 'Spikes';
    var r = result, b = r.biggest.m.size, e = r.estimate;
    var over = Math.max(b[0], b[1]) - r.params.maxPrint;
    $('#ro-tiles').innerHTML = r.tiles.length +
      '<span class="sub">' + r.tiling.nx + '\u00d7' + r.tiling.ny + ' grid</span>';
    $('#ro-largest').innerHTML =
      b.map(function (v) { return Math.round(v); }).join(' \u00d7 ') +
      ' <span class="tag ' + (r.fits ? 'ok' : 'crit') + '">' +
      (r.fits ? 'fits' : '+' + Math.ceil(over) + 'mm over') + '</span>';
    $('#ro-slope-label').textContent = r.slopeLabel;
    $('#ro-slope').innerHTML = r.slope.toFixed(1) + '\u00b0' +
      '<span class="sub">' + slopeWord(r.slope) + '</span>';
    $('#ro-filament').innerHTML = (e.grams / 1000).toFixed(2) +
      '<span class="sub">kg</span>';
    $('#ro-time').innerHTML = '\u2248' + Math.round(e.hours) + '<span class="sub">h</span>';
    $('#ro-spikes').innerHTML = state.spikeLen
      ? r.spikes + '<span class="sub">\u00d7 ' + state.spikeLen + 'mm</span>'
      : '<span class="sub" style="margin:0">none</span>';
    $('#vp-dims').textContent = Math.round(state.hillLength) + ' \u00d7 ' +
      Math.round(state.hillWidth) + ' \u00d7 ' + Math.round(state.hillHeight) + ' mm';
  }

  function renderTiles() {
    var box = $('#tiles');
    box.textContent = '';
    result.tiles.filter(function (t) { return !t.ghost; }).forEach(function (t) {
      var b = el('button', 'tile');
      b.type = 'button';
      b.setAttribute('aria-pressed', String(state.isolate === t.name));
      b.appendChild(el('span', 'n', t.name.replace('tile_', '')));
      b.appendChild(el('span', 'd', t.m.size.map(function (v) { return Math.round(v); })
        .join('\u00d7') + '  ' + (t.sheet ? 'plywood'
          : Math.round(BR.estimate(t.m, { infill: state.infill }).grams) + 'g')));
      b.addEventListener('click', function () {
        state.isolate = state.isolate === t.name ? null : t.name;
        renderTiles(); gl.upload(buildBuffers()); draw();
      });
      box.appendChild(b);
    });
    $('#plate-note').textContent = state.isolate
      ? 'Showing ' + state.isolate + ' \u2014 click again for the whole hill'
      : 'Click a tile to isolate it';
  }

  // -------------------------------------------------------------- controls --
  var bedInputs = null, paintSync = null;

  function printerPicker() {
    var wrap = document.createDocumentFragment();
    var bx = el('input'), by = el('input');

    var pick = el('div', 'ctrl');
    var ptop = el('div', 'ctrl-top');
    var plab = el('label', null, 'Printer');
    plab.htmlFor = 'printer';
    ptop.appendChild(plab);
    var sel = el('select', 'select');
    sel.id = 'printer';
    PRINTERS.forEach(function (pr, i) {
      var o = el('option', null, pr.name + '  \u2014  ' + pr.x + '\u00d7' + pr.y + ' mm');
      o.value = String(i);
      sel.appendChild(o);
    });
    var custom = el('option', null, 'Custom');
    custom.value = 'custom';
    sel.appendChild(custom);
    sel.addEventListener('change', function () {
      if (sel.value === 'custom') return;
      var pr = PRINTERS[Number(sel.value)];
      state.bedX = pr.x - BED_MARGIN;
      state.bedY = pr.y - BED_MARGIN;
      bx.value = state.bedX;
      by.value = state.bedY;
      setControl('flow', pr.flow);
      syncPrinter();
      rebuild();
    });
    pick.appendChild(ptop);
    pick.appendChild(sel);
    wrap.appendChild(pick);

    var bed = el('div', 'ctrl');
    var btop = el('div', 'ctrl-top');
    var blab = el('label', null, 'Usable bed');
    blab.htmlFor = 'bed-x';
    var val = el('div', 'ctrl-val');
    [[bx, 'bed-x', 'along the run'], [by, 'bed-y', 'across the width']]
      .forEach(function (d, i) {
        d[0].type = 'number'; d[0].id = d[1];
        d[0].min = 80; d[0].max = 700; d[0].step = 1;
        d[0].setAttribute('aria-label', 'Usable bed ' + d[2]);
        d[0].addEventListener('change', function () {
          var v = parseFloat(d[0].value);
          if (isNaN(v)) { d[0].value = i ? state.bedY : state.bedX; return; }
          v = Math.min(700, Math.max(80, v));
          d[0].value = v;
          state[i ? 'bedY' : 'bedX'] = v;
          syncPrinter();
          rebuild();
        });
        val.appendChild(d[0]);
        if (!i) val.appendChild(el('span', 'x', '\u00d7'));
      });
    val.appendChild(el('span', 'u', 'mm'));
    btop.appendChild(blab); btop.appendChild(val);
    bed.appendChild(btop);
    var bedHint = el('p', 'hint');
    bed.appendChild(bedHint);
    wrap.appendChild(bed);

    bedInputs = { sel: sel, x: bx, y: by, hint: bedHint };
    return wrap;
  }

  function syncPrinter() {
    if (!bedInputs) return;
    var hit = -1;
    PRINTERS.forEach(function (pr, i) {
      if (hit < 0 && pr.x - BED_MARGIN === state.bedX && pr.y - BED_MARGIN === state.bedY)
        hit = i;
    });
    bedInputs.sel.value = hit < 0 ? 'custom' : String(hit);
    bedInputs.x.value = state.bedX;
    bedInputs.y.value = state.bedY;
    bedInputs.hint.textContent =
      'Bed less ' + BED_MARGIN + ' mm of edge margin, along the run \u00d7 across ' +
      'the width. Tiles get turned on the plate when that saves one.' +
      (hit >= 0 && PRINTERS[hit].note ? ' ' + PRINTERS[hit].note : '');
  }

  function shapePicker() {
    var wrap = document.createDocumentFragment();
    var c = el('div', 'ctrl');
    var chips = el('div', 'chips');
    var hint = el('p', 'hint');
    SHAPES.forEach(function (sh) {
      var b = el('button', 'chip', sh.label);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(state.shape === sh.v));
      b.addEventListener('click', function () {
        state.shape = sh.v;
        Array.prototype.forEach.call(chips.children, function (o) {
          o.setAttribute('aria-pressed', String(o === b));
        });
        syncInputs(); rebuild(); markPreset();
      });
      chips.appendChild(b);
    });
    c.appendChild(chips);
    c.appendChild(hint);
    wrap.appendChild(c);
    shapeChips = { chips: chips, hint: hint };
    return wrap;
  }

  var shapeChips = null;
  function syncShape() {
    if (!shapeChips) return;
    SHAPES.forEach(function (sh, i) {
      shapeChips.chips.children[i]
        .setAttribute('aria-pressed', String(state.shape === sh.v));
      if (state.shape === sh.v) shapeChips.hint.textContent = sh.hint;
    });
  }

  function spikeGroup() {
    var host = document.createDocumentFragment();
    var sg = el('div', 'group');
    sg.id = 'grp-spikes';
    sg.appendChild(el('h2', null, 'Ground spikes'));
    var schips = el('div', 'chips');
    SPIKE_OPTS.forEach(function (o) {
      var c = el('button', 'chip', o.label);
      c.type = 'button';
      c.setAttribute('aria-pressed', String(state.spikeLen === o.v));
      c.addEventListener('click', function () {
        state.spikeLen = o.v;
        Array.prototype.forEach.call(schips.children, function (q) {
          q.setAttribute('aria-pressed', String(q === c));
        });
        rebuild();
      });
      schips.appendChild(c);
    });
    sg.appendChild(schips);
    sg.appendChild(el('p', 'hint',
      'Adds one threaded socket under each tile that is thick enough, plus a ' +
      'matching screw-in spike to print. Grips grass; unscrew them for ' +
      'indoors. The flange holds the hill 3 mm off the ground.'));
    host.appendChild(sg);
    return host;

  }

  function buildControls() {
    var host = $('#controls');

    var pg = el('div', 'group');
    pg.appendChild(el('h2', null, 'Start from'));
    var chips = el('div', 'chips');
    Object.keys(PRESETS).forEach(function (name) {
      var c = el('button', 'chip', name);
      c.type = 'button';
      c.addEventListener('click', function () {
        Object.assign(state, PRESETS[name]);
        syncInputs(); rebuild(); markPreset();
      });
      c.dataset.preset = name;
      chips.appendChild(c);
    });
    pg.appendChild(chips);
    host.appendChild(pg);

    CONTROLS.forEach(function (grp) {
      var g = el('div', 'group');
      g.appendChild(el('h2', null, grp.group));
      if (grp.custom === 'printer') g.appendChild(printerPicker());
      if (grp.custom === 'shape') g.appendChild(shapePicker());
      grp.items.forEach(function (it) {
        var c = el('div', 'ctrl');
        var top = el('div', 'ctrl-top');
        var lab = el('label', null, it.label);
        lab.htmlFor = 'n-' + it.k;
        var val = el('div', 'ctrl-val');
        var num = el('input');
        num.type = 'number'; num.id = 'n-' + it.k;
        num.min = it.pct ? it.min * 100 : it.min;
        num.max = it.pct ? it.max * 100 : it.max;
        num.step = it.pct ? 1 : it.step;
        val.appendChild(num);
        val.appendChild(el('span', 'u', it.unit));
        top.appendChild(lab); top.appendChild(val);

        var rng = el('input');
        rng.type = 'range'; rng.min = it.min; rng.max = it.max; rng.step = it.step;
        rng.setAttribute('aria-label', it.label);

        c.appendChild(top); c.appendChild(rng);
        if (it.hint) c.appendChild(el('p', 'hint', it.hint));
        g.appendChild(c);
        it._el = c;

        var set = function (v, from) {
          v = Math.min(it.max, Math.max(it.min, v));
          state[it.k] = v;
          if (from !== 'range') rng.value = v;
          if (from !== 'num') num.value = it.pct ? Math.round(v * 100) : v;
          rng.style.setProperty('--fill', ((v - it.min) / (it.max - it.min) * 100) + '%');
          rebuild(); markPreset();
        };
        rng.addEventListener('input', function () { set(parseFloat(rng.value), 'range'); });
        num.addEventListener('change', function () {
          var v = parseFloat(num.value);
          if (!isNaN(v)) set(it.pct ? v / 100 : v, 'num');
        });
        it._set = set;
      });
      host.appendChild(g);
      if (grp.group === 'Hill') host.appendChild(spikeGroup());
    });

    var dg = el('div', 'group');
    dg.id = 'grp-decal';
    dg.appendChild(el('h2', null, 'Decals'));
    var dchips = el('div', 'chips');
    var trow = el('div', 'ctrl');
    DECAL_OPTS.forEach(function (o) {
      var c = el('button', 'chip', o.label);
      c.type = 'button';
      c.setAttribute('aria-pressed', String(state.decal === o.v));
      c.addEventListener('click', function () {
        state.decal = o.v;
        Array.prototype.forEach.call(dchips.children, function (q) {
          q.setAttribute('aria-pressed', String(q === c));
        });
        trow.style.display = (o.v === 'text' || o.v === 'both') ? '' : 'none';
        rebuild();
      });
      dchips.appendChild(c);
    });
    dg.appendChild(dchips);

    var ttop = el('div', 'ctrl-top');
    var tlab = el('label', null, 'Says');
    tlab.htmlFor = 'decal-text';
    var tin = el('input');
    tin.type = 'text'; tin.id = 'decal-text'; tin.maxLength = 18;
    tin.className = 'text-in'; tin.value = state.decalText;
    tin.addEventListener('input', function () {
      state.decalText = tin.value.toUpperCase();
      if (tin.value !== state.decalText) tin.value = state.decalText;
      rebuild();
    });
    ttop.appendChild(tlab);
    trow.appendChild(ttop);
    trow.appendChild(tin);
    trow.style.display = (state.decal === 'text' || state.decal === 'both') ? '' : 'none';
    dg.appendChild(trow);
    dg.appendChild(el('p', 'hint',
      'Raised on the side flanks, never on the riding surface \u2014 relief under ' +
      'a wheel is a bump. A-Z, 0-9 and a few marks; the rest are dropped. ' +
      'Decals stop short of the joints so a tab still seats.'));
    host.appendChild(dg);

    var ag = el('div', 'ctrl');
    var achip = el('button', 'chip', 'Separate bodies for AMS');
    achip.type = 'button';
    achip.setAttribute('aria-pressed', String(state.ams));
    achip.addEventListener('click', function () {
      state.ams = !state.ams;
      achip.setAttribute('aria-pressed', String(state.ams));
      renderReadouts();
    });
    var awrap = el('div', 'chips');
    awrap.appendChild(achip);
    ag.appendChild(awrap);
    ag.appendChild(el('p', 'hint',
      'Adds a thin body per decal level to the download \u2014 letters, proud ' +
      'squares, sunk squares \u2014 already aligned. Load them as parts in the ' +
      'slicer and assign filaments. Decals span many layers on a slope, so ' +
      'turn on flush into object infill or the purge will cost more than the ramp.'));
    dg.appendChild(ag);

    var fg = el('div', 'group');
    fg.id = 'grp-colour';
    fg.appendChild(el('h2', null, 'Filament colours'));
    var pchips = el('div', 'chips');
    var sw = el('div', 'swatches');

    function ink(hex) {                     // legible label on any swatch
      var n = parseInt(hex.slice(1), 16);
      var l = 0.299 * (n >> 16 & 255) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255);
      return l > 150 ? '#15121F' : '#FFFFFF';
    }
    function syncPaint() {
      pchips.textContent = '';
      REGIONS.forEach(function (rg) {
        if (rg.needs && rg.needs.indexOf(state.decal) < 0) return;
        var c = el('button', 'chip paint', rg.label);
        c.type = 'button';
        c.style.background = state.colours[rg.i];
        c.style.color = ink(state.colours[rg.i]);
        c.style.borderColor = 'var(--ink)';
        c.setAttribute('aria-pressed', String(state.paint === rg.i));
        c.addEventListener('click', function () {
          state.paint = rg.i;
          syncPaint();
        });
        pchips.appendChild(c);
      });
      Array.prototype.forEach.call(sw.children, function (o) {
        o.setAttribute('aria-pressed', String(o.dataset.hex === state.colours[state.paint]));
      });
    }
    paintSync = syncPaint;

    FILAMENTS.forEach(function (hex) {
      var b = el('button', 'swatch');
      b.type = 'button';
      b.style.background = hex;
      b.dataset.hex = hex;
      b.setAttribute('aria-label', 'Paint in ' + hex);
      b.addEventListener('click', function () {
        state.colours[state.paint] = hex;
        syncPaint();
        draw();
      });
      sw.appendChild(b);
    });
    fg.appendChild(pchips);
    fg.appendChild(sw);
    fg.appendChild(el('p', 'hint',
      'Preview only \u2014 pick a region, then a colour. It matches the bodies ' +
      'the download splits out, so what you see is what you would assign in the ' +
      'slicer.'));
    host.appendChild(fg);

    var ag = el('div', 'actions');
    var d1 = el('button', 'btn primary');
    d1.type = 'button';
    d1.innerHTML = 'Download all tiles <span class="k">.zip</span>';
    d1.addEventListener('click', downloadZip);
    var d2 = el('button', 'btn');
    d2.type = 'button';
    d2.innerHTML = 'Download OpenSCAD source <span class="k">.scad</span>';
    d2.addEventListener('click', downloadScad);
    ag.appendChild(d1); ag.appendChild(d2);
    host.appendChild(ag);

    var f = el('p', 'foot');
    f.innerHTML = 'Slice with 3 walls, <strong>10 top</strong> / 4 bottom layers, ' +
      '<strong>25% gyroid</strong>, no supports, a 5&nbsp;mm brim. The high top ' +
      'shell is not optional: the low end of the ramp is nearly flat over sparse ' +
      'infill and pinholes in the skin at the usual 6 / 15%. ' +
      '<strong>PLA indoors only</strong> \u2014 it sags ' +
      'in a hot garage or a sunny car; use PETG or ASA outdoors.';
    host.appendChild(f);

    syncInputs();
    syncPrinter();
  }

  function setControl(key, v) {
    CONTROLS.forEach(function (g) {
      g.items.forEach(function (it) { if (it.k === key && it._set) it._set(v); });
    });
  }

  function syncInputs() {
    CONTROLS.forEach(function (g) {
      g.items.forEach(function (it) { if (it._set) it._set(state[it.k]); });
    });
  }
  // Controls that only mean something for one shape are hidden for the others.
  // A rib frame has no tiles, no dovetails and no flanks, so the controls that
  // describe those are hidden rather than left to do nothing.
  var SOLID_ONLY = { bevelRun:1, edgeLip:1, fit:1, deck:1 };
  function applyVisibility() {
    var deck = state.build === 'deck';
    CONTROLS.forEach(function (g) {
      g.items.forEach(function (it) {
        var on = (!it.show || it.show()) && !(deck && SOLID_ONLY[it.k]);
        if (it._el) it._el.style.display = on ? '' : 'none';
      });
    });
    ['#grp-spikes', '#grp-decal', '#grp-colour'].forEach(function (sel) {
      var n = document.querySelector(sel);
      if (n) n.style.display = deck ? 'none' : '';
    });
  }
  function markPreset() {
    document.querySelectorAll('[data-preset]').forEach(function (c) {
      var p = PRESETS[c.dataset.preset];
      var on = Object.keys(p).every(function (k) {
        return typeof p[k] === 'string' ? state[k] === p[k]
                                        : Math.abs(state[k] - p[k]) < 1e-9;
      });
      c.setAttribute('aria-pressed', String(on));
    });
  }

  // ---------------------------------------------------------------- export --
  function save(blob, name) {
    var a = document.createElement('a'), u = URL.createObjectURL(blob);
    a.href = u; a.download = name; a.click();
    setTimeout(function () { URL.revokeObjectURL(u); }, 4000);
  }

  function slug() {
    return 'hill_' + Math.round(state.hillLength) + 'x' + Math.round(state.hillWidth) +
           'x' + Math.round(state.hillHeight);
  }

  function readme() {
    var r = result, e = r.estimate;
    return [
      'LITTLE RIPPER -- ramp generator', '',
      'Shape       ' + (state.shape === 'drop'
        ? 'step drop -- rise, ' + state.deck + ' mm deck, then a ' +
          Math.round(state.hillHeight) + ' mm vertical edge'
        : state.shape === 'kicker'
        ? 'curved jump -- launch ramp, vertical behind the lip'
        : 'roller -- ' + state.humps + ' hump(s), up and back down'),
      'Size        ' + Math.round(state.hillLength) + ' x ' + Math.round(state.hillWidth) +
        ' x ' + Math.round(state.hillHeight) + ' mm',
      r.slopeLabel.padEnd(11) + ' ' + r.slope.toFixed(1) + ' deg (' + slopeWord(r.slope) + ')',
      'Tiles       ' + r.tiles.length + '  (' + r.tiling.nx + ' along the run x ' +
        r.tiling.ny + ' across)',
      'Largest     ' + r.biggest.m.size.map(function (v) { return Math.round(v); }).join(' x ') +
        ' mm  (bed set to ' + state.bedX + ' x ' + state.bedY + ' mm)' +
        (r.turn ? '  -- turn it on the plate' : ''),
      'Decals      ' + (state.decal === 'none' ? 'none'
        : state.decal + (state.decal === 'checker' ? '' : ' -- "' + state.decalText + '"')),
      'Spikes      ' + (state.spikeLen
        ? r.spikes + ' sockets, ' + state.spikeLen + ' mm spike'
        : 'none'),
      'Filament    ~' + (e.grams / 1000).toFixed(2) + ' kg at ' +
        Math.round(state.infill * 100) + '% infill',
      'Print time  ~' + Math.round(e.hours) + ' h  at ' + state.flow +
        ' mm3/s average, plus 6 min a plate',
      '            (rough -- slice one plate to confirm)', '',
      'Slicing',
      '  0.28 mm layers, 3 walls, 10 top / 4 bottom layers, 25% gyroid.',
      '',
      '  Those last two are higher than the usual defaults for a reason. The low',
      '  end of the ramp is a nearly flat surface over sparse infill, which is',
      '  the classic case for pinholes in the top skin -- the skin sags between',
      '  infill lines before it closes. 25% infill puts a support every ~1.7 mm',
      '  instead of ~2.8 mm, and 10 top layers give it 2.8 mm to close in.',
      '  Also turn on Ensure vertical shell thickness. If it still shows, drop to',
      '  0.2 mm layers: the surface is shallow, so thinner layers put far more',
      '  material under the skin per millimetre of run.',
      '  No supports needed. Add a ~5 mm brim; the footprints are broad and flat.',
      '  PLA indoors only. It softens around 55-60 C, so a hot garage or a sunny',
      '  car will deform it. Use PETG or ASA if it lives outside.', '',
      'Assembly',
      '  tile_IJ: I = position along the run, J = across the width.',
      '  Label each tile as it comes off the plate; they look alike and only one',
      '  arrangement is right.',
      '  Tiles drop straight down into place. The dovetails lock them horizontally,',
      '  so nothing needs sliding and any tile can go in at any time.',
      '  Sockets carry ' + state.fit.toFixed(2) + ' mm clearance per side. If a joint is',
      '  tight, pare the socket walls rather than reprinting.', '',
      'Before he rides it',
    ].concat(state.shape === 'roller' ? [] : [
      state.shape === 'drop'
        ? '  This one ends in a ' + Math.round(state.hillHeight) +
          ' mm vertical edge. Leave clear flat run-out past it,'
        : '  This one launches. Leave clear flat run-out past the lip,',
      '  and note the back of it is a wall if he rides at it the wrong way round.',
    ]).concat([
      '  The dovetails hold tiles to each other but not to the ground. On a hard',
      '  floor the whole hill will skate. Stick rubber pads underneath, run a bead',
      '  of silicone caulk on the undersides, or set it on a rubber-backed rug.',
      '  Check no tile rocks on an uneven floor.',
      '  Helmet.', ''
    ].concat(state.spikeLen ? [
      'Ground spikes',
      '  Print ' + result.spikes + ' of spike_x' + result.spikes + '.stl -- same settings,',
      '  but 4 walls and 40% infill; they are small and take the load.',
      '  Print them stud-down, exactly as oriented. No supports.',
      '  The socket is threaded to match, 3 mm pitch, 0.25 mm clearance, with a',
      '  plain lead-in at the mouth to start the screw. Wind one into each',
      '  socket by the hex flange until the flange meets the tile; they unscrew',
      '  again for indoor use.',
      '  If one binds, work it in and out once to bed the thread -- Joint',
      '  clearance is for the dovetails and will not help here.',
      '  With spikes fitted the hill stands about 3 mm off the ground.', ''
    ] : [])).join('\n');
  }

  // The plywood is the one part you cut rather than print, so it gets its own
  // file with the size in the filename -- visible in the zip listing without
  // opening anything.
  function deckCutSheet() {
    var d = result.deck, p2 = d.params;
    var mm = function (v) { return Math.round(v); };
    var inch = function (v) { return (v / 25.4).toFixed(2); };
    var L = d.sheet.length, W = d.sheet.width;
    // raised cosine of height H and wavelength lam has crest radius
    // R = lam^2 / (2 pi^2 H); strain in a sheet of thickness t is t / 2R
    var lam = p2.hillLength / Math.max(1, p2.humps);
    var crestR = lam * lam / (2 * Math.PI * Math.PI * Math.max(1, p2.hillHeight));
    return [
      'PLYWOOD CUT LIST -- Little Ripper deck ramp',
      '',
      '  ONE PIECE:  ' + mm(L) + ' x ' + mm(W) + ' mm',
      '              ' + inch(L) + ' x ' + inch(W) + ' in',
      '  THICKNESS:  1/8 in (3.2 mm).',
      '',
      '  This ramp bends to a ' + mm(crestR) + ' mm radius at the crest. Dry ply',
      '  takes about 0.5% strain before the outer veneer checks, so the most it',
      '  will bend here is ' + (crestR / 100).toFixed(1) + ' mm thick. 1/4 in ' +
        (6.35 <= crestR / 100 ? 'would also make it' : 'will crack') + '.',
      '',
      '  Grain must run along the ' + mm(L) + ' mm length, or it will not bend',
      '  over the humps without cracking.',
      '',
      '  Cut it 10-20 mm long and trim after bending -- the sheet takes up a',
      '  little length as it curves.',
      '',
      'HOW IT GOES IN',
      '',
      '  No screws and no drilling. The sheet slides into a groove down each',
      '  edge channel, from one end, like a drawer.',
      '',
      '  The width above already allows for it: the sheet runs ' +
        mm(p2.grooveDepth) + ' mm into',
      '  each groove, so it is wider than the gap between the channels.',
      '',
      '  Feed it in from the low end and push. It has to bend as it goes -- that',
      '  is expected. If it binds, ease the leading corners with sandpaper',
      '  rather than forcing it.',
      '',
      '  Slot height is ' + (p2.sheet + p2.plyClear).toFixed(1) + ' mm for a ' +
        p2.sheet.toFixed(2) + ' mm sheet, so there is ' +
        p2.plyClear.toFixed(1) + ' mm of slip.',
      '  Nominal 1/8 in ply that measures over ' +
        (p2.sheet + p2.plyClear).toFixed(1) + ' mm will not go in.',
      '  Measure yours before printing the channels.',
      ''
    ].join('\n');
  }

  function deckReadme() {
    var d = result.deck, p = d.params, e = result.estimate;
    return [
      'LITTLE RIPPER -- plywood deck ramp',
      '',
      p.hillLength + ' x ' + p.hillWidth + ' x ' + p.hillHeight + ' mm, ' +
        p.humps + ' hump(s).',
      'Printed: ' + (e.grams / 1000).toFixed(2) + ' kg, about ' +
        Math.round(e.hours) + ' h.',
      '',
      'PLYWOOD',
      '  One piece, ' + Math.round(d.sheet.length) + ' x ' +
        Math.round(d.sheet.width) + ' mm, 1/8 in (3.2 mm).',
      '  Grain along the length so it bends over the humps.',
      '',
      'PRINT',
      '  ' + d.ribs.length + ' ribs, all different heights -- not interchangeable.',
      '  2 thresholds from threshold_x2.stl.',
      '  Stand the ribs on edge as oriented, so screws drive into the layers',
      '  rather than between them. Brim them; they are thin walls.',
      '  3 walls, 25% gyroid, 6 top layers. These are not riding surfaces.',
      '',
      'ASSEMBLE',
      '  Mark rib centrelines on the underside of the ply, from one end (mm):',
      '    ' + d.ribs.map(function (b) { return Math.round(b.x); }).join(', '),
      '  Ribs go tallest at the crests, descending outward.',
      '  Bend the ply over them and screw down from the crests outward.',
      '  ' + p.screwsPerRib + ' screws per rib at ' +
        d.screwY.map(function (v) { return Math.round(v); }).join(' / ') +
        ' mm across.',
      '  Drill a 2.5 mm pilot through ply AND into the rib -- 8 mm of PLA will',
      '  split if you drive a screw dry. #6 x 1/2 in pan head.',
      '  Fit a threshold at each end over the ply edge.',
      '',
      'CHECK BEFORE RIDING',
      '  Stand on a crest: more than ~3 mm sag means thin ply or a shifted rib.',
      '  Every rib bearing; no rattle when you press between them.',
      '  No step at either threshold -- that is where a wheel catches.',
      '  Screw heads flush. Ease the exposed ply edges with sandpaper.',
      ''
    ].join('\n');
  }

  function downloadZip() {
    var enc = new TextEncoder();
    if (state.build === 'deck') {
      var d = result.deck;
      var df = d.ribs.map(function (b) {
        var m = BR.measure(b.tris);
        return { name: b.name + '.stl', data: BR.stlBinary(b.tris, m.min) };
      });
      d.strips.concat(d.channels).forEach(function (b) {
        var bm = BR.measure(b.tris);
        df.push({ name: b.name + '.stl', data: BR.stlBinary(b.tris, bm.min) });
      });
      var tm = BR.measure(d.threshold.tris);
      df.push({ name: 'threshold_x2.stl',
                data: BR.stlBinary(d.threshold.tris, tm.min) });
      df.push({ name: 'PLYWOOD-CUT-' + Math.round(d.sheet.length) + 'x' +
                      Math.round(d.sheet.width) + 'mm.txt',
                data: enc.encode(deckCutSheet()) });
      df.push({ name: 'README.txt', data: enc.encode(deckReadme()) });
      save(BR.zip(df), slug() + '-deck.zip');
      return;
    }
    var files = result.tiles.map(function (t) {
      return { name: t.name + '.stl', data: BR.stlBinary(t.tris, t.m.min) };
    });
    if (state.spikeLen && result.spikes)
      files.push({ name: 'spike_x' + result.spikes + '.stl',
                   data: BR.stlBinary(BR.spikeMesh(state), [0, 0, 0]) });
    if (state.ams && state.decal !== 'none') {
      var lv = BR.decalLevels(result.params);
      result.tiles.forEach(function (t) {
        lv.forEach(function (L) {
          var body = BR.decalBody(result.params, result.tiling, t.i, t.j, L.rel, 0.9);
          if (body.length)
            files.push({ name: t.name + '_' + L.name + '.stl',
                         data: BR.stlBinary(body, t.m.min) });
        });
      });
    }
    files.push({ name: 'README.txt', data: enc.encode(readme()) });
    files.push({ name: 'bikeramp.scad', data: enc.encode(scadSource()) });
    save(BR.zip(files), slug() + '.zip');
  }

  function scadSource() {
    var map = {
      shape: '"' + state.shape + '"', deck: state.deck,
      decal: '"' + state.decal + '"',
      decal_text: '"' + String(state.decalText).replace(/"/g, '') + '"',
      hill_length: state.hillLength, hill_width: state.hillWidth,
      hill_height: state.hillHeight, humps: state.humps, bevel_run: state.bevelRun,
      crest_flat: state.crestFlat,
      edge_lip: state.edgeLip, bed_x: state.bedX, bed_y: state.bedY,
      fit: state.fit, spike_len: state.spikeLen
    };
    var src = window.SCAD_SOURCE;
    Object.keys(map).forEach(function (k) {
      src = src.replace(new RegExp('^(' + k + '\\s*=\\s*)[^;]+;', 'm'), '$1' + map[k] + ';');
    });
    return src;
  }
  function downloadScad() {
    save(new Blob([scadSource()], { type: 'text/plain' }), 'bikeramp.scad');
  }

  // ------------------------------------------------------------------ boot --
  function boot() {
    var cv = $('#vp-canvas');
    if (!gl.init(cv)) {
      $('#vp').innerHTML = '<p style="padding:24px;color:var(--ink-2)">' +
        'This browser has no WebGL2, so the 3D preview is unavailable. ' +
        'The controls and downloads still work.</p>';
      return;
    }
    var bt = $('#bike-toggle');
    if (bt) bt.addEventListener('click', function () {
      state.bike = !state.bike;
      bt.setAttribute('aria-pressed', String(state.bike));
      gl.upload(buildBuffers()); draw();
    });
    document.querySelectorAll('[data-build]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (state.build === b.dataset.build) return;
        state.build = b.dataset.build;
        state.isolate = null;
        document.querySelectorAll('[data-build]').forEach(function (o) {
          o.setAttribute('aria-pressed', String(o === b));
        });
        rebuild();
      });
    });
    document.querySelectorAll('[data-mode]').forEach(function (b) {
      b.addEventListener('click', function () {
        var was = state.mode;
        state.mode = b.dataset.mode;
        document.querySelectorAll('[data-mode]').forEach(function (o) {
          o.setAttribute('aria-pressed', String(o === b));
        });
        if (state.mode === 'underside') gl.setPitch(-0.85);
        else if (was === 'underside') gl.setPitch(0.42);
        gl.upload(buildBuffers()); draw();
      });
    });
    buildControls();
    rebuild();
    markPreset();
    window.addEventListener('resize', draw);
    // The canvas also changes size when the rail wraps or the frame is resized,
    // neither of which fires a window resize.
    if (window.ResizeObserver) new ResizeObserver(draw).observe(cv);
    if (window.matchMedia) {
      var mq = window.matchMedia('(prefers-color-scheme: dark)');
      if (mq.addEventListener) mq.addEventListener('change', draw);
    }
    new MutationObserver(draw).observe(document.documentElement,
      { attributes: true, attributeFilter: ['data-theme'] });
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
