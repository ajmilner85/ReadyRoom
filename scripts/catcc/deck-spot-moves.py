"""The deck spots' moves for the tie-down chains: applied to, or taken back out of, the spots one by one.

    python -I scripts/catcc/deck-spot-moves.py                      what is applied (the list)
    python -I scripts/catcc/deck-spot-moves.py --revert 4 "Point 3"  those spots back where they were
    python -I scripts/catcc/deck-spot-moves.py --apply 4             that spot moved again
    python -I scripts/catcc/deck-spot-moves.py --apply all           (--revert all: every one)
    (--no-regen: the spots file only, the generated files not made again)

THE MOVES (carrier-ops-handoff-2/deck-spots-tiedown-moves.csv): 2026-11-25, the user: "For any of the spots where 6 tie
downs are not being placed, can you experiment with translating and rotating the spots in ever increasing increments
until 6 tie downs can be placed?" with "the move must not encroach on another aircraft ... and cannot violate safety
lines"; then "apply the changes, but make it easy to revert them on an individual spot basis". Found by a search over
the whole deck (the tie-down tool's own choice of padeyes, crewtest_tiedowns.lua, run on every spot as "Tie down all"
chains them; moves of 0.25 to 3 m in 16 directions and turns to 10 degrees, the smallest first; the folded planform of
PriFly's deck.ts not to overlap another aircraft's; no new crossing of a safety line, an elevator's safety area or a
structure; the wheels no nearer the deck's edge than 4 ft or than they were; an elevator's aircraft on its platform):
every one of the 40 spots then has all six, the 20 moved by 0.25 to 1.0 m and up to 10 degrees. Each row keeps the
spot as it was and as moved, and whether the move is applied.

THE SPOTS (carrier-ops-handoff-2/deck-spots-dcs.csv, where the user stood each in DCS): a spot's row is set to its
"after" (applied) or "before" (reverted) values, nothing else of the file changed. Then the files made from it are made
again: PriFly's spots (scripts/catcc/deck-spots.gen.ts), DCS's spawn table block (catcc-dcs/deck-test/spots.gen.ts:
director-spots.lua, which director-test.ps1 -Spawn Spots puts into DCS), the crew test's routes
(catcc-dcs/deck-test/crew-test/routes.gen.ts) and the hangar's plan (catcc-dcs/deck-test/hangar/hangar_plan.py: its
elevator places are the elevator spots).
"""
import csv
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SPOTS = os.path.join(ROOT, 'carrier-ops-handoff-2', 'deck-spots-dcs.csv')
MOVES = os.path.join(ROOT, 'carrier-ops-handoff-2', 'deck-spots-tiedown-moves.csv')
REGEN = [
    ['node', 'scripts/catcc/deck-spots.gen.ts'],
    ['node', 'catcc-dcs/deck-test/spots.gen.ts'],
    ['node', 'catcc-dcs/deck-test/crew-test/routes.gen.ts'],
    # (the hangar's plan puts each elevator's two places on the elevator spots, read from crewtest_routes.lua)
    ['python', '-I', 'catcc-dcs/deck-test/hangar/hangar_plan.py'],
]


def read(path):
    with open(path, encoding='utf-8', newline='') as f:
        return list(csv.reader(f))


def write(path, rows):
    with open(path, 'w', encoding='utf-8', newline='') as f:
        csv.writer(f, lineterminator='\n').writerows(rows)


def pick(moves, names):
    """the moves' rows named (a spot's number or name, or 'all')"""
    if names == ['all']:
        return moves[1:]
    out = []
    for nm in names:
        hit = [m for m in moves[1:] if m[0] == nm or m[1].lower() == nm.lower()]
        if not hit:
            raise SystemExit('no move for spot %r in %s' % (nm, os.path.relpath(MOVES, ROOT)))
        out += hit
    return out


def main():
    args = sys.argv[1:]
    regen = '--no-regen' not in args
    args = [a for a in args if a != '--no-regen']
    moves = read(MOVES)
    if not args:
        for m in moves[1:]:
            print('%-3s %-16s %s  %s, %s, %s deg -> %s, %s, %s deg' % (m[0], m[1], 'APPLIED ' if m[8] == '1' else 'reverted', m[2], m[3], m[4], m[5], m[6], m[7]))
        return
    if args[0] not in ('--apply', '--revert') or len(args) < 2:
        raise SystemExit(__doc__)
    apply = args[0] == '--apply'
    chosen = pick(moves, args[1:])
    spots = read(SPOTS)
    for m in chosen:
        row = next((r for r in spots[1:] if r[0] == m[0]), None)
        if not row:
            raise SystemExit('spot %s is not in %s' % (m[0], os.path.relpath(SPOTS, ROOT)))
        want = m[5:8] if apply else m[2:5]
        if row[1] != m[1]:
            raise SystemExit('spot %s is %r in the spots file, %r in the moves file: not changed' % (m[0], row[1], m[1]))
        row[2:5] = want
        m[8] = '1' if apply else '0'
        print('%s %s %s: %s fwd, %s stbd, %s deg' % ('moved' if apply else 'back', m[0], m[1], *want))
    write(SPOTS, spots)
    write(MOVES, moves)
    if regen:
        for cmd in REGEN:
            r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, shell=os.name == 'nt')
            print('$ ' + ' '.join(cmd) + '\n' + (r.stdout + r.stderr).strip())
            if r.returncode != 0:
                raise SystemExit('failed: ' + ' '.join(cmd))
        print('In DCS: the crew test (crew-test\\install.ps1) and the spawn table (director-test.ps1 -Spawn Spots), with DCS closed.')


if __name__ == '__main__':
    main()
