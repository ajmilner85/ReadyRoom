"""DCS .edm model files (version 10): read, and write back.

    python -I edm.py <file.edm> [...]        dump the structure of each file, and check that writing what was
                                             read gives the same bytes back (the round trip)

The format as the community has documented it (Blender_ioEDM's docs/EDM_Specification.rst, N. Devenish; the
layout of version 10 files checked here against DCS's own models): everything is length-prefixed and read in
order. Version 10 keeps most strings in a table at the start (a string is then an index into it); node base
names stay inline (uint length + bytes). The two type-count indexes of version 8 are written empty by DCS's
own version 10 files.

The reader turns a file into plain Python values (dicts and lists, the vertex and index data as bytes), the
writer turns them back into bytes. Nothing here runs any of DCS's code; tow-bar building is in towbar.py.
"""
import struct
import sys

# ---------------------------------------------------------------- reading


class R:
    def __init__(self, data):
        self.d, self.o, self.strings = data, 0, None

    def take(self, n):
        b = self.d[self.o:self.o + n]
        if len(b) != n:
            raise EOFError('read past the end at %d' % self.o)
        self.o += n
        return b

    def u8(self): return self.take(1)[0]
    def u32(self): return struct.unpack('<I', self.take(4))[0]
    def i32(self): return struct.unpack('<i', self.take(4))[0]
    def f32(self, n=1): return list(struct.unpack('<%df' % n, self.take(4 * n)))
    def f64(self, n=1): return list(struct.unpack('<%dd' % n, self.take(8 * n)))
    def raw_str(self): return self.take(self.u32()).decode('cp1251')

    def s(self):
        i = self.u32()
        return self.strings[i]


def _props(r):
    out = []
    for _ in range(r.u32()):
        t = r.s()
        if t.startswith('model::Property<'):
            inner = t[len('model::Property<'):-1]
            name = r.s()
            out.append({'type': t, 'name': name, 'value': _value(r, inner)})
        elif t.startswith('model::AnimatedProperty<'):
            inner = t[len('model::AnimatedProperty<'):-1]
            name, arg, n = r.s(), r.u32(), r.u32()
            keys = [(r.f64()[0], _value(r, inner)) for _ in range(n)]
            out.append({'type': t, 'name': name, 'arg': arg, 'keys': keys})
        elif t == 'model::ArgumentProperty':
            out.append({'type': t, 'name': r.s(), 'arg': r.u32()})
        else:
            raise ValueError('unknown property type %s at %d' % (t, r.o))
    return out


def _value(r, t):
    if t == 'unsigned int': return r.u32()
    if t == 'float': return r.f32()[0]
    if t == 'osg::Vec2f': return r.f32(2)
    if t == 'osg::Vec3f': return r.f32(3)
    if t == 'osg::Vec3d': return r.f64(3)
    if t == 'osg::Matrixf': return r.f32(16)
    if t == 'osg::Matrixd': return r.f64(16)
    if t == 'const char*': return r.s()
    raise ValueError('unknown value type %s at %d' % (t, r.o))


def _base(r):
    return {'name': r.raw_str(), 'version': r.u32(), 'props': _props(r)}


def _material(r):
    m = []
    for _ in range(r.u32()):
        k = r.s()
        # (DECAL: one byte, seen 1 and 2: the Supercarrier's Nimitz_Hangar.EDM, read whole with it so, 2026-11-17)
        if k in ('BLENDING', 'CULLING', 'SHADOWS', 'DECAL'): v = r.u8()
        elif k == 'DEPTH_BIAS': v = r.u32()
        elif k in ('MATERIAL_NAME', 'NAME'): v = r.s()
        elif k == 'VERTEX_FORMAT': v = list(r.take(r.u32()))
        elif k == 'TEXTURE_COORDINATES_CHANNELS': v = [r.i32() for _ in range(r.u32())]
        elif k in ('UNIFORMS', 'ANIMATED_UNIFORMS'): v = _props(r)
        elif k == 'TEXTURES':
            v = []
            for _ in range(r.u32()):
                v.append({'index': r.i32(), 'unk': r.i32(), 'name': r.s(), 'unk2': [r.u32() for _ in range(4)], 'matrix': r.f32(16)})
        else:
            raise ValueError('unknown material key %s at %d' % (k, r.o))
        m.append((k, v))
    return m


def _anim(r, n):
    n['base'] = {'matrix': r.f64(16), 'position': r.f64(3), 'quat1': r.f64(4), 'quat2': r.f64(4), 'scale': r.f64(3)}
    n['pos'] = [(r.u32(), [r.f64(4) for _ in range(r.u32())]) for _ in range(r.u32())]
    n['rot'] = [(r.u32(), [r.f64(5) for _ in range(r.u32())]) for _ in range(r.u32())]
    sc = []
    for _ in range(r.u32()):
        arg = r.u32()
        a = [r.f64(5) for _ in range(r.u32())]
        b = [r.f64(4) for _ in range(r.u32())]
        sc.append((arg, a, b))
    n['scale'] = sc


