import React, { useState } from 'react';
import { styles } from '../../styles/commsStyles';
import { CommsPlanEntry } from '../../types/CommsTypes';
import {
  isValidFrequency,
  isValidTACAN,
  isValidILS,
  isValidKYFill,
  hasFrequencyConflict
} from '../../utils/commsUtils';

interface CommsEntriesEditorProps {
  entries: CommsPlanEntry[];
  onChange: (entries: CommsPlanEntry[]) => void;
  readOnly?: boolean;
}

/** Editable comms card table — same columns, styling and validation as the Mission Prep Comms Plan card. */
const CommsEntriesEditor: React.FC<CommsEntriesEditorProps> = ({ entries, onChange, readOnly = false }) => {
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);

  const setField = (index: number, field: keyof CommsPlanEntry, value: string) => {
    const next = [...entries];
    next[index] = { ...next[index], [field]: value.trim() === '' ? '——' : value };
    onChange(next);
  };

  const handleFrequencyBlur = (index: number) => {
    const freq = entries[index].freq;
    if (freq === '——' || freq === '') return;
    const num = parseFloat(freq);
    if (!isNaN(num) && isValidFrequency(freq)) {
      const next = [...entries];
      next[index] = { ...next[index], freq: num.toFixed(3) };
      onChange(next);
    }
  };

  const cellValue = (v: string) => (v === '——' ? '' : v);

  const renderCell = (
    row: CommsPlanEntry,
    index: number,
    field: 'name' | 'freq' | 'tacan' | 'ils' | 'kyFill',
    invalid: boolean,
    align: 'left' | 'center'
  ) => (
    <td style={{
      ...styles.tableCell,
      textAlign: align,
      color: invalid ? '#DC2626' : row[field] === '——' ? '#94A3B8' : 'inherit'
    }}>
      {readOnly ? (
        <span style={row[field] === '——' ? styles.tableCellPlaceholder : undefined}>{row[field]}</span>
      ) : (
        <input
          type="text"
          value={cellValue(row[field] as string)}
          onChange={e => setField(index, field, e.target.value)}
          onBlur={field === 'freq' ? () => handleFrequencyBlur(index) : undefined}
          style={{ ...styles.tableInput, textAlign: align }}
        />
      )}
    </td>
  );

  return (
    <table className="w-full" style={{ tableLayout: 'auto', width: '100%' }}>
      <colgroup>
        <col style={{ width: '50px' }} />
        <col />
        <col style={{ width: '80px' }} />
        <col style={{ width: '70px' }} />
        <col style={{ width: '45px' }} />
        <col style={{ width: '75px' }} />
      </colgroup>
      <thead>
        <tr>
          <th style={{ ...styles.tableHeader, textAlign: 'center' }}>Chan</th>
          <th style={{ ...styles.tableHeader, textAlign: 'left' }}>Name</th>
          <th style={{ ...styles.tableHeader, textAlign: 'left' }}>Freq</th>
          <th style={{ ...styles.tableHeader, textAlign: 'center' }}>TACAN</th>
          <th style={{ ...styles.tableHeader, textAlign: 'center' }}>ILS</th>
          <th style={{ ...styles.tableHeader, textAlign: 'center' }}>KY Fill</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((row, index) => (
          <tr
            key={`${row.radio || 'PRI'}-${row.chan}-${index}`}
            style={{
              backgroundColor: hoveredRow === index ? 'rgba(100, 116, 139, 0.1)' :
                index % 2 === 0 ? '#F8FAFC' : 'transparent',
              transition: 'background-color 0.2s ease'
            }}
            onMouseEnter={() => setHoveredRow(index)}
            onMouseLeave={() => setHoveredRow(null)}
          >
            <td style={{ ...styles.tableCell, textAlign: 'center' }}>{row.chan}</td>
            {renderCell(row, index, 'name', false, 'left')}
            {renderCell(row, index, 'freq', !isValidFrequency(row.freq) || hasFrequencyConflict(row.freq, entries, index), 'left')}
            {renderCell(row, index, 'tacan', !isValidTACAN(row.tacan), 'center')}
            {renderCell(row, index, 'ils', !isValidILS(row.ils), 'center')}
            {renderCell(row, index, 'kyFill', !isValidKYFill(row.kyFill), 'center')}
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export default CommsEntriesEditor;
