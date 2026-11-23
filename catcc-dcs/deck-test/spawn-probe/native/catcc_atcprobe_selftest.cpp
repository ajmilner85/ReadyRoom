// Self-test of catcc_atcprobe.cpp (built and run by build.cmd before the DLL): what the module assumes about the
// compiler's ABI (the list, the map, the string, std::function passed by value, how each argument list is passed),
// its guarded calls and its undo, tried on stand-in classes that are shaped like DCS's and carry DCS's class names
// (woATC, wsBasicTerminal, wsAdrTerminal, woShip, MovingObject), with the compiler DCS is built with (MSVC x64).
// What it can't check is DCS's own data: that ed::list / ed::map / ed::string are the standard library's layouts is
// checked by the module at run time (the list: back links, size, every value's type) or shows in the log.
#define CATCC_SELFTEST
#include "catcc_atcprobe.cpp"

#include <list>
#include <map>
#include <string>
#include <vector>

#define NOINL __declspec(noinline)

class wsBasicTerminal {
 public:
  virtual ~wsBasicTerminal() {}
  unsigned client = 0;
  int order = 0;
  std::string miss, type;
  void *obj = nullptr;
  bool waiting = false;
  NOINL bool is_free_for_me(unsigned id) const { return client == 0 || client == id; }
  NOINL bool is_free_for_me(const std::string &m) const { return (client == 0 && miss.empty()) || miss == m; }
  NOINL bool is_acquired_by(const std::string &m) const { return !miss.empty() && miss == m; }
  NOINL bool owner_completely_dead_or_not_exist() const { return !is_free() && !obj && !waiting; }
  NOINL void wait_for_objects_spawn(bool on) { waiting = on; }
  NOINL bool is_free() const { return client == 0 && miss.empty(); }
  NOINL unsigned get_client_id() const { return client; }
  NOINL int get_acquire_order() const { return order; }
  NOINL void set_acquire_order(int v) { order = v; }
  NOINL const std::string &get_acquired_miss_id() const { return miss; }
  NOINL const std::string &get_type_of_acquired() const { return type; }
  NOINL void *get_acquired_object() const { return obj; }
  NOINL bool is_acquired_by(unsigned id) const { return client == id; }
  NOINL void acquire(unsigned id) { client = id; }
  NOINL void acquire(unsigned id, const std::string &a, const std::string &b) { client = id, miss = a, type = b; }
  NOINL void free() { client = 0, miss.clear(), type.clear(), obj = nullptr; }
};
class wsAdrTerminal : public wsBasicTerminal {
 public:
  char pad88[0x28] = {};  // (so that the two words stand where DCS's do: Term_Index at +0x88, the number at +0x8c)
  int termIndex = 0, number = 0, termType = 72;
  bool flag = false;
  float pos[3] = {0, 0, 0};
};
struct Pad {
  virtual int pad() { return 1; }
  int x = 5;
};
// a terminal whose wsBasicTerminal part is NOT at its start: the getters must be given that part
class wsShipTerminal : public Pad, public wsAdrTerminal {
 public:
  int more = 9;
};

struct ClientData {
  void *a = nullptr;
  double b[30] = {};
};
struct TerminalState {  // 16 bytes, as DCS's turned out to be
  unsigned client;
  int index, number;
  bool taken;
};
class MovingObject {
 public:
  virtual ~MovingObject() {}
  int mo = 3;
};

class woATC {
 public:
  virtual ~woATC() {}
  std::list<wsAdrTerminal *> terms;
  std::map<unsigned, ClientData> clients;
  mutable int calls = 0;
  mutable std::string lastA, lastB;
  mutable float lastF = 0, lastP[3] = {0, 0, 0};
  mutable unsigned lastId = 0;
  mutable bool lastFlag = false;
  mutable void *lastTerm = nullptr, *lastObj = nullptr;
  NOINL const std::list<wsAdrTerminal *> &getTerminalList() { return terms; }
  NOINL void forEachTerminal(std::function<bool(const wsAdrTerminal *)> f) const {
    for (auto t : terms)
      if (!f(t)) break;
  }
  NOINL wsAdrTerminal *getTerminalByTermIndex_(int n) const {
    for (auto t : terms)
      if (t->termIndex == n) return t;
    return nullptr;
  }
  NOINL wsAdrTerminal *getTerminal(unsigned n, int k) {
    lastId = n, calls = k;
    return getTerminalByTermIndex_((int)n);
  }
  NOINL bool haveFreeTerminalForDynamicSpawnClient() const {
    for (auto t : terms)
      if (t->is_free()) return true;
    return false;
  }
  NOINL bool haveFreeTerminalForDynamicSpawnClient(const std::string &a, const std::string &b) const {
    lastA = a, lastB = b;
    return haveFreeTerminalForDynamicSpawnClient();
  }
  NOINL bool canClientSpawnOnTerminal(unsigned id) { return clients.count(id) != 0; }
  NOINL bool isAdrTermObstructedFor(wsAdrTerminal *t, const std::string &a, const std::string &b, float f) const {
    lastTerm = t, lastA = a, lastB = b, lastF = f;
    return t->termIndex == 2;
  }
  NOINL const std::map<unsigned, ClientData> &getClients() const { return clients; }
  NOINL void fillTerminalsState(std::vector<TerminalState> &v) {
    for (auto t : terms) v.push_back({t->client, t->termIndex + (t == skewT ? 7 : 0), t->number, !t->is_free()});
  }
  wsAdrTerminal *skewT = nullptr;
  mutable unsigned unusedId = 0, taxiId = 0, destroyedId = 0;
  NOINL bool freeUnusedTerminalAcquirement(unsigned id) {
    unusedId = id;
    return id == 900001u;
  }
  NOINL void Clean_Taxi(unsigned id) { taxiId = id; }
  NOINL void onObjectDestroy(unsigned id) { destroyedId = id; }
  int inits = 0;
  NOINL void procInitTerminals(const std::vector<TerminalState> &v) {
    inits++;
    size_t i = 0;
    for (auto t : terms) {
      if (i < v.size() && !v[i].taken && !t->is_free()) t->free();
      if (i < v.size() && v[i].taken) t->client = v[i].client;
      if (i < v.size()) t->number = v[i].number, t->flag = v[i].taken;
      i++;
    }
  }
  NOINL void procTerminalStatus(unsigned client, int ix, int num, bool taken) {
    for (auto t : terms)
      if (t->termIndex == ix && t->number == num) {
        if (taken) t->client = client, t->miss = "via status";
        else t->free();
      }
  }
  NOINL const wsAdrTerminal *setClientSpawnOnTerminal(unsigned id) {
    lastId = id;
    return terms.empty() ? nullptr : terms.back();
  }
  NOINL const wsAdrTerminal *setClientSpawnOnTerminalByPoint(unsigned id, const float (&p)[3]) {
    lastId = id, lastP[0] = p[0], lastP[1] = p[1], lastP[2] = p[2];
    return terms.empty() ? nullptr : terms.front();
  }
  NOINL const wsAdrTerminal *setClientSpawnOnFreeTerminal(unsigned id, const std::string &a, float f) {
    lastId = id, lastA = a, lastF = f;
    return nullptr;
  }
  NOINL wsAdrTerminal *getMyTerminal(MovingObject *o) {
    lastObj = o;
    return terms.empty() ? nullptr : terms.front();
  }
  NOINL const wsAdrTerminal *setClientSpawnOnTerminalMiss(unsigned id, const std::string &a, float f) {
    lastId = id, lastA = a, lastF = f;
    return terms.empty() ? nullptr : terms.front();
  }
  NOINL wsAdrTerminal *getForcedTerminalByClient_(unsigned id, bool flag) {
    lastId = id, lastFlag = flag;
    return flag ? terms.back() : nullptr;
  }
  NOINL int getTerminalByClient(unsigned id, bool flag) {
    lastId = id, lastFlag = flag;
    return 17;
  }
  NOINL void *crash() const { return *(void **)(uintptr_t)8; }
};

