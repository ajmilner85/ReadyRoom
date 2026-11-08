/** PriFly Air Boss, ported from catcc-handoff/mockup/Boss.dc.html, with live deck positions. */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../../utils/supabaseClient';
import { fuelK, type Picture } from '../scopeModel.ts';
import { CATS, DECK, FOLDED, SPREAD, inLandingArea, jetShape, onCat, onDeck, type DeckJet } from './deck.ts';
import type { DeckEvent } from './useDeckLog.ts';

type Mode = 'live' | 'sand';
type V = [number, number];

export function deckStatus(pic: Picture) {
  const f = pic.focus;
  if (!f) return null;
  const jets = onDeck(f, pic.air);
  const foul = jets.filter((j) => inLandingArea(j.x, j.y));
  const cats = Object.fromEntries(['1', '2', '3', '4'].map((k) => [k, onCat(jets, k)]));
  return { jets, foul, cats };
}

export const BossChips: React.FC<{ pic: Picture }> = ({ pic }) => {
  const st = deckStatus(pic);
  if (!st) return null;
  const foul = st.foul.length > 0;
  return (
    <>
      <span className="chip" style={foul ? { background: 'rgba(224,82,78,.16)', borderColor: '#E0524E', color: '#FF9C98', fontWeight: 600 } : { color: '#7FD397' }}>
        {foul ? `LA FOUL · ${st.foul.map((j) => j.t.bd ?? j.t.id).join(' ')}` : 'LA CLEAR'}
      </span>
      {['1', '2'].map((k) => (
        <span key={k} className="chip">
          CAT {k} {st.cats[k] ? <span style={{ color: '#E7B04F' }}>{st.cats[k]!.t.bd ?? ''} SPOTTED</span> : <span style={{ color: '#7FD397' }}>OPEN</span>}
        </span>
      ))}
      <span className="chip" style={{ color: '#93A1B0' }}>
        CAT 3/4 · {st.cats['3'] || st.cats['4'] ? 'SPOTTED' : foul ? 'IN LA' : 'OPEN'}
      </span>
    </>
  );
};

interface AirPlanRow {
  n: string;
  l: string;
  name: string;
  s: 'done' | 'now' | 'next' | 'later';
}

function useAirPlan(): { rows: AirPlanRow[]; day: string } {
  const [rows, setRows] = useState<AirPlanRow[]>([]);
  useEffect(() => {
    let off = false;
    (async () => {
      const now = new Date();
      const start = new Date(now.getTime() - 12 * 3_600_000).toISOString();
      const end = new Date(now.getTime() + 12 * 3_600_000).toISOString();
      const { data } = await supabase.from('events').select('id, name, start_datetime').gte('start_datetime', start).lte('start_datetime', end).order('start_datetime');
      if (off || !data) return;
      let nextSet = false;
      setRows(
        data.map((e, i) => {
          const t = new Date(e.start_datetime);
          const past = t.getTime() < now.getTime() - 2 * 3_600_000;
          const nowish = !past && t.getTime() <= now.getTime();
          let s: AirPlanRow['s'] = past ? 'done' : nowish ? 'now' : 'later';
          if (s === 'later' && !nextSet) {
            s = 'next';
            nextSet = true;
          }
          return { n: String(i + 1), l: t.toTimeString().slice(0, 5), name: e.name, s };
        }),
      );
    })().catch(() => undefined);
    return () => {
      off = true;
    };
  }, []);
  return { rows, day: new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) };
}

