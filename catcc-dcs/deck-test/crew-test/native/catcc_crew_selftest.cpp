// Self-test of catcc_crew.cpp (built and run by build.cmd before the DLL): everything the module assumes
// about the compiler's ABI, and its scans end to end, tried on stand-in classes that are shaped like
// DCS's and carry DCS's class names (AnimatorLogic::AnimatedCharacterBase / CharacterMovable,
// Graphics::ModelInstance with the position in virtual slot 3), with the compiler DCS is built with
// (MSVC x64). What it can't check is DCS's own data: ed::string being std::string's layout and
// wPosition3's layout are checked by the module at run time instead (both held in DCS 2.9.31).
#define CATCC_SELFTEST
#include "catcc_crew.cpp"

#include <string>
#include <vector>

namespace mock {
struct Pos {  // four 16-byte vectors (x, y, z axes and the position), as DCS's wPosition3<float> turned out to be
  float f[16];
};
struct viObject {
  virtual ~viObject() {}
  virtual int viKind() { return 1; }
  int viData = 7;
};
struct ISceneObject {
  virtual int sceneKind() { return 2; }
  virtual int sceneOther() { return 22; }
};
struct Registered {
  virtual int regKind() { return 9; }
  int pad[5] = {0, 0, 0, 0, 0};
  int id = 0;  // at +0x1c, as in DCS
};
struct IAnimatedEntity {
  virtual int entKind() { return 4; }
};
}  // namespace mock

// the animation side, with DCS's class names: what a character plays is held by a "cookie"
namespace Animator {
struct ShaderAnimation {  // 0x44 bytes, as DCS's: an id, then floats (start, duration, end, loop x3, blend x2, ...)
  int id;
  float start, dur, fin, loop[3], blend[2], trans[2], pad, ovr[2], z;
  int m1, zero;
};
class Animation {
 public:
  virtual void load() {}
  std::string name, xaxis, yaxis;
  int id = 0;
  float xb[2] = {0, 0}, yb[2] = {0, 0}, def[2] = {0, 0};
  __declspec(noinline) const std::string &get_name() { return name; }
  __declspec(noinline) int get_id() { return id; }
  __declspec(noinline) const std::string &get_x_axis_name() const { return xaxis; }
  __declspec(noinline) const std::string &get_y_axis_name() const { return yaxis; }
  __declspec(noinline) const float *get_x_bounds() const { return xb; }  // DCS: const Vec2f & (a pointer to two floats)
  __declspec(noinline) const float *get_y_bounds() const { return yb; }
  __declspec(noinline) const float *get_defaults() const { return def; }
};
class PropertyHolderImpl {
 public:
  virtual void set_property(const std::string &n, float v) { last = n, value = v; }
  virtual float get_property(const std::string &n) { return n == last ? value : 0; }
  std::string last;
  float value = 0;
};
struct ModelCookie {
  virtual ~ModelCookie() {}
  int mc = 3;
};
class CharacterModelCookie : public ModelCookie, public PropertyHolderImpl {
 public:
  std::vector<ShaderAnimation> stack;
  int lastIdx = -1, calls = 0;
  float lastT = 0, askedT = 0;
  bool lastLoop = false, lastNow = false;
  __declspec(noinline) void set_animation(int idx, float t, bool loop, bool now) {
    lastIdx = idx, lastT = t, lastLoop = loop, lastNow = now, calls++;
    ShaderAnimation sa = {};
    sa.id = idx + 1;  // DCS's ids in the record are 1-based
    sa.start = t, sa.dur = 2.5f, sa.fin = loop ? -1.0f : t + 2.5f;
    sa.loop[0] = loop ? 1.0f : 0.0f;
    sa.blend[0] = 0.25f, sa.blend[1] = -0.5f;
    stack.assign(1, sa);
  }
  __declspec(noinline) const ShaderAnimation &get_animation(float t) {
    askedT = t;
    return stack.at(0);  // throws on an empty stack, as DCS's does
  }
  __declspec(noinline) int get_stack_size() { return (int)stack.size(); }
  int updates = 0;
  float updT = 0;
  __declspec(noinline) void update_properties(float t) {  // DCS: every playing record takes its blend parameters again
    updates++, updT = t;
    for (auto &sa : stack) sa.blend[0] = value;
  }
};
static double g_clock = 100.5;
__declspec(noinline) double get_model_time() { return g_clock; }
}  // namespace Animator

namespace mock {
struct AnimationManager {
  std::vector<const char *> names;
  std::vector<Animator::Animation *> table;  // one per name; nclips of them are plain animations
  int nclips = 0;
  __declspec(noinline) std::vector<const char *> get_animation_names() { return names; }
  __declspec(noinline) int get_num_animations() { return nclips ? nclips : (int)names.size(); }
  __declspec(noinline) unsigned short get_animation_index(const std::string &n, bool flag) {
    for (size_t i = 0; i < names.size(); i++)
      if (n == names[i]) return (unsigned short)(i + (flag ? 100 : 0));
    return 0xFFFF;
  }
  __declspec(noinline) Animator::Animation *get_animation_of(const Animator::ShaderAnimation &sa) { return table[sa.id - 1]; }
  __declspec(noinline) Animator::Animation *get_animation_at(int i) { return table[i]; }
  __declspec(noinline) float get_animation_duration(const std::string &n) {
    unsigned short i = get_animation_index(n, false);
    return i == 0xFFFF ? 0.0f : 1.5f + i;
  }
};
static const char *g_getPositionName;
}  // namespace mock

namespace Graphics {
class ModelInstance {  // the position is its 4th virtual (slot 3), as in DCS
 public:
  virtual int m0() { return 30; }
  virtual int m1() { return 31; }
  virtual int m2() { return 32; }
  virtual const mock::Pos &GetPosition() = 0;
  double md = 1.5;
};
}  // namespace Graphics

namespace AnimatorLogic {
class AnimatedCharacterBase : public mock::viObject, public mock::ISceneObject, public Graphics::ModelInstance {
 public:
  std::string name, full, last;
  mock::Pos pos, local;
  mock::AnimationManager *mgr = nullptr;
  void *parent = nullptr;
  int anim = -1;
  Animator::CharacterModelCookie *cookie = nullptr;  // DCS: a member no exported function returns
  __declspec(noinline) const std::string &get_name() const { return name; }
  __declspec(noinline) const std::string &get_full_name() { return full; }
  __declspec(noinline) unsigned char get_id() const { return 201; }
  __declspec(noinline) const mock::Pos &local_position() { return local; }
  __declspec(dllexport) __declspec(noinline) const mock::Pos &GetPosition() override {
    mock::g_getPositionName = __FUNCDNAME__;
    return pos;
  }
  __declspec(noinline) void *get_parent() { return parent; }
  __declspec(noinline) mock::AnimationManager *get_animation_manager() { return mgr; }
  __declspec(noinline) void set_animation(int i) { anim = i; }
  __declspec(noinline) void set_override_animation(const std::string &s) { last = s; }
  __declspec(noinline) void show_attachment(const std::string &s, bool on) { last = s + (on ? ":on" : ":off"); }
  __declspec(noinline) std::vector<AnimatedCharacterBase *> list() { return {this, this, this}; }
};
enum class CharacterState { Idle = 0, Moving = 5 };
class CharacterMovable : public AnimatedCharacterBase, public mock::IAnimatedEntity {
 public:
  CharacterState st = CharacterState::Moving;
  mock::Pos target;
  float seen = 0;
  int stops = 0;
  __declspec(noinline) CharacterState get_state() { return st; }
  __declspec(noinline) bool has_routes() { return true; }
  __declspec(noinline) void move_command_world(const mock::Pos &p) { target = p; }
  __declspec(noinline) void stop_move() { stops++; }
  __declspec(noinline) std::string get_current_state_name(float t) {
    seen = t;
    return t > 1 ? std::string("a state name that is longer than sixteen") : std::string("MOVING");
  }
};
}  // namespace AnimatorLogic

// the catapult crews and their owner, with DCS's class names (global namespace)
class wCarrierCrew {
 public:
  virtual ~wCarrierCrew() {}
  float box[6] = {21, 15, 11, 62, 25, 23.5f};
  int freeCalls = 0, allowedCalls = 0, resets = 0;
  bool lastFree = false, lastAllowed = true;
  unsigned char *attrs = (unsigned char *)calloc(1, 0x400);  // orders kept outside the object: [5] "free", [6] "take"
  __declspec(noinline) void request_free_catapult(bool b) { freeCalls++, lastFree = b, attrs[5] = b, attrs[6] = !b; }
  __declspec(noinline) void set_operation_allowed(bool b) { allowedCalls++, lastAllowed = b; }
  __declspec(noinline) void reset_orders() { resets++; }
  __declspec(noinline) const float *get_start_box() { return box; }  // DCS: const BoundingBox & (two 3-vectors)
};
struct MockEnv {
  bool pathAvoid = false, avoid = false;
  __declspec(noinline) bool get_can_avoid_collisions() const { return avoid; }
  __declspec(noinline) bool get_can_path_avoid_collisions() const { return pathAvoid; }
  __declspec(noinline) void set_avoid_collisions(bool b) { avoid = b; }
  __declspec(noinline) void set_path_avoid_collisions(bool b) { pathAvoid = b; }
};
class wGroundCrewOwner {
 public:
  virtual int ownerKind() { return 5; }
  std::vector<wCarrierCrew *> crews;  // as DCS: numbered from 1, [0] is something else
  MockEnv *env = nullptr;
  __declspec(noinline) unsigned char get_crews_count() const { return (unsigned char)(crews.size() - 1); }
  __declspec(noinline) wCarrierCrew *get_carrier_crew(int i) { return i >= 0 && i < (int)crews.size() ? crews[i] : nullptr; }
  __declspec(noinline) MockEnv *get_character_env() { return env; }
};

