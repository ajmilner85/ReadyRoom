-- CATCC director test, spawn part. director-test.ps1 -Spawn Shift appends this, wrapped in "do ... end", to
-- the end of USS_Nimitz_RunwaysAndRoutes.lua. A deck spawn spot is the first point of its GT.TaxiForTORoutes
-- route (there is no other fixed-wing spawn table, and players spawn within 0.5 m of those points), so
-- moving that point moves the spawn. Each spot moves SHIFT_M along its own first leg (at most 60% of that
-- leg): a new place on the deck, still on the jet's own taxi lane, so it can't land on another spot, a
-- parked jet or the deck edge; the heading (towards point 2) stays the same. The rest of the route is left
-- alone. Plain Lua 5.1 (DCS); also run under fengari by route-lines/routes.mjs and the tests.

local SHIFT_M = 8.0

if GT and GT.TaxiForTORoutes then
  for _, r in ipairs(GT.TaxiForTORoutes) do
    local P = r.Points
    if #P >= 2 then
      local a, b = P[1][1], P[2][1]
      local dx, dz = b[1] - a[1], b[3] - a[3]
      local L = math.sqrt(dx * dx + dz * dz)
      if L > 0.5 then
        local k = math.min(SHIFT_M, 0.6 * L) / L
        a[1], a[3] = a[1] + dx * k, a[3] + dz * k
      end
    end
  end
end
