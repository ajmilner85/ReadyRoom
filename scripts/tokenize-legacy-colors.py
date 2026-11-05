"""Codemod: map legacy hard-coded light-theme colours in inline styles / Tailwind classes to
ReadyRoom design tokens. Property-aware (background vs text vs border) so white text on
coloured fills is preserved. Usage: python tokenize.py <src dir> [--dry]"""
import os, re, sys

ROOT = sys.argv[1]
DRY = '--dry' in sys.argv

EXCLUDE_DIRS = [
    os.path.join('components', 'kneeboard'),
    os.path.join('components', 'ui', 'primitives'),
    os.path.join('components', 'shell'),
]
EXCLUDE_FILES = {'UiKit.tsx', 'Appearance.tsx', 'SettingsSection.tsx'}

def norm(h):
    return h.upper()

BG = {}
for k in ['#FFFFFF', '#FFF', 'WHITE']: BG[k] = 'var(--rr-panel)'
for k in ['#F8FAFC', '#F9FAFB', '#FAFAFA', '#F1F5F9', '#F3F4F6', '#F0F4F8', '#F5F5F5', '#F7FAFC', '#F8F9FA', '#FBFBFB', '#F4F4F5', '#F6F7F9']: BG[k] = 'var(--rr-panel2)'
for k in ['#E5E7EB', '#E2E8F0', '#E0E4E9', '#D1D5DB', '#CBD5E1', '#EDF2F7', '#E4E4E7']: BG[k] = 'var(--rr-panel3)'
for k in ['#3B82F6', '#2563EB', '#1D4ED8', '#4F46E5', '#6366F1']: BG[k] = 'var(--rr-accent)'
for k in ['#EFF6FF', '#DBEAFE', '#E0E7FF', '#EEF2FF', '#F0F9FF', '#E0F2FE']: BG[k] = 'var(--rr-accent-weak)'
for k in ['#FEF2F2', '#FEE2E2', '#FFF1F2']: BG[k] = 'rgba(224,82,78,.12)'
for k in ['#DC2626', '#EF4444', '#B91C1C']: BG[k] = 'var(--rr-bad)'
for k in ['#10B981', '#059669', '#22C55E', '#16A34A']: BG[k] = 'var(--rr-good)'
for k in ['#F0FDF4', '#ECFDF5', '#DCFCE7', '#D1FAE5']: BG[k] = 'rgba(64,168,91,.14)'
for k in ['#FEF3C7', '#FFFBEB', '#FEF9C3', '#FFF7ED']: BG[k] = 'rgba(222,154,31,.14)'
for k in ['#F59E0B', '#D97706']: BG[k] = 'var(--rr-warn)'

TEXT = {}
for k in ['#0F172A', '#1E293B', '#111827', '#1F2937', '#000000', '#000', 'BLACK', '#334155', '#2D3748', '#1A202C', '#374151', '#18181B']: TEXT[k] = 'var(--rr-text)'
for k in ['#475569', '#4B5563', '#64748B', '#6B7280', '#4A5568', '#646F7E', '#575A58', '#718096', '#52525B', '#71717A']: TEXT[k] = 'var(--rr-text2)'
for k in ['#94A3B8', '#9CA3AF', '#A0AEC0', '#CBD5E1', '#D1D5DB', '#A1A1AA']: TEXT[k] = 'var(--rr-text3)'
for k in ['#3B82F6', '#2563EB', '#1D4ED8', '#1E40AF', '#4F46E5', '#6366F1', '#1E3A8A']: TEXT[k] = 'var(--rr-accent-text)'
for k in ['#DC2626', '#EF4444', '#B91C1C', '#991B1B', '#7F1D1D']: TEXT[k] = 'var(--rr-bad)'
for k in ['#10B981', '#059669', '#065F46', '#16A34A', '#15803D', '#047857', '#166534']: TEXT[k] = 'var(--rr-good)'
for k in ['#F59E0B', '#D97706', '#92400E', '#B45309', '#78350F', '#A16207']: TEXT[k] = 'var(--rr-warn)'

