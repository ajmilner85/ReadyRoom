/** Icons copied verbatim from the CATCC mockup (catcc-handoff/mockup/*.dc.html). */
import React from 'react';

type P = { size?: number };
const S = (size: number, sw: number, children: React.ReactNode, extra: React.SVGProps<SVGSVGElement> = {}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...extra}>
    {children}
  </svg>
);

export const IcCatcc = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0E1116" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="4.5" />
    <path d="M12 12 L19 6" />
  </svg>
);
export const IcPrifly = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0E1116" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
    <path d="M4 18h16M7 18l3-10h4l3 10" />
  </svg>
);
export const IcBook = ({ size = 16 }: P) => S(size, 1.8, <><path d="M4 4h6a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4z" /><path d="M20 4h-6a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h6z" /></>);
export const IcSliders = ({ size = 17 }: P) => S(size, 1.8, <><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></>);
export const IcDisplays = ({ size = 16 }: P) => S(size, 1.8, <><rect x="2" y="4" width="13" height="10" rx="1.5" /><rect x="16" y="9" width="6" height="11" rx="1.2" /><path d="M6 18h5" /></>);
export const IcRadio = ({ size = 20 }: P) =>
  S(size, 1.8, <><circle cx="12" cy="10" r="1.6" fill="currentColor" stroke="none" /><path d="M12 12v9" /><path d="M8.5 6.5a5 5 0 0 0 0 7M15.5 6.5a5 5 0 0 1 0 7" /><path d="M5.6 3.6a9 9 0 0 0 0 12.8M18.4 3.6a9 9 0 0 1 0 12.8" /></>);
export const IcSelect = ({ size = 20 }: P) => S(size, 1.8, <path d="M5 3l13 8-6 1.5L9 19z" />);
export const IcBra = ({ size = 20 }: P) => S(size, 1.8, <><circle cx="5" cy="18" r="2" /><circle cx="19" cy="6" r="2" /><path d="M6.6 16.6L17.4 7.4M9 18.5l1.2-1.2M12 16l1.2-1.2M15 13.5l1.2-1.2" /></>);
export const IcMarshal = ({ size = 20 }: P) => S(size, 1.8, <><path d="M4 6h10M4 11h10M4 16h10" /><path d="M18 4v16M15.5 17.5L18 20l2.5-2.5" /></>);
export const IcCpa = ({ size = 20 }: P) => S(size, 1.8, <><path d="M3 19L12 12M21 19L12 12" /><circle cx="12" cy="12" r="3" /><path d="M12 3v4" /></>);
export const IcVec = ({ size = 20 }: P) => S(size, 1.8, <><circle cx="6" cy="18" r="2.2" /><path d="M7.6 16.4L19 5M19 5h-5M19 5v5" /></>);
/** intercept / rejoin: interceptor turning onto a lead-collision line to a contact's track, crossed at the merge */
export const IcIntercept = ({ size = 20 }: P) => S(size, 1.8, <><circle cx="4" cy="19" r="1.9" /><path d="M5.5 17.6L15 8" /><path d="M9 3l7 2.4-2.4 7" /><path d="M13.4 7.6l3 3M16.4 7.6l-3 3" /></>);
/** plot waypoint: a route through two marked points, with a plus */
export const IcWp = ({ size = 20 }: P) => S(size, 1.8, <><circle cx="6" cy="17" r="2.2" /><circle cx="15" cy="8" r="2.2" /><path d="M7.6 15.4L13.4 9.6" strokeDasharray="2 2" /><path d="M19 15v6M16 18h6" /></>);
/** PriFly deck tools (not in the mockup; drawn in its style): the taxi network (a road with feeders to two spots),
 *  draw a path (a pencil), clear the paths (an eraser), cancel all taxi (every route under one no-entry sign),
 *  cancel aircraft by aircraft (a pointer with a small no-entry sign) */
