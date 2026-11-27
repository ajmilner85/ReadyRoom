// CATCC live logs, read back from Supabase (public.catcc_log_chunks: what DCS sessions sent to SDOBot through
// catcc-dcs/Scripts/CATCC/catcc_logs.lua). Uses SUPABASE_URL and SUPABASE_SERVICE_KEY from .env.local (or .env).
//
//   node scripts/catcc/catcc-logs.mjs                          the last sessions: PC, first and last chunk, files
//   node scripts/catcc/catcc-logs.mjs get <session|latest>     one session's files, put together, into
//        [--pc <name>] [--out <folder>]                        documentation/catcc-logs/<session> <pc>/ (gitignored)
//
// "latest" is the session with the newest chunk (of that PC with --pc).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function env() {
  const vars = {};
  for (const name of ['.env.local', '.env']) {
    const file = path.join(root, name);
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (m && !(m[1] in vars)) vars[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  }
  const url = process.env.SUPABASE_URL || vars.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || vars.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY are needed (.env.local)');
  return { url, key };
}

async function rows(query) {
  const { url, key } = env();
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const res = await fetch(`${url}/rest/v1/catcc_log_chunks?${query}&limit=1000&offset=${offset}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!res.ok) {
      const text = await res.text();
      if (text.includes('42P01')) throw new Error('public.catcc_log_chunks is not there yet: apply supabase/migrations/catcc/20261126_catcc_log_chunks.sql');
      throw new Error(`HTTP ${res.status}: ${text}`);
    }
    const page = await res.json();
    out.push(...page);
    if (page.length < 1000) return out;
  }
}

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
}

async function sessions(pc) {
  const meta = await rows(`select=session_id,pc,file,start_offset,received_at&order=received_at.desc${pc ? `&pc=eq.${encodeURIComponent(pc)}` : ''}`);
  const by = new Map();
  for (const r of meta) {
    let s = by.get(r.session_id);
    if (!s) by.set(r.session_id, (s = { session: r.session_id, pc: r.pc, first: r.received_at, last: r.received_at, files: new Map() }));
    if (r.received_at < s.first) s.first = r.received_at;
    const f = s.files.get(r.file) || { chunks: 0, upTo: 0 };
    f.chunks += 1;
    f.upTo = Math.max(f.upTo, r.start_offset);
    s.files.set(r.file, f);
  }
  return [...by.values()];
}

async function main() {
  const cmd = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'list';
  const pc = arg('--pc');
  if (cmd === 'list') {
    const list = await sessions(pc);
    if (!list.length) return console.log('No CATCC log chunks stored.');
    for (const s of list.slice(0, 20)) {
      const files = [...s.files].map(([n, f]) => `${n} (${f.chunks} chunk${f.chunks === 1 ? '' : 's'}, to ${Math.round(f.upTo / 1024)} KB+)`).join(', ');
      console.log(`${s.session}  ${s.pc}  ${s.first.slice(0, 19)} .. ${s.last.slice(0, 19)} UTC  ${files}`);
    }
    return;
  }
  if (cmd !== 'get') throw new Error(`unknown command ${cmd} (list | get <session|latest>)`);
  let session = process.argv[3];
  if (!session || session === 'latest') {
    const list = await sessions(pc);
    if (!list.length) throw new Error('no CATCC log chunks stored');
    session = list[0].session;
  }
  const all = await rows(`select=pc,file,start_offset,body&session_id=eq.${encodeURIComponent(session)}&order=file.asc,start_offset.asc`);
  if (!all.length) throw new Error(`no chunks of session ${session}`);
  const dir = path.join(arg('--out') || path.join(root, 'documentation', 'catcc-logs'), `${session} ${all[0].pc}`);
  fs.mkdirSync(dir, { recursive: true });
  const files = new Map();
  for (const r of all) files.set(r.file, (files.get(r.file) || '') + r.body);
  for (const [name, text] of files) {
    fs.writeFileSync(path.join(dir, name), text, 'utf8');
    console.log(`${path.join(dir, name)}  ${Math.round(Buffer.byteLength(text) / 1024)} KB`);
  }
}

main().catch((e) => {
  console.error(e.message || e);
  // (not process.exit: on Windows that can trip over fetch's closing handles)
  process.exitCode = 1;
});
