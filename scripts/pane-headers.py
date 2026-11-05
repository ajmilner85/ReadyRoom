"""Codemod 2: legacy card headers/surfaces -> UI Kit pane style.
- Section header spans (20px / 300 / uppercase, centred) -> pane title (12px / 600 / .14em, left)
- Card style objects with --rr-shadow and 8px radius -> 10px radius + 1px --rr-border
Usage: python scripts/pane-headers.py src"""
import os, re, sys

ROOT = sys.argv[1]
SKIP = ('kneeboard', 'primitives', 'shell')

HEADER_RE = re.compile(
    r"fontWeight:\s*300,(\s*)fontSize:\s*'20px',(\s*)lineHeight:\s*'24px',")
CENTER_RE = re.compile(
    r"width:\s*'100%',(\s*)textAlign:\s*'center',(\s*)marginBottom:\s*'16px'")

def enclosing_object(s, pos):
    """Return (start, end) of the innermost {...} containing pos."""
    depth = 0
    i = pos
    while i >= 0:
        c = s[i]
        if c == '}':
            depth += 1
        elif c == '{':
            if depth == 0:
                break
            depth -= 1
        i -= 1
    start = i
    depth = 0
    j = pos
    while j < len(s):
        c = s[j]
        if c == '{':
            depth += 1
        elif c == '}':
            if depth == 0:
                break
            depth -= 1
        j += 1
    return start, j

def fix_cards(s):
    out = s
    offset = 0
    for m in list(re.finditer(r"boxShadow:\s*'var\(--rr-shadow\)'", s)):
        a, b = enclosing_object(out, m.start() + offset)
        if a < 0 or b >= len(out):
            continue
        obj = out[a:b + 1]
        if "borderRadius: '8px'" not in obj:
            continue
        new = obj.replace("borderRadius: '8px'", "borderRadius: '10px'", 1)
        if not re.search(r"\bborder:\s", new):
            new = new.replace("boxShadow: 'var(--rr-shadow)'", "boxShadow: 'var(--rr-shadow)',\n          border: '1px solid var(--rr-border)'", 1)
            new = new.replace(",,", ",")
        out = out[:a] + new + out[b + 1:]
        offset += len(new) - len(obj)
    return out

changed = 0
for dp, dn, fn in os.walk(ROOT):
    if any(k in dp for k in SKIP):
        continue
    for f in fn:
        if not f.endswith('.tsx'):
            continue
        p = os.path.join(dp, f)
        s = open(p, encoding='utf-8').read()
        o = HEADER_RE.sub(lambda m: f"fontWeight: 600,{m.group(1)}fontSize: '12px',{m.group(2)}letterSpacing: '.14em',{m.group(2)}lineHeight: '16px',", s)
        o = CENTER_RE.sub(lambda m: f"width: '100%',{m.group(1)}textAlign: 'left',{m.group(2)}marginBottom: '12px'", o)
        o = fix_cards(o)
        if o != s:
            open(p, 'w', encoding='utf-8', newline='').write(o)
            changed += 1
            print('changed', p)
print('files changed:', changed)
