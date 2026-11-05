import React, { useEffect, useState } from 'react';
import { Icon } from '../primitives';
import { getSupportRoleQualifications, Qualification } from '../../../utils/qualificationService';
import type { SupportRoleRequirement } from '../../../utils/supabaseClient';

interface SupportRoleRequirementsEditorProps {
  requirements: SupportRoleRequirement[];
  onChange: (requirements: SupportRoleRequirement[]) => void;
}

/**
 * Reorderable list of Mission Support role requirements.
 * Roles offered are active qualifications flagged as support roles
 * (Settings > Roster > Qualifications > "Mission Support role").
 * Array order is the display order in Discord posts and the attendance section.
 */
const SupportRoleRequirementsEditor: React.FC<SupportRoleRequirementsEditorProps> = ({
  requirements,
  onChange
}) => {
  const [availableRoles, setAvailableRoles] = useState<Qualification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data } = await getSupportRoleQualifications();
      if (!cancelled) {
        const roles = data || [];
        setAvailableRoles(roles);
        setLoading(false);

        // Matching is by qualification ID, but the stored name is used as the
        // display label elsewhere - sync stale names after a qualification rename
        const refreshed = requirements.map(req => {
          const role = roles.find(q => q.id === req.qualificationId);
          return role && role.name !== req.name ? { ...req, name: role.name } : req;
        });
        if (refreshed.some((req, i) => req !== requirements[i])) {
          onChange(refreshed);
        }
      }
    };
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const usedIds = new Set(requirements.map(r => r.qualificationId));
  const unusedRoles = availableRoles.filter(q => !usedIds.has(q.id));

  const updateRequirement = (index: number, updates: Partial<SupportRoleRequirement>) => {
    const next = requirements.map((req, i) => (i === index ? { ...req, ...updates } : req));
    onChange(next);
  };

  const moveRequirement = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= requirements.length) return;
    const next = [...requirements];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const removeRequirement = (index: number) => {
    onChange(requirements.filter((_, i) => i !== index));
  };

  const addRequirement = () => {
    const role = unusedRoles[0];
    if (!role) return;
    onChange([...requirements, { qualificationId: role.id, name: role.name, required: 1 }]);
  };

  const arrowButtonStyle = (disabled: boolean): React.CSSProperties => ({
    width: '22px',
    height: '17px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid var(--rr-border2)',
    backgroundColor: 'var(--rr-panel)',
    color: disabled ? 'var(--rr-text3)' : 'var(--rr-text2)',
    cursor: disabled ? 'default' : 'pointer',
    padding: 0
  });

  return (
    <div>
      {requirements.map((req, index) => {
        // Offer the currently selected role plus any unused ones; keep the
        // selected role selectable even if it was later unflagged/archived.
        const selectedRole = availableRoles.find(q => q.id === req.qualificationId);
        const options = selectedRole
          ? [selectedRole, ...unusedRoles.filter(q => q.id !== selectedRole.id)]
          : unusedRoles;

        return (
          <div key={req.qualificationId} style={{ marginBottom: '8px', display: 'flex', gap: '8px', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <button type="button"
                onClick={() => moveRequirement(index, -1)}
                disabled={index === 0}
                style={{ ...arrowButtonStyle(index === 0), borderRadius: '4px 4px 0 0', borderBottom: 'none' }}
                title="Move up"
              >
                <Icon name="chevronUp" size={12} />
              </button>
              <button type="button"
                onClick={() => moveRequirement(index, 1)}
                disabled={index === requirements.length - 1}
                style={{ ...arrowButtonStyle(index === requirements.length - 1), borderRadius: '0 0 4px 4px' }}
                title="Move down"
              >
                <Icon name="chevronDown" size={12} />
              </button>
            </div>
            <select
              value={req.qualificationId}
              onChange={(e) => {
                const role = availableRoles.find(q => q.id === e.target.value);
                if (role) {
                  updateRequirement(index, { qualificationId: role.id, name: role.name });
                }
              }}
              style={{
                flex: 1,
                padding: '8px 12px',
                border: '1px solid var(--rr-border2)',
                borderRadius: '6px',
                fontSize: '14px',
                fontFamily: "'Inter', sans-serif",
                backgroundColor: 'var(--rr-panel)',
                color: 'var(--rr-text)'
              }}
            >
              {!selectedRole && (
                <option value={req.qualificationId} style={{ fontFamily: "'Inter', sans-serif", fontSize: '14px' }}>{req.name}</option>
              )}
              {options.map(role => (
                <option key={role.id} value={role.id} style={{ fontFamily: "'Inter', sans-serif", fontSize: '14px' }}>{role.name}</option>
              ))}
            </select>
            <input
              type="number"
              min="0"
              max="99"
              value={req.required}
              onChange={(e) => updateRequirement(index, { required: Math.max(0, parseInt(e.target.value) || 0) })}
              title="Number required (0 = optional)"
              style={{
                width: '70px',
                padding: '8px',
                border: '1px solid var(--rr-border2)',
                borderRadius: '6px',
                fontSize: '14px',
                fontFamily: "'Inter', sans-serif",
                textAlign: 'center'
              }}
            />
            <button type="button"
              onClick={() => removeRequirement(index)}
              style={{
                padding: '8px',
                backgroundColor: 'var(--rr-panel)',
                color: 'var(--rr-text3)',
                border: '1px solid var(--rr-border)',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(224,82,78,.12)';
                e.currentTarget.style.color = 'var(--rr-bad)';
                e.currentTarget.style.borderColor = 'var(--rr-bad)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--rr-panel)';
                e.currentTarget.style.color = 'var(--rr-text3)';
                e.currentTarget.style.borderColor = 'var(--rr-border)';
              }}
              title="Remove role"
            >
              <Icon name="trash" size={16} />
            </button>
          </div>
        );
      })}

      {!loading && availableRoles.length === 0 && (
        <p style={{ fontSize: '12px', color: 'var(--rr-text3)', margin: '4px 0 8px 0', fontFamily: 'inherit', fontStyle: 'italic' }}>
          No qualifications are flagged as Mission Support roles. Enable "Mission Support role" on qualifications in Settings &gt; Roster.
        </p>
      )}

      <button type="button"
        onClick={addRequirement}
        disabled={unusedRoles.length === 0}
        style={{
          padding: '8px 16px',
          border: '1px solid var(--rr-accent)',
          backgroundColor: 'var(--rr-accent-weak)',
          color: 'var(--rr-accent-text)',
          borderRadius: '6px',
          cursor: unusedRoles.length === 0 ? 'default' : 'pointer',
          fontSize: '14px',
          fontFamily: 'inherit',
          fontWeight: 500,
          marginTop: '8px',
          opacity: unusedRoles.length === 0 ? 0.5 : 1
        }}
      >
        + Add Role
      </button>
    </div>
  );
};

export default SupportRoleRequirementsEditor;
