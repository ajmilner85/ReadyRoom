// CATCC ATC probe: native Lua module (catcc_atcprobe.dll). AN EXPERIMENT, not part of the mod (2026-11-22).
// NOT YET RUN IN DCS.
//
// Question it answers: can the carrier's air traffic control (class woATC, Flight.dll) be told which spawn spot
// ("terminal") a client's spawn gets? It reaches the ship's woATC, lists its terminals, reads each one's state
// through the terminal's own exported getters, and can mark terminals as taken (acquire) / free them / set their
// "acquire order", and call the ATC's own setClientSpawnOnTerminal... functions.
//
// Loaded by the probe's hook (deck-test/spawn-probe/CATCC-atcprobe-hook.lua) with
// package.loadlib(path, 'luaopen_catcc_atcprobe'). Built like crew-test/native/catcc_crew.cpp (the model for all of
// this): it does not link against DCS; every DCS function is looked up at run time by its exported (decorated) name
// in the DLLs DCS has loaded; nothing is called whose export is missing; every call into DCS and every read of DCS
// memory is guarded (SEH), so a wrong guess gives nil, error back to Lua instead of a crash; what an object is comes
// from its run-time type information (MSVC RTTI), never from a class layout we don't know. No DCS file is changed.
//
// GUESSES (each is checked at run time where it can be; the hook's log says which held):
//   G1  ed::list<wsAdrTerminal*> is MSVC's std::list: { head node, size }, a node = { next, prev, value }.
//       Checked: the back links, the count against the size, every value's type information. Second way to list the
//       terminals, independent of G1: woATC::forEachTerminal(std::function<bool(const wsAdrTerminal*)>).
//   G2  std::function is the same in DCS's build as in ours (the same compiler family; fixed since VS 2015), and a
//       by-value argument of that class is passed by address and destroyed by the callee (the x64 convention).
//   G3  ed::basic_string<char> is MSVC's std::string (held in DCS 2.9.31: catcc_crew.cpp).
//   G4  the ATC's clients, ed::map<unsigned, ClientData>, is MSVC's std::map: { head, size }, a node = { left,
//       parent, right, colour, isnil, key at +0x20 }.
//   G5  the world's register: RegisterManager::instance (edObjects.dll), "next" in virtual slot 3, an object's id at
//       +0x1c of the entry (as catcc_crew.cpp reads it: held in DCS 2.9.31).
//   G6  what the arguments of the functions MEAN (only their types are in the exported names): see each function.
//
// Lua API (i: a terminal's place in the ATC's own list, 1-based, as of the last terminals(); every function gives
// nil, error on failure):
//   m.info()                      -> { version, thread, missing = { "<what> (<dll>)", ... } }
//   m.setlog(path)                the module appends a line per step to this file
//   m.attach(objectId)            -> { cls, kind, atc, atcCls }      the ship by its object id (the mission script's
//                                    unit.id_), checked to be a woShip; its woATC through woShip::getATC
//   m.detach()                    forgets the ATC and the terminals (nothing is undone: see undo)
//   m.terminals()                 -> { n, size, t = { { i, ptr, cls, vt, free, client, order, miss, type, obj, dead }, ... } }
//   m.foreach(ret)                -> { n, same, t = { i, ... } }     the terminals as forEachTerminal gives them (the
//                                    callback answers `ret`); t: each one's place in the list (0: not in it)
//   m.byindex(which, n [, k])     -> i, ptr    which 1: getTerminalByTermIndex_(n), 2: getTerminalByTermIndex_0(n),
//                                    3: getTerminal(n, k); i = 0: it gave nothing, -1: something not in the list
//   m.peek(i, off, len)           -> hex       the terminal's own memory (read only)
//   m.locate(i, x, z [, tol])      -> off, how  where in the terminal's memory the two numbers stand ("f8": floats
//                                    8 apart, "f4", "d16": doubles)
//   m.havefree([s1, s2])          -> bool      woATC::haveFreeTerminalForDynamicSpawnClient
//   m.canspawn(id)                -> bool      woATC::canClientSpawnOnTerminal(id)
//   m.obstructed(i, which, s1, s2, f) -> bool  which 1: isAdrTermObstructedFor, 2: ...ForDynamicAirdromeSpawn
//   m.clients()                   -> { size, ids = { ... } }         the ATC's clients' ids
//   m.termstate()                 -> bytes, hex   woATC::fillTerminalsState (what a joining client is sent)
//   m.acquire(i, id [, miss, type]) -> true    wsBasicTerminal::acquire(id) or (id, miss, type); remembered for undo
//   m.waitspawn(i, on)            -> true      wsBasicTerminal::wait_for_objects_spawn on a terminal acquire took
//   m.freeforme(i, who)           -> bool      wsBasicTerminal::is_free_for_me(client id | mission id)
//   m.acquiredby(i, who)          -> bool      wsBasicTerminal::is_acquired_by(client id | mission id)
//   m.spawnonmiss(id, s, f)       -> i, ptr    woATC::setClientSpawnOnTerminalMiss(id, string, float)
//   m.forced(id, flag)            -> i, ptr    woATC::getForcedTerminalByClient_(id, bool)
//   m.termstatus(i, client, taken) -> Term_Index, number   woATC::procTerminalStatus(client, the terminal's two
//                                    numbers as fillTerminalsState gives them, taken)
// (what setClientSpawnOn... and termstatus(.., true) take is remembered as it then reads, and given back by undo)
//   m.atccall(which, id)          -> bool      "unused" woATC::freeUnusedTerminalAcquirement, "cleantaxi" Clean_Taxi,
//                                    "destroy" onObjectDestroy: each with one unsigned
//   m.snapstate()                 -> n         fillTerminalsState's records kept (stage A)
//   m.initterms(i, ...)           -> true      woATC::procInitTerminals: the present states, stage A's for those named
//   m.aim(shipId, T [, mode, allowWrite]) -> { target, taken, client, lifted, written, blocked, failed, layoutBad }
//                                    THE SLOT PICKER'S CALL: every number in play before T lifted out of play
//   m.restore([shipId])           -> { records, written, left, failed }   every lifted number put back
//   m.poke(i, off, hex)           -> true      +0x8c (4 bytes) or +0x94 (1 byte) of a terminal the chooser took, put
//                                    back by hand: read, written, read again (the hook's RESTORE_BY_POKE, off by default)
// (terminals() also gives x: the 16 bytes at +0x88 of each terminal, as hex)
//   m.initrows(spec)              -> true      woATC::procInitTerminals: the present states, but for the terminals named
//                                    the client id / number / taken given ("place,client,number,taken;...", "-" keeps)
//   m.peekatc(off, len)           -> hex       the ATC object's own memory (read only)
//   m.release(i)                  -> true      wsBasicTerminal::free
//   m.setorder(i, n)              -> old       wsBasicTerminal::set_acquire_order; the old one remembered for undo
//   m.undo()                      -> freed, kept, restored    frees what acquire took (only where the terminal still
//                                    has the client id and mission id WE gave it and no object), puts the orders back
//   m.spawnon(id)                 -> i, ptr    woATC::setClientSpawnOnTerminal(id)
//   m.spawnonpoint(id, x, y, z)   -> i, ptr    woATC::setClientSpawnOnTerminalByPoint(id, Vec3f)
//   m.spawnonfree(id, s, f)       -> i, ptr    woATC::setClientSpawnOnFreeTerminal(id, string, float)
//   m.termof(objectId)            -> i, ptr, cls   woATC::getMyTerminal(the moving object with that id)
//   m.termbyclient(id, flag)      -> number    woATC::getTerminalByClient(id, bool)
//
// Build: native\build.cmd (VS 2022 Build Tools). It first builds and runs catcc_atcprobe_selftest.cpp.

#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <cmath>
#include <cstdarg>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <functional>
#include <new>

static const char VERSION[] = "atcprobe-10";

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

// inside a loaded module (exec: in its code). What Windows said about a region is kept for two seconds.
static bool inImage(const void *p, bool exec) {
  if (!p) return false;
  static struct { uintptr_t lo, hi; bool image, exec; ULONGLONG at; } seen[32];
  static int nextSeen;
  uintptr_t v = (uintptr_t)p;
  ULONGLONG now = GetTickCount64();
  for (int i = 0; i < 32; i++)
    if (v >= seen[i].lo && v < seen[i].hi && now - seen[i].at < 2000) return exec ? (seen[i].image && seen[i].exec) : seen[i].image;
  MEMORY_BASIC_INFORMATION mbi;
  if (!VirtualQuery(p, &mbi, sizeof mbi)) return false;
  bool image = mbi.State == MEM_COMMIT && mbi.Type == MEM_IMAGE;
  bool ex = image && (mbi.Protect & (PAGE_EXECUTE | PAGE_EXECUTE_READ | PAGE_EXECUTE_READWRITE | PAGE_EXECUTE_WRITECOPY)) != 0;
  if (mbi.RegionSize) {
    int i = nextSeen;
    nextSeen = (nextSeen + 1) % 32;
    seen[i].lo = (uintptr_t)mbi.BaseAddress, seen[i].hi = (uintptr_t)mbi.BaseAddress + mbi.RegionSize, seen[i].image = image, seen[i].exec = ex, seen[i].at = now;
  }
  return exec ? ex : image;
}

// ---------------------------------------------------------------- MSVC RTTI (x64), as in catcc_crew.cpp
struct RttiBase {
  const char *name;  // decorated: ".?AVwsBasicTerminal@@"
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
// the object as that class: itself if it is one, else its base of that name; null if neither
static void *asClass(const Rtti &r, const char *decorated) { return baseOf(r, decorated); }

// Finds the virtual-table slot that holds `fn` (an exported virtual's address) in one of the object's virtual
// tables. Out: the base subobject's offset in the complete object. A table ends at the first entry that is not code.
static bool findVirtual(const Rtti &r, const void *fn, int *mdisp) {
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
        return true;
      }
      if (!inImage(e, true)) break;
    }
  }
  return false;
}

// ---------------------------------------------------------------- ed::string (G3: = MSVC std::string)
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

// ---------------------------------------------------------------- DCS functions
static void *s_regInstance, *s_shipGetAtc, *s_airbaseGetAtc;
static void *s_termList, *s_forEach, *s_byIdx, *s_byIdx0, *s_getTerminal, *s_haveFree0, *s_haveFree2, *s_canSpawn, *s_obstr,
    *s_obstrDyn, *s_clients, *s_fillState, *s_spawnOn, *s_spawnOnPt, *s_spawnOnFree, *s_myTerm, *s_termByClient;
static void *s_isFree, *s_clientId, *s_getOrder, *s_setOrder, *s_missId, *s_typeAcq, *s_acqObj, *s_isAcqBy, *s_acquire, *s_acquire3,
    *s_free, *s_adrVt, *s_freeForMeS, *s_freeForMeI, *s_isAcqByS, *s_ownerDead, *s_waitSpawn, *s_spawnOnMiss, *s_forced, *s_termStatus, *s_freeUnused, *s_cleanTaxi, *s_objDestroy, *s_initTerms;

