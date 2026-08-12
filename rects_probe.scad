include <bikeramp.scad>
echo(str("SCAD_N=", len(decal_rects())));
echo(str("SCAD_SUM=", [for(r=decal_rects()) (r[2]-r[0])*(r[3]-r[1])]));
