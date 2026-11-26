"""The brown shirts who ride the brakes of a towed Hornet: seated in its cockpit, canopy open, the hands resting in
the lap, the head free to look round (BRAKE-RIDER.md, next to crew-test's install.ps1).

    python -I rider_pose.py <out folder> [--dcs <DCS World folder>]     the files, into <out>/ (the mod's
                                                                        animations/typeV): five still poses, the
                                                                        plain one, and the blend space over the five
    python -I rider_pose.py --report [--dcs ...]                        where the hands land in every pose, the joints
    python -I rider_pose.py --measure [--dcs ...]                       the cockpit as fa-18c.edm has it (the numbers
                                                                        of POSE below), and the check of the figure's
                                                                        seat: the pilot's left hand on the throttle
    python -I rider_pose.py --check <folder> [--dcs ...]                the made poses as DCS's own Assimp reads them,
                                                                        and mixed half way two by two as the blend
                                                                        space mixes them: where the hands are then
    python -I rider_pose.py --svg <file.svg> [pose] [--dcs ...]         the solved skeleton from the jet's left and
                                                                        from above, over the cockpit's own lines

WHAT IT STARTS FROM. The same clip as the drivers' head (driver_head.py): the F/A-18C pilot figure's look-round clip,
F18_39_Look_LR.fbx, the seated pilot whose pose was made for THIS cockpit. The model's connector `seat_pilot`
(fa-18c.edm: 3.640 m ahead of the jet's own position, 0.425 m up, on the centre line, square to the jet) is where DCS
puts that figure; the figure's own origin is its pelvis bone. Checked against the model: the pilot's left hand closes
round the throttle (the connector THROTTLE_HANDLE) within 5 cm, the same 0.313 m left of the centre line (--measure).

WHAT IS CHANGED. Only the arms: the legs stay on the rudder pedals (a brake rider has his feet on the brakes, which are
the pedals' tops), the torso is the pilot's. POSE['hold'] says where the hands go:
  'lap'   (used) each hand rests palm down on the top of its thigh, LAP_ALONG of the way from hip to knee: the user,
          2026-11-25: "the towel rack is attached to the part of the canopy that raises when opening, so they can't put
          their hands there. They can just rest their hands in their lap for now instead".
  'arch'  (the first version, kept) both hands round the windscreen's fixed arch, where grab handles would be.
The solver is driver_pose.py's: a limb is two bones and a hinge; the hand is laid on what it holds and turned about the
direction across its palm until it is as nearly in line with the forearm as can be; the twist bones as the figure's own
clips set them. The fingers are left as the pilot's (curled: round the throttle and the stick), lying over the thigh.

THE HEAD. As the drivers': five head poses (100 and 50 degrees left, ahead, 50 and 100 right) from the same frames
of the source clip, here with the arms solved for each (the torso turns with the head, the hands stay where they rest),
and a blend space over them on the same parameter, "catcc_head_yaw", which the native module turns smoothly
(crewtest_head.lua decides where he looks).

All positions in POSE are in the JET's frame, metres: fwd ahead of its own position, up above it (the static's
position is 1.856 m above the deck it stands on), right of its centre line.
"""
import math
import os
import struct
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import driver_head as dh  # noqa: E402
import driver_pose as dp  # noqa: E402

JET = r'CoreMods\aircraft\FA-18C\Shapes\fa-18c.edm'
AXIS = dh.AXIS                     # the parameter the native module turns (the drivers' own)
SPACE = 'catcc_bs_rdr_look'
SEAT = 'catcc_rdr_seat'            # the plain pose (head ahead): played when the head does not turn
POSES = [(-100.0, 'catcc_rdr_look_l100'), (-50.0, 'catcc_rdr_look_l050'), (0.0, 'catcc_rdr_look_c000'),
         (50.0, 'catcc_rdr_look_r050'), (100.0, 'catcc_rdr_look_r100')]