// the ship, with DCS's class name (global namespace) and its two bubble functions
static const char *g_drawArgsName, *g_setArgName, *g_forcePosName;
// a moving object as DCS has it (global name), and an aircraft that has its own ForcePosition in its place
class MovingObject : public mock::viObject, public mock::Registered {
 public:
  double at[3] = {0, 0, 0};
  int forced = 0;
  __declspec(dllexport) __declspec(noinline) virtual void ForcePosition(const double (&p)[4][4]) {
    g_forcePosName = __FUNCDNAME__;
    at[0] = p[3][0], at[1] = p[3][1], at[2] = p[3][2], forced++;
  }
};
static const char *g_setPosName;
// a static object as DCS has it (global names): lLandObject with its SetPos, and a vehicle that replaces it
class lLandObject : public mock::viObject, public mock::Registered {
 public:
  float at[3] = {0, 0, 0}, xlen = 0;
  int set = 0;
  __declspec(dllexport) __declspec(noinline) virtual void SetPos(const float (&p)[4][4]) {
    g_setPosName = __FUNCDNAME__;
    at[0] = p[3][0], at[1] = p[3][1], at[2] = p[3][2], set++;
  }
};
class lLandVehicle : public lLandObject {
 public:
  int own = 0;
  __declspec(noinline) void SetPos(const float (&p)[4][4]) override {
    at[0] = p[3][0], at[1] = p[3][1], at[2] = p[3][2], xlen = sqrtf(p[0][0] * p[0][0] + p[0][1] * p[0][1] + p[0][2] * p[0][2]), own++;
  }
};
struct MockSeat {
  virtual int seat() { return 1; }
  int pilot = 1;
};
class wHumanAircraft : public MockSeat, public MovingObject {  // (the MovingObject part is not where the object starts)
 public:
  int own = 0;
  double nose[3] = {0, 0, 0};
  __declspec(noinline) void ForcePosition(const double (&p)[4][4]) override {
    at[0] = p[3][0], at[1] = p[3][1], at[2] = p[3][2], nose[0] = p[0][0], nose[2] = p[0][2], own++;
  }
};
class woShip {
 public:
  virtual ~woShip() {}
  std::vector<float> args = std::vector<float>(200, 0.0f);  // the model's arguments (begin, end: as ed::vector)
  __declspec(dllexport) __declspec(noinline) virtual const std::vector<float> &GetDrawArguments() {
    g_drawArgsName = __FUNCDNAME__;
    return args;
  }
  int setCalls = 0;
  __declspec(dllexport) __declspec(noinline) virtual void setDrawArgumentValue(int i, float v) {
    g_setArgName = __FUNCDNAME__;
    if (i >= 0 && i < (int)args.size()) args[i] = v, setCalls++;
  }
  int bubbleCmd[2] = {0, 0};
  float bubbleArg[2] = {0, 0};
  __declspec(noinline) void setBubbleCommand(int b, int c) {
    if (b < 0 || b >= 2 || c > 2) return;
    bubbleCmd[b] = c, bubbleArg[b] = c == 2 ? 1.0f : 0.0f;
  }
  __declspec(noinline) int getBubbleState(int b) { return b < 0 || b >= 2 ? -1 : (bubbleArg[b] >= 1 ? 0 : 1); }
  int elevCmd[4] = {0, 0, 0, 0};
  __declspec(noinline) void setElevatorCommand(int e, int c) {
    if (e >= 0 && e < 4 && c <= 2) elevCmd[e] = c;
  }
  __declspec(noinline) int getElevatorState(int e) { return e < 0 || e >= 4 ? -1 : (elevCmd[e] == 2 ? 1 : 0); }
};

// the ship's air traffic control and the airbase that owns it, with DCS's class names
// (the two virtuals record their decorated names, to be found as exports the way DCS's are)
static const char *g_freeCatsName, *g_getAtcName;
struct MockPos3d {  // wPosition3<double>: four vectors of three doubles, each in a 32-byte slot
  double v[4][4];
};
class woATC {
 public:
  virtual ~woATC() {}
  bool land = false, takeoff = true, foul = true, open = true;
  int cats = 3, rcase = 1;
  __declspec(noinline) bool canStartLanding() const { return land; }
  __declspec(noinline) bool canStartTakeoff() const { return takeoff; }
  __declspec(noinline) bool getFoulDeck() const { return foul; }
  __declspec(noinline) bool isRunWayOpen() const { return open; }
  __declspec(dllexport) __declspec(noinline) virtual int getFreeCatapultsNum() {
    g_freeCatsName = __FUNCDNAME__;
    return cats;
  }
  __declspec(noinline) int getRecoveryCASE() { return rcase; }
  MockPos3d tp;
  unsigned tpId = 0;
  int tpCalls = 0;
  __declspec(noinline) void teleport_aircraft(MockPos3d p, unsigned id) { tp = p, tpId = id, tpCalls++; }
};
// (not the first base of the ship: its getATC wants `this` at this part of the ship, not at the ship's start)
class wAirbase {
 public:
  virtual ~wAirbase() {}
  woATC *atc = nullptr;
  __declspec(dllexport) __declspec(noinline) virtual woATC *getATC() const {
    g_getAtcName = __FUNCDNAME__;
    return atc;
  }
};

namespace mock {
struct Member : AnimatorLogic::CharacterMovable, Registered {
  int extra = 1;
};
// as DCS's deck crew classes: the position virtual replaced, so the exported base function is in none of its tables
struct Technician : Member {
  int asked = 0;
  __declspec(noinline) const Pos &GetPosition() override {
    asked++;
    return pos;
  }
};
struct Ship : viObject, Graphics::ModelInstance, ::wGroundCrewOwner, ::woShip, ::wAirbase {  // what the people are attached to: a crew owner and a ship, as DCS's woShip is
  Pos pos;
  __declspec(noinline) const Pos &GetPosition() override { return pos; }
};
struct Other : viObject, Registered {  // registered, not a character
  int z = 0;
};
struct Env {
  std::vector<void *> list;
  __declspec(noinline) std::vector<void *> get_registered_objects() { return list; }
};
struct EnvMgr {
  std::vector<Env *> envs;
  __declspec(noinline) std::vector<Env *> get_environments() const { return envs; }
  static EnvMgr *instance() {
    static EnvMgr m;
    return &m;
  }
};
struct RegMgr {  // next() in virtual slot 3, as RegisterManager's is
  std::vector<Registered *> all;
  virtual void v0() {}
  virtual void v1() {}
  virtual void v2() {}
  std::vector<Registered *> statics;  // filed under another kind
  virtual void *next(int id, int kind) {
    if (kind == 0x31) {
      if (statics.empty()) return nullptr;
      if (id == 0) return statics[0];
      for (size_t i = 0; i < statics.size(); i++)
        if (statics[i]->id == id) return statics[(i + 1) % statics.size()];
      return nullptr;
    }
    if (kind != 0x20 || all.empty()) return nullptr;
    if (id == 0) return all[0];
    for (size_t i = 0; i < all.size(); i++)
      if (all[i]->id == id) return all[(i + 1) % all.size()];
    return nullptr;
  }
};
static void *g_reg;
}  // namespace mock

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

// a pose: identity axes (the ship's = the world's in these tests), position x, y, z
static mock::Pos pose16(float x, float y, float z) {
  mock::Pos p;
  for (int i = 0; i < 16; i++) p.f[i] = 0;
  p.f[0] = p.f[5] = p.f[10] = 1;
  p.f[12] = x, p.f[13] = y, p.f[14] = z;
  return p;
}

template <class T> static T *person(const char *name, int id, float lx, float lz, mock::AnimationManager *mgr, void *ship) {
  T *m = new T();
  m->name = name;
  m->full = std::string("0: ") + name;
  m->id = id;
  m->mgr = mgr;
  m->parent = ship;
  m->local = pose16(lx, 20, lz);              // on the ship
  m->pos = pose16(60 + lx, 20, 293 + lz);     // the ship at world (60, 0, 293), axes = the world's
  return m;
}

