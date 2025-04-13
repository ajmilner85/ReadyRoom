import React, { useState, useEffect } from 'react';
import { Card } from './card';
import LoginForm from './LoginForm';
import { User, Users, Building, Plane, PaintBucket, ScrollText, Plus, Edit, Trash, Check, X, AlertCircle, ToggleLeft, ToggleRight, Lock, Unlock, GripVertical, Calendar, Clock, Tag, ArrowRight } from 'lucide-react';
import { Status, getAllStatuses, createStatus, updateStatus, deleteStatus, getStatusUsageCount, initializeDefaultStatuses } from '../../utils/statusService';
import { Role, getAllRoles, createRole, updateRole, deleteRole, getRoleUsageCount, initializeDefaultRoles } from '../../utils/roleService';
import { Qualification, getAllQualifications, createQualification, updateQualification, deleteQualification, getQualificationUsageCount, initializeDefaultQualifications, archiveQualification } from '../../utils/qualificationService';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { CSS } from '@dnd-kit/utilities';
import { DiscordServer, getAvailableDiscordServers } from '../../utils/discordService';

// Define the types of settings pages
type SettingsPage = 'roster' | 'squadron' | 'mission' | 'appearance' | 'accounts' | 'discord';

interface SettingsNavItem {
  id: SettingsPage;
  icon: React.ReactNode;
  label: string;
}

// Navigation items for the settings sidebar
const settingsNavItems: SettingsNavItem[] = [
  {
    id: 'roster',
    icon: <Users size={20} />,
    label: 'Roster Settings'
  },
  {
    id: 'squadron',
    icon: <Building size={20} />,
    label: 'Squadron Administration'
  },
  {
    id: 'mission',
    icon: <Plane size={20} />,
    label: 'Mission Defaults'
  },
  {
    id: 'appearance',
    icon: <PaintBucket size={20} />,
    label: 'Appearance'
  },
  {
    id: 'accounts',
    icon: <User size={20} />,
    label: 'User Accounts'
  },
  {
    id: 'discord',
    icon: <ScrollText size={20} />,
    label: 'Discord Integration'
  }
];

