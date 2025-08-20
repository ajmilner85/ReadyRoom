import React, { useState, useEffect } from 'react';
import { Card } from '../ui/card';
import { AlertCircle, Plus, Edit, Trash, Check, X, ToggleLeft, ToggleRight, Lock, Unlock, GripVertical, Clock, ArrowRight } from 'lucide-react';
import { Status, getAllStatuses, createStatus, updateStatus, deleteStatus, getStatusUsageCount, initializeDefaultStatuses } from '../../utils/statusService';
import { Standing, getAllStandings, createStanding, updateStanding, deleteStanding } from '../../utils/standingService';
import { Role, getAllRoles, createRole, updateRole, deleteRole, getRoleUsageCount, initializeDefaultRoles } from '../../utils/roleService';
import { Qualification, getAllQualifications, createQualification, updateQualification, deleteQualification, getQualificationUsageCount, initializeDefaultQualifications, archiveQualification } from '../../utils/qualificationService';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { CSS } from '@dnd-kit/utilities';

interface RosterSettingsProps {
  error?: string | null;
  setError?: (error: string | null) => void;
}

const RosterSettings: React.FC<RosterSettingsProps> = ({ error, setError }) => {
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  
  // Status management state
  const [newStatusName, setNewStatusName] = useState('');
  const [newStatusIsActive, setNewStatusIsActive] = useState(true);
  const [isAddingStatus, setIsAddingStatus] = useState(false);
  const [editingStatusId, setEditingStatusId] = useState<string | null>(null);
  const [editingStatusName, setEditingStatusName] = useState('');
  const [editingStatusIsActive, setEditingStatusIsActive] = useState(true);
  const [statusUsage, setStatusUsage] = useState<Record<string, number>>({});

  // Standing management state
  const [standings, setStandings] = useState<Standing[]>([]);
  const [newStandingName, setNewStandingName] = useState('');
  const [isAddingStanding, setIsAddingStanding] = useState(false);
  const [editingStandingId, setEditingStandingId] = useState<string | null>(null);
  const [editingStandingName, setEditingStandingName] = useState('');
  const [standingUsage, setStandingUsage] = useState<Record<string, number>>({});

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

  // Helper to set errors with parent component if available
  const setErrorMessage = (message: string | null) => {
    setLocalError(message);
    if (setError) {
      setError(message);
    }
  };

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
        setErrorMessage(err.message);
        console.error('Error fetching statuses:', err);
      } finally {
        setLoading(false);
      }
    };

    const fetchStandings = async () => {
      try {
        const { data, error } = await getAllStandings();
        
        if (error) {
          throw new Error(error.message);
        }
        
        if (data) {
          setStandings(data);
          
          // TODO: Add usage count for standings when pilot_standings relationship is established
          const usageCounts: Record<string, number> = {};
          for (const standing of data) {
            usageCounts[standing.id] = 0; // Placeholder until we have usage counting
          }
          setStandingUsage(usageCounts);
        }
      } catch (err: any) {
        setLocalError(err.message);
        console.error('Error fetching standings:', err);
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
        setErrorMessage(err.message);
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
        setErrorMessage(err.message);
        console.error('Error fetching qualifications:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchStatuses();
    fetchStandings();
    fetchRoles();
    fetchQualifications();
  }, [setError]);

  // Status management functions
  const handleAddStatus = async () => {
    if (!newStatusName.trim()) {
      setErrorMessage('Status name cannot be empty');
      return;
    }
    
    setLoading(true);
    try {
      // Get the highest order number and add 10
      const highestOrder = statuses.length > 0 
        ? Math.max(...statuses.map(s => s.order))
        : 0;
        
      const { data, error: createError } = await createStatus({
        name: newStatusName.trim(),
        isActive: newStatusIsActive,
        order: highestOrder + 10
      });
      
      if (createError) {
        throw new Error(createError.message);
      }
      
      if (data) {
        setStatuses([...statuses, data]);
        setStatusUsage({ ...statusUsage, [data.id]: 0 });
        setNewStatusName('');
        setNewStatusIsActive(true);
        setIsAddingStatus(false);
      }
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Toggle status active/inactive
  const handleToggleStatusActive = async (status: Status) => {
    setLoading(true);
    try {
      const { data, error: updateError } = await updateStatus(status.id, {
        isActive: !status.isActive
      });
      
      if (updateError) {
        throw new Error(updateError.message);
      }
      
      if (data) {
        setStatuses(statuses.map(s => s.id === status.id ? data : s));
      }
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Start editing a status
  const handleStartEditStatus = (status: Status) => {
    setEditingStatusId(status.id);
    setEditingStatusName(status.name);
    setEditingStatusIsActive(status.isActive);
  };

  // Cancel editing a status
  const handleCancelEditStatus = () => {
    setEditingStatusId(null);
    setEditingStatusName('');
    setEditingStatusIsActive(true);
  };

  // Save status changes
  const handleSaveStatus = async () => {
    if (!editingStatusId || !editingStatusName.trim()) {
      setErrorMessage('Status name cannot be empty');
      return;
    }
    
    setLoading(true);
    try {
      const { data, error: updateError } = await updateStatus(editingStatusId, {
        name: editingStatusName.trim(),
        isActive: editingStatusIsActive
      });
      
      if (updateError) {
        throw new Error(updateError.message);
      }
      
      if (data) {
        setStatuses(statuses.map(s => s.id === editingStatusId ? data : s));
        setEditingStatusId(null);
        setEditingStatusName('');
        setEditingStatusIsActive(true);
      }
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Delete a status
  const handleDeleteStatus = async (status: Status) => {
    // Check if the status is in use
    if (statusUsage[status.id] > 0) {
      setErrorMessage(`Cannot delete status "${status.name}" because it is assigned to ${statusUsage[status.id]} pilots`);
      return;
    }
    
    setLoading(true);
    try {
      const { success, error: deleteError } = await deleteStatus(status.id);
      
      if (deleteError) {
        throw new Error(deleteError.message);
      }
      
      if (success) {
        setStatuses(statuses.filter(s => s.id !== status.id));
        // Remove from usage counts
        const newUsage = { ...statusUsage };
        delete newUsage[status.id];
        setStatusUsage(newUsage);
      }
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Standing management functions
  const handleAddStanding = async () => {
    if (!newStandingName.trim()) {
      setLocalError('Standing name cannot be empty');
      return;
    }
    
    setLoading(true);
    try {
      // Get the highest order number and add 10
      const highestOrder = standings.length > 0 
        ? Math.max(...standings.map(s => s.order))
        : 0;
        
      const { data, error: createError } = await createStanding({
        name: newStandingName.trim(),
        order: highestOrder + 10
      });
      
      if (createError) {
        throw new Error(createError.message);
      }
      
      if (data) {
        setStandings([...standings, data]);
        setStandingUsage({ ...standingUsage, [data.id]: 0 });
        setNewStandingName('');
        setIsAddingStanding(false);
      }
    } catch (err: any) {
      setLocalError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Start editing a standing
  const handleStartEditStanding = (standing: Standing) => {
    setEditingStandingId(standing.id);
    setEditingStandingName(standing.name);
  };

  // Cancel editing a standing
  const handleCancelEditStanding = () => {
    setEditingStandingId(null);
    setEditingStandingName('');
  };

  // Save standing changes
  const handleSaveStanding = async () => {
    if (!editingStandingName.trim()) {
      setLocalError('Standing name cannot be empty');
      return;
    }
    
    if (!editingStandingId) return;
    
    setLoading(true);
    try {
      const { data, error: updateError } = await updateStanding(editingStandingId, {
        name: editingStandingName.trim()
      });
      
      if (updateError) {
        throw new Error(updateError.message);
      }
      
      if (data) {
        setStandings(standings.map(s => s.id === editingStandingId ? data : s));
        setEditingStandingId(null);
        setEditingStandingName('');
      }
    } catch (err: any) {
      setLocalError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Delete a standing
  const handleDeleteStanding = async (standingId: string) => {
    const usageCount = standingUsage[standingId] || 0;
    if (usageCount > 0) {
      setLocalError(`Cannot delete standing: ${usageCount} pilot(s) currently assigned.`);
      return;
    }
    
    if (!confirm('Are you sure you want to delete this standing?')) {
      return;
    }
    
    setLoading(true);
    try {
      const { error: deleteError } = await deleteStanding(standingId);
      
      if (deleteError) {
        throw new Error(deleteError.message);
      }
      
      setStandings(standings.filter(s => s.id !== standingId));
      const newStandingUsage = { ...standingUsage };
      delete newStandingUsage[standingId];
      setStandingUsage(newStandingUsage);
    } catch (err: any) {
      setLocalError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Role management functions
  const refreshRoleUsageCounts = async () => {
    // Get usage count for each role
    const usageCounts: Record<string, number> = {};
    for (const role of roles) {
      const { count, error: usageError } = await getRoleUsageCount(role.id);
      if (!usageError) {
        usageCounts[role.id] = count;
      }
    }
    setRoleUsage(usageCounts);
  };

  const handleAddRole = async () => {
    if (!newRoleName.trim()) {
      setErrorMessage('Role name cannot be empty');
      return;
    }
    
    setLoading(true);
    try {
      // Get the highest order number and add 10
      const highestOrder = roles.length > 0 
        ? Math.max(...roles.map(r => r.order))
        : 0;
        
      const { data, error: createError } = await createRole({
        name: newRoleName.trim(),
        isExclusive: newRoleIsExclusive,
        compatible_statuses: newRoleCompatibleStatuses,
        order: highestOrder + 10
      });
      
      if (createError) {
        throw new Error(createError.message);
      }
      
      if (data) {
        setRoles([...roles, data]);
        setRoleUsage({ ...roleUsage, [data.id]: 0 });
        setNewRoleName('');
        setNewRoleIsExclusive(false);
        setNewRoleCompatibleStatuses([]);
        setIsAddingRole(false);
        await refreshRoleUsageCounts();
      }
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleRoleExclusive = async (role: Role) => {
    setLoading(true);
    try {
      const { data, error: updateError } = await updateRole(role.id, {
        isExclusive: !role.isExclusive
      });
      
      if (updateError) {
        throw new Error(updateError.message);
      }
      
      if (data) {
        setRoles(roles.map(r => r.id === role.id ? data : r));
        await refreshRoleUsageCounts();
      }
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleStartEditRole = (role: Role) => {
    setEditingRoleId(role.id);
    setEditingRoleName(role.name);
    setEditingRoleIsExclusive(role.isExclusive);
    setEditingRoleCompatibleStatuses([...role.compatible_statuses]);
  };

  const handleCancelEditRole = () => {
    setEditingRoleId(null);
    setEditingRoleName('');
    setEditingRoleIsExclusive(false);
    setEditingRoleCompatibleStatuses([]);
  };

  const handleSaveRole = async () => {
    if (!editingRoleId || !editingRoleName.trim()) {
      setErrorMessage('Role name cannot be empty');
      return;
    }
    
    setLoading(true);
    try {
      const { data, error: updateError } = await updateRole(editingRoleId, {
        name: editingRoleName.trim(),
        isExclusive: editingRoleIsExclusive,
        compatible_statuses: editingRoleCompatibleStatuses
      });
      
      if (updateError) {
        throw new Error(updateError.message);
      }
      
      if (data) {
        setRoles(roles.map(r => r.id === editingRoleId ? data : r));
        setEditingRoleId(null);
        setEditingRoleName('');
        setEditingRoleIsExclusive(false);
        setEditingRoleCompatibleStatuses([]);
        await refreshRoleUsageCounts();
      }
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRole = async (role: Role) => {
    // Check if the role is in use
    if (roleUsage[role.id] > 0) {
      setErrorMessage(`Cannot delete role "${role.name}" because it is assigned to ${roleUsage[role.id]} pilots`);
      return;
    }
    
    setLoading(true);
    try {
      const { success, error: deleteError } = await deleteRole(role.id);
      
      if (deleteError) {
        throw new Error(deleteError.message);
      }
      
      if (success) {
        setRoles(roles.filter(r => r.id !== role.id));
        // Remove from usage counts
        const newUsage = { ...roleUsage };
        delete newUsage[role.id];
        setRoleUsage(newUsage);
        await refreshRoleUsageCounts();
      }
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleCompatibleStatus = (statusId: string, isNewRole: boolean = false) => {
    if (isNewRole) {
      // For new role
      if (newRoleCompatibleStatuses.includes(statusId)) {
        setNewRoleCompatibleStatuses(newRoleCompatibleStatuses.filter(id => id !== statusId));
      } else {
        setNewRoleCompatibleStatuses([...newRoleCompatibleStatuses, statusId]);
      }
    } else {
      // For editing role
      if (editingRoleCompatibleStatuses.includes(statusId)) {
        setEditingRoleCompatibleStatuses(editingRoleCompatibleStatuses.filter(id => id !== statusId));
      } else {
        setEditingRoleCompatibleStatuses([...editingRoleCompatibleStatuses, statusId]);
      }
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      // Update the local state first for immediate UI feedback
      let updatedRoles: Role[] = [];
      
      setRoles((prevRoles) => {
        const oldIndex = prevRoles.findIndex((role) => role.id === active.id);
        const newIndex = prevRoles.findIndex((role) => role.id === over.id);
        
        const newRoles = arrayMove(prevRoles, oldIndex, newIndex);
        
        // Update the order values to be sequential: 1, 2, 3, etc.
        updatedRoles = newRoles.map((role, index) => ({
          ...role,
          order: index + 1
        }));
        
        return updatedRoles;
      });
      
      // Then update the database
      try {
        setReorderingRoles(true);
        
        // Update each role's order in the database
        const promises = updatedRoles.map(role => 
          updateRole(role.id, { order: role.order })
        );
        
        await Promise.all(promises);
        await refreshRoleUsageCounts();
      } catch (err: any) {
        setErrorMessage(err.message);
        console.error('Error updating role orders:', err);
      } finally {
        setReorderingRoles(false);
      }
    }
  };

  // Qualification management functions
  const refreshQualificationUsageCounts = async () => {
    // Get usage count for each qualification
    const usageCounts: Record<string, number> = {};
    for (const qualification of qualifications) {
      const { count, error: usageError } = await getQualificationUsageCount(qualification.id);
      if (!usageError) {
        usageCounts[qualification.id] = count;
      }
    }
    setQualificationUsage(usageCounts);
  };

  const handleAddQualification = async () => {
    if (!newQualificationName.trim()) {
      setErrorMessage('Qualification name cannot be empty');
      return;
    }

    if (!newQualificationCode.trim()) {
      setErrorMessage('Qualification code cannot be empty');
      return;
    }
    
    setLoading(true);
    try {
      let parsedRequirements = {};
      try {
        parsedRequirements = JSON.parse(newQualificationRequirements);
      } catch (err) {
        setErrorMessage('Invalid JSON in requirements field');
        setLoading(false);
        return;
      }

      const newQualification = {
        name: newQualificationName.trim(),
        code: newQualificationCode.trim(),
        category: newQualificationCategory.trim() || null,
        requirements: parsedRequirements,
        is_expirable: newQualificationIsExpirable,
        validity_period: newQualificationIsExpirable ? newQualificationValidityPeriod : null,
        active: newQualificationActive,
        color: newQualificationColor // Include color property
      };
      
      const { data, error: createError } = await createQualification(newQualification);
      
      if (createError) {
        throw new Error(createError.message);
      }
      
      if (data) {
        setQualifications([...qualifications, data]);
        setQualificationUsage({ ...qualificationUsage, [data.id]: 0 });
        
        // Reset form
        setNewQualificationName('');
        setNewQualificationCode('');
        setNewQualificationCategory('');
        setNewQualificationRequirements('{}');
        setNewQualificationIsExpirable(false);
        setNewQualificationValidityPeriod(null);
        setNewQualificationActive(true);
        setNewQualificationColor('#646F7E'); // Reset to default color
        setIsAddingQualification(false);
      }
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleStartEditQualification = (qualification: Qualification) => {
    setEditingQualificationId(qualification.id);
    setEditingQualificationName(qualification.name);
    setEditingQualificationCode(qualification.code);
    setEditingQualificationCategory(qualification.category || '');
    setEditingQualificationRequirements(JSON.stringify(qualification.requirements, null, 2));
    setEditingQualificationIsExpirable(qualification.is_expirable);
    setEditingQualificationValidityPeriod(qualification.validity_period);
    setEditingQualificationActive(qualification.active);
    setEditingQualificationColor(qualification.color || '#646F7E');
  };

  const handleCancelEditQualification = () => {
    setEditingQualificationId(null);
    setEditingQualificationName('');
    setEditingQualificationCode('');
    setEditingQualificationCategory('');
    setEditingQualificationRequirements('{}');
    setEditingQualificationIsExpirable(false);
    setEditingQualificationValidityPeriod(null);
    setEditingQualificationActive(true);
    setEditingQualificationColor('#646F7E');
  };

  const handleSaveQualification = async () => {
    if (!editingQualificationId) {
      return;
    }
    
    if (!editingQualificationName.trim()) {
      setErrorMessage('Qualification name cannot be empty');
      return;
    }

    if (!editingQualificationCode.trim()) {
      setErrorMessage('Qualification code cannot be empty');
      return;
    }
    
    setLoading(true);
    try {
      let parsedRequirements = {};
      try {
        parsedRequirements = JSON.parse(editingQualificationRequirements);
      } catch (err) {
        setErrorMessage('Invalid JSON in requirements field');
        setLoading(false);
        return;
      }

      const updatedQualification = {
        name: editingQualificationName.trim(),
        code: editingQualificationCode.trim(),
        category: editingQualificationCategory.trim() || null,
        requirements: parsedRequirements,
        is_expirable: editingQualificationIsExpirable,
        validity_period: editingQualificationIsExpirable ? editingQualificationValidityPeriod : null,
        active: editingQualificationActive,
        color: editingQualificationColor // Include color in updates
      };
      
      const { data, error: updateError } = await updateQualification(
        editingQualificationId, 
        updatedQualification
      );
      
      if (updateError) {
        throw new Error(updateError.message);
      }
      
      if (data) {
        setQualifications(qualifications.map(
          q => q.id === editingQualificationId ? data : q
        ));
        
        // Reset form
        handleCancelEditQualification();
      }
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteQualification = async (qualification: Qualification) => {
    // Check if the qualification is in use
    if (qualificationUsage[qualification.id] > 0) {
      setErrorMessage(`Cannot delete qualification "${qualification.name}" because it is assigned to ${qualificationUsage[qualification.id]} pilots`);
      return;
    }
    
    setLoading(true);
    try {
      const { success, error: deleteError } = await deleteQualification(qualification.id);
      
      if (deleteError) {
        throw new Error(deleteError.message);
      }
      
      if (success) {
        setQualifications(qualifications.filter(q => q.id !== qualification.id));
        // Remove from usage counts
        const newUsage = { ...qualificationUsage };
        delete newUsage[qualification.id];
        setQualificationUsage(newUsage);
      }
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleArchiveQualification = async (qualification: Qualification) => {
    setLoading(true);
    try {
      const { data, error: archiveError } = await archiveQualification(qualification.id);
      
      if (archiveError) {
        throw new Error(archiveError.message);
      }
      
      if (data) {
        setQualifications(qualifications.map(
          q => q.id === qualification.id ? data : q
        ));
      }
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Sortable role item for drag and drop functionality
  const SortableRoleItem: React.FC<{ 
    role: Role; 
    onEditClick: () => void; 
    onDeleteClick: () => void; 
    onToggleExclusive: () => void; 
    statuses: Status[]; 
    roleUsage: Record<string, number>; 
  }> = ({ role, onEditClick, onDeleteClick, onToggleExclusive, statuses, roleUsage }) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: role.id });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      zIndex: isDragging ? 10 : 1,
      position: 'relative' as const,
      backgroundColor: isDragging ? '#F8FAFC' : 'white',
      boxShadow: isDragging ? '0 4px 8px rgba(0,0,0,0.1)' : 'none'
    };

    return (
      <div
        ref={setNodeRef}
        style={style}
        className="flex items-center justify-between p-3 border border-gray-200 rounded mb-2"
      >
        <div className="flex-1 font-medium" style={{ fontFamily: 'Inter', fontSize: '14px', color: '#0F172A' }}>
          <div>{role.name}</div>
          <div className="text-xs text-slate-500 mt-1">
            Compatible with: {statuses
              .filter(status => role.compatible_statuses.includes(status.id))
              .map(status => status.name)
              .join(', ')}
          </div>
        </div>
        <div className="w-24 flex justify-center">
          <button
            onClick={onToggleExclusive}
            className="p-1 hover:bg-slate-100 rounded"
            title={role.isExclusive ? "Exclusive (only one pilot can have this role)" : "Non-exclusive (multiple pilots can have this role)"}
          >
            {role.isExclusive ? (
              <Lock size={20} className="text-red-600" />
            ) : (
              <Unlock size={20} className="text-green-600" />
            )}
          </button>
        </div>
        <div className="w-20 text-center" title={`${roleUsage[role.id] || 0} pilots have this role`}>
          {roleUsage[role.id] || 0}
        </div>
        <div className="w-24 flex justify-center space-x-1">
          <button 
            onClick={onEditClick}
            className="p-1 hover:bg-slate-100 rounded" 
            title="Edit"
          >
            <Edit size={16} color="#64748B" />
          </button>
          <button 
            onClick={onDeleteClick}
            className={`p-1 rounded ${roleUsage[role.id] > 0 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-red-100'}`}
            disabled={roleUsage[role.id] > 0}
            title={roleUsage[role.id] > 0 ? "Cannot delete a role in use" : "Delete"}
          >
            <Trash size={16} className={roleUsage[role.id] > 0 ? "text-slate-400" : "text-red-600"} />
          </button>
        </div>
        <div 
          className="w-8 flex justify-center cursor-grab hover:bg-slate-50 rounded p-1"
          {...attributes}
          {...listeners}
        >
          <GripVertical size={20} className="text-slate-400" />
        </div>
      </div>
    );
  };

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Roster Settings</h2>
      <p className="text-slate-600 mb-6">
        Configure statuses, roles, and qualifications for squadron personnel.
      </p>

      {(error || localError) && (
        <div className="p-4 mb-4 bg-red-100 border border-red-400 text-red-700 rounded relative flex items-center" role="alert">
          <AlertCircle size={18} className="mr-2" />
          <span>{error || localError}</span>
          <button onClick={() => setErrorMessage(null)} className="absolute top-0 right-0 p-2">
            <X size={16} />
          </button>
        </div>
      )}

      <div className="space-y-6">
        <Card className="p-4">
          <h3 className="text-lg font-medium mb-3">Statuses</h3>
          <p className="text-sm text-slate-500 mb-4">
            Define the status options available for pilots in the squadron roster.
          </p>
          
          {/* Status Headers */}
          <div className="flex items-center justify-between p-2 border-b border-gray-200 mb-2">
            <div className="flex-1 font-medium text-sm text-slate-500">Status Name</div>
            <div className="w-16 text-center text-sm text-slate-500">Order</div>
            <div className="w-24 text-center text-sm text-slate-500">Membership</div>
            <div className="w-20 text-center text-sm text-slate-500">Usage</div>
            <div className="w-24 text-center text-sm text-slate-500">Actions</div>
          </div>

          {/* Loading indicator */}
          {loading && <div className="text-center py-4">Loading...</div>}
          
          {/* List of statuses */}
          {!loading && statuses.map((status) => (
            <div key={status.id} className="flex items-center justify-between p-3 border border-gray-200 rounded mb-2">
              {editingStatusId === status.id ? (
                // Editing mode
                <>
                  <input
                    type="text"
                    value={editingStatusName}
                    onChange={(e) => setEditingStatusName(e.target.value)}
                    className="flex-1 px-2 py-1 border border-gray-300 rounded mr-2"
                    placeholder="Status name"
                  />
                  <div className="w-16 text-center text-sm text-slate-600">
                    {status.order}
                  </div>
                  <div className="w-24 flex justify-center">
                    <button
                      onClick={() => setEditingStatusIsActive(!editingStatusIsActive)}
                      className="p-1 hover:bg-slate-100 rounded flex items-center"
                      title={editingStatusIsActive ? "Active" : "Inactive"}
                    >
                      {editingStatusIsActive ? (
                        <ToggleRight size={20} className="text-green-600" />
                      ) : (
                        <ToggleLeft size={20} className="text-slate-400" />
                      )}
                    </button>
                  </div>
                  <div className="w-20 text-center">
                    {statusUsage[status.id] || 0}
                  </div>
                  <div className="w-24 flex justify-center space-x-1">
                    <button 
                      onClick={handleSaveStatus}
                      className="p-1 hover:bg-green-100 rounded" 
                      title="Save"
                    >
                      <Check size={16} className="text-green-600" />
                    </button>
                    <button 
                      onClick={handleCancelEditStatus}
                      className="p-1 hover:bg-red-100 rounded" 
                      title="Cancel"
                    >
                      <X size={16} className="text-red-600" />
                    </button>
                  </div>
                </>
              ) : (
                // Display mode
                <>
                  <div className="flex-1 font-medium" style={{ fontFamily: 'Inter', fontSize: '14px', color: '#0F172A' }}>
                    {status.name}
                  </div>
                  <div className="w-16 text-center text-sm text-slate-600">
                    {status.order}
                  </div>
                  <div className="w-24 flex justify-center">
                    <button
                      onClick={() => handleToggleStatusActive(status)}
                      className="p-1 hover:bg-slate-100 rounded"
                      title={status.isActive ? "Active" : "Inactive"}
                    >
                      {status.isActive ? (
                        <ToggleRight size={20} className="text-green-600" />
                      ) : (
                        <ToggleLeft size={20} className="text-slate-400" />
                      )}
                    </button>
                  </div>
                  <div className="w-20 text-center" title={`${statusUsage[status.id] || 0} pilots have this status`}>
                    {statusUsage[status.id] || 0}
                  </div>
                  <div className="w-24 flex justify-center space-x-1">
                    <button 
                      onClick={() => handleStartEditStatus(status)}
                      className="p-1 hover:bg-slate-100 rounded" 
                      title="Edit"
                    >
                      <Edit size={16} color="#64748B" />
                    </button>
                    <button 
                      onClick={() => handleDeleteStatus(status)}
                      className={`p-1 rounded ${statusUsage[status.id] > 0 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-red-100'}`}
                      disabled={statusUsage[status.id] > 0}
                      title={statusUsage[status.id] > 0 ? "Cannot delete a status in use" : "Delete"}
                    >
                      <Trash size={16} className={statusUsage[status.id] > 0 ? "text-slate-400" : "text-red-600"} />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
          
          {/* Add new status form */}
          {isAddingStatus ? (
            <div className="flex items-center justify-between p-3 border border-gray-200 rounded mb-2 bg-slate-50">
              <input
                type="text"
                value={newStatusName}
                onChange={(e) => setNewStatusName(e.target.value)}
                className="flex-1 px-2 py-1 border border-gray-300 rounded mr-2"
                placeholder="New status name"
                autoFocus
              />
              <div className="w-24 flex justify-center">
                <button
                  onClick={() => setNewStatusIsActive(!newStatusIsActive)}
                  className="p-1 hover:bg-slate-100 rounded flex items-center"
                  title={newStatusIsActive ? "Active" : "Inactive"}
                >
                  {newStatusIsActive ? (
                    <ToggleRight size={20} className="text-green-600" />
                  ) : (
                    <ToggleLeft size={20} className="text-slate-400" />
                  )}
                </button>
              </div>
              <div className="w-20 text-center">-</div>
              <div className="w-24 flex justify-center space-x-1">
                <button 
                  onClick={handleAddStatus}
                  className="p-1 hover:bg-green-100 rounded" 
                  title="Save"
                >
                  <Check size={16} className="text-green-600" />
                </button>
                <button 
                  onClick={() => {
                    setIsAddingStatus(false);
                    setNewStatusName('');
                    setNewStatusIsActive(true);
                  }}
                  className="p-1 hover:bg-red-100 rounded" 
                  title="Cancel"
                >
                  <X size={16} className="text-red-600" />
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setIsAddingStatus(true)}
              className="w-[119px] h-[30px] bg-white rounded-lg border border-slate-300 flex items-center justify-center mx-auto mt-6 text-2xl text-slate-500 hover:shadow-lg transition-shadow"
            >
              +
            </button>
          )}
        </Card>

        <Card className="p-4">
          <h3 className="text-lg font-medium mb-3">Standings</h3>
          <p className="text-sm text-slate-500 mb-4">
            Define the organizational hierarchy standings available for pilots.
          </p>
          
          {/* Standing Headers */}
          <div className="flex items-center justify-between p-2 border-b border-gray-200 mb-2">
            <div className="flex-1 font-medium text-sm text-slate-500">Standing Name</div>
            <div className="w-16 text-center text-sm text-slate-500">Order</div>
            <div className="w-20 text-center text-sm text-slate-500">Actions</div>
          </div>

          {/* Standing List */}
          {standings.sort((a, b) => a.order - b.order).map(standing => (
            <div key={standing.id} className="flex items-center justify-between p-2 border-b border-gray-100 last:border-b-0">
              {editingStandingId === standing.id ? (
                <>
                  <input
                    type="text"
                    value={editingStandingName}
                    onChange={(e) => setEditingStandingName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveStanding();
                      if (e.key === 'Escape') handleCancelEditStanding();
                    }}
                    className="flex-1 mr-2 px-3 py-1 border border-gray-300 rounded text-sm"
                    placeholder="Standing name"
                    autoFocus
                  />
                  <div className="w-16 text-center text-sm text-slate-600">{standing.order}</div>
                  <div className="flex items-center space-x-1 w-20 justify-center">
                    <button
                      onClick={handleSaveStanding}
                      disabled={loading}
                      className="p-1 text-green-600 hover:text-green-800 disabled:opacity-50"
                    >
                      <Check size={16} />
                    </button>
                    <button
                      onClick={handleCancelEditStanding}
                      disabled={loading}
                      className="p-1 text-gray-600 hover:text-gray-800 disabled:opacity-50"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex-1 text-sm text-slate-800">{standing.name}</div>
                  <div className="w-16 text-center text-sm text-slate-600">{standing.order}</div>
                  <div className="flex items-center space-x-1 w-20 justify-center">
                    <button
                      onClick={() => handleStartEditStanding(standing)}
                      disabled={loading}
                      className="p-1 text-blue-600 hover:text-blue-800 disabled:opacity-50"
                    >
                      <Edit size={16} />
                    </button>
                    <button
                      onClick={() => handleDeleteStanding(standing.id)}
                      disabled={loading || (standingUsage[standing.id] || 0) > 0}
                      className="p-1 text-red-600 hover:text-red-800 disabled:opacity-50"
                      title={standingUsage[standing.id] > 0 ? `${standingUsage[standing.id]} pilot(s) assigned` : 'Delete standing'}
                    >
                      <Trash size={16} />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}

          {/* Add Standing Form */}
          {isAddingStanding ? (
            <div className="mt-4 p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-2 mb-2">
                <input
                  type="text"
                  value={newStandingName}
                  onChange={(e) => setNewStandingName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddStanding();
                    if (e.key === 'Escape') setIsAddingStanding(false);
                  }}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm"
                  placeholder="Standing name"
                  autoFocus
                />
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={handleAddStanding}
                  disabled={loading || !newStandingName.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
                >
                  Add Standing
                </button>
                <button
                  onClick={() => {
                    setIsAddingStanding(false);
                    setNewStandingName('');
                  }}
                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded text-sm hover:bg-gray-400"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setIsAddingStanding(true)}
              className="w-[119px] h-[30px] bg-white rounded-lg border border-slate-300 flex items-center justify-center mx-auto mt-6 text-2xl text-slate-500 hover:shadow-lg transition-shadow"
            >
              +
            </button>
          )}
        </Card>

        <Card className="p-4">
          <h3 className="text-lg font-medium mb-3">Roles</h3>
          <p className="text-sm text-slate-500 mb-4">
            Define the role options available for pilots in the squadron roster. Drag roles to reorder them.
          </p>
          
          {/* Role Headers */}
          <div className="flex items-center justify-between p-2 border-b border-gray-200 mb-2">
            <div className="flex-1 font-medium text-sm text-slate-500">Role Name</div>
            <div className="w-24 text-center text-sm text-slate-500">Exclusivity</div>
            <div className="w-20 text-center text-sm text-slate-500">Usage</div>
            <div className="w-24 text-center text-sm text-slate-500">Actions</div>
            <div className="w-8"></div>
          </div>

          {/* Loading indicator */}
          {loading && <div className="text-center py-4">Loading...</div>}
          
          {!loading && (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
              modifiers={[restrictToVerticalAxis]}
            >
              <SortableContext 
                items={roles.map(role => role.id)}
                strategy={verticalListSortingStrategy}
              >
                {/* List of roles */}
                {roles.map((role) => (
                  <SortableRoleItem 
                    key={role.id} 
                    role={role}
                    onEditClick={() => handleStartEditRole(role)}
                    onDeleteClick={() => handleDeleteRole(role)}
                    onToggleExclusive={() => handleToggleRoleExclusive(role)}
                    statuses={statuses}
                    roleUsage={roleUsage}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}
          
          {/* Add new role form */}
          {isAddingRole ? (
            <div className="flex flex-col p-3 border border-gray-200 rounded mb-2 bg-slate-50">
              <div className="flex items-center mb-3">
                <input
                  type="text"
                  value={newRoleName}
                  onChange={(e) => setNewRoleName(e.target.value)}
                  className="flex-1 px-2 py-1 border border-gray-300 rounded mr-2"
                  placeholder="New role name"
                  autoFocus
                />
                <div className="flex items-center">
                  <button
                    onClick={() => setNewRoleIsExclusive(!newRoleIsExclusive)}
                    className="p-1 hover:bg-slate-100 rounded flex items-center"
                    title={newRoleIsExclusive ? "Exclusive (only one pilot can have this role)" : "Non-exclusive (multiple pilots can have this role)"}
                  >
                    {newRoleIsExclusive ? (
                      <Lock size={20} className="text-red-600" />
                    ) : (
                      <Unlock size={20} className="text-green-600" />
                    )}
                  </button>
                  <span className="ml-1 text-xs text-slate-500">
                    {newRoleIsExclusive ? "Exclusive" : "Non-exclusive"}
                  </span>
                </div>
              </div>
              
              <div className="mb-3">
                <p className="text-xs text-slate-500 mb-1">Compatible Statuses:</p>
                <div className="flex flex-wrap gap-2">
                  {statuses.map(status => (
                    <label key={status.id} className="flex items-center text-xs">
                      <input
                        type="checkbox"
                        checked={newRoleCompatibleStatuses.includes(status.id)}
                        onChange={() => handleToggleCompatibleStatus(status.id, true)}
                        className="mr-1"
                      />
                      {status.name}
                    </label>
                  ))}
                </div>
              </div>
              
              <div className="flex justify-end space-x-2">
                <button 
                  onClick={handleAddRole}
                  className="px-3 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200" 
                >
                  Save
                </button>
                <button 
                  onClick={() => {
                    setIsAddingRole(false);
                    setNewRoleName('');
                    setNewRoleIsExclusive(false);
                    setNewRoleCompatibleStatuses([]);
                  }}
                  className="px-3 py-1 bg-slate-100 text-slate-700 rounded hover:bg-slate-200" 
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setIsAddingRole(true)}
              className="w-[119px] h-[30px] bg-white rounded-lg border border-slate-300 flex items-center justify-center mx-auto mt-6 text-2xl text-slate-500 hover:shadow-lg transition-shadow"
            >
              +
            </button>
          )}
        </Card>

        <Card className="p-4">
          <h3 className="text-lg font-medium mb-3">Qualifications</h3>
          <p className="text-sm text-slate-500 mb-4">
            Define the qualifications that can be assigned to pilots.
          </p>
          
          {/* Qualification Headers */}
          <div className="flex items-center justify-between p-2 border-b border-gray-200 mb-2">
            <div className="flex-1 font-medium text-sm text-slate-500">Qualification Name</div>
            <div className="w-16 text-center text-sm text-slate-500">Code</div>
            <div className="w-24 text-center text-sm text-slate-500">Type</div>
            <div className="w-20 text-center text-sm text-slate-500">Usage</div>
            <div className="w-24 text-center text-sm text-slate-500">Actions</div>
          </div>

          {/* Loading indicator */}
          {loading && <div className="text-center py-4">Loading...</div>}
          
          {/* List of qualifications */}
          {!loading && qualifications.map((qualification) => (
            <div key={qualification.id} className={`flex items-center justify-between p-3 border border-gray-200 rounded mb-2 ${!qualification.active ? 'bg-slate-50 opacity-60' : ''}`}>
              {editingQualificationId === qualification.id ? (
                // Editing mode
                <div className="w-full space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 space-y-2 mr-4">
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">Name</label>
                        <input
                          type="text"
                          value={editingQualificationName}
                          onChange={(e) => setEditingQualificationName(e.target.value)}
                          className="w-full px-2 py-1 border border-gray-300 rounded"
                          placeholder="Qualification name"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">Category</label>
                        <input
                          type="text"
                          value={editingQualificationCategory}
                          onChange={(e) => setEditingQualificationCategory(e.target.value)}
                          className="w-full px-2 py-1 border border-gray-300 rounded"
                          placeholder="Leadership, Carrier Ops, etc."
                        />
                      </div>
                    </div>
                    
                    <div className="w-36 space-y-2">
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">Code</label>
                        <input
                          type="text"
                          value={editingQualificationCode}
                          onChange={(e) => setEditingQualificationCode(e.target.value)}
                          className="w-full px-2 py-1 border border-gray-300 rounded"
                          placeholder="FL, SL, etc."
                        />
                      </div>
                      <div className="flex items-center mt-2">
                        <input
                          type="checkbox"
                          id={`edit-qual-active-${qualification.id}`}
                          checked={editingQualificationActive}
                          onChange={() => setEditingQualificationActive(!editingQualificationActive)}
                          className="mr-2"
                        />
                        <label htmlFor={`edit-qual-active-${qualification.id}`} className="text-xs text-slate-500">
                          Active
                        </label>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-start space-x-4">
                    <div className="flex-1">
                      <label className="block text-xs text-slate-500 mb-1">Requirements (JSON)</label>
                      <textarea
                        value={editingQualificationRequirements}
                        onChange={(e) => setEditingQualificationRequirements(e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 rounded font-mono text-xs"
                        placeholder="{}"
                        rows={4}
                      />
                    </div>
                    
                    <div className="w-36 space-y-2">
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          id={`edit-qual-expiry-${qualification.id}`}
                          checked={editingQualificationIsExpirable}
                          onChange={() => setEditingQualificationIsExpirable(!editingQualificationIsExpirable)}
                          className="mr-2"
                        />
                        <label htmlFor={`edit-qual-expiry-${qualification.id}`} className="text-xs text-slate-500">
                          Expires
                        </label>
                      </div>
                      
                      {editingQualificationIsExpirable && (
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">Days Valid</label>
                          <input
                            type="number"
                            value={editingQualificationValidityPeriod || ''}
                            onChange={(e) => setEditingQualificationValidityPeriod(e.target.value ? parseInt(e.target.value) : null)}
                            className="w-full px-2 py-1 border border-gray-300 rounded"
                            placeholder="365"
                            min="1"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-start space-x-4">
                    <div className="flex-1">
                      <label className="block text-xs text-slate-500 mb-1">Color</label>
                      <input
                        type="color"
                        value={editingQualificationColor}
                        onChange={(e) => setEditingQualificationColor(e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 rounded"
                      />
                    </div>
                  </div>
                  
                  <div className="flex justify-end space-x-2">
                    <button 
                      onClick={handleSaveQualification}
                      className="px-3 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200" 
                    >
                      Save
                    </button>
                    <button 
                      onClick={handleCancelEditQualification}
                      className="px-3 py-1 bg-slate-100 text-slate-700 rounded hover:bg-slate-200" 
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                // Display mode
                <>
                  <div className="flex-1">
                    <div className="font-medium" style={{ fontFamily: 'Inter', fontSize: '14px', color: '#0F172A' }}>
                      {qualification.name}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      {qualification.category || 'No category'}
                      {qualification.is_expirable && (
                        <span className="ml-2 inline-flex items-center">
                          <Clock size={12} className="inline mr-1" />
                          {qualification.validity_period} days
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="w-16 text-center">
                    <span className="text-xs font-semibold py-1 px-2 bg-slate-100 rounded">
                      {qualification.code}
                    </span>
                  </div>
                  <div className="w-24 text-center text-sm">
                    {qualification.is_expirable ? 
                      <span className="text-amber-600 text-xs">Temporary</span> : 
                      <span className="text-green-600 text-xs">Permanent</span>}
                  </div>
                  <div className="w-20 text-center" title={`${qualificationUsage[qualification.id] || 0} pilots have this qualification`}>
                    {qualificationUsage[qualification.id] || 0}
                  </div>
                  <div className="w-24 flex justify-center space-x-1">
                    <button 
                      onClick={() => handleStartEditQualification(qualification)}
                      className="p-1 hover:bg-slate-100 rounded" 
                      title="Edit"
                    >
                      <Edit size={16} color="#64748B" />
                    </button>
                    {qualificationUsage[qualification.id] > 0 ? (
                      <button 
                        onClick={() => handleArchiveQualification(qualification)}
                        className={`p-1 rounded hover:bg-amber-100`}
                        title={qualification.active ? "Archive qualification" : "Restore qualification"}
                      >
                        {qualification.active ? 
                          <ArrowRight size={16} className="text-amber-600" /> : 
                          <ArrowRight size={16} className="text-green-600 transform rotate-180" />}
                      </button>
                    ) : (
                      <button 
                        onClick={() => handleDeleteQualification(qualification)}
                        className="p-1 hover:bg-red-100 rounded" 
                        title="Delete"
                      >
                        <Trash size={16} className="text-red-600" />
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          ))}
          
          {/* Add new qualification form */}
          {isAddingQualification ? (
            <div className="flex flex-col p-3 border border-gray-200 rounded mb-2 bg-slate-50">
              <div className="flex items-start justify-between">
                <div className="flex-1 space-y-2 mr-4">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Name*</label>
                    <input
                      type="text"
                      value={newQualificationName}
                      onChange={(e) => setNewQualificationName(e.target.value)}
                      className="w-full px-2 py-1 border border-gray-300 rounded"
                      placeholder="Qualification name"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Category</label>
                    <input
                      type="text"
                      value={newQualificationCategory}
                      onChange={(e) => setNewQualificationCategory(e.target.value)}
                      className="w-full px-2 py-1 border border-gray-300 rounded"
                      placeholder="Leadership, Carrier Ops, etc."
                    />
                  </div>
                </div>
                
                <div className="w-36 space-y-2">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Code*</label>
                    <input
                      type="text"
                      value={newQualificationCode}
                      onChange={(e) => setNewQualificationCode(e.target.value)}
                      className="w-full px-2 py-1 border border-gray-300 rounded"
                      placeholder="FL, SL, etc."
                    />
                  </div>
                  <div className="flex items-center mt-2">
                    <input
                      type="checkbox"
                      id="new-qual-active"
                      checked={newQualificationActive}
                      onChange={() => setNewQualificationActive(!newQualificationActive)}
                      className="mr-2"
                    />
                    <label htmlFor="new-qual-active" className="text-xs text-slate-500">
                      Active
                    </label>
                  </div>
                </div>
              </div>
              
              <div className="flex items-start space-x-4 mt-3">
                <div className="flex-1">
                  <label className="block text-xs text-slate-500 mb-1">Requirements (JSON)</label>
                  <textarea
                    value={newQualificationRequirements}
                    onChange={(e) => setNewQualificationRequirements(e.target.value)}
                    className="w-full px-2 py-1 border border-gray-300 rounded font-mono text-xs"
                    placeholder="{}"
                    rows={4}
                  />
                </div>
                
                <div className="w-36 space-y-2">
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="new-qual-expiry"
                      checked={newQualificationIsExpirable}
                      onChange={() => setNewQualificationIsExpirable(!newQualificationIsExpirable)}
                      className="mr-2"
                    />
                    <label htmlFor="new-qual-expiry" className="text-xs text-slate-500">
                      Expires
                    </label>
                  </div>
                  
                  {newQualificationIsExpirable && (
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Days Valid</label>
                      <input
                        type="number"
                        value={newQualificationValidityPeriod || ''}
                        onChange={(e) => setNewQualificationValidityPeriod(e.target.value ? parseInt(e.target.value) : null)}
                        className="w-full px-2 py-1 border border-gray-300 rounded"
                        placeholder="365"
                        min="1"
                      />
                    </div>
                  )}
                </div>
              </div>
              
              <div className="flex items-start space-x-4 mt-3">
                <div className="flex-1">
                  <label className="block text-xs text-slate-500 mb-1">Color</label>
                  <input
                    type="color"
                    value={newQualificationColor}
                    onChange={(e) => setNewQualificationColor(e.target.value)}
                    className="w-full px-2 py-1 border border-gray-300 rounded"
                  />
                </div>
              </div>
              
              <div className="flex justify-end space-x-2 mt-3">
                <button 
                  onClick={handleAddQualification}
                  className="px-3 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200" 
                >
                  Save
                </button>
                <button 
                  onClick={() => {
                    setIsAddingQualification(false);
                    setNewQualificationName('');
                    setNewQualificationCode('');
                    setNewQualificationCategory('');
                    setNewQualificationRequirements('{}');
                    setNewQualificationIsExpirable(false);
                    setNewQualificationValidityPeriod(null);
                    setNewQualificationActive(true);
                    setNewQualificationColor('#646F7E');
                  }}
                  className="px-3 py-1 bg-slate-100 text-slate-700 rounded hover:bg-slate-200" 
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setIsAddingQualification(true)}
              className="w-[119px] h-[30px] bg-white rounded-lg border border-slate-300 flex items-center justify-center mx-auto mt-6 text-2xl text-slate-500 hover:shadow-lg transition-shadow"
            >
              +
            </button>
          )}
        </Card>
      </div>
    </div>
  );
};

export default RosterSettings;