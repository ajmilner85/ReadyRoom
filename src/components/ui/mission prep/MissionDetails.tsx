import React, { useState, useRef } from 'react';
import { Card } from '../card';
import { Edit2, Check, X, Upload } from 'lucide-react';
import { styles } from '../../../styles/MissionPrepStyles';
import type { Event } from '../../../types/EventTypes';

interface MissionCommanderInfo {
  boardNumber: string;
  callsign: string;
  flightId: string;
  flightCallsign: string;
  flightNumber: string;
}

interface MissionDetailsProps {
  width: string;
  events: Event[];
  selectedEvent: Event | null;
  onEventSelect: (event: Event | null) => void;
  missionCommander: MissionCommanderInfo | null;
  setMissionCommander: (commander: MissionCommanderInfo | null) => void;
  getMissionCommanderCandidates: () => {
    label: string;
    value: string;
    boardNumber: string;
    callsign: string;
    flightId: string;
    flightCallsign: string;
    flightNumber: string;
  }[];
}

interface MissionDetailsData {
  taskUnit: string;
  mother: string;
  missionDateTime: string;
  missionCommander: string;
  bullseyeLatLon: string;
  weather: string;
}

const MissionDetails: React.FC<MissionDetailsProps> = ({ 
  width,
  events,
  selectedEvent,
  onEventSelect,
  missionCommander,
  setMissionCommander,
  getMissionCommanderCandidates
}) => {
  // Sort events by date (newest first)
  const sortedEvents = [...events].sort((a, b) => 
    new Date(b.datetime).getTime() - new Date(a.datetime).getTime()
  );

  const [missionDetails, setMissionDetails] = useState<MissionDetailsData>({
    taskUnit: 'VFA-161',
    mother: 'CVN-73 George Washington "Warfighter"',
    missionDateTime: '',
    missionCommander: '',
    bullseyeLatLon: '',
    weather: ''
  });

  const [isEditing, setIsEditing] = useState(false);
  const [editedDetails, setEditedDetails] = useState<MissionDetailsData>(missionDetails);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const startEditing = () => {
    setIsEditing(true);
    setEditedDetails(missionDetails);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditedDetails(missionDetails);
  };

  const saveChanges = () => {
    setMissionDetails(editedDetails);
    setIsEditing(false);
  };

  const handleDetailChange = (field: keyof MissionDetailsData, value: string) => {
    setEditedDetails(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleFileSelect = (file: File) => {
    if (file && file.name.endsWith('.miz')) {
      setSelectedFile(file);
    } else {
      alert('Only .miz files are supported');
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleDropZoneClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const renderDetailRow = (
    label: string, 
    field: keyof MissionDetailsData, 
    type: 'text' | 'datetime-local' | 'textarea' | 'select' = 'text',
    options?: { label: string; value: string; data?: any }[]
  ) => {
    const value = isEditing ? editedDetails[field] : missionDetails[field];
    
    return (
      <div style={{ marginBottom: '16px' }}>
        <label style={{
          display: 'block',
          marginBottom: '8px',
          fontSize: '14px',
          fontWeight: 500,
          color: '#64748B'
        }}>
          {label}
        </label>
        {isEditing ? (
          type === 'textarea' ? (
            <textarea
              value={value as string}
              onChange={(e) => handleDetailChange(field, e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #CBD5E1',
                borderRadius: '4px',
                fontSize: '14px',
                minHeight: '120px',
                resize: 'vertical',
                boxSizing: 'border-box'
              }}
              placeholder={`Enter ${label.toLowerCase()}`}
            />
          ) : type === 'select' && options ? (
            <select
              value={value as string}
              onChange={(e) => handleDetailChange(field, e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #CBD5E1',
                borderRadius: '4px',
                fontSize: '14px',
                boxSizing: 'border-box'
              }}
            >
              <option value="">Select {label}</option>
              {options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : (
            <input 
              type={type}
              value={value as string}
              onChange={(e) => handleDetailChange(field, e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #CBD5E1',
                borderRadius: '4px',
                fontSize: '14px',
                boxSizing: 'border-box'
              }}
              placeholder={`Enter ${label.toLowerCase()}`}
            />
          )
        ) : (
          <div 
            style={{ 
              width: '100%',
              padding: '8px 12px',
              borderRadius: '4px',
              fontSize: '14px',
              backgroundColor: '#F8FAFC',
              color: value ? '#0F172A' : '#94A3B8',
              minHeight: type === 'textarea' ? '120px' : 'auto',
              display: 'flex',
              alignItems: 'center',
              boxSizing: 'border-box'
            }}
          >
            {value || '—'}
          </div>
        )}
      </div>
    );
  };

  const renderMissionCommanderDropdown = () => {
    const candidates = getMissionCommanderCandidates();
    const selectedValue = missionCommander ? missionCommander.boardNumber : '';
    
    return (
      <div style={{ marginBottom: '16px' }}>
        <label style={{
          display: 'block',
          marginBottom: '8px',
          fontSize: '14px',
          fontWeight: 500,
          color: '#64748B'
        }}>
          Mission Commander
        </label>
        <select
          value={selectedValue}
          onChange={(e) => {
            const selectedBoardNumber = e.target.value;
            if (!selectedBoardNumber) {
              setMissionCommander(null);
            } else {
              const selected = candidates.find(c => c.boardNumber === selectedBoardNumber);
              if (selected) {
                setMissionCommander({
                  boardNumber: selected.boardNumber,
                  callsign: selected.callsign,
                  flightId: selected.flightId,
                  flightCallsign: selected.flightCallsign,
                  flightNumber: selected.flightNumber
                });
              }
            }
          }}
          style={{
            width: '100%',
            padding: '8px 12px',
            border: '1px solid #CBD5E1',
            borderRadius: '4px',
            fontSize: '14px',
            boxSizing: 'border-box'
          }}
        >
          <option value="">No Mission Commander</option>
          {candidates.map((option) => (
            <option key={option.boardNumber} value={option.boardNumber}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    );
  };

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      gap: '20px',
      width,
      height: '100%'
    }}>
      <Card 
        style={{
          width: '100%',
          backgroundColor: '#FFFFFF',
          boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)',
          borderRadius: '8px',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          boxSizing: 'border-box',
          height: 'auto',
          overflow: 'visible'
        }}
      >
        <div style={{
          width: '100%',
          textAlign: 'center',
          marginBottom: '16px',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          position: 'relative'
        }}>
          <span style={styles.headerLabel}>Mission Details</span>
          {!isEditing ? (
            <button
              onClick={startEditing}
              style={{
                ...styles.editButton,
                position: 'absolute',
                right: 0,
                top: '50%',
                transform: 'translateY(-50%)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.15)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
              }}
            >
              <Edit2 size={16} />
            </button>
          ) : (
            <div style={{ 
              position: 'absolute',
              right: 0,
              top: '50%',
              transform: 'translateY(-50%)',
              display: 'flex',
              gap: '8px'
            }}>
              <button
                onClick={saveChanges}
                style={{
                  ...styles.editButton,
                  marginLeft: '8px',
                  zIndex: 1
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.15)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                }}
              >
                <Check size={16} color="#64748B" />
              </button>
              <button
                onClick={cancelEditing}
                style={{
                  ...styles.editButton,
                  marginLeft: '8px',
                  zIndex: 1
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.15)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                }}
              >
                <X size={16} color="#64748B" />
              </button>
            </div>
          )}
        </div>
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '16px'
        }}>
          <div style={{ marginBottom: '0' }}>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontSize: '14px',
              fontWeight: 500,
              color: '#64748B'
            }}>
              Event
            </label>
            <select 
              className="w-full"
              value={selectedEvent?.id || ''}
              onChange={(e) => {
                const event = events.find(evt => evt.id === e.target.value);
                onEventSelect(event || null);
              }}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #CBD5E1',
                borderRadius: '4px',
                fontSize: '14px',
                boxSizing: 'border-box',
                backgroundColor: '#FFFFFF'
              }}
            >
              <option value="">Select an event</option>
              {sortedEvents.map(event => (
                <option key={event.id} value={event.id}>
                  {new Date(event.datetime).toLocaleString()} - {event.title}
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: '0' }}>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontSize: '14px',
              fontWeight: 500,
              color: '#64748B'
            }}>
              Mission Objective
            </label>
            <textarea 
              className="w-full" 
              placeholder="Enter mission objective"
              value={selectedEvent?.description || ''}
              readOnly
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #CBD5E1',
                borderRadius: '4px',
                fontSize: '14px',
                minHeight: '120px',
                resize: 'vertical',
                boxSizing: 'border-box',
                backgroundColor: '#F8FAFC'
              }}
            />
          </div>
          
          {renderDetailRow('Task Unit', 'taskUnit')}
          {renderDetailRow('Mother', 'mother')}
          {renderDetailRow('Mission Date/Time', 'missionDateTime', 'datetime-local')}
          {renderMissionCommanderDropdown()}
          {renderDetailRow('Bullseye Lat/Lon', 'bullseyeLatLon')}
          {renderDetailRow('Weather', 'weather', 'textarea')}
        </div>
      </Card>

      {/* Import Card */}
      <Card 
        style={{
          width: '100%',
          backgroundColor: '#FFFFFF',
          boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)',
          borderRadius: '8px',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          boxSizing: 'border-box',
          height: '250px',
          overflow: 'visible'
        }}
      >
        <div style={{
          width: '100%',
          textAlign: 'center',
          marginBottom: '16px'
        }}>
          <span style={styles.headerLabel}>Import</span>
        </div>
        <div className="flex-1" style={{ 
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '20px'
        }}>
          {/* Hidden file input */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileInputChange}
            accept=".miz"
            style={{ display: 'none' }}
          />
          
          {/* File drop zone with dashed border */}
          <div 
            style={{
              width: '500px',
              height: '90px',
              border: '1px dashed #CBD5E1',
              borderRadius: '4px',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              cursor: 'pointer',
              color: '#64748B',
              fontSize: '14px',
              textAlign: 'center',
              padding: '16px',
              transition: 'background-color 0.2s ease'
            }}
            onClick={handleDropZoneClick}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#F8FAFC';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            {selectedFile ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Upload size={16} />
                {selectedFile.name}
              </div>
            ) : (
              <span>Drag .miz file you wish to import here, or click to open file browser.</span>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
};

export default MissionDetails;