BORDER = {}
for k in ['#E5E7EB', '#E2E8F0', '#F3F4F6', '#F1F5F9', '#EDF2F7', '#E4E4E7', '#F0F0F0']: BORDER[k] = 'var(--rr-border)'
for k in ['#D1D5DB', '#CBD5E1', '#9CA3AF', '#94A3B8', '#E0E4E9', '#D4D4D8']: BORDER[k] = 'var(--rr-border2)'
for k in ['#3B82F6', '#2563EB', '#93C5FD', '#BFDBFE', '#DBEAFE', '#60A5FA', '#1D4ED8']: BORDER[k] = 'var(--rr-accent)'
for k in ['#FECACA', '#FCA5A5', '#EF4444', '#DC2626', '#F87171']: BORDER[k] = 'var(--rr-bad)'
for k in ['#BBF7D0', '#10B981', '#86EFAC', '#A7F3D0', '#059669']: BORDER[k] = 'var(--rr-good)'
for k in ['#F59E0B', '#FDE68A', '#FCD34D', '#FBBF24']: BORDER[k] = 'var(--rr-warn)'
for k in ['#FFFFFF', '#FFF', 'WHITE']: BORDER[k] = 'var(--rr-panel)'

BG_PROPS = {'background', 'backgroundColor'}
TEXT_PROPS = {'color'}
BORDER_PROPS = {'border', 'borderColor', 'borderTop', 'borderBottom', 'borderLeft', 'borderRight',
                'borderTopColor', 'borderBottomColor', 'borderLeftColor', 'borderRightColor', 'outline', 'outlineColor'}

HEX_RE = re.compile(r"#[0-9A-Fa-f]{6}\b|#[0-9A-Fa-f]{3}\b|\bwhite\b|\bblack\b")

def map_value(prop, val):
    table = BG if prop in BG_PROPS else TEXT if prop in TEXT_PROPS else BORDER if prop in BORDER_PROPS else None
    if table is None:
        return val
    # Don't touch gradients / urls
    if 'gradient' in val or 'url(' in val:
        return val
    def rep(m):
        return table.get(norm(m.group(0)), m.group(0))
    return HEX_RE.sub(rep, val)

# prop: 'value'  |  prop: "value"  (object styles)
OBJ_RE = re.compile(r"\b(" + "|".join(sorted(BG_PROPS | TEXT_PROPS | BORDER_PROPS, key=len, reverse=True)) + r")(\s*:\s*)(['\"])([^'\"\n]*)\3")
# .style.prop = 'value'
ASSIGN_RE = re.compile(r"\.style\.(" + "|".join(sorted(BG_PROPS | TEXT_PROPS | BORDER_PROPS, key=len, reverse=True)) + r")(\s*=\s*)(['\"])([^'\"\n]*)\3")
# ternaries inside a style prop:  backgroundColor: x ? '#FFF' : '#F8FAFC'
TERN_RE = re.compile(r"\b(" + "|".join(sorted(BG_PROPS | TEXT_PROPS | BORDER_PROPS, key=len, reverse=True)) + r")(\s*:\s*)([^,\n}]*\?[^,\n}]*)")
STR_RE = re.compile(r"(['\"])([^'\"\n]*)\1")

SHADOW_RE = re.compile(r"(boxShadow\s*:\s*)(['\"])([^'\"\n]*rgba\(\s*0\s*,\s*0\s*,\s*0[^'\"\n]*)\2")
FONT_RE = re.compile(r"(fontFamily\s*:\s*)(['\"])(?:Inter|'Inter'|Inter,[^'\"\n]*|-apple-system[^'\"\n]*|system-ui[^'\"\n]*)\2")

