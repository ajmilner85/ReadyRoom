// CATCC crew test: native Lua module (catcc_crew.dll). TEST ONLY (2026-11-14).
//
// Question it answers: can code of ours see and command the Supercarrier's deck crew characters (the
// people DCS draws on the deck), so that a deck crew of our own could be built on DCS's character
// engine? It lists the characters, reads their names / positions / states and the animation list, and
// can tell one character to play an animation, hold an arm pose, walk to a point on the deck or stop.
//
// Loaded by the crew test hook (Scripts/CATCC/crewtest_hook.lua) with
// package.loadlib(path, 'luaopen_catcc_crew'). Like pilot/native/catcc_chocks.cpp it does not link
// against DCS: every DCS function is looked up at run time, by its exported (decorated) name, in the
// DLLs DCS has already loaded, and everything that touches DCS memory is guarded (SEH), so a DCS
// update that moves things gives an error back to Lua instead of a crash.
//
// How characters are found (three ways, all tried by the hook):
//   1. AnimatorLogic::CharacterEnvironmentManager::instance() -> get_environments() -> each
//      CharacterEnvironment::get_registered_objects()   (animator_logic.dll)
//   2. the world's object registry, RegisterManager::instance (edObjects.dll), walked as
//      catcc_chocks.cpp walks it
//   3. a scan of the process's own memory for objects whose class derives from
//      AnimatorLogic::AnimatedCharacterBase (slow: seconds; read-only)
// What an object is comes from its run-time type information (MSVC RTTI: class name, base classes
// and their offsets), so nothing here depends on class layouts we don't know. Calls are made only on
// exported, non-virtual member functions, with `this` pointing at the base class the function
// belongs to (offset from RTTI); the one virtual we want (GetPosition, the world position) is called
// through the object's own virtual table once its slot has been found by the exported address.
//
// Assumed and checked at run time (the scan reports what it found, commands refuse if a check failed):
//   ed::basic_string<char>  = MSVC std::string layout (16-byte inline buffer or pointer, size, capacity)
//   wPosition3<float>       = four 3-vectors x, y, z (axes) and p (position), either 12 floats or four
//                             16-byte vectors: told apart by which reading gives orthonormal axes
// Vectors and strings DCS returns by value are read and then left alone (never freed: their allocator
// is DCS's): a few hundred bytes leak per scan, which a test can afford.
//
// Lua API (h = a character's handle: a number, from scan / registry / heapscan):
//   m.info()                 -> { version, missing = { "<what> (<dll>)", ... }, thread }
//   m.setlog(path)           -> the module appends a line per step to this file (flushed: survives a crash)
//   m.scan()                 -> { envs, envObjects, envErr, regCount, regErr, people = { {h, name, full, cls,
//                               id, state, movable, x, y, z, wx, wy, wz, layout, src}, ... },
//                               classes = { {name, n, person, bases}, ... }, strOk, noRtti }
//   m.registry(kind)         -> { n, err, people, classes }      (one registry kind)
//   m.heapscan(maxSeconds)   -> { bytes, seconds, hits, people, classes, err }
//   m.anims(h)               -> { "name", ... }                  (the character's animation list)
//   m.play(h, name, mode)    -> true | nil, error                (an animation by its name; mode nil / 0: the
//                               character's own set_animation, plays once; 1: through his animation instance,
//                               once; 2: the same with the engine's loop flag set, runs on until replaced)
//   m.anim(h)                -> { name, id, raw, stack, t, start, dur, fin, l1, l2, l3, bx, by, tr1, tr2, o1, o2 }
//                               | nil, error   (what he is playing this instant: as DCS's own debug inspector
//                               reads it; bx, by = where a blend space is being sampled)
//   m.animinfo(h)            -> { {name, idx, id, dur, x, y, x1, x2, y1, y2, dx, dy}, ... }   (every animation:
//                               length in seconds; for a blend space its axes' names, ranges and defaults)
//   m.prop(h, name [, v])    -> value | nil, error               (a blend parameter of his animation instance;
//                               writing one makes a blend space he is playing follow it at once, if he stands)
//   m.time()                 -> DCS's animation clock (model time, seconds)
//   m.override(h, "")        takes the arm pose off again; m.state also returns fx, fz (the way he faces,
//                            ship coordinates) after the state name
//   m.override(h, name)      -> true | nil, error                (arm pose / override animation)
//   m.attach(h, name, on)    -> true | nil, error                (show or hide an attachment: the light wands)
//   m.walk(h, tx, tz, fx, fz, s1..s12) -> true, info | nil, error  (target in ship coordinates, metres
//                               forward / to starboard; fx, fz = the way to face there, 0, 0 = as now;
//                               s1..s12 = the ship's world x, y, z axes and position)
//   m.stop(h)                -> true | nil, error
//   m.state(h, withName)     -> state, x, y, z, stateName | nil, error
//   m.dump(h, offset, len)   -> hex string of the character's own memory | nil, error
// Characters found by any scan keep their handles across later scans for as long as they exist.
//
// Build: native\build.cmd (VS 2022 Build Tools). It first builds and runs catcc_crew_selftest.cpp: the
// ABI assumptions and the scans, tried on stand-in classes with the compiler DCS is built with.

#define WIN32_LEAN_AND_MEAN
#define PSAPI_VERSION 2  // QueryWorkingSetEx from kernel32
#include <windows.h>
#include <psapi.h>
#include <cmath>
#include <cstdarg>
#include <cstdint>
#include <cstdio>
#include <cstring>

static const char VERSION[] = "crewtest-17";

// ---------------------------------------------------------------- log file
static char g_logPath[MAX_PATH];
static void nlog(const char *fmt, ...) {
  if (!g_logPath[0]) return;
  FILE *f = nullptr;
  if (fopen_s(&f, g_logPath, "a") != 0 || !f) return;
  SYSTEMTIME t;
  GetLocalTime(&t);
  fprintf(f, "%02d:%02d:%02d native  ", t.wHour, t.wMinute, t.wSecond);
  va_list ap;
  va_start(ap, fmt);
  vfprintf(f, fmt, ap);
  va_end(ap);
  fputc('\n', f);
  fclose(f);
}

// ---------------------------------------------------------------- guarded primitives
static bool rd(const void *p, void *out, size_t n) {
  __try {
    memcpy(out, p, n);
    return true;
  } __except (EXCEPTION_EXECUTE_HANDLER) {
    return false;
  }
}

// (the same for writing: used only on a character's own pose, at the address its local_position() returns)
static bool wr(void *p, const void *in, size_t n) {
  __try {
    memcpy(p, in, n);
    return true;
  } __except (EXCEPTION_EXECUTE_HANDLER) {
    return false;
  }
}

// The loaded modules' memory regions, listed once at the start of a memory scan (asking Windows about
// every pointer found would take far too long there). Sorted by address; valid only during the scan.
struct ImgRegion {
  uintptr_t lo, hi;
  bool exec;
};
static const int MAX_IMG = 16384;
static ImgRegion g_img[MAX_IMG];
static int g_nimg;
static bool g_imgValid;

// inside a loaded module (exec: in its code)
static bool inImage(const void *p, bool exec) {
  if (g_imgValid) {
    uintptr_t v = (uintptr_t)p;
    int a = 0, b = g_nimg - 1;
    while (a <= b) {
      int m = (a + b) / 2;
      if (v < g_img[m].lo) b = m - 1;
      else if (v >= g_img[m].hi) a = m + 1;
      else return exec ? g_img[m].exec : true;
    }
    return false;
  }
  MEMORY_BASIC_INFORMATION mbi;
  if (!p || !VirtualQuery(p, &mbi, sizeof mbi)) return false;
  if (mbi.State != MEM_COMMIT || mbi.Type != MEM_IMAGE) return false;
  if (exec) return (mbi.Protect & (PAGE_EXECUTE | PAGE_EXECUTE_READ | PAGE_EXECUTE_READWRITE | PAGE_EXECUTE_WRITECOPY)) != 0;
  return true;
}

// ---------------------------------------------------------------- MSVC RTTI (x64)
struct RttiBase {
  const char *name;  // decorated: ".?AVCharacterMovable@AnimatorLogic@@"
  int mdisp, pdisp, vdisp;
};
static const int MAX_BASES = 48;
struct Rtti {
  void *complete;    // the complete object
  const char *name;  // its class, decorated
  int nbases;
  RttiBase bases[MAX_BASES];  // [0] is the class itself
};

// obj: a pointer to any polymorphic subobject (anything with a virtual table pointer at offset 0)
static bool rttiRaw(const void *obj, Rtti *r) {
  __try {
    void **vptr = *(void ***)obj;
    if (!inImage(vptr, false)) return false;
    const DWORD *col = (const DWORD *)vptr[-1];  // RTTICompleteObjectLocator
    if (!inImage(col, false) || col[0] != 1) return false;  // signature 1: x64, image-relative
    DWORD offset = col[1];
    const char *base = (const char *)col - (int)col[5];
    const char *name = base + (int)col[3] + 16;  // TypeDescriptor: vftable, spare, name
    if (name[0] != '.' || name[1] != '?') return false;
    r->name = name;
    r->complete = (char *)obj - offset;
    const DWORD *chd = (const DWORD *)(base + (int)col[4]);  // RTTIClassHierarchyDescriptor
    DWORD n = chd[2];
    if (n > (DWORD)MAX_BASES) n = MAX_BASES;
    const int *arr = (const int *)(base + (int)chd[3]);
    r->nbases = 0;
    for (DWORD i = 0; i < n; i++) {
      const DWORD *bcd = (const DWORD *)(base + arr[i]);  // RTTIBaseClassDescriptor
      const char *bn = base + (int)bcd[0] + 16;
      if (bn[0] != '.' || bn[1] != '?') return false;
      RttiBase &b = r->bases[r->nbases++];
      b.name = bn;
      b.mdisp = (int)bcd[2];
      b.pdisp = (int)bcd[3];
      b.vdisp = (int)bcd[4];
    }
    return r->nbases > 0;
  } __except (EXCEPTION_EXECUTE_HANDLER) {
    return false;
  }
}

// the subobject of a (non-virtual) base class, by decorated name
static void *baseOf(const Rtti &r, const char *decorated) {
  for (int i = 0; i < r.nbases; i++)
    if (r.bases[i].pdisp == -1 && strcmp(r.bases[i].name, decorated) == 0) return (char *)r.complete + r.bases[i].mdisp;
  return nullptr;
}

// Finds the virtual-table slot that holds `fn` (an exported virtual's address) in one of the object's
// virtual tables. Out: the base subobject's offset in the complete object and the slot. A table ends
// at the first entry that is not code (the next table's RTTI pointer).
static bool findVirtual(const Rtti &r, const void *fn, int *mdisp, int *slot) {
  for (int i = 0; i < r.nbases; i++) {
    if (r.bases[i].pdisp != -1) continue;
    void *sub = (char *)r.complete + r.bases[i].mdisp;
    void **vptr;
    if (!rd(sub, &vptr, sizeof vptr) || !inImage(vptr, false)) continue;
    for (int s = 0; s < 400; s++) {
      void *e;
      if (!rd(vptr + s, &e, sizeof e)) break;
      if (e == fn) {
        *mdisp = r.bases[i].mdisp;
        *slot = s;
        return true;
      }
      if (!inImage(e, true)) break;
    }
  }
  return false;
}

// the most general base class sitting at an offset (the last one RTTI lists there): every class
// derived from it has the same virtual table slots at that subobject
static const char *deepestBaseAt(const Rtti &r, int mdisp) {
  const char *n = nullptr;
  for (int i = 0; i < r.nbases; i++)
    if (r.bases[i].pdisp == -1 && r.bases[i].mdisp == mdisp) n = r.bases[i].name;
  return n;
}

// ---------------------------------------------------------------- ed::string (assumed = MSVC std::string)
struct EdStr {
  union {
    char buf[16];
    char *ptr;
  };
  size_t size, cap;
};

static bool readStr(const void *s, char *out, int outCap) {
  EdStr e;
  if (!s || !rd(s, &e, sizeof e)) return false;
  if (e.size > 200 || e.cap < e.size || e.cap > 65536 || (int)e.size >= outCap) return false;
  const char *data = e.cap < 16 ? (const char *)s : e.ptr;
  char tmp[201];
  if (e.size && !rd(data, tmp, e.size)) return false;
  for (size_t i = 0; i < e.size; i++)
    if (tmp[i] < 32 || tmp[i] > 126) return false;
  memcpy(out, tmp, e.size);
  out[e.size] = 0;
  return true;
}

// a string to pass by const reference; text must outlive the call
static void makeStr(EdStr *s, const char *text) {
  size_t n = strlen(text);
  memset(s, 0, sizeof *s);
  s->size = n;
  if (n < 16) {
    memcpy(s->buf, text, n + 1);
    s->cap = 15;
  } else {
    s->ptr = (char *)text;
    s->cap = n;
  }
}

// ---------------------------------------------------------------- wPosition3<float>
static bool ortho(const float *x, const float *y, const float *z) {
  auto dot = [](const float *a, const float *b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; };
  for (int i = 0; i < 3; i++)
    if (!(x[i] == x[i]) || !(y[i] == y[i]) || !(z[i] == z[i])) return false;  // NaN
  return fabsf(dot(x, x) - 1) < 0.02f && fabsf(dot(y, y) - 1) < 0.02f && fabsf(dot(z, z) - 1) < 0.02f &&
         fabsf(dot(x, y)) < 0.02f && fabsf(dot(x, z)) < 0.02f && fabsf(dot(y, z)) < 0.02f;
}

// 12: twelve floats (x, y, z, p); 16: four 16-byte vectors; 0: neither reading has orthonormal axes
static int posLayout(const float *f) {
  bool a = ortho(f, f + 3, f + 6), b = ortho(f, f + 4, f + 8);
  if (a && !b) return 12;
  if (b && !a) return 16;
  return 0;
}
static const float *posAxis(const float *f, int layout, int i) { return f + i * (layout == 16 ? 4 : 3); }  // i: 0 x, 1 y, 2 z, 3 p
static float *posAxisW(float *f, int layout, int i) { return f + i * (layout == 16 ? 4 : 3); }

// ---------------------------------------------------------------- DCS functions
typedef void *(*Fn0)(void);                                      // static, returns a pointer
typedef void *(*FnThis)(void *self);                             // returns a pointer or reference
typedef void *(*FnRet)(void *self, void *ret);                   // returns a class by value (hidden pointer)
typedef void *(*FnRetF)(void *self, void *ret, float f);         // the same, one float argument
typedef int (*FnInt)(void *self);                                // returns an int or enum
typedef unsigned char (*FnByte)(void *self);                     // returns a bool or unsigned char
typedef void (*FnSetInt)(void *self, int v);
typedef void (*FnSetRef)(void *self, const void *ref);
typedef void (*FnVoid)(void *self);
typedef void *(*RegNextFn)(void *reg, int id, int kind);         // RegisterManager virtual table + 0x18

typedef unsigned short (*FnIdx)(void *self, const void *str, bool flag);  // AnimationManager::get_animation_index
typedef void (*FnSetRefBool)(void *self, const void *ref, bool on);       // AnimatedCharacterBase::show_attachment

// the character's animation instance (Animator::CharacterModelCookie) and the animations themselves
typedef void (*FnCookieSet)(void *self, int idx, float t, bool loop, bool now);  // CharacterModelCookie::set_animation
typedef const void *(*FnCookieGet)(void *self, float t);                         // CharacterModelCookie::get_animation
typedef void *(*FnMgrAnimOf)(void *self, const void *shaderAnim);                // AnimationManager::get_animation(ShaderAnimation const&)
typedef void *(*FnMgrAnimAt)(void *self, int idx);                               // AnimationManager::get_animation(int)
typedef float (*FnStrFloat)(void *self, const void *str);                        // get_animation_duration, get_property
typedef void (*FnSetStrFloat)(void *self, const void *str, float v);             // set_property
typedef double (*FnTime)(void);                                                  // Animator::get_model_time

static void *s_instance, *s_getEnvs, *s_getObjs, *s_getName, *s_getFullName, *s_getId, *s_localPos, *s_getPosition,
    *s_getParent, *s_getAnimMgr, *s_setAnim, *s_setOverride, *s_showAttachment, *s_getState, *s_hasRoutes, *s_moveWorld,
    *s_stopMove, *s_stateName, *s_numAnims, *s_animNames, *s_animIndex, *s_regInstance;
static void *s_cookieSetAnim, *s_cookieGetAnim, *s_cookieStack, *s_mgrAnimOf, *s_mgrAnimAt, *s_mgrDuration, *s_animName,
    *s_animId, *s_animXAxis, *s_animYAxis, *s_animXBounds, *s_animYBounds, *s_animDefaults, *s_modelTime, *s_propSet, *s_propGet,
    *s_cookieUpdate;
typedef void (*FnThisFloat)(void *self, float t);  // CharacterModelCookie::update_properties
static void *s_crewsCount, *s_carrierCrew, *s_crewEnv, *s_crewFree, *s_crewAllowed, *s_crewResetOrders, *s_crewStartBox, *s_envAvoid,
    *s_envPathAvoid, *s_envSetAvoid, *s_envSetPathAvoid, *s_pathFinder, *s_debugSettings, *s_bubbleCmd, *s_bubbleState, *s_elevCmd, *s_elevState,
    *s_getAtc, *s_atcCanLand, *s_atcCanTakeoff, *s_atcFoulDeck, *s_atcRwOpen, *s_atcFreeCats, *s_atcCase, *s_shipGetAtc, *s_atcTeleport, *s_shipDrawArgs, *s_shipSetArg, *s_forcePos, *s_moVtable, *s_crewResetLa;
typedef void (*FnSetBool)(void *self, bool on);  // wCarrierCrew::request_free_catapult, set_operation_allowed; the environment's switches

static void *s_setOrigin, *s_landSetPos, *s_landVtable, *s_nodeParent;

