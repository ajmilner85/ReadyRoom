"""The tractor drivers' limbs: hands on the steering wheel, feet at the pedals (DRIVER-POSE.md, next to crew-test's
install.ps1).

    python -I driver_pose.py <out folder> [--dcs <DCS World folder>]    catcc_drv_seat.fbx into <out>/ (the plain seated
                                                                        pose with the new limbs)
    python -I driver_pose.py --report [--dcs ...]                       the solved limbs of every pose: where hands and
                                                                        feet land, the joints' angles
    python -I driver_pose.py --svg <file.svg> [--dcs ...]               the solved skeleton drawn from the side and from
                                                                        above over the tractor (its model's own lines)
    python -I driver_pose.py --measure [--dcs ...]                      the tractor's cab as its model has it (the numbers
                                                                        of POSE below), from as32-31a.edm
    python -I driver_pose.py --assimp <file.fbx> ... [--dcs ...]        a made pose as DCS's own Assimp reads it: where
                                                                        its hands and feet are then
    python -I driver_pose.py --blend <folder> [--dcs ...]               the five head poses of a folder, mixed as the
                                                                        blend space mixes them: where the hands are
                                                                        between two poses
    python -I driver_head.py <out folder> --pose [--dcs ...]            the five head poses WITH the new limbs

WHAT IT IS. A driver sits in the F/A-18C pilot figure's seated pose: legs out on the rudder pedals, hands at throttle and
stick. Here the pose's leg and arm bones are keyed again so that he sits as a tractor driver does: the left foot flat on
the floor beside the pedals, the right foot on the accelerator, both hands on the steering wheel's rim. It is a pose,
not a mechanism: the bones are solved here, once, and written into still clips that DCS's animation system plays as it
plays any other (as the head poses are: driver_head.py, whose FBX reader and writer this uses). Nothing moves a bone
while DCS runs.

HOW. Each limb is two bones and a hinge (thigh, calf; upper arm, forearm): given where the hip or shoulder is and where
the ankle or wrist must be, the knee or elbow lies on a circle; the one nearest the "pole" direction is taken (knees up,
elbows down and out). The calf and forearm turn about their own Z only, as in DCS's clips (a negative angle bends).
A foot is laid on its surface (the ball of the foot on the floor or the pedal, the toes its way); a hand holds the rim:
the rim runs across the palm (the hand's Z), the hand is turned about the rim until it is in line with the forearm as
nearly as can be, and the wrist put where the rim then lies in the fingers' grip. The fingers are left as they are:
they are curled round the throttle and the stick already. The arm's twist bones are set as the figure's own clips set
them (the upper arm's keeps its roll against the shoulder; the forearm's two take a third each of the hand's turn).

THE TORSO. The pilot sits leaning back (an ejection seat's rake: his neck's base 6 degrees behind upright over his hips)
and his arms are 0.54 m long: from there
the wheel's rim is 0.71 m from his shoulders and cannot be reached. So the three spine bones are brought forward by
POSE['lean'] degrees in all (he then sits 5 degrees forward of upright, hips against the seat back), the neck is turned back by the
same, so that the head keeps exactly the direction the head poses give it, and the collar bones come forward a little.
With lean = 0 and shoulder_fwd = None the torso is the pilot's and the hands stop short of the rim (--report says by how much).

All positions in POSE are in the TRACTOR's frame, metres: fwd ahead of the tractor's own position, left of its centre
line, up from the deck it stands on: the frame of the hook's TOW.seat, which is where the figure's pelvis bone is put
(POSE['seat'] must be the same numbers: a test holds them together). Move the seat and the limbs must be made again.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import driver_head as dh  # noqa: E402

SEAT = 'catcc_drv_seat'        # the plain seated pose with the new limbs (played when the head does not turn)
TRACTOR = r'CoreMods\tech\USS_Nimitz\Shapes\as32-31a.edm'

# ---------------------------------------------------------------- the settings (nudge these after a DCS run)
POSE = {
    # where the hook puts the figure's pelvis bone: crewtest_hook.lua's TOW.seat (the same numbers)
    'seat': {'fwd': -0.40, 'left': 0.58, 'up': 0.65},

    # THE TRACTOR'S CAB, measured from DCS's model as32-31a.edm (--measure prints them; a test compares):
    # the steering wheel: the middle of its rim's circle; the radius of the rim's centre line (the rim is 0.036 thick,
    # 0.183 to its outside); how far its top leans forward of upright. The model's rim ends at 0.91 m up (10 and 2
    # o'clock): there is no rim above that.
    'wheel': {'fwd': 0.171, 'left': 0.581, 'up': 0.840, 'radius': 0.165, 'tilt': 15.5},
    'floor': 0.240,                                  # the cab's floor, up
    # the accelerator (the small pedal right of the steering column): its pad's rear and front edge (fwd, up), its middle (left)
    'accelerator': {'rear': (0.025, 0.270), 'front': (0.194, 0.340), 'left': 0.336},
    # the brake (the wide pedal under the steering column): not used by the pose; here for the drawing and for
    # 'right_foot': 'brake'
    'brake': {'rear': (0.093, 0.338), 'front': (0.253, 0.356), 'left': 0.576},
    # (for the drawing only) the seat cushion's top and front edge, the seat back's face and top, the firewall
    'cushion': {'up': 0.645, 'front': -0.154, 'rear': -0.557}, 'seat_back': {'fwd': -0.512, 'top': 0.895}, 'firewall': 0.276,

    # THE POSE, read off the user's drawing (2026-11-23) and fitted to the cab above:
    'left_hand': 9.0,                                # where on the rim, as a clock face seen from the seat (hours)
    'right_hand': 2.5,
    'left_foot': {'ball': 0.130, 'left': 0.740, 'toe_out': 8.0},      # flat on the floor left of the brake: the ball of the foot (fwd, left); toes out (degrees)
    'right_foot': 'accelerator',                     # or 'brake'
    'right_ball': 0.60,                              # the ball of the right foot: how far along the pedal's pad from its rear edge (0 .. 1)
    'right_toe_out': 10.0,
    'knee_out': 0.05,                                # knees: up, and this much outwards (0: straight up; 1: 45 degrees out)
    'elbow_out': 0.45,                               # elbows: down, and this much outwards
    'lean': 18.0,                                    # degrees the torso is brought forward (see THE TORSO)
    'shoulder_fwd': 18.0,                            # degrees forward of straight sideways both collar bones point (a man reaching for a wheel; the pilot's: left 5 back, right 7 forward). None: left as they are

    # THE FIGURE (estimated: the deck crew's mesh cannot be read):
    'sole': 0.035,                                   # the toe joint above the boot's sole. Feet in the floor: more; floating: less
    'grip': (0.090, 0.032),                          # the rim's middle in the closed hand: ahead of the wrist along the hand, and out of the palm
    'reach': 0.985,                                  # a limb is not stretched further than this share of its length
}

LEG = ('Thigh', 'Calf', 'Foot')
ARM = ('UpperArm', 'Forearm', 'Hand')
LIMBS = (('L leg', 'L', LEG), ('R leg', 'R', LEG), ('L arm', 'L', ARM), ('R arm', 'R', ARM))
# what a joint may do (degrees): a knee and an elbow bend from straight; a wrist from in line with the forearm; an
# ankle from square to the shin (+ toes up); a thigh from the pelvis's own level, and outwards
LIMITS = {'knee': (0, 150), 'elbow': (0, 145), 'wrist': (0, 60), 'ankle': (-45, 25), 'thigh up': (-20, 35), 'thigh out': (-15, 45)}

add, sub, dot, cross, unit, mul, mulv, transpose = dh.add, dh.sub, dh.dot, dh.cross, dh.unit, dh.mul, dh.mulv, dh.transpose


def scale(a, k):
    return (a[0] * k, a[1] * k, a[2] * k)


def norm(a):
    return math.sqrt(dot(a, a))


def cols(x, y, z):
    """the turn whose columns (the bone's own X, Y, Z in the figure's space) are these"""
    return ((x[0], y[0], z[0]), (x[1], y[1], z[1]), (x[2], y[2], z[2]))


def col(m, i):
    return (m[0][i], m[1][i], m[2][i])


def about(axis, deg):
    """the turn of deg degrees about an axis (right-handed)"""
    x, y, z = unit(axis)
    c, s = math.cos(math.radians(deg)), math.sin(math.radians(deg))
    t = 1 - c
    return ((t * x * x + c, t * x * y - s * z, t * x * z + s * y),
            (t * x * y + s * z, t * y * y + c, t * y * z - s * x),
            (t * x * z - s * y, t * y * z + s * x, t * z * z + c))


def euler_of(m):
    """the Lcl Rotation (degrees about X, then Y, then Z: dh.euler's own order) of a turn"""
    sy = max(-1.0, min(1.0, -m[2][0]))
    y = math.asin(sy)
    if abs(sy) > 0.999999:
        return (0.0, math.degrees(y), math.degrees(math.atan2(-m[0][1], m[1][1])))
    return (math.degrees(math.atan2(m[2][1], m[2][2])), math.degrees(y), math.degrees(math.atan2(m[1][0], m[0][0])))


def twist_x(m):
    """how far a turn rolls about its own X (degrees): the rest of it is a swing of that axis"""
    w = math.sqrt(max(0.0, 1 + m[0][0] + m[1][1] + m[2][2])) / 2
    x = math.copysign(math.sqrt(max(0.0, 1 + m[0][0] - m[1][1] - m[2][2])) / 2, m[2][1] - m[1][2])
    a = math.degrees(2 * math.atan2(x, w))
    return a - 360 if a > 180 else (a + 360 if a < -180 else a)


def swing(a, b):
    """the shortest turn that brings the direction a onto b"""
    a, b = unit(a), unit(b)
    axis = cross(a, b)
    s, c = norm(axis), dot(a, b)
    if s < 1e-9:
        return dh.IDENT
    return about(axis, math.degrees(math.atan2(s, c)))


def angle(a, b):
    return math.degrees(math.acos(max(-1.0, min(1.0, dot(unit(a), unit(b))))))


# ---------------------------------------------------------------- the figure in a pose, bones re-keyed
class Rig:
    """a clip's bones at the frames of a pose (frame_of: bone id -> frame), with the turns given to some of them here"""

    def __init__(self, clip, frame_of):
        self.clip, self.frame_of, self.over, self.memo = clip, frame_of, {}, {}

    def id(self, name):
        return self.clip.bones['typeV_' + name]

    def lt(self, bone):
        return tuple(self.clip.local(bone, 'Lcl Translation', self.frame_of))

    def lr(self, bone):
        return self.over[bone] if bone in self.over else tuple(self.clip.local(bone, 'Lcl Rotation', self.frame_of))

    def world(self, bone):
        """(turn, place) of a bone in the figure's space"""
        if bone not in self.memo:
            par = self.clip.parent.get(bone)
            m, t = self.world(par) if par is not None else (dh.IDENT, (0.0, 0.0, 0.0))
            self.memo[bone] = (mul(m, dh.euler(self.lr(bone))), add(t, mulv(m, self.lt(bone))))
        return self.memo[bone]

    def turn(self, bone, world_turn):
        """the bone's own turn is keyed so that it stands like this in the figure's space"""
        par = self.clip.parent.get(bone)
        pm = self.world(par)[0] if par is not None else dh.IDENT
        self.over[bone] = euler_of(mul(transpose(pm), world_turn))
        self.memo = {}

    def key(self, bone, lcl):
        self.over[bone] = tuple(lcl)
        self.memo = {}


def to_figure(fig, P, fwd, left, up):
    """a place in the tractor's frame -> the figure's space (its pelvis bone at the seat)"""
    s = P['seat']
    return add(add(scale(fig.fwd, fwd - s['fwd']), scale(fig.up, up - s['up'])), scale(fig.right, -(left - s['left'])))


def to_tractor(fig, P, p):
    s = P['seat']
    return (dot(p, fig.fwd) + s['fwd'], -dot(p, fig.right) + s['left'], dot(p, fig.up) + s['up'])


def two_bone(a, w, l1, l2, pole, reach):
    """the knee or elbow between a (hip, shoulder) and w (ankle, wrist); w is brought nearer when it is out of reach.
    Returns (joint, w, how far w was brought in)."""
    d = norm(sub(w, a))
    most, least = (l1 + l2) * reach, abs(l1 - l2) + 1e-6
    short = 0.0
    if d > most:
        short, d = d - most, most
    d = max(d, least)
    n = unit(sub(w, a))
    w = add(a, scale(n, d))
    along = (l1 * l1 - l2 * l2 + d * d) / (2 * d)
    h = math.sqrt(max(0.0, l1 * l1 - along * along))
    side = sub(pole, scale(n, dot(pole, n)))
    return add(add(a, scale(n, along)), scale(unit(side), h)), w, short


def hinge(rig, upper, lower, a, e, w, pole):
    """the upper bone's X along a -> e, its Z the hinge's axis; the lower bone bent about its own Z (negative) onto w"""
    x = unit(sub(e, a))
    v = sub(w, e)
    off = sub(v, scale(x, dot(v, x)))
    y = scale(unit(off), -1.0) if norm(off) > 1e-6 else unit(sub(pole, scale(x, dot(pole, x))))
    rig.turn(upper, cols(x, y, cross(x, y)))
    rig.key(lower, (0.0, 0.0, -angle(x, v)))


def wheel_frame(fig, P):
    """the wheel's middle, the direction up along its face, and its axis towards the driver (the figure's space)"""
    w = P['wheel']
    t = math.radians(w['tilt'])
    up = add(scale(fig.fwd, math.sin(t)), scale(fig.up, math.cos(t)))
    axis = add(scale(fig.fwd, -math.cos(t)), scale(fig.up, math.sin(t)))
    return to_figure(fig, P, w['fwd'], w['left'], w['up']), up, axis


def rim(fig, P, hours):
    """the rim's middle at a clock position (seen from the seat), and the rim's own direction there, turned upwards"""
    c, up, _axis = wheel_frame(fig, P)
    a = math.radians(hours * 30.0)
    out = add(scale(up, math.cos(a)), scale(fig.right, math.sin(a)))
    along = add(scale(up, -math.sin(a)), scale(fig.right, math.cos(a)))
    if dot(along, fig.up) < 0:
        along = scale(along, -1.0)
    return add(c, scale(out, P['wheel']['radius'])), along


def pedal(P, name):
    p = P[name]
    (x0, y0), (x1, y1) = p['rear'], p['front']
    return x0, y0, x1, y1, math.degrees(math.atan2(y1 - y0, x1 - x0)), p['left']


def foot_frame(fig, pitch, out):
    """a foot's own X (ankle to sole), Y (to the toes), Z, for toes `pitch` degrees up and `out` degrees to its right"""
    p, q = math.radians(pitch), math.radians(out)
    ahead = add(scale(fig.fwd, math.cos(q)), scale(fig.right, math.sin(q)))
    y = add(scale(ahead, math.cos(p)), scale(fig.up, math.sin(p)))
    x = add(scale(ahead, math.sin(p)), scale(fig.up, -math.cos(p)))
    return x, y, cross(x, y)


def solve(clip, frame_of, P=POSE, fig=None):
    """The pose's bones keyed anew. Returns (over, info): over = {bone id: Lcl Rotation}; info: the joints' places (the
    tractor's frame), how far each hand and foot is from where it was to be, the joints' angles."""
    fig = fig or dh.Figure(clip)
    rig = Rig(clip, frame_of)
    info = {'joints': {}, 'miss': {}, 'short': {}, 'angles': {}, 'targets': {}, 'lengths': {}}
    before = Rig(clip, frame_of)

    # the torso forward, the head as it was, the collar bones forward
    if P['lean']:
        for name in ('Spine', 'Spine1', 'Spine2'):
            b = rig.id(name)
            rig.turn(b, mul(about(fig.right, -P['lean'] / 3.0), rig.world(b)[0]))
        b = rig.id('Neck')
        rig.turn(b, before.world(b)[0])
    if P['shoulder_fwd'] is not None:
        # (how far each collar bone has to come is taken from the pose that faces ahead: the pilot's left shoulder is
        # drawn back to the throttle; in a pose with the head turned the shoulders then turn with the torso as before)
        ahead = Rig(clip, lambda _bone: fig.mid)
        for s in 'LR':
            b = rig.id(s + '_Clavicle')
            x = col(ahead.world(b)[0], 0)
            outward = scale(fig.right, 1.0 if s == 'R' else -1.0)
            now = math.degrees(math.atan2(dot(x, fig.fwd), dot(x, outward)))
            m = rig.world(b)[0]
            flat = sub(col(m, 0), scale(fig.up, dot(col(m, 0), fig.up)))
            rig.turn(b, mul(about(cross(flat, fig.fwd), P['shoulder_fwd'] - now), m))

    # ---- legs
    for s in 'LR':
        thigh, calf, foot, toe = (rig.id('%s_%s' % (s, n)) for n in ('Thigh', 'Calf', 'Foot', 'Toe0'))
        l1, l2, tl = norm(rig.lt(calf)), norm(rig.lt(foot)), rig.lt(toe)
        outward = scale(fig.right, 1.0 if s == 'R' else -1.0)
        if s == 'L':
            f = P['left_foot']
            pitch, yaw = 0.0, -f['toe_out']
            ball = to_figure(fig, P, f['ball'], f['left'], P['floor'])
            normal = fig.up
        else:
            x0, y0, x1, y1, pitch, left = pedal(P, P['right_foot'])
            k = P['right_ball']
            yaw = P['right_toe_out']
            ball = to_figure(fig, P, x0 + (x1 - x0) * k, left, y0 + (y1 - y0) * k)
            normal = add(scale(fig.fwd, -math.sin(math.radians(pitch))), scale(fig.up, math.cos(math.radians(pitch))))
        fx, fy, fz = foot_frame(fig, pitch, yaw)
        toe_at = add(ball, scale(normal, P['sole']))
        ankle = sub(toe_at, add(add(scale(fx, tl[0]), scale(fy, tl[1])), scale(fz, tl[2])))
        hip = rig.world(thigh)[1]
        pole = add(fig.up, scale(outward, P['knee_out']))
        knee, got, short = two_bone(hip, ankle, l1, l2, pole, P['reach'])
        hinge(rig, thigh, calf, hip, knee, got, pole)
        rig.turn(foot, cols(fx, fy, fz))
        limb = s + ' leg'
        info['targets'][limb] = to_tractor(fig, P, ankle)
        info['targets'][s + ' ball'] = to_tractor(fig, P, ball)
        info['short'][limb] = short
        pelvis_up = fig.up
        tdir = col(rig.world(thigh)[0], 0)
        info['angles'][limb] = {
            'knee': -rig.lr(calf)[2],
            'ankle': 90.0 - angle(col(rig.world(calf)[0], 0), fy),
            'thigh up': 90.0 - angle(tdir, pelvis_up),
            'thigh out': math.degrees(math.atan2(dot(tdir, outward), dot(tdir, fig.fwd))),
        }

    # ---- arms
    gx, gy = P['grip']
    for s in 'LR':
        upper, fore, hand = (rig.id('%s_%s' % (s, n)) for n in ARM)
        tw, tw1 = rig.id(s + 'UpArmTwist'), rig.id(s + 'UpArmTwist1')
        ft, ft1 = rig.id(s + '_ForeTwist'), rig.id(s + '_ForeTwist1')
        l1, l2 = norm(rig.lt(fore)), norm(rig.lt(hand))
        outward = scale(fig.right, 1.0 if s == 'R' else -1.0)
        centre, along = rim(fig, P, P['right_hand'] if s == 'R' else P['left_hand'])
        hz = along if s == 'R' else scale(along, -1.0)        # (the thumb upwards along the rim: +Z on the right hand, -Z on the left)
        shoulder = rig.world(upper)[1]
        pole = add(scale(fig.up, -1.0), scale(outward, P['elbow_out']))
        # the arm's roll against the shoulder before it is moved: the upper arm's twist bone keeps it
        par = clip.parent[upper]
        pm0 = before.world(par)[0]
        twist0 = mul(transpose(pm0), mul(before.world(upper)[0], dh.euler(before.lr(tw))))
        fdir = unit(sub(centre, shoulder))
        for _ in range(12):
            hx = unit(sub(fdir, scale(hz, dot(fdir, hz))))
            hy = cross(hz, hx)
            wrist = sub(centre, add(scale(hx, gx), scale(hy, gy)))
            elbow, got, short = two_bone(shoulder, wrist, l1, l2, pole, P['reach'])
            fdir = unit(sub(got, elbow))
        hinge(rig, upper, fore, shoulder, elbow, got, pole)
        rig.turn(hand, cols(hx, hy, hz))
        # the twist bones, as the figure's own clips have them
        pm = rig.world(par)[0]
        new = mul(transpose(pm), rig.world(upper)[0])
        kept = mul(swing(col(twist0, 0), col(new, 0)), twist0)
        roll = twist_x(mul(transpose(new), kept))
        rig.key(tw, (roll, 0.0, 0.0))
        rig.key(tw1, (-roll / 2.0, 0.0, 0.0))
        third = (twist_x(dh.euler(rig.lr(hand))) + (90.0 if s == 'L' else -90.0)) / 3.0
        third = third - 120.0 if third > 60.0 else (third + 120.0 if third < -60.0 else third)
        rig.key(ft, (third, 0.0, 0.0))
        rig.key(ft1, (third, 0.0, 0.0))
        limb = s + ' arm'
        info['targets'][limb] = to_tractor(fig, P, wrist)
        info['targets'][s + ' rim'] = to_tractor(fig, P, centre)
        info['short'][limb] = short
        udir = col(rig.world(upper)[0], 0)
        info['angles'][limb] = {
            'elbow': -rig.lr(fore)[2],
            'wrist': angle(col(rig.world(fore)[0], 0), hx),
            'upper arm below level': -(90.0 - angle(udir, fig.up)),
            'upper arm out': math.degrees(math.atan2(dot(udir, outward), dot(udir, fig.fwd))),
        }

    # ---- what came of it, worked out again from the keyed bones alone
    for limb, s, names in LIMBS:
        a, b, c = (rig.id('%s_%s' % (s, n)) for n in names)
        pa, pb, pc = rig.world(a)[1], rig.world(b)[1], rig.world(c)[1]
        info['joints'][limb] = [to_tractor(fig, P, p) for p in (pa, pb, pc)]
        info['lengths'][limb] = (norm(sub(pb, pa)), norm(rig.lt(b)), norm(sub(pc, pb)), norm(rig.lt(c)))
        info['miss'][limb] = norm(sub(to_tractor(fig, P, pc), info['targets'][limb]))
    for s in 'LR':
        m, t = rig.world(rig.id(s + '_Hand'))
        grip = add(t, add(scale(col(m, 0), gx), scale(col(m, 1), gy)))
        info['joints'][s + ' grip'] = to_tractor(fig, P, grip)
        info['miss'][s + ' rim'] = norm(sub(info['joints'][s + ' grip'], info['targets'][s + ' rim']))
        m, t = rig.world(rig.id(s + '_Toe0'))
        info['joints'][s + ' toe'] = to_tractor(fig, P, t)
        sole = sub(to_tractor(fig, P, t), info['targets'][s + ' ball'])
        info['miss'][s + ' ball'] = abs(norm(sole) - P['sole'])
        fm, fpos = rig.world(rig.id(s + '_Foot'))
        info['joints'][s + ' heel'] = to_tractor(fig, P, add(fpos, add(scale(col(fm, 0), rig.lt(rig.id(s + '_Toe0'))[0] + P['sole']), scale(col(fm, 1), -0.05))))
    spine = [rig.id(n) for n in ('Pelvis', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'HeadNub')]
    info['joints']['spine'] = [to_tractor(fig, P, rig.world(b)[1]) for b in spine]
    info['joints']['spine before'] = [to_tractor(fig, P, before.world(b)[1]) for b in spine]
    for limb, s, names in LIMBS:
        info['joints'][limb + ' before'] = [to_tractor(fig, P, before.world(before.id('%s_%s' % (s, n)))[1]) for n in names]
    info['joints']['shoulders'] = [to_tractor(fig, P, rig.world(rig.id(s + '_UpperArm'))[1]) for s in 'LR']
    head = rig.id('Head')
    info['head'] = max(abs(a - b) for ra, rb in zip(rig.world(head)[0], before.world(head)[0]) for a, b in zip(ra, rb))
    info['rig'] = rig
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
    """(name, axis value or None, a clip, the frames of its pose) for the plain seated pose and the five head poses"""
    out = []
    for x, name in [(None, SEAT)] + list(dh.POSES):
        clip = dh.Clip(src)
        _fig, _right_end, _k, pose = dh.plan(clip)
        out.append((name, x, clip, pose(0.0 if x is None else x)))
    return out


def lines_of(name, info):
    out = []
    for limb, _s, _names in LIMBS:
        j = info['joints'][limb]
        ang = '; '.join('%s %.1f' % (k, v) for k, v in info['angles'][limb].items())
        ln = info['lengths'][limb]
        out.append('%s: %s: %s at fwd %+.3f left %+.3f up %.3f, %.1f cm from where it was to be%s; bones %.4f / %.4f m (as in the clip: %.4f / %.4f); %s' % (
            name, limb, 'ankle' if 'leg' in limb else 'wrist', j[2][0], j[2][1], j[2][2], info['miss'][limb] * 100,
            ' (OUT OF REACH by %.1f cm: stopped short)' % (info['short'][limb] * 100) if info['short'][limb] > 0 else '',
            ln[0], ln[2], ln[1], ln[3], ang))
    out.append('%s: the hands\' grip is %.1f cm (left) and %.1f cm (right) from the rim\'s middle; the balls of the feet %.1f cm and %.1f cm from their surface; the head is turned %s' % (
        name, info['miss']['L rim'] * 100, info['miss']['R rim'] * 100, info['miss']['L ball'] * 100, info['miss']['R ball'] * 100,
        'as it was' if info['head'] < 1e-9 else 'DIFFERENTLY (%.2g)' % info['head']))
    bad = out_of_limits(info)
    out.append('%s: joints: %s' % (name, 'all within what a man can do' if not bad else 'BEYOND: ' + ', '.join(bad)))
    return out


def report(src, P=POSE):
    out = []
    for name, _x, clip, frame_of in poses(src):
        _over, info = solve(clip, frame_of, P)
        if not out:
            s = P['seat']
            for what, key in (('the left hand: the rim at %g on the clock face' % P['left_hand'], 'L rim'), ('the right hand: the rim at %g' % P['right_hand'], 'R rim'),
                              ('the ball of the left foot: on the floor', 'L ball'), ('the ball of the right foot: on the %s' % P['right_foot'], 'R ball')):
                t = info['targets'][key]
                out.append('target: %s: fwd %+.3f left %+.3f up %.3f of the tractor (from the seat: %+.3f fwd, %+.3f left, %+.3f up)' % (
                    what, t[0], t[1], t[2], t[0] - s['fwd'], t[1] - s['left'], t[2] - s['up']))
        out.extend(lines_of(name, info))
    # the same with the pilot's torso: how far short the hands are then
    name, _x, clip, frame_of = poses(src)[0]
    plain = dict(P, lean=0.0, shoulder_fwd=None)
    _over, info = solve(clip, frame_of, plain)
    out.append('with the pilot\'s torso (lean 0, shoulder_fwd None): the hands stop %.1f cm (left) and %.1f cm (right) short of the rim' % (
        info['short']['L arm'] * 100, info['short']['R arm'] * 100))
    return '\n'.join(out)


def make(src, out_dir, P=POSE):
    os.makedirs(out_dir, exist_ok=True)
    name, _x, clip, frame_of = poses(src)[0]
    over, _info = solve(clip, frame_of, P)
    data = dh.still(clip, frame_of, over)
    path = os.path.join(out_dir, name + '.fbx')
    with open(path, 'wb') as f:
        f.write(data)
    if dh.Clip(path).frames != dh.KEYS:
        raise ValueError('%s: not read back as a still pose' % path)
    return ['%s.fbx (%d bytes)' % (name, len(data))]


# ---------------------------------------------------------------- a made clip as DCS's Assimp reads it
def quat_world(clip, got):
    """bone id -> (turn, place) from {bone name: (place, quaternion w x y z)}: what Assimp gives for a clip"""
    memo = {}

    def world(bone):
        if bone not in memo:
            par = clip.parent.get(bone)
            m, t = world(par) if par is not None else (dh.IDENT, (0.0, 0.0, 0.0))
            pos, (w, x, y, z) = got[clip.obj[bone][1]]
            n = math.sqrt(w * w + x * x + y * y + z * z)
            w, x, y, z = w / n, x / n, y / n, z / n
            r = ((1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)),
                 (2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)),
                 (2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)))
            memo[bone] = (mul(m, r), add(t, mulv(m, pos)))
        return memo[bone]
    return world