# ---------------------------------------------------------------- the settings (nudge these after a DCS run)
POSE = {
    # where the figure's pelvis bone is put: fa-18c.edm's connector seat_pilot (the hook's COCKPIT.seat: the same numbers)
    'seat': {'fwd': 3.640, 'up': 0.425, 'right': 0.0},
    # WHERE THE HANDS GO: 'lap' (the user, 2026-11-25: "the towel rack is attached to the part of the canopy that raises
    # when opening, so they can't put their hands there. They can just rest their hands in their lap for now instead"),
    # or 'arch' (the fixed windscreen arch: the first version; kept, not used)
    'hold': 'lap',
    # THE LAP: each hand rests on the top of its thigh, palm down, this share of the way from the hip to the knee, the
    # palm this far above the thigh bone's line (the thigh's half thickness, estimated: the mesh cannot be read)
    'lap_along': 0.62, 'lap_up': 0.085,
    # THE WINDSCREEN'S ARCH, measured from fa-18c.edm (--measure; a test compares): its rear edge (fwd), its inner
    # (lower) edge at the hands (up), and its slope there (degrees down from level, going outwards)
    'arch': {'fwd': 4.066, 'up': 1.159, 'slope': 32.0},
    'hands': 0.220,                  # each hand this far either side of the centre line
    'below': 0.025,                  # the bar's middle in the hand: this far below the arch's inner edge ...
    'behind': 0.020,                 # ... and behind its rear edge
    'elbow_out': 0.15,               # elbows: down, and this much outwards (0: straight down; 1: 45 degrees out; more bends the wrists further)
    'lean': 0.0,                     # degrees the torso comes forward of the pilot's (on the arch: 4, he leans to it; in the lap: none)
    # THE FIGURE (estimated, as for the drivers: driver_pose.py's)
    'grip': (0.090, 0.032),
    'reach': 0.985,
}

ARM = dp.ARM
add, sub, dot, cross, unit, mul, mulv, transpose = dh.add, dh.sub, dh.dot, dh.cross, dh.unit, dh.mul, dh.mulv, dh.transpose
scale, norm, col, cols, about, angle = dp.scale, dp.norm, dp.col, dp.cols, dp.about, dp.angle
LIMITS = {'elbow': (0, 145), 'wrist': (0, 60)}


def to_figure(fig, P, fwd, up, right):
    """a place in the jet's frame -> the figure's space (its pelvis bone at the seat)"""
    s = P['seat']
    return add(add(scale(fig.fwd, fwd - s['fwd']), scale(fig.up, up - s['up'])), scale(fig.right, right - s['right']))


def to_jet(fig, P, p):
    s = P['seat']
    return (dot(p, fig.fwd) + s['fwd'], dot(p, fig.up) + s['up'], dot(p, fig.right) + s['right'])


def bar(fig, P, side, rig=None):
    """what the hand holds (the figure's space): the place in the hand, and the direction across the palm (for the
    right hand its +Z, for the left its -Z); side +1 right, -1 left. On the arch: the grab handle, the direction turned
    upwards (towards the middle of the arch). In the lap: the top of the thigh, palm down (the hands' Z both to the left)"""
    if P['hold'] == 'lap':
        s = 'R' if side > 0 else 'L'
        hip, knee = rig.world(rig.id(s + '_Thigh'))[1], rig.world(rig.id(s + '_Calf'))[1]
        on = add(add(hip, scale(sub(knee, hip), P['lap_along'])), scale(fig.up, P['lap_up']))
        return on, scale(fig.right, -side)
    a = P['arch']
    t = math.radians(a['slope'])
    centre = to_figure(fig, P, a['fwd'] - P['behind'], a['up'] - P['below'], side * P['hands'])
    along = add(scale(fig.up, math.sin(t)), scale(fig.right, -side * math.cos(t)))
    return centre, along