struct Sym {
  const char *dll, *name;
  void **out;
  const char *what;
};
// (the test catcc-dcs/test/crewtest.test.ts checks every name below against the DLL's export table)
static const Sym SYMS[] = {
    {"animator_logic.dll", "?instance@CharacterEnvironmentManager@AnimatorLogic@@SAPEAV12@XZ", &s_instance, "CharacterEnvironmentManager::instance"},
    {"animator_logic.dll", "?get_environments@CharacterEnvironmentManager@AnimatorLogic@@QEBA?AV?$vector@PEAVCharacterEnvironment@AnimatorLogic@@V?$allocator@PEAVCharacterEnvironment@AnimatorLogic@@@std@@@std@@XZ", &s_getEnvs, "CharacterEnvironmentManager::get_environments"},
    {"animator_logic.dll", "?get_registered_objects@CharacterEnvironment@AnimatorLogic@@QEAA?AV?$vector@PEAVIEnvObject@AnimatorLogic@@V?$allocator@PEAVIEnvObject@AnimatorLogic@@@std@@@std@@XZ", &s_getObjs, "CharacterEnvironment::get_registered_objects"},
    {"animator_logic.dll", "?get_name@AnimatedCharacterBase@AnimatorLogic@@QEBAAEBV?$basic_string@D@ed@@XZ", &s_getName, "AnimatedCharacterBase::get_name"},
    {"animator_logic.dll", "?get_full_name@AnimatedCharacterBase@AnimatorLogic@@QEAAAEBV?$basic_string@D@ed@@XZ", &s_getFullName, "AnimatedCharacterBase::get_full_name"},
    {"animator_logic.dll", "?get_id@AnimatedCharacterBase@AnimatorLogic@@QEBAEXZ", &s_getId, "AnimatedCharacterBase::get_id"},
    {"animator_logic.dll", "?local_position@AnimatedCharacterBase@AnimatorLogic@@QEAAAEBV?$wPosition3@M@@XZ", &s_localPos, "AnimatedCharacterBase::local_position"},
    {"animator_logic.dll", "?GetPosition@AnimatedCharacterBase@AnimatorLogic@@UEAAAEBV?$wPosition3@M@@XZ", &s_getPosition, "AnimatedCharacterBase::GetPosition"},
    {"animator_logic.dll", "?get_parent@AnimatedCharacterBase@AnimatorLogic@@QEAAPEAVviObjectNode@@XZ", &s_getParent, "AnimatedCharacterBase::get_parent"},
    {"animator_logic.dll", "?get_animation_manager@AnimatedCharacterBase@AnimatorLogic@@QEAAPEAVAnimationManager@Animator@@XZ", &s_getAnimMgr, "AnimatedCharacterBase::get_animation_manager"},
    {"animator_logic.dll", "?set_animation@AnimatedCharacterBase@AnimatorLogic@@QEAAXH@Z", &s_setAnim, "AnimatedCharacterBase::set_animation(int)"},
    {"animator_logic.dll", "?set_override_animation@AnimatedCharacterBase@AnimatorLogic@@QEAAXAEBV?$basic_string@D@ed@@@Z", &s_setOverride, "AnimatedCharacterBase::set_override_animation(string)"},
    {"animator_logic.dll", "?show_attachment@AnimatedCharacterBase@AnimatorLogic@@QEAAXAEBV?$basic_string@D@ed@@_N@Z", &s_showAttachment, "AnimatedCharacterBase::show_attachment(string, bool)"},
    {"animator_logic.dll", "?get_state@CharacterMovable@AnimatorLogic@@QEAA?AW4CharacterState@12@XZ", &s_getState, "CharacterMovable::get_state"},
    {"animator_logic.dll", "?has_routes@CharacterMovable@AnimatorLogic@@QEAA_NXZ", &s_hasRoutes, "CharacterMovable::has_routes"},
    {"animator_logic.dll", "?move_command_world@CharacterMovable@AnimatorLogic@@QEAAXAEBV?$wPosition3@M@@@Z", &s_moveWorld, "CharacterMovable::move_command_world"},
    {"animator_logic.dll", "?stop_move@CharacterMovable@AnimatorLogic@@QEAAXXZ", &s_stopMove, "CharacterMovable::stop_move"},
    {"animator_logic.dll", "?get_current_state_name@CharacterMovable@AnimatorLogic@@IEAA?AV?$basic_string@D@ed@@M@Z", &s_stateName, "CharacterMovable::get_current_state_name"},
    {"animator.dll", "?get_num_animations@AnimationManager@Animator@@QEAAHXZ", &s_numAnims, "AnimationManager::get_num_animations"},
    {"animator.dll", "?get_animation_names@AnimationManager@Animator@@QEAA?AV?$vector@PEBDV?$allocator@PEBD@ed@@@ed@@XZ", &s_animNames, "AnimationManager::get_animation_names"},
    {"animator.dll", "?get_animation_index@AnimationManager@Animator@@QEAAGAEBV?$basic_string@D@ed@@_N@Z", &s_animIndex, "AnimationManager::get_animation_index"},
    {"edObjects.dll", "?instance@RegisterManager@@2PEAV1@EA", &s_regInstance, "RegisterManager::instance"},
    // crewtest-3: what a character is playing, and playing it with the loop flag
    {"animator.dll", "?set_animation@CharacterModelCookie@Animator@@QEAAXHM_N0@Z", &s_cookieSetAnim, "CharacterModelCookie::set_animation(int, float, bool, bool)"},
    {"animator.dll", "?get_animation@CharacterModelCookie@Animator@@QEAAAEBUShaderAnimation@2@M@Z", &s_cookieGetAnim, "CharacterModelCookie::get_animation(float)"},
    {"animator.dll", "?get_stack_size@CharacterModelCookie@Animator@@QEAAHXZ", &s_cookieStack, "CharacterModelCookie::get_stack_size"},
    {"animator.dll", "?get_animation@AnimationManager@Animator@@QEAAPEAVAnimation@2@AEBUShaderAnimation@2@@Z", &s_mgrAnimOf, "AnimationManager::get_animation(ShaderAnimation)"},
    {"animator.dll", "?get_animation@AnimationManager@Animator@@QEAAPEAVAnimation@2@H@Z", &s_mgrAnimAt, "AnimationManager::get_animation(int)"},
    {"animator.dll", "?get_animation_duration@AnimationManager@Animator@@QEAAMAEBV?$basic_string@D@ed@@@Z", &s_mgrDuration, "AnimationManager::get_animation_duration(string)"},
    {"animator.dll", "?get_name@Animation@Animator@@QEAAAEBV?$basic_string@D@ed@@XZ", &s_animName, "Animation::get_name"},
    {"animator.dll", "?get_id@Animation@Animator@@QEAAHXZ", &s_animId, "Animation::get_id"},
    {"animator.dll", "?get_x_axis_name@Animation@Animator@@QEBAAEBV?$basic_string@D@ed@@XZ", &s_animXAxis, "Animation::get_x_axis_name"},
    {"animator.dll", "?get_y_axis_name@Animation@Animator@@QEBAAEBV?$basic_string@D@ed@@XZ", &s_animYAxis, "Animation::get_y_axis_name"},
    {"animator.dll", "?get_x_bounds@Animation@Animator@@QEBAAEBVVec2f@osg@@XZ", &s_animXBounds, "Animation::get_x_bounds"},
    {"animator.dll", "?get_y_bounds@Animation@Animator@@QEBAAEBVVec2f@osg@@XZ", &s_animYBounds, "Animation::get_y_bounds"},
    {"animator.dll", "?get_defaults@Animation@Animator@@QEBAAEBVVec2f@osg@@XZ", &s_animDefaults, "Animation::get_defaults"},
    {"animator.dll", "?get_model_time@Animator@@YANXZ", &s_modelTime, "Animator::get_model_time"},
    {"animator.dll", "?set_property@PropertyHolderImpl@Animator@@UEAAXAEBV?$basic_string@D@ed@@M@Z", &s_propSet, "PropertyHolderImpl::set_property"},
    {"animator.dll", "?get_property@PropertyHolderImpl@Animator@@UEAAMAEBV?$basic_string@D@ed@@@Z", &s_propGet, "PropertyHolderImpl::get_property"},
    // crewtest-4: a playing blend space takes its parameters again
    {"animator.dll", "?update_properties@CharacterModelCookie@Animator@@QEAAXM@Z", &s_cookieUpdate, "CharacterModelCookie::update_properties(float)"},
    // crewtest-5: the catapult crews' own orders, and the crew environment's collision avoidance switches
    {"Flight.dll", "?get_crews_count@wGroundCrewOwner@@QEBAEXZ", &s_crewsCount, "wGroundCrewOwner::get_crews_count"},
    {"Flight.dll", "?get_carrier_crew@wGroundCrewOwner@@QEAAPEAVwCarrierCrew@@H@Z", &s_carrierCrew, "wGroundCrewOwner::get_carrier_crew(int)"},
    {"Flight.dll", "?get_character_env@wGroundCrewOwner@@QEAAPEAVCharacterEnvironment@AnimatorLogic@@XZ", &s_crewEnv, "wGroundCrewOwner::get_character_env"},
    {"Flight.dll", "?request_free_catapult@wCarrierCrew@@QEAAX_N@Z", &s_crewFree, "wCarrierCrew::request_free_catapult(bool)"},
    {"Flight.dll", "?set_operation_allowed@wCarrierCrew@@QEAAX_N@Z", &s_crewAllowed, "wCarrierCrew::set_operation_allowed(bool)"},
    {"Flight.dll", "?reset_orders@wCarrierCrew@@QEAAXXZ", &s_crewResetOrders, "wCarrierCrew::reset_orders"},
    {"Flight.dll", "?get_start_box@wCarrierCrew@@QEAAAEBV?$BoundingBoxImpl@VVec3f@osg@@@osg@@XZ", &s_crewStartBox, "wCarrierCrew::get_start_box"},
    {"animator_logic.dll", "?get_can_avoid_collisions@CharacterEnvironment@AnimatorLogic@@QEBA_NXZ", &s_envAvoid, "CharacterEnvironment::get_can_avoid_collisions"},
    {"animator_logic.dll", "?get_can_path_avoid_collisions@CharacterEnvironment@AnimatorLogic@@QEBA_NXZ", &s_envPathAvoid, "CharacterEnvironment::get_can_path_avoid_collisions"},
    {"animator_logic.dll", "?set_avoid_collisions@CharacterEnvironment@AnimatorLogic@@QEAAX_N@Z", &s_envSetAvoid, "CharacterEnvironment::set_avoid_collisions(bool)"},
    {"animator_logic.dll", "?set_path_avoid_collisions@CharacterEnvironment@AnimatorLogic@@QEAAX_N@Z", &s_envSetPathAvoid, "CharacterEnvironment::set_path_avoid_collisions(bool)"},
    {"animator_logic.dll", "?get_path_finder@CharacterMovable@AnimatorLogic@@QEBAPEAVPathFinder@2@XZ", &s_pathFinder, "CharacterMovable::get_path_finder"},
    // crewtest-6: the character code's own four switches (exported data, not a function): see debugSetRaw
    {"animator_logic.dll", "?debug_settings@AnimatorLogic@@3UCharacterDebugSettings@1@A", &s_debugSettings, "AnimatorLogic::debug_settings (data)"},
    // crewtest-8: the carrier's catapult control bubbles (see bubbleRaw)
    {"Transport.dll", "?setBubbleCommand@woShip@@QEAAXHH@Z", &s_bubbleCmd, "woShip::setBubbleCommand(int, int)"},
    {"Transport.dll", "?getBubbleState@woShip@@QEAAHH@Z", &s_bubbleState, "woShip::getBubbleState(int)"},
    // crewtest-9: the carrier's elevators, and what its air traffic control says about launching and landing
    {"Transport.dll", "?setElevatorCommand@woShip@@QEAAXHH@Z", &s_elevCmd, "woShip::setElevatorCommand(int, int)"},
    {"Transport.dll", "?getElevatorState@woShip@@QEAAHH@Z", &s_elevState, "woShip::getElevatorState(int)"},
    {"Flight.dll", "?getATC@wAirbase@@UEBAPEAVwoATC@@XZ", &s_getAtc, "wAirbase::getATC"},
    {"Flight.dll", "?canStartLanding@woATC@@QEBA_NXZ", &s_atcCanLand, "woATC::canStartLanding"},
    {"Flight.dll", "?canStartTakeoff@woATC@@QEBA_NXZ", &s_atcCanTakeoff, "woATC::canStartTakeoff"},
    {"Flight.dll", "?getFoulDeck@woATC@@QEBA_NXZ", &s_atcFoulDeck, "woATC::getFoulDeck"},
    {"Flight.dll", "?isRunWayOpen@woATC@@QEBA_NXZ", &s_atcRwOpen, "woATC::isRunWayOpen"},
    {"Flight.dll", "?getFreeCatapultsNum@woATC@@UEAAHXZ", &s_atcFreeCats, "woATC::getFreeCatapultsNum"},
    {"Flight.dll", "?getRecoveryCASE@woATC@@QEAA?AW4RecoveryCASE@@XZ", &s_atcCase, "woATC::getRecoveryCASE"},
    // crewtest-10: the ship's own getATC (it replaces wAirbase's), and the ATC's teleport of an aircraft
    {"Transport.dll", "?getATC@woShip@@UEBAPEAVwoATC@@XZ", &s_shipGetAtc, "woShip::getATC"},
    {"Flight.dll", "?teleport_aircraft@woATC@@QEAAXV?$wPosition3@N@@I@Z", &s_atcTeleport, "woATC::teleport_aircraft(wPosition3<double>, unsigned)"},
    // crewtest-11: the ship's model arguments (the list its model is drawn from)
    {"Transport.dll", "?GetDrawArguments@woShip@@UEAAAEBV?$vector@MV?$allocator128@M@ed@@@ed@@XZ", &s_shipDrawArgs, "woShip::GetDrawArguments"},
    // crewtest-12: the ship's own setter for a model argument (the call the BetteraircraftCarrier mod makes); a moving
    // object put somewhere (and MovingObject's own virtual table, to find that function's slot in a class that
    // replaces it); a catapult crew made to let go of its aircraft
    {"Transport.dll", "?setDrawArgumentValue@woShip@@UEAAXHM@Z", &s_shipSetArg, "woShip::setDrawArgumentValue(int, float)"},
    {"WorldGeneral.dll", "?ForcePosition@MovingObject@@UEAAXAEBV?$wPosition3@N@@@Z", &s_forcePos, "MovingObject::ForcePosition(wPosition3<double>)"},
    {"WorldGeneral.dll", "??_7MovingObject@@6BviObject@@@", &s_moVtable, "MovingObject's virtual table (data)"},
    {"Flight.dll", "?reset_LA@wCarrierCrew@@QEAAXXZ", &s_crewResetLa, "wCarrierCrew::reset_LA"},
    // crewtest-13: a character put at a place of his ship; a static object put somewhere (its own SetPos: the slot
    // is read from lLandObject's virtual table)
    {"animator_logic.dll", "?set_origin@AnimatedCharacterBase@AnimatorLogic@@UEAAXAEBV?$wPosition3@M@@@Z", &s_setOrigin, "AnimatedCharacterBase::set_origin(wPosition3<float>)"},
    {"edObjects.dll", "?SetPos@lLandObject@@UEAAXAEBV?$wPosition3@M@@@Z", &s_landSetPos, "lLandObject::SetPos(wPosition3<float>)"},
    {"edObjects.dll", "??_7lLandObject@@6BviObject@@@", &s_landVtable, "lLandObject's virtual table (data)"},
    {"edObjects.dll", "?Parent@viObjectNode@@QEBAPEAV1@XZ", &s_nodeParent, "viObjectNode::Parent"},
};
static const int NSYMS = sizeof SYMS / sizeof SYMS[0];

static void loadDcs() {
  for (int i = 0; i < NSYMS; i++)
    if (!*SYMS[i].out) {
      HMODULE m = GetModuleHandleA(SYMS[i].dll);
      *SYMS[i].out = m ? (void *)GetProcAddress(m, SYMS[i].name) : nullptr;
    }
}

static const char N_ACB[] = ".?AVAnimatedCharacterBase@AnimatorLogic@@";
static const char N_CM[] = ".?AVCharacterMovable@AnimatorLogic@@";

// guarded calls
static bool gThis(void *fn, void *self, void **out) {
  __try {
    *out = ((FnThis)fn)(self);
    return true;
  } __except (EXCEPTION_EXECUTE_HANDLER) {
    return false;
  }
}
static bool gInt(void *fn, void *self, int *out) {
  __try {
    *out = ((FnInt)fn)(self);
    return true;
  } __except (EXCEPTION_EXECUTE_HANDLER) {
    return false;
  }
}
static bool gByte(void *fn, void *self, int *out) {
  __try {
    *out = ((FnByte)fn)(self);
    return true;
  } __except (EXCEPTION_EXECUTE_HANDLER) {
    return false;
  }
}
static bool gRet(void *fn, void *self, void *ret) {
  __try {
    ((FnRet)fn)(self, ret);
    return true;
  } __except (EXCEPTION_EXECUTE_HANDLER) {
    return false;
  }
}
static bool gRetF(void *fn, void *self, void *ret, float f) {
  __try {
    ((FnRetF)fn)(self, ret, f);
    return true;
  } __except (EXCEPTION_EXECUTE_HANDLER) {
    return false;
  }
}
static bool gSetInt(void *fn, void *self, int v) {
  __try {
    ((FnSetInt)fn)(self, v);
    return true;
  } __except (EXCEPTION_EXECUTE_HANDLER) {
    return false;
  }
}
static bool gSetRef(void *fn, void *self, const void *ref) {
  __try {
    ((FnSetRef)fn)(self, ref);
    return true;
  } __except (EXCEPTION_EXECUTE_HANDLER) {
    return false;
  }
}
static bool gVoid(void *fn, void *self) {
  __try {
    ((FnVoid)fn)(self);
    return true;
  } __except (EXCEPTION_EXECUTE_HANDLER) {
    return false;
  }
}
static bool gSetRefBool(void *fn, void *self, const void *ref, bool on) {
  __try {
    ((FnSetRefBool)fn)(self, ref, on);
    return true;
  } __except (EXCEPTION_EXECUTE_HANDLER) {
    return false;
  }
}
static bool gIdx(void *fn, void *self, const void *str, bool flag, int *out) {
  __try {
    *out = ((FnIdx)fn)(self, str, flag);
    return true;
  } __except (EXCEPTION_EXECUTE_HANDLER) {
    return false;
  }
}

// ---------------------------------------------------------------- what a scan finds
struct Person {
  void *complete, *acb, *cm, *mgr;
  void *parent;  // what he is attached to (his ship): the same for everyone on one carrier
  const char *cls;
  char name[64], full[128];
  int id, state, hasState, routes;  // routes: 1 has walking routes of his own, 0 none, -1 unknown
  float loc[16], wld[16];
  int locLayout, wldLayout;
  int src;  // 1 environment list, 2 object registry, 3 memory scan
};
struct Cls {
  const char *name;
  int n, person;
  char bases[700];
};
static const int MAX_PEOPLE = 512, MAX_CLS = 160;
struct Tally {
  Cls cls[MAX_CLS];
  int ncls, noRtti;
};

static Person g_people[MAX_PEOPLE];
static int g_npeople, g_strOk, g_strBad;
static Tally g_scanTally, g_regTally, g_heapTally;

// the world-position virtual (GetPosition): the base class its table belongs to, and the slot
static const char *g_gpBase;
static int g_gpSlot = -1;

static Cls *clsFor(Tally &t, const Rtti &r) {
  for (int i = 0; i < t.ncls; i++)
    if (t.cls[i].name == r.name || strcmp(t.cls[i].name, r.name) == 0) return &t.cls[i];
  if (t.ncls >= MAX_CLS) return nullptr;
  Cls *c = &t.cls[t.ncls++];
  memset(c, 0, sizeof *c);
  c->name = r.name;
  size_t used = 0;
  for (int i = 1; i < r.nbases; i++) {  // "name+offset" for each base
    char one[160];
    int n = _snprintf_s(one, sizeof one, _TRUNCATE, "%s%s+%d%s", i > 1 ? " " : "", r.bases[i].name, r.bases[i].mdisp, r.bases[i].pdisp == -1 ? "" : "v");
    if (n < 0 || used + n >= sizeof c->bases) break;
    memcpy(c->bases + used, one, n + 1);
    used += n;
  }
  return c;
}

// The world position of anything drawn: slot 3 (+0x18) of its Graphics::ModelInstance virtual table
// returns the position (catcc_chocks.cpp reads ships and aircraft this way). A true virtual call, so
// whatever the object's class does for it. (Looking AnimatedCharacterBase::GetPosition up by address
// found nothing in the deck crew's tables in DCS 2.9.31: their classes replace it.)
static const char N_MI[] = ".?AVModelInstance@Graphics@@";
static const int MI_POSITION_SLOT = 3;

// obj: any polymorphic pointer into an object that is drawn. out: 16 floats. Returns the layout (0: not read).
static int worldPose(const void *obj, float *out) {
  Rtti r;
  if (!obj || !rttiRaw(obj, &r)) return 0;
  void *mi = baseOf(r, N_MI);
  void **vptr;
  void *fn, *s = nullptr;
  if (!mi || !rd(mi, &vptr, sizeof vptr) || !inImage(vptr, false) || !rd(vptr + MI_POSITION_SLOT, &fn, sizeof fn) || !inImage(fn, true)) return 0;
  if (!gThis(fn, mi, &s) || !s || !rd(s, out, 16 * sizeof(float))) return 0;
  return posLayout(out);
}

// What a character is attached to (get_parent: his ship) and where that is in the world: the surest
// way to tell the people of one carrier from another's, who stand at the same ship coordinates.
// A few parents at most: remembered for the length of one scan.
struct ParentPose {
  void *p;
  int layout;
  float f[16];
};
static ParentPose g_parents[8];
static int g_nparents;

static const ParentPose *parentPose(void *parent) {
  if (!parent) return nullptr;
  for (int i = 0; i < g_nparents; i++)
    if (g_parents[i].p == parent) return &g_parents[i];
  if (g_nparents >= 8) return nullptr;
  ParentPose &pp = g_parents[g_nparents++];
  pp.p = parent;
  pp.layout = worldPose(parent, pp.f);
  return &pp;
}

// a man's world pose from where his ship is and where he stands on it (when it can't be read from him)
static bool worldFromParent(Person &q) {
  const ParentPose *pp = parentPose(q.parent);
  if (!pp || !pp->layout || !q.locLayout) return false;
  const float *xs = posAxis(pp->f, pp->layout, 0), *ys = posAxis(pp->f, pp->layout, 1), *zs = posAxis(pp->f, pp->layout, 2), *ps = posAxis(pp->f, pp->layout, 3);
  int L = q.locLayout;
  memset(q.wld, 0, sizeof q.wld);
  for (int a = 0; a < 4; a++) {
    const float *v = posAxis(q.loc, L, a);
    float *w = posAxisW(q.wld, L, a);
    for (int i = 0; i < 3; i++) w[i] = v[0] * xs[i] + v[1] * ys[i] + v[2] * zs[i] + (a == 3 ? ps[i] : 0);
  }
  q.wldLayout = L;
  return true;
}

