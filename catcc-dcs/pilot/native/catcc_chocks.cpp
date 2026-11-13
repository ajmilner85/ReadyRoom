// PARKED EXPERIMENT (2026-11-13): not loaded by the pilot hook any more, and only installed with
// install.ps1 -Experiments. The carrier's per-spot chock flag turned out to do nothing for a player's
// jet: set on every frame it stayed set, no chocks were drawn and the jet taxied away, with the taxi
// deck crew on and off; and with the deck crew's chocks in, the flags read 0. What the hook did with
// this module is kept in pilot/experiments/native-chock-flags.lua. What holds a jet now: its own
// chocks, kept in by the pilot hook (see "chocks held by PriFly" there).
//
// CATCC pilot mod: native Lua module (catcc_chocks.dll) that holds the carrier's own wheel chocks.
//
// Loaded by the pilot GUI hook with package.loadlib(path, 'luaopen_catcc_chocks'). It does not link
// against DCS: every DCS function is looked up at run time in the DLLs DCS has already loaded, and
// every access to DCS memory is guarded (SEH), so a DCS update that moves things gives an error back
// to Lua instead of a crash, and the hook carries on without it (fail-open).
//
// How the carrier is found and what the chock flags are follows BetteraircraftCarrier v1.1, which
// clears the flags so a jet can be pushed around the deck:
//   - RegisterManager::instance (edObjects.dll) walks the world's registered objects;
//   - a carrier is MovingObject::Type() (WorldGeneral.dll) == wsType 3/12/12, within 200 m
//     horizontally and 23 m vertically of the given position;
//   - woShip::SetWheelchocksFlag(int slot, bool) (Transport.dll) sets a parking spot's chocks;
//   - the ship keeps the number of parking spots at *(ship + 0x15d0) + 0xdc and one chock byte per
//     spot at ship + 0x14d4.
//
// Lua API (slots are 0-based, as the ship counts them):
//   m.probe(x, y, z)            -> info table, or nil, error
//      info.count, info.flags ("0101..."), info.ship (registry id), info.dist, info.self (the id of
//      the aircraft nearest the position, if any), info.selfType ("1.1.x.y")
//   m.dump(offset, length)      -> hex string of ship memory (last ship probed), or nil, error
//   m.set(slot, on)             -> true, or nil, error (last ship probed)

#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <cmath>
#include <cstdio>
#include <cstring>

// ---- Lua 5.1, resolved from DCS's lua.dll -------------------------------------------------------
struct lua_State;
typedef int (*lua_CFunction)(lua_State *);
struct luaL_Reg { const char *name; lua_CFunction func; };

static double (*p_lua_tonumber)(lua_State *, int);
static int (*p_lua_toboolean)(lua_State *, int);
static int (*p_lua_gettop)(lua_State *);
static void (*p_lua_pushnil)(lua_State *);
static void (*p_lua_pushnumber)(lua_State *, double);
static void (*p_lua_pushboolean)(lua_State *, int);
static void (*p_lua_pushstring)(lua_State *, const char *);
static void (*p_lua_createtable)(lua_State *, int, int);
static void (*p_lua_setfield)(lua_State *, int, const char *);
static void (*p_luaL_register)(lua_State *, const char *, const luaL_Reg *);

template <typename T> static bool resolve(HMODULE m, const char *name, T &out) {
  out = m ? reinterpret_cast<T>(GetProcAddress(m, name)) : nullptr;
  return out != nullptr;
}

static bool loadLua() {
  HMODULE m = GetModuleHandleA("lua.dll");
  return resolve(m, "lua_tonumber", p_lua_tonumber) && resolve(m, "lua_toboolean", p_lua_toboolean) &&
         resolve(m, "lua_gettop", p_lua_gettop) && resolve(m, "lua_pushnil", p_lua_pushnil) &&
         resolve(m, "lua_pushnumber", p_lua_pushnumber) && resolve(m, "lua_pushboolean", p_lua_pushboolean) &&
         resolve(m, "lua_pushstring", p_lua_pushstring) && resolve(m, "lua_createtable", p_lua_createtable) &&
         resolve(m, "lua_setfield", p_lua_setfield) && resolve(m, "luaL_register", p_luaL_register);
}