// the world's register: "next" in virtual slot 3; an entry has its id at +0x1c
struct Hull {
  virtual ~Hull() {}
  int pad[5] = {0, 0, 0, 0, 0};
  unsigned id = 0;
};
class wAirbase {
 public:
  virtual woATC *getATC() const { return nullptr; }
  int ab = 1;
};
class woShip : public Hull, public wAirbase {  // its getATC wants `this` at its wAirbase part, not at the ship's start
 public:
  woATC *atc = nullptr;
  NOINL woATC *getATC() const override { return atc; }
};
class CVN : public woShip {
 public:
  int deck = 4;
};
struct Jet : Hull, MovingObject {};
struct RegMgr {
  std::vector<Hull *> ships, others;
  virtual void v0() {}
  virtual void v1() {}
  virtual void v2() {}
  virtual void *next(int id, int kind) {
    std::vector<Hull *> *v = kind == 0x21 ? &ships : kind == 0x40 ? &others : nullptr;
    if (!v || v->empty()) return nullptr;
    if (id == 0) return (*v)[0];
    for (size_t i = 0; i < v->size(); i++)
      if ((int)(*v)[i]->id == id) return (*v)[(i + 1) % v->size()];
    return nullptr;
  }
};
static void *g_reg;

template <class F> static void *addrOf(F f) {
  void *p;
  memcpy(&p, &f, sizeof p);
  return p;
}

static int g_fail;
static void check(bool ok, const char *what) {
  printf("%s  %s\n", ok ? "ok  " : "FAIL", what);
  if (!ok) g_fail++;
}