struct Sym {
  const char *dll, *name;
  void **out;
  const char *what;
};
// (catcc-dcs/test/atcprobe.test.ts and native/check_exports.py check every name below against the DLL's export table)
static const Sym SYMS[] = {
    {"edObjects.dll", "?instance@RegisterManager@@2PEAV1@EA", &s_regInstance, "RegisterManager::instance"},
    {"Transport.dll", "?getATC@woShip@@UEBAPEAVwoATC@@XZ", &s_shipGetAtc, "woShip::getATC"},
    {"Flight.dll", "?getATC@wAirbase@@UEBAPEAVwoATC@@XZ", &s_airbaseGetAtc, "wAirbase::getATC"},
    // the ATC: its terminals
    {"Flight.dll", "?getTerminalList@woATC@@QEAAAEBV?$list@PEAVwsAdrTerminal@@V?$allocator@PEAVwsAdrTerminal@@@ed@@@ed@@XZ", &s_termList, "woATC::getTerminalList"},
    {"Flight.dll", "?forEachTerminal@woATC@@QEBAXV?$function@$$A6A_NPEBVwsAdrTerminal@@@Z@std@@@Z", &s_forEach, "woATC::forEachTerminal(std::function)"},
    {"Flight.dll", "?getTerminalByTermIndex_@woATC@@AEBAPEAVwsAdrTerminal@@H@Z", &s_byIdx, "woATC::getTerminalByTermIndex_(int)"},
    {"Flight.dll", "?getTerminalByTermIndex_0@woATC@@AEBAPEAVwsAdrTerminal@@H@Z", &s_byIdx0, "woATC::getTerminalByTermIndex_0(int)"},
    {"Flight.dll", "?getTerminal@woATC@@QEAAPEAVwsAdrTerminal@@IH@Z", &s_getTerminal, "woATC::getTerminal(unsigned, int)"},
    {"Flight.dll", "?haveFreeTerminalForDynamicSpawnClient@woATC@@QEBA_NXZ", &s_haveFree0, "woATC::haveFreeTerminalForDynamicSpawnClient()"},
    {"Flight.dll", "?haveFreeTerminalForDynamicSpawnClient@woATC@@QEBA_NAEBV?$basic_string@D@ed@@0@Z", &s_haveFree2, "woATC::haveFreeTerminalForDynamicSpawnClient(string, string)"},
    {"Flight.dll", "?canClientSpawnOnTerminal@woATC@@QEAA_NI@Z", &s_canSpawn, "woATC::canClientSpawnOnTerminal(unsigned)"},
    {"Flight.dll", "?isAdrTermObstructedFor@woATC@@IEBA_NPEAVwsAdrTerminal@@AEBV?$basic_string@D@ed@@1M@Z", &s_obstr, "woATC::isAdrTermObstructedFor(terminal, string, string, float)"},
    {"Flight.dll", "?isAdrTermObstructedForDynamicAirdromeSpawn@woATC@@IEBA_NPEAVwsAdrTerminal@@AEBV?$basic_string@D@ed@@1M@Z", &s_obstrDyn, "woATC::isAdrTermObstructedForDynamicAirdromeSpawn(terminal, string, string, float)"},
    {"Flight.dll", "?getClients@woATC@@QEBAAEBV?$map@IUClientData@@U?$less@I@std@@V?$allocator@U?$pair@$$CBIUClientData@@@std@@@ed@@@std@@XZ", &s_clients, "woATC::getClients"},
    {"Flight.dll", "?fillTerminalsState@woATC@@QEAAXAEAV?$vector@UTerminalState@@V?$allocator@UTerminalState@@@ed@@@ed@@@Z", &s_fillState, "woATC::fillTerminalsState(vector<TerminalState>)"},
    {"Flight.dll", "?setClientSpawnOnTerminal@woATC@@QEAAPEBVwsAdrTerminal@@I@Z", &s_spawnOn, "woATC::setClientSpawnOnTerminal(unsigned)"},
    {"Flight.dll", "?setClientSpawnOnTerminalByPoint@woATC@@QEAAPEBVwsAdrTerminal@@IAEBVVec3f@osg@@@Z", &s_spawnOnPt, "woATC::setClientSpawnOnTerminalByPoint(unsigned, Vec3f)"},
    {"Flight.dll", "?setClientSpawnOnFreeTerminal@woATC@@QEAAPEBVwsAdrTerminal@@IAEBV?$basic_string@D@ed@@M@Z", &s_spawnOnFree, "woATC::setClientSpawnOnFreeTerminal(unsigned, string, float)"},
    {"Flight.dll", "?getMyTerminal@woATC@@QEAAPEAVwsAdrTerminal@@PEAVMovingObject@@@Z", &s_myTerm, "woATC::getMyTerminal(MovingObject*)"},
    {"Flight.dll", "?getTerminalByClient@woATC@@QEAAHI_N@Z", &s_termByClient, "woATC::getTerminalByClient(unsigned, bool)"},
    // a terminal
    {"Flight.dll", "?is_free@wsBasicTerminal@@QEBA_NXZ", &s_isFree, "wsBasicTerminal::is_free"},
    {"Flight.dll", "?get_client_id@wsBasicTerminal@@QEBAIXZ", &s_clientId, "wsBasicTerminal::get_client_id"},
    {"Flight.dll", "?get_acquire_order@wsBasicTerminal@@QEBAHXZ", &s_getOrder, "wsBasicTerminal::get_acquire_order"},
    {"Flight.dll", "?set_acquire_order@wsBasicTerminal@@QEAAXH@Z", &s_setOrder, "wsBasicTerminal::set_acquire_order(int)"},
    {"Flight.dll", "?get_acquired_miss_id@wsBasicTerminal@@QEBAAEBV?$basic_string@D@ed@@XZ", &s_missId, "wsBasicTerminal::get_acquired_miss_id"},
    {"Flight.dll", "?get_type_of_acquired@wsBasicTerminal@@QEBAAEBV?$basic_string@D@ed@@XZ", &s_typeAcq, "wsBasicTerminal::get_type_of_acquired"},
    {"Flight.dll", "?get_acquired_object@wsBasicTerminal@@QEBAPEAVwoLABase@@XZ", &s_acqObj, "wsBasicTerminal::get_acquired_object"},
    {"Flight.dll", "?is_acquired_by@wsBasicTerminal@@QEBA_NI@Z", &s_isAcqBy, "wsBasicTerminal::is_acquired_by(unsigned)"},
    {"Flight.dll", "?acquire@wsBasicTerminal@@QEAAXI@Z", &s_acquire, "wsBasicTerminal::acquire(unsigned)"},
    {"Flight.dll", "?acquire@wsBasicTerminal@@QEAAXIAEBV?$basic_string@D@ed@@0@Z", &s_acquire3, "wsBasicTerminal::acquire(unsigned, string, string)"},
    {"Flight.dll", "?free@wsBasicTerminal@@QEAAXXZ", &s_free, "wsBasicTerminal::free"},
    {"Flight.dll", "??_7wsAdrTerminal@@6B@", &s_adrVt, "wsAdrTerminal's virtual table (data)"},
    // atcprobe-2: a terminal taken for a mission id (a slot), and what the ATC then says of it
    {"Flight.dll", "?is_free_for_me@wsBasicTerminal@@QEBA_NAEBV?$basic_string@D@ed@@@Z", &s_freeForMeS, "wsBasicTerminal::is_free_for_me(string)"},
    {"Flight.dll", "?is_free_for_me@wsBasicTerminal@@QEBA_NI@Z", &s_freeForMeI, "wsBasicTerminal::is_free_for_me(unsigned)"},
    {"Flight.dll", "?is_acquired_by@wsBasicTerminal@@QEBA_NAEBV?$basic_string@D@ed@@@Z", &s_isAcqByS, "wsBasicTerminal::is_acquired_by(string)"},
    {"Flight.dll", "?owner_completely_dead_or_not_exist@wsBasicTerminal@@QEBA_NXZ", &s_ownerDead, "wsBasicTerminal::owner_completely_dead_or_not_exist"},
    {"Flight.dll", "?wait_for_objects_spawn@wsBasicTerminal@@QEAAX_N@Z", &s_waitSpawn, "wsBasicTerminal::wait_for_objects_spawn(bool)"},
    {"Flight.dll", "?setClientSpawnOnTerminalMiss@woATC@@QEAAPEBVwsAdrTerminal@@IAEBV?$basic_string@D@ed@@M@Z", &s_spawnOnMiss, "woATC::setClientSpawnOnTerminalMiss(unsigned, string, float)"},
    {"Flight.dll", "?getForcedTerminalByClient_@woATC@@AEAAPEAVwsAdrTerminal@@I_N@Z", &s_forced, "woATC::getForcedTerminalByClient_(unsigned, bool)"},
    // atcprobe-3: a terminal's state applied as DCS's own network message applies it
    {"Flight.dll", "?procTerminalStatus@woATC@@QEAAXIHH_N@Z", &s_termStatus, "woATC::procTerminalStatus(unsigned, int, int, bool)"},
    // atcprobe-4: candidates for giving back a terminal DCS's chooser has taken
    {"Flight.dll", "?freeUnusedTerminalAcquirement@woATC@@AEAA_NI@Z", &s_freeUnused, "woATC::freeUnusedTerminalAcquirement(unsigned)"},
    {"Flight.dll", "?Clean_Taxi@woATC@@QEAAXI@Z", &s_cleanTaxi, "woATC::Clean_Taxi(unsigned)"},
    {"Flight.dll", "?onObjectDestroy@woATC@@IEAAXI@Z", &s_objDestroy, "woATC::onObjectDestroy(unsigned)"},
    {"Flight.dll", "?procInitTerminals@woATC@@QEAAXAEBV?$vector@UTerminalState@@V?$allocator@UTerminalState@@@ed@@@ed@@@Z", &s_initTerms, "woATC::procInitTerminals(vector<TerminalState>)"},
};
static const int NSYMS = sizeof SYMS / sizeof SYMS[0];

static void loadDcs() {
  for (int i = 0; i < NSYMS; i++)
    if (!*SYMS[i].out) {
      HMODULE m = GetModuleHandleA(SYMS[i].dll);
      *SYMS[i].out = m ? (void *)GetProcAddress(m, SYMS[i].name) : nullptr;
    }
}

static const char N_SHIP[] = ".?AVwoShip@@";
static const char N_ATC[] = ".?AVwoATC@@";
static const char N_ADR[] = ".?AVwsAdrTerminal@@";
static const char N_BASIC[] = ".?AVwsBasicTerminal@@";
static const char N_MOVING[] = ".?AVMovingObject@@";

// ---------------------------------------------------------------- guarded calls (each returns false on an exception)
typedef void *(*FnThis)(const void *self);
typedef unsigned char (*FnByte)(const void *self);        // a bool comes back in the low byte only
typedef int (*FnInt)(const void *self);
typedef unsigned int (*FnUInt)(const void *self);
typedef void (*FnVoid)(void *self);
typedef void (*FnSetInt)(void *self, int v);
typedef void (*FnSetUInt)(void *self, unsigned int v);
typedef unsigned char (*FnByteUInt)(const void *self, unsigned int v);
typedef void *(*FnPtrInt)(const void *self, int n);
typedef void *(*FnPtrUIntInt)(void *self, unsigned int n, int k);
typedef void *(*FnPtrUInt)(void *self, unsigned int id);
typedef void *(*FnPtrUIntRef)(void *self, unsigned int id, const void *ref);
typedef void *(*FnPtrUIntRefF)(void *self, unsigned int id, const void *ref, float f);
typedef void *(*FnPtrPtr)(void *self, void *p);
typedef int (*FnIntUIntBool)(void *self, unsigned int id, bool flag);
typedef unsigned char (*FnByte2Ref)(const void *self, const void *a, const void *b);
typedef unsigned char (*FnObstr)(const void *self, void *term, const void *a, const void *b, float f);
typedef void (*FnAcquire3)(void *self, unsigned int id, const void *a, const void *b);
typedef void (*FnOut)(void *self, void *out);
typedef void *(*RegNextFn)(void *reg, int id, int kind);  // RegisterManager virtual table + 0x18

static bool gThis(void *fn, const void *self, void **out) {
  __try { *out = ((FnThis)fn)(self); return true; } __except (EXCEPTION_EXECUTE_HANDLER) { return false; }
}
static bool gByte(void *fn, const void *self, int *out) {
  __try { *out = ((FnByte)fn)(self) ? 1 : 0; return true; } __except (EXCEPTION_EXECUTE_HANDLER) { return false; }
}
static bool gInt(void *fn, const void *self, int *out) {
  __try { *out = ((FnInt)fn)(self); return true; } __except (EXCEPTION_EXECUTE_HANDLER) { return false; }
}
static bool gUInt(void *fn, const void *self, unsigned int *out) {
  __try { *out = ((FnUInt)fn)(self); return true; } __except (EXCEPTION_EXECUTE_HANDLER) { return false; }
}
static bool gVoid(void *fn, void *self) {
  __try { ((FnVoid)fn)(self); return true; } __except (EXCEPTION_EXECUTE_HANDLER) { return false; }
}
static bool gSetInt(void *fn, void *self, int v) {
  __try { ((FnSetInt)fn)(self, v); return true; } __except (EXCEPTION_EXECUTE_HANDLER) { return false; }
}
static bool gSetUInt(void *fn, void *self, unsigned int v) {
  __try { ((FnSetUInt)fn)(self, v); return true; } __except (EXCEPTION_EXECUTE_HANDLER) { return false; }
}
static bool gByteUInt(void *fn, const void *self, unsigned int v, int *out) {
  __try { *out = ((FnByteUInt)fn)(self, v) ? 1 : 0; return true; } __except (EXCEPTION_EXECUTE_HANDLER) { return false; }
}
static bool gPtrInt(void *fn, const void *self, int n, void **out) {
  __try { *out = ((FnPtrInt)fn)(self, n); return true; } __except (EXCEPTION_EXECUTE_HANDLER) { return false; }
}
static bool gPtrUIntInt(void *fn, void *self, unsigned int n, int k, void **out) {
  __try { *out = ((FnPtrUIntInt)fn)(self, n, k); return true; } __except (EXCEPTION_EXECUTE_HANDLER) { return false; }
}
static bool gPtrUInt(void *fn, void *self, unsigned int id, void **out) {
  __try { *out = ((FnPtrUInt)fn)(self, id); return true; } __except (EXCEPTION_EXECUTE_HANDLER) { return false; }
}
static bool gPtrUIntRef(void *fn, void *self, unsigned int id, const void *ref, void **out) {
  __try { *out = ((FnPtrUIntRef)fn)(self, id, ref); return true; } __except (EXCEPTION_EXECUTE_HANDLER) { return false; }
}
static bool gPtrUIntRefF(void *fn, void *self, unsigned int id, const void *ref, float f, void **out) {
  __try { *out = ((FnPtrUIntRefF)fn)(self, id, ref, f); return true; } __except (EXCEPTION_EXECUTE_HANDLER) { return false; }
}
static bool gPtrPtr(void *fn, void *self, void *p, void **out) {
  __try { *out = ((FnPtrPtr)fn)(self, p); return true; } __except (EXCEPTION_EXECUTE_HANDLER) { return false; }
}
static bool gIntUIntBool(void *fn, void *self, unsigned int id, bool flag, int *out) {
  __try { *out = ((FnIntUIntBool)fn)(self, id, flag); return true; } __except (EXCEPTION_EXECUTE_HANDLER) { return false; }
}
static bool gByte2Ref(void *fn, const void *self, const void *a, const void *b, int *out) {
  __try { *out = ((FnByte2Ref)fn)(self, a, b) ? 1 : 0; return true; } __except (EXCEPTION_EXECUTE_HANDLER) { return false; }
}
static bool gObstr(void *fn, const void *self, void *term, const void *a, const void *b, float f, int *out) {
  __try { *out = ((FnObstr)fn)(self, term, a, b, f) ? 1 : 0; return true; } __except (EXCEPTION_EXECUTE_HANDLER) { return false; }
}
static bool gAcquire3(void *fn, void *self, unsigned int id, const void *a, const void *b) {
  __try { ((FnAcquire3)fn)(self, id, a, b); return true; } __except (EXCEPTION_EXECUTE_HANDLER) { return false; }
}
typedef unsigned char (*FnByteRef)(const void *self, const void *ref);
typedef void (*FnSetBool)(void *self, bool on);
typedef void *(*FnPtrUIntBool)(void *self, unsigned int id, bool flag);
static bool gByteRef(void *fn, const void *self, const void *ref, int *out) {
  __try { *out = ((FnByteRef)fn)(self, ref) ? 1 : 0; return true; } __except (EXCEPTION_EXECUTE_HANDLER) { return false; }
}
static bool gSetBool(void *fn, void *self, bool on) {
  __try { ((FnSetBool)fn)(self, on); return true; } __except (EXCEPTION_EXECUTE_HANDLER) { return false; }
}
static bool gPtrUIntBool(void *fn, void *self, unsigned int id, bool flag, void **out) {
  __try { *out = ((FnPtrUIntBool)fn)(self, id, flag); return true; } __except (EXCEPTION_EXECUTE_HANDLER) { return false; }
}
static bool gOut(void *fn, void *self, void *out) {
  __try { ((FnOut)fn)(self, out); return true; } __except (EXCEPTION_EXECUTE_HANDLER) { return false; }
}