static void readPose(Person &q, const Rtti &r) {
  void *s = nullptr;
  q.locLayout = q.wldLayout = 0;
  if (s_localPos && gThis(s_localPos, q.acb, &s) && s && rd(s, q.loc, sizeof q.loc)) q.locLayout = posLayout(q.loc);
  q.wldLayout = worldPose(q.complete, q.wld);
  if (q.wldLayout || worldFromParent(q)) return;
  if (!s_getPosition) return;
  if (g_gpSlot < 0) {
    int mdisp, slot;
    if (findVirtual(r, s_getPosition, &mdisp, &slot)) {
      g_gpBase = deepestBaseAt(r, mdisp);
      g_gpSlot = slot;
      nlog("GetPosition: virtual slot %d of base %s (found in %s)", slot, g_gpBase ? g_gpBase : "?", r.name);
    }
  }
  if (g_gpSlot < 0 || !g_gpBase) return;
  void *sub = baseOf(r, g_gpBase);
  void **vptr;
  void *fn;
  if (!sub || !rd(sub, &vptr, sizeof vptr) || !inImage(vptr, false) || !rd(vptr + g_gpSlot, &fn, sizeof fn) || !inImage(fn, true)) return;
  s = nullptr;
  if (gThis(fn, sub, &s) && s && rd(s, q.wld, sizeof q.wld)) q.wldLayout = posLayout(q.wld);
}

static void fillPerson(Person &q, const Rtti &r) {
  void *s = nullptr;
  int v = 0;
  strcpy_s(q.name, "?");
  q.full[0] = 0;
  if (s_getName && gThis(s_getName, q.acb, &s)) {
    if (readStr(s, q.name, sizeof q.name)) g_strOk++;
    else {
      g_strBad++;
      strcpy_s(q.name, "?");
      if (g_strBad <= 3) {
        unsigned char raw[32] = {0};
        rd(s, raw, sizeof raw);
        char hex[80];
        for (int i = 0; i < 32; i++) sprintf_s(hex + 2 * i, 3, "%02x", raw[i]);
        nlog("get_name: unreadable string at %p: %s", s, hex);
      }
    }
  }
  s = nullptr;
  if (s_getFullName && gThis(s_getFullName, q.acb, &s)) readStr(s, q.full, sizeof q.full);
  q.id = (s_getId && gByte(s_getId, q.acb, &v)) ? (v & 255) : -1;
  q.hasState = 0;
  if (q.cm && s_getState && gInt(s_getState, q.cm, &v)) {
    q.state = v;
    q.hasState = 1;
  }
  q.routes = (q.cm && s_hasRoutes && gByte(s_hasRoutes, q.cm, &v)) ? ((v & 255) ? 1 : 0) : -1;
  q.parent = nullptr;
  if (s_getParent) gThis(s_getParent, q.acb, &q.parent);
  readPose(q, r);
  q.mgr = nullptr;
  if (s_getAnimMgr) gThis(s_getAnimMgr, q.acb, &q.mgr);
}

// Is this really a whole, live object of the class RTTI says? Every base subobject that starts with a
// virtual table pointer must agree on the class and on where the object starts. (Memory that only
// happens to hold one such pointer, or an object already destroyed, fails: destructors put the base
// classes' tables back.)
static bool consistent(const Rtti &r) {
  int seen[MAX_BASES], nseen = 0, agree = 0;  // each offset once: several bases share the first table
  for (int i = 0; i < r.nbases; i++) {
    if (r.bases[i].pdisp != -1) continue;
    int at = r.bases[i].mdisp;
    bool dup = false;
    for (int k = 0; k < nseen; k++) dup = dup || seen[k] == at;
    if (dup) continue;
    seen[nseen++] = at;
    void *sub = (char *)r.complete + at;
    void **vptr;
    if (!rd(sub, &vptr, sizeof vptr)) return false;
    if (!inImage(vptr, false) || inImage(vptr, true)) continue;  // this base has no table of its own here
    Rtti r2;
    if (!rttiRaw(sub, &r2)) continue;
    if (r2.name != r.name || r2.complete != r.complete) return false;
    agree++;
  }
  return agree >= 2;  // at least two different tables say the same thing
}

// p: any polymorphic pointer. Returns 1 if it is (part of) a character, which is added once.
static int addObject(Tally &t, const void *p, int src) {
  Rtti r;
  if (!rttiRaw(p, &r)) {
    t.noRtti++;
    return 0;
  }
  Cls *c = clsFor(t, r);
  if (c) c->n++;
  void *acb = baseOf(r, N_ACB);
  if (!acb) return 0;
  if (c) c->person = 1;
  for (int i = 0; i < g_npeople; i++)
    if (g_people[i].complete == r.complete) return 1;
  if (g_npeople >= MAX_PEOPLE) return 1;
  // from raw memory: only whole objects of a class derived from the character base (the base class
  // by itself is what a destroyed character looks like)
  if (src == 3 && (strcmp(r.name, N_ACB) == 0 || !consistent(r))) return 0;
  Person &q = g_people[g_npeople];
  memset(&q, 0, sizeof q);
  q.complete = r.complete;
  q.acb = acb;
  q.cm = baseOf(r, N_CM);
  q.cls = r.name;
  q.src = src;
  fillPerson(q, r);
  if (src == 3 && strcmp(q.name, "?") == 0) return 0;  // from raw memory and no readable name: not a live character
  g_npeople++;
  return 1;
}

// Before a scan: characters found earlier stay (their handles keep working) if they are still the
// objects they were; the rest are dropped. Their details are read again.
static void refreshPeople() {
  int n = 0;
  for (int i = 0; i < g_npeople; i++) {
    Rtti r;
    Person &q = g_people[i];
    if (!rttiRaw(q.complete, &r) || r.name != q.cls || (q.src == 3 && !consistent(r))) continue;
    fillPerson(q, r);
    if (n != i) g_people[n] = q;
    n++;
  }
  g_npeople = n;
}

struct Vec {
  void **first, **last, **end;
};

static int g_envs, g_envObjs;

// 0 ok; negative: where it stopped
static int scanEnvRaw() {
  __try {
    g_envs = g_envObjs = 0;
    if (!s_instance || !s_getEnvs || !s_getObjs) return -1;
    void *mgr = ((Fn0)s_instance)();
    if (!mgr) return -2;
    Vec envs = {nullptr, nullptr, nullptr};
    ((FnRet)s_getEnvs)(mgr, &envs);
    size_t n = envs.first ? (size_t)(envs.last - envs.first) : 0;
    if (n > 256) return -3;
    for (size_t i = 0; i < n; i++) {
      void *env = envs.first[i];
      if (!env) continue;
      g_envs++;
      Vec objs = {nullptr, nullptr, nullptr};
      ((FnRet)s_getObjs)(env, &objs);
      size_t m = objs.first ? (size_t)(objs.last - objs.first) : 0;
      if (m > 20000) return -4;
      for (size_t j = 0; j < m; j++) {
        g_envObjs++;
        if (objs.first[j]) addObject(g_scanTally, objs.first[j], 1);
      }
    }
    return 0;
  } __except (EXCEPTION_EXECUTE_HANDLER) {
    return -100;
  }
}

// the world's registered objects of one kind (catcc_chocks.cpp walks kind 0x20 the same way)
static int scanRegistryRaw(Tally &t, int kind, int *count, int *people) {
  __try {
    *count = *people = 0;
    if (!s_regInstance) return -1;
    void *reg = *(void **)s_regInstance;
    if (!reg) return -2;
    RegNextFn next = (RegNextFn)((*(void ***)reg)[0x18 / 8]);
    void *entry = next(reg, 0, kind);
    if (!entry) return 0;
    int first = *(int *)((char *)entry + 0x1c);
    int n = 0;
    while (entry && n < 20000) {
      n++;
      *people += addObject(t, entry, 2);
      entry = next(reg, *(int *)((char *)entry + 0x1c), kind);
      if (entry && *(int *)((char *)entry + 0x1c) == first) break;
    }
    *count = n;
    return 0;
  } __except (EXCEPTION_EXECUTE_HANDLER) {
    return -100;
  }
}

// ---------------------------------------------------------------- memory scan
// Every committed, private, read-write page is searched for pointers into loaded modules; each
// distinct one is tried as a virtual table (RTTI) once; objects whose class derives from
// AnimatedCharacterBase are added, and classes with Crew / Character / Animat in their name counted.
static const int VT_CACHE = 1 << 20;
static uintptr_t g_vtKey[VT_CACHE];
static unsigned char g_vtVal[VT_CACHE];  // 1 not interesting, 2 a character class, 3 counted only

// v: a value found in memory that points into a loaded module. Is it a virtual table we care about?
static unsigned char verdict(uintptr_t v) {
  Rtti r;
  // &v stands in for "an object whose first 8 bytes are v"
  if (!inImage((void *)v, false) || inImage((void *)v, true) || !rttiRaw(&v, &r)) return 1;
  if (baseOf(r, N_ACB)) return 2;
  if (strstr(r.name, "Crew") || strstr(r.name, "Character") || strstr(r.name, "Animat")) return 3;
  return 1;
}

static int classify(uintptr_t v) {
  unsigned h = (unsigned)((v >> 3) * 2654435761u) & (VT_CACHE - 1);
  for (int probe = 0; probe < 64; probe++) {
    unsigned i = (h + probe) & (VT_CACHE - 1);
    if (g_vtKey[i] == v) return g_vtVal[i];
    if (g_vtKey[i] == 0) {
      g_vtKey[i] = v;
      return g_vtVal[i] = verdict(v);
    }
  }
  return verdict(v);  // the cache is crowded here: work it out again
}

static int g_heapHits, g_heapFaults;
static unsigned long long g_heapBytes, g_heapSkipped;  // read / left alone (not resident)

// one region; another thread may free it under us: then the rest of it is skipped
static void heapRegionRaw(uintptr_t b, uintptr_t e, uintptr_t lo, uintptr_t hi) {
  __try {
    for (const uintptr_t *p = (const uintptr_t *)b; (uintptr_t)(p + 1) <= e; p++) {
      uintptr_t v = *p;
      if (v < lo || v >= hi || (v & 7)) continue;
      int c = classify(v);
      if (c == 1) continue;
      g_heapHits++;
      if (c == 2) addObject(g_heapTally, p, 3);
      else {
        Rtti r;
        if (rttiRaw(p, &r)) {
          Cls *k = clsFor(g_heapTally, r);
          if (k) k->n++;
        }
      }
    }
  } __except (EXCEPTION_EXECUTE_HANDLER) {
    g_heapFaults++;
  }
}

// One committed read-write region: only the pages that are in memory right now are read. A page DCS
// has never touched would be created by reading it, and one that is paged out would be fetched from
// disk: either way the scan would cost DCS memory and time for pages that can't hold a live object
// (a character is updated every frame). Windows is asked, 64 MB at a time, which pages are resident.
static const size_t PAGE = 4096;
static const size_t WS_BATCH = 16384;
static PSAPI_WORKING_SET_EX_INFORMATION g_ws[WS_BATCH];

static void heapRegion(uintptr_t b, uintptr_t e, uintptr_t lo, uintptr_t hi) {
  HANDLE self = GetCurrentProcess();
  for (uintptr_t c = b; c < e;) {
    size_t pages = (e - c) / PAGE;
    if (pages == 0) break;
    if (pages > WS_BATCH) pages = WS_BATCH;
    for (size_t i = 0; i < pages; i++) g_ws[i].VirtualAddress = (PVOID)(c + i * PAGE);
    bool known = QueryWorkingSetEx(self, g_ws, (DWORD)(pages * sizeof g_ws[0])) != 0;
    for (size_t i = 0; i < pages;) {
      if (known && !g_ws[i].VirtualAttributes.Valid) {
        g_heapSkipped += PAGE;
        i++;
        continue;
      }
      size_t j = i;
      while (j < pages && (!known || g_ws[j].VirtualAttributes.Valid)) j++;
      g_heapBytes += (j - i) * PAGE;
      heapRegionRaw(c + i * PAGE, c + j * PAGE, lo, hi);
      i = j;
    }
    c += pages * PAGE;
  }
}

// 0 done, 1 out of time (partial)
static int heapScanRaw(double maxSeconds) {
  memset(g_vtKey, 0, sizeof g_vtKey);
  g_heapHits = g_heapFaults = 0;
  g_heapBytes = g_heapSkipped = 0;
  // the range of loaded modules, for a quick reject
  uintptr_t lo = ~(uintptr_t)0, hi = 0;
  MEMORY_BASIC_INFORMATION mbi;
  SYSTEM_INFO si;
  GetSystemInfo(&si);
  uintptr_t a = (uintptr_t)si.lpMinimumApplicationAddress, top = (uintptr_t)si.lpMaximumApplicationAddress;
  g_imgValid = false;
  g_nimg = 0;
  while (a < top && VirtualQuery((void *)a, &mbi, sizeof mbi)) {
    if (mbi.State == MEM_COMMIT && mbi.Type == MEM_IMAGE) {
      uintptr_t b = (uintptr_t)mbi.BaseAddress;
      if (b < lo) lo = b;
      if (b + mbi.RegionSize > hi) hi = b + mbi.RegionSize;
      if (g_nimg < MAX_IMG) {
        ImgRegion &r = g_img[g_nimg++];
        r.lo = b;
        r.hi = b + mbi.RegionSize;
        r.exec = (mbi.Protect & (PAGE_EXECUTE | PAGE_EXECUTE_READ | PAGE_EXECUTE_READWRITE | PAGE_EXECUTE_WRITECOPY)) != 0;
      }
    }
    a = (uintptr_t)mbi.BaseAddress + mbi.RegionSize;
  }
  g_imgValid = g_nimg > 0 && g_nimg < MAX_IMG;  // (a full table would be an incomplete one: ask Windows instead)
  ULONGLONG t0 = GetTickCount64();
  int result = 0;
  a = (uintptr_t)si.lpMinimumApplicationAddress;
  while (a < top && VirtualQuery((void *)a, &mbi, sizeof mbi)) {
    uintptr_t b = (uintptr_t)mbi.BaseAddress, e = b + mbi.RegionSize;
    if (mbi.State == MEM_COMMIT && mbi.Type == MEM_PRIVATE && mbi.Protect == PAGE_READWRITE) {
      heapRegion(b, e, lo, hi);
      if ((GetTickCount64() - t0) / 1000.0 > maxSeconds) {
        result = 1;
        break;
      }
    }
    a = e;
  }
  g_imgValid = false;
  return result;
}

// ---------------------------------------------------------------- a character by handle
static Person *findPerson(double h) {
  void *p = (void *)(uintptr_t)h;
  for (int i = 0; i < g_npeople; i++)
    if (g_people[i].complete == p) {
      Rtti r;  // still the object it was?
      if (!rttiRaw(p, &r) || r.name != g_people[i].cls) return nullptr;
      return &g_people[i];
    }
  return nullptr;
}

static const int MAX_ANIMS = 2000;
static char g_anim[MAX_ANIMS][72];
static int g_nanim;
static void *g_animMgr;

// 0 ok
static int readAnimsRaw(void *mgr) {
  __try {
    g_nanim = 0;
    g_animMgr = nullptr;
    if (!s_animNames || !mgr) return -1;
    Vec v = {nullptr, nullptr, nullptr};
    ((FnRet)s_animNames)(mgr, &v);
    size_t n = v.first ? (size_t)(v.last - v.first) : 0;
    if (n == 0 || n > MAX_ANIMS) return -2;
    if (s_numAnims) {
      int k = ((FnInt)s_numAnims)(mgr);
      if (k != (int)n) nlog("animations: get_num_animations %d, names %d", k, (int)n);
    }
    for (size_t i = 0; i < n; i++) {
      const char *s = (const char *)v.first[i];
      size_t len = 0;
      while (len < 70 && s[len] >= 32 && s[len] <= 126) len++;
      if (s[len] != 0) return -3;  // not a plain C string
      memcpy(g_anim[i], s, len + 1);
    }
    g_nanim = (int)n;
    g_animMgr = mgr;
    return 0;
  } __except (EXCEPTION_EXECUTE_HANDLER) {
    return -100;
  }
}

// The walk order: the pose (position and facing) the character is sent to, in world coordinates.
// tx, tz: the target in ship coordinates (metres forward, to starboard). fx, fz: the way he should face
// there, in ship coordinates (0, 0 = as he faces now); his own x axis is taken as "forward", as for
// every DCS object (y up, z to his right). S: the ship's world axes and position. Out: info. 0 ok.
// The check that refuses the order (-3) also catches a man on ANOTHER ship: his world position is not
// where our ship coordinates would put him.
static int walkCompute(Person *q, double tx, double tz, double fx, double fz, const double *S, float *out, char *info, size_t infoCap) {
  Rtti r;
  if (!rttiRaw(q->complete, &r)) return -1;
  readPose(*q, r);
  int L = q->locLayout;
  if (!L) return -2;  // can't read the character's own pose
  const float *xl = posAxis(q->loc, L, 0), *yl = posAxis(q->loc, L, 1), *zl = posAxis(q->loc, L, 2), *pl = posAxis(q->loc, L, 3);
  float fxl[3], fyl[3] = {0, 1, 0}, fzl[3];
  double fm = sqrt(fx * fx + fz * fz);
  if (fm > 1e-6) {
    fxl[0] = (float)(fx / fm), fxl[1] = 0, fxl[2] = (float)(fz / fm);
    fzl[0] = -fxl[2], fzl[1] = 0, fzl[2] = fxl[0];  // z = x cross y: to his right
    xl = fxl, yl = fyl, zl = fzl;
  }
  const double *xs = S, *ys = S + 3, *zs = S + 6, *ps = S + 9;
  auto toWorldDir = [&](const float *v, float *w) {
    for (int i = 0; i < 3; i++) w[i] = (float)(v[0] * xs[i] + v[1] * ys[i] + v[2] * zs[i]);
  };
  memset(out, 0, 16 * sizeof(float));
  toWorldDir(xl, posAxisW(out, L, 0));
  toWorldDir(yl, posAxisW(out, L, 1));
  toWorldDir(zl, posAxisW(out, L, 2));
  float *p = posAxisW(out, L, 3);
  for (int i = 0; i < 3; i++) p[i] = (float)(ps[i] + tx * xs[i] + pl[1] * ys[i] + tz * zs[i]);
  // check: the character's own world position, worked out the same way, against what DCS says it is
  double err = -1;
  if (q->wldLayout) {
    const float *pw = posAxis(q->wld, q->wldLayout, 3);
    double d2 = 0;
    for (int i = 0; i < 3; i++) {
      double mine = ps[i] + pl[0] * xs[i] + pl[1] * ys[i] + pl[2] * zs[i];
      d2 += (mine - pw[i]) * (mine - pw[i]);
    }
    err = sqrt(d2);
  }
  sprintf_s(info, infoCap, "from %.1f fwd %.1f stbd to %.1f fwd %.1f stbd (%.1f m); frame check %s%.2f m; layout %d", pl[0], pl[2], tx, tz,
            sqrt((tx - pl[0]) * (tx - pl[0]) + (tz - pl[2]) * (tz - pl[2])), err < 0 ? "n/a " : "", err < 0 ? 0.0 : err, L);
  if (err > 5) return -3;  // our idea of ship coordinates is not DCS's: don't send him anywhere
  return 0;
}

// ---------------------------------------------------------------- the animation instance ("cookie")
// What a character plays is held by an Animator::CharacterModelCookie, one per character: a stack of
// animations with their start times, loop ranges and blend-space coordinates. AnimatedCharacterBase's
// own set_animation(int) goes through it with the engine's loop flag off (the animation plays once and
// the character falls back to his idle); the engine's own looping animations (the walk, "bs_move") are
// applied with the flag on. Both read from animator_logic.dll / animator.dll 2.9.31 (2026-11-14):
//   AnimatedCharacterBase::set_animation(int i):  cookie->set_animation(i, (float)get_model_time(), false, true)
//   AnimatedCharacterBase::gui() (the debug inspector):  sa = cookie->get_animation(t);
//       a = manager->get_animation(sa); a->get_id(); sa: +4 start, +8 duration, +0xC end,
//       +0x10..0x18 loop, +0x1C, +0x20 blend ratio, +0x24, +0x28 transition, +0x30, +0x34 override
// No exported function returns the cookie, but the character keeps the pointer in a member, and the
// exported set_override_animation(string) begins by loading it:
//       48 8B 49 70   mov rcx,[rcx+70h]        48 85 C9   test rcx,rcx
// The member's offset is read out of that instruction (8- or 32-bit form) rather than written down
// here: a build that moves the member is followed, and a build that changes the instruction gives -1
// (every cookie function then refuses) instead of a wrong pointer. What the pointer leads to must then
// say, by its own type information, that it is a CharacterModelCookie.
static const char N_COOKIE[] = ".?AVCharacterModelCookie@Animator@@";
static const char N_PROPS[] = ".?AVPropertyHolderImpl@Animator@@";
static const char N_ANIMATION[] = ".?AVAnimation@Animator@@";