int main() {
  // ---- the layouts guessed
  check(sizeof(EdStr) == sizeof(std::string), "ed::string stand-in is the size of std::string");
  check(sizeof(TermFn) == 64, "std::function is 64 bytes");
  {
    std::string shortS = "FA-18C_hornet", longS = "a string that is longer than fifteen characters";
    char out[80];
    check(readStr(&shortS, out, sizeof out) && shortS == out, "a short std::string read");
    check(readStr(&longS, out, sizeof out) && longS == out, "a long std::string read");
    EdStr a, b;
    makeStr(&a, shortS.c_str()), makeStr(&b, longS.c_str());
    check(*(const std::string *)&a == shortS && *(const std::string *)&b == longS, "a string of ours reads as a std::string (short, long)");
  }

  // ---- the terminals
  woATC atc;
  std::vector<wsAdrTerminal *> made;
  for (int i = 1; i <= 48; i++) {
    wsAdrTerminal *t = (i % 5 == 0) ? static_cast<wsAdrTerminal *>(new wsShipTerminal()) : new wsAdrTerminal();
    t->termIndex = i <= 31 ? i : -1;
    t->termType = i <= 40 ? 72 : 40;
    t->number = i;
    t->pos[0] = 162.39f - 7 * i, t->pos[1] = 20.15f, t->pos[2] = 9.33f - i;
    made.push_back(t);
    atc.terms.push_back(t);
  }
  s_termList = addrOf(&woATC::getTerminalList);
  void *list = nullptr;
  check(gThis(s_termList, &atc, &list) && list == &atc.terms, "getTerminalList called");
  static void *got[MAX_TERMS];
  size_t size = 0;
  int n = walkListRaw(list, got, MAX_TERMS, &size);
  bool same = n == 48 && size == 48;
  for (int i = 0; same && i < 48; i++) same = got[i] == made[i];
  check(same, "a std::list of 48 walked: the size, the order, the values");
  {
    std::list<wsAdrTerminal *> none, one;
    one.push_back(made[0]);
    check(walkListRaw(&none, got, MAX_TERMS, &size) == 0 && size == 0, "an empty list: 0");
    check(walkListRaw(&one, got, MAX_TERMS, &size) == 1 && got[0] == made[0], "a list of one");
    check(walkListRaw(list, got, 10, &size) == -3, "a list longer than the room for it: refused");
    // (not a list at all: two words that point nowhere good)
    void *junk[2] = {(void *)(uintptr_t)0x10, (void *)(uintptr_t)3};
    check(walkListRaw(junk, got, MAX_TERMS, &size) == -100, "not a list: an exception, caught");
    // (a list whose size word lies: as when the layout is not the one guessed)
    void *lying[2] = {*(void **)list, (void *)(uintptr_t)47};
    check(walkListRaw(lying, got, MAX_TERMS, &size) == -5, "a count that is not the list's size: refused");
    // (a ring of nodes whose back links do not fit)
    void *nodeB[3], *nodeA[3], *head[3];
    head[0] = nodeA, head[1] = nodeB, head[2] = nullptr;
    nodeA[0] = nodeB, nodeA[1] = head, nodeA[2] = made[0];
    nodeB[0] = head, nodeB[1] = head, nodeB[2] = made[1];  // should point back at nodeA
    void *bad[2] = {head, (void *)(uintptr_t)2};
    check(walkListRaw(bad, got, MAX_TERMS, &size) == -4, "a back link that does not fit: refused");
  }
  n = walkListRaw(list, got, MAX_TERMS, &size);
  memcpy(g_terms, got, sizeof(void *) * n);
  g_nterms = n;

  // ---- a terminal's type and getters
  s_isFree = addrOf(&wsBasicTerminal::is_free);
  s_clientId = addrOf(&wsBasicTerminal::get_client_id);
  s_getOrder = addrOf(&wsBasicTerminal::get_acquire_order);
  s_setOrder = addrOf(&wsBasicTerminal::set_acquire_order);
  s_missId = addrOf(&wsBasicTerminal::get_acquired_miss_id);
  s_typeAcq = addrOf(&wsBasicTerminal::get_type_of_acquired);
  s_acqObj = addrOf(&wsBasicTerminal::get_acquired_object);
  s_isAcqBy = addrOf(static_cast<bool (wsBasicTerminal::*)(unsigned) const>(&wsBasicTerminal::is_acquired_by));
  s_acquire = addrOf(static_cast<void (wsBasicTerminal::*)(unsigned)>(&wsBasicTerminal::acquire));
  s_acquire3 = addrOf(static_cast<void (wsBasicTerminal::*)(unsigned, const std::string &, const std::string &)>(&wsBasicTerminal::acquire));
  s_free = addrOf(&wsBasicTerminal::free);
  s_adrVt = *(void **)made[0];
  const char *cls = "";
  check(termBasic(made[0], &cls) == (void *)static_cast<wsBasicTerminal *>(made[0]) && strcmp(cls, N_ADR) == 0, "a wsAdrTerminal: its wsBasicTerminal part, its class");
  check((void *)made[4] != (void *)static_cast<wsShipTerminal *>(made[4]), "(the derived terminal's wsAdrTerminal part is not at its start)");
  check(termBasic(made[4], &cls) == (void *)static_cast<wsBasicTerminal *>(made[4]) && strcmp(cls, ".?AVwsShipTerminal@@") == 0, "a class derived from wsAdrTerminal with another base first: the right part");
  {
    Pad notTerm;
    int plain[8] = {1, 2, 3, 4, 5, 6, 7, 8};
    check(termBasic(&notTerm, nullptr) == nullptr, "an object that is no terminal: refused");
    check(termBasic(plain, nullptr) == nullptr && termBasic(nullptr, nullptr) == nullptr && termBasic((void *)(uintptr_t)0x1000, nullptr) == nullptr, "no object at all: refused, nothing raised");
  }
  made[4]->client = 16777472u, made[4]->order = -1, made[4]->miss = "17", made[4]->type = "FA-18C_hornet", made[4]->obj = &atc;
  TermNow t;
  check(termRead(made[4], &t) && t.free == 0 && t.client == 16777472.0 && t.order == -1 && t.orderOk && t.hasObj == 1 && t.missOk && !strcmp(t.miss, "17") &&
            t.typeOk && !strcmp(t.type, "FA-18C_hornet") && t.vt == 0,
        "a taken terminal read through its getters (an order of -1 is an order)");
  check(termRead(made[0], &t) && t.free == 1 && t.client == 0 && t.order == 0 && t.hasObj == 0 && t.missOk && !t.miss[0] && t.vt == 1, "a free terminal read; its virtual table is wsAdrTerminal's own");
  made[4]->free(), made[4]->order = 0, made[4]->obj = nullptr;
  check(termIndex(made[6]) == 7 && termIndex(nullptr) == 0 && termIndex(&atc) == -1, "a pointer's place in the list");

  // ---- where a terminal keeps its position
  int how = 0;
  int off = locateRaw(made[0], 512, made[0]->pos[0], made[0]->pos[2], &how);
  check(off == (int)((char *)made[0]->pos - (char *)made[0]) && how == 1, "a position found in a terminal's memory (floats, 8 apart)");
  check(locateRaw(made[0], 512, 1234.5, -987.25, &how) == -1, "numbers that are not there: not found");
  {
    struct { void *vt; double p[3]; } dd = {nullptr, {-135.11, 20.1, -15.14}};
    check(locateRaw(&dd, sizeof dd, -135.11, -15.14, &how) == 8 && how == 3, "a position in doubles found");
  }

  // ---- forEachTerminal: a std::function of ours handed over by value
  s_forEach = addrOf(&woATC::forEachTerminal);
  static void *each[MAX_TERMS];
  n = forEachRaw(s_forEach, &atc, each, MAX_TERMS, true);
  same = n == 48;
  for (int i = 0; same && i < 48; i++) same = each[i] == made[i];
  check(same, "forEachTerminal with our function answering true: all 48, in the list's order");
  check(forEachRaw(s_forEach, &atc, each, MAX_TERMS, false) == 1 && each[0] == made[0], "answering false: the mock stops after one (the count tells what the answer means)");
  check(forEachRaw(addrOf(&woATC::crash), &atc, each, MAX_TERMS, true) == -100, "a forEachTerminal that raises: caught");

  // ---- the ATC's other functions: each argument list passed as the compiler passes it
  void *p = nullptr;
  int v = 0;
  s_byIdx = addrOf(&woATC::getTerminalByTermIndex_);
  check(gPtrInt(s_byIdx, &atc, 7, &p) && p == made[6] && gPtrInt(s_byIdx, &atc, 99, &p) && p == nullptr, "getTerminalByTermIndex_(int)");
  s_getTerminal = addrOf(&woATC::getTerminal);
  check(gPtrUIntInt(s_getTerminal, &atc, 3, 72, &p) && p == made[2] && atc.lastId == 3 && atc.calls == 72, "getTerminal(unsigned, int)");
  s_haveFree0 = addrOf(static_cast<bool (woATC::*)() const>(&woATC::haveFreeTerminalForDynamicSpawnClient));
  s_haveFree2 = addrOf(static_cast<bool (woATC::*)(const std::string &, const std::string &) const>(&woATC::haveFreeTerminalForDynamicSpawnClient));
  EdStr sa, sb;
  makeStr(&sa, "FA-18C_hornet"), makeStr(&sb, "a mission id longer than fifteen characters");
  check(gByte(s_haveFree0, &atc, &v) && v == 1, "haveFreeTerminalForDynamicSpawnClient()");
  check(gByte2Ref(s_haveFree2, &atc, &sa, &sb, &v) && v == 1 && atc.lastA == "FA-18C_hornet" && atc.lastB == "a mission id longer than fifteen characters", "haveFreeTerminalForDynamicSpawnClient(string, string)");
  s_obstr = addrOf(&woATC::isAdrTermObstructedFor);
  check(gObstr(s_obstr, &atc, made[1], &sa, &sb, 16651.0f, &v) && v == 1 && atc.lastTerm == made[1] && atc.lastA == "FA-18C_hornet" && atc.lastF == 16651.0f, "isAdrTermObstructedFor(terminal, string, string, float): obstructed");
  check(gObstr(s_obstr, &atc, made[0], &sa, &sb, 1.0f, &v) && v == 0, "the same: not obstructed");
  s_canSpawn = addrOf(&woATC::canClientSpawnOnTerminal);
  atc.clients[16777472u] = ClientData();
  check(gByteUInt(s_canSpawn, &atc, 16777472u, &v) && v == 1 && gByteUInt(s_canSpawn, &atc, 5, &v) && v == 0, "canClientSpawnOnTerminal(unsigned)");
  s_spawnOn = addrOf(&woATC::setClientSpawnOnTerminal);
  check(gPtrUInt(s_spawnOn, &atc, 4000000000u, &p) && p == made[47] && atc.lastId == 4000000000u, "setClientSpawnOnTerminal(unsigned)");
  s_spawnOnPt = addrOf(&woATC::setClientSpawnOnTerminalByPoint);
  float pt[4] = {-135.11f, 20.0f, -15.14f, 0};
  check(gPtrUIntRef(s_spawnOnPt, &atc, 77, pt, &p) && p == made[0] && atc.lastId == 77 && atc.lastP[0] == -135.11f && atc.lastP[2] == -15.14f, "setClientSpawnOnTerminalByPoint(unsigned, Vec3f)");
  s_spawnOnFree = addrOf(&woATC::setClientSpawnOnFreeTerminal);
  check(gPtrUIntRefF(s_spawnOnFree, &atc, 78, &sa, 123.5f, &p) && p == nullptr && atc.lastId == 78 && atc.lastA == "FA-18C_hornet" && atc.lastF == 123.5f, "setClientSpawnOnFreeTerminal(unsigned, string, float)");
  s_myTerm = addrOf(&woATC::getMyTerminal);
  MovingObject mob;
  check(gPtrPtr(s_myTerm, &atc, &mob, &p) && p == made[0] && atc.lastObj == &mob, "getMyTerminal(MovingObject*)");
  s_termByClient = addrOf(&woATC::getTerminalByClient);
  check(gIntUIntBool(s_termByClient, &atc, 79, true, &v) && v == 17 && atc.lastId == 79 && atc.lastFlag, "getTerminalByClient(unsigned, bool)");
  s_fillState = addrOf(&woATC::fillTerminalsState);
  {
    char *vec[3] = {nullptr, nullptr, nullptr};
    check(gOut(s_fillState, &atc, vec) && vec[0] && (size_t)(vec[1] - vec[0]) == 48 * sizeof(TerminalState) && ((TerminalState *)vec[0])[2].index == 3, "fillTerminalsState into an empty vector of ours");
    ((std::vector<TerminalState> *)vec)->~vector();  // (the test's own allocator: in DCS it is left alone)
  }
  check(!gThis(addrOf(&woATC::crash), &atc, &p), "a call that raises: caught");
  check(!rd(nullptr, &v, 4) && !rd((void *)(uintptr_t)0x40, &v, 4), "a read of memory that is not there: refused");

  // ---- the ATC's clients (a std::map)
  s_clients = addrOf(&woATC::getClients);
  static unsigned int ids[256];
  {
    std::map<unsigned, ClientData> none;
    check(mapKeysRaw(&none, ids, 256, &size) == 0 && size == 0, "an empty std::map: no keys");
  }
  check(gThis(s_clients, &atc, &p) && mapKeysRaw(p, ids, 256, &size) == 1 && size == 1 && ids[0] == 16777472u, "a std::map of one: its key");
  for (unsigned i = 0; i < 36; i++) atc.clients[(i * 7919u) % 1000u + 1] = ClientData();
  n = mapKeysRaw(p, ids, 256, &size);
  same = n == 37 && size == 37;
  {
    int i = 0;
    for (auto &kv : atc.clients) same = same && ids[i++] == kv.first;
  }
  check(same, "a std::map of 37: every key, in order");
  {
    void *junk[2] = {(void *)(uintptr_t)0x10, (void *)(uintptr_t)3};
    check(mapKeysRaw(junk, ids, 256, &size) == -100, "not a map: an exception, caught");
  }

  // ---- taking terminals and undoing it
  const unsigned FAKE = 0x7FCA0000u;
  check(acquireRaw(made[1], FAKE + 2, nullptr, nullptr) == 0 && made[1]->client == FAKE + 2 && !made[1]->is_free(), "acquire(unsigned) on a terminal");
  check(acquireRaw(made[4], FAKE + 5, nullptr, nullptr) == 0 && made[4]->client == FAKE + 5, "acquire on the derived terminal: its wsBasicTerminal part");
  check(acquireRaw(made[2], FAKE + 3, "17", "FA-18C_hornet") == 0 && made[2]->client == FAKE + 3 && made[2]->miss == "17" && made[2]->type == "FA-18C_hornet", "acquire(unsigned, string, string)");
  check(acquireRaw(made[3], FAKE + 4, nullptr, nullptr) == 0, "a fourth");
  check(gByte(s_haveFree0, &atc, &v) && v == 1, "(free terminals left)");
  int was = 99;
  check(setOrderRaw(made[35], -5, &was) == 0 && was == 0 && made[35]->order == -5, "set_acquire_order, the old one given back");
  check(setOrderRaw(made[35], -9, &was) == 0 && was == -5 && made[35]->order == -9, "set again: the FIRST old one stays the one to put back");
  made[3]->client = 16777999u;  // a real aircraft has taken this one since
  check(releaseRaw(made[1]) == 0 && made[1]->is_free(), "free() on one, by hand");
  int freed = 0, kept = 0, restored = 0;
  undoRaw(&freed, &kept, &restored);
  check(freed == 2 && kept == 1 && restored == 1, "undo: two freed, the one a real aircraft took left alone, one order put back");
  check(made[2]->is_free() && made[4]->is_free() && made[3]->client == 16777999u && made[35]->order == 0, "after undo: as it was, the real aircraft's terminal untouched");
  undoRaw(&freed, &kept, &restored);
  check(freed == 0 && kept == 0 && restored == 0, "undo twice: nothing left to do");
  {
    Pad notTerm;
    check(acquireRaw(&notTerm, FAKE, nullptr, nullptr) == -1 && releaseRaw(&notTerm) == -1 && setOrderRaw(&notTerm, 1, &was) == -1, "acquire / free / set order on what is no terminal: refused");
    void *keep = s_acquire;
    s_acquire = nullptr;
    check(acquireRaw(made[0], FAKE, nullptr, nullptr) == -1 && made[0]->is_free(), "acquire with its export missing: nothing called");
    s_acquire = keep;
    // (terminals that are gone when undo comes: the mission has ended)
    wsAdrTerminal *gone = new wsAdrTerminal();
    acquireRaw(gone, FAKE, nullptr, nullptr);
    memset((void *)gone, 0, sizeof(void *));  // its virtual table pointer wiped, as freed memory may be
    undoRaw(&freed, &kept, &restored);
    check(freed == 0 && kept == 1, "undo with a terminal that is no longer one: skipped, nothing raised");
  }

  // ---- a terminal taken for a mission id (a slot), client 0; the questions with a string; wait_for_objects_spawn
  s_freeForMeI = addrOf(static_cast<bool (wsBasicTerminal::*)(unsigned) const>(&wsBasicTerminal::is_free_for_me));
  s_freeForMeS = addrOf(static_cast<bool (wsBasicTerminal::*)(const std::string &) const>(&wsBasicTerminal::is_free_for_me));
  s_isAcqByS = addrOf(static_cast<bool (wsBasicTerminal::*)(const std::string &) const>(&wsBasicTerminal::is_acquired_by));
  s_isAcqBy = addrOf(static_cast<bool (wsBasicTerminal::*)(unsigned) const>(&wsBasicTerminal::is_acquired_by));
  s_ownerDead = addrOf(&wsBasicTerminal::owner_completely_dead_or_not_exist);
  s_waitSpawn = addrOf(&wsBasicTerminal::wait_for_objects_spawn);
  check(acquireRaw(made[12], 0, "1000003", "FA-18C_hornet") == 0 && made[12]->client == 0 && made[12]->miss == "1000003" && made[12]->type == "FA-18C_hornet", "acquire(0, mission id, type): the target taken for a slot");
  {
    EdStr slot, otherSlot;
    makeStr(&slot, "1000003"), makeStr(&otherSlot, "233");
    void *b12 = termBasic(made[12], nullptr);
    check(gByteRef(s_freeForMeS, b12, &slot, &v) && v == 1 && gByteRef(s_freeForMeS, b12, &otherSlot, &v) && v == 0, "is_free_for_me(string): for that slot, not for another");
    check(gByteRef(s_isAcqByS, b12, &slot, &v) && v == 1 && gByteRef(s_isAcqByS, b12, &otherSlot, &v) && v == 0, "is_acquired_by(string)");
    check(gByteUInt(s_freeForMeI, b12, 7, &v) && v == 1, "is_free_for_me(unsigned)");
  }
  check(termRead(made[12], &t) && t.dead == 1, "its owner does not exist (owner_completely_dead_or_not_exist)");
  check(waitSpawnRaw(made[12], true) == 0 && made[12]->waiting && termRead(made[12], &t) && t.dead == 0, "wait_for_objects_spawn(true) on it");
  check(waitSpawnRaw(made[13], true) == -1 && !made[13]->waiting, "wait_for_objects_spawn on a terminal we did not take: refused");
  check(acquireRaw(made[14], 0, "900015", "FA-18C_hornet") == 0 && acquireRaw(made[15], 0, "233", "FA-18C_hornet") == 0, "two more taken for mission ids");
  made[15]->client = 16777729u, made[15]->obj = &atc;  // the aircraft of slot 233 has spawned onto this one
  made[14]->miss = "234";                              // DCS has given this one to another slot since
  undoRaw(&freed, &kept, &restored);
  check(freed == 1 && kept == 2 && made[12]->is_free() && !made[12]->waiting, "undo: the slot's terminal freed, its wait flag off");
  check(made[15]->client == 16777729u && made[15]->miss == "233" && made[14]->miss == "234", "undo: a terminal an aircraft spawned onto, and one given to another slot, left alone");
  made[15]->free(), made[14]->free();
  s_spawnOnMiss = addrOf(&woATC::setClientSpawnOnTerminalMiss);
  check(gPtrUIntRefF(s_spawnOnMiss, &atc, 1000003u, &sa, 16000.0f, &p) && p == made[0] && atc.lastId == 1000003u && atc.lastA == "FA-18C_hornet" && atc.lastF == 16000.0f, "setClientSpawnOnTerminalMiss(unsigned, string, float)");
  s_forced = addrOf(&woATC::getForcedTerminalByClient_);
  check(gPtrUIntBool(s_forced, &atc, 81, true, &p) && p == made[47] && atc.lastId == 81 && atc.lastFlag && gPtrUIntBool(s_forced, &atc, 81, false, &p) && p == nullptr, "getForcedTerminalByClient_(unsigned, bool)");

  // ---- a terminal taken by one of the ATC's own functions is remembered as it then reads; procTerminalStatus
  check(sizeof(TerminalState) == 16, "(the stand-in TerminalState is 16 bytes)");
  s_termStatus = addrOf(&woATC::procTerminalStatus);
  {
    int ix = 0, num = 0;
    made[20]->client = 0, made[20]->miss = "900001", made[20]->type = "FA-18C_hornet";  // as setClientSpawnOnTerminalMiss(900001, ...) left it
    recordAsSet(made[20]);
    recordAsSet(made[21]);  // (a free terminal: nothing to remember)
    check(g_ntaken == 1, "a terminal DCS's function took is remembered; a free one is not");
    check(termStatusRaw(&atc, made[35], 900002u, true, &ix, &num) == 0 && ix == -1 && num == 36 && made[35]->client == 900002u, "procTerminalStatus(client, Term_Index, number, true): the terminal's two numbers from fillTerminalsState");
    recordAsSet(made[35]);
    check(termStatusRaw(&atc, made[6], 0, false, &ix, &num) == 0 && ix == 7 && num == 7, "procTerminalStatus(0, ..., false)");
    check(termStatusRaw(&atc, &atc, 0, false, &ix, &num) == -1, "procTerminalStatus for what is not in the list: not called");
    undoRaw(&freed, &kept, &restored);
    check(freed == 2 && kept == 0 && made[20]->is_free() && made[35]->is_free(), "undo gives back what DCS's functions took at our call");
  }

  // ---- the candidates for giving a chooser-taken terminal back; the two fields put back by hand
  s_freeUnused = addrOf(&woATC::freeUnusedTerminalAcquirement);
  s_cleanTaxi = addrOf(&woATC::Clean_Taxi);
  s_objDestroy = addrOf(&woATC::onObjectDestroy);
  s_initTerms = addrOf(&woATC::procInitTerminals);
  check(gByteUInt(s_freeUnused, &atc, 900001u, &v) && v == 1 && atc.unusedId == 900001u && gByteUInt(s_freeUnused, &atc, 7, &v) && v == 0, "freeUnusedTerminalAcquirement(unsigned) -> bool");
  check(gSetUInt(s_cleanTaxi, &atc, 900002u) && atc.taxiId == 900002u && gSetUInt(s_objDestroy, &atc, 900003u) && atc.destroyedId == 900003u, "Clean_Taxi(unsigned), onObjectDestroy(unsigned)");
  check(stateSnapRaw(&atc) == 48 && ((TerminalState *)g_state0)[4].number == 5 && !((TerminalState *)g_state0)[4].taken, "the terminals' states kept (fillTerminalsState)");
  {
    // the chooser takes terminal 5: its number becomes its Term_Index, it reads taken (as run 3 showed of DCS's)
    made[4]->miss = "900004", made[4]->number = made[4]->termIndex;
    made[8]->client = 16777729u, made[8]->obj = &atc;  // an aircraft stands on terminal 9
    int which[2] = {5, 0};
    check(initTermsRaw(&atc, which, 1) == 0 && atc.inits == 1 && made[4]->number == 5 && made[4]->is_free(), "procInitTerminals with stage A's record for the terminal named: put back");
    check(made[8]->client == 16777729u, "... every other terminal given its own present state: the aircraft's untouched");
    which[1] = 49;
    check(initTermsRaw(&atc, which, 2) == -1 && atc.inits == 1, "a place that is no terminal: not called");
    made[8]->free();
    // records set: a terminal marked as a real spawn leaves it (a client id, taken), one given another number, one
    // field left alone
    int rows[12] = {7, 900007, KEEP, 1, 36, KEEP, 5, KEEP, 5, KEEP, 36, 0};
    check(initRowsRaw(&atc, rows, 3) == 0 && made[6]->client == 900007u && made[6]->flag && made[6]->number == 7, "procInitTerminals with a record set: a client id and taken, its number kept");
    check(made[35]->number == 5 && made[4]->number == 36 && !made[35]->flag && made[35]->is_free(), "... two terminals' numbers exchanged, nothing else of theirs changed");
    int back[3] = {7, 36, 5};
    check(initTermsRaw(&atc, back, 3) == 0 && made[6]->is_free() && !made[6]->flag && made[35]->number == 36 && made[4]->number == 5, "stage A's records put all three back");
    int badRow[4] = {0, 1, 1, 1};
    check(initRowsRaw(&atc, badRow, 1) == -1, "a record for a place that is no terminal: not called");
    // the two fields by hand: only +0x8c / +0x94, only a terminal the chooser took
    struct Big : wsAdrTerminal {  // (room for the two places: DCS's terminal is larger than the stand-in)
      unsigned char room[256] = {};
    };
    static Big big;
    unsigned char four[4] = {5, 0, 0, 0}, one[1] = {0};
    unsigned char *mem = (unsigned char *)&big;
    unsigned char keep8c[4], keep94;
    memcpy(keep8c, mem + 0x8c, 4), keep94 = mem[0x94];
    check(restoreRaw(&big, 0x8c, four, 4) == -1 && memcmp(mem + 0x8c, keep8c, 4) == 0, "restore on a terminal the chooser did not take at our call: refused, nothing written");
    noteChosen(&big);
    check(restoreRaw(&big, 0x88, four, 4) == -1 && restoreRaw(&big, 0x8c, four, 1) == -1 && restoreRaw(&big, 0x94, four, 4) == -1, "restore of another place or length: refused");
    check(restoreRaw(&big, 0x8c, four, 4) == 0 && memcmp(mem + 0x8c, four, 4) == 0 && restoreRaw(&big, 0x94, one, 1) == 0 && mem[0x94] == 0, "restore of +0x8c (4 bytes) and +0x94 (1 byte): written and read back");
    memcpy(mem + 0x8c, keep8c, 4), mem[0x94] = keep94;
    Pad notTerm;
    check(restoreRaw(&notTerm, 0x8c, four, 4) == -1, "restore on what is no terminal: refused");
  }

  // ---- aim and restore: the numbers in play before a target lifted out of play, and put back
  check((char *)&made[0]->termIndex - (char *)made[0] == 0x88 && (char *)&made[0]->number - (char *)made[0] == 0x8c, "(the stand-in terminal has its Term_Index at +0x88 and its number at +0x8c)");
  {
    for (int i = 0; i < 48; i++) made[i]->free(), made[i]->flag = false, made[i]->number = i + 1;
    AimOut ao;
    RestoreOut ro;
    check(aimRaw(&atc, 4, 0, false, &ao) == -3, "aim below 5: refused");
    check(aimRaw(&atc, 77, 0, false, &ao) == -4 && made[4]->number == 5, "aim at a number no terminal has: nothing changed");
    // spot 24: 5 to 23 have a Term_Index (1 to 31 here): lifted by record, +100
    check(aimRaw(&atc, 24, 0, false, &ao) == 0 && ao.found && ao.lifted == 19 && ao.written == 0 && ao.blocked == 0 && ao.failed == 0, "aim(24): 19 numbers lifted by record, read back");
    bool lifted = made[3]->number == 4 && made[23]->number == 24 && made[24]->number == 25;
    for (int i = 4; i < 23; i++) lifted = lifted && made[i]->number == i + 101;
    check(lifted, "... 5 to 23 read 105 to 123; 1 to 4, the target and what comes after untouched");
    check(aimRaw(&atc, 24, 0, false, &ao) == 0 && ao.lifted == 0 && g_nlift == 19, "aim(24) again: nothing lifted twice");
    check(aimRaw(&atc, 30, 0, false, &ao) == 0 && ao.lifted == 6 && g_nlift == 25 && made[23]->number == 124, "aim(30) after it: the six more");
    check(restoreLiftsRaw(&atc, &ro) == 0 && ro.records == 25 && ro.written == 0 && ro.left == 0 && ro.failed == 0, "restore: 25 numbers put back, read back");
    bool back = true;
    for (int i = 0; i < 48; i++) back = back && made[i]->number == i + 1;
    check(back, "... every number its own again");
    check(restoreLiftsRaw(&atc, &ro) == 0 && ro.records == 0 && ro.written == 0, "restore twice: nothing the second time");
    // mode "neg"
    check(aimRaw(&atc, 8, 1, false, &ao) == 0 && ao.lifted == 3 && made[4]->number == -1005 && made[6]->number == -1007, "aim(8) in the negative way: 5, 6, 7 read -1005, -1006, -1007");
    restoreLiftsRaw(&atc, &ro);
    // mode "low": every lifted number becomes 4, the terminal that has 4 of its own is not ours and stays
    check(aimRaw(&atc, 24, 2, false, &ao) == 0 && ao.lifted == 19 && ao.failed == 0 && made[4]->number == 4 && made[22]->number == 4 && made[3]->number == 4 && made[23]->number == 24 && g_nlift == 19,
          "aim(24) in the low way: 5 to 23 all read 4; spot 4 keeps its own 4 and is not remembered");
    check(aimRaw(&atc, 24, 2, false, &ao) == 0 && ao.lifted == 0, "... again: nothing lifted twice (4 is not in play)");
    check(aimRaw(&atc, 36, 2, true, &ao) == 0 && ao.lifted == 8 && ao.written == 4 && made[31]->number == 4 && made[35]->number == 36, "aim(36) in the low way with writes: the spawn-only four written to 4 too");
    check(restoreLiftsRaw(&atc, &ro) == 0 && ro.records == 27 && ro.written == 4 && ro.failed == 0, "restore: all 31 put back");
    back = true;
    for (int i = 0; i < 48; i++) back = back && made[i]->number == i + 1;
    check(back, "... every number its own again, spot 4's included");
    // spot 36: 32 to 35 have no Term_Index: counted as in the way; with writes allowed, their word written
    check(aimRaw(&atc, 36, 0, false, &ao) == 0 && ao.lifted == 27 && ao.blocked == 4 && ao.written == 0 && made[32]->number == 33, "aim(36): 27 by record, 4 spawn-only still in the way, untouched");
    check(aimRaw(&atc, 36, 0, true, &ao) == 0 && ao.lifted == 0 && ao.written == 4 && ao.blocked == 0 && ao.failed == 0 && made[31]->number == 132 && made[34]->number == 135 && made[35]->number == 36,
          "aim(36) with writes allowed: the four written, read back; the target untouched");
    made[33]->number = 999;  // (something else has changed this one since)
    check(restoreLiftsRaw(&atc, &ro) == 0 && ro.records == 27 && ro.written == 3 && ro.left == 1 && made[33]->number == 999 && made[31]->number == 32, "restore: a word that no longer reads as we wrote it is left alone");
    made[33]->number = 34;
    // the two words not where expected: nothing is written
    atc.skewT = made[10];  // (the ATC's record of this terminal gives another Term_Index than the terminal's own word)
    check(aimRaw(&atc, 36, 0, true, &ao) == 0 && ao.layoutBad && ao.written == 0 && ao.blocked == 4 && made[32]->number == 33, "the words are not where expected for one terminal: no write at all");
    atc.skewT = nullptr;
    restoreLiftsRaw(&atc, &ro);
    back = true;
    for (int i = 0; i < 48; i++) back = back && made[i]->number == i + 1;
    check(back && g_nlift == 0, "... and everything is as it was");
    // from 1: numbers 1 to 4 lifted too
    g_aimFloor = 1;
    check(aimRaw(&atc, 24, 0, false, &ao) == 0 && ao.lifted == 23 && ao.failed == 0 && made[0]->number == 101 && made[3]->number == 104 && made[22]->number == 123 && made[23]->number == 24,
          "aim(24) from 1: 1 to 23 lifted, the target untouched");
    check(aimRaw(&atc, 4, 0, false, &ao) == -3, "... a target below 5 is still refused");
    g_aimFloor = 5;
    check(restoreLiftsRaw(&atc, &ro) == 0 && ro.records == 23 && ro.failed == 0 && made[0]->number == 1 && made[3]->number == 4, "restore: 1 to 4 put back with the rest");
    // the pre-check: DCS's own answers about a spot's terminal
    {
      CheckOut co;
      int obstructedSpot = 0;
      for (int i = 0; i < 48; i++)
        if (made[i]->termIndex == 2) obstructedSpot = i + 1;  // (the stand-in ATC calls that one obstructed)
      int clear = obstructedSpot == 7 ? 8 : 7;
      check(checkRaw(&atc, clear, "FA-18C_hornet", 16000.0f, &co) == 0 && co.place == clear && co.orig == clear && co.num == clear && !co.lifted && co.isFree == 1 && co.client == 0 && co.obstructed == 0 &&
                checkUsable(co) && !checkWhy(co)[0] && atc.lastA == "FA-18C_hornet" && atc.lastF == 16000.0f,
            "check: a free terminal nothing stands on: usable; DCS was asked with the type and the mass");
      check(obstructedSpot > 0 && checkRaw(&atc, obstructedSpot, "FA-18C_hornet", 16000.0f, &co) == 0 && co.obstructed == 1 && !checkUsable(co) && strstr(checkWhy(co), "obstructed"), "check: the terminal DCS calls obstructed: not usable, and why");
      made[clear - 1]->acquire(4242);
      check(checkRaw(&atc, clear, "FA-18C_hornet", 16000.0f, &co) == 0 && co.client == 4242 && !checkUsable(co) && strstr(checkWhy(co), "client"), "check: a terminal held for a client: not usable");
      made[clear - 1]->free();
      // a lifted terminal is found by the number it had
      aimRaw(&atc, 30, 0, false, &ao);
      check(checkRaw(&atc, clear, "FA-18C_hornet", 16000.0f, &co) == 0 && co.lifted && co.orig == clear && co.num == clear + 100 && checkUsable(co), "check after aim: the spot found by the number it had, its present number given");
      check(checkRaw(&atc, clear + 100, "FA-18C_hornet", 16000.0f, &co) == -4, "check: the lifted number is no spot");
      restoreLiftsRaw(&atc, &ro);
      check(checkRaw(&atc, 77, "FA-18C_hornet", 16000.0f, &co) == -4, "check: a number no terminal has: said so");
      check(checkRaw(&atc, 2, "FA-18C_hornet", 16000.0f, &co) == 0 && co.orig == 2, "check: spots 1 to 4 can be asked about");
      void *keep = s_obstr;
      s_obstr = nullptr;
      check(checkRaw(&atc, clear, "FA-18C_hornet", 16000.0f, &co) == 0 && co.obstructed == -1 && !checkUsable(co) && strstr(checkWhy(co), "could not"), "check without DCS's obstruction function: not usable (it could not be asked)");
      s_obstr = keep;
      bool same = true;
      for (int i = 0; i < 48; i++) same = same && made[i]->number == i + 1;
      check(same && g_nlift == 0, "check changes nothing");
    }
    check(restoreLiftsRaw(nullptr, &ro) == 0, "restore with nothing lifted and no ATC: nothing to do");
    aimRaw(&atc, 8, 0, false, &ao);
    check(restoreLiftsRaw(nullptr, &ro) == -1 && g_nlift == 0, "restore when the ATC is gone: said so, nothing remembered any more");
    for (int i = 0; i < 48; i++) made[i]->number = i + 1;
  }

  // ---- the ship by its id, and its ATC
  RegMgr rm;
  CVN cvn;
  cvn.id = 16777999u, cvn.atc = &atc;
  Hull other;
  other.id = 5;
  Jet jet;
  jet.id = 16778240u;
  rm.ships.push_back(&cvn);
  rm.others.push_back(&other);
  rm.others.push_back(&jet);
  g_reg = &rm;
  s_regInstance = &g_reg;
  int kind = -1;
  check(registeredById(16777999u, &kind) == (void *)static_cast<Hull *>(&cvn) && kind == 0x21, "the ship found in the register by its id, whatever kind it is filed under");
  check(registeredById(16778240u, &kind) == (void *)static_cast<Hull *>(&jet) && kind == 0x40, "a second kind");
  check(registeredById(424242u, &kind) == nullptr, "an id nobody has: nothing");
  Rtti r;
  check(rttiRaw(&cvn, &r) && strcmp(r.name, ".?AVCVN@@") == 0 && asClass(r, N_SHIP) == (void *)static_cast<woShip *>(&cvn), "the ship's class: a woShip by its type information");
  check(rttiRaw(&other, &r) && asClass(r, N_SHIP) == nullptr, "another object: not a ship");
  check(rttiRaw(static_cast<Hull *>(&jet), &r) && asClass(r, N_MOVING) == (void *)static_cast<MovingObject *>(&jet), "an aircraft: its MovingObject part");
  int why = 0;
  check(atcOfObject(&cvn, &why) == nullptr && why == -1, "no getATC function known: no ATC, said so");
  s_shipGetAtc = (*(void ***)static_cast<wAirbase *>(&cvn))[0];  // woShip::getATC, as the ship's own table has it
  check(atcOfObject(&cvn, &why) == (void *)&atc && why == 0, "the ship's ATC: getATC found in the ship's tables and called on the part it belongs to");
  cvn.atc = (woATC *)&other;
  check(atcOfObject(&cvn, &why) == nullptr && why == -2, "a getATC that gives something else: not taken");
  cvn.atc = nullptr;
  check(atcOfObject(&cvn, &why) == nullptr && why == -2, "a getATC that gives nothing: not taken");
  g_atc = &atc;
  check(atcAlive(), "the ATC is still one");
  g_atc = &other;
  check(!atcAlive(), "something else in its place: not an ATC");

  printf(g_fail ? "\n%d FAILED\n" : "\nall passed\n", g_fail);
  return g_fail ? 1 : 0;
}
