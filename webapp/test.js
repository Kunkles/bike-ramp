// Verify the JS mesher against the OpenSCAD STLs, and check it is watertight.
//   node webapp/test.js
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const BR = require('./geom.js');

// Render straight from the OpenSCAD model so the two implementations are
// compared on the same parameters, not on stale reference files.
function scad(args) {
  const out = path.join(os.tmpdir(), 'bikeramp-check-' + process.pid + '.stl');
  execFileSync('openscad', ['-o', out, ...args,
                            path.join(__dirname, '..', 'bikeramp.scad')],
               { stdio: 'ignore' });
  const tris = readSTL(out);
  fs.unlinkSync(out);
  return BR.measure(tris);
}
function haveOpenSCAD() {
  try { execFileSync('openscad', ['--version'], { stdio: 'ignore' }); return true; }
  catch (e) { return false; }
}

const STL_DIR = path.join(__dirname, '..', 'stl');

function readSTL(file) {
  const raw = fs.readFileSync(file);
  const tris = [];
  if (raw.slice(0, 5).toString() === 'solid' && raw.slice(0, 2048).includes('facet normal')) {
    for (const ln of raw.toString().split('\n')) {
      const t = ln.trim();
      if (t.startsWith('vertex')) tris.push(...t.split(/\s+/).slice(1, 4).map(Number));
    }
  } else {
    const n = raw.readUInt32LE(80);
    for (let k = 0; k < n; k++) {
      const o = 84 + 50 * k;
      for (let v = 0; v < 3; v++)
        for (let c = 0; c < 3; c++) tris.push(raw.readFloatLE(o + 12 + v * 12 + c * 4));
    }
  }
  return tris;
}

// Every directed edge must be matched by exactly one opposite directed edge.
function watertight(tris) {
  const Q = 1e4, edges = new Map();
  const key = (i) => [0, 1, 2].map((c) => Math.round(tris[i + c] * Q)).join(',');
  let bad = 0;
  for (let i = 0; i < tris.length; i += 9) {
    const v = [key(i), key(i + 3), key(i + 6)];
    for (let e = 0; e < 3; e++) {
      const a = v[e], b = v[(e + 1) % 3];
      if (a === b) continue;
      const rev = b + '|' + a;
      if (edges.has(rev) && edges.get(rev) > 0) edges.set(rev, edges.get(rev) - 1);
      else edges.set(a + '|' + b, (edges.get(a + '|' + b) || 0) + 1);
    }
  }
  edges.forEach((n) => { bad += n; });
  return bad;
}

let fail = 0;
const ok = (cond, msg) => { if (!cond) { fail++; console.log('  FAIL ' + msg); } };

console.log('\n1. per-tile agreement with OpenSCAD (stl/)\n');
const r = BR.build({});
console.log(`   ${r.tiling.nx} x ${r.tiling.ny} tiles, slope ${r.slope.toFixed(2)} deg\n`);
console.log('   tile    JS volume   SCAD volume     delta     bbox (js)              leaks');
for (const t of r.tiles) {
  const f = path.join(STL_DIR, t.name + '.stl');
  const ref = fs.existsSync(f) ? BR.measure(readSTL(f)) : null;
  const d = ref ? (t.m.volume - ref.volume) / ref.volume * 100 : NaN;
  const leaks = watertight(t.tris);
  console.log(
    `   ${t.name}  ${(t.m.volume / 1000).toFixed(1).padStart(9)}  ` +
    `${ref ? (ref.volume / 1000).toFixed(1).padStart(11) : '          -'}  ` +
    `${ref ? (d >= 0 ? '+' : '') + d.toFixed(3) + '%' : '     -'}`.padStart(10) + '   ' +
    t.m.size.map((v) => v.toFixed(1).padStart(6)).join(' x ') + '     ' +
    String(leaks).padStart(3));
  if (ref) {
    ok(Math.abs(d) < 0.25, `${t.name} volume differs from OpenSCAD by ${d.toFixed(3)}%`);
    for (let k = 0; k < 3; k++)
      ok(Math.abs(t.m.size[k] - ref.size[k]) < 0.05,
         `${t.name} bbox axis ${k}: ${t.m.size[k].toFixed(2)} vs ${ref.size[k].toFixed(2)}`);
  }
  ok(leaks === 0, `${t.name} is not watertight (${leaks} unmatched edges)`);
}

