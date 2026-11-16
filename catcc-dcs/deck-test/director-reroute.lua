-- CATCC director test, reroute part. director-test.ps1 appends this, wrapped in "do ... end" after a line
-- `local CATCC_DIRTEST_TARGET = 'routes' | 'traj'`, to the end of:
--   'routes': USS_Nimitz_RunwaysAndRoutes.lua  -> bends every GT.TaxiForTORoutes route (spawn spot -> catapult)
--   'traj':   trajectories_f18.lua / trajectories_f14_to.lua -> bends every recorded taxi trajectory
-- The bend: each path is pushed sideways, to the left of the direction of travel, by
-- BEND_M * sin^2(pi * s / L) (s = distance along the path, L = its length): nothing at the spot or at the
-- catapult, BEND_M halfway. Heights and the recorded orientations are left alone.
-- Plain Lua 5.1 (DCS); also run under fengari by catcc-dcs/test/director-test.test.ts.

local BEND_M = 5.0
local TANGENT_M = 3.0 -- the direction of travel at a point: from the points this far either side

-- pts: count; get(i) -> x, z (ship coords: x forward, z to starboard); set(i, x, z)
local function bend(n, get, set)
  if n < 3 then return end
  local X, Z, S = {}, {}, {}
  for i = 1, n do X[i], Z[i] = get(i) end
  S[1] = 0
  for i = 2, n do
    local dx, dz = X[i] - X[i - 1], Z[i] - Z[i - 1]
    S[i] = S[i - 1] + math.sqrt(dx * dx + dz * dz)
  end
  local L = S[n]
  if L < 20 then return end
  for i = 2, n - 1 do
    local a, b = i, i
    while a > 1 and S[i] - S[a] < TANGENT_M do a = a - 1 end
    while b < n and S[b] - S[i] < TANGENT_M do b = b + 1 end
    local tx, tz = X[b] - X[a], Z[b] - Z[a]
    local m = math.sqrt(tx * tx + tz * tz)
    if m > 0.01 then
      local k = math.sin(math.pi * S[i] / L) ^ 2 * BEND_M / m
      -- left of travel: facing +x (forward) that is -z (port)
      set(i, X[i] + tz * k, Z[i] - tx * k)
    end
  end
end

if CATCC_DIRTEST_TARGET == 'routes' and GT and GT.TaxiForTORoutes then
  for _, r in ipairs(GT.TaxiForTORoutes) do
    local P = r.Points
    bend(#P,
      function(i) return P[i][1][1], P[i][1][3] end,
      function(i, x, z) P[i][1][1], P[i][1][3] = x, z end)
  end
end

if CATCC_DIRTEST_TARGET == 'traj' and type(trajectories) == 'table' then
  for _, tr in pairs(trajectories) do
    bend(#tr,
      function(i) return tr[i].pos.p[1], tr[i].pos.p[3] end,
      function(i, x, z) tr[i].pos.p[1], tr[i].pos.p[3] = x, z end)
  end
end
