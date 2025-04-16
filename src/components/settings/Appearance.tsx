import React, { useState } from 'react';
import { Card } from '../ui/card';

interface AppearanceProps {
  error?: string | null;
  setError?: (error: string | null) => void;
}

const Appearance: React.FC<AppearanceProps> = ({ error, setError }) => {
  // State for color scheme
  const [primaryColor, setPrimaryColor] = useState('#5B4E61');
  const [secondaryColor, setSecondaryColor] = useState('#82728C');
  const [accentColor, setAccentColor] = useState('#F24607');
  
  // State for units of measure
  const [distanceUnit, setDistanceUnit] = useState('Nautical Miles');
  const [altitudeUnit, setAltitudeUnit] = useState('Feet');
  const [fuelUnit, setFuelUnit] = useState('Thousands of Pounds');

  // Handler for color input changes
  const handleColorChange = (setter: React.Dispatch<React.SetStateAction<string>>) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setter(e.target.value);
  };

  // Handler for uploading a new logo
  const handleLogoUpload = () => {
    // This would typically open a file dialog and handle the upload
    console.log('Logo upload functionality would go here');
  };

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Appearance</h2>
      <p className="text-slate-600 mb-6">
        Configure squadron logos, colors, and default units of measure.
      </p>

      <div className="space-y-6">
        <Card className="p-4">
          <h3 className="text-lg font-medium mb-3">Squadron Logo</h3>
          <div className="flex items-center space-x-6 mb-4">
            <div className="w-32 h-32 border-2 border-dashed border-slate-300 rounded-lg flex items-center justify-center">
              <img 
                src="/src/assets/Stingrays Logo 80x80.png" 
                alt="Squadron Logo" 
                className="max-w-full max-h-full"
              />
            </div>
            <button 
              className="px-4 py-2 bg-slate-100 text-slate-700 rounded hover:bg-slate-200"
              onClick={handleLogoUpload}
            >
              Change Logo
            </button>
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="text-lg font-medium mb-3">Color Scheme</h3>
          <p className="text-sm text-slate-500 mb-4">
            Customize the application's color scheme.
          </p>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-slate-700 mb-1">Primary Color</label>
              <div className="flex space-x-2">
                <input 
                  type="color" 
                  value={primaryColor} 
                  onChange={handleColorChange(setPrimaryColor)}
                  className="w-16 h-10" 
                />
                <input 
                  type="text" 
                  value={primaryColor} 
                  onChange={handleColorChange(setPrimaryColor)}
                  className="p-2 border border-gray-200 rounded" 
                />
              </div>
            </div>
            <div>
              <label className="block text-sm text-slate-700 mb-1">Secondary Color</label>
              <div className="flex space-x-2">
                <input 
                  type="color" 
                  value={secondaryColor} 
                  onChange={handleColorChange(setSecondaryColor)}
                  className="w-16 h-10" 
                />
                <input 
                  type="text" 
                  value={secondaryColor} 
                  onChange={handleColorChange(setSecondaryColor)}
                  className="p-2 border border-gray-200 rounded" 
                />
              </div>
            </div>
            <div>
              <label className="block text-sm text-slate-700 mb-1">Accent Color</label>
              <div className="flex space-x-2">
                <input 
                  type="color" 
                  value={accentColor} 
                  onChange={handleColorChange(setAccentColor)}
                  className="w-16 h-10" 
                />
                <input 
                  type="text" 
                  value={accentColor} 
                  onChange={handleColorChange(setAccentColor)}
                  className="p-2 border border-gray-200 rounded" 
                />
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="text-lg font-medium mb-3">Units of Measure</h3>
          <p className="text-sm text-slate-500 mb-4">
            Set your preferred units of measurement.
          </p>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-slate-700 mb-1">Distance</label>
              <select 
                className="w-full p-2 border border-gray-200 rounded"
                value={distanceUnit}
                onChange={(e) => setDistanceUnit(e.target.value)}
              >
                <option>Nautical Miles</option>
                <option>Kilometers</option>
                <option>Miles</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-700 mb-1">Altitude</label>
              <select 
                className="w-full p-2 border border-gray-200 rounded"
                value={altitudeUnit}
                onChange={(e) => setAltitudeUnit(e.target.value)}
              >
                <option>Feet</option>
                <option>Meters</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-700 mb-1">Fuel</label>
              <select 
                className="w-full p-2 border border-gray-200 rounded"
                value={fuelUnit}
                onChange={(e) => setFuelUnit(e.target.value)}
              >
                <option>Thousands of Pounds</option>
                <option>Kilograms</option>
                <option>Percent</option>
              </select>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default Appearance;