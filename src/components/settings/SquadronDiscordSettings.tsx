import React, { useState, useEffect } from 'react';
import { MessageSquare, Plus, Trash, Crown, Shield, Users, User, Server, X } from 'lucide-react';
import { getAvailableDiscordServers, getServerChannels, DiscordServer, fetchDiscordGuildRoles } from '../../utils/discordService';
import { getAllQualifications } from '../../utils/qualificationService';
import { getAllTeams } from '../../utils/teamService';
import { supabase } from '../../utils/supabaseClient';

// Add custom styles for optgroup indentation
const optgroupStyles = `
  .custom-select optgroup {
    padding-left: 0px !important;
    margin-left: 0px !important;
    text-indent: 0px !important;
    font-style: normal !important;
    font-weight: bold !important;
  }
  .custom-select option {
    padding-left: 20px !important;
    text-indent: 0px !important;
  }
  
  /* Target specific browsers */
  .custom-select optgroup:before {
    content: none !important;
  }
  
  /* WebKit specific */
  .custom-select optgroup[label]:before {
    content: none !important;
  }
  
  /* Firefox specific */
  @-moz-document url-prefix() {
    .custom-select optgroup {
      padding-inline-start: 0px !important;
    }
    .custom-select option {
      padding-inline-start: 20px !important;
    }
  }
`;

// Discord Logo component
const DiscordLogo: React.FC<{ size?: number; overlayIcon?: React.ReactNode }> = ({ size = 18, overlayIcon }) => (
  <div style={{ position: 'relative', display: 'inline-block', width: size, height: size }}>
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="#5865F2"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419-.0189 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"/>
    </svg>
    {overlayIcon && (
      <div style={{
        position: 'absolute',
        bottom: -3,
        right: -5,
        width: 9,
        height: 9,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'white',
        borderRadius: '50%',
        border: '1px solid #E2E8F0'
      }}>
        {overlayIcon}
      </div>
    )}
  </div>
);

interface DiscordChannel {
  id: string;
  name: string;
  type: 'events' | 'briefing' | 'debriefing';
}

interface RoleMapping {
  id: string;
  discordRoleId: string;
  discordRoleName: string;
  appPermission?: 'admin' | 'flight_lead' | 'member' | 'guest';
  qualification?: string; // Qualification ID
  qualificationName?: string; // Human readable qualification name
  squadronId?: string; // Squadron ID for squadron affiliation mapping
  squadronName?: string; // Human readable squadron name
  teamId?: string; // Team ID for team mapping
  teamName?: string; // Human readable team name
  isIgnoreUsers?: boolean; // Special flag for "Ignore Users" mapping
  priority: number;
}

interface ThreadingSettings {
  useThreads: boolean;
  autoArchiveDuration: number;
}

interface SquadronDiscordSettingsProps {
  discordChannels?: DiscordChannel[];
  roleMappings?: RoleMapping[];
  selectedGuildId?: string;
  emoji?: string;
  threadingSettings?: ThreadingSettings;
  defaultNotificationRoles?: Array<{ id: string; name: string }>;
  onChannelsChange?: (channels: DiscordChannel[]) => void;
  onRoleMappingsChange?: (mappings: RoleMapping[]) => void;
  onGuildChange?: (guildId: string) => void;
  onEmojiChange?: (emoji: string) => void;
  onThreadingSettingsChange?: (settings: ThreadingSettings) => void;
  onDefaultNotificationRolesChange?: (roles: Array<{ id: string; name: string }>) => void;
}

