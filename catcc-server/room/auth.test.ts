import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import WebSocket from 'ws';
import { CLOSE_AUTH_FAILED, CLOSE_FORBIDDEN, type ServerMsg } from '../../src/catcc/core/room/protocol.ts';
import { devVerifier, supabaseVerifier, type VerifyToken } from './auth.ts';
import { decideMembership, discordIdOf, REASON, type MemberFacts } from './membership.ts';
import { RoomService } from './roomService.ts';

const TODAY = '2026-11-22';
const ACTIVE = { id: 'st-active', name: 'Active', isActive: true };
const LEAVE = { id: 'st-leave', name: 'On Leave', isActive: false };
const RETIRED = { id: 'st-retired', name: 'Retired', isActive: false };
const member = (over: Partial<MemberFacts> = {}): MemberFacts => ({
  pilot: true,
  assignments: [{ squadron_id: 'sq1', start_date: '2025-01-01', end_date: null }],
  squadrons: [{ id: 'sq1', deactivated_date: null }],
  statusRows: [{ status_id: ACTIVE.id, start_date: '2025-01-01', end_date: null }],
  statuses: [ACTIVE, LEAVE, RETIRED],
  admin: false,
  ...over,
});

describe('wing membership rule', () => {
  it('an active pilot with a current squadron assignment is a member', () => {
    expect(decideMembership(member(), TODAY)).toEqual({ ok: true });
  });

  it('no roster pilot for the Discord account is refused', () => {
    expect(decideMembership(member({ pilot: false, assignments: [], statusRows: [] }), TODAY)).toEqual({ ok: false, reason: REASON.noPilot });
  });

  it('needs a current assignment in a squadron that is not deactivated', () => {
    const ended = member({ assignments: [{ squadron_id: 'sq1', start_date: '2024-01-01', end_date: '2026-11-22' }] });
    expect(decideMembership(ended, TODAY)).toEqual({ ok: false, reason: REASON.noSquadron });
    const future = member({ assignments: [{ squadron_id: 'sq1', start_date: '2026-12-01', end_date: null }] });
    expect(decideMembership(future, TODAY)).toEqual({ ok: false, reason: REASON.noSquadron });
    const deact = member({ squadrons: [{ id: 'sq1', deactivated_date: '2026-06-01' }] });
    expect(decideMembership(deact, TODAY)).toEqual({ ok: false, reason: REASON.noSquadron });
    const endsLater = member({ assignments: [{ squadron_id: 'sq1', start_date: '2024-01-01', end_date: '2026-11-23' }] });
    expect(decideMembership(endsLater, TODAY)).toEqual({ ok: true });
  });

  it('the current roster status must be one marked active (On Leave, Retired, Removed are not)', () => {
    for (const st of [LEAVE, RETIRED]) {
      expect(decideMembership(member({ statusRows: [{ status_id: st.id, start_date: '2026-01-01', end_date: null }] }), TODAY)).toEqual({
        ok: false,
        reason: REASON.inactive(st.name),
      });
    }
    expect(decideMembership(member({ statusRows: [] }), TODAY)).toEqual({ ok: false, reason: REASON.noStatus });
  });

  it('the latest current status wins; ended statuses are ignored', () => {
    const back = member({
      statusRows: [
        { status_id: LEAVE.id, start_date: '2026-01-01', end_date: '2026-03-01' },
        { status_id: ACTIVE.id, start_date: '2026-03-01', end_date: null },
      ],
    });
    expect(decideMembership(back, TODAY)).toEqual({ ok: true });
    const retiredOver = member({
      statusRows: [
        { status_id: ACTIVE.id, start_date: '2025-01-01', end_date: null },
        { status_id: RETIRED.id, start_date: '2026-10-01', end_date: null },
      ],
    });
    expect(decideMembership(retiredOver, TODAY).ok).toBe(false);
  });

  it('a ReadyRoom admin is let in without a pilot record', () => {
    expect(decideMembership(member({ pilot: false, assignments: [], statusRows: [], admin: true }), TODAY)).toEqual({ ok: true });
  });

  it('reads the Discord id from the Supabase identity, not from editable metadata', () => {
    expect(discordIdOf({ identities: [{ provider: 'email', id: 'x' }, { provider: 'discord', id: 'i', identity_data: { provider_id: '123', sub: '123' } }] })).toBe('123');
    expect(discordIdOf({ identities: [{ provider: 'discord', id: '456' }] })).toBe('456');
    expect(discordIdOf({ identities: [{ provider: 'email', id: 'x' }] })).toBeUndefined();
    expect(discordIdOf({})).toBeUndefined();
  });
});