console.log('\n2. joints mate with clearance, nowhere overlapping\n');
{
  // Uncut hill volume by direct integration of the height field.
  const p = r.params, N = 4000, M = 2000;
  let vol = 0;
  for (let a = 0; a < N; a++) {
    const x = (a + 0.5) * p.hillLength / N;
    for (let b = 0; b < M; b++) {
      const y = (b + 0.5) * p.hillWidth / M;
      vol += BR.hAt(p, x, y);
    }
  }
  vol *= (p.hillLength / N) * (p.hillWidth / M);
  const sum = r.total.volume;
  const gap = vol - sum;
  console.log(`   uncut hill      ${(vol / 1000).toFixed(1)} cm^3`);
  console.log(`   sum of tiles    ${(sum / 1000).toFixed(1)} cm^3`);
  console.log(`   clearance gap   ${(gap / 1000).toFixed(2)} cm^3`);
  ok(gap > 0, 'tiles overlap (sum exceeds the uncut hill)');
  ok(gap / vol < 0.005, 'clearance gap is implausibly large');
}

console.log('\n3. tiling holds across configurations\n');
for (const cfg of [{}, { hillHeight: 70, hillLength: 800 },
                   { humps: 2, hillLength: 1000, hillHeight: 50 },
                   { hillWidth: 450 }, { bevelRun: 0 }, { maxPrint: 180 },
                   { hillLength: 250, hillWidth: 200, hillHeight: 25 },
                   { shape: 'drop', hillLength: 500, hillHeight: 50, deck: 150 },
                   { shape: 'drop', hillLength: 300, hillHeight: 80, deck: 250,
                     spikeLen: 6 },
                   { shape: 'kicker', hillLength: 350, hillHeight: 40 },
                   { shape: 'kicker', hillLength: 250, hillHeight: 90, spikeLen: 6 }]) {
  const b = BR.build(cfg);
  const leaks = b.tiles.reduce((s, t) => s + watertight(t.tris), 0);
  const big = Math.max(b.biggest.m.size[0], b.biggest.m.size[1]);
  console.log(`   ${JSON.stringify(cfg).padEnd(46)} ${b.tiles.length} tiles  ` +
              `max ${big.toFixed(0).padStart(3)}mm  slope ${b.slope.toFixed(1).padStart(4)}  ` +
              `${b.estimate.grams.toFixed(0).padStart(5)} g  leaks ${leaks}`);
  ok(leaks === 0, `${JSON.stringify(cfg)} not watertight`);
  ok(b.fits, `${JSON.stringify(cfg)} produced a tile larger than the bed`);
}

console.log('\n4. ground spikes\n');
{
  const withSpikes = BR.build({ spikeLen: 6 });
  const plain = BR.build({});
  const socket = BR.SPIKE;
  const bore = 0.5 * socket.gon * socket.socketR ** 2 *
               Math.sin(2 * Math.PI / socket.gon) * socket.socketDepth;
  console.log(`   sockets            ${withSpikes.spikes} (one per tile)`);
  // Adding sockets also adds grid lines, which refines the curved surface
  // nearby and adds a little volume back. So check the bore converges on its
  // analytic value as the mesh is refined, rather than pinning one cell size.
  console.log('   cell   removed    analytic bore   error');
  let lastErr = Infinity;
  for (const cell of [8, 3, 1.5]) {
    const a = BR.build({ cell }), b = BR.build({ cell, spikeLen: 6 });
    const removed = a.total.volume - b.total.volume, exp = b.spikes * bore;
    const err = Math.abs(removed - exp) / exp;
    console.log(`   ${String(cell).padStart(4)}   ` +
                `${(removed / 1000).toFixed(3).padStart(7)}   ` +
                `${(exp / 1000).toFixed(3).padStart(13)}   ` +
                `${(err * 100).toFixed(2).padStart(5)}%`);
    ok(err < lastErr, `socket bore error grew when the mesh was refined to ${cell}mm`);
    lastErr = err;
  }
  ok(lastErr < 0.005, 'socket bore does not converge on its analytic volume');

  for (const t of withSpikes.tiles) {
    const leaks = watertight(t.tris);
    ok(leaks === 0, `${t.name} with a socket is not watertight (${leaks})`);
    // the socket must not break through the riding surface
    for (const q of t.spots)
      ok(BR.hAt(withSpikes.params, q[0], q[1]) >= socket.socketDepth + socket.roof - 1e-9,
         `${t.name} socket sits under only ` +
         `${(BR.hAt(withSpikes.params, q[0], q[1]) - socket.socketDepth).toFixed(1)}mm of deck`);
  }

  for (const L of [6, 13, 25]) {
    const m = BR.measure(BR.spikeMesh({ spikeLen: L }));
    const leaks = watertight(BR.spikeMesh({ spikeLen: L }));
    console.log(`   spike ${String(L).padStart(2)}mm          ` +
                `${m.size.map((v) => v.toFixed(1)).join(' x ')} mm   ` +
                `${(m.volume * 1.24e-3).toFixed(1)} g   ` +
                `${leaks === 0 ? 'sealed' : 'LEAKS ' + leaks}`);
    ok(leaks === 0, `spike ${L}mm is not watertight`);
    ok(m.size[2] > L, `spike ${L}mm is shorter than its own protrusion`);
  }
}

