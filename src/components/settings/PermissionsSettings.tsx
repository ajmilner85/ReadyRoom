import React, { useState, useEffect } from 'react';
import { Card } from '../ui/card';
import { Shield, Users, UserCheck, Settings2, Info, Plus, Search, Filter, Save, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';
import { permissionService } from '../../utils/permissionService';
import type { AppPermission, PermissionRule, BasisOption, BasisType, GroupedPermissions } from '../../types/PermissionTypes';
import { SCOPE_LABELS } from '../../types/PermissionTypes';
import { PermissionMatrix } from './PermissionsMatrix';
import { useAuth } from '../../context/AuthContext';


const PermissionsSettings: React.FC = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [permissions, setPermissions] = useState<GroupedPermissions | null>(null);
  const [rules, setRules] = useState<PermissionRule[]>([]);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  
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
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="animate-spin mr-2" size={20} />
        Loading permissions...
      </div>
    );
  }

  return (
    <div style={{ 
      height: '100%', 
      display: 'flex', 
      flexDirection: 'column',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Header */}
      <div style={{ 
        marginBottom: '24px',
        flexShrink: 0
      }}>
        <h2 style={{ 
          fontSize: '24px', 
          fontWeight: 600, 
          color: '#1F2937', 
          margin: 0, 
          marginBottom: '8px' 
        }}>
          Permissions Management
        </h2>
        <p style={{ 
          color: '#6B7280', 
          margin: 0,
          fontSize: '14px'
        }}>
          Manage user permissions and access control for your squadron.
        </p>
      </div>

      {/* Permission Matrix Content */}
      <div style={{ 
        flex: 1, 
        minHeight: 0,
        overflow: 'hidden',
        paddingRight: '8px'
      }}>
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
  );
};


export default PermissionsSettings;