/**
 * CATCC live logs: what POST /api/catcc/logs takes (routes/catccLogs.js). Each request is one chunk of one log file
 * of one DCS session, sent by the DCS hook catcc-dcs/Scripts/CATCC/catcc_logs.lua:
 *
 *   Authorization: Bearer <CATCC_LOG_TOKEN>
 *   X-CATCC-Session: 20261126-213005-a1b2c3   (made when DCS starts: UTC date, time, random)
 *   X-CATCC-PC: <the PC's name>
 *   X-CATCC-File: dcs.log | catcc-crewtest.log | ...
 *   X-CATCC-Offset: <the chunk's byte offset in that file>
 *   body: the chunk (text/plain)
 *
 * Kept in public.catcc_log_chunks, one row per chunk, keyed by session, file and offset (a chunk sent again replaces
 * itself). No dependencies beyond node: the tests load it without SDOBot's node_modules.
 */
const crypto = require('crypto');

const SESSION_RE = /^\d{8}-\d{6}-[0-9a-f]{6,16}$/;
const FILE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const PC_RE = /^[A-Za-z0-9._-]{1,64}$/;
/** what the route's body parser takes */
const MAX_BODY = 256 * 1024;
/** chunks older than this are deleted */
const KEEP_DAYS = 14;
/** how often that is done at most */
const PRUNE_EVERY_MS = 60 * 60 * 1000;

function sameToken(expected, given) {
  const a = crypto.createHash('sha256').update(String(expected)).digest();
  const b = crypto.createHash('sha256').update(String(given)).digest();
  return crypto.timingSafeEqual(a, b);
}

/**
 * The row to store, or the answer to give: { row } | { status, error }.
 * headers: node's (lower-case names); body: the text, or anything else when it was not text/plain.
 */
function readChunk(headers, body, token) {
  if (!token) return { status: 503, error: 'log intake is off (CATCC_LOG_TOKEN is not set)' };
  const auth = /^Bearer (.+)$/.exec(String(headers.authorization || ''));
  if (!auth || !sameToken(token, auth[1])) return { status: 401, error: 'bad token' };
  const session = String(headers['x-catcc-session'] || '');
  const pc = String(headers['x-catcc-pc'] || '');
  const file = String(headers['x-catcc-file'] || '');
  const offset = String(headers['x-catcc-offset'] || '');
  if (!SESSION_RE.test(session)) return { status: 400, error: 'bad X-CATCC-Session' };
  if (!PC_RE.test(pc)) return { status: 400, error: 'bad X-CATCC-PC' };
  if (!FILE_RE.test(file)) return { status: 400, error: 'bad X-CATCC-File' };
  if (!/^\d{1,15}$/.test(offset)) return { status: 400, error: 'bad X-CATCC-Offset' };
  if (typeof body !== 'string') return { status: 415, error: 'send the chunk as text/plain' };
  if (body.length === 0) return { status: 400, error: 'empty chunk' };
  // (Postgres text takes no NUL)
  const text = body.replace(/\u0000/g, '');
  return { row: { session_id: session, pc, file, start_offset: Number(offset), body: text } };
}

/** true when it is time to delete old chunks (state: an object kept by the caller) */
function pruneDue(now, state) {
  if (now - (state.at || 0) < PRUNE_EVERY_MS) return false;
  state.at = now;
  return true;
}

function pruneCutoff(now) {
  return new Date(now - KEEP_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

module.exports = { readChunk, pruneDue, pruneCutoff, MAX_BODY, KEEP_DAYS };
