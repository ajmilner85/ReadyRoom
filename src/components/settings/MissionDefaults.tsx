import React, { useState } from 'react';

interface MissionDefaultsProps {
  error?: string | null;
  setError?: (error: string | null) => void;
}

const MissionDefaults: React.FC<MissionDefaultsProps> = () => {
  // State for fuel settings
  const [bingoFuel, setBingoFuel] = useState(3.0);
  const [jokerFuel, setJokerFuel] = useState(5.0);
  
  // State for encryption settings
  const [selectedEncryption, setSelectedEncryption] = useState(1);
  
  // State for comms plan
  const [commsEntries] = useState([
    { channel: 1, name: 'Base', freq: '251.000', tacan: '—', ils: '—', kyFill: '—' },
    { channel: 2, name: 'Tower', freq: '340.200', tacan: '—', ils: '—', kyFill: '—' },
    { channel: 3, name: 'Strike', freq: '377.800', tacan: '—', ils: '—', kyFill: '—' }
  ]);
  
  // Handler for selecting encryption channel
  const handleEncryptionSelect = (channel: number) => {
    setSelectedEncryption(channel);
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
            Mission Defaults
          </h2>
          <p style={{ fontSize: '14px', color: '#64748B', margin: '8px 0 0 0', fontFamily: 'Inter' }}>
            Configure default JOKER and BINGO fuel states, encryption channels, and Comms Plan templates.
          </p>
        </div>
        {/* Fuel States Section */}
        <div style={firstSectionStyle}>
          <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#0F172A', margin: '0 0 16px 0' }}>
            Fuel States
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <div>
              <label style={fieldLabelStyle}>Default BINGO (1000 lbs)</label>
              <input 
                type="number" 
                style={inputStyle}
                value={bingoFuel}
                onChange={(e) => setBingoFuel(Number(e.target.value))}
                min={1.0}
                max={10.0}
                step={0.1}
              />
            </div>
            <div>
              <label style={fieldLabelStyle}>Default JOKER (1000 lbs)</label>
              <input 
                type="number" 
                style={inputStyle}
                value={jokerFuel}
                onChange={(e) => setJokerFuel(Number(e.target.value))}
                min={1.0}
                max={15.0}
                step={0.1} 
              />
            </div>
          </div>
        </div>

        {/* Default Encryption Section */}
        <div style={sectionStyle}>
          <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#0F172A', margin: '0 0 16px 0' }}>
            Default Encryption
          </h3>
          <p style={{ fontSize: '14px', color: '#64748B', margin: '0 0 24px 0', fontFamily: 'Inter' }}>
            Set the default encryption channel for new missions.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '8px' }}>
            {[1, 2, 3, 4, 5, 6].map((num) => (
              <button
                key={num}
                style={{
                  padding: '12px',
                  border: '1px solid #D1D5DB',
                  borderRadius: '6px',
                  backgroundColor: num === selectedEncryption ? '#F24607' : '#FFFFFF',
                  color: num === selectedEncryption ? '#FFFFFF' : '#64748B',
                  cursor: 'pointer',
                  fontFamily: 'Inter',
                  fontSize: '14px',
                  fontWeight: 500,
                  transition: 'all 0.2s ease'
                }}
                onClick={() => handleEncryptionSelect(num)}
                onMouseEnter={(e) => {
                  if (num !== selectedEncryption) {
                    e.currentTarget.style.backgroundColor = '#F8FAFC';
                  }
                }}
                onMouseLeave={(e) => {
                  if (num !== selectedEncryption) {
                    e.currentTarget.style.backgroundColor = '#FFFFFF';
                  }
                }}
              >
                {num}
              </button>
            ))}
          </div>
        </div>

        {/* Comms Plan Template Section */}
        <div style={sectionStyle}>
          <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#0F172A', margin: '0 0 16px 0' }}>
            Comms Plan Template
          </h3>
          <button style={{
            padding: '10px 16px',
            backgroundColor: '#F8FAFC',
            color: '#374151',
            border: '1px solid #D1D5DB',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            fontFamily: 'Inter',
            marginBottom: '24px',
            transition: 'background-color 0.2s ease'
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F1F5F9'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#F8FAFC'}
          >
            Edit Default Template
          </button>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontFamily: 'Inter' }}>
              <thead>
                <tr style={{ textAlign: 'left', backgroundColor: '#F8FAFC' }}>
                  <th style={{ padding: '8px', fontSize: '12px', fontWeight: 500, color: '#64748B' }}>Chan</th>
                  <th style={{ padding: '8px', fontSize: '12px', fontWeight: 500, color: '#64748B' }}>Name</th>
                  <th style={{ padding: '8px', fontSize: '12px', fontWeight: 500, color: '#64748B' }}>Freq</th>
                  <th style={{ padding: '8px', fontSize: '12px', fontWeight: 500, color: '#64748B' }}>TACAN</th>
                  <th style={{ padding: '8px', fontSize: '12px', fontWeight: 500, color: '#64748B' }}>ILS</th>
                  <th style={{ padding: '8px', fontSize: '12px', fontWeight: 500, color: '#64748B' }}>KY Fill</th>
                </tr>
              </thead>
              <tbody>
                {commsEntries.map((entry) => (
                  <tr key={entry.channel} style={{ borderBottom: '1px solid #E5E7EB' }}>
                    <td style={{ padding: '8px', fontSize: '14px' }}>{entry.channel}</td>
                    <td style={{ padding: '8px', fontSize: '14px' }}>{entry.name}</td>
                    <td style={{ padding: '8px', fontSize: '14px' }}>{entry.freq}</td>
                    <td style={{ padding: '8px', fontSize: '14px' }}>{entry.tacan}</td>
                    <td style={{ padding: '8px', fontSize: '14px' }}>{entry.ils || "——"}</td>
                    <td style={{ padding: '8px', fontSize: '14px' }}>{entry.kyFill || "——"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        
      </div>
    </div>
  );
};

export default MissionDefaults;