// Discord Integration Component for multi-server support
const DiscordIntegrationSettings: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableServers, setAvailableServers] = useState<DiscordServer[]>([]);
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [savedServerId, setSavedServerId] = useState<string | null>(null);
  const [botStatus, setBotStatus] = useState<'connected' | 'disconnected' | 'unknown'>('unknown');

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
        setError(err.message || 'Error fetching Discord server list');
        setBotStatus('disconnected');
      } finally {
        setLoading(false);
      }
    };
    
    fetchDiscordServers();
  }, []);

  // Handle server selection change
  const handleServerChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedServerId(e.target.value);
  };

  // Save selected server
  const handleSaveSettings = () => {
    if (selectedServerId) {
      localStorage.setItem('discordSelectedServer', selectedServerId);
      setSavedServerId(selectedServerId);
      setError(null);
    } else {
      setError('Please select a Discord server');
    }
  };

  return (
    <div>
      <h2 style={{
        fontSize: '20px',
        fontWeight: 500,
        color: '#0F172A',
        marginBottom: '16px',
        fontFamily: 'Inter'
      }}>
        Discord Integration
      </h2>
      <p style={{
        fontSize: '14px',
        color: '#64748B',
        marginBottom: '24px',
        fontFamily: 'Inter',
        fontWeight: 400,
      }}>
        Configure Discord integration settings to connect with your squadron's Discord server.
      </p>

      {error && (
        <div className="p-4 mb-4 bg-red-100 border border-red-400 text-red-700 rounded relative flex items-center" role="alert">
          <AlertCircle size={18} className="mr-2" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="absolute top-0 right-0 p-2">
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
          <h3 style={{
            fontSize: '16px',
            fontWeight: 500,
            marginBottom: '12px',
            fontFamily: 'Inter',
            color: '#0F172A'
          }}>
            Discord Bot Status
          </h3>
          
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
          <h3 style={{
            fontSize: '16px',
            fontWeight: 500,
            marginBottom: '12px',
            fontFamily: 'Inter',
            color: '#0F172A'
          }}>
            Discord Server Selection
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
          <h3 style={{
            fontSize: '16px',
            fontWeight: 500,
            marginBottom: '12px',
            fontFamily: 'Inter',
            color: '#0F172A'
          }}>
            Discord Channel Configuration
          </h3>
          
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
          <h3 style={{
            fontSize: '16px',
            fontWeight: 500,
            marginBottom: '12px',
            fontFamily: 'Inter',
            color: '#0F172A'
          }}>
            Discord User Synchronization
          </h3>
          
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

const Settings: React.FC = () => {
  const [activeSettingsPage, setActiveSettingsPage] = useState<SettingsPage>('roster');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Status management state
  const [newStatusName, setNewStatusName] = useState('');
  const [newStatusIsActive, setNewStatusIsActive] = useState(true);
  const [isAddingStatus, setIsAddingStatus] = useState(false);
  const [editingStatusId, setEditingStatusId] = useState<string | null>(null);
  const [editingStatusName, setEditingStatusName] = useState('');
  const [editingStatusIsActive, setEditingStatusIsActive] = useState(true);
  const [statusUsage, setStatusUsage] = useState<Record<string, number>>({});

  // Role management state
  const [roles, setRoles] = useState<Role[]>([]);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleIsExclusive, setNewRoleIsExclusive] = useState(false);
  const [newRoleCompatibleStatuses, setNewRoleCompatibleStatuses] = useState<string[]>([]);
  const [isAddingRole, setIsAddingRole] = useState(false);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [editingRoleName, setEditingRoleName] = useState('');
  const [editingRoleIsExclusive, setEditingRoleIsExclusive] = useState(false);
  const [editingRoleCompatibleStatuses, setEditingRoleCompatibleStatuses] = useState<string[]>([]);
  const [roleUsage, setRoleUsage] = useState<Record<string, number>>({});
  const [reorderingRoles, setReorderingRoles] = useState(false);

  // Qualification management state
  const [qualifications, setQualifications] = useState<Qualification[]>([]);
  const [qualificationUsage, setQualificationUsage] = useState<Record<string, number>>({});
  const [isAddingQualification, setIsAddingQualification] = useState(false);
  const [editingQualificationId, setEditingQualificationId] = useState<string | null>(null);
  const [newQualificationName, setNewQualificationName] = useState('');
  const [newQualificationCode, setNewQualificationCode] = useState('');
  const [newQualificationCategory, setNewQualificationCategory] = useState('');
  const [newQualificationRequirements, setNewQualificationRequirements] = useState('{}');
  const [newQualificationIsExpirable, setNewQualificationIsExpirable] = useState(false);
  const [newQualificationValidityPeriod, setNewQualificationValidityPeriod] = useState<number | null>(null);
  const [newQualificationActive, setNewQualificationActive] = useState(true);
  const [newQualificationColor, setNewQualificationColor] = useState('#646F7E'); // Default slate color
  const [editingQualificationName, setEditingQualificationName] = useState('');
  const [editingQualificationCode, setEditingQualificationCode] = useState('');
  const [editingQualificationCategory, setEditingQualificationCategory] = useState('');
  const [editingQualificationRequirements, setEditingQualificationRequirements] = useState('{}');
  const [editingQualificationIsExpirable, setEditingQualificationIsExpirable] = useState(false);
  const [editingQualificationValidityPeriod, setEditingQualificationValidityPeriod] = useState<number | null>(null);
  const [editingQualificationActive, setEditingQualificationActive] = useState(true);
  const [editingQualificationColor, setEditingQualificationColor] = useState('#646F7E'); // Default slate color

  // Configure sensors for drag and drop
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5, // 5px movement before drag starts
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    const fetchStatuses = async () => {
      setLoading(true);
      try {
        await initializeDefaultStatuses(); // Initialize default statuses if none exist
        const { data, error } = await getAllStatuses();
        
        if (error) {
          throw new Error(error.message);
        }
        
        if (data) {
          setStatuses(data);
          
          // Get usage count for each status
          const usageCounts: Record<string, number> = {};
          for (const status of data) {
            const { count, error: usageError } = await getStatusUsageCount(status.id);
            if (!usageError) {
              usageCounts[status.id] = count;
            }
          }
          setStatusUsage(usageCounts);
        }
      } catch (err: any) {
        setError(err.message);
        console.error('Error fetching statuses:', err);
      } finally {
        setLoading(false);
      }
    };

    const fetchRoles = async () => {
      setLoading(true);
      try {
        await initializeDefaultRoles(); // Initialize default roles if none exist
        const { data, error } = await getAllRoles();
        
        if (error) {
          throw new Error(error.message);
        }
        
        if (data) {
          // Sort roles by their order property
          const sortedRoles = [...data].sort((a, b) => a.order - b.order);
          setRoles(sortedRoles);
          
          await refreshRoleUsageCounts();
        }
      } catch (err: any) {
        setError(err.message);
        console.error('Error fetching roles:', err);
      } finally {
        setLoading(false);
      }
    };

    const fetchQualifications = async () => {
      setLoading(true);
      try {
        await initializeDefaultQualifications(); // Initialize default qualifications if none exist
        const { data, error } = await getAllQualifications();
        
        if (error) {
          throw new Error(error.message);
        }
        
        if (data) {
          setQualifications(data);
          
          // Get usage count for each qualification
          const usageCounts: Record<string, number> = {};
          for (const qualification of data) {
            const { count, error: usageError } = await getQualificationUsageCount(qualification.id);
            if (!usageError) {
              usageCounts[qualification.id] = count;
            }
          }
          setQualificationUsage(usageCounts);
        }
      } catch (err: any) {
        setError(err.message);
        console.error('Error fetching qualifications:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchStatuses();
    fetchRoles();
    fetchQualifications();
  }, []);

  const handleLoginStateChange = (loggedIn: boolean) => {
    setIsLoggedIn(loggedIn);
  };

  // Navigate between settings pages
  const handleSettingsNavigate = (page: SettingsPage) => {
    setActiveSettingsPage(page);
  };

  // Render content based on active settings page
  const renderSettingsContent = () => {
    switch (activeSettingsPage) {
      case 'roster':
        return (
          <div>
            <h2 style={{
              fontSize: '20px',
              fontWeight: 500,
              color: '#0F172A',
              marginBottom: '16px',
              fontFamily: 'Inter'
            }}>
              Roster Settings
            </h2>
            <p style={{
              fontSize: '14px',
              color: '#64748B',
              marginBottom: '24px',
              fontFamily: 'Inter',
              fontWeight: 400,
            }}>
              Configure statuses, roles, and qualifications for squadron personnel.
            </p>
          </div>
        );
      case 'discord':
        return (
          <DiscordIntegrationSettings />
        );
                    
      default:
        return <div>Select a settings page</div>;
    }
  };

  // Settings navigation item
  const SettingsNavItem: React.FC<{ item: SettingsNavItem; active: boolean; onClick: () => void }> = ({ 
    item, 
    active, 
    onClick 
  }) => {
    return (
      <div 
        className={`flex items-center px-4 py-3 mb-2 cursor-pointer rounded-md ${
          active ? 'bg-[#82728C] text-white' : 'hover:bg-slate-100 text-[#64748B]'
        }`}
        onClick={onClick}
        style={{
          fontFamily: 'Inter',
          fontSize: '14px',
          fontWeight: active ? 500 : 400,
          transition: 'all 0.2s ease'
        }}
      >
        <div className="mr-3">{item.icon}</div>
        <div>{item.label}</div>
      </div>
    );
  };

  return (
    <div 
      style={{ 
        backgroundColor: '#F0F4F8', 
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '20px 0',
        boxSizing: 'border-box',
        fontFamily: 'Inter, sans-serif',
      }}
    >
      <div style={{
        maxWidth: '1200px',
        width: '100%',
        margin: '0 auto',
        padding: '0 20px'
      }}>
        {/* Main settings card with navigation and content */}
        <Card 
          className="bg-white rounded-lg shadow-md overflow-hidden"
          style={{
            boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)',
            borderRadius: '8px',
            backgroundColor: '#FFFFFF'
          }}
        >
          <div style={{ padding: '24px' }}>
            <h1 style={{
              fontFamily: 'Inter',
              fontStyle: 'normal',
              fontWeight: 300,
              fontSize: '20px',
              lineHeight: '24px',
              color: '#64748B',
              textTransform: 'uppercase',
              marginBottom: '24px'
            }}>
              Settings
            </h1>
            
            <div className="flex" style={{ minHeight: 'calc(100vh - 170px)' }}>
              {/* Settings navigation sidebar */}
              <div 
                className="w-64 p-6"
                style={{ 
                  borderRight: '1px solid #E2E8F0',
                  backgroundColor: '#FFFFFF',
                  paddingRight: '16px',
                  paddingTop: '16px',
                }}
              >
                {settingsNavItems.map((item) => (
                  <SettingsNavItem 
                    key={item.id}
                    item={item}
                    active={activeSettingsPage === item.id}
                    onClick={() => handleSettingsNavigate(item.id)}
                  />
                ))}
              </div>

              {/* Main content area */}
              <div 
                className="flex-1 p-6 overflow-auto" 
                style={{ 
                  padding: '16px 24px',
                  fontFamily: 'Inter'
                }}
              >
                {renderSettingsContent()}
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default Settings;