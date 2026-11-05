"""Codemod 3: background colours assigned to local variables, e.g.
    let backgroundColor = 'white';  backgroundColor = cond ? '#ECFDF5' : 'white';
Only variables whose name contains 'background' or starts with 'bg' are touched, and the
canvas renderer (FlightAssignments.tsx) + kneeboard are excluded (canvas needs literal colours).
Usage: python scripts/tokenize-bg-vars.py src"""
import os, re, sys, importlib.util

ROOT = sys.argv[1]
here = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('tok', os.path.join(here, 'tokenize-legacy-colors.py'))
# Reuse the BG map from the main codemod without running it
src = open(os.path.join(here, 'tokenize-legacy-colors.py'), encoding='utf-8').read()
ns = {}
exec(src.split('BG_PROPS =')[0].replace('ROOT = sys.argv[1]', 'ROOT = None'), ns)
BG = ns['BG']
HEX_RE = re.compile(r"#[0-9A-Fa-f]{6}\b|#[0-9A-Fa-f]{3}\b|\bwhite\b")

VAR_RE = re.compile(r"\b((?:let|const|var)\s+)?(\w*[Bb]ackground\w*|bg[A-Z]\w*|bg)(\s*=\s*)([^;\n]*)")
STR_RE = re.compile(r"(['\"])([^'\"\n]*)\1")

def map_val(v):
    if 'gradient' in v or 'url(' in v:
        return v
    return HEX_RE.sub(lambda m: BG.get(m.group(0).upper(), m.group(0)), v)

changed = 0
for dp, dn, fn in os.walk(ROOT):
    if 'kneeboard' in dp or 'primitives' in dp or 'shell' in dp or os.sep + 'utils' in dp:
        continue
    for f in fn:
        if not f.endswith('.tsx') or f == 'FlightAssignments.tsx':
            continue
        p = os.path.join(dp, f)
        s = open(p, encoding='utf-8').read()
        def rep(m):
            if m.group(3).strip() != '=':
                return m.group(0)
            rhs = STR_RE.sub(lambda sm: sm.group(1) + map_val(sm.group(2)) + sm.group(1), m.group(4))
            return (m.group(1) or '') + m.group(2) + m.group(3) + rhs
        o = VAR_RE.sub(rep, s)
        if o != s:
            open(p, 'w', encoding='utf-8', newline='').write(o)
            changed += 1
            print('changed', p)
print('files changed:', changed)