def solve(clip, frame_of, P=POSE, fig=None):
    """the pose's arm bones (and torso) keyed anew: (over, info) as driver_pose.solve gives them"""
    fig = fig or dh.Figure(clip)
    rig = dp.Rig(clip, frame_of)
    before = dp.Rig(clip, frame_of)
    info = {'joints': {}, 'miss': {}, 'short': {}, 'angles': {}, 'targets': {}}
    if P['lean']:
        for name in ('Spine', 'Spine1', 'Spine2'):
            b = rig.id(name)
            rig.turn(b, mul(about(fig.right, -P['lean'] / 3.0), rig.world(b)[0]))
        b = rig.id('Neck')
        rig.turn(b, before.world(b)[0])
    gx, gy = P['grip']
    for s in 'LR':
        upper, fore, hand = (rig.id('%s_%s' % (s, n)) for n in ARM)
        tw, tw1 = rig.id(s + 'UpArmTwist'), rig.id(s + 'UpArmTwist1')
        ft, ft1 = rig.id(s + '_ForeTwist'), rig.id(s + '_ForeTwist1')
        l1, l2 = norm(rig.lt(fore)), norm(rig.lt(hand))
        side = 1.0 if s == 'R' else -1.0
        outward = scale(fig.right, side)
        centre, along = bar(fig, P, side, rig)
        hz = along if s == 'R' else scale(along, -1.0)        # (the thumb up the bar: +Z on the right hand, -Z on the left)
        shoulder = rig.world(upper)[1]
        pole = add(scale(fig.up, -1.0), scale(outward, P['elbow_out']))
        par = clip.parent[upper]
        pm0 = before.world(par)[0]
        twist0 = mul(transpose(pm0), mul(before.world(upper)[0], dh.euler(before.lr(tw))))
        fdir = unit(sub(centre, shoulder))
        for _ in range(12):
            hx = unit(sub(fdir, scale(hz, dot(fdir, hz))))
            hy = cross(hz, hx)
            wrist = sub(centre, add(scale(hx, gx), scale(hy, gy)))
            elbow, got, short = dp.two_bone(shoulder, wrist, l1, l2, pole, P['reach'])
            fdir = unit(sub(got, elbow))
        dp.hinge(rig, upper, fore, shoulder, elbow, got, pole)
        rig.turn(hand, cols(hx, hy, hz))
        pm = rig.world(par)[0]
        new = mul(transpose(pm), rig.world(upper)[0])
        kept = mul(dp.swing(col(twist0, 0), col(new, 0)), twist0)
        roll = dp.twist_x(mul(transpose(new), kept))
        rig.key(tw, (roll, 0.0, 0.0))
        rig.key(tw1, (-roll / 2.0, 0.0, 0.0))
        third = (dp.twist_x(dh.euler(rig.lr(hand))) + (90.0 if s == 'L' else -90.0)) / 3.0
        third = third - 120.0 if third > 60.0 else (third + 120.0 if third < -60.0 else third)
        rig.key(ft, (third, 0.0, 0.0))
        rig.key(ft1, (third, 0.0, 0.0))
        limb = s + ' arm'
        info['targets'][limb] = to_jet(fig, P, wrist)
        info['targets'][s + ' bar'] = to_jet(fig, P, centre)
        info['short'][limb] = short
        info['angles'][limb] = {'elbow': -rig.lr(fore)[2], 'wrist': angle(col(rig.world(fore)[0], 0), hx)}
    for s in 'LR':
        a, b, c = (rig.id('%s_%s' % (s, n)) for n in ARM)
        info['joints'][s + ' arm'] = [to_jet(fig, P, rig.world(x)[1]) for x in (a, b, c)]
        info['miss'][s + ' arm'] = norm(sub(info['joints'][s + ' arm'][2], info['targets'][s + ' arm']))
        m, t = rig.world(rig.id(s + '_Hand'))
        grip = add(t, add(scale(col(m, 0), gx), scale(col(m, 1), gy)))
        info['joints'][s + ' grip'] = to_jet(fig, P, grip)
        info['miss'][s + ' bar'] = norm(sub(info['joints'][s + ' grip'], info['targets'][s + ' bar']))
        info['joints'][s + ' arm before'] = [to_jet(fig, P, before.world(before.id('%s_%s' % (s, n)))[1]) for n in ARM]
    spine = [rig.id(n) for n in ('Pelvis', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'HeadNub')]
    info['joints']['spine'] = [to_jet(fig, P, rig.world(b)[1]) for b in spine]
    info['joints']['spine before'] = [to_jet(fig, P, before.world(b)[1]) for b in spine]
    for s in 'LR':
        info['joints'][s + ' leg'] = [to_jet(fig, P, rig.world(rig.id('%s_%s' % (s, n)))[1]) for n in ('Thigh', 'Calf', 'Foot', 'Toe0')]
    head = rig.id('Head')
    info['head'] = max(abs(a - b) for ra, rb in zip(rig.world(head)[0], before.world(head)[0]) for a, b in zip(ra, rb))
    return rig.over, info


