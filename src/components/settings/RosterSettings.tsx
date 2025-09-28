import React, { useState, useEffect } from 'react';
import { AlertCircle, Edit, Trash, X, Lock, Unlock, GripVertical } from 'lucide-react';
import QualificationBadge from '../ui/QualificationBadge';
import { Status, getAllStatuses, createStatus, updateStatus, deleteStatus, getStatusUsageCount, initializeDefaultStatuses } from '../../utils/statusService';
import { Standing, getAllStandings, createStanding, updateStanding, deleteStanding, getStandingUsageCount } from '../../utils/standingService';
import { Role, getAllRoles, createRole, updateRole, deleteRole, getRoleUsageCount, initializeDefaultRoles } from '../../utils/roleService';
import { Qualification, getAllQualifications, createQualification, updateQualification, deleteQualification, getQualificationUsageCount, initializeDefaultQualifications } from '../../utils/qualificationService';
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
  // const [reorderingRoles, setReorderingRoles] = useState(false);

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
          
          // Get usage count for each standing
          const usageCounts: Record<string, number> = {};
          for (const standing of data) {
            const { count, error: usageError } = await getStandingUsageCount(standing.id);
            if (!usageError) {
              usageCounts[standing.id] = count;
            } else {
              console.warn(`Error getting usage count for standing ${standing.name}:`, usageError);
              usageCounts[standing.id] = 0; // Fallback to 0 if there's an error
            }
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
          
          // Pass the fresh roles data directly to refreshRoleUsageCounts
          await refreshRoleUsageCounts(sortedRoles);
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
          console.log('Initial qualifications loaded from DB:', data.map(q => ({ id: q.id, name: q.name, order: q.order })));
          // Database already orders by 'order' field, no need for additional sorting
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
  const refreshRoleUsageCounts = async (rolesToCheck?: Role[]) => {
    // Use provided roles or fall back to state roles
    const rolesToUse = rolesToCheck || roles;
    
    // Get usage count for each role
    const usageCounts: Record<string, number> = {};
    for (const role of rolesToUse) {
      const { count, error: usageError } = await getRoleUsageCount(role.id);
      if (!usageError) {
        usageCounts[role.id] = count;
      } else {
        console.warn(`Error getting usage count for role ${role.name}:`, usageError);
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

  // const handleCancelEditRole = () => {
  //   setEditingRoleId(null);
  //   setEditingRoleName('');
  //   setEditingRoleIsExclusive(false);
  //   setEditingRoleCompatibleStatuses([]);
  // };

  // const handleSaveRole = async () => {
  //   if (!editingRoleId || !editingRoleName.trim()) {
  //     setErrorMessage('Role name cannot be empty');
  //     return;
  //   }
  //   
  //   setLoading(true);
  //   try {
  //     const { data, error: updateError } = await updateRole(editingRoleId, {
  //       name: editingRoleName.trim(),
  //       isExclusive: editingRoleIsExclusive,
  //       compatible_statuses: editingRoleCompatibleStatuses
  //     });
  //     
  //     if (updateError) {
  //       throw new Error(updateError.message);
  //     }
  //     
  //     if (data) {
  //       setRoles(roles.map(r => r.id === editingRoleId ? data : r));
  //       setEditingRoleId(null);
  //       setEditingRoleName('');
  //       setEditingRoleIsExclusive(false);
  //       setEditingRoleCompatibleStatuses([]);
  //       await refreshRoleUsageCounts();
  //     }
  //   } catch (err: any) {
  //     setErrorMessage(err.message);
  //   } finally {
  //     setLoading(false);
  //   }
  // };

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
        // setReorderingRoles(true);
        
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
        // setReorderingRoles(false);
      }
    }
  };

  const handleStatusDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      let updatedStatuses: Status[] = [];

      setStatuses((prevStatuses) => {
        const oldIndex = prevStatuses.findIndex((status) => status.id === active.id);
        const newIndex = prevStatuses.findIndex((status) => status.id === over.id);

        const newStatuses = arrayMove(prevStatuses, oldIndex, newIndex);

        updatedStatuses = newStatuses.map((status, index) => ({
          ...status,
          order: index + 1
        }));

        return updatedStatuses;
      });

      try {
        const promises = updatedStatuses.map(status =>
          updateStatus(status.id, { order: status.order })
        );
        await Promise.all(promises);
      } catch (err: any) {
        setErrorMessage(err.message);
        console.error('Error updating status orders:', err);
      }
    }
  };

  const handleStandingDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      let updatedStandings: Standing[] = [];

      setStandings((prevStandings) => {
        const oldIndex = prevStandings.findIndex((standing) => standing.id === active.id);
        const newIndex = prevStandings.findIndex((standing) => standing.id === over.id);

        const newStandings = arrayMove(prevStandings, oldIndex, newIndex);

        updatedStandings = newStandings.map((standing, index) => ({
          ...standing,
          order: index + 1
        }));

        return updatedStandings;
      });

      try {
        const promises = updatedStandings.map(standing =>
          updateStanding(standing.id, { order: standing.order })
        );
        await Promise.all(promises);
      } catch (err: any) {
        setErrorMessage(err.message);
        console.error('Error updating standing orders:', err);
      }
    }
  };

  const handleQualificationDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      let updatedQualifications: Qualification[] = [];

      setQualifications((prevQualifications) => {
        const oldIndex = prevQualifications.findIndex((qualification) => qualification.id === active.id);
        const newIndex = prevQualifications.findIndex((qualification) => qualification.id === over.id);

        const newQualifications = arrayMove(prevQualifications, oldIndex, newIndex);

        // Assign sequential order values starting from 1
        updatedQualifications = newQualifications.map((qualification, index) => ({
          ...qualification,
          order: index + 1
        }));

        return updatedQualifications;
      });

      try {
        console.log('Updating qualification orders:', updatedQualifications.map(q => ({ id: q.id, name: q.name, newOrder: q.order })));

        // Test: Try updating just the first one to see if it's an RLS policy issue
        console.log('Testing single qualification update...');
        const testResult = await updateQualification(updatedQualifications[0].id, { order: updatedQualifications[0].order });
        console.log('Single update test result:', testResult);

        const promises = updatedQualifications.map(qualification =>
          updateQualification(qualification.id, { order: qualification.order })
        );
        const results = await Promise.all(promises);
        console.log('Qualification order update results:', results);

        // Reload qualifications to ensure we have the latest data
        const { data: refreshedData, error: refreshError } = await getAllQualifications();
        if (!refreshError && refreshedData) {
          setQualifications(refreshedData);
          console.log('Refreshed qualifications after reorder:', refreshedData.map(q => ({ id: q.id, name: q.name, order: q.order })));
        }
      } catch (err: any) {
        setErrorMessage(err.message);
        console.error('Error updating qualification orders:', err);
      }
    }
  };

  // Qualification management functions
  // const refreshQualificationUsageCounts = async () => {
  //   // Get usage count for each qualification
  //   const usageCounts: Record<string, number> = {};
  //   for (const qualification of qualifications) {
  //     const { count, error: usageError } = await getQualificationUsageCount(qualification.id);
  //     if (!usageError) {
  //       usageCounts[qualification.id] = count;
  //     }
  //   }
  //   setQualificationUsage(usageCounts);
  // };

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

      // Get the highest order number and add 10
      const highestOrder = qualifications.length > 0
        ? Math.max(...qualifications.map(q => q.order || 0))
        : 0;

      const newQualification = {
        name: newQualificationName.trim(),
        code: newQualificationCode.trim(),
        category: newQualificationCategory.trim() || null,
        requirements: parsedRequirements,
        is_expirable: newQualificationIsExpirable,
        validity_period: newQualificationIsExpirable ? newQualificationValidityPeriod : null,
        active: newQualificationActive,
        color: newQualificationColor, // Include color property
        order: highestOrder + 10 // Set proper order for new qualification
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
    // Protected qualifications that cannot be deleted
    const protectedQualifications = ['Mission Commander', 'Flight Lead', 'Section Lead', 'Instructor Pilot'];

    if (protectedQualifications.includes(qualification.name)) {
      setErrorMessage(`Cannot delete "${qualification.name}" - this is a protected qualification required by the system`);
      return;
    }

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
    const [isHovered, setIsHovered] = useState(false);

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
        style={{
          ...style,
          display: 'flex',
          borderBottom: '1px solid #F3F4F6',
          backgroundColor: isDragging ? '#F8FAFC' : '#FFFFFF',
          boxShadow: isDragging ? '0 4px 8px rgba(0,0,0,0.1)' : 'none',
          height: 'auto',
          minHeight: '48px'
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Drag Handle */}
        <div style={{
          width: '24px',
          padding: '4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'grab'
        }}
          {...attributes}
          {...listeners}
        >
          <GripVertical size={16} style={{ color: '#64748B' }} />
        </div>

        {/* Role Name Column */}
        <div style={{
          padding: '5px 12px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          width: '220px',
          borderRight: '1px solid #F3F4F6'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{
              fontSize: '14px',
              fontWeight: 500,
              color: '#111827'
            }}>
              {role.name}
            </span>
            <span style={{
              fontSize: '13px',
              color: '#9CA3AF'
            }}>
              ({roleUsage[role.id] || 0})
            </span>
          </div>
          <span style={{
            fontSize: '12px',
            color: '#6B7280',
            marginTop: '2px'
          }}>
            Compatible with: {statuses
              .filter(status => role.compatible_statuses.includes(status.id))
              .map(status => status.name)
              .join(', ')}
          </span>
        </div>

        {/* Display Order Column */}
        <div style={{
          padding: '5px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '120px',
          borderRight: '1px solid #F3F4F6'
        }}>
          <span style={{
            fontSize: '13px',
            color: '#6B7280'
          }}>
            {role.order}
          </span>
        </div>

        {/* Exclusivity Column */}
        <div style={{
          padding: '5px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100px',
          borderRight: '1px solid #F3F4F6'
        }}>
          <span
            onClick={onToggleExclusive}
            style={{
              padding: '4px 8px',
              fontSize: '12px',
              fontWeight: 500,
              color: !role.isExclusive ? '#9CA3AF' : '#2563EB',
              backgroundColor: !role.isExclusive ? 'transparent' : '#EFF6FF',
              cursor: 'pointer',
              borderRadius: '4px',
              transition: 'all 0.2s ease',
              minWidth: '60px',
              textAlign: 'center',
              display: 'inline-block'
            }}
            title={
              !role.isExclusive ? "No exclusivity restrictions" : "Exclusive role"
            }
            onMouseEnter={(e) => {
              e.currentTarget.style.color = !role.isExclusive ? '#6B7280' : '#1D4ED8';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = !role.isExclusive ? '#9CA3AF' : '#2563EB';
            }}
          >
            {!role.isExclusive ? 'None' : 'Exclusive'}
          </span>
        </div>

        {/* Actions Column */}
        <div style={{
          width: '100px',
          padding: '5px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '5px'
        }}>
          {isHovered && (
            <>
              <button
                onClick={onEditClick}
                style={{
                  padding: '4px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  background: 'white',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.1s ease',
                  color: '#64748B',
                  width: '24px',
                  height: '24px'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.15)';
                  e.currentTarget.style.background = '#F8FAFC';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                  e.currentTarget.style.background = 'white';
                }}
                title="Edit role"
              >
                <Edit size={14} color="#64748B" />
              </button>
              <button
                onClick={onDeleteClick}
                disabled={roleUsage[role.id] > 0}
                style={{
                  padding: '4px',
                  borderRadius: '4px',
                  cursor: roleUsage[role.id] > 0 ? 'not-allowed' : 'pointer',
                  background: roleUsage[role.id] > 0 ? '#F9FAFB' : 'white',
                  boxShadow: roleUsage[role.id] > 0 ? 'none' : '0 2px 4px rgba(0,0,0,0.1)',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.1s ease',
                  width: '24px',
                  height: '24px'
                }}
                onMouseEnter={(e) => {
                  if (roleUsage[role.id] === 0) {
                    e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.15)';
                    e.currentTarget.style.background = '#FEF2F2';
                  }
                }}
                onMouseLeave={(e) => {
                  if (roleUsage[role.id] === 0) {
                    e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                    e.currentTarget.style.background = 'white';
                  }
                }}
                title={roleUsage[role.id] > 0 ? "Cannot delete role in use" : "Delete role"}
              >
                <Trash size={14} color={roleUsage[role.id] > 0 ? "#9CA3AF" : "#64748B"} />
              </button>
            </>
          )}
        </div>

      </div>
    );
  };

  // Sortable Status Row Component
  const SortableStatusRow: React.FC<{
    status: Status;
    onEditClick: () => void;
    onDeleteClick: () => void;
    onToggleActive: () => void;
    statusUsage: Record<string, number>;
  }> = ({ status, onEditClick, onDeleteClick, onToggleActive, statusUsage }) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: status.id });
    const [isHovered, setIsHovered] = useState(false);

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      zIndex: isDragging ? 10 : 1,
      position: 'relative' as const,
      backgroundColor: isDragging ? '#F8FAFC' : 'white',
      boxShadow: isDragging ? '0 4px 8px rgba(0,0,0,0.1)' : 'none'
    };

    const renderToggle = (enabled: boolean, onChange: () => void) => (
      <div
        onClick={onChange}
        style={{
          width: '44px',
          height: '24px',
          backgroundColor: enabled ? '#3B82F6' : '#E5E7EB',
          borderRadius: '12px',
          position: 'relative',
          cursor: 'pointer',
          transition: 'background-color 0.2s ease',
        }}
      >
        <div
          style={{
            width: '20px',
            height: '20px',
            backgroundColor: 'white',
            borderRadius: '50%',
            position: 'absolute',
            top: '2px',
            left: enabled ? '22px' : '2px',
            transition: 'left 0.2s ease',
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)'
          }}
        />
      </div>
    );

    return (
      <div
        ref={setNodeRef}
        style={{
          ...style,
          display: 'flex',
          borderBottom: '1px solid #F3F4F6',
          backgroundColor: isDragging ? '#F8FAFC' : '#FFFFFF',
          boxShadow: isDragging ? '0 4px 8px rgba(0,0,0,0.1)' : 'none',
          height: 'auto',
          minHeight: '48px'
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Drag Handle */}
        <div style={{
          width: '24px',
          padding: '4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'grab'
        }}
          {...attributes}
          {...listeners}
        >
          <GripVertical size={16} style={{ color: '#64748B' }} />
        </div>

        {/* Status Name Column */}
        <div style={{
          padding: '5px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '220px',
          borderRight: '1px solid #F3F4F6'
        }}>
          <span style={{
            fontSize: '14px',
            fontWeight: 500,
            color: '#111827'
          }}>
            {status.name}
          </span>
          <span style={{
            fontSize: '13px',
            color: '#9CA3AF'
          }}>
            ({statusUsage[status.id] || 0})
          </span>
        </div>

        {/* Sort Order Column */}
        <div style={{
          padding: '5px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '120px',
          borderRight: '1px solid #F3F4F6'
        }}>
          <span style={{
            fontSize: '13px',
            color: '#6B7280'
          }}>
            {status.order}
          </span>
        </div>

        {/* Active Column */}
        <div style={{
          padding: '5px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100px',
          borderRight: '1px solid #F3F4F6'
        }}>
          {renderToggle(status.isActive, onToggleActive)}
        </div>

        {/* Actions Column */}
        <div style={{
          width: '100px',
          padding: '5px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '5px'
        }}>
          {isHovered && (
            <>
              <button
                onClick={onEditClick}
                style={{
                  padding: '4px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  background: 'white',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.1s ease',
                  color: '#64748B',
                  width: '24px',
                  height: '24px'
                }}
                title="Edit status"
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.15)';
                  e.currentTarget.style.background = '#F8FAFC';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                  e.currentTarget.style.background = 'white';
                }}
              >
                <Edit size={14} color="#64748B" />
              </button>
              <button
                onClick={onDeleteClick}
                disabled={statusUsage[status.id] > 0}
                style={{
                  padding: '4px',
                  borderRadius: '4px',
                  cursor: statusUsage[status.id] > 0 ? 'not-allowed' : 'pointer',
                  background: 'white',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.1s ease',
                  color: '#64748B',
                  width: '24px',
                  height: '24px',
                  opacity: statusUsage[status.id] > 0 ? 0.5 : 1
                }}
                title={statusUsage[status.id] > 0 ? "Cannot delete a status in use" : "Delete status"}
                onMouseEnter={(e) => {
                  if (statusUsage[status.id] === 0) {
                    e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.15)';
                    e.currentTarget.style.background = '#F8FAFC';
                  }
                }}
                onMouseLeave={(e) => {
                  if (statusUsage[status.id] === 0) {
                    e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                    e.currentTarget.style.background = 'white';
                  }
                }}
              >
                <Trash size={14} color={statusUsage[status.id] > 0 ? "#9CA3AF" : "#64748B"} />
              </button>
            </>
          )}
        </div>
      </div>
    );
  };

  // Sortable Standing Row Component
  const SortableStandingRow: React.FC<{
    standing: Standing;
    onEditClick: () => void;
    onDeleteClick: () => void;
    standingUsage: Record<string, number>;
  }> = ({ standing, onEditClick, onDeleteClick, standingUsage }) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: standing.id });
    const [isHovered, setIsHovered] = useState(false);

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
        style={{
          ...style,
          display: 'flex',
          borderBottom: '1px solid #F3F4F6',
          backgroundColor: isDragging ? '#F8FAFC' : '#FFFFFF',
          boxShadow: isDragging ? '0 4px 8px rgba(0,0,0,0.1)' : 'none',
          height: 'auto',
          minHeight: '48px'
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Drag Handle */}
        <div style={{
          width: '24px',
          padding: '4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'grab'
        }}
          {...attributes}
          {...listeners}
        >
          <GripVertical size={16} style={{ color: '#64748B' }} />
        </div>

        {/* Standing Name Column */}
        <div style={{
          padding: '5px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '220px',
          borderRight: '1px solid #F3F4F6'
        }}>
          <span style={{
            fontSize: '14px',
            fontWeight: 500,
            color: '#111827'
          }}>
            {standing.name}
          </span>
          <span style={{
            fontSize: '13px',
            color: '#9CA3AF'
          }}>
            ({standingUsage[standing.id] || 0})
          </span>
        </div>

        {/* Sort Order Column */}
        <div style={{
          padding: '5px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '120px',
          borderRight: '1px solid #F3F4F6'
        }}>
          <span style={{
            fontSize: '13px',
            color: '#6B7280'
          }}>
            {standing.order}
          </span>
        </div>

        {/* Actions Column */}
        <div style={{
          width: '100px',
          padding: '5px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '5px'
        }}>
          {isHovered && (
            <>
              <button
                onClick={onEditClick}
                style={{
                  padding: '4px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  background: 'white',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.1s ease',
                  color: '#64748B',
                  width: '24px',
                  height: '24px'
                }}
                title="Edit standing"
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.15)';
                  e.currentTarget.style.background = '#F8FAFC';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                  e.currentTarget.style.background = 'white';
                }}
              >
                <Edit size={14} color="#64748B" />
              </button>
              <button
                onClick={onDeleteClick}
                disabled={standingUsage[standing.id] > 0}
                style={{
                  padding: '4px',
                  borderRadius: '4px',
                  cursor: standingUsage[standing.id] > 0 ? 'not-allowed' : 'pointer',
                  background: 'white',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.1s ease',
                  color: '#64748B',
                  width: '24px',
                  height: '24px',
                  opacity: standingUsage[standing.id] > 0 ? 0.5 : 1
                }}
                title={standingUsage[standing.id] > 0 ? `${standingUsage[standing.id]} pilot(s) assigned` : 'Delete standing'}
                onMouseEnter={(e) => {
                  if (standingUsage[standing.id] === 0) {
                    e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.15)';
                    e.currentTarget.style.background = '#F8FAFC';
                  }
                }}
                onMouseLeave={(e) => {
                  if (standingUsage[standing.id] === 0) {
                    e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                    e.currentTarget.style.background = 'white';
                  }
                }}
              >
                <Trash size={14} color={standingUsage[standing.id] > 0 ? "#9CA3AF" : "#64748B"} />
              </button>
            </>
          )}
        </div>
      </div>
    );
  };

  // Sortable Qualification Row Component
  const SortableQualificationRow: React.FC<{
    qualification: Qualification;
    onEditClick: () => void;
    onDeleteClick: () => void;
    qualificationUsage: Record<string, number>;
  }> = ({ qualification, onEditClick, onDeleteClick, qualificationUsage }) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: qualification.id });
    const [isHovered, setIsHovered] = useState(false);

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
        style={{
          ...style,
          display: 'flex',
          borderBottom: '1px solid #F3F4F6',
          backgroundColor: isDragging ? '#F8FAFC' : '#FFFFFF',
          boxShadow: isDragging ? '0 4px 8px rgba(0,0,0,0.1)' : 'none',
          height: 'auto',
          minHeight: '48px'
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Drag Handle */}
        <div style={{
          width: '24px',
          padding: '4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'grab'
        }}
          {...attributes}
          {...listeners}
        >
          <GripVertical size={16} style={{ color: '#64748B' }} />
        </div>

        {/* Qualification Name Column */}
        <div style={{
          padding: '5px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '285px',
          borderRight: '1px solid #F3F4F6'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <QualificationBadge type={qualification.name as any} color={qualification.color || undefined} />
            <span style={{
              fontSize: '14px',
              fontWeight: 500,
              color: '#111827'
            }}>
              {qualification.name}
            </span>
          </div>
          <span style={{
            fontSize: '13px',
            color: '#9CA3AF'
          }}>
            ({qualificationUsage[qualification.id] || 0})
          </span>
        </div>

        {/* Sort Order Column */}
        <div style={{
          padding: '5px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100px',
          borderRight: '1px solid #F3F4F6'
        }}>
          <span style={{
            fontSize: '13px',
            color: '#6B7280'
          }}>
            {qualification.order}
          </span>
        </div>

        {/* Expires After Column */}
        <div style={{
          padding: '5px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '120px',
          borderRight: '1px solid #F3F4F6'
        }}>
          <span style={{
            fontSize: '13px',
            color: '#6B7280'
          }}>
            {qualification.is_expirable && qualification.validity_period ?
              `${qualification.validity_period} days` :
              '-'
            }
          </span>
        </div>

        {/* Actions Column */}
        <div style={{
          width: '100px',
          padding: '5px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '5px'
        }}>
          {isHovered && (
            <>
              <button
                onClick={onEditClick}
                style={{
                  padding: '4px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  background: 'white',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.1s ease',
                  color: '#64748B',
                  width: '24px',
                  height: '24px'
                }}
                title="Edit qualification"
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.15)';
                  e.currentTarget.style.background = '#F8FAFC';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                  e.currentTarget.style.background = 'white';
                }}
              >
                <Edit size={14} color="#64748B" />
              </button>
              <button
                onClick={onDeleteClick}
                disabled={qualificationUsage[qualification.id] > 0}
                style={{
                  padding: '4px',
                  borderRadius: '4px',
                  cursor: qualificationUsage[qualification.id] > 0 ? 'not-allowed' : 'pointer',
                  background: 'white',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.1s ease',
                  color: '#64748B',
                  width: '24px',
                  height: '24px',
                  opacity: qualificationUsage[qualification.id] > 0 ? 0.5 : 1
                }}
                title={qualificationUsage[qualification.id] > 0 ? "Cannot delete a qualification in use" : "Delete qualification"}
                onMouseEnter={(e) => {
                  if (qualificationUsage[qualification.id] === 0) {
                    e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.15)';
                    e.currentTarget.style.background = '#F8FAFC';
                  }
                }}
                onMouseLeave={(e) => {
                  if (qualificationUsage[qualification.id] === 0) {
                    e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                    e.currentTarget.style.background = 'white';
                  }
                }}
              >
                <Trash size={14} color={qualificationUsage[qualification.id] > 0 ? "#9CA3AF" : "#64748B"} />
              </button>
            </>
          )}
        </div>
      </div>
    );
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
    paddingBottom: '8px', // Reduced from 32px to 8px
    borderTop: '1px solid #E5E7EB',
    marginTop: '8px' // Reduced from 32px to 8px
  };

  const firstSectionStyle = {
    paddingTop: '0',
    paddingBottom: '8px', // Reduced from 32px to 8px to match sectionStyle
    marginTop: '0',
    borderTop: 'none'
  };

  return (
    <div style={containerStyle}>
      <div style={contentWrapperStyle}>
        {/* Header */}
        <div style={headerStyle}>
          <h2 style={{ fontSize: '24px', fontWeight: 600, margin: 0, color: '#0F172A' }}>
            Roster Settings
          </h2>
          <p style={{ fontSize: '14px', color: '#64748B', margin: '8px 0 0 0', fontFamily: 'Inter' }}>
            Configure statuses, roles, and qualifications for squadron personnel.
          </p>
        </div>

        {(error || localError) && (
          <div style={{
            padding: '16px',
            marginBottom: '24px',
            backgroundColor: '#FEF2F2',
            border: '1px solid #FECACA',
            color: '#DC2626',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            fontFamily: 'Inter',
            fontSize: '14px'
          }} role="alert">
            <AlertCircle size={18} style={{ marginRight: '8px' }} />
            <span>{error || localError}</span>
            <button onClick={() => setErrorMessage(null)} style={{
              marginLeft: 'auto',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px'
            }}>
              <X size={16} />
            </button>
          </div>
        )}
        {/* Statuses Section */}
        <div style={firstSectionStyle}>
          <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#0F172A', margin: '0 0 16px 0' }}>
            Statuses
          </h3>
          <p style={{ fontSize: '14px', color: '#64748B', margin: '0 0 24px 0', fontFamily: 'Inter' }}>
            Define the status options available for pilots in the squadron roster.
          </p>
          
          {/* Status Table and Add Button Container */}
          <div style={{
            width: 'fit-content'
          }}>
            {/* Status Table */}
            <div style={{
              border: '1px solid #E5E7EB',
              borderRadius: '6px',
              backgroundColor: '#FFFFFF'
            }}>
            {/* Table Header */}
            <div style={{
              display: 'flex',
              backgroundColor: '#F9FAFB',
              borderBottom: '1px solid #E5E7EB',
              borderRadius: '6px 6px 0 0'
            }}>
              <div style={{
                padding: '4px',
                fontSize: '12px',
                fontWeight: 500,
                color: '#6B7280',
                textTransform: 'uppercase',
                width: '24px',
                textAlign: 'center'
              }}>

              </div>
              <div style={{
                padding: '8px 12px',
                fontSize: '12px',
                fontWeight: 500,
                color: '#6B7280',
                textTransform: 'uppercase',
                width: '220px',
                borderRight: '1px solid #E5E7EB'
              }}>
                Status Name
              </div>
              <div style={{
                padding: '8px 12px',
                fontSize: '12px',
                fontWeight: 500,
                color: '#6B7280',
                textTransform: 'uppercase',
                width: '120px',
                borderRight: '1px solid #E5E7EB',
                textAlign: 'center'
              }}>
                Sort Order
              </div>
              <div style={{
                padding: '8px 12px',
                fontSize: '12px',
                fontWeight: 500,
                color: '#6B7280',
                textTransform: 'uppercase',
                width: '100px',
                borderRight: '1px solid #E5E7EB',
                textAlign: 'center'
              }}>
                Active
              </div>
              <div style={{
                width: '100px',
                padding: '8px 12px',
                fontSize: '12px',
                fontWeight: 500,
                color: '#6B7280',
                textTransform: 'uppercase',
                textAlign: 'center'
              }}>
                Actions
              </div>
            </div>

            {/* Table Body */}
            {!loading && statuses.length > 0 ? (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleStatusDragEnd}
                modifiers={[restrictToVerticalAxis]}
              >
                <SortableContext
                  items={statuses.map(status => status.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {statuses.map((status) => (
                    <SortableStatusRow
                      key={status.id}
                      status={status}
                      onEditClick={() => handleStartEditStatus(status)}
                      onDeleteClick={() => handleDeleteStatus(status)}
                      onToggleActive={() => handleToggleStatusActive(status)}
                      statusUsage={statusUsage}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            ) : (
              loading ? (
                <div style={{
                  padding: '40px',
                  textAlign: 'center',
                  color: '#6B7280',
                  fontSize: '14px'
                }}>
                  Loading statuses...
                </div>
              ) : (
                <div style={{
                  padding: '40px',
                  textAlign: 'center',
                  color: '#6B7280',
                  fontSize: '14px'
                }}>
                  No statuses found
                </div>
              )
            )}
            </div>

            {/* Add Button */}
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              padding: '4px 0'
            }}>
            <button
              onClick={() => setIsAddingStatus(true)}
              disabled={loading}
              style={{
                width: '119px',
                height: '30px',
                background: '#FFFFFF',
                borderRadius: '8px',
                border: 'none',
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'box-shadow 0.2s ease-in-out',
                fontFamily: 'Inter',
                fontStyle: 'normal',
                fontWeight: 400,
                fontSize: '20px',
                lineHeight: '24px',
                color: '#64748B',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: loading ? 0.5 : 1
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.currentTarget.style.boxShadow = '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)';
                }
              }}
              onMouseLeave={(e) => {
                if (!loading) {
                  e.currentTarget.style.boxShadow = 'none';
                }
              }}
            >
              +
            </button>
            </div>
          </div>
        </div>

        {/* Standings Section */}
        <div style={sectionStyle}>
          <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#0F172A', margin: '0 0 16px 0' }}>
            Standings
          </h3>
          <p style={{ fontSize: '14px', color: '#64748B', margin: '0 0 24px 0', fontFamily: 'Inter' }}>
            Define the organizational hierarchy standings available for pilots.
          </p>
          
          {/* Standings Table and Add Button Container */}
          <div style={{
            width: 'fit-content'
          }}>
            {/* Standings Table */}
            <div style={{
              border: '1px solid #E5E7EB',
              borderRadius: '6px',
              backgroundColor: '#FFFFFF'
            }}>
            {/* Table Header */}
            <div style={{
              display: 'flex',
              backgroundColor: '#F9FAFB',
              borderBottom: '1px solid #E5E7EB',
              borderRadius: '6px 6px 0 0'
            }}>
              <div style={{
                padding: '4px',
                fontSize: '12px',
                fontWeight: 500,
                color: '#6B7280',
                textTransform: 'uppercase',
                width: '24px',
                textAlign: 'center'
              }}>

              </div>
              <div style={{
                padding: '8px 12px',
                fontSize: '12px',
                fontWeight: 500,
                color: '#6B7280',
                textTransform: 'uppercase',
                width: '220px',
                borderRight: '1px solid #E5E7EB'
              }}>
                Standing Name
              </div>
              <div style={{
                padding: '8px 12px',
                fontSize: '12px',
                fontWeight: 500,
                color: '#6B7280',
                textTransform: 'uppercase',
                width: '120px',
                borderRight: '1px solid #E5E7EB',
                textAlign: 'center'
              }}>
                Sort Order
              </div>
              <div style={{
                width: '100px',
                padding: '8px 12px',
                fontSize: '12px',
                fontWeight: 500,
                color: '#6B7280',
                textTransform: 'uppercase',
                textAlign: 'center'
              }}>
                Actions
              </div>
            </div>

            {/* Table Body */}
            {standings.length > 0 ? (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleStandingDragEnd}
                modifiers={[restrictToVerticalAxis]}
              >
                <SortableContext
                  items={standings.map(standing => standing.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {standings.sort((a, b) => a.order - b.order).map((standing) => (
                    <SortableStandingRow
                      key={standing.id}
                      standing={standing}
                      onEditClick={() => handleStartEditStanding(standing)}
                      onDeleteClick={() => handleDeleteStanding(standing.id)}
                      standingUsage={standingUsage}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            ) : (
              <div style={{
                padding: '40px',
                textAlign: 'center',
                color: '#6B7280',
                fontSize: '14px'
              }}>
                No standings found
              </div>
            )}
            </div>

            {/* Add Button */}
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              padding: '4px 0'
            }}>
            <button
              onClick={() => setIsAddingStanding(true)}
              disabled={loading}
              style={{
                width: '119px',
                height: '30px',
                background: '#FFFFFF',
                borderRadius: '8px',
                border: 'none',
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'box-shadow 0.2s ease-in-out',
                fontFamily: 'Inter',
                fontStyle: 'normal',
                fontWeight: 400,
                fontSize: '20px',
                lineHeight: '24px',
                color: '#64748B',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: loading ? 0.5 : 1
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.currentTarget.style.boxShadow = '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)';
                }
              }}
              onMouseLeave={(e) => {
                if (!loading) {
                  e.currentTarget.style.boxShadow = 'none';
                }
              }}
            >
              +
            </button>
            </div>
          </div>
        </div>

        {/* Billets Section */}
        <div style={sectionStyle}>
          <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#0F172A', margin: '0 0 16px 0' }}>
            Billets
          </h3>
          <p style={{ fontSize: '14px', color: '#64748B', margin: '0 0 24px 0', fontFamily: 'Inter' }}>
            Define the billet options available for pilots in the squadron roster. Drag billets to reorder them.
          </p>
          
          {/* Roles Table and Add Button Container */}
          <div style={{
            width: 'fit-content'
          }}>
            {/* Roles Table */}
            <div style={{
              border: '1px solid #E5E7EB',
              borderRadius: '6px',
              backgroundColor: '#FFFFFF'
            }}>
            {/* Table Header */}
            <div style={{
              display: 'flex',
              backgroundColor: '#F9FAFB',
              borderBottom: '1px solid #E5E7EB',
              borderRadius: '6px 6px 0 0'
            }}>
              <div style={{
                padding: '4px',
                fontSize: '12px',
                fontWeight: 500,
                color: '#6B7280',
                textTransform: 'uppercase',
                width: '24px',
                textAlign: 'center'
              }}>

              </div>
              <div style={{
                padding: '8px 12px',
                fontSize: '12px',
                fontWeight: 500,
                color: '#6B7280',
                textTransform: 'uppercase',
                width: '220px',
                borderRight: '1px solid #E5E7EB'
              }}>
                Role Name
              </div>
              <div style={{
                padding: '8px 12px',
                fontSize: '12px',
                fontWeight: 500,
                color: '#6B7280',
                textTransform: 'uppercase',
                width: '120px',
                borderRight: '1px solid #E5E7EB',
                textAlign: 'center'
              }}>
                Sort Order
              </div>
              <div style={{
                padding: '8px 12px',
                fontSize: '12px',
                fontWeight: 500,
                color: '#6B7280',
                textTransform: 'uppercase',
                width: '100px',
                borderRight: '1px solid #E5E7EB',
                textAlign: 'center'
              }}>
                Exclusivity
              </div>
              <div style={{
                width: '100px',
                padding: '8px 12px',
                fontSize: '12px',
                fontWeight: 500,
                color: '#6B7280',
                textTransform: 'uppercase',
                textAlign: 'center'
              }}>
                Actions
              </div>
            </div>

            {/* Table Body */}
            {!loading && roles.length > 0 ? (
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
            ) : (
              loading ? (
                <div style={{
                  padding: '40px',
                  textAlign: 'center',
                  color: '#6B7280',
                  fontSize: '14px'
                }}>
                  Loading roles...
                </div>
              ) : (
                <div style={{
                  padding: '40px',
                  textAlign: 'center',
                  color: '#6B7280',
                  fontSize: '14px'
                }}>
                  No roles found
                </div>
              )
            )}
            </div>

            {/* Add Button */}
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              padding: '4px 0'
            }}>
            <button
              onClick={() => setIsAddingRole(true)}
              disabled={loading}
              style={{
                width: '119px',
                height: '30px',
                background: '#FFFFFF',
                borderRadius: '8px',
                border: 'none',
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'box-shadow 0.2s ease-in-out',
                fontFamily: 'Inter',
                fontStyle: 'normal',
                fontWeight: 400,
                fontSize: '20px',
                lineHeight: '24px',
                color: '#64748B',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: loading ? 0.5 : 1
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.currentTarget.style.boxShadow = '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)';
                }
              }}
              onMouseLeave={(e) => {
                if (!loading) {
                  e.currentTarget.style.boxShadow = 'none';
                }
              }}
            >
              +
            </button>
            </div>
          </div>
        </div>

        {/* Qualifications Section */}
        <div style={sectionStyle}>
          <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#0F172A', margin: '0 0 16px 0' }}>
            Qualifications
          </h3>
          <p style={{ fontSize: '14px', color: '#64748B', margin: '0 0 24px 0', fontFamily: 'Inter' }}>
            Define the qualifications that can be assigned to pilots.
          </p>
          
          {/* Qualifications Table and Add Button Container */}
          <div style={{
            width: 'fit-content'
          }}>
            {/* Qualifications Table */}
            <div style={{
              border: '1px solid #E5E7EB',
              borderRadius: '6px',
              backgroundColor: '#FFFFFF'
            }}>
            {/* Table Header */}
            <div style={{
              display: 'flex',
              backgroundColor: '#F9FAFB',
              borderBottom: '1px solid #E5E7EB',
              borderRadius: '6px 6px 0 0'
            }}>
              <div style={{
                padding: '4px',
                fontSize: '12px',
                fontWeight: 500,
                color: '#6B7280',
                textTransform: 'uppercase',
                width: '24px',
                textAlign: 'center'
              }}>

              </div>
              <div style={{
                padding: '8px 12px',
                fontSize: '12px',
                fontWeight: 500,
                color: '#6B7280',
                textTransform: 'uppercase',
                width: '285px',
                borderRight: '1px solid #E5E7EB'
              }}>
                Qualification
              </div>
              <div style={{
                padding: '8px 12px',
                fontSize: '12px',
                fontWeight: 500,
                color: '#6B7280',
                textTransform: 'uppercase',
                width: '100px',
                borderRight: '1px solid #E5E7EB',
                textAlign: 'center'
              }}>
                Sort Order
              </div>
              <div style={{
                padding: '8px 12px',
                fontSize: '12px',
                fontWeight: 500,
                color: '#6B7280',
                textTransform: 'uppercase',
                width: '120px',
                borderRight: '1px solid #E5E7EB',
                textAlign: 'center'
              }}>
                Expires After
              </div>
              <div style={{
                width: '100px',
                padding: '8px 12px',
                fontSize: '12px',
                fontWeight: 500,
                color: '#6B7280',
                textTransform: 'uppercase',
                textAlign: 'center'
              }}>
                Actions
              </div>
            </div>

            {/* Table Body */}
            {!loading && qualifications.length > 0 ? (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleQualificationDragEnd}
                modifiers={[restrictToVerticalAxis]}
              >
                <SortableContext
                  items={qualifications.map(qualification => qualification.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {qualifications.map((qualification) => (
                    <SortableQualificationRow
                      key={qualification.id}
                      qualification={qualification}
                      onEditClick={() => handleStartEditQualification(qualification)}
                      onDeleteClick={() => handleDeleteQualification(qualification)}
                      qualificationUsage={qualificationUsage}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            ) : (
              loading ? (
                <div style={{
                  padding: '40px',
                  textAlign: 'center',
                  color: '#6B7280',
                  fontSize: '14px'
                }}>
                  Loading qualifications...
                </div>
              ) : (
                <div style={{
                  padding: '40px',
                  textAlign: 'center',
                  color: '#6B7280',
                  fontSize: '14px'
                }}>
                  No qualifications found
                </div>
              )
            )}
            </div>

            {/* Add Button */}
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              padding: '4px 0'
            }}>
            <button
              onClick={() => {
                // Reset form fields when opening modal
                setNewQualificationName('');
                setNewQualificationCode('');
                setNewQualificationCategory('');
                setNewQualificationRequirements('{}');
                setNewQualificationIsExpirable(false);
                setNewQualificationValidityPeriod(null);
                setNewQualificationActive(true);
                setNewQualificationColor('#646F7E');
                setErrorMessage('');
                setIsAddingQualification(true);
              }}
              disabled={loading}
              style={{
                width: '119px',
                height: '30px',
                background: '#FFFFFF',
                borderRadius: '8px',
                border: 'none',
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'box-shadow 0.2s ease-in-out',
                fontFamily: 'Inter',
                fontStyle: 'normal',
                fontWeight: 400,
                fontSize: '20px',
                lineHeight: '24px',
                color: '#64748B',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: loading ? 0.5 : 1
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.currentTarget.style.boxShadow = '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)';
                }
              }}
              onMouseLeave={(e) => {
                if (!loading) {
                  e.currentTarget.style.boxShadow = 'none';
                }
              }}
            >
              +
            </button>
            </div>
          </div>
        </div>

      </div>

      {/* Add Qualification Modal */}
      {isAddingQualification && (
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
            zIndex: 1000
          }}
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
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '8px',
              padding: '24px',
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)',
              width: '600px',
              maxWidth: '90vw',
              maxHeight: '80vh',
              overflowY: 'auto',
              zIndex: 1001
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{
              fontSize: '18px',
              fontWeight: 600,
              color: '#1F2937',
              marginBottom: '24px',
              textAlign: 'center',
              fontFamily: 'Inter'
            }}>
              Add New Qualification
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', gap: '16px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: 500,
                    color: '#374151',
                    marginBottom: '6px',
                    fontFamily: 'Inter'
                  }}>
                    Name *
                  </label>
                  <input
                    type="text"
                    value={newQualificationName}
                    onChange={(e) => setNewQualificationName(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: '1px solid #D1D5DB',
                      borderRadius: '6px',
                      fontSize: '14px',
                      backgroundColor: '#FFFFFF',
                      outline: 'none',
                      fontFamily: 'Inter',
                      boxSizing: 'border-box'
                    }}
                    placeholder="Qualification name"
                    autoFocus
                  />
                </div>
                <div style={{ width: '120px' }}>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: 500,
                    color: '#374151',
                    marginBottom: '6px',
                    fontFamily: 'Inter'
                  }}>
                    Code *
                  </label>
                  <input
                    type="text"
                    value={newQualificationCode}
                    onChange={(e) => setNewQualificationCode(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: '1px solid #D1D5DB',
                      borderRadius: '6px',
                      fontSize: '14px',
                      backgroundColor: '#FFFFFF',
                      outline: 'none',
                      fontFamily: 'Inter',
                      boxSizing: 'border-box'
                    }}
                    placeholder="FL, SL, etc."
                  />
                </div>
              </div>

              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#374151',
                  marginBottom: '6px',
                  fontFamily: 'Inter'
                }}>
                  Category
                </label>
                <input
                  type="text"
                  value={newQualificationCategory}
                  onChange={(e) => setNewQualificationCategory(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #D1D5DB',
                    borderRadius: '6px',
                    fontSize: '14px',
                    backgroundColor: '#FFFFFF',
                    outline: 'none',
                    fontFamily: 'Inter',
                    boxSizing: 'border-box'
                  }}
                  placeholder="Leadership, Carrier Ops, etc."
                />
              </div>

              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#374151',
                  marginBottom: '6px',
                  fontFamily: 'Inter'
                }}>
                  Requirements (JSON)
                </label>
                <textarea
                  value={newQualificationRequirements}
                  onChange={(e) => setNewQualificationRequirements(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #D1D5DB',
                    borderRadius: '6px',
                    fontSize: '12px',
                    backgroundColor: '#FFFFFF',
                    outline: 'none',
                    fontFamily: 'monospace',
                    boxSizing: 'border-box',
                    minHeight: '80px',
                    resize: 'vertical'
                  }}
                  placeholder="{}"
                />
              </div>

              <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: 500,
                    color: '#374151',
                    marginBottom: '6px',
                    fontFamily: 'Inter'
                  }}>
                    Color
                  </label>
                  <input
                    type="color"
                    value={newQualificationColor}
                    onChange={(e) => setNewQualificationColor(e.target.value)}
                    style={{
                      width: '60px',
                      height: '38px',
                      padding: '0',
                      border: '1px solid #D1D5DB',
                      borderRadius: '6px',
                      backgroundColor: '#FFFFFF',
                      outline: 'none',
                      cursor: 'pointer'
                    }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      id="new-qual-active-modal"
                      checked={newQualificationActive}
                      onChange={() => setNewQualificationActive(!newQualificationActive)}
                      style={{ marginRight: '8px' }}
                    />
                    <label htmlFor="new-qual-active-modal" style={{
                      fontSize: '14px',
                      color: '#374151',
                      fontFamily: 'Inter',
                      cursor: 'pointer'
                    }}>
                      Active
                    </label>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      id="new-qual-expiry-modal"
                      checked={newQualificationIsExpirable}
                      onChange={() => setNewQualificationIsExpirable(!newQualificationIsExpirable)}
                      style={{ marginRight: '8px' }}
                    />
                    <label htmlFor="new-qual-expiry-modal" style={{
                      fontSize: '14px',
                      color: '#374151',
                      fontFamily: 'Inter',
                      cursor: 'pointer'
                    }}>
                      Expires
                    </label>
                  </div>
                </div>
              </div>

              {newQualificationIsExpirable && (
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: 500,
                    color: '#374151',
                    marginBottom: '6px',
                    fontFamily: 'Inter'
                  }}>
                    Days Valid
                  </label>
                  <input
                    type="number"
                    value={newQualificationValidityPeriod || ''}
                    onChange={(e) => setNewQualificationValidityPeriod(e.target.value ? parseInt(e.target.value) : null)}
                    style={{
                      width: '120px',
                      padding: '8px 12px',
                      border: '1px solid #D1D5DB',
                      borderRadius: '6px',
                      fontSize: '14px',
                      backgroundColor: '#FFFFFF',
                      outline: 'none',
                      fontFamily: 'Inter',
                      boxSizing: 'border-box'
                    }}
                    placeholder="365"
                    min="1"
                  />
                </div>
              )}
            </div>

            <div style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '12px',
              marginTop: '24px',
              paddingTop: '16px',
              borderTop: '1px solid #E5E7EB'
            }}>
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
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#FFFFFF',
                  color: '#6B7280',
                  border: '1px solid #D1D5DB',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  fontFamily: 'Inter',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#F9FAFB';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#FFFFFF';
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleAddQualification}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#16A34A',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  fontFamily: 'Inter',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#15803D';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#16A34A';
                }}
              >
                Add Qualification
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Qualification Modal */}
      {editingQualificationId && (
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
            zIndex: 1000
          }}
          onClick={handleCancelEditQualification}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '8px',
              padding: '24px',
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)',
              width: '600px',
              maxWidth: '90vw',
              maxHeight: '80vh',
              overflowY: 'auto',
              zIndex: 1001
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <h2 style={{
              fontSize: '18px',
              fontWeight: 600,
              color: '#1F2937',
              marginBottom: '24px',
              textAlign: 'center',
              fontFamily: 'Inter'
            }}>
              Edit Qualification
            </h2>

            {/* Form Content */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Name and Code Row */}
              <div style={{ display: 'flex', gap: '16px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: 500,
                    color: '#374151',
                    marginBottom: '6px',
                    fontFamily: 'Inter'
                  }}>
                    Name *
                  </label>
                  <input
                    type="text"
                    value={editingQualificationName}
                    onChange={(e) => setEditingQualificationName(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: '1px solid #D1D5DB',
                      borderRadius: '6px',
                      fontSize: '14px',
                      backgroundColor: '#FFFFFF',
                      outline: 'none',
                      fontFamily: 'Inter',
                      boxSizing: 'border-box'
                    }}
                    placeholder="Qualification name"
                    autoFocus
                  />
                </div>
                <div style={{ width: '120px' }}>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: 500,
                    color: '#374151',
                    marginBottom: '6px',
                    fontFamily: 'Inter'
                  }}>
                    Code *
                  </label>
                  <input
                    type="text"
                    value={editingQualificationCode}
                    onChange={(e) => setEditingQualificationCode(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: '1px solid #D1D5DB',
                      borderRadius: '6px',
                      fontSize: '14px',
                      backgroundColor: '#FFFFFF',
                      outline: 'none',
                      fontFamily: 'Inter',
                      boxSizing: 'border-box'
                    }}
                    placeholder="FL, SL, etc."
                  />
                </div>
              </div>

              {/* Category */}
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#374151',
                  marginBottom: '6px',
                  fontFamily: 'Inter'
                }}>
                  Category
                </label>
                <input
                  type="text"
                  value={editingQualificationCategory}
                  onChange={(e) => setEditingQualificationCategory(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #D1D5DB',
                    borderRadius: '6px',
                    fontSize: '14px',
                    backgroundColor: '#FFFFFF',
                    outline: 'none',
                    fontFamily: 'Inter',
                    boxSizing: 'border-box'
                  }}
                  placeholder="Leadership, Carrier Ops, etc."
                />
              </div>

              {/* Requirements */}
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#374151',
                  marginBottom: '6px',
                  fontFamily: 'Inter'
                }}>
                  Requirements (JSON)
                </label>
                <textarea
                  value={editingQualificationRequirements}
                  onChange={(e) => setEditingQualificationRequirements(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #D1D5DB',
                    borderRadius: '6px',
                    fontSize: '12px',
                    backgroundColor: '#FFFFFF',
                    outline: 'none',
                    fontFamily: 'monospace',
                    boxSizing: 'border-box',
                    minHeight: '80px',
                    resize: 'vertical'
                  }}
                  placeholder="{}"
                />
              </div>

              {/* Color and Settings Row */}
              <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: 500,
                    color: '#374151',
                    marginBottom: '6px',
                    fontFamily: 'Inter'
                  }}>
                    Color
                  </label>
                  <input
                    type="color"
                    value={editingQualificationColor}
                    onChange={(e) => setEditingQualificationColor(e.target.value)}
                    style={{
                      width: '60px',
                      height: '38px',
                      padding: '0',
                      border: '1px solid #D1D5DB',
                      borderRadius: '6px',
                      backgroundColor: '#FFFFFF',
                      outline: 'none',
                      cursor: 'pointer'
                    }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {/* Active Checkbox */}
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      id="edit-qual-active-modal"
                      checked={editingQualificationActive}
                      onChange={() => setEditingQualificationActive(!editingQualificationActive)}
                      style={{ marginRight: '8px' }}
                    />
                    <label htmlFor="edit-qual-active-modal" style={{
                      fontSize: '14px',
                      color: '#374151',
                      fontFamily: 'Inter',
                      cursor: 'pointer'
                    }}>
                      Active
                    </label>
                  </div>

                  {/* Expires Checkbox */}
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      id="edit-qual-expiry-modal"
                      checked={editingQualificationIsExpirable}
                      onChange={() => setEditingQualificationIsExpirable(!editingQualificationIsExpirable)}
                      style={{ marginRight: '8px' }}
                    />
                    <label htmlFor="edit-qual-expiry-modal" style={{
                      fontSize: '14px',
                      color: '#374151',
                      fontFamily: 'Inter',
                      cursor: 'pointer'
                    }}>
                      Expires
                    </label>
                  </div>
                </div>
              </div>

              {/* Validity Period */}
              {editingQualificationIsExpirable && (
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: 500,
                    color: '#374151',
                    marginBottom: '6px',
                    fontFamily: 'Inter'
                  }}>
                    Days Valid
                  </label>
                  <input
                    type="number"
                    value={editingQualificationValidityPeriod || ''}
                    onChange={(e) => setEditingQualificationValidityPeriod(e.target.value ? parseInt(e.target.value) : null)}
                    style={{
                      width: '120px',
                      padding: '8px 12px',
                      border: '1px solid #D1D5DB',
                      borderRadius: '6px',
                      fontSize: '14px',
                      backgroundColor: '#FFFFFF',
                      outline: 'none',
                      fontFamily: 'Inter',
                      boxSizing: 'border-box'
                    }}
                    placeholder="365"
                    min="1"
                  />
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '12px',
              marginTop: '24px',
              paddingTop: '16px',
              borderTop: '1px solid #E5E7EB'
            }}>
              <button
                onClick={handleCancelEditQualification}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#FFFFFF',
                  color: '#6B7280',
                  border: '1px solid #D1D5DB',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  fontFamily: 'Inter',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#F9FAFB';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#FFFFFF';
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveQualification}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#3B82F6',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  fontFamily: 'Inter',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#2563EB';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#3B82F6';
                }}
              >
                Update Qualification
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Status Modal */}
      {isAddingStatus && (
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
            zIndex: 1000
          }}
          onClick={() => {
            setIsAddingStatus(false);
            setNewStatusName('');
            setNewStatusIsActive(true);
          }}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '8px',
              padding: '24px',
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)',
              width: '400px',
              maxWidth: '90vw',
              zIndex: 1001
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{
              fontSize: '18px',
              fontWeight: 600,
              color: '#1F2937',
              marginBottom: '24px',
              textAlign: 'center',
              fontFamily: 'Inter'
            }}>
              Add New Status
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#374151',
                  marginBottom: '6px',
                  fontFamily: 'Inter'
                }}>
                  Status Name *
                </label>
                <input
                  type="text"
                  value={newStatusName}
                  onChange={(e) => setNewStatusName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #D1D5DB',
                    borderRadius: '6px',
                    fontSize: '14px',
                    backgroundColor: '#FFFFFF',
                    outline: 'none',
                    fontFamily: 'Inter',
                    boxSizing: 'border-box'
                  }}
                  placeholder="Enter status name"
                  autoFocus
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center' }}>
                <input
                  type="checkbox"
                  id="new-status-active"
                  checked={newStatusIsActive}
                  onChange={() => setNewStatusIsActive(!newStatusIsActive)}
                  style={{ marginRight: '8px' }}
                />
                <label htmlFor="new-status-active" style={{
                  fontSize: '14px',
                  color: '#374151',
                  fontFamily: 'Inter',
                  cursor: 'pointer'
                }}>
                  Active
                </label>
              </div>
            </div>

            <div style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '12px',
              marginTop: '24px',
              paddingTop: '16px',
              borderTop: '1px solid #E5E7EB'
            }}>
              <button
                onClick={() => {
                  setIsAddingStatus(false);
                  setNewStatusName('');
                  setNewStatusIsActive(true);
                }}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#FFFFFF',
                  color: '#6B7280',
                  border: '1px solid #D1D5DB',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  fontFamily: 'Inter',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#F9FAFB';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#FFFFFF';
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleAddStatus}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#16A34A',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  fontFamily: 'Inter',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#15803D';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#16A34A';
                }}
              >
                Add Status
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Status Modal */}
      {editingStatusId && (
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
            zIndex: 1000
          }}
          onClick={() => {
            setEditingStatusId(null);
            setEditingStatusName('');
            setEditingStatusIsActive(true);
          }}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '8px',
              padding: '24px',
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)',
              width: '400px',
              maxWidth: '90vw',
              zIndex: 1001
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{
              fontSize: '18px',
              fontWeight: 600,
              color: '#1F2937',
              marginBottom: '24px',
              textAlign: 'center',
              fontFamily: 'Inter'
            }}>
              Edit Status
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#374151',
                  marginBottom: '6px',
                  fontFamily: 'Inter'
                }}>
                  Status Name *
                </label>
                <input
                  type="text"
                  value={editingStatusName}
                  onChange={(e) => setEditingStatusName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #D1D5DB',
                    borderRadius: '6px',
                    fontSize: '14px',
                    backgroundColor: '#FFFFFF',
                    outline: 'none',
                    fontFamily: 'Inter',
                    boxSizing: 'border-box'
                  }}
                  placeholder="Enter status name"
                  autoFocus
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center' }}>
                <input
                  type="checkbox"
                  id="edit-status-active"
                  checked={editingStatusIsActive}
                  onChange={() => setEditingStatusIsActive(!editingStatusIsActive)}
                  style={{ marginRight: '8px' }}
                />
                <label htmlFor="edit-status-active" style={{
                  fontSize: '14px',
                  color: '#374151',
                  fontFamily: 'Inter',
                  cursor: 'pointer'
                }}>
                  Active
                </label>
              </div>
            </div>

            <div style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '12px',
              marginTop: '24px',
              paddingTop: '16px',
              borderTop: '1px solid #E5E7EB'
            }}>
              <button
                onClick={() => {
                  setEditingStatusId(null);
                  setEditingStatusName('');
                  setEditingStatusIsActive(true);
                }}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#FFFFFF',
                  color: '#6B7280',
                  border: '1px solid #D1D5DB',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  fontFamily: 'Inter',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#F9FAFB';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#FFFFFF';
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveStatus}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#3B82F6',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  fontFamily: 'Inter',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#2563EB';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#3B82F6';
                }}
              >
                Update Status
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Standing Modal */}
      {isAddingStanding && (
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
            zIndex: 1000
          }}
          onClick={() => {
            setIsAddingStanding(false);
            setNewStandingName('');
          }}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '8px',
              padding: '24px',
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)',
              width: '400px',
              maxWidth: '90vw',
              zIndex: 1001
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{
              fontSize: '18px',
              fontWeight: 600,
              color: '#1F2937',
              marginBottom: '24px',
              textAlign: 'center',
              fontFamily: 'Inter'
            }}>
              Add New Standing
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#374151',
                  marginBottom: '6px',
                  fontFamily: 'Inter'
                }}>
                  Standing Name *
                </label>
                <input
                  type="text"
                  value={newStandingName}
                  onChange={(e) => setNewStandingName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #D1D5DB',
                    borderRadius: '6px',
                    fontSize: '14px',
                    backgroundColor: '#FFFFFF',
                    outline: 'none',
                    fontFamily: 'Inter',
                    boxSizing: 'border-box'
                  }}
                  placeholder="Enter standing name"
                  autoFocus
                />
              </div>
            </div>

            <div style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '12px',
              marginTop: '24px',
              paddingTop: '16px',
              borderTop: '1px solid #E5E7EB'
            }}>
              <button
                onClick={() => {
                  setIsAddingStanding(false);
                  setNewStandingName('');
                }}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#FFFFFF',
                  color: '#6B7280',
                  border: '1px solid #D1D5DB',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  fontFamily: 'Inter',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#F9FAFB';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#FFFFFF';
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleAddStanding}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#16A34A',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  fontFamily: 'Inter',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#15803D';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#16A34A';
                }}
              >
                Add Standing
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Standing Modal */}
      {editingStandingId && (
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
            zIndex: 1000
          }}
          onClick={() => {
            setEditingStandingId(null);
            setEditingStandingName('');
          }}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '8px',
              padding: '24px',
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)',
              width: '400px',
              maxWidth: '90vw',
              zIndex: 1001
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{
              fontSize: '18px',
              fontWeight: 600,
              color: '#1F2937',
              marginBottom: '24px',
              textAlign: 'center',
              fontFamily: 'Inter'
            }}>
              Edit Standing
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#374151',
                  marginBottom: '6px',
                  fontFamily: 'Inter'
                }}>
                  Standing Name *
                </label>
                <input
                  type="text"
                  value={editingStandingName}
                  onChange={(e) => setEditingStandingName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #D1D5DB',
                    borderRadius: '6px',
                    fontSize: '14px',
                    backgroundColor: '#FFFFFF',
                    outline: 'none',
                    fontFamily: 'Inter',
                    boxSizing: 'border-box'
                  }}
                  placeholder="Enter standing name"
                  autoFocus
                />
              </div>
            </div>

            <div style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '12px',
              marginTop: '24px',
              paddingTop: '16px',
              borderTop: '1px solid #E5E7EB'
            }}>
              <button
                onClick={() => {
                  setEditingStandingId(null);
                  setEditingStandingName('');
                }}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#FFFFFF',
                  color: '#6B7280',
                  border: '1px solid #D1D5DB',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  fontFamily: 'Inter',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#F9FAFB';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#FFFFFF';
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveStanding}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#3B82F6',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  fontFamily: 'Inter',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#2563EB';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#3B82F6';
                }}
              >
                Update Standing
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Role Modal */}
      {isAddingRole && (
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
            zIndex: 1000
          }}
          onClick={() => {
            setIsAddingRole(false);
            setNewRoleName('');
            setNewRoleIsExclusive(false);
            setNewRoleCompatibleStatuses([]);
          }}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '8px',
              padding: '24px',
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)',
              width: '500px',
              maxWidth: '90vw',
              maxHeight: '80vh',
              overflowY: 'auto',
              zIndex: 1001
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{
              fontSize: '18px',
              fontWeight: 600,
              color: '#1F2937',
              marginBottom: '24px',
              textAlign: 'center',
              fontFamily: 'Inter'
            }}>
              Add New Role
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#374151',
                  marginBottom: '6px',
                  fontFamily: 'Inter'
                }}>
                  Role Name *
                </label>
                <input
                  type="text"
                  value={newRoleName}
                  onChange={(e) => setNewRoleName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #D1D5DB',
                    borderRadius: '6px',
                    fontSize: '14px',
                    backgroundColor: '#FFFFFF',
                    outline: 'none',
                    fontFamily: 'Inter',
                    boxSizing: 'border-box'
                  }}
                  placeholder="Enter role name"
                  autoFocus
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center' }}>
                <input
                  type="checkbox"
                  id="new-role-exclusive"
                  checked={newRoleIsExclusive}
                  onChange={() => setNewRoleIsExclusive(!newRoleIsExclusive)}
                  style={{ marginRight: '8px' }}
                />
                <label htmlFor="new-role-exclusive" style={{
                  fontSize: '14px',
                  color: '#374151',
                  fontFamily: 'Inter',
                  cursor: 'pointer'
                }}>
                  Exclusive (only one pilot can have this role)
                </label>
              </div>

              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#374151',
                  marginBottom: '8px',
                  fontFamily: 'Inter'
                }}>
                  Compatible Statuses
                </label>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                  gap: '8px',
                  padding: '12px',
                  border: '1px solid #D1D5DB',
                  borderRadius: '6px',
                  backgroundColor: '#F9FAFB'
                }}>
                  {statuses.map(status => (
                    <label key={status.id} style={{
                      display: 'flex',
                      alignItems: 'center',
                      fontSize: '14px',
                      fontFamily: 'Inter',
                      cursor: 'pointer'
                    }}>
                      <input
                        type="checkbox"
                        checked={newRoleCompatibleStatuses.includes(status.id)}
                        onChange={() => handleToggleCompatibleStatus(status.id, true)}
                        style={{ marginRight: '6px' }}
                      />
                      {status.name}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '12px',
              marginTop: '24px',
              paddingTop: '16px',
              borderTop: '1px solid #E5E7EB'
            }}>
              <button
                onClick={() => {
                  setIsAddingRole(false);
                  setNewRoleName('');
                  setNewRoleIsExclusive(false);
                  setNewRoleCompatibleStatuses([]);
                }}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#FFFFFF',
                  color: '#6B7280',
                  border: '1px solid #D1D5DB',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  fontFamily: 'Inter',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#F9FAFB';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#FFFFFF';
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleAddRole}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#16A34A',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  fontFamily: 'Inter',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#15803D';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#16A34A';
                }}
              >
                Add Role
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Role Modal */}
      {editingRoleId && (
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
            zIndex: 1000
          }}
          onClick={() => {
            setEditingRoleId(null);
            setEditingRoleName('');
            setEditingRoleIsExclusive(false);
            setEditingRoleCompatibleStatuses([]);
          }}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '8px',
              padding: '24px',
              minWidth: '500px',
              maxWidth: '600px',
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              display: 'flex',
              alignItems: 'center',
              marginBottom: '20px'
            }}>
              <h3 style={{
                margin: '0',
                fontSize: '18px',
                fontWeight: '600',
                color: '#1F2937'
              }}>
                Edit Billet
              </h3>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: 500,
                color: '#374151',
                marginBottom: '6px',
                fontFamily: 'Inter'
              }}>
                Billet Name
              </label>
              <input
                type="text"
                value={editingRoleName}
                onChange={(e) => setEditingRoleName(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #D1D5DB',
                  borderRadius: '6px',
                  fontSize: '14px',
                  backgroundColor: '#FFFFFF',
                  fontFamily: 'Inter',
                  boxSizing: 'border-box'
                }}
                placeholder="Enter billet name"
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: 500,
                color: '#374151',
                marginBottom: '6px',
                fontFamily: 'Inter'
              }}>
                Exclusivity
              </label>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <div
                  onClick={() => setEditingRoleIsExclusive(!editingRoleIsExclusive)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 12px',
                    border: '1px solid #D1D5DB',
                    borderRadius: '6px',
                    backgroundColor: editingRoleIsExclusive ? '#3B82F6' : '#F9FAFB',
                    color: editingRoleIsExclusive ? '#FFFFFF' : '#6B7280',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 500,
                    fontFamily: 'Inter',
                    transition: 'all 0.2s ease',
                    minWidth: '100px',
                    justifyContent: 'center'
                  }}
                >
                  {editingRoleIsExclusive ? <Lock size={16} /> : <Unlock size={16} />}
                  {editingRoleIsExclusive ? 'Exclusive' : 'Non-Exclusive'}
                </div>
              </div>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: 500,
                color: '#374151',
                marginBottom: '6px',
                fontFamily: 'Inter'
              }}>
                Compatible Statuses
              </label>
              <div style={{
                border: '1px solid #D1D5DB',
                borderRadius: '6px',
                backgroundColor: '#F9FAFB',
                padding: '12px',
                maxHeight: '120px',
                overflowY: 'auto'
              }}>
                {statuses.map((status) => (
                  <label
                    key={status.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '4px 0',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontFamily: 'Inter'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={editingRoleCompatibleStatuses.includes(status.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setEditingRoleCompatibleStatuses([...editingRoleCompatibleStatuses, status.id]);
                        } else {
                          setEditingRoleCompatibleStatuses(editingRoleCompatibleStatuses.filter(id => id !== status.id));
                        }
                      }}
                      style={{
                        marginRight: '8px'
                      }}
                    />
                    {status.name}
                  </label>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setEditingRoleId(null);
                  setEditingRoleName('');
                  setEditingRoleIsExclusive(false);
                  setEditingRoleCompatibleStatuses([]);
                }}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#FFFFFF',
                  color: '#6B7280',
                  border: '1px solid #D1D5DB',
                  borderRadius: '6px',
                  fontSize: '14px',
                  cursor: 'pointer',
                  fontFamily: 'Inter'
                }}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  try {
                    const { data: updateData, error: updateError } = await updateRole(editingRoleId, {
                      name: editingRoleName,
                      isExclusive: editingRoleIsExclusive,
                      compatible_statuses: editingRoleCompatibleStatuses
                    });

                    if (updateError) {
                      throw new Error(updateError.message);
                    }

                    if (updateData) {
                      setRoles(roles.map(r => r.id === editingRoleId ? updateData : r));
                      setEditingRoleId(null);
                      setEditingRoleName('');
                      setEditingRoleIsExclusive(false);
                      setEditingRoleCompatibleStatuses([]);
                      await refreshRoleUsageCounts();
                    }
                  } catch (err) {
                    console.error('Error updating billet:', err);
                    setErrorMessage(err instanceof Error ? err.message : 'Failed to update billet');
                  }
                }}
                disabled={!editingRoleName.trim()}
                style={{
                  padding: '8px 16px',
                  backgroundColor: !editingRoleName.trim() ? '#9CA3AF' : '#3B82F6',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  cursor: !editingRoleName.trim() ? 'not-allowed' : 'pointer',
                  fontFamily: 'Inter'
                }}
              >
                Update Billet
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RosterSettings;