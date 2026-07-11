import React, { useRef, useState } from 'react';
import { Plus, Trash2, Upload, X } from 'lucide-react';
import AwardRuleBuilder from './AwardRuleBuilder';
import StyledSelect from './StyledSelect';
import {
  emptyRuleGroup,
  newRuleCondition,
  newRuleId,
  type AwardDeviceConfig,
  type AwardDeviceTier
} from '../../utils/awardRules';
import {
  createDecorationImage,
  deleteDecorationImage,
  type AwardDecorationImage
} from '../../utils/awardService';
import type { DossierCycle } from '../../utils/dossierService';

// Editor for an award's device (decoration) configuration:
//  - repeat mode: bronze/silver devices computed from the issuance count
//    (Sea Service Deployment Ribbon style)
//  - tier mode: one device per issuance chosen by criteria (campaign medal
//    attendance-star style)
// Decoration images live in a shared pool so stars uploaded once can be
// reused across every ribbon and medal.

interface AwardDeviceEditorProps {
  config: AwardDeviceConfig | null;
  onChange: (config: AwardDeviceConfig | null) => void;
  decorations: AwardDecorationImage[];
  onDecorationsChanged: () => Promise<void> | void;
  /** Cycles offered when pinning a tier condition to a specific cycle */
  cycles: DossierCycle[];
  /** Award's qualifying cycle types — filters the tier rule cycle pickers */
  qualifyingCycleTypes?: string[];
  canManage: boolean;
  onError: (message: string) => void;
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: '6px',
  fontSize: '14px',
  fontWeight: 500,
  color: '#64748B'
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  border: '1px solid #CBD5E1',
  borderRadius: '6px',
  backgroundColor: '#F8FAFC',
  fontSize: '14px',
  boxSizing: 'border-box',
  fontFamily: 'Inter'
};

const smallButtonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  padding: '5px 10px',
  backgroundColor: '#FFFFFF',
  color: '#64748B',
  borderRadius: '6px',
  border: '1px solid #CBD5E1',
  cursor: 'pointer',
  fontFamily: 'Inter',
  fontSize: '12px'
};

// ---------- Decoration pool picker ----------

interface DecorationPickerProps {
  label: string;
  value: string | null; // selected image url
  allowNone?: boolean;
  decorations: AwardDecorationImage[];
  onSelect: (url: string | null) => void;
  onDecorationsChanged: () => Promise<void> | void;
  canManage: boolean;
  onError: (message: string) => void;
}

