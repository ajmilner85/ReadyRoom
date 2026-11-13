# Reads the node tree and collision data (shells, lines) of an EDM v10 collision model and prints the
# collision lines / shell extents in model space for given draw-argument values. Read-only.
# Layouts after the open-source Blender_ioEDM reader (ndevenish). Usage: edmcoll.py file.edm [arg=value ...] [filter|nodes]
import struct, sys, math


class R:
    def __init__(s, d):
        s.d = d
        s.o = 0

    def u8(s):
        v = s.d[s.o]
        s.o += 1
        return v

    def u32(s):
        v = struct.unpack_from("<I", s.d, s.o)[0]
        s.o += 4
        return v

    def i32(s):
        v = struct.unpack_from("<i", s.d, s.o)[0]
        s.o += 4
        return v

    def f32s(s, n):
        v = struct.unpack_from("<%df" % n, s.d, s.o)
        s.o += 4 * n
        return v

    def f64s(s, n):
        v = struct.unpack_from("<%dd" % n, s.d, s.o)
        s.o += 8 * n
        return v

    def lookup(s):
        return s.strings[s.u32()]

    def inline(s):
        n = s.u32()
        assert n < 200, (n, s.o)
        v = s.d[s.o:s.o + n].decode("latin1")
        s.o += n
        return v


def mat_from_file(seq):
    # file: 16 doubles with the translation in the last 4 (row-vector); return a column-vector 4x4
    rows = [seq[0:4], seq[4:8], seq[8:12], seq[12:16]]
    return [[rows[j][i] for j in range(4)] for i in range(4)]


def ident():
    return [[1.0 if i == j else 0.0 for j in range(4)] for i in range(4)]


def mul(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(4)) for j in range(4)] for i in range(4)]


def trans(v):
    m = ident()
    m[0][3], m[1][3], m[2][3] = v[0], v[1], v[2]
    return m


def scale(v):
    m = ident()
    m[0][0], m[1][1], m[2][2] = v[0], v[1], v[2]
    return m


def qmul(a, b):
    aw, ax, ay, az = a
    bw, bx, by, bz = b
    return (aw * bw - ax * bx - ay * by - az * bz, aw * bx + ax * bw + ay * bz - az * by,
            aw * by - ax * bz + ay * bw + az * bx, aw * bz + ax * by - ay * bx + az * bw)


def qmat(q):
    w, x, y, z = q
    n = math.sqrt(w * w + x * x + y * y + z * z) or 1.0
    w, x, y, z = w / n, x / n, y / n, z / n
    m = ident()
    m[0][0] = 1 - 2 * (y * y + z * z)
    m[0][1] = 2 * (x * y - z * w)
    m[0][2] = 2 * (x * z + y * w)
    m[1][0] = 2 * (x * y + z * w)
    m[1][1] = 1 - 2 * (x * x + z * z)
    m[1][2] = 2 * (y * z - x * w)
    m[2][0] = 2 * (x * z - y * w)
    m[2][1] = 2 * (y * z + x * w)
    m[2][2] = 1 - 2 * (x * x + y * y)
    return m


def slerp(a, b, t):
    d = sum(x * y for x, y in zip(a, b))
    if d < 0:
        b = tuple(-x for x in b)
        d = -d
    if d > 0.9995:
        return tuple(x + (y - x) * t for x, y in zip(a, b))
    th = math.acos(d)
    s = math.sin(th)
    return tuple((math.sin((1 - t) * th) * x + math.sin(t * th) * y) / s for x, y in zip(a, b))


def key_at(keys, a, rot):
    keys = sorted(keys, key=lambda k: k[0])
    if a <= keys[0][0]:
        return keys[0][1]
    if a >= keys[-1][0]:
        return keys[-1][1]
    for (f0, v0), (f1, v1) in zip(keys, keys[1:]):
        if f0 <= a <= f1:
            t = (a - f0) / (f1 - f0) if f1 > f0 else 0.0
            return slerp(v0, v1, t) if rot else tuple(x + (y - x) * t for x, y in zip(v0, v1))


def apply(m, p):
    return tuple(m[i][0] * p[0] + m[i][1] * p[1] + m[i][2] * p[2] + m[i][3] for i in range(3))


def read_base(r):
    name = r.inline()
    r.u32()
    for _ in range(r.u32()):
        t = r.lookup()
        r.lookup()
        if t == "model::Property<unsigned int>":
            r.u32()
        elif t == "model::Property<float>":
            r.f32s(1)
        else:
            raise IOError("property type " + t)
    return name