def out_of_limits(info):
    bad = []
    for limb, angles in info['angles'].items():
        for name, v in angles.items():
            lim = LIMITS.get(name)
            if lim and not (lim[0] - 1e-6 <= v <= lim[1] + 1e-6):
                bad.append('%s %s %.1f (allowed %d .. %d)' % (limb, name, v, lim[0], lim[1]))
    return bad


# ---------------------------------------------------------------- what is made
def poses(src):
    """(name, axis value or None, a clip, the frames of its pose): the plain pose and the five head poses"""
    out = []
    for x, name in [(None, SEAT)] + POSES:
        clip = dh.Clip(src)
        _fig, _right_end, _k, pose = dh.plan(clip)
        out.append((name, x, clip, pose(0.0 if x is None else x)))
    return out


def space_lua():
    lines = ['-- CATCC: the brake riders\' head (made by catcc-dcs/deck-test/crew-test/model/rider_pose.py; BRAKE-RIDER.md).',
             '-- A blend space as animator.dll reads one: named after this file, one axis, a still pose at each value.',
             '-- The parameter "%s": degrees, + to the rider\'s right (the drivers\' own parameter).' % AXIS,
             'return {',
             "\ttype = '1D',",
             "\tx_axis = { name = '%s', default_value = 0 }," % AXIS]
    for x, name in POSES:
        lines.append("\t{ x = %d, animation = '%s' }," % (x, name))
    lines.append('}')
    return '\n'.join(lines) + '\n'


def lines_of(name, info):
    out = []
    for s in 'LR':
        limb = s + ' arm'
        j = info['joints'][limb]
        a = info['angles'][limb]
        out.append('%s: %s: wrist at fwd %.3f up %.3f right %+.3f, %.1f cm from where it was to be%s; elbow %.1f, wrist %.1f degrees' % (
            name, limb, j[2][0], j[2][1], j[2][2], info['miss'][limb] * 100,
            ' (OUT OF REACH by %.1f cm: stopped short)' % (info['short'][limb] * 100) if info['short'][limb] > 0 else '', a['elbow'], a['wrist']))
    bad = out_of_limits(info)
    out.append('%s: the grips are %.1f cm (left) and %.1f cm (right) from where they rest; the head is turned %s; joints: %s' % (
        name, info['miss']['L bar'] * 100, info['miss']['R bar'] * 100, 'as it was' if info['head'] < 1e-9 else 'DIFFERENTLY (%.2g)' % info['head'],
        'all within what a man can do' if not bad else 'BEYOND: ' + ', '.join(bad)))
    return out


def report(src, P=POSE):
    out = []
    for name, _x, clip, frame_of in poses(src):
        _over, info = solve(clip, frame_of, P)
        if not out:
            for s in 'LR':
                t = info['targets'][s + ' bar']
                out.append('target: the %s hand rests at fwd %.3f up %.3f right %+.3f of the jet' % ('left' if s == 'L' else 'right', t[0], t[1], t[2]))
        out.extend(lines_of(name, info))
    return '\n'.join(out)


