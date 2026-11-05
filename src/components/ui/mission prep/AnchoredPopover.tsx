import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface AnchoredPopoverProps {
  anchorRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  width?: number;
  children: React.ReactNode;
}

/**
 * Lightweight popover rendered in a portal and right-aligned under its anchor button.
 * Closes on outside click, Escape, and window resize. Clicks inside StyledSelect option
 * lists (also portals) are not treated as outside clicks.
 */
const AnchoredPopover: React.FC<AnchoredPopoverProps> = ({ anchorRef, onClose, width = 320, children }) => {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect) return;
    const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
    setPosition({ top: rect.bottom + 6, left });
  }, [anchorRef, width]);

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (popoverRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return; // anchor toggles itself
      if (target.closest?.('[data-styled-select-list]')) return;
      onClose();
    };
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKey);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKey);
      window.removeEventListener('resize', onClose);
    };
  }, [anchorRef, onClose]);

  if (!position) return null;

  return createPortal(
    <div
      ref={popoverRef}
      style={{
        position: 'fixed',
        top: position.top,
        left: position.left,
        width,
        backgroundColor: 'var(--rr-panel)',
        border: '1px solid var(--rr-border)',
        borderRadius: '8px',
        boxShadow: 'var(--rr-shadow)',
        padding: '16px',
        zIndex: 1050,
        fontFamily: 'inherit',
        boxSizing: 'border-box'
      }}
    >
      {children}
    </div>,
    document.body
  );
};

export const popoverLabelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '12px',
  fontWeight: 500,
  color: 'var(--rr-text)',
  marginBottom: '6px'
};

export const popoverInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  border: '1px solid var(--rr-border2)',
  borderRadius: '6px',
  backgroundColor: 'var(--rr-panel2)',
  fontSize: '12px',
  fontFamily: 'inherit',
  boxSizing: 'border-box'
};

export const PopoverActions: React.FC<{
  confirmLabel: string;
  confirmDisabled?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ confirmLabel, confirmDisabled, busy, onConfirm, onCancel }) => {
  const disabled = confirmDisabled || busy;
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
      <button
        onClick={onCancel}
        style={{
          padding: '6px 14px',
          backgroundColor: 'var(--rr-panel)',
          color: 'var(--rr-text)',
          border: '1px solid var(--rr-border2)',
          borderRadius: '6px',
          fontSize: '12px',
          fontWeight: 500,
          cursor: 'pointer'
        }}
      >
        Cancel
      </button>
      <button
        onClick={onConfirm}
        disabled={disabled}
        style={{
          padding: '6px 14px',
          backgroundColor: disabled ? '#94A3B8' : 'var(--rr-accent)',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          fontSize: '12px',
          fontWeight: 500,
          cursor: disabled ? 'not-allowed' : 'pointer'
        }}
      >
        {busy ? 'Working…' : confirmLabel}
      </button>
    </div>
  );
};

export default AnchoredPopover;