def read_file(path):
    d = open(path, "rb").read()
    r = R(d)
    assert d[:3] == b"EDM"
    ver = struct.unpack_from("<H", d, 3)[0]
    r.o = 5
    assert ver == 10, ver
    n = r.u32()
    r.strings = [x.decode("latin1") for x in d[r.o:r.o + n].split(b"\0")]
    r.o += n
    for _ in range(2):
        for _ in range(r.u32()):
            r.lookup()
            r.u32()
    assert r.lookup() == "model::RootNode"
    read_base(r)
    r.f64s(6)
    r.f64s(12)
    nm = r.u32()
    assert nm == 0, "materials present: %d" % nm
    r.u32()
    r.u32()
    nodes = []
    for _ in range(r.u32()):
        t = r.lookup()
        node = {"type": t.replace("model::", ""), "name": read_base(r)}
        if t == "model::Node":
            pass
        elif t == "model::TransformNode":
            node["matrix"] = mat_from_file(r.f64s(16))
        elif t in ("model::ArgAnimationNode", "model::ArgRotationNode", "model::ArgPositionNode", "model::ArgScaleNode"):
            node["matrix"] = mat_from_file(r.f64s(16))
            node["pos"] = r.f64s(3)
            q = r.f64s(4)
            node["q1"] = (q[3], q[0], q[1], q[2])
            r.f64s(4)
            node["scale"] = r.f64s(3)
            node["posKeys"], node["rotKeys"] = [], []
            for _ in range(r.u32()):
                arg = r.u32()
                keys = []
                for _ in range(r.u32()):
                    f = r.f64s(1)[0]
                    keys.append((f, r.f64s(3)))
                node["posKeys"].append((arg, keys))
            for _ in range(r.u32()):
                arg = r.u32()
                keys = []
                for _ in range(r.u32()):
                    f = r.f64s(1)[0]
                    q = r.f64s(4)
                    keys.append((f, (q[3], q[0], q[1], q[2])))
                node["rotKeys"].append((arg, keys))
            for _ in range(r.u32()):
                r.u32()
                for _ in range(r.u32()):
                    r.f64s(5)
                for _ in range(r.u32()):
                    r.f64s(4)
        elif t == "model::ArgVisibilityNode":
            node["vis"] = []
            for _ in range(r.u32()):
                arg = r.u32()
                node["vis"].append((arg, [r.f64s(2) for _ in range(r.u32())]))
        else:
            raise IOError("node type " + t)
        nodes.append(node)
    for node in nodes:
        node["parent"] = r.i32()
    shells, segs = [], []
    for _ in range(r.u32()):
        r.lookup()
        for _ in range(r.u32()):
            t = r.lookup()
            name = read_base(r)
            if t == "model::Connector":
                r.u32()
                r.u32()
            elif t == "model::ShellNode":
                parent = r.u32()
                nch = r.u32()
                r.o += nch
                cnt, stride = r.u32(), r.u32()
                fl = r.f32s(cnt * stride)
                verts = [fl[i * stride:i * stride + 3] for i in range(cnt)]
                dt = r.u8()
                ne = r.u32()
                r.u32()
                if dt == 0:
                    idx = list(d[r.o:r.o + ne])
                    r.o += ne
                elif dt == 1:
                    idx = struct.unpack_from("<%dH" % ne, d, r.o)
                    r.o += 2 * ne
                else:
                    idx = struct.unpack_from("<%dI" % ne, d, r.o)
                    r.o += 4 * ne
                shells.append({"name": name, "parent": parent, "verts": verts, "idx": idx})
            elif t == "model::SegmentsNode":
                parent = r.u32()
                cnt = r.u32()
                segs.append({"name": name, "parent": parent, "segs": [r.f32s(6) for _ in range(cnt)]})
            else:
                raise IOError("object type " + t)
    return nodes, shells, segs


def local(node, args):
    if "q1" in node:
        p = node["pos"]
        for arg, keys in node["posKeys"]:
            k = key_at(keys, args.get(arg, 0.0), False)
            p = tuple(a + b for a, b in zip(p, k))
        q = node["q1"]
        for arg, keys in node["rotKeys"]:
            q = qmul(q, key_at(keys, args.get(arg, 0.0), True))
        return mul(mul(mul(node["matrix"], trans(p)), qmat(q)), scale(node["scale"]))
    if "matrix" in node:
        return node["matrix"]
    return ident()


def world(nodes, i, args, cache):
    if i in cache:
        return cache[i]
    m = local(nodes[i], args)
    if nodes[i]["parent"] >= 0:
        m = mul(world(nodes, nodes[i]["parent"], args, cache), m)
    cache[i] = m
    return m


if __name__ == "__main__":
    path = sys.argv[1]
    args = {}
    flt = None
    for a in sys.argv[2:]:
        if "=" in a:
            k, v = a.split("=")
            args[int(k)] = float(v)
        else:
            flt = a
    nodes, shells, segs = read_file(path)
    if flt == "nodes":
        for i, nd in enumerate(nodes):
            used = sorted(set([a for a, _ in nd.get("posKeys", [])] + [a for a, _ in nd.get("rotKeys", [])] + [a for a, _ in nd.get("vis", [])]))
            print("%3d %-18s %-28s parent %3d args %s" % (i, nd["type"], nd["name"], nd["parent"], used))
        sys.exit()
    cache = {}
    for s in segs:
        if flt and flt not in s["name"]:
            continue
        m = world(nodes, s["parent"], args, cache)
        print("SEG %-18s node %3d" % (s["name"], s["parent"]))
        for g in s["segs"]:
            a, b = apply(m, g[0:3]), apply(m, g[3:6])
            print("     (%7.3f %7.3f %7.3f) -> (%7.3f %7.3f %7.3f)" % (a + b))
    for s in shells:
        if flt and flt not in s["name"]:
            continue
        m = world(nodes, s["parent"], args, cache)
        vs = [apply(m, v) for v in s["verts"]]
        print("SHELL %-16s node %3d  x[%7.3f %7.3f] y[%7.3f %7.3f] z[%7.3f %7.3f]" % (
            s["name"], s["parent"], min(v[0] for v in vs), max(v[0] for v in vs), min(v[1] for v in vs),
            max(v[1] for v in vs), min(v[2] for v in vs), max(v[2] for v in vs)))
