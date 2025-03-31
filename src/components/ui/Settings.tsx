import React, { useState } from 'react';
import { Card } from './card';
import LoginForm from './LoginForm';
import { User, Users, Building, Plane, PaintBucket, ScrollText } from 'lucide-react';

// Define the types of settings pages
type SettingsPage = 'roster' | 'squadron' | 'mission' | 'appearance' | 'accounts';

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
  }
];

const Settings: React.FC = () => {
  const [activeSettingsPage, setActiveSettingsPage] = useState<SettingsPage>('roster');
  const [isLoggedIn, setIsLoggedIn] = useState(false);

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

            <div className="space-y-6">
              <Card className="p-4">
                <h3 style={{
                  fontSize: '16px',
                  fontWeight: 500,
                  marginBottom: '12px',
                  fontFamily: 'Inter',
                  color: '#0F172A'
                }}>
                  Statuses
                </h3>
                <p style={{
                  fontSize: '14px',
                  color: '#64748B',
                  marginBottom: '16px',
                  fontFamily: 'Inter',
                  fontWeight: 400,
                }}>
                  Define the status options available for pilots in the squadron roster.
                </p>
                <div className="flex items-center justify-between p-3 border border-gray-200 rounded mb-2">
                  <div style={{
                    fontWeight: 500,
                    fontFamily: 'Inter',
                    fontSize: '14px',
                    color: '#0F172A'
                  }}>
                    Available
                  </div>
                  <div className="flex space-x-2">
                    <button className="p-1 hover:bg-slate-100 rounded">
                      <ScrollText size={16} color="#64748B" />
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 border border-gray-200 rounded mb-2">
                  <div style={{
                    fontWeight: 500,
                    fontFamily: 'Inter',
                    fontSize: '14px',
                    color: '#0F172A'
                  }}>
                    On Leave
                  </div>
                  <div className="flex space-x-2">
                    <button className="p-1 hover:bg-slate-100 rounded">
                      <ScrollText size={16} color="#64748B" />
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 border border-gray-200 rounded mb-2">
                  <div style={{
                    fontWeight: 500,
                    fontFamily: 'Inter',
                    fontSize: '14px',
                    color: '#0F172A'
                  }}>
                    TAD
                  </div>
                  <div className="flex space-x-2">
                    <button className="p-1 hover:bg-slate-100 rounded">
                      <ScrollText size={16} color="#64748B" />
                    </button>
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
                  Roles
                </h3>
                <p style={{
                  fontSize: '14px',
                  color: '#64748B',
                  marginBottom: '16px',
                  fontFamily: 'Inter',
                  fontWeight: 400,
                }}>
                  Define the role options available for pilots in the squadron roster.
                </p>
                <div className="flex items-center justify-between p-3 border border-gray-200 rounded mb-2">
                  <div style={{
                    fontWeight: 500,
                    fontFamily: 'Inter',
                    fontSize: '14px',
                    color: '#0F172A'
                  }}>
                    Squadron CO
                  </div>
                  <div className="flex space-x-2">
                    <button className="p-1 hover:bg-slate-100 rounded">
                      <ScrollText size={16} color="#64748B" />
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 border border-gray-200 rounded mb-2">
                  <div style={{
                    fontWeight: 500,
                    fontFamily: 'Inter',
                    fontSize: '14px',
                    color: '#0F172A'
                  }}>
                    Squadron XO
                  </div>
                  <div className="flex space-x-2">
                    <button className="p-1 hover:bg-slate-100 rounded">
                      <ScrollText size={16} color="#64748B" />
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 border border-gray-200 rounded mb-2">
                  <div style={{
                    fontWeight: 500,
                    fontFamily: 'Inter',
                    fontSize: '14px',
                    color: '#0F172A'
                  }}>
                    Department Head
                  </div>
                  <div className="flex space-x-2">
                    <button className="p-1 hover:bg-slate-100 rounded">
                      <ScrollText size={16} color="#64748B" />
                    </button>
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
                  Qualifications
                </h3>
                <p style={{
                  fontSize: '14px',
                  color: '#64748B',
                  marginBottom: '16px',
                  fontFamily: 'Inter',
                  fontWeight: 400,
                }}>
                  Define the qualifications that can be assigned to pilots.
                </p>
                <div className="flex items-center justify-between p-3 border border-gray-200 rounded mb-2">
                  <div style={{
                    fontWeight: 500,
                    fontFamily: 'Inter',
                    fontSize: '14px',
                    color: '#0F172A'
                  }}>
                    Section Lead
                  </div>
                  <div className="flex space-x-2">
                    <button className="p-1 hover:bg-slate-100 rounded">
                      <ScrollText size={16} color="#64748B" />
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 border border-gray-200 rounded mb-2">
                  <div style={{
                    fontWeight: 500,
                    fontFamily: 'Inter',
                    fontSize: '14px',
                    color: '#0F172A'
                  }}>
                    Mission Commander
                  </div>
                  <div className="flex space-x-2">
                    <button className="p-1 hover:bg-slate-100 rounded">
                      <ScrollText size={16} color="#64748B" />
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 border border-gray-200 rounded mb-2">
                  <div style={{
                    fontWeight: 500,
                    fontFamily: 'Inter',
                    fontSize: '14px',
                    color: '#0F172A'
                  }}>
                    Flight Lead
                  </div>
                  <div className="flex space-x-2">
                    <button className="p-1 hover:bg-slate-100 rounded">
                      <ScrollText size={16} color="#64748B" />
                    </button>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        );
      case 'squadron':
        return (
          <div>
            <h2 className="text-xl font-semibold mb-4">Squadron Administration</h2>
            <p className="text-slate-600 mb-6">
              Configure squadron name, board number selection criteria, and aircraft types flown.
            </p>

            <div className="space-y-6">
              <Card className="p-4">
                <h3 className="text-lg font-medium mb-3">Squadron Identity</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-slate-700 mb-1">Squadron Name</label>
                    <input 
                      type="text" 
                      className="w-full p-2 border border-gray-200 rounded" 
                      placeholder="VFA-26 Stingrays"
                      defaultValue="VFA-26 Stingrays"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-700 mb-1">Squadron Callsign</label>
                    <input 
                      type="text" 
                      className="w-full p-2 border border-gray-200 rounded" 
                      placeholder="Stingrays" 
                      defaultValue="Stingrays"
                    />
                  </div>
                </div>
              </Card>

              <Card className="p-4">
                <h3 className="text-lg font-medium mb-3">Aircraft Types</h3>
                <p className="text-sm text-slate-500 mb-4">
                  Select the aircraft types flown by your squadron.
                </p>
                <div className="space-y-2">
                  <div className="flex items-center">
                    <input type="checkbox" id="fa18c" className="mr-2" defaultChecked />
                    <label htmlFor="fa18c">F/A-18C Hornet</label>
                  </div>
                  <div className="flex items-center">
                    <input type="checkbox" id="fa18e" className="mr-2" />
                    <label htmlFor="fa18e">F/A-18E Super Hornet</label>
                  </div>
                  <div className="flex items-center">
                    <input type="checkbox" id="f14b" className="mr-2" />
                    <label htmlFor="f14b">F-14B Tomcat</label>
                  </div>
                  <div className="flex items-center">
                    <input type="checkbox" id="f16c" className="mr-2" />
                    <label htmlFor="f16c">F-16C Viper</label>
                  </div>
                </div>
              </Card>

              <Card className="p-4">
                <h3 className="text-lg font-medium mb-3">Board Number Format</h3>
                <p className="text-sm text-slate-500 mb-4">
                  Configure how board numbers are assigned to squadron personnel.
                </p>
                <div>
                  <label className="block text-sm text-slate-700 mb-1">Board Number Prefix</label>
                  <input 
                    type="text" 
                    className="w-full p-2 border border-gray-200 rounded mb-4" 
                    placeholder="2" 
                    defaultValue="2"
                    maxLength={1}
                  />
                </div>
                <div className="flex items-center mb-2">
                  <input type="checkbox" id="autoAssignBoard" className="mr-2" defaultChecked />
                  <label htmlFor="autoAssignBoard">Auto-assign board numbers to new pilots</label>
                </div>
              </Card>
            </div>
          </div>
        );
      case 'mission':
        return (
          <div>
            <h2 className="text-xl font-semibold mb-4">Mission Defaults</h2>
            <p className="text-slate-600 mb-6">
              Configure default JOKER and BINGO fuel states, encryption channels, and Comms Plan templates.
            </p>

            <div className="space-y-6">
              <Card className="p-4">
                <h3 className="text-lg font-medium mb-3">Fuel States</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-slate-700 mb-1">Default BINGO (1000 lbs)</label>
                    <input 
                      type="number" 
                      className="w-full p-2 border border-gray-200 rounded" 
                      defaultValue={3.0} 
                      min={1.0}
                      max={10.0}
                      step={0.1}
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-700 mb-1">Default JOKER (1000 lbs)</label>
                    <input 
                      type="number" 
                      className="w-full p-2 border border-gray-200 rounded" 
                      defaultValue={5.0}
                      min={1.0}
                      max={15.0}
                      step={0.1} 
                    />
                  </div>
                </div>
              </Card>

              <Card className="p-4">
                <h3 className="text-lg font-medium mb-3">Default Encryption</h3>
                <p className="text-sm text-slate-500 mb-4">
                  Set the default encryption channel for new missions.
                </p>
                <div className="grid grid-cols-6 gap-2">
                  {[1, 2, 3, 4, 5, 6].map((num) => (
                    <button
                      key={num}
                      className={`p-3 border rounded-lg ${num === 1 ? 'bg-[#F24607] text-white' : 'bg-white text-slate-600 hover:bg-slate-100'}`}
                    >
                      {num}
                    </button>
                  ))}
                </div>
              </Card>

              <Card className="p-4">
                <h3 className="text-lg font-medium mb-3">Comms Plan Template</h3>
                <button className="px-4 py-2 bg-slate-100 text-slate-700 rounded hover:bg-slate-200 mb-4">
                  Edit Default Template
                </button>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="text-left bg-slate-50">
                        <th className="p-2 text-sm font-medium text-slate-500">Chan</th>
                        <th className="p-2 text-sm font-medium text-slate-500">Name</th>
                        <th className="p-2 text-sm font-medium text-slate-500">Freq</th>
                        <th className="p-2 text-sm font-medium text-slate-500">TACAN</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b">
                        <td className="p-2">1</td>
                        <td className="p-2">Base</td>
                        <td className="p-2">251.000</td>
                        <td className="p-2">——</td>
                      </tr>
                      <tr className="border-b">
                        <td className="p-2">2</td>
                        <td className="p-2">Tower</td>
                        <td className="p-2">340.200</td>
                        <td className="p-2">——</td>
                      </tr>
                      <tr>
                        <td className="p-2">3</td>
                        <td className="p-2">Strike</td>
                        <td className="p-2">377.800</td>
                        <td className="p-2">——</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          </div>
        );
      case 'appearance':
        return (
          <div>
            <h2 className="text-xl font-semibold mb-4">Appearance</h2>
            <p className="text-slate-600 mb-6">
              Configure squadron logos, colors, and default units of measure.
            </p>

            <div className="space-y-6">
              <Card className="p-4">
                <h3 className="text-lg font-medium mb-3">Squadron Logo</h3>
                <div className="flex items-center space-x-6 mb-4">
                  <div className="w-32 h-32 border-2 border-dashed border-slate-300 rounded-lg flex items-center justify-center">
                    <img 
                      src="/src/assets/Stingrays Logo 80x80.png" 
                      alt="Squadron Logo" 
                      className="max-w-full max-h-full"
                    />
                  </div>
                  <button className="px-4 py-2 bg-slate-100 text-slate-700 rounded hover:bg-slate-200">
                    Change Logo
                  </button>
                </div>
              </Card>

              <Card className="p-4">
                <h3 className="text-lg font-medium mb-3">Color Scheme</h3>
                <p className="text-sm text-slate-500 mb-4">
                  Customize the application's color scheme.
                </p>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-slate-700 mb-1">Primary Color</label>
                    <div className="flex space-x-2">
                      <input type="color" defaultValue="#5B4E61" className="w-16 h-10" />
                      <input type="text" defaultValue="#5B4E61" className="p-2 border border-gray-200 rounded" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm text-slate-700 mb-1">Secondary Color</label>
                    <div className="flex space-x-2">
                      <input type="color" defaultValue="#82728C" className="w-16 h-10" />
                      <input type="text" defaultValue="#82728C" className="p-2 border border-gray-200 rounded" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm text-slate-700 mb-1">Accent Color</label>
                    <div className="flex space-x-2">
                      <input type="color" defaultValue="#F24607" className="w-16 h-10" />
                      <input type="text" defaultValue="#F24607" className="p-2 border border-gray-200 rounded" />
                    </div>
                  </div>
                </div>
              </Card>

              <Card className="p-4">
                <h3 className="text-lg font-medium mb-3">Units of Measure</h3>
                <p className="text-sm text-slate-500 mb-4">
                  Set your preferred units of measurement.
                </p>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-slate-700 mb-1">Distance</label>
                    <select className="w-full p-2 border border-gray-200 rounded">
                      <option>Nautical Miles</option>
                      <option>Kilometers</option>
                      <option>Miles</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-slate-700 mb-1">Altitude</label>
                    <select className="w-full p-2 border border-gray-200 rounded">
                      <option>Feet</option>
                      <option>Meters</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-slate-700 mb-1">Fuel</label>
                    <select className="w-full p-2 border border-gray-200 rounded">
                      <option>Thousands of Pounds</option>
                      <option>Kilograms</option>
                      <option>Percent</option>
                    </select>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        );
      case 'accounts':
        return (
          <div>
            <h2 className="text-xl font-semibold mb-4">User Accounts</h2>
            <p className="text-slate-600 mb-6">
              Manage user accounts, access levels, and permissions.
            </p>

            <div className="space-y-6">
              <Card className="p-4">
                <h3 className="text-lg font-medium mb-3">Authentication</h3>
                <div className="mb-6">
                  <LoginForm onLoginStateChange={handleLoginStateChange} />
                </div>
              </Card>

              {isLoggedIn && (
                <>
                  <Card className="p-4">
                    <h3 className="text-lg font-medium mb-3">User Management</h3>
                    <p className="text-sm text-slate-500 mb-4">
                      Manage users and their access levels.
                    </p>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="text-left bg-slate-50">
                            <th className="p-2 text-sm font-medium text-slate-500">Username</th>
                            <th className="p-2 text-sm font-medium text-slate-500">Role</th>
                            <th className="p-2 text-sm font-medium text-slate-500">Status</th>
                            <th className="p-2 text-sm font-medium text-slate-500">Last Login</th>
                            <th className="p-2 text-sm font-medium text-slate-500">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-b">
                            <td className="p-2">admin</td>
                            <td className="p-2">Administrator</td>
                            <td className="p-2">
                              <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs">Active</span>
                            </td>
                            <td className="p-2">Now</td>
                            <td className="p-2">
                              <button className="px-2 py-1 bg-slate-100 text-slate-700 rounded text-xs mr-1">Edit</button>
                            </td>
                          </tr>
                          <tr className="border-b">
                            <td className="p-2">user1</td>
                            <td className="p-2">Squadron Member</td>
                            <td className="p-2">
                              <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs">Active</span>
                            </td>
                            <td className="p-2">1 day ago</td>
                            <td className="p-2">
                              <button className="px-2 py-1 bg-slate-100 text-slate-700 rounded text-xs mr-1">Edit</button>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <button className="mt-4 px-4 py-2 bg-slate-100 text-slate-700 rounded hover:bg-slate-200">
                      Add New User
                    </button>
                  </Card>

                  <Card className="p-4">
                    <h3 className="text-lg font-medium mb-3">Permission Levels</h3>
                    <p className="text-sm text-slate-500 mb-4">
                      Configure access levels and permissions.
                    </p>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 border border-gray-200 rounded">
                        <div>
                          <div className="font-medium">Administrator</div>
                          <p className="text-xs text-slate-500">Full access to all features</p>
                        </div>
                        <button className="px-3 py-1 bg-slate-100 text-slate-700 rounded text-sm">Edit</button>
                      </div>
                      <div className="flex items-center justify-between p-3 border border-gray-200 rounded">
                        <div>
                          <div className="font-medium">Squadron Leader</div>
                          <p className="text-xs text-slate-500">Can manage roster and events</p>
                        </div>
                        <button className="px-3 py-1 bg-slate-100 text-slate-700 rounded text-sm">Edit</button>
                      </div>
                      <div className="flex items-center justify-between p-3 border border-gray-200 rounded">
                        <div>
                          <div className="font-medium">Squadron Member</div>
                          <p className="text-xs text-slate-500">Basic access to view info</p>
                        </div>
                        <button className="px-3 py-1 bg-slate-100 text-slate-700 rounded text-sm">Edit</button>
                      </div>
                    </div>
                  </Card>
                </>
              )}
            </div>
          </div>
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