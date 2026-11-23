"""The tractor drivers' head: the clips and the blend space that turn it (DRIVER-HEAD.md, next to crew-test's install.ps1).

    python -I driver_head.py <out folder> [--dcs <DCS World folder>]     the files, into <out>/ (the mod's animations/typeV)
    python -I driver_head.py <out folder> --pose [--dcs ...]             the same, the driver's limbs keyed anew in each
                                                                         pose: hands on the steering wheel, feet at the
                                                                         pedals (driver_pose.py, DRIVER-POSE.md)
    python -I driver_head.py --report [--dcs <DCS World folder>]         what the source clip holds, and what is made of it
    python -I driver_head.py --dump <file.fbx>                           a clip's bones and what moves in it
    python -I driver_head.py --assimp <file.fbx> ...                     what DCS's own Assimp makes of a clip

WHAT IT STARTS FROM. The F/A-18C pilot figure has a clip of its own for looking round: F18_39_Look_LR.fbx (DCS's file,
CoreMods/aircraft/FA-18C/animations/animations/typeV, a binary FBX 7.4): 201 frames at 30 a second, the seated figure
turning from as far as it goes to one side (frame 0) evenly to as far as it goes to the other (frame 200), the middle
frame facing ahead. The whole upper body takes part: pelvis, the three spine bones, neck and head, and the arms follow
the shoulders. The deck crew is on the same skeleton (typeV) and can play the pilot figure's clips (the drivers sit in
its F18_0_Init), so a pose of that clip is a pose a driver can take.

WHAT IT MAKES (none of it kept in our repository: DCS's own animation data, re-timed; made on the user's PC from the
user's DCS by install.ps1 -DriverHead):
    catcc_drv_look_l100.fbx, _l050, _c000, _r050, _r100     five still poses (11 frames each, as F18_0_Init has): the
                                                           head 100 and 50 degrees to the left, ahead, 50 and 100 to
                                                           the right
    blend_space/catcc_bs_drv_look.lua                      a blend space over the five, on one axis: the parameter
                                                           "catcc_head_yaw", degrees, + to the driver's right
A pose is not one frame of the source clip: the torso (everything but neck and head) is taken from one frame and the
neck and head from another, so that at 100 degrees the torso is turned as far as the clip turns it and the neck does
the rest (the figures --report prints: about a fifth of the turn is the torso's, four fifths the neck's and head's).

THE BLEND SPACE FILE is what animator.dll's Animator::Animation::load reads (its code is not packed; read 2026-11-22):
the file RETURNS a table; `type` ("gesture" and "additive" are kinds of their own; anything else an ordinary one),
`x_axis` / `y_axis` = { name, default_value } (either may be left out), then the array part: { x, y, animation } each
(y 0 when left out; the axis bounds are the least and the most of the entries). The blend space is named after its
file. AnimationManager::_load_blend_spaces is given the files under <animations path>/<skeleton>/blend_space/.

No external libraries. The FBX reader and writer here keep everything they do not change byte for byte (--report says
whether the source clip written back unchanged is identical to the file read)."""
import math
import os
import struct
import sys
import zlib

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))   # (python -I leaves the script's own folder out: driver_pose.py is there)

DCS = r'C:\Program Files\Eagle Dynamics\DCS World'
SOURCE = r'CoreMods\aircraft\FA-18C\animations\animations\typeV\F18_39_Look_LR.fbx'
TICKS = 46186158000            # FBX time units in a second
FPS = 30
FRAME = TICKS // FPS
KEYS = 11                      # frames in a still pose (F18_0_Init.fbx has 11)
AXIS = 'catcc_head_yaw'
SPACE = 'catcc_bs_drv_look'
MOST = 100.0                   # degrees at the ends of the axis
POSES = [(-100.0, 'catcc_drv_look_l100'), (-50.0, 'catcc_drv_look_l050'), (0.0, 'catcc_drv_look_c000'),
         (50.0, 'catcc_drv_look_r050'), (100.0, 'catcc_drv_look_r100')]