// ---------------------------------------------------------------- the world's register (G5)
// The object with that id (the mission script's object.id_), whatever kind it is filed under. *kind: where.
static void *registeredById(unsigned int id, int *kind) {
  if (!s_regInstance) return nullptr;
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
  return found;
}

// ---------------------------------------------------------------- the ship's ATC
// getATC is a virtual function and the ship has its own (woShip::getATC, Transport.dll, in place of wAirbase::getATC):
// the exported function is looked for in the object's own virtual tables and called with the part of the object it
// was found in (catcc_crew.cpp, atcOfObject). What comes back is only taken if its type information says woATC.
// *why: 0 found; -1 no type information / no getATC in its tables; -2 it gave no woATC.
static void *atcOfObject(void *obj, int *why) {
  Rtti r;
  *why = -1;
  if (!obj || !rttiRaw(obj, &r)) return nullptr;
  void *cands[2] = {s_shipGetAtc, s_airbaseGetAtc};
  for (int i = 0; i < 2; i++) {
    int mdisp = 0;
    if (!cands[i] || !findVirtual(r, cands[i], &mdisp)) continue;
    *why = -2;
    void *atc = nullptr;
    Rtti ra;
    if (!gThis(cands[i], (char *)r.complete + mdisp, &atc) || !atc || !rttiRaw(atc, &ra)) continue;
    if (!asClass(ra, N_ATC)) continue;
    *why = 0;
    return atc;
  }
  return nullptr;
}

static void *g_atc;
static bool atcAlive() {
  Rtti r;
  return g_atc && rttiRaw(g_atc, &r) && asClass(r, N_ATC);
}

// ---------------------------------------------------------------- the terminals
static const int MAX_TERMS = 512;
static void *g_terms[MAX_TERMS];  // wsAdrTerminal*, in the ATC's own order
static int g_nterms;

// G1: the list walked. >= 0: how many; -2 no head; -3 more than cap; -4 a back link does not fit; -5 the count is not
// the list's size; -100 exception.
static int walkListRaw(const void *list, void **out, int cap, size_t *sizeOut) {
  __try {
    void *head = *(void *const *)list;
    size_t size = *(const size_t *)((const char *)list + 8);
    *sizeOut = size;
    if (!head) return -2;
    if (size > (size_t)cap) return -3;
    int n = 0;
    void *prev = head;
    for (void *node = *(void **)head; node != head; node = *(void **)node) {
      if (!node || n >= cap) return -3;
      if (*(void **)((char *)node + 8) != prev) return -4;
      out[n++] = *(void **)((char *)node + 16);
      prev = node;
    }
    return (size_t)n == size ? n : -5;
  } __except (EXCEPTION_EXECUTE_HANDLER) {
    return -100;
  }
}

// G2: the terminals as woATC::forEachTerminal hands them to a function of ours. The argument (a std::function, by
// value) is built in place and left to the callee to destroy; its target (one pointer) lives inside it: nothing of
// ours is allocated or freed by DCS. ret: what our function answers (what DCS makes of it is to be learned: the count).
struct Collect {
  void **out;
  int cap, n;
  bool ret;
};
typedef std::function<bool(const void *)> TermFn;
typedef void (*FnForEach)(const void *self, void *fnObj);
static bool gForEach(void *fn, const void *self, void *fnObj) {
  __try { ((FnForEach)fn)(self, fnObj); return true; } __except (EXCEPTION_EXECUTE_HANDLER) { return false; }
}
static int forEachRaw(void *fn, const void *atc, void **out, int cap, bool ret) {
  Collect c = {out, cap, 0, ret};
  Collect *pc = &c;
  alignas(TermFn) unsigned char buf[sizeof(TermFn)];
  new (buf) TermFn([pc](const void *t) {
    if (pc->n < pc->cap) pc->out[pc->n] = (void *)t;
    pc->n++;
    return pc->ret;
  });
  if (!gForEach(fn, atc, buf)) return -100;
  return c.n;
}

// a terminal as its wsBasicTerminal part (where the exported getters live); *cls: its class
static void *termBasic(void *adr, const char **cls) {
  Rtti r;
  if (!adr || !rttiRaw(adr, &r)) return nullptr;
  if (cls) *cls = r.name;
  return asClass(r, N_BASIC);
}
static int termIndex(const void *p) {
  for (int i = 0; i < g_nterms; i++)
    if (g_terms[i] == p) return i + 1;
  return p ? -1 : 0;
}

struct TermNow {
  int free, order, hasObj, vt, dead;  // -1: could not be asked
  double client;                // -1: could not be asked
  char miss[72], type[72], cls[72];
  bool missOk, typeOk, orderOk;
};
static bool termRead(void *adr, TermNow *o) {
  memset(o, 0, sizeof *o);
  o->free = o->order = o->hasObj = o->dead = -1, o->client = -1;
  const char *cls = "";
  void *b = termBasic(adr, &cls);
  if (!b) return false;
  strncpy_s(o->cls, cls, _TRUNCATE);
  void *vt = nullptr;
  o->vt = (s_adrVt && rd(adr, &vt, sizeof vt) && vt == s_adrVt) ? 1 : 0;
  int v = 0;
  unsigned int u = 0;
  void *p = nullptr;
  if (s_isFree && gByte(s_isFree, b, &v)) o->free = v;
  if (s_clientId && gUInt(s_clientId, b, &u)) o->client = u;
  if (s_getOrder && gInt(s_getOrder, b, &v)) o->order = v, o->orderOk = true;
  if (s_acqObj && gThis(s_acqObj, b, &p)) o->hasObj = p ? 1 : 0;
  if (s_ownerDead && gByte(s_ownerDead, b, &v)) o->dead = v;
  if (s_missId && gThis(s_missId, b, &p)) o->missOk = readStr(p, o->miss, sizeof o->miss);
  if (s_typeAcq && gThis(s_typeAcq, b, &p)) o->typeOk = readStr(p, o->type, sizeof o->type);
  return true;
}

// where two numbers stand in an object's memory: x then z, as floats 8 apart (a Vec3f x, y, z), floats 4 apart, or
// doubles 16 apart. Out: the offset of x; how: 1 "f8", 2 "f4", 3 "d16". -1: not found.
static int locateRaw(const void *obj, int len, double x, double z, int *how, double tol = 0.02) {
  static unsigned char buf[1024];
  if (len > (int)sizeof buf) len = sizeof buf;
  int got = 0;
  for (; got + 16 <= len; got += 16)
    if (!rd((const char *)obj + got, buf + got, 16)) break;
  for (int o = 0; o + 12 <= got; o += 4) {
    float a, b8, b4;
    memcpy(&a, buf + o, 4), memcpy(&b4, buf + o + 4, 4), memcpy(&b8, buf + o + 8, 4);
    if (fabs(a - x) < tol && fabs(b8 - z) < tol) return *how = 1, o;
    if (fabs(a - x) < tol && fabs(b4 - z) < tol) return *how = 2, o;
  }
  for (int o = 0; o + 24 <= got; o += 8) {
    double a, b;
    memcpy(&a, buf + o, 8), memcpy(&b, buf + o + 16, 8);
    if (fabs(a - x) < tol && fabs(b - z) < tol) return *how = 3, o;
  }
  return -1;
}

// G4: the keys of a std::map<unsigned, ...>, in order. >= 0: how many written; -2 no head; -100 exception.
static int mapKeysRaw(const void *map, unsigned int *out, int cap, size_t *sizeOut) {
  __try {
    const char *head = *(const char *const *)map;
    *sizeOut = *(const size_t *)((const char *)map + 8);
    if (!head) return -2;
    int n = 0;
    const char *node = *(const char *const *)head;  // the leftmost
    for (int guard = 0; node != head && guard < 4096; guard++) {
      if (!node) return -2;
      if (n < cap) out[n] = *(const unsigned int *)(node + 0x20);
      n++;
      const char *right = *(const char *const *)(node + 16);
      if (!right[25]) {
        node = right;
        for (int g2 = 0; g2 < 64; g2++) {
          const char *left = *(const char *const *)node;
          if (left[25]) break;
          node = left;
        }
      } else {
        const char *par = *(const char *const *)(node + 8);
        for (int g2 = 0; g2 < 64 && !par[25] && node == *(const char *const *)(par + 16); g2++) {
          node = par;
          par = *(const char *const *)(par + 8);
        }
        node = par;
      }
    }
    return n;
  } __except (EXCEPTION_EXECUTE_HANDLER) {
    return -100;
  }
}

// ---------------------------------------------------------------- what was set, to be undone
struct Taken {
  void *adr;
  unsigned int id;
  char miss[64];  // the mission id it was taken for ("" none: acquire(unsigned))
  bool wait;      // wait_for_objects_spawn(true) was set on it
};
struct OrderWas {
  void *adr;
  int was;
};
static Taken g_taken[MAX_TERMS];
static int g_ntaken;
static OrderWas g_orders[MAX_TERMS];
static int g_norders;

// 0 done; -1 function missing / not a terminal; -100 exception. s1, s2: null for acquire(unsigned).
static int acquireRaw(void *adr, unsigned int id, const char *s1, const char *s2) {
  void *b = termBasic(adr, nullptr);
  void *fn = s1 ? s_acquire3 : s_acquire;
  if (!b || !fn) return -1;
  // (remembered BEFORE the call: an acquire that raised half way is still tried to be undone)
  Taken *tk = nullptr;
  for (int i = 0; i < g_ntaken; i++)
    if (g_taken[i].adr == adr) tk = &g_taken[i];
  if (!tk && g_ntaken < MAX_TERMS) tk = &g_taken[g_ntaken++], tk->wait = false;
  if (tk) {
    tk->adr = adr, tk->id = id;
    strncpy_s(tk->miss, s1 ? s1 : "", _TRUNCATE);
  }
  if (s1) {
    EdStr a, c;
    makeStr(&a, s1), makeStr(&c, s2 ? s2 : "");
    return gAcquire3(fn, b, id, &a, &c) ? 0 : -100;
  }
  return gSetUInt(fn, b, id) ? 0 : -100;
}
static int releaseRaw(void *adr) {
  void *b = termBasic(adr, nullptr);
  if (!b || !s_free) return -1;
  for (int i = 0; i < g_ntaken; i++)
    if (g_taken[i].adr == adr) g_taken[i--] = g_taken[--g_ntaken];
  return gVoid(s_free, b) ? 0 : -100;
}
static int setOrderRaw(void *adr, int v, int *was) {
  void *b = termBasic(adr, nullptr);
  if (!b || !s_setOrder || !s_getOrder) return -1;
  if (!gInt(s_getOrder, b, was)) return -100;
  bool known = false;
  for (int i = 0; i < g_norders; i++)
    if (g_orders[i].adr == adr) known = true;
  if (!known && g_norders < MAX_TERMS) g_orders[g_norders++] = {adr, *was};
  return gSetInt(s_setOrder, b, v) ? 0 : -100;
}
// Everything acquire took is freed, but only a terminal that still says it is taken by the id WE gave it (one a real
// aircraft has taken since is left alone: stillOurs); every order set is put back. Terminals that are no longer terminals (the
// mission has ended) are skipped.
// Is a terminal still as WE took it: the client id we gave it (read with its getter), the mission id we gave it (if
// any), and no object on it (an aircraft that spawned onto it under that mission id has made it its own).
static bool stillOurs(void *b, const Taken &tk) {
  unsigned int u = 0;
  void *p = nullptr;
  if (!s_clientId || !gUInt(s_clientId, b, &u) || u != tk.id) return false;
  if (s_acqObj && gThis(s_acqObj, b, &p) && p) return false;
  if (tk.miss[0] || tk.id == 0) {
    char now[72];
    if (!s_missId || !gThis(s_missId, b, &p) || !readStr(p, now, sizeof now) || strcmp(now, tk.miss) != 0) return false;
    // (taken for client 0 and no mission id: nothing tells it from a free terminal: left alone)
    if (!tk.miss[0]) return false;
  }
  return true;
}
// A terminal one of the ATC's own functions has just taken at our call (setClientSpawnOnTerminalMiss and its kin,
// procTerminalStatus): remembered AS IT NOW READS (its client id and mission id), so that undo gives it back for as
// long as it still reads so and has no aircraft on it.
static void recordAsSet(void *adr) {
  void *b = termBasic(adr, nullptr);
  if (!b || !s_clientId) return;
  unsigned int u = 0;
  void *p = nullptr;
  char miss[72] = "";
  if (!gUInt(s_clientId, b, &u)) return;
  if (s_missId && gThis(s_missId, b, &p)) readStr(p, miss, sizeof miss);
  if ((u == 0 && !miss[0]) || strlen(miss) > 60) return;
  Taken *tk = nullptr;
  for (int i = 0; i < g_ntaken; i++)
    if (g_taken[i].adr == adr) tk = &g_taken[i];
  if (!tk && g_ntaken < MAX_TERMS) tk = &g_taken[g_ntaken++];
  if (!tk) return;
  tk->adr = adr, tk->id = u, tk->wait = false;
  strncpy_s(tk->miss, miss, _TRUNCATE);
}

