# Builds the axle finder's marker (CATCC_AxleMarker_H15 ... _H40 .edm): a banded rod held across the jet at the
# height of its nose wheel axle. Made the way the chock and the route lines were (chock-model/build_chock.py,
# route-lines/build_route_lines.py): DCS made those as statics linked to the carrier; the markers written by
# our own .edm writer (towbar.py) it would not make ("unknown static", 2026-11-15).
#
# Headless, with Blender 4.5 LTS and Eagle Dynamics' Blender EDM Exporter:
#   set BLENDER_USER_SCRIPTS=C:\Users\ajmil\Tools\blender-user-scripts
#   blender.exe --background --factory-startup --python build_axle_marker.py -- <Shapes dir>
#
# A static linked to a ship stands on its flight deck: a script cannot give it a height. So there is one model
# for every centimetre of height from 0.15 to 0.40 m, and "up / down" in the finder picks the model.
#
# Axes: the exporter writes Blender (x, y, z) as DCS (x, z, -y): Blender X = the static's forward (the jet's
# nose), Blender Y = its left (the axle's line), Blender Z = up. Origin on the deck under the axle's middle.
#   the rod       0.9 m long, 12 mm square, in 5 cm bands magenta / cyan from the middle outwards (the axle's
#                 length can be read off them)
#   its ends      a yellow 16 mm cube each: seen from the side, the cube goes on the middle of the wheel hub
#   the disc      yellow, 16 cm across, at the rod's middle, facing sideways: the jet's centre line
#   the stem      white, from the deck up to the rod
import os
import sys
import bpy
import bmesh
import addon_utils

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0]
HEIGHTS = range(15, 41)          # centimetres
ROD_HALF, ROD_W, BAND = 0.45, 0.012, 0.05
CAP = 0.016
DISC_R, DISC_T = 0.08, 0.006
STEM_W = 0.006
PAINTS = [
    ('Magenta', (0.95, 0.05, 0.75, 1.0)),
    ('Cyan', (0.05, 0.85, 0.95, 1.0)),
    ('Yellow', (0.98, 0.80, 0.05, 1.0)),
    ('White', (0.95, 0.95, 0.95, 1.0)),
]
MAGENTA, CYAN, YELLOW, WHITE = 0, 1, 2, 3

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


def build(name, h):
    verts, faces, mat_idx = [], [], []

    def box(x0, x1, y0, y1, z0, z1, m):
        i = len(verts)
        verts.extend([(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)])
        for f in ((0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)):
            faces.append(tuple(i + k for k in f))
            mat_idx.append(m)

    w = ROD_W / 2
    n = int(round(ROD_HALF / BAND))
    for k in range(n):  # bands from the middle outwards, the same colours on both sides
        m = MAGENTA if k % 2 == 0 else CYAN
        box(-w, w, k * BAND, (k + 1) * BAND, h - w, h + w, m)
        box(-w, w, -(k + 1) * BAND, -k * BAND, h - w, h + w, m)
    c = CAP / 2
    box(-c, c, ROD_HALF, ROD_HALF + CAP, h - c, h + c, YELLOW)
    box(-c, c, -ROD_HALF - CAP, -ROD_HALF, h - c, h + c, YELLOW)
    # the disc: an octagon (its flats up, down, fore and aft), drawn as a box and four corner boxes would be
    # heavier than needed: three crossed plates do
    t = DISC_T / 2
    box(-DISC_R, DISC_R, -t, t, h - DISC_R * 0.414, h + DISC_R * 0.414, YELLOW)
    box(-DISC_R * 0.414, DISC_R * 0.414, -t, t, h - DISC_R, h + DISC_R, YELLOW)
    box(-DISC_R * 0.72, DISC_R * 0.72, -t * 0.98, t * 0.98, h - DISC_R * 0.72, h + DISC_R * 0.72, YELLOW)
    s = STEM_W / 2
    box(-s, s, -s, s, 0.0, h - DISC_R, WHITE)

    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.faces.ensure_lookup_table()
    for f in bm.faces:
        f.material_index = mat_idx[f.index]
    bm.to_mesh(me)
    bm.free()
    me.update()
    o = bpy.data.objects.new(name, me)
    for pname, rgba in PAINTS:
        o.data.materials.append(material(name + '_' + pname, rgba))
    return o


os.makedirs(OUT, exist_ok=True)
for cm in HEIGHTS:
    clear()
    col = bpy.data.collections.new('Visual')
    bpy.context.scene.collection.children.link(col)
    name = 'CATCC_AxleMarker_H%02d' % cm
    col.objects.link(build(name, cm / 100.0))
    res = bpy.ops.edm.export(filepath=os.path.join(OUT, name + '.edm'))
    print('CATCC axle marker:', name, res)