TW = [
    (r'bg-white', 'bg-panel'), (r'bg-gray-50', 'bg-panel2'), (r'bg-gray-100', 'bg-panel2'), (r'bg-slate-50', 'bg-panel2'),
    (r'bg-slate-100', 'bg-panel2'), (r'bg-gray-200', 'bg-panel3'), (r'bg-slate-200', 'bg-panel3'),
    (r'text-gray-900', 'text-text'), (r'text-gray-800', 'text-text'), (r'text-slate-900', 'text-text'), (r'text-slate-800', 'text-text'),
    (r'text-gray-700', 'text-text'), (r'text-slate-700', 'text-text'),
    (r'text-gray-600', 'text-text2'), (r'text-gray-500', 'text-text2'), (r'text-slate-600', 'text-text2'), (r'text-slate-500', 'text-text2'),
    (r'text-gray-400', 'text-text3'), (r'text-slate-400', 'text-text3'),
    (r'border-gray-100', 'border-border'), (r'border-gray-200', 'border-border'), (r'border-slate-200', 'border-border'),
    (r'border-gray-300', 'border-border2'), (r'border-slate-300', 'border-border2'),
    (r'divide-gray-200', 'divide-border'), (r'divide-gray-100', 'divide-border'),
    (r'bg-blue-600', 'bg-accent'), (r'bg-blue-500', 'bg-accent'), (r'bg-indigo-600', 'bg-accent'),
    (r'hover:bg-blue-700', 'hover:brightness-110'), (r'hover:bg-blue-600', 'hover:brightness-110'),
    (r'text-blue-600', 'text-accent'), (r'text-blue-700', 'text-accent'), (r'text-blue-500', 'text-accent'), (r'text-indigo-600', 'text-accent'),
    (r'bg-blue-50', 'bg-accent-weak'), (r'bg-blue-100', 'bg-accent-weak'),
    (r'border-blue-500', 'border-accent'), (r'border-blue-600', 'border-accent'), (r'border-blue-200', 'border-accent'),
    (r'text-red-600', 'text-bad'), (r'text-red-500', 'text-bad'), (r'text-red-700', 'text-bad'),
    (r'text-green-600', 'text-good'), (r'text-green-700', 'text-good'), (r'text-green-500', 'text-good'),
    (r'text-yellow-600', 'text-warn'), (r'text-amber-600', 'text-warn'),
    (r'bg-red-600', 'bg-bad'), (r'bg-red-500', 'bg-bad'), (r'bg-green-600', 'bg-good'), (r'bg-green-500', 'bg-good'),
    (r'border-red-200', 'border-bad'), (r'border-red-300', 'border-bad'), (r'border-red-500', 'border-bad'),
    (r'hover:bg-gray-50', 'hover:bg-panel2'), (r'hover:bg-gray-100', 'hover:bg-panel2'), (r'hover:bg-gray-200', 'hover:bg-panel3'),
    (r'hover:bg-slate-50', 'hover:bg-panel2'), (r'hover:bg-slate-100', 'hover:bg-panel2'),
    (r'hover:text-gray-700', 'hover:text-text'), (r'hover:text-gray-900', 'hover:text-text'), (r'hover:text-gray-600', 'hover:text-text'),
    (r'shadow-lg', 'shadow-rr-lg'), (r'shadow-xl', 'shadow-rr-lg'), (r'shadow-2xl', 'shadow-rr-lg'), (r'shadow-md', 'shadow-rr'),
]
TW_RES = []
for a, b in TW:
    # match the class token, optionally with a variant prefix already included in `a`
    TW_RES.append((re.compile(r'(?<![\w\-:/])' + re.escape(a) + r'(?![\w\-/])'), b))
# also allow variant prefixes like hover:/focus:/md: in front of plain mappings
TW_VARIANT_RE = None

CLASS_RE = re.compile(r"(className\s*=\s*)(\{?`[^`]*`\}?|\"[^\"]*\"|'[^']*'|\{[^}]*\})", re.S)

def tw_sub(chunk):
    for rx, b in TW_RES:
        chunk = rx.sub(b, chunk)
    return chunk

def shadow_sub(m):
    v = m.group(3)
    if 'inset' in v:
        return m.group(0)
    big = any(int(x) >= 20 for x in re.findall(r"(\d+)px", v))
    token = 'var(--rr-shadow-lg)' if big else 'var(--rr-shadow)'
    return f"{m.group(1)}{m.group(2)}{token}{m.group(2)}"

def process(text):
    text = OBJ_RE.sub(lambda m: m.group(1) + m.group(2) + m.group(3) + map_value(m.group(1), m.group(4)) + m.group(3), text)
    text = ASSIGN_RE.sub(lambda m: '.style.' + m.group(1) + m.group(2) + m.group(3) + map_value(m.group(1), m.group(4)) + m.group(3), text)
    def tern(m):
        prop = m.group(1)
        body = STR_RE.sub(lambda s: s.group(1) + map_value(prop, s.group(2)) + s.group(1), m.group(3))
        return m.group(1) + m.group(2) + body
    text = TERN_RE.sub(tern, text)
    text = SHADOW_RE.sub(shadow_sub, text)
    text = FONT_RE.sub(lambda m: f"{m.group(1)}{m.group(2)}inherit{m.group(2)}", text)
    text = CLASS_RE.sub(lambda m: m.group(1) + tw_sub(m.group(2)), text)
    return text

changed = 0
for dp, dn, fn in os.walk(ROOT):
    rel = os.path.relpath(dp, ROOT)
    if any(rel.startswith(e) for e in EXCLUDE_DIRS):
        continue
    if rel.startswith('utils') or rel.startswith('types'):
        continue
    for f in fn:
        if not f.endswith(('.tsx', '.ts')) or f in EXCLUDE_FILES:
            continue
        p = os.path.join(dp, f)
        src = open(p, encoding='utf-8').read()
        out = process(src)
        if out != src:
            changed += 1
            if not DRY:
                open(p, 'w', encoding='utf-8', newline='').write(out)
            print('changed', os.path.relpath(p, ROOT))
print('files changed:', changed)
