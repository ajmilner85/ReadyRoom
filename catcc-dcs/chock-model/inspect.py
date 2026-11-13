# Headless: list a .blend's objects (EDM object type, materials) and the EDM material nodes' inputs.
import bpy, addon_utils
addon_utils.enable('io_scene_edm', default_set=True, persistent=True)
for o in bpy.data.objects:
    p = getattr(o, 'EDMProps', None)
    st = p.SPECIAL_TYPE if p else 'no EDMProps'
    mats = [m.name for m in o.data.materials] if o.type == 'MESH' else []
    print('OBJ %-22s %-6s special=%-16s coll=%-18s mats=%s' % (o.name, o.type, st, [c.name for c in o.users_collection], mats))
for m in bpy.data.materials:
    if not m.node_tree: continue
    for n in m.node_tree.nodes:
        if n.type == 'CUSTOM' or n.type == 'GROUP':
            ins = []
            for i in n.inputs:
                v = getattr(i, 'default_value', None)
                try: v = tuple(round(x, 3) for x in v)
                except TypeError: pass
                ins.append('%s=%s%s' % (i.name, v, '(linked)' if i.is_linked else ''))
            print('MAT %-12s node %s (%s) tree=%s' % (m.name, n.name, n.bl_idname, n.node_tree.name if getattr(n, 'node_tree', None) else '-'))
            print('     inputs:', '; '.join(ins))
