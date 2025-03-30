import React, { useState, useRef } from 'react';
import { Card } from './card';
import LoginForm from './LoginForm';
import { importPilotsToSupabase } from '../../utils/migratePilots';
import { Pilot } from '../../types/PilotTypes';

const AdminTools: React.FC = () => {
  const [migrationStatus, setMigrationStatus] = useState<string | null>(null);
  const [migrationDetails, setMigrationDetails] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || event.target.files.length === 0) {
      return;
    }
    
    const file = event.target.files[0];
    const reader = new FileReader();
    
    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string;
        const pilots = JSON.parse(content) as Pilot[];
        
        if (!Array.isArray(pilots)) {
          setMigrationStatus('Error: Uploaded file must contain an array of pilots');
          return;
        }
        
        await handleMigratePilots(pilots);
      } catch (error) {
        setMigrationStatus('Error parsing JSON file');
        setMigrationDetails(`${error}`);
      }
    };
    
    reader.readAsText(file);
  };
  
  const handleMigratePilots = async (pilotsData: Pilot[]) => {
    if (!isLoggedIn) {
      setMigrationStatus('Please log in to perform this operation');
      return;
    }
    
    if (!pilotsData || pilotsData.length === 0) {
      setMigrationStatus('No pilot data provided');
      return;
    }
    
    setIsLoading(true);
    setMigrationStatus('Migrating pilots to database...');
    setMigrationDetails(`Processing ${pilotsData.length} pilots...`);
    
    try {
      const result = await importPilotsToSupabase(pilotsData);
      
      if (result.success) {
        setMigrationStatus(`Migration completed successfully. ${result.count} pilots imported.`);
        setMigrationDetails(null);
      } else {
        setMigrationStatus(`Migration failed`);
        
        // More detailed error information for debugging
        if (result.error && typeof result.error === 'object') {
          const errorDetails = JSON.stringify(result.error, null, 2);
          setMigrationDetails(`Error details: ${errorDetails}`);
        } else {
          setMigrationDetails(`Error: ${result.error}`);
        }
      }
    } catch (error: any) {
      console.error('Migration error:', error);
      setMigrationStatus(`Migration error`);
      
      // Enhanced error output for debugging
      if (error && typeof error === 'object') {
        try {
          const errorDetails = JSON.stringify(error, Object.getOwnPropertyNames(error), 2);
          setMigrationDetails(`Error details: ${errorDetails}`);
        } catch (e) {
          setMigrationDetails(`Error: ${error.message || 'Unknown error'}`);
        }
      } else {
        setMigrationDetails(`Error: ${error}`);
      }
    } finally {
      setIsLoading(false);
      
      // Clear the file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleLoginStateChange = (loggedIn: boolean) => {
    setIsLoggedIn(loggedIn);
    // Clear migration status when login state changes
    if (!loggedIn) {
      setMigrationStatus(null);
      setMigrationDetails(null);
    }
  };
  
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Admin Tools</h1>
      
      {/* Login Form */}
      <div className="mb-6">
        <LoginForm onLoginStateChange={handleLoginStateChange} />
      </div>

      {/* Database Operations */}
      <Card className="p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Database Migration</h2>
        <p className="mb-4">
          Import pilot data to the Supabase database. Upload a JSON file containing an array of pilot objects.
        </p>
        
        <div className="flex flex-col gap-4">
          <div>
            <input
              type="file"
              accept=".json"
              onChange={handleFileUpload}
              ref={fileInputRef}
              disabled={isLoading || !isLoggedIn}
              className="mb-4"
            />
            
            {!isLoggedIn && !migrationStatus && (
              <p className="mt-2 text-amber-600">
                Please log in to perform database operations
              </p>
            )}
            
            {migrationStatus && (
              <div className={`mt-3 p-3 rounded ${
                migrationStatus.includes('success') 
                  ? 'bg-green-100 text-green-800' 
                  : migrationStatus.includes('fail') || migrationStatus.includes('error') || migrationStatus.includes('Error')
                    ? 'bg-red-100 text-red-800'
                    : 'bg-blue-100 text-blue-800'
              }`}>
                <div className="font-medium">{migrationStatus}</div>
                {migrationDetails && (
                  <pre className="mt-2 text-xs overflow-auto max-h-[200px] p-2 bg-white/50 rounded">
                    {migrationDetails}
                  </pre>
                )}
              </div>
            )}
          </div>
        </div>
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