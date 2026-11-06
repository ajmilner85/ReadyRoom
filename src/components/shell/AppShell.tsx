import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { useAuth } from '../../context/AuthContext';
import { useAppSettings } from '../../context/AppSettingsContext';
import { usePageLoading } from '../../context/PageLoadingContext';
import { useShell } from '../../context/ShellContext';
import { useSimplePermissions } from '../../hooks/usePermissions';
import { signOut } from '../../utils/supabaseClient';
import { getUserSettings } from '../../utils/userSettingsService';
import { Icon } from '../ui/primitives/Icon';
import { Avatar, AvatarStack } from '../ui/primitives/Display';
import { SegmentedControl } from '../ui/primitives/Controls';
import { PopoverMenu } from '../ui/primitives/Select';
import { StatusDot } from '../ui/primitives/Chip';
import { NAV_GROUP_ORDER, NAV_MODULES, NavModule, moduleIdForPath } from './navConfig';

/* ------------------------------------------------------------------ */
/* Squadron branding → --rr-accent                                     */
/* ------------------------------------------------------------------ */
function hexToRgb(hex: string): [number, number, number] | null {
  const h = hex.replace('#', '').trim();
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function luminance([r, g, b]: [number, number, number]) {
  const f = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/**
 * Applies the signed-in user's squadron primary colour as the app accent (when the
 * "interface theme uses squadron colours" preference is on). Very dark primaries are
 * lifted in dark theme (and very light ones darkened in light theme) so accent text
 * stays legible.
 */
function useSquadronBranding() {
  const { userProfile } = useAuth();
  const { settings } = useAppSettings();
  const palette = userProfile?.pilot?.currentSquadron?.color_palette as Record<string, string> | null | undefined;
  const primary = settings.accentColor || (settings.interfaceThemeUsesSquadronColors ? palette?.primary : undefined);
  useEffect(() => {
    const root = document.documentElement;
    const rgb = primary ? hexToRgb(primary) : null;
    if (!primary || !rgb) {
      root.style.removeProperty('--rr-accent');
      root.style.removeProperty('--rr-accent-text');
      return;
    }
    // Fills keep the true squadron colour; text/underline/icon uses get a lifted variant
    // when the colour is too dark (dark theme) or too light (light theme) to read.
    const L = luminance(rgb);
    let text = primary;
    if (settings.theme === 'dark' && L < 0.12) text = `color-mix(in oklab, ${primary} 55%, white)`;
    else if (settings.theme === 'light' && L > 0.55) text = `color-mix(in oklab, ${primary} 60%, black)`;
    root.style.setProperty('--rr-accent', primary);
    root.style.setProperty('--rr-accent-text', text);
  }, [primary, settings.theme]);
  useEffect(() => {
    const root = document.documentElement;
    const keys = ['primary', 'secondary', 'accent', 'neutral_light', 'neutral_dark'];
    keys.forEach(k => {
      const v = palette?.[k];
      if (v) root.style.setProperty(`--rr-sq-${k.replace('_', '-')}`, v);
      else root.style.removeProperty(`--rr-sq-${k.replace('_', '-')}`);
    });
  }, [palette]);
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
async function performSignOut() {
  try {
    const { error } = await signOut();
    if (error) console.error('Supabase signOut error:', error);
    try {
      Object.keys(localStorage).forEach(k => { if (k.startsWith('sb-') || k.includes('supabase')) localStorage.removeItem(k); });
      Object.keys(sessionStorage).forEach(k => { if (k.startsWith('sb-') || k.includes('supabase')) sessionStorage.removeItem(k); });
    } catch (storageError) {
      console.error('Error clearing storage:', storageError);
    }
  } catch (error) {
    console.error('Error logging out:', error);
  } finally {
    window.location.href = '/';
  }
}

function useVisibleModules(): NavModule[] {
  const p = useSimplePermissions();
  return useMemo(() => {
    if (p.loading) return [];
    const allowed: Record<string, boolean> = {
      access_home: !!p.canAccessHome,
      access_roster: !!p.canAccessRoster,
      access_events: !!p.canAccessEvents,
      access_mission_prep: !!p.canAccessMissionPrep,
      access_flights: !!p.canAccessFlights,
      access_mission_debriefing: !!p.canAccessMissionDebriefing,
      access_my_training: !!p.access_my_training,
      access_training_management: !!p.access_training_management,
      access_kneeboard: !!p.access_kneeboard,
      access_reports: !!p.canAccessReports,
      access_settings: !!p.canAccessSettings,
    };
    return NAV_MODULES.filter(m => allowed[m.permission]);
  }, [p]);
}

const Wordmark: React.FC<{ size?: number }> = ({ size = 17 }) => (
  <div className="font-bold tracking-[.02em] leading-none text-text" style={{ fontSize: size }}>
    READY<span className="text-accent">ROOM</span>
  </div>
);

const ThemeToggle: React.FC = () => {
  const { settings, updateSetting } = useAppSettings();
  return (
    <SegmentedControl
      size="sm"
      value={settings.theme}
      onChange={v => updateSetting('theme', v)}
      options={[{ value: 'light', label: 'LIGHT' }, { value: 'dark', label: 'DARK' }]}
    />
  );
};

/** Discord bot environment pill (Production / Development bot). */
const DiscordStatusPill: React.FC = () => {
  const [env, setEnv] = useState<'production' | 'development' | null>(null);
  useEffect(() => {
    let alive = true;
    getUserSettings()
      .then(r => { if (alive) setEnv(r.success ? (r.data?.developer?.discordBotToken ?? 'production') : null); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  if (!env) return null;
  const prod = env === 'production';
  return (
    <div
      data-m="ctx-hide"
      title={prod ? 'Discord: production bot' : 'Discord: development bot (Settings → Developer)'}
      className="flex-none flex items-center gap-[6px] px-[9px] py-1 rounded-rr-md bg-panel2 border border-border"
    >
      <StatusDot color={prod ? 'var(--rr-good)' : 'var(--rr-warn)'} />
      <span className="text-[11px] text-text2 whitespace-nowrap">{prod ? 'Discord' : 'Discord · Dev bot'}</span>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* User block                                                          */
/* ------------------------------------------------------------------ */
const UserMenu: React.FC<{ variant: 'rail' | 'compact' | 'bar' }> = ({ variant }) => {
  const { userProfile } = useAuth();
  const navigate = useNavigate();
  const pilot = userProfile?.pilot;
  const name = pilot?.callsign || userProfile?.discordUsername || 'User';
  const color = (pilot?.currentSquadron?.color_palette as { primary?: string } | null | undefined)?.primary || 'var(--rr-accent)';
  const sub = pilot ? [pilot.boardNumber, pilot.billet].filter(Boolean).join(' · ') : userProfile?.discordUsername ? 'Not linked to pilot record' : '';
  const items = [
    ...(pilot ? [{ label: 'My dossier', icon: 'dossier' as const, onSelect: () => navigate('/dossier') }] : []),
    { label: 'Settings', icon: 'settings' as const, onSelect: () => navigate('/settings') },
    { label: 'Sign out', icon: 'logOut' as const, onSelect: performSignOut, danger: true, divider: true },
  ];
  return (
    <PopoverMenu
      placement={variant === 'bar' ? 'bottom-end' : 'right-start'}
      items={items}
      trigger={({ ref, onClick }) => (
        <button
          ref={ref}
          type="button"
          onClick={onClick}
          title={name}
          className={clsx(
            'flex items-center gap-[10px] bg-transparent border-0 cursor-pointer text-left rounded-rr-lg',
            variant === 'rail' ? 'w-full p-1 hover:bg-panel2' : 'p-0',
          )}
        >
          <Avatar name={name} src={userProfile?.discordAvatarUrl} color={color} size={variant === 'bar' ? 30 : variant === 'compact' ? 36 : 34} />
          {variant === 'rail' ? (
            <div className="leading-[1.25] min-w-0 flex-1">
              <div className="text-[13px] font-semibold truncate text-text">{name}</div>
              <div className="font-mono text-[10px] text-text2 truncate">{sub}</div>
            </div>
          ) : null}
        </button>
      )}
    />
  );
};

/* ------------------------------------------------------------------ */
/* Navigation variants                                                 */
/* ------------------------------------------------------------------ */
interface NavProps {
  modules: NavModule[];
  active: string;
  loadingId: string | null;
  go: (m: NavModule) => void;
}

const Brand: React.FC<{ compact?: boolean; size?: number }> = ({ compact, size = 36 }) => {
  const { userProfile } = useAuth();
  const sq = userProfile?.pilot?.currentSquadron;
  return (
    <div className="flex items-center gap-[11px] min-w-0">
      {sq?.insignia_url ? (
        <img src={sq.insignia_url} alt={sq.designation || ''} className="object-contain flex-none" style={{ width: size, height: size }} />
      ) : (
        <span className="flex-none rounded-rr-lg bg-panel3 flex items-center justify-center text-accent" style={{ width: size, height: size }}>
          <Icon name="shield" size={Math.round(size * 0.55)} />
        </span>
      )}
      {!compact ? (
        <div className="leading-none min-w-0">
          <Wordmark size={size >= 34 ? 17 : 16} />
          {sq?.designation ? (
            <div className="font-mono text-[9px] tracking-[.2em] text-text3 mt-[3px] truncate">{sq.designation.toUpperCase()}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

const LabeledRail: React.FC<NavProps> = ({ modules, active, loadingId, go }) => (
  <aside data-m="rail" className="flex-none w-[230px] bg-panel border-r border-border flex flex-col">
    <div className="px-4 pt-4 pb-[14px] border-b border-border"><Brand /></div>
    <nav className="flex-1 overflow-y-auto px-[10px] pt-[10px] pb-[14px]">
      {NAV_GROUP_ORDER.map(g => {
        const items = modules.filter(m => m.group === g);
        if (!items.length) return null;
        return (
          <div key={g}>
            <div className="px-2 pt-[14px] pb-[6px] font-mono text-[9.5px] tracking-[.18em] text-text3">{g}</div>
            {items.map(m => {
              const a = m.id === active;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => go(m)}
                  className={clsx(
                    'w-full flex items-center gap-[11px] px-[9px] py-[7px] mb-[2px] rounded-rr-ctl cursor-pointer border-0 text-left transition-colors duration-150',
                    a ? 'bg-accent-weak' : 'bg-transparent hover:bg-panel2',
                  )}
                  style={{ borderLeft: `3px solid ${a ? 'var(--rr-accent-text)' : 'transparent'}`, animation: loadingId === m.id ? 'rrPulse 1.5s ease-in-out infinite' : undefined }}
                >
                  <span
                    className="flex-none w-7 h-7 rounded-rr-md flex items-center justify-center transition-colors duration-150"
                    style={{ background: a ? 'var(--rr-accent)' : 'var(--rr-panel3)', color: a ? '#fff' : 'var(--rr-text2)' }}
                  >
                    <Icon name={m.icon} size={17} />
                  </span>
                  <span className="text-[13.5px]" style={{ fontWeight: a ? 600 : 500, color: a ? 'var(--rr-text)' : 'var(--rr-text2)' }}>{m.label}</span>
                </button>
              );
            })}
          </div>
        );
      })}
    </nav>
    <div className="border-t border-border p-3"><UserMenu variant="rail" /></div>
  </aside>
);

const CompactRail: React.FC<NavProps> = ({ modules, active, loadingId, go }) => (
  <aside data-m="rail" className="flex-none w-[70px] bg-panel border-r border-border flex flex-col items-center">
    <div className="pt-[14px] pb-3 border-b border-border w-full flex justify-center"><Brand compact size={38} /></div>
    <nav className="flex-1 overflow-y-auto w-full py-[10px] flex flex-col items-center rr-no-scrollbar">
      {NAV_GROUP_ORDER.map((g, gi) => {
        const items = modules.filter(m => m.group === g);
        if (!items.length) return null;
        return (
          <React.Fragment key={g}>
            {gi > 0 ? <div className="w-[34px] h-px bg-border my-2" /> : null}
            {items.map(m => {
              const a = m.id === active;
              return (
                <button
                  key={m.id}
                  type="button"
                  title={m.label}
                  aria-label={m.label}
                  onClick={() => go(m)}
                  className="w-[42px] h-[42px] mb-[6px] rounded-[9px] flex items-center justify-center cursor-pointer border-0 hover:brightness-[1.12] transition-colors duration-150"
                  style={{
                    background: a ? 'var(--rr-accent)' : 'var(--rr-panel3)',
                    color: a ? '#fff' : 'var(--rr-text2)',
                    animation: loadingId === m.id ? 'rrPulse 1.5s ease-in-out infinite' : undefined,
                  }}
                >
                  <Icon name={m.icon} size={19} />
                </button>
              );
            })}
          </React.Fragment>
        );
      })}
    </nav>
    <div className="border-t border-border w-full py-3 flex justify-center"><UserMenu variant="compact" /></div>
  </aside>
);

const CommandBar: React.FC<NavProps> = ({ modules, active, loadingId, go }) => (
  <header data-m="rail" className="flex-none h-14 flex items-center gap-[18px] px-[18px] bg-panel border-b border-border">
    <div className="pr-2 flex-none"><Brand size={30} /></div>
    <nav className="flex items-stretch h-full flex-1 overflow-x-auto rr-no-scrollbar">
      {modules.map(m => {
        const a = m.id === active;
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => go(m)}
            className="flex items-center h-full px-[13px] whitespace-nowrap cursor-pointer bg-transparent border-0 font-semibold text-[12.5px] tracking-[.04em] uppercase transition-colors duration-150 hover:text-text"
            style={{
              color: a ? 'var(--rr-accent-text)' : 'var(--rr-text2)',
              borderBottom: `2px solid ${a ? 'var(--rr-accent-text)' : 'transparent'}`,
              borderTop: '2px solid transparent',
              animation: loadingId === m.id ? 'rrPulse 1.5s ease-in-out infinite' : undefined,
            }}
          >
            {m.short ?? m.label}
          </button>
        );
      })}
    </nav>
    <div className="flex-none"><UserMenu variant="bar" /></div>
  </header>
);

const MobileNav: React.FC<NavProps> = ({ modules, active, go }) => (
  <nav
    data-m="mobnav"
    className="hidden flex-none items-stretch overflow-x-auto bg-panel border-t border-border rr-no-scrollbar"
    style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
  >
    {modules.map(m => {
      const a = m.id === active;
      return (
        <button
          key={m.id}
          type="button"
          onClick={() => go(m)}
          className="flex-none min-w-[72px] flex flex-col items-center justify-center gap-[3px] px-[6px] py-2 cursor-pointer bg-transparent border-0"
          style={{ color: a ? 'var(--rr-accent-text)' : 'var(--rr-text2)', borderTop: `2px solid ${a ? 'var(--rr-accent-text)' : 'transparent'}` }}
        >
          <Icon name={m.icon} size={19} />
          <span className="text-[10.5px] font-semibold whitespace-nowrap">{m.short ?? m.label}</span>
        </button>
      );
    })}
    <div className="flex-none min-w-[72px] flex items-center justify-center"><UserMenu variant="bar" /></div>
  </nav>
);

/* ------------------------------------------------------------------ */
/* Context strip                                                       */
/* ------------------------------------------------------------------ */
const ContextStrip: React.FC<{ module?: NavModule }> = ({ module }) => {
  const shell = useShell();
  const h = shell?.header;
  const code = h?.code ?? module?.code ?? '';
  const title = h?.title ?? module?.title ?? '';
  const meta = h?.meta;
  const presence = shell?.presence ?? [];
  return (
    <div data-m="ctx" className="flex-none h-[52px] flex items-center gap-4 px-4 bg-panel border-b border-border">
      <div className="flex items-baseline gap-2 min-w-0 flex-shrink overflow-hidden">
        {code ? (
          <>
            <span className="font-mono text-[11px] tracking-[.16em] text-accent whitespace-nowrap flex-none">{code}</span>
            <span className="text-text3 flex-none">/</span>
          </>
        ) : null}
        <span className="font-semibold text-[15px] whitespace-nowrap flex-none text-text">{title}</span>
        {meta ? <span className="font-mono text-[11px] text-text2 whitespace-nowrap overflow-hidden text-ellipsis min-w-0">{meta}</span> : null}
      </div>
      <DiscordStatusPill />
      <div className="flex-1" />
      {shell?.stripActions ? <div className="flex items-center gap-2 flex-none">{shell.stripActions}</div> : null}
      {presence.length ? (
        <div data-m="ctx-hide" className="flex items-center">
          <AvatarStack size={26} max={5} people={presence.map(p => ({ name: p.name, src: p.avatarUrl, color: p.color }))} />
        </div>
      ) : null}
      <ThemeToggle />
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Full-screen chrome (Coordination)                                   */
/* ------------------------------------------------------------------ */
const FullscreenBar: React.FC<{ module?: NavModule }> = ({ module }) => {
  const navigate = useNavigate();
  const shell = useShell();
  const title = shell?.header?.title ?? module?.title ?? '';
  const meta = shell?.header?.meta;
  return (
    // Same height as the command bar (h-14) so switching into Coordination doesn't jump
    <div data-m="ctx" className="flex-none h-14 flex items-center gap-3 px-[14px] bg-panel border-b border-border">
      <button
        type="button"
        onClick={() => navigate('/')}
        className="flex items-center gap-[6px] px-[10px] py-[6px] rounded-rr-ctl border border-border2 text-[12.5px] font-semibold text-text2 bg-transparent cursor-pointer hover:border-accent hover:text-accent"
      >
        <Icon name="arrowLeft" size={14} /> Exit
      </button>
      <span className="font-mono text-[11px] tracking-[.16em] text-accent whitespace-nowrap">{module?.code}</span>
      <span className="text-text3">/</span>
      <span className="font-semibold text-[15px] whitespace-nowrap text-text">{title}</span>
      {meta ? <span className="font-mono text-[11px] text-text2 whitespace-nowrap overflow-hidden text-ellipsis min-w-0" data-m="ctx-hide">{meta}</span> : null}
      <span className="flex items-center gap-[6px] px-2 py-[3px] rounded-rr-md text-[10.5px] font-bold tracking-[.12em]" style={{ background: 'rgba(224,82,78,.14)', color: 'var(--rr-bad)' }}>
        <StatusDot color="var(--rr-bad)" pulse /> LIVE
      </span>
      <div className="flex-1" />
      {shell?.stripActions}
      <ThemeToggle />
      <button
        type="button"
        onClick={() => navigate('/debriefing')}
        className="flex items-center gap-[6px] px-3 py-[6px] rounded-rr-ctl bg-accent text-white text-[12.5px] font-semibold border-0 cursor-pointer hover:brightness-[1.08]"
      >
        Debrief <Icon name="arrowRight" size={14} />
      </button>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Shell                                                               */
/* ------------------------------------------------------------------ */
const FULLSCREEN_PREFIXES = ['/mission-coordination'];

export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  useSquadronBranding();
  const location = useLocation();
  const navigate = useNavigate();
  const { settings } = useAppSettings();
  const { setPageLoading, isPageLoading, loadingPage } = usePageLoading();
  const modules = useVisibleModules();
  const activeId = moduleIdForPath(location.pathname);
  const activeModule = NAV_MODULES.find(m => m.id === activeId);
  const fullscreen = FULLSCREEN_PREFIXES.some(p => location.pathname.startsWith(p));

  const go = (m: NavModule) => {
    if (m.id === activeId && location.pathname === m.route) return;
    setPageLoading(m.id, true);
    navigate(m.route);
  };
  const navProps: NavProps = { modules, active: activeId, loadingId: isPageLoading ? loadingPage : null, go };
  const layout = settings.navLayout;

  if (fullscreen) {
    return (
      <div className="h-[100dvh] w-full overflow-hidden bg-bg text-text flex flex-col">
        <FullscreenBar module={activeModule} />
        <div className="flex-1 min-h-0 flex flex-col">{children}</div>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] w-full overflow-hidden bg-bg text-text flex flex-col" style={{ transition: 'background .25s ease, color .25s ease' }}>
      {layout === 'bar' ? <CommandBar {...navProps} /> : null}
      <div className="flex-1 min-h-0 flex">
        {layout === 'rail' ? <LabeledRail {...navProps} /> : null}
        {layout === 'compact' ? <CompactRail {...navProps} /> : null}
        <div className="flex-1 min-w-0 flex flex-col">
          <ContextStrip module={activeModule} />
          <main className="flex-1 min-h-0 flex flex-col overflow-hidden max-[760px]:overflow-y-auto">{children}</main>
        </div>
      </div>
      <MobileNav {...navProps} />
    </div>
  );
};

export default AppShell;