static int parseThisLoad(const unsigned char *c) {
  int d = -1, n = 0;
  if (c[0] == 0x48 && c[1] == 0x8B && c[2] == 0x49 && c[3] < 0x80) d = c[3], n = 4;  // mov rcx,[rcx+disp8]
  else if (c[0] == 0x48 && c[1] == 0x8B && c[2] == 0x89) {                            // mov rcx,[rcx+disp32]
    memcpy(&d, c + 3, 4);
    n = 7;
  }
  if (n == 0 || d < 8 || d > 0x2000 || (d & 7)) return -1;
  if (!(c[n] == 0x48 && c[n + 1] == 0x85 && c[n + 2] == 0xC9)) return -1;  // test rcx,rcx
  return d;
}

static int g_cookieOff = -2;  // -2: not looked for yet; -1: not found
static int cookieOff() {
  if (g_cookieOff == -2) {
    if (!s_setOverride) return -1;  // animator_logic.dll not loaded yet (asked at DCS start): look again next time
    unsigned char code[16];
    g_cookieOff = rd(s_setOverride, code, sizeof code) ? parseThisLoad(code) : -1;
    if (g_cookieOff >= 0) nlog("cookie: a character keeps his animation instance at +0x%x", g_cookieOff);
    else nlog("cookie: set_override_animation does not begin as expected: the animation instance can't be found (held signals and the readout are off)");
  }
  return g_cookieOff;
}

// the character's cookie and, if asked for, the cookie's blend parameters; nullptr: none, or not what it should be
static void *cookieOf(const Person *q, void **props) {
  int off = cookieOff();
  void *p = nullptr;
  if (off < 0 || !q->acb || !rd((char *)q->acb + off, &p, sizeof p) || !p) return nullptr;
  Rtti r;
  if (!rttiRaw(p, &r)) return nullptr;
  void *c = baseOf(r, N_COOKIE);
  if (!c || c != p) return nullptr;  // DCS passes the stored pointer itself as the cookie's `this`
  if (props) *props = baseOf(r, N_PROPS);
  return c;
}

static bool isAnimation(const void *a) {
  Rtti r;
  return a && rttiRaw(a, &r) && baseOf(r, N_ANIMATION) != nullptr;
}

struct AnimNow {
  char name[72];
  int id, rawId, stack;
  float f[16];  // the 16 floats after the id: start, duration, end, loop x3, blend x2, transition x2, ?, override x2, ...
  double t;
};
// What the character plays this instant. 0 ok; -1 no cookie / functions missing; -2 nothing on his
// stack; -3 unreadable; -100 exception.
static int animNowRaw(const Person *q, AnimNow *o) {
  memset(o, 0, sizeof *o);
  void *c = cookieOf(q, nullptr);
  if (!c || !q->mgr || !s_cookieGetAnim || !s_cookieStack || !s_mgrAnimOf || !s_animName || !s_modelTime) return -1;
  __try {
    o->t = ((FnTime)s_modelTime)();
    o->stack = ((FnInt)s_cookieStack)(c);
    if (o->stack <= 0 || o->stack > 256) return -2;  // get_animation throws on an empty stack
    const void *sa = ((FnCookieGet)s_cookieGetAnim)(c, (float)o->t);
    if (!sa) return -3;
    unsigned char raw[0x44];
    memcpy(raw, sa, sizeof raw);
    memcpy(&o->rawId, raw, 4);
    memcpy(o->f, raw + 4, sizeof o->f);
    if (o->rawId < 1 || o->rawId > 100000) return -3;  // the manager indexes a table with it, unchecked
    void *a = ((FnMgrAnimOf)s_mgrAnimOf)(q->mgr, raw);
    if (!isAnimation(a)) return -3;
    o->id = s_animId ? ((FnInt)s_animId)(a) : -1;
    if (!readStr(((FnThis)s_animName)(a), o->name, sizeof o->name)) return -3;
    return 0;
  } __except (EXCEPTION_EXECUTE_HANDLER) {
    return -100;
  }
}

// Play animation idx through the cookie, as the character's own set_animation does but with the loop
// flag ours to set. 0 ok; -1 no cookie / functions missing; -100 exception.
static int cookiePlayRaw(const Person *q, int idx, bool loop) {
  void *c = cookieOf(q, nullptr);
  if (!c || !s_cookieSetAnim || !s_modelTime) return -1;
  __try {
    float t = (float)((FnTime)s_modelTime)();
    ((FnCookieSet)s_cookieSetAnim)(c, idx, t, loop, true);
    return 0;
  } __except (EXCEPTION_EXECUTE_HANDLER) {
    return -100;
  }
}

// A blend parameter of the cookie (a named float: a blend space samples itself at the value of the
// parameter its axis is named after). set: write v first, then have the cookie take its parameters
// again. A blend space reads its parameters when it is applied and whenever
// CharacterModelCookie::update_properties(t) is called (it re-reads both axes into every playing record
// and keeps the phase); DCS's own directors show both in the log of 2026-11-14: their torso angle moves
// while the signal plays. Without that call a parameter written while a blend space plays does nothing
// until the next animation is applied (seen the same day: the swept "torso_angle" left the record at 0,
// and the NEXT blend space started at the last value written).
// 0 ok; -1 no cookie / no parameters; -100 exception.
static int propRaw(const Person *q, const char *name, bool set, float v, float *out) {
  void *ph = nullptr;
  void *c = cookieOf(q, &ph);
  if (!c || !ph || !s_propGet || (set && !s_propSet)) return -1;
  static char keep[72];
  strcpy_s(keep, name);
  EdStr s;
  makeStr(&s, keep);
  __try {
    if (set) {
      ((FnSetStrFloat)s_propSet)(ph, &s, v);
      // only for a man who stands: while he walks, the walk's own blend space ("bs_move": curvature,
      // speed) is on his stack, and where the engine keeps THOSE parameters is not known
      int moving = 0;
      if (q->cm && s_getState) moving = ((FnInt)s_getState)(q->cm);
      if (moving == 0 && s_cookieUpdate && s_modelTime && s_cookieStack && ((FnInt)s_cookieStack)(c) > 0)
        ((FnThisFloat)s_cookieUpdate)(c, (float)((FnTime)s_modelTime)());
    }
    *out = ((FnStrFloat)s_propGet)(ph, &s);
    return 0;
  } __except (EXCEPTION_EXECUTE_HANDLER) {
    return -100;
  }
}

struct AnimInfo {
  int idx, id;
  float dur, xb[2], yb[2], def[2];
  char xa[48], ya[48];
};
// One animation by name: its index, length and, for a blend space, its axes. nclips: how many plain
// animations there are (get_num_animations): only those have a length; ntable: how many names (the
// animation table's size: plain animations and blend spaces). 0 ok; -1 functions missing; -2 unknown
// name / out of range; -3 not an animation; -100 exception.
static int animInfoRaw(void *mgr, const char *name, int nclips, int ntable, AnimInfo *o) {
  memset(o, 0, sizeof *o);
  o->idx = o->id = -1;
  if (!mgr || !s_animIndex || !s_mgrAnimAt) return -1;
  static char keep[72];
  strcpy_s(keep, name);
  EdStr s;
  makeStr(&s, keep);
  __try {
    int idx = ((FnIdx)s_animIndex)(mgr, &s, false);
    if (idx < 0 || idx == 0xFFFF || idx >= ntable) return -2;
    o->idx = idx;
    if (idx < nclips && s_mgrDuration) o->dur = ((FnStrFloat)s_mgrDuration)(mgr, &s);
    void *a = ((FnMgrAnimAt)s_mgrAnimAt)(mgr, idx);
    if (!isAnimation(a)) return -3;
    if (s_animId) o->id = ((FnInt)s_animId)(a);
    if (s_animXAxis && !readStr(((FnThis)s_animXAxis)(a), o->xa, sizeof o->xa)) o->xa[0] = 0;
    if (s_animYAxis && !readStr(((FnThis)s_animYAxis)(a), o->ya, sizeof o->ya)) o->ya[0] = 0;
    if (s_animXBounds) memcpy(o->xb, ((FnThis)s_animXBounds)(a), sizeof o->xb);
    if (s_animYBounds) memcpy(o->yb, ((FnThis)s_animYBounds)(a), sizeof o->yb);
    if (s_animDefaults) memcpy(o->def, ((FnThis)s_animDefaults)(a), sizeof o->def);
    return 0;
  } __except (EXCEPTION_EXECUTE_HANDLER) {
    return -100;
  }
}

// ---------------------------------------------------------------- the catapult crews and the crew environment
// A carrier (woShip) is a wGroundCrewOwner: it owns the catapult crews (wCarrierCrew, one per catapult)
// and the crew environment its characters walk in. Flight.dll exports (its code is packed on disk, its
// export table is not):
//   wGroundCrewOwner::get_crews_count(), get_carrier_crew(int), get_character_env()
//   wCarrierCrew::request_free_catapult(bool), set_operation_allowed(bool), reset_orders(), get_start_box()
// The orders are the ones the catapult crew's behaviour tree (USS_Nimitz/scripts/common.xml) waits on:
//   GC_ORDER_FREE_CATAPULT / GC_ORDER_TAKE_CATAPULT: with no aircraft assigned, the crew walks its
//     "free_cat" routes and is then not ready to be given an aircraft, until told to take the catapult,
//     when it walks its "occupy_cat" routes back;
//   GC_ORDER_OPERATION_ALLOWED: with an aircraft in the box, the crew waits ("... blocking start. Please
//     wait") until it is true.
// Which function sets which order, and what DCS's own logic does with them meanwhile, is what the test
// in the sim is for. The environment's two switches (avoid collisions / path avoid collisions) are
// plain flags with exported getters and setters in animator_logic.dll.
static const char N_OWNER[] = ".?AVwGroundCrewOwner@@";
static const char N_CATCREW[] = ".?AVwCarrierCrew@@";

// the crew owner (the ship) a character is attached to; nullptr: none / not a crew owner
static void *ownerOf(const Person *q) {
  Rtti r;
  if (!q->parent || !rttiRaw(q->parent, &r)) return nullptr;
  return baseOf(r, N_OWNER);
}

struct CatCrew {
  void *crew;      // the wCarrierCrew
  float box[6];    // its start box: min x, y, z, max x, y, z (ship coordinates)
  int boxOk;
};
// The owner's catapult crews, by DCS's own numbers. DCS numbers them from 1 (seen 2026-11-14 on the
// Supercarrier: count 4, number 0 nothing, numbers 1..3 catapults 1..3; number 4 was never asked for and
// catapult 4's crew was missed), so numbers 0..count are asked for. Returns how many slots were filled
// (count + 1, at most cap), -1 functions missing, -100 exception; *dcsCount: DCS's own count. Pointers
// that are not a wCarrierCrew by their own type information are left out (crew = nullptr).
static int catCrewsRaw(void *owner, CatCrew *out, int cap, int *dcsCount) {
  if (!owner || !s_crewsCount || !s_carrierCrew) return -1;
  __try {
    int n = ((FnByte)s_crewsCount)(owner) & 255;
    if (dcsCount) *dcsCount = n;
    n++;
    if (n > cap) n = cap;
    for (int i = 0; i < n; i++) {
      memset(&out[i], 0, sizeof out[i]);
      void *c = ((FnMgrAnimAt)s_carrierCrew)(owner, i);
      Rtti r;
      if (!c || !rttiRaw(c, &r)) continue;
      void *cc = baseOf(r, N_CATCREW);
      if (!cc) continue;
      out[i].crew = cc;
      if (s_crewStartBox) {
        const void *b = ((FnThis)s_crewStartBox)(cc);
        out[i].boxOk = b && rd(b, out[i].box, sizeof out[i].box) ? 1 : 0;
      }
    }
    return n;
  } __except (EXCEPTION_EXECUTE_HANDLER) {
    return -100;
  }
}

// what: 0 request_free_catapult(on), 1 set_operation_allowed(on), 2 reset_orders(). 0 ok; -1 missing; -100 exception.
static int catOrderRaw(void *crew, int what, bool on) {
  void *fn = what == 0 ? s_crewFree : (what == 1 ? s_crewAllowed : s_crewResetOrders);
  if (!crew || !fn) return -1;
  __try {
    if (what == 2) ((FnVoid)fn)(crew);
    else ((FnSetBool)fn)(crew, on);
    return 0;
  } __except (EXCEPTION_EXECUTE_HANDLER) {
    return -100;
  }
}

// ---------------------------------------------------------------- where a catapult crew keeps its orders
// Flight.dll exports the orders' setters and no getter. To read an order back afterwards (and so see who
// changes it, and when), the bytes a setter changes are found by looking: the crew object's first 4 KB
// and the blocks of memory it points to (two levels deep, 256 bytes each) are copied before the call and
// compared after it. The call is one call on the simulation's thread, so a byte that went 0 <-> 1 across
// it is the setter's work. The places found are kept (g_ord, per crew) and read back by orderPeekRaw.
struct OrderLoc {
  void *crew;       // the crew the place was found on: the orders live in a tree of their own per crew, so a
                    // place found on one crew is not where another crew keeps the same order (seen 2026-11-14)
  int p1, p2, off;  // p1 < 0: crew + off;  p2 < 0: [crew + p1] + off;  else [[crew + p1] + p2] + off
};
struct OrdBlk {
  const unsigned char *p;
  int p1, p2;
};
static const int MAX_ORD = 64, ORD_OBJ = 0x1000, ORD_BLK = 0x100, ORD_MAXBLK = 2048;
static OrderLoc g_ord[MAX_ORD];
static int g_nord;
static OrdBlk g_oblk[ORD_MAXBLK];
static int g_noblk;
static unsigned char g_oobj[ORD_OBJ], g_onow[ORD_OBJ], g_oblkData[ORD_MAXBLK][ORD_BLK];

// a pointer to n bytes of ordinary writable data memory (the heap), not to a module or the stack's guard
static bool dataBlock(uintptr_t v, size_t n) {
  if (v < 0x10000 || v > 0x00007FFFFFFFFFFFull || (v & 7)) return false;
  MEMORY_BASIC_INFORMATION mbi;
  if (!VirtualQuery((void *)v, &mbi, sizeof mbi)) return false;
  if (mbi.State != MEM_COMMIT || mbi.Type != MEM_PRIVATE || mbi.Protect != PAGE_READWRITE) return false;
  return v + n <= (uintptr_t)mbi.BaseAddress + mbi.RegionSize;
}

static void ordAddBlocks(const unsigned char *data, int n, const unsigned char *self, int selfN, int p1) {
  for (int o = 0; o + 8 <= n && g_noblk < ORD_MAXBLK; o += 8) {
    uintptr_t v;
    memcpy(&v, data + o, 8);
    const unsigned char *p = (const unsigned char *)v;
    if (p >= self && p < self + selfN) continue;
    if (!dataBlock(v, ORD_BLK)) continue;
    bool dup = false;
    for (int k = 0; k < g_noblk && !dup; k++) dup = g_oblk[k].p == p;
    if (dup || !rd(p, g_oblkData[g_noblk], ORD_BLK)) continue;
    g_oblk[g_noblk].p = p;
    g_oblk[g_noblk].p1 = p1 < 0 ? o : p1;
    g_oblk[g_noblk].p2 = p1 < 0 ? -1 : o;
    g_noblk++;
  }
}

static void ordDesc(const OrderLoc &o, char *s, size_t n) {
  if (o.p1 < 0) sprintf_s(s, n, "+0x%X", o.off);
  else if (o.p2 < 0) sprintf_s(s, n, "[+0x%X]+0x%X", o.p1, o.off);
  else sprintf_s(s, n, "[[+0x%X]+0x%X]+0x%X", o.p1, o.p2, o.off);
}

static void ordNote(void *crew, int p1, int p2, int off, int was, int is, char *txt, size_t ntxt, int *nfound) {
  OrderLoc o = {crew, p1, p2, off};
  char d[48], line[80];
  ordDesc(o, d, sizeof d);
  if (*nfound < 12) {
    sprintf_s(line, "%s%s: %d > %d", *nfound ? ", " : "", d, was, is);
    if (strlen(txt) + strlen(line) + 1 < ntxt) strcat_s(txt, ntxt, line);
  }
  (*nfound)++;
  for (int k = 0; k < g_nord; k++)
    if (g_ord[k].crew == crew && g_ord[k].p1 == p1 && g_ord[k].p2 == p2 && g_ord[k].off == off) return;
  if (g_nord < MAX_ORD) g_ord[g_nord++] = o;
}

// The order (catOrderRaw's arguments and result), with txt filled with the bytes that went 0 <-> 1
// across the call ("" if none were found), each added to the places orderPeekRaw reads.
static int orderLearnRaw(void *crew, int what, bool on, char *txt, size_t ntxt) {
  txt[0] = 0;
  if (!crew) return -1;
  int objN = ORD_OBJ;
  while (objN >= 0x100 && !rd(crew, g_oobj, objN)) objN /= 4;
  if (objN < 0x100) objN = 0;
  g_noblk = 0;
  ordAddBlocks(g_oobj, objN, (const unsigned char *)crew, objN, -1);
  int first = g_noblk;
  for (int k = 0; k < first; k++) ordAddBlocks(g_oblkData[k], ORD_BLK, (const unsigned char *)crew, objN, g_oblk[k].p1);
  int e = catOrderRaw(crew, what, on);
  if (e != 0) return e;
  int nfound = 0;
  if (objN && rd(crew, g_onow, objN))
    for (int o = 0; o < objN; o++)
      if (g_onow[o] != g_oobj[o] && g_onow[o] <= 1 && g_oobj[o] <= 1)
        ordNote(crew, -1, -1, o, g_oobj[o], g_onow[o], txt, ntxt, &nfound);
  for (int k = 0; k < g_noblk; k++) {
    if (!rd(g_oblk[k].p, g_onow, ORD_BLK)) continue;
    for (int o = 0; o < ORD_BLK; o++)
      if (g_onow[o] != g_oblkData[k][o] && g_onow[o] <= 1 && g_oblkData[k][o] <= 1)
        ordNote(crew, g_oblk[k].p1, g_oblk[k].p2, o, g_oblkData[k][o], g_onow[o], txt, ntxt, &nfound);
  }
  return 0;
}

// "place=value place=value ..." for this crew, at the places found so far on this crew (each followed
// afresh from the crew's own object); "" if none are known yet
static void orderPeekRaw(void *crew, char *txt, size_t ntxt) {
  txt[0] = 0;
  for (int k = 0; k < g_nord; k++) {
    const OrderLoc &o = g_ord[k];
    if (o.crew != crew) continue;
    const unsigned char *a = (const unsigned char *)crew;
    bool ok = a != nullptr;
    if (ok && o.p1 >= 0) {
      uintptr_t v = 0;
      ok = rd(a + o.p1, &v, 8) && dataBlock(v, ORD_BLK);
      a = (const unsigned char *)v;
      if (ok && o.p2 >= 0) {
        ok = rd(a + o.p2, &v, 8) && dataBlock(v, ORD_BLK);
        a = (const unsigned char *)v;
      }
    }
    unsigned char v = 0;
    char d[48], item[64];
    ordDesc(o, d, sizeof d);
    if (ok && rd(a + o.off, &v, 1)) sprintf_s(item, "%s%s=%d", txt[0] ? " " : "", d, v);
    else sprintf_s(item, "%s%s=?", txt[0] ? " " : "", d);
    if (strlen(txt) + strlen(item) + 1 < ntxt) strcat_s(txt, ntxt, item);
  }
}