def make(src, out_dir, P=POSE):
    os.makedirs(os.path.join(out_dir, 'blend_space'), exist_ok=True)
    made = []
    for name, _x, clip, frame_of in poses(src):
        over, info = solve(clip, frame_of, P)
        bad = out_of_limits(info)
        if bad or max(info['short'].values()) > 0.02:
            raise ValueError('%s: not made: %s' % (name, ', '.join(bad) or 'a hand short of where it rests'))
        data = dh.still(clip, frame_of, over)
        path = os.path.join(out_dir, name + '.fbx')
        with open(path, 'wb') as f:
            f.write(data)
        if dh.Clip(path).frames != dh.KEYS:
            raise ValueError('%s: not read back as a still pose' % path)
        made.append('%s.fbx (%d bytes)' % (name, len(data)))
    with open(os.path.join(out_dir, 'blend_space', SPACE + '.lua'), 'w', encoding='utf-8', newline='\n') as f:
        f.write(space_lua())
    made.append('blend_space/%s.lua' % SPACE)
    return made


# ---------------------------------------------------------------- the made clips as DCS's Assimp reads them
def grips_of(clip, fig, world, P):
    gx, gy = P['grip']
    out = []
    for s in 'LR':
        m, t = world(clip.bones['typeV_%s_Hand' % s])
        out.append(to_jet(fig, P, add(t, add(scale(col(m, 0), gx), scale(col(m, 1), gy)))))
    return out


def check(folder, dcs, src, P=POSE):
    """Each made pose as DCS's own Assimp reads it: where its grips are against where the hands rest; then the five head poses
    mixed half way, two by two, as the blend space mixes them (and how near to opposite any bone's two turns are).
    Lines."""
    clip = dh.Clip(src)
    fig = dh.Figure(clip)
    target = None
    out, read = [], {}
    for name, _x, _c, _f in poses(src):
        got = dh.assimp(os.path.join(folder, name + '.fbx'), dcs, every=True)
        if isinstance(got, str):
            return got
        read[name] = got
        if target is None:
            _o, info = solve(_c, _f, P)
            target = (info['targets']['L bar'], info['targets']['R bar'])
        g = grips_of(clip, fig, dp.quat_world(clip, got), P)
        out.append('%s.fbx: Assimp: %d bones; the grips %.1f cm (left) and %.1f cm (right) from where they rest' % (
            name, len(got), norm(sub(g[0], target[0])) * 100, norm(sub(g[1], target[1])) * 100))
    for (_xa, na), (_xb, nb) in zip(POSES, POSES[1:]):
        a, b = read[na], read[nb]
        least, which, mixed = 1.0, '', {}
        for bone in a:
            (pa, qa), (pb, qb) = a[bone], b[bone]
            d = sum(u * v for u, v in zip(qa, qb))
            if d < least:
                least, which = d, bone
            mixed[bone] = (tuple((u + v) / 2 for u, v in zip(pa, pb)), tuple((u + v) / 2 for u, v in zip(qa, qb)))
        g = grips_of(clip, fig, dp.quat_world(clip, mixed), P)
        out.append('%s .. %s: the turns nearest opposite: %s (%.3f; 1 = the same, below 0 = opposite); half way: the grips %.1f cm (left) and %.1f cm (right) from where they rest' % (
            na[-4:], nb[-4:], which, least, norm(sub(g[0], target[0])) * 100, norm(sub(g[1], target[1])) * 100))
    return '\n'.join(out)


