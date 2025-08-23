import React, { useState, useEffect } from 'react';
import { MessageSquare, Plus, Edit, Trash, AlertCircle, Crown, Shield, Users, User, Server } from 'lucide-react';
import { getAvailableDiscordServers, getServerChannels, DiscordServer } from '../../utils/discordService';

interface DiscordChannel {
  id: string;
  name: string;
  type: 'events' | 'briefing';
}

interface RoleMapping {
  id: string;
  discordRoleId: string;
  discordRoleName: string;
  appPermission: 'admin' | 'flight_lead' | 'member' | 'guest';
  priority: number;
}

interface SquadronDiscordSettingsProps {
  discordChannels?: DiscordChannel[];
  roleMappings?: RoleMapping[];
  selectedGuildId?: string;
  onChannelsChange?: (channels: DiscordChannel[]) => void;
  onRoleMappingsChange?: (mappings: RoleMapping[]) => void;
  onGuildChange?: (guildId: string) => void;
}

const SquadronDiscordSettings: React.FC<SquadronDiscordSettingsProps> = ({
  discordChannels = [],
  roleMappings = [],
  selectedGuildId,
  onChannelsChange,
  onRoleMappingsChange,
  onGuildChange
}) => {
  const [showChannelForm, setShowChannelForm] = useState(false);
  const [showRoleForm, setShowRoleForm] = useState(false);
  const [newChannel, setNewChannel] = useState({ id: '', name: '', type: 'events' as const });
  
  // Discord server and channel state
  const [availableServers, setAvailableServers] = useState<DiscordServer[]>([]);
  const [availableChannels, setAvailableChannels] = useState<Array<{id: string, name: string, type: string}>>([]);
  const [loadingServers, setLoadingServers] = useState(false);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load Discord servers on component mount
  useEffect(() => {
    const fetchDiscordServers = async () => {
      setLoadingServers(true);
      setError(null);
      try {
        const response = await getAvailableDiscordServers();
        if (response.success && response.servers) {
          setAvailableServers(response.servers);
        } else {
          setError(response.error || 'Failed to fetch Discord servers');
        }
      } catch (err: any) {
        setError(err.message || 'Error fetching Discord servers');
      } finally {
        setLoadingServers(false);
      }
    };

    fetchDiscordServers();
  }, []);

  // Load channels when guild is selected
  useEffect(() => {
    if (selectedGuildId) {
      const fetchChannels = async () => {
        setLoadingChannels(true);
        setError(null);
        try {
          const response = await getServerChannels(selectedGuildId);
          if (response.success && response.channels) {
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
                name: channel.name,
                type: channel.type
              }))
              .sort((a, b) => a.name.localeCompare(b.name));
            
            setAvailableChannels(textChannels);
          } else {
            setError(response.error || 'Failed to fetch Discord channels');
          }
        } catch (err: any) {
          setError(err.message || 'Error fetching Discord channels');
        } finally {
          setLoadingChannels(false);
        }
      };

      fetchChannels();
    } else {
      setAvailableChannels([]);
    }
  }, [selectedGuildId]);

  const getPermissionIcon = (permission: string) => {
    switch (permission) {
      case 'admin':
        return <Crown size={14} className="text-red-600" />;
      case 'flight_lead':
        return <Shield size={14} className="text-orange-600" />;
      case 'member':
        return <Users size={14} className="text-blue-600" />;
      case 'guest':
        return <User size={14} className="text-gray-600" />;
      default:
        return null;
    }
  };

  const getPermissionLabel = (permission: string) => {
    switch (permission) {
      case 'admin':
        return 'Administrator';
      case 'flight_lead':
        return 'Flight Lead';
      case 'member':
        return 'Member';
      case 'guest':
        return 'Guest';
      default:
        return permission;
    }
  };

  const handleAddChannel = () => {
    if (newChannel.id && newChannel.name) {
      const channel: DiscordChannel = {
        id: newChannel.id,
        name: newChannel.name,
        type: newChannel.type
      };
      const updatedChannels = [...discordChannels, channel];
      onChannelsChange?.(updatedChannels);
      setNewChannel({ id: '', name: '', type: 'events' });
      setShowChannelForm(false);
    }
  };

  const handleChannelSelect = (channelId: string) => {
    const selectedChannel = availableChannels.find(ch => ch.id === channelId);
    if (selectedChannel) {
      setNewChannel({
        id: selectedChannel.id,
        name: selectedChannel.name,
        type: newChannel.type
      });
    }
  };

  const handleRemoveChannel = (channelId: string) => {
    const updatedChannels = discordChannels.filter(c => c.id !== channelId);
    onChannelsChange?.(updatedChannels);
  };

  return (
    <div style={{
      marginBottom: '24px'
    }}>
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '8px', 
        marginBottom: '20px' 
      }}>
        <MessageSquare size={18} style={{ color: '#5865F2' }} />
        <h4 style={{ 
          fontSize: '16px', 
          fontWeight: 600, 
          color: '#0F172A', 
          margin: 0 
        }}>
          Discord Integration
        </h4>
      </div>

      {/* Error Display */}
      {error && (
        <div style={{
          marginBottom: '16px',
          padding: '12px',
          backgroundColor: '#FEF2F2',
          border: '1px solid #FECACA',
          borderRadius: '6px',
          color: '#DC2626',
          fontSize: '14px'
        }}>
          {error}
        </div>
      )}

      {/* Discord Server Selection */}
      <div style={{ marginBottom: '24px' }}>
        <label style={{
          display: 'block',
          marginBottom: '8px',
          fontSize: '14px',
          fontWeight: 500,
          color: '#64748B'
        }}>
          Discord Server
        </label>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <Server size={16} style={{ color: '#5865F2' }} />
          <select
            value={selectedGuildId || ''}
            onChange={(e) => onGuildChange?.(e.target.value)}
            disabled={loadingServers}
            style={{
              flex: 1,
              padding: '8px 12px',
              border: '1px solid #CBD5E1',
              borderRadius: '4px',
              fontSize: '14px',
              backgroundColor: loadingServers ? '#F9FAFB' : 'white',
              cursor: loadingServers ? 'not-allowed' : 'pointer'
            }}
          >
            <option value="">
              {loadingServers ? 'Loading servers...' : 'Select a Discord server'}
            </option>
            {availableServers.map((server) => (
              <option key={server.id} value={server.id}>
                {server.name} ({server.memberCount} members)
              </option>
            ))}
          </select>
        </div>
        {!selectedGuildId && availableServers.length > 0 && (
          <p style={{
            fontSize: '12px',
            color: '#6B7280',
            marginTop: '4px',
            fontStyle: 'italic'
          }}>
            Select the Discord server associated with this squadron
          </p>
        )}
      </div>

      {/* Discord Channels Section */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          marginBottom: '12px' 
        }}>
          <label style={{
            fontSize: '14px',
            fontWeight: 500,
            color: '#64748B'
          }}>
            Discord Channels
          </label>
          <button
            type="button"
            onClick={() => setShowChannelForm(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 8px',
              backgroundColor: '#3B82F6',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
              fontFamily: 'Inter'
            }}
          >
            <Plus size={12} />
            Add Channel
          </button>
        </div>

        <div style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: '6px',
          minHeight: '80px',
          padding: '8px'
        }}>
          {discordChannels.length === 0 ? (
            <div style={{
              padding: '20px',
              textAlign: 'center',
              color: '#64748B',
              fontSize: '14px'
            }}>
              No Discord channels configured.
              <br />
              <span style={{ fontSize: '12px' }}>
                Add channels for events and briefings.
              </span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {discordChannels.map((channel) => (
                <div key={channel.id} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 12px',
                  backgroundColor: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: '4px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                      fontSize: '12px',
                      padding: '2px 6px',
                      backgroundColor: channel.type === 'events' ? '#DBEAFE' : '#FEF3C7',
                      color: channel.type === 'events' ? '#1D4ED8' : '#D97706',
                      borderRadius: '3px',
                      textTransform: 'uppercase',
                      fontWeight: 500
                    }}>
                      {channel.type}
                    </span>
                    <span style={{ fontSize: '14px', color: '#0F172A' }}>
                      #{channel.name}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveChannel(channel.id)}
                    style={{
                      padding: '2px',
                      backgroundColor: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      color: '#EF4444'
                    }}
                  >
                    <Trash size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add Channel Form */}
          {showChannelForm && selectedGuildId && (
            <div style={{
              marginTop: '8px',
              padding: '12px',
              backgroundColor: '#F1F5F9',
              border: '1px solid #CBD5E1',
              borderRadius: '4px'
            }}>
              <div style={{ 
                display: 'flex', 
                gap: '8px', 
                alignItems: 'center', 
                marginBottom: '8px' 
              }}>
                <select
                  value={newChannel.type}
                  onChange={(e) => setNewChannel({ 
                    ...newChannel, 
                    type: e.target.value as 'events' | 'briefing' 
                  })}
                  style={{
                    padding: '4px 8px',
                    border: '1px solid #CBD5E1',
                    borderRadius: '4px',
                    fontSize: '12px',
                    width: '80px'
                  }}
                >
                  <option value="events">Events</option>
                  <option value="briefing">Briefing</option>
                </select>
                <span style={{ fontSize: '14px', color: '#64748B' }}>#</span>
                <select
                  value={newChannel.id}
                  onChange={(e) => handleChannelSelect(e.target.value)}
                  disabled={loadingChannels}
                  style={{
                    flex: 1,
                    padding: '4px 8px',
                    border: '1px solid #CBD5E1',
                    borderRadius: '4px',
                    fontSize: '14px',
                    backgroundColor: loadingChannels ? '#F9FAFB' : 'white',
                    cursor: loadingChannels ? 'not-allowed' : 'pointer'
                  }}
                >
                  <option value="">
                    {loadingChannels ? 'Loading channels...' : 'Select a Discord channel'}
                  </option>
                  {availableChannels.map((channel) => (
                    <option key={channel.id} value={channel.id}>
                      {channel.name}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowChannelForm(false);
                    setNewChannel({ id: '', name: '', type: 'events' });
                  }}
                  style={{
                    padding: '4px 8px',
                    backgroundColor: '#F1F5F9',
                    border: '1px solid #CBD5E1',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    color: '#475569'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleAddChannel}
                  disabled={!newChannel.id || !newChannel.name}
                  style={{
                    padding: '4px 8px',
                    backgroundColor: (!newChannel.id || !newChannel.name) ? '#9CA3AF' : '#3B82F6',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: (!newChannel.id || !newChannel.name) ? 'not-allowed' : 'pointer',
                    fontSize: '12px'
                  }}
                >
                  Add
                </button>
              </div>
            </div>
          )}
          
          {/* Show message if no server selected */}
          {showChannelForm && !selectedGuildId && (
            <div style={{
              marginTop: '8px',
              padding: '12px',
              backgroundColor: '#FEF3C7',
              border: '1px solid #FCD34D',
              borderRadius: '4px',
              textAlign: 'center',
              color: '#92400E',
              fontSize: '14px'
            }}>
              Please select a Discord server first to add channels.
            </div>
          )}
        </div>
      </div>

      {/* Role Mappings Section */}
      <div>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          marginBottom: '12px' 
        }}>
          <label style={{
            fontSize: '14px',
            fontWeight: 500,
            color: '#64748B'
          }}>
            Role Mappings
          </label>
          <button
            type="button"
            onClick={() => setShowRoleForm(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 8px',
              backgroundColor: '#8B5CF6',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
              fontFamily: 'Inter'
            }}
          >
            <Plus size={12} />
            Map Role
          </button>
        </div>

        <div style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: '6px',
          minHeight: '80px',
          padding: '8px'
        }}>
          {roleMappings.length === 0 ? (
            <div style={{
              padding: '20px',
              textAlign: 'center',
              color: '#64748B',
              fontSize: '14px'
            }}>
              No role mappings configured.
              <br />
              <span style={{ fontSize: '12px' }}>
                Map Discord roles to application permissions.
              </span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {roleMappings.map((mapping) => (
                <div key={mapping.id} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 12px',
                  backgroundColor: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: '4px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {getPermissionIcon(mapping.appPermission)}
                    <span style={{ fontSize: '14px', color: '#0F172A' }}>
                      {mapping.discordRoleName}
                    </span>
                    <span style={{ fontSize: '12px', color: '#64748B' }}>→</span>
                    <span style={{ 
                      fontSize: '12px', 
                      color: '#3B82F6',
                      fontWeight: 500
                    }}>
                      {getPermissionLabel(mapping.appPermission)}
                    </span>
                  </div>
                  <button
                    type="button"
                    style={{
                      padding: '2px',
                      backgroundColor: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      color: '#EF4444'
                    }}
                  >
                    <Trash size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{
          marginTop: '8px',
          padding: '8px',
          backgroundColor: '#FEF3C7',
          border: '1px solid #FCD34D',
          borderRadius: '4px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <AlertCircle size={14} style={{ color: '#D97706' }} />
          <span style={{
            fontSize: '12px',
            color: '#92400E',
            lineHeight: '1.3'
          }}>
            Role mappings will automatically assign permissions when squadron members authenticate via Discord.
          </span>
        </div>
      </div>
    </div>
  );
};

export default SquadronDiscordSettings;