NECK = ('typeV_Neck', 'typeV_Head', 'typeV_HeadNub')   # the neck's share; every other bone is the torso's


# ---------------------------------------------------------------- binary FBX (7.1 to 7.4: 32-bit offsets)
class Node:
    __slots__ = ('name', 'props', 'kids', 'nested')

    def __init__(self, name, props, kids, nested):
        self.name, self.props, self.kids, self.nested = name, props, kids, nested

    def kid(self, name):
        for k in self.kids:
            if k.name == name:
                return k
        return None


class Arr:
    """an array property: its values, and the bytes it was read from for as long as it is not changed"""
    __slots__ = ('kind', 'values', 'raw')

    def __init__(self, kind, values, raw):
        self.kind, self.values, self.raw = kind, values, raw

    def put(self, values):
        self.values, self.raw = list(values), None


SCALAR = {'Y': '<h', 'C': '<b', 'I': '<i', 'F': '<f', 'D': '<d', 'L': '<q'}
ARRAY = {'f': 'f', 'd': 'd', 'l': 'q', 'i': 'i', 'b': 'b'}


def read_fbx(path):
    d = open(path, 'rb').read()
    if d[:21] != b'Kaydara FBX Binary  \0':
        raise ValueError('%s: not a binary FBX file' % path)
    version = struct.unpack_from('<I', d, 23)[0]
    if version >= 7500:
        raise ValueError('%s: FBX version %d (64-bit offsets): not read here' % (path, version))

    def node(pos):
        end, nprops, _plen = struct.unpack_from('<III', d, pos)
        nl = d[pos + 12]
        if end == 0:
            return None, pos + 13
        name = d[pos + 13:pos + 13 + nl]
        p = pos + 13 + nl
        props = []
        for _ in range(nprops):
            t = chr(d[p])
            p += 1
            if t in SCALAR:
                props.append((t, struct.unpack_from(SCALAR[t], d, p)[0]))
                p += struct.calcsize(SCALAR[t])
            elif t in ARRAY:
                n, enc, clen = struct.unpack_from('<III', d, p)
                raw = d[p:p + 12 + clen]
                body = d[p + 12:p + 12 + clen]
                p += 12 + clen
                if enc:
                    body = zlib.decompress(body)
                props.append(Arr(t, list(struct.unpack('<%d%s' % (n, ARRAY[t]), body)), raw))
            elif t in 'SR':
                n = struct.unpack_from('<I', d, p)[0]
                props.append((t, d[p + 4:p + 4 + n]))
                p += 4 + n
            else:
                raise ValueError('%s: property type %r at %d' % (path, t, p - 1))
        kids, nested = [], p < end
        while p < end:
            k, p = node(p)
            if k is None:
                break
            kids.append(k)
        return Node(name, props, kids, nested), end

    nodes, pos = [], 27
    while True:
        n, pos = node(pos)
        if n is None:
            break
        nodes.append(n)
    return {'head': d[:27], 'version': version, 'nodes': nodes, 'tail': d[pos:]}


def write_fbx(doc):
    out = bytearray(doc['head'])

    def node(n):
        start = len(out)
        out.extend(b'\0' * 12)
        out.append(len(n.name))
        out.extend(n.name)
        p0 = len(out)
        for p in n.props:
            if isinstance(p, Arr):
                out.extend(p.kind.encode())
                if p.raw is not None:
                    out.extend(p.raw)
                else:
                    body = struct.pack('<%d%s' % (len(p.values), ARRAY[p.kind]), *p.values)
                    out.extend(struct.pack('<III', len(p.values), 0, len(body)))
                    out.extend(body)
            else:
                t, v = p
                out.extend(t.encode())
                if t in SCALAR:
                    out.extend(struct.pack(SCALAR[t], v))
                else:
                    out.extend(struct.pack('<I', len(v)))
                    out.extend(v)
        plen = len(out) - p0
        for k in n.kids:
            node(k)
        if n.nested:
            out.extend(b'\0' * 13)
        struct.pack_into('<III', out, start, len(out), len(n.props), plen)

    for n in doc['nodes']:
        node(n)
    out.extend(b'\0' * 13)
    # the footer: 16 bytes, zeros up to a multiple of 16 (16 of them when it is one already), 4 zeros, the version,
    # 120 zeros, 16 bytes. (Assimp, which DCS reads clips with, stops at the empty record above.)
    tail = doc['tail']
    if len(tail) >= 16 + 4 + 4 + 120 + 16:
        out.extend(tail[:16])
        pad = ((len(out) + 15) & ~15) - len(out)
        out.extend(b'\0' * (pad or 16))
        out.extend(b'\0' * 4)
        out.extend(struct.pack('<I', doc['version']))
        out.extend(b'\0' * 120)
        out.extend(tail[-16:])
    else:
        out.extend(tail)
    return bytes(out)