// woATC::procTerminalStatus(unsigned, int, int, bool) for one terminal. G6: its four arguments are taken to be the
// four fields of a TerminalState, the 16-byte record woATC::fillTerminalsState writes for each terminal, in the list's
// order (run 1: the client id, the terminal's Term_Index, its number in the spawn table, taken): the message a server
// sends its clients when a terminal is taken or given back. The terminal's own two numbers are read from
// fillTerminalsState's record for it, not from a layout of ours.
// 0 called; -1 functions missing / no such terminal; -2 fillTerminalsState did not give 16 bytes a terminal; -100 exception.
typedef void (*FnTermStatus)(void *self, unsigned int client, int ix, int num, bool taken);
static int termStatusRaw(void *atc, void *adr, unsigned int client, bool taken, int *ix, int *num) {
  int at = termIndex(adr);
  if (!atc || !s_termStatus || !s_fillState || at < 1) return -1;
  char *vec[3] = {nullptr, nullptr, nullptr};
  if (!gOut(s_fillState, atc, vec)) return -100;
  if (!vec[0] || vec[1] < vec[0] || (size_t)(vec[1] - vec[0]) != (size_t)g_nterms * 16) return -2;
  int row[4];
  if (!rd(vec[0] + (size_t)(at - 1) * 16, row, sizeof row)) return -2;
  *ix = row[1], *num = row[2];
  __try {
    ((FnTermStatus)s_termStatus)(atc, client, row[1], row[2], taken);
  } __except (EXCEPTION_EXECUTE_HANDLER) {
    return -100;
  }
  return 0;
}

// THE TERMINALS' STATES AS woATC::fillTerminalsState GIVES THEM (16 bytes a terminal: run 1), kept from stage A, and
// woATC::procInitTerminals(vector<TerminalState> const&): by its name and argument what a client runs on the list a
// server sends it when it joins. initTermsRaw: a fresh list is asked of the ATC, the records of the terminals named
// are replaced by their records of stage A, and the list handed to procInitTerminals: every other terminal is given
// its own present state. Both lists are DCS's own allocations and are left alone afterwards.
// stateSnapRaw: >= 0 the number of records kept; -1 missing; -2 not 16 bytes a terminal; -100 exception.
static unsigned char g_state0[MAX_TERMS * 16];
static int g_nstate0;
static int stateSnapRaw(void *atc) {
  g_nstate0 = 0;
  if (!atc || !s_fillState || g_nterms < 1) return -1;
  char *vec[3] = {nullptr, nullptr, nullptr};
  if (!gOut(s_fillState, atc, vec)) return -100;
  if (!vec[0] || vec[1] < vec[0] || (size_t)(vec[1] - vec[0]) != (size_t)g_nterms * 16) return -2;
  if (!rd(vec[0], g_state0, (size_t)g_nterms * 16)) return -2;
  return g_nstate0 = g_nterms;
}
// which: the places (1-based) of the terminals whose stage A records are put back. 0 called; -1 missing / no snapshot /
// a place out of range; -2 the fresh list is not 16 bytes a terminal; -100 exception.
static int initTermsRaw(void *atc, const int *which, int n) {
  if (!atc || !s_fillState || !s_initTerms || g_nstate0 != g_nterms || g_nterms < 1) return -1;
  for (int i = 0; i < n; i++)
    if (which[i] < 1 || which[i] > g_nterms) return -1;
  char *vec[3] = {nullptr, nullptr, nullptr};
  if (!gOut(s_fillState, atc, vec)) return -100;
  if (!vec[0] || vec[1] < vec[0] || (size_t)(vec[1] - vec[0]) != (size_t)g_nterms * 16) return -2;
  __try {
    for (int i = 0; i < n; i++) memcpy(vec[0] + (size_t)(which[i] - 1) * 16, g_state0 + (size_t)(which[i] - 1) * 16, 16);
    ((FnOut)s_initTerms)(atc, vec);
  } __except (EXCEPTION_EXECUTE_HANDLER) {
    return -100;
  }
  return 0;
}

// THE TERMINALS' STATES SET: woATC::procInitTerminals with the present states of every terminal, but for the terminals
// named the fields given. Run 4: stage A's record handed back this way put a chooser-taken terminal's two places (the
// word at +0x8c, the byte at +0x94) back, so the record's third field is that word and its fourth that byte; run 1: the
// first is the client id, the second the Term_Index (never changed here).
// rows: n times { place (1-based), client, number, taken }; a field of INT_MIN is left as the ATC reports it now.
// 0 called; -1 missing / a place out of range; -2 the fresh list is not 16 bytes a terminal; -100 exception.
static const int KEEP = (int)0x80000000;
static int initRowsRaw(void *atc, const int *rows, int n) {
  if (!atc || !s_fillState || !s_initTerms || g_nterms < 1) return -1;
  for (int i = 0; i < n; i++)
    if (rows[i * 4] < 1 || rows[i * 4] > g_nterms) return -1;
  char *vec[3] = {nullptr, nullptr, nullptr};
  if (!gOut(s_fillState, atc, vec)) return -100;
  if (!vec[0] || vec[1] < vec[0] || (size_t)(vec[1] - vec[0]) != (size_t)g_nterms * 16) return -2;
  __try {
    for (int i = 0; i < n; i++) {
      char *row = vec[0] + (size_t)(rows[i * 4] - 1) * 16;
      if (rows[i * 4 + 1] != KEEP) memcpy(row, &rows[i * 4 + 1], 4);
      if (rows[i * 4 + 2] != KEEP) memcpy(row + 8, &rows[i * 4 + 2], 4);
      if (rows[i * 4 + 3] != KEEP) row[12] = rows[i * 4 + 3] ? 1 : 0;
    }
    ((FnOut)s_initTerms)(atc, vec);
  } __except (EXCEPTION_EXECUTE_HANDLER) {
    return -100;
  }
  return 0;
}

// The terminals DCS's chooser has taken at our call, ever (kept after they are given back): the only ones `restore`
// will write to.
static void *g_chosen[MAX_TERMS];
static int g_nchosen;
static void noteChosen(void *adr) {
  for (int i = 0; i < g_nchosen; i++)
    if (g_chosen[i] == adr) return;
  if (g_nchosen < MAX_TERMS) g_chosen[g_nchosen++] = adr;
}
// TWO FIELDS OF A TERMINAL PUT BACK BY HAND (off by default in the hook: its RESTORE_BY_POKE). Run 3: the chooser's
// call changes the 4 bytes at +0x8c and the byte at +0x94 of the terminal, and no exported call tried puts them back.
// Only these two places, only on a terminal the chooser took at our call, only what the caller read there at stage A;
// read, written, read again. 0 written and read back; -1 not allowed (place / length / terminal); -2 unreadable or
// the write did not hold; -100 exception.
static int restoreRaw(void *adr, int off, const unsigned char *val, int len) {
  if (!((off == 0x8c && len == 4) || (off == 0x94 && len == 1))) return -1;
  if (!termBasic(adr, nullptr)) return -1;
  bool ours = false;
  for (int i = 0; i < g_nchosen; i++)
    if (g_chosen[i] == adr) ours = true;
  if (!ours) return -1;
  unsigned char now[4];
  if (!rd((char *)adr + off, now, len)) return -2;
  __try {
    memcpy((char *)adr + off, val, len);
  } __except (EXCEPTION_EXECUTE_HANDLER) {
    return -100;
  }
  if (!rd((char *)adr + off, now, len) || memcmp(now, val, len) != 0) return -2;
  return 0;
}

// wait_for_objects_spawn(on) on a terminal acquire() took (it is remembered there, and set back by undo).
// 0 done; -1 function missing / not a terminal / not one we took; -100 exception.
static int waitSpawnRaw(void *adr, bool on) {
  void *b = termBasic(adr, nullptr);
  if (!b || !s_waitSpawn) return -1;
  for (int i = 0; i < g_ntaken; i++)
    if (g_taken[i].adr == adr) {
      if (on) g_taken[i].wait = true;
      return gSetBool(s_waitSpawn, b, on) ? 0 : -100;
    }
  return -1;
}
static void undoRaw(int *freed, int *kept, int *restored) {
  *freed = *kept = *restored = 0;
  for (int i = 0; i < g_ntaken; i++) {
    void *b = termBasic(g_taken[i].adr, nullptr);
    if (b && s_free && stillOurs(b, g_taken[i])) {
      if (g_taken[i].wait && s_waitSpawn) gSetBool(s_waitSpawn, b, false);
      if (gVoid(s_free, b)) (*freed)++;
      else (*kept)++;
    } else {
      (*kept)++;
    }
  }
  g_ntaken = 0;
  for (int i = 0; i < g_norders; i++) {
    void *b = termBasic(g_orders[i].adr, nullptr);
    if (b && s_setOrder && gSetInt(s_setOrder, b, g_orders[i].was)) (*restored)++;
  }
  g_norders = 0;
}