def _vtx(r):
    count, stride = r.u32(), r.u32()
    return {'count': count, 'stride': stride, 'data': r.take(4 * count * stride)}


def _idx(r):
    t, n, unk = r.u8(), r.u32(), r.u32()
    return {'type': t, 'count': n, 'unk': unk, 'data': r.take(n * (1, 2, 4)[t])}


def _parents(r):
    n = r.u32()
    if n == 1:
        return [(r.u32(), r.i32())]
    return [(r.u32(), r.i32(), r.i32()) for _ in range(n)]


def _node(r, t):
    n = {'type': t}
    n.update(_base(r))
    if t == 'model::RootNode':
        # (version 8 files have one unknown byte here; DCS's version 10 files, root __VERSION__ 3, have none)
        n['bbox'] = r.f64(6)
        n['unkB'] = r.f64(12)
        n['materials'] = [_material(r) for _ in range(r.u32())]
        n['unkC'] = [r.u32(), r.u32()]
    elif t == 'model::Node':
        pass
    elif t == 'model::TransformNode':
        n['matrix'] = r.f64(16)
    elif t == 'model::Bone':
        n['m1'], n['m2'] = r.f64(16), r.f64(16)
    elif t == 'model::LodNode':
        n['levels'] = [r.f64(2) for _ in range(r.u32())]
    elif t in ('model::ArgAnimationNode', 'model::ArgRotationNode', 'model::ArgPositionNode', 'model::ArgScaleNode'):
        _anim(r, n)
    elif t == 'model::ArgAnimatedBone':
        _anim(r, n)
        n['bone'] = r.f64(16)
    elif t == 'model::ArgVisibilityNode':
        n['vis'] = [(r.u32(), [r.f64(2) for _ in range(r.u32())]) for _ in range(r.u32())]
    elif t == 'model::Connector':
        n['parent'], n['unk'] = r.u32(), r.u32()
    elif t == 'model::RenderNode':
        n['unk'], n['material'] = r.u32(), r.u32()
        n['parents'] = _parents(r)
        n['vtx'], n['idx'] = _vtx(r), _idx(r)
    elif t == 'model::SkinNode':
        n['unk'], n['material'] = r.u32(), r.u32()
        n['bones'] = [r.u32() for _ in range(r.u32())]
        n['post'] = r.u32()
        n['vtx'], n['idx'] = _vtx(r), _idx(r)
    elif t == 'model::ShellNode':
        n['parent'] = r.u32()
        n['format'] = list(r.take(r.u32()))
        n['vtx'], n['idx'] = _vtx(r), _idx(r)
    elif t == 'model::LightNode':
        # (the node it hangs on, a byte, the light's own properties, a byte: Nimitz_Hangar.EDM's 102 lights read so)
        n['parent'], n['unk'] = r.u32(), r.u8()
        n['light'] = _props(r)
        n['unk2'] = r.u8()
    else:
        raise ValueError('unknown node type %s at %d' % (t, r.o))
    return n


def read(data):
    r = R(data)
    if r.take(3) != b'EDM':
        raise ValueError('not an EDM file')
    ver = struct.unpack('<H', r.take(2))[0]
    if ver != 10:
        raise ValueError('only version 10 files are read here (this is %d)' % ver)
    table = r.take(r.u32())
    r.strings = [x.decode('cp1251') for x in table.split(b'\0')]
    f = {'version': ver, 'strings': list(r.strings)}
    f['indexA'] = [(r.s(), r.u32()) for _ in range(r.u32())]
    f['indexB'] = [(r.s(), r.u32()) for _ in range(r.u32())]
    f['root'] = _node(r, r.s())
    f['nodes'] = [_node(r, r.s()) for _ in range(r.u32())]
    f['parents'] = [r.i32() for _ in range(len(f['nodes']))]
    items = []
    for _ in range(r.u32()):
        k = r.s()
        items.append((k, [_node(r, r.s()) for _ in range(r.u32())]))
    f['items'] = items
    f['rest'] = r.d[r.o:]
    return f

# ---------------------------------------------------------------- writing


class W:
    def __init__(self, strings=None):
        self.b = bytearray()
        # the string table: the one a file was read with (a round trip keeps its order), or built as strings are first used
        self.table = list(strings) if strings else []
        self.fixed = strings is not None
        self.at = {s: i for i, s in reversed(list(enumerate(self.table)))}

    def put(self, fmt, *v): self.b += struct.pack('<' + fmt, *v)
    def u8(self, v): self.put('B', v)
    def u32(self, v): self.put('I', v)
    def i32(self, v): self.put('i', v)
    def f32(self, vs): self.put('%df' % len(vs), *vs)
    def f64(self, vs): self.put('%dd' % len(vs), *vs)

    def raw_str(self, s):
        e = s.encode('cp1251')
        self.u32(len(e))
        self.b += e

    def s(self, s):
        if s not in self.at:
            if self.fixed:
                raise ValueError('string %r is not in the table' % s)
            self.at[s] = len(self.table)
            self.table.append(s)
        self.u32(self.at[s])