// The character code's own switches: AnimatorLogic::debug_settings, four bytes of data exported by
// animator_logic.dll (struct CharacterDebugSettings). From the code that reads them:
//   [0], [1]  logging
//   [2]       CharacterMovable's update takes the velocity its environment object worked out (the
//             collision avoidance's answer) instead of the one it wanted
//   [3]       MovePathTracker::find_path_to_target asks the walker's PathFinder for a path; when it is 0
//             the path is the straight line to the target, whatever the environment's switches say
// set: idx 0..3 and v 0 / 1, or idx < 0 to only read. out: the four bytes. 0 ok; -1 not found; -100 exception.
static int debugSetRaw(int idx, int v, unsigned char *out) {
  if (!s_debugSettings || idx > 3) return -1;
  __try {
    unsigned char *p = (unsigned char *)s_debugSettings;
    if (idx >= 0) p[idx] = v ? 1 : 0;
    memcpy(out, p, 4);
    return 0;
  } __except (EXCEPTION_EXECUTE_HANDLER) {
    return -100;
  }
}

// The carrier's catapult control bubbles (the bow one between catapults 1 and 2, the waist one). The ship
// model animates them with two arguments (GT.animation_arguments.bubbles = {138, 139}); Transport.dll
// exports the ship's own command for them, and its code is readable:
//   woShip::setBubbleCommand(bubble, command): bubble 0 .. count-1, command 0..2, kept per bubble; on a
//     server it is also sent to the clients. Every frame the bubble's argument is then moved: command 2
//     takes it up to 1, any other command takes it down to 0.
//   woShip::getBubbleState(bubble): 0 the argument is at 1, 1 it is at 0, 2 in between, -1 no such bubble.
// Which end is "flush with the deck" is for the eye. ship: the woShip itself (a crew member's parent).
// cmd < 0: only read. *state: getBubbleState after the command. 0 ok; -1 missing / not a ship; -100 exception.
static const char N_SHIP[] = ".?AVwoShip@@";
typedef void (*FnBubbleCmd)(void *self, int bubble, int cmd);
typedef int (*FnBubbleState)(void *self, int bubble);
static int bubbleRaw(void *ship, int bubble, int cmd, int *state) {
  if (!ship || !s_bubbleCmd || !s_bubbleState || bubble < 0 || bubble > 7 || cmd > 2) return -1;
  __try {
    if (cmd >= 0) ((FnBubbleCmd)s_bubbleCmd)(ship, bubble, cmd);
    *state = ((FnBubbleState)s_bubbleState)(ship, bubble);
    return 0;
  } __except (EXCEPTION_EXECUTE_HANDLER) {
    return -100;
  }
}
// The carrier's four deck-edge elevators: the ship's own command, as for the bubbles (Transport.dll, code
// readable; it is what the BetteraircraftCarrier mod calls):
//   woShip::setElevatorCommand(elevator, command): elevator 0..3, command 0..2, kept per elevator; on a
//     server it is also sent to the clients.
//   woShip::getElevatorState(elevator): 1 its model argument is at 1, 0 at 0, 2 in between, -1 none.
// Which command lowers and which raises is for the eye. cmd < 0: only read. 0 ok; -1 missing; -100 exception.
static int elevatorRaw(void *ship, int elev, int cmd, int *state) {
  if (!ship || !s_elevCmd || !s_elevState || elev < 0 || elev > 3 || cmd > 2) return -1;
  __try {
    if (cmd >= 0) ((FnBubbleCmd)s_elevCmd)(ship, elev, cmd);
    *state = ((FnBubbleState)s_elevState)(ship, elev);
    return 0;
  } __except (EXCEPTION_EXECUTE_HANDLER) {
    return -100;
  }
}

// The air traffic control (woATC) of what a character is attached to: his ship.
// getATC is a virtual function, and the ship has its own (woShip::getATC, exported by Transport.dll, in
// place of wAirbase::getATC of Flight.dll). A virtual function expects `this` to point at the base class
// its table slot belongs to, which need not be the start of the object: so the exported function is
// looked for in the object's own virtual tables and called with the subobject it was found in. (On
// 2026-11-15 wAirbase::getATC called on the wAirbase part of the ship gave nothing usable.) What comes
// back is only taken if its own type information says woATC.
// *why: 0 found; -1 no getATC function / the object has none of them in its tables; -2 it gave no woATC.
static const char N_ATC[] = ".?AVwoATC@@";
static void *atcOfObject(void *obj, int *why) {
  Rtti r;
  *why = -1;
  if (!obj || !rttiRaw(obj, &r)) return nullptr;
  void *cands[2] = {s_shipGetAtc, s_getAtc};
  for (int i = 0; i < 2; i++) {
    int mdisp = 0, slot = 0;
    if (!cands[i] || !findVirtual(r, cands[i], &mdisp, &slot)) continue;
    *why = -2;
    void *atc = nullptr;
    Rtti ra;
    if (!gThis(cands[i], (char *)r.complete + mdisp, &atc) || !atc || !rttiRaw(atc, &ra)) continue;
    if (strcmp(ra.name, N_ATC) != 0 && !baseOf(ra, N_ATC)) continue;
    *why = 0;
    return atc;
  }
  return nullptr;
}
static void *atcOf(const Person *q, int *why) { return atcOfObject(q->parent, why); }

// What the carrier's air traffic control says this instant. All six are its own getters, exported by
// Flight.dll; nothing is changed.
//   canLand / canTakeoff   woATC::canStartLanding / canStartTakeoff
//   foul                   woATC::getFoulDeck
//   rwOpen                 woATC::isRunWayOpen
//   freeCats               woATC::getFreeCatapultsNum (a virtual: called with the subobject its table slot
//                          is in; -1 if it is in none of the ATC's tables)
//   recoveryCase           woATC::getRecoveryCASE (an enum, as a number)
// atc: from atcOf. 0 ok; -1 functions missing / no ATC; -100 exception.
struct DeckState {
  int canLand, canTakeoff, foul, rwOpen, freeCats, recoveryCase;
};
typedef bool (*FnThisBool)(void *self);
static int deckStateRaw(void *atc, DeckState *o) {
  if (!atc || !s_atcCanLand || !s_atcCanTakeoff || !s_atcFoulDeck || !s_atcRwOpen || !s_atcCase) return -1;
  Rtti r;
  int mdisp = 0, slot = 0;
  void *catsThis = (s_atcFreeCats && rttiRaw(atc, &r) && findVirtual(r, s_atcFreeCats, &mdisp, &slot)) ? (char *)r.complete + mdisp : nullptr;
  __try {
    o->canLand = ((FnThisBool)s_atcCanLand)(atc) ? 1 : 0;
    o->canTakeoff = ((FnThisBool)s_atcCanTakeoff)(atc) ? 1 : 0;
    o->foul = ((FnThisBool)s_atcFoulDeck)(atc) ? 1 : 0;
    o->rwOpen = ((FnThisBool)s_atcRwOpen)(atc) ? 1 : 0;
    o->freeCats = catsThis ? ((FnInt)s_atcFreeCats)(catsThis) : -1;
    o->recoveryCase = ((FnInt)s_atcCase)(atc);
    return 0;
  } __except (EXCEPTION_EXECUTE_HANDLER) {
    return -100;
  }
}

// The ATC's own teleport of an aircraft: woATC::teleport_aircraft(wPosition3<double>, unsigned int),
// exported by Flight.dll (names only: what it does with the position is for the eye). The position is
// DCS's world position type in double precision: four vectors x, y, z (the axes) and p, each three
// doubles in a 32-byte slot (as Transport.dll's own code reads one), 128 bytes, handed over by address
// as a by-value argument of that size is. v: 12 numbers, the axes x, y, z and the position, in world
// coordinates. id: the aircraft's object id. 0 called; -1 function missing / no ATC; -100 exception.
struct Pos3d {
  double v[4][4];
};
typedef void (*FnTeleport)(void *self, Pos3d *pos, unsigned int id);
static int teleportRaw(void *atc, const double *v, unsigned int id) {
  if (!atc || !s_atcTeleport) return -1;
  Pos3d p;
  for (int i = 0; i < 4; i++) {
    for (int k = 0; k < 3; k++) p.v[i][k] = v[i * 3 + k];
    p.v[i][3] = 0;
  }
  __try {
    ((FnTeleport)s_atcTeleport)(atc, &p, id);
    return 0;
  } __except (EXCEPTION_EXECUTE_HANDLER) {
    return -100;
  }
}

// One of the ship's model arguments, read or written. woShip::GetDrawArguments (Transport.dll, a virtual:
// found in the ship's own tables and called on the part of the ship it belongs to, as getATC is) gives
// the list the ship's model is drawn from: floats, numbered as the model's arguments are (the bubbles'
// 138 and 139, the elevators' 57..60, their hangar doors' 47, 48, 53, 54). The ship's own code reads its
// bubbles' and elevators' places from this same list every frame.
// obj: what a character is attached to. set: a value to write, or null. *out: the value now.
// 0 ok; -1 function missing / not in the object's tables; -2 no such argument / the list unreadable; -100 exception.
typedef void (*FnSetArg)(void *self, int idx, float v);
typedef void (*FnVoidThis)(void *self);
static int shipArgRaw(void *obj, int idx, const float *set, float *out) {
  Rtti r;
  if (!obj || !s_shipDrawArgs || !rttiRaw(obj, &r)) return -1;
  int mdisp = 0, slot = 0;
  if (!findVirtual(r, s_shipDrawArgs, &mdisp, &slot)) return -1;
  void *vec = nullptr;
  if (!gThis(s_shipDrawArgs, (char *)r.complete + mdisp, &vec) || !vec) return -1;
  float *b = nullptr, *e = nullptr;
  if (!rd(vec, &b, sizeof b) || !rd((char *)vec + sizeof b, &e, sizeof e) || !b || e < b) return -2;
  size_t n = (size_t)(e - b);
  if (idx < 0 || (size_t)idx >= n || n > 100000) return -2;
  float v = 0;
  if (!rd(b + idx, &v, sizeof v)) return -2;
  if (set) {
    // the ship's own setter if it is in the ship's tables (woShip::setDrawArgumentValue), else the list itself
    int md2 = 0, sl2 = 0;
    __try {
      if (s_shipSetArg && findVirtual(r, s_shipSetArg, &md2, &sl2)) ((FnSetArg)s_shipSetArg)((char *)r.complete + md2, idx, *set);
      else b[idx] = *set;
    } __except (EXCEPTION_EXECUTE_HANDLER) {
      return -100;
    }
    v = *set;
  }
  *out = v;
  return 0;
}

// A moving object put somewhere: MovingObject::ForcePosition(const wPosition3<double> &), a virtual of
// WorldGeneral.dll. The object is looked up in the world's register by its id (kind 0x20, the id at
// +0x1c of the entry, as the registry scan reads it). An aircraft class has its own ForcePosition in
// place of MovingObject's, so the function is called through the object's OWN virtual table: the slot is
// the one MovingObject's exported table (the table of its first base, viObject) holds the exported
// function in, and the table is the one at the object's MovingObject part.
// v: 12 numbers as for teleportRaw. *cls: the object's class name (for the log).
// 0 called; -1 functions missing; -2 no object with that id; -3 not a MovingObject / slot not found; -100 exception.
static const char N_MOVING[] = ".?AVMovingObject@@";
typedef void (*FnForcePos)(void *self, const Pos3d *pos);
static int forcePosRaw(unsigned int id, const double *v, const char **cls) {
  *cls = "";
  if (!s_regInstance || !s_forcePos || !s_moVtable) return -1;
  void *entry = nullptr;
  __try {
    void *reg = *(void **)s_regInstance;
    if (!reg) return -1;
    RegNextFn next = (RegNextFn)((*(void ***)reg)[0x18 / 8]);
    void *e = next(reg, 0, 0x20);
    int first = e ? *(int *)((char *)e + 0x1c) : 0;
    for (int n = 0; e && n < 20000; n++) {
      if (*(unsigned int *)((char *)e + 0x1c) == id) {
        entry = e;
        break;
      }
      e = next(reg, *(int *)((char *)e + 0x1c), 0x20);
      if (e && *(int *)((char *)e + 0x1c) == first) break;
    }
  } __except (EXCEPTION_EXECUTE_HANDLER) {
    return -100;
  }
  if (!entry) return -2;
  Rtti r;
  if (!rttiRaw(entry, &r)) return -3;
  *cls = r.name;
  void *mo = strcmp(r.name, N_MOVING) == 0 ? r.complete : baseOf(r, N_MOVING);
  if (!mo) return -3;
  int slot = -1;
  for (int s = 0; s < 400 && slot < 0; s++) {
    void *e = nullptr;
    if (!rd((void **)s_moVtable + s, &e, sizeof e)) break;
    if (e == s_forcePos) slot = s;
    else if (!inImage(e, true)) break;
  }
  void **vptr = nullptr;
  void *fn = nullptr;
  if (slot < 0 || !rd(mo, &vptr, sizeof vptr) || !inImage(vptr, false) || !rd(vptr + slot, &fn, sizeof fn) || !inImage(fn, true)) return -3;
  Pos3d p;
  for (int i = 0; i < 4; i++) {
    for (int k = 0; k < 3; k++) p.v[i][k] = v[i * 3 + k];
    p.v[i][3] = 0;
  }
  __try {
    ((FnForcePos)fn)(mo, &p);
    return 0;
  } __except (EXCEPTION_EXECUTE_HANDLER) {
    return -100;
  }
}

// A catapult crew made to let go of the aircraft it has: wCarrierCrew::reset_LA (Flight.dll, by name).
// What the crew, the holdback bar and the blast deflector then do is for the eye. 0 called; -1 missing; -100 exception.
static int crewDropRaw(void *crew) {
  if (!crew || !s_crewResetLa) return -1;
  __try {
    ((FnVoidThis)s_crewResetLa)(crew);
    return 0;
  } __except (EXCEPTION_EXECUTE_HANDLER) {
    return -100;
  }
}

// What the ship has been TOLD to do with its bubbles and elevators (the command kept per bubble / per
// elevator: getBubbleState and getElevatorState only say where the model argument is). The two setters'
// own code says where the commands are kept, so the places are read out of that code and nothing is
// assumed about the ship's layout:
//   woShip::setBubbleCommand    cmp edi,[rcx+COUNT] (3B B9 imm32) ... mov [rcx+rdi*4+CMD],r8d (44 89 84 B9 imm32)
//   woShip::setElevatorCommand  mov rcx,[rcx+OBJ] (48 8B 89 imm32) ... mov [rcx+rdi*4+CMD8],ebx (89 5C B9 imm8)
// A setter that does not look like that (another DCS version) leaves the place unknown: nothing is read.
struct CmdPlaces {
  int done;
  int bubbleCount, bubbleCmd;  // offsets in the woShip; -1 unknown
  int elevObj, elevCmd;        // the elevators' object in the woShip, the commands in that; -1 unknown
};
static CmdPlaces g_cmdPlaces = {0, -1, -1, -1, -1};
static void findCmdPlaces(const unsigned char *bub, const unsigned char *elev, CmdPlaces *o) {
  o->done = 1;
  o->bubbleCount = o->bubbleCmd = o->elevObj = o->elevCmd = -1;
  unsigned char c[96];
  if (bub && rd(bub, c, sizeof c)) {
    int cnt = -1, cmd = -1;
    for (int i = 0; i + 8 <= (int)sizeof c; i++) {
      if (cnt < 0 && c[i] == 0x3B && c[i + 1] == 0xB9) memcpy(&cnt, c + i + 2, 4);
      if (cmd < 0 && c[i] == 0x44 && c[i + 1] == 0x89 && c[i + 2] == 0x84 && c[i + 3] == 0xB9) memcpy(&cmd, c + i + 4, 4);
    }
    if (cnt > 0 && cmd > cnt && cmd - cnt <= 64 && cnt < 0x100000) o->bubbleCount = cnt, o->bubbleCmd = cmd;
  }
  if (elev && rd(elev, c, sizeof c)) {
    int obj = -1, cmd = -1;
    for (int i = 0; i + 8 <= (int)sizeof c; i++) {
      if (obj < 0 && c[i] == 0x48 && c[i + 1] == 0x8B && c[i + 2] == 0x89) memcpy(&obj, c + i + 3, 4);
      if (obj >= 0 && cmd < 0 && c[i] == 0x89 && c[i + 1] == 0x5C && c[i + 2] == 0xB9) cmd = c[i + 3];
    }
    if (obj > 0 && obj < 0x100000 && cmd > 0) o->elevObj = obj, o->elevCmd = cmd;
  }
}
// bub[0..1], elev[0..3]: the commands, -1 where unknown. Returns how many were read.
static int shipCmdsRaw(void *ship, const CmdPlaces &pl, int *bub, int *elev) {
  int n = 0;
  for (int i = 0; i < 2; i++) bub[i] = -1;
  for (int i = 0; i < 4; i++) elev[i] = -1;
  if (!ship) return 0;
  int count = 0;
  if (pl.bubbleCount > 0 && rd((char *)ship + pl.bubbleCount, &count, 4) && count >= 0 && count <= 2)
    for (int i = 0; i < count; i++) {
      int v;
      if (rd((char *)ship + pl.bubbleCmd + 4 * i, &v, 4) && v >= 0 && v <= 2) bub[i] = v, n++;
    }
  void *obj = nullptr;
  if (pl.elevObj > 0 && rd((char *)ship + pl.elevObj, &obj, sizeof obj) && obj)
    for (int i = 0; i < 4; i++) {
      int v;
      if (rd((char *)obj + pl.elevCmd + 4 * i, &v, 4) && v >= 0 && v <= 2) elev[i] = v, n++;
    }
  return n;
}

// the ship a character is attached to, if what he is attached to is a woShip by its own type information
static void *shipOf(const Person *q) {
  Rtti r;
  if (!q->parent || !rttiRaw(q->parent, &r)) return nullptr;
  if (strcmp(r.name, N_SHIP) == 0) return r.complete;
  return baseOf(r, N_SHIP);
}

// The owner's crew environment's switches: read, after setting those of setAvoid / setPath that are 0 or 1
// (-1: leave). out[0] avoid collisions, out[1] path avoid collisions. 0 ok; -1 missing / no environment; -100 exception.
static int envFlagsRaw(void *owner, int setAvoid, int setPath, int *out) {
  if (!owner || !s_crewEnv || !s_envAvoid || !s_envPathAvoid) return -1;
  __try {
    void *env = ((FnThis)s_crewEnv)(owner);
    if (!env) return -1;
    if (setAvoid >= 0 && s_envSetAvoid) ((FnSetBool)s_envSetAvoid)(env, setAvoid != 0);
    if (setPath >= 0 && s_envSetPathAvoid) ((FnSetBool)s_envSetPathAvoid)(env, setPath != 0);
    out[0] = ((FnByte)s_envAvoid)(env) & 255;
    out[1] = ((FnByte)s_envPathAvoid)(env) & 255;
    return 0;
  } __except (EXCEPTION_EXECUTE_HANDLER) {
    return -100;
  }
}

// ---------------------------------------------------------------- crewtest-13: things put in a place
// place: a character put at a place of his ship (x forward, y up, z to starboard), facing fx, fz, through
// AnimatedCharacterBase::set_origin: the pose his animation is played from, relative to what he is attached
// to. For a man who stands (a walk moves that pose itself). The height is whatever is given: a man can be
// put on the hangar deck. 0 done; -1 function missing; -2 his pose can't be read; -4 no facing; -100 exception.
// crewtest-16: set_origin alone moved nobody (2026-11-15, the tow's driver: placed every frame for a minute, the
// call never failed, and he stood where he was on the flight deck: set_origin only stores the pose at +0x2D8, and
// nothing reads that for a man who stands). So his own pose on the ship, the one local_position() returns and
// the list reads his place from, is written as well. g_placedLocal: whether that last write went through.
static bool g_placedLocal = false;
static int placeRaw(Person *q, double x, double y, double z, double fx, double fz) {
  if (!s_setOrigin || !q->acb) return -1;
  Rtti r;
  if (!rttiRaw(q->complete, &r)) return -2;
  readPose(*q, r);
  int L = q->locLayout;
  if (!L) return -2;
  double m = sqrt(fx * fx + fz * fz);
  if (m < 1e-6) return -4;
  float pose[16];
  memcpy(pose, q->loc, sizeof pose);
  float *X = posAxisW(pose, L, 0), *Y = posAxisW(pose, L, 1), *Z = posAxisW(pose, L, 2), *P = posAxisW(pose, L, 3);
  X[0] = (float)(fx / m), X[1] = 0, X[2] = (float)(fz / m);
  Y[0] = 0, Y[1] = 1, Y[2] = 0;
  Z[0] = -X[2], Z[1] = 0, Z[2] = X[0];
  P[0] = (float)x, P[1] = (float)y, P[2] = (float)z;
  g_placedLocal = false;
  if (!gSetRef(s_setOrigin, q->acb, pose)) return -100;
  void *lp = nullptr;
  if (s_localPos && gThis(s_localPos, q->acb, &lp) && lp) g_placedLocal = wr(lp, pose, (L == 16 ? 16 : 12) * sizeof(float));
  return 0;
}