# ---------------------------------------------------------------- a clip: bones and their curves
class Clip:
    def __init__(self, path):
        self.path = path
        self.doc = read_fbx(path)
        top = {n.name: n for n in self.doc['nodes']}
        self.top = top
        self.obj = {}                      # id -> (kind, name, node)
        for o in top[b'Objects'].kids:
            self.obj[o.props[0][1]] = (o.name.decode(), o.props[1][1].split(b'\0')[0].decode('latin1'), o)
        self.parent, self.curve_node, self.curve = {}, {}, {}
        for c in top[b'Connections'].kids:
            v = [p[1] for p in c.props]
            kind, child, par = v[0], v[1], v[2]
            ck, pk = self.obj.get(child, ('?',))[0], self.obj.get(par, ('?',))[0]
            if kind == b'OO' and ck == 'Model' and pk == 'Model':
                self.parent[child] = par
            elif kind == b'OP' and ck == 'AnimationCurveNode' and pk == 'Model':
                self.curve_node[child] = (par, v[3].decode())
            elif kind == b'OP' and ck == 'AnimationCurve' and pk == 'AnimationCurveNode':
                self.curve[child] = (par, v[3].decode())
        self.bones = {name: i for i, (kind, name, _o) in self.obj.items() if kind == 'Model'}
        # (bone id, 'Lcl Rotation', 'd|X') -> the curve's node
        self.channel = {}
        for cu, (cn, axis) in self.curve.items():
            if cn in self.curve_node:
                bone, what = self.curve_node[cn]
                self.channel[(bone, what, axis)] = self.obj[cu][2]
        self.frames = max(len(n.kid(b'KeyValueFloat').props[0].values) for n in self.channel.values())

    def bone_of(self, curve_id):
        cn = self.curve.get(curve_id, (None,))[0]
        return self.curve_node.get(cn, (None,))[0]

    def prop70(self, node, name):
        p70 = node.kid(b'Properties70')
        for p in (p70.kids if p70 else []):
            if p.props[0][1] == name:
                return p
        return None

    @staticmethod
    def at(node, frame):
        """a curve's value at a frame (between two frames: in proportion)"""
        v = node.kid(b'KeyValueFloat').props[0].values
        if len(v) == 1:
            return v[0]
        f = min(max(frame, 0.0), len(v) - 1.0)
        i = min(int(f), len(v) - 2)
        return v[i] + (v[i + 1] - v[i]) * (f - i)

    def local(self, bone, what, frame):
        """a bone's Lcl Translation / Lcl Rotation at a frame: its curves, or where it has none what the model says"""
        p = self.prop70(self.obj[bone][2], what.encode())
        base = [p.props[4][1], p.props[5][1], p.props[6][1]] if p else [0.0, 0.0, 0.0]
        for i, axis in enumerate(('d|X', 'd|Y', 'd|Z')):
            c = self.channel.get((bone, what, axis))
            if c is not None:
                base[i] = self.at(c, frame(bone) if callable(frame) else frame)
        return base

    def world(self, bone, frame):
        """the bone's 3 x 3 turn and its place in the file's own axes (FBX: turned about X first, then Y, then Z)"""
        chain = []
        b = bone
        while b is not None:
            chain.append(b)
            b = self.parent.get(b)
        m, t = IDENT, (0.0, 0.0, 0.0)
        for b in reversed(chain):
            lt = self.local(b, 'Lcl Translation', frame)
            lr = self.local(b, 'Lcl Rotation', frame)
            t = add(t, mulv(m, lt))
            m = mul(m, euler(lr))
        return m, t