export const DecorationPicker: React.FC<DecorationPickerProps> = ({
  label,
  value,
  allowNone = false,
  decorations,
  onSelect,
  onDecorationsChanged,
  canManage,
  onError
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    try {
      const { data, error } = await createDecorationImage(file.name.replace(/\.[^.]+$/, ''), file);
      if (error || !data) {
        onError(`Decoration upload failed: ${error?.message || 'unknown error'}`);
        return;
      }
      await onDecorationsChanged();
      onSelect(data.image_url);
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteFromPool = async (decoration: AwardDecorationImage, e: React.MouseEvent) => {
    e.stopPropagation();
    const { success, error } = await deleteDecorationImage(decoration.id);
    if (!success) {
      onError(error?.message || 'Failed to delete the decoration');
      return;
    }
    if (value === decoration.image_url) onSelect(null);
    await onDecorationsChanged();
  };

  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        {allowNone && (
          <div
            onClick={() => onSelect(null)}
            title="No device"
            style={{
              width: '44px',
              height: '44px',
              border: value === null ? '2px solid #3B82F6' : '1px dashed #CBD5E1',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontSize: '10px',
              color: '#94A3B8'
            }}
          >
            None
          </div>
        )}
        {decorations.map(decoration => (
          <div
            key={decoration.id}
            onClick={() => onSelect(decoration.image_url)}
            title={decoration.name}
            style={{
              position: 'relative',
              width: '44px',
              height: '44px',
              // Checkerboard so transparent overlays are visible
              backgroundImage: `url(${decoration.image_url}), linear-gradient(45deg, #E2E8F0 25%, transparent 25%, transparent 75%, #E2E8F0 75%), linear-gradient(45deg, #E2E8F0 25%, transparent 25%, transparent 75%, #E2E8F0 75%)`,
              backgroundSize: 'contain, 12px 12px, 12px 12px',
              backgroundPosition: 'center, 0 0, 6px 6px',
              backgroundRepeat: 'no-repeat, repeat, repeat',
              border: value === decoration.image_url ? '2px solid #3B82F6' : '1px solid #E2E8F0',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            {canManage && (
              <button
                onClick={(e) => handleDeleteFromPool(decoration, e)}
                title={`Remove "${decoration.name}" from the pool`}
                style={{
                  position: 'absolute',
                  top: '-6px',
                  right: '-6px',
                  width: '16px',
                  height: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #FCA5A5',
                  borderRadius: '50%',
                  color: '#DC2626',
                  cursor: 'pointer',
                  padding: 0
                }}
              >
                <X size={10} />
              </button>
            )}
          </div>
        ))}
        {canManage && (
          <>
            <input
              type="file"
              ref={inputRef}
              accept="image/png,image/webp,image/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                handleUpload(e.target.files?.[0] || null);
                e.target.value = '';
              }}
            />
            <button
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              title="Upload a transparent decoration image (e.g. a single bronze star) into the shared pool"
              style={{
                width: '44px',
                height: '44px',
                border: '1px dashed #CBD5E1',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'transparent',
                color: '#64748B',
                cursor: uploading ? 'wait' : 'pointer'
              }}
            >
              <Upload size={16} />
            </button>
          </>
        )}
      </div>
    </div>
  );
};

// ---------- Device config editor ----------

const newTier = (): AwardDeviceTier => ({
  id: newRuleId(),
  name: '',
  imageUrl: '',
  rules: { ...emptyRuleGroup('and'), children: [newRuleCondition()] }
});

const AwardDeviceEditor: React.FC<AwardDeviceEditorProps> = ({
  config,
  onChange,
  decorations,
  onDecorationsChanged,
  cycles,
  qualifyingCycleTypes,
  canManage,
  onError
}) => {
  const mode = config?.mode || 'none';

  const setMode = (nextMode: 'none' | 'repeat' | 'tier') => {
    if (nextMode === 'none') {
      onChange(null);
      return;
    }
    if (nextMode === 'repeat') {
      onChange({
        version: 1,
        mode: 'repeat',
        repeat: config?.repeat || { bronzeImageUrl: '', silverImageUrl: null, silverWorth: 5 }
      });
      return;
    }
    onChange({
      version: 1,
      mode: 'tier',
      tiers: config?.tiers?.length ? config.tiers : [newTier()]
    });
  };

  const updateRepeat = (updates: Partial<NonNullable<AwardDeviceConfig['repeat']>>) => {
    if (!config?.repeat) return;
    onChange({ ...config, repeat: { ...config.repeat, ...updates } });
  };

  const updateTier = (index: number, updates: Partial<AwardDeviceTier>) => {
    if (!config?.tiers) return;
    const tiers = [...config.tiers];
    tiers[index] = { ...tiers[index], ...updates };
    onChange({ ...config, tiers });
  };

  return (
    <div>
      <label style={labelStyle}>Devices (stars)</label>
      <div style={{ maxWidth: '420px' }}>
        <StyledSelect
          value={mode}
          onChange={(nextMode) => setMode(nextMode as 'none' | 'repeat' | 'tier')}
          options={[
            { value: 'none', label: 'No devices' },
            { value: 'repeat', label: 'Repeat devices — a device per additional award (e.g. deployment ribbon)' },
            { value: 'tier', label: 'Tiered device — earned by criteria per issuance (e.g. attendance stars)' }
          ]}
        />
      </div>

      {mode === 'repeat' && config?.repeat && (
        <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <DecorationPicker
            label="Bronze device (one per additional award) *"
            value={config.repeat.bronzeImageUrl || null}
            decorations={decorations}
            onSelect={(url) => updateRepeat({ bronzeImageUrl: url || '' })}
            onDecorationsChanged={onDecorationsChanged}
            canManage={canManage}
            onError={onError}
          />
          <DecorationPicker
            label={`Silver device (replaces ${config.repeat.silverWorth} bronze — optional)`}
            value={config.repeat.silverImageUrl}
            allowNone
            decorations={decorations}
            onSelect={(url) => updateRepeat({ silverImageUrl: url })}
            onDecorationsChanged={onDecorationsChanged}
            canManage={canManage}
            onError={onError}
          />
          <div>
            <label style={labelStyle}>Silver worth</label>
            <input
              type="number"
              min={2}
              max={10}
              value={config.repeat.silverWorth}
              onChange={(e) => updateRepeat({ silverWorth: Math.max(2, Number(e.target.value) || 5) })}
              style={{ ...inputStyle, width: '90px' }}
            />
          </div>
          <div style={{ fontSize: '12px', color: '#94A3B8' }}>
            The first award shows the plain image; each further award adds a bronze device, with a silver device replacing
            every {config.repeat.silverWorth} bronze. Upload transparent images of a single device — they are composited onto the award image automatically.
          </div>
        </div>
      )}

      {mode === 'tier' && config?.tiers && (
        <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ fontSize: '12px', color: '#94A3B8' }}>
            Tiers are checked from bottom to top against the same cycle metrics as the eligibility criteria; the highest tier
            whose conditions pass is stamped on the issuance. Pilots matching no tier receive the base award.
          </div>
          {config.tiers.map((tier, index) => (
            <div key={tier.id} style={{ border: '1px solid #E2E8F0', borderRadius: '8px', padding: '12px' }}>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', marginBottom: '10px' }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Tier name *</label>
                  <input
                    type="text"
                    value={tier.name}
                    onChange={(e) => updateTier(index, { name: e.target.value })}
                    style={inputStyle}
                    placeholder='e.g. "Bronze star — over 50% attendance"'
                  />
                </div>
                <button
                  onClick={() => {
                    const tiers = config.tiers!.filter((_, i) => i !== index);
                    onChange(tiers.length > 0 ? { ...config, tiers } : null);
                  }}
                  title="Remove tier"
                  style={{ ...smallButtonStyle, padding: '8px', color: '#DC2626', borderColor: '#FCA5A5' }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <div style={{ marginBottom: '10px' }}>
                <DecorationPicker
                  label="Device image *"
                  value={tier.imageUrl || null}
                  decorations={decorations}
                  onSelect={(url) => updateTier(index, { imageUrl: url || '' })}
                  onDecorationsChanged={onDecorationsChanged}
                  canManage={canManage}
                  onError={onError}
                />
              </div>
              <label style={labelStyle}>Earned when</label>
              <AwardRuleBuilder
                group={tier.rules}
                onChange={(rules) => updateTier(index, { rules })}
                cycles={cycles}
                qualifyingCycleTypes={qualifyingCycleTypes}
              />
            </div>
          ))}
          <button
            onClick={() => onChange({ ...config, tiers: [...config.tiers!, newTier()] })}
            style={{ ...smallButtonStyle, alignSelf: 'flex-start' }}
          >
            <Plus size={12} /> Add tier
          </button>
        </div>
      )}
    </div>
  );
};

export default AwardDeviceEditor;
