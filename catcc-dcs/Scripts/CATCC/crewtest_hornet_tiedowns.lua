-- CATCC: the F/A-18C's tie-down points, for the tie-down chains (to come): where a chain is fastened on the jet.
-- MEASURED IN DCS (2026-11-25): the user framed each point under the crew test panel's crosshair (the Padeyes page's
-- "Crosshair") from three sides with DCS's own free camera; the panel wrote the camera's place and line of sight in the
-- jet's frame each time it stood still (Logs\catcc-ringviews.lua); each point is where its three lines of sight come
-- nearest (each passing within 0.1 to 1.2 cm of it; the views 54 to 88 degrees apart).
-- The JET'S FRAME (DCS's own for the unit): x metres forward of the model's origin, y up, z to the right; the deck is
-- 1.826 m under the origin when the jet is parked.
-- mirrored = true: not measured, the measured one on the other side mirrored (z negated); the user: "can be mirrored"
-- (the nose gear's two rings, measured both, mirror each other to 1 mm; the tail hook's panel lies on the centre line).
-- kind: 'ring' a tie-down ring of the landing gear; 'hub' a main wheel's hub; 'panel' an access panel over a fitting
-- (the user found no ring on the model there: the NATOPS figure's wing and aft fuselage tie-downs).
return {
  type = 'FA-18C_hornet',
  deck = -1.826,
  points = {
    { name = 'NLG left ring', kind = 'ring', x = 3.083, y = -0.844, z = -0.072 },
    { name = 'NLG right ring', kind = 'ring', x = 3.083, y = -0.850, z = 0.073 },
    { name = 'MLG right fwd ring', kind = 'ring', x = -1.548, y = -0.858, z = 0.813 },
    { name = 'MLG left fwd ring', kind = 'ring', x = -1.548, y = -0.858, z = -0.813, mirrored = true },
    { name = 'MLG right aft ring', kind = 'ring', x = -1.787, y = -1.177, z = 0.951 },
    { name = 'MLG left aft ring', kind = 'ring', x = -1.787, y = -1.177, z = -0.951, mirrored = true },
    { name = 'MLG right wheel hub', kind = 'hub', x = -2.344, y = -1.498, z = 1.702 },
    { name = 'MLG left wheel hub', kind = 'hub', x = -2.344, y = -1.498, z = -1.702, mirrored = true },
    { name = 'Tailhook access panel', kind = 'panel', x = -6.077, y = -0.759, z = -0.002 },
    { name = 'Left wing access panel', kind = 'panel', x = -2.827, y = 0.079, z = -2.931 },
    { name = 'Right wing access panel', kind = 'panel', x = -2.827, y = 0.079, z = 2.931, mirrored = true },
  },
  -- WHAT A CHAIN MUST NOT PASS THROUGH (the user, 2026-11-25: "chains should never pass through the aircraft's own
  -- geometry (e.g. through a tire or strut)"), the jet's frame:
  --   wheel  a tyre: its centre, radius r, width w, its axle along the jet's z
  --   strut  a rod from a to b, radius r; rings: the points on it, whose own chains it does not block (a ring stands
  --          out from its strut's surface, the chain leaves it outwards; the rod, estimated through the rings' centres,
  --          cannot tell which way: checked against it, most aft chains were "behind" their own strut)
  -- The main wheels: the chock tool's (crewtest_chocks.lua WHEELS, seen right in DCS: centre 2.358 m aft, 1.590 m to the
  -- side, r 0.39, w 0.292, the axle 0.37 m over the deck). The nose wheels: ESTIMATED, not measured (the F/A-18C's
  -- 22 x 6.6-10 nose tyres, r 0.28 and w 0.17; twin, under the ring's strut; their axle 0.27 m over the deck): to be
  -- measured with the panel's crosshair if a chain is seen to cut them. The struts: ESTIMATED rods: the nose gear's
  -- upright under its rings; each main gear's along the line through its two measured rings (they sit on it, 0.42 m
  -- apart), from 0.5 m above the forward ring down to the axle's height, and from its foot an arm out to the wheel's
  -- centre (a first try ran the strut from the tyre's inboard side, across the aft ring's every chain).
  obstacles = {
    { name = 'Left main tyre', kind = 'wheel', x = -2.358, y = -1.456, z = -1.590, r = 0.39, w = 0.292 },
    { name = 'Right main tyre', kind = 'wheel', x = -2.358, y = -1.456, z = 1.590, r = 0.39, w = 0.292 },
    { name = 'Left nose tyre', kind = 'wheel', x = 3.05, y = -1.556, z = -0.165, r = 0.28, w = 0.17, estimated = true },
    { name = 'Right nose tyre', kind = 'wheel', x = 3.05, y = -1.556, z = 0.165, r = 0.28, w = 0.17, estimated = true },
    { name = 'Nose gear strut', kind = 'strut', a = { 3.083, -1.556, 0 }, b = { 3.083, -0.30, 0 }, r = 0.09, estimated = true, rings = { 'NLG left ring', 'NLG right ring' } },
    { name = 'Left main gear strut', kind = 'strut', a = { -1.265, -0.480, -0.649 }, b = { -1.996, -1.456, -1.072 }, r = 0.08, estimated = true, rings = { 'MLG left fwd ring', 'MLG left aft ring' } },
    { name = 'Right main gear strut', kind = 'strut', a = { -1.265, -0.480, 0.649 }, b = { -1.996, -1.456, 1.072 }, r = 0.08, estimated = true, rings = { 'MLG right fwd ring', 'MLG right aft ring' } },
    { name = 'Left main gear axle arm', kind = 'strut', a = { -1.996, -1.456, -1.072 }, b = { -2.358, -1.456, -1.590 }, r = 0.07, estimated = true },
    { name = 'Right main gear axle arm', kind = 'strut', a = { -1.996, -1.456, 1.072 }, b = { -2.358, -1.456, 1.590 }, r = 0.07, estimated = true },
  },
}
