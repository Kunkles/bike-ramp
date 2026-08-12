#!/usr/bin/env python3
"""Flat-shaded painter's-algorithm preview of the exported STLs.

    python3 preview.py out.png assembled     # whole hill, tiles in place
    python3 preview.py out.png stl/tile_10.stl
"""
import math
import sys

from PIL import Image, ImageDraw

from stlinfo import read

W, H = 1500, 950
YAW, PITCH = math.radians(-38), math.radians(26)
LIGHT = (0.35, 0.5, 0.79)
BASE = (58, 110, 175)
BG = (247, 247, 248)


def project(tris):
    cy, sy = math.cos(YAW), math.sin(YAW)
    cp, sp = math.cos(PITCH), math.sin(PITCH)
    out = []
    for t in tris:
        p = []
        for x, y, z in t:
            x1, y1 = x * cy - y * sy, x * sy + y * cy
            y2, z2 = y1 * cp - z * sp, y1 * sp + z * cp
            p.append((x1, -y2, z2))
        out.append(p)
    return out


def render(groups, path):
    tris = []
    for offset, mesh in groups:
        tris += [[(v[0] + offset[0], v[1] + offset[1], v[2] + offset[2]) for v in t]
                 for t in mesh]
    proj = project(tris)

    xs = [p[0] for t in proj for p in t]
    ys = [p[1] for t in proj for p in t]
    sc = min(W * 0.88 / (max(xs) - min(xs)), H * 0.88 / (max(ys) - min(ys)))
    ox = W / 2 - (max(xs) + min(xs)) / 2 * sc
    oy = H / 2 - (max(ys) + min(ys)) / 2 * sc

    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    for tri, flat in sorted(zip(tris, proj), key=lambda p: sum(v[2] for v in p[1])):
        (ax, ay, az), (bx, by, bz), (cx, cy_, cz) = tri
        ux, uy, uz = bx - ax, by - ay, bz - az
        vx, vy, vz = cx - ax, cy_ - ay, cz - az
        nx, ny, nz = uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx
        n = math.sqrt(nx * nx + ny * ny + nz * nz) or 1
        lam = abs(nx / n * LIGHT[0] + ny / n * LIGHT[1] + nz / n * LIGHT[2])
        sh = 0.42 + 0.58 * lam
        d.polygon([(p[0] * sc + ox, p[1] * sc + oy) for p in flat],
                  fill=tuple(min(255, int(c * sh)) for c in BASE))
    img.save(path)
    print(f"wrote {path}  ({len(tris)} triangles)")


if __name__ == "__main__":
    out = sys.argv[1]
    if sys.argv[2] == "assembled":
        nx, ny, px, py = 3, 2, 200.0, 150.0
        groups = [((i * px, j * py, 0), read(f"stl/tile_{i}{j}.stl"))
                  for i in range(nx) for j in range(ny)]
    else:
        groups = [((0, 0, 0), read(p)) for p in sys.argv[2:]]
    render(groups, out)
