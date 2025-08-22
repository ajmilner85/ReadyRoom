import React, { useState } from 'react';
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
            User Accounts
          </h2>
          <p style={{ fontSize: '14px', color: '#64748B', margin: '8px 0 0 0', fontFamily: 'Inter' }}>
            Manage user accounts, access levels, and permissions.
          </p>
        </div>
        {/* Authentication Section */}
        <div style={firstSectionStyle}>
          <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#0F172A', margin: '0 0 16px 0' }}>
            Authentication
          </h3>
          <div style={{ marginBottom: '24px' }}>
            <LoginForm onLoginStateChange={handleLoginStateChange} />
          </div>
        </div>

        {isLoggedIn && (
          <>
            {/* User Management Section */}
            <div style={sectionStyle}>
              <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#0F172A', margin: '0 0 16px 0' }}>
                User Management
              </h3>
              <p style={{ fontSize: '14px', color: '#64748B', margin: '0 0 24px 0', fontFamily: 'Inter' }}>
                Manage users and their access levels.
              </p>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', fontFamily: 'Inter' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', backgroundColor: '#F8FAFC' }}>
                      <th style={{ padding: '8px', fontSize: '12px', fontWeight: 500, color: '#64748B' }}>Username</th>
                      <th style={{ padding: '8px', fontSize: '12px', fontWeight: 500, color: '#64748B' }}>Role</th>
                      <th style={{ padding: '8px', fontSize: '12px', fontWeight: 500, color: '#64748B' }}>Status</th>
                      <th style={{ padding: '8px', fontSize: '12px', fontWeight: 500, color: '#64748B' }}>Last Login</th>
                      <th style={{ padding: '8px', fontSize: '12px', fontWeight: 500, color: '#64748B' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.username} style={{ borderBottom: '1px solid #E5E7EB' }}>
                        <td style={{ padding: '8px', fontSize: '14px' }}>{user.username}</td>
                        <td style={{ padding: '8px', fontSize: '14px' }}>{user.role}</td>
                        <td style={{ padding: '8px', fontSize: '14px' }}>
                          <span style={{
                            padding: '4px 8px',
                            backgroundColor: '#DCFCE7',
                            color: '#166534',
                            borderRadius: '12px',
                            fontSize: '12px',
                            fontFamily: 'Inter'
                          }}>
                            {user.status}
                          </span>
                        </td>
                        <td style={{ padding: '8px', fontSize: '14px' }}>{user.lastLogin}</td>
                        <td style={{ padding: '8px', fontSize: '14px' }}>
                          <button 
                            style={{
                              padding: '4px 8px',
                              backgroundColor: '#F8FAFC',
                              color: '#374151',
                              border: '1px solid #D1D5DB',
                              borderRadius: '4px',
                              fontSize: '12px',
                              fontFamily: 'Inter',
                              cursor: 'pointer',
                              marginRight: '4px'
                            }}
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
                style={{
                  marginTop: '16px',
                  padding: '10px 16px',
                  backgroundColor: '#F8FAFC',
                  color: '#374151',
                  border: '1px solid #D1D5DB',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontFamily: 'Inter',
                  transition: 'background-color 0.2s ease'
                }}
                onClick={handleAddUser}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F1F5F9'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#F8FAFC'}
              >
                Add New User
              </button>
            </div>

            {/* Permission Levels Section */}
            <div style={sectionStyle}>
              <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#0F172A', margin: '0 0 16px 0' }}>
                Permission Levels
              </h3>
              <p style={{ fontSize: '14px', color: '#64748B', margin: '0 0 24px 0', fontFamily: 'Inter' }}>
                Configure access levels and permissions.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {permissionLevels.map((permission) => (
                  <div key={permission.name} style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px',
                    border: '1px solid #E5E7EB',
                    borderRadius: '6px'
                  }}>
                    <div>
                      <div style={{ fontWeight: 500, fontSize: '14px', fontFamily: 'Inter', color: '#0F172A' }}>
                        {permission.name}
                      </div>
                      <p style={{ fontSize: '12px', color: '#64748B', fontFamily: 'Inter', margin: '4px 0 0 0' }}>
                        {permission.description}
                      </p>
                    </div>
                    <button 
                      style={{
                        padding: '6px 12px',
                        backgroundColor: '#F8FAFC',
                        color: '#374151',
                        border: '1px solid #D1D5DB',
                        borderRadius: '4px',
                        fontSize: '14px',
                        fontFamily: 'Inter',
                        cursor: 'pointer',
                        transition: 'background-color 0.2s ease'
                      }}
                      onClick={() => handleEditPermission(permission.name)}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F1F5F9'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#F8FAFC'}
                    >
                      Edit
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
        
      </div>
    </div>
  );
};

export default UserAccounts;