# Test plate

One plate, full-size joints. Print this before committing to the real hill.

A 180 × 160 × 30 mm hill, deliberately small — but **nothing here is scaled**.
Every fit is the production value: 0.35 mm dovetail clearance, 0.25 mm thread
clearance, 3 mm pitch. Scaling the model would shrink those into the width of a
single extrusion and tell you nothing about whether the real parts fit.

| file | size | weight |
|---|---|---|
| `tile_00.stl` | 102 × 160 × 30 mm | ~84 g |
| `tile_10.stl` | 90 × 160 × 30 mm | ~79 g |
| `spike.stl` | 18 × 16 × 19 mm | ~1.5 g — print 2 |

Both tiles fit one 250 × 250 plate side by side, using 196 × 160 mm.
About 163 g and 5 h total (nearer 3.5 h on an X1C).

## Slice it exactly like the real thing

0.28 mm layers, 3 walls, 6 top / 4 bottom, 15% gyroid, no supports, 5 mm brim.
Spikes the same but 4 walls and 40% infill, printed stud-down as oriented.

## What to check

1. Does `tile_10` **drop** onto `tile_00` without forcing? There is one real
   dovetail on the seam. Snug is right; needing a mallet is not.
2. Does a spike **wind into each socket by hand, and back out again**? This is
   the least-proven part of the design.
3. Run a finger across the seam — is the riding surface continuous?
4. Do the tiles sit flat, or has a corner lifted?
5. Lean on it. 15% gyroid should not dimple under a thumb.

If the dovetail is tight, raise **Joint clearance** 0.35 → 0.45 and reprint one
tile. If a spike binds, work it in and out once to bed the thread.

At 180 mm long and 30 mm tall the slope is 26.7°, twice the real hill's 12.9°.
That is fine for checking fit, surface and warp — don't read anything into how
it rides.

## Regenerating it

In the [generator](https://kunkles.github.io/bike-ramp/): Length **180**,
Width **160**, Height **30**, Side taper **60**, bed **110 × 250**.

Shrinking the bed is the trick — it forces the split into two tiles so there is
a joint to test. You still print both on your real plate.

Or from OpenSCAD:

```bash
./render.sh -D hill_length=180 -D hill_width=160 -D hill_height=30 \
            -D bevel_run=60 -D spike_len=6 -D bed_x=110 -D bed_y=250
```
