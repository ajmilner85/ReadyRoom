"""Codemod 6: replace JSX uses of lucide-react icons with the kit <Icon name="..." />.
Only JSX element uses are rewritten (<X size={14} ... />); icons passed as values stay on lucide.
Props pass through (size, color, className, style, strokeWidth, onClick...).
Usage: python scripts/lucide-to-icon.py src"""
import os, re, sys

ROOT = sys.argv[1]
MAP = {
    'X': 'close', 'Trash2': 'trash', 'Trash': 'trash', 'Plus': 'plus', 'ChevronDown': 'chevronDown', 'ChevronUp': 'chevronUp',
    'ChevronLeft': 'chevronLeft', 'ChevronRight': 'chevronRight', 'ChevronsLeft': 'chevronsLeft', 'ChevronsRight': 'chevronsRight',
    'Edit': 'edit', 'Edit2': 'edit', 'Edit3': 'edit', 'Pencil': 'edit', 'Check': 'check', 'Users': 'roster', 'User': 'user',
    'AlertCircle': 'alertCircle', 'AlertTriangle': 'alertTriangle', 'Settings': 'settings', 'HelpCircle': 'help',
    'GripVertical': 'grip', 'BookOpen': 'bookOpen', 'Save': 'save', 'FileText': 'dossier', 'Wrench': 'wrench', 'Upload': 'upload',
    'Shield': 'shield', 'RefreshCw': 'refresh', 'Minus': 'minus', 'Medal': 'award', 'Award': 'award', 'GraduationCap': 'training',
    'Filter': 'filter', 'EyeOff': 'eyeOff', 'Eye': 'eye', 'Clock': 'clock', 'CheckCircle2': 'checkCircle', 'CheckCircle': 'checkCircle',
    'Calendar': 'events', 'ThumbsDown': 'thumbsDown', 'ThumbsUp': 'thumbsUp', 'ArrowUpDown': 'arrowUpDown', 'UserSearch': 'userSearch',
    'Skull': 'skull', 'Server': 'server', 'Search': 'search', 'Home': 'home', 'Flame': 'flame', 'ExternalLink': 'externalLink',
    'Download': 'download', 'UserCheck': 'userCheck', 'Star': 'star', 'Send': 'send', 'Radio': 'radio', 'MessageCircleOff': 'messageOff',
    'LogOut': 'logOut', 'Lock': 'lock', 'Info': 'info', 'Image': 'image', 'Crosshair': 'crosshair', 'Copy': 'copy', 'Code': 'code',
    'ClipboardCheck': 'clipboardCheck', 'ClipboardList': 'clipboard', 'BookUser': 'dossier', 'Bell': 'bell', 'BarChart3': 'reports',
    'BarChart': 'reports', 'Archive': 'archive', 'Sun': 'sun', 'Moon': 'moon', 'RotateCcw': 'reset', 'Notebook': 'kneeboard',
    'Network': 'orgStructure', 'MinusCircle': 'minusCircle', 'MessageSquare': 'message', 'Merge': 'merge', 'Menu': 'menu', 'Mail': 'mail',
    'List': 'list', 'Link2': 'link', 'Link': 'link', 'Layers': 'layers', 'Key': 'key', 'FlaskConical': 'flask', 'FileUp': 'fileUp',
    'FileDown': 'fileDown', 'FileBarChart': 'reports', 'Database': 'database', 'Crown': 'crown', 'CornerDownRight': 'cornerDownRight',
    'BookmarkPlus': 'bookmarkPlus', 'Briefcase': 'briefcase', 'ArrowRight': 'arrowRight', 'ArrowLeft': 'arrowLeft', 'Anchor': 'anchor',
    'Activity': 'activity', 'Tablet': 'tablet', 'PaintBucket': 'appearance', 'Layout': 'grid', 'XCircle': 'xCircle', 'UserPlus': 'userPlus',
    'Target': 'target', 'Play': 'play', 'Pause': 'pause', 'MoreHorizontal': 'dots', 'Sliders': 'sliders',
}
IMPORT_RE = re.compile(r"import\s*\{([^}]*)\}\s*from\s*['\"]lucide-react['\"];?\n")

def primitives_path(file_path):
    target = os.path.join(ROOT, 'components', 'ui', 'primitives')
    rel = os.path.relpath(target, os.path.dirname(file_path)).replace(os.sep, '/')
    return rel if rel.startswith('.') else './' + rel

changed = 0
for dp, dn, fn in os.walk(ROOT):
    if any(k in dp for k in ('kneeboard', 'primitives')):
        continue
    for f in fn:
        if not f.endswith('.tsx'):
            continue
        p = os.path.join(dp, f)
        s = open(p, encoding='utf-8').read()
        m = IMPORT_RE.search(s)
        if not m:
            continue
        specs = [x.strip() for x in m.group(1).split(',') if x.strip()]
        keep = []
        body = s[:m.start()] + s[m.end():]
        used_icon = False
        for spec in specs:
            parts = re.split(r'\s+as\s+', spec)
            orig, local = parts[0], parts[-1]
            if orig not in MAP:
                keep.append(spec)
                continue
            new_body, n = re.subn(r'<' + re.escape(local) + r'(?=[\s/>])', '<Icon name="%s"' % MAP[orig], body)
            if n:
                used_icon = True
                body = new_body
            # still referenced as a value (not JSX)? keep the import
            if re.search(r'(?<![\w<."\'])' + re.escape(local) + r'(?![\w"])', body):
                keep.append(spec)
        imp = ("import { %s } from 'lucide-react';\n" % ', '.join(keep)) if keep else ''
        if used_icon and not re.search(r"import\s*\{[^}]*\bIcon\b[^}]*\}\s*from\s*['\"][^'\"]*primitives", body):
            imp += "import { Icon } from '%s';\n" % primitives_path(p)
        out = body[:m.start()] + imp + body[m.start():]
        if out != s:
            open(p, 'w', encoding='utf-8', newline='').write(out)
            changed += 1
print('files changed:', changed)
