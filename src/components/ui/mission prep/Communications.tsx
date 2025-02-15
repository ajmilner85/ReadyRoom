import React, { useState } from 'react';
import { Card } from '../card';
import { FileDown } from 'lucide-react';

interface CommsPlanEntry {
  chan: string;
  name: string;
  freq: string;
  tacan: string;
}

interface CommunicationsProps {
  width: string;
}

// Generate initial comms plan data
const generateInitialCommsData = (): CommsPlanEntry[] => {
  const baseData = [
    { chan: "1", name: "Common", freq: "261.000", tacan: "" },
    { chan: "2", name: "Big Voice", freq: "253.000", tacan: "" },
    { chan: "3", name: "Lincoln Al Ops", freq: "251.000", tacan: "72X" },
    { chan: "4", name: "Lincoln Marshal", freq: "257.500", tacan: "" },
    { chan: "5", name: "Lincoln Paddles", freq: "255.750", tacan: "" },
    { chan: "6", name: "Washington Al Ops", freq: "250.000", tacan: "73X" },
    { chan: "7", name: "Washington Marshal", freq: "256.500", tacan: "" },
    { chan: "8", name: "Washington Paddles", freq: "254.750", tacan: "" },
    { chan: "9", name: "——", freq: "——", tacan: "——" },
    { chan: "10", name: "Flex", freq: "——", tacan: "——" },
    { chan: "11", name: "Arco", freq: "245.000", tacan: "45X" },
    { chan: "12", name: "Shell", freq: "246.000", tacan: "46X" },
    { chan: "13", name: "Texaco", freq: "247.000", tacan: "47X" },
    { chan: "14", name: "Bloodhound (S-3B)", freq: "248.000", tacan: "48X" },
    { chan: "15", name: "Mauler (S-3B)", freq: "249.000", tacan: "49X" }
  ];

  // Add channels 16-20 with blank entries
  for (let i = 16; i <= 20; i++) {
    baseData.push({ chan: i.toString(), name: "", freq: "", tacan: "" });
  }

  return baseData;
};

const Communications: React.FC<CommunicationsProps> = ({ width }) => {
  const [selectedEncryption, setSelectedEncryption] = useState<number | null>(null);
  const [commsData, setCommsData] = useState<CommsPlanEntry[]>(generateInitialCommsData());

  const handleEncryptionSelect = (number: number) => {
    setSelectedEncryption(number === selectedEncryption ? null : number);
  };

  const handleCellEdit = (index: number, field: 'name' | 'freq' | 'tacan', value: string) => {
    const newData = [...commsData];
    newData[index][field] = value;
    setCommsData(newData);
  };

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      gap: '20px',
      width
    }}>
      {/* Encryption Card */}
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
          overflowY: 'auto',
          boxSizing: 'border-box'
        }}
      >
        <h2 className="text-lg font-semibold mb-4">Encryption Channel</h2>
        <div className="flex justify-between">
          {[1, 2, 3, 4, 5, 6].map((number) => (
            <button
              key={number}
              onClick={() => handleEncryptionSelect(number)}
              style={{
                width: '48px',
                height: '48px',
                backgroundColor: selectedEncryption === number ? '#F24607' : '#FFFFFF',
                color: selectedEncryption === number ? '#FFFFFF' : '#64748B',
                border: '1px solid #CBD5E1',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 0.2s ease-in-out',
                fontFamily: 'Inter',
                fontSize: '14px',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              onMouseEnter={e => {
                if (selectedEncryption !== number) {
                  e.currentTarget.style.backgroundColor = '#F8FAFC';
                }
              }}
              onMouseLeave={e => {
                if (selectedEncryption !== number) {
                  e.currentTarget.style.backgroundColor = '#FFFFFF';
                }
              }}
            >
              {number}
            </button>
          ))}
        </div>
      </Card>

      {/* Comms Plan Card */}
      <Card 
        style={{
          flex: 1,
          width: '100%',
          backgroundColor: '#FFFFFF',
          boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)',
          borderRadius: '8px',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          overflowY: 'auto',
          boxSizing: 'border-box'
        }}
      >
        <h2 className="text-lg font-semibold mb-4">Comms Plan</h2>
        <div className="space-y-4" style={{ overflowX: 'hidden' }}>
          <table className="w-full" style={{ tableLayout: 'auto' }}>
            <colgroup>
              <col style={{ width: 'auto' }} />
              <col />
              <col style={{ width: 'auto' }} />
              <col style={{ width: 'auto' }} />
            </colgroup>
            <thead>
              <tr>
                <th className="text-center p-2 text-slate-500 font-medium whitespace-nowrap">Chan</th>
                <th className="text-left p-2 text-slate-500 font-medium">Name</th>
                <th className="text-left p-2 text-slate-500 font-medium whitespace-nowrap">Freq</th>
                <th className="text-center p-2 text-slate-500 font-medium whitespace-nowrap">TACAN</th>
              </tr>
            </thead>
            <tbody>
              {commsData.map((row, index) => (
                <tr 
                  key={index}
                  style={{
                    backgroundColor: index % 2 === 0 ? '#F8FAFC' : 'transparent'
                  }}
                >
                  <td className="p-2 text-center whitespace-nowrap">{row.chan}</td>
                  <td className="p-2">
                    <input
                      type="text"
                      value={row.name}
                      onChange={(e) => handleCellEdit(index, 'name', e.target.value)}
                      className="w-full bg-transparent border-none focus:outline-none focus:ring-1 focus:ring-blue-500 rounded px-1"
                    />
                  </td>
                  <td className="p-2 whitespace-nowrap">
                    <input
                      type="text"
                      value={row.freq}
                      onChange={(e) => handleCellEdit(index, 'freq', e.target.value)}
                      className="w-full bg-transparent border-none focus:outline-none focus:ring-1 focus:ring-blue-500 rounded px-1 font-mono"
                    />
                  </td>
                  <td className="p-2 text-center whitespace-nowrap">
                    <input
                      type="text"
                      value={row.tacan}
                      onChange={(e) => handleCellEdit(index, 'tacan', e.target.value)}
                      className="w-full bg-transparent border-none focus:outline-none focus:ring-1 focus:ring-blue-500 rounded px-1 text-center"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Export Card */}
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
          overflowY: 'auto',
          boxSizing: 'border-box'
        }}
      >
        <h2 className="text-lg font-semibold mb-4">Export</h2>
        <div className="flex gap-4">
          <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
            <FileDown size={16} />
            Export Kneeboards
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
            <FileDown size={16} />
            Export to Mission
          </button>
        </div>
      </Card>
    </div>
  );
};

export default Communications;