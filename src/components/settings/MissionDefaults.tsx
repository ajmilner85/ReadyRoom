import React, { useState } from 'react';
import { Card } from '../ui/card';

interface MissionDefaultsProps {
  error?: string | null;
  setError?: (error: string | null) => void;
}

const MissionDefaults: React.FC<MissionDefaultsProps> = ({ error, setError }) => {
  // State for fuel settings
  const [bingoFuel, setBingoFuel] = useState(3.0);
  const [jokerFuel, setJokerFuel] = useState(5.0);
  
  // State for encryption settings
  const [selectedEncryption, setSelectedEncryption] = useState(1);
  
  // State for comms plan
  const [commsEntries, setCommsEntries] = useState([
    { channel: 1, name: 'Base', freq: '251.000', tacan: '—' },
    { channel: 2, name: 'Tower', freq: '340.200', tacan: '—' },
    { channel: 3, name: 'Strike', freq: '377.800', tacan: '—' }
  ]);
  
  // Handler for selecting encryption channel
  const handleEncryptionSelect = (channel: number) => {
    setSelectedEncryption(channel);
  };

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Mission Defaults</h2>
      <p className="text-slate-600 mb-6">
        Configure default JOKER and BINGO fuel states, encryption channels, and Comms Plan templates.
      </p>

      <div className="space-y-6">
        <Card className="p-4">
          <h3 className="text-lg font-medium mb-3">Fuel States</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-700 mb-1">Default BINGO (1000 lbs)</label>
              <input 
                type="number" 
                className="w-full p-2 border border-gray-200 rounded" 
                value={bingoFuel}
                onChange={(e) => setBingoFuel(Number(e.target.value))}
                min={1.0}
                max={10.0}
                step={0.1}
              />
            </div>
            <div>
              <label className="block text-sm text-slate-700 mb-1">Default JOKER (1000 lbs)</label>
              <input 
                type="number" 
                className="w-full p-2 border border-gray-200 rounded" 
                value={jokerFuel}
                onChange={(e) => setJokerFuel(Number(e.target.value))}
                min={1.0}
                max={15.0}
                step={0.1} 
              />
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="text-lg font-medium mb-3">Default Encryption</h3>
          <p className="text-sm text-slate-500 mb-4">
            Set the default encryption channel for new missions.
          </p>
          <div className="grid grid-cols-6 gap-2">
            {[1, 2, 3, 4, 5, 6].map((num) => (
              <button
                key={num}
                className={`p-3 border rounded-lg ${num === selectedEncryption ? 'bg-[#F24607] text-white' : 'bg-white text-slate-600 hover:bg-slate-100'}`}
                onClick={() => handleEncryptionSelect(num)}
              >
                {num}
              </button>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="text-lg font-medium mb-3">Comms Plan Template</h3>
          <button className="px-4 py-2 bg-slate-100 text-slate-700 rounded hover:bg-slate-200 mb-4">
            Edit Default Template
          </button>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left bg-slate-50">
                  <th className="p-2 text-sm font-medium text-slate-500">Chan</th>
                  <th className="p-2 text-sm font-medium text-slate-500">Name</th>
                  <th className="p-2 text-sm font-medium text-slate-500">Freq</th>
                  <th className="p-2 text-sm font-medium text-slate-500">TACAN</th>
                </tr>
              </thead>
              <tbody>
                {commsEntries.map((entry) => (
                  <tr key={entry.channel} className="border-b">
                    <td className="p-2">{entry.channel}</td>
                    <td className="p-2">{entry.name}</td>
                    <td className="p-2">{entry.freq}</td>
                    <td className="p-2">{entry.tacan}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default MissionDefaults;