# ---------------------------------------------------------------- the jet's model (fa-18c.edm), read only
def jet_model(dcs, canopy=0.0):
    """(connectors {name: (x, y, z)}, the cockpit's render points [(render node name, node name, (x, y, z))]) of the
    first level of detail, in the jet's frame (x ahead, y up, z to the right); canopy: the value of argument 38 (the
    canopy) the moving parts are put at"""
    import edm
    data = open(os.path.join(dcs, JET), 'rb').read()
    r = edm.R(data)
    if r.take(3) != b'EDM' or struct.unpack('<H', r.take(2))[0] != 10:
        raise ValueError('not a version 10 EDM file')
    table = r.take(r.u32())
    r.strings = [x.decode('cp1251') for x in table.split(b'\0')]
    for _ in range(2):
        for _ in range(r.u32()):
            r.s(), r.u32()
    edm._node(r, r.s())
    nodes = [edm._node(r, r.s()) for _ in range(r.u32())]
    parents = [r.i32() for _ in range(len(nodes))]
    items = {}
    # (the file's later lists hold node kinds edm.py does not read (FakeOmniLightsNode): those come after the
    # connectors and the render nodes, which are all that is needed here)
    try:
        for _ in range(r.u32()):
            k = r.s()
            lst = items.setdefault(k, [])
            for _ in range(r.u32()):
                lst.append(edm._node(r, r.s()))
    except ValueError:
        pass

    def mm(a, b):
        return [sum(a[i * 4 + k] * b[k * 4 + j] for k in range(4)) for i in range(4) for j in range(4)]

    def quat(q):
        x, y, z, w = q
        return [1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w), 0, 2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w), 0,
                2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y), 0, 0, 0, 0, 1]

    def local(n):
        if 'matrix' in n:
            return n['matrix']
        if 'base' not in n:
            return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
        b = n['base']
        m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
        for arg, keys in n.get('rot', []):
            k = min(keys, key=lambda k: abs(k[0] - (canopy if arg == 38 else 0.0)))
            m = mm(m, quat(k[1:5]))
        m = mm(m, quat(b['quat1']))
        p = b['position']
        m = mm(m, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, p[0], p[1], p[2], 1])
        return mm(m, b['matrix'])

    memo = {}

    def world(i):
        if i not in memo:
            m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
            j = i
            while j >= 0:
                m = mm(m, local(nodes[j]))
                j = parents[j]
            memo[i] = m
        return memo[i]

    def pt(m, p):
        return tuple(p[0] * m[c] + p[1] * m[4 + c] + p[2] * m[8 + c] + m[12 + c] for c in range(3))

    conns = {}
    for n in items.get('CONNECTORS', []):
        conns[n['name']] = pt(world(n['parent']), (0.0, 0.0, 0.0))
    pts = []
    for n in items.get('RENDER_NODES', []):
        par = n.get('parents') or []
        st, cnt = n['vtx']['stride'], n['vtx']['count']
        v = struct.unpack('<%df' % (st * cnt), n['vtx']['data'])
        idx = struct.unpack('<%d%s' % (n['idx']['count'], 'BHI'[n['idx']['type']]), n['idx']['data'])
        segs, start = [], 0
        if len(par) == 1 and len(par[0]) == 2:
            segs = [(par[0][0], 0, len(idx))]
        else:
            for p in par:
                segs.append((p[0], start, p[1]))
                start = p[1]
        for node, a, b in segs:
            m = world(node)
            name = n['name'] or nodes[node]['name']
            for u in set(idx[a:b]):
                p = pt(m, v[u * st:u * st + 3])
                if 1.5 < p[0] < 5.5 and p[1] > 0.3 and abs(p[2]) < 0.7:     # (the cockpit only)
                    pts.append((name, nodes[node]['name'], p))
    return conns, pts


