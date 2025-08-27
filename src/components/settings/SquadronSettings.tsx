import React, { useState } from 'react';

interface SquadronSettingsProps {
  error?: string | null;
  setError?: (error: string | null) => void;
}

const SquadronSettings: React.FC<SquadronSettingsProps> = ({ }) => {
  // State for squadron settings
  const [squadronName, setSquadronName] = useState("VFA-26 Stingrays");
  const [squadronCallsign, setSquadronCallsign] = useState("Stingrays");
  const [boardNumberPrefix, setBoardNumberPrefix] = useState("2");
  const [autoAssignBoardNumbers, setAutoAssignBoardNumbers] = useState(true);
  const [aircraftTypes, setAircraftTypes] = useState({
    "fa18c": true,
    "fa18e": false,
    "f14b": false,
    "f16c": false
  });

  // Handler to toggle aircraft type selection
  const handleAircraftTypeToggle = (type: string) => {
    setAircraftTypes({
      ...aircraftTypes,
      [type]: !aircraftTypes[type as keyof typeof aircraftTypes]
    });
  };

  const containerStyle = {
    backgroundColor: '#FFFFFF',
    minHeight: '100vh',
    padding: '40px',
    boxSizing: 'border-box' as const
  };

  const contentWrapperStyle = {
    maxWidth: '800px',
    margin: '0 auto'
  };

  const headerStyle = {
    marginBottom: '40px'
  };

  const sectionStyle = {
    paddingTop: '32px',
    paddingBottom: '32px',
    borderTop: '1px solid #E5E7EB',
    marginTop: '32px'
  };

  const firstSectionStyle = {
    paddingTop: '0',
    paddingBottom: '32px',
    marginTop: '0',
    borderTop: 'none'
  };

  const fieldLabelStyle = {
    fontSize: '14px',
    fontWeight: 500,
    color: '#374151',
    marginBottom: '8px',
    fontFamily: 'Inter'
  };

  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #D1D5DB',
    borderRadius: '6px',
    fontSize: '14px',
    fontFamily: 'Inter',
    backgroundColor: '#FFFFFF',
    color: '#374151',
    outline: 'none',
    transition: 'border-color 0.2s ease'
  };

  return (
    <div style={containerStyle}>
      <div style={contentWrapperStyle}>
        {/* Header */}
        <div style={headerStyle}>
          <h2 style={{ fontSize: '24px', fontWeight: 600, margin: 0, color: '#0F172A' }}>
            Squadron Administration
          </h2>
          <p style={{ fontSize: '14px', color: '#64748B', margin: '8px 0 0 0', fontFamily: 'Inter' }}>
            Configure squadron name, board number selection criteria, and aircraft types flown.
          </p>
        </div>
        {/* Squadron Identity Section */}
        <div style={firstSectionStyle}>
          <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#0F172A', margin: '0 0 16px 0' }}>
            Squadron Identity
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <div>
              <label style={fieldLabelStyle}>Squadron Name</label>
              <input 
                type="text" 
                style={inputStyle}
                placeholder="VFA-26 Stingrays"
                value={squadronName}
                onChange={(e) => setSquadronName(e.target.value)}
              />
            </div>
            <div>
              <label style={fieldLabelStyle}>Squadron Callsign</label>
              <input 
                type="text" 
                style={inputStyle}
                placeholder="Stingrays" 
                value={squadronCallsign}
                onChange={(e) => setSquadronCallsign(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Aircraft Types Section */}
        <div style={sectionStyle}>
          <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#0F172A', margin: '0 0 16px 0' }}>
            Aircraft Types
          </h3>
          <p style={{ fontSize: '14px', color: '#64748B', margin: '0 0 24px 0', fontFamily: 'Inter' }}>
            Select the aircraft types flown by your squadron.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <input 
                type="checkbox" 
                id="fa18c" 
                style={{ marginRight: '8px' }}
                checked={aircraftTypes.fa18c}
                onChange={() => handleAircraftTypeToggle('fa18c')}
              />
              <label htmlFor="fa18c" style={{ fontSize: '14px', fontFamily: 'Inter' }}>F/A-18C Hornet</label>
            </div>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <input 
                type="checkbox" 
                id="fa18e" 
                style={{ marginRight: '8px' }}
                checked={aircraftTypes.fa18e}
                onChange={() => handleAircraftTypeToggle('fa18e')}
              />
              <label htmlFor="fa18e" style={{ fontSize: '14px', fontFamily: 'Inter' }}>F/A-18E Super Hornet</label>
            </div>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <input 
                type="checkbox" 
                id="f14b" 
                style={{ marginRight: '8px' }}
                checked={aircraftTypes.f14b}
                onChange={() => handleAircraftTypeToggle('f14b')}
              />
              <label htmlFor="f14b" style={{ fontSize: '14px', fontFamily: 'Inter' }}>F-14B Tomcat</label>
            </div>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <input 
                type="checkbox" 
                id="f16c" 
                style={{ marginRight: '8px' }}
                checked={aircraftTypes.f16c}
                onChange={() => handleAircraftTypeToggle('f16c')}
              />
              <label htmlFor="f16c" style={{ fontSize: '14px', fontFamily: 'Inter' }}>F-16C Viper</label>
            </div>
          </div>
        </div>

        {/* Board Number Format Section */}
        <div style={sectionStyle}>
          <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#0F172A', margin: '0 0 16px 0' }}>
            Board Number Format
          </h3>
          <p style={{ fontSize: '14px', color: '#64748B', margin: '0 0 24px 0', fontFamily: 'Inter' }}>
            Configure how board numbers are assigned to squadron personnel.
          </p>
          <div style={{ marginBottom: '20px' }}>
            <label style={fieldLabelStyle}>Board Number Prefix</label>
            <input 
              type="text" 
              style={{ ...inputStyle, width: '60px' }}
              placeholder="2" 
              value={boardNumberPrefix}
              onChange={(e) => setBoardNumberPrefix(e.target.value.slice(0, 1))}
              maxLength={1}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <input 
              type="checkbox" 
              id="autoAssignBoard" 
              style={{ marginRight: '8px' }}
              checked={autoAssignBoardNumbers}
              onChange={() => setAutoAssignBoardNumbers(!autoAssignBoardNumbers)}
            />
            <label htmlFor="autoAssignBoard" style={{ fontSize: '14px', fontFamily: 'Inter' }}>Auto-assign board numbers to new pilots</label>
          </div>
        </div>
        
      </div>
    </div>
  );
};

export default SquadronSettings;