export const BossView: React.FC<{ pic: Picture; mode: Mode; log: DeckEvent[]; landedAt: Map<string, number> }> = ({ pic, mode, log, landedAt }) => {
  const st = deckStatus(pic);
  const plan = useAirPlan();
  const [chits, setChits] = useState<Record<string, { x: number; y: number; a: number }>>({});
  const [paths, setPaths] = useState<V[][]>([]);
  const [curPath, setCurPath] = useState<V[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null);

  // seed the sand table from live positions when entering it
  useEffect(() => {
    if (mode !== 'sand' || !st) return;
    setChits(Object.fromEntries(st.jets.map((j) => [j.t.id, { x: j.x, y: j.y, a: j.a }])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const toDeck = (e: { clientX: number; clientY: number }): V | null => {
    const svg = svgRef.current;
    const m = svg?.getScreenCTM();
    if (!svg || !m) return null;
    const q = svg.createSVGPoint();
    q.x = e.clientX;
    q.y = e.clientY;
    const v = q.matrixTransform(m.inverse());
    return [v.x, -v.y];
  };

  const jets: (DeckJet & { cls: 'sel' | 'green' | 'white' | 'gray' })[] = useMemo(() => {
    if (!st) return [];
    const now = Date.now();
    return st.jets.map((j) => {
      const c = mode === 'sand' ? chits[j.t.id] : undefined;
      const jj = c ? { ...j, x: c.x, y: c.y, a: c.a } : j;
      const atCat = Object.keys(CATS).some((k) => onCat([jj], k));
      const cls: 'sel' | 'green' | 'white' | 'gray' =
        j.t.id === selected || (mode === 'live' && (jj.moving || inLandingArea(jj.x, jj.y))) ? 'sel' : atCat ? 'green' : (landedAt.get(j.t.id) ?? 0) > now - 15 * 60_000 ? 'white' : 'gray';
      return { ...jj, cls };
    });
  }, [st, mode, chits, selected, landedAt]);

  const shape = (j: DeckJet & { cls: string }) => jetShape(j.cls === 'gray' || j.cls === 'white' ? FOLDED : SPREAD, j.x, j.y, j.a);
  const byCls = (c: string) => jets.filter((j) => j.cls === c).map(shape).join('');
  const aboard = st?.jets.length ?? 0;
  const owned = pic.air.filter((t) => t.owner === pic.focus?.track.hull).length;
  const tanker = pic.air.find((t) => t.owner === pic.focus?.track.hull && /tanker|S-3B/i.test(t.ty) && t.air !== false);
  const guard = pic.air.find((t) => t.owner === pic.focus?.track.hull && t.k === 'rotary');
  const colors: Record<string, string> = { sel: '#F15822', green: '#5FC37A', white: '#C9D3DD', gray: '#6E7A88' };
  const labelCol: Record<string, string> = { sel: '#FFB08F', green: '#7FD397', white: '#C9D3DD', gray: '#93A1B0' };

  return (
    <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: 14, padding: 14, overflow: 'auto', minHeight: 0 }}>
      <section aria-label="Flight deck" style={{ flex: '999 1 720px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span className="lbl">Flight deck · {mode === 'live' ? 'live from DCS' : 'sand table (manual chits)'}</span>
          <div style={{ flex: 1 }} />
          <button
            onClick={() => {
              if (drawing && curPath.length > 1) setPaths((ps) => [...ps, curPath]);
              setCurPath([]);
              setDrawing((d) => !d);
            }} style={{ height: 34, padding: '0 12px', background: drawing ? 'rgba(241,88,34,.16)' : 'transparent', border: `1px solid ${drawing ? '#F15822' : '#374250'}`, borderRadius: 5, color: drawing ? '#FFB08F' : '#E6EDF3', fontFamily: "'Saira', sans-serif", fontSize: 12.5, cursor: 'pointer' }}>
            {drawing ? 'Finish path' : 'Draw path'}
          </button>
          <button disabled title="Needs unit control (Phase 2)" style={{ height: 34, padding: '0 12px', background: 'transparent', border: '1px solid #374250', borderRadius: 5, color: '#93A1B0', fontFamily: "'Saira', sans-serif", fontSize: 12.5 }}>Set destination</button>
          <button disabled title="Needs unit control (Phase 2)" style={{ height: 34, padding: '0 12px', background: 'transparent', border: '1px solid #374250', borderRadius: 5, color: '#93A1B0', fontFamily: "'Saira', sans-serif", fontSize: 12.5 }}>Hold</button>
          <button onClick={() => { setPaths([]); setCurPath([]); }} style={{ height: 34, padding: '0 12px', background: 'transparent', border: '1px solid #374250', borderRadius: 5, color: '#E6EDF3', fontFamily: "'Saira', sans-serif", fontSize: 12.5, cursor: 'pointer' }}>Clear paths</button>
        </div>

        <div style={{ flex: 1, background: '#0B0E12', border: '1px solid #262F3A', borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 420 }}>
          <svg
            ref={svgRef}
            className="deck"
            viewBox="-84 -50 354 102"
            style={{ width: '100%', height: 'auto', maxHeight: 600, cursor: drawing ? 'crosshair' : 'default' }}
            role="img"
            aria-label="Nimitz-class flight deck to scale, bow to the right, with aircraft positions"
            onClick={(e) => {
              if (!drawing) return;
              const q = toDeck(e);
              if (!q) return;
              setCurPath((c) => [...c, q]);
            }}
            onMouseMove={(e) => {
              const d = dragRef.current;
              if (!d) return;
              const q = toDeck(e);
              if (q) setChits((c) => ({ ...c, [d.id]: { ...c[d.id], x: q[0] - d.dx, y: q[1] - d.dy } }));
            }}
            onMouseUp={() => (dragRef.current = null)}
            onMouseLeave={() => (dragRef.current = null)}
          >
            <polygon points={DECK.outline} fill="#2A3038" stroke="#6E7A88" strokeWidth="0.6" strokeLinejoin="round" />
            <path d={DECK.elev} fill="#222830" stroke="#7C858E" strokeWidth="0.4" />
            <polygon points={DECK.rd} fill="#D4DAE0" />
            <path d={DECK.edgeIn} stroke="#D4DAE0" strokeWidth="1.1" fill="none" />
            <path d={DECK.edgeOut} stroke="#D4DAE0" strokeWidth="0.5" fill="none" />
            <path d={DECK.bars} stroke="#D4DAE0" strokeWidth="3" fill="none" />
            <path d={DECK.cl} stroke="#D4DAE0" strokeWidth="0.9" fill="none" />
            <path d={DECK.cl} stroke="#D9A93A" strokeWidth="0.9" fill="none" strokeDasharray="13 13" />
            <path d={DECK.wires} stroke="#9AA4AE" strokeWidth="0.6" fill="none" />
            <path d={DECK.rails} stroke="#8A949E" strokeWidth="0.35" fill="none" />
            <path d={DECK.shuttles} stroke="#D9A93A" strokeWidth="1.8" fill="none" />
            {['1', '2', '3', '4'].map((k) => (
              <path key={k} d={DECK.jbd(k)} fill={st?.cats[k] ? 'rgba(222,154,31,.35)' : '#3C434C'} stroke={st?.cats[k] ? '#E7B04F' : '#D9A93A'} strokeWidth={st?.cats[k] ? 0.6 : 0.4} />
            ))}
            <rect x={DECK.isl.x} y={DECK.isl.y} width={DECK.isl.w} height={DECK.isl.h} rx="0.8" fill="#5E6A78" stroke="#8A929A" strokeWidth="0.4" />
            <text x={DECK.isl.cx} y={DECK.isl.cy} textAnchor="middle" className="sm" style={{ fill: '#E6EDF3' }}>ISLAND</text>
            <g className="sm">
              <text x={DECK.c1l.x} y={DECK.c1l.y}>CAT 1</text>
              <text x={DECK.c2l.x} y={DECK.c2l.y}>CAT 2</text>
              <text x={DECK.c3l.x} y={DECK.c3l.y}>CAT 3</text>
              <text x={DECK.c4l.x} y={DECK.c4l.y}>CAT 4</text>
              <text x="-12" y="46">EL 3</text>
              <text x="62" y="44">EL 2</text>
              <text x="108" y="44">EL 1</text>
              <text x="-18" y="-41.5">EL 4</text>
              <text x="-68" y="-2" transform="rotate(-90 -68 -2)">ROUND-DOWN</text>
              <text x="200" y="-1">BOW</text>
              <text x="82" y="6">STREET</text>
              <text x="-30" y="-14" transform="rotate(-9 -30 -14)">LANDING AREA</text>
            </g>
            {[...paths, curPath].filter((p) => p.length > 1).map((p, i) => (
              <path key={i} d={'M' + p.map((q) => `${q[0].toFixed(1)} ${(-q[1]).toFixed(1)}`).join(' L')} fill="none" stroke="#F15822" strokeWidth="1.4" strokeDasharray="4 3" />
            ))}
            <path d={byCls('gray')} fill={colors.gray} />
            <path d={byCls('white')} fill={colors.white} />
            <path d={byCls('green')} fill={colors.green} />
            <path d={byCls('sel')} fill={colors.sel} />
            {mode === 'live' && (
              <g fill="none" strokeWidth="0.6">
                {jets.filter((j) => j.cls === 'sel' || j.cls === 'green').map((j) => (
                  <circle key={j.t.id} cx={j.x} cy={-j.y} r="10" stroke={colors[j.cls]} className="live" />
                ))}
              </g>
            )}
            <g className="id">
              {jets.map((j) => (
                <text
                  key={j.t.id}
                  x={j.x - 7}
                  y={-j.y - 10}
                  style={{ fill: labelCol[j.cls], cursor: mode === 'sand' ? 'grab' : 'pointer' }}
                  onMouseDown={(e) => {
                    setSelected(j.t.id);
                    if (mode !== 'sand') return;
                    const q = toDeck(e);
                    if (q) dragRef.current = { id: j.t.id, dx: q[0] - j.x, dy: q[1] - j.y };
                  }}
                >
                  {j.t.bd ?? j.t.cs ?? ''}
                </text>
              ))}
            </g>
            <g>
              <line x1="200" y1="44" x2="250" y2="44" stroke="#93A1B0" strokeWidth="0.5" />
              <line x1="200" y1="42.5" x2="200" y2="45.5" stroke="#93A1B0" strokeWidth="0.5" />
              <line x1="250" y1="42.5" x2="250" y2="45.5" stroke="#93A1B0" strokeWidth="0.5" />
              <text x="225" y="49" textAnchor="middle" className="sm">50 M</text>
              <text x="262" y="-44" textAnchor="end" className="sm">BOW →  PORT ↑</text>
            </g>
          </svg>
          {mode === 'sand' && (
            <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 12px', border: '1px dashed #374250', borderRadius: 8, background: '#12161C' }}>
              <span className="lbl">Chit tray</span>
              <span className="mono" style={{ fontSize: 12, color: '#93A1B0' }}>Drag a board number to move its chit. Positions here are planning only.</span>
            </div>
          )}
        </div>
        <div className="mono" style={{ fontSize: 11.5, color: '#93A1B0', display: 'flex', gap: 18, flexWrap: 'wrap' }}>
          <span><span style={{ color: '#F15822' }}>■</span> selected / taxiing</span>
          <span><span style={{ color: '#5FC37A' }}>■</span> launch queue</span>
          <span><span style={{ color: '#C9D3DD' }}>■</span> recovered</span>
          <span><span style={{ color: '#6E7A88' }}>■</span> parked / down</span>
        </div>
      </section>

      <aside aria-label="Events" style={{ flex: '1 1 380px', maxWidth: 440, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <section style={{ border: '1px solid #262F3A', borderRadius: 8, background: '#151A21', padding: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span className="lbl">Air plan · {plan.day}</span>
            <a href="/mission-prep" target="_blank" rel="noopener" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, textDecoration: 'none' }}>Open in Mission Prep ↗</a>
          </div>
          <div className="ev" style={{ color: '#93A1B0', fontSize: 10.5, letterSpacing: '.08em' }}>
            <span>EVENT</span><span>LAUNCH</span><span>RECOVER</span><span>FLIGHTS</span>
          </div>
          {plan.rows.map((e) => (
            <div key={e.n} className="ev" style={{ background: e.s === 'now' ? 'rgba(241,88,34,.14)' : e.s === 'next' ? '#1A212A' : 'transparent', border: `1px solid ${e.s === 'now' ? '#F15822' : '#262F3A'}`, color: e.s === 'done' ? '#93A1B0' : '#E6EDF3', marginTop: 4 }}>
              <span style={{ fontWeight: 600 }}>{e.n}</span><span>{e.l}</span><span>—</span><span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.name}</span>
            </div>
          ))}
          {!plan.rows.length && <div className="mono" style={{ fontSize: 12, color: '#6B7683', marginTop: 6 }}>No ReadyRoom events within 12 hours</div>}
        </section>

        <section style={{ border: '1px solid #262F3A', borderRadius: 8, background: '#151A21', padding: 12 }}>
          <div className="lbl" style={{ marginBottom: 8 }}>Current cycle</div>
          <div style={{ display: 'flex', gap: 14, alignItems: 'baseline', marginBottom: 8 }}>
            <div style={{ fontSize: 26, fontWeight: 700 }}>{aboard} / {owned}</div>
            <div className="mono" style={{ fontSize: 12, color: '#93A1B0' }}>aboard</div>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: '#222C37', overflow: 'hidden', marginBottom: 10 }}>
            <div style={{ width: `${owned ? Math.round((aboard / owned) * 100) : 0}%`, height: '100%', background: '#F15822' }} />
          </div>
          <div className="mono" style={{ fontSize: 12.5, display: 'grid', gridTemplateColumns: '1fr auto', rowGap: 5 }}>
            <span style={{ color: '#93A1B0' }}>Landing area</span><span style={{ color: st?.foul.length ? '#FF9C98' : '#7FD397' }}>{st?.foul.length ? 'FOUL' : 'CLEAR'}</span>
            <span style={{ color: '#93A1B0' }}>Recovery tanker</span><span>{tanker ? `${tanker.bd ?? tanker.cs ?? tanker.id}${tanker.lb !== undefined ? ` · ${fuelK(tanker.lb)}` : ''}` : '—'}</span>
            <span style={{ color: '#93A1B0' }}>Plane guard</span><span>{guard ? guard.bd ?? guard.cs ?? guard.id : '—'}</span>
          </div>
        </section>

        <section style={{ border: '1px solid #262F3A', borderRadius: 8, background: '#151A21', padding: 12 }}>
          <div className="lbl" style={{ marginBottom: 8 }}>Deck log</div>
          <div className="mono" style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4, color: '#C9D3DD' }}>
            {log.map((e, i) => (
              <span key={i}>
                <span style={{ color: '#93A1B0' }}>{e.t}</span>  {e.text}
              </span>
            ))}
            {!log.length && <span style={{ color: '#6B7683' }}>No traps or launches seen yet</span>}
          </div>
        </section>
      </aside>
    </div>
  );
};
