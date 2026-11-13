# Writes the "cargo parameters" file DCS wants for every Cargo static: <DCS>\Data\<shape>.csv
# (sling-load aerodynamics: force and moment coefficients over angle of attack x sideslip, areas,
# reference lengths, inertia, centres). Same layout as the stock files (Data\barrels_cargo.csv), with our
# own numbers: a plain box, constant drag, no moments. The object never flies; DCS only needs the file.
#
#   python make_cargo_csv.py <out.csv> <length> <width> <height> <mass>
import sys

out, L, W, H, M = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), float(sys.argv[4]), float(sys.argv[5])
AOA = list(range(-180, 181, 15))   # 25
SLIP = list(range(-90, 91, 15))    # 13


def table(v):
    return [";".join(str(v) for _ in AOA) for _ in SLIP]


lines = ["NUMBER OF ANGELS OF ATTACK AND NUMBER OF SIDESLIP ANGELS", "%d;%d" % (len(AOA), len(SLIP)),
         "ANGELS OF ATTACK", ";".join(str(a) for a in AOA),
         "SIDESLIP ANGELS", ";".join(str(a) for a in SLIP)]
for name, v in (("Cx", 1), ("Cy", 1), ("Cz", 1), ("Mx", 0), ("My", 0), ("Mz", 0)):
    lines.append(name)
    lines += table(v)
# a box's inertia about its centre, per unit mass (the stock files look normalised the same way)
ix, iy, iz = (W * W + H * H) / 12, (L * L + W * W) / 12, (L * L + H * H) / 12
lines += ["AERODYNAMIC AREAS", "%g;%g;%g" % (W * H, L * W, L * H),
          "REFERENCE LENGTHS", "%g;%g;%g" % (L, H, W),
          "MOMENTS OF INERTIA", "%g;0;0" % ix, "0;%g;0" % iy, "0;0;%g" % iz,
          "GEOMETRIC CENTER", "0;%g;0" % (H / 2),
          "CENTER OF MASS", "0;%g;0" % (H / 2)]
with open(out, "w", newline="") as f:
    f.write("\r\n".join(lines))
print("wrote", out, "(%d lines)" % len(lines))