static int fail(lua_State *L, const char *msg) {
  p_lua_pushnil(L);
  p_lua_pushstring(L, msg);
  return 2;
}

// ---- DCS, resolved on first use ------------------------------------------------------------------
typedef const unsigned char *(*TypeFn)(void *movingObject);                 // MovingObject::Type
typedef void (*SetChocksFn)(void *ship, int slot, bool on);                  // woShip::SetWheelchocksFlag
typedef void *(*RegNextFn)(void *reg, int id, int kind);                    // RegisterManager vtable + 0x18
typedef void *(*EntryObjFn)(void *entry);                                    // entry vtable + 0x38
typedef void *(*PosFn)(void *sub);                                           // (object + 0x30) vtable + 0x18

static void **g_regInstance;  // &RegisterManager::instance
static TypeFn g_type;
static SetChocksFn g_setChocks;
static const char *g_dcsError;

static bool loadDcs() {
  if (g_regInstance && g_type && g_setChocks) return true;
  if (!resolve(GetModuleHandleA("edObjects.dll"), "?instance@RegisterManager@@2PEAV1@EA", g_regInstance)) {
    g_dcsError = "RegisterManager::instance not found (edObjects.dll)";
    return false;
  }
  if (!resolve(GetModuleHandleA("WorldGeneral.dll"), "?Type@MovingObject@@QEBAAEBVwsType@@XZ", g_type)) {
    g_dcsError = "MovingObject::Type not found (WorldGeneral.dll)";
    return false;
  }
  if (!resolve(GetModuleHandleA("Transport.dll"), "?SetWheelchocksFlag@woShip@@QEAAXH_N@Z", g_setChocks)) {
    g_dcsError = "woShip::SetWheelchocksFlag not found (Transport.dll)";
    return false;
  }
  return true;
}

static const int OFF_SLOTS_PTR = 0x15d0, OFF_SLOTS_COUNT = 0xdc, OFF_CHOCK_FLAGS = 0x14d4;
static const int MAX_SLOTS = 256, MAX_OBJECTS = 1000;

struct Found {
  void *ship;
  int shipId;
  double dist;
  int selfId;
  double selfDist;
  unsigned char selfType[4];
  int count;
  unsigned char flags[MAX_SLOTS];
};

static void *g_ship;  // the last carrier probed

// Everything that touches DCS memory runs inside __try: no C++ objects with destructors here.
static int probeRaw(double x, double y, double z, Found *f) {
  __try {
    void *reg = *g_regInstance;
    if (!reg) return -1;
    RegNextFn next = (RegNextFn)((*(void ***)reg)[0x18 / 8]);
    void *entry = next(reg, 0, 0x20);
    if (!entry) return -2;
    int first = *(int *)((char *)entry + 0x1c);
    for (int n = 0; entry && n < MAX_OBJECTS; n++) {
      EntryObjFn objOf = (EntryObjFn)((*(void ***)entry)[0x38 / 8]);
      void *obj = objOf(entry);
      if (obj) {
        const unsigned char *t = g_type(obj);
        void *sub = (char *)obj + 0x30;
        PosFn posOf = (PosFn)((*(void ***)sub)[0x18 / 8]);
        char *p = (char *)posOf(sub);
        double ox = *(float *)(p + 0x30), oy = *(float *)(p + 0x34), oz = *(float *)(p + 0x38);
        double dh = std::sqrt((ox - x) * (ox - x) + (oz - z) * (oz - z));
        double d3 = std::sqrt(dh * dh + (oy - y) * (oy - y));
        int id = *(int *)((char *)entry + 0x1c);
        if (t[0] == 3 && t[1] == 12 && t[2] == 12 && dh < 200 && std::fabs(oy - y) < 23 && (!f->ship || dh < f->dist)) {
          f->ship = obj;
          f->shipId = id;
          f->dist = dh;
        }
        if (t[0] == 1 && d3 < 10 && (f->selfId < 0 || d3 < f->selfDist)) {
          f->selfId = id;
          f->selfDist = d3;
          memcpy(f->selfType, t, 4);
        }
      }
      entry = next(reg, *(int *)((char *)entry + 0x1c), 0x20);
      if (entry && *(int *)((char *)entry + 0x1c) == first) break;
    }
    if (!f->ship) return -3;
    char *ship = (char *)f->ship;
    char *slots = *(char **)(ship + OFF_SLOTS_PTR);
    if (!slots) return -4;
    int count = *(int *)(slots + OFF_SLOTS_COUNT);
    if (count < 1 || count > MAX_SLOTS) return -5;
    f->count = count;
    memcpy(f->flags, ship + OFF_CHOCK_FLAGS, count);
    return 0;
  } __except (EXCEPTION_EXECUTE_HANDLER) {
    return -100;
  }
}

