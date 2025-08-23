import React, { useState, useEffect, useRef } from 'react';
import { X, Users } from 'lucide-react';
import { CycleType } from '../../../types/EventTypes';
import { Squadron } from '../../../types/OrganizationTypes';

interface CycleDialogProps {
  onSave: (cycleData: {
    name: string;
    description: string;
    startDate: string;
    endDate: string;
    type: CycleType;
    restrictedTo?: string[];
    participants?: string[];
  }) => void;
  onCancel: () => void;
  squadrons: Squadron[];
  initialData?: {
    name: string;
    description: string;
    startDate: string;
    endDate: string;
    type: CycleType;
    restrictedTo?: string[];
    participants?: string[];
  };
}

export const CycleDialog: React.FC<CycleDialogProps> = ({
  onSave,
  onCancel,
  squadrons,
  initialData
}) => {
  const [name, setName] = useState(initialData?.name || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [startDate, setStartDate] = useState(initialData?.startDate ? new Date(initialData.startDate).toISOString().split('T')[0] : '');
  const [endDate, setEndDate] = useState(initialData?.endDate ? new Date(initialData.endDate).toISOString().split('T')[0] : '');
  const [type, setType] = useState<CycleType>(initialData?.type || 'Training');
  const [restrictedTo, setRestrictedTo] = useState<string[]>(initialData?.restrictedTo || []);
  const [participants, setParticipatingSquadrons] = useState<string[]>(initialData?.participants || []);
  const [weekCount, setWeekCount] = useState<number>(1);
  const [error, setError] = useState('');
  
  // Add refs to track which field was last changed
  const lastChanged = useRef<'weeks' | 'endDate' | null>(null);
  
  // Initialize week count when component loads with initial data
  useEffect(() => {
    if (initialData?.startDate && initialData?.endDate) {
      const start = new Date(initialData.startDate);
      const end = new Date(initialData.endDate);
      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        // Calculate weeks between the two dates
        const diffTime = Math.abs(end.getTime() - start.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 to include both start and end date
        const calculatedWeeks = Math.ceil(diffDays / 7);
        setWeekCount(calculatedWeeks > 0 ? calculatedWeeks : 1);
      }
    }
  }, [initialData]);
  
  // Calculate weeks when end date is changed by user
  useEffect(() => {
    if (lastChanged.current === 'endDate' && startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        // Calculate weeks between the two dates
        const diffTime = Math.abs(end.getTime() - start.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 to include both start and end date
        const calculatedWeeks = Math.ceil(diffDays / 7);
        setWeekCount(calculatedWeeks > 0 ? calculatedWeeks : 1);
      }
    }
  }, [startDate, endDate]);
  
  // Update end date when week count or start date changes
  useEffect(() => {
    if (lastChanged.current === 'weeks' && startDate && weekCount > 0) {
      const start = new Date(startDate);
      if (!isNaN(start.getTime())) {
        // Calculate end date as exactly X weeks from start date (on the same day of week)
        const end = new Date(start);
        // Add exactly X weeks (to end on the same day of week)
        end.setDate(start.getDate() + (weekCount * 7) - 0); // Remove the -1 to get correct date
        
        // Format the date as YYYY-MM-DD
        const formattedEndDate = end.toISOString().split('T')[0];
        setEndDate(formattedEndDate);
      }
    }
  }, [startDate, weekCount]);

  const handleStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setStartDate(e.target.value);
    // When start date changes, recalculate end date based on weeks
    lastChanged.current = 'weeks';
  };

  const handleEndDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEndDate(e.target.value);
    // When end date changes directly, it should take precedence 
    lastChanged.current = 'endDate';
  };

  const handleWeekCountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    if (!isNaN(value) && value > 0) {
      setWeekCount(value);
      // When week count changes, it should take precedence
      lastChanged.current = 'weeks';
    }
  };

  const handleWeekIncrement = () => {
    if (weekCount < 52) {
      setWeekCount(weekCount + 1);
      lastChanged.current = 'weeks';
    }
  };

  const handleWeekDecrement = () => {
    if (weekCount > 1) {
      setWeekCount(weekCount - 1);
      lastChanged.current = 'weeks';
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      setError('Please enter a cycle name');
      return;
    }

    if (!startDate) {
      setError('Please select a start date');
      return;
    }

    if (!endDate) {
      setError('Please select an end date');
      return;
    }

    // Check that end date is after start date
    if (new Date(endDate) <= new Date(startDate)) {
      setError('End date must be after start date');
      return;
    }

    onSave({
      name: name.trim(),
      description: description.trim(),
      startDate,
      endDate,
      type,
      restrictedTo: restrictedTo.length > 0 ? restrictedTo : undefined,
      participants: participants.length > 0 ? participants : undefined
    });
  };

  const cycleTypes: CycleType[] = ['Training', 'Cruise-WorkUp', 'Cruise-Mission', 'Other'];
  const roleOptions = ['Cadre', 'Staff', 'Command', 'All Pilots'];

  return (
    <>
      <div 
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          zIndex: 1000
        }}
        onClick={onCancel}
      />
      <div style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '600px',
        backgroundColor: '#FFFFFF',
        boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)',
        borderRadius: '8px',
        zIndex: 1001
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 24px',
          borderBottom: '1px solid #E2E8F0'
        }}>
          <h2 style={{
            fontSize: '18px',
            fontWeight: 600,
            color: '#0F172A'
          }}>
            {initialData ? 'Edit Cycle' : 'Create New Cycle'}
          </h2>
          <button
            onClick={onCancel}
            style={{
              background: 'none',
              border: 'none',
              padding: '4px',
              cursor: 'pointer',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <X size={20} color="#64748B" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ padding: '24px' }}>
            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: 500,
                color: '#64748B'
              }}>
                Cycle Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px', // Changed from 4px 12px to 8px
                  border: '1px solid #CBD5E1',
                  borderRadius: '4px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  height: '35px', // Set fixed height
                  lineHeight: '19px' // Adjusted line height for new padding
                }}
                placeholder="Enter cycle name (e.g. Training Cycle 25-1)"
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: 500,
                color: '#64748B'
              }}>
                Cycle Type
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as CycleType)}
                style={{
                  width: '100%',
                  padding: '8px', // Changed to 8px uniform padding
                  border: '1px solid #CBD5E1',
                  borderRadius: '4px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  height: '35px', // Fixed height
                  lineHeight: '19px', // Adjusted line height for new padding
                  appearance: 'menulist' // Ensure native dropdown styling
                }}
              >
                {cycleTypes.map(cycleType => (
                  <option 
                    key={cycleType} 
                    value={cycleType}
                    style={{
                      padding: '8px',
                      whiteSpace: 'normal'
                    }}
                  >
                    {cycleType.replace('-', ' - ')}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: '16px', display: 'flex', gap: '16px' }}>
              <div style={{ flex: '1' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#64748B'
                }}>
                  Start Date
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={handleStartDateChange}
                  style={{
                    width: '100%',
                    padding: '8px', // Changed to 8px uniform padding
                    border: '1px solid #CBD5E1',
                    borderRadius: '4px',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                    height: '35px', // Set fixed height
                    lineHeight: '19px' // Adjusted line height for new padding
                  }}
                />
              </div>

              <div style={{ flex: '1' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#64748B'
                }}>
                  End Date
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={handleEndDateChange}
                  style={{
                    width: '100%',
                    padding: '8px', // Changed to 8px uniform padding
                    border: '1px solid #CBD5E1',
                    borderRadius: '4px',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                    height: '35px', // Set fixed height
                    lineHeight: '19px' // Adjusted line height for new padding
                  }}
                />
              </div>
            </div>

            {/* New Weeks Input */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: 500,
                color: '#64748B'
              }}>
                Number of Weeks
              </label>
              <div style={{ 
                display: 'flex',
                border: '1px solid #CBD5E1',
                borderRadius: '4px',
                overflow: 'hidden',
                height: '35px' // Match the 35px height of other inputs
              }}>
                <input
                  type="text" 
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={weekCount}
                  onChange={handleWeekCountChange}
                  style={{
                    flex: 1,
                    padding: '8px', // Changed from 4px 12px to 8px
                    border: 'none',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                    WebkitAppearance: 'none',
                    MozAppearance: 'textfield',
                    height: '100%', // Take full height of parent
                    lineHeight: '19px' // Adjusted line height for new padding
                  }}
                />
                <div style={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  borderLeft: '1px solid #CBD5E1',
                  height: '100%', // Take full height of parent
                  width: '20px' // Set fixed width to 20px
                }}>
                  <button
                    type="button"
                    onClick={handleWeekIncrement}
                    style={{
                      padding: '0',
                      border: 'none',
                      backgroundColor: '#F1F5F9',
                      cursor: 'pointer',
                      borderBottom: '1px solid #CBD5E1',
                      height: '50%', // Take half the height
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '100%' // Take full width of parent
                    }}
                  >
                    <span style={{ 
                      fontSize: '10px', 
                      color: '#4B5563',
                      lineHeight: 1
                    }}>▲</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleWeekDecrement}
                    style={{
                      padding: '0',
                      border: 'none',
                      backgroundColor: '#F1F5F9',
                      cursor: 'pointer',
                      height: '50%', // Take half the height
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '100%' // Take full width of parent
                    }}
                  >
                    <span style={{ 
                      fontSize: '10px', 
                      color: '#4B5563',
                      lineHeight: 1
                    }}>▼</span>
                  </button>
                </div>
              </div>
              {/* Remove the helper text as requested */}
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: 500,
                color: '#64748B'
              }}>
                Eligibility
              </label>
              <select
                multiple
                value={restrictedTo}
                onChange={(e) => {
                  const values = Array.from(e.target.selectedOptions, option => option.value);
                  setRestrictedTo(values);
                }}
                style={{
                  width: '100%',
                  padding: '8px', // Changed from 8px 12px to just 8px
                  border: '1px solid #CBD5E1',
                  borderRadius: '4px',
                  fontSize: '14px',
                  boxSizing: 'border-box'
                }}
              >
                {roleOptions.map(role => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
              <div style={{
                fontSize: '12px',
                color: '#64748B',
                marginTop: '4px'
              }}>
                Hold Ctrl/Cmd to select multiple roles. Leave empty for no restrictions.
              </div>
            </div>

            {/* Participating Squadrons */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '8px'
              }}>
                <label style={{
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#64748B'
                }}>
                  Participating Squadrons
                </label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button 
                    type="button"
                    onClick={() => setParticipatingSquadrons(squadrons.map(s => s.id))}
                    style={{
                      padding: '2px 6px',
                      backgroundColor: '#EFF6FF',
                      border: '1px solid #DBEAFE',
                      borderRadius: '3px',
                      fontSize: '10px',
                      cursor: 'pointer',
                      fontFamily: 'Inter',
                      color: '#1E40AF'
                    }}
                  >
                    All
                  </button>
                  <button 
                    type="button"
                    onClick={() => setParticipatingSquadrons([])}
                    style={{
                      padding: '2px 6px',
                      backgroundColor: '#FEF2F2',
                      border: '1px solid #FECACA',
                      borderRadius: '3px',
                      fontSize: '10px',
                      cursor: 'pointer',
                      fontFamily: 'Inter',
                      color: '#DC2626'
                    }}
                  >
                    None
                  </button>
                </div>
              </div>
              <div style={{
                maxHeight: '200px',
                overflowY: 'auto',
                border: '1px solid #E5E7EB',
                borderRadius: '4px',
                padding: '4px',
                backgroundColor: '#FAFAFA'
              }}>
                {squadrons.map(squadron => {
                  const isSelected = participants.includes(squadron.id);
                  return (
                    <div
                      key={squadron.id}
                      onClick={() => {
                        if (isSelected) {
                          setParticipatingSquadrons(prev => prev.filter(id => id !== squadron.id));
                        } else {
                          setParticipatingSquadrons(prev => [...prev, squadron.id]);
                        }
                      }}
                      style={{
                        padding: '6px 8px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        backgroundColor: isSelected ? '#EFF6FF' : 'transparent',
                        borderRadius: '3px',
                        transition: 'background-color 0.2s',
                        marginBottom: '2px'
                      }}
                      onMouseEnter={e => {
                        if (!isSelected) {
                          e.currentTarget.style.backgroundColor = '#F8FAFC';
                        }
                      }}
                      onMouseLeave={e => {
                        if (!isSelected) {
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }
                      }}
                    >
                      {/* Checkbox */}
                      <div style={{
                        width: '14px',
                        height: '14px',
                        border: '1px solid #CBD5E1',
                        borderRadius: '3px',
                        backgroundColor: isSelected ? '#3B82F6' : '#FFFFFF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}>
                        {isSelected && (
                          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                            <path d="M1 4L3 6L7 2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                      
                      {/* Squadron Insignia */}
                      {squadron.insignia_url ? (
                        <div style={{
                          width: '20px',
                          height: '20px',
                          backgroundImage: `url(${squadron.insignia_url})`,
                          backgroundSize: 'contain',
                          backgroundRepeat: 'no-repeat',
                          backgroundPosition: 'center',
                          flexShrink: 0
                        }} />
                      ) : (
                        <div style={{
                          width: '20px',
                          height: '20px',
                          backgroundColor: '#E5E7EB',
                          borderRadius: '3px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}>
                          <span style={{ fontSize: '10px', color: '#6B7280' }}>?</span>
                        </div>
                      )}
                      
                      {/* Squadron Info */}
                      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                        <span style={{ fontSize: '12px', fontWeight: 500, fontFamily: 'Inter' }}>
                          {squadron.designation}
                        </span>
                        <span style={{ fontSize: '10px', color: '#64748B', fontFamily: 'Inter' }}>
                          {squadron.name}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{
                fontSize: '12px',
                color: '#64748B',
                marginTop: '4px'
              }}>
                {participants.length === 0 ? 
                  'No squadrons selected. Events will not be posted to Discord.' :
                  `${participants.length} squadron${participants.length !== 1 ? 's' : ''} selected. Events in this cycle will be posted to their Discord channels.`
                }
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: 500,
                color: '#64748B'
              }}>
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px', // Changed from 8px 12px to just 8px
                  border: '1px solid #CBD5E1',
                  borderRadius: '4px',
                  fontSize: '14px',
                  minHeight: '120px',
                  resize: 'vertical',
                  boxSizing: 'border-box'
                }}
                placeholder="Enter cycle description"
              />
            </div>

            {error && (
              <div style={{
                color: '#EF4444',
                fontSize: '14px',
                marginBottom: '16px'
              }}>
                {error}
              </div>
            )}
          </div>

          <div style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '12px',
            borderTop: '1px solid #E2E8F0',
            padding: '16px 24px'
          }}>
            <button
              type="button"
              onClick={onCancel}
              style={{
                padding: '8px 16px',
                border: '1px solid #CBD5E1',
                borderRadius: '4px',
                backgroundColor: 'white',
                color: '#64748B',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={{
                padding: '8px 16px',
                border: 'none',
                borderRadius: '4px',
                backgroundColor: '#2563EB',
                color: 'white',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              {initialData ? 'Update Cycle' : 'Create Cycle'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
};

export default CycleDialog;