def _wvalue(w, t, v):
    if t == 'unsigned int': w.u32(v)
    elif t == 'float': w.f32([v])
    elif t in ('osg::Vec2f', 'osg::Vec3f', 'osg::Matrixf'): w.f32(v)
    elif t in ('osg::Vec3d', 'osg::Matrixd'): w.f64(v)
    elif t == 'const char*': w.s(v)
    else: raise ValueError(t)


def _wprops(w, props):
    w.u32(len(props))
    for p in props:
        t = p['type']
        w.s(t)
        if t.startswith('model::Property<'):
            w.s(p['name'])
            _wvalue(w, t[len('model::Property<'):-1], p['value'])
        elif t.startswith('model::AnimatedProperty<'):
            w.s(p['name'])
            w.u32(p['arg'])
            w.u32(len(p['keys']))
            for fr, v in p['keys']:
                w.f64([fr])
                _wvalue(w, t[len('model::AnimatedProperty<'):-1], v)
        else:
            w.s(p['name'])
            w.u32(p['arg'])


def _wmaterial(w, m):
    w.u32(len(m))
    for k, v in m:
        w.s(k)
        if k in ('BLENDING', 'CULLING', 'SHADOWS', 'DECAL'): w.u8(v)
        elif k == 'DEPTH_BIAS': w.u32(v)
        elif k in ('MATERIAL_NAME', 'NAME'): w.s(v)
        elif k == 'VERTEX_FORMAT':
            w.u32(len(v))
            w.b += bytes(v)
        elif k == 'TEXTURE_COORDINATES_CHANNELS':
            w.u32(len(v))
            for c in v: w.i32(c)
        elif k in ('UNIFORMS', 'ANIMATED_UNIFORMS'): _wprops(w, v)
        elif k == 'TEXTURES':
            w.u32(len(v))
            for t in v:
                w.i32(t['index'])
                w.i32(t['unk'])
                w.s(t['name'])
                for x in t['unk2']: w.u32(x)
                w.f32(t['matrix'])
        else: raise ValueError(k)


def _wvtx(w, v):
    w.u32(v['count'])
    w.u32(v['stride'])
    w.b += v['data']


def _widx(w, i):
    w.u8(i['type'])
    w.u32(i['count'])
    w.u32(i['unk'])
    w.b += i['data']


def _wanim(w, n):
    b = n['base']
    w.f64(b['matrix']); w.f64(b['position']); w.f64(b['quat1']); w.f64(b['quat2']); w.f64(b['scale'])
    for key, size in (('pos', 4), ('rot', 5)):
        w.u32(len(n[key]))
        for arg, keys in n[key]:
            w.u32(arg)
            w.u32(len(keys))
            for k in keys: w.f64(k)
    w.u32(len(n['scale']))
    for arg, a, b2 in n['scale']:
        w.u32(arg)
        w.u32(len(a))
        for k in a: w.f64(k)
        w.u32(len(b2))
        for k in b2: w.f64(k)


def _wnode(w, n):
    t = n['type']
    w.s(t)
    w.raw_str(n['name'])
    w.u32(n['version'])
    _wprops(w, n['props'])
    if t == 'model::RootNode':
        w.f64(n['bbox']); w.f64(n['unkB'])
        w.u32(len(n['materials']))
        for m in n['materials']: _wmaterial(w, m)
        w.u32(n['unkC'][0]); w.u32(n['unkC'][1])
    elif t == 'model::Node': pass
    elif t == 'model::TransformNode': w.f64(n['matrix'])
    elif t == 'model::Bone': w.f64(n['m1']); w.f64(n['m2'])
    elif t == 'model::LodNode':
        w.u32(len(n['levels']))
        for l in n['levels']: w.f64(l)
    elif t in ('model::ArgAnimationNode', 'model::ArgRotationNode', 'model::ArgPositionNode', 'model::ArgScaleNode'): _wanim(w, n)
    elif t == 'model::ArgAnimatedBone': _wanim(w, n); w.f64(n['bone'])
    elif t == 'model::ArgVisibilityNode':
        w.u32(len(n['vis']))
        for arg, ranges in n['vis']:
            w.u32(arg); w.u32(len(ranges))
            for rg in ranges: w.f64(rg)
    elif t == 'model::Connector': w.u32(n['parent']); w.u32(n['unk'])
    elif t == 'model::RenderNode':
        w.u32(n['unk']); w.u32(n['material'])
        w.u32(len(n['parents']))
        for p in n['parents']:
            for i, x in enumerate(p): (w.u32 if i == 0 else w.i32)(x)
        _wvtx(w, n['vtx']); _widx(w, n['idx'])
    elif t == 'model::SkinNode':
        w.u32(n['unk']); w.u32(n['material'])
        w.u32(len(n['bones']))
        for x in n['bones']: w.u32(x)
        w.u32(n['post'])
        _wvtx(w, n['vtx']); _widx(w, n['idx'])
    elif t == 'model::ShellNode':
        w.u32(n['parent']); w.u32(len(n['format'])); w.b += bytes(n['format'])
        _wvtx(w, n['vtx']); _widx(w, n['idx'])
    elif t == 'model::LightNode':
        w.u32(n['parent']); w.u8(n['unk'])
        _wprops(w, n['light'])
        w.u8(n['unk2'])
    else: raise ValueError(t)


