import React, { useState, useEffect } from 'react';
import { Card } from '../ui/card';
import { AlertCircle, Check, X } from 'lucide-react';
import { DiscordServer, getAvailableDiscordServers } from '../../utils/discordService';

interface DiscordIntegrationProps {
  error?: string | null;
  setError?: (error: string | null) => void;
}

const DiscordIntegration: React.FC<DiscordIntegrationProps> = ({ error: parentError, setError: setParentError }) => {
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [availableServers, setAvailableServers] = useState<DiscordServer[]>([]);
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [savedServerId, setSavedServerId] = useState<string | null>(null);
  const [botStatus, setBotStatus] = useState<'connected' | 'disconnected' | 'unknown'>('unknown');

  // Helper to set errors with parent component if available
  const setErrorMessage = (message: string | null) => {
    setLocalError(message);
    if (setParentError) {
      setParentError(message);
    }
  };

  // Fetch available Discord servers when component mounts
  useEffect(() => {
    const fetchDiscordServers = async () => {
      setLoading(true);
      try {
        const response = await getAvailableDiscordServers();
        
        if (!response.success) {
          throw new Error(response.error || 'Failed to fetch Discord servers');
        }
        
        setAvailableServers(response.servers || []);
        
        // Load the saved server ID from local storage
        const savedId = localStorage.getItem('discordSelectedServer');
        if (savedId) {
          setSelectedServerId(savedId);
          setSavedServerId(savedId);
        } else if (response.servers && response.servers.length > 0) {
          // Default to the first server if none is saved
          setSelectedServerId(response.servers[0].id);
        }
        
        // Check bot status
        setBotStatus(response.servers && response.servers.length > 0 ? 'connected' : 'disconnected');
      } catch (err: any) {
        setErrorMessage(err.message || 'Error fetching Discord server list');
        setBotStatus('disconnected');
      } finally {
        setLoading(false);
      }
    };
    
    fetchDiscordServers();
  }, [setParentError]);

  // Handle server selection change
  const handleServerChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedServerId(e.target.value);
  };

  // Save selected server
  const handleSaveSettings = () => {
    if (selectedServerId) {
      localStorage.setItem('discordSelectedServer', selectedServerId);
      setSavedServerId(selectedServerId);
      setErrorMessage(null);
    } else {
      setErrorMessage('Please select a Discord server');
    }
  };

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Discord Integration</h2>
      <p className="text-slate-600 mb-6">
        Configure Discord integration settings to connect with your squadron's Discord server.
      </p>

      {(parentError || localError) && (
        <div className="p-4 mb-4 bg-red-100 border border-red-400 text-red-700 rounded relative flex items-center" role="alert">
          <AlertCircle size={18} className="mr-2" />
          <span>{parentError || localError}</span>
          <button onClick={() => setErrorMessage(null)} className="absolute top-0 right-0 p-2">
            <X size={16} />
          </button>
        </div>
      )}

      {selectedServerId === savedServerId && savedServerId && (
        <div className="p-4 mb-4 bg-green-100 border border-green-400 text-green-700 rounded relative flex items-center" role="alert">
          <Check size={18} className="mr-2" />
          <span>Discord settings saved successfully.</span>
        </div>
      )}

      <div className="space-y-6">
        <Card className="p-4">
          <h3 className="text-lg font-medium mb-3">Discord Bot Status</h3>
          
          <div className="flex items-center mb-4">
            <div className={`w-3 h-3 rounded-full ${
              botStatus === 'connected' ? 'bg-green-500' :
              botStatus === 'disconnected' ? 'bg-red-500' : 'bg-yellow-500'
            } mr-2`}></div>
            <span>{
              botStatus === 'connected' ? 'Bot is online and connected' :
              botStatus === 'disconnected' ? 'Bot is offline or disconnected' : 
              'Checking bot status...'
            }</span>
          </div>
          
          {botStatus === 'disconnected' && (
            <div className="text-sm text-red-700 mb-4">
              <p>The Discord bot appears to be offline or not properly configured.</p>
              <p>Please ensure the bot is running and has been added to your Discord server.</p>
            </div>
          )}
        </Card>

        <Card className="p-4">
          <h3 className="text-lg font-medium mb-3">Discord Server Selection</h3>
          
          {loading ? (
            <div className="text-center py-4">Loading available Discord servers...</div>
          ) : availableServers.length > 0 ? (
            <>
              <p className="text-sm text-slate-600 mb-4">
                Select the Discord server you want to use for event announcements and roster integration.
                The bot must have already been added to the server and have proper permissions.
              </p>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Discord Server
                </label>
                <select
                  value={selectedServerId || ''}
                  onChange={handleServerChange}
                  className="w-full p-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="" disabled>Select a Discord server</option>
                  {availableServers.map(server => (
                    <option key={server.id} value={server.id}>
                      {server.name} ({server.memberCount} members)
                      {!server.hasEventsChannel && " - No #events channel"}
                    </option>
                  ))}
                </select>
              </div>
              
              {selectedServerId && (
                <div className="mb-4">
                  <div className="text-sm text-slate-600 mb-2">
                    Selected Server Information:
                  </div>
                  {availableServers.filter(server => server.id === selectedServerId).map(server => (
                    <div key={server.id} className="flex items-center p-3 border border-slate-200 rounded-md">
                      {server.icon && (
                        <img 
                          src={server.icon}
                          alt={`${server.name} icon`}
                          className="w-12 h-12 rounded-full mr-3"
                        />
                      )}
                      <div>
                        <div className="font-medium">{server.name}</div>
                        <div className="text-sm text-slate-500">{server.memberCount} members</div>
                        {server.hasEventsChannel ? (
                          <div className="text-xs text-green-600">Has #events channel</div>
                        ) : (
                          <div className="text-xs text-red-600">
                            Missing #events channel - please create this channel for event announcements
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              <button
                onClick={handleSaveSettings}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                disabled={loading || !selectedServerId}
              >
                Save Discord Settings
              </button>
            </>
          ) : (
            <div className="text-center py-4">
              <p className="text-red-600 mb-4">No Discord servers found.</p>
              <p className="text-sm text-slate-600">
                Make sure the Discord bot has been added to your server and has proper permissions.
              </p>
              <a 
                href="https://discord.com/api/oauth2/authorize?client_id=YOURCLIENTID&permissions=8&scope=bot"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-block px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
              >
                Add Bot to Server
              </a>
            </div>
          )}
        </Card>

        <Card className="p-4">
          <h3 className="text-lg font-medium mb-3">Discord Channel Configuration</h3>
          
          <p className="text-sm text-slate-600 mb-4">
            The bot requires specific channels to work properly. Make sure these channels exist on your Discord server.
          </p>
          
          <div className="space-y-2">
            <div className="flex items-center p-2 border-b border-slate-200">
              <div className="font-medium">#events</div>
              <div className="ml-auto text-sm text-slate-500">Required for event announcements</div>
            </div>
            <div className="flex items-center p-2 border-b border-slate-200">
              <div className="font-medium">#roster</div>
              <div className="ml-auto text-sm text-slate-500">Optional for roster updates</div>
            </div>
            <div className="flex items-center p-2 border-b border-slate-200">
              <div className="font-medium">#mission-prep</div>
              <div className="ml-auto text-sm text-slate-500">Optional for mission briefings</div>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="text-lg font-medium mb-3">Discord User Synchronization</h3>
          
          <div className="flex justify-between items-center mb-4">
            <div>
              <div className="font-medium">Synchronize Discord Users with Roster</div>
              <p className="text-sm text-slate-500">
                Automatically match Discord users with pilots in your squadron roster.
              </p>
            </div>
            <button className="px-4 py-2 bg-slate-200 text-slate-700 rounded-md hover:bg-slate-300">
              Sync Now
            </button>
          </div>
          
          <div className="flex justify-between items-center">
            <div>
              <div className="font-medium">Role-Based Access Control</div>
              <p className="text-sm text-slate-500">
                Map Discord roles to application permissions.
              </p>
            </div>
            <button className="px-4 py-2 bg-slate-200 text-slate-700 rounded-md hover:bg-slate-300">
              Configure
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default DiscordIntegration;