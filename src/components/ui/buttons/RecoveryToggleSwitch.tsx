import React from 'react';
import { useSections } from '../../layout/SectionContext';

interface RecoveryDivision {
  id: string;
  label: string;
  approachTime?: number;
}

const generateCaseIDivisions = (): RecoveryDivision[] => [
  { id: 'recovery-inbound', label: 'INBOUND' },
  { id: 'recovery-6', label: 'ANGELS 6' },
  { id: 'recovery-5', label: 'ANGELS 5' },
  { id: 'recovery-4', label: 'ANGELS 4' },
  { id: 'recovery-3', label: 'ANGELS 3' },
  { id: 'recovery-2', label: 'ANGELS 2' },
  { id: 'recovery-spin', label: 'SPIN' },
  { id: 'recovery-charlie', label: 'CHARLIE' },
  { id: 'recovery-bolter', label: 'BOLTER' }
];

const generateCaseIIIIIDivisions = (): RecoveryDivision[] => {
  const divisions: RecoveryDivision[] = [
    { id: 'recovery-inbound', label: 'INBOUND' }
  ];

  // Add divisions from Angels 17 down to Angels 6
  for (let altitude = 17; altitude >= 6; altitude--) {
    const dme = altitude + 15; // DME = ANGELS + 15
    const approachTime = 30 + (altitude - 6); // Start at :30 for Angels 6, increment by 1 minute per level
    divisions.push({
      id: `recovery-${altitude}`,
      label: `DME ${dme}\nANGELS ${altitude}\n:${approachTime.toString().padStart(2, '0')}`,
      approachTime
    });
  }

  divisions.push({ id: 'recovery-spin', label: 'SPIN' });
  divisions.push({ id: 'recovery-charlie', label: 'COMMENCE' });
  divisions.push({ id: 'recovery-platform', label: 'PLATFORM' });
  divisions.push({ id: 'recovery-bolter', label: 'BOLTER' });

  return divisions;
};

export const RecoveryToggleSwitch: React.FC = () => {
  const { sections, updateSectionProperty } = useSections();
  
  // Find the Recovery section
  const recoverySection = sections.find(s => s.title === 'Recovery');
  
  // Determine current state (default to 0 if not set)
  const currentMode = recoverySection?.mode || 0;

  const setMode = (newMode: number) => {
    if (newMode === currentMode) return;
    updateSectionProperty('Recovery', 'mode', newMode);
    // Case I has its own divisions; Case II and III share the marshal stack
    const newDivisions = newMode === 0 ? generateCaseIDivisions() : generateCaseIIIIIDivisions();
    updateSectionProperty('Recovery', 'divisions', newDivisions);
  };

  // Compact I / II / III selector (design: lives in the Recovery column header row)
  const modes = [
    { label: 'I', title: 'Case I', color: 'var(--rr-good)' },
    { label: 'II', title: 'Case II', color: 'var(--rr-warn)' },
    { label: 'III', title: 'Case III', color: 'var(--rr-bad)' },
  ];

  return (
    <div className="inline-flex items-center gap-[6px]">
      <span className="font-mono text-[9px] tracking-[.14em] text-text3">CASE</span>
      <div className="inline-flex rounded-rr-md border border-border2 overflow-hidden" role="radiogroup" aria-label="Recovery case">
        {modes.map((m, i) => {
          const active = currentMode === i;
          return (
            <button
              key={m.label}
              type="button"
              role="radio"
              aria-checked={active}
              title={m.title}
              onClick={() => setMode(i)}
              className="h-[22px] min-w-[26px] px-[7px] text-[11px] font-bold border-0 cursor-pointer transition-colors"
              style={{
                background: active ? m.color : 'transparent',
                color: active ? '#fff' : 'var(--rr-text3)',
                borderLeft: i > 0 ? '1px solid var(--rr-border2)' : undefined,
              }}
            >
              {m.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};