def grips(clip, fig, world, P):
    """where the two hands' grips are (the tractor's frame), bones placed by `world`"""
    gx, gy = P['grip']
    out = []
    for s in 'LR':
        m, t = world(clip.bones['typeV_%s_Hand' % s])
        out.append(to_tractor(fig, P, add(t, add(scale(col(m, 0), gx), scale(col(m, 1), gy)))))
    return out


def assimp_check(path, dcs, src, P=POSE):
    """Hands and feet of a made clip, worked out from what DCS's own Assimp gives for it (every bone's place and turn),
    against where they were to be: one line."""
    got = dh.assimp(path, dcs, every=True)
    if isinstance(got, str):
        return got
    clip = dh.Clip(src)
    fig = dh.Figure(clip)
    world = quat_world(clip, got)
    base = os.path.basename(path)[:-4]
    for name, _x, c2, frame_of in poses(src):
        if name == base:
            _over, info = solve(c2, frame_of, P)
            break
    else:
        return '%s: not one of the poses made here' % os.path.basename(path)
    worst = 0.0
    for limb, s, names in LIMBS:
        p = to_tractor(fig, P, world(clip.bones['typeV_%s_%s' % (s, names[2])])[1])
        worst = max(worst, norm(sub(p, info['joints'][limb][2])))
    g = grips(clip, fig, world, P)
    return '%s: Assimp: %d bones; wrists and ankles within %.2f cm of the solved pose; the grips %.1f cm (left) and %.1f cm (right) from the rim' % (
        os.path.basename(path), len(got), worst * 100, norm(sub(g[0], info['targets']['L rim'])) * 100, norm(sub(g[1], info['targets']['R rim'])) * 100)


