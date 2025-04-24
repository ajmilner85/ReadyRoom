import React from 'react';
import { Card } from './card';
import LoginForm from './LoginForm';
import { Pilot } from '../../types/PilotTypes';

const AdminTools: React.FC = () => {
  const handleLoginStateChange = (loggedIn: boolean) => {
    // Keep the login state handler for future functionality
    console.log('Login state changed:', loggedIn);
  };
  
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Admin Tools</h1>
      
      {/* Login Form */}
      <div className="mb-6">
        <LoginForm onLoginStateChange={handleLoginStateChange} />
      </div>

      {/* Database Operations - Placeholder */}
      <Card className="p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Database Operations</h2>
        <p className="mb-4">
          The pilot migration functionality has been deprecated. Please contact your administrator for database operations.
        </p>
      </Card>
      
      <Card className="p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Export Sample JSON Format</h2>
        <p className="mb-4">
          Download a sample JSON template for the pilot data format.
        </p>
        <button
          onClick={() => {
            const samplePilots: Pilot[] = [
              {
                id: "sample-id-1",
                callsign: "Callsign",
                boardNumber: "123",
                status: "Provisional",
                billet: "Sample Billet",
                qualifications: [
                  {
                    id: "qual-1",
                    type: "LSO",
                    dateAchieved: "2025-01-15"
                  }
                ],
                discordUsername: "discord_user"
              }
            ];
            
            const dataStr = JSON.stringify(samplePilots, null, 2);
            const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
            
            const exportFileDefaultName = 'sample_pilots.json';
            
            const linkElement = document.createElement('a');
            linkElement.setAttribute('href', dataUri);
            linkElement.setAttribute('download', exportFileDefaultName);
            linkElement.click();
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Download Sample JSON
        </button>
      </Card>
      
      <div className="text-sm text-gray-500 mt-8">
        <h3 className="font-medium mb-2">Supabase Configuration Notes:</h3>
        <ul className="list-disc list-inside space-y-1">
          <li>Ensure you've run the RLS setup SQL script in your Supabase project</li>
          <li>Authenticated users have full access to database operations</li>
          <li>Anonymous users can only read data</li>
          <li>To create a new admin user, use the Supabase Authentication dashboard</li>
        </ul>
      </div>
    </div>
  );
};

export default AdminTools;