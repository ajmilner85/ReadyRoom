import React, { useState } from 'react';
import { MessageSquare, Plus, Edit, Trash, AlertCircle, Crown, Shield, Users, User } from 'lucide-react';

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
  onChannelsChange?: (channels: DiscordChannel[]) => void;
  onRoleMappingsChange?: (mappings: RoleMapping[]) => void;
}

const SquadronDiscordSettings: React.FC<SquadronDiscordSettingsProps> = ({
  discordChannels = [],
  roleMappings = [],
  onChannelsChange,
  onRoleMappingsChange
}) => {
  const [showChannelForm, setShowChannelForm] = useState(false);
  const [showRoleForm, setShowRoleForm] = useState(false);
  const [newChannel, setNewChannel] = useState({ name: '', type: 'events' as const });

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
    if (newChannel.name.trim()) {
      const channel: DiscordChannel = {
        id: Date.now().toString(),
        name: newChannel.name.trim(),
        type: newChannel.type
      };
      const updatedChannels = [...discordChannels, channel];
      onChannelsChange?.(updatedChannels);
      setNewChannel({ name: '', type: 'events' });
      setShowChannelForm(false);
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
          {showChannelForm && (
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
                <input
                  type="text"
                  value={newChannel.name}
                  onChange={(e) => setNewChannel({ ...newChannel, name: e.target.value })}
                  placeholder="channel-name"
                  style={{
                    flex: 1,
                    padding: '4px 8px',
                    border: '1px solid #CBD5E1',
                    borderRadius: '4px',
                    fontSize: '14px'
                  }}
                />
              </div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setShowChannelForm(false)}
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
                  style={{
                    padding: '4px 8px',
                    backgroundColor: '#3B82F6',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  Add
                </button>
              </div>
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