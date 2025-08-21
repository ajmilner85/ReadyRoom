import React, { useState } from 'react';
import { useAppSettings } from '../../context/AppSettingsContext';

interface AppearanceProps {
  error?: string | null;
  setError?: (error: string | null) => void;
}

const Appearance: React.FC<AppearanceProps> = ({ error, setError }) => {
  const { settings, updateSetting } = useAppSettings();
  
  // State for units of measure
  const [distanceUnit, setDistanceUnit] = useState('Nautical Miles');
  const [altitudeUnit, setAltitudeUnit] = useState('Feet');
  const [fuelUnit, setFuelUnit] = useState('Thousands of Pounds');

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

  const selectStyle = {
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

  const toggleContainerStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 0'
  };

  return (
    <div style={containerStyle}>
      <div style={contentWrapperStyle}>
        {/* Header */}
        <div style={headerStyle}>
          <h2 style={{ fontSize: '24px', fontWeight: 600, margin: 0, color: '#0F172A' }}>
            Appearance
          </h2>
          <p style={{ fontSize: '14px', color: '#64748B', margin: '8px 0 0 0', fontFamily: 'Inter' }}>
            Configure display options and default units of measure.
          </p>
        </div>

        {/* Pilot Display Section */}
        <div style={firstSectionStyle}>
          <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#0F172A', margin: '0 0 16px 0' }}>
            Pilot Display
          </h3>
          <p style={{ fontSize: '14px', color: '#64748B', margin: '0 0 24px 0', fontFamily: 'Inter' }}>
            Control how pilots are displayed throughout the application.
          </p>
          
          <div style={toggleContainerStyle}>
            <div style={{ flex: 1 }}>
              <div style={fieldLabelStyle}>
                Display pilots with squadron colors
              </div>
              <p style={{ 
                fontSize: '12px', 
                color: '#94A3B8', 
                margin: 0, 
                fontFamily: 'Inter',
                lineHeight: '1.4'
              }}>
                When enabled, pilots are displayed using their squadron's primary color. Unassigned pilots always display in dark grey.
              </p>
            </div>
            <button
              onClick={() => updateSetting('displayPilotsWithSquadronColors', !settings.displayPilotsWithSquadronColors)}
              style={{
                position: 'relative',
                display: 'inline-flex',
                height: '20px',
                width: '36px',
                alignItems: 'center',
                borderRadius: '10px',
                transition: 'background-color 0.2s ease',
                border: 'none',
                cursor: 'pointer',
                outline: 'none',
                marginLeft: '24px',
                backgroundColor: settings.displayPilotsWithSquadronColors ? '#3B82F6' : '#D1D5DB',
                padding: '2px'
              }}
            >
              <div
                style={{
                  height: '16px',
                  width: '16px',
                  borderRadius: '50%',
                  backgroundColor: '#FFFFFF',
                  transition: 'transform 0.15s ease-in-out',
                  transform: settings.displayPilotsWithSquadronColors ? 'translateX(16px)' : 'translateX(0px)',
                  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.2)'
                }}
              />
            </button>
          </div>
        </div>

        {/* Units of Measure Section */}
        <div style={sectionStyle}>
          <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#0F172A', margin: '0 0 16px 0' }}>
            Units of Measure
          </h3>
          <p style={{ fontSize: '14px', color: '#64748B', margin: '0 0 24px 0', fontFamily: 'Inter' }}>
            Set your preferred units of measurement.
          </p>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
            <div>
              <label style={fieldLabelStyle}>Distance</label>
              <select 
                style={selectStyle}
                value={distanceUnit}
                onChange={(e) => setDistanceUnit(e.target.value)}
              >
                <option value="Nautical Miles">Nautical Miles</option>
                <option value="Kilometers">Kilometers</option>
                <option value="Miles">Miles</option>
              </select>
            </div>
            
            <div>
              <label style={fieldLabelStyle}>Altitude</label>
              <select 
                style={selectStyle}
                value={altitudeUnit}
                onChange={(e) => setAltitudeUnit(e.target.value)}
              >
                <option value="Feet">Feet</option>
                <option value="Meters">Meters</option>
              </select>
            </div>
            
            <div>
              <label style={fieldLabelStyle}>Fuel</label>
              <select 
                style={selectStyle}
                value={fuelUnit}
                onChange={(e) => setFuelUnit(e.target.value)}
              >
                <option value="Thousands of Pounds">Thousands of Pounds</option>
                <option value="Kilograms">Kilograms</option>
                <option value="Percent">Percent</option>
              </select>
            </div>
          </div>
        </div>
        
      </div>
    </div>
  );
};

export default Appearance;