/** A fake Supabase: auth/v1/user by token, rest/v1 tables filtered by eq. params. */
function fakeSupabase(db: {
  users: Record<string, { id: string; identities?: unknown[]; user_metadata?: Record<string, unknown> }>;
  tables: Record<string, Record<string, unknown>[]>;
}) {
  const calls: string[] = [];
  const fetchMock = vi.fn(async (input: string | URL, init?: { headers?: Record<string, string> }) => {
    const u = new URL(String(input));
    calls.push(u.pathname + u.search);
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    if (u.pathname === '/auth/v1/user') {
      const tok = init?.headers?.Authorization?.replace('Bearer ', '') ?? '';
      const user = db.users[tok];
      return user ? json(user) : json({ msg: 'invalid' }, 401);
    }
    const table = u.pathname.replace('/rest/v1/', '');
    let rows = db.tables[table];
    if (!rows) return json({ message: 'no table' }, 404);
    for (const [k, v] of u.searchParams) {
      if (k === 'select' || k === 'limit') continue;
      if (v.startsWith('eq.')) rows = rows.filter((r) => String(r[k]) === v.slice(3));
      else if (v.startsWith('is.')) rows = rows.filter((r) => String(r[k]) === v.slice(3));
      else if (v.startsWith('in.(')) {
        const ids = v.slice(4, -1).split(',');
        rows = rows.filter((r) => ids.includes(String(r[k])));
      }
    }
    return json(rows);
  });
  return { fetchMock, calls };
}

const discord = (id: string) => [{ provider: 'discord', id, identity_data: { provider_id: id, sub: id } }];

const DB = {
  users: {
    'tok-member': { id: 'auth-m', identities: discord('d-m'), user_metadata: { full_name: 'm' } },
    'tok-outsider': { id: 'auth-o', identities: discord('d-o'), user_metadata: { full_name: 'o' } },
    'tok-retired': { id: 'auth-r', identities: discord('d-r') },
    'tok-spoof': { id: 'auth-s', identities: discord('d-s') },
    'tok-admin': { id: 'auth-a', identities: discord('d-a') },
  },
  tables: {
    user_profiles: [
      { id: 'up-m', auth_user_id: 'auth-m', discord_username: 'mm', pilot_id: 'p-m' },
      { id: 'up-o', auth_user_id: 'auth-o', discord_username: 'oo', pilot_id: null },
      { id: 'up-r', auth_user_id: 'auth-r', discord_username: 'rr', pilot_id: 'p-r' },
      // links itself to the member's pilot record through its own (user-writable) profile row
      { id: 'up-s', auth_user_id: 'auth-s', discord_username: 'ss', pilot_id: 'p-m' },
      { id: 'up-a', auth_user_id: 'auth-a', discord_username: 'aa', pilot_id: null },
    ],
    pilots: [
      { id: 'p-m', discord_id: 'd-m', callsign: 'Ace', boardNumber: 401 },
      { id: 'p-r', discord_id: 'd-r', callsign: 'Old', boardNumber: 402 },
    ],
    pilot_assignments: [
      { pilot_id: 'p-m', squadron_id: 'sq1', start_date: '2025-01-01', end_date: null },
      { pilot_id: 'p-r', squadron_id: 'sq1', start_date: '2025-01-01', end_date: null },
    ],
    org_squadrons: [{ id: 'sq1', deactivated_date: null }],
    pilot_statuses: [
      { pilot_id: 'p-m', status_id: 'st-active', start_date: '2025-01-01', end_date: null },
      { pilot_id: 'p-r', status_id: 'st-retired', start_date: '2025-06-01', end_date: null },
    ],
    statuses: [ACTIVE, RETIRED],
    app_permissions: [{ id: 'perm-dev', name: 'access_developer_settings' }],
    permission_rules: [{ id: 'r1', permission_id: 'perm-dev', basis_type: 'manual_override', basis_id: 'up-a', active: true }],
  },
};

