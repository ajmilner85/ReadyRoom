import React from 'react';
import { Select } from '../ui/primitives';

// Legacy single-select API (awards UI, comms popovers, settings), now rendered by the kit Select
// so every dropdown in the app shares one look. The option list is portaled (kit Floating), so it
// still hangs over dialog borders and scroll containers instead of being clipped by them.

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

const StyledSelect: React.FC<StyledSelectProps> = ({ value, options, onChange, disabled = false, placeholder }) => (
  <Select
    value={value}
    onChange={onChange}
    disabled={disabled}
    placeholder={placeholder ?? 'Select…'}
    options={options.map(o => ({ value: o.value, label: o.label, disabled: o.disabled }))}
  />
);

export default StyledSelect;