export const IcTaxiNet = ({ size = 20 }: P) => S(size, 1.8, <><path d="M2 17h20M7 17v-6.5M17 17v-6.5" /><circle cx="7" cy="7.5" r="3" /><circle cx="17" cy="7.5" r="3" /></>);
export const IcDrawPath = ({ size = 20 }: P) => S(size, 1.8, <><path d="M15.5 4.5l4 4L9 19l-5 1 1-5z" /><path d="M13 7l4 4" /></>);
export const IcClearPaths = ({ size = 20 }: P) => S(size, 1.8, <><path d="M9 20h11" /><path d="M4.5 15.5l9.5-9.5a1.5 1.5 0 0 1 2.1 0l3.9 3.9a1.5 1.5 0 0 1 0 2.1L12.5 19.5H8.5z" /><path d="M9.5 10.5l6 6" /></>);
export const IcCancelTaxi = ({ size = 20 }: P) => S(size, 1.8, <><path d="M2 7h5M2 12h5M2 17h5" /><circle cx="15.5" cy="12" r="6.5" /><path d="M10.9 16.6l9.2-9.2" /></>);
export const IcCancelTaxiPick = ({ size = 20 }: P) => S(size, 1.8, <><path d="M4 3l6.5 15.5 2.2-6.3 6.3-2.2z" /><circle cx="17.5" cy="17.5" r="4" /><path d="M14.7 20.3l5.6-5.6" /></>);
export const IcLayers = ({ size = 20 }: P) => S(size, 1.8, <><path d="M12 3l9 5-9 5-9-5z" /><path d="M3 13l9 5 9-5" /></>);
export const IcBulls = ({ size = 20 }: P) => S(size, 1.8, <><circle cx="12" cy="12" r="2.5" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="9.5" /><path d="M12 1v4M12 19v4M1 12h4M19 12h4" /></>);
export const IcComms = ({ size = 20 }: P) => S(size, 1.8, <><path d="M4 5h16v10H9l-5 4z" /><path d="M8 9h8M8 12h5" /></>);
/** follow (not in the mockup; drawn in its style): a contact's hit square held in the corners of a tracking gate */
export const IcFollow = ({ size = 20 }: P) => S(size, 1.8, <><rect x="9.5" y="9.5" width="5" height="5" /><path d="M3 8V3h5M16 3h5v5M21 16v5h-5M8 21H3v-5" /></>);
/** data tags by MODEX / by callsign (not in the mockup; drawn in its style): a hit square, its leader, and a number sign or a letter A in the tag */
// data-tag identifier: a tag chip reading "123" (MODEX) or "ABC" (callsign)
const tagChip = (size: number, t: string) =>
  S(size, 1.6, <>
    <rect x="1.5" y="5" width="21" height="14" rx="2.5" />
    <text x="12" y="12.4" textAnchor="middle" dominantBaseline="central" fill="currentColor" stroke="none" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 8.6, fontWeight: 700, letterSpacing: '-.02em' }}>{t}</text>
  </>);
export const IcTagModex = ({ size = 20 }: P) => tagChip(size, '123');
export const IcTagCallsign = ({ size = 20 }: P) => tagChip(size, 'ABC');
/** both: a taller chip, "ABC" over "123" */
export const IcTagBoth = ({ size = 20 }: P) =>
  S(size, 1.6, <>
    <rect x="1.5" y="2" width="21" height="20" rx="2.5" />
    {(['ABC', '123'] as const).map((t, i) => (
      <text key={t} x="12" y={i ? 16.6 : 7.6} textAnchor="middle" dominantBaseline="central" fill="currentColor" stroke="none" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 8.2, fontWeight: 700, letterSpacing: '-.02em' }}>{t}</text>
    ))}
  </>);
