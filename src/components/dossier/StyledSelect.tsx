import React, { useEffect, useRef, useState } from 'react';

// Custom single-select dropdown — same look as the roster FilterDrawer's
// MultiSelectDropdown. Native <select> elements render their option list in
// the OS font, which clashes with the app's Inter styling, so anything in a
// polished surface should use this instead.

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

const StyledSelect: React.FC<StyledSelectProps> = ({ value, options, onChange, disabled = false, placeholder }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selected = options.find(o => o.value === value);

  // Close when clicking anywhere outside
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  return (
    <div ref={containerRef} style={{ position: 'relative', overflow: 'visible', opacity: disabled ? 0.5 : 1 }}>
      <div
        onClick={() => { if (!disabled) setIsOpen(!isOpen); }}
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

      {isOpen && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          backgroundColor: '#FFFFFF',
          border: '1px solid #CBD5E1',
          borderRadius: '6px',
          maxHeight: '200px',
          overflowY: 'auto',
          zIndex: 1000,
          boxShadow: '0px 4px 6px -1px rgba(0, 0, 0, 0.1)',
          marginTop: '4px'
        }}>
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
        </div>
      )}
    </div>
  );
};

export default StyledSelect;