IDENT = ((1.0, 0.0, 0.0), (0.0, 1.0, 0.0), (0.0, 0.0, 1.0))


def mul(a, b):
    return tuple(tuple(sum(a[i][k] * b[k][j] for k in range(3)) for j in range(3)) for i in range(3))


def mulv(a, v):
    return tuple(sum(a[i][k] * v[k] for k in range(3)) for i in range(3))


def add(a, b):
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


def sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def unit(a):
    m = math.sqrt(dot(a, a))
    return (a[0] / m, a[1] / m, a[2] / m)


def transpose(a):
    return tuple(tuple(a[j][i] for j in range(3)) for i in range(3))


def euler(deg):
    x, y, z = (math.radians(v) for v in deg)
    cx, sx, cy, sy, cz, sz = math.cos(x), math.sin(x), math.cos(y), math.sin(y), math.cos(z), math.sin(z)
    rx = ((1, 0, 0), (0, cx, -sx), (0, sx, cx))
    ry = ((cy, 0, sy), (0, 1, 0), (-sy, 0, cy))
    rz = ((cz, -sz, 0), (sz, cz, 0), (0, 0, 1))
    return mul(rz, mul(ry, rx))


class Figure:
    """which way the seated figure faces in the clip's axes, and how far a bone is turned from the middle frame"""

    def __init__(self, clip):
        self.clip = clip
        self.mid = (clip.frames - 1) / 2.0
        up = [0.0, 0.0, 0.0]
        up[self.up_axis()] = 1.0
        self.up = tuple(up)
        b = clip.bones
        rt, lt = clip.world(b['typeV_R_Thigh'], self.mid)[1], clip.world(b['typeV_L_Thigh'], self.mid)[1]
        right = sub(rt, lt)
        right = unit(sub(right, tuple(self.up[i] * dot(right, self.up) for i in range(3))))
        # a right-handed file: up x right = the way the figure faces; held against the toes, which are ahead of the pelvis
        fwd = cross(self.up, right)
        toes = sub(clip.world(b['typeV_R_Toe0'], self.mid)[1], clip.world(b['typeV_Pelvis'], self.mid)[1])
        if dot(fwd, toes) < 0:
            raise ValueError('the figure does not face the way its toes point: the axes are not as expected')
        self.right, self.fwd = right, fwd

    def up_axis(self):
        gs = self.clip.top[b'GlobalSettings']
        p = self.clip.prop70(gs, b'UpAxis')
        return p.props[4][1] if p else 1

    def yaw(self, bone, frame):
        """degrees the bone is turned about the vertical from where it is in the middle frame, + to the figure's right"""
        m = self.clip.world(self.clip.bones[bone], frame)[0]
        m0 = self.clip.world(self.clip.bones[bone], self.mid)[0]
        d = mulv(mul(m, transpose(m0)), self.fwd)
        return math.degrees(math.atan2(dot(d, self.right), dot(d, self.fwd)))


