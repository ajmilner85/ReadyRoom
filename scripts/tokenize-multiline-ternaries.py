"""Codemod 5: style values written as multi-line ternaries, e.g.
      backgroundColor:
        status === 'a' ? '#D1FAE5' :
        status === 'b' ? '#FEF3C7' :
        '#F3F4F6',
Maps the string literals with the same property-aware tables as tokenize-legacy-colors.py.
Skips kneeboard, primitives, shell and FlightAssignments.tsx (canvas).
Usage: python scripts/tokenize-multiline-ternaries.py src"""
import os, re, sys

ROOT = sys.argv[1]
here = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(here, 'tokenize-legacy-colors.py'), encoding='utf-8').read()
ns = {}
exec(src.split('BG_PROPS =')[0].replace('ROOT = sys.argv[1]', 'ROOT = None'), ns)
BG, TEXT, BORDER = ns['BG'], ns['TEXT'], ns['BORDER']
HEX = re.compile(r"#[0-9A-Fa-f]{6}\b|#[0-9A-Fa-f]{3}\b|\bwhite\b|\bblack\b")
STR = re.compile(r"(['\"])([^'\"\n]*)\1")
BLOCK = re.compile(r"(\b(backgroundColor|background|color|borderColor|border|borderLeft|borderRight|borderTop|borderBottom)\s*:\s*\n)((?:[ \t]+[^\n]*\?[^\n]*\n)+[ \t]+[^\n]*\n)")

def table(prop):
    if prop.startswith('background'):
        return BG
    if prop == 'color':
        return TEXT
    return BORDER

n = 0
for dp, dn, fn in os.walk(ROOT):
    if any(k in dp for k in ('kneeboard', 'primitives', 'shell')) or os.sep + 'utils' in dp:
        continue
    for f in fn:
        if not f.endswith('.tsx') or f == 'FlightAssignments.tsx':
            continue
        p = os.path.join(dp, f)
        s = open(p, encoding='utf-8').read()
        def rep(m):
            t = table(m.group(2))
            body = STR.sub(lambda sm: sm.group(1) + (sm.group(2) if ('gradient' in sm.group(2) or 'url(' in sm.group(2)) else HEX.sub(lambda h: t.get(h.group(0).upper(), h.group(0)), sm.group(2))) + sm.group(1), m.group(3))
            return m.group(1) + body
        o = BLOCK.sub(rep, s)
        if o != s:
            open(p, 'w', encoding='utf-8', newline='').write(o)
            n += 1
            print('changed', p)
print('files changed:', n)
