import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Save, Upload, Edit, Trash } from 'lucide-react';
import { supabase } from '../../utils/supabaseClient';
import SquadronDiscordSettings from './SquadronDiscordSettings';
import type { Team } from '../../types/TeamTypes';
import { getAllTeams, createTeam, updateTeam, deleteTeam } from '../../utils/organizationService';
import {
  Command,
  Group,
  Wing,
  Squadron,
  NewCommand,
  NewGroup,
  NewWing,
  NewSquadron
} from '../../types/OrganizationTypes';
import type { Team, NewTeam } from '../../types/TeamTypes';

interface OrgEntityModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  entityType: 'command' | 'group' | 'wing' | 'squadron' | 'team';
  entity?: Command | Group | Wing | Squadron | Team;
  commands: Command[];
  groups: Group[];
  wings: Wing[];
  squadrons: Squadron[];
  onSave: (data: NewCommand | NewGroup | NewWing | NewSquadron | NewTeam) => void;
  onClose: () => void;
}

const TIMEZONE_OPTIONS = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Anchorage', label: 'Alaska Time (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time (HST)' },
  { value: 'UTC', label: 'Coordinated Universal Time (UTC)' },
  { value: 'Europe/London', label: 'Greenwich Mean Time (GMT)' },
  { value: 'Europe/Berlin', label: 'Central European Time (CET)' },
  { value: 'Asia/Tokyo', label: 'Japan Standard Time (JST)' },
  { value: 'Asia/Seoul', label: 'Korea Standard Time (KST)' },
  { value: 'Australia/Sydney', label: 'Australian Eastern Time (AEST)' },
  { value: 'Pacific/Guam', label: 'Guam Time (ChST)' }
];