int main() {
  using namespace mock;
  using AnimatorLogic::AnimatedCharacterBase;
  using AnimatorLogic::CharacterMovable;
  AnimationManager mgr;
  mgr.names = {"idle", "sign_taxifwd", "sign_taxifwd_l"};
  Ship shipA, shipB;  // two carriers: A at world (60, 0, 293), B 2 km away; axes = the world's
  shipA.pos = pose16(60, 0, 293);
  shipB.pos = pose16(2060, 0, 293);
  Member *m = person<Member>("yellow-04", 11, 40, 7, &mgr, &shipA);

  // ---- 1. RTTI from a pointer to a base in the middle of the object (as the registry hands them out)
  Registered *reg = m;
  Rtti r;
  bool got = rttiRaw(reg, &r);
  check(got, "RTTI readable from a base subobject");
  check(got && r.complete == (void *)m, "RTTI gives the complete object");
  check(got && strcmp(r.name, ".?AUMember@mock@@") == 0, "RTTI gives the class name");
  void *acb = got ? baseOf(r, N_ACB) : nullptr, *cm = got ? baseOf(r, N_CM) : nullptr;
  check(acb == (void *)static_cast<AnimatedCharacterBase *>(m), "base offset: AnimatedCharacterBase (DCS's class name)");
  check(cm == (void *)static_cast<CharacterMovable *>(m), "base offset: CharacterMovable (DCS's class name)");
  check(got && baseOf(r, ".?AURegistered@mock@@") == (void *)reg, "base offset: Registered");
  check(got && baseOf(r, N_MI) == (void *)static_cast<Graphics::ModelInstance *>(m), "base offset: Graphics::ModelInstance (DCS's class name)");
  Other *other = new Other();
  other->id = 99;
  Rtti ro;
  check(rttiRaw(other, &ro) && baseOf(ro, N_ACB) == nullptr, "an unrelated class has no AnimatedCharacterBase");
  int notAnObject[4] = {1, 2, 3, 4};
  check(!rttiRaw(notAnObject, &ro), "plain data is not taken for an object");
  check(got && consistent(r), "a live object's virtual tables agree");
  void *lonely[2] = {*(void **)m, nullptr};  // only the first virtual table pointer, nothing behind it
  Rtti rl;
  check(rttiRaw(lonely, &rl) && !consistent(rl), "one stray virtual table pointer is not an object");

  // ---- 2. strings: read (inline and on the heap), and one of ours passed by const reference
  char buf[128];
  void *s = nullptr;
  check(gThis(addrOf(&AnimatedCharacterBase::get_name), acb, &s) && readStr(s, buf, sizeof buf) && strcmp(buf, "yellow-04") == 0, "get_name: short string");
  m->name = "a name longer than the inline buffer";
  check(gThis(addrOf(&AnimatedCharacterBase::get_name), acb, &s) && readStr(s, buf, sizeof buf) && strcmp(buf, "a name longer than the inline buffer") == 0, "get_name: long string");
  m->name = "yellow-04";
  EdStr e;
  makeStr(&e, "sign_taxifwd");
  check(gSetRef(addrOf(&AnimatedCharacterBase::set_override_animation), acb, &e) && m->last == "sign_taxifwd", "our string by const reference: short");
  makeStr(&e, "night_stick_armpose_r");
  check(gSetRef(addrOf(&AnimatedCharacterBase::set_override_animation), acb, &e) && m->last == "night_stick_armpose_r", "our string by const reference: long");

  // ---- 3. values returned by value come through a hidden pointer after `this`
  Vec v = {nullptr, nullptr, nullptr};
  check(gRet(addrOf(&AnimatedCharacterBase::list), acb, &v) && v.last - v.first == 3 && v.first[0] == acb, "vector returned by value");
  EdStr sn;
  memset(&sn, 0, sizeof sn);
  sn.cap = 15;
  check(gRetF(addrOf(&CharacterMovable::get_current_state_name), cm, &sn, 0.5f) && readStr(&sn, buf, sizeof buf) && strcmp(buf, "MOVING") == 0 && m->seen == 0.5f, "string returned by value, float argument");
  memset(&sn, 0, sizeof sn);
  check(gRetF(addrOf(&CharacterMovable::get_current_state_name), cm, &sn, 2.0f) && readStr(&sn, buf, sizeof buf) && strcmp(buf, "a state name that is longer than sixteen") == 0, "long string returned by value");
  int iv = 0;
  check(gInt(addrOf(&CharacterMovable::get_state), cm, &iv) && iv == 5, "enum returned");
  check(gByte(addrOf(&AnimatedCharacterBase::get_id), acb, &iv) && (iv & 255) == 201, "unsigned char returned");

  // ---- 4. an exported virtual: its slot found in the object's own tables by its address, called through them
  m->GetPosition();  // records its decorated name
  void *fn = (void *)GetProcAddress(GetModuleHandleA(nullptr), g_getPositionName);
  check(fn != nullptr, "exported virtual found by its decorated name");
  int mdisp = -1, slot = -1;
  bool fv = fn && findVirtual(r, fn, &mdisp, &slot);
  check(fv && slot == MI_POSITION_SLOT, "virtual slot found by address: slot 3");
  const char *bn = fv ? deepestBaseAt(r, mdisp) : nullptr;
  check(bn && strcmp(bn, N_MI) == 0, "the slot's base is Graphics::ModelInstance");
  void *sub = bn ? baseOf(r, bn) : nullptr;
  void *ret = nullptr;
  check(sub && gThis((*(void ***)sub)[slot], sub, &ret) && ret == (void *)&m->pos, "virtual call through the slot returns the position");

  // ---- 5. positions: both layouts told apart
  float a12[16] = {1, 0, 0, 0, 1, 0, 0, 0, 1, 5, 6, 7, 0, 0, 0, 0}, a16[16] = {1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 5, 6, 7, 0};
  check(posLayout(a12) == 12 && posLayout(a16) == 16, "position layouts told apart");
  float junk[16] = {3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 5, 8, 9, 7, 9, 3};
  check(posLayout(junk) == 0, "junk is not a position");
  check(posAxis(a12, 12, 3)[1] == 6 && posAxis(a16, 16, 3)[1] == 6, "position vector read in both layouts");

  // ---- 6. the module's own functions, pointed at the stand-ins (as loadDcs points them at DCS)
  s_instance = (void *)&EnvMgr::instance;
  s_getEnvs = addrOf(&EnvMgr::get_environments);
  s_getObjs = addrOf(&Env::get_registered_objects);
  s_getName = addrOf(&AnimatedCharacterBase::get_name);
  s_getFullName = addrOf(&AnimatedCharacterBase::get_full_name);
  s_getId = addrOf(&AnimatedCharacterBase::get_id);
  s_localPos = addrOf(&AnimatedCharacterBase::local_position);
  s_getPosition = fn;
  s_getParent = addrOf(&AnimatedCharacterBase::get_parent);
  s_getAnimMgr = addrOf(&AnimatedCharacterBase::get_animation_manager);
  s_setAnim = addrOf(&AnimatedCharacterBase::set_animation);
  s_setOverride = addrOf(&AnimatedCharacterBase::set_override_animation);
  s_getState = addrOf(&CharacterMovable::get_state);
  s_hasRoutes = addrOf(&CharacterMovable::has_routes);
  s_moveWorld = addrOf(&CharacterMovable::move_command_world);
  s_stopMove = addrOf(&CharacterMovable::stop_move);
  s_stateName = addrOf(&CharacterMovable::get_current_state_name);
  s_numAnims = addrOf(&AnimationManager::get_num_animations);
  s_animNames = addrOf(&AnimationManager::get_animation_names);
  s_regInstance = &g_reg;

  // the second man is of a class that replaces the position virtual (as DCS's technicians do), on ship A;
  // the third stands at the same ship coordinates on ANOTHER ship (world position 2 km away)
  Technician *m2 = person<Technician>("brown-2-4", 12, -4, 36, &mgr, &shipA);
  Member *m3 = person<Member>("yellow-04", 13, 40, 7, &mgr, &shipB);
  m3->pos = pose16(2100, 20, 300);

  // 6a. the environment list: two characters (handed over as pointers to different bases) and a non-character
  Env env;
  env.list = {static_cast<Graphics::ModelInstance *>(m), static_cast<ISceneObject *>(m2), static_cast<viObject *>(other)};
  EnvMgr::instance()->envs = {&env};
  g_npeople = 0;
  memset(&g_scanTally, 0, sizeof g_scanTally);
  check(scanEnvRaw() == 0 && g_envs == 1 && g_envObjs == 3, "environment list walked");
  check(g_npeople == 2 && strcmp(g_people[0].name, "yellow-04") == 0 && strcmp(g_people[1].name, "brown-2-4") == 0, "environment list: the two characters, by name");
  check(strcmp(g_people[0].full, "0: yellow-04") == 0 && g_people[0].id == 201 && g_people[0].hasState && g_people[0].state == 5, "character: full name, id, state");
  check(g_people[0].locLayout == 16 && posAxis(g_people[0].loc, 16, 3)[0] == 40 && posAxis(g_people[0].loc, 16, 3)[2] == 7, "character: position on the ship");
  check(g_people[0].wldLayout == 16 && posAxis(g_people[0].wld, 16, 3)[0] == 100 && posAxis(g_people[0].wld, 16, 3)[2] == 300, "character: world position through ModelInstance's slot 3");
  check(g_people[1].wldLayout == 16 && posAxis(g_people[1].wld, 16, 3)[0] == 56 && m2->asked >= 1, "world position of a class that replaces the virtual (its own function is called)");
  check(g_people[0].mgr == &mgr && g_people[0].cm == (void *)static_cast<CharacterMovable *>(m) && g_people[0].parent == &shipA, "character: animation manager, walking part, parent");
  check(g_scanTally.ncls == 3 && g_scanTally.cls[0].person == 1 && g_scanTally.cls[1].person == 1 && g_scanTally.cls[2].person == 0 && strstr(g_scanTally.cls[0].bases, "CharacterMovable@AnimatorLogic") != nullptr, "classes counted, with their bases");

  // the ship a man is attached to, where it is, and his world position worked out from that alone
  g_nparents = 0;
  const ParentPose *pp = parentPose(g_people[0].parent);
  check(pp && pp->layout == 16 && posAxis(pp->f, 16, 3)[0] == 60 && posAxis(pp->f, 16, 3)[2] == 293, "parent: the ship's world position");
  check(parentPose(notAnObject) != nullptr && parentPose(notAnObject)->layout == 0, "parent: something that is not a drawn object gives no position");
  g_people[0].wldLayout = 0;
  memset(g_people[0].wld, 0, sizeof g_people[0].wld);
  check(worldFromParent(g_people[0]) && g_people[0].wldLayout == 16 && posAxis(g_people[0].wld, 16, 3)[0] == 100 && posAxis(g_people[0].wld, 16, 3)[1] == 20 && posAxis(g_people[0].wld, 16, 3)[2] == 300, "world position from the ship's position and his place on it");

  // 6b. the object registry: finds the third character too, no duplicates
  RegMgr rm;
  rm.all = {m, m2, other, m3};
  g_reg = &rm;
  int count = 0, people = 0;
  memset(&g_regTally, 0, sizeof g_regTally);
  check(scanRegistryRaw(g_regTally, 0x20, &count, &people) == 0 && count == 4 && people == 3, "object registry walked");
  check(g_npeople == 3 && g_people[2].complete == (void *)m3 && g_people[2].src == 2 && g_people[2].parent == &shipB, "registry adds the one the environment didn't have");
  check(scanRegistryRaw(g_regTally, 0x40, &count, &people) == 0 && count == 0, "a registry kind with nothing in it");

  // 6c. handles, refresh
  check(findPerson((double)(uintptr_t)m2) == &g_people[1] && findPerson(12345.0) == nullptr, "handles");
  m2->local.f[12] = -6;  // he moved
  refreshPeople();
  check(g_npeople == 3 && posAxis(g_people[1].loc, 16, 3)[0] == -6, "refresh keeps the characters and reads them again");

  // 6d. the memory scan finds all three from nothing
  g_npeople = 0;
  memset(&g_heapTally, 0, sizeof g_heapTally);
  int he = heapScanRaw(20);
  int found = 0;
  for (int i = 0; i < g_npeople; i++)
    if (g_people[i].src == 3 && (g_people[i].complete == m || g_people[i].complete == m2 || g_people[i].complete == m3)) found++;
  check(he == 0 && g_heapBytes > 0, "memory scan runs to the end");
  check(found == 3 && g_npeople == 3, "memory scan finds the three characters and nothing else");

  // 6e. animations and commands
  check(readAnimsRaw(&mgr) == 0 && g_nanim == 3 && strcmp(g_anim[1], "sign_taxifwd") == 0 && g_animMgr == &mgr, "animation list");
  makeStr(&e, "sign_taxifwd_l");
  int ia = -1, ib = -1;
  void *animIndex = addrOf(&AnimationManager::get_animation_index);
  check(gIdx(animIndex, &mgr, &e, false, &ia) && ia == 2 && gIdx(animIndex, &mgr, &e, true, &ib) && ib == 102, "animation index by name (string and bool arguments)");
  makeStr(&e, "no such animation, with a long name");
  check(gIdx(animIndex, &mgr, &e, false, &ia) && ia == 0xFFFF, "animation index of an unknown name");
  Person *q = findPerson((double)(uintptr_t)m);
  check(q && gSetInt(s_setAnim, q->acb, 2) && m->anim == 2, "play: set_animation(index)");
  makeStr(&e, "night_stick_armpose_r");
  check(q && gSetRef(s_setOverride, q->acb, &e) && m->last == "night_stick_armpose_r", "override animation");
  void *showAttachment = addrOf(&AnimatedCharacterBase::show_attachment);
  makeStr(&e, "RightStick");
  check(q && gSetRefBool(showAttachment, q->acb, &e, true) && m->last == "RightStick:on" && gSetRefBool(showAttachment, q->acb, &e, false) && m->last == "RightStick:off", "attachment shown and hidden (string and bool arguments)");

  // ship A at world (60, 0, 293), axes = the world's: yellow-04 at (40, 20, 7) on the ship is world (100, 20, 300)
  double S[12] = {1, 0, 0, 0, 1, 0, 0, 0, 1, 60, 0, 293};
  float pose[16];
  char info[300];
  int we = q ? walkCompute(q, 50, 10, 0, 0, S, pose, info, sizeof info) : -9;
  check(we == 0 && fabsf(posAxis(pose, 16, 3)[0] - 110) < 1e-3f && fabsf(posAxis(pose, 16, 3)[1] - 20) < 1e-3f && fabsf(posAxis(pose, 16, 3)[2] - 303) < 1e-3f, "walk target in world coordinates");
  check(strstr(info, "frame check 0.00") != nullptr, "walk: frame check agrees");
  check(posAxis(pose, 16, 0)[0] == 1 && posAxis(pose, 16, 2)[2] == 1, "walk: facing kept when none is asked for");
  check(q && gSetRef(s_moveWorld, q->cm, pose) && m->target.f[12] == 110 && m->target.f[14] == 303 && m->target.f[0] == 1, "walk: move_command_world gets the pose");
  // facing asked for: towards port (0 forward, -1 starboard): his x axis points there, z (his right) forward
  we = q ? walkCompute(q, 50, 10, 0, -2, S, pose, info, sizeof info) : -9;
  check(we == 0 && fabsf(posAxis(pose, 16, 0)[2] + 1) < 1e-3f && fabsf(posAxis(pose, 16, 0)[0]) < 1e-3f && fabsf(posAxis(pose, 16, 2)[0] - 1) < 1e-3f && fabsf(posAxis(pose, 16, 1)[1] - 1) < 1e-3f, "walk: facing a given way");
  // ship turned 90 degrees (forward = world +z, starboard = world -x): the stand-in's world position put to match
  double S2[12] = {0, 0, 1, 0, 1, 0, -1, 0, 0, 107, 0, 260};
  we = q ? walkCompute(q, 50, 10, 0, 0, S2, pose, info, sizeof info) : -9;
  check(we == 0 && fabsf(posAxis(pose, 16, 3)[0] - 97) < 1e-3f && fabsf(posAxis(pose, 16, 3)[2] - 310) < 1e-3f, "walk target with the ship turned");
  check(fabsf(posAxis(pose, 16, 0)[2] - 1) < 1e-3f && fabsf(posAxis(pose, 16, 2)[0] + 1) < 1e-3f, "walk: the character's axes turn with the ship");
  // the man at the same ship coordinates on the OTHER ship: refused (he would walk off his ship towards ours)
  Person *q3 = findPerson((double)(uintptr_t)m3);
  check(q3 && walkCompute(q3, 50, 10, 0, 0, S, pose, info, sizeof info) == -3, "walk refused for a man on another ship");
  check(q && gVoid(s_stopMove, q->cm) && m->stops == 1, "stop");

  // ---- 7. the animation instance ("cookie"): found through the character, read, played with the loop flag
  // 7a. the member's offset, out of the first instruction of set_override_animation (bytes as in DCS 2.9.31)
  static const unsigned char code8[16] = {0x48, 0x8B, 0x49, 0x70, 0x48, 0x85, 0xC9, 0x74, 0x0F, 0xF3, 0x0F, 0x10, 0x15, 0, 0, 0};
  static const unsigned char code32[16] = {0x48, 0x8B, 0x89, 0xA0, 0x03, 0x00, 0x00, 0x48, 0x85, 0xC9, 0x74, 0x0F, 0, 0, 0, 0};
  static const unsigned char codeOther[16] = {0x48, 0x89, 0x5C, 0x24, 0x08, 0x57, 0x48, 0x83, 0xEC, 0x40, 0, 0, 0, 0, 0, 0};
  static const unsigned char codeNoTest[16] = {0x48, 0x8B, 0x49, 0x70, 0x48, 0x8B, 0xC1, 0xC3, 0, 0, 0, 0, 0, 0, 0, 0};
  static const unsigned char codeNeg[16] = {0x48, 0x8B, 0x49, 0xF0, 0x48, 0x85, 0xC9, 0x74, 0x0F, 0, 0, 0, 0, 0, 0, 0};
  check(parseThisLoad(code8) == 0x70, "cookie offset read from the instruction (8-bit form, DCS 2.9.31's bytes)");
  check(parseThisLoad(code32) == 0x3A0, "cookie offset read from the instruction (32-bit form)");
  check(parseThisLoad(codeOther) == -1 && parseThisLoad(codeNoTest) == -1 && parseThisLoad(codeNeg) == -1, "other code gives no offset");

  // 7b. stand-ins: four animations (three plain, one blend space with an axis), one cookie on the first man
  using Animator::CharacterModelCookie;
  Animator::Animation an[4];
  const char *anNames[4] = {"idle", "sign_taxifwd", "sign_taxifwd_l", "bs_sign_taxi_fwd"};
  mgr.names.push_back("bs_sign_taxi_fwd");
  mgr.nclips = 3;
  for (int i = 0; i < 4; i++) {
    an[i].name = anNames[i];
    an[i].id = 10 + i;
    mgr.table.push_back(&an[i]);
  }
  an[3].xaxis = "angle";
  an[3].xb[0] = -45, an[3].xb[1] = 45, an[3].def[0] = 5;
  CharacterModelCookie cookie;
  m->cookie = &cookie;
  g_cookieOff = (int)((char *)&m->cookie - (char *)static_cast<AnimatedCharacterBase *>(m));
  s_animIndex = animIndex;
  s_cookieSetAnim = addrOf(&CharacterModelCookie::set_animation);
  s_cookieGetAnim = addrOf(&CharacterModelCookie::get_animation);
  s_cookieStack = addrOf(&CharacterModelCookie::get_stack_size);
  s_mgrAnimOf = addrOf(&AnimationManager::get_animation_of);
  s_mgrAnimAt = addrOf(&AnimationManager::get_animation_at);
  s_mgrDuration = addrOf(&AnimationManager::get_animation_duration);
  s_animName = addrOf(&Animator::Animation::get_name);
  s_animId = addrOf(&Animator::Animation::get_id);
  s_animXAxis = addrOf(&Animator::Animation::get_x_axis_name);
  s_animYAxis = addrOf(&Animator::Animation::get_y_axis_name);
  s_animXBounds = addrOf(&Animator::Animation::get_x_bounds);
  s_animYBounds = addrOf(&Animator::Animation::get_y_bounds);
  s_animDefaults = addrOf(&Animator::Animation::get_defaults);
  s_modelTime = (void *)&Animator::get_model_time;
  s_propSet = addrOf(&Animator::PropertyHolderImpl::set_property);
  s_propGet = addrOf(&Animator::PropertyHolderImpl::get_property);

  void *props = nullptr;
  check(q && cookieOf(q, &props) == (void *)&cookie && props == (void *)static_cast<Animator::PropertyHolderImpl *>(&cookie), "cookie found through the character, with its blend parameters");
  Person *q2 = findPerson((double)(uintptr_t)m2);
  check(q2 && cookieOf(q2, nullptr) == nullptr, "a character without a cookie: none");
  m2->cookie = reinterpret_cast<CharacterModelCookie *>(other);  // points at something that is not a cookie
  AnimNow now;
  float pv = -1;
  check(q2 && cookieOf(q2, nullptr) == nullptr && animNowRaw(q2, &now) == -1 && cookiePlayRaw(q2, 1, true) == -1 && propRaw(q2, "angle", true, 1, &pv) == -1, "a pointer to something that is not a cookie is refused, nothing is called");
  m2->cookie = nullptr;

  // 7c. reading and playing
  check(q && animNowRaw(q, &now) == -2, "nothing playing: reported, the reader (which would throw) is not called");
  check(q && cookiePlayRaw(q, 2, true) == 0 && cookie.calls == 1 && cookie.lastIdx == 2 && cookie.lastLoop && cookie.lastNow && cookie.lastT == 100.5f, "play through the cookie: index, clock time, loop flag ON, the second flag true");
  check(q && animNowRaw(q, &now) == 0 && strcmp(now.name, "sign_taxifwd_l") == 0 && now.id == 12 && now.rawId == 3 && now.stack == 1, "what he plays: name, id, stack size");
  check(now.t == 100.5 && cookie.askedT == 100.5f && now.f[0] == 100.5f && now.f[1] == 2.5f && now.f[2] == -1.0f && now.f[3] == 1.0f && now.f[6] == 0.25f && now.f[7] == -0.5f, "what he plays: start, duration, end, loop, blend coordinates (float argument and record layout)");
  Animator::g_clock = 104.25;
  check(q && cookiePlayRaw(q, 3, false) == 0 && cookie.calls == 2 && cookie.lastIdx == 3 && !cookie.lastLoop && cookie.lastNow && cookie.lastT == 104.25f, "play through the cookie: loop flag off");
  check(q && animNowRaw(q, &now) == 0 && strcmp(now.name, "bs_sign_taxi_fwd") == 0 && now.f[2] == 106.75f && now.f[3] == 0.0f, "a blend space played and read back");

  // 7d. blend parameters (a float argument after a string); a write makes the playing record take them again,
  // but only for a man who stands
  s_cookieUpdate = addrOf(&CharacterModelCookie::update_properties);
  check(q && propRaw(q, "angle", true, 30.0f, &pv) == 0 && pv == 30.0f && cookie.last == "angle" && cookie.value == 30.0f, "blend parameter set and read back");
  check(cookie.updates == 0, "a walking man's records are left alone (no update while he moves)");
  m->st = AnimatorLogic::CharacterState::Idle;
  check(q && propRaw(q, "angle", true, 12.5f, &pv) == 0 && pv == 12.5f && cookie.updates == 1 && cookie.updT == 104.25f, "a standing man: the cookie is told to take its parameters again, at the clock time");
  check(q && animNowRaw(q, &now) == 0 && now.f[6] == 12.5f, "the playing blend space's coordinate follows the parameter");
  check(q && propRaw(q, "angle", false, 0, &pv) == 0 && cookie.updates == 1, "reading a parameter updates nothing");
  check(q && propRaw(q, "angle", true, 30.0f, &pv) == 0 && cookie.updates == 2, "(parameter put back)");
  check(q && propRaw(q, "angle", false, 0, &pv) == 0 && pv == 30.0f && propRaw(q, "something_else", false, 0, &pv) == 0 && pv == 0.0f, "blend parameter read; an unknown one reads 0");
  check(q && propRaw(q, "a_parameter_with_a_long_name", true, -7.5f, &pv) == 0 && pv == -7.5f && cookie.last == "a_parameter_with_a_long_name", "blend parameter with a long name");

  // 7d2. the tractor drivers' head (crewtest-21): where it is to go is kept, and a frame at a time it is brought there
  {
    const double hh = (double)(uintptr_t)m;
    const int u0 = cookie.updates;
    check(headSet(hh, false, 100.0f, 6.0f) == 0 && g_nheads == 1 && headSet(hh, false, 250.0f, 0) == 0 && g_heads[0].target == 100.0f && g_heads[0].w == 6.0f, "head: kept once for a man, no further than 100 degrees");
    Animator::g_clock = 200.0;
    check(headTickRaw(200.0) == 1 && cookie.last == "catcc_head_yaw" && cookie.value == 0.0f && cookie.updates == u0 + 1, "head: the first frame writes where it is (ahead) and has the record take it");
    m->st = AnimatorLogic::CharacterState(1);
    float most = 0, prev = 0, speed = 0;
    int writes = 0, frames = 0;
    bool forward = true;
    for (double t = 200.0 + 1.0 / 60; t < 203.0; t += 1.0 / 60, frames++) {
      Animator::g_clock = t;
      writes += headTickRaw(t);
      forward = forward && g_heads[0].x >= prev - 1e-4f;
      if ((g_heads[0].x - prev) * 60 > speed) speed = (g_heads[0].x - prev) * 60;
      prev = g_heads[0].x;
      if (cookie.value > most) most = cookie.value;
    }
    check(forward && most == 100.0f && cookie.value == 100.0f && g_heads[0].x == 100.0f && g_heads[0].v == 0.0f, "head: it goes there without turning back or going past, and ends exactly there");
    check(speed > 150 && speed < 260, "head: at its quickest some 220 degrees a second (100 degrees at briskness 6)");
    check(writes > 40 && writes < 100 && cookie.updates == u0 + 1 + writes, "head: written while it turns (a walking state does not stop the record taking it), not once it has arrived");
    float x1 = 0, v1 = 0;
    for (int i = 0; i < 54; i++) headEase(&x1, &v1, 100.0f, 6.0f, 1.0f / 60);
    check(x1 > 95.0f && x1 < 100.0f, "head: 100 degrees in about 0.9 s");
    float xa = 0, va = 0, xb = 0, vb = 0;
    headEase(&xa, &va, 100.0f, 6.0f, 0.5f);
    for (int i = 0; i < 50; i++) headEase(&xb, &vb, 100.0f, 6.0f, 0.01f);
    check(fabsf(xa - xb) < 0.01f && fabsf(va - vb) < 0.05f, "head: the same turn whatever the frame rate");
    Animator::g_clock = 150.0;
    check(headTickRaw(150.0) == 0 && g_heads[0].x == 100.0f, "head: a clock that went back (a new mission) moves nothing");
    check(headSet(12345.0, false, 30.0f, 0) == 0 && g_nheads == 2 && headTickRaw(151.0) == 0 && g_nheads == 1, "head: a man who is not there any more is forgotten");
    check(headSet(hh, true, 0, 0) == 1 && g_nheads == 0 && headTickRaw(152.0) == 0, "head: forgotten on request");
    m->st = AnimatorLogic::CharacterState::Idle;
    Animator::g_clock = 104.25;
  }

  // 7e. the animations' own data
  check(readAnimsRaw(&mgr) == 0 && g_nanim == 4, "animation list with the blend space");
  AnimInfo ai;
  check(animInfoRaw(&mgr, "sign_taxifwd_l", 3, 4, &ai) == 0 && ai.idx == 2 && ai.id == 12 && ai.dur == 3.5f && ai.xa[0] == 0, "a plain animation: index, id, length");
  check(animInfoRaw(&mgr, "bs_sign_taxi_fwd", 3, 4, &ai) == 0 && ai.idx == 3 && ai.id == 13 && ai.dur == 0.0f && strcmp(ai.xa, "angle") == 0 && ai.ya[0] == 0 && ai.xb[0] == -45 && ai.xb[1] == 45 && ai.def[0] == 5, "a blend space: no length asked for, axis name, range, default");
  check(animInfoRaw(&mgr, "no_such_animation", 3, 4, &ai) == -2 && animInfoRaw(&mgr, "bs_sign_taxi_fwd", 3, 3, &ai) == -2, "unknown name / index outside the table: refused");

  // ---- 8. the catapult crews of the ship a man stands on, their orders, and the crew environment's switches
  s_crewsCount = addrOf(&wGroundCrewOwner::get_crews_count);
  s_carrierCrew = addrOf(&wGroundCrewOwner::get_carrier_crew);
  s_crewEnv = addrOf(&wGroundCrewOwner::get_character_env);
  s_crewFree = addrOf(&wCarrierCrew::request_free_catapult);
  s_crewAllowed = addrOf(&wCarrierCrew::set_operation_allowed);
  s_crewResetOrders = addrOf(&wCarrierCrew::reset_orders);
  s_crewStartBox = addrOf(&wCarrierCrew::get_start_box);
  s_envAvoid = addrOf(&MockEnv::get_can_avoid_collisions);
  s_envPathAvoid = addrOf(&MockEnv::get_can_path_avoid_collisions);
  s_envSetAvoid = addrOf(&MockEnv::set_avoid_collisions);
  s_envSetPathAvoid = addrOf(&MockEnv::set_path_avoid_collisions);
  static wCarrierCrew crewA, crewB;
  crewB.box[0] = 16, crewB.box[2] = -12, crewB.box[3] = 60, crewB.box[5] = 6;
  MockEnv menv;
  shipA.crews = {reinterpret_cast<wCarrierCrew *>(other), &crewA, &crewB};  // number 0 is not a catapult crew; DCS's count: 2
  shipA.env = &menv;
  void *owner = q ? ownerOf(q) : nullptr;
  check(owner == (void *)static_cast<wGroundCrewOwner *>(&shipA), "the ship a man is attached to, as the owner of its crews (base found by type information)");
  CatCrew cc[9];
  int dcsCount = -1;
  check(catCrewsRaw(owner, cc, 9, &dcsCount) == 3 && dcsCount == 2 && cc[0].crew == nullptr && cc[1].crew == (void *)&crewA && cc[2].crew == (void *)&crewB, "catapult crews listed by DCS's numbers 0..count; a pointer that is not a catapult crew is left out");
  check(cc[1].boxOk && cc[1].box[0] == 21 && cc[1].box[5] == 23.5f && cc[2].box[2] == -12 && cc[2].box[3] == 60, "their start boxes read (a reference to two 3-vectors)");
  check(catOrderRaw(cc[1].crew, 0, true) == 0 && crewA.freeCalls == 1 && crewA.lastFree && catOrderRaw(cc[1].crew, 0, false) == 0 && crewA.freeCalls == 2 && !crewA.lastFree, "order: free / take the catapult (bool argument)");
  check(catOrderRaw(cc[2].crew, 1, false) == 0 && crewB.allowedCalls == 1 && !crewB.lastAllowed && crewA.allowedCalls == 0, "order: operation allowed, to the crew it was meant for");
  check(catOrderRaw(cc[2].crew, 2, false) == 0 && crewB.resets == 1 && catOrderRaw(nullptr, 0, true) == -1, "order: reset; no crew: refused");

  // 8b. where the orders are kept, found by what a setter changes: inside the object and in a block it points to
  char chg[1024], peek[2048];
  check(orderLearnRaw(cc[2].crew, 0, true, chg, sizeof chg) == 0 && crewB.freeCalls == 1, "order given while looking for the bytes it changes");
  printf("      changes: %s\n", chg);
  int lastFreeOff = (int)((char *)&crewB.lastFree - (char *)&crewB), attrsOff = (int)((char *)&crewB.attrs - (char *)&crewB);
  char want[64];
  sprintf_s(want, "+0x%X: 0 > 1", lastFreeOff);
  check(strstr(chg, want) != nullptr, "found: the flag inside the crew object");
  sprintf_s(want, "[+0x%X]+0x5: 0 > 1", attrsOff);
  check(strstr(chg, want) != nullptr, "found: the flag in the block the object points to");
  sprintf_s(want, "[+0x%X]+0x6: 1 > 0", attrsOff);
  check(strstr(chg, want) == nullptr, "(a byte that did not change is not listed: take was already 0)");
  orderPeekRaw(cc[2].crew, peek, sizeof peek);
  sprintf_s(want, "[+0x%X]+0x5=1", attrsOff);
  check(strstr(peek, want) != nullptr, "read back: set");
  crewB.attrs[5] = 0;  // someone else puts it back
  orderPeekRaw(cc[2].crew, peek, sizeof peek);
  sprintf_s(want, "[+0x%X]+0x5=0", attrsOff);
  check(strstr(peek, want) != nullptr, "read back after someone else changed it");
  orderPeekRaw(cc[1].crew, peek, sizeof peek);
  check(peek[0] == 0, "another crew: nothing found on it yet (each crew keeps its orders in its own place)");
  check(orderLearnRaw(nullptr, 0, true, chg, sizeof chg) == -1 && chg[0] == 0, "no crew: refused");

  // 8d. the ship's catapult control bubbles
  int bst = -9;
  void *ship = q ? shipOf(q) : nullptr;
  check(ship == (void *)static_cast<woShip *>(&shipA), "the ship a man is attached to, as a woShip (found by type information)");
  check(bubbleRaw(ship, 0, -1, &bst) == -1, "bubble functions not found: refused");
  s_bubbleCmd = addrOf(&woShip::setBubbleCommand);
  s_bubbleState = addrOf(&woShip::getBubbleState);
  check(bubbleRaw(ship, 0, -1, &bst) == 0 && bst == 1 && shipA.bubbleCmd[0] == 0, "bubble state read, nothing commanded");
  check(bubbleRaw(ship, 1, 2, &bst) == 0 && bst == 0 && shipA.bubbleCmd[1] == 2 && shipA.bubbleCmd[0] == 0, "command 2 to the second bubble; the first left");
  check(bubbleRaw(ship, 1, 1, &bst) == 0 && bst == 1 && shipA.bubbleCmd[1] == 1, "command 1 to it");
  check(bubbleRaw(ship, 5, -1, &bst) == 0 && bst == -1 && bubbleRaw(ship, 0, 3, &bst) == -1 && bubbleRaw(nullptr, 0, 1, &bst) == -1, "no such bubble: -1 from DCS; a command over 2, or no ship: refused");
  {
    Person noShip2 = *q;
    noShip2.parent = other;
    check(shipOf(&noShip2) == nullptr, "a man attached to something that is not a ship: no ship");
  }

  // 8e. the elevators, and what the ship's air traffic control says
  int est = -9;
  check(elevatorRaw(ship, 0, -1, &est) == -1, "elevator functions not found: refused");
  s_elevCmd = addrOf(&woShip::setElevatorCommand);
  s_elevState = addrOf(&woShip::getElevatorState);
  check(elevatorRaw(ship, 3, 2, &est) == 0 && est == 1 && shipA.elevCmd[3] == 2 && shipA.elevCmd[0] == 0, "command 2 to the fourth elevator; the others left");
  check(elevatorRaw(ship, 3, -1, &est) == 0 && est == 1 && elevatorRaw(ship, 4, 1, &est) == -1 && elevatorRaw(ship, 0, 3, &est) == -1, "elevator state read; a fifth elevator or a command over 2: refused");
  DeckState ds;
  static woATC atcA;
  int why = 9;
  check(q && atcOf(q, &why) == nullptr && why == -1, "no getATC function known: no ATC, said so");
  // the two virtuals as DCS has them: exported, found by name, and sitting in the object's own tables
  static_cast<wAirbase *>(&shipA)->getATC();
  atcA.getFreeCatapultsNum();
  s_shipGetAtc = (void *)GetProcAddress(GetModuleHandleA(nullptr), g_getAtcName);
  void *freeCatsFn = (void *)GetProcAddress(GetModuleHandleA(nullptr), g_freeCatsName);
  check(s_shipGetAtc != nullptr && freeCatsFn != nullptr, "the exported virtuals found by their decorated names");
  check((void *)static_cast<wAirbase *>(&shipA) != (void *)q->parent, "(the airbase part of the ship is not where the ship starts)");
  check(q && atcOf(q, &why) == nullptr && why == -2, "a ship without an ATC: said so");
  shipA.atc = &atcA;
  void *atc = q ? atcOf(q, &why) : nullptr;
  check(atc == (void *)&atcA && why == 0, "the ship's ATC: getATC found in the ship's own tables and called on the part of the ship it belongs to");
  {
    Person noAtc = *q;
    noAtc.parent = other;
    check(atcOf(&noAtc, &why) == nullptr && why == -1, "a man attached to something without a getATC: no ATC");
  }
  check(deckStateRaw(atc, &ds) == -1, "ATC functions not found: refused");
  s_atcCanLand = addrOf(&woATC::canStartLanding);
  s_atcCanTakeoff = addrOf(&woATC::canStartTakeoff);
  s_atcFoulDeck = addrOf(&woATC::getFoulDeck);
  s_atcRwOpen = addrOf(&woATC::isRunWayOpen);
  s_atcCase = addrOf(&woATC::getRecoveryCASE);
  check(deckStateRaw(atc, &ds) == 0 && ds.canLand == 0 && ds.canTakeoff == 1 && ds.foul == 1 && ds.rwOpen == 1 && ds.freeCats == -1 && ds.recoveryCase == 1, "what the ATC says; the free catapults -1 while that virtual is not known");
  s_atcFreeCats = freeCatsFn;
  check(deckStateRaw(atc, &ds) == 0 && ds.freeCats == 3, "free catapults: the virtual found in the ATC's own table and called");
  atcA.land = true, atcA.foul = false, atcA.cats = 4;
  check(deckStateRaw(atc, &ds) == 0 && ds.canLand == 1 && ds.foul == 0 && ds.freeCats == 4, "(and it follows the ATC)");
  shipA.atc = reinterpret_cast<woATC *>(other);
  check(atcOf(q, &why) == nullptr && why == -2, "something that is not a woATC is not taken for one");
  shipA.atc = &atcA;

  // 8f. the ATC's teleport: a 128-byte position handed over by value
  double tpv[12] = {0, 0, 1, 0, 1, 0, -1, 0, 0, 1000.5, 20.25, -3000.75};
  check(teleportRaw(atc, tpv, 16777472u) == -1, "teleport function not found: refused");
  s_atcTeleport = addrOf(&woATC::teleport_aircraft);
  check(teleportRaw(atc, tpv, 16777472u) == 0 && atcA.tpCalls == 1 && atcA.tpId == 16777472u, "teleport called with the object id");
  check(atcA.tp.v[0][2] == 1 && atcA.tp.v[1][1] == 1 && atcA.tp.v[2][0] == -1 && atcA.tp.v[3][0] == 1000.5 && atcA.tp.v[3][1] == 20.25 && atcA.tp.v[3][2] == -3000.75 && atcA.tp.v[3][3] == 0,
        "the position arrives: axes x, y, z and the point, each in its 32-byte slot");
  check(teleportRaw(nullptr, tpv, 1) == -1 && atcA.tpCalls == 1, "no ATC: refused");

  // 8h. one of the ship's model arguments, through its own list (a virtual of the ship part, not the first base)
  float av = -9, half = 0.5f, big = 2.0f;
  check(shipArgRaw(q->parent, 53, nullptr, &av) == -1, "model arguments: function not found, refused");
  shipA.GetDrawArguments();
  s_shipDrawArgs = (void *)GetProcAddress(GetModuleHandleA(nullptr), g_drawArgsName);
  check(s_shipDrawArgs != nullptr, "the exported virtual found by its decorated name");
  shipA.args[53] = 0.25f;
  check(shipArgRaw(q->parent, 53, nullptr, &av) == 0 && av == 0.25f, "a model argument read from the ship's own list");
  check(shipArgRaw(q->parent, 53, &half, &av) == 0 && av == 0.5f && shipA.args[53] == 0.5f && shipA.args[52] == 0 && shipA.args[54] == 0, "written: that one, its neighbours left");
  check(shipArgRaw(q->parent, 200, &half, &av) == -2 && shipArgRaw(q->parent, -1, nullptr, &av) == -2, "an argument the ship does not have: refused");
  check(shipArgRaw(other, 53, nullptr, &av) == -1 && shipArgRaw(nullptr, 53, &big, &av) == -1, "something that is not a ship: refused");

  // 8i. the ship's own argument setter is used when it is in the ship's tables
  shipA.setDrawArgumentValue(0, 0);
  shipA.setCalls = 0;
  s_shipSetArg = (void *)GetProcAddress(GetModuleHandleA(nullptr), g_setArgName);
  float threeQ = 0.75f;
  // 8l. a model argument of another drawn object by its id: the slot and base read from the ship
  {
    struct Hull {
      virtual int hull() { return 1; }
      double mass = 1;
    };
    struct MockJet : Hull, woShip, Registered {  // (woShip stands in for Graphics::ModelInstance: the base the ship's function is in)
      std::vector<float> jetArgs = std::vector<float>(10, 0.0f);
      __declspec(noinline) const std::vector<float> &GetDrawArguments() override { return jetArgs; }
    };
    static MockJet jet2;
    jet2.id = 0x1000300;
    jet2.jetArgs[2] = 0.25f;
    rm.all.push_back(static_cast<Registered *>(&jet2));
    float jv = 0, half2 = 0.5f;
    const char *jc = "";
    check(objArgRaw(q->parent, 0x1000300, 2, nullptr, &jv, &jc) == 0 && jv == 0.25f && strstr(jc, "MockJet") != nullptr, "another object's argument read through the ship's slot, on the object's own base");
    check(objArgRaw(q->parent, 0x1000300, 2, &half2, &jv, &jc) == 0 && jet2.jetArgs[2] == 0.5f && shipA.args[2] == 0 && jet2.args[2] == 0, "written into the object's own list (not the ship's, not the base's)");
    check(objArgRaw(q->parent, 0x1000300, 10, nullptr, &jv, &jc) == -4, "an argument it does not have: refused");
    check(objArgRaw(q->parent, 0x1000999, 2, nullptr, &jv, &jc) == -2, "no object with that id: said so");
    check(objArgRaw(q->parent, (unsigned int)static_cast<Registered *>(m)->id, 2, nullptr, &jv, &jc) == -3, "an object without that base: refused");
    rm.all.pop_back();
    g_nstatics = 0;
  }
  check(s_shipSetArg != nullptr && shipArgRaw(q->parent, 53, &threeQ, &av) == 0 && av == 0.75f && shipA.args[53] == 0.75f && shipA.setCalls == 1, "written through the ship's own setter");

  // 8j. a moving object put somewhere through its OWN ForcePosition (the class replaces MovingObject's)
  {
    static MovingObject plain;
    static wHumanAircraft jet;
    const char *cls = "";
    double fv[12] = {0, 0, 1, 0, 1, 0, -1, 0, 0, 500.5, 22, -700.25};
    plain.id = 0x1000100, jet.id = 0x1000200;
    check(forcePosRaw(0x1000200, fv, &cls) == -1, "ForcePosition: functions not found, refused");
    double zero[4][4] = {};
    plain.ForcePosition(zero);
    plain.forced = 0;
    s_forcePos = (void *)GetProcAddress(GetModuleHandleA(nullptr), g_forcePosName);
    s_moVtable = *(void ***)static_cast<viObject *>(&plain);
    rm.all.push_back(static_cast<Registered *>(&plain));
    rm.all.push_back(static_cast<Registered *>(&jet));
    check(s_forcePos != nullptr && forcePosRaw(0x1000200, fv, &cls) == 0 && jet.own == 1 && jet.forced == 0 && jet.at[0] == 500.5 && jet.at[2] == -700.25 && jet.nose[2] == 1,
          "the aircraft found by its id and its own ForcePosition called, on its MovingObject part");
    check(strcmp(cls, ".?AVwHumanAircraft@@") == 0, "(its class name given back)");
    check(forcePosRaw(0x1000100, fv, &cls) == 0 && plain.forced == 1 && plain.at[0] == 500.5, "a plain moving object: MovingObject's own");
    check(forcePosRaw(0x1000999, fv, &cls) == -2, "no object with that id: said so");
    check(forcePosRaw((unsigned int)static_cast<Registered *>(m)->id, fv, &cls) == -3, "a registered object that is not a moving object: refused");
    rm.all.pop_back();
    rm.all.pop_back();
  }

  // 8k. a static object put somewhere through its OWN SetPos, found by id under whatever kind it is filed
  {
    static lLandObject plainL;
    static lLandVehicle tug;
    const char *cls = "";
    int kind = -1;
    double fv[12] = {0, 0, 1, 0, 1, 0, -1, 0, 0, 500.5, 9, -700.25}, one[3] = {1, 1, 1}, sc[3] = {4, 1.5, 1.5};
    plainL.id = 0x2000100, tug.id = 0x2000200;
    check(staticPosRaw(0x2000200, fv, one, &cls, &kind) == -1, "SetPos: functions not found, refused");
    float zero[4][4] = {};
    plainL.SetPos(zero);
    plainL.set = 0;
    s_landSetPos = (void *)GetProcAddress(GetModuleHandleA(nullptr), g_setPosName);
    s_landVtable = *(void ***)static_cast<viObject *>(&plainL);
    rm.statics.push_back(static_cast<Registered *>(&plainL));
    rm.statics.push_back(static_cast<Registered *>(&tug));
    check(s_landSetPos != nullptr && staticPosRaw(0x2000200, fv, sc, &cls, &kind) == 0 && tug.own == 1 && tug.set == 0 && tug.at[0] == 500.5f && tug.at[1] == 9 && fabsf(tug.xlen - 4) < 1e-5f,
          "the static found by its id and its own SetPos called, the x axis stretched");
    check(strcmp(cls, ".?AVlLandVehicle@@") == 0 && kind == 0x31, "(its class name and its kind in the register given back)");
    check(g_spTook == -1 && g_spFlags == 0, "(an object that cannot be asked where it is: said so; its flag word read)");
    check(staticPosRaw(0x2000200, fv, one, &cls, &kind) == 0 && tug.own == 2 && kind == 0x31, "found again (remembered)");
    check(staticPosRaw(0x2000100, fv, one, &cls, &kind) == 0 && plainL.set == 1, "a plain land object: lLandObject's own");
    check(staticPosRaw(0x2000999, fv, one, &cls, &kind) == -2, "no object with that id: said so");
    rm.statics.clear();
    check(staticPosRaw(0x2000200, fv, one, &cls, &kind) == 0, "(a remembered object is not looked for again)");
    g_nstatics = 0;
  }

  // 8g. where the ship keeps its bubble and elevator commands: read out of the two setters' own code
  // (the first bytes of woShip::setBubbleCommand and setElevatorCommand as Transport.dll has them)
  static const unsigned char bubCode[96] = {0x85, 0xD2, 0x78, 0x67, 0x48, 0x89, 0x5C, 0x24, 0x08, 0x48, 0x89, 0x74, 0x24, 0x10, 0x57, 0x48, 0x83, 0xEC, 0x20, 0x48,
                                            0x63, 0xFA, 0x41, 0x8B, 0xF0, 0x48, 0x8B, 0xD9, 0x3B, 0xB9, 0x00, 0x1B, 0x00, 0x00, 0x7D, 0x38, 0x41, 0x83, 0xF8, 0x02,
                                            0x77, 0x32, 0x44, 0x89, 0x84, 0xB9, 0x0C, 0x1B, 0x00, 0x00, 0x80, 0xB9, 0x68, 0x02, 0x00, 0x00, 0x00, 0x74, 0x21};
  static const unsigned char elevCode[96] = {0x48, 0x89, 0x5C, 0x24, 0x08, 0x48, 0x89, 0x74, 0x24, 0x10, 0x57, 0x48, 0x83, 0xEC, 0x20, 0x48, 0x8B, 0xF1, 0x48, 0x63,
                                             0xFA, 0x48, 0x8B, 0x89, 0x28, 0x1A, 0x00, 0x00, 0x41, 0x8B, 0xD8, 0x48, 0x85, 0xC9, 0x74, 0x0E, 0x83, 0xFF, 0x03, 0x77,
                                             0x09, 0x83, 0xFB, 0x02, 0x77, 0x04, 0x89, 0x5C, 0xB9, 0x40, 0x80, 0xBE, 0x68, 0x02, 0x00, 0x00, 0x00};
  CmdPlaces pl;
  findCmdPlaces(bubCode, elevCode, &pl);
  check(pl.done == 1 && pl.bubbleCount == 0x1B00 && pl.bubbleCmd == 0x1B0C && pl.elevObj == 0x1A28 && pl.elevCmd == 0x40, "the places of the commands read out of the setters' code");
  static unsigned char fakeShip[0x2000];
  static int fakeElev[32];
  int two = 2, c2 = 2, c1 = 1;
  memcpy(fakeShip + 0x1B00, &two, 4), memcpy(fakeShip + 0x1B0C, &c2, 4), memcpy(fakeShip + 0x1B10, &c1, 4);
  void *fe = fakeElev;
  memcpy(fakeShip + 0x1A28, &fe, sizeof fe);
  fakeElev[16 + 1] = 1, fakeElev[16 + 3] = 2;  // (+0x40 = int 16)
  int gb[2], ge[4];
  check(shipCmdsRaw(fakeShip, pl, gb, ge) == 6 && gb[0] == 2 && gb[1] == 1 && ge[0] == 0 && ge[1] == 1 && ge[2] == 0 && ge[3] == 2, "bubble and elevator commands read from those places");
  CmdPlaces none;
  findCmdPlaces((const unsigned char *)addrOf(&woShip::setBubbleCommand), (const unsigned char *)addrOf(&woShip::setElevatorCommand), &none);
  check(none.bubbleCount == -1 && none.elevObj == -1 && shipCmdsRaw(fakeShip, none, gb, ge) == 0 && gb[0] == -1 && ge[3] == -1, "setters that do not look like DCS's: the places stay unknown and nothing is read");

  // 8c. the character code's own four switches (exported data)
  static unsigned char dbg[4] = {1, 0, 0, 0};
  unsigned char dgot[4] = {9, 9, 9, 9};
  check(debugSetRaw(-1, 0, dgot) == -1, "switches: not found, refused");
  s_debugSettings = dbg;
  check(debugSetRaw(-1, 0, dgot) == 0 && dgot[0] == 1 && dgot[3] == 0, "switches read");
  check(debugSetRaw(3, 1, dgot) == 0 && dgot[3] == 1 && dbg[3] == 1 && dbg[2] == 0 && debugSetRaw(4, 1, dgot) == -1, "one switched on, the others left; a fifth: refused");
  int fl[2] = {-1, -1};
  check(envFlagsRaw(owner, -1, -1, fl) == 0 && fl[0] == 0 && fl[1] == 0, "environment switches read");
  check(envFlagsRaw(owner, 1, -1, fl) == 0 && fl[0] == 1 && fl[1] == 0 && menv.avoid && !menv.pathAvoid, "avoid collisions switched on, the other left");
  check(envFlagsRaw(owner, -1, 1, fl) == 0 && fl[0] == 1 && fl[1] == 1 && envFlagsRaw(owner, 0, 0, fl) == 0 && fl[0] == 0 && fl[1] == 0, "path avoid switched on; both off again");
  Person noShip = *q;
  noShip.parent = other;  // attached to something that is not a crew owner
  check(ownerOf(&noShip) == nullptr, "a man attached to something else has no crew owner");

  delete m3;  // a destroyed character must not be commanded: refresh drops it or keeps it, but never crashes
  refreshPeople();
  check(g_npeople >= 2 && g_npeople <= 3 && findPerson((double)(uintptr_t)m) != nullptr, "refresh after one was destroyed");

  // 9. the worker thread and its two queues (the thread's Lua side is tried by smoke.py, with DCS's lua.dll)
  {
    struct Body {
      static void echo(Worker *w) {
        std::string s;
        for (;;) {
          if (w->quit) return;
          if (!w->toWorker.pop(s, 20)) continue;
          if (s == "crash") {
            volatile int *p = nullptr;
            *p = 1;
          }
          if (s == "busy") Sleep(300);
          const std::string r = "re:" + s;
          w->toMain.push(r.data(), r.size());
        }
      }
    };
    std::string got;
    bool ok = true;
    for (int i = 0; i < 100 && ok; i++) {
      ok = workerStart(Body::echo, "", "") == 0;
      if (ok) g_worker->toWorker.push("a", 1);
      ok = ok && g_worker->toMain.pop(got, 2000) && got == "re:a" && workerStop(2000) && g_worker->state == 2;
    }
    check(ok, "worker: started, answered and stopped 100 times");
    ok = workerStart(Body::echo, "", "") == 0;
    for (int i = 0; i < 10000; i++) {
      const std::string m = std::to_string(i);
      g_worker->toWorker.push(m.data(), m.size());
    }
    for (int i = 0; i < 10000 && ok; i++) ok = g_worker->toMain.pop(got, 2000) && got == "re:" + std::to_string(i);
    check(ok, "worker: 10,000 messages each way, in their order");
    check(workerStart(Body::echo, "", "") == 1, "worker: a second one is refused while the first runs");
    check(!g_worker->toMain.wait(30) && !g_worker->toMain.pop(got, 0), "worker: nothing waits when nothing was sent");
    g_worker->toWorker.push("busy", 4);
    Sleep(30);
    check(!workerStop(40), "worker: told to stop while it is busy: not waited for for ever");
    check(workerStop(3000) && g_worker->state == 2, "worker: and it ends when its step is over");
    ok = workerStart(Body::echo, "", "") == 0;
    g_worker->toWorker.push("crash", 5);
    check(ok && workerReap(3000) && g_worker->state == 3, "worker: a crash in its body ends the thread, not the process");
    check(workerStart(Body::echo, "", "") == 0 && workerStop(2000), "worker: and another starts after it");
  }

  printf(g_fail ? "\n%d FAILED\n" : "\nall passed\n", g_fail);
  return g_fail ? 1 : 0;
}
