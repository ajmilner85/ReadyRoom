import type { IconName } from '../ui/primitives/Icon';

export type NavPermission =
  | 'access_home' | 'access_roster' | 'access_events' | 'access_mission_prep' | 'access_flights'
  | 'access_settings' | 'access_reports' | 'access_mission_debriefing' | 'access_my_training'
  | 'access_training_management' | 'access_kneeboard';

export type NavGroup = 'OVERVIEW' | 'FLIGHT OPS' | 'SQUADRON' | 'RECORDS' | 'ADMIN';
export const NAV_GROUP_ORDER: NavGroup[] = ['OVERVIEW', 'FLIGHT OPS', 'SQUADRON', 'RECORDS', 'ADMIN'];

export interface NavModule {
  /** Matches App's activeButton ids (used by PageLoadingContext). */
  id: string;
  label: string;
  /** Short label for the mobile bottom nav / command bar. */
  short?: string;
  route: string;
  icon: IconName;
  group: NavGroup;
  permission: NavPermission;
  /** Default context-strip header. */
  code: string;
  title: string;
}

export const NAV_MODULES: NavModule[] = [
  { id: 'home', label: 'Home', route: '/', icon: 'home', group: 'OVERVIEW', permission: 'access_home', code: 'OVERVIEW', title: 'Ready Room' },
  { id: 'mission-prep', label: 'Mission Prep', route: '/mission-prep', icon: 'mission', group: 'FLIGHT OPS', permission: 'access_mission_prep', code: 'MISSION PREP', title: 'Mission Preparation' },
  { id: 'flights', label: 'Coordination', route: '/mission-coordination', icon: 'coordination', group: 'FLIGHT OPS', permission: 'access_flights', code: 'FLIGHT OPS', title: 'Mission Coordination' },
  { id: 'debriefing', label: 'Debrief', route: '/debriefing', icon: 'debrief', group: 'FLIGHT OPS', permission: 'access_mission_debriefing', code: 'FLIGHT OPS', title: 'Mission Debrief' },
  { id: 'kneeboard', label: 'Kneeboard', route: '/kneeboard', icon: 'kneeboard', group: 'FLIGHT OPS', permission: 'access_kneeboard', code: 'FLIGHT OPS', title: 'Kneeboard' },
  { id: 'roster', label: 'Roster', route: '/roster', icon: 'roster', group: 'SQUADRON', permission: 'access_roster', code: 'SQUADRON', title: 'Roster Management' },
  { id: 'events', label: 'Events', route: '/events', icon: 'events', group: 'SQUADRON', permission: 'access_events', code: 'SQUADRON', title: 'Events & Cycles' },
  { id: 'training-management', label: 'Training', route: '/training-management', icon: 'training', group: 'SQUADRON', permission: 'access_training_management', code: 'TRAINING', title: 'Training Management' },
  { id: 'my-training', label: 'My Training', route: '/my-training', icon: 'bookOpen', group: 'SQUADRON', permission: 'access_my_training', code: 'TRAINING', title: 'My Training' },
  { id: 'dossier', label: 'Pilot Dossier', short: 'Dossier', route: '/dossier', icon: 'dossier', group: 'RECORDS', permission: 'access_home', code: 'RECORDS', title: 'Pilot Dossier' },
  { id: 'reports', label: 'Reports', route: '/reports', icon: 'reports', group: 'RECORDS', permission: 'access_reports', code: 'RECORDS', title: 'Reports' },
  { id: 'ui-kit', label: 'UI Kit', route: '/ui-kit', icon: 'grid', group: 'ADMIN', permission: 'access_settings', code: 'ADMIN', title: 'UI Kit' },
  { id: 'admin', label: 'Settings', route: '/settings', icon: 'settings', group: 'ADMIN', permission: 'access_settings', code: 'ADMIN', title: 'Settings' },
];

/** Resolve the active module id from a pathname. */
export function moduleIdForPath(path: string): string {
  if (path === '/') return 'home';
  if (path.startsWith('/mission-coordination')) return 'flights';
  if (path.startsWith('/mission-prep')) return 'mission-prep';
  if (path.startsWith('/debriefing')) return 'debriefing';
  if (path.startsWith('/training-management')) return 'training-management';
  if (path.startsWith('/my-training')) return 'my-training';
  if (path.startsWith('/settings')) return 'admin';
  const m = NAV_MODULES.find(x => x.route !== '/' && path.startsWith(x.route));
  return m?.id ?? 'home';
}