// staticpos: a static object (a script-made "static": lLandVehicle and the like, all lLandObject) put
// somewhere in the world through its OWN SetPos (lLandObject::SetPos is virtual: its slot is read from
// lLandObject's exported virtual table and the call goes through the object's own table). The object is
// found by its id (the mission script's object.id_) in the world's register, whatever kind it is filed
// under, and remembered. v: 12 world numbers (x, y, z axes, position); scale: the axes are stretched by
// these (a model drawn longer or thicker, if the drawing honours it).
// 0 done; -1 functions missing; -2 no such object; -3 not an lLandObject / no SetPos slot; -100 exception.
static const char N_LAND[] = ".?AVlLandObject@@";
struct StaticRef {
  unsigned int id;
  void *obj;
  int kind;
};
static StaticRef g_statics[8];
static int g_nstatics;
static void *registeredById(unsigned int id, int *kind) {
  for (int i = 0; i < g_nstatics; i++)
    if (g_statics[i].id == id) {
      unsigned int nowId = 0;
      if (rd((char *)g_statics[i].obj + 0x1c, &nowId, sizeof nowId) && nowId == id) {
        *kind = g_statics[i].kind;
        return g_statics[i].obj;
      }
      g_statics[i] = g_statics[--g_nstatics];
      break;
    }
  void *found = nullptr;
  for (int k = 0; k < 256 && !found; k++) {
    __try {
      void *reg = *(void **)s_regInstance;
      if (!reg) return nullptr;
      RegNextFn next = (RegNextFn)((*(void ***)reg)[0x18 / 8]);
      void *e = next(reg, 0, k);
      int first = e ? *(int *)((char *)e + 0x1c) : 0;
      for (int n = 0; e && n < 20000; n++) {
        if (*(unsigned int *)((char *)e + 0x1c) == id) {
          found = e;
          *kind = k;
          break;
        }
        e = next(reg, *(int *)((char *)e + 0x1c), k);
        if (e && *(int *)((char *)e + 0x1c) == first) break;
      }
    } __except (EXCEPTION_EXECUTE_HANDLER) {
    }
  }
  if (found && g_nstatics < 8) g_statics[g_nstatics++] = {id, found, *kind};
  return found;
}
// What the last staticPosRaw found: the object's flag word (DCS's lLandObject::SetPos does nothing at all when any of
// the bits 0x1D000009 of the word at +0x18 is set: read in edObjects.dll), and whether the object then said it was
// where it had been put (its own position, asked for as every drawn object's is: 1 yes, 0 no, -1 could not be asked).
// crewtest-17: A STATIC LINKED TO A SHIP IS THE SHIP'S CHILD (edObjects.dll, read 2026-11-15): viObjectNode has a
// parent (Parent(), ChangeParent()); lLandObject keeps its pose at +0x158 in ITS PARENT'S frame when it has one
// (GetPosition() then gives the world pose worked out through the parents), and SetPos() stores what it is given
// there and tells the world the object has moved (ChangePos(GetPosition())). So for a linked static the 12 numbers
// are a place ON THE SHIP (its own axes: x forward, y up, z to starboard), any height, and the object is drawn with
// the ship: no single-precision world numbers, no shimmer. g_spParent: the object's parent's class name ("" none).
static unsigned int g_spFlags;
static int g_spTook = -1;
static char g_spParent[96];
static void *landObjectById(unsigned int id, const char **cls, int *kind, void **entryOut) {
  void *entry = registeredById(id, kind);
  if (entryOut) *entryOut = entry;
  if (!entry) return nullptr;
  Rtti r;
  if (!rttiRaw(entry, &r)) return nullptr;
  *cls = r.name;
  return strcmp(r.name, N_LAND) == 0 ? r.complete : baseOf(r, N_LAND);
}
static void parentOf(void *lo) {
  g_spParent[0] = 0;
  void *par = nullptr;
  if (!lo || !s_nodeParent || !gThis(s_nodeParent, lo, &par) || !par) return;
  Rtti rp;
  strcpy_s(g_spParent, rttiRaw(par, &rp) ? rp.name : "?");
}
// 0: found (g_spParent, g_spFlags set); -1 functions missing; -2 no such object; -3 not an lLandObject
static int staticInfoRaw(unsigned int id, const char **cls, int *kind) {
  *cls = "";
  *kind = -1;
  g_spFlags = 0, g_spParent[0] = 0;
  if (!s_regInstance) return -1;
  void *entry = nullptr;
  void *lo = landObjectById(id, cls, kind, &entry);
  if (!entry) return -2;
  if (!lo) return -3;
  rd((char *)lo + 0x18, &g_spFlags, sizeof g_spFlags);
  parentOf(lo);
  return 0;
}
static int staticPosRaw(unsigned int id, const double *v, const double *scale, const char **cls, int *kind) {
  *cls = "";
  *kind = -1;
  g_spFlags = 0, g_spTook = -1, g_spParent[0] = 0;
  if (!s_regInstance || !s_landSetPos || !s_landVtable) return -1;
  void *entry = registeredById(id, kind);
  if (!entry) return -2;
  Rtti r;
  if (!rttiRaw(entry, &r)) return -3;
  *cls = r.name;
  void *lo = strcmp(r.name, N_LAND) == 0 ? r.complete : baseOf(r, N_LAND);
  if (!lo) return -3;
  static int slot = -1;
  for (int s = 0; s < 400 && slot < 0; s++) {
    void *e = nullptr;
    if (!rd((void **)s_landVtable + s, &e, sizeof e)) break;
    if (e == s_landSetPos) slot = s;
    else if (!inImage(e, true)) break;
  }
  void **vptr = nullptr;
  void *fn = nullptr;
  if (slot < 0 || !rd(lo, &vptr, sizeof vptr) || !inImage(vptr, false) || !rd(vptr + slot, &fn, sizeof fn) || !inImage(fn, true)) return -3;
  __declspec(align(16)) float p[16];
  for (int i = 0; i < 4; i++) {
    for (int k = 0; k < 3; k++) p[i * 4 + k] = (float)(v[i * 3 + k] * (i < 3 ? scale[i] : 1.0));
    p[i * 4 + 3] = 0;
  }
  rd((char *)lo + 0x18, &g_spFlags, sizeof g_spFlags);
  parentOf(lo);
  if (!gSetRef(fn, lo, p)) return -100;
  if (g_spParent[0]) {
    // a child: what it was given is its place in its parent's frame, kept at +0x158
    float own[16];
    if (rd((char *)lo + 0x158, own, sizeof own))
      g_spTook = (fabsf(own[12] - p[12]) < 0.05f && fabsf(own[13] - p[13]) < 0.05f && fabsf(own[14] - p[14]) < 0.05f) ? 1 : 0;
    return 0;
  }
  float w[16];
  int L = worldPose(entry, w);
  if (L) {
    const float *pw = posAxis(w, L, 3);
    g_spTook = (fabsf(pw[0] - p[12]) < 0.05f && fabsf(pw[1] - p[13]) < 0.05f && fabsf(pw[2] - p[14]) < 0.05f) ? 1 : 0;
  }
  return 0;
}

// objarg: a model argument of any drawn object found by its id (the player's jet: the nose wheel's steering
// while it is towed). No function of DCS's sets an aircraft's arguments by name, but every drawn object has
// the same virtual "the list of my model arguments" (Graphics::ModelInstance's GetDrawArguments): its slot
// and the base class it belongs to are read from the ship, whose override is exported
// (woShip::GetDrawArguments), and the object's own function in that slot gives its list. The value is
// written into the list. (What the aircraft's own code writes there every frame may overwrite it: the
// hook reads the value back on the next frame and says so.)
// 0 done; -1 functions missing / the ship's slot not found; -2 no object with that id; -3 the object has
// no such base or slot; -4 no such argument; -100 exception.
static int objArgRaw(void *ship, unsigned int id, int idx, const float *set, float *out, const char **cls) {
  *cls = "";
  Rtti rs;
  if (!ship || !s_shipDrawArgs || !s_regInstance || !rttiRaw(ship, &rs)) return -1;
  int mdisp = 0, slot = 0;
  if (!findVirtual(rs, s_shipDrawArgs, &mdisp, &slot)) return -1;
  const char *base = deepestBaseAt(rs, mdisp);
  if (!base) return -1;
  int kind = -1;
  void *obj = registeredById(id, &kind);
  if (!obj) return -2;
  Rtti ra;
  if (!rttiRaw(obj, &ra)) return -3;
  *cls = ra.name;
  void *sub = strcmp(ra.name, base) == 0 ? ra.complete : baseOf(ra, base);
  void **vptr = nullptr;
  void *fn = nullptr, *vec = nullptr;
  if (!sub || !rd(sub, &vptr, sizeof vptr) || !inImage(vptr, false) || !rd(vptr + slot, &fn, sizeof fn) || !inImage(fn, true)) return -3;
  if (!gThis(fn, sub, &vec) || !vec) return -3;
  float *b = nullptr, *e = nullptr;
  if (!rd(vec, &b, sizeof b) || !rd((char *)vec + sizeof b, &e, sizeof e) || !b || e < b) return -4;
  size_t n = (size_t)(e - b);
  if (idx < 0 || (size_t)idx >= n || n > 100000) return -4;
  float v = 0;
  if (!rd(b + idx, &v, sizeof v)) return -4;
  if (set) {
    __try {
      b[idx] = *set;
    } __except (EXCEPTION_EXECUTE_HANDLER) {
      return -100;
    }
    v = *set;
  }
  *out = v;
  return 0;
}


#ifndef CATCC_SELFTEST
// ---------------------------------------------------------------- Lua 5.1, resolved from DCS's lua.dll
struct lua_State;
typedef int (*lua_CFunction)(lua_State *);
struct luaL_Reg {
  const char *name;
  lua_CFunction func;
};
static double (*p_lua_tonumber)(lua_State *, int);
static int (*p_lua_toboolean)(lua_State *, int);
static const char *(*p_lua_tolstring)(lua_State *, int, size_t *);
static int (*p_lua_gettop)(lua_State *);
static void (*p_lua_pushnil)(lua_State *);
static void (*p_lua_pushnumber)(lua_State *, double);
static void (*p_lua_pushboolean)(lua_State *, int);
static void (*p_lua_pushstring)(lua_State *, const char *);
static void (*p_lua_createtable)(lua_State *, int, int);
static void (*p_lua_setfield)(lua_State *, int, const char *);
static void (*p_lua_rawseti)(lua_State *, int, int);
static void (*p_luaL_register)(lua_State *, const char *, const luaL_Reg *);

template <typename T> static bool resolve(HMODULE m, const char *name, T &out) {
  out = m ? reinterpret_cast<T>(GetProcAddress(m, name)) : nullptr;
  return out != nullptr;
}
static bool loadLua() {
  HMODULE m = GetModuleHandleA("lua.dll");
  return resolve(m, "lua_tonumber", p_lua_tonumber) && resolve(m, "lua_toboolean", p_lua_toboolean) &&
         resolve(m, "lua_tolstring", p_lua_tolstring) && resolve(m, "lua_gettop", p_lua_gettop) &&
         resolve(m, "lua_pushnil", p_lua_pushnil) && resolve(m, "lua_pushnumber", p_lua_pushnumber) &&
         resolve(m, "lua_pushboolean", p_lua_pushboolean) && resolve(m, "lua_pushstring", p_lua_pushstring) &&
         resolve(m, "lua_createtable", p_lua_createtable) && resolve(m, "lua_setfield", p_lua_setfield) &&
         resolve(m, "lua_rawseti", p_lua_rawseti) && resolve(m, "luaL_register", p_luaL_register);
}
static int fail(lua_State *L, const char *msg) {
  p_lua_pushnil(L);
  p_lua_pushstring(L, msg);
  return 2;
}
static void setNum(lua_State *L, const char *k, double v) {
  p_lua_pushnumber(L, v);
  p_lua_setfield(L, -2, k);
}
static void setStr(lua_State *L, const char *k, const char *v) {
  p_lua_pushstring(L, v);
  p_lua_setfield(L, -2, k);
}
static void setBool(lua_State *L, const char *k, bool v) {
  p_lua_pushboolean(L, v ? 1 : 0);
  p_lua_setfield(L, -2, k);
}

static void pushPeople(lua_State *L, int from) {
  p_lua_createtable(L, g_npeople - from, 0);
  for (int i = from; i < g_npeople; i++) {
    const Person &q = g_people[i];
    p_lua_createtable(L, 0, 16);
    setNum(L, "h", (double)(uintptr_t)q.complete);
    setStr(L, "name", q.name);
    setStr(L, "full", q.full);
    setStr(L, "cls", q.cls);
    setNum(L, "id", q.id);
    if (q.hasState) setNum(L, "state", q.state);
    setBool(L, "movable", q.cm != nullptr);
    setNum(L, "routes", q.routes);
    setNum(L, "parent", (double)(uintptr_t)q.parent);
    {
      const ParentPose *pp = parentPose(q.parent);  // where his ship is in the world
      if (pp && pp->layout) {
        const float *p = posAxis(pp->f, pp->layout, 3);
        setNum(L, "pwx", p[0]);
        setNum(L, "pwy", p[1]);
        setNum(L, "pwz", p[2]);
      }
    }
    setNum(L, "src", q.src);
    setNum(L, "layout", q.locLayout);
    if (q.locLayout) {
      const float *p = posAxis(q.loc, q.locLayout, 3), *x = posAxis(q.loc, q.locLayout, 0);
      setNum(L, "x", p[0]);
      setNum(L, "y", p[1]);
      setNum(L, "z", p[2]);
      setNum(L, "fx", x[0]);
      setNum(L, "fz", x[2]);
    } else {
      char raw[16 * 14 + 1];
      size_t u = 0;
      for (int k = 0; k < 16; k++) u += sprintf_s(raw + u, sizeof raw - u, "%.3g ", q.loc[k]);
      setStr(L, "rawloc", raw);
    }
    if (q.wldLayout) {
      const float *p = posAxis(q.wld, q.wldLayout, 3);
      setNum(L, "wx", p[0]);
      setNum(L, "wy", p[1]);
      setNum(L, "wz", p[2]);
    }
    p_lua_rawseti(L, -2, i - from + 1);
  }
}
static void pushClasses(lua_State *L, const Tally &t) {
  p_lua_createtable(L, t.ncls, 0);
  for (int i = 0; i < t.ncls; i++) {
    p_lua_createtable(L, 0, 4);
    setStr(L, "name", t.cls[i].name);
    setNum(L, "n", t.cls[i].n);
    setBool(L, "person", t.cls[i].person != 0);
    setStr(L, "bases", t.cls[i].bases);
    p_lua_rawseti(L, -2, i + 1);
  }
}

static int l_info(lua_State *L) {
  loadDcs();
  p_lua_createtable(L, 0, 4);
  setStr(L, "version", VERSION);
  setNum(L, "thread", GetCurrentThreadId());
  setNum(L, "cookieOff", cookieOff());  // where a character keeps his animation instance (-1: not found)
  p_lua_createtable(L, 0, 0);
  int n = 0;
  for (int i = 0; i < NSYMS; i++)
    if (!*SYMS[i].out) {
      char one[200];
      sprintf_s(one, "%s (%s)", SYMS[i].what, SYMS[i].dll);
      p_lua_pushstring(L, one);
      p_lua_rawseti(L, -2, ++n);
    }
  p_lua_setfield(L, -2, "missing");
  return 1;
}

static int l_setlog(lua_State *L) {
  const char *p = p_lua_tolstring(L, 1, nullptr);
  if (p) strncpy_s(g_logPath, p, _TRUNCATE);
  return 0;
}

static int l_scan(lua_State *L) {
  loadDcs();
  g_strOk = g_strBad = 0;
  g_nparents = 0;  // the ships move: their positions are read afresh every scan
  refreshPeople();
  memset(&g_scanTally, 0, sizeof g_scanTally);
  int envErr = scanEnvRaw();
  int regCount = 0, regPeople = 0;
  int regErr = scanRegistryRaw(g_scanTally, 0x20, &regCount, &regPeople);
  p_lua_createtable(L, 0, 10);
  setNum(L, "envs", g_envs);
  setNum(L, "envObjects", g_envObjs);
  setNum(L, "envErr", envErr);
  setNum(L, "regCount", regCount);
  setNum(L, "regErr", regErr);
  setNum(L, "strOk", g_strOk);
  setNum(L, "strBad", g_strBad);
  setNum(L, "noRtti", g_scanTally.noRtti);
  pushPeople(L, 0);
  p_lua_setfield(L, -2, "people");
  pushClasses(L, g_scanTally);
  p_lua_setfield(L, -2, "classes");
  return 1;
}

// one registry kind; characters it finds join the list (their handles work in commands)
static int l_registry(lua_State *L) {
  loadDcs();
  g_nparents = 0;  // ships move: no ship position older than this call
  int kind = (int)p_lua_tonumber(L, 1);
  memset(&g_regTally, 0, sizeof g_regTally);
  int before = g_npeople, count = 0, people = 0;
  nlog("registry kind 0x%x: start", kind);
  int err = scanRegistryRaw(g_regTally, kind, &count, &people);
  nlog("registry kind 0x%x: %d objects, %d characters, err %d", kind, count, people, err);
  p_lua_createtable(L, 0, 5);
  setNum(L, "n", count);
  setNum(L, "err", err);
  setNum(L, "characters", people);
  pushPeople(L, before);
  p_lua_setfield(L, -2, "people");
  pushClasses(L, g_regTally);
  p_lua_setfield(L, -2, "classes");
  return 1;
}

static int l_heapscan(lua_State *L) {
  loadDcs();
  g_nparents = 0;  // ships move: no ship position older than this call
  double maxS = p_lua_gettop(L) >= 1 ? p_lua_tonumber(L, 1) : 30;
  if (!(maxS >= 1 && maxS <= 120)) maxS = 30;
  memset(&g_heapTally, 0, sizeof g_heapTally);
  int before = g_npeople;
  nlog("memory scan: start (up to %.0f s)", maxS);
  ULONGLONG t0 = GetTickCount64();
  int err = heapScanRaw(maxS);
  double secs = (GetTickCount64() - t0) / 1000.0;
  nlog("memory scan: %.1f s, %.0f MB read (%.0f MB not in memory, left alone), %d hits, %d new characters, %d faults, %s", secs,
       g_heapBytes / 1048576.0, g_heapSkipped / 1048576.0, g_heapHits, g_npeople - before, g_heapFaults, err ? "out of time (partial)" : "complete");
  p_lua_createtable(L, 0, 8);
  setNum(L, "err", err);
  setNum(L, "faults", g_heapFaults);
  setNum(L, "seconds", secs);
  setNum(L, "bytes", (double)g_heapBytes);
  setNum(L, "skipped", (double)g_heapSkipped);
  setNum(L, "hits", g_heapHits);
  pushPeople(L, before);
  p_lua_setfield(L, -2, "people");
  pushClasses(L, g_heapTally);
  p_lua_setfield(L, -2, "classes");
  return 1;
}

static int l_anims(lua_State *L) {
  loadDcs();
  Person *q = findPerson(p_lua_tonumber(L, 1));
  if (!q) return fail(L, "no such character (scan again)");
  if (!q->mgr) return fail(L, "the character has no animation manager");
  if (g_animMgr != q->mgr) {
    int e = readAnimsRaw(q->mgr);
    if (e != 0) {
      char msg[64];
      sprintf_s(msg, "animation list unreadable (%d)", e);
      return fail(L, msg);
    }
  }
  p_lua_createtable(L, g_nanim, 0);
  for (int i = 0; i < g_nanim; i++) {
    p_lua_pushstring(L, g_anim[i]);
    p_lua_rawseti(L, -2, i + 1);
  }
  return 1;
}