def blend_check(folder, dcs, src, P=POSE):
    """Between two poses of the blend space the bones' turns are mixed. Here: every bone's turn of each pose next to the
    other's as Assimp gives them (they must be near each other: a quaternion and its opposite are one turn, but mixed
    they are none), and where the hands are half way between each two poses (mixed evenly): lines."""
    clip = dh.Clip(src)
    fig = dh.Figure(clip)
    read = []
    for _x, name in dh.POSES:
        got = dh.assimp(os.path.join(folder, name + '.fbx'), dcs, every=True)
        if isinstance(got, str):
            return got
        read.append((name, got))
    for name, _x, c2, frame_of in poses(src):
        if name == dh.POSES[2][1]:
            _over, info = solve(c2, frame_of, P)
    out = []
    for (na, a), (nb, b) in zip(read, read[1:]):
        least, which, mixed = 1.0, '', {}
        for bone in a:
            (pa, qa), (pb, qb) = a[bone], b[bone]
            d = sum(u * v for u, v in zip(qa, qb))
            if d < least:
                least, which = d, bone
            mixed[bone] = (tuple((u + v) / 2 for u, v in zip(pa, pb)), tuple((u + v) / 2 for u, v in zip(qa, qb)))
        g = grips(clip, fig, quat_world(clip, mixed), P)
        feet = [to_tractor(fig, P, quat_world(clip, mixed)(clip.bones['typeV_%s_Foot' % s])[1]) for s in 'LR']
        out.append('%s .. %s: the turns nearest opposite: %s (%.3f; 1 = the same, below 0 = opposite); half way: the grips %.1f cm (left) and %.1f cm (right) from the rim, the ankles %.1f cm and %.1f cm from their places' % (
            na[-4:], nb[-4:], which, least, norm(sub(g[0], info['targets']['L rim'])) * 100, norm(sub(g[1], info['targets']['R rim'])) * 100,
            norm(sub(feet[0], info['joints']['L leg'][2])) * 100, norm(sub(feet[1], info['joints']['R leg'][2])) * 100))
    return '\n'.join(out)