/** hand off (not in the mockup; drawn in its style): an open hand, palm out */
export const IcHand = ({ size = 14 }: P) => S(size, 1.8, <><path d="M8 12.5V6a1.5 1.5 0 0 1 3 0v5" /><path d="M11 10.5V4.5a1.5 1.5 0 0 1 3 0v6" /><path d="M14 10.5V6a1.5 1.5 0 0 1 3 0v6" /><path d="M17 11V9a1.5 1.5 0 0 1 3 0v5.5A6.5 6.5 0 0 1 13.5 21h-1a6 6 0 0 1-4.8-2.4l-3.3-4.4a1.5 1.5 0 0 1 2.4-1.8L8 14" /></>);
/** AI aircraft (not in the mockup; drawn in its style): a robot's head with an antenna */
export const IcRobot = ({ size = 13 }: P) => S(size, 1.8, <><rect x="4" y="8" width="16" height="12" rx="2.5" /><path d="M12 8V4.5" /><circle cx="12" cy="3.5" r="1" /><circle cx="9" cy="13.5" r="1.2" fill="currentColor" stroke="none" /><circle cx="15" cy="13.5" r="1.2" fill="currentColor" stroke="none" /><path d="M9.5 17h5M2 13v3M22 13v3" /></>);
/** strip filter (not in the mockup; drawn in its style): a funnel */
export const IcFilter = ({ size = 14 }: P) => S(size, 1.8, <path d="M3.5 5h17l-6.5 7.5V19l-4 2v-8.5z" />);
/** replay playback (not in the mockup; drawn in its style): rewind, play, pause, fast forward, back to the start, skip ahead */
export const IcRewind = ({ size = 16 }: P) => S(size, 1.8, <><path d="M11 6l-7 6 7 6z" /><path d="M20 6l-7 6 7 6z" /></>);
export const IcPlay = ({ size = 16 }: P) => S(size, 1.8, <path d="M7 5l12 7-12 7z" />);
export const IcPause = ({ size = 16 }: P) => S(size, 1.8, <><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></>);
export const IcFastForward = ({ size = 16 }: P) => S(size, 1.8, <><path d="M4 6l7 6-7 6z" /><path d="M13 6l7 6-7 6z" /></>);
export const IcRestart = ({ size = 16 }: P) => S(size, 1.8, <><path d="M6 5v14" /><path d="M19 5.5L9 12l10 6.5z" /></>);
export const IcSkipAhead = ({ size = 16 }: P) => S(size, 1.8, <><path d="M20 12a8 8 0 1 1-2.3-5.6" /><path d="M20 4v4h-4" /><path d="M10.5 9l3 3-3 3" /></>);
export const IcZoomOut =({ size = 20 }: P) => S(size, 1.8, <><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5L20 20M7.5 10.5h6" /></>);
export const IcZoomIn = ({ size = 20 }: P) => S(size, 1.8, <><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5L20 20M7.5 10.5h6M10.5 7.5v6" /></>);
export const IcEdit = () => S(12, 2, <><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></>);
export const IcX = ({ size = 10, sw = 3 }: { size?: number; sw?: number }) => S(size, sw, <path d="M6 6l12 12M18 6L6 18" />);
export const IcChevron = ({ rot = 0 }: { rot?: number }) => S(12, 2.2, <path d="M6 9l6 6 6-6" />, { style: { transform: `rotate(${rot}deg)` } });
export const IcGoTo = () => S(15, 1.8, <><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2" fill="currentColor" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></>);
export const IcReset = ({ size = 14 }: P) => S(size, 2, <><path d="M4 12a8 8 0 1 0 2.3-5.6" /><path d="M4 4v4h4" /></>);
/** helm orders: the ship's track. A gentle bend is 1°, a hard turn 10°, straight is rudder amidships; right is the mirror of left */
type Turn = { size?: number; right?: boolean };
const flip = (right?: boolean) => (right ? { style: { transform: 'scaleX(-1)' } } : {});
export const IcTurnSmall = ({ size = 22, right }: Turn) => S(size, 2.2, <><path d="M13 21C13 13 12 9 8 5" /><path d="M13 5.4L8 5l.4 5" /></>, flip(right));
export const IcTurnHard = ({ size = 22, right }: Turn) => S(size, 2.2, <><path d="M16 21C16 11 13 8 5 8" /><path d="M9 4L5 8l4 4" /></>, flip(right));
export const IcSteady = ({ size = 22 }: P) => S(size, 2.2, <><path d="M12 21V4" /><path d="M8 8l4-4 4 4" /><path d="M8 21h8" /></>);
export const IcPopOut = () => S(14, 2, <path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6" />);