// Play an animation, by name. The index set_animation takes is DCS's own for that name
// (get_animation_index): the name list is alphabetical with the 16 blend spaces mixed in, so a name's
// place in the list is NOT its index (seen in DCS 2.9.31: "sign_attention_taxi" is 211th in the list,
// index 195). Names are lower case.
static int l_play(lua_State *L) {
  loadDcs();
  Person *q = findPerson(p_lua_tonumber(L, 1));
  if (!q) return fail(L, "no such character (scan again)");
  if (!s_setAnim || !s_animIndex) return fail(L, "set_animation / get_animation_index not found");
  if (!q->mgr) return fail(L, "the character has no animation manager");
  if (g_strOk < 3 || g_strBad > 0) return fail(L, "string layout not confirmed (names unreadable): not passing a string to DCS");
  const char *name = p_lua_tolstring(L, 2, nullptr);
  if (!name || !name[0] || strlen(name) > 70) return fail(L, "bad name");
  static char keep[72];
  strcpy_s(keep, name);
  EdStr s;
  makeStr(&s, keep);
  int idx = -1, count = 0;
  if (!gIdx(s_animIndex, q->mgr, &s, false, &idx)) {
    nlog("play: get_animation_index(\"%s\") EXCEPTION", keep);
    return fail(L, "get_animation_index raised an exception");
  }
  if (s_numAnims) gInt(s_numAnims, q->mgr, &count);
  int mode = p_lua_gettop(L) >= 3 ? (int)p_lua_tonumber(L, 3) : 0;
  if (mode == 1 || mode == 2) {
    // through his animation instance: the loop flag is ours to set, and blend spaces can be played too
    // (their indices follow the plain animations': valid up to the number of names)
    if (g_animMgr != q->mgr) readAnimsRaw(q->mgr);
    int ntable = g_animMgr == q->mgr ? g_nanim : 0;
    if (idx < 0 || idx == 0xFFFF || idx >= ntable) {
      char msg[140];
      sprintf_s(msg, "DCS has no animation called \"%s\" (index %d of %d)", keep, idx, ntable);
      nlog("play: %s", msg);
      return fail(L, msg);
    }
    nlog("play: %s (%s) cookie set_animation(%d = \"%s\", loop %s)", q->name, q->cls, idx, keep, mode == 2 ? "ON" : "off");
    int e = cookiePlayRaw(q, idx, mode == 2);
    if (e != 0) {
      nlog("play: %s", e == -100 ? "EXCEPTION" : "no animation instance found for him");
      return fail(L, e == -100 ? "the cookie's set_animation raised an exception" : "his animation instance was not found (see the log)");
    }
    nlog("play: returned");
    p_lua_pushboolean(L, 1);
    return 1;
  }
  if (idx < 0 || (count > 0 && idx >= count)) {
    char msg[140];
    sprintf_s(msg, "DCS has no animation called \"%s\" (index %d of %d)", keep, idx, count);
    nlog("play: %s", msg);
    return fail(L, msg);
  }
  nlog("play: %s (%s) set_animation(%d = \"%s\")", q->name, q->cls, idx, keep);
  if (!gSetInt(s_setAnim, q->acb, idx)) {
    nlog("play: EXCEPTION");
    return fail(L, "set_animation raised an exception");
  }
  nlog("play: returned");
  p_lua_pushboolean(L, 1);
  return 1;
}

static int l_override(lua_State *L) {
  loadDcs();
  Person *q = findPerson(p_lua_tonumber(L, 1));
  if (!q) return fail(L, "no such character (scan again)");
  if (!s_setOverride) return fail(L, "set_override_animation not found");
  if (g_strOk < 3 || g_strBad > 0) return fail(L, "string layout not confirmed (names unreadable): not passing a string to DCS");
  const char *name = p_lua_tolstring(L, 2, nullptr);
  if (!name || strlen(name) > 70) return fail(L, "bad name");  // "" takes the override off (DCS: an empty name unsets it)
  static char keep[72];
  strcpy_s(keep, name);
  EdStr s;
  makeStr(&s, keep);
  nlog("override: %s (%s) set_override_animation(%s)", q->name, q->cls, keep);
  if (!gSetRef(s_setOverride, q->acb, &s)) {
    nlog("override: EXCEPTION");
    return fail(L, "set_override_animation raised an exception");
  }
  nlog("override: returned");
  p_lua_pushboolean(L, 1);
  return 1;
}

// an attachment (the light wands "RightStick" / "LeftStick", their lights "RightLight" / "LeftLight") shown or hidden
static int l_attach(lua_State *L) {
  loadDcs();
  Person *q = findPerson(p_lua_tonumber(L, 1));
  if (!q) return fail(L, "no such character (scan again)");
  if (!s_showAttachment) return fail(L, "show_attachment not found");
  if (g_strOk < 3 || g_strBad > 0) return fail(L, "string layout not confirmed (names unreadable): not passing a string to DCS");
  const char *name = p_lua_tolstring(L, 2, nullptr);
  if (!name || !name[0] || strlen(name) > 70) return fail(L, "bad name");
  bool on = p_lua_toboolean(L, 3) != 0;
  static char keep[72];
  strcpy_s(keep, name);
  EdStr s;
  makeStr(&s, keep);
  nlog("attach: %s (%s) show_attachment(%s, %s)", q->name, q->cls, keep, on ? "true" : "false");
  if (!gSetRefBool(s_showAttachment, q->acb, &s, on)) {
    nlog("attach: EXCEPTION");
    return fail(L, "show_attachment raised an exception");
  }
  nlog("attach: returned");
  p_lua_pushboolean(L, 1);
  return 1;
}

static int l_walk(lua_State *L) {
  loadDcs();
  g_nparents = 0;  // ships move: no ship position older than this call
  Person *q = findPerson(p_lua_tonumber(L, 1));
  if (!q) return fail(L, "no such character (scan again)");
  if (!q->cm) return fail(L, "this character's class can't walk (no CharacterMovable)");
  if (!s_moveWorld) return fail(L, "move_command_world not found");
  if (p_lua_gettop(L) < 17) return fail(L, "walk(h, tx, tz, fx, fz, 12 ship numbers)");
  double tx = p_lua_tonumber(L, 2), tz = p_lua_tonumber(L, 3), fx = p_lua_tonumber(L, 4), fz = p_lua_tonumber(L, 5), S[12];
  for (int i = 0; i < 12; i++) S[i] = p_lua_tonumber(L, 6 + i);
  float pose[16];
  char info[300];
  info[0] = 0;
  int e = walkCompute(q, tx, tz, fx, fz, S, pose, info, sizeof info);
  nlog("walk: %s (%s) %s -> %d", q->name, q->cls, info, e);
  if (e == -2) return fail(L, "can't read the character's position (layout unknown)");
  if (e == -3) {
    char msg[360];
    sprintf_s(msg, "ship coordinates don't match DCS's (%s): not sent", info);
    return fail(L, msg);
  }
  if (e != 0) return fail(L, "walk: can't work out the target");
  if (!gSetRef(s_moveWorld, q->cm, pose)) {
    nlog("walk: EXCEPTION");
    return fail(L, "move_command_world raised an exception");
  }
  nlog("walk: returned");
  p_lua_pushboolean(L, 1);
  p_lua_pushstring(L, info);
  return 2;
}

static int l_stop(lua_State *L) {
  loadDcs();
  Person *q = findPerson(p_lua_tonumber(L, 1));
  if (!q) return fail(L, "no such character (scan again)");
  if (!q->cm || !s_stopMove) return fail(L, "can't stop this character");
  nlog("stop: %s", q->name);
  if (!gVoid(s_stopMove, q->cm)) {
    nlog("stop: EXCEPTION");
    return fail(L, "stop_move raised an exception");
  }
  p_lua_pushboolean(L, 1);
  return 1;
}

static bool g_stateNameBad;

static int l_state(lua_State *L) {
  loadDcs();
  g_nparents = 0;  // ships move: no ship position older than this call
  Person *q = findPerson(p_lua_tonumber(L, 1));
  if (!q) return fail(L, "no such character (scan again)");
  Rtti r;
  if (!rttiRaw(q->complete, &r)) return fail(L, "the character is gone");
  readPose(*q, r);
  int v = -1;
  if (q->cm && s_getState) gInt(s_getState, q->cm, &v);
  p_lua_pushnumber(L, v);
  if (q->locLayout) {
    const float *p = posAxis(q->loc, q->locLayout, 3);
    p_lua_pushnumber(L, p[0]);
    p_lua_pushnumber(L, p[1]);
    p_lua_pushnumber(L, p[2]);
  } else {
    p_lua_pushnil(L);
    p_lua_pushnil(L);
    p_lua_pushnil(L);
  }
  char name[128] = "";
  if (p_lua_toboolean(L, 2) && q->cm && s_stateName && !g_stateNameBad) {
    EdStr s;
    memset(&s, 0, sizeof s);
    s.cap = 15;
    if (!gRetF(s_stateName, q->cm, &s, 0.0f)) {
      g_stateNameBad = true;
      nlog("state name: EXCEPTION (not asked again)");
    } else if (!readStr(&s, name, sizeof name)) strcpy_s(name, "?");
  }
  p_lua_pushstring(L, name);
  if (q->locLayout) {  // the way he faces, in ship coordinates (his x axis: forward)
    const float *x = posAxis(q->loc, q->locLayout, 0);
    p_lua_pushnumber(L, x[0]);
    p_lua_pushnumber(L, x[2]);
  } else {
    p_lua_pushnil(L);
    p_lua_pushnil(L);
  }
  return 7;
}

// the character's own memory, as hex (read-only; for working out what else is in there)
static int l_dump(lua_State *L) {
  Person *q = findPerson(p_lua_tonumber(L, 1));
  if (!q) return fail(L, "no such character (scan again)");
  int off = (int)p_lua_tonumber(L, 2), len = (int)p_lua_tonumber(L, 3);
  if (off < 0 || off > 0x4000 || len < 1 || len > 1024) return fail(L, "bad range");
  static unsigned char raw[1024];
  static char out[2 * 1024 + 1];
  if (!rd((char *)q->complete + off, raw, len)) return fail(L, "read failed");
  static const char hex[] = "0123456789abcdef";
  for (int i = 0; i < len; i++) {
    out[2 * i] = hex[raw[i] >> 4];
    out[2 * i + 1] = hex[raw[i] & 15];
  }
  out[2 * len] = 0;
  p_lua_pushstring(L, out);
  return 1;
}

// what he is playing this instant (called a few times a second per person by the recorder: no log lines)
static int l_anim(lua_State *L) {
  loadDcs();
  Person *q = findPerson(p_lua_tonumber(L, 1));
  if (!q) return fail(L, "no such character (scan again)");
  AnimNow a;
  int e = animNowRaw(q, &a);
  if (e != 0) {
    char msg[64];
    sprintf_s(msg, e == -1 ? "no animation instance (%d)" : e == -2 ? "nothing playing (%d)" : "unreadable (%d)", e);
    return fail(L, msg);
  }
  p_lua_createtable(L, 0, 17);
  setStr(L, "name", a.name);
  setNum(L, "id", a.id);
  setNum(L, "raw", a.rawId);
  setNum(L, "stack", a.stack);
  setNum(L, "t", a.t);
  static const char *const K[13] = {"start", "dur", "fin", "l1", "l2", "l3", "bx", "by", "tr1", "tr2", nullptr, "o1", "o2"};
  for (int i = 0; i < 13; i++)
    if (K[i]) setNum(L, K[i], a.f[i]);
  return 1;
}

// every animation of his: index, length, and a blend space's axes
static int l_animinfo(lua_State *L) {
  loadDcs();
  Person *q = findPerson(p_lua_tonumber(L, 1));
  if (!q) return fail(L, "no such character (scan again)");
  if (!q->mgr) return fail(L, "the character has no animation manager");
  if (g_strOk < 3 || g_strBad > 0) return fail(L, "string layout not confirmed (names unreadable): not passing a string to DCS");
  if (g_animMgr != q->mgr && readAnimsRaw(q->mgr) != 0) return fail(L, "animation list unreadable");
  int nclips = 0;
  if (!s_numAnims || !gInt(s_numAnims, q->mgr, &nclips) || nclips <= 0 || nclips > g_nanim) return fail(L, "animation count unreadable");
  nlog("animinfo: %d names, %d plain animations", g_nanim, nclips);
  p_lua_createtable(L, g_nanim, 0);
  int bad = 0;
  for (int i = 0; i < g_nanim; i++) {
    AnimInfo a;
    int e = animInfoRaw(q->mgr, g_anim[i], nclips, g_nanim, &a);
    if (e != 0) bad++;
    p_lua_createtable(L, 0, 12);
    setStr(L, "name", g_anim[i]);
    setNum(L, "err", e);
    setNum(L, "idx", a.idx);
    setNum(L, "id", a.id);
    setNum(L, "dur", a.dur);
    setStr(L, "x", a.xa);
    setStr(L, "y", a.ya);
    setNum(L, "x1", a.xb[0]);
    setNum(L, "x2", a.xb[1]);
    setNum(L, "y1", a.yb[0]);
    setNum(L, "y2", a.yb[1]);
    setNum(L, "dx", a.def[0]);
    setNum(L, "dy", a.def[1]);
    p_lua_rawseti(L, -2, i + 1);
  }
  nlog("animinfo: done, %d unreadable", bad);
  return 1;
}

// a blend parameter of his animation instance: read, or set first when a value is given
static int l_prop(lua_State *L) {
  loadDcs();
  Person *q = findPerson(p_lua_tonumber(L, 1));
  if (!q) return fail(L, "no such character (scan again)");
  if (g_strOk < 3 || g_strBad > 0) return fail(L, "string layout not confirmed (names unreadable): not passing a string to DCS");
  const char *name = p_lua_tolstring(L, 2, nullptr);
  if (!name || !name[0] || strlen(name) > 70) return fail(L, "bad name");
  bool set = p_lua_gettop(L) >= 3;
  float v = set ? (float)p_lua_tonumber(L, 3) : 0, out = 0;
  int e = propRaw(q, name, set, v, &out);
  if (e != 0) {
    nlog("prop: %s \"%s\": %s", q->name, name, e == -100 ? "EXCEPTION" : "no animation instance / no parameters found for him");
    return fail(L, e == -100 ? "the property call raised an exception" : "his blend parameters were not found");
  }
  p_lua_pushnumber(L, out);
  return 1;
}

// the catapult crews of the ship this character is on, and the ship's crew environment switches:
// { count, crews = { {i, ok, x1, y1, z1, x2, y2, z2}, ... }, avoid, pathAvoid, pathFinder } | nil, error
static int l_catcrews(lua_State *L) {
  loadDcs();
  Person *q = findPerson(p_lua_tonumber(L, 1));
  if (!q) return fail(L, "no such character (scan again)");
  void *owner = ownerOf(q);
  if (!owner) return fail(L, "what he is attached to is not a crew owner (no wGroundCrewOwner)");
  CatCrew cc[9];
  int count = 0;
  int n = catCrewsRaw(owner, cc, 9, &count);
  if (n < 0) return fail(L, n == -100 ? "asking for the catapult crews raised an exception" : "the catapult crew functions were not found in Flight.dll");
  p_lua_createtable(L, 0, 6);
  setNum(L, "count", count);
  unsigned char ds[4];
  if (debugSetRaw(-1, 0, ds) == 0) {
    char s[16];
    sprintf_s(s, "%d%d%d%d", ds[0] ? 1 : 0, ds[1] ? 1 : 0, ds[2] ? 1 : 0, ds[3] ? 1 : 0);
    setStr(L, "debug", s);
  }
  p_lua_createtable(L, n, 0);
  for (int i = 0; i < n; i++) {
    p_lua_createtable(L, 0, 8);
    setNum(L, "i", i);
    setBool(L, "ok", cc[i].crew != nullptr);
    if (cc[i].boxOk) {
      static const char *const K[6] = {"x1", "y1", "z1", "x2", "y2", "z2"};
      for (int k = 0; k < 6; k++) setNum(L, K[k], cc[i].box[k]);
    }
    p_lua_rawseti(L, -2, i + 1);
  }
  p_lua_setfield(L, -2, "crews");
  int fl[2] = {-1, -1};
  if (envFlagsRaw(owner, -1, -1, fl) == 0) {
    setBool(L, "avoid", fl[0] != 0);
    setBool(L, "pathAvoid", fl[1] != 0);
  }
  void *pf = nullptr;
  if (q->cm && s_pathFinder && gThis(s_pathFinder, q->cm, &pf)) setBool(L, "pathFinder", pf != nullptr);
  return 1;
}

// an order to catapult crew i (DCS's number, as catcrews lists them): "free" (on: free the catapult; off:
// take it), "allowed" (operation allowed on / off), "reset" (reset_orders).
// catorder(h, i, what, on [, quiet]) -> true, changes | nil, error
// changes: the bytes that went 0 <-> 1 across the call ("" if none found). quiet (the order repeated
// every frame to hold it): no log lines, no looking for changes, changes = "".
static int l_catorder(lua_State *L) {
  loadDcs();
  Person *q = findPerson(p_lua_tonumber(L, 1));
  if (!q) return fail(L, "no such character (scan again)");
  void *owner = ownerOf(q);
  if (!owner) return fail(L, "what he is attached to is not a crew owner");
  int i = (int)p_lua_tonumber(L, 2);
  const char *what = p_lua_tolstring(L, 3, nullptr);
  bool on = p_lua_toboolean(L, 4) != 0;
  bool quiet = p_lua_gettop(L) >= 5 && p_lua_toboolean(L, 5) != 0;
  int w = what && !strcmp(what, "free") ? 0 : (what && !strcmp(what, "allowed") ? 1 : (what && !strcmp(what, "reset") ? 2 : (what && !strcmp(what, "dropjet") ? 3 : -1)));
  if (w < 0) return fail(L, "order must be free, allowed, reset or dropjet");
  CatCrew cc[9];
  int n = catCrewsRaw(owner, cc, 9, nullptr);
  if (n < 0 || i < 0 || i >= n || !cc[i].crew) return fail(L, "no such catapult crew");
  static char changes[1024];
  changes[0] = 0;
  if (!quiet) nlog("catorder: crew %d %s %s", i, what, w >= 2 ? "" : (on ? "true" : "false"));
  int e = w == 3 ? crewDropRaw(cc[i].crew) : (quiet ? catOrderRaw(cc[i].crew, w, on) : orderLearnRaw(cc[i].crew, w, on, changes, sizeof changes));
  if (e != 0) {
    nlog("catorder: %s", e == -100 ? "EXCEPTION" : "function not found");
    return fail(L, e == -100 ? "the order raised an exception" : "the order's function was not found in Flight.dll");
  }
  if (!quiet) nlog("catorder: returned; bytes changed 0 <-> 1: %s", changes[0] ? changes : "none found");
  p_lua_pushboolean(L, 1);
  p_lua_pushstring(L, changes);
  return 2;
}

// the order bytes found so far for crew i, as they are now: "place=value ..." ("" if none found yet)
static int l_orderpeek(lua_State *L) {
  loadDcs();
  Person *q = findPerson(p_lua_tonumber(L, 1));
  if (!q) return fail(L, "no such character (scan again)");
  void *owner = ownerOf(q);
  if (!owner) return fail(L, "what he is attached to is not a crew owner");
  int i = (int)p_lua_tonumber(L, 2);
  CatCrew cc[9];
  int n = catCrewsRaw(owner, cc, 9, nullptr);
  if (n < 0 || i < 0 || i >= n || !cc[i].crew) return fail(L, "no such catapult crew");
  static char txt[2048];
  orderPeekRaw(cc[i].crew, txt, sizeof txt);
  p_lua_pushstring(L, txt);
  return 1;
}

// the character code's own switches (see debugSetRaw): debugset([idx, v]) -> b0, b1, b2, b3 | nil, error
static int l_debugset(lua_State *L) {
  loadDcs();
  int idx = -1, v = 0;
  if (p_lua_gettop(L) >= 2) {
    idx = (int)p_lua_tonumber(L, 1);
    v = (int)p_lua_tonumber(L, 2);
    if (idx < 0 || idx > 3) return fail(L, "the switch's number must be 0..3");
    nlog("debugset: switch %d <- %d", idx, v ? 1 : 0);
  }
  unsigned char b[4];
  int e = debugSetRaw(idx, v, b);
  if (e != 0) return fail(L, e == -100 ? "reading the switches raised an exception" : "AnimatorLogic::debug_settings was not found in animator_logic.dll");
  for (int k = 0; k < 4; k++) p_lua_pushnumber(L, b[k]);
  return 4;
}