// ================================================================ AIM AND RESTORE: the two calls the slot picker needs
// What runs 2 to 6 showed: a real spawn on the carrier takes the terminal with the LOWEST ORDER NUMBER from 5 on that
// has no aircraft on it, and the jet appears at that number's place (run 6: the numbers of two terminals exchanged,
// the ATC held the one, the jet stood on the other's spot). A terminal's order number is the third field of its
// record (fillTerminalsState) and the word at +0x8c of the terminal; procInitTerminals writes it for a terminal that
// has a Term_Index of its own (run 5, run 6: 27 at once), and cannot for the nine spawn-only terminals (Term_Index
// -1: it finds those by the number itself).
//   aim(T):     every terminal whose number is in play BEFORE T (5 <= number < T) is LIFTED out of play: its number
//               becomes number + 100 (mode 0: as run 6 did) or -(1000 + number) (mode 1). With a Term_Index: through
//               procInitTerminals, one call. Spawn-only: counted as blocking, or, if the caller allows it, the word at
//               +0x8c WRITTEN DIRECTLY (the only memory of DCS's this module ever writes): only after every
//               terminal's words at +0x88 / +0x8c have been found equal to its record's Term_Index / number, the
//               terminal's type checked again, the word read and found to be the number expected; read back after.
//               Verified at the end by a fresh list of records. Calling it again lifts nothing twice (a lifted
//               number is not in play).
//   restore():  every lifted number put back (a record's only if it still reads as we left it; a written word only
//               if it still reads as we wrote it), verified by a fresh list of records; then nothing is remembered.
//               Calling it twice does nothing the second time.
struct Lift {
  void *adr;
  int orig, lifted;
  bool written;
};
static Lift g_lift[MAX_TERMS];
static int g_nlift;
struct AimOut {
  int found, taken, lifted, written, blocked, failed, layoutBad;
  unsigned int client;
};
struct RestoreOut {
  int records, written, left, failed;
};
static bool wr(void *p, const void *in, size_t n) {
  __try {
    memcpy(p, in, n);
    return true;
  } __except (EXCEPTION_EXECUTE_HANDLER) {
    return false;
  }
}
// the ATC's terminals listed anew (g_terms): how many; < 0: the list could not be walked / a value is no terminal
static int refreshTermsRaw(void *atc) {
  if (!atc || !s_termList) return -1;
  void *list = nullptr;
  if (!gThis(s_termList, atc, &list) || !list) return -1;
  static void *found[MAX_TERMS];
  size_t size = 0;
  int n = walkListRaw(list, found, MAX_TERMS, &size);
  if (n < 1) return -1;
  for (int i = 0; i < n; i++)
    if (!termBasic(found[i], nullptr)) return -1;
  memcpy(g_terms, found, sizeof(void *) * n);
  g_nterms = n;
  return n;
}
// the ATC's records, fresh, copied (n x 4 ints: client, Term_Index, number, taken byte + padding) and its own list
// in vec (for procInitTerminals). 0; -1 missing; -2 not 16 bytes a terminal; -100 exception.
static int freshRows(void *atc, char **vec, int *copy) {
  if (!atc || !s_fillState || g_nterms < 1) return -1;
  vec[0] = vec[1] = vec[2] = nullptr;
  if (!gOut(s_fillState, atc, vec)) return -100;
  if (!vec[0] || vec[1] < vec[0] || (size_t)(vec[1] - vec[0]) != (size_t)g_nterms * 16) return -2;
  if (copy && !rd(vec[0], copy, (size_t)g_nterms * 16)) return -2;
  return 0;
}
// A number lifted out of play. mode 0 "up": number + 100 (runs 6 and 8; as the FIRST spawn of a mission it froze DCS,
// run 7). mode 1 "neg": -(1000 + number). mode 2 "low": 4: a number of the spawn table that is never chosen after
// mission start (numbers 1 to 4: DCS's four catapult places), and of those the last DCS would give at a mission start
// (run 4: 1, 2, 3, 4 in turn); every lifted terminal gets the same, so there is one value to reason about (run 6's B2
// put a number of that range on a second terminal without trouble).
static const int LOW_NUMBER = 4;
// The lowest number aim() puts out of play. 5: what a real spawn was seen to start from (numbers 1 to 4 are not
// given). 1: numbers 1 to 4 too: in some mission starts DCS does give them (run 4: its chooser gave spots 1, 2, 3, 4
// before 5; picker run of 2026-11-22 20:07: an aircraft on a terminal carrying number 4), and then a free spot 1 to 4
// would win over any target. The target itself still has to be 5 or more.
static int g_aimFloor = 5;
static int liftedValue(int num, int mode) { return mode == 2 ? LOW_NUMBER : mode == 1 ? -(1000 + num) : num + 100; }
static void rememberLift(void *adr, int orig, int lifted, bool written) {
  for (int i = 0; i < g_nlift; i++)
    if (g_lift[i].adr == adr) {
      g_lift[i].lifted = lifted, g_lift[i].written = written;
      return;
    }
  if (g_nlift < MAX_TERMS) g_lift[g_nlift++] = {adr, orig, lifted, written};
}
// 0 done (see *o); -1 functions missing / no terminals; -2 the records are not 16 bytes a terminal; -3 a target below
// 5; -4 no terminal has the target's number (nothing was changed); -100 exception.
static int aimRaw(void *atc, int target, int mode, bool allowWrite, AimOut *o) {
  memset(o, 0, sizeof *o);
  if (target < 5) return -3;
  if (!atc || !s_fillState || !s_initTerms) return -1;
  if (refreshTermsRaw(atc) < 1) return -1;
  static int rows[MAX_TERMS * 4], after[MAX_TERMS * 4];
  static int widx[MAX_TERMS];
  char *vec[3];
  int e = freshRows(atc, vec, rows);
  if (e != 0) return e;
  int nrec = 0, nw = 0;
  for (int i = 0; i < g_nterms; i++) {
    int ix = rows[i * 4 + 1], num = rows[i * 4 + 2];
    if (num == target) {
      o->found = 1;
      o->taken = (rows[i * 4 + 3] & 0xff) ? 1 : 0;
      o->client = (unsigned int)rows[i * 4];
    }
    if (num >= g_aimFloor && num < target) {
      if (ix >= 0) nrec++;
      else if (allowWrite) widx[nw++] = i;
      else o->blocked++;
    }
  }
  if (!o->found) return -4;
  if (nw > 0) {
    // (a write only if the two words are where run 3 to 6 found them, for EVERY terminal)
    for (int i = 0; i < g_nterms; i++) {
      int a = 0, b = 0;
      if (!rd((char *)g_terms[i] + 0x88, &a, 4) || !rd((char *)g_terms[i] + 0x8c, &b, 4) || a != rows[i * 4 + 1] || b != rows[i * 4 + 2]) o->layoutBad = 1;
    }
    if (o->layoutBad) o->blocked += nw, nw = 0;
  }
  if (nrec > 0) {
    __try {
      for (int i = 0; i < g_nterms; i++) {
        int ix = rows[i * 4 + 1], num = rows[i * 4 + 2];
        if (ix >= 0 && num >= g_aimFloor && num < target) {
          int v = liftedValue(num, mode);
          rememberLift(g_terms[i], num, v, false);
          memcpy(vec[0] + (size_t)i * 16 + 8, &v, 4);
        }
      }
      ((FnOut)s_initTerms)(atc, vec);
    } __except (EXCEPTION_EXECUTE_HANDLER) {
      return -100;
    }
    o->lifted = nrec;
  }
  for (int k = 0; k < nw; k++) {
    void *adr = g_terms[widx[k]];
    int num = rows[widx[k] * 4 + 2], v = liftedValue(num, mode), cur = 0;
    if (!termBasic(adr, nullptr) || !rd((char *)adr + 0x8c, &cur, 4) || cur != num) {
      o->failed++;
      continue;
    }
    rememberLift(adr, num, v, true);
    if (wr((char *)adr + 0x8c, &v, 4) && rd((char *)adr + 0x8c, &cur, 4) && cur == v) o->written++;
    else o->failed++;
  }
  // (read again: every number we lifted must read lifted in the ATC's own records)
  if (freshRows(atc, vec, after) == 0) {
    for (int k = 0; k < g_nlift; k++) {
      int i = termIndex(g_lift[k].adr) - 1;
      if (i < 0 || after[i * 4 + 2] != g_lift[k].lifted) o->failed++;
    }
  } else {
    o->failed++;
  }
  return 0;
}
// THE PRE-CHECK: would DCS take this spot's terminal right now? Read only. The terminal is found by the spot's number
// as it was before any aim (a lifted terminal is known by what we remember of it). DCS's own answers:
//   free       wsBasicTerminal::is_free
//   client     the ATC's record (woATC::fillTerminalsState)
//   object     wsBasicTerminal::get_acquired_object: an aircraft stands on it
//   obstructed woATC::isAdrTermObstructedFor(terminal, type, type, mass): run 1: true for the terminal a static Hornet
//              stands on, false for its neighbours 16 m away
//   wide       woATC::isAdrTermObstructedForDynamicAirdromeSpawn, the same arguments: run 1: true also for the
//              neighbours within about 29 m; NOT what a spawn on the ship goes by (33 spawns landed between statics)
// Each -1 when it could not be asked. The functions answer true / false only: they do not name what obstructs.
struct CheckOut {
  int place, ix, num, orig, type, lifted, isFree, taken, hasObj, obstructed, wide;
  unsigned int client;
};
// 0: *o filled; -1 functions missing / no terminals; -2 the records are not 16 bytes a terminal; -4 no terminal has
// (or had, before an aim) that number.
static int checkOneRaw(void *atc, const int *rows, int i, const char *type, float mass, CheckOut *o) {
  memset(o, 0, sizeof *o);
  void *adr = g_terms[i];
  o->place = i + 1, o->client = (unsigned int)rows[i * 4], o->ix = rows[i * 4 + 1], o->num = o->orig = rows[i * 4 + 2];
  o->taken = (rows[i * 4 + 3] & 0xff) ? 1 : 0;
  for (int k = 0; k < g_nlift; k++)
    if (g_lift[k].adr == adr) o->orig = g_lift[k].orig, o->lifted = 1;
  o->type = -1;
  rd((char *)adr + 0x90, &o->type, 4);
  o->isFree = o->hasObj = o->obstructed = o->wide = -1;
  TermNow t;
  if (termRead(adr, &t)) o->isFree = t.free, o->hasObj = t.hasObj;
  EdStr a, b;
  makeStr(&a, type);
  makeStr(&b, type);
  int v = 0;
  if (s_obstr && gObstr(s_obstr, atc, adr, &a, &b, mass, &v)) o->obstructed = v;
  if (s_obstrDyn && gObstr(s_obstrDyn, atc, adr, &a, &b, mass, &v)) o->wide = v;
  return 0;
}
static int checkPrep(void *atc, int *rows) {
  if (!atc || !s_fillState) return -1;
  if (refreshTermsRaw(atc) < 1) return -1;
  char *vec[3];
  return freshRows(atc, vec, rows);
}
static int checkRaw(void *atc, int spot, const char *type, float mass, CheckOut *o) {
  static int rows[MAX_TERMS * 4];
  int e = checkPrep(atc, rows);
  if (e != 0) return e;
  for (int i = 0; i < g_nterms; i++) {
    int orig = rows[i * 4 + 2];
    for (int k = 0; k < g_nlift; k++)
      if (g_lift[k].adr == g_terms[i]) orig = g_lift[k].orig;
    if (orig == spot) return checkOneRaw(atc, rows, i, type, mass, o);
  }
  return -4;
}
// usable: DCS has it free, no client, no aircraft on it, and does not call it obstructed (-1 "could not be asked"
// counts as not usable: the picker must not spawn on what it could not check)
static bool checkUsable(const CheckOut &o) { return o.isFree == 1 && o.client == 0 && o.hasObj == 0 && o.obstructed == 0; }
static const char *checkWhy(const CheckOut &o) {
  if (o.hasObj == 1) return "an aircraft stands on it";
  if (o.client != 0) return "held for a client";
  if (o.isFree == 0) return "not free (acquired)";
  if (o.obstructed == 1) return "obstructed (woATC::isAdrTermObstructedFor)";
  if (o.isFree < 0 || o.hasObj < 0 || o.obstructed < 0) return "could not be asked";
  return "";
}