def plan(clip):
    """The frames the poses are taken from. Returns (fig, right_end, k, frame_for): right_end the frame of the full turn
    to the right; k how far towards that frame the neck goes when the axis is at its end (the torso goes all the way);
    frame_for(x) -> a function bone id -> frame, for the axis value x."""
    fig = Figure(clip)
    last = clip.frames - 1
    right_end = last if fig.yaw('typeV_Head', last) > 0 else 0
    left_end = last - right_end
    neck = set(clip.bones[n] for n in NECK if n in clip.bones)

    def frame_for(x, k, ft=1.0):
        end = right_end if x >= 0 else left_end

        def f(bone):
            share = ft * (k if bone in neck else 1.0)
            return fig.mid + (end - fig.mid) * share
        return f

    # the neck's share: the head 100 degrees round at the end of the axis (halved until it is)
    lo, hi = 0.0, 1.0
    if fig.yaw('typeV_Head', frame_for(MOST, 1.0)) < MOST:
        raise ValueError('the source clip turns the head less than %d degrees' % MOST)
    for _ in range(40):
        k = (lo + hi) / 2
        if fig.yaw('typeV_Head', frame_for(MOST, k)) < MOST:
            lo = k
        else:
            hi = k
    k = (lo + hi) / 2

    def pose(x):
        # how far along the clip both go (the neck k of it) for the head to be x degrees round: the clip does not turn
        # evenly (the torso comes late), and its two halves are not quite alike
        lo, hi = 0.0, 1.0
        for _ in range(40):
            ft = (lo + hi) / 2
            if abs(fig.yaw('typeV_Head', frame_for(x, k, ft))) < abs(x):
                lo = ft
            else:
                hi = ft
        return frame_for(x, k, (lo + hi) / 2)
    return fig, right_end, k, pose


def still(clip, frame_of, over=None):
    """the clip made a still pose of KEYS frames: every curve holds the value it has at its bone's frame; over
    (driver_pose.py): {bone id: (x, y, z)}: the Lcl Rotation these bones are given instead"""
    for cu, (kind, _name, node) in clip.obj.items():
        if kind != 'AnimationCurve':
            continue
        bone = clip.bone_of(cu)
        value = clip.at(node, frame_of(bone))
        if over and bone in over:
            cn, axis = clip.curve[cu]
            if clip.curve_node[cn][1] == 'Lcl Rotation':
                value = over[bone]['XYZ'.index(axis[-1])]
        node.kid(b'KeyTime').props[0].put([i * FRAME for i in range(KEYS)])
        node.kid(b'KeyValueFloat').props[0].put([value] * KEYS)
        ref = node.kid(b'KeyAttrRefCount')
        if ref is not None:
            flags = node.kid(b'KeyAttrFlags').props[0].values
            if len(flags) != 1:
                raise ValueError('a curve with %d kinds of key: not written here' % len(flags))
            ref.props[0].put([KEYS])
        d = node.kid(b'Default')
        if d is not None:
            d.props[0] = (d.props[0][0], value)
    stop = (KEYS - 1) * FRAME
    p = clip.prop70(clip.top[b'GlobalSettings'], b'TimeSpanStop')
    if p:
        p.props[4] = (p.props[4][0], stop)
    for kind, _name, node in clip.obj.values():
        if kind == 'AnimationStack':
            for name in (b'LocalStop', b'ReferenceStop'):
                p = clip.prop70(node, name)
                if p:
                    p.props[4] = (p.props[4][0], stop)
    takes = clip.top.get(b'Takes')
    for take in (takes.kids if takes else []):
        for name in (b'LocalTime', b'ReferenceTime'):
            k = take.kid(name)
            if k is not None:
                k.props[1] = (k.props[1][0], stop)
    return write_fbx(clip.doc)


def space_lua():
    lines = ['-- CATCC: the tractor drivers\' head (made by catcc-dcs/deck-test/crew-test/model/driver_head.py; DRIVER-HEAD.md).',
             '-- A blend space as animator.dll reads one: named after this file, one axis, a still pose at each value.',
             '-- The parameter "%s": degrees, + to the driver\'s right.' % AXIS,
             'return {',
             "\ttype = '1D',",
             "\tx_axis = { name = '%s', default_value = 0 }," % AXIS]
    for x, name in POSES:
        lines.append("\t{ x = %d, animation = '%s' }," % (x, name))
    lines.append('}')
    return '\n'.join(lines) + '\n'