def write(f, keep_table=False):
    """bytes of a version 10 file. keep_table: use the string table the file was read with (a round trip)"""
    w = W(f['strings'] if keep_table else None)
    w.u32(len(f['indexA']))
    for k, v in f['indexA']: w.s(k); w.u32(v)
    w.u32(len(f['indexB']))
    for k, v in f['indexB']: w.s(k); w.u32(v)
    _wnode(w, f['root'])
    w.u32(len(f['nodes']))
    for n in f['nodes']: _wnode(w, n)
    for p in f['parents']: w.i32(p)
    w.u32(len(f['items']))
    for k, ns in f['items']:
        w.s(k)
        w.u32(len(ns))
        for n in ns: _wnode(w, n)
    body = bytes(w.b) + f.get('rest', b'')
    table = b'\0'.join(s.encode('cp1251') for s in w.table) + (b'' if keep_table else b'\0')
    if keep_table:
        table = b'\0'.join(s.encode('cp1251') for s in f['strings'])
    return b'EDM' + struct.pack('<HI', 10, len(table)) + table + body


# ---------------------------------------------------------------- dump

def summary(f):
    out = ['strings %d; indexA %s; indexB %s' % (len(f['strings']), f['indexA'], f['indexB'])]
    root = f['root']
    out.append('root %r v%d props %s bbox %s' % (root['name'], root['version'], [(p['name'], p.get('value')) for p in root['props']], ['%.3f' % x for x in root['bbox']]))
    for i, m in enumerate(root['materials']):
        d = dict(m)
        out.append('material %d: %s' % (i, {k: (v if k != 'TEXTURES' else [(t['index'], t['name'], t['unk'], t['unk2']) for t in v]) for k, v in d.items() if k not in ('UNIFORMS', 'ANIMATED_UNIFORMS')}))
        out.append('   uniforms %s' % [(p['name'], p.get('value')) for p in d.get('UNIFORMS', [])])
        out.append('   animated uniforms %s' % [(p['type'], p['name'], p.get('arg')) for p in d.get('ANIMATED_UNIFORMS', [])])
    for i, n in enumerate(f['nodes']):
        extra = ''
        if 'matrix' in n: extra = ' matrix %s' % ['%.3f' % x for x in n['matrix']]
        if 'levels' in n: extra = ' levels %s' % n['levels']
        if 'vis' in n: extra = ' vis %s' % n['vis']
        if 'rot' in n: extra = ' pos %s rot %s scale %d' % ([a for a, _ in n['pos']], [a for a, _ in n['rot']], len(n['scale']))
        out.append('node %d %s %r parent %d%s' % (i, n['type'], n['name'], f['parents'][i], extra))
    for k, ns in f['items']:
        for n in ns:
            if 'vtx' in n:
                out.append('%s %s %r material %s parents %s vtx %d x %d idx type %d n %d unk %d props %s' % (k, n['type'], n['name'], n.get('material'), n.get('parents', n.get('parent')),
                           n['vtx']['count'], n['vtx']['stride'], n['idx']['type'], n['idx']['count'], n['idx']['unk'], [(p['name'], p.get('value')) for p in n['props']]))
            else:
                out.append('%s %s %r parent %s props %s' % (k, n['type'], n['name'], n.get('parent'), [(p['name'], p.get('value')) for p in n['props']]))
    return '\n'.join(out)


if __name__ == '__main__':
    for path in sys.argv[1:]:
        data = open(path, 'rb').read()
        f = read(data)
        print('==', path.replace('\\', '/').split('/')[-1], len(data), 'bytes;', 'trailing bytes %d' % len(f['rest']))
        print(summary(f))
        again = write(f, keep_table=True)
        print('round trip:', 'IDENTICAL' if again == data else 'DIFFERENT (%d vs %d bytes)' % (len(again), len(data)))
