import React, { useState, useEffect } from 'react';
import { AlertCircle, X } from 'lucide-react';
import { Status, getAllStatuses, createStatus, updateStatus, deleteStatus, getStatusUsageCount, initializeDefaultStatuses } from '../../utils/statusService';
import { Standing, getAllStandings, createStanding, updateStanding, deleteStanding, getStandingUsageCount } from '../../utils/standingService';
import { Role, getAllRoles, createRole, updateRole, deleteRole, getRoleUsageCount, initializeDefaultRoles } from '../../utils/roleService';
import { Qualification, getAllQualifications, createQualification, updateQualification, deleteQualification, getQualificationUsageCount, initializeDefaultQualifications } from '../../utils/qualificationService';
import { DragEndEvent } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { StatusesSection } from './roster/StatusesSection';
import { StandingsSection } from './roster/StandingsSection';
import { RolesSection } from './roster/RolesSection';
import { QualificationsSection } from './roster/QualificationsSection';

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
  const [newRoleExclusivityScope, setNewRoleExclusivityScope] = useState<'none' | 'squadron' | 'wing'>('none');
  const [isAddingRole, setIsAddingRole] = useState(false);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [editingRoleName, setEditingRoleName] = useState('');
  const [editingRoleExclusivityScope, setEditingRoleExclusivityScope] = useState<'none' | 'squadron' | 'wing'>('none');
  const [roleUsage, setRoleUsage] = useState<Record<string, number>>({});

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
        exclusivity_scope: newRoleExclusivityScope,
        order: highestOrder + 10
      });

      if (createError) {
        throw new Error(createError.message);
      }

      if (data) {
        setRoles([...roles, data]);
        setRoleUsage({ ...roleUsage, [data.id]: 0 });
        setNewRoleName('');
        setNewRoleExclusivityScope('none');
        setIsAddingRole(false);
        await refreshRoleUsageCounts();
      }
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleChangeRoleExclusivityScope = async (role: Role, newScope: 'none' | 'squadron' | 'wing') => {
    // Optimistically update the UI immediately
    const optimisticRole = { ...role, exclusivity_scope: newScope };
    setRoles(roles.map(r => r.id === role.id ? optimisticRole : r));

    try {
      const { data, error: updateError } = await updateRole(role.id, {
        exclusivity_scope: newScope
      });

      if (updateError) {
        // Revert on error
        setRoles(roles.map(r => r.id === role.id ? role : r));
        throw new Error(updateError.message);
      }

      // Update with actual data from server (in case it differs)
      if (data) {
        setRoles(roles.map(r => r.id === role.id ? data : r));
      }
    } catch (err: any) {
      setErrorMessage(err.message);
    }
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#FFFFFF' }}>
      {/* Fixed Header */}
      <div style={{ padding: '40px 40px 0 40px', flexShrink: 0 }}>
        <div style={{ maxWidth: '800px', margin: '0 auto', borderBottom: '1px solid #E2E8F0', paddingBottom: '24px' }}>
          <h2 style={{ fontSize: '24px', fontWeight: 600, margin: 0, color: '#0F172A' }}>
            Roster Settings
          </h2>
          <p style={{ fontSize: '14px', color: '#64748B', margin: '8px 0 0 0', fontFamily: 'Inter' }}>
            Configure statuses, roles, and qualifications for squadron personnel.
          </p>
        </div>
      </div>

      {/* Scrollable Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '24px 40px 40px 40px' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
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
          <StatusesSection
            statuses={statuses}
            loading={loading}
            isAddingStatus={isAddingStatus}
            setIsAddingStatus={setIsAddingStatus}
            newStatusName={newStatusName}
            setNewStatusName={setNewStatusName}
            newStatusIsActive={newStatusIsActive}
            setNewStatusIsActive={setNewStatusIsActive}
            handleAddStatus={handleAddStatus}
            editingStatusId={editingStatusId}
            setEditingStatusId={setEditingStatusId}
            editingStatusName={editingStatusName}
            setEditingStatusName={setEditingStatusName}
            editingStatusIsActive={editingStatusIsActive}
            setEditingStatusIsActive={setEditingStatusIsActive}
            handleUpdateStatus={handleSaveStatus}
            handleDeleteStatus={handleDeleteStatus}
            handleToggleStatusActive={handleToggleStatusActive}
            statusUsage={statusUsage}
            handleStatusDragEnd={handleStatusDragEnd}
            firstSectionStyle={firstSectionStyle}
          />

        {/* Standings Section */}
        <StandingsSection
          standings={standings}
          loading={loading}
          isAddingStanding={isAddingStanding}
          setIsAddingStanding={setIsAddingStanding}
          newStandingName={newStandingName}
          setNewStandingName={setNewStandingName}
          handleAddStanding={handleAddStanding}
          editingStandingId={editingStandingId}
          setEditingStandingId={setEditingStandingId}
          editingStandingName={editingStandingName}
          setEditingStandingName={setEditingStandingName}
          handleSaveStanding={handleSaveStanding}
          handleDeleteStanding={handleDeleteStanding}
          standingUsage={standingUsage}
          handleStandingDragEnd={handleStandingDragEnd}
          sectionStyle={sectionStyle}
        />

        {/* Billets Section */}
        <RolesSection
          roles={roles}
          loading={loading}
          isAddingRole={isAddingRole}
          setIsAddingRole={setIsAddingRole}
          newRoleName={newRoleName}
          setNewRoleName={setNewRoleName}
          newRoleExclusivityScope={newRoleExclusivityScope}
          setNewRoleExclusivityScope={setNewRoleExclusivityScope}
          handleAddRole={handleAddRole}
          editingRoleId={editingRoleId}
          setEditingRoleId={setEditingRoleId}
          editingRoleName={editingRoleName}
          setEditingRoleName={setEditingRoleName}
          editingRoleExclusivityScope={editingRoleExclusivityScope}
          setEditingRoleExclusivityScope={setEditingRoleExclusivityScope}
          handleDeleteRole={handleDeleteRole}
          handleChangeRoleExclusivityScope={handleChangeRoleExclusivityScope}
          roleUsage={roleUsage}
          handleDragEnd={handleDragEnd}
          refreshRoleUsageCounts={refreshRoleUsageCounts}
          setErrorMessage={setErrorMessage}
          updateRole={updateRole}
          sectionStyle={sectionStyle}
        />

        {/* Qualifications Section */}
        <QualificationsSection
          qualifications={qualifications}
          loading={loading}
          isAddingQualification={isAddingQualification}
          setIsAddingQualification={setIsAddingQualification}
          newQualificationName={newQualificationName}
          setNewQualificationName={setNewQualificationName}
          newQualificationCode={newQualificationCode}
          setNewQualificationCode={setNewQualificationCode}
          newQualificationCategory={newQualificationCategory}
          setNewQualificationCategory={setNewQualificationCategory}
          newQualificationRequirements={newQualificationRequirements}
          setNewQualificationRequirements={setNewQualificationRequirements}
          newQualificationIsExpirable={newQualificationIsExpirable}
          setNewQualificationIsExpirable={setNewQualificationIsExpirable}
          newQualificationValidityPeriod={newQualificationValidityPeriod}
          setNewQualificationValidityPeriod={setNewQualificationValidityPeriod}
          newQualificationActive={newQualificationActive}
          setNewQualificationActive={setNewQualificationActive}
          newQualificationColor={newQualificationColor}
          setNewQualificationColor={setNewQualificationColor}
          handleAddQualification={handleAddQualification}
          editingQualificationId={editingQualificationId}
          setEditingQualificationId={setEditingQualificationId}
          editingQualificationName={editingQualificationName}
          setEditingQualificationName={setEditingQualificationName}
          editingQualificationCode={editingQualificationCode}
          setEditingQualificationCode={setEditingQualificationCode}
          editingQualificationCategory={editingQualificationCategory}
          setEditingQualificationCategory={setEditingQualificationCategory}
          editingQualificationRequirements={editingQualificationRequirements}
          setEditingQualificationRequirements={setEditingQualificationRequirements}
          editingQualificationIsExpirable={editingQualificationIsExpirable}
          setEditingQualificationIsExpirable={setEditingQualificationIsExpirable}
          editingQualificationValidityPeriod={editingQualificationValidityPeriod}
          setEditingQualificationValidityPeriod={setEditingQualificationValidityPeriod}
          editingQualificationActive={editingQualificationActive}
          setEditingQualificationActive={setEditingQualificationActive}
          editingQualificationColor={editingQualificationColor}
          setEditingQualificationColor={setEditingQualificationColor}
          handleCancelEditQualification={handleCancelEditQualification}
          handleSaveQualification={handleSaveQualification}
          handleDeleteQualification={handleDeleteQualification}
          qualificationUsage={qualificationUsage}
          handleQualificationDragEnd={handleQualificationDragEnd}
          setErrorMessage={setErrorMessage}
          sectionStyle={sectionStyle}
        />

        </div>
      </div>
    </div>
  );
};

export default RosterSettings;
