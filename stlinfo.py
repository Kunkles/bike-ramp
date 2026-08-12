#!/usr/bin/env python3
"""Bounding box + solid volume of a binary STL, and what that costs in PLA."""
import struct, sys

DENSITY = 1.24e-3  # g/mm^3, PLA


def read(path):
    raw = open(path, "rb").read()
    if raw[:5] == b"solid" and b"facet normal" in raw[:2048]:
        verts = [tuple(map(float, ln.split()[1:4]))
                 for ln in raw.decode().splitlines()
                 if ln.strip().startswith("vertex")]
        return [tuple(verts[i:i + 3]) for i in range(0, len(verts), 3)]
    (n,) = struct.unpack("<I", raw[80:84])
    return [(d[3:6], d[6:9], d[9:12])
            for d in (struct.unpack_from("<12fH", raw, 84 + 50 * k)
                      for k in range(n))]


def report(path, fill):
    tris = read(path)
    vol = sum(
        (a[0] * (b[1] * c[2] - c[1] * b[2])
         - a[1] * (b[0] * c[2] - c[0] * b[2])
         + a[2] * (b[0] * c[1] - c[0] * b[1])) / 6.0
        for a, b, c in tris
    )
    pts = [p for t in tris for p in t]
    lo = [min(p[i] for p in pts) for i in range(3)]
    hi = [max(p[i] for p in pts) for i in range(3)]
    grams = abs(vol) * DENSITY * fill
    print(
        f"{path.split('/')[-1]:<12} "
        f"bbox {hi[0]-lo[0]:6.1f} x {hi[1]-lo[1]:6.1f} x {hi[2]-lo[2]:5.1f} mm   "
        f"solid {abs(vol)/1000:7.1f} cm^3   ~{grams:6.0f} g @ {fill:.0%}"
    )
    return abs(vol), grams


if __name__ == "__main__":
    fill = float(sys.argv[1])
    tot_v = tot_g = 0.0
    for p in sys.argv[2:]:
        v, g = report(p, fill)
        tot_v += v
        tot_g += g
    print(f"{'TOTAL':<12} {len(sys.argv)-2} parts   "
          f"{tot_v/1000:.1f} cm^3 solid   ~{tot_g:.0f} g  (~{tot_g/1000:.1f} kg)")