// 0 done (see *o); -1 the ATC or its terminals are gone (nothing is remembered any more); -2 / -100 as above.
static int restoreLiftsRaw(void *atc, RestoreOut *o) {
  memset(o, 0, sizeof *o);
  if (g_nlift == 0) return 0;
  if (!atc || !s_fillState || !s_initTerms || refreshTermsRaw(atc) < 1) {
    g_nlift = 0;
    return -1;
  }
  static int rows[MAX_TERMS * 4];
  char *vec[3];
  int e = freshRows(atc, vec, rows);
  if (e != 0) return e;
  __try {
    for (int k = 0; k < g_nlift; k++) {
      if (g_lift[k].written) continue;
      int i = termIndex(g_lift[k].adr) - 1;
      if (i >= 0 && rows[i * 4 + 2] == g_lift[k].lifted) {
        memcpy(vec[0] + (size_t)i * 16 + 8, &g_lift[k].orig, 4);
        o->records++;
      } else {
        o->left++;
      }
    }
    if (o->records > 0) ((FnOut)s_initTerms)(atc, vec);
  } __except (EXCEPTION_EXECUTE_HANDLER) {
    return -100;
  }
  for (int k = 0; k < g_nlift; k++) {
    if (!g_lift[k].written) continue;
    void *adr = g_lift[k].adr;
    int cur = 0;
    if (termIndex(adr) > 0 && termBasic(adr, nullptr) && rd((char *)adr + 0x8c, &cur, 4) && cur == g_lift[k].lifted && wr((char *)adr + 0x8c, &g_lift[k].orig, 4) &&
        rd((char *)adr + 0x8c, &cur, 4) && cur == g_lift[k].orig)
      o->written++;
    else
      o->left++;
  }
  if (freshRows(atc, vec, rows) == 0) {
    for (int k = 0; k < g_nlift; k++) {
      int i = termIndex(g_lift[k].adr) - 1;
      if (i < 0 || rows[i * 4 + 2] != g_lift[k].orig) o->failed++;
    }
  } else {
    o->failed++;
  }
  g_nlift = 0;
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
static int (*p_lua_type)(lua_State *, int);
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
         resolve(m, "lua_tolstring", p_lua_tolstring) && resolve(m, "lua_gettop", p_lua_gettop) && resolve(m, "lua_type", p_lua_type) &&
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
static void pushPtr(lua_State *L, const void *p) {
  char s[32];
  sprintf_s(s, "%p", p);
  p_lua_pushstring(L, s);
}
static bool isNumber(lua_State *L, int i) { return p_lua_gettop(L) >= i && p_lua_type(L, i) == 3; }
static bool isString(lua_State *L, int i) { return p_lua_gettop(L) >= i && p_lua_type(L, i) == 4; }
// an id argument: a whole number 0..2^32-1
static bool idArg(lua_State *L, int i, unsigned int *out) {
  if (!isNumber(L, i)) return false;
  double v = p_lua_tonumber(L, i);
  if (!(v >= 0 && v <= 4294967295.0) || v != floor(v)) return false;
  *out = (unsigned int)v;
  return true;
}
// the terminal an argument names (its place in the list, 1-based), still a terminal
static void *termArg(lua_State *L, int i) {
  if (!isNumber(L, i)) return nullptr;
  double v = p_lua_tonumber(L, i);
  if (!(v >= 1 && v <= g_nterms) || v != floor(v)) return nullptr;
  void *adr = g_terms[(int)v - 1];
  return termBasic(adr, nullptr) ? adr : nullptr;
}
static const char NOT_ATTACHED[] = "no ATC (attach first; a new mission needs a new attach)";
static const char NO_TERM[] = "no such terminal (terminals() first)";

static int l_info(lua_State *L) {
  loadDcs();
  p_lua_createtable(L, 0, 3);
  setStr(L, "version", VERSION);
  setNum(L, "thread", GetCurrentThreadId());
  p_lua_createtable(L, 0, 0);
  int n = 0;
  for (int i = 0; i < NSYMS; i++)
    if (!*SYMS[i].out) {
      char one[240];
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

// the ship's ATC for aim / restore: the one attached if it is that ship's and still an ATC, else found anew.
// null: done; else why not.
static unsigned int g_shipId;
static const char *ensureShip(unsigned int id) {
  loadDcs();
  if (g_shipId == id && atcAlive()) return nullptr;
  g_atc = nullptr, g_nterms = 0, g_shipId = 0;
  if (!s_regInstance) return "RegisterManager::instance is not exported by edObjects.dll";
  if (!s_shipGetAtc && !s_airbaseGetAtc) return "neither woShip::getATC nor wAirbase::getATC is exported";
  int kind = -1;
  void *entry = registeredById(id, &kind);
  if (!entry) return "no object with that id in the world's register";
  Rtti r;
  if (!rttiRaw(entry, &r)) return "the object has no type information";
  if (!asClass(r, N_SHIP)) return "the object with that id is not a ship (woShip)";
  int why = 0;
  void *atc = atcOfObject(entry, &why);
  if (!atc) return why == -2 ? "the ship's getATC gave no woATC" : "getATC is not in the virtual tables of the ship";
  g_atc = atc, g_shipId = id;
  return nullptr;
}

// aim(shipObjectId, T [, mode [, allowWrite [, fromOne]]]) -> { target, taken, client, lifted, written, blocked, failed, layoutBad }
// mode "up" (default) | "neg" | "low"; allowWrite: the spawn-only terminals before T may have their number written directly;
// fromOne: numbers 1 to 4 are put out of play too (not with "low").
static int l_aim(lua_State *L) {
  unsigned int id = 0;
  if (!idArg(L, 1, &id) || id == 0) return fail(L, "not an object id");
  double t = p_lua_tonumber(L, 2);
  if (!isNumber(L, 2) || !(t >= 5 && t <= 1000) || t != floor(t)) return fail(L, "not a spot the chooser gives (5 and up)");
  const char *ms = isString(L, 3) ? p_lua_tolstring(L, 3, nullptr) : "up";
  int mode = strcmp(ms, "neg") == 0 ? 1 : strcmp(ms, "low") == 0 ? 2 : 0;
  bool allowWrite = p_lua_gettop(L) >= 4 && p_lua_toboolean(L, 4) != 0;
  bool fromOne = p_lua_gettop(L) >= 5 && p_lua_toboolean(L, 5) != 0;
  const char *why = ensureShip(id);
  if (why) return fail(L, why);
  AimOut o;
  // ("low" turns numbers into 4: with it the numbers below 5 are left alone)
  g_aimFloor = (fromOne && mode != 2) ? 1 : 5;
  int e = aimRaw(g_atc, (int)t, mode, allowWrite, &o);
  g_aimFloor = 5;
  nlog("aim(%d, %s%s%s): %s; lifted %d by record, %d by a write, %d spawn-only still in the way, %d not as wanted%s", (int)t, ms, allowWrite ? ", writes allowed" : "", fromOne ? ", from 1" : "",
       e == 0 ? "done" : e == -4 ? "no terminal has that number" : e == -100 ? "EXCEPTION" : "not possible", o.lifted, o.written, o.blocked, o.failed, o.layoutBad ? " (the two words are not where expected: nothing written)" : "");
  if (e != 0)
    return fail(L, e == -4 ? "no terminal has the target's number (nothing was changed)" : e == -100 ? "it raised an exception" : e == -2 ? "fillTerminalsState did not give 16 bytes a terminal" :
                   e == -3 ? "not a spot the chooser gives (5 and up)" : "the ATC's functions are not exported, or it has no terminals");
  p_lua_createtable(L, 0, 8);
  setNum(L, "target", t);
  setBool(L, "taken", o.taken != 0);
  setNum(L, "client", o.client);
  setNum(L, "lifted", o.lifted);
  setNum(L, "written", o.written);
  setNum(L, "blocked", o.blocked);
  setNum(L, "failed", o.failed);
  setBool(L, "layoutBad", o.layoutBad != 0);
  return 1;
}
static void pushCheck(lua_State *L, const CheckOut &o) {
  p_lua_createtable(L, 0, 14);
  setNum(L, "spot", o.orig);
  setNum(L, "place", o.place);
  setNum(L, "termIndex", o.ix);
  setNum(L, "number", o.num);
  setNum(L, "type", o.type);
  setBool(L, "lifted", o.lifted != 0);
  if (o.isFree >= 0) setBool(L, "free", o.isFree == 1);
  setNum(L, "client", o.client);
  setBool(L, "taken", o.taken != 0);
  if (o.hasObj >= 0) setBool(L, "object", o.hasObj == 1);
  if (o.obstructed >= 0) setBool(L, "obstructed", o.obstructed == 1);
  if (o.wide >= 0) setBool(L, "obstructedWide", o.wide == 1);
  setBool(L, "usable", checkUsable(o));
  setStr(L, "why", checkWhy(o));
}
// check(shipObjectId, spot [, typeName [, mass]]) -> { spot, place, termIndex, number, type, lifted, free, client,
//   taken, object, obstructed, obstructedWide, usable, why }: DCS's own answers about the spot's terminal; read only.
// check(shipObjectId [, nil, typeName, mass]) -> { [spot] = that table, ... } for every terminal (by its number as it
//   was before any aim).
// typeName default "FA-18C_hornet", mass default 16000 (what run 1 asked with).
static int l_check(lua_State *L) {
  unsigned int id = 0;
  if (!idArg(L, 1, &id) || id == 0) return fail(L, "not an object id");
  bool all = !isNumber(L, 2);
  double t = all ? 0 : p_lua_tonumber(L, 2);
  if (!all && (!(t >= 1 && t <= 1000) || t != floor(t))) return fail(L, "not a spot number");
  const char *type = isString(L, 3) ? p_lua_tolstring(L, 3, nullptr) : "FA-18C_hornet";
  float mass = isNumber(L, 4) ? (float)p_lua_tonumber(L, 4) : 16000.0f;
  const char *why = ensureShip(id);
  if (why) return fail(L, why);
  CheckOut o;
  if (!all) {
    int e = checkRaw(g_atc, (int)t, type, mass, &o);
    if (e != 0) return fail(L, e == -4 ? "no terminal has that spot's number" : e == -2 ? "fillTerminalsState did not give 16 bytes a terminal" : "the ATC's functions are not exported, or it has no terminals");
    nlog("check(%d, %s): place %d, Term_Index %d, number %d%s; free %d, client %u, object %d, obstructed %d (wide %d): %s", (int)t, type, o.place, o.ix, o.num, o.lifted ? " (lifted)" : "", o.isFree, o.client,
         o.hasObj, o.obstructed, o.wide, checkUsable(o) ? "USABLE" : checkWhy(o));
    pushCheck(L, o);
    return 1;
  }
  static int rows[MAX_TERMS * 4];
  int e = checkPrep(g_atc, rows);
  if (e != 0) return fail(L, e == -2 ? "fillTerminalsState did not give 16 bytes a terminal" : "the ATC's functions are not exported, or it has no terminals");
  p_lua_createtable(L, g_nterms, 0);
  for (int i = 0; i < g_nterms; i++) {
    checkOneRaw(g_atc, rows, i, type, mass, &o);
    if (o.orig < 1) continue;
    pushCheck(L, o);
    p_lua_rawseti(L, -2, o.orig);
  }
  return 1;
}
// restore([shipObjectId]) -> { records, written, left, failed }
static int l_restorelifts(lua_State *L) {
  unsigned int id = 0;
  if (idArg(L, 1, &id) && id != 0 && g_nlift > 0) {
    const char *why = ensureShip(id);
    if (why) {
      g_nlift = 0;
      return fail(L, why);
    }
  }
  int had = g_nlift;
  RestoreOut o;
  int e = restoreLiftsRaw(atcAlive() ? g_atc : nullptr, &o);
  if (had > 0)
    nlog("restore: %d numbers were lifted: %s; %d put back by record, %d by a write, %d left alone, %d not as at the start", had, e == 0 ? "done" : e == -100 ? "EXCEPTION" : "the ATC is gone", o.records,
         o.written, o.left, o.failed);
  if (e != 0) return fail(L, e == -100 ? "it raised an exception" : e == -2 ? "fillTerminalsState did not give 16 bytes a terminal" : "the ATC is gone (the mission has ended): nothing is remembered any more");
  p_lua_createtable(L, 0, 4);
  setNum(L, "records", o.records);
  setNum(L, "written", o.written);
  setNum(L, "left", o.left);
  setNum(L, "failed", o.failed);
  return 1;
}

static int l_attach(lua_State *L) {
  loadDcs();
  unsigned int id = 0;
  if (!idArg(L, 1, &id) || id == 0) return fail(L, "not an object id");
  g_shipId = 0;
  g_atc = nullptr, g_nterms = 0;
  if (!s_regInstance) return fail(L, "RegisterManager::instance is not exported by edObjects.dll");
  if (!s_shipGetAtc && !s_airbaseGetAtc) return fail(L, "neither woShip::getATC nor wAirbase::getATC is exported");
  int kind = -1;
  void *entry = registeredById(id, &kind);
  if (!entry) {
    nlog("attach: no object with id %u in the world's register", id);
    return fail(L, "no object with that id in the world's register");
  }
  Rtti r;
  if (!rttiRaw(entry, &r)) return fail(L, "the object has no type information");
  char cls[96];
  strncpy_s(cls, r.name, _TRUNCATE);
  if (!asClass(r, N_SHIP)) {
    nlog("attach: object %u is a %s, not a woShip", id, cls);
    return fail(L, "the object with that id is not a ship (woShip)");
  }
  int why = 0;
  void *atc = atcOfObject(entry, &why);
  if (!atc) {
    nlog("attach: ship %u (%s): no ATC (%d)", id, cls, why);
    return fail(L, why == -2 ? "the ship's getATC gave no woATC" : "getATC is not in the virtual tables of the ship");
  }
  Rtti ra;
  rttiRaw(atc, &ra);
  g_atc = atc, g_shipId = id;
  nlog("attach: ship %u is a %s (register kind %d); its ATC %p is a %s", id, cls, kind, atc, ra.name);
  p_lua_createtable(L, 0, 4);
  setStr(L, "cls", cls);
  setNum(L, "kind", kind);
  pushPtr(L, atc);
  p_lua_setfield(L, -2, "atc");
  setStr(L, "atcCls", ra.name);
  return 1;
}

static int l_detach(lua_State *L) {
  g_atc = nullptr, g_nterms = 0, g_ntaken = 0, g_norders = 0, g_shipId = 0, g_nlift = 0;
  p_lua_pushboolean(L, 1);
  return 1;
}

static int l_terminals(lua_State *L) {
  if (!atcAlive()) return fail(L, NOT_ATTACHED);
  if (!s_termList) return fail(L, "woATC::getTerminalList is not exported");
  void *list = nullptr;
  if (!gThis(s_termList, g_atc, &list) || !list) return fail(L, "getTerminalList raised an exception or gave nothing");
  static void *found[MAX_TERMS];
  size_t size = 0;
  int n = walkListRaw(list, found, MAX_TERMS, &size);
  if (n < 0) {
    char msg[160];
    sprintf_s(msg, "the terminal list is not laid out as guessed (G1): %s (its size word: %llu)",
              n == -100 ? "reading it raised an exception" : n == -2 ? "no head node" : n == -3 ? "too many nodes" : n == -4 ? "a back link does not fit" : "the count is not its size",
              (unsigned long long)size);
    nlog("terminals: %s", msg);
    return fail(L, msg);
  }
  // (every value must be a terminal by its type information, or none is taken)
  for (int i = 0; i < n; i++)
    if (!termBasic(found[i], nullptr)) {
      nlog("terminals: value %d of the list (%p) is not a wsBasicTerminal", i + 1, found[i]);
      return fail(L, "a value in the list is not a terminal (wsBasicTerminal) by its type information");
    }
  memcpy(g_terms, found, sizeof(void *) * n);
  g_nterms = n;
  p_lua_createtable(L, 0, 3);
  setNum(L, "n", n);
  setNum(L, "size", (double)size);
  p_lua_createtable(L, n, 0);
  for (int i = 0; i < n; i++) {
    TermNow t;
    termRead(g_terms[i], &t);
    p_lua_createtable(L, 0, 10);
    setNum(L, "i", i + 1);
    pushPtr(L, g_terms[i]);
    p_lua_setfield(L, -2, "ptr");
    setStr(L, "cls", t.cls);
    setBool(L, "vt", t.vt == 1);
    if (t.free >= 0) setBool(L, "free", t.free == 1);
    if (t.client >= 0) setNum(L, "client", t.client);
    if (t.orderOk) setNum(L, "order", t.order);
    if (t.hasObj >= 0) setBool(L, "obj", t.hasObj == 1);
    if (t.dead >= 0) setBool(L, "dead", t.dead == 1);
    {
      // (the 16 bytes at +0x88: run 3: Term_Index, the word the chooser changes, the type, the byte it sets)
      unsigned char x[16];
      if (rd((char *)g_terms[i] + 0x88, x, sizeof x)) {
        char hex[33];
        for (int k = 0; k < 16; k++) sprintf_s(hex + 2 * k, 3, "%02x", x[k]);
        setStr(L, "x", hex);
      }
    }
    if (t.missOk) setStr(L, "miss", t.miss);
    if (t.typeOk) setStr(L, "type", t.type);
    p_lua_rawseti(L, -2, i + 1);
  }
  p_lua_setfield(L, -2, "t");
  return 1;
}

static int l_foreach(lua_State *L) {
  if (!atcAlive()) return fail(L, NOT_ATTACHED);
  if (!s_forEach) return fail(L, "woATC::forEachTerminal is not exported");
  static void *got[MAX_TERMS];
  bool ret = p_lua_toboolean(L, 1) != 0;
  int n = forEachRaw(s_forEach, g_atc, got, MAX_TERMS, ret);
  if (n < 0) return fail(L, "forEachTerminal raised an exception");
  bool same = n == g_nterms;
  p_lua_createtable(L, 0, 3);
  setNum(L, "n", n);
  p_lua_createtable(L, n, 0);
  for (int i = 0; i < n && i < MAX_TERMS; i++) {
    int ix = termIndex(got[i]);
    if (ix != i + 1) same = false;
    p_lua_pushnumber(L, ix > 0 ? ix : 0);
    p_lua_rawseti(L, -2, i + 1);
  }
  p_lua_setfield(L, -2, "t");
  setBool(L, "same", same);
  nlog("foreach(%s): %d terminals, %s the list", ret ? "true" : "false", n, same ? "the same as" : "NOT the same as");
  return 1;
}

static int pushTermResult(lua_State *L, void *p) {
  p_lua_pushnumber(L, termIndex(p));
  pushPtr(L, p);
  return 2;
}

// byindex(which, n [, k]). G6: the int of getTerminalByTermIndex_ / _0 is taken to be the terminal's own number
// (Lua's Term_Index); what the unsigned and the int of getTerminal mean is not known (an index and a type? a client
// and a flag?): the hook only calls it where its setting says so.
static int l_byindex(lua_State *L) {
  if (!atcAlive()) return fail(L, NOT_ATTACHED);
  int which = (int)p_lua_tonumber(L, 1);
  double n = p_lua_tonumber(L, 2);
  if (!isNumber(L, 2) || !(n >= -1000000 && n <= 1000000) || n != floor(n)) return fail(L, "not a number to ask for");
  void *p = nullptr;
  if (which == 1 || which == 2) {
    void *fn = which == 1 ? s_byIdx : s_byIdx0;
    if (!fn) return fail(L, "that function is not exported");
    if (!gPtrInt(fn, g_atc, (int)n, &p)) return fail(L, "it raised an exception");
  } else if (which == 3) {
    if (!s_getTerminal) return fail(L, "woATC::getTerminal is not exported");
    if (n < 0) return fail(L, "getTerminal takes an unsigned number");
    if (!gPtrUIntInt(s_getTerminal, g_atc, (unsigned int)n, (int)p_lua_tonumber(L, 3), &p)) return fail(L, "it raised an exception");
  } else {
    return fail(L, "which: 1, 2 or 3");
  }
  return pushTermResult(L, p);
}

static int l_peek(lua_State *L) {
  void *adr = termArg(L, 1);
  if (!adr) return fail(L, NO_TERM);
  int off = (int)p_lua_tonumber(L, 2), len = (int)p_lua_tonumber(L, 3);
  if (off < 0 || off > 4096 || len < 1 || len > 1024) return fail(L, "offset 0..4096, length 1..1024");
  static char hex[2 * 1024 + 1];
  int n = 0;
  for (; n < len; n++) {
    unsigned char b;
    if (!rd((const char *)adr + off + n, &b, 1)) break;
    sprintf_s(hex + 2 * n, 3, "%02x", b);
  }
  if (n == 0) return fail(L, "that memory could not be read");
  p_lua_pushstring(L, hex);
  return 1;
}

static int l_locate(lua_State *L) {
  void *adr = termArg(L, 1);
  if (!adr) return fail(L, NO_TERM);
  int how = 0;
  double tol = isNumber(L, 4) ? p_lua_tonumber(L, 4) : 0.02;
  if (!(tol > 0 && tol <= 1)) tol = 0.02;
  int off = locateRaw(adr, 512, p_lua_tonumber(L, 2), p_lua_tonumber(L, 3), &how, tol);
  if (off < 0) return fail(L, "the two numbers are not in the terminal's first 512 bytes");
  p_lua_pushnumber(L, off);
  p_lua_pushstring(L, how == 1 ? "f8" : how == 2 ? "f4" : "d16");
  return 2;
}

// havefree([s1, s2]): woATC::haveFreeTerminalForDynamicSpawnClient, without arguments or with two strings.
// G6: the two strings are taken to be an aircraft's type name and (as in wsBasicTerminal::acquire(id, string,
// string) with its getters get_acquired_miss_id / get_type_of_acquired) a mission id; which is which is not known.
static int l_havefree(lua_State *L) {
  if (!atcAlive()) return fail(L, NOT_ATTACHED);
  int v = 0;
  if (isString(L, 1)) {
    if (!s_haveFree2) return fail(L, "haveFreeTerminalForDynamicSpawnClient(string, string) is not exported");
    EdStr a, b;
    makeStr(&a, p_lua_tolstring(L, 1, nullptr));
    makeStr(&b, isString(L, 2) ? p_lua_tolstring(L, 2, nullptr) : "");
    if (!gByte2Ref(s_haveFree2, g_atc, &a, &b, &v)) return fail(L, "it raised an exception");
  } else {
    if (!s_haveFree0) return fail(L, "haveFreeTerminalForDynamicSpawnClient() is not exported");
    if (!gByte(s_haveFree0, g_atc, &v)) return fail(L, "it raised an exception");
  }
  p_lua_pushboolean(L, v);
  return 1;
}

// canspawn(id): woATC::canClientSpawnOnTerminal(unsigned). G6: the unsigned is taken to be the ATC's client id (the
// key of its clients' list; see clients()).
static int l_canspawn(lua_State *L) {
  if (!atcAlive()) return fail(L, NOT_ATTACHED);
  unsigned int id = 0;
  if (!idArg(L, 1, &id)) return fail(L, "not an id");
  if (!s_canSpawn) return fail(L, "woATC::canClientSpawnOnTerminal is not exported");
  int v = 0;
  if (!gByteUInt(s_canSpawn, g_atc, id, &v)) return fail(L, "it raised an exception");
  p_lua_pushboolean(L, v);
  return 1;
}

// obstructed(i, which, s1, s2, f): which 1 woATC::isAdrTermObstructedFor(terminal, string, string, float), 2
// ...ForDynamicAirdromeSpawn (the same arguments). G6: the strings as for havefree; the float is taken to be the
// aircraft's mass (woATC::isTerminalNotSuitableByWeight(int, string, float) has the same string and float).
static int l_obstructed(lua_State *L) {
  if (!atcAlive()) return fail(L, NOT_ATTACHED);
  void *adr = termArg(L, 1);
  if (!adr) return fail(L, NO_TERM);
  void *fn = (int)p_lua_tonumber(L, 2) == 2 ? s_obstrDyn : s_obstr;
  if (!fn) return fail(L, "that function is not exported");
  if (!isString(L, 3) || !isString(L, 4)) return fail(L, "two strings wanted");
  EdStr a, b;
  makeStr(&a, p_lua_tolstring(L, 3, nullptr));
  makeStr(&b, p_lua_tolstring(L, 4, nullptr));
  int v = 0;
  if (!gObstr(fn, g_atc, adr, &a, &b, (float)p_lua_tonumber(L, 5), &v)) return fail(L, "it raised an exception");
  p_lua_pushboolean(L, v);
  return 1;
}

static int l_clients(lua_State *L) {
  if (!atcAlive()) return fail(L, NOT_ATTACHED);
  if (!s_clients) return fail(L, "woATC::getClients is not exported");
  void *map = nullptr;
  if (!gThis(s_clients, g_atc, &map) || !map) return fail(L, "getClients raised an exception or gave nothing");
  static unsigned int ids[256];
  size_t size = 0;
  int n = mapKeysRaw(map, ids, 256, &size);
  if (n < 0) return fail(L, n == -100 ? "reading the clients' list raised an exception (G4)" : "the clients' list has no head (G4)");
  p_lua_createtable(L, 0, 3);
  setNum(L, "size", (double)size);
  setNum(L, "walked", n);
  p_lua_createtable(L, n, 0);
  for (int i = 0; i < n && i < 256; i++) {
    p_lua_pushnumber(L, ids[i]);
    p_lua_rawseti(L, -2, i + 1);
  }
  p_lua_setfield(L, -2, "ids");
  return 1;
}

// termstate(): woATC::fillTerminalsState(vector<TerminalState>&) into an empty vector of ours; what DCS puts there is
// read (bytes; the element's layout is not known) and left alone: never freed (the allocator is DCS's), a few
// kilobytes leak per call.
static int l_termstate(lua_State *L) {
  if (!atcAlive()) return fail(L, NOT_ATTACHED);
  if (!s_fillState) return fail(L, "woATC::fillTerminalsState is not exported");
  char *vec[3] = {nullptr, nullptr, nullptr};
  if (!gOut(s_fillState, g_atc, vec)) return fail(L, "it raised an exception");
  if (!vec[0] || vec[1] < vec[0]) return fail(L, "it filled nothing");
  size_t bytes = (size_t)(vec[1] - vec[0]);
  static char hex[2 * 8192 + 1];
  size_t n = 0;
  for (; n < bytes && n < 8192; n++) {
    unsigned char b;
    if (!rd(vec[0] + n, &b, 1)) break;
    sprintf_s(hex + 2 * n, 3, "%02x", b);
  }
  hex[2 * n] = 0;
  p_lua_pushnumber(L, (double)bytes);
  p_lua_pushstring(L, hex);
  return 2;
}

// acquire(i, id [, s1, s2]): wsBasicTerminal::acquire(unsigned) or acquire(unsigned, string, string). G6: the
// unsigned is taken to be the id of the client the terminal is taken for (get_client_id gives it back); the strings
// (by the getters' names) a mission id and a type, order unknown.
static int l_acquire(lua_State *L) {
  void *adr = termArg(L, 1);
  if (!adr) return fail(L, NO_TERM);
  unsigned int id = 0;
  if (!idArg(L, 2, &id)) return fail(L, "not an id");
  const char *s1 = isString(L, 3) ? p_lua_tolstring(L, 3, nullptr) : nullptr;
  const char *s2 = isString(L, 4) ? p_lua_tolstring(L, 4, nullptr) : nullptr;
  // (client 0 without a mission id would be a free terminal again: nothing to undo it by)
  if (id == 0 && !(s1 && s1[0])) return fail(L, "client id 0 needs a mission id");
  if (s1 && strlen(s1) > 60) return fail(L, "the mission id is too long");
  int e = acquireRaw(adr, id, s1, s2);
  if (e != 0) {
    nlog("acquire: terminal %d id %u: %s", termIndex(adr), id, e == -100 ? "EXCEPTION" : "function missing");
    return fail(L, e == -100 ? "acquire raised an exception" : "wsBasicTerminal::acquire is not exported");
  }
  p_lua_pushboolean(L, 1);
  return 1;
}

// waitspawn(i, on): wsBasicTerminal::wait_for_objects_spawn(bool) on a terminal acquire() took. G6: taken to mark a
// terminal as kept for an object that has not spawned yet (so that its owner "not existing" does not free it).
static int l_waitspawn(lua_State *L) {
  void *adr = termArg(L, 1);
  if (!adr) return fail(L, NO_TERM);
  int e = waitSpawnRaw(adr, p_lua_toboolean(L, 2) != 0);
  if (e != 0) return fail(L, e == -100 ? "wait_for_objects_spawn raised an exception" : "wait_for_objects_spawn is not exported, or the terminal is not one acquire() took");
  p_lua_pushboolean(L, 1);
  return 1;
}

// freeforme(i, who) / acquiredby(i, who): wsBasicTerminal::is_free_for_me / is_acquired_by, who: a client id (a
// number) or a mission id (a string).
static int askTerm(lua_State *L, void *fnI, void *fnS) {
  void *adr = termArg(L, 1);
  if (!adr) return fail(L, NO_TERM);
  void *b = termBasic(adr, nullptr);
  int v = 0;
  if (isNumber(L, 2)) {
    unsigned int id = 0;
    if (!idArg(L, 2, &id)) return fail(L, "not an id");
    if (!fnI) return fail(L, "that function is not exported");
    if (!gByteUInt(fnI, b, id, &v)) return fail(L, "it raised an exception");
  } else if (isString(L, 2)) {
    if (!fnS) return fail(L, "that function is not exported");
    EdStr a;
    makeStr(&a, p_lua_tolstring(L, 2, nullptr));
    if (!gByteRef(fnS, b, &a, &v)) return fail(L, "it raised an exception");
  } else {
    return fail(L, "a client id or a mission id wanted");
  }
  p_lua_pushboolean(L, v);
  return 1;
}
static int l_freeforme(lua_State *L) { return askTerm(L, s_freeForMeI, s_freeForMeS); }
static int l_acquiredby(lua_State *L) { return askTerm(L, s_isAcqBy, s_isAcqByS); }

static int l_release(lua_State *L) {
  void *adr = termArg(L, 1);
  if (!adr) return fail(L, NO_TERM);
  int e = releaseRaw(adr);
  if (e != 0) return fail(L, e == -100 ? "free raised an exception" : "wsBasicTerminal::free is not exported");
  p_lua_pushboolean(L, 1);
  return 1;
}

// setorder(i, n): wsBasicTerminal::set_acquire_order(int). G6: what the order is for is not known (the order in
// which terminals are handed out? the order in which they were taken?).
static int l_setorder(lua_State *L) {
  void *adr = termArg(L, 1);
  if (!adr) return fail(L, NO_TERM);
  double v = p_lua_tonumber(L, 2);
  if (!isNumber(L, 2) || !(v >= -2147483648.0 && v <= 2147483647.0) || v != floor(v)) return fail(L, "not an order");
  int was = 0;
  int e = setOrderRaw(adr, (int)v, &was);
  if (e != 0) return fail(L, e == -100 ? "set_acquire_order raised an exception" : "get / set_acquire_order is not exported");
  p_lua_pushnumber(L, was);
  return 1;
}

static int l_undo(lua_State *L) {
  int freed = 0, kept = 0, restored = 0;
  undoRaw(&freed, &kept, &restored);
  nlog("undo: %d terminals freed, %d left alone (no longer taken by our id, or gone), %d orders put back", freed, kept, restored);
  p_lua_pushnumber(L, freed);
  p_lua_pushnumber(L, kept);
  p_lua_pushnumber(L, restored);
  return 3;
}

// The ATC's own "this client spawns on ..." functions. G6, ALL GUESSED from the names and the types alone:
//   setClientSpawnOnTerminal(unsigned)                    the unsigned: the client's id in the ATC's clients' list
//     (the aircraft's object id? the network client's id?); the terminal would then be one the ATC already holds for
//     that client. It returns the terminal (or null).
//   setClientSpawnOnTerminalByPoint(unsigned, Vec3f)      the same id; the point: a place the terminal nearest to
//     which is taken, in the terminals' own frame (the ship's: x forward, y up, z to starboard) or in the world's.
//   setClientSpawnOnFreeTerminal(unsigned, string, float) the same id; the string: the aircraft's type name; the
//     float: its mass (as isTerminalNotSuitableByWeight's).
// Whatever they change is NOT undone by undo() (what they change is not known).
static int l_spawnon(lua_State *L) {
  if (!atcAlive()) return fail(L, NOT_ATTACHED);
  unsigned int id = 0;
  if (!idArg(L, 1, &id)) return fail(L, "not an id");
  if (!s_spawnOn) return fail(L, "woATC::setClientSpawnOnTerminal is not exported");
  void *p = nullptr;
  bool ok = gPtrUInt(s_spawnOn, g_atc, id, &p);
  nlog("setClientSpawnOnTerminal(%u): %s, terminal %d (%p)", id, ok ? "returned" : "EXCEPTION", ok ? termIndex(p) : 0, p);
  if (!ok) return fail(L, "it raised an exception");
  if (termIndex(p) > 0) recordAsSet(p);
  return pushTermResult(L, p);
}
static int l_spawnonpoint(lua_State *L) {
  if (!atcAlive()) return fail(L, NOT_ATTACHED);
  unsigned int id = 0;
  if (!idArg(L, 1, &id)) return fail(L, "not an id");
  if (!s_spawnOnPt) return fail(L, "woATC::setClientSpawnOnTerminalByPoint is not exported");
  float v[4] = {(float)p_lua_tonumber(L, 2), (float)p_lua_tonumber(L, 3), (float)p_lua_tonumber(L, 4), 0};
  void *p = nullptr;
  bool ok = gPtrUIntRef(s_spawnOnPt, g_atc, id, v, &p);
  nlog("setClientSpawnOnTerminalByPoint(%u, %.2f %.2f %.2f): %s, terminal %d (%p)", id, v[0], v[1], v[2], ok ? "returned" : "EXCEPTION", ok ? termIndex(p) : 0, p);
  if (!ok) return fail(L, "it raised an exception");
  if (termIndex(p) > 0) recordAsSet(p);
  return pushTermResult(L, p);
}
static int l_spawnonfree(lua_State *L) {
  if (!atcAlive()) return fail(L, NOT_ATTACHED);
  unsigned int id = 0;
  if (!idArg(L, 1, &id)) return fail(L, "not an id");
  if (!s_spawnOnFree) return fail(L, "woATC::setClientSpawnOnFreeTerminal is not exported");
  if (!isString(L, 2)) return fail(L, "a string wanted");
  EdStr a;
  makeStr(&a, p_lua_tolstring(L, 2, nullptr));
  void *p = nullptr;
  bool ok = gPtrUIntRefF(s_spawnOnFree, g_atc, id, &a, (float)p_lua_tonumber(L, 3), &p);
  nlog("setClientSpawnOnFreeTerminal(%u, ...): %s, terminal %d (%p)", id, ok ? "returned" : "EXCEPTION", ok ? termIndex(p) : 0, p);
  if (!ok) return fail(L, "it raised an exception");
  if (termIndex(p) > 0) recordAsSet(p);
  return pushTermResult(L, p);
}

// spawnonmiss(id, s, f): woATC::setClientSpawnOnTerminalMiss(unsigned, string, float). G6: as setClientSpawnOnFree-
// Terminal's, or (by its name) the string is a mission id. forced(id, flag): woATC::getForcedTerminalByClient_
// (unsigned, bool): the terminal a client is forced onto, if the ATC holds one; what the bool asks is not known.
static int l_spawnonmiss(lua_State *L) {
  if (!atcAlive()) return fail(L, NOT_ATTACHED);
  unsigned int id = 0;
  if (!idArg(L, 1, &id)) return fail(L, "not an id");
  if (!s_spawnOnMiss) return fail(L, "woATC::setClientSpawnOnTerminalMiss is not exported");
  if (!isString(L, 2)) return fail(L, "a string wanted");
  EdStr a;
  makeStr(&a, p_lua_tolstring(L, 2, nullptr));
  void *p = nullptr;
  bool ok = gPtrUIntRefF(s_spawnOnMiss, g_atc, id, &a, (float)p_lua_tonumber(L, 3), &p);
  nlog("setClientSpawnOnTerminalMiss(%u, ...): %s, terminal %d (%p)", id, ok ? "returned" : "EXCEPTION", ok ? termIndex(p) : 0, p);
  if (!ok) return fail(L, "it raised an exception");
  if (termIndex(p) > 0) recordAsSet(p), noteChosen(p);
  return pushTermResult(L, p);
}
// termstatus(i, client, taken) -> Term_Index, number: woATC::procTerminalStatus for terminal i (see termStatusRaw)
static int l_termstatus(lua_State *L) {
  if (!atcAlive()) return fail(L, NOT_ATTACHED);
  void *adr = termArg(L, 1);
  if (!adr) return fail(L, NO_TERM);
  unsigned int id = 0;
  if (!idArg(L, 2, &id)) return fail(L, "not an id");
  bool taken = p_lua_toboolean(L, 3) != 0;
  int ix = 0, num = 0;
  int e = termStatusRaw(g_atc, adr, id, taken, &ix, &num);
  nlog("procTerminalStatus(%u, %d, %d, %s) for terminal %d: %s", id, ix, num, taken ? "true" : "false", termIndex(adr), e == 0 ? "returned" : e == -100 ? "EXCEPTION" : "not called");
  if (e != 0)
    return fail(L, e == -100 ? "it raised an exception" : e == -2 ? "fillTerminalsState did not give 16 bytes a terminal" : "procTerminalStatus or fillTerminalsState is not exported");
  if (taken) recordAsSet(adr);
  p_lua_pushnumber(L, ix);
  p_lua_pushnumber(L, num);
  return 2;
}
// atccall(which, id): one of the ATC's functions that take one unsigned. which "unused": woATC::freeUnusedTerminal-
// Acquirement(unsigned) -> bool (returned); "cleantaxi": woATC::Clean_Taxi(unsigned); "destroy": woATC::onObjectDestroy
// (unsigned). G6: the unsigned is taken to be a client's id (the first two) or an object's id (the last: by its name
// what the ATC runs for any object that is destroyed, so an id it does not know is its everyday case).
static int l_atccall(lua_State *L) {
  if (!atcAlive()) return fail(L, NOT_ATTACHED);
  const char *which = isString(L, 1) ? p_lua_tolstring(L, 1, nullptr) : "";
  unsigned int id = 0;
  if (!idArg(L, 2, &id)) return fail(L, "not an id");
  int v = 1;
  bool ok;
  if (strcmp(which, "unused") == 0) {
    if (!s_freeUnused) return fail(L, "woATC::freeUnusedTerminalAcquirement is not exported");
    ok = gByteUInt(s_freeUnused, g_atc, id, &v);
  } else if (strcmp(which, "cleantaxi") == 0) {
    if (!s_cleanTaxi) return fail(L, "woATC::Clean_Taxi is not exported");
    ok = gSetUInt(s_cleanTaxi, g_atc, id);
  } else if (strcmp(which, "destroy") == 0) {
    if (!s_objDestroy) return fail(L, "woATC::onObjectDestroy is not exported");
    ok = gSetUInt(s_objDestroy, g_atc, id);
  } else {
    return fail(L, "which: unused, cleantaxi or destroy");
  }
  nlog("atccall %s(%u): %s", which, id, ok ? "returned" : "EXCEPTION");
  if (!ok) return fail(L, "it raised an exception");
  p_lua_pushboolean(L, v);
  return 1;
}
// snapstate() -> n: the terminals' states kept (stage A). initterms(i, ...) -> true: woATC::procInitTerminals with the
// present states, but those of stage A for the terminals named (see initTermsRaw).
static int l_snapstate(lua_State *L) {
  if (!atcAlive()) return fail(L, NOT_ATTACHED);
  int n = stateSnapRaw(g_atc);
  if (n < 0) return fail(L, n == -100 ? "fillTerminalsState raised an exception" : n == -2 ? "fillTerminalsState did not give 16 bytes a terminal" : "fillTerminalsState is not exported, or no terminals");
  p_lua_pushnumber(L, n);
  return 1;
}
static int l_initterms(lua_State *L) {
  if (!atcAlive()) return fail(L, NOT_ATTACHED);
  static int which[MAX_TERMS];
  int n = 0;
  for (int a = 1; a <= p_lua_gettop(L) && n < MAX_TERMS; a++) {
    if (!isNumber(L, a)) return fail(L, "places wanted");
    which[n++] = (int)p_lua_tonumber(L, a);
  }
  int e = initTermsRaw(g_atc, which, n);
  nlog("procInitTerminals with %d terminals' states of stage A: %s", n, e == 0 ? "returned" : e == -100 ? "EXCEPTION" : "not called");
  if (e != 0)
    return fail(L, e == -100 ? "it raised an exception" : e == -2 ? "fillTerminalsState did not give 16 bytes a terminal" : "procInitTerminals is not exported, no snapshot (snapstate first), or no such terminal");
  p_lua_pushboolean(L, 1);
  return 1;
}
// initrows(spec) -> true: woATC::procInitTerminals (see initRowsRaw). spec: "place,client,number,taken;..." with "-"
// for a field left as it is ("27,-,5,0;13,900001,-,1").
static int l_initrows(lua_State *L) {
  if (!atcAlive()) return fail(L, NOT_ATTACHED);
  const char *spec = isString(L, 1) ? p_lua_tolstring(L, 1, nullptr) : nullptr;
  if (!spec) return fail(L, "a list of records wanted");
  static int rows[MAX_TERMS * 4];
  int n = 0, field = 0;
  const char *q = spec;
  while (*q && n < MAX_TERMS) {
    char *end = nullptr;
    int v;
    if (*q == '-' && (q[1] == ',' || q[1] == ';' || q[1] == 0)) {
      v = KEEP;
      end = (char *)q + 1;
    } else {
      double d = strtod(q, &end);
      if (end == q || !(d >= -2147483647.0 && d <= 4294967295.0)) return fail(L, "a record's field is not a number");
      v = d > 2147483647.0 ? (int)(unsigned int)d : (int)d;
    }
    if (field == 0 && v == KEEP) return fail(L, "a record needs its terminal's place");
    rows[n * 4 + field] = v;
    q = end;
    if (++field == 4) {
      field = 0;
      n++;
      if (*q == ';') q++;
      else if (*q) return fail(L, "a record has four fields");
    } else {
      if (*q != ',') return fail(L, "a record has four fields");
      q++;
    }
  }
  if (field != 0 || n == 0) return fail(L, "a record has four fields");
  int e = initRowsRaw(g_atc, rows, n);
  nlog("procInitTerminals with %d terminals' records set (%.200s): %s", n, spec, e == 0 ? "returned" : e == -100 ? "EXCEPTION" : "not called");
  if (e != 0)
    return fail(L, e == -100 ? "it raised an exception" : e == -2 ? "fillTerminalsState did not give 16 bytes a terminal" : "procInitTerminals is not exported, or no such terminal");
  p_lua_pushboolean(L, 1);
  return 1;
}
// peekatc(off, len) -> hex: the ATC object's own memory (read only), for comparing before and after a call
static int l_peekatc(lua_State *L) {
  if (!atcAlive()) return fail(L, NOT_ATTACHED);
  int off = (int)p_lua_tonumber(L, 1), len = (int)p_lua_tonumber(L, 2);
  if (off < 0 || off > 0x10000 || len < 1 || len > 1024) return fail(L, "offset 0..65536, length 1..1024");
  static char hex[2 * 1024 + 1];
  int n = 0;
  for (; n + 8 <= len; n += 8) {
    unsigned char b[8];
    if (!rd((const char *)g_atc + off + n, b, 8)) break;
    for (int k = 0; k < 8; k++) sprintf_s(hex + 2 * (n + k), 3, "%02x", b[k]);
  }
  if (n == 0) return fail(L, "that memory could not be read");
  p_lua_pushstring(L, hex);
  return 1;
}
// restore(i, off, hex) -> true: see restoreRaw. off 0x8c with 8 hex digits, or 0x94 with 2.
static int l_restore(lua_State *L) {
  void *adr = termArg(L, 1);
  if (!adr) return fail(L, NO_TERM);
  int off = (int)p_lua_tonumber(L, 2);
  size_t hl = 0;
  const char *hex = isString(L, 3) ? p_lua_tolstring(L, 3, &hl) : nullptr;
  unsigned char val[4];
  if (!hex || (hl != 8 && hl != 2)) return fail(L, "8 or 2 hex digits wanted");
  for (size_t k = 0; k < hl / 2; k++) {
    unsigned int b = 0;
    if (sscanf_s(hex + 2 * k, "%2x", &b) != 1) return fail(L, "not hex");
    val[k] = (unsigned char)b;
  }
  int e = restoreRaw(adr, off, val, (int)(hl / 2));
  nlog("restore: terminal %d +0x%x: %s", termIndex(adr), off, e == 0 ? "written and read back" : e == -1 ? "REFUSED" : e == -100 ? "EXCEPTION" : "did not hold");
  if (e != 0)
    return fail(L, e == -1 ? "refused: only +0x8c (4 bytes) and +0x94 (1 byte) of a terminal the chooser took at our call" : e == -100 ? "the write raised an exception" : "the write did not hold");
  p_lua_pushboolean(L, 1);
  return 1;
}
static int l_forced(lua_State *L) {
  if (!atcAlive()) return fail(L, NOT_ATTACHED);
  unsigned int id = 0;
  if (!idArg(L, 1, &id)) return fail(L, "not an id");
  if (!s_forced) return fail(L, "woATC::getForcedTerminalByClient_ is not exported");
  void *p = nullptr;
  if (!gPtrUIntBool(s_forced, g_atc, id, p_lua_toboolean(L, 2) != 0, &p)) return fail(L, "it raised an exception");
  return pushTermResult(L, p);
}

// termof(objectId): woATC::getMyTerminal(MovingObject*): the terminal the ATC holds for that aircraft (found in the
// world's register by its object id, taken only if its type information has a MovingObject in it).
static int l_termof(lua_State *L) {
  if (!atcAlive()) return fail(L, NOT_ATTACHED);
  unsigned int id = 0;
  if (!idArg(L, 1, &id) || id == 0) return fail(L, "not an object id");
  if (!s_myTerm) return fail(L, "woATC::getMyTerminal is not exported");
  int kind = -1;
  void *entry = registeredById(id, &kind);
  if (!entry) return fail(L, "no object with that id in the world's register");
  Rtti r;
  if (!rttiRaw(entry, &r)) return fail(L, "the object has no type information");
  void *mo = asClass(r, N_MOVING);
  if (!mo) return fail(L, "the object is not a MovingObject");
  char cls[96];
  strncpy_s(cls, r.name, _TRUNCATE);
  void *p = nullptr;
  if (!gPtrPtr(s_myTerm, g_atc, mo, &p)) return fail(L, "getMyTerminal raised an exception");
  pushTermResult(L, p);
  p_lua_pushstring(L, cls);
  return 3;
}

// termbyclient(id, flag): woATC::getTerminalByClient(unsigned, bool) -> int. G6: a terminal's number for a client's
// id; what the bool asks is not known.
static int l_termbyclient(lua_State *L) {
  if (!atcAlive()) return fail(L, NOT_ATTACHED);
  unsigned int id = 0;
  if (!idArg(L, 1, &id)) return fail(L, "not an id");
  if (!s_termByClient) return fail(L, "woATC::getTerminalByClient is not exported");
  int v = 0;
  if (!gIntUIntBool(s_termByClient, g_atc, id, p_lua_toboolean(L, 2) != 0, &v)) return fail(L, "it raised an exception");
  p_lua_pushnumber(L, v);
  return 1;
}

static const luaL_Reg funcs[] = {{"info", l_info},           {"setlog", l_setlog},       {"attach", l_attach},         {"detach", l_detach},
                                 {"terminals", l_terminals}, {"foreach", l_foreach},     {"byindex", l_byindex},       {"peek", l_peek},
                                 {"locate", l_locate},       {"havefree", l_havefree},   {"canspawn", l_canspawn},     {"obstructed", l_obstructed},
                                 {"clients", l_clients},     {"termstate", l_termstate}, {"acquire", l_acquire},       {"release", l_release},
                                 {"setorder", l_setorder},   {"undo", l_undo},           {"spawnon", l_spawnon},       {"spawnonpoint", l_spawnonpoint},
                                 {"spawnonfree", l_spawnonfree}, {"termof", l_termof},   {"termbyclient", l_termbyclient},
                                 {"waitspawn", l_waitspawn}, {"freeforme", l_freeforme}, {"acquiredby", l_acquiredby}, {"spawnonmiss", l_spawnonmiss},
                                 {"forced", l_forced},       {"termstatus", l_termstatus}, {"atccall", l_atccall},
                                 {"snapstate", l_snapstate}, {"initterms", l_initterms}, {"poke", l_restore},   {"initrows", l_initrows},
                                 {"aim", l_aim},             {"restore", l_restorelifts}, {"check", l_check},
                                 {"peekatc", l_peekatc},     {nullptr, nullptr}};

extern "C" __declspec(dllexport) int luaopen_catcc_atcprobe(lua_State *L) {
  if (!loadLua()) return 0;
  p_luaL_register(L, "catcc_atcprobe", funcs);
  return 1;
}

#endif  // CATCC_SELFTEST (the self-test is catcc_atcprobe_selftest.cpp, which includes this file)
