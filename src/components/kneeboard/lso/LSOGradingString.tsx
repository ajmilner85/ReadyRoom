import React, { useState, useRef, useCallback, type ReactNode } from 'react';
import { Trash2, Check } from 'lucide-react';

// Parse shorthand string: render _text_ segments as underlined spans
function renderShorthand(text: string): ReactNode {
  const parts = text.split(/(_[^_]+_)/g);
  return parts.map((part, i) => {
    const match = part.match(/^_([^_]+)_$/);
    if (match) {
      return <u key={i} style={{ textUnderlineOffset: '5px' }}>{match[1]}</u>;
    }
    return part || null;
  });
}

interface LSOGradingStringProps {
  theme: 'light' | 'dark';
  colors: Record<string, string>;
  shorthand: string;
  pilotBoardNumber: string;
  pilotCallsign: string | null;
  canSave: boolean;
  saving: boolean;
  onDelete: () => void;
  onSave: () => Promise<boolean>;
  cellSize: number;
}

const GAP = 6;

const LSOGradingString: React.FC<LSOGradingStringProps> = ({
  theme,
  colors,
  shorthand,
  pilotBoardNumber,
  pilotCallsign,
  canSave,
  saving: _saving,
  onDelete,
  onSave,
  cellSize,
}) => {
  // Delete button: tap once -> "OK?", tap again within 3s -> delete
  const [deleteState, setDeleteState] = useState<'idle' | 'confirming'>('idle');
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Save button: tap once -> confirm, tap again -> save, then show checkmark
  const [saveState, setSaveState] = useState<'idle' | 'confirming' | 'saved'>('idle');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleDeleteTap = useCallback(() => {
    if (deleteState === 'idle') {
      setDeleteState('confirming');
      deleteTimerRef.current = setTimeout(() => {
        setDeleteState('idle');
      }, 3000);
    } else if (deleteState === 'confirming') {
      if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
      setDeleteState('idle');
      onDelete();
    }
  }, [deleteState, onDelete]);

  const handleSaveTap = useCallback(async () => {
    if (saveState === 'idle') {
      setSaveState('confirming');
      saveTimerRef.current = setTimeout(() => {
        setSaveState('idle');
      }, 3000);
    } else if (saveState === 'confirming') {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      const success = await onSave();
      if (success) {
        setSaveState('saved');
        setTimeout(() => {
          setSaveState('idle');
        }, 3000);
      } else {
        setSaveState('idle');
      }
    }
  }, [saveState, onSave]);

  const deleteButtonBg = deleteState === 'confirming'
    ? (theme === 'dark' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(239, 68, 68, 0.15)')
    : (theme === 'dark' ? '#2a2a4e' : '#e5e7eb');

  const deleteButtonBorder = deleteState === 'confirming'
    ? `2px solid ${colors.error}`
    : `1px solid ${colors.border}`;

  const saveButtonBg = saveState === 'saved'
    ? (theme === 'dark' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(16, 185, 129, 0.2)')
    : saveState === 'confirming'
      ? (theme === 'dark' ? 'rgba(124, 58, 237, 0.3)' : 'rgba(124, 58, 237, 0.15)')
      : (theme === 'dark' ? '#2a2a4e' : '#e5e7eb');

  const saveButtonBorder = saveState === 'saved'
    ? `2px solid ${colors.success}`
    : saveState === 'confirming'
      ? `2px solid ${colors.accent}`
      : `1px solid ${colors.border}`;

  const hasPilotInfo = pilotBoardNumber && pilotCallsign;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'stretch',
      gap: `${GAP}px`,
      flexShrink: 0,
    }}>
      {/* Delete button */}
      <button
        onClick={handleDeleteTap}
        style={{
          width: `${cellSize}px`,
          height: `${cellSize}px`,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: deleteButtonBg,
          border: deleteButtonBorder,
          borderRadius: '8px',
          cursor: 'pointer',
          color: deleteState === 'confirming' ? colors.error : colors.textSecondary,
          fontSize: '28px',
          fontWeight: deleteState === 'confirming' ? 700 : 500,
        }}
      >
        {deleteState === 'confirming' ? 'OK?' : <Trash2 size={48} strokeWidth={2.5} />}
      </button>

      {/* Grading string display */}
      <div style={{
        flex: 1,
        height: `${cellSize}px`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme === 'dark' ? '#1a1a2e' : '#f8f9fa',
        borderRadius: '8px',
        padding: '0 12px',
        overflow: 'hidden',
        position: 'relative',
      }}>
        {hasPilotInfo && (
          <span style={{
            position: 'absolute',
            top: '22px',
            left: 0,
            right: 0,
            textAlign: 'center',
            fontSize: '24px',
            fontWeight: 600,
            color: colors.textSecondary,
            whiteSpace: 'nowrap',
            textTransform: 'uppercase',
          }}>
            {pilotBoardNumber} {pilotCallsign}
          </span>
        )}
        <span style={{
          fontSize: '48px',
          fontWeight: 700,
          fontFamily: 'monospace',
          color: shorthand ? colors.text : colors.textSecondary,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {shorthand ? renderShorthand(shorthand) : '\u00A0'}
        </span>
      </div>

      {/* Save button */}
      <button
        onClick={handleSaveTap}
        disabled={!canSave && saveState === 'idle'}
        style={{
          width: `${cellSize}px`,
          height: `${cellSize}px`,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: saveButtonBg,
          border: saveButtonBorder,
          borderRadius: '8px',
          cursor: canSave || saveState !== 'idle' ? 'pointer' : 'not-allowed',
          color: saveState === 'saved'
            ? colors.success
            : saveState === 'confirming'
              ? colors.accent
              : canSave ? colors.textSecondary : colors.border,
          opacity: canSave || saveState !== 'idle' ? 1 : 0.5,
        }}
      >
        <Check size={56} strokeWidth={2.5} />
      </button>
    </div>
  );
};

export default LSOGradingString;
