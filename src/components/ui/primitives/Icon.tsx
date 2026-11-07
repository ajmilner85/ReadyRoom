import React from 'react';

/**
 * ReadyRoom line-icon set.
 *
 * Grammar (from the Claude Design handoff): 24×24 grid, stroke only, round caps and joins,
 * stroke 1.7 at 17px+ / 1.8 below, rendered at 16–19px. Each icon is a list of path `d`
 * strings joined by `|`, exactly as in ReadyRoom.dc.html.
 *
 * Icons marked [handoff] are lifted verbatim from the prototype. The rest were drawn for
 * this refactor in the same grammar (logged in design_handoff_readyroom/DECISIONS.md).
 */
const C = 'M12 3a9 9 0 100 18 9 9 0 000-18'; // 9r circle

export const ICON_PATHS = {
  // ---- navigation [handoff]
  home: 'M3 11.5 12 4l9 7.5|M5.5 10v9.5h4.5v-6h4v6h4.5V10',
  mission: `${C}|M12 8v8|M8 12h8`,
  coordination: 'M7 12a2.5 2.5 0 10.001 0|M17 6.5a2.5 2.5 0 10.001 0|M17 17.5a2.5 2.5 0 10.001 0|M9.2 10.9l5.6-3|M9.2 13.1l5.6 3',
  debrief: 'M4 5.5h16v10H9l-4 3.5V15.5H4z|M8.5 10.5h7',
  roster: 'M9.5 11a3 3 0 100-6 3 3 0 000 6|M4 19.5c0-3 2.6-4.8 5.5-4.8s5.5 1.8 5.5 4.8|M16 12a2.5 2.5 0 100-5|M17 15.2c2.2.2 3.8 1.6 3.8 4',
  events: 'M4.5 6h15v13.5h-15z|M4.5 10h15|M8.5 3.5V7|M15.5 3.5V7',
  training: 'M2.5 8.5 12 4.5l9.5 4-9.5 4z|M6.5 11.2v4.8c0 1.2 2.8 2.2 5.5 2.2s5.5-1 5.5-2.2v-4.8|M21.5 8.5v5',
  dossier: 'M6 4h9l3 3v13H6z|M9 9h6M9 12.5h6M9 16h4',
  reports: 'M4 19.5V5|M4 19.5h16|M8.5 16v-5|M12.5 16V8|M16.5 16v-7.5',
  grid: 'M4 4h7v7H4z|M13 4h7v7h-7z|M4 13h7v7H4z|M13 13h7v7h-7z',
  // gear (cog) - the previous spoked-circle read as a sun
  settings: 'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z|M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
  // ---- settings sections [handoff]
  appearance: 'M12 3a9 9 0 100 18 4.5 4.5 0 010-9 4.5 4.5 0 004.5-4.5A4.5 4.5 0 0012 3',
  user: 'M12 12a4 4 0 100-8 4 4 0 000 8|M5 20c0-3.5 3-6 7-6s7 2.5 7 6',
  code: 'M8 8l-4 4 4 4|M16 8l4 4-4 4|M13 5l-2 14',
  shieldCheck: 'M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z|M9 12l2 2 4-4',
  orgStructure: 'M10 4h4v4h-4z|M3 16h4v4H3z|M17 16h4v4h-4z|M12 8v4M5 16v-2h14v2',
  userSingle: 'M9.5 11a3 3 0 100-6 3 3 0 000 6|M4 19c0-3 2.6-4.8 5.5-4.8s5.5 1.8 5.5 4.8',
  message: 'M4 5.5h16v10H9l-4 3.5V15.5H4z',
  table: 'M4 5h16v14H4z|M4 9h16M9 9v10',
  // ---- actions [handoff]
  copy: 'M8 8h11v11H8z|M5 15V5h10',
  save: 'M5 4h11l3 3v13H5z|M8 4v5h7V4|M8 20v-6h8v6',
  edit: 'M4 20h4L19 9l-4-4L4 16z|M13.5 6.5l4 4',
  trash: 'M5 7h14|M9 7V4h6v3|M7 7l1 13h8l1-13',
  upload: 'M12 16V4|M7 9l5-5 5 5|M5 20h14',
  dots: 'M5 12h.01|M12 12h.01|M19 12h.01',
  plus: 'M12 5v14|M5 12h14',
  reset: 'M4 4v6h6|M5.5 15a7 7 0 101.6-7.3L4 10',
  send: 'M4 12l16-8-6 16-3-7z',
  filter: 'M4 5h16l-6 8v6l-4-2v-4z',
  check: 'M5 12l4 4 10-10',
  close: 'M6 6l12 12|M18 6L6 18',

  // ---- drawn for the refactor (same grammar)
  minus: 'M5 12h14',
  chevronDown: 'M6 9l6 6 6-6',
  chevronUp: 'M6 15l6-6 6 6',
  chevronLeft: 'M15 6l-6 6 6 6',
  chevronRight: 'M9 6l6 6-6 6',
  chevronsLeft: 'M11.5 6l-6 6 6 6|M18.5 6l-6 6 6 6',
  chevronsRight: 'M5.5 6l6 6-6 6|M12.5 6l6 6-6 6',
  arrowLeft: 'M19 12H5|M11 6l-6 6 6 6',
  arrowRight: 'M5 12h14|M13 6l6 6-6 6',
  arrowUpDown: 'M8 4v16|M4.5 7.5 8 4l3.5 3.5|M16 20V4|M12.5 16.5 16 20l3.5-3.5',
  cornerDownRight: 'M5 5v7a3 3 0 003 3h11|M15 11l4 4-4 4',
  grip: 'M9 6h.01|M15 6h.01|M9 12h.01|M15 12h.01|M9 18h.01|M15 18h.01',
  menu: 'M4 6.5h16|M4 12h16|M4 17.5h16',
  search: 'M11 4.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13|M16 16l4 4',
  alertCircle: `${C}|M12 7.5v5.5|M12 16.5h.01`,
  alertTriangle: 'M12 4 2.8 19.5h18.4z|M12 10v4|M12 17h.01',
  info: `${C}|M12 11v5.5|M12 7.5h.01`,
  help: `${C}|M9.5 9.5a2.5 2.5 0 114 2c-1 .6-1.5 1.2-1.5 2.3|M12 17h.01`,
  checkCircle: `${C}|M8.5 12l2.5 2.5 4.5-5`,
  minusCircle: `${C}|M8 12h8`,
  xCircle: `${C}|M9 9l6 6|M15 9l-6 6`,
  clock: `${C}|M12 7.5V12l3 2`,
  refresh: 'M19.5 10A7.5 7.5 0 006 7.2L4 9.5|M4.5 14A7.5 7.5 0 0018 16.8l2-2.3|M4 4.5v5h5|M20 19.5v-5h-5',
  download: 'M12 4v12|M7 11l5 5 5-5|M5 20h14',
  externalLink: 'M14 4h6v6|M20 4l-9 9|M18 14v6H4V6h6',
  link: 'M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1.2 1.2|M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1.2-1.2',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z|M12 9.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5',
  eyeOff: 'M4 4l16 16|M9.8 5.8A9.6 9.6 0 0112 5.5c6 0 9.5 6.5 9.5 6.5a16.5 16.5 0 01-2.6 3.4|M6.6 7.1C3.9 8.8 2.5 12 2.5 12S6 18.5 12 18.5c1.6 0 3-.4 4.2-1.1|M10 10a2.8 2.8 0 004 4',
  lock: 'M6 11h12v9H6z|M8.5 11V8a3.5 3.5 0 017 0v3',
  key: 'M8 15.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7|M11.5 12H20|M17 12v3|M20 12v2.5',
  logOut: 'M10 4H5v16h5|M14.5 8l4 4-4 4|M18.5 12H9',
  bell: 'M6 16v-5a6 6 0 0112 0v5l1.5 2h-15z|M10 20.5h4',
  mail: 'M3.5 5.5h17v13h-17z|M3.5 6.5 12 13l8.5-6.5',
  star: 'M12 3.8l2.5 5.2 5.6.7-4.1 3.9 1 5.6L12 16.5l-5 2.7 1-5.6-4.1-3.9 5.6-.7z',
  award: 'M12 14.5a5 5 0 100-10 5 5 0 000 10|M9 13.5 7.5 20.5 12 18l4.5 2.5L15 13.5',
  crown: 'M4 8l4 4 4-7 4 7 4-4-1.5 10h-13z',
  shield: 'M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z',
  wrench: 'M14.5 4.5a4.5 4.5 0 015.1 5.9l-2.4-2.4-2.6.6-.6 2.6 2.4 2.4a4.5 4.5 0 01-5.9-5.1|M10.6 10.6 4.5 16.7a1.8 1.8 0 002.6 2.6l6.1-6.1',
  sliders: 'M4 7h9|M17 7h3|M4 17h3|M11 17h9|M15 5v4|M9 15v4',
  wand: 'M4.5 19.5l11-11|M13.5 6.5l4 4|M18.5 3.5v3|M17 5h3|M7 3.5v2.5|M5.75 4.75h2.5',
  server: 'M4 4.5h16v6H4z|M4 13.5h16v6H4z|M7.5 7.5h.01|M7.5 16.5h.01',
  database: 'M12 4c4.4 0 8 1.1 8 2.5S16.4 9 12 9 4 7.9 4 6.5 7.6 4 12 4|M4 6.5v11C4 18.9 7.6 20 12 20s8-1.1 8-2.5v-11|M4 12c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5',
  layers: 'M12 4l8.5 4.5L12 13 3.5 8.5z|M3.5 12.5 12 17l8.5-4.5|M3.5 16.5 12 21l8.5-4.5',
  image: 'M4 5h16v14H4z|M8.5 10.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3|M20 15l-5-5L5 19',
  list: 'M9 6h11|M9 12h11|M9 18h11|M4.5 6h.01|M4.5 12h.01|M4.5 18h.01',
  archive: 'M3.5 4.5h17v4h-17z|M5 8.5v11h14v-11|M10 12.5h4',
  anchor: 'M12 8a2 2 0 100-4 2 2 0 000 4|M12 8v12.5|M5 13.5a7 7 0 0014 0|M3 13.5h3|M18 13.5h3',
  activity: 'M3 12h4l3-7 4 14 3-7h4',
  briefcase: 'M4 8h16v11H4z|M9 8V5h6v3|M4 13h16',
  bookOpen: 'M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5|M12 6.5c2-1.5 5-2 8.5-1.5v13c-3.5-.5-6.5 0-8.5 1.5|M12 6.5v13',
  clipboard: 'M6 5h12v15.5H6z|M9 3.5h6v3H9z|M9 11h6|M9 14.5h6|M9 18h3',
  clipboardCheck: 'M6 5h12v15.5H6z|M9 3.5h6v3H9z|M9 13l2 2 4-4',
  kneeboard: 'M6 3.5h12v17H6z|M9.5 3.5v17|M12.5 8h3|M12.5 11.5h3|M12.5 15h2',
  fileUp: 'M6 3.5h8.5L18 7v13.5H6z|M12 17v-7|M9.5 12.5 12 10l2.5 2.5',
  fileDown: 'M6 3.5h8.5L18 7v13.5H6z|M12 10v7|M9.5 14.5 12 17l2.5-2.5',
  flask: 'M9.5 3.5h5|M10.5 3.5v6L5 19a1.2 1.2 0 001 1.5h12a1.2 1.2 0 001-1.5l-5.5-9.5v-6|M7.3 15h9.4',
  tablet: 'M6 3.5h12v17H6z|M11 17.5h2',
  bookmarkPlus: 'M6.5 4h11v16.5L12 16.5l-5.5 4z|M12 7.5v5|M9.5 10h5',
  merge: 'M6 4v3c0 3 6 4 6 8v5|M18 4v3c0 3-6 4-6 8|M9.5 17.5 12 20l2.5-2.5',
  thumbsUp: 'M7.5 10.5v9H4v-9z|M7.5 10.5 11 4c1.4 0 2.4 1.1 2.2 2.5l-.5 3H18a2 2 0 012 2.3l-1.2 6a2 2 0 01-2 1.7H7.5',
  thumbsDown: 'M7.5 13.5v-9H4v9z|M7.5 13.5 11 20c1.4 0 2.4-1.1 2.2-2.5l-.5-3H18a2 2 0 002-2.3l-1.2-6a2 2 0 00-2-1.7H7.5',
  messageOff: 'M4 4l16 16|M8.5 5.5H20v10h-1.5|M14.5 15.5H9l-4 3.5v-3.5H4v-10',
  flame: 'M12 21c-3.6 0-6-2.4-6-5.6 0-3.4 2.6-5 3.6-8.4 1.8 1.2 2.4 3 2.4 4.5 1-.6 1.6-1.6 1.8-2.8 2 1.6 4.2 3.8 4.2 6.7 0 3.2-2.4 5.6-6 5.6z',
  skull: 'M12 3.5c-4.4 0-7.5 3-7.5 7 0 2.4 1.1 4 2.5 5v3.5h10v-3.5c1.4-1 2.5-2.6 2.5-5 0-4-3.1-7-7.5-7z|M9 11.5h.01|M15 11.5h.01|M10.5 19v-2|M13.5 19v-2',
  crosshair: `${C}|M12 3v4|M12 17v4|M3 12h4|M17 12h4`,
  radio: 'M4.5 9h15v11h-15z|M7.5 9l9-5|M9 14.5a1.5 1.5 0 100 .01|M13.5 13h3|M13.5 16h3',
  sun: 'M12 8a4 4 0 100 8 4 4 0 000-8|M12 2.5v2|M12 19.5v2|M2.5 12h2|M19.5 12h2|M5.3 5.3l1.4 1.4|M17.3 17.3l1.4 1.4|M5.3 18.7l1.4-1.4|M17.3 6.7l1.4-1.4',
  moon: 'M19.5 14.5A8 8 0 019.5 4.5a8 8 0 1010 10z',
  userCheck: 'M9.5 11a3 3 0 100-6 3 3 0 000 6|M4 19c0-3 2.6-4.8 5.5-4.8s5.5 1.8 5.5 4.8|M15.5 11.5l2 2 3.5-3.5',
  userSearch: 'M10 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7|M4 20c0-3.3 2.7-5.5 6-5.5|M17 18.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5|M19 18l2 2',
  userPlus: 'M9.5 11a3 3 0 100-6 3 3 0 000 6|M4 19c0-3 2.6-4.8 5.5-4.8s5.5 1.8 5.5 4.8|M18.5 8v6|M15.5 11h6',
  target: `${C}|M12 7.5a4.5 4.5 0 100 9 4.5 4.5 0 000-9|M12 11.5v1`,
  play: 'M7 5l12 7-12 7z',
  pause: 'M7.5 5v14|M16.5 5v14',
  discord: 'M8 6.5c-1.6.3-3 .9-4 1.6-1.4 2.3-1.8 5.2-1.5 8.2 1.4 1.1 2.9 1.8 4.4 2.2l1-1.6|M16 6.5c1.6.3 3 .9 4 1.6 1.4 2.3 1.8 5.2 1.5 8.2-1.4 1.1-2.9 1.8-4.4 2.2l-1-1.6|M7.5 16.5c3 1.3 6 1.3 9 0|M8 7.2c2.6-.8 5.4-.8 8 0|M9.5 13a1 1 0 100-.01|M14.5 13a1 1 0 100-.01',
} as const;

export type IconName = keyof typeof ICON_PATHS;

export interface IconProps extends Omit<React.SVGProps<SVGSVGElement>, 'name' | 'stroke'> {
  name: IconName;
  /** Rendered size in px (default 16). */
  size?: number;
  /** Override stroke width (default 1.8 below 17px, 1.7 at 17px+). */
  stroke?: number;
  title?: string;
}

// `color` goes into the style (not the SVG presentation attribute) so CSS variables resolve.
export const Icon: React.FC<IconProps> = ({ name, size = 16, stroke, title, style, color, ...rest }) => {
  const d = ICON_PATHS[name];
  const sw = stroke ?? (size >= 17 ? 1.7 : 1.8);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      style={{ flex: 'none', ...(color ? { color } : null), ...style }}
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {d.split('|').map((p, i) => (
        <path key={i} d={p} />
      ))}
    </svg>
  );
};

export default Icon;