def report(src):
    clip = Clip(src)
    same = write_fbx(clip.doc) == open(src, 'rb').read()
    fig, right_end, k, frame_of = plan(clip)
    last = clip.frames - 1
    out = ['source: %d bones, %d curves, %d frames (%.2f s); written back unchanged: %s' % (
        len(clip.bones), sum(1 for v in clip.obj.values() if v[0] == 'AnimationCurve'), clip.frames, last / FPS,
        'IDENTICAL' if same else 'DIFFERENT'),
        'source: frame %d is the full turn to the RIGHT: head %.1f degrees (of that the torso, at the top spine bone, %.1f); frame %d to the left: head %.1f (torso %.1f)' % (
            right_end, fig.yaw('typeV_Head', right_end), fig.yaw('typeV_Spine2', right_end),
            last - right_end, fig.yaw('typeV_Head', last - right_end), fig.yaw('typeV_Spine2', last - right_end))]
    for x, name in POSES:
        f = frame_of(x)
        head, torso = fig.yaw('typeV_Head', f), fig.yaw('typeV_Spine2', f)
        out.append('pose %s: axis %+d: head %+.1f degrees = torso %+.1f + neck and head %+.1f (torso from frame %.1f, neck from frame %.1f)' % (
            name, x, head, torso, head - torso, f(clip.bones['typeV_Spine2']), f(clip.bones['typeV_Head'])))
    out.append('the neck goes %.3f of the way the torso goes' % k)
    return '\n'.join(out)


def make(src, out_dir, pose=False):
    os.makedirs(os.path.join(out_dir, 'blend_space'), exist_ok=True)
    made = []
    for x, name in POSES:
        clip = Clip(src)
        _fig, _right_end, _k, frame_of = plan(clip)
        over = None
        if pose:
            # (the limbs are solved for each pose: the shoulders move with the torso, the hands stay on the wheel)
            import driver_pose
            over = driver_pose.solve(clip, frame_of(x))[0]
        data = still(clip, frame_of(x), over)
        path = os.path.join(out_dir, name + '.fbx')
        with open(path, 'wb') as f:
            f.write(data)
        # read back: a still pose of KEYS frames, the head where it was asked to be
        back = Clip(path)
        if back.frames != KEYS:
            raise ValueError('%s: read back with %d frames' % (path, back.frames))
        made.append('%s.fbx (%d bytes)' % (name, len(data)))
    with open(os.path.join(out_dir, 'blend_space', SPACE + '.lua'), 'w', encoding='utf-8', newline='\n') as f:
        f.write(space_lua())
    made.append('blend_space/%s.lua' % SPACE)
    return made


def dump(path):
    clip = Clip(path)
    order = sorted(clip.bones.items(), key=lambda kv: kv[1])
    out = ['%s: FBX %d, %d bones, %d frames' % (os.path.basename(path), clip.doc['version'], len(clip.bones), clip.frames)]
    for name, b in order:
        moving = []
        for (bone, what, axis), node in sorted(clip.channel.items(), key=lambda kv: (kv[0][1], kv[0][2])):
            if bone == b:
                v = node.kid(b'KeyValueFloat').props[0].values
                if max(v) - min(v) > 0.5:
                    moving.append('%s %s %.1f..%.1f (first %.1f, last %.1f)' % (what, axis[-1], min(v), max(v), v[0], v[-1]))
        if moving:
            par = clip.obj.get(clip.parent.get(b), (0, '-'))[1]
            out.append('  %s (on %s): %s' % (name, par, '; '.join(moving)))
    return '\n'.join(out)