# ---------------------------------------------------------------- the tractor's model (as32-31a.edm), read only
def tractor_parts(dcs):
    """the first level of detail's parts in the tractor's own frame (x ahead, y up, z to the right):
    {name: (points, triangles)}; body, steering (the wheel and its column), wheels"""
    import struct
    import edm
    f = edm.read(open(os.path.join(dcs, TRACTOR), 'rb').read())

    def mm(a, b):
        return [sum(a[i * 4 + k] * b[k * 4 + j] for k in range(4)) for i in range(4) for j in range(4)]

    def quat(q):
        x, y, z, w = q
        return [1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w), 0, 2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w), 0,
                2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y), 0, 0, 0, 0, 1]

    def local(n):
        # (a point is a row: p x rotation keys at 0 x the node's own turn x its place x its matrix)
        if 'matrix' in n:
            return n['matrix']
        if 'base' not in n:
            return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
        b = n['base']
        m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
        for _arg, keys in n['rot']:
            k = min(keys, key=lambda k: abs(k[0]))
            m = mm(m, quat(k[1:5]))
        m = mm(m, quat(b['quat1']))
        p = b['position']
        m = mm(m, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, p[0], p[1], p[2], 1])
        return mm(m, b['matrix'])

    def world(i):
        m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
        while i >= 0:
            m = mm(m, local(f['nodes'][i]))
            i = f['parents'][i]
        return m

    parts = {'body': ({}, []), 'steering': ({}, []), 'wheels': ({}, [])}
    renders = [ns for k, ns in f['items'] if k == 'RENDER_NODES'][0]
    for n in renders[:2]:              # (the first level of detail: its wheels and moving parts, then its body)
        st, cnt = n['vtx']['stride'], n['vtx']['count']
        v = struct.unpack('<%df' % (st * cnt), n['vtx']['data'])
        idx = struct.unpack('<%d%s' % (n['idx']['count'], 'BHI'[n['idx']['type']]), n['idx']['data'])
        par, segs, start = n['parents'], [], 0
        if len(par) == 1 and len(par[0]) == 2:
            segs = [(par[0][0], 0, len(idx))]
        else:
            for p in par:
                segs.append((p[0], start, p[1]))
                start = p[1]
        for node, a, b in segs:
            m = world(node)
            name = f['nodes'][node]['name']
            kind = 'body' if n['name'] == 'body' else ('steering' if name == 'Dummy008' else 'wheels')
            pts, tris = parts[kind]
            for j in range(a, b, 3):
                tri = []
                for u in idx[j:j + 3]:
                    key = (id(n), u)
                    if key not in pts:
                        p = v[u * st:u * st + 3]
                        pts[key] = tuple(p[0] * m[c] + p[1] * m[4 + c] + p[2] * m[8 + c] + m[12 + c] for c in range(3))
                    tri.append(key)
                tris.append(tuple(tri))
    return parts


