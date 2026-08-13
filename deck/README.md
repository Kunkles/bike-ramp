# Plywood deck ramp — v2

A 1100 × 250 mm ramp, two humps, 35 mm tall: a printed frame under a bent
1/8" plywood deck.

|  | printed | time |
|---|---|---|
| this | **0.74 kg** | **~15 h** |
| same ramp printed solid | 2.29 kg | 48 h |

## What changed from v1, and why it got heavier

v1 was 0.30 kg and it was wrong. It was ten loose plates that only became rigid
once the plywood was screwed on, and it asked you to drive screws into an 8 mm
printed edge — which splits, and strips the first time you take it apart.

v2 adds the two things that were missing:

- **A base ladder.** Two strips run the full length with a mortise under every
  rib; each rib has matching feet. The frame stands square and holds its own
  spacing before the ply goes anywhere near it.
- **12 mm ribs**, up from 8, so a screw has real material either side of it.

That is where the extra 0.44 kg went. It is the difference between a jig and a
structure, and it is still 3× lighter and under a third of the time of solid.

## Why this geometry

**Hump spacing is 550 mm because that is the Strider 12's wheelbase.** Both
wheels crest together and the whole bike lifts, so he feels ~97% of the 35 mm.
A single 600 mm hump gives only half its height — when the front wheel is on the
crest the rear is still on flat ground. Turn the bike on in the generator's
viewport and you can see it spans the whole of a 600 mm ramp.

**Don't stretch to 1100 mm humps.** At twice the wheelbase one wheel sits in a
trough while the other is on a crest, they cancel, and it feels flat.

**Ribs are 91.7 mm apart** — inside the 108 mm limit for 1/8" ply to stay under
2 mm sag at a 200 N wheel load, and placed so a rib lands on each crest, where
load and bend are worst.

## Parts — 24 in total

| file | size | qty |
|---|---|---|
| `rib_01`, `rib_04` | 250 × 12 × 30 mm | 1 each |
| `rib_00`, `rib_02`, `rib_03`, `rib_05` | 250 × 12 × 21 mm | 1 each |
| `base_0L` … `base_7R` | 101–220 × 30 × 6 mm | 16 |
| `threshold_x2` | 250 × 80 × 9 mm | **2** |

Ribs are all different heights and are **not** interchangeable. Print them
**standing on edge as oriented**, so ply screws drive into the layers rather
than between them. Brim them. Base strips print flat.

3 walls, 25% gyroid, 6 top layers — none of these is a riding surface.

## Plywood

One piece, **1100 × 250 mm**, 1/8" (3.2 mm), grain along the length.

## Assembly

1. Lay the base strips end to end in two lines. Joints fall midway between ribs
   so a rib always pins them.
2. Drop each rib's feet into its mortises. Rib stations from one end (mm):
   **183, 275, 367, 733, 825, 917** — tallest at 275 and 825.
   Ribs only exist where the deck is airborne. Near the troughs the sheet comes
   down onto the base ladder itself, so there is nothing there to hold up; the
   longest unsupported run works out at 87 mm, inside the 108 mm sag limit.
3. Bend the ply over the frame and screw down **from the crests outward**.
4. Three screws per rib at **20 / 125 / 230 mm** across. Drill a 2.5 mm pilot
   through ply *and* into the rib. **#8 × 3/4"** pan head.
5. Fit a threshold at each end and screw through it.

### If you want it to survive being taken apart

Screws into PLA are fine once. If you expect to disassemble it, drill the rib
tops 4.2 mm and fit **M4 heat-set inserts**, then use M4 machine screws. That is
the difference between a joint that lasts one rebuild and one that lasts many.

## Check before he rides it

1. **Stand on a crest.** More than ~3 mm sag means thin ply or a rib not seated.
2. **Every rib bearing** — no rattle when you press between ribs.
3. **No step at either threshold.** They climb the 6 mm base plus the 3.2 mm
   sheet over an 80 mm run; that is the one place a wheel can catch.
4. Screw heads flush; ease the exposed ply edges with sandpaper.

## Known limits

- **The ply edges are exposed along both sides** — you asked for a hard dropoff
  in v1 and that still stands. No side rails yet.
- **No ground spikes.** On grass, stake the thresholds.
- **Untested in plastic.** The 108 mm rib spacing comes from a beam calculation
  assuming 9 GPa plywood and a 200 N wheel load. Garage ply varies. Print two
  ribs and a base strip, screw an offcut across them, and stand on it before
  committing to the whole build.
- Generated from `webapp/deck.js`; the solid path has an OpenSCAD cross-check
  and this does not.