const SquadronDiscordSettings: React.FC<SquadronDiscordSettingsProps> = ({
  discordChannels = [],
  roleMappings = [],
  selectedGuildId,
  emoji = '',
  threadingSettings = { useThreads: false, autoArchiveDuration: 1440 },
  defaultNotificationRoles = [],
  onChannelsChange,
  onRoleMappingsChange,
  onGuildChange,
  onEmojiChange,
  onThreadingSettingsChange,
  onDefaultNotificationRolesChange
}) => {
  const roleFormRef = React.useRef<HTMLDivElement>(null);
  const [showChannelForm, setShowChannelForm] = useState(false);
  const [showRoleForm, setShowRoleForm] = useState(false);
  const [newChannel, setNewChannel] = useState<{ id: string; name: string; type: 'events' | 'briefing' | 'debriefing' }>({ id: '', name: '', type: 'events' });
  const [newRoleMapping, setNewRoleMapping] = useState({
    discordRoleId: '',
    discordRoleName: '',
    mappingType: 'qualification' as 'qualification' | 'permission' | 'squadron' | 'team' | 'ignore',
    qualificationId: '',
    qualificationName: '',
    squadronId: '',
    squadronName: '',
    teamId: '',
    teamName: '',
    appPermission: 'member' as 'admin' | 'flight_lead' | 'member' | 'guest'
  });
  
  // Discord server and channel state
  const [availableServers, setAvailableServers] = useState<DiscordServer[]>([]);
  const [availableChannels, setAvailableChannels] = useState<Array<{id: string, name: string, type: string}>>([]);
  const [availableDiscordRoles, setAvailableDiscordRoles] = useState<Array<{id: string, name: string, color: number}>>([]);
  const [availableQualifications, setAvailableQualifications] = useState<Array<{id: string, name: string}>>([]);
  const [availableSquadrons, setAvailableSquadrons] = useState<Array<{id: string, name: string, designation: string}>>([]);
  const [availableTeams, setAvailableTeams] = useState<Array<{id: string, name: string, scope: string}>>([]);
  const [loadingServers, setLoadingServers] = useState(false);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedNotificationRoleId, setSelectedNotificationRoleId] = useState('');

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

  // Load qualifications on component mount
  useEffect(() => {
    const fetchQualifications = async () => {
      try {
        const result = await getAllQualifications();
        if (result.data && !result.error) {
          setAvailableQualifications(result.data.map(q => ({ id: q.id, name: q.name })));
        } else {
          console.error('Error fetching qualifications:', result.error);
        }
      } catch (err: any) {
        console.error('Error fetching qualifications:', err);
      }
    };

    fetchQualifications();
  }, []);

  // Load squadrons on component mount
  useEffect(() => {
    const fetchSquadrons = async () => {
      try {
        const { data: squadronsData, error: squadronsError } = await supabase
          .from('org_squadrons')
          .select('id, name, designation')
          .order('designation', { ascending: true });

        if (squadronsError) {
          console.error('Error fetching squadrons:', squadronsError);
          return;
        }

        if (squadronsData) {
          setAvailableSquadrons(squadronsData.map(s => ({
            id: s.id,
            name: s.name,
            designation: s.designation
          })));
        }
      } catch (err: any) {
        console.error('Error fetching squadrons:', err);
      }
    };

    fetchSquadrons();
  }, []);

  // Load teams on component mount
  useEffect(() => {
    const fetchTeams = async () => {
      try {
        const result = await getAllTeams();
        if (!result.error && result.data) {
          setAvailableTeams(result.data
            .filter(t => t.active)
            .map(t => ({
              id: t.id,
              name: t.name,
              scope: t.scope
            })));
        }
      } catch (err: any) {
        console.error('Error fetching teams:', err);
      }
    };

    fetchTeams();
  }, []);

  // Load Discord roles when guild is selected
  useEffect(() => {
    if (selectedGuildId) {
      const fetchDiscordRoles = async () => {
        setLoadingRoles(true);
        try {
          const result = await fetchDiscordGuildRoles(selectedGuildId);
          if (!result.error && result.roles) {
            const sortedRoles = result.roles
              .filter(role => role.name !== '@everyone')
              .sort((a, b) => b.position - a.position);
            setAvailableDiscordRoles(sortedRoles);
          } else {
            setError(result.error || 'Failed to fetch Discord roles');
          }
        } catch (err: any) {
          setError(err.message || 'Error fetching Discord roles');
        } finally {
          setLoadingRoles(false);
        }
      };

      fetchDiscordRoles();
    } else {
      setAvailableDiscordRoles([]);
    }
  }, [selectedGuildId]);

  // Scroll to role form when it's shown
  useEffect(() => {
    if (showRoleForm && roleFormRef.current) {
      // Small delay to ensure the form is rendered
      setTimeout(() => {
        roleFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 100);
    }
  }, [showRoleForm]);

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
                return channel.type === '0' || 
                       channel.type === 'GUILD_TEXT' ||
                       channel.type === 'TEXT' ||
                       (typeof channel.type === 'number' && [0, 1, 5, 10, 11, 12].includes(channel.type));
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

  const getRoleMappingIcon = (mapping: RoleMapping) => {
    let overlayIcon;
    if (mapping.isIgnoreUsers) {
      overlayIcon = <X style={{ color: '#EF4444', width: 7, height: 7 }} strokeWidth={2.5} />;
    } else if (mapping.appPermission) {
      // Create appropriately sized icon based on permission
      switch (mapping.appPermission) {
        case 'admin':
          overlayIcon = <Crown size={7} className="text-red-600" strokeWidth={2.5} />;
          break;
        case 'flight_lead':
          overlayIcon = <Shield size={7} className="text-orange-600" strokeWidth={2.5} />;
          break;
        case 'member':
          overlayIcon = <Users size={7} className="text-blue-600" strokeWidth={2.5} />;
          break;
        case 'guest':
          overlayIcon = <User size={7} className="text-gray-600" strokeWidth={2.5} />;
          break;
        default:
          overlayIcon = <Shield size={7} className="text-gray-600" strokeWidth={2.5} />;
      }
    } else if (mapping.squadronId) {
      // Icon for squadron affiliation
      overlayIcon = <Server style={{ color: '#7C3AED', width: 7, height: 7 }} strokeWidth={2.5} />;
    } else {
      // Default icon for qualifications
      overlayIcon = <Shield style={{ color: '#10B981', width: 7, height: 7 }} strokeWidth={2.5} />;
    }
    return <DiscordLogo size={18} overlayIcon={overlayIcon} />;
  };

  const getRoleMappingLabel = (mapping: RoleMapping) => {
    if (mapping.isIgnoreUsers) {
      return 'Ignore Users';
    }
    if (mapping.appPermission) {
      return getPermissionLabel(mapping.appPermission);
    }
    if (mapping.squadronId) {
      return mapping.squadronName || 'Unknown Squadron';
    }
    if (mapping.teamId) {
      return mapping.teamName || 'Unknown Team';
    }
    return mapping.qualificationName || mapping.qualification || 'Unknown Qualification';
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

  const handleAddRoleMapping = () => {
    if (newRoleMapping.discordRoleId && newRoleMapping.discordRoleName &&
        (newRoleMapping.mappingType === 'ignore' || newRoleMapping.qualificationId || newRoleMapping.appPermission || newRoleMapping.squadronId || newRoleMapping.teamId)) {
      const mapping: RoleMapping = {
        id: `${Date.now()}-${Math.random().toString(36).substring(2)}`, // Unique ID generation
        discordRoleId: newRoleMapping.discordRoleId,
        discordRoleName: newRoleMapping.discordRoleName,
        priority: roleMappings.length,
        isIgnoreUsers: newRoleMapping.mappingType === 'ignore',
        ...(newRoleMapping.mappingType === 'qualification' && {
          qualification: newRoleMapping.qualificationId,
          qualificationName: newRoleMapping.qualificationName
        }),
        ...(newRoleMapping.mappingType === 'permission' && {
          appPermission: newRoleMapping.appPermission
        }),
        ...(newRoleMapping.mappingType === 'squadron' && {
          squadronId: newRoleMapping.squadronId,
          squadronName: newRoleMapping.squadronName
        }),
        ...(newRoleMapping.mappingType === 'team' && {
          teamId: newRoleMapping.teamId,
          teamName: newRoleMapping.teamName
        })
      };

      const updatedMappings = [...roleMappings, mapping];
      onRoleMappingsChange?.(updatedMappings);

      // Reset form
      setNewRoleMapping({
        discordRoleId: '',
        discordRoleName: '',
        mappingType: 'qualification',
        qualificationId: '',
        qualificationName: '',
        squadronId: '',
        squadronName: '',
        teamId: '',
        teamName: '',
        appPermission: 'member'
      });
      setShowRoleForm(false);
    }
  };

  const handleRoleSelect = (roleId: string) => {
    const selectedRole = availableDiscordRoles.find(role => role.id === roleId);
    if (selectedRole) {
      setNewRoleMapping({
        ...newRoleMapping,
        discordRoleId: selectedRole.id,
        discordRoleName: selectedRole.name
      });
    }
  };

  // const handleQualificationSelect = (qualificationId: string) => {
  //   const selectedQualification = availableQualifications.find(q => q.id === qualificationId);
  //   if (selectedQualification) {
  //     setNewRoleMapping({
  //       ...newRoleMapping,
  //       qualificationId: selectedQualification.id,
  //       qualificationName: selectedQualification.name
  //     });
  //   }
  // };

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

  const handleAddNotificationRole = () => {
    if (!selectedNotificationRoleId || !onDefaultNotificationRolesChange) return;
    
    const role = availableDiscordRoles.find(r => r.id === selectedNotificationRoleId);
    if (!role) return;
    
    // Check if role is already added
    if (defaultNotificationRoles.some(r => r.id === role.id)) {
      setError('This role has already been added');
      setTimeout(() => setError(null), 3000);
      return;
    }
    
    onDefaultNotificationRolesChange([...defaultNotificationRoles, { id: role.id, name: role.name }]);
    setSelectedNotificationRoleId('');
  };

  const handleRemoveNotificationRole = (roleId: string) => {
    if (!onDefaultNotificationRolesChange) return;
    onDefaultNotificationRolesChange(defaultNotificationRoles.filter(r => r.id !== roleId));
  };

  const handleRemoveChannel = (index: number) => {
    const updatedChannels = discordChannels.filter((_, i) => i !== index);
    onChannelsChange?.(updatedChannels);
  };

  return (
    <div style={{
      marginBottom: '24px'
    }}>
      {/* Inject custom styles */}
      <style dangerouslySetInnerHTML={{ __html: optgroupStyles }} />
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        marginBottom: '20px' 
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
              <option key={`server-${server.id}`} value={server.id}>
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

      {/* Squadron Emoji */}
      <div style={{ marginBottom: '24px' }}>
        <label style={{
          display: 'block',
          marginBottom: '8px',
          fontSize: '14px',
          fontWeight: 500,
          color: '#64748B'
        }}>
          Squadron Emoji
        </label>
        <input
          type="text"
          value={emoji}
          onChange={(e) => onEmojiChange?.(e.target.value)}
          placeholder="e.g., 🦅 or :eagle:"
          maxLength={50}
          style={{
            maxWidth: '300px',
            padding: '8px 12px',
            border: '1px solid #CBD5E1',
            borderRadius: '4px',
            fontSize: '14px'
          }}
        />
        <p style={{
          fontSize: '12px',
          color: '#6B7280',
          marginTop: '4px',
          fontStyle: 'italic'
        }}>
          This emoji will appear next to your squadron name in event posts
        </p>
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
              {discordChannels.map((channel, index) => (
                <div key={`${channel.id}-${channel.type}-${index}`} style={{
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
                      fontSize: '14px',
                      padding: '2px 6px',
                      backgroundColor: channel.type === 'events' ? '#DBEAFE' : channel.type === 'briefing' ? '#FEF3C7' : '#F0FDF4',
                      color: channel.type === 'events' ? '#1D4ED8' : channel.type === 'briefing' ? '#D97706' : '#16A34A',
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
                    onClick={() => handleRemoveChannel(index)}
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
                    type: e.target.value as 'events' | 'briefing' | 'debriefing'
                  })}
                  style={{
                    padding: '4px 8px',
                    border: '1px solid #CBD5E1',
                    borderRadius: '4px',
                    fontSize: '14px',
                    width: '110px'
                  }}
                >
                  <option value="events">Events</option>
                  <option value="briefing">Briefing</option>
                  <option value="debriefing">Debriefing</option>
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
                    <option key={`channel-${channel.id}`} value={channel.id}>
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
                    fontSize: '14px',
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
                    fontSize: '14px'
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

      {/* Default Initial Event Notification Recipients Section */}
      <div style={{ marginBottom: '20px' }}>
        <label style={{
          fontSize: '14px',
          fontWeight: 500,
          color: '#64748B',
          marginBottom: '12px',
          display: 'block'
        }}>
          Default Initial Event Notification Recipients
        </label>
        <div style={{ marginBottom: '12px', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <select
            value={selectedNotificationRoleId}
            onChange={(e) => setSelectedNotificationRoleId(e.target.value)}
            disabled={loadingRoles || !availableDiscordRoles || availableDiscordRoles.length === 0}
            style={{
              flex: 1,
              padding: '8px 12px',
              border: '1px solid #CBD5E1',
              borderRadius: '6px',
              fontSize: '14px',
              backgroundColor: '#FFFFFF',
              color: '#0F172A',
              cursor: loadingRoles ? 'not-allowed' : 'pointer'
            }}
          >
            <option value="">
              {loadingRoles ? 'Loading roles...' : availableDiscordRoles && availableDiscordRoles.length > 0 ? 'Select a role to notify' : 'No roles available'}
            </option>
            {availableDiscordRoles && availableDiscordRoles.map(role => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
          <button
            onClick={handleAddNotificationRole}
            disabled={!selectedNotificationRoleId || loadingRoles}
            style={{
              padding: '8px 16px',
              backgroundColor: selectedNotificationRoleId && !loadingRoles ? '#3B82F6' : '#CBD5E1',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: 500,
              cursor: selectedNotificationRoleId && !loadingRoles ? 'pointer' : 'not-allowed',
              whiteSpace: 'nowrap'
            }}
          >
            Add
          </button>
        </div>
        {defaultNotificationRoles && defaultNotificationRoles.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {defaultNotificationRoles.map(role => (
              <div
                key={role.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 8px 4px 10px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: '500',
                  height: '26px',
                  boxSizing: 'border-box',
                  whiteSpace: 'nowrap',
                  backgroundColor: '#DBEAFE',
                  color: '#1D4ED8',
                  border: '1px solid #3B82F6'
                }}
              >
                <span>@{role.name}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveNotificationRole(role.id)}
                  style={{
                    padding: '0',
                    width: '14px',
                    height: '14px',
                    backgroundColor: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#1D4ED8',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '50%',
                    transition: 'background-color 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(29, 78, 216, 0.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                  title="Remove role"
                >
                  <X size={12} strokeWidth={2.5} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Threading Settings Section */}
      <div style={{ marginBottom: '20px' }}>
        <label style={{
          fontSize: '14px',
          fontWeight: 500,
          color: '#64748B',
          marginBottom: '12px',
          display: 'block'
        }}>
          Threading Settings
        </label>
        
        <div style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: '6px',
          padding: '16px'
        }}>
          {/* Threading Toggle */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '12px'
          }}>
            <div>
              <div style={{
                fontSize: '14px',
                fontWeight: 500,
                color: '#0F172A',
                marginBottom: '4px'
              }}>
                Use Threads for Events and Reminders
              </div>
              <div style={{
                fontSize: '12px',
                color: '#64748B',
                lineHeight: '1.4'
              }}>
                When enabled, events and reminders will be posted within threads instead of independent messages
              </div>
            </div>
            <div style={{ marginLeft: '16px' }}>
              <label style={{
                position: 'relative',
                display: 'inline-block',
                width: '44px',
                height: '24px',
                cursor: 'pointer'
              }}>
                <input
                  type="checkbox"
                  checked={threadingSettings.useThreads}
                  onChange={(e) => onThreadingSettingsChange?.({
                    ...threadingSettings,
                    useThreads: e.target.checked
                  })}
                  style={{
                    opacity: 0,
                    width: 0,
                    height: 0
                  }}
                />
                <span style={{
                  position: 'absolute',
                  cursor: 'pointer',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: threadingSettings.useThreads ? '#3B82F6' : '#CBD5E1',
                  borderRadius: '24px',
                  transition: 'background-color 0.2s ease',
                  '::before': {
                    position: 'absolute',
                    content: '""',
                    height: '18px',
                    width: '18px',
                    left: threadingSettings.useThreads ? '23px' : '3px',
                    bottom: '3px',
                    backgroundColor: 'white',
                    borderRadius: '50%',
                    transition: 'left 0.2s ease'
                  }
                } as any}>
                  <div style={{
                    position: 'absolute',
                    height: '18px',
                    width: '18px',
                    left: threadingSettings.useThreads ? '23px' : '3px',
                    top: '3px',
                    backgroundColor: 'white',
                    borderRadius: '50%',
                    transition: 'left 0.2s ease'
                  }} />
                </span>
              </label>
            </div>
          </div>

          {/* Auto-Archive Duration */}
          {threadingSettings.useThreads && (
            <div style={{
              paddingTop: '12px',
              borderTop: '1px solid #E2E8F0'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px'
              }}>
                <label style={{
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#0F172A',
                  minWidth: '140px'
                }}>
                  Auto-Archive Duration:
                </label>
                <select
                  value={threadingSettings.autoArchiveDuration}
                  onChange={(e) => onThreadingSettingsChange?.({
                    ...threadingSettings,
                    autoArchiveDuration: parseInt(e.target.value)
                  })}
                  style={{
                    padding: '6px 8px',
                    border: '1px solid #CBD5E1',
                    borderRadius: '4px',
                    fontSize: '14px',
                    backgroundColor: 'white',
                    cursor: 'pointer',
                    minWidth: '120px'
                  }}
                >
                  <option value={60}>1 hour</option>
                  <option value={1440}>1 day</option>
                  <option value={4320}>3 days</option>
                  <option value={10080}>1 week</option>
                </select>
              </div>
              <div style={{
                fontSize: '12px',
                color: '#64748B',
                marginTop: '6px'
              }}>
                Threads will automatically archive after this period of inactivity
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
              {roleMappings.map((mapping, index) => (
                <div key={`role-mapping-${mapping.id}-${mapping.discordRoleId}-${index}`} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 12px',
                  backgroundColor: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: '4px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {getRoleMappingIcon(mapping)}
                    <span style={{ fontSize: '14px', color: '#0F172A' }}>
                      {mapping.discordRoleName}
                    </span>
                    <span style={{ fontSize: '12px', color: '#64748B' }}>→</span>
                    <span style={{ 
                      fontSize: '14px', 
                      color: mapping.isIgnoreUsers ? '#EF4444' : '#3B82F6',
                      fontWeight: 500
                    }}>
                      {getRoleMappingLabel(mapping)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const updatedMappings = roleMappings.filter(m => m.id !== mapping.id);
                      onRoleMappingsChange?.(updatedMappings);
                    }}
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

          {/* Add Role Mapping Form - matches channel form design */}
          {showRoleForm && (
            <div
              ref={roleFormRef}
              style={{
                marginTop: '8px',
                padding: '12px',
                backgroundColor: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '4px'
              }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                <select
                  value={newRoleMapping.discordRoleId}
                  onChange={(e) => handleRoleSelect(e.target.value)}
                  disabled={loadingRoles}
                  style={{
                    flex: 1,
                    padding: '4px 8px',
                    border: '1px solid #CBD5E1',
                    borderRadius: '4px',
                    fontSize: '14px',
                    backgroundColor: loadingRoles ? '#F9FAFB' : 'white',
                    cursor: loadingRoles ? 'not-allowed' : 'pointer'
                  }}
                >
                  <option value="">
                    {loadingRoles ? 'Loading roles...' : 'Select a Discord role'}
                  </option>
                  {availableDiscordRoles.map((role) => (
                    <option key={`role-mapping-${role.id}`} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </select>
                <select
                  className="custom-select"
                  value={newRoleMapping.mappingType + ':' + (newRoleMapping.qualificationId || newRoleMapping.squadronId || newRoleMapping.teamId || newRoleMapping.appPermission || 'ignore')}
                  onChange={(e) => {
                    const [type, value] = e.target.value.split(':');
                    if (type === 'ignore') {
                      setNewRoleMapping({
                        ...newRoleMapping,
                        mappingType: 'ignore',
                        qualificationId: '',
                        qualificationName: '',
                        squadronId: '',
                        squadronName: '',
                        appPermission: 'member'
                      });
                    } else if (type === 'qualification') {
                      const qualification = availableQualifications.find(q => q.id === value);
                      setNewRoleMapping({
                        ...newRoleMapping,
                        mappingType: 'qualification',
                        qualificationId: value,
                        qualificationName: qualification?.name || '',
                        squadronId: '',
                        squadronName: '',
                        appPermission: 'member'
                      });
                    } else if (type === 'squadron') {
                      const squadron = availableSquadrons.find(s => s.id === value);
                      setNewRoleMapping({
                        ...newRoleMapping,
                        mappingType: 'squadron',
                        qualificationId: '',
                        qualificationName: '',
                        squadronId: value,
                        squadronName: squadron ? `${squadron.designation} - ${squadron.name}` : '',
                        teamId: '',
                        teamName: '',
                        appPermission: 'member'
                      });
                    } else if (type === 'team') {
                      const team = availableTeams.find(t => t.id === value);
                      setNewRoleMapping({
                        ...newRoleMapping,
                        mappingType: 'team',
                        qualificationId: '',
                        qualificationName: '',
                        squadronId: '',
                        squadronName: '',
                        teamId: value,
                        teamName: team?.name || '',
                        appPermission: 'member'
                      });
                    } else if (type === 'permission') {
                      setNewRoleMapping({
                        ...newRoleMapping,
                        mappingType: 'permission',
                        qualificationId: '',
                        qualificationName: '',
                        squadronId: '',
                        squadronName: '',
                        teamId: '',
                        teamName: '',
                        appPermission: value as 'admin' | 'flight_lead' | 'member' | 'guest'
                      });
                    }
                  }}
                  style={{
                    padding: '4px 8px',
                    border: '1px solid #CBD5E1',
                    borderRadius: '4px',
                    fontSize: '14px'
                  }}
                >
                  <option value="">Select mapping target</option>
                  <option value="" disabled style={{ fontWeight: 'normal', color: '#64748B', backgroundColor: '#f8fafc' }}>
                    Qualifications
                  </option>
                  {availableQualifications.map((qualification) => (
                    <option key={`mapping-qual-${qualification.id}`} value={`qualification:${qualification.id}`} style={{ paddingLeft: '20px' }}>
                      &nbsp;&nbsp;{qualification.name}
                    </option>
                  ))}
                  <option value="" disabled style={{ fontWeight: 'normal', color: '#64748B', backgroundColor: '#f8fafc' }}>
                    App Permissions
                  </option>
                  <option value="permission:admin" style={{ paddingLeft: '20px' }}>&nbsp;&nbsp;Administrator</option>
                  <option value="permission:flight_lead" style={{ paddingLeft: '20px' }}>&nbsp;&nbsp;Flight Lead</option>
                  <option value="permission:member" style={{ paddingLeft: '20px' }}>&nbsp;&nbsp;Member</option>
                  <option value="permission:guest" style={{ paddingLeft: '20px' }}>&nbsp;&nbsp;Guest</option>
                  <option value="" disabled style={{ fontWeight: 'normal', color: '#64748B', backgroundColor: '#f8fafc' }}>
                    Squadron Affiliations
                  </option>
                  {availableSquadrons.map((squadron) => (
                    <option key={`mapping-squad-${squadron.id}`} value={`squadron:${squadron.id}`} style={{ paddingLeft: '20px' }}>
                      &nbsp;&nbsp;{squadron.designation} - {squadron.name}
                    </option>
                  ))}
                  <option value="" disabled style={{ fontWeight: 'normal', color: '#64748B', backgroundColor: '#f8fafc' }}>
                    Teams
                  </option>
                  {availableTeams.map((team) => (
                    <option key={`mapping-team-${team.id}`} value={`team:${team.id}`} style={{ paddingLeft: '20px' }}>
                      &nbsp;&nbsp;{team.name} ({team.scope})
                    </option>
                  ))}
                  <option value="" disabled style={{ fontWeight: 'normal', color: '#64748B', backgroundColor: '#f8fafc' }}>
                    Special
                  </option>
                  <option value="ignore:ignore" style={{ paddingLeft: '20px' }}>&nbsp;&nbsp;Ignore Users</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowRoleForm(false);
                    setNewRoleMapping({
                      discordRoleId: '',
                      discordRoleName: '',
                      mappingType: 'qualification',
                      qualificationId: '',
                      qualificationName: '',
                      squadronId: '',
                      squadronName: '',
                      teamId: '',
                      teamName: '',
                      appPermission: 'member'
                    });
                  }}
                  style={{
                    padding: '4px 8px',
                    backgroundColor: '#F1F5F9',
                    border: '1px solid #CBD5E1',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    color: '#475569'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleAddRoleMapping}
                  disabled={!newRoleMapping.discordRoleId || (!newRoleMapping.qualificationId && newRoleMapping.mappingType !== 'ignore' && !newRoleMapping.appPermission && !newRoleMapping.squadronId && !newRoleMapping.teamId)}
                  style={{
                    padding: '4px 8px',
                    backgroundColor: (!newRoleMapping.discordRoleId || (!newRoleMapping.qualificationId && newRoleMapping.mappingType !== 'ignore' && !newRoleMapping.appPermission && !newRoleMapping.squadronId && !newRoleMapping.teamId)) ? '#9CA3AF' : '#8B5CF6',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: (!newRoleMapping.discordRoleId || (!newRoleMapping.qualificationId && newRoleMapping.mappingType !== 'ignore' && !newRoleMapping.appPermission && !newRoleMapping.squadronId && !newRoleMapping.teamId)) ? 'not-allowed' : 'pointer',
                    fontSize: '14px'
                  }}
                >
                  Add
                </button>
              </div>
            </div>
          )}

        {/* Show message if no server selected */}
        {showRoleForm && !selectedGuildId && (
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
            Please select a Discord server first to add role mappings.
          </div>
        )}

      </div>
    </div>
  );
};

export default SquadronDiscordSettings;