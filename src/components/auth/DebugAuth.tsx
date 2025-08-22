import React from 'react';
import { useAuth } from '../../context/AuthContext';

const DebugAuth: React.FC = () => {
  const { user, session, userProfile, loading, error } = useAuth();

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">Auth Debug Information</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Auth State */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-lg font-semibold mb-4">Auth State</h2>
            <div className="space-y-2 text-sm">
              <div><strong>Loading:</strong> {loading ? 'Yes' : 'No'}</div>
              <div><strong>Error:</strong> {error || 'None'}</div>
              <div><strong>User:</strong> {user ? 'Authenticated' : 'Not authenticated'}</div>
              <div><strong>Session:</strong> {session ? 'Active' : 'None'}</div>
              <div><strong>User Profile:</strong> {userProfile ? 'Loaded' : 'None'}</div>
            </div>
          </div>

          {/* User Details */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-lg font-semibold mb-4">User Details</h2>
            {user ? (
              <div className="space-y-2 text-sm">
                <div><strong>ID:</strong> {user.id}</div>
                <div><strong>Email:</strong> {user.email || 'None'}</div>
                <div><strong>Provider:</strong> {user.app_metadata?.provider || 'Unknown'}</div>
                <div><strong>Created:</strong> {user.created_at}</div>
                <div><strong>Discord ID:</strong> {user.user_metadata?.provider_id || user.user_metadata?.sub || 'None'}</div>
                <div><strong>Discord Username:</strong> {user.user_metadata?.name || user.user_metadata?.user_name || 'None'}</div>
                <div><strong>Avatar URL:</strong> {user.user_metadata?.avatar_url || 'None'}</div>
              </div>
            ) : (
              <div className="text-gray-500">No user data</div>
            )}
          </div>

          {/* User Profile */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-lg font-semibold mb-4">User Profile</h2>
            {userProfile ? (
              <div className="space-y-2 text-sm">
                <div><strong>ID:</strong> {userProfile.id}</div>
                <div><strong>Discord ID:</strong> {userProfile.discordId || 'None'}</div>
                <div><strong>Discord Username:</strong> {userProfile.discordUsername || 'None'}</div>
                <div><strong>Pilot ID:</strong> {userProfile.pilotId || 'None'}</div>
                <div><strong>Pilot Info:</strong> {userProfile.pilot ? `${userProfile.pilot.callsign} (#${userProfile.pilot.boardNumber})` : 'None'}</div>
              </div>
            ) : (
              <div className="text-gray-500">No profile data</div>
            )}
          </div>

          {/* Raw Data */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-lg font-semibold mb-4">Raw Data</h2>
            <div className="space-y-4">
              <div>
                <h3 className="font-medium">User Object:</h3>
                <pre className="text-xs bg-gray-100 p-2 rounded overflow-auto max-h-32">
                  {JSON.stringify(user, null, 2)}
                </pre>
              </div>
              <div>
                <h3 className="font-medium">User Profile Object:</h3>
                <pre className="text-xs bg-gray-100 p-2 rounded overflow-auto max-h-32">
                  {JSON.stringify(userProfile, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6">
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Reload Page
          </button>
        </div>
      </div>
    </div>
  );
};

export default DebugAuth;