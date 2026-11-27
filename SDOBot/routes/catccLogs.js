/**
 * CATCC LIVE LOGS
 *
 * PURPOSE: take the DCS and CATCC logs that CATCC's DCS hook sends while DCS runs (one chunk of one file per request:
 * catcc-dcs/Scripts/CATCC/catcc_logs.lua) and keep them in Supabase (public.catcc_log_chunks), so they can be read on
 * the development PC (scripts/catcc/catcc-logs.mjs).
 *
 * ENDPOINTS:
 * - POST /api/catcc/logs - one chunk (text/plain; headers in lib/catccLogIntake.js). 200 when stored; 401 bad token;
 *   503 when CATCC_LOG_TOKEN is not set (the intake is off).
 *
 * Chunks older than 14 days are deleted, at most once an hour, after a chunk is stored.
 *
 * USAGE:
 * Registered in main server: app.use('/api', require('./routes/catccLogs'));
 */

const express = require('express');
const { supabase } = require('../supabaseClient');
const { readChunk, pruneDue, pruneCutoff, MAX_BODY } = require('../lib/catccLogIntake');

const router = express.Router();
const pruneState = {};

router.post('/catcc/logs', express.text({ type: 'text/plain', limit: MAX_BODY }), async (req, res) => {
  const r = readChunk(req.headers, req.body, process.env.CATCC_LOG_TOKEN);
  if (r.status) return res.status(r.status).json({ error: r.error });
  const { error } = await supabase.from('catcc_log_chunks').upsert(r.row, { onConflict: 'session_id,file,start_offset' });
  if (error) {
    console.error('[CATCC logs] not stored:', error.message);
    return res.status(500).json({ error: 'not stored' });
  }
  res.status(200).json({ ok: true });
  if (pruneDue(Date.now(), pruneState)) {
    const { error: pruneError } = await supabase.from('catcc_log_chunks').delete().lt('received_at', pruneCutoff(Date.now()));
    if (pruneError) console.error('[CATCC logs] old chunks not deleted:', pruneError.message);
  }
});

module.exports = router;
