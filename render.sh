#!/usr/bin/env bash
# Export every tile to ./stl/. Any -D overrides you pass are forwarded to
# OpenSCAD, e.g.:  ./render.sh -D hill_height=60 -D hill_length=800
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p stl

probe="$(mktemp -t bikeramp).stl"
trap 'rm -f "$probe"' EXIT
info="$(openscad -o "$probe" "$@" bikeramp.scad 2>&1 | sed -n 's/.*ECHO: "tiles: \(.*\)"/tiles: \1/p')"
echo "$info"
NX="$(sed -n 's/tiles: \([0-9]*\) x .*/\1/p' <<<"$info")"
NY="$(sed -n 's/tiles: [0-9]* x \([0-9]*\) .*/\1/p' <<<"$info")"

echo "exporting ${NX}x${NY} tiles..."
for ((i = 0; i < NX; i++)); do
  for ((j = 0; j < NY; j++)); do
    out="stl/tile_${i}${j}.stl"
    openscad -o "$out" -D "part=\"tile\"" -D "tile_i=$i" -D "tile_j=$j" "$@" \
        bikeramp.scad 2>/dev/null
    echo "  $out"
  done
done
