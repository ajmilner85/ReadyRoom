import React, { useState, useEffect } from 'react';
import { Trash2 } from 'lucide-react';

interface FlightEntry {
  callsign: string;
  quantity: number;
}

interface AddFlightDialogProps {
  onSave: (data: { flights: FlightEntry[] }) => void;
  onCancel: () => void;
  existingCallsigns: string[];
  initialCallsign?: string;
  title?: string;
  squadronCallsigns?: Array<{ squadronId: string; name: string; designation: string; insignia_url?: string | null; color_palette?: any; callsigns: string[] }>;
  selectedEvent?: any;
}

export const AddFlightDialog: React.FC<AddFlightDialogProps> = ({
  onSave,
  onCancel,
  existingCallsigns = [],
  squadronCallsigns = []
}) => {
  const [squadronFlights, setSquadronFlights] = useState<Record<string, number>>({});
  const [otherCallsign, setOtherCallsign] = useState('');
  const [otherFlights, setOtherFlights] = useState<Record<string, number>>({});
  const [error, setError] = useState('');
  
  // Auto-clear error message after 3 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(''), 3000);
      return () => clearTimeout(timer);
    }
  }, [error]);


  // Use the pre-filtered participating squadrons directly from the cache
  const participatingSquadrons = squadronCallsigns;

  // Add squadron flight
  const addSquadronFlight = (callsign: string) => {
    const currentCount = (squadronFlights[callsign] || 0) + (otherFlights[callsign] || 0);
    const existingCount = existingCallsigns.filter(c => c === callsign).length;
    
    if (currentCount + existingCount >= 6) {
      setError(`Cannot create more than 6 flights with callsign ${callsign}`);
      return;
    }
    
    setSquadronFlights(prev => ({
      ...prev,
      [callsign]: (prev[callsign] || 0) + 1
    }));
    setError('');
  };

  // Add other flight
  const addOtherFlight = () => {
    if (!otherCallsign.trim()) return;
    
    const callsign = otherCallsign.trim().toUpperCase();
    const currentCount = (squadronFlights[callsign] || 0) + (otherFlights[callsign] || 0);
    const existingCount = existingCallsigns.filter(c => c === callsign).length;
    
    if (currentCount + existingCount >= 6) {
      setError(`Cannot create more than 6 flights with callsign ${callsign}`);
      return;
    }
    
    setOtherFlights(prev => ({
      ...prev,
      [callsign]: (prev[callsign] || 0) + 1
    }));
    // Keep the callsign in the field so user can quickly add another
    setError('');
  };

  // Get all flights to be added as pills
  const getAllFlights = () => {
    const flights: Array<{ callsign: string; number: number; source: 'squadron' | 'other' | 'existing' }> = [];
    
    // Add existing flights
    existingCallsigns.forEach(callsign => {
      const existingCount = flights.filter(f => f.callsign === callsign).length + 1;
      flights.push({ callsign, number: existingCount, source: 'existing' });
    });
    
    // Add squadron flights
    Object.entries(squadronFlights).forEach(([callsign, count]) => {
      const baseCount = flights.filter(f => f.callsign === callsign).length;
      for (let i = 0; i < count; i++) {
        flights.push({ callsign, number: baseCount + i + 1, source: 'squadron' });
      }
    });
    
    // Add other flights
    Object.entries(otherFlights).forEach(([callsign, count]) => {
      const baseCount = flights.filter(f => f.callsign === callsign).length;
      for (let i = 0; i < count; i++) {
        flights.push({ callsign, number: baseCount + i + 1, source: 'other' });
      }
    });
    
    return flights;
  };

  // Group flights by callsign for row display
  const getFlightRows = () => {
    const flights = getAllFlights();
    const grouped: Record<string, Array<{ callsign: string; number: number; source: 'squadron' | 'other' | 'existing' }>> = {};
    
    flights.forEach(flight => {
      if (!grouped[flight.callsign]) {
        grouped[flight.callsign] = [];
      }
      grouped[flight.callsign].push(flight);
    });
    
    return Object.entries(grouped).map(([callsign, flights]) => ({
      callsign,
      flights: flights.sort((a, b) => a.number - b.number)
    }));
  };

  // Remove last flight from a callsign group
  const removeLastFlight = (callsign: string) => {
    // First try to remove from other flights
    if (otherFlights[callsign] > 0) {
      setOtherFlights(prev => ({
        ...prev,
        [callsign]: prev[callsign] - 1
      }));
    } else if (squadronFlights[callsign] > 0) {
      setSquadronFlights(prev => ({
        ...prev,
        [callsign]: prev[callsign] - 1
      }));
    }
  };

  // Handle save
  const handleSave = () => {
    const allFlights: FlightEntry[] = [];
    
    Object.entries(squadronFlights).forEach(([callsign, count]) => {
      if (count > 0) {
        allFlights.push({ callsign, quantity: count });
      }
    });
    
    Object.entries(otherFlights).forEach(([callsign, count]) => {
      if (count > 0) {
        allFlights.push({ callsign, quantity: count });
      }
    });
    
    onSave({ flights: allFlights });
  };

  // Get squadron primary color from color_palette
  const getSquadronColor = (squadron: any) => {
    if (squadron.color_palette?.primary) {
      return squadron.color_palette.primary;
    }
    // Fallback colors based on name
    if (squadron.name?.toLowerCase().includes('sting')) return '#FB923C'; // Orange
    if (squadron.name?.toLowerCase().includes('hawk')) return '#10B981'; // Green
    return '#6B7280'; // Default gray
  };

  // Get flight pill color
  const getFlightColor = (source: 'squadron' | 'other' | 'existing', callsign: string) => {
    if (source === 'existing') return '#E5E7EB'; // Light gray for existing
    
    // Check if callsign belongs to a participating squadron
    const squadron = participatingSquadrons.find(s => 
      s.callsigns.some(c => c.toLowerCase() === callsign.toLowerCase())
    );
    
    if (squadron) {
      return getSquadronColor(squadron);
    }
    
    return '#6B7280'; // Default gray for ad hoc flights
  };

  const flightRows = getFlightRows();
  
  // Calculate dialog width based on number of participating squadrons
  const getDialogWidth = () => {
    const squadronCount = participatingSquadrons.length;
    if (squadronCount === 0) return '480px'; // Base width for no squadrons
    if (squadronCount <= 2) return '464px'; // 200px + 16px + 200px + 48px (padding) = exact fit
    if (squadronCount === 3) return '720px'; // Width for 3 squadrons + padding
    return '720px'; // Width for 4+ squadrons in grid layout
  };

  return (
    <div style={{
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      backgroundColor: '#FFFFFF',
      borderRadius: '12px',
      padding: '24px',
      boxShadow: '0px 20px 25px -5px rgba(0, 0, 0, 0.1), 0px 10px 10px -5px rgba(0, 0, 0, 0.04)',
      zIndex: 1001,
      width: getDialogWidth(),
      maxHeight: '80vh',
      overflowY: 'auto'
    }}>
      {/* Title */}
      <div style={{
        fontSize: '18px',
        fontWeight: '600',
        color: '#111827',
        marginBottom: '24px',
        textAlign: 'center'
      }}>
ADD FLIGHT
      </div>

      {/* Loading spinner */}
      {participatingSquadrons.length === 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px',
        }}>
          <div style={{
            width: '24px',
            height: '24px',
            border: '2px solid #E5E7EB',
            borderTop: '2px solid #3B82F6',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }} />
          <style dangerouslySetInnerHTML={{
            __html: `
              @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }
            `
          }} />
        </div>
      )}

      {/* Participating Squadrons */}
      {participatingSquadrons.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <div style={{
            fontSize: '14px',
            fontWeight: '500',
            color: '#6B7280',
            marginBottom: '12px'
          }}>
            Participating Squadrons Callsigns
          </div>
        
        <div style={{
          display: participatingSquadrons.length <= 3 ? 'flex' : 'grid',
          gridTemplateColumns: participatingSquadrons.length > 3 ? 'repeat(3, 1fr)' : 'none',
          gap: '16px',
          overflowX: participatingSquadrons.length <= 3 ? 'auto' : 'visible',
          overflowY: participatingSquadrons.length > 6 ? 'auto' : 'visible',
          maxHeight: participatingSquadrons.length > 6 ? '300px' : 'none',
          paddingBottom: '8px',
          minHeight: '120px'
          // Remove width constraint to let tiles naturally size
        }}>
          {participatingSquadrons.length === 0 ? (
            <div style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#9CA3AF',
              fontSize: '14px',
              fontStyle: 'italic'
            }}>
              No participating squadrons have been configured for this event
            </div>
          ) : (
            participatingSquadrons.map((squadron) => (
              <div
                key={squadron.squadronId}
                style={{
                  width: participatingSquadrons.length <= 2 ? '200px' : participatingSquadrons.length === 3 ? '200px' : '220px',
                  maxWidth: participatingSquadrons.length <= 3 ? '200px' : '220px',
                  backgroundColor: '#F9FAFB',
                  borderRadius: '8px',
                  padding: '16px',
                  border: '1px solid #E5E7EB'
                }}
              >
              {/* Squadron header */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '12px'
              }}>
                {squadron.insignia_url ? (
                  <div style={{
                    width: '24px',
                    height: '24px',
                    backgroundImage: `url(${squadron.insignia_url})`,
                    backgroundSize: 'contain',
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'center',
                    borderRadius: '50%'
                  }} />
                ) : (
                  <div style={{
                    width: '24px',
                    height: '24px',
                    backgroundColor: getSquadronColor(squadron),
                    borderRadius: '50%'
                  }} />
                )}
                <div>
                  <div style={{
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#111827'
                  }}>
                    {squadron.designation}
                  </div>
                  <div style={{
                    fontSize: '10px',
                    color: '#6B7280'
                  }}>
                    {squadron.name}
                  </div>
                </div>
              </div>
              
              {/* Callsign buttons */}
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}>
                {squadron.callsigns.map((callsign) => (
                  <div key={callsign} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      onClick={() => addSquadronFlight(callsign)}
                      style={{
                        flex: 1,
                        padding: '4px 12px',
                        height: '24px',
                        backgroundColor: getSquadronColor(squadron),
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: '500',
                        cursor: 'pointer',
                        textTransform: 'uppercase',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxSizing: 'border-box'
                      }}
                    >
                      {callsign}
                    </button>
                    <button
                      onClick={() => addSquadronFlight(callsign)}
                      style={{
                        width: '30px',
                        height: '30px',
                        background: '#FFFFFF',
                        borderRadius: '8px',
                        border: 'none',
                        cursor: 'pointer',
                        transition: 'box-shadow 0.2s ease-in-out',
                        fontFamily: 'Inter',
                        fontSize: '20px',
                        color: '#64748B',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.boxShadow = '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                    >
                      +
                    </button>
                  </div>
                ))}
              </div>
            </div>
            ))
          )}
        </div>
        </div>
      )}

      {/* Other Callsign */}
      {participatingSquadrons.length > 0 && (
      <div style={{ marginBottom: '32px' }}>
        <div style={{
          fontSize: '14px',
          fontWeight: '500',
          color: '#6B7280',
          marginBottom: '8px'
        }}>
          Other Callsign
        </div>
        
        <div style={{ 
          display: 'flex', 
          gap: '8px',
          minHeight: '40px',
          alignItems: 'center',
          width: '220px' // Match width of one squadron container
        }}>
          <input
            type="text"
            placeholder="Enter Callsign"
            value={otherCallsign}
            onChange={(e) => setOtherCallsign(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addOtherFlight()}
            style={{
              flex: 1,
              padding: '8px 12px',
              height: '36px',
              border: '1px solid #D1D5DB',
              borderRadius: '6px',
              fontSize: '14px',
              outline: 'none',
              transition: 'border-color 0.2s ease',
              boxSizing: 'border-box'
            }}
            onFocus={(e) => e.currentTarget.style.borderColor = '#3B82F6'}
            onBlur={(e) => e.currentTarget.style.borderColor = '#D1D5DB'}
          />
          <button
            onClick={addOtherFlight}
            style={{
              width: '30px',
              height: '30px',
              background: '#FFFFFF',
              borderRadius: '8px',
              border: 'none',
              cursor: otherCallsign.trim() ? 'pointer' : 'not-allowed',
              transition: 'box-shadow 0.2s ease-in-out',
              fontFamily: 'Inter',
              fontSize: '20px',
              color: otherCallsign.trim() ? '#64748B' : '#D1D5DB',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            onMouseEnter={e => {
              if (otherCallsign.trim()) {
                e.currentTarget.style.boxShadow = '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)';
              }
            }}
            onMouseLeave={e => {
              e.currentTarget.style.boxShadow = 'none';
            }}
            disabled={!otherCallsign.trim()}
          >
            +
          </button>
        </div>
      </div>
      )}

      {/* Flights to be added */}
      {participatingSquadrons.length > 0 && (
      <div style={{ marginBottom: '24px' }}>
        <div style={{
          fontSize: '14px',
          fontWeight: '500',
          color: '#6B7280',
          marginBottom: '12px'
        }}>
          Flights to be added
        </div>
        
        <div style={{
          backgroundColor: '#F9FAFB',
          borderRadius: '8px',
          padding: '16px',
          border: '1px solid #E5E7EB',
          minHeight: '120px'
        }}>
          {flightRows.length === 0 ? (
            <div style={{
              color: '#9CA3AF',
              fontSize: '14px',
              textAlign: 'center',
              fontStyle: 'italic'
            }}>
              No flights added yet
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {flightRows.map((row) => (
                <div
                  key={row.callsign}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    position: 'relative'
                  }}
                  onMouseEnter={(e) => {
                    const deleteButton = e.currentTarget.querySelector('.delete-button') as HTMLElement;
                    if (deleteButton) deleteButton.style.opacity = '1';
                  }}
                  onMouseLeave={(e) => {
                    const deleteButton = e.currentTarget.querySelector('.delete-button') as HTMLElement;
                    if (deleteButton) deleteButton.style.opacity = '0';
                  }}
                >
                  {row.flights.map((flight) => (
                    <div
                      key={`${flight.callsign}-${flight.number}`}
                      style={{
                        padding: '4px 12px',
                        height: '24px',
                        backgroundColor: getFlightColor(flight.source, flight.callsign),
                        color: flight.source === 'existing' ? '#6B7280' : 'white',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: '500',
                        opacity: flight.source === 'existing' ? 0.7 : 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxSizing: 'border-box'
                      }}
                    >
                      {flight.callsign} {flight.number}
                    </div>
                  ))}
                  
                  {/* Delete button for this row */}
                  {(squadronFlights[row.callsign] > 0 || otherFlights[row.callsign] > 0) && (
                    <button
                      onClick={() => removeLastFlight(row.callsign)}
                      style={{
                        width: '20px',
                        height: '20px',
                        backgroundColor: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#EF4444',
                        opacity: '0',
                        transition: 'opacity 0.2s ease'
                      }}
                      className="delete-button"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      )}

      {/* Error message */}
      {participatingSquadrons.length > 0 && error && (
        <div style={{
          color: '#EF4444',
          fontSize: '14px',
          marginBottom: '16px',
          textAlign: 'center'
        }}>
          {error}
        </div>
      )}

      {/* Buttons */}
      {participatingSquadrons.length > 0 && (
        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '12px'
        }}>
          <button
            onClick={onCancel}
            style={{
              padding: '8px 16px',
              border: '1px solid #D1D5DB',
              borderRadius: '6px',
              backgroundColor: '#FFFFFF',
              color: '#6B7280',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderRadius: '6px',
              backgroundColor: '#3B82F6',
              color: 'white',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500'
            }}
          >
            Add Flights
          </button>
        </div>
      )}

    </div>
  );
};

export default AddFlightDialog;