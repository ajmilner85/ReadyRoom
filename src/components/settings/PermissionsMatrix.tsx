import React, { useState, useEffect } from 'react';
// import { Save } from 'lucide-react';
import type { AppPermission, PermissionRule, BasisOption, BasisType, GroupedPermissions } from '../../types/PermissionTypes';
import { PERMISSION_CATEGORIES } from '../../types/PermissionTypes';
import { permissionService } from '../../utils/permissionService';

interface PermissionMatrixProps {
  permissions: GroupedPermissions | null;
  rules: PermissionRule[];
  onCreateRule: any;
  onUpdateRule: any;
  onDeleteRule: any;
  loading: boolean;
}

export const PermissionMatrix: React.FC<PermissionMatrixProps> = ({ 
  permissions, 
  rules, 
  onCreateRule, 
  onUpdateRule, 
  onDeleteRule, 
  loading 
}) => {
  const [selectedBasisType, setSelectedBasisType] = useState<BasisType>('billet');
  const [basisOptions, setBasisOptions] = useState<BasisOption[]>([]);
  const [matrixChanges, setMatrixChanges] = useState<Record<string, { scope?: string; active?: boolean }>>({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [scrollIndex, setScrollIndex] = useState(0);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  
  // Load basis options when basis type changes
  useEffect(() => {
    const loadBasisOptions = async () => {
      try {
        const options = await permissionService.getBasisOptions(selectedBasisType);
        setBasisOptions(options);
        setScrollIndex(0); // Reset scroll when changing basis type
      } catch (error) {
        console.error('Error loading basis options:', error);
      }
    };
    
    loadBasisOptions();
  }, [selectedBasisType]);
  
  if (!permissions || loading) {
    return (
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        height: '200px' 
      }}>
        Loading permissions matrix...
      </div>
    );
  }

  // Get all permissions as a flat array with categories
  const categorizedPermissions = Object.entries(permissions).map(([category, perms]) => {
    // Map camelCase keys back to snake_case for PERMISSION_CATEGORIES lookup
    const categoryKey = category === 'missionPrep' ? 'mission_prep' : category;
    return {
      category: PERMISSION_CATEGORIES[categoryKey as keyof typeof PERMISSION_CATEGORIES] || category,
      permissions: perms
    };
  });
  
  // Create matrix data structure  
  const getMatrixKey = (permissionId: string, basisId: string) => `${permissionId}::${basisId}`;
  
  // Build current rule state from existing rules
  const currentRuleState = rules
    .filter(rule => rule.basisType === selectedBasisType)
    .reduce((acc, rule) => {
      // Map NULL basis_id back to the appropriate identifier based on basis type
      let matrixBasisId = rule.basisId;
      if (!matrixBasisId) {
        if (selectedBasisType === 'authenticated_user') {
          matrixBasisId = 'authenticated_user';
        } else if (selectedBasisType === 'manual_override') {
          matrixBasisId = 'manual_override';
        } else {
          matrixBasisId = 'default';
        }
      }
      
      const key = getMatrixKey(rule.permissionId, matrixBasisId);
      acc[key] = {
        scope: rule.scope,
        active: rule.active
      };
      return acc;
    }, {} as Record<string, { scope?: string; active?: boolean }>);
  
  // Merge current rules with pending changes
  const getEffectiveState = (permissionId: string, basisId: string) => {
    const key = getMatrixKey(permissionId, basisId);
    const changes = matrixChanges[key];
    const current = currentRuleState[key];
    
    return {
      scope: changes?.scope ?? current?.scope ?? 'none',
      active: changes?.active ?? current?.active ?? true
    };
  };
  
  // Handle matrix cell changes
  const handleMatrixChange = (permissionId: string, basisId: string, field: 'scope' | 'active', value: string | boolean) => {
    const key = getMatrixKey(permissionId, basisId);
    setMatrixChanges(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        [field]: value
      }
    }));
    setHasUnsavedChanges(true);
  };
  
  // Handle scope cycling for scoped permissions
  const handleScopeCycle = (permission: AppPermission, basisId: string) => {
    const currentState = getEffectiveState(permission.id, basisId);

    // Get available scopes for this permission (default to standard scopes if not specified)
    const availableScopes = permission.availableScopes || ['own_squadron', 'own_wing', 'global'];

    // Add 'none' as the first option in the cycle
    const scopeCycle = ['none', ...availableScopes];

    // Find current index and move to next
    const currentIndex = scopeCycle.indexOf(currentState.scope);
    const nextIndex = (currentIndex + 1) % scopeCycle.length;
    const nextScope = scopeCycle[nextIndex];

    handleMatrixChange(permission.id, basisId, 'scope', nextScope);
  };
  
  // Save changes to database
  const handleSaveChanges = async () => {
    setIsSaving(true);
    try {
      for (const [key, changes] of Object.entries(matrixChanges)) {
        const [permissionId, basisId] = key.split('::');
        // Convert matrix basisId back to database basisId for matching
        const dbBasisId = (basisId === 'authenticated_user' || basisId === 'manual_override') ? null : basisId;
        
        const currentRule = rules.find(r => 
          r.permissionId === permissionId && 
          r.basisId === dbBasisId && 
          r.basisType === selectedBasisType
        );
        
        if (changes.scope === 'none') {
          // Delete rule if scope is none
          if (currentRule) {
            await onDeleteRule(currentRule.id);
          }
        } else {
          // Create or update rule
          const ruleData = {
            permissionId,
            basisType: selectedBasisType,
            basisId: (basisId === 'default' || basisId === 'authenticated_user' || basisId === 'manual_override') ? null : basisId,
            scope: changes.scope || 'own_squadron',
            active: changes.active ?? true
          };
          
          if (currentRule) {
            await onUpdateRule(currentRule.id, ruleData);
          } else {
            await onCreateRule(ruleData);
          }
        }
      }
      
      setMatrixChanges({});
      setHasUnsavedChanges(false);
    } catch (error) {
      console.error('Error saving changes:', error);
    } finally {
      setIsSaving(false);
    }
  };
  
  // Cancel changes
  const handleCancelChanges = () => {
    setMatrixChanges({});
    setHasUnsavedChanges(false);
  };
  
  // Render matrix cell based on permission scope type
  const renderMatrixCell = (permission: AppPermission, basis: BasisOption) => {
    const state = getEffectiveState(permission.id, basis.id);
    const isActive = state.active;
    
    if (permission.scopeType === 'global') {
      return (
        <input
          type="checkbox"
          checked={state.scope !== 'none' && isActive}
          onChange={(e) => {
            const newScope = e.target.checked ? 'global' : 'none';
            handleMatrixChange(permission.id, basis.id, 'scope', newScope);
          }}
          disabled={!isActive}
          style={{
            width: '16px',
            height: '16px'
          }}
        />
      );
    } else {
      // Scoped permission - clickable text
      const getScopeLabel = (scope: string) => {
        switch (scope) {
          case 'none': return 'None';
          case 'flight': return 'Flight';
          case 'own_squadron': return 'Squadron';
          case 'own_wing': return 'Wing';
          case 'global': return 'Global';
          default: return 'None';
        }
      };
      
      const getScopeColors = (scope: string) => {
        switch (scope) {
          case 'none':
            return { color: '#9CA3AF', backgroundColor: 'transparent', hoverColor: '#6B7280' };
          case 'flight':
            return { color: '#059669', backgroundColor: '#ECFDF5', hoverColor: '#047857' };
          case 'own_squadron':
            return { color: '#2563EB', backgroundColor: '#EFF6FF', hoverColor: '#1D4ED8' };
          case 'own_wing':
            return { color: '#7C3AED', backgroundColor: '#F5F3FF', hoverColor: '#6D28D9' };
          case 'global':
            return { color: '#DC2626', backgroundColor: '#FEF2F2', hoverColor: '#B91C1C' };
          default:
            return { color: '#9CA3AF', backgroundColor: 'transparent', hoverColor: '#6B7280' };
        }
      };
      
      const colors = getScopeColors(state.scope);
      
      return (
        <span
          onClick={() => !isActive ? null : handleScopeCycle(permission, basis.id)}
          style={{
            padding: '4px 8px',
            fontSize: '12px',
            fontWeight: 500,
            color: !isActive ? '#D1D5DB' : colors.color,
            backgroundColor: !isActive ? 'transparent' : colors.backgroundColor,
            cursor: !isActive ? 'not-allowed' : 'pointer',
            borderRadius: '4px',
            transition: 'all 0.2s ease',
            minWidth: '60px',
            textAlign: 'center',
            display: 'inline-block'
          }}
          onMouseEnter={(e) => {
            if (isActive) {
              (e.target as HTMLElement).style.color = colors.hoverColor;
            }
          }}
          onMouseLeave={(e) => {
            if (isActive) {
              (e.target as HTMLElement).style.color = colors.color;
            }
          }}
        >
          {getScopeLabel(state.scope)}
        </span>
      );
    }
  };
  
  const basisTypeOptions: BasisType[] = ['authenticated_user', 'standing', 'billet', 'qualification', 'team'];
  
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', width: '100%' }}>
      {/* Horizontal Tabs for Basis Type */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '24px' }}>
        {basisTypeOptions.map(basisType => (
          <button
            key={basisType}
            onClick={() => setSelectedBasisType(basisType)}
            style={{
              padding: '12px 24px',
              backgroundColor: selectedBasisType === basisType ? '#FFFFFF' : 'transparent',
              border: 'none',
              borderBottom: selectedBasisType === basisType ? '2px solid #3B82F6' : '2px solid transparent',
              cursor: 'pointer',
              fontSize: '14px',
              fontFamily: 'Inter',
              fontWeight: selectedBasisType === basisType ? 500 : 400,
              color: selectedBasisType === basisType ? '#0F172A' : '#64748B',
              transition: 'all 0.2s ease'
            }}
          >
            {basisType === 'authenticated_user' ? 'Authenticated User' : basisType.charAt(0).toUpperCase() + basisType.slice(1).replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Permission Matrix */}
      <div style={{ 
        flex: 1,
        border: '1px solid #E5E7EB', 
        borderRadius: '6px', 
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        width: '100%'
      }}>
        {/* Fixed Header Row */}
        <div style={{
          backgroundColor: '#F9FAFB',
          borderBottom: '1px solid #E5E7EB',
          display: 'flex',
          alignItems: 'center',
          flexShrink: 0,
          zIndex: 20,
          height: '48px'
        }}>
          {/* Permission Column Header */}
          <div style={{
            width: '250px', // Permission column width
            padding: '12px 16px',
            fontSize: '12px',
            fontWeight: 500,
            color: '#6B7280',
            textTransform: 'uppercase'
          }}>
            {/* No header text as requested */}
          </div>
          
          {/* Spacer to push basis columns to the right */}
          <div style={{ flex: 1 }}></div>
          
          {/* Right-aligned Basis Columns Container */}
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {/* Left Navigation Button */}
            <div style={{
              width: '40px',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center'
            }}>
              {scrollIndex > 0 && (
                <button
                  onClick={() => setScrollIndex(scrollIndex - 1)}
                  style={{
                    border: 'none',
                    background: 'none',
                    cursor: 'pointer',
                    color: '#6B7280',
                    fontSize: '16px',
                    padding: '4px'
                  }}
                >
                  ←
                </button>
              )}
            </div>
            
            {/* Visible Basis Column Headers */}
            {basisOptions.slice(scrollIndex, scrollIndex + 5).map((basis) => (
              <div key={basis.id} style={{
                width: '110px',
                padding: '12px 8px',
                textAlign: 'center',
                fontSize: '12px',
                fontWeight: 500,
                color: '#6B7280',
                textTransform: 'uppercase',
                whiteSpace: 'normal',
                wordWrap: 'break-word',
                lineHeight: '1.2'
              }}>
                {basis.name}
              </div>
            ))}
            
            {/* Right Navigation Button */}
            <div style={{
              width: '40px',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center'
            }}>
              {scrollIndex + 5 < basisOptions.length && (
                <button
                  onClick={() => setScrollIndex(scrollIndex + 1)}
                  style={{
                    border: 'none',
                    background: 'none',
                    cursor: 'pointer',
                    color: '#6B7280',
                    fontSize: '16px',
                    padding: '4px'
                  }}
                >
                  →
                </button>
              )}
            </div>
          </div>
        </div>
        
        {/* Scrollable Content */}
        <div style={{
          flex: 1,
          overflowY: 'auto'
        }}>
          {categorizedPermissions.map(({ category, permissions: categoryPerms }) => (
            <div key={category}>
              {/* Category Header */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                minHeight: '37px'
              }}>
                <div style={{
                  width: '250px',
                  padding: '8px 16px',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#1F2937',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  position: 'sticky',
                  left: 0,
                  backgroundColor: '#FFFFFF',
                  zIndex: 15
                }}>
                  {category}
                </div>
                
                {/* Spacer to align with header */}
                <div style={{ flex: 1 }}></div>
                
                {/* Right-aligned category spacers */}
                <div style={{ display: 'flex' }}>
                  <div style={{ width: '40px' }}></div>
                  {basisOptions.slice(scrollIndex, scrollIndex + 5).map(() => (
                    <div key={Math.random()} style={{ width: '110px' }}></div>
                  ))}
                  <div style={{ width: '40px' }}></div>
                </div>
              </div>
              
              {/* Permission Rows */}
              {categoryPerms.map((permission: AppPermission) => {
                const hasAnyRule = basisOptions.some(basis => 
                  getEffectiveState(permission.id, basis.id).scope !== 'none'
                );
                const isDisabled = !hasAnyRule;
                
                return (
                  <div 
                    key={permission.id}
                    onMouseEnter={() => setHoveredRow(permission.id)}
                    onMouseLeave={() => setHoveredRow(null)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      minHeight: '60px',
                      backgroundColor: hoveredRow === permission.id ? '#F3F4F6' : 'transparent',
                      transition: 'background-color 0.1s ease'
                    }}
                  >
                    {/* Permission Cell */}
                    <div style={{
                      width: '250px',
                      padding: '12px 16px',
                      position: 'sticky',
                      left: 0,
                      backgroundColor: hoveredRow === permission.id ? '#F3F4F6' : '#FFFFFF',
                      zIndex: 10,
                      transition: 'background-color 0.1s ease'
                    }}>
                      <div>
                        <div style={{
                          fontSize: '14px',
                          fontWeight: 500,
                          color: isDisabled ? '#9CA3AF' : '#1F2937',
                          lineHeight: '1.4',
                          marginBottom: '2px'
                        }}>
                          {permission.displayName}
                          {isDisabled && (
                            <span style={{ 
                              marginLeft: '6px', 
                              fontSize: '12px',
                              color: '#9CA3AF'
                            }}>⚠</span>
                          )}
                        </div>
                        {permission.description && (
                          <div style={{
                            fontSize: '12px',
                            color: '#6B7280',
                            lineHeight: '1.3'
                          }}>
                            {permission.description}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Spacer to align with header */}
                    <div style={{ flex: 1 }}></div>
                    
                    {/* Right-aligned Matrix Cells */}
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <div style={{ width: '40px' }}></div>
                      {basisOptions.slice(scrollIndex, scrollIndex + 5).map(basis => (
                        <div key={basis.id} style={{
                          width: '110px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: '12px 8px'
                        }}>
                          {renderMatrixCell(permission, basis)}
                        </div>
                      ))}
                      <div style={{ width: '40px' }}></div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      
      {/* Save/Cancel Controls */}
      {hasUnsavedChanges && (
        <div style={{
          position: 'absolute',
          bottom: '24px',
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: 'white',
          border: '1px solid #E5E7EB',
          borderRadius: '8px',
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
          padding: '16px 32px',
          display: 'flex',
          alignItems: 'center',
          gap: '24px',
          zIndex: 50,
          whiteSpace: 'nowrap'
        }}>
          <div style={{
            fontSize: '14px',
            color: '#6B7280'
          }}>
            You have unsaved changes
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={handleCancelChanges}
              disabled={isSaving}
              style={{
                padding: '8px 16px',
                border: '1px solid #D1D5DB',
                borderRadius: '4px',
                backgroundColor: 'white',
                color: '#6B7280',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSaveChanges}
              disabled={isSaving}
              style={{
                padding: '8px 16px',
                border: 'none',
                borderRadius: '4px',
                backgroundColor: '#2563EB',
                color: 'white',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};