static int l_probe(lua_State *L) {
  if (!loadDcs()) return fail(L, g_dcsError);
  Found f;
  memset(&f, 0, sizeof f);
  f.selfId = -1;
  int r = probeRaw(p_lua_tonumber(L, 1), p_lua_tonumber(L, 2), p_lua_tonumber(L, 3), &f);
  if (r == -3) { g_ship = nullptr; return fail(L, "no carrier here"); }
  if (r != 0) {
    char msg[96];
    sprintf_s(msg, "carrier lookup failed (%d)", r);
    g_ship = nullptr;
    return fail(L, msg);
  }
  g_ship = f.ship;
  char flags[MAX_SLOTS + 1];
  for (int i = 0; i < f.count; i++) flags[i] = f.flags[i] ? '1' : '0';
  flags[f.count] = 0;
  p_lua_createtable(L, 0, 6);
  p_lua_pushnumber(L, f.count); p_lua_setfield(L, -2, "count");
  p_lua_pushstring(L, flags); p_lua_setfield(L, -2, "flags");
  p_lua_pushnumber(L, f.shipId); p_lua_setfield(L, -2, "ship");
  p_lua_pushnumber(L, f.dist); p_lua_setfield(L, -2, "dist");
  if (f.selfId >= 0) {
    char t[32];
    sprintf_s(t, "%d.%d.%d.%d", f.selfType[0], f.selfType[1], f.selfType[2], f.selfType[3]);
    p_lua_pushnumber(L, f.selfId); p_lua_setfield(L, -2, "self");
    p_lua_pushstring(L, t); p_lua_setfield(L, -2, "selfType");
  }
  return 1;
}

static int dumpRaw(int off, int len, char *out) {
  __try {
    const unsigned char *b = (const unsigned char *)g_ship + off;
    static const char hex[] = "0123456789abcdef";
    for (int i = 0; i < len; i++) { out[2 * i] = hex[b[i] >> 4]; out[2 * i + 1] = hex[b[i] & 15]; }
    out[2 * len] = 0;
    return 0;
  } __except (EXCEPTION_EXECUTE_HANDLER) {
    return -100;
  }
}

static int l_dump(lua_State *L) {
  if (!g_ship) return fail(L, "no carrier probed");
  int off = (int)p_lua_tonumber(L, 1), len = (int)p_lua_tonumber(L, 2);
  if (off < 0 || off > 0x10000 || len < 1 || len > 4096) return fail(L, "bad range");
  static char out[2 * 4096 + 1];
  if (dumpRaw(off, len, out) != 0) return fail(L, "read failed");
  p_lua_pushstring(L, out);
  return 1;
}

static int setRaw(void *ship, int slot, bool on) {
  __try {
    g_setChocks(ship, slot, on);
    return 0;
  } __except (EXCEPTION_EXECUTE_HANDLER) {
    return -100;
  }
}

static int l_set(lua_State *L) {
  if (!loadDcs()) return fail(L, g_dcsError);
  if (!g_ship) return fail(L, "no carrier probed");
  int slot = (int)p_lua_tonumber(L, 1);
  if (slot < 0 || slot >= MAX_SLOTS) return fail(L, "bad slot");
  if (setRaw(g_ship, slot, p_lua_toboolean(L, 2) != 0) != 0) return fail(L, "SetWheelchocksFlag failed");
  p_lua_pushboolean(L, 1);
  return 1;
}

static const luaL_Reg funcs[] = {{"probe", l_probe}, {"dump", l_dump}, {"set", l_set}, {nullptr, nullptr}};

extern "C" __declspec(dllexport) int luaopen_catcc_chocks(lua_State *L) {
  if (!loadLua()) return 0;  // can't even talk to Lua: the loader gets nothing back
  p_luaL_register(L, "catcc_chocks", funcs);
  return 1;
}