// the crew environment's switches of his ship: envflags(h [, avoid, pathAvoid]) -> avoid, pathAvoid
// (numbers 0 / 1 set a switch first; nil or -1 leaves it)
static int l_envflags(lua_State *L) {
  loadDcs();
  Person *q = findPerson(p_lua_tonumber(L, 1));
  if (!q) return fail(L, "no such character (scan again)");
  void *owner = ownerOf(q);
  if (!owner) return fail(L, "what he is attached to is not a crew owner");
  int top = p_lua_gettop(L);
  int a = top >= 2 && p_lua_tolstring(L, 2, nullptr) ? (int)p_lua_tonumber(L, 2) : -1;
  int p = top >= 3 && p_lua_tolstring(L, 3, nullptr) ? (int)p_lua_tonumber(L, 3) : -1;
  int fl[2] = {-1, -1};
  if (a >= 0 || p >= 0) nlog("envflags: set avoid %d, path avoid %d (-1: left)", a, p);
  int e = envFlagsRaw(owner, a, p, fl);
  if (e != 0) return fail(L, e == -100 ? "the environment call raised an exception" : "no crew environment / functions not found");
  p_lua_pushboolean(L, fl[0] != 0);
  p_lua_pushboolean(L, fl[1] != 0);
  return 2;
}

// a catapult control bubble of the ship this character is on: bubble(h, index [, command]) -> state | nil, error
// (index 0 or 1; command 0..2: see bubbleRaw; state as getBubbleState gives it after the command)
static int l_bubble(lua_State *L) {
  loadDcs();
  Person *q = findPerson(p_lua_tonumber(L, 1));
  if (!q) return fail(L, "no such character (scan again)");
  void *ship = shipOf(q);
  if (!ship) return fail(L, "what he is attached to is not a ship (no woShip)");
  int idx = (int)p_lua_tonumber(L, 2);
  int cmd = p_lua_gettop(L) >= 3 && p_lua_tolstring(L, 3, nullptr) ? (int)p_lua_tonumber(L, 3) : -1;
  bool quiet = p_lua_gettop(L) >= 4 && p_lua_toboolean(L, 4) != 0;
  if (cmd >= 0 && !quiet) nlog("bubble: bubble %d <- command %d", idx, cmd);
  int st = -1;
  int e = bubbleRaw(ship, idx, cmd, &st);
  if (e != 0) return fail(L, e == -100 ? "the bubble call raised an exception" : "the ship's bubble functions were not found in Transport.dll (or a bad bubble / command number)");
  p_lua_pushnumber(L, st);
  return 1;
}

// an elevator of the ship this character is on: elevator(h, index [, command]) -> state | nil, error
// (index 0..3; command 0..2; state as getElevatorState gives it after the command: see elevatorRaw)
static int l_elevator(lua_State *L) {
  loadDcs();
  Person *q = findPerson(p_lua_tonumber(L, 1));
  if (!q) return fail(L, "no such character (scan again)");
  void *ship = shipOf(q);
  if (!ship) return fail(L, "what he is attached to is not a ship (no woShip)");
  int idx = (int)p_lua_tonumber(L, 2);
  int cmd = p_lua_gettop(L) >= 3 && p_lua_tolstring(L, 3, nullptr) ? (int)p_lua_tonumber(L, 3) : -1;
  bool quiet = p_lua_gettop(L) >= 4 && p_lua_toboolean(L, 4) != 0;
  if (cmd >= 0 && !quiet) nlog("elevator: elevator %d <- command %d", idx, cmd);
  int st = -1;
  int e = elevatorRaw(ship, idx, cmd, &st);
  if (e != 0) return fail(L, e == -100 ? "the elevator call raised an exception" : "the ship's elevator functions were not found in Transport.dll (or a bad elevator / command number)");
  p_lua_pushnumber(L, st);
  return 1;
}

// what the ship's air traffic control says: deck(h) -> { canLand, canTakeoff, foul, rwOpen, freeCats, recoveryCase } | nil, error
// (called once a second by the recorder: no log lines)
static int l_deck(lua_State *L) {
  loadDcs();
  Person *q = findPerson(p_lua_tonumber(L, 1));
  if (!q) return fail(L, "no such character (scan again)");
  int why = 0;
  void *atc = atcOf(q, &why);
  if (!atc) return fail(L, why == -2 ? "the ship's getATC gave nothing that is a woATC" : "no getATC function of DCS's is in the virtual tables of what he is attached to");
  DeckState d;
  int e = deckStateRaw(atc, &d);
  if (e != 0) return fail(L, e == -100 ? "asking the ATC raised an exception" : "the ATC functions were not found in Flight.dll");
  p_lua_createtable(L, 0, 6);
  setBool(L, "canLand", d.canLand != 0);
  setBool(L, "canTakeoff", d.canTakeoff != 0);
  setBool(L, "foul", d.foul != 0);
  setBool(L, "rwOpen", d.rwOpen != 0);
  setNum(L, "freeCats", d.freeCats);
  setNum(L, "recoveryCase", d.recoveryCase);
  return 1;
}

// the ship's ATC teleports an aircraft: teleport(h, objectId, xx, xy, xz, yx, yy, yz, zx, zy, zz, px, py, pz) -> true | nil, error
// (h: anyone on the ship; the 12 numbers: the aircraft's new axes and position, world coordinates)
static int l_teleport(lua_State *L) {
  loadDcs();
  Person *q = findPerson(p_lua_tonumber(L, 1));
  if (!q) return fail(L, "no such character (scan again)");
  if (p_lua_gettop(L) < 14) return fail(L, "teleport needs an object id and 12 numbers");
  double id = p_lua_tonumber(L, 2);
  if (!(id >= 1 && id <= 4294967295.0)) return fail(L, "not an object id");
  double v[12];
  for (int i = 0; i < 12; i++) {
    v[i] = p_lua_tonumber(L, 3 + i);
    if (!(v[i] == v[i]) || fabs(v[i]) > 1e8) return fail(L, "a position number is not usable");
  }
  for (int a = 0; a < 3; a++) {  // the three axes: unit length
    double m = sqrt(v[a * 3] * v[a * 3] + v[a * 3 + 1] * v[a * 3 + 1] + v[a * 3 + 2] * v[a * 3 + 2]);
    if (fabs(m - 1) > 0.01) return fail(L, "the axes are not unit vectors");
  }
  int why = 0;
  void *atc = atcOf(q, &why);
  if (!atc) return fail(L, why == -2 ? "the ship's getATC gave nothing that is a woATC" : "no getATC function of DCS's is in the virtual tables of what he is attached to");
  nlog("teleport: object %.0f to %.2f, %.2f, %.2f (world), nose %.3f %.3f %.3f", id, v[9], v[10], v[11], v[0], v[1], v[2]);
  int e = teleportRaw(atc, v, (unsigned int)id);
  nlog("teleport: %s", e == 0 ? "the call returned" : e == -100 ? "the call raised an exception" : "function not found");
  if (e != 0) return fail(L, e == -100 ? "woATC::teleport_aircraft raised an exception" : "woATC::teleport_aircraft was not found in Flight.dll");
  p_lua_pushboolean(L, 1);
  return 1;
}

// one of the ship's model arguments: shiparg(h, number [, value]) -> the value now | nil, error
// (value -1..1; called every frame while a hangar door is being opened: no log lines)
static int l_shiparg(lua_State *L) {
  loadDcs();
  Person *q = findPerson(p_lua_tonumber(L, 1));
  if (!q) return fail(L, "no such character (scan again)");
  int idx = (int)p_lua_tonumber(L, 2);
  bool has = p_lua_gettop(L) >= 3 && p_lua_tolstring(L, 3, nullptr);
  float v = has ? (float)p_lua_tonumber(L, 3) : 0;
  if (has && !(v >= -1.0f && v <= 1.0f)) return fail(L, "a model argument is -1..1");
  float out = 0;
  int e = shipArgRaw(q->parent, idx, has ? &v : nullptr, &out);
  if (e != 0)
    return fail(L, e == -100 ? "writing the argument raised an exception" : e == -2 ? "the ship has no such model argument" : "woShip::GetDrawArguments is not in the virtual tables of what he is attached to");
  p_lua_pushnumber(L, out);
  return 1;
}

// objarg(h, objectId, n[, value -1..1]) -> value, class | nil, error   (h: anyone on the ship: the ship gives the slot)
static int l_objarg(lua_State *L) {
  loadDcs();
  Person *q = findPerson(p_lua_tonumber(L, 1));
  if (!q) return fail(L, "no such character (scan again)");
  double id = p_lua_tonumber(L, 2);
  if (!(id >= 1 && id <= 4294967295.0)) return fail(L, "not an object id");
  int idx = (int)p_lua_tonumber(L, 3);
  bool has = p_lua_gettop(L) >= 4 && p_lua_tolstring(L, 4, nullptr);
  float v = has ? (float)p_lua_tonumber(L, 4) : 0;
  if (has && !(v >= -1.0f && v <= 1.0f)) return fail(L, "a model argument is -1..1");
  float out = 0;
  const char *cls = "";
  int e = objArgRaw(q->parent, (unsigned int)id, idx, has ? &v : nullptr, &out, &cls);
  static int lastE = 12345;
  if (e != lastE) {
    nlog("objarg: object %.0f argument %d: %s (class %s)", id, idx, e == 0 ? "reached" : e == -100 ? "EXCEPTION" : e == -2 ? "no object with that id" : e == -3 ? "no such base or slot in the object" : e == -4 ? "no such argument" : "the ship's slot not found", cls);
    lastE = e;
  }
  if (e != 0)
    return fail(L, e == -100 ? "writing the argument raised an exception" : e == -2 ? "no object with that id in the world's register" : e == -3 ? "the object has no model argument list where the ship has its" : e == -4 ? "the object has no such model argument" : "woShip::GetDrawArguments is not in the virtual tables of the ship");
  p_lua_pushnumber(L, out);
  p_lua_pushstring(L, cls);
  return 2;
}

// a moving object put somewhere through its own ForcePosition: forcepos(objectId, 12 numbers as for teleport) -> true, class | nil, error
static int l_forcepos(lua_State *L) {
  loadDcs();
  if (p_lua_gettop(L) < 13) return fail(L, "forcepos needs an object id and 12 numbers");
  double id = p_lua_tonumber(L, 1);
  if (!(id >= 1 && id <= 4294967295.0)) return fail(L, "not an object id");
  double v[12];
  for (int i = 0; i < 12; i++) {
    v[i] = p_lua_tonumber(L, 2 + i);
    if (!(v[i] == v[i]) || fabs(v[i]) > 1e8) return fail(L, "a position number is not usable");
  }
  for (int a = 0; a < 3; a++) {
    double m = sqrt(v[a * 3] * v[a * 3] + v[a * 3 + 1] * v[a * 3 + 1] + v[a * 3 + 2] * v[a * 3 + 2]);
    if (fabs(m - 1) > 0.01) return fail(L, "the axes are not unit vectors");
  }
  const char *cls = "";
  nlog("forcepos: object %.0f to %.2f, %.2f, %.2f (world), nose %.3f %.3f %.3f", id, v[9], v[10], v[11], v[0], v[1], v[2]);
  int e = forcePosRaw((unsigned int)id, v, &cls);
  nlog("forcepos: %s (class %s)", e == 0 ? "the call returned" : e == -100 ? "EXCEPTION" : e == -2 ? "no object with that id in the register" : e == -3 ? "not a moving object, or its ForcePosition slot was not found" : "functions not found", cls);
  if (e != 0)
    return fail(L, e == -100 ? "ForcePosition raised an exception" : e == -2 ? "no object with that id in the world's register" : e == -3 ? "the object is not a MovingObject, or its ForcePosition was not found" : "MovingObject::ForcePosition was not found in WorldGeneral.dll");
  p_lua_pushboolean(L, 1);
  p_lua_pushstring(L, cls);
  return 2;
}

static int l_place(lua_State *L) {
  loadDcs();
  Person *q = findPerson(p_lua_tonumber(L, 1));
  if (!q) return fail(L, "no such character (scan again)");
  if (p_lua_gettop(L) < 6) return fail(L, "place(h, x, y, z, fx, fz)");
  double a[5];
  for (int i = 0; i < 5; i++) {
    a[i] = p_lua_tonumber(L, 2 + i);
    if (!(a[i] == a[i]) || fabs(a[i]) > 1000) return fail(L, "a number is not usable");
  }
  int e = placeRaw(q, a[0], a[1], a[2], a[3], a[4]);
  if (e != 0) {
    nlog("place: %s -> %d", q->name, e);
    return fail(L, e == -100 ? "set_origin raised an exception" : e == -2 ? "can't read the character's pose" : e == -4 ? "no facing given" : "set_origin not found");
  }
  p_lua_pushboolean(L, 1);
  p_lua_pushstring(L, g_placedLocal ? "origin + pose" : "origin only");
  return 2;
}

// staticpos(objectId, 12 world numbers[, sx, sy, sz]) -> true, class, register kind, took (true / false / nil: not known), flag word | nil, error
static int l_staticpos(lua_State *L) {
  loadDcs();
  if (p_lua_gettop(L) < 13) return fail(L, "staticpos needs an object id and 12 numbers");
  double id = p_lua_tonumber(L, 1);
  if (!(id >= 1 && id <= 4294967295.0)) return fail(L, "not an object id");
  double v[12], sc[3] = {1, 1, 1};
  for (int i = 0; i < 12; i++) {
    v[i] = p_lua_tonumber(L, 2 + i);
    if (!(v[i] == v[i]) || fabs(v[i]) > 1e8) return fail(L, "a position number is not usable");
  }
  for (int a = 0; a < 3; a++) {
    double m = sqrt(v[a * 3] * v[a * 3] + v[a * 3 + 1] * v[a * 3 + 1] + v[a * 3 + 2] * v[a * 3 + 2]);
    if (fabs(m - 1) > 0.01) return fail(L, "the axes are not unit vectors");
    if (p_lua_gettop(L) >= 16) sc[a] = p_lua_tonumber(L, 14 + a);
    if (!(sc[a] >= 0.01 && sc[a] <= 100)) return fail(L, "a scale is not usable");
  }
  const char *cls = "";
  int kind = -1;
  int e = staticPosRaw((unsigned int)id, v, sc, &cls, &kind);
  // every frame, for several objects: the log gets a line only when an object's outcome changes
  static struct { double id; int e, took; unsigned int flags; bool child; } seen[8];
  int si = 0;
  while (si < 7 && seen[si].id != id && seen[si].id != 0) si++;
  if (seen[si].id != id || seen[si].e != e || seen[si].took != g_spTook || seen[si].flags != g_spFlags || seen[si].child != (g_spParent[0] != 0)) {
    nlog("staticpos: object %.0f: %s (class %s, register kind %d; %s%s); its flag word 0x%08X%s; afterwards it %s", id,
         e == 0 ? "put through its own SetPos" : e == -100 ? "EXCEPTION" : e == -2 ? "no object with that id in the register" : e == -3 ? "not an lLandObject, or its SetPos slot was not found" : "functions not found",
         cls, kind, g_spParent[0] ? "a child of " : "no parent: placed in the world", g_spParent, g_spFlags,
         (g_spFlags & 0x1D000009u) ? " (DCS's SetPos leaves an object with these bits where it is)" : "",
         g_spTook == 1 ? "says it is there" : g_spTook == 0 ? "is NOT where it was put" : "could not be asked where it is");
    seen[si].id = id, seen[si].e = e, seen[si].took = g_spTook, seen[si].flags = g_spFlags, seen[si].child = g_spParent[0] != 0;
  }
  if (e != 0)
    return fail(L, e == -100 ? "SetPos raised an exception" : e == -2 ? "no object with that id in the world's register" : e == -3 ? "the object is not an lLandObject, or its SetPos was not found" : "lLandObject::SetPos was not found in edObjects.dll");
  p_lua_pushboolean(L, 1);
  p_lua_pushstring(L, cls);
  p_lua_pushnumber(L, kind);
  if (g_spTook < 0) p_lua_pushnil(L);
  else p_lua_pushboolean(L, g_spTook);
  p_lua_pushnumber(L, g_spFlags);
  if (g_spParent[0]) p_lua_pushstring(L, g_spParent);
  else p_lua_pushboolean(L, 0);
  return 6;
}

// staticinfo(objectId) -> class, register kind, parent's class (false: none: the object is placed in the world), flag word | nil, error
static int l_staticinfo(lua_State *L) {
  loadDcs();
  double id = p_lua_tonumber(L, 1);
  if (!(id >= 1 && id <= 4294967295.0)) return fail(L, "not an object id");
  const char *cls = "";
  int kind = -1;
  int e = staticInfoRaw((unsigned int)id, &cls, &kind);
  if (e != 0) return fail(L, e == -2 ? "no object with that id in the world's register" : e == -3 ? "the object is not an lLandObject" : "DCS's functions were not found");
  p_lua_pushstring(L, cls);
  p_lua_pushnumber(L, kind);
  if (g_spParent[0]) p_lua_pushstring(L, g_spParent);
  else p_lua_pushboolean(L, 0);
  p_lua_pushnumber(L, g_spFlags);
  nlog("staticinfo: object %.0f: class %s, register kind %d, %s%s, flag word 0x%08X", id, cls, kind, g_spParent[0] ? "a child of " : "no parent", g_spParent, g_spFlags);
  return 4;
}

// the commands the ship holds for its bubbles and elevators: shipcmds(h) -> { bubble = { c, c }, elevator = { c, c, c, c } } | nil, error
// (a command is 0..2; a table is left out when its place in the ship is not known: see findCmdPlaces)
static int l_shipcmds(lua_State *L) {
  loadDcs();
  Person *q = findPerson(p_lua_tonumber(L, 1));
  if (!q) return fail(L, "no such character (scan again)");
  void *ship = shipOf(q);
  if (!ship) return fail(L, "what he is attached to is not a ship (no woShip)");
  if (!g_cmdPlaces.done) {
    findCmdPlaces((const unsigned char *)s_bubbleCmd, (const unsigned char *)s_elevCmd, &g_cmdPlaces);
    nlog("shipcmds: bubble count at +0x%X, commands at +0x%X; elevators' object at +0x%X, commands at +0x%X (-1: not found in the setter's code)", g_cmdPlaces.bubbleCount,
         g_cmdPlaces.bubbleCmd, g_cmdPlaces.elevObj, g_cmdPlaces.elevCmd);
  }
  int bub[2], elev[4];
  shipCmdsRaw(ship, g_cmdPlaces, bub, elev);
  p_lua_createtable(L, 0, 2);
  if (bub[0] >= 0) {
    p_lua_createtable(L, 2, 0);
    for (int i = 0; i < 2; i++)
      if (bub[i] >= 0) {
        p_lua_pushnumber(L, bub[i]);
        p_lua_rawseti(L, -2, i + 1);
      }
    p_lua_setfield(L, -2, "bubble");
  }
  if (elev[0] >= 0) {
    p_lua_createtable(L, 4, 0);
    for (int i = 0; i < 4; i++)
      if (elev[i] >= 0) {
        p_lua_pushnumber(L, elev[i]);
        p_lua_rawseti(L, -2, i + 1);
      }
    p_lua_setfield(L, -2, "elevator");
  }
  return 1;
}

static int l_time(lua_State *L) {
  loadDcs();
  double t = -1;
  if (s_modelTime) {
    __try {
      t = ((FnTime)s_modelTime)();
    } __except (EXCEPTION_EXECUTE_HANDLER) {
      t = -1;
    }
  }
  p_lua_pushnumber(L, t);
  return 1;
}

static const luaL_Reg funcs[] = {{"info", l_info},         {"setlog", l_setlog}, {"scan", l_scan},         {"registry", l_registry},
                                 {"heapscan", l_heapscan}, {"anims", l_anims},   {"play", l_play},         {"override", l_override},
                                 {"walk", l_walk},         {"stop", l_stop},     {"state", l_state},       {"dump", l_dump},
                                 {"attach", l_attach},     {"anim", l_anim},     {"animinfo", l_animinfo}, {"prop", l_prop},
                                 {"time", l_time},         {"catcrews", l_catcrews}, {"catorder", l_catorder}, {"envflags", l_envflags},
                                 {"orderpeek", l_orderpeek}, {"debugset", l_debugset}, {"bubble", l_bubble},
                                 {"elevator", l_elevator}, {"deck", l_deck}, {"teleport", l_teleport}, {"shipcmds", l_shipcmds}, {"shiparg", l_shiparg}, {"forcepos", l_forcepos},
                                 {"place", l_place}, {"staticpos", l_staticpos}, {"objarg", l_objarg}, {"staticinfo", l_staticinfo},
                                 {nullptr, nullptr}};

extern "C" __declspec(dllexport) int luaopen_catcc_crew(lua_State *L) {
  if (!loadLua()) return 0;
  p_luaL_register(L, "catcc_crew", funcs);
  return 1;
}

#endif  // CATCC_SELFTEST (the self-test is catcc_crew_selftest.cpp, which includes this file)