if (!haveOpenSCAD()) {
  console.log('\n5. OpenSCAD cross-check  -- SKIPPED (openscad not on PATH)\n');
} else {
  console.log('\n5. OpenSCAD agrees on the spiked model\n');
  const cases = [
    ['tile 1,0 with socket', ['-D', 'part="tile"', '-D', 'tile_i=1', '-D', 'tile_j=0',
                              '-D', 'spike_len=6'],
     () => BR.build({ spikeLen: 6 }).tiles.find((t) => t.name === 'tile_10').m],
    ['tile 0,0 with socket', ['-D', 'part="tile"', '-D', 'tile_i=0', '-D', 'tile_j=0',
                              '-D', 'spike_len=6'],
     () => BR.build({ spikeLen: 6 }).tiles.find((t) => t.name === 'tile_00').m],
    ['spike, 13mm',          ['-D', 'part="spike"', '-D', 'spike_len=13'],
     () => BR.measure(BR.spikeMesh({ spikeLen: 13 }))],
    ['drop, tile 2,0',       ['-D', 'part="tile"', '-D', 'tile_i=2', '-D', 'tile_j=0',
                              '-D', 'shape="drop"', '-D', 'hill_length=500',
                              '-D', 'hill_height=50', '-D', 'deck=150'],
     () => BR.build({ shape: 'drop', hillLength: 500, hillHeight: 50, deck: 150 })
             .tiles.find((t) => t.name === 'tile_20').m],
    ['kicker, tile 1,0',     ['-D', 'part="tile"', '-D', 'tile_i=1', '-D', 'tile_j=0',
                              '-D', 'shape="kicker"', '-D', 'hill_length=350',
                              '-D', 'hill_height=40'],
     () => BR.build({ shape: 'kicker', hillLength: 350, hillHeight: 40 })
             .tiles.find((t) => t.name === 'tile_10').m]
  ];
  for (const [label, args, jsFn] of cases) {
    const ref = scad(args), js = jsFn();
    const d = (js.volume - ref.volume) / ref.volume * 100;
    console.log(`   ${label.padEnd(22)} js ${(js.volume / 1000).toFixed(2).padStart(8)}  ` +
                `scad ${(ref.volume / 1000).toFixed(2).padStart(8)} cm^3   ` +
                `${(d >= 0 ? '+' : '') + d.toFixed(3)}%   ` +
                `bbox ${js.size.map((v) => v.toFixed(1)).join('x')}`);
    ok(Math.abs(d) < 0.6, `${label}: JS and OpenSCAD differ by ${d.toFixed(2)}%`);
    for (let k = 0; k < 3; k++)
      ok(Math.abs(js.size[k] - ref.size[k]) < 0.4,
         `${label}: bbox axis ${k} ${js.size[k].toFixed(2)} vs ${ref.size[k].toFixed(2)}`);
  }
}

console.log(fail ? `\n${fail} FAILURES\n` : '\nall checks passed\n');
process.exit(fail ? 1 : 0);
