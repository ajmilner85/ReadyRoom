"""Codemod 4: CSS declarations written as text inside .tsx (<style> blocks, template literals),
e.g. `color: #374151;`  `background-color: #F8FAFC;`  `border: 1px solid #E5E7EB;`
Uses the same colour tables as tokenize-legacy-colors.py. Skips kneeboard, primitives, shell and
FlightAssignments.tsx (canvas). Usage: python scripts/tokenize-css-strings.py src"""
import os, re, sys

ROOT = sys.argv[1]
here = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(here, 'tokenize-legacy-colors.py'), encoding='utf-8').read()
ns = {}
exec(src.split('BG_PROPS =')[0].replace('ROOT = sys.argv[1]', 'ROOT = None'), ns)
BG, TEXT, BORDER = ns['BG'], ns['TEXT'], ns['BORDER']
HEX_RE = re.compile(r"#[0-9A-Fa-f]{6}\b|#[0-9A-Fa-f]{3}\b|\bwhite\b|\bblack\b")
DECL_RE = re.compile(r"(?<![\w-])(background-color|background|color|border(?:-(?:top|bottom|left|right))?(?:-color)?|outline)(\s*:\s*)([^;{}\n`'\"]+)(;)")

def table_for(prop):
    if prop.startswith('background'):
        return BG
    if prop == 'color':
        return TEXT
    return BORDER

changed = 0
for dp, dn, fn in os.walk(ROOT):
    if any(k in dp for k in ('kneeboard', 'primitives', 'shell')) or os.sep + 'utils' in dp:
        continue
    for f in fn:
        if not f.endswith('.tsx') or f == 'FlightAssignments.tsx':
            continue
        p = os.path.join(dp, f)
        s = open(p, encoding='utf-8').read()
        def rep(m):
            v = m.group(3)
            if 'gradient' in v or 'url(' in v or 'var(' in v:
                return m.group(0)
            t = table_for(m.group(1))
            nv = HEX_RE.sub(lambda h: t.get(h.group(0).upper(), h.group(0)), v)
            return m.group(1) + m.group(2) + nv + m.group(4)
        o = DECL_RE.sub(rep, s)
        if o != s:
            open(p, 'w', encoding='utf-8', newline='').write(o)
            changed += 1
            print('changed', p)
print('files changed:', changed)