describe('supabaseVerifier', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lets a wing member in with their callsign and board', async () => {
    const { fetchMock } = fakeSupabase(DB);
    vi.stubGlobal('fetch', fetchMock);
    const verify = supabaseVerifier('https://sb.test', 'svc');
    expect(await verify('tok-member')).toEqual({ userId: 'auth-m', name: 'Ace', board: 401 });
  });

  it('refuses a Discord user with no roster pilot', async () => {
    vi.stubGlobal('fetch', fakeSupabase(DB).fetchMock);
    expect(await supabaseVerifier('https://sb.test', 'svc')('tok-outsider')).toEqual({ refused: REASON.noPilot });
  });

  it('refuses a retired pilot', async () => {
    vi.stubGlobal('fetch', fakeSupabase(DB).fetchMock);
    expect(await supabaseVerifier('https://sb.test', 'svc')('tok-retired')).toEqual({ refused: REASON.inactive('Retired') });
  });

  it('ignores a profile row pointed at someone else’s pilot record', async () => {
    vi.stubGlobal('fetch', fakeSupabase(DB).fetchMock);
    expect(await supabaseVerifier('https://sb.test', 'svc')('tok-spoof')).toEqual({ refused: REASON.noPilot });
  });

  it('lets a ReadyRoom admin (manual developer-settings rule) in without a pilot', async () => {
    vi.stubGlobal('fetch', fakeSupabase(DB).fetchMock);
    expect(await supabaseVerifier('https://sb.test', 'svc')('tok-admin')).toMatchObject({ userId: 'auth-a', name: 'aa' });
  });

  it('an invalid token is null (auth failed), not a refusal', async () => {
    vi.stubGlobal('fetch', fakeSupabase(DB).fetchMock);
    expect(await supabaseVerifier('https://sb.test', 'svc')('tok-bad')).toBeNull();
  });

  it('a failed lookup is null and not cached', async () => {
    const { fetchMock } = fakeSupabase(DB);
    let broken = true;
    vi.stubGlobal('fetch', async (input: string | URL, init?: { headers?: Record<string, string> }) =>
      broken && String(input).includes('/rest/v1/pilot_statuses') ? new Response('{}', { status: 500 }) : fetchMock(input, init),
    );
    const verify = supabaseVerifier('https://sb.test', 'svc');
    expect(await verify('tok-member')).toBeNull();
    broken = false;
    expect(await verify('tok-member')).toMatchObject({ userId: 'auth-m' });
  });

  it('caches members and refusals per token', async () => {
    const { fetchMock } = fakeSupabase(DB);
    vi.stubGlobal('fetch', fetchMock);
    const verify = supabaseVerifier('https://sb.test', 'svc');
    await verify('tok-member');
    await verify('tok-outsider');
    const n = fetchMock.mock.calls.length;
    await verify('tok-member');
    await verify('tok-outsider');
    expect(fetchMock.mock.calls.length).toBe(n);
  });
});

describe('room refuses non-members', () => {
  let room: RoomService;
  let server: http.Server;
  let url: string;
  const verify: VerifyToken = async (t) => (t === 'member' ? { userId: 'u1', name: 'Ace' } : t === 'outsider' ? { refused: REASON.noPilot } : t === 'dev' ? devVerifier(t) : null);

  beforeAll(async () => {
    room = new RoomService({ sources: [], verify, log: () => undefined });
    server = http.createServer();
    room.attach(server);
    room.start();
    await new Promise<void>((r) => server.listen(0, r));
    url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/catcc/ws`;
  });
  afterAll(() => {
    room.stop();
    server.close();
  });

  const attempt = (token: string) =>
    new Promise<{ code?: number; reason?: string; hello?: ServerMsg }>((resolve) => {
      const ws = new WebSocket(url);
      ws.on('open', () => ws.send(JSON.stringify({ t: 'auth', token })));
      ws.on('message', (d) => {
        const m = JSON.parse(String(d)) as ServerMsg;
        if (m.t === 'hello') {
          ws.close();
          resolve({ hello: m });
        }
      });
      ws.on('close', (code, reason) => resolve({ code, reason: String(reason) }));
    });

  it('a member gets hello', async () => {
    const r = await attempt('member');
    expect(r.hello).toMatchObject({ t: 'hello', user: { userId: 'u1' } });
  });

  it('a non-member is closed with 4403 and the reason, and gets no data', async () => {
    const r = await attempt('outsider');
    expect(r).toEqual({ code: CLOSE_FORBIDDEN, reason: REASON.noPilot });
  });

  it('an invalid token is still 4003', async () => {
    const r = await attempt('nope');
    expect(r.code).toBe(CLOSE_AUTH_FAILED);
  });
});
