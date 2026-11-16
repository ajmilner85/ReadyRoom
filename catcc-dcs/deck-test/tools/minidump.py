"""Read a DCS crash dump (Windows minidump): the exception, the faulting thread's registers, the code
bytes at the fault, the stack words that point into modules, and memory at given addresses.

    python minidump.py <file.dmp> [address[:words] ...]

DCS zips each crash into Saved Games\\DCS\\Logs\\dcs.log-<date>-<time>.zip (the .dmp, the .crash text
with the call stack, the log). Flight.dll and other DCS DLLs are packed on disk (.text has no raw
data), so they can't be disassembled from the file: what the dump holds is the way in. A minidump
keeps the registers, the stacks and about 1 KB around every address a register or the stack points
at, which is usually enough to see what the faulting code was reading (2026-11-14: route 1's emptied
hand-off list, next to its brown_id, in the take-off crew's per-route records).
Addresses are hex (with or without 0x); words are 8 bytes each, default 8."""
import struct
import sys

if len(sys.argv) < 2:
    sys.exit(__doc__)
d = open(sys.argv[1], 'rb').read()
sig, _ver, nstreams, dir_rva = struct.unpack_from('<IIII', d, 0)
assert sig == 0x504D444D, 'not a minidump'
streams = {}
for i in range(nstreams):
    t, size, rva = struct.unpack_from('<III', d, dir_rva + 12 * i)
    streams[t] = (rva, size)


def mdstring(rva):
    n = struct.unpack_from('<I', d, rva)[0]
    return d[rva + 4: rva + 4 + n].decode('utf-16-le', 'replace')


# modules (stream 4)
mods = []
rva, size = streams[4]
for i in range(struct.unpack_from('<I', d, rva)[0]):
    o = rva + 4 + 108 * i
    base, msize = struct.unpack_from('<QI', d, o)
    mods.append((base, msize, mdstring(struct.unpack_from('<I', d, o + 20)[0])))
mods.sort()


def where(addr):
    for base, msize, name in mods:
        if base <= addr < base + msize:
            return '%s+0x%x' % (name.split('\\')[-1], addr - base)
    return None


# memory: Memory64List (9) and / or MemoryList (5)
ranges = []
if 9 in streams:
    rva, size = streams[9]
    n, off = struct.unpack_from('<QQ', d, rva)
    for i in range(n):
        start, sz = struct.unpack_from('<QQ', d, rva + 16 + 16 * i)
        ranges.append((start, sz, off))
        off += sz
if 5 in streams:
    rva, size = streams[5]
    for i in range(struct.unpack_from('<I', d, rva)[0]):
        start, sz, mrva = struct.unpack_from('<QII', d, rva + 4 + 16 * i)
        ranges.append((start, sz, mrva))


def read(addr, n):
    for start, sz, off in ranges:
        if start <= addr and addr + n <= start + sz:
            return d[off + addr - start: off + addr - start + n]
    return None


# exception (stream 6)
rva, size = streams[6]
tid = struct.unpack_from('<I', d, rva)[0]
code, _flags, _rec, addr, nparams, _a = struct.unpack_from('<IIQQII', d, rva + 8)
params = struct.unpack_from('<15Q', d, rva + 8 + 32)
ctx_rva = struct.unpack_from('<II', d, rva + 8 + 152)[1]
print('exception 0x%08X at 0x%x (%s), thread %d' % (code, addr, where(addr), tid))
if nparams >= 2:
    print('  access: %s of address 0x%x' % ({0: 'READ', 1: 'WRITE', 8: 'EXECUTE'}.get(params[0], params[0]), params[1]))

names = ['rax', 'rcx', 'rdx', 'rbx', 'rsp', 'rbp', 'rsi', 'rdi', 'r8', 'r9', 'r10', 'r11', 'r12', 'r13', 'r14', 'r15', 'rip']
regs = dict(zip(names, struct.unpack_from('<17Q', d, ctx_rva + 0x78)))
print('registers:')
for k in names:
    w = where(regs[k])
    print('  %-4s %016x%s' % (k, regs[k], ('  ' + w) if w else ''))

code_bytes = read(addr - 32, 64)
print('code, 32 bytes either side of the fault:', code_bytes.hex() if code_bytes else '(not in the dump)')

if len(sys.argv) == 2:
    print('stack words that point into modules (from rsp):')
    shown = 0
    for i in range(0, 0x2000, 8):
        b = read(regs['rsp'] + i, 8)
        if not b:
            break
        v = struct.unpack('<Q', b)[0]
        w = where(v)
        if w:
            print('  rsp+0x%04x  %016x  %s' % (i, v, w))
            shown += 1
            if shown >= 80:
                break

for a in sys.argv[2:]:
    at, _, n = a.partition(':')
    at = int(at, 16)
    print('--- memory at 0x%x' % at)
    for i in range(int(n or 8)):
        b = read(at + 8 * i, 8)
        if b is None:
            print('  +0x%03x  (not in the dump)' % (8 * i))
            break
        v = struct.unpack('<Q', b)[0]
        w = where(v)
        print('  +0x%03x  %016x%s' % (8 * i, v, ('  ' + w) if w else ''))
print('(%d memory ranges in the dump, %.1f MB)' % (len(ranges), sum(r[1] for r in ranges) / 1048576))
