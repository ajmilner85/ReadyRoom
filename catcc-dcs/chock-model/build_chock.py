# Builds the CATCC wheel chock model (CATCC_Chock.edm): a yellow block that is also its own collision shell.
#
# Headless, with Blender 4.5 LTS and Eagle Dynamics' official Blender EDM Exporter add-on (io_scene_edm):
#   set BLENDER_USER_SCRIPTS=C:\Users\ajmil\Tools\blender-user-scripts
#   blender.exe --background --factory-startup --python build_chock.py -- <out.edm> [L T H W]
#
# Shape: a trapezoid block, sloped on both faces, so it works ahead of or behind a tyre either way round.
# Blender axes as the exporter expects them (its demo vehicle: length on X, height on Z): X along the
# tyre's travel, Y across, Z up. Origin at the bottom centre, so the object sits on the deck.
#   L bottom length (along travel), T top length, H height, W width (across)
import sys
import bpy
import bmesh
import addon_utils

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else 'CATCC_Chock.edm'
L, T, H, W = (float(v) for v in argv[1:5]) if len(argv) >= 5 else (0.36, 0.10, 0.18, 0.30)
YELLOW = (0.95, 0.75, 0.05, 1.0)

addon_utils.enable('io_scene_edm', default_set=True, persistent=True)
from edm_materials import strap_shader_group                       # noqa: E402 (the add-on is on sys.path now)
from materials.materials import build_material_descriptions        # noqa: E402
from materials.material_default import DefaultMaterial             # noqa: E402

# empty scene
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
for c in list(bpy.data.collections):
    bpy.data.collections.remove(c)
scene = bpy.context.scene


def block(name):
    verts = [
        (-L / 2, -W / 2, 0), (L / 2, -W / 2, 0), (L / 2, W / 2, 0), (-L / 2, W / 2, 0),   # bottom
        (-T / 2, -W / 2, H), (T / 2, -W / 2, H), (T / 2, W / 2, H), (-T / 2, W / 2, H),   # top
    ]
    faces = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    me.update()
    return bpy.data.objects.new(name, me)


def collection(name):
    c = bpy.data.collections.new(name)
    scene.collection.children.link(c)
    return c


# the visible chock: ED's default material, plain yellow
vis = block('Chock')
collection('Visual').objects.link(vis)
mat = bpy.data.materials.new('CATCC_Chock_Yellow')
mat.use_nodes = True
nodes = mat.node_tree.nodes
for n in list(nodes):
    if n.type != 'OUTPUT_MATERIAL':
        nodes.remove(n)
out = next(n for n in nodes if n.type == 'OUTPUT_MATERIAL')
pbr = nodes.new(type=DefaultMaterial.node_group_name)
strap_shader_group(pbr, build_material_descriptions()[DefaultMaterial.name])
pbr.inputs['Base Color'].default_value = YELLOW
mat.node_tree.links.new(pbr.outputs[0], out.inputs['Surface'])
vis.data.materials.append(mat)

# the collision shell: the same block, no material (as in ED's learning demo)
shell = block('CHOCK')
collection('Collision').objects.link(shell)
shell.EDMProps.SPECIAL_TYPE = 'COLLISION_SHELL'

# collision lines: DCS tests one object's lines against the other's shell, and every stock object that
# stops a jet carries both (a shell alone was driven straight through). The jet's own lines don't run
# down at tyre-bottom height, so the chock's lines must reach into the tyre's shell (WHEEL_L / WHEEL_R):
# the block's edges, plus lines across the full width at several heights on both sloped faces (where
# the tyre presses), plus lines up each slope.
def lines(name):
    vs, es = [], []

    def seg(a, b):
        vs.append(a); vs.append(b)
        es.append((len(vs) - 2, len(vs) - 1))

    def slope_x(z, sign):  # the sloped face's x at height z (front: +, back: -)
        return sign * (L / 2 - (L / 2 - T / 2) * (z / H))

    # the block's 12 edges
    b = [(-L / 2, -W / 2, 0), (L / 2, -W / 2, 0), (L / 2, W / 2, 0), (-L / 2, W / 2, 0)]
    t = [(-T / 2, -W / 2, H), (T / 2, -W / 2, H), (T / 2, W / 2, H), (-T / 2, W / 2, H)]
    for i in range(4):
        seg(b[i], b[(i + 1) % 4]); seg(t[i], t[(i + 1) % 4]); seg(b[i], t[i])
    for sign in (1, -1):
        # across the width at several heights on the slope
        for k in range(1, 6):
            z = H * k / 6
            x = slope_x(z, sign)
            seg((x, -W / 2, z), (x, W / 2, z))
        # up the slope at several points across the width
        for k in range(1, 6):
            y = -W / 2 + W * k / 6
            seg((slope_x(0, sign), y, 0), (slope_x(H, sign), y, H))
    me = bpy.data.meshes.new(name)
    me.from_pydata(vs, es, [])
    me.update()
    return bpy.data.objects.new(name, me)


cl = lines('CHOCK_LINES')
collection('Collision').objects.link(cl)
cl.EDMProps.SPECIAL_TYPE = 'COLLISION_LINE'

print('CATCC chock: L=%.3f T=%.3f H=%.3f W=%.3f -> %s' % (L, T, H, W, OUT))
res = bpy.ops.edm.export(filepath=OUT)
print('CATCC chock export:', res)
