# Module joint test — one plate

`module_up` + `module_flat` + `module_down`, 80 mm wide and 40 mm tall, on a
single 250 × 250 plate. About 317 g and 6.5 h total.

## These are small, not scaled

Nothing here is shrunk. **The dovetail is the production part at production
size** — 12 mm deep, 26 mm at the tip, 0.12 mm clearance per side. Only the ramp
around it is short.

That distinction is the whole point. Scaling a module down 3× would scale the
clearance to 0.04 mm, which is under one extrusion width: the joint would fuse
solid and tell you nothing about whether the real one fits. A short ramp with a
full-size joint tells you exactly what a long one would.

Each joint here gets **one** dovetail because the modules are 80 mm wide. At your
330 mm working width the same joint gets three. One is the harder test — all the
load goes through it.

| file | size | weight |
|---|---|---|
| `module_up.stl` | 162 × 80 × 40 mm | ~117 g |
| `module_flat.stl` | 92 × 80 × 40 mm | ~92 g |
| `module_down.stl` | 150 × 80 × 40 mm | ~108 g |

`modules_test_one_plate.3mf` has all three arranged, clear of the wipe patch and
the purge square.

## Slice it like the real thing

0.28 mm layers, **3 walls**, 10 top / 4 bottom, 25% gyroid, no supports, 5 mm
brim. The clearance is what you are testing, so do not change flow or horizontal
expansion from whatever you will use on the real ramp.

## What to check

1. **Does `module_flat` drop onto `module_up` without forcing?** Straight down,
   not slid. Snug is right; a mallet is not.
2. **Take it apart and put it back.** Twice. This joint exists so the ramp can be
   dismantled for storage — if it only goes together once, that has failed.
3. **Press down on the seam.** Any hinge or step where the two surfaces meet?
4. **Assemble all three** (380 mm long) and run a finger along the top. The
   transition should be smooth — every module leaves its end at zero slope, so
   there should be no detectable kink at either joint.

If it is tight, raise **Joint clearance** 0.12 → 0.16 and reprint one piece. If
it rattles, drop to 0.10.

## Do not read the slope

At 150 mm long and 40 mm tall the approach is 22°, against 17° on the medium
ramp. That is a consequence of making it short enough to fit a plate. It is a fit
test, not a ride test.
