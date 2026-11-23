"""Checks that every DCS function catcc_atcprobe.cpp looks up by name is exported by the DLL it names.

    python check_exports.py [<DCS install folder>]

Reads the SYMS table out of catcc_atcprobe.cpp and each DLL's export table (deck-test/tools/pe_exports.py; the
export table is readable even where the code is packed). Both of DCS's program folders are checked (bin, bin-mt).
Exit code 1 if a name is missing; 2 if DCS is not installed where looked for."""
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', '..', 'tools'))
from pe_exports import exports  # noqa: E402

dcs = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.environ.get('ProgramFiles', 'C:/Program Files'), 'Eagle Dynamics', 'DCS World')
src = open(os.path.join(HERE, 'catcc_atcprobe.cpp'), encoding='utf-8').read()
syms = re.findall(r'\{"([\w.]+\.dll)", "([^"]+)", &s_\w+, "([^"]+)"\}', src)
if len(syms) < 30:
    sys.exit('the SYMS table could not be read out of catcc_atcprobe.cpp (%d entries)' % len(syms))
bad = looked = 0
for folder in ('bin', 'bin-mt'):
    cache = {}
    for dll, name, what in syms:
        path = os.path.join(dcs, folder, dll)
        if not os.path.exists(path):
            continue
        if dll not in cache:
            cache[dll] = set(exports(path))
        looked += 1
        if name not in cache[dll]:
            bad += 1
            print('MISSING in %s/%s: %s  (%s)' % (folder, dll, what, name))
if not looked:
    print('DCS is not installed at ' + dcs + ': nothing checked')
    sys.exit(2)
print('%d names, %d lookups, %d missing' % (len(syms), looked, bad))
sys.exit(1 if bad else 0)
