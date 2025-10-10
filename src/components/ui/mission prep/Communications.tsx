import React, { useState, useEffect } from 'react';
import { Card } from '../card';
import { FileDown, Edit2, Check, X, Send } from 'lucide-react';
import { styles } from '../../../styles/commsStyles';
import { 
  isValidFrequency, 
  isValidTACAN, 
  isValidILS,
  isValidKYFill,
  hasFrequencyConflict 
} from '../../../utils/commsUtils';
import { 
  CommsPlanEntry, 
  generateInitialCommsData 
} from '../../../types/CommsTypes';
import { Flight, FlightMember } from '../../../types/FlightData';
import { saveToLocalStorage, loadFromLocalStorage, STORAGE_KEYS } from '../../../utils/localStorageUtils';

interface CommunicationsProps {
  width: string;
  assignedPilots?: Record<string, any> | null;
  onTransferToMission?: (flights: Flight[]) => void;
  flights?: any[];
  extractedFlights?: Array<{
    name: string;
    units: Array<{
      name: string;
      type: string;
      onboard_num: string;
      callsign?: { [key: number]: string | number } | string;
      fuel: number;
    }>;
  }>;
  squadrons?: Array<{
    id: string;
    name: string;
    callsigns?: string[];
    color_palette?: any;
  }>;
}