def measure(dcs, P=POSE):
    """the numbers POSE holds, as the model has them"""
    conns, pts = jet_model(dcs)
    out = {'seat': conns.get('seat_pilot'), 'throttle': conns.get('THROTTLE_HANDLE')}
    # the windscreen's frame: not glass, not the canopy (Dummy198), its rear edge 4.0 .. 4.3 m ahead, above the HUD
    frame = [p for name, node, p in pts if 'Glass' not in name and node != 'Dummy198' and 4.0 < p[0] < 4.35 and p[1] > 1.1]
    z = P['hands']
    near = [p for p in frame if abs(abs(p[2]) - z) < 0.015]
    out['arch'] = {'fwd': min(p[0] for p in near), 'up': min(p[1] for p in near)}

    def top(zc):
        sel = [p for p in frame if abs(abs(p[2]) - zc) < 0.012]
        return max(p[1] for p in sel)
    out['arch']['slope'] = math.degrees(math.atan2(top(z - 0.03) - top(z + 0.03), 0.06))
    # the canopy's own frame, open (argument 38 at 0.9, as the jet's own mechanism opens it)
    _c, open_pts = jet_model(dcs, 0.9)
    bow = [p for name, node, p in open_pts if node == 'Cockpit_part003' or name == 'Cockpit_part003']
    out['canopy open'] = (min(p[1] for p in bow), max(p[1] for p in bow)) if bow else None
    return out


def measure_lines(dcs, P=POSE):
    m = measure(dcs, P)
    s, a = m['seat'], m['arch']
    out = ['seat_pilot (the figure\'s pelvis bone): fwd %.3f up %.3f right %+.3f' % s,
           'the windscreen\'s arch %.2f m either side of the centre line: rear edge fwd %.3f, inner edge up %.3f; it slopes %.0f degrees down outwards' % (P['hands'], a['fwd'], a['up'], a['slope'])]
    if m['canopy open']:
        out.append('the canopy\'s frame, open: %.2f .. %.2f m up (the seated figure\'s shoulders are 0.91 m up: out of reach)' % m['canopy open'])
    src = os.path.join(dcs, dh.SOURCE)
    if os.path.isfile(src) and m['throttle']:
        clip = dh.Clip(src)
        fig = dh.Figure(clip)
        rig = dp.Rig(clip, lambda _b: fig.mid)
        mm, t = rig.world(rig.id('L_Hand'))
        g = add(t, add(scale(col(mm, 0), POSE['grip'][0]), scale(col(mm, 1), POSE['grip'][1])))
        g = to_jet(fig, dict(P, seat={'fwd': s[0], 'up': s[1], 'right': s[2]}), g)
        out.append('the pilot\'s left hand, the figure put at seat_pilot: fwd %.3f up %.3f right %+.3f; the throttle (THROTTLE_HANDLE) fwd %.3f up %.3f right %+.3f: %.1f cm apart' % (
            g[0], g[1], g[2], m['throttle'][0], m['throttle'][1], m['throttle'][2], norm(sub(g, m['throttle'])) * 100))
    bad = []
    for name, got, want in (('seat fwd', s[0], P['seat']['fwd']), ('seat up', s[1], P['seat']['up']), ('seat right', s[2], P['seat']['right']),
                            ('arch fwd', a['fwd'], P['arch']['fwd']), ('arch up', a['up'], P['arch']['up'])):
        if abs(got - want) > 0.0105:
            bad.append('%s %.3f (POSE: %.3f)' % (name, got, want))
    if abs(a['slope'] - P['arch']['slope']) > 5:
        bad.append('arch slope %.0f (POSE: %.0f)' % (a['slope'], P['arch']['slope']))
    out.append('the cockpit as POSE has it against fa-18c.edm: %s' % ('all within a centimetre' if not bad else 'DIFFERENT: ' + '; '.join(bad)))
    return '\n'.join(out)


