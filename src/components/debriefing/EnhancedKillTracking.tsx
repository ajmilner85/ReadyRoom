import React, { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import UnitBadge from './UnitBadge';
import AddUnitTypesDialog from './AddUnitTypesDialog';
import PilotIDBadgeSm from '../ui/PilotIDBadgeSm';
import { killTrackingService } from '../../services/killTrackingService';

interface Pilot {
  id: string;
  callsign: string;
  boardNumber: number;
}

interface PilotAssignment {
  pilot_id: string;
  dash_number: string;
}

interface Squadron {
  tail_code: string | null;
  insignia_url: string | null;
  color_palette?: {
    primary?: string;
  } | null;
}

interface UnitKill {
  id?: string;
  pilotId: string;
  unitTypeId: string;
  unitTypeName: string;
  killCount: number;
  killCategory: 'A2A' | 'A2G' | 'A2S';
}

interface UnitPoolItem {
  id: string;
  unit_type_id: string;
  kill_category: 'A2A' | 'A2G' | 'A2S';
  unit_type: {
    id: string;
    type_name: string;
    display_name: string;
    kill_category: 'A2A' | 'A2G' | 'A2S';
  };
}

interface EnhancedKillTrackingProps {
  missionDebriefingId: string;
  flightName: string;
  flightLeadDashNumber: string;
  pilots: Pilot[];
  pilotAssignments: PilotAssignment[];
  squadron: Squadron | null;
  getCallsignColor: () => string;
  disabled?: boolean;
  onChange: () => void;
}

const EnhancedKillTracking: React.FC<EnhancedKillTrackingProps> = ({
  missionDebriefingId,
  flightName,
  flightLeadDashNumber,
  pilots,
  pilotAssignments,
  squadron,
  getCallsignColor,
  disabled = false,
  onChange
}) => {
  const [unitPool, setUnitPool] = useState<UnitPoolItem[]>([]);
  const [pilotKills, setPilotKills] = useState<Record<string, UnitKill[]>>({});
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<'A2A' | 'A2G' | 'A2S'>('A2A');
  const [draggedUnit, setDraggedUnit] = useState<{ unitTypeId: string; killCategory: 'A2A' | 'A2G' | 'A2S' } | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  // Sort pilots by dash number
  const sortedPilots = React.useMemo(() => {
    return [...pilots].sort((a, b) => {
      const dashA = pilotAssignments.find(pa => pa.pilot_id === a.id)?.dash_number || '99';
      const dashB = pilotAssignments.find(pa => pa.pilot_id === b.id)?.dash_number || '99';
      return parseInt(dashA) - parseInt(dashB);
    });
  }, [pilots, pilotAssignments]);

  // Load unit pool and existing kills
  useEffect(() => {
    loadData();
  }, [missionDebriefingId]);

  const loadData = async () => {
    try {
      const poolData = await killTrackingService.getMissionUnitPool(missionDebriefingId);

      setUnitPool(poolData as UnitPoolItem[]);
      // Initialize empty kill records for each pilot
      const initialKills: Record<string, UnitKill[]> = {};
      pilots.forEach(pilot => {
        initialKills[pilot.id] = [];
      });
      setPilotKills(initialKills);
    } catch (err) {
      console.error('Failed to load unit tracking data:', err);
    }
  };

  const handleAddUnits = async (unitIds: string[]) => {
    try {
      await killTrackingService.addUnitsToPool(missionDebriefingId, unitIds);
      await loadData();
      onChange();
      setShowAddDialog(false);
    } catch (err) {
      console.error('Failed to add units:', err);
    }
  };

  const handleDragStart = (unitTypeId: string, killCategory: 'A2A' | 'A2G' | 'A2S') => {
    setDraggedUnit({ unitTypeId, killCategory });
  };

  const handleDragOver = (e: React.DragEvent, pilotId: string) => {
    e.preventDefault();
    setDropTarget(pilotId);
  };

  const handleDragLeave = () => {
    setDropTarget(null);
  };

  const handleDrop = (e: React.DragEvent, pilotId: string) => {
    e.preventDefault();
    setDropTarget(null);

    if (!draggedUnit) return;

    const unit = unitPool.find(u => u.unit_type_id === draggedUnit.unitTypeId);
    if (!unit) return;

    // Add or increment kill for this pilot
    setPilotKills(prev => {
      const pilotKillsList = prev[pilotId] || [];
      const existingKill = pilotKillsList.find(k => k.unitTypeId === draggedUnit.unitTypeId);

      if (existingKill) {
        return {
          ...prev,
          [pilotId]: pilotKillsList.map(k =>
            k.unitTypeId === draggedUnit.unitTypeId
              ? { ...k, killCount: k.killCount + 1 }
              : k
          )
        };
      } else {
        return {
          ...prev,
          [pilotId]: [
            ...pilotKillsList,
            {
              pilotId,
              unitTypeId: draggedUnit.unitTypeId,
              unitTypeName: unit.unit_type.display_name,
              killCount: 1,
              killCategory: draggedUnit.killCategory
            }
          ]
        };
      }
    });

    onChange();
    setDraggedUnit(null);
  };

  const handleIncrementKill = (pilotId: string, unitTypeId: string) => {
    setPilotKills(prev => ({
      ...prev,
      [pilotId]: prev[pilotId].map(k =>
        k.unitTypeId === unitTypeId ? { ...k, killCount: k.killCount + 1 } : k
      )
    }));
    onChange();
  };

  const handleDecrementKill = (pilotId: string, unitTypeId: string) => {
    setPilotKills(prev => ({
      ...prev,
      [pilotId]: prev[pilotId].map(k =>
        k.unitTypeId === unitTypeId && k.killCount > 0
          ? { ...k, killCount: k.killCount - 1 }
          : k
      )
    }));
    onChange();
  };

  const handleRemoveKill = (pilotId: string, unitTypeId: string) => {
    setPilotKills(prev => ({
      ...prev,
      [pilotId]: prev[pilotId].filter(k => k.unitTypeId !== unitTypeId)
    }));
    onChange();
  };

  const getCategoryUnits = (category: 'A2A' | 'A2G' | 'A2S') => {
    return unitPool.filter(u => u.kill_category === category);
  };

  const getPilotKillsByCategory = (pilotId: string, category: 'A2A' | 'A2G' | 'A2S') => {
    return (pilotKills[pilotId] || []).filter(k => k.killCategory === category);
  };

  return (
    <div>
      <div style={{ fontSize: '14px', fontWeight: 600, color: '#475569', marginBottom: '12px' }}>
        Enhanced Kill Tracking
      </div>

      {/* Unit Pool Section */}
      <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px' }}>
        <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748B', marginBottom: '8px', textTransform: 'uppercase' }}>
          Unit Pool
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* A2A Section */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#1E40AF', textTransform: 'uppercase' }}>
                Air-to-Air
              </div>
              <button
                onClick={() => { setSelectedCategory('A2A'); setShowAddDialog(true); }}
                disabled={disabled}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 8px',
                  fontSize: '11px',
                  fontWeight: 500,
                  color: '#1E40AF',
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #93C5FD',
                  borderRadius: '4px',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  opacity: disabled ? 0.5 : 1
                }}
              >
                <Plus size={12} />
                Add
              </button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', minHeight: '32px' }}>
              {getCategoryUnits('A2A').map(unit => (
                <div
                  key={unit.id}
                  draggable={!disabled}
                  onDragStart={() => handleDragStart(unit.unit_type_id, 'A2A')}
                  style={{
                    padding: '4px 8px',
                    backgroundColor: '#DBEAFE',
                    border: '1px solid #93C5FD',
                    borderRadius: '4px',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#1E40AF',
                    cursor: disabled ? 'default' : 'grab'
                  }}
                >
                  {unit.unit_type.display_name}
                </div>
              ))}
              {getCategoryUnits('A2A').length === 0 && (
                <div style={{ fontSize: '11px', color: '#94A3B8', fontStyle: 'italic' }}>
                  No units added
                </div>
              )}
            </div>
          </div>

          {/* A2G Section */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#991B1B', textTransform: 'uppercase' }}>
                Air-to-Ground
              </div>
              <button
                onClick={() => { setSelectedCategory('A2G'); setShowAddDialog(true); }}
                disabled={disabled}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 8px',
                  fontSize: '11px',
                  fontWeight: 500,
                  color: '#991B1B',
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #FCA5A5',
                  borderRadius: '4px',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  opacity: disabled ? 0.5 : 1
                }}
              >
                <Plus size={12} />
                Add
              </button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', minHeight: '32px' }}>
              {getCategoryUnits('A2G').map(unit => (
                <div
                  key={unit.id}
                  draggable={!disabled}
                  onDragStart={() => handleDragStart(unit.unit_type_id, 'A2G')}
                  style={{
                    padding: '4px 8px',
                    backgroundColor: '#FEE2E2',
                    border: '1px solid #FCA5A5',
                    borderRadius: '4px',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#991B1B',
                    cursor: disabled ? 'default' : 'grab'
                  }}
                >
                  {unit.unit_type.display_name}
                </div>
              ))}
              {getCategoryUnits('A2G').length === 0 && (
                <div style={{ fontSize: '11px', color: '#94A3B8', fontStyle: 'italic' }}>
                  No units added
                </div>
              )}
            </div>
          </div>

          {/* A2S Section */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#065F46', textTransform: 'uppercase' }}>
                Air-to-Surface
              </div>
              <button
                onClick={() => { setSelectedCategory('A2S'); setShowAddDialog(true); }}
                disabled={disabled}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 8px',
                  fontSize: '11px',
                  fontWeight: 500,
                  color: '#065F46',
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #6EE7B7',
                  borderRadius: '4px',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  opacity: disabled ? 0.5 : 1
                }}
              >
                <Plus size={12} />
                Add
              </button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', minHeight: '32px' }}>
              {getCategoryUnits('A2S').map(unit => (
                <div
                  key={unit.id}
                  draggable={!disabled}
                  onDragStart={() => handleDragStart(unit.unit_type_id, 'A2S')}
                  style={{
                    padding: '4px 8px',
                    backgroundColor: '#D1FAE5',
                    border: '1px solid #6EE7B7',
                    borderRadius: '4px',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#065F46',
                    cursor: disabled ? 'default' : 'grab'
                  }}
                >
                  {unit.unit_type.display_name}
                </div>
              ))}
              {getCategoryUnits('A2S').length === 0 && (
                <div style={{ fontSize: '11px', color: '#94A3B8', fontStyle: 'italic' }}>
                  No units added
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Pilot Kills Section */}
      <div style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '12px' }}>
        <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748B', marginBottom: '12px', textTransform: 'uppercase' }}>
          Pilot Kills (Drag units from pool above)
        </div>

        {sortedPilots.map(pilot => {
          const dashNumber = pilotAssignments.find(pa => pa.pilot_id === pilot.id)?.dash_number || '1';
          const isDropTarget = dropTarget === pilot.id;
          const a2aKills = getPilotKillsByCategory(pilot.id, 'A2A');
          const a2gKills = getPilotKillsByCategory(pilot.id, 'A2G');
          const a2sKills = getPilotKillsByCategory(pilot.id, 'A2S');

          return (
            <div
              key={pilot.id}
              onDragOver={(e) => handleDragOver(e, pilot.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, pilot.id)}
              style={{
                marginBottom: '12px',
                padding: '12px',
                backgroundColor: isDropTarget ? '#EFF6FF' : '#FFFFFF',
                border: `2px ${isDropTarget ? 'dashed' : 'solid'} ${isDropTarget ? '#3B82F6' : '#E2E8F0'}`,
                borderRadius: '6px',
                transition: 'all 0.15s ease'
              }}
            >
              {/* Pilot Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <div style={{ fontSize: '12px', color: '#64748B', width: '60px' }}>
                  {flightName} {flightLeadDashNumber}-{dashNumber}
                </div>
                <PilotIDBadgeSm
                  squadronTailCode={squadron?.tail_code ?? undefined}
                  boardNumber={pilot.boardNumber?.toString()}
                  squadronInsigniaUrl={squadron?.insignia_url ?? undefined}
                />
                <span style={{ fontSize: '14px', fontWeight: 700, color: getCallsignColor() }}>
                  {pilot.callsign}
                </span>
              </div>

              {/* Kills by Category */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {/* A2A Kills */}
                {a2aKills.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {a2aKills.map(kill => (
                      <UnitBadge
                        key={kill.unitTypeId}
                        unitTypeName={kill.unitTypeName}
                        killCount={kill.killCount}
                        killCategory="A2A"
                        onIncrement={() => handleIncrementKill(pilot.id, kill.unitTypeId)}
                        onDecrement={() => handleDecrementKill(pilot.id, kill.unitTypeId)}
                        onRemove={() => handleRemoveKill(pilot.id, kill.unitTypeId)}
                        disabled={disabled}
                      />
                    ))}
                  </div>
                )}

                {/* A2G Kills */}
                {a2gKills.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {a2gKills.map(kill => (
                      <UnitBadge
                        key={kill.unitTypeId}
                        unitTypeName={kill.unitTypeName}
                        killCount={kill.killCount}
                        killCategory="A2G"
                        onIncrement={() => handleIncrementKill(pilot.id, kill.unitTypeId)}
                        onDecrement={() => handleDecrementKill(pilot.id, kill.unitTypeId)}
                        onRemove={() => handleRemoveKill(pilot.id, kill.unitTypeId)}
                        disabled={disabled}
                      />
                    ))}
                  </div>
                )}

                {/* A2S Kills */}
                {a2sKills.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {a2sKills.map(kill => (
                      <UnitBadge
                        key={kill.unitTypeId}
                        unitTypeName={kill.unitTypeName}
                        killCount={kill.killCount}
                        killCategory="A2S"
                        onIncrement={() => handleIncrementKill(pilot.id, kill.unitTypeId)}
                        onDecrement={() => handleDecrementKill(pilot.id, kill.unitTypeId)}
                        onRemove={() => handleRemoveKill(pilot.id, kill.unitTypeId)}
                        disabled={disabled}
                      />
                    ))}
                  </div>
                )}

                {/* No kills message */}
                {a2aKills.length === 0 && a2gKills.length === 0 && a2sKills.length === 0 && (
                  <div style={{ fontSize: '12px', color: '#94A3B8', fontStyle: 'italic' }}>
                    No kills recorded
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Unit Types Dialog */}
      {showAddDialog && (
        <AddUnitTypesDialog
          killCategory={selectedCategory}
          existingUnitIds={unitPool.map(u => u.unit_type_id)}
          onClose={() => setShowAddDialog(false)}
          onAdd={handleAddUnits}
        />
      )}
    </div>
  );
};

export default EnhancedKillTracking;
