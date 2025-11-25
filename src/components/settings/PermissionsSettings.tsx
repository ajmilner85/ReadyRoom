import React, { useState, useEffect } from 'react';
import { permissionService } from '../../utils/permissionService';
import type { PermissionRule, GroupedPermissions } from '../../types/PermissionTypes';
import { PermissionMatrix } from './PermissionsMatrix';
import { useAuth } from '../../context/AuthContext';
import LoadingSpinner from '../ui/LoadingSpinner';


const PermissionsSettings: React.FC = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [permissions, setPermissions] = useState<GroupedPermissions | null>(null);
  const [rules, setRules] = useState<PermissionRule[]>([]);
  const [, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  
  // Load data on component mount
  useEffect(() => {
    loadPermissionsData();
  }, []);

  const loadPermissionsData = async () => {
    setLoading(true);
    try {
      const [permissionsData, rulesData] = await Promise.all([
        permissionService.getGroupedPermissions(),
        permissionService.getPermissionRules()
      ]);
      
      setPermissions(permissionsData);
      setRules(rulesData);
      
    } catch (error) {
      console.error('Error loading permissions data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRule = async (rule: Omit<PermissionRule, 'id' | 'createdAt' | 'updatedAt'>) => {
    setSaveStatus('saving');
    try {
      if (!user?.id) {
        throw new Error('User not authenticated');
      }
      const newRule = await permissionService.createPermissionRule(rule, user.id);
      setRules(prev => [...prev, newRule]);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (error) {
      console.error('Error creating rule:', error);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 2000);
    }
  };

  const handleUpdateRule = async (ruleId: string, updates: Partial<PermissionRule>) => {
    setSaveStatus('saving');
    try {
      const updatedRule = await permissionService.updatePermissionRule(ruleId, updates);
      setRules(prev => prev.map(rule => rule.id === ruleId ? updatedRule : rule));
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (error) {
      console.error('Error updating rule:', error);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 2000);
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    setSaveStatus('saving');
    try {
      await permissionService.deletePermissionRule(ruleId);
      setRules(prev => prev.filter(rule => rule.id !== ruleId));
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (error) {
      console.error('Error deleting rule:', error);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 2000);
    }
  };

  if (loading && !permissions) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#FFFFFF' }}>
        <div style={{ padding: '40px 40px 24px 40px', borderBottom: '1px solid #E2E8F0' }}>
          <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
            <h2 style={{ fontSize: '24px', fontWeight: 600, margin: 0, color: '#0F172A' }}>
              Permissions Management
            </h2>
            <p style={{ fontSize: '14px', color: '#64748B', margin: '8px 0 0 0', fontFamily: 'Inter' }}>
              Manage user permissions and access control for your squadron.
            </p>
          </div>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '24px 40px 40px 40px' }}>
          <div style={{
            maxWidth: '1200px',
            margin: '0 auto',
            textAlign: 'center',
            color: '#64748B',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px',
            paddingTop: '60px'
          }}>
            <LoadingSpinner size="medium" />
            <div style={{ fontSize: '14px', fontFamily: 'Inter' }}>Loading permissions...</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#FFFFFF' }}>
      {/* Fixed Header */}
      <div style={{ padding: '40px 40px 0 40px', flexShrink: 0 }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', borderBottom: '1px solid #E2E8F0', paddingBottom: '24px' }}>
          <h2 style={{ fontSize: '24px', fontWeight: 600, margin: 0, color: '#0F172A' }}>
            Permissions Management
          </h2>
          <p style={{ fontSize: '14px', color: '#64748B', margin: '8px 0 0 0', fontFamily: 'Inter' }}>
            Manage user permissions and access control for your squadron.
          </p>
        </div>
      </div>

      {/* Scrollable Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '24px 40px 40px 40px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <PermissionMatrix
            permissions={permissions}
            rules={rules}
            onCreateRule={handleCreateRule}
            onUpdateRule={handleUpdateRule}
            onDeleteRule={handleDeleteRule}
            loading={loading}
          />
        </div>
      </div>
    </div>
  );
};


export default PermissionsSettings;