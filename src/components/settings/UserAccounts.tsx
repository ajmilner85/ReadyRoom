import React, { useState } from 'react';
import { Card } from '../ui/card';
import LoginForm from '../ui/LoginForm';

interface UserAccountsProps {
  error?: string | null;
  setError?: (error: string | null) => void;
}

const UserAccounts: React.FC<UserAccountsProps> = ({ error, setError }) => {
  // State for login status
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  
  // Mock data for user accounts
  const [users] = useState([
    { username: 'admin', role: 'Administrator', status: 'Active', lastLogin: 'Now' },
    { username: 'user1', role: 'Squadron Member', status: 'Active', lastLogin: '1 day ago' }
  ]);
  
  // Mock data for permission levels
  const [permissionLevels] = useState([
    { name: 'Administrator', description: 'Full access to all features' },
    { name: 'Squadron Leader', description: 'Can manage roster and events' },
    { name: 'Squadron Member', description: 'Basic access to view info' }
  ]);
  
  // Handler for login state change
  const handleLoginStateChange = (loggedIn: boolean) => {
    setIsLoggedIn(loggedIn);
  };
  
  // Handler for editing a user
  const handleEditUser = (username: string) => {
    console.log(`Edit user: ${username}`);
    // This would open a modal or navigate to user edit page
  };
  
  // Handler for adding a new user
  const handleAddUser = () => {
    console.log('Add new user');
    // This would open a form for adding a new user
  };
  
  // Handler for editing permission level
  const handleEditPermission = (permissionName: string) => {
    console.log(`Edit permission: ${permissionName}`);
    // This would open a modal to edit permission settings
  };

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
                    {users.map((user) => (
                      <tr key={user.username} className="border-b">
                        <td className="p-2">{user.username}</td>
                        <td className="p-2">{user.role}</td>
                        <td className="p-2">
                          <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs">
                            {user.status}
                          </span>
                        </td>
                        <td className="p-2">{user.lastLogin}</td>
                        <td className="p-2">
                          <button 
                            className="px-2 py-1 bg-slate-100 text-slate-700 rounded text-xs mr-1"
                            onClick={() => handleEditUser(user.username)}
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button 
                className="mt-4 px-4 py-2 bg-slate-100 text-slate-700 rounded hover:bg-slate-200"
                onClick={handleAddUser}
              >
                Add New User
              </button>
            </Card>

            <Card className="p-4">
              <h3 className="text-lg font-medium mb-3">Permission Levels</h3>
              <p className="text-sm text-slate-500 mb-4">
                Configure access levels and permissions.
              </p>
              <div className="space-y-3">
                {permissionLevels.map((permission) => (
                  <div key={permission.name} className="flex items-center justify-between p-3 border border-gray-200 rounded">
                    <div>
                      <div className="font-medium">{permission.name}</div>
                      <p className="text-xs text-slate-500">{permission.description}</p>
                    </div>
                    <button 
                      className="px-3 py-1 bg-slate-100 text-slate-700 rounded text-sm"
                      onClick={() => handleEditPermission(permission.name)}
                    >
                      Edit
                    </button>
                  </div>
                ))}
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
};

export default UserAccounts;