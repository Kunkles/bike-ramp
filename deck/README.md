# Plywood deck ramp — v1

A 1100 × 250 mm ramp, two humps, 35 mm tall, built as printed ribs under a
bent 1/8" plywood deck.

|  | printed | time |
|---|---|---|
| this | **0.30 kg** | **~6 h** |
| same ramp printed solid | 2.29 kg | 48 h |

The saving is not cleverness about infill — it is that the sheet replaces the
printed top skin, and on a solid ramp the top skin alone is 983 g.

## Why this geometry

**Hump spacing is 550 mm because that is the Strider's wheelbase.** Both wheels
then crest together and the whole bike lifts, so he feels ~97% of the 35 mm. A
single 600 mm hump only delivers half its height, because when the front wheel
is on the crest the rear is still on flat ground.

**Do not stretch this to 1100 mm humps.** At twice the wheelbase one wheel sits
in a trough while the other is on a crest, they cancel, and a big impressive
ramp feels almost perfectly flat.

**Ribs are 91.7 mm apart** — inside the 108 mm limit for 1/8" ply to stay under
2 mm of sag with a 200 N wheel load, and chosen so a rib lands exactly on each
crest, where both the load and the bend are worst.

## Parts

| file | size | qty | each |
|---|---|---|---|
| `rib_02`, `rib_07` | 250 × 8 × 32 mm | 1 each | 44 g |
| `rib_01`, `rib_03`, `rib_06`, `rib_08` | 250 × 8 × 24 mm | 1 each | 34 g |
| `rib_00`, `rib_04`, `rib_05`, `rib_09` | 250 × 8 × 7 mm | 1 each | 13 g |
| `threshold_x2` | 250 × 25 × 3 mm | **2** | 12 g |

Every rib is a different height — they are not interchangeable. Print them
**standing on edge, as oriented**, so screws drive into the layers rather than
between them. Use a brim; they are thin walls.

3 walls, 25% gyroid, 6 top layers. These are not riding surfaces, so they don't
need the 10-layer top shell the solid ramp does.

Three ribs are deliberately missing near the troughs — there the ramp is
shallower than the ply is thick, so the sheet just lies on the ground.

## Plywood

One piece, **1100 × 250 mm**, 1/8" (3.2 mm).

Cut it slightly long and trim after bending. Grain should run **along** the
1100 mm length so it bends over the humps.

## Assembly

1. Mark rib centrelines on the *underside* of the ply, measured from one end:

   **92, 183, 275, 367, 458, 642, 733, 825, 917, 1008 mm**

   They are not evenly spaced across the whole sheet — the gap at 458→642
   straddles the middle trough.

2. Lay the ribs on the ground on their marks, tallest (`rib_02`, `rib_07`) at
   275 and 825. Ribs go in ascending-then-descending order out from each crest.
3. Bend the ply over them and screw down, working **from the crests outward** so
   the sheet is not fighting you.
4. Three screws per rib, at 20 / 125 / 230 mm across the width. Drill a 2.5 mm
   pilot **through the ply and into the rib** — 8 mm of PLA will split if you
   drive a screw dry. #6 × 1/2" pan head.
5. Fit a threshold at each end, over the ply edge, and screw through it.

## What to check before he rides it

1. **Stand on the crest.** More than ~3 mm of sag means the ply is thinner than
   1/8", or a rib has shifted off its mark.
2. **Check every rib is bearing.** A rib that isn't touching the ply does
   nothing; the sheet should not rattle when you press between ribs.
3. **Feel the thresholds.** No step at either end — that is the one place a
   wheel can catch.
4. **Nothing proud of the deck.** Every screw head fully countersunk or seated
   flush.

## Known limits of v1

- **The ply edges are exposed along both sides.** You asked for a hard dropoff
  for the first version, so there are no side rails. Ease the edges with
  sandpaper before he rides it.
- **No ground spikes.** The solid ramp's threaded spikes don't attach to
  anything here yet. On grass, stake the thresholds down.
- **Ribs are loose until the deck is on.** The sheet is the structure — it ties
  the ribs upright and holds their spacing. Don't judge the frame before it is
  screwed together.
- Not yet in the web generator; these were produced from `webapp/deck.js`.
