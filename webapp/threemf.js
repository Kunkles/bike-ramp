// ---------------------------------------------------------------------------
//  threemf.js -- 3MF output, one file per print plate.
//
//  A 3MF is an OPC package: a zip holding [Content_Types].xml, _rels/.rels and
//  3D/3dmodel.model. The model is XML, so geometry is text and about four times
//  the size of binary STL -- which is why entries are deflated rather than
//  stored, and why vertices are welded first.
//
//  Plates are not part of the 3MF spec. Two outputs, then:
//
//    build3mf()      a plain 3MF -- one per plate, parts arranged in the bed.
//                    Only uses what the spec defines, so any slicer takes it.
//    bambuProject()  every plate in one file, via Metadata/model_settings.config.
//                    That schema was read off a project Bambu Studio saved from
//                    these files rather than guessed at.
//
//  Runs in node (module.exports) and in the browser (window.BikeRamp3MF).
// ---------------------------------------------------------------------------
(function (root) {
  'use strict';

  // Weld identical vertices. A closed mesh shares each vertex about six ways,
  // so this is most of the file size.
  function weld(tris) {
    var map = Object.create(null), verts = [], idx = [], i, k;
    for (i = 0; i < tris.length; i += 3) {
      var x = tris[i], y = tris[i + 1], z = tris[i + 2];
      var key = Math.round(x * 1e4) + ',' + Math.round(y * 1e4) + ',' +
                Math.round(z * 1e4);
      k = map[key];
      if (k === undefined) { k = verts.length / 3; map[key] = k; verts.push(x, y, z); }
      idx.push(k);
    }
    return { verts: verts, idx: idx };
  }

  function num(v) {
    var s = v.toFixed(4);
    if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    return s === '-0' ? '0' : s;
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // objects: [{ name, tris, at:[x,y,z] }]
  function modelXml(objects) {
    var out = ['<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<model unit="millimeter" xml:lang="en-US" ' +
      'xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">\n' +
      ' <resources>\n'];
    objects.forEach(function (o, n) {
      var w = weld(o.tris), i;
      out.push('  <object id="' + (n + 1) + '" type="model" name="' +
               esc(o.name) + '">\n   <mesh>\n    <vertices>\n');
      for (i = 0; i < w.verts.length; i += 3)
        out.push('     <vertex x="' + num(w.verts[i]) + '" y="' +
                 num(w.verts[i + 1]) + '" z="' + num(w.verts[i + 2]) + '"/>\n');
      out.push('    </vertices>\n    <triangles>\n');
      for (i = 0; i < w.idx.length; i += 3)
        out.push('     <triangle v1="' + w.idx[i] + '" v2="' + w.idx[i + 1] +
                 '" v3="' + w.idx[i + 2] + '"/>\n');
      out.push('    </triangles>\n   </mesh>\n  </object>\n');
    });
    out.push(' </resources>\n <build>\n');
    objects.forEach(function (o, n) {
      var a = o.at || [0, 0, 0];
      // 3MF applies [x y z 1] * M, so the basis goes in row-major and the
      // translation last. A quarter turn about z maps x->-y, y->x, which is why
      // a rotated part needs its own height added back to land in the bed.
      var m = o.rot ? '0 1 0 -1 0 0 0 0 1' : '1 0 0 0 1 0 0 0 1';
      out.push('  <item objectid="' + (n + 1) + '" transform="' + m + ' ' +
               num(a[0]) + ' ' + num(a[1]) + ' ' + num(a[2]) + '"/>\n');
    });
    out.push(' </build>\n</model>\n');
    return out.join('');
  }

  var CONTENT_TYPES =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n' +
    ' <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n' +
    ' <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>\n' +
    '</Types>\n';

  var RELS =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n' +
    ' <Relationship Target="/3D/3dmodel.model" Id="rel0" ' +
    'Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>\n' +
    '</Relationships>\n';

  // ------------------------------------------------------------- packing ---
  // Shelf packing, tallest first, with a 90-degree turn allowed. Good enough
  // for parts that are mostly long thin bars, and it never overlaps.
  // `avoid` is a list of [x0,y0,x1,y1] keep-outs in bed coordinates: the X1C's
  // 18 x 28 mm front-left exclusion, and the prime tower if one is reserved.
  function pack(parts, bedX, bedY, gap, avoid) {
    var g = gap == null ? 6 : gap, keep = avoid || [];
    function clashes(x, y, w, h) {
      for (var i = 0; i < keep.length; i++) {
        var k = keep[i];
        if (x < k[2] && k[0] < x + w && y < k[3] && k[1] < y + h) return k;
      }
      return null;
    }
    // Leftmost x at a given y that clears every keep-out, or null. Sliding
    // right is not always possible -- a 242 mm part cannot get past an 18 mm
    // corner on a 250 mm bed -- so callers step the row up instead.
    function slotAt(y, w, h) {
      var x = 0, k = clashes(x, y, w, h), guard = 0;
      while (k && guard++ < 8) { x = k[2] + g; k = clashes(x, y, w, h); }
      return (k || x + w > bedX + 1e-9) ? null : x;
    }
    // Row heights a keep-out pushes us above, lowest first.
    function ledges(from) {
      var ys = [from], i;
      for (i = 0; i < keep.length; i++)
        if (keep[i][3] + g > from) ys.push(keep[i][3] + g);
      ys.sort(function (a, b) { return a - b; });
      return ys;
    }
    // bedX/bedY are the usable area already, so a part only has to fit the bed
    // itself -- the gap goes BETWEEN parts, not around the outside.
    var items = parts.map(function (p, i) {
      return { i: i, w: p.size[0], h: p.size[1], part: p };
    }).sort(function (a, b) { return Math.max(b.w, b.h) - Math.max(a.w, a.h); });

    var plates = [];
    function turns(it) {
      var t = [[it.w, it.h, false]];
      if (Math.abs(it.w - it.h) > 1e-6) t.push([it.h, it.w, true]);
      return t;
    }
    // A row's height is fixed when it is created, because the next row is
    // stacked on it immediately. Growing it here would push later parts into
    // the row above -- which is exactly what it did.
    function put(it, pl, row, w, h, rot) {
      it.at = [row.x, row.y]; it.rot = rot;
      row.x += w + g;
      pl.items.push(it);
    }

    items.forEach(function (it) {
      var tries = turns(it), placed = false, pi, ri, t;

      for (pi = 0; pi < plates.length && !placed; pi++)
        for (ri = 0; ri < plates[pi].rows.length && !placed; ri++)
          for (t = 0; t < tries.length && !placed; t++) {
            var row = plates[pi].rows[ri], w = tries[t][0], h = tries[t][1];
            if (h > row.h + 1e-9) continue;          // must fit the row as built
            var x = row.x, k = clashes(x, row.y, w, h), guard = 0;
            while (k && guard++ < 8) { x = k[2] + g; k = clashes(x, row.y, w, h); }
            if (k || x + w > bedX + 1e-9) continue;
            row.x = x;
            put(it, plates[pi], row, w, h, tries[t][2]);
            placed = true;
          }

      for (pi = 0; pi < plates.length && !placed; pi++)
        for (t = 0; t < tries.length && !placed; t++) {
          var pl = plates[pi], w2 = tries[t][0], h2 = tries[t][1];
          if (w2 > bedX + 1e-9) continue;
          var ys = ledges(pl.y), yi, y2 = null, x2 = null;
          for (yi = 0; yi < ys.length && x2 === null; yi++) {
            if (ys[yi] + h2 > bedY + 1e-9) continue;
            x2 = slotAt(ys[yi], w2, h2);
            if (x2 !== null) y2 = ys[yi];
          }
          if (x2 === null) continue;
          var nr = { x: x2, y: y2, h: h2 };
          pl.rows.push(nr);
          put(it, pl, nr, w2, h2, tries[t][2]);
          pl.y = y2 + h2 + g;
          placed = true;
        }

      for (t = 0; t < tries.length && !placed; t++) {
        var w3 = tries[t][0], h3 = tries[t][1];
        if (w3 > bedX + 1e-9 || h3 > bedY + 1e-9) continue;
        var ys3 = ledges(0), yj, y3 = null, x3 = null;
        for (yj = 0; yj < ys3.length && x3 === null; yj++) {
          if (ys3[yj] + h3 > bedY + 1e-9) continue;
          x3 = slotAt(ys3[yj], w3, h3);
          if (x3 !== null) y3 = ys3[yj];
        }
        if (x3 === null) continue;
        var np = { rows: [], y: 0, items: [] };
        var r0 = { x: x3, y: y3, h: h3 };
        np.rows.push(r0); plates.push(np);
        put(it, np, r0, w3, h3, tries[t][2]);
        np.y = y3 + h3 + g;
        placed = true;
      }

      if (!placed) {
        // genuinely bigger than the bed in both orientations
        it.oversize = true; it.at = [0, 0]; it.rot = false;
        var op = { rows: [], y: 0, items: [it], oversize: true };
        plates.push(op);
      }
    });
    return plates;
  }

  // ---------------------------------------------------------------- zip ----
  var CRCT = (function () {
    var t = new Uint32Array(256), c, n, k;
    for (n = 0; n < 256; n++) {
      c = n;
      for (k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(u8) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < u8.length; i++) c = CRCT[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function deflate(u8) {
    if (typeof module === 'object' && module.exports)
      return Promise.resolve(new Uint8Array(require('zlib').deflateRawSync(u8)));
    if (typeof CompressionStream === 'undefined') return Promise.resolve(null);
    var cs = new CompressionStream('deflate-raw');
    var w = cs.writable.getWriter();
    w.write(u8); w.close();
    return new Response(cs.readable).arrayBuffer().then(function (b) {
      return new Uint8Array(b);
    });
  }

  // files: [{ name, data: Uint8Array }] -> Promise<Uint8Array>
  function zipDeflated(files) {
    return Promise.all(files.map(function (f) { return deflate(f.data); }))
      .then(function (comp) {
        var enc = new TextEncoder(), parts = [], central = [], offset = 0;
        files.forEach(function (f, i) {
          var raw = f.data, packed = comp[i], method = 8;
          if (!packed || packed.length >= raw.length) { packed = raw; method = 0; }
          var name = enc.encode(f.name), crc = crc32(raw);
          var h = new Uint8Array(30 + name.length), d = new DataView(h.buffer);
          d.setUint32(0, 0x04034b50, true); d.setUint16(4, 20, true);
          d.setUint16(8, method, true);
          d.setUint32(14, crc, true);
          d.setUint32(18, packed.length, true); d.setUint32(22, raw.length, true);
          d.setUint16(26, name.length, true);
          h.set(name, 30);
          parts.push(h, packed);

          var cd = new Uint8Array(46 + name.length), c = new DataView(cd.buffer);
          c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true);
          c.setUint16(6, 20, true); c.setUint16(10, method, true);
          c.setUint32(16, crc, true);
          c.setUint32(20, packed.length, true); c.setUint32(24, raw.length, true);
          c.setUint16(28, name.length, true); c.setUint32(42, offset, true);
          cd.set(name, 46);
          central.push(cd);
          offset += h.length + packed.length;
        });
        var csize = central.reduce(function (s, c) { return s + c.length; }, 0);
        var end = new Uint8Array(22), e = new DataView(end.buffer);
        e.setUint32(0, 0x06054b50, true);
        e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
        e.setUint32(12, csize, true); e.setUint32(16, offset, true);

        var total = 0, all = parts.concat(central, [end]);
        all.forEach(function (a) { total += a.length; });
        var out = new Uint8Array(total), at = 0;
        all.forEach(function (a) { out.set(a, at); at += a.length; });
        return out;
      });
  }

  function build3mf(objects) {
    var enc = new TextEncoder();
    return zipDeflated([
      { name: '[Content_Types].xml', data: enc.encode(CONTENT_TYPES) },
      { name: '_rels/.rels', data: enc.encode(RELS) },
      { name: '3D/3dmodel.model', data: enc.encode(modelXml(objects)) }
    ]);
  }


  // ------------------------------------------------- Bambu project (3mf) ---
  // A Bambu project is a 3MF plus Metadata/model_settings.config, which names
  // the objects and says which plate each one belongs to. The schema here was
  // read off a project Bambu Studio saved from these files, not guessed.
  //
  // Studio lays plates out in a grid in world coordinates -- measured at a
  // 307 mm stride, three across, rows running in -y, on a 256 mm bed. That
  // stride is the one empirical constant; the plate assignment below is
  // explicit, so it is what Studio actually reads.
  var PLATE_COLS = 3;
  function plateOrigin(n, bed) {
    var stride = bed + 57, col = n % PLATE_COLS, row = Math.floor(n / PLATE_COLS);
    return [col * stride, -row * stride];
  }

  function modelSettings(plates) {
    var out = ['<?xml version="1.0" encoding="UTF-8"?>\n<config>\n'], id = 1;
    var ids = [];
    plates.forEach(function (pl) {
      var row = [];
      pl.forEach(function (o) {
        out.push('  <object id="' + id + '">\n' +
                 '    <metadata key="name" value="' + esc(o.name) + '"/>\n' +
                 '    <metadata key="extruder" value="1"/>\n' +
                 '    <part id="1" subtype="normal_part">\n' +
                 '      <metadata key="name" value="' + esc(o.name) + '"/>\n' +
                 '      <metadata key="matrix" value="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1"/>\n' +
                 '    </part>\n  </object>\n');
        row.push(id); id++;
      });
      ids.push(row);
    });
    ids.forEach(function (row, n) {
      out.push('  <plate>\n    <metadata key="plater_id" value="' + (n + 1) + '"/>\n' +
               '    <metadata key="plater_name" value=""/>\n' +
               '    <metadata key="locked" value="false"/>\n');
      row.forEach(function (oid) {
        out.push('    <model_instance>\n' +
                 '      <metadata key="object_id" value="' + oid + '"/>\n' +
                 '      <metadata key="instance_id" value="0"/>\n' +
                 '    </model_instance>\n');
      });
      out.push('  </plate>\n');
    });
    out.push('</config>\n');
    return out.join('');
  }

  // plates: [[{name, tris, at:[x,y], rot}], ...]
  function bambuProject(plates, bed) {
    var flat = [], n = 0;
    plates.forEach(function (pl, pi) {
      var org = plateOrigin(pi, bed);
      pl.forEach(function (o) {
        flat.push({ name: o.name, tris: o.tris, rot: o.rot,
                    at: [org[0] + o.at[0], org[1] + o.at[1], 0] });
      });
      n += pl.length;
    });
    var enc = new TextEncoder();
    return zipDeflated([
      { name: '[Content_Types].xml', data: enc.encode(CONTENT_TYPES) },
      { name: '_rels/.rels', data: enc.encode(RELS) },
      { name: '3D/3dmodel.model', data: enc.encode(modelXml(flat)) },
      { name: 'Metadata/model_settings.config',
        data: enc.encode(modelSettings(plates)) }
    ]);
  }

  var api = { build3mf: build3mf, modelXml: modelXml, pack: pack, weld: weld,
              bambuProject: bambuProject };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BikeRamp3MF = api;
})(this);