def assimp(path, dcs, every=False):
    """What DCS's own Assimp (bin/assimp-vc140-mt.dll 4.1, which animator.dll reads clips with) makes of a clip: one line.
    Only read with: nothing of DCS's is changed. every: instead {bone: (its place, its turn w x y z)} of the first key."""
    import ctypes
    bin_dir = os.path.join(dcs, 'bin')
    os.add_dll_directory(bin_dir)
    lib = ctypes.CDLL(os.path.join(bin_dir, 'assimp-vc140-mt.dll'))
    lib.aiImportFile.restype = ctypes.c_void_p
    lib.aiImportFile.argtypes = [ctypes.c_char_p, ctypes.c_uint]
    lib.aiGetErrorString.restype = ctypes.c_char_p

    class Str(ctypes.Structure):
        _fields_ = [('length', ctypes.c_size_t), ('data', ctypes.c_char * 1024)]

    class Scene(ctypes.Structure):
        _fields_ = [('flags', ctypes.c_uint), ('root', ctypes.c_void_p), ('nmesh', ctypes.c_uint), ('mesh', ctypes.c_void_p),
                    ('nmat', ctypes.c_uint), ('mat', ctypes.c_void_p), ('nanim', ctypes.c_uint), ('anim', ctypes.POINTER(ctypes.c_void_p))]

    class Chan(ctypes.Structure):
        _fields_ = [('name', Str), ('npos', ctypes.c_uint), ('pos', ctypes.c_void_p), ('nrot', ctypes.c_uint), ('rot', ctypes.c_void_p),
                    ('nscl', ctypes.c_uint), ('scl', ctypes.c_void_p)]

    class Anim(ctypes.Structure):
        _fields_ = [('name', Str), ('duration', ctypes.c_double), ('ticks', ctypes.c_double), ('nchan', ctypes.c_uint),
                    ('chan', ctypes.POINTER(ctypes.POINTER(Chan)))]

    class QuatKey(ctypes.Structure):
        _fields_ = [('t', ctypes.c_double), ('w', ctypes.c_float), ('x', ctypes.c_float), ('y', ctypes.c_float), ('z', ctypes.c_float)]

    s = lib.aiImportFile(path.encode('mbcs'), 0)
    if not s:
        return '%s: Assimp: NOT READ: %s' % (os.path.basename(path), (lib.aiGetErrorString() or b'').decode('latin1'))
    scene = Scene.from_address(s)
    if scene.nanim != 1:
        return '%s: Assimp: %d animations' % (os.path.basename(path), scene.nanim)
    an = Anim.from_address(scene.anim[0])
    class VecKey(ctypes.Structure):
        _fields_ = [('t', ctypes.c_double), ('x', ctypes.c_float), ('y', ctypes.c_float), ('z', ctypes.c_float)]

    keys, still_pose, head, all_bones = set(), True, None, {}
    for j in range(an.nchan):
        ch = an.chan[j].contents
        keys.add((ch.npos, ch.nrot, ch.nscl))
        q = (QuatKey * ch.nrot).from_address(ch.rot)
        a, b = q[0], q[ch.nrot - 1]
        if every:
            v = (VecKey * ch.npos).from_address(ch.pos)[0]
            all_bones[ch.name.data[:ch.name.length].decode('latin1')] = ((v.x, v.y, v.z), (a.w, a.x, a.y, a.z))
        if max(abs(a.w - b.w), abs(a.x - b.x), abs(a.y - b.y), abs(a.z - b.z)) > 1e-5:
            still_pose = False
        if ch.name.data[:ch.name.length] == b'typeV_Head':
            head = (a.w, a.x, a.y, a.z)
    if every:
        return all_bones
    return '%s: Assimp: 1 animation, %g frames at %g a second, %d bones, keys %s, %s; the head bone %s' % (
        os.path.basename(path), an.duration, an.ticks, an.nchan, sorted(keys), 'a still pose' if still_pose else 'moving',
        '%.4f %.4f %.4f %.4f' % head if head else 'MISSING')


def main(argv):
    dcs = DCS
    if '--dcs' in argv:
        i = argv.index('--dcs')
        dcs = argv[i + 1]
        del argv[i:i + 2]
    pose = '--pose' in argv
    if pose:
        argv.remove('--pose')
    src = os.path.join(dcs, SOURCE)
    if argv and argv[0] == '--dump':
        print(dump(argv[1]))
        return 0
    if argv and argv[0] == '--assimp':
        for p in argv[1:]:
            print(assimp(p, dcs))
        return 0
    if not os.path.isfile(src):
        print('driver head: not made: the source clip is not there: %s' % src)
        return 2
    if argv and argv[0] == '--report':
        print(report(src))
        return 0
    if not argv:
        print(__doc__)
        return 1
    made = make(src, argv[0], pose)
    print('driver head: made %s%s' % (', '.join(made), ' (the limbs at the wheel and the pedals)' if pose else ''))
    print(report(src))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