def measure(dcs):
    """the cab's numbers as the model has them (fwd, left, up): what POSE holds"""
    parts = tractor_parts(dcs)
    out = {}
    sp = list(parts['steering'][0].values())
    zs = [p[2] for p in sp]
    left = -(min(zs) + max(zs)) / 2
    outer = (max(zs) - min(zs)) / 2
    side = [p for p in sp if abs(abs(p[2] + left) - outer) < 0.004]        # the rim's outermost points: level with its middle
    low = [p for p in sp if p[1] < min(q[1] for q in sp) + 0.02]
    cx, cy = sum(p[0] for p in side) / len(side), sum(p[1] for p in side) / len(side)
    bx, by = sum(p[0] for p in low) / len(low), min(p[1] for p in low)
    out['wheel'] = {'fwd': cx, 'left': left, 'up': cy, 'outer': outer, 'tilt': math.degrees(math.atan2(cx - bx, cy - by)), 'top': max(p[1] for p in sp)}
    body = list(parts['body'][0].values())

    def box(x0, x1, y0, y1, z0, z1):
        return [p for p in body if x0 <= p[0] <= x1 and y0 <= p[1] <= y1 and z0 <= p[2] <= z1]

    def pad(pts):
        xs = sorted(set(round(p[0], 3) for p in pts))
        rear = [p for p in pts if p[0] < xs[0] + 0.02]
        zr = [p[2] for p in rear]
        wide = [p for p in pts if min(zr) - 0.002 <= p[2] <= max(zr) + 0.002 and (p[2] < min(zr) + 0.004 or p[2] > max(zr) - 0.004)]
        front = [p for p in wide if p[0] > max(q[0] for q in wide) - 0.02]
        return {'rear': (min(p[0] for p in rear), max(p[1] for p in rear)), 'front': (max(p[0] for p in front), max(p[1] for p in front)),
                'left': -(min(zr) + max(zr)) / 2, 'wide': max(zr) - min(zr)}
    out['accelerator'] = pad(box(-0.05, 0.25, 0.25, 0.45, -0.47, -0.27))
    out['brake'] = pad(box(0.05, 0.265, 0.30, 0.45, -0.70, -0.47))
    pts, tris = parts['body']

    def surface(x, z, below):
        """the highest of the body's surfaces under `below` at a place"""
        best = None
        for t in tris:
            a, b, c = pts[t[0]], pts[t[1]], pts[t[2]]
            d = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2])
            if abs(d) < 1e-12:
                continue
            l1 = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / d
            l2 = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / d
            if l1 < 0 or l2 < 0 or l1 + l2 > 1:
                continue
            y = l1 * a[1] + l2 * b[1] + (1 - l1 - l2) * c[1]
            if y <= below and (best is None or y > best):
                best = y
        return best
    out['floor'] = surface(0.0, -0.74, 0.5)
    seat = box(-0.60, -0.14, 0.55, 0.72, -0.70, -0.46)
    out['cushion'] = {'front': max(p[0] for p in seat), 'rear': min(p[0] for p in seat), 'top': surface(-0.40, -0.58, 0.8)}
    out['firewall'] = min(p[0] for p in box(0.2, 0.4, 0.45, 0.70, -0.70, -0.46))
    back = box(-0.75, -0.48, 0.72, 1.0, -0.70, -0.46)
    out['seat_back'] = {'fwd': max(p[0] for p in back), 'top': max(p[1] for p in back)}
    return out