const OrgEntityModal: React.FC<OrgEntityModalProps> = ({
  isOpen,
  mode,
  entityType,
  entity,
  commands,
  groups,
  wings,
  squadrons,
  onSave,
  onClose
}) => {
  // Tab state for squadron and wing modals
  const [activeTab, setActiveTab] = useState<'general' | 'discord' | 'teams'>('general');

  // Teams state
  const [teams, setTeams] = useState<Team[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [showTeamForm, setShowTeamForm] = useState(false);
  const [teamFormData, setTeamFormData] = useState({
    name: '',
    description: '',
    active: true
  });
  
  const [formData, setFormData] = useState<{
    name: string;
    designation: string;
    established_date: string;
    deactivated_date: string;
    insignia_url: string;
    tail_code: string;
    command_id: string;
    group_id: string;
    wing_id: string;
    carrier_id: string;
    callsigns: string;
    airframe_id: string;
    color_palette: any;
    timezone: string;
    // Team-specific fields
    description: string;
    scope: 'global' | 'wing' | 'squadron';
    scope_id: string;
    active: boolean;
  }>({
    name: '',
    designation: '',
    established_date: '',
    deactivated_date: '',
    insignia_url: '',
    tail_code: '',
    command_id: '',
    group_id: '',
    wing_id: '',
    carrier_id: '',
    callsigns: '',
    airframe_id: '',
    color_palette: {
      neutral_light: '#F8FAFC',
      neutral_dark: '#1E293B',
      primary: '#2563EB',
      secondary: '#64748B',
      accent: '#059669'
    },
    timezone: 'America/New_York',
    // Team defaults
    description: '',
    scope: 'squadron',
    scope_id: '',
    active: true
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uploadingImage, setUploadingImage] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [callsignsList, setCallsignsList] = useState<string[]>([]);
  const [newCallsign, setNewCallsign] = useState('');
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false);
  const [aircraftTypes, setAircraftTypes] = useState<Array<{ id: string; designation: string; name: string }>>([]);
  
  // Discord settings state - separate for each entity
  const [discordSettings, setDiscordSettings] = useState<{
    [entityId: string]: {
      discordChannels: any[];
      roleMappings: any[];
      selectedGuildId: string;
      emoji: string;
      threadingSettings: {
        useThreads: boolean;
        autoArchiveDuration: number;
      };
      defaultNotificationRoles: Array<{ id: string; name: string }>;
    }
  }>({});

  // Initialize form data when modal opens or entity changes
  useEffect(() => {
    if (isOpen) {
      if (mode === 'edit' && entity) {
        setFormData({
          name: entity.name || '',
          designation: ('designation' in entity ? entity.designation : '') || '',
          established_date: entity.established_date || '',
          deactivated_date: entity.deactivated_date || '',
          insignia_url: entity.insignia_url || '',
          tail_code: ('tail_code' in entity ? entity.tail_code : '') || '',
          command_id: ('command_id' in entity ? entity.command_id : '') || '',
          group_id: ('group_id' in entity ? entity.group_id : '') || '',
          wing_id: ('wing_id' in entity ? entity.wing_id : '') || '',
          carrier_id: ('carrier_id' in entity ? entity.carrier_id : '') || '',
          callsigns: ('callsigns' in entity ? JSON.stringify(entity.callsigns || {}) : '') || '{}',
          airframe_id: ('airframe_id' in entity ? (entity as any).airframe_id : '') || '',
          color_palette: ('color_palette' in entity && entity.color_palette) ? {
            neutral_light: (entity.color_palette as any)?.neutral_light || '#F8FAFC',
            neutral_dark: (entity.color_palette as any)?.neutral_dark || '#1E293B',
            primary: (entity.color_palette as any)?.primary || '#2563EB',
            secondary: (entity.color_palette as any)?.secondary || '#64748B',
            accent: (entity.color_palette as any)?.accent || '#059669'
          } : {
            neutral_light: '#F8FAFC',
            neutral_dark: '#1E293B',
            primary: '#2563EB',
            secondary: '#64748B',
            accent: '#059669'
          },
          timezone: ('settings' in entity && (entity as any).settings?.timezone) || 'America/New_York',
          // Team-specific fields
          description: ('description' in entity ? entity.description : '') || '',
          scope: ('scope' in entity ? entity.scope : 'squadron') || 'squadron',
          scope_id: ('scope_id' in entity ? entity.scope_id : '') || '',
          active: ('active' in entity ? entity.active : true) ?? true
        });
        
        // Parse existing callsigns for squadron
        if (entityType === 'squadron' && 'callsigns' in entity && entity.callsigns) {
          try {
            const parsed = entity.callsigns;
            if (Array.isArray(parsed)) {
              setCallsignsList(parsed);
            } else {
              setCallsignsList([]);
            }
          } catch {
            setCallsignsList([]);
          }
        } else {
          setCallsignsList([]);
        }
        
        // Initialize Discord settings for this entity from database
        const entityKey = `${entityType}_${entity.id}`;
        const discordIntegration = (entity as any)?.discord_integration || {};
        const entitySettings = (entity as any)?.settings || {};
        
        setDiscordSettings(prev => ({
          ...prev,
          [entityKey]: {
            discordChannels: discordIntegration.discordChannels || [],
            roleMappings: discordIntegration.roleMappings || [],
            selectedGuildId: discordIntegration.selectedGuildId || '',
            emoji: discordIntegration.emoji || '',
            // Try to get threading settings from both locations (settings takes precedence)
            threadingSettings: entitySettings.threadingSettings || discordIntegration.threadingSettings || {
              useThreads: false,
              autoArchiveDuration: 1440
            },
            defaultNotificationRoles: discordIntegration.defaultNotificationRoles || []
          }
        }));
      } else {
        // Reset form for create mode
        setFormData({
          name: '',
          designation: '',
          established_date: '',
          deactivated_date: '',
          insignia_url: '',
          tail_code: '',
          command_id: '',
          group_id: '',
          wing_id: '',
          carrier_id: '',
          callsigns: '{}',
          airframe_id: '',
          color_palette: {
            neutral_light: '#F8FAFC',
            neutral_dark: '#1E293B',
            primary: '#2563EB',
            secondary: '#64748B',
            accent: '#059669'
          },
          timezone: 'America/New_York',
          // Team defaults for create mode
          description: '',
          scope: 'squadron',
          scope_id: '',
          active: true
        });
      }
      setErrors({});
    }
  }, [isOpen, mode, entity, entityType]);

  // Fetch aircraft types for squadron airframe dropdown
  useEffect(() => {
    const fetchAircraftTypes = async () => {
      try {
        const { data, error } = await supabase
          .from('ref_aircraft_types' as any)
          .select('id, designation, name')
          .order('designation');

        if (!error && data) {
          setAircraftTypes(data as unknown as Array<{ id: string; designation: string; name: string }>);
        }
      } catch (error) {
        // Table might not exist yet, silently fail
        console.log('Aircraft types table not available yet');
      }
    };

    if (isOpen && entityType === 'squadron') {
      fetchAircraftTypes();
    }
  }, [isOpen, entityType]);

  // Fetch teams for wing/squadron when modal opens
  useEffect(() => {
    const fetchTeams = async () => {
      if (!isOpen || (entityType !== 'wing' && entityType !== 'squadron') || !entity) return;

      setLoadingTeams(true);
      try {
        const { data, error } = await getAllTeams();
        if (!error && data) {
          // Filter teams by scope - show teams scoped to this specific wing/squadron
          const filteredTeams = data.filter(team => {
            if (entityType === 'wing') {
              return team.scope === 'wing' && team.scope_id === entity.id;
            } else if (entityType === 'squadron') {
              return team.scope === 'squadron' && team.scope_id === entity.id;
            }
            return false;
          });
          setTeams(filteredTeams);
        }
      } catch (error) {
        console.error('Error fetching teams:', error);
      } finally {
        setLoadingTeams(false);
      }
    };

    fetchTeams();
  }, [isOpen, entityType, entity]);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  // Helper functions for Discord settings
  const getEntityKey = () => {
    if (!entity) return `${entityType}_new`;
    return `${entityType}_${entity.id}`;
  };

  const getCurrentDiscordSettings = () => {
    const entityKey = getEntityKey();
    return discordSettings[entityKey] || {
      discordChannels: [],
      roleMappings: [],
      selectedGuildId: '',
      emoji: '',
      threadingSettings: {
        useThreads: false,
        autoArchiveDuration: 1440
      },
      defaultNotificationRoles: []
    };
  };

  const updateDiscordSettings = (updates: Partial<{
    discordChannels: any[];
    roleMappings: any[];
    selectedGuildId: string;
    emoji: string;
    threadingSettings: {
      useThreads: boolean;
      autoArchiveDuration: number;
    };
    defaultNotificationRoles: Array<{ id: string; name: string }>;
  }>) => {
    const entityKey = getEntityKey();
    setDiscordSettings(prev => ({
      ...prev,
      [entityKey]: {
        ...getCurrentDiscordSettings(),
        ...updates
      }
    }));
  };

  // Handle image upload to Supabase storage
  const uploadImageToStorage = async (file: File): Promise<string | null> => {
    try {
      setUploadingImage(true);
      
      // Generate unique filename
      const fileExt = file.name.split('.').pop();
      const fileName = `${entityType}-${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `insignias/${fileName}`;

      // Upload file to Supabase storage
      const { error } = await supabase.storage
        .from('organization-assets')
        .upload(filePath, file);

      if (error) {
        console.error('Upload error:', error);
        throw error;
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('organization-assets')
        .getPublicUrl(filePath);

      return urlData.publicUrl;
    } catch (error: any) {
      console.error('Error uploading image:', error);
      setErrors(prev => ({ ...prev, insignia_url: 'Failed to upload image: ' + error.message }));
      return null;
    } finally {
      setUploadingImage(false);
    }
  };

  // Handle file drop
  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    const imageFile = files.find(file => file.type.startsWith('image/'));

    if (imageFile) {
      const url = await uploadImageToStorage(imageFile);
      if (url) {
        handleInputChange('insignia_url', url);
      }
    } else {
      setErrors(prev => ({ ...prev, insignia_url: 'Please drop an image file' }));
    }
  };

  // Handle file input change
  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = await uploadImageToStorage(file);
      if (url) {
        handleInputChange('insignia_url', url);
      }
    }
  };

  // Handle adding callsign
  const addCallsign = () => {
    const trimmed = newCallsign.trim().toUpperCase();
    if (trimmed && !callsignsList.includes(trimmed)) {
      const updated = [...callsignsList, trimmed];
      setCallsignsList(updated);
      setNewCallsign('');
      
      // Update form data with simplified array format
      handleInputChange('callsigns', JSON.stringify(updated));
    }
  };

  // Handle removing callsign
  const removeCallsign = (index: number) => {
    const updated = callsignsList.filter((_, i) => i !== index);
    setCallsignsList(updated);
    
    // Update form data with simplified array format
    handleInputChange('callsigns', JSON.stringify(updated));
  };

  // Handle callsign input key press
  const handleCallsignKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addCallsign();
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    // Name is required for all entities
    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    }

    // Entity-specific validation
    switch (entityType) {
      case 'group':
        if (!formData.command_id) {
          newErrors.command_id = 'Command is required for groups';
        }
        break;
      case 'wing':
        // Group is optional for wings (detached units)
        break;
      case 'squadron':
        if (!formData.designation.trim()) {
          newErrors.designation = 'Designation is required for squadrons';
        }
        if (!formData.wing_id) {
          newErrors.wing_id = 'Wing is required for squadrons';
        }
        break;
      case 'team':
        // Validate scope_id is provided when scope is not global
        if (formData.scope !== 'global' && !formData.scope_id) {
          newErrors.scope_id = `${formData.scope === 'wing' ? 'Wing' : 'Squadron'} is required for ${formData.scope} teams`;
        }
        break;
    }

    // Validate tail code format if provided
    if (formData.tail_code && formData.tail_code.length !== 2) {
      newErrors.tail_code = 'Tail code must be exactly 2 characters';
    }

    // Validate dates
    if (formData.established_date && formData.deactivated_date) {
      const estDate = new Date(formData.established_date);
      const deactDate = new Date(formData.deactivated_date);
      if (deactDate <= estDate) {
        newErrors.deactivated_date = 'Deactivation date must be after establishment date';
      }
    }

    // Validate callsigns JSON for squadrons
    if (entityType === 'squadron' && formData.callsigns) {
      try {
        const parsed = JSON.parse(formData.callsigns);
        if (!Array.isArray(parsed)) {
          newErrors.callsigns = 'Callsigns must be an array';
        }
      } catch {
        newErrors.callsigns = 'Callsigns must be valid JSON';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = () => {
    if (!validateForm()) return;

    const baseData = {
      name: formData.name.trim(),
      established_date: formData.established_date || null,
      deactivated_date: formData.deactivated_date || null,
      insignia_url: formData.insignia_url || null
    };

    let saveData: NewCommand | NewGroup | NewWing | NewSquadron | NewTeam;

    switch (entityType) {
      case 'command':
        saveData = baseData as NewCommand;
        break;
      case 'group':
        saveData = {
          ...baseData,
          command_id: formData.command_id
        } as NewGroup;
        break;
      case 'wing':
        saveData = {
          ...baseData,
          group_id: formData.group_id || null,
          designation: formData.designation || null,
          tail_code: formData.tail_code || null,
          carrier_id: formData.carrier_id || null,
          color_palette: formData.color_palette || null,
          discord_integration: getCurrentDiscordSettings()
        } as NewWing;
        break;
      case 'squadron':
        const discordSettings = getCurrentDiscordSettings();
        saveData = {
          ...baseData,
          wing_id: formData.wing_id,
          designation: formData.designation.trim(),
          tail_code: formData.tail_code || null,
          carrier_id: formData.carrier_id || null,
          callsigns: formData.callsigns ? JSON.parse(formData.callsigns) : null,
          airframe_id: formData.airframe_id || null,
          color_palette: formData.color_palette || null,
          discord_integration: discordSettings,
          settings: {
            timezone: formData.timezone,
            threadingSettings: discordSettings.threadingSettings
          }
        } as NewSquadron;
        break;
      case 'team':
        saveData = {
          name: formData.name.trim(),
          description: formData.description.trim() || null,
          scope: formData.scope,
          scope_id: formData.scope === 'global' ? null : (formData.scope_id || null),
          active: formData.active
        } as NewTeam;
        break;
      default:
        return;
    }

    onSave(saveData);
  };

  const handleDeactivate = () => {
    if (!entity) return;

    const currentDate = new Date().toISOString().split('T')[0];
    const entityData = {
      ...entity,
      deactivated_date: currentDate
    };

    onSave(entityData);
    setShowDeactivateConfirm(false);
  };

  // Team management handlers
  const handleCreateTeam = () => {
    setEditingTeam(null);
    setTeamFormData({
      name: '',
      description: '',
      active: true
    });
    setShowTeamForm(true);
  };

  const handleEditTeam = (team: Team) => {
    setEditingTeam(team);
    setTeamFormData({
      name: team.name,
      description: team.description || '',
      active: team.active
    });
    setShowTeamForm(true);
  };

  const handleSaveTeam = async () => {
    if (!entity || !teamFormData.name.trim()) return;

    try {
      const teamData = {
        name: teamFormData.name.trim(),
        description: teamFormData.description.trim() || null,
        scope: entityType as 'wing' | 'squadron',
        scope_id: entity.id,
        active: teamFormData.active
      };

      if (editingTeam) {
        // Update existing team
        const { error } = await updateTeam(editingTeam.id, teamData);
        if (error) throw error;
      } else {
        // Create new team
        const { error } = await createTeam(teamData);
        if (error) throw error;
      }

      // Refresh teams list
      const { data, error } = await getAllTeams();
      if (!error && data) {
        const filteredTeams = data.filter(team => {
          if (entityType === 'wing') {
            return team.scope === 'wing' && team.scope_id === entity.id;
          } else if (entityType === 'squadron') {
            return team.scope === 'squadron' && team.scope_id === entity.id;
          }
          return false;
        });
        setTeams(filteredTeams);
      }

      // Close form
      setShowTeamForm(false);
      setEditingTeam(null);
      setTeamFormData({ name: '', description: '', active: true });
    } catch (error) {
      console.error('Error saving team:', error);
      alert('Failed to save team');
    }
  };

  const handleDeleteTeam = async (teamId: string) => {
    if (!window.confirm('Are you sure you want to delete this team?')) return;

    try {
      const { error } = await deleteTeam(teamId);
      if (error) throw error;

      // Refresh teams list
      setTeams(teams.filter(t => t.id !== teamId));
    } catch (error) {
      console.error('Error deleting team:', error);
      alert('Failed to delete team');
    }
  };

  if (!isOpen) return null;

  const title = `${mode === 'create' ? 'Create' : 'Edit'} ${entityType.charAt(0).toUpperCase() + entityType.slice(1)}`;
  
  const modalContent = (
    <div 
      style={{ 
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 999999
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div 
        style={{ 
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '600px',
          backgroundColor: '#FFFFFF',
          boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)',
          borderRadius: '8px',
          zIndex: 1001,
          maxHeight: '90vh',
          overflow: 'hidden'
        }}
      >
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 24px',
          borderBottom: '1px solid #E2E8F0'
        }}>
          <h2 style={{
            fontSize: '18px',
            fontWeight: 600,
            color: '#0F172A'
          }}>
            {title}
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <X size={20} color="#64748B" />
          </button>
        </div>

        {/* Tab Navigation for Wings and Squadrons */}
        {(entityType === 'wing' || entityType === 'squadron') && mode === 'edit' && (
          <div style={{
            borderBottom: '1px solid #E2E8F0',
            backgroundColor: '#F8FAFC'
          }}>
            <div style={{ display: 'flex' }}>
              <button
                onClick={() => setActiveTab('general')}
                style={{
                  padding: '12px 24px',
                  backgroundColor: activeTab === 'general' ? '#FFFFFF' : 'transparent',
                  border: 'none',
                  borderBottom: activeTab === 'general' ? '2px solid #3B82F6' : '2px solid transparent',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontFamily: 'Inter',
                  fontWeight: activeTab === 'general' ? 500 : 400,
                  color: activeTab === 'general' ? '#0F172A' : '#64748B',
                  transition: 'all 0.2s ease'
                }}
              >
                General
              </button>
              {entityType === 'squadron' && (
                <button
                  onClick={() => setActiveTab('discord')}
                  style={{
                    padding: '12px 24px',
                    backgroundColor: activeTab === 'discord' ? '#FFFFFF' : 'transparent',
                    border: 'none',
                    borderBottom: activeTab === 'discord' ? '2px solid #3B82F6' : '2px solid transparent',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontFamily: 'Inter',
                    fontWeight: activeTab === 'discord' ? 500 : 400,
                    color: activeTab === 'discord' ? '#0F172A' : '#64748B',
                    transition: 'all 0.2s ease'
                  }}
                >
                  Discord
                </button>
              )}
              <button
                onClick={() => setActiveTab('teams')}
                style={{
                  padding: '12px 24px',
                  backgroundColor: activeTab === 'teams' ? '#FFFFFF' : 'transparent',
                  border: 'none',
                  borderBottom: activeTab === 'teams' ? '2px solid #3B82F6' : '2px solid transparent',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontFamily: 'Inter',
                  fontWeight: activeTab === 'teams' ? 500 : 400,
                  color: activeTab === 'teams' ? '#0F172A' : '#64748B',
                  transition: 'all 0.2s ease'
                }}
              >
                Teams
              </button>
            </div>
          </div>
        )}

        <div style={{
          padding: '24px',
          maxHeight: entityType === 'squadron' ? 'calc(90vh - 250px)' : 'calc(90vh - 180px)',
          overflowY: 'auto'
        }}>
          {/* General Tab Content */}
          {((entityType !== 'wing' && entityType !== 'squadron') || activeTab === 'general') && (
          <div>
            {/* Name Field */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontSize: '14px',
              fontWeight: 500,
              color: '#64748B'
            }}>
              Name *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                border: `1px solid ${errors.name ? '#EF4444' : '#CBD5E1'}`,
                borderRadius: '4px',
                fontSize: '14px',
                boxSizing: 'border-box',
                height: '35px',
                lineHeight: '19px'
              }}
              placeholder={`Enter ${entityType} name`}
            />
            {errors.name && (
              <div style={{
                color: '#EF4444',
                fontSize: '12px',
                marginTop: '4px'
              }}>
                {errors.name}
              </div>
            )}
          </div>

          {/* Description Field (Teams) */}
          {entityType === 'team' && (
            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: 500,
                color: '#64748B'
              }}>
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #CBD5E1',
                  borderRadius: '4px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  minHeight: '80px',
                  fontFamily: 'Inter, sans-serif',
                  resize: 'vertical'
                }}
                placeholder="Enter team description (optional)"
              />
            </div>
          )}

          {/* Scope Field (Teams) */}
          {entityType === 'team' && (
            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: 500,
                color: '#64748B'
              }}>
                Team Scope *
              </label>
              <select
                value={formData.scope}
                onChange={(e) => {
                  handleInputChange('scope', e.target.value);
                  // Clear scope_id when switching to global
                  if (e.target.value === 'global') {
                    handleInputChange('scope_id', '');
                  }
                }}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #CBD5E1',
                  borderRadius: '4px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  height: '35px',
                  backgroundColor: 'white'
                }}
              >
                <option value="global">Global (All Squadrons)</option>
                <option value="wing">Wing</option>
                <option value="squadron">Squadron</option>
              </select>
            </div>
          )}

          {/* Wing/Squadron Selector (Teams) */}
          {entityType === 'team' && formData.scope === 'wing' && (
            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: 500,
                color: '#64748B'
              }}>
                Wing *
              </label>
              <select
                value={formData.scope_id}
                onChange={(e) => handleInputChange('scope_id', e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: `1px solid ${errors.scope_id ? '#EF4444' : '#CBD5E1'}`,
                  borderRadius: '4px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  height: '35px',
                  backgroundColor: 'white'
                }}
              >
                <option value="">Select a wing</option>
                {wings.map(wing => (
                  <option key={wing.id} value={wing.id}>
                    {wing.name} {wing.designation ? `(${wing.designation})` : ''}
                  </option>
                ))}
              </select>
              {errors.scope_id && (
                <div style={{
                  color: '#EF4444',
                  fontSize: '12px',
                  marginTop: '4px'
                }}>
                  {errors.scope_id}
                </div>
              )}
            </div>
          )}

          {entityType === 'team' && formData.scope === 'squadron' && (
            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: 500,
                color: '#64748B'
              }}>
                Squadron *
              </label>
              <select
                value={formData.scope_id}
                onChange={(e) => handleInputChange('scope_id', e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: `1px solid ${errors.scope_id ? '#EF4444' : '#CBD5E1'}`,
                  borderRadius: '4px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  height: '35px',
                  backgroundColor: 'white'
                }}
              >
                <option value="">Select a squadron</option>
                {squadrons.map(squadron => (
                  <option key={squadron.id} value={squadron.id}>
                    {squadron.name} ({squadron.designation})
                  </option>
                ))}
              </select>
              {errors.scope_id && (
                <div style={{
                  color: '#EF4444',
                  fontSize: '12px',
                  marginTop: '4px'
                }}>
                  {errors.scope_id}
                </div>
              )}
            </div>
          )}

          {/* Active Checkbox (Teams) */}
          {entityType === 'team' && (
            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer'
              }}>
                <input
                  type="checkbox"
                  checked={formData.active}
                  onChange={(e) => setFormData(prev => ({ ...prev, active: e.target.checked }))}
                  style={{
                    width: '16px',
                    height: '16px',
                    cursor: 'pointer'
                  }}
                />
                <span style={{
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#64748B'
                }}>
                  Active Team
                </span>
              </label>
              <p style={{
                fontSize: '12px',
                color: '#94A3B8',
                marginTop: '4px',
                marginLeft: '24px'
              }}>
                Inactive teams cannot be assigned to pilots or used in permissions
              </p>
            </div>
          )}

          {/* Designation Field (Wings and Squadrons) */}
          {(entityType === 'wing' || entityType === 'squadron') && (
            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: 500,
                color: '#64748B'
              }}>
                Designation {entityType === 'squadron' ? '*' : ''}
              </label>
              <input
                type="text"
                value={formData.designation}
                onChange={(e) => handleInputChange('designation', e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: `1px solid ${errors.designation ? '#EF4444' : '#CBD5E1'}`,
                  borderRadius: '4px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  height: '35px',
                  lineHeight: '19px'
                }}
                placeholder={`Enter ${entityType} designation`}
              />
              {errors.designation && (
                <div style={{
                  color: '#EF4444',
                  fontSize: '12px',
                  marginTop: '4px'
                }}>
                  {errors.designation}
                </div>
              )}
            </div>
          )}

          {/* Parent Entity Selection */}
          {entityType === 'group' && (
            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: 500,
                color: '#64748B'
              }}>
                Command *
              </label>
              <select
                value={formData.command_id}
                onChange={(e) => handleInputChange('command_id', e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: `1px solid ${errors.command_id ? '#EF4444' : '#CBD5E1'}`,
                  borderRadius: '4px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  height: '35px',
                  backgroundColor: 'white'
                }}
              >
                <option value="">Select a command</option>
                {commands.map(command => (
                  <option key={command.id} value={command.id}>
                    {command.name}
                  </option>
                ))}
              </select>
              {errors.command_id && (
                <div style={{
                  color: '#EF4444',
                  fontSize: '12px',
                  marginTop: '4px'
                }}>
                  {errors.command_id}
                </div>
              )}
            </div>
          )}

          {entityType === 'wing' && (
            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: 500,
                color: '#64748B'
              }}>
                Group (Optional)
              </label>
              <select
                value={formData.group_id}
                onChange={(e) => handleInputChange('group_id', e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #CBD5E1',
                  borderRadius: '4px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  height: '35px',
                  backgroundColor: 'white'
                }}
              >
                <option value="">No group (detached unit)</option>
                {groups.map(group => (
                  <option key={group.id} value={group.id}>
                    {group.name} ({group.command?.name || 'No command'})
                  </option>
                ))}
              </select>
            </div>
          )}

          {entityType === 'squadron' && (
            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: 500,
                color: '#64748B'
              }}>
                Wing *
              </label>
              <select
                value={formData.wing_id}
                onChange={(e) => handleInputChange('wing_id', e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: `1px solid ${errors.wing_id ? '#EF4444' : '#CBD5E1'}`,
                  borderRadius: '4px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  height: '35px',
                  backgroundColor: 'white'
                }}
              >
                <option value="">Select a wing</option>
                {wings.map(wing => (
                  <option key={wing.id} value={wing.id}>
                    {wing.name} {wing.designation ? `(${wing.designation})` : ''}
                  </option>
                ))}
              </select>
              {errors.wing_id && (
                <div style={{
                  color: '#EF4444',
                  fontSize: '12px',
                  marginTop: '4px'
                }}>
                  {errors.wing_id}
                </div>
              )}
            </div>
          )}

          {/* Timezone Field (Squadrons only) */}
          {entityType === 'squadron' && (
            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: 500,
                color: '#64748B'
              }}>
                Reference Timezone
              </label>
              <select
                value={formData.timezone}
                onChange={(e) => handleInputChange('timezone', e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #CBD5E1',
                  borderRadius: '4px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  height: '35px',
                  backgroundColor: 'white'
                }}
              >
                {TIMEZONE_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Tail Code and Insignia Grid (Wings and Squadrons) */}
          {(entityType === 'wing' || entityType === 'squadron') && (
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: '150px 150px 1fr', 
              gap: '16px', 
              marginBottom: '16px' 
            }}>
              {/* Tail Code */}
              <div>
                <label style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#64748B'
                }}>
                  Tail Code
                </label>
                <input
                  type="text"
                  value={formData.tail_code}
                  onChange={(e) => handleInputChange('tail_code', e.target.value.toUpperCase())}
                  style={{
                    width: '150px',
                    padding: '16px',
                    border: `1px solid ${errors.tail_code ? '#EF4444' : '#CBD5E1'}`,
                    borderRadius: '8px',
                    fontSize: '96px',
                    boxSizing: 'border-box',
                    height: '150px',
                    lineHeight: '64px',
                    textAlign: 'center',
                    fontFamily: "'USN Stencil', 'Courier New', monospace",
                    fontWeight: 'normal',
                    letterSpacing: '1px',
                    textTransform: 'uppercase',
                    backgroundColor: '#9DA6AA',
                    color: '#575A58'
                  }}
                  placeholder="NK"
                  maxLength={2}
                />
                {errors.tail_code && (
                  <div style={{
                    color: '#EF4444',
                    fontSize: '12px',
                    marginTop: '4px'
                  }}>
                    {errors.tail_code}
                  </div>
                )}
              </div>
              
              {/* Insignia Image */}
              <div>
                <label style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#64748B'
                }}>
                  Insignia
                </label>
                
                <div
                  onDrop={handleDrop}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  style={{
                    border: `2px dashed ${dragOver ? '#2563EB' : '#CBD5E1'}`,
                    borderRadius: '8px',
                    padding: '16px',
                    textAlign: 'center',
                    backgroundColor: dragOver ? '#EFF6FF' : (formData.insignia_url ? '#9DA6AA' : '#F8FAFC'),
                    cursor: uploadingImage ? 'wait' : 'pointer',
                    transition: 'all 0.2s ease',
                    height: '150px',
                    width: '150px',
                    boxSizing: 'border-box',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center'
                  }}
                  onClick={() => {
                    if (!uploadingImage) {
                      document.getElementById('insignia-file-input')?.click();
                    }
                  }}
                >
                  {uploadingImage ? (
                    <Upload size={32} color="#64748B" />
                  ) : formData.insignia_url ? (
                    <img 
                      src={formData.insignia_url} 
                      alt="Insignia preview" 
                      style={{ 
                        maxWidth: '100%', 
                        maxHeight: '150px', 
                        objectFit: 'contain'
                      }} 
                    />
                  ) : (
                    <Upload size={32} color="#64748B" />
                  )}
                </div>
                
                {/* Hint text below drag/drop area */}
                <div style={{ 
                  marginTop: '8px', 
                  textAlign: 'center',
                  width: '150px'
                }}>
                  {uploadingImage ? (
                    <p style={{ color: '#64748B', fontSize: '14px', margin: 0 }}>
                      Uploading image...
                    </p>
                  ) : formData.insignia_url ? (
                    <p style={{ color: '#64748B', fontSize: '12px', margin: 0 }}>
                      Click or drag to replace
                    </p>
                  ) : (
                    <>
                      <p style={{ color: '#64748B', fontSize: '12px', margin: '0 0 2px 0' }}>
                        Drag & drop image here or click to browse
                      </p>
                      <p style={{ color: '#94A3B8', fontSize: '12px', margin: 0 }}>
                        PNG, JPG, or SVG up to 500KB
                      </p>
                    </>
                  )}
                </div>
                
                {/* Hidden file input */}
                <input
                  id="insignia-file-input"
                  type="file"
                  accept="image/*"
                  onChange={handleFileInputChange}
                  style={{ display: 'none' }}
                />
                
                {errors.insignia_url && (
                  <div style={{
                    color: '#EF4444',
                    fontSize: '12px',
                    marginTop: '4px'
                  }}>
                    {errors.insignia_url}
                  </div>
                )}
              </div>
              
              {/* Color Palette */}
              <div>
                <label style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#64748B'
                }}>
                  Colors
                </label>
                
                <div style={{
                  border: '1px solid #CBD5E1',
                  borderRadius: '8px',
                  padding: '12px',
                  backgroundColor: '#F8FAFC',
                  height: '150px',
                  width: '100%',
                  boxSizing: 'border-box',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center'
                }}>
                  {/* Color inputs */}
                  {[
                    { key: 'neutral_light', label: 'Neutral Light', defaultColor: '#F8FAFC' },
                    { key: 'neutral_dark', label: 'Neutral Dark', defaultColor: '#1E293B' },
                    { key: 'primary', label: 'Primary', defaultColor: '#2563EB' },
                    { key: 'secondary', label: 'Secondary', defaultColor: '#64748B' },
                    { key: 'accent', label: 'Accent', defaultColor: '#059669' }
                  ].map((colorField, index) => (
                    <div key={colorField.key} style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '6px',
                      marginBottom: index < 4 ? '6px' : '0'
                    }}>
                      <div
                        style={{
                          width: '16px',
                          height: '16px',
                          borderRadius: '3px',
                          backgroundColor: formData.color_palette?.[colorField.key] || colorField.defaultColor,
                          border: '1px solid #CBD5E1',
                          flexShrink: 0
                        }}
                      />
                      <input
                        type="text"
                        value={(formData.color_palette?.[colorField.key] || colorField.defaultColor).replace('#', '')}
                        onChange={(e) => {
                          const value = e.target.value.replace(/[^0-9A-Fa-f]/g, '').slice(0, 6);
                          const newPalette = {
                            ...formData.color_palette,
                            [colorField.key]: value ? `#${value}` : colorField.defaultColor
                          };
                          handleInputChange('color_palette', newPalette);
                        }}
                        placeholder="000000"
                        maxLength={6}
                        style={{
                          width: '55px',
                          padding: '2px 4px',
                          border: '1px solid #CBD5E1',
                          borderRadius: '3px',
                          fontSize: '10px',
                          fontFamily: 'monospace',
                          textTransform: 'uppercase'
                        }}
                      />
                      <span style={{
                        fontSize: '10px',
                        color: '#64748B',
                        fontWeight: 400,
                        flex: 1
                      }}>
                        {colorField.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Established Date */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontSize: '14px',
              fontWeight: 500,
              color: '#64748B'
            }}>
              Established Date
            </label>
            <input
              type="date"
              value={formData.established_date}
              onChange={(e) => handleInputChange('established_date', e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #CBD5E1',
                borderRadius: '4px',
                fontSize: '14px',
                boxSizing: 'border-box',
                height: '35px',
                backgroundColor: 'white'
              }}
            />
          </div>

          {/* Deactivated Date */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontSize: '14px',
              fontWeight: 500,
              color: '#64748B'
            }}>
              Deactivated Date
            </label>
            <input
              type="date"
              value={formData.deactivated_date}
              onChange={(e) => handleInputChange('deactivated_date', e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                border: `1px solid ${errors.deactivated_date ? '#EF4444' : '#CBD5E1'}`,
                borderRadius: '4px',
                fontSize: '14px',
                boxSizing: 'border-box',
                height: '35px',
                backgroundColor: 'white'
              }}
            />
            {errors.deactivated_date && (
              <div style={{
                color: '#EF4444',
                fontSize: '12px',
                marginTop: '4px'
              }}>
                {errors.deactivated_date}
              </div>
            )}
          </div>


          {/* Squadron Airframe */}
          {entityType === 'squadron' && (
            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: 500,
                color: '#64748B'
              }}>
                Airframe
              </label>
              <select
                value={formData.airframe_id}
                onChange={(e) => handleInputChange('airframe_id', e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #CBD5E1',
                  borderRadius: '4px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  height: '35px',
                  backgroundColor: 'white'
                }}
              >
                <option value="">Select an airframe...</option>
                {aircraftTypes.map(type => (
                  <option key={type.id} value={type.id}>
                    {type.designation} - {type.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Squadron Callsigns */}
          {entityType === 'squadron' && (
            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: 500,
                color: '#64748B'
              }}>
                Callsigns
              </label>
              
              {/* Callsign input */}
              <div style={{ 
                display: 'flex', 
                gap: '8px', 
                marginBottom: '12px' 
              }}>
                <input
                  type="text"
                  value={newCallsign}
                  onChange={(e) => setNewCallsign(e.target.value)}
                  onKeyPress={handleCallsignKeyPress}
                  style={{
                    flex: 1,
                    padding: '8px',
                    border: '1px solid #CBD5E1',
                    borderRadius: '4px',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                    height: '35px'
                  }}
                  placeholder="Enter callsign (e.g., VIPER, EAGLE)"
                />
                <button
                  type="button"
                  onClick={addCallsign}
                  disabled={!newCallsign.trim()}
                  style={{
                    padding: '8px 16px',
                    border: 'none',
                    borderRadius: '4px',
                    backgroundColor: newCallsign.trim() ? '#2563EB' : '#CBD5E1',
                    color: 'white',
                    cursor: newCallsign.trim() ? 'pointer' : 'not-allowed',
                    fontSize: '14px',
                    height: '35px'
                  }}
                >
                  Add
                </button>
              </div>
              
              {/* Callsigns tags */}
              {callsignsList.length > 0 && (
                <div style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '8px',
                  padding: '8px',
                  border: '1px solid #E2E8F0',
                  borderRadius: '4px',
                  backgroundColor: '#F8FAFC',
                  minHeight: '32px',
                  alignItems: 'center'
                }}>
                  {callsignsList.map((callsign, index) => (
                    <div
                      key={index}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '0 8px',
                        backgroundColor: formData.color_palette?.accent || '#2563EB',
                        color: 'white',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: 400,
                        height: '24px'
                      }}
                    >
                      <span>{callsign}</span>
                      <button
                        type="button"
                        onClick={() => removeCallsign(index)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'white',
                          cursor: 'pointer',
                          fontSize: '14px',
                          lineHeight: 1,
                          padding: '0',
                          display: 'flex',
                          alignItems: 'center'
                        }}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              
              <p style={{ 
                color: '#94A3B8', 
                fontSize: '12px', 
                marginTop: '4px' 
              }}>
                Add callsigns for this squadron. Press Enter or click Add.
              </p>
              
              {errors.callsigns && (
                <div style={{
                  color: '#EF4444',
                  fontSize: '12px',
                  marginTop: '4px'
                }}>
                  {errors.callsigns}
                </div>
              )}
            </div>
          )}
          </div>
          )}

          {/* Discord Tab Content */}
          {entityType === 'squadron' && activeTab === 'discord' && (
            <SquadronDiscordSettings
              discordChannels={getCurrentDiscordSettings().discordChannels}
              roleMappings={getCurrentDiscordSettings().roleMappings}
              selectedGuildId={getCurrentDiscordSettings().selectedGuildId}
              emoji={getCurrentDiscordSettings().emoji}
              threadingSettings={getCurrentDiscordSettings().threadingSettings}
              defaultNotificationRoles={getCurrentDiscordSettings().defaultNotificationRoles}
              onChannelsChange={(channels) => updateDiscordSettings({ discordChannels: channels })}
              onRoleMappingsChange={(mappings) => updateDiscordSettings({ roleMappings: mappings })}
              onGuildChange={(guildId) => updateDiscordSettings({
                selectedGuildId: guildId,
                discordChannels: [], // Clear channels when server changes
                roleMappings: [] // Clear role mappings when server changes
              })}
              onEmojiChange={(emoji) => updateDiscordSettings({ emoji })}
              onThreadingSettingsChange={(threadingSettings) => updateDiscordSettings({ threadingSettings })}
              onDefaultNotificationRolesChange={(roles) => updateDiscordSettings({ defaultNotificationRoles: roles })}
            />
          )}

          {/* Teams Tab Content */}
          {(entityType === 'wing' || entityType === 'squadron') && activeTab === 'teams' && (
            <div>
              <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <p style={{ fontSize: '14px', color: '#64748B', margin: 0 }}>
                  Manage teams scoped to this {entityType}
                </p>
                <button
                  onClick={handleCreateTeam}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#3B82F6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '14px',
                    cursor: 'pointer',
                    fontWeight: 500
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#2563EB'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#3B82F6'}
                >
                  + New Team
                </button>
              </div>

              {loadingTeams ? (
                <div style={{ textAlign: 'center', padding: '32px', color: '#64748B' }}>
                  Loading teams...
                </div>
              ) : teams.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px', color: '#64748B' }}>
                  No teams created for this {entityType} yet
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {teams.map(team => (
                    <div
                      key={team.id}
                      style={{
                        padding: '12px',
                        border: '1px solid #E2E8F0',
                        borderRadius: '6px',
                        backgroundColor: team.active ? '#FFFFFF' : '#F9FAFB',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '14px', fontWeight: 500, color: '#0F172A' }}>
                            {team.name}
                          </span>
                          {!team.active && (
                            <span style={{
                              fontSize: '11px',
                              color: '#DC2626',
                              backgroundColor: '#FEE2E2',
                              padding: '2px 6px',
                              borderRadius: '4px'
                            }}>
                              Inactive
                            </span>
                          )}
                        </div>
                        {team.description && (
                          <p style={{ fontSize: '12px', color: '#64748B', margin: '4px 0 0 0' }}>
                            {team.description}
                          </p>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button
                          onClick={() => handleEditTeam(team)}
                          style={{
                            padding: '6px',
                            border: 'none',
                            borderRadius: '4px',
                            backgroundColor: 'transparent',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F1F5F9'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                          <Edit size={14} color="#64748B" />
                        </button>
                        <button
                          onClick={() => handleDeleteTeam(team.id)}
                          style={{
                            padding: '6px',
                            border: 'none',
                            borderRadius: '4px',
                            backgroundColor: 'transparent',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#FEE2E2'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                          <Trash size={14} color="#EF4444" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Team Form Dialog */}
              {showTeamForm && (
                <div
                  style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 10000
                  }}
                  onClick={() => setShowTeamForm(false)}
                >
                  <div
                    style={{
                      backgroundColor: '#FFFFFF',
                      borderRadius: '8px',
                      padding: '24px',
                      width: '500px',
                      boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)'
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '20px', color: '#0F172A' }}>
                      {editingTeam ? 'Edit Team' : 'Create New Team'}
                    </h3>

                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#64748B', marginBottom: '8px' }}>
                        Team Name *
                      </label>
                      <input
                        type="text"
                        value={teamFormData.name}
                        onChange={(e) => setTeamFormData({ ...teamFormData, name: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          border: '1px solid #D1D5DB',
                          borderRadius: '6px',
                          fontSize: '14px',
                          boxSizing: 'border-box'
                        }}
                        placeholder="Enter team name"
                      />
                    </div>

                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#64748B', marginBottom: '8px' }}>
                        Description
                      </label>
                      <textarea
                        value={teamFormData.description}
                        onChange={(e) => setTeamFormData({ ...teamFormData, description: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          border: '1px solid #D1D5DB',
                          borderRadius: '6px',
                          fontSize: '14px',
                          boxSizing: 'border-box',
                          minHeight: '80px',
                          resize: 'vertical',
                          fontFamily: 'Inter, sans-serif'
                        }}
                        placeholder="Enter team description (optional)"
                      />
                    </div>

                    <div style={{ marginBottom: '24px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={teamFormData.active}
                          onChange={(e) => setTeamFormData({ ...teamFormData, active: e.target.checked })}
                          style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                        />
                        <span style={{ fontSize: '14px', fontWeight: 500, color: '#64748B' }}>
                          Active Team
                        </span>
                      </label>
                    </div>

                    <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => setShowTeamForm(false)}
                        style={{
                          padding: '8px 16px',
                          backgroundColor: '#FFFFFF',
                          color: '#6B7280',
                          border: '1px solid #D1D5DB',
                          borderRadius: '6px',
                          fontSize: '14px',
                          cursor: 'pointer'
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveTeam}
                        disabled={!teamFormData.name.trim()}
                        style={{
                          padding: '8px 16px',
                          backgroundColor: !teamFormData.name.trim() ? '#9CA3AF' : '#3B82F6',
                          color: '#FFFFFF',
                          border: 'none',
                          borderRadius: '6px',
                          fontSize: '14px',
                          cursor: !teamFormData.name.trim() ? 'not-allowed' : 'pointer'
                        }}
                      >
                        {editingTeam ? 'Save' : 'Create'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: '8px',
          padding: '16px 24px',
          borderTop: '1px solid #E2E8F0'
        }}>
          {/* Left side - Deactivate button (only in edit mode for active entities) */}
          <div>
            {mode === 'edit' && entity && !entity.deactivated_date && (
              <button
                onClick={() => setShowDeactivateConfirm(true)}
                style={{
                  padding: '8px 16px',
                  border: '1px solid #DC2626',
                  borderRadius: '4px',
                  backgroundColor: 'white',
                  color: '#DC2626',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                Deactivate {entityType.charAt(0).toUpperCase() + entityType.slice(1)}
              </button>
            )}
          </div>
          
          {/* Right side - Cancel and Save buttons */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={onClose}
              style={{
                padding: '8px 16px',
                border: '1px solid #CBD5E1',
                borderRadius: '4px',
                backgroundColor: 'white',
                color: '#64748B',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              style={{
                padding: '8px 16px',
                border: 'none',
                borderRadius: '4px',
                backgroundColor: '#2563EB',
                color: 'white',
                cursor: 'pointer',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <Save size={16} />
              {mode === 'create' ? 'Create' : 'Save'}
            </button>
          </div>
        </div>
        
        {/* Deactivate Confirmation Dialog */}
        {showDeactivateConfirm && (
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1
          }}>
            <div style={{
              backgroundColor: 'white',
              padding: '24px',
              borderRadius: '8px',
              boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25)',
              maxWidth: '400px',
              width: '90%'
            }}>
              <h3 style={{
                fontSize: '18px',
                fontWeight: 600,
                color: '#0F172A',
                marginBottom: '16px'
              }}>
                Confirm Deactivation
              </h3>
              <p style={{
                fontSize: '14px',
                color: '#64748B',
                marginBottom: '24px',
                lineHeight: '1.5'
              }}>
                Are you sure you want to deactivate this {entityType}? This action will set the deactivated date to today and cannot be easily undone.
              </p>
              <div style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '8px'
              }}>
                <button
                  onClick={() => setShowDeactivateConfirm(false)}
                  style={{
                    padding: '8px 16px',
                    border: '1px solid #CBD5E1',
                    borderRadius: '4px',
                    backgroundColor: 'white',
                    color: '#64748B',
                    cursor: 'pointer',
                    fontSize: '14px'
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeactivate}
                  style={{
                    padding: '8px 16px',
                    border: 'none',
                    borderRadius: '4px',
                    backgroundColor: '#DC2626',
                    color: 'white',
                    cursor: 'pointer',
                    fontSize: '14px'
                  }}
                >
                  Deactivate
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default OrgEntityModal;