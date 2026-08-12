(function () {
  'use strict';
  var BR = window.BikeRamp;

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
    spikeLen: 6, infill: 0.15, colour: '#FF2E88', mode: 'assembled', isolate: null
  });

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
      { k:'bevelRun',   label:'Side taper', min:0,   max:250,  step:5,  unit:'mm',
        hint:'How far the sides slope down to the floor. 0 gives a cliff edge.' }
    ]},
    { group:'Printer', custom:'printer', items:[
      { k:'fit', label:'Joint clearance', min:0.1, max:0.8, step:0.05, unit:'mm',
        hint:'Cut into each socket, per side. Raise it if your prints run tight.' }
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

  // ------------------------------------------------------------- geometry ---
  function rebuild() {
    result = BR.build(state);
    result.estimate = BR.estimate(result.total, {
      infill: state.infill, flow: state.flow, plates: result.tiles.length
    });
    applyVisibility();
    syncShape();
    renderReadouts();
    renderTiles();
    gl.upload(buildBuffers());
    draw();
  }

  function tileOffset(t) {
    if (state.mode !== 'exploded') return [0, 0, 0];
    var g = 55, tl = result.tiling;
    return [(t.i - (tl.nx - 1) / 2) * g, (t.j - (tl.ny - 1) / 2) * g, 0];
  }

  function visibleTiles() {
    return state.isolate == null ? result.tiles
      : result.tiles.filter(function (t) { return t.name === state.isolate; });
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
    var data = new Float32Array(n * 7), w = 0, nrm = [0, 0, 0];

    tiles.forEach(function (t) {
      var off = tileOffset(t);
      var shade = 1 - ((t.i + t.j) % 2) * (state.mode === 'exploded' ? 0.07 : 0.025);
      var tr = t.tris;
      for (var k = 0; k < tr.length; k += 9) {
        var ax=tr[k],ay=tr[k+1],az=tr[k+2],bx=tr[k+3],by=tr[k+4],bz=tr[k+5],
            cx=tr[k+6],cy=tr[k+7],cz=tr[k+8];
        var ux=bx-ax,uy=by-ay,uz=bz-az,vx=cx-ax,vy=cy-ay,vz=cz-az;
        var fx=uy*vz-uz*vy, fy=uz*vx-ux*vz, fz=ux*vy-uy*vx;
        var m = Math.hypot(fx,fy,fz) || 1;
        var smooth = fz / m > 0.15;
        var mx = (ax + bx + cx) / 3, my = (ay + by + cy) / 3;
        for (var v = 0; v < 3; v++) {
          var x=tr[k+v*3], y=tr[k+v*3+1], z=tr[k+v*3+2];
          if (smooth) topNormal(p, x, y, mx, my, nrm);
          else { nrm[0]=fx/m; nrm[1]=fy/m; nrm[2]=fz/m; }
          data[w++]=x+off[0]; data[w++]=y+off[1]; data[w++]=z+off[2];
          data[w++]=nrm[0]; data[w++]=nrm[1]; data[w++]=nrm[2];
          data[w++]=shade;
        }
      }
    });

    var bb = [Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity];
    for (i = 0; i < w; i += 7)
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
      'in vec3 aPos; in vec3 aNrm; in float aShade;\n' +
      'uniform mat4 uMVP;\n' +
      'out vec3 vN; out float vS;\n' +
      'void main(){ vN=aNrm; vS=aShade; gl_Position=uMVP*vec4(aPos,1.0); }';
    var FS = '#version 300 es\nprecision highp float;\n' +
      'in vec3 vN; in float vS;\n' +
      'uniform vec3 uColor;\n' +
      'out vec4 o;\n' +
      'void main(){\n' +
      '  vec3 n=normalize(vN);\n' +
      '  float key=max(dot(n,normalize(vec3(-0.35,-0.75,0.78))),0.0);\n' +
      '  float rim=max(dot(n,normalize(vec3(0.75,0.5,0.15))),0.0);\n' +
      '  float sky=0.5+0.5*n.z;\n' +
      '  float fill=max(-n.z,0.0);\n' +
      '  vec3 c=uColor*(0.26+0.62*key+0.20*sky+0.20*fill)+vec3(0.10)*rim*0.5;\n' +
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
        var n = parseInt(state.colour.slice(1), 16);
        g.uniform3f(g.getUniformLocation(prog, 'uColor'),
                    (n>>16&255)/255, (n>>8&255)/255, (n&255)/255);
        g.bindBuffer(g.ARRAY_BUFFER, vbo);
        var ap = g.getAttribLocation(prog, 'aPos'),
            an = g.getAttribLocation(prog, 'aNrm'),
            as = g.getAttribLocation(prog, 'aShade');
        [ap, an, as].forEach(function (a) { g.enableVertexAttribArray(a); });
        g.vertexAttribPointer(ap, 3, g.FLOAT, false, 28, 0);
        g.vertexAttribPointer(an, 3, g.FLOAT, false, 28, 12);
        g.vertexAttribPointer(as, 1, g.FLOAT, false, 28, 24);
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
  function renderReadouts() {
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
    result.tiles.forEach(function (t) {
      var b = el('button', 'tile');
      b.type = 'button';
      b.setAttribute('aria-pressed', String(state.isolate === t.name));
      b.appendChild(el('span', 'n', t.name.replace('tile_', '')));
      b.appendChild(el('span', 'd', t.m.size.map(function (v) { return Math.round(v); })
        .join('\u00d7') + '  ' +
        Math.round(BR.estimate(t.m, { infill: state.infill }).grams) + 'g'));
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
  var bedInputs = null;

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

    var fg = el('div', 'group');
    fg.appendChild(el('h2', null, 'Filament colour'));
    var sw = el('div', 'swatches');
    FILAMENTS.forEach(function (hex) {
      var b = el('button', 'swatch');
      b.type = 'button'; b.style.background = hex;
      b.setAttribute('aria-label', 'Preview in ' + hex);
      b.setAttribute('aria-pressed', String(state.colour === hex));
      b.addEventListener('click', function () {
        state.colour = hex;
        Array.prototype.forEach.call(sw.children, function (o) {
          o.setAttribute('aria-pressed', String(o === b));
        });
        draw();
      });
      sw.appendChild(b);
    });
    fg.appendChild(sw);
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
    f.innerHTML = 'Slice with 3 walls, 6 top / 4 bottom layers, gyroid infill, ' +
      'no supports, a 5&nbsp;mm brim. <strong>PLA indoors only</strong> \u2014 it sags ' +
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
  function applyVisibility() {
    CONTROLS.forEach(function (g) {
      g.items.forEach(function (it) {
        if (it._el) it._el.style.display = !it.show || it.show() ? '' : 'none';
      });
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
      '  0.28 mm layers, 3 walls, 6 top / 4 bottom layers, gyroid infill.',
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

  function downloadZip() {
    var files = result.tiles.map(function (t) {
      return { name: t.name + '.stl', data: BR.stlBinary(t.tris, t.m.min) };
    });
    var enc = new TextEncoder();
    if (state.spikeLen && result.spikes)
      files.push({ name: 'spike_x' + result.spikes + '.stl',
                   data: BR.stlBinary(BR.spikeMesh(state), [0, 0, 0]) });
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
