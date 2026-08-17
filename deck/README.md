# Plywood deck ramp — v3

A 1100 × 250 mm ramp, two humps, 35 mm tall: a printed frame with the plywood
deck **slid into a groove down each edge**. No screws, no drilling.

|  | printed | time |
|---|---|---|
| this | **1.19 kg** | **~24 h** |
| same ramp printed solid | 2.29 kg | 48 h |

## How the sheet is held

It slides in from one end, like a drawer. Each edge channel carries a groove at
deck height; the sheet runs 8 mm into each side, so it is wider than the gap
between the channels and cannot lift out.

That replaces v2's "drill a pilot through the ply and into a 12 mm printed edge,
three times per rib". Screws into PLA work once and strip on the second go, and
the whole point of this thing is that a five-year-old ramp should come apart and
go back together.

The channels also cap the exposed plywood edges, which were a known limit in v1
and v2.

**Slot height is 3.7 mm for a 3.18 mm sheet — 0.5 mm of slip.** Nominal 1/8"
plywood varies. Measure yours before printing 10 channel segments: anything over
3.7 mm will not go in.

## Why this geometry

**Hump spacing is 550 mm because that is the Strider 12's wheelbase.** Both
wheels crest together and the whole bike lifts, so he feels ~97% of the 35 mm. A
single 600 mm hump gives only half its height — when the front wheel is on the
crest the rear is still on flat ground.

**Don't stretch to 1100 mm humps.** At twice the wheelbase one wheel sits in a
trough while the other is on a crest, they cancel, and it feels flat.

**Ribs are 91.7 mm apart** — inside the 108 mm limit for 1/8" ply to stay under
2 mm sag at a 200 N wheel load, and placed so a rib lands on each crest.

## Parts — 42 in total

| file | what | qty |
|---|---|---|
| `rib_00` … `rib_05` | cross ribs, all different heights | 6 |
| `base_0a` … `base_7c` | base ladder, three lines | 24 |
| `channel_0L` … `channel_4R` | edge channels, the sheet slides in these | 10 |
| `threshold_x2` | end run-ups | **2** |

Ribs are **not** interchangeable. Print them standing on edge as oriented; base
strips and channels print flat. 3 walls, 25% gyroid, 6 top layers — none of
these is a riding surface.

## Plywood

One piece, **1100 × 234 mm**, 1/8" (3.2 mm), grain along the length.

Note the 234: it is *not* the ramp width. The sheet is narrower than the ramp
overall and wider than the gap between the channels, because it sits 8 mm inside
each groove. The generator's cut list gives the exact number for your settings.

## Assembly

1. Lay the base strips end to end in three lines.
2. Drop each rib's feet into its mortises. Stations from one end (mm):
   **183, 275, 367, 733, 825, 917** — tallest at 275 and 825. There is no rib
   between 367 and 733; that is the middle trough, where the deck comes down on
   the base ladder.
3. Set a channel run down each edge, grooves facing in.
4. **Feed the sheet in from the low end and push.** It bends as it goes; that is
   expected. If it binds, ease the leading corners with sandpaper — don't force
   it.
5. Butt a threshold against each end, outside the ramp.

## Check before he rides it

1. **Stand on a crest.** More than ~3 mm sag means thin ply or a rib not seated.
2. **Every rib bearing** — no rattle when you press between ribs.
3. **No step at either threshold.** The deck sits 9.2 mm up; each threshold
   climbs that over an 80 mm run. This is the one place a wheel can catch.
4. **Sheet fully home at both ends**, not standing proud of a channel.

## Joining modules

Set the shape to **Module: up / flat / down** and the frame gains a joint at each
end where the ramp is at full height.

The base strips stop with a **half-mortise** at the module face. Butt two
modules and the two halves make a whole mortise; one rib's feet drop into it and
span the seam, tying the modules together. That same rib carries the end of both
plywood sheets, so the riding surface stays flush across the joint.

Both modules ship a rib for the shared station and they are identical, so **use
either one and keep the spare** — you get one spare rib per joint.

The channels butt end to end. They sit on the ground and the shared rib holds
them in line, so there is nothing to fasten.

**A roller will not join anything.** It returns to the ground at both ends, so
there is no full-height face to mate with. Use up / flat / down for anything you
intend to extend later.

## Known limits

- **Untested in plastic.** Rib spacing comes from a beam calculation assuming
  9 GPa plywood and a 200 N wheel load. Garage ply varies.
- **The slide-in fit is unproven.** 0.5 mm of slip over a 1100 mm curved run is
  a guess. Print **one channel segment and one rib**, and try a plywood offcut
  in it before printing the other nine.
- **No ground spikes.** On grass, stake the thresholds.
- Generated from `webapp/deck.js`; the solid path has an OpenSCAD cross-check
  and this does not.
- **The module joint is untested in plastic.** It resists the modules sliding
  apart and keeps them level, but nothing stops a determined lift. If it works
  loose in use, a strap or a stake through the end thresholds will hold it.

## Wider than your bed

A rib spans between the channels and prints standing on edge, so its footprint
is as long as the ramp is wide. Past the bed it is cut over the centre of a base
strip, where the mortise holds both halves. Those parts are named `rib_00a`,
`rib_00b`. Base strips and channels are cut to the bed the same way, so all
three follow whichever printer is selected in the generator.