def measure_lines(dcs):
    m = measure(dcs)
    w = m['wheel']
    out = ['steering wheel: middle fwd %.3f left %.3f up %.3f; rim to its outside %.3f; top leans %.1f degrees forward; rim ends %.3f up' % (
        w['fwd'], w['left'], w['up'], w['outer'], w['tilt'], w['top'])]
    for name in ('accelerator', 'brake'):
        p = m[name]
        out.append('%s: pad rear edge fwd %.3f up %.3f, front edge fwd %.3f up %.3f; middle left %.3f; %.3f wide' % (
            name, p['rear'][0], p['rear'][1], p['front'][0], p['front'][1], p['left'], p['wide']))
    out.append('floor: up %.3f' % m['floor'])
    out.append('seat cushion: fwd %.3f .. %.3f, its top under the driver up %.3f; seat back: its face fwd %.3f, top %.3f; firewall fwd %.3f' % (
        m['cushion']['rear'], m['cushion']['front'], m['cushion']['top'], m['seat_back']['fwd'], m['seat_back']['top'], m['firewall']))
    return '\n'.join(out)


def check_lines(dcs, P=POSE):
    """POSE's cab against the model's: one line that says they agree (to a centimetre; the wheel's lean to 2 degrees),
    or what differs; and the seat POSE was solved for"""
    m = measure(dcs)
    w, pw = m['wheel'], P['wheel']
    pairs = [('wheel fwd', w['fwd'], pw['fwd']), ('wheel left', w['left'], pw['left']), ('wheel up', w['up'], pw['up']),
             ('wheel rim', w['outer'] - 0.018, pw['radius']), ('floor', m['floor'], P['floor']),
             ('cushion top', m['cushion']['top'], P['cushion']['up']), ('cushion front', m['cushion']['front'], P['cushion']['front']),
             ('cushion rear', m['cushion']['rear'], P['cushion']['rear']), ('seat back', m['seat_back']['fwd'], P['seat_back']['fwd']),
             ('seat back top', m['seat_back']['top'], P['seat_back']['top']), ('firewall', m['firewall'], P['firewall'])]
    for name in ('accelerator', 'brake'):
        pairs += [(name + ' rear fwd', m[name]['rear'][0], P[name]['rear'][0]), (name + ' rear up', m[name]['rear'][1], P[name]['rear'][1]),
                  (name + ' front fwd', m[name]['front'][0], P[name]['front'][0]), (name + ' front up', m[name]['front'][1], P[name]['front'][1]),
                  (name + ' left', m[name]['left'], P[name]['left'])]
    bad = ['%s %.3f (POSE: %.3f)' % (n, a, b) for n, a, b in pairs if abs(a - b) > 0.0105]
    if abs(w['tilt'] - pw['tilt']) > 2.0:
        bad.append('wheel tilt %.1f (POSE: %.1f)' % (w['tilt'], pw['tilt']))
    s = P['seat']
    return '\n'.join([
        'the cab as POSE has it against as32-31a.edm (%d numbers): %s' % (len(pairs) + 1, 'all within a centimetre' if not bad else 'DIFFERENT: ' + '; '.join(bad)),
        'the seat POSE is solved for: seat = { fwd = %.2f, left = %.2f, up = %.2f }' % (s['fwd'], s['left'], s['up']),
        'the hands: left at %g on the clock face, right at %g; the right foot on the %s' % (P['left_hand'], P['right_hand'], P['right_foot'])])


