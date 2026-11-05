import React from 'react';
import { useAppSettings, NavLayout, ThemeMode } from '../../context/AppSettingsContext';
import { useAuth } from '../../context/AuthContext';
import { Icon } from '../ui/primitives/Icon';
import { SectionLabel } from '../ui/primitives/Display';
import { Toggle } from '../ui/primitives/Controls';
import { SettingsSection } from './SettingsSection';

interface AppearanceProps {
  error?: string | null;
  setError?: (error: string | null) => void;
}

/* Theme preview colours are literal on purpose: each card previews the *other* theme too. */
const THEME_PREVIEW: Record<ThemeMode, { bg: string; panel: string; border: string; label: string }> = {
  dark: { bg: '#0E1116', panel: '#151A21', border: '#262F3A', label: 'Dark' },
  light: { bg: '#E6EBF0', panel: '#FFFFFF', border: '#DBE2EA', label: 'Light' },
};

const NAV_OPTIONS: { value: NavLayout; label: string; description: string }[] = [
  { value: 'rail', label: 'Labeled Rail', description: 'Grouped sidebar with icons and labels' },
  { value: 'compact', label: 'Compact Rail', description: 'Icon-only sidebar, labels on hover' },
  { value: 'bar', label: 'Command Bar', description: 'Horizontal top bar' },
];

const ACCENT_SWATCHES = ['#F15822', '#005774', '#E3A008', '#8B5CF6', '#40A85B'];

const NavPreview: React.FC<{ layout: NavLayout }> = ({ layout }) => (
  <div className="h-[70px] bg-bg flex" style={{ flexDirection: layout === 'bar' ? 'column' : 'row' }}>
    {layout === 'bar' ? (
      <div className="h-[14px] bg-panel border-b border-border flex items-center gap-[5px] px-2">
        {[0, 1, 2, 3].map(i => <span key={i} className="h-[3px] w-[16px] rounded-full" style={{ background: i === 1 ? 'var(--rr-accent)' : 'var(--rr-border2)' }} />)}
      </div>
    ) : (
      <div className="bg-panel border-r border-border flex flex-col gap-[5px] p-[6px]" style={{ width: layout === 'rail' ? 58 : 20 }}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-[2px] flex-none" style={{ background: i === 1 ? 'var(--rr-accent)' : 'var(--rr-panel3)' }} />
            {layout === 'rail' ? <span className="h-[3px] flex-1 rounded-full bg-border2" /> : null}
          </div>
        ))}
      </div>
    )}
    <div className="flex-1 p-[7px]"><div className="h-full rounded-[4px] bg-panel border border-border" /></div>
  </div>
);

const PreviewCard: React.FC<{ selected: boolean; onClick: () => void; label: string; description?: string; children: React.ReactNode }> = ({ selected, onClick, label, description, children }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={selected}
    className="flex-1 min-w-[150px] max-w-[220px] rounded-rr-xl overflow-hidden cursor-pointer text-left bg-panel p-0 transition-[border-color,box-shadow] duration-150"
    style={{ border: `2px solid ${selected ? 'var(--rr-accent)' : 'var(--rr-border2)'}`, boxShadow: selected ? '0 0 0 3px var(--rr-accent-weak)' : undefined }}
  >
    {children}
    <div className="px-3 py-[9px] flex items-start gap-2">
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-semibold text-text">{label}</div>
        {description ? <div className="text-[11px] text-text2 mt-[1px]">{description}</div> : null}
      </div>
      {selected ? <span className="text-accent flex mt-[1px]"><Icon name="check" size={15} stroke={2.2} /></span> : null}
    </div>
  </button>
);

const Appearance: React.FC<AppearanceProps> = () => {
  const { settings, updateSetting } = useAppSettings();
  const { userProfile } = useAuth();
  const sq = userProfile?.pilot?.currentSquadron;
  const squadronPrimary = (sq?.color_palette as { primary?: string } | null | undefined)?.primary;

  return (
    <SettingsSection title="Appearance" description="Your personal display preferences.">
      <SectionLabel>Theme</SectionLabel>
      <div className="flex flex-wrap gap-3 mb-[26px]">
        {(['dark', 'light'] as ThemeMode[]).map(t => {
          const p = THEME_PREVIEW[t];
          return (
            <PreviewCard key={t} selected={settings.theme === t} onClick={() => updateSetting('theme', t)} label={p.label}>
              <div className="h-[70px] flex items-center justify-center" style={{ background: p.bg }}>
                <div className="w-3/5 h-9 rounded-rr-md" style={{ background: p.panel, border: `1px solid ${p.border}` }} />
              </div>
            </PreviewCard>
          );
        })}
      </div>

      <SectionLabel>Navigation layout</SectionLabel>
      <div className="flex flex-wrap gap-3 mb-[26px]">
        {NAV_OPTIONS.map(o => (
          <PreviewCard key={o.value} selected={settings.navLayout === o.value} onClick={() => updateSetting('navLayout', o.value)} label={o.label} description={o.description}>
            <NavPreview layout={o.value} />
          </PreviewCard>
        ))}
      </div>

      <SectionLabel>Accent (defaults to squadron colour)</SectionLabel>
      <div className="flex flex-wrap items-center gap-3 mb-[26px]">
        <button
          type="button"
          title={sq?.designation ? `${sq.designation} colour` : 'Squadron colour'}
          onClick={() => updateSetting('accentColor', null)}
          className="h-10 px-3 rounded-[9px] flex items-center gap-2 cursor-pointer bg-panel2 text-[12px] font-semibold text-text2"
          style={{
            border: `1px solid ${!settings.accentColor ? 'var(--rr-accent)' : 'var(--rr-border2)'}`,
            boxShadow: !settings.accentColor ? '0 0 0 3px var(--rr-accent-weak)' : undefined,
          }}
        >
          <span className="w-[18px] h-[18px] rounded-[5px]" style={{ background: squadronPrimary || 'var(--rr-accent)' }} />
          Squadron
        </button>
        {ACCENT_SWATCHES.map(c => {
          const sel = settings.accentColor?.toLowerCase() === c.toLowerCase();
          return (
            <button
              key={c}
              type="button"
              aria-label={`Accent ${c}`}
              title={c}
              onClick={() => updateSetting('accentColor', c)}
              className="w-10 h-10 rounded-[9px] cursor-pointer"
              style={{ background: c, border: `1px solid ${sel ? 'var(--rr-accent)' : 'var(--rr-border2)'}`, boxShadow: sel ? '0 0 0 3px var(--rr-accent-weak)' : undefined }}
            />
          );
        })}
      </div>

      <SectionLabel>Squadron colours</SectionLabel>
      <div className="flex flex-col gap-4 max-w-[560px]">
        <Toggle
          checked={settings.displayPilotsWithSquadronColors}
          onChange={v => updateSetting('displayPilotsWithSquadronColors', v)}
          label="Display pilots with squadron colours"
          description="Board numbers and aircraft use each pilot's squadron primary colour. Unassigned pilots display in grey."
        />
        <Toggle
          checked={settings.interfaceThemeUsesSquadronColors}
          onChange={v => updateSetting('interfaceThemeUsesSquadronColors', v)}
          label="Interface accent uses my squadron colour"
          description="When no personal accent is chosen above, active states, tabs and buttons use your squadron's primary colour."
        />
      </div>
    </SettingsSection>
  );
};

export default Appearance;
