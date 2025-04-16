import React, { useState } from 'react';
import { Card } from '../ui/card';

interface SquadronSettingsProps {
  error?: string | null;
  setError?: (error: string | null) => void;
}

const SquadronSettings: React.FC<SquadronSettingsProps> = ({ error, setError }) => {
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

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Squadron Administration</h2>
      <p className="text-slate-600 mb-6">
        Configure squadron name, board number selection criteria, and aircraft types flown.
      </p>

      <div className="space-y-6">
        <Card className="p-4">
          <h3 className="text-lg font-medium mb-3">Squadron Identity</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-slate-700 mb-1">Squadron Name</label>
              <input 
                type="text" 
                className="w-full p-2 border border-gray-200 rounded" 
                placeholder="VFA-26 Stingrays"
                value={squadronName}
                onChange={(e) => setSquadronName(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm text-slate-700 mb-1">Squadron Callsign</label>
              <input 
                type="text" 
                className="w-full p-2 border border-gray-200 rounded" 
                placeholder="Stingrays" 
                value={squadronCallsign}
                onChange={(e) => setSquadronCallsign(e.target.value)}
              />
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="text-lg font-medium mb-3">Aircraft Types</h3>
          <p className="text-sm text-slate-500 mb-4">
            Select the aircraft types flown by your squadron.
          </p>
          <div className="space-y-2">
            <div className="flex items-center">
              <input 
                type="checkbox" 
                id="fa18c" 
                className="mr-2" 
                checked={aircraftTypes.fa18c}
                onChange={() => handleAircraftTypeToggle('fa18c')}
              />
              <label htmlFor="fa18c">F/A-18C Hornet</label>
            </div>
            <div className="flex items-center">
              <input 
                type="checkbox" 
                id="fa18e" 
                className="mr-2"
                checked={aircraftTypes.fa18e}
                onChange={() => handleAircraftTypeToggle('fa18e')}
              />
              <label htmlFor="fa18e">F/A-18E Super Hornet</label>
            </div>
            <div className="flex items-center">
              <input 
                type="checkbox" 
                id="f14b" 
                className="mr-2"
                checked={aircraftTypes.f14b}
                onChange={() => handleAircraftTypeToggle('f14b')}
              />
              <label htmlFor="f14b">F-14B Tomcat</label>
            </div>
            <div className="flex items-center">
              <input 
                type="checkbox" 
                id="f16c" 
                className="mr-2"
                checked={aircraftTypes.f16c}
                onChange={() => handleAircraftTypeToggle('f16c')}
              />
              <label htmlFor="f16c">F-16C Viper</label>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="text-lg font-medium mb-3">Board Number Format</h3>
          <p className="text-sm text-slate-500 mb-4">
            Configure how board numbers are assigned to squadron personnel.
          </p>
          <div>
            <label className="block text-sm text-slate-700 mb-1">Board Number Prefix</label>
            <input 
              type="text" 
              className="w-full p-2 border border-gray-200 rounded mb-4" 
              placeholder="2" 
              value={boardNumberPrefix}
              onChange={(e) => setBoardNumberPrefix(e.target.value.slice(0, 1))}
              maxLength={1}
            />
          </div>
          <div className="flex items-center mb-2">
            <input 
              type="checkbox" 
              id="autoAssignBoard" 
              className="mr-2"
              checked={autoAssignBoardNumbers}
              onChange={() => setAutoAssignBoardNumbers(!autoAssignBoardNumbers)}
            />
            <label htmlFor="autoAssignBoard">Auto-assign board numbers to new pilots</label>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default SquadronSettings;