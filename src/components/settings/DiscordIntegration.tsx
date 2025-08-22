import React, { useState, useEffect } from 'react';
import { AlertCircle, Check, X } from 'lucide-react';
import { DiscordServer, getAvailableDiscordServers, getServerChannels } from '../../utils/discordService';
import { supabase } from '../../utils/supabaseClient';

// Discord SVG icon component
const DiscordIcon = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 -28.5 256 256" version="1.1" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid">
    <g>
      <path d="M216.856339,16.5966031 C200.285002,8.84328665 182.566144,3.2084988 164.041564,0 C161.766523,4.11318106 159.108624,9.64549908 157.276099,14.0464379 C137.583995,11.0849896 118.072967,11.0849896 98.7430163,14.0464379 C96.9108417,9.64549908 94.1925838,4.11318106 91.8971895,0 C73.3526068,3.2084988 55.6133949,8.86399117 39.0420583,16.6376612 C5.61752293,67.146514 -3.4433191,116.400813 1.08711069,164.955721 C23.2560196,181.510915 44.7403634,191.567697 65.8621325,198.148576 C71.0772151,190.971126 75.7283628,183.341335 79.7352139,175.300261 C72.104019,172.400575 64.7949724,168.822202 57.8887866,164.667963 C59.7209612,163.310589 61.5131304,161.891452 63.2445898,160.431257 C105.36741,180.133187 151.134928,180.133187 192.754523,160.431257 C194.506336,161.891452 196.298154,163.310589 198.110326,164.667963 C191.183787,168.842556 183.854737,172.420929 176.223542,175.320965 C180.230393,183.341335 184.861538,190.991831 190.096624,198.16893 C211.238746,191.588051 232.743023,181.531619 254.911949,164.955721 C260.227747,108.668201 245.831087,59.8662432 216.856339,16.5966031 Z M85.4738752,135.09489 C72.8290281,135.09489 62.4592217,123.290155 62.4592217,108.914901 C62.4592217,94.5396472 72.607595,82.7145587 85.4738752,82.7145587 C98.3405064,82.7145587 108.709962,94.5189427 108.488529,108.914901 C108.508531,123.290155 98.3405064,135.09489 85.4738752,135.09489 Z M170.525237,135.09489 C157.88039,135.09489 147.510584,123.290155 147.510584,108.914901 C147.510584,94.5396472 157.658606,82.7145587 170.525237,82.7145587 C183.391518,82.7145587 193.761324,94.5189427 193.539891,108.914901 C193.539891,123.290155 183.391518,135.09489 170.525237,135.09489 Z" fill="#5865F2" fillRule="nonzero"></path>
    </g>
  </svg>
);

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
  
  const [availableChannels, setAvailableChannels] = useState<Array<{id: string, name: string}>>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [savedChannelId, setSavedChannelId] = useState<string | null>(null);
  const [loadingChannels, setLoadingChannels] = useState(false);

  const setErrorMessage = (message: string | null) => {
    setLocalError(message);
    if (setParentError) {
      setParentError(message);
    }
  };

  useEffect(() => {
    const fetchDiscordServers = async () => {
      setLoading(true);
      try {
        const response = await getAvailableDiscordServers();
        
        if (!response.success) {
          throw new Error(response.error || 'Failed to fetch Discord servers');
        }
        
        setAvailableServers(response.servers || []);
        
        const { data: settingsData, error: settingsError } = await supabase
          .from('squadron_settings')
          .select('key, value')
          .in('key', ['discord_guild_id', 'events_channel_id']);

        if (settingsError) {
          console.error('Error fetching Discord settings from database:', settingsError);
        }

        let dbServerId = null;
        let dbChannelId = null;

        if (settingsData) {
          settingsData.forEach(setting => {
            if (setting.key === 'discord_guild_id' && setting.value) {
              dbServerId = setting.value;
            } else if (setting.key === 'events_channel_id' && setting.value) {
              dbChannelId = setting.value;
            }
          });
        }
        
        const localServerId = localStorage.getItem('discordSelectedServer');
        const localChannelId = localStorage.getItem('discordSelectedChannel');
        
        const serverId = dbServerId || localServerId;
        if (serverId) {
          setSelectedServerId(serverId);
          setSavedServerId(serverId);
          
          await fetchServerChannels(serverId);
          
          const channelId = dbChannelId || localChannelId;
          if (channelId) {
            setSelectedChannelId(channelId);
            setSavedChannelId(channelId);
          }
        } else if (response.servers && response.servers.length > 0) {
          setSelectedServerId(response.servers[0].id);
          await fetchServerChannels(response.servers[0].id);
        }
        
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

  const fetchServerChannels = async (serverId: string) => {
    setLoadingChannels(true);
    try {
      // Call the Discord API to get the actual server channels
      const response = await getServerChannels(serverId);
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to fetch Discord server channels');
      }
      
      // Filter to only show text channels and sort them alphabetically
      const textChannels = (response.channels || [])
        .filter(channel => {
          // Accept any channel that could be a text channel
          return channel.type === 0 || 
                 channel.type === '0' || 
                 channel.type === 'GUILD_TEXT' ||
                 channel.type === 'TEXT' ||
                 typeof channel.type === 'number' && [0, 1, 5, 10, 11, 12].includes(channel.type);
        })
        .map(channel => ({
          id: channel.id,
          name: channel.name
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
      
      setAvailableChannels(textChannels);
    } catch (err: any) {
      console.error('Error fetching server channels:', err);
      setErrorMessage(`Could not load Discord channels: ${err.message}`);
      setAvailableChannels([]);
    } finally {
      setLoadingChannels(false);
    }
  };

  const handleServerChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const serverId = e.target.value;
    setSelectedServerId(serverId);
    
    setSelectedChannelId(null);
    
    if (serverId) {
      await fetchServerChannels(serverId);
    } else {
      setAvailableChannels([]);
    }
  };

  const handleChannelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedChannelId(e.target.value);
  };

  const handleSaveSettings = async () => {
    if (!selectedServerId) {
      setErrorMessage('Please select a Discord server');
      return;
    }

    if (!selectedChannelId) {
      setErrorMessage('Please select an events channel');
      return;
    }
    
    try {
      // Create settings objects with required fields
      const serverSettings = {
        key: 'discord_guild_id',
        value: selectedServerId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      const channelSettings = {
        key: 'events_channel_id',
        value: selectedChannelId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      // Use upsert with onConflict parameter to handle existing records
      const { error: serverError } = await supabase
        .from('squadron_settings')
        .upsert(serverSettings, { 
          onConflict: 'key' 
        });
      
      if (serverError) {
        throw new Error(`Error saving server settings: ${serverError.message}`);
      }
      
      const { error: channelError } = await supabase
        .from('squadron_settings')
        .upsert(channelSettings, { 
          onConflict: 'key' 
        });
      
      if (channelError) {
        throw new Error(`Error saving channel settings: ${channelError.message}`);
      }
      
      // Update the UI state to show successful save
      setSavedServerId(selectedServerId);
      setSavedChannelId(selectedChannelId);
      
      setErrorMessage(null);
    } catch (err: any) {
      console.error('Failed to save settings to database:', err);
      setErrorMessage(`Failed to save settings: ${err.message}`);
    }
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


  return (
    <div style={containerStyle}>
      <div style={contentWrapperStyle}>
        {/* Header */}
        <div style={headerStyle}>
          <h2 style={{ fontSize: '24px', fontWeight: 600, margin: 0, color: '#0F172A' }}>
            Discord Integration
          </h2>
          <p style={{ fontSize: '14px', color: '#64748B', margin: '8px 0 0 0', fontFamily: 'Inter' }}>
            Configure Discord integration settings to connect with your squadron's Discord server.
          </p>
        </div>

        {(parentError || localError) && (
          <div style={{
            padding: '16px',
            marginBottom: '24px',
            backgroundColor: '#FEF2F2',
            border: '1px solid #FECACA',
            color: '#DC2626',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            fontFamily: 'Inter',
            fontSize: '14px'
          }} role="alert">
            <AlertCircle size={18} style={{ marginRight: '8px' }} />
            <span>{parentError || localError}</span>
            <button onClick={() => setErrorMessage(null)} style={{
              marginLeft: 'auto',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px'
            }}>
              <X size={16} />
            </button>
          </div>
        )}

        {selectedServerId === savedServerId && selectedChannelId === savedChannelId && savedServerId && savedChannelId && (
          <div style={{
            padding: '16px',
            marginBottom: '24px',
            backgroundColor: '#F0FDF4',
            border: '1px solid #BBF7D0',
            color: '#166534',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            fontFamily: 'Inter',
            fontSize: '14px'
          }} role="alert">
            <Check size={18} style={{ marginRight: '8px' }} />
            <span>Discord settings saved successfully.</span>
          </div>
        )}
        {/* Discord Bot Status Section */}
        <div style={firstSectionStyle}>
          <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#0F172A', margin: '0 0 16px 0' }}>
            Discord Bot Status
          </h3>
          
          <div className="flex items-center p-3 bg-slate-50 rounded-lg border border-slate-200">
            {/* Discord logo with status indicator */}
            <div className="relative mr-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white border border-slate-200">
                <DiscordIcon className="h-7 w-7" />
                <span className={`absolute -bottom-0.5 -right-0.5 rounded-full h-3 w-3 border border-white ${
                  botStatus === 'connected' ? 'bg-green-500' : 
                  botStatus === 'disconnected' ? 'bg-gray-400' :
                  botStatus === 'error' ? 'bg-red-500' :
                  'bg-yellow-500'
                }`}></span>
              </div>
            </div>
            
            <div className="flex-1">
              <p className="font-medium">{
                botStatus === 'connected' ? 'Discord Bot Online' :
                botStatus === 'disconnected' ? 'Discord Bot Offline' : 
                botStatus === 'error' ? 'Connection Error' :
                'Configuration Needed'
              }</p>
              <p className="text-sm text-slate-500">{
                botStatus === 'connected' ? 'The Discord bot is online and ready to manage events.' :
                botStatus === 'disconnected' ? 'The Discord bot appears to be offline.' : 
                botStatus === 'error' ? 'Error connecting to Discord services.' :
                (!selectedServerId || !selectedChannelId) ? 'Please configure server and channel settings.' :
                'Checking connection status...'
              }</p>
            </div>
          </div>
          
          {botStatus === 'disconnected' && (
            <div className="mt-3 p-3 bg-red-50 rounded-lg border border-red-200 text-sm text-red-700">
              <p><strong>Troubleshooting steps:</strong></p>
              <ol className="list-decimal ml-5 mt-1 space-y-1">
                <li>Verify the Discord bot is running on the server</li>
                <li>Ensure the bot has been added to your Discord server</li>
                <li>Check that the bot has proper permissions</li>
                <li>Restart the Discord bot service if needed</li>
              </ol>
            </div>
          )}
        </div>

        {/* Discord Server Configuration Section */}
        <div style={sectionStyle}>
          <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#0F172A', margin: '0 0 16px 0' }}>
            Discord Server Configuration
          </h3>
          
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
                    </option>
                  ))}
                </select>
              </div>
              
              {selectedServerId && (
                <div className="mb-4">
                  <div className="text-sm text-slate-600 mb-2">
                    Server Information:
                  </div>
                  {availableServers.filter(server => server.id === selectedServerId).map(server => (
                    <div key={server.id} className="flex items-center p-3 bg-slate-50 border border-slate-200 rounded-md">
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
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              {selectedServerId && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Events Channel
                  </label>
                  {loadingChannels ? (
                    <div className="text-sm text-slate-500">Loading channels...</div>
                  ) : (
                    <>
                      <select
                        value={selectedChannelId || ''}
                        onChange={handleChannelChange}
                        className="w-full p-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                      >
                        <option value="" disabled>Select an events channel</option>
                        {availableChannels.map(channel => (
                          <option key={channel.id} value={channel.id}>
                            #{channel.name}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-slate-500 mt-1">
                        This channel will be used for posting squadron events and tracking attendance.
                      </p>
                    </>
                  )}
                </div>
              )}
              
              <button
                onClick={handleSaveSettings}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                disabled={loading || !selectedServerId || !selectedChannelId}
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
        </div>

        {/* Required Discord Channels Section */}
        <div style={sectionStyle}>
          <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#0F172A', margin: '0 0 16px 0' }}>
            Required Discord Channels
          </h3>
          
          <p style={{ fontSize: '14px', color: '#64748B', margin: '0 0 24px 0', fontFamily: 'Inter' }}>
            The bot requires specific channels to work properly. Make sure these channels exist on your Discord server.
          </p>
          
          <div className="space-y-2">
            <div className="flex items-center p-3 border border-slate-200 rounded-md bg-slate-50">
              <div className="w-6 h-6 rounded-full bg-green-100 text-green-600 flex items-center justify-center mr-3">
                <Check size={14} />
              </div>
              <div>
                <div className="font-medium">#events</div>
                <div className="text-sm text-slate-500">Required for event announcements and attendance tracking</div>
              </div>
            </div>
            <div className="flex items-center p-3 border border-slate-200 rounded-md">
              <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center mr-3">
                <Check size={14} />
              </div>
              <div>
                <div className="font-medium">#roster</div>
                <div className="text-sm text-slate-500">Optional for roster updates</div>
              </div>
            </div>
            <div className="flex items-center p-3 border border-slate-200 rounded-md">
              <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center mr-3">
                <Check size={14} />
              </div>
              <div>
                <div className="font-medium">#mission-prep</div>
                <div className="text-sm text-slate-500">Optional for mission briefings</div>
              </div>
            </div>
          </div>
        </div>
        
      </div>
    </div>
  );
};

export default DiscordIntegration;