# ---------------------------------------------------------------- the drawing
COLOURS = {'L leg': '#1faa2e', 'R leg': '#e02020', 'L arm': '#ff70e0', 'R arm': '#ff7a10'}
WIDTHS = {'L leg': (0.15, 0.11), 'R leg': (0.15, 0.11), 'L arm': (0.09, 0.075), 'R arm': (0.09, 0.075)}   # (a limb's thickness, for judging what it touches)


def svg(src, dcs, P=POSE, which=SEAT):
    """Two views of one pose over the tractor: from its left side (ahead is to the left, as in the user's picture) and
    from above. The old limbs in grey, the new ones in the colours of the user's drawing."""
    for name, _x, clip, frame_of in poses(src):
        if name == which:
            _over, info = solve(clip, frame_of, P)
            break
    parts = None
    try:
        parts = tractor_parts(dcs)
    except (OSError, ValueError):
        pass
    K = 620.0                                   # pixels a metre
    x_hi, x_lo, y_hi, y_lo = 1.15, -1.45, 1.55, -0.05
    W, H1 = (x_hi - x_lo) * K, (y_hi - y_lo) * K
    z_lo, z_hi = 0.0, 1.0                       # left of the centre line
    H2 = (z_hi - z_lo) * K
    o = ['<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d" font-family="sans-serif" font-size="13">' % (W, H1 + H2 + 40, W, H1 + H2 + 40),
         '<rect width="100%" height="100%" fill="#f4f4f1"/>']

    def side(p):                                # (fwd, left, up) -> the side view
        return ((x_hi - p[0]) * K, (y_hi - p[2]) * K)

    def top(p):
        return ((x_hi - p[0]) * K, H1 + 40 + (z_hi - p[1]) * K)

    def path(view, pts, colour, width, opacity=1.0, dash=None):
        d = ' '.join('%s%.1f %.1f' % ('M' if i == 0 else 'L', *view(p)) for i, p in enumerate(pts))
        o.append('<path d="%s" fill="none" stroke="%s" stroke-width="%.1f" stroke-linecap="round" stroke-linejoin="round" opacity="%.2f"%s/>' % (
            d, colour, width, opacity, ' stroke-dasharray="%s"' % dash if dash else ''))

    def dotp(view, p, colour, r=4.0):
        o.append('<circle cx="%.1f" cy="%.1f" r="%.1f" fill="%s" stroke="#000" stroke-width="0.8"/>' % (*view(p), r, colour))

    # the model's own lines: from the side, what lies within 0.13 m of the driver's middle plane and the wheels; from
    # above, the cab between the floor and the wheel's top
    if parts:
        s = P['seat']
        for kind, colour in (('wheels', '#7a8aa0'), ('body', '#555'), ('steering', '#000')):
            pts, tris = parts[kind]
            for view, keep in ((side, lambda c: kind != 'body' or abs(-c[2] - s['left']) < 0.13),
                               (top, lambda c: kind != 'wheels' and -0.75 < c[0] < 0.45 and 0.2 < c[1] < 0.95 and c[2] < 0)):
                d = []
                for t in tris:
                    a, b, c = pts[t[0]], pts[t[1]], pts[t[2]]
                    mid = ((a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3)
                    if not keep(mid):
                        continue
                    q = [view((p[0], -p[2], p[1])) for p in (a, b, c)]
                    d.append('M%.1f %.1fL%.1f %.1fL%.1f %.1fZ' % (q[0][0], q[0][1], q[1][0], q[1][1], q[2][0], q[2][1]))
                o.append('<path d="%s" fill="none" stroke="%s" stroke-width="%s" opacity="%s"/>' % (
                    ''.join(d), colour, 0.5 if kind != 'steering' else 0.8, 0.45 if kind == 'body' else (0.25 if kind == 'wheels' else 0.9)))
    # what POSE says of the cab (so the table can be checked against the model's lines by eye)
    w = P['wheel']
    t = math.radians(w['tilt'])
    r = w['radius']
    path(side, [(w['fwd'] - r * math.sin(t), w['left'], w['up'] - r * math.cos(t)), (w['fwd'] + r * math.sin(t), w['left'], w['up'] + r * math.cos(t))], '#0a6cff', 2.0, 0.8, '6 4')
    path(top, [(w['fwd'], w['left'] - r, 0), (w['fwd'], w['left'] + r, 0)], '#0a6cff', 2.0, 0.8, '6 4')
    for name in ('accelerator', 'brake'):
        x0, y0, x1, y1, _pitch, left = pedal(P, name)
        path(side, [(x0, left, y0), (x1, left, y1)], '#0a6cff', 2.0, 0.8, '6 4')
        path(top, [(x0, left - 0.04, 0), (x1, left - 0.04, 0), (x1, left + 0.04, 0), (x0, left + 0.04, 0), (x0, left - 0.04, 0)], '#0a6cff', 1.5, 0.8, '6 4')
    path(side, [(P['cushion']['front'], 0, P['floor']), (P['firewall'], 0, P['floor'])], '#0a6cff', 2.0, 0.8, '6 4')
    path(side, [(x_lo, 0, 0), (x_hi, 0, 0)], '#333', 1.5)
    j = info['joints']
    for view in (side, top):
        path(view, j['spine before'], '#999', 5.0, 0.6)
        for limb, _s, _n in LIMBS:
            path(view, j[limb + ' before'], '#999', 5.0, 0.6)
        path(view, j['spine'], '#222', 7.0)
        path(view, [j['shoulders'][0], j['spine'][3], j['shoulders'][1]], '#222', 5.0)
        for limb, s, _n in LIMBS:
            a, b, c = j[limb]
            path(view, [a, b], COLOURS[limb], WIDTHS[limb][0] * K, 0.22)
            path(view, [b, c], COLOURS[limb], WIDTHS[limb][1] * K, 0.22)
            path(view, [a, b, c], COLOURS[limb], 6.0)
            if 'leg' in limb:
                path(view, [c, j[s + ' toe']], COLOURS[limb], 6.0)
                path(view, [c, j[s + ' heel'], j[s + ' toe']], COLOURS[limb], 3.0)
            else:
                path(view, [c, j[s + ' grip']], COLOURS[limb], 6.0)
            for p in (a, b, c):
                dotp(view, p, COLOURS[limb])
        hx, hl, hu = j['spine'][5]
        nx, nl, nu = j['spine'][6]
        o.append('<circle cx="%.1f" cy="%.1f" r="%.1f" fill="none" stroke="#222" stroke-width="3"/>' % (*view(((hx + nx) / 2 + 0.03, (hl + nl) / 2, (hu + nu) / 2)), 0.115 * K))
        dotp(view, (P['seat']['fwd'], P['seat']['left'], P['seat']['up']), '#fff', 6.0)
    o.append('<text x="12" y="20">%s: from the tractor\'s left (ahead is to the left). Grey: the pilot\'s pose. Blue dashes: POSE\'s wheel, pedals and floor. White dot: TOW.seat (the pelvis bone).</text>' % which)
    o.append('<text x="12" y="%d">from above (left of the centre line is up)</text>' % (H1 + 30))
    y = 40
    for limb, _s, _n in LIMBS:
        a = info['angles'][limb]
        text = '%s: %s %.0f degrees; %s' % (limb, 'knee' if 'leg' in limb else 'elbow', a['knee' if 'leg' in limb else 'elbow'],
                                            ('ankle %+.0f' % a['ankle']) if 'leg' in limb else ('wrist %.0f' % a['wrist']))
        o.append('<text x="12" y="%d" fill="%s" font-weight="bold">%s</text>' % (y, COLOURS[limb], text))
        y += 18
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
        print('driver pose: not made: the source clip is not there: %s' % src)
        return 2
    if argv and argv[0] == '--report':
        print(report(src))
        return 0
    if argv and argv[0] == '--measure':
        print(measure_lines(dcs))
        print(check_lines(dcs))
        return 0
    if argv and argv[0] == '--svg':
        which = argv[2] if len(argv) > 2 else SEAT
        with open(argv[1], 'w', encoding='utf-8', newline='\n') as f:
            f.write(svg(src, dcs, POSE, which))
        print('driver pose: drawn: %s (%s)' % (argv[1], which))
        return 0
    if argv and argv[0] == '--assimp':
        for p in argv[1:]:
            print(assimp_check(p, dcs, src))
        return 0
    if argv and argv[0] == '--blend':
        print(blend_check(argv[1], dcs, src))
        return 0
    if not argv:
        print(__doc__)
        return 1
    made = make(src, argv[0])
    print('driver pose: made %s' % ', '.join(made))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
