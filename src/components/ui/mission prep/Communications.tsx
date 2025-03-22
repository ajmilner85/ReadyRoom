import React, { useState } from 'react';
import { Card } from '../card';
import { FileDown, Edit2, Check, X, Send } from 'lucide-react';
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
import { Flight } from '../../../types/FlightData';

interface CommunicationsProps {
  width: string;
  assignedPilots?: Record<string, any> | null;
  onTransferToMission?: (flights: Flight[]) => void;
  flights?: any[];
}

const Communications: React.FC<CommunicationsProps> = ({ 
  width, 
  assignedPilots = {},
  onTransferToMission,
  flights = []
}) => {
  const [selectedEncryption, setSelectedEncryption] = useState<number | null>(null);
  const [commsData, setCommsData] = useState<CommsPlanEntry[]>(generateInitialCommsData());
  const [isEditing, setIsEditing] = useState(false);
  const [editedData, setEditedData] = useState<CommsPlanEntry[]>([]);
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

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

  const handleTransferToMission = () => {
    if (onTransferToMission && flights.length > 0) {
      // If there are already flights in the mission execution page, show confirmation dialog
      setShowConfirmDialog(true);
    } else {
      // Otherwise, transfer flights immediately
      transferFlights();
    }
  };

  const transferFlights = () => {
    if (!onTransferToMission) return;
    
    // Convert flight assignments to Flight objects
    const transferFlights: Flight[] = flights.map(flight => {
      const assigned = assignedPilots[flight.id] || [];
      
      // Create a FlightMember for each assigned pilot
      const members = flight.pilots.map(pilot => {
        const assignedPilot = assigned.find(p => p.dashNumber === pilot.dashNumber);
        
        return {
          dashNumber: pilot.dashNumber,
          boardNumber: assignedPilot?.boardNumber || "",
          fuel: 5.0, // Default initial fuel state
          pilotCallsign: assignedPilot?.callsign || ""
        };
      }).filter(member => member.boardNumber !== ""); // Only include members with assigned board numbers
      
      // Only include flights that have at least one assigned pilot
      if (members.length === 0) return null;
      
      return {
        id: `transferred-${flight.id}-${Date.now()}`,
        flightNumber: flight.flightNumber,
        callsign: flight.callsign,
        members,
        lowState: 5.0, // Default initial low state
        currentSection: "", // Empty string for unassigned flights
        currentDivision: 0,
        formation: members.length > 1 ? "group" : "single"
      };
    }).filter(Boolean) as Flight[];
    
    onTransferToMission(transferFlights);
    setShowConfirmDialog(false);
  };

  const renderEncryptionCard = () => (
    <Card style={styles.cardBase}>
      <div style={styles.sectionHeader}>
        <span style={styles.headerLabel}>Encryption Channel</span>
      </div>
      <div style={{
        ...styles.encryptionContainer,
        display: 'flex',
        justifyContent: 'center',
        gap: 'calc(var(--encryption-button-size, 40px) / 2)' // Space between buttons is half of button width
      }}>
        {[1, 2, 3, 4, 5, 6].map((number) => (
          <button
            key={number}
            onClick={() => handleEncryptionSelect(number)}
            style={{
              ...styles.encryptionButton,
              backgroundColor: selectedEncryption === number ? '#F24607' : '#FFFFFF',
              color: selectedEncryption === number ? '#FFFFFF' : '#64748B',
              width: 'var(--encryption-button-size, 40px)',
              height: 'var(--encryption-button-size, 40px)',
              flexShrink: 0,
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
        <div style={{
          display: 'flex',
          justifyContent: 'space-around',
          padding: '16px'
        }}>
          <button 
            style={{
              ...styles.exportButton,
              flex: '1', // Changed from fixed percentage to flexible width
              margin: '0 16px',
              whiteSpace: 'nowrap', // Prevent text wrapping
              minWidth: '150px' // Add minimum width to ensure buttons have enough space
            }}
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
            style={{
              ...styles.exportButton,
              flex: '1', // Changed from fixed percentage to flexible width
              margin: '0 16px',
              whiteSpace: 'nowrap', // Prevent text wrapping
              minWidth: '150px' // Add minimum width to ensure buttons have enough space
            }}
            onClick={handleTransferToMission}
            onMouseEnter={e => {
              e.currentTarget.style.backgroundColor = '#F8FAFC';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.backgroundColor = '#FFFFFF';
            }}
          >
            <Send size={16} />
            Transfer to Mission
          </button>
        </div>
      </Card>

      {/* Confirmation Dialog */}
      {showConfirmDialog && (
        <>
          {/* Semi-transparent overlay */}
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 1000,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center'
          }} onClick={() => setShowConfirmDialog(false)} />
          
          {/* Dialog */}
          <div style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: 'white',
            padding: '24px',
            borderRadius: '8px',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
            width: '400px',
            zIndex: 1001
          }}>
            <h3 style={{
              fontSize: '18px',
              fontWeight: 600,
              marginBottom: '16px',
              textAlign: 'center'
            }}>
              Replace Mission Cards
            </h3>
            <p style={{
              fontSize: '14px',
              marginBottom: '24px',
              textAlign: 'center'
            }}>
              This will replace all existing cards in the Mission Execution page. Are you sure you want to continue?
            </p>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between'
            }}>
              <button
                onClick={() => setShowConfirmDialog(false)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#F1F5F9',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 500,
                  color: '#64748B'
                }}
              >
                Cancel
              </button>
              <button
                onClick={transferFlights}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#F24607',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 500,
                  color: 'white'
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Communications;