# ---------------------------------------------------------------- the drawing
def svg(src, dcs, P=POSE, which=SEAT):
    """the solved pose from the jet's left (ahead to the left) and from above, over the cockpit's points"""
    for name, _x, clip, frame_of in poses(src):
        if name == which:
            _over, info = solve(clip, frame_of, P)
            break
    try:
        _c, pts = jet_model(dcs, 0.9)
    except (OSError, ValueError):
        pts = []
    K = 500.0
    x_hi, x_lo, y_hi, y_lo = 4.9, 2.9, 1.9, 0.0
    W, H1 = (x_hi - x_lo) * K, (y_hi - y_lo) * K
    H2 = 1.2 * K
    o = ['<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d" font-family="sans-serif" font-size="13">' % (W, H1 + H2 + 40, W, H1 + H2 + 40),
         '<rect width="100%" height="100%" fill="#f4f4f1"/>']

    def side(p):
        return ((x_hi - p[0]) * K, (y_hi - p[1]) * K)

    def top(p):
        return ((x_hi - p[0]) * K, H1 + 40 + (0.6 - p[2]) * K)

    for _name, node, p in pts:
        if x_lo < p[0] < x_hi:
            for view, keep in ((side, abs(p[2]) < 0.25), (top, p[1] > 0.9)):
                if keep:
                    q = view(p)
                    o.append('<circle cx="%.1f" cy="%.1f" r="0.7" fill="%s"/>' % (q[0], q[1], '#7a8aa0' if node == 'Dummy198' else '#999'))

    def path(view, ps, colour, width, opacity=1.0):
        d = ' '.join('%s%.1f %.1f' % ('M' if i == 0 else 'L', *view(p)) for i, p in enumerate(ps))
        o.append('<path d="%s" fill="none" stroke="%s" stroke-width="%.1f" stroke-linecap="round" stroke-linejoin="round" opacity="%.2f"/>' % (d, colour, width, opacity))

    j = info['joints']
    for view in (side, top):
        path(view, j['spine before'], '#999', 5.0, 0.6)
        path(view, j['spine'], '#5a3a1a', 7.0)
        for s, colour in (('L', '#ff70e0'), ('R', '#ff7a10')):
            path(view, j[s + ' arm before'], '#999', 5.0, 0.6)
            path(view, j[s + ' arm'] + [j[s + ' grip']], colour, 6.0)
            path(view, j[s + ' leg'], '#5a3a1a', 6.0, 0.7)
            t = info['targets'][s + ' bar']
            q = view(t)
            o.append('<circle cx="%.1f" cy="%.1f" r="5" fill="none" stroke="#0a6cff" stroke-width="2"/>' % q)
        hp, hn = j['spine'][5], j['spine'][6]
        o.append('<circle cx="%.1f" cy="%.1f" r="%.1f" fill="none" stroke="#5a3a1a" stroke-width="3"/>' % (*view(tuple((a + b) / 2 for a, b in zip(hp, hn))), 0.115 * K))
    o.append('<text x="12" y="20">%s: from the jet\'s left (ahead is to the left); the canopy open (blue-grey). Grey: the pilot\'s pose. Blue rings: where the hands rest.</text>' % which)
    o.append('<text x="12" y="%d">from above (the jet\'s left is down)</text>' % (H1 + 30))
    o.append('</svg>')
    return '\n'.join(o) + '\n'


def main(argv):
    dcs = dh.DCS
    if '--dcs' in argv:
        i = argv.index('--dcs')
        dcs = argv[i + 1]
        del argv[i:i + 2]
    src = os.path.join(dcs, dh.SOURCE)
    if not os.path.isfile(src):
        print('brake rider pose: not made: the source clip is not there: %s' % src)
        return 2
    if argv and argv[0] == '--report':
        print(report(src))
        return 0
    if argv and argv[0] == '--measure':
        print(measure_lines(dcs))
        return 0
    if argv and argv[0] == '--check':
        print(check(argv[1], dcs, src))
        return 0
    if argv and argv[0] == '--svg':
        which = argv[2] if len(argv) > 2 else SEAT
        with open(argv[1], 'w', encoding='utf-8', newline='\n') as f:
            f.write(svg(src, dcs, POSE, which))
        print('brake rider pose: drawn: %s (%s)' % (argv[1], which))
        return 0
    if not argv:
        print(__doc__)
        return 1
    try:
        made = make(src, argv[0])
    except ValueError as e:
        print('brake rider pose: %s' % e)
        return 3
    print('brake rider pose: made %s' % ', '.join(made))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
