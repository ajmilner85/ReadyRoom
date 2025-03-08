import React, { useState } from 'react';
import { Card } from '../card';
import { FileDown, Edit2, Check, X } from 'lucide-react';
import { styles } from '../../../styles/commsStyles';
import { 
  isValidFrequency, 
  isValidTACAN, 
  hasFrequencyConflict 
} from '../../../utils/commsUtils';
import { 
  CommsPlanEntry, 
  generateInitialCommsData 
} from '../../../types/CommsTypes';

interface CommunicationsProps {
  width: string;
}

const Communications: React.FC<CommunicationsProps> = ({ width }) => {
  const [selectedEncryption, setSelectedEncryption] = useState<number | null>(null);
  const [commsData, setCommsData] = useState<CommsPlanEntry[]>(generateInitialCommsData());
  const [isEditing, setIsEditing] = useState(false);
  const [editedData, setEditedData] = useState<CommsPlanEntry[]>([]);
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);

  const handleEncryptionSelect = (number: number) => {
    setSelectedEncryption(number === selectedEncryption ? null : number);
  };

  const startEditing = () => {
    setIsEditing(true);
    setEditedData([...commsData]);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditedData([]);
  };

  const saveChanges = () => {
    setCommsData(editedData);
    setIsEditing(false);
  };

  const handleCellEdit = (index: number, field: keyof CommsPlanEntry, value: string) => {
    const newData = [...editedData];
    let processedValue = value;

    // Format empty values
    if (value.trim() === '') {
      processedValue = '——';
    }

    // Apply field-specific validation and formatting
    if (field === 'freq' && value !== '——') {
      const numValue = parseFloat(value);
      if (!isNaN(numValue) && isValidFrequency(value)) {
        processedValue = numValue.toFixed(3);
      }
    }

    newData[index] = {
      ...newData[index],
      [field]: processedValue
    };

    setEditedData(newData);
  };

  const renderEncryptionCard = () => (
    <Card style={styles.cardBase}>
      <div style={styles.sectionHeader}>
        <span style={styles.headerLabel}>Encryption Channel</span>
      </div>
      <div style={styles.encryptionContainer}>
        {[1, 2, 3, 4, 5, 6].map((number) => (
          <button
            key={number}
            onClick={() => handleEncryptionSelect(number)}
            style={{
              ...styles.encryptionButton,
              backgroundColor: selectedEncryption === number ? '#F24607' : '#FFFFFF',
              color: selectedEncryption === number ? '#FFFFFF' : '#64748B',
            }}
            onMouseEnter={e => {
              if (selectedEncryption !== number) {
                e.currentTarget.style.backgroundColor = '#F8FAFC';
              }
            }}
            onMouseLeave={e => {
              if (selectedEncryption !== number) {
                e.currentTarget.style.backgroundColor = '#FFFFFF';
              }
            }}
          >
            {number}
          </button>
        ))}
      </div>
    </Card>
  );

  const renderCommsPlanTable = () => (
    <table className="w-full" style={{ tableLayout: 'auto' }}>
      <colgroup>
        <col style={{ width: '80px' }} />
        <col />
        <col style={{ width: '120px' }} />
        <col style={{ width: '100px' }} />
      </colgroup>
      <thead>
        <tr>
          <th style={{ ...styles.tableHeader, textAlign: 'center' }}>Chan</th>
          <th style={{ ...styles.tableHeader, textAlign: 'left' }}>Name</th>
          <th style={{ ...styles.tableHeader, textAlign: 'left' }}>Freq</th>
          <th style={{ ...styles.tableHeader, textAlign: 'center' }}>TACAN</th>
        </tr>
      </thead>
      <tbody>
        {(isEditing ? editedData : commsData).map((row, index) => (
          <tr 
            key={index}
            style={{
              backgroundColor: hoveredRow === index ? 'rgba(100, 116, 139, 0.1)' : 
                             index % 2 === 0 ? '#F8FAFC' : 'transparent',
              transition: 'background-color 0.2s ease'
            }}
            onMouseEnter={() => setHoveredRow(index)}
            onMouseLeave={() => setHoveredRow(null)}
          >
            <td style={{ ...styles.tableCell, textAlign: 'center' }}>
              {row.chan}
            </td>
            <td style={styles.tableCell}>
              {isEditing ? (
                <input
                  type="text"
                  value={row.name === '——' ? '' : row.name}
                  onChange={(e) => handleCellEdit(index, 'name', e.target.value)}
                  style={styles.tableInput}
                />
              ) : (
                <span style={row.name === '——' ? styles.tableCellPlaceholder : undefined}>
                  {row.name}
                </span>
              )}
            </td>
            <td style={{
              ...styles.tableCell,
              color: isEditing ? 
                (!isValidFrequency(row.freq) ? '#DC2626' : 
                 hasFrequencyConflict(row.freq, editedData, index) ? '#DC2626' : 'inherit') :
                (hasFrequencyConflict(row.freq, commsData, index) ? '#DC2626' : 
                 row.freq === '——' ? '#94A3B8' : 'inherit')
            }}>
              {isEditing ? (
                <input
                  type="text"
                  value={row.freq === '——' ? '' : row.freq}
                  onChange={(e) => handleCellEdit(index, 'freq', e.target.value)}
                  style={styles.tableInput}
                />
              ) : (
                <span style={row.freq === '——' ? styles.tableCellPlaceholder : undefined}>
                  {row.freq}
                </span>
              )}
            </td>
            <td style={{
              ...styles.tableCell,
              textAlign: 'center',
              color: isEditing && !isValidTACAN(row.tacan) ? '#DC2626' : 
                     row.tacan === '——' ? '#94A3B8' : 'inherit'
            }}>
              {isEditing ? (
                <input
                  type="text"
                  value={row.tacan === '——' ? '' : row.tacan}
                  onChange={(e) => handleCellEdit(index, 'tacan', e.target.value.toUpperCase())}
                  style={{...styles.tableInput, textAlign: 'center'}}
                />
              ) : (
                <span style={row.tacan === '——' ? styles.tableCellPlaceholder : undefined}>
                  {row.tacan}
                </span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      gap: '20px',
      width
    }}>
      {renderEncryptionCard()}

      <Card style={styles.cardBase}>
        <div style={{
          width: '100%',
          textAlign: 'center',
          marginBottom: '16px'
        }}>
          <span style={styles.headerLabel}>Comms Plan</span>
          {!isEditing ? (
            <button
              onClick={startEditing}
              style={{
                ...styles.editButton,
                position: 'absolute',
                right: '24px',
                top: '24px'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.15)';
                e.currentTarget.style.background = '#F8FAFC';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                e.currentTarget.style.background = 'white';
              }}
            >
              <Edit2 size={14} color="#64748B" />
            </button>
          ) : (
            <div style={{ 
              position: 'absolute',
              right: '24px',
              top: '24px',
              display: 'flex',
              gap: '8px'
            }}>
              <button
                onClick={saveChanges}
                style={styles.editButton}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.15)';
                  e.currentTarget.style.background = '#F8FAFC';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                  e.currentTarget.style.background = 'white';
                }}
              >
                <Check size={14} color="#64748B" />
              </button>
              <button
                onClick={cancelEditing}
                style={styles.editButton}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.15)';
                  e.currentTarget.style.background = '#F8FAFC';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                  e.currentTarget.style.background = 'white';
                }}
              >
                <X size={14} color="#64748B" />
              </button>
            </div>
          )}
        </div>
        <div className="space-y-4" style={{ overflowX: 'hidden' }}>
          {renderCommsPlanTable()}
        </div>
      </Card>

      <Card style={styles.cardBase}>
        <div style={styles.sectionHeader}>
          <span style={styles.headerLabel}>Export</span>
        </div>
        <div className="flex gap-4">
          <button 
            style={styles.exportButton}
            onMouseEnter={e => {
              e.currentTarget.style.backgroundColor = '#F8FAFC';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.backgroundColor = '#FFFFFF';
            }}
          >
            <FileDown size={16} />
            Export Kneeboards
          </button>
          <button 
            style={styles.exportButton}
            onMouseEnter={e => {
              e.currentTarget.style.backgroundColor = '#F8FAFC';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.backgroundColor = '#FFFFFF';
            }}
          >
            <FileDown size={16} />
            Transfer to Mission
          </button>
        </div>
      </Card>
    </div>
  );
};

export default Communications;