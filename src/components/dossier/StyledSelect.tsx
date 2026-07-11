import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// Custom single-select dropdown — same look as the roster FilterDrawer's
// MultiSelectDropdown. Native <select> elements render their option list in
// the OS font, which clashes with the app's Inter styling, so anything in a
// polished surface should use this instead.
//
// The option list renders in a portal positioned at the trigger, so it hangs
// over dialog borders and scroll containers instead of being clipped by them.

export interface StyledSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface StyledSelectProps {
  value: string;
  options: StyledSelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  /** Shown when value matches no option (e.g. empty-value placeholder rows should be in options instead) */
  placeholder?: string;
}

const LIST_MAX_HEIGHT = 200;

const StyledSelect: React.FC<StyledSelectProps> = ({ value, options, onChange, disabled = false, placeholder }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [triggerRect, setTriggerRect] = useState<DOMRect | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const selected = options.find(o => o.value === value);

  const openList = () => {
    if (disabled || !triggerRef.current) return;
    setTriggerRect(triggerRef.current.getBoundingClientRect());
    setIsOpen(true);
  };

  // Close on outside clicks (the list lives in a portal, so check both refs),
  // and on any scroll/resize — the fixed-position list would detach otherwise
  useEffect(() => {
    if (!isOpen) return;
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!triggerRef.current?.contains(target) && !listRef.current?.contains(target)) {
        setIsOpen(false);
      }
    };
    const close = () => setIsOpen(false);
    document.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [isOpen]);

  // Open upward when there isn't room below the trigger
  const openUp = triggerRect
    ? triggerRect.bottom + LIST_MAX_HEIGHT + 8 > window.innerHeight && triggerRect.top > LIST_MAX_HEIGHT + 8
    : false;

  return (
    <div ref={triggerRef} style={{ position: 'relative', opacity: disabled ? 0.5 : 1 }}>
      <div
        onClick={() => (isOpen ? setIsOpen(false) : openList())}
        style={{
          padding: '8px 12px',
          border: '1px solid #CBD5E1',
          borderRadius: '6px',
          backgroundColor: '#F8FAFC',
          cursor: disabled ? 'not-allowed' : 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '8px',
          fontSize: '12px',
          fontFamily: 'Inter'
        }}
      >
        <span style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}>
          {selected?.label || placeholder || options[0]?.label || ''}
        </span>
        <span style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0 }}>
          ▼
        </span>
      </div>

      {isOpen && triggerRect && createPortal(
        <div
          ref={listRef}
          style={{
            position: 'fixed',
            ...(openUp
              ? { bottom: window.innerHeight - triggerRect.top + 4 }
              : { top: triggerRect.bottom + 4 }),
            left: triggerRect.left,
            width: triggerRect.width,
            backgroundColor: '#FFFFFF',
            border: '1px solid #CBD5E1',
            borderRadius: '6px',
            maxHeight: `${LIST_MAX_HEIGHT}px`,
            overflowY: 'auto',
            zIndex: 1100,
            boxShadow: '0px 4px 6px -1px rgba(0, 0, 0, 0.1)'
          }}
        >
          {options.map(option => (
            <div
              key={option.value}
              onClick={() => {
                if (option.disabled) return;
                onChange(option.value);
                setIsOpen(false);
              }}
              style={{
                padding: '8px 12px',
                cursor: option.disabled ? 'not-allowed' : 'pointer',
                backgroundColor: option.value === value ? '#EFF6FF' : 'transparent',
                transition: 'background-color 0.2s',
                fontSize: '12px',
                fontFamily: 'Inter',
                color: option.disabled ? '#94A3B8' : '#0F172A'
              }}
              onMouseEnter={e => {
                if (option.value !== value && !option.disabled) e.currentTarget.style.backgroundColor = '#F8FAFC';
              }}
              onMouseLeave={e => {
                if (option.value !== value && !option.disabled) e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              {option.label}
            </div>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
};

export default StyledSelect;
