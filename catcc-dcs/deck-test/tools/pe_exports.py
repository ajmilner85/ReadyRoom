"""List what a DLL exports (no external libraries): what a native module of ours can look up by name.

    python pe_exports.py <file.dll> [regex] [max] [--raw]

DCS's DLLs export their C++ classes with decorated names, which carry the full signature
(?move_command_world@CharacterMovable@AnimatorLogic@@QEAAXAEBV?$wPosition3@M@@@Z). The export table is
readable even where the code is packed (Flight.dll). Without --raw the names are shown roughly
undecorated (namespace::Class::name) and de-duplicated; with --raw as they must be passed to
GetProcAddress. In a decorated name the letters after @@ give the kind: Q public, I protected,
A private; then E + A non-virtual / U or M virtual; S = static."""
import re
import struct
import sys


def exports(path):
    d = open(path, 'rb').read()
    pe = struct.unpack_from('<I', d, 0x3C)[0]
    assert d[pe:pe + 4] == b'PE\0\0'
    nsec = struct.unpack_from('<H', d, pe + 6)[0]
    opt = pe + 24
    dd = opt + (112 if struct.unpack_from('<H', d, opt)[0] == 0x20B else 96)
    so = opt + struct.unpack_from('<H', d, pe + 20)[0]
    secs = []
    for i in range(nsec):
        vsize, va, rsize, raw = struct.unpack_from('<IIII', d, so + 40 * i + 8)
        secs.append((va, max(vsize, rsize), raw))

    def off(rva):
        for va, sz, raw in secs:
            if va <= rva < va + sz:
                return raw + rva - va
        raise ValueError('rva outside the sections')

    exp_rva = struct.unpack_from('<I', d, dd)[0]
    if not exp_rva:
        return []
    e = off(exp_rva)
    n = struct.unpack_from('<I', d, e + 24)[0]
    names = off(struct.unpack_from('<I', d, e + 32)[0])
    out = []
    for i in range(n):
        o = off(struct.unpack_from('<I', d, names + 4 * i)[0])
        out.append(d[o:d.index(b'\0', o)].decode('latin1'))
    return out


def pretty(n):
    m = re.match(r'\?+([^@]+)((?:@[^@]+)*)@@', n)
    if not m:
        return n
    parts = [p for p in m.group(2).split('@') if p]
    return '::'.join(reversed(parts)) + '::' + m.group(1) if parts else m.group(1)


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if a != '--raw']
    raw = '--raw' in sys.argv
    if not args:
        sys.exit(__doc__)
    rx = re.compile(args[1], re.I) if len(args) > 1 else None
    mx = int(args[2]) if len(args) > 2 else 100
    names = [n for n in exports(args[0]) if not rx or rx.search(n)]
    shown = names if raw else sorted({pretty(n) for n in names})
    print('%s: %d matching' % (args[0].replace('/', '\\').split('\\')[-1], len(shown)))
    for s in shown[:mx]:
        print('   ', s)
    if len(shown) > mx:
        print('    ... %d more' % (len(shown) - mx))
