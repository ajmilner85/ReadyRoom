# Builds the deck route lines (CATCC_RouteNN_Stock / _Bent / _Moved .edm) from routes.json: for each
# spawn-spot -> catapult route a flat strip painted along the route, with a square pad on every route point.
# White = the route as DCS ships it, red = the director test's 5 m bend (what the installed test computes),
# blue = the route with its spawn spot moved (director-test.ps1 -Spawn Shift) plus a yellow X on the stock
# spawn spot.
#
# Headless, with Blender 4.5 LTS and Eagle Dynamics' Blender EDM Exporter (as chock-model/build_chock.py):
#   set BLENDER_USER_SCRIPTS=C:\Users\ajmil\Tools\blender-user-scripts
#   blender.exe --background --factory-startup --python build_route_lines.py -- <routes.json> <Shapes dir>
#
# Axes: the exporter writes Blender (x, y, z) as DCS (x, z, -y) (probe: a line to (1,2,3) came out as
# (1,3,-2)). Ship coordinates are x forward, y up, z to starboard, so Blender X = forward, Blender
# Y = port (-starboard), Blender Z = up. Origin: the route's first point (its spawn spot), on the deck:
# the static is linked to the carrier at that point's offsets and sits on the deck there; every route
# point is at the same deck height (20.1494) in DCS's data.
import json
import math
import os
import sys
import bpy
import bmesh
import addon_utils

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
SRC, OUT = argv[0], argv[1]

STRIP_W = 0.30   # strip width (m)
PAD = 0.80       # square pad on each route point (m)
LOOKS = {
    # name: colour, height of the strip above the deck (the coloured ones a little higher where they overlap)
    'Stock': ((0.95, 0.95, 0.95, 1.0), 0.03),
    'Bent': ((0.90, 0.05, 0.05, 1.0), 0.05),
    # director-test.ps1 -Spawn Shift; this model also carries a yellow X on the stock spawn spot
    'Moved': ((0.10, 0.35, 0.95, 1.0), 0.05),
}
X_RGBA = (0.98, 0.80, 0.05, 1.0)
X_LEN, X_W = 4.0, 0.40   # each bar of the X

addon_utils.enable('io_scene_edm', default_set=True, persistent=True)
from edm_materials import strap_shader_group                       # noqa: E402
from materials.materials import build_material_descriptions        # noqa: E402
from materials.material_default import DefaultMaterial             # noqa: E402


def clear():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for c in list(bpy.data.collections):
        bpy.data.collections.remove(c)
    for m in list(bpy.data.meshes):
        bpy.data.meshes.remove(m)
    for m in list(bpy.data.materials):
        bpy.data.materials.remove(m)


def material(name, rgba):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    for n in list(nodes):
        if n.type != 'OUTPUT_MATERIAL':
            nodes.remove(n)
    out = next(n for n in nodes if n.type == 'OUTPUT_MATERIAL')
    pbr = nodes.new(type=DefaultMaterial.node_group_name)
    strap_shader_group(pbr, build_material_descriptions()[DefaultMaterial.name])
    pbr.inputs['Base Color'].default_value = rgba
    mat.node_tree.links.new(pbr.outputs[0], out.inputs['Surface'])
    return mat


def build(name, pts, rgba, h, x_at=None):
    """pts: ship (x, z) of the route points; Blender coords relative to the first one.
    x_at: ship (x, z) for a yellow X (the stock spawn spot), drawn with a second material"""
    x0, z0 = pts[0]
    P = [(x - x0, -(z - z0)) for x, z in pts]
    verts, faces, mat_idx = [], [], []

    def quad(a, b, c, d, z, m=0):
        i = len(verts)
        verts.extend([(a[0], a[1], z), (b[0], b[1], z), (c[0], c[1], z), (d[0], d[1], z)])
        faces.append((i, i + 1, i + 2, i + 3))
        mat_idx.append(m)

    if x_at is not None:
        cx, cy = x_at[0] - x0, -(x_at[1] - z0)
        for ang in (math.pi / 4, -math.pi / 4):
            ux, uy = math.cos(ang) * X_LEN / 2, math.sin(ang) * X_LEN / 2
            vx, vy = -math.sin(ang) * X_W / 2, math.cos(ang) * X_W / 2
            quad((cx - ux - vx, cy - uy - vy), (cx + ux - vx, cy + uy - vy), (cx + ux + vx, cy + uy + vy),
                 (cx - ux + vx, cy - uy + vy), h + 0.02 + (0.005 if ang < 0 else 0), 1)

    w = STRIP_W / 2
    for (ax, ay), (bx, by) in zip(P, P[1:]):
        dx, dy = bx - ax, by - ay
        m = math.hypot(dx, dy)
        if m < 1e-6:
            continue
        nx, ny = -dy / m * w, dx / m * w
        quad((ax + nx, ay + ny), (ax - nx, ay - ny), (bx - nx, by - ny), (bx + nx, by + ny), h)
    p = PAD / 2
    for (x, y) in P:
        quad((x - p, y - p), (x + p, y - p), (x + p, y + p), (x - p, y + p), h + 0.01)

    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.faces.ensure_lookup_table()
    for f in bm.faces:  # all faces up (seen from above)
        f.normal_update()
        if f.normal.z < 0:
            f.normal_flip()
        f.material_index = mat_idx[f.index]
    bm.to_mesh(me)
    bm.free()
    me.update()
    o = bpy.data.objects.new(name, me)
    o.data.materials.append(material(name + '_Mat', rgba))
    if x_at is not None:
        o.data.materials.append(material(name + '_X', X_RGBA))
    return o


routes = json.load(open(SRC))['routes']
os.makedirs(OUT, exist_ok=True)
for r in routes:
    for look, (rgba, h) in LOOKS.items():
        clear()
        col = bpy.data.collections.new('Visual')
        bpy.context.scene.collection.children.link(col)
        name = 'CATCC_Route%02d_%s' % (r['n'], look)
        pts = [(p[0], p[2]) for p in r[look.lower()]]
        x_at = (r['stock'][0][0], r['stock'][0][2]) if look == 'Moved' else None
        col.objects.link(build(name, pts, rgba, h, x_at))
        res = bpy.ops.edm.export(filepath=os.path.join(OUT, name + '.edm'))
        print('CATCC route lines:', name, len(pts), 'points', res)