const Communications: React.FC<CommunicationsProps> = ({ 
  width, 
  assignedPilots = {},
  onTransferToMission,
  flights = [],
  extractedFlights = [],
  squadrons = []
}) => {  // Initialize state with data from localStorage if available
  const [commsData, setCommsData] = useState<CommsPlanEntry[]>(() => {
    return loadFromLocalStorage<CommsPlanEntry[]>(STORAGE_KEYS.COMMS_PLAN, generateInitialCommsData());
  });
  
  const [isEditing, setIsEditing] = useState(false);
  const [editedData, setEditedData] = useState<CommsPlanEntry[]>([]);
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  // Save comms plan to localStorage whenever it changes
  useEffect(() => {
    saveToLocalStorage(STORAGE_KEYS.COMMS_PLAN, commsData);
  }, [commsData]);

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
    // No need to explicitly save to localStorage here as the useEffect will handle it
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
    } else if (field === 'ils' && value !== '——') {
      // Make sure ILS is an integer between 1-20
      const ilsNum = parseInt(value, 10);
      if (!isNaN(ilsNum) && isValidILS(value)) {
        processedValue = ilsNum.toString();
      }
    } else if (field === 'kyFill' && value !== '——') {
      // Make sure KY Fill is an integer between 1-6
      const kyFillNum = parseInt(value, 10);
      if (!isNaN(kyFillNum) && isValidKYFill(value)) {
        processedValue = kyFillNum.toString();
      }
    }

    newData[index] = {
      ...newData[index],
      [field]: processedValue
    };

    setEditedData(newData);
  };

  // Function to calculate total fuel including external tanks
  const calculateTotalFuel = (unit: any) => {
    let totalFuel = unit.fuel || 4900; // Default to standard F/A-18C internal fuel if not specified

    try {
      if (unit.payload?.pylons) {
        // Handle both array and object pylon structures
        const pylonValues = Array.isArray(unit.payload.pylons) 
          ? unit.payload.pylons
          : Object.values(unit.payload.pylons);

        pylonValues.forEach((pylon: { CLSID: string }) => {
          if (!pylon || typeof pylon !== 'object') return;
          
          const clsid = pylon.CLSID;
          if (!clsid) return;

          // Only count FPU-8A tanks for F/A-18C
          if (clsid === '{FPU_8A_FUEL_TANK}' && unit.type === 'FA-18C_hornet') {
            totalFuel += 2200;
          }
        });
      }
    } catch (error) {
      console.error('Error calculating fuel:', error);
    }

    return totalFuel;
  };

  // Parse a group name into callsign and flight number
  const parseGroupName = (name: string): { callsign: string; flightNumber: string } => {
    // Split on last space to handle callsigns with spaces
    const lastSpaceIndex = name.lastIndexOf(' ');
    if (lastSpaceIndex === -1) {
      return { callsign: name, flightNumber: "1" };
    }
    
    const callsign = name.substring(0, lastSpaceIndex);
    const flightNumber = name.substring(lastSpaceIndex + 1);
    
    // Validate that flight number is actually a number
    if (!/^\d+$/.test(flightNumber)) {
      return { callsign: name, flightNumber: "1" };
    }
    
    return { callsign, flightNumber };
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
      const assigned = assignedPilots?.[flight.id] || [];
      
      // Find which squadron owns this callsign
      const owningSquadron = squadrons.find(sq => 
        sq.callsigns && Array.isArray(sq.callsigns) && 
        sq.callsigns.some((cs: string) => cs.toUpperCase() === flight.callsign.toUpperCase())
      );
      
      // Find matching extracted flight directly from extractedFlights by callsign and flight number
      const matchingExtractedFlight = extractedFlights.find(ef => {
        const { callsign, flightNumber } = parseGroupName(ef.name);
        return callsign.toUpperCase() === flight.callsign && 
               flightNumber === flight.flightNumber;
      });
      
      // Create a FlightMember for each assigned pilot
      const members = flight.pilots.map((pilot: any) => {
        const assignedPilot = assigned.find((p: any) => p.dashNumber === pilot.dashNumber);
        
        // Default fuel value - will use this if we can't find a match
        let fuelValue = 5.0;
        
        // Try to get fuel directly from matching extracted flight
        if (matchingExtractedFlight && matchingExtractedFlight.units) {
          // Get the dash number (1-based) and convert to 0-based index
          const dashPosition = parseInt(pilot.dashNumber) - 1;
          
          // Check if we have that unit position in the extracted flight
          if (dashPosition >= 0 && dashPosition < matchingExtractedFlight.units.length) {
            const unit = matchingExtractedFlight.units[dashPosition];
            
            // Use our calculateTotalFuel function to get the proper total fuel value including external tanks
            if (unit) {
              // Calculate total fuel in pounds including external tanks
              const totalFuelPounds = calculateTotalFuel(unit);
              
              // Convert from pounds to 1000s of pounds (divide by 1000)
              fuelValue = totalFuelPounds / 1000;
            }
          }
        }
        
        return {
          dashNumber: pilot.dashNumber,
          boardNumber: assignedPilot?.boardNumber || "",
          fuel: fuelValue,
          pilotCallsign: assignedPilot?.callsign || ""
        };
      }).filter((member: any) => member.boardNumber !== ""); // Only include members with assigned board numbers
      
      // Only include flights that have at least one assigned pilot
      if (members.length === 0) return null;
      
      // Calculate the low state as the minimum fuel among all members
      const lowState = Math.min(...members.map((m: FlightMember) => m.fuel));
      
      // Determine aircraft type from squadron's airframe (preferred) or DCS mission data (fallback)
      let aircraftType: string | undefined;
      
      // First priority: Use squadron's airframe if available
      if (owningSquadron && (owningSquadron as any).airframe) {
        aircraftType = (owningSquadron as any).airframe.designation;
      } 
      // Fallback: Extract from DCS mission file
      else if (matchingExtractedFlight && matchingExtractedFlight.units && matchingExtractedFlight.units.length > 0) {
        aircraftType = matchingExtractedFlight.units[0].type;
      }
      
      const flightData = {
        id: `transferred-${flight.id}-${Date.now()}`,
        flightNumber: flight.flightNumber,
        callsign: flight.callsign,
        members,
        lowState, // Use calculated low state instead of hardcoded value
        currentSection: "", // Empty string for unassigned flights
        currentDivision: 0,
        formation: members.length > 1 ? "group" : "single",
        squadronId: owningSquadron?.id,
        squadronColorPalette: owningSquadron?.color_palette ? {
          primary: owningSquadron.color_palette.primary,
          accent: owningSquadron.color_palette.accent
        } : undefined,
        aircraftType
      };
      
      return flightData;
    }).filter(Boolean) as Flight[];
      onTransferToMission(transferFlights);
    setShowConfirmDialog(false);
  };

  const renderCommsPlanTable = () => (
    <table className="w-full" style={{ tableLayout: 'auto' }}>
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
            <td style={{
              ...styles.tableCell,
              textAlign: 'center',
              color: isEditing && !isValidILS(row.ils) ? '#DC2626' : 
                     row.ils === '——' ? '#94A3B8' : 'inherit'
            }}>
              {isEditing ? (
                <input
                  type="text"
                  value={row.ils === '——' ? '' : row.ils}
                  onChange={(e) => handleCellEdit(index, 'ils', e.target.value)}
                  style={{...styles.tableInput, textAlign: 'center'}}
                />
              ) : (
                <span style={row.ils === '——' ? styles.tableCellPlaceholder : undefined}>
                  {row.ils}
                </span>
              )}
            </td>
            <td style={{
              ...styles.tableCell,
              textAlign: 'center',
              color: isEditing && !isValidKYFill(row.kyFill) ? '#DC2626' : 
                     row.kyFill === '——' ? '#94A3B8' : 'inherit'
            }}>
              {isEditing ? (
                <input
                  type="text"
                  value={row.kyFill === '——' ? '' : row.kyFill}
                  onChange={(e) => handleCellEdit(index, 'kyFill', e.target.value)}
                  style={{...styles.tableInput, textAlign: 'center'}}
                />
              ) : (
                <span style={row.kyFill === '——' ? styles.tableCellPlaceholder : undefined}>
                  {row.kyFill}
                </span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '20px',
      width
    }}>
      <Card style={{...styles.cardBase, flex: '1 1 auto'}}>
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

      <Card style={{...styles.cardBase, flex: '0 0 auto'}}>
        <div style={styles.sectionHeader}>
          <span style={styles.headerLabel}>Export</span>
        </div>
        <div style={{
          display: 'flex',
          justifyContent: 'space-around',
          padding: '18px 0 0 0'
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