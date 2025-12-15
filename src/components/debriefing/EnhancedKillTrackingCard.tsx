import React, { useState, useEffect, useImperativeHandle, forwardRef, useRef } from 'react';
import PilotKillTile from './kill-tracking/PilotKillTile';
import PilotStatusMenu from './kill-tracking/PilotStatusMenu';
import AircraftStatusMenu from './kill-tracking/AircraftStatusMenu';
import UnitSelectorPopup from './kill-tracking/UnitSelectorPopup';
import UnitBrowserModal from './kill-tracking/UnitBrowserModal';
import KillCell from './kill-tracking/KillCell';
import AddKillButton from './kill-tracking/AddKillButton';
import { killTrackingService } from '../../services/killTrackingService';
import { supabase } from '../../utils/supabaseClient';
import type { MissionUnitPoolItem } from '../../types/DebriefingTypes';
import type { PilotAssignment } from '../../types/MissionTypes';

interface PilotInfo {
  id: string;
  callsign: string;
  boardNumber: string;
  dashNumber: string;
  flightNumber: string;
  flightCallsign: string;
  isFlightLead: boolean;
}

interface UnitKillRecord {
  id: string; // kill record ID
  pilotId: string;
  unitTypeId: string;
  unitDisplayName: string;
  unitTypeName: string;
  killCount: number;
  killCategory: 'A2A' | 'A2G' | 'A2S';
}

interface PilotStatusRecord {
  pilotId: string;
  pilotStatus: 'alive' | 'mia' | 'kia' | 'unaccounted';
  aircraftStatus: 'recovered' | 'damaged' | 'destroyed' | 'down' | 'unaccounted';
}

interface EnhancedKillTrackingCardV2Props {
  flightDebriefId: string;
  missionId: string;
  missionDebriefingId: string;
  pilotAssignments: PilotAssignment[];
  flightCallsign: string;
  onKillsChange?: (hasChanges: boolean) => void;
}

export interface EnhancedKillTrackingCardRef {
  saveKills: (overrideFlightDebriefId?: string) => Promise<void>;
}

/**
 * Enhanced kill tracking with correct layout:
 * - Horizontal pilot tiles across top
 * - Vertical kill categories on left (A2A, A2G, A2S)
 * - Grid: pilots as columns, units as rows
 */
const EnhancedKillTrackingCardV2 = forwardRef<EnhancedKillTrackingCardRef, EnhancedKillTrackingCardV2Props>(({
  flightDebriefId,
  missionId,
  missionDebriefingId,
  pilotAssignments,
  flightCallsign,
  onKillsChange
}, ref) => {
  const [pilots, setPilots] = useState<PilotInfo[]>([]);
  const [killRecords, setKillRecords] = useState<UnitKillRecord[]>([]);
  const [pilotStatuses, setPilotStatuses] = useState<Map<string, PilotStatusRecord>>(new Map());
  const [missionPoolUnits, setMissionPoolUnits] = useState<MissionUnitPoolItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Popup state
  const [showPopup, setShowPopup] = useState(false);
  const [popupPosition, setPopupPosition] = useState({ top: 0, left: 0 });
  const [popupPilotId, setPopupPilotId] = useState<string | null>(null);
  const [popupKillCategory, setPopupKillCategory] = useState<'A2A' | 'A2G' | 'A2S'>('A2A');

  // Browser modal state
  const [showBrowser, setShowBrowser] = useState(false);
  const [browserKillCategory, setBrowserKillCategory] = useState<'A2A' | 'A2G' | 'A2S'>('A2A');

  // Status menu state
  const [showPilotStatusMenu, setShowPilotStatusMenu] = useState(false);
  const [showAircraftStatusMenu, setShowAircraftStatusMenu] = useState(false);
  const [statusMenuPilotId, setStatusMenuPilotId] = useState<string | null>(null);
  const [statusMenuPosition, setStatusMenuPosition] = useState({ pilot: { top: 0, left: 0 }, aircraft: { top: 0, left: 0 } });

  // Ref for click outside detection
  const containerRef = useRef<HTMLDivElement>(null);

  // Category colors
  const categoryColors: Record<string, string> = {
    A2A: '#3B82F6',
    A2G: '#10B981',
    A2S: '#222A35'
  };

  // Track original kills loaded from DB to detect deletions
  const [originalKillIds, setOriginalKillIds] = useState<Set<string>>(new Set());

  // Expose saveKills method to parent via ref
  useImperativeHandle(ref, () => ({
    saveKills: async (overrideFlightDebriefId?: string) => {
      try {
        // Use the override ID if provided (for newly created debriefs), otherwise use the prop
        const actualFlightDebriefId = overrideFlightDebriefId || flightDebriefId;

        console.log('saveKills called');
        console.log('flightDebriefId (prop):', flightDebriefId);
        console.log('overrideFlightDebriefId (param):', overrideFlightDebriefId);
        console.log('actualFlightDebriefId (using):', actualFlightDebriefId);
        console.log('originalKillIds:', Array.from(originalKillIds));
        console.log('current killRecords:', killRecords.map(r => ({ id: r.id, pilot: r.pilotId, unit: r.unitDisplayName, count: r.killCount })));

        // 1. Delete records that were removed (exist in originalKillIds but not in current killRecords)
        const currentIds = new Set(killRecords.map(r => r.id).filter(id => !id.startsWith('temp-')));
        const deletedIds = Array.from(originalKillIds).filter(id => !currentIds.has(id));

        console.log('currentIds (non-temp):', Array.from(currentIds));
        console.log('deletedIds:', deletedIds);

        for (const deletedId of deletedIds) {
          console.log('Deleting kill record:', deletedId);
          await killTrackingService.deleteUnitKills(deletedId);
        }

        // 2. Save/update all current kill records with pilot/aircraft status
        const savedRecords: UnitKillRecord[] = [];
        const pilotsWithKills = new Set<string>();

        for (const record of killRecords) {
          console.log('Saving kill record:', { id: record.id, pilot: record.pilotId, unit: record.unitDisplayName, count: record.killCount });

          pilotsWithKills.add(record.pilotId);

          // Get pilot status for this pilot
          const statusRecord = pilotStatuses.get(record.pilotId);
          const pilotStatus = statusRecord?.pilotStatus === 'unaccounted' ? undefined : statusRecord?.pilotStatus;
          let aircraftStatus = statusRecord?.aircraftStatus === 'unaccounted' ? undefined : statusRecord?.aircraftStatus;
          // Map 'down' to 'damaged' for service compatibility
          if (aircraftStatus === 'down') aircraftStatus = 'damaged';

          const result = await killTrackingService.recordUnitKills(
            actualFlightDebriefId,
            record.pilotId,
            missionId,
            record.unitTypeId,
            record.killCount,
            pilotStatus || 'alive',
            aircraftStatus || 'recovered'
          );

          // Update record with actual DB ID if it was a temp record
          savedRecords.push({
            ...record,
            id: result.id
          });
        }

        // 3. Save pilot/aircraft status for pilots with no kills but status was changed
        for (const [pilotId, statusRecord] of pilotStatuses.entries()) {
          if (!pilotsWithKills.has(pilotId)) {
            // Skip if both statuses are 'unaccounted' (default/no change)
            if (statusRecord.pilotStatus === 'unaccounted' && statusRecord.aircraftStatus === 'unaccounted') {
              continue;
            }

            // This pilot has no kills but has status - save it with empty kills_detail
            console.log('Saving status-only record for pilot:', pilotId);
            const pilotStatus = statusRecord.pilotStatus === 'unaccounted' ? 'alive' : statusRecord.pilotStatus;
            let aircraftStatus = statusRecord.aircraftStatus === 'unaccounted' ? 'recovered' : statusRecord.aircraftStatus;
            // Map 'down' to 'damaged' for service compatibility
            if (aircraftStatus === 'down') aircraftStatus = 'damaged';

            await killTrackingService.savePilotStatus(
              actualFlightDebriefId,
              pilotId,
              missionId,
              pilotStatus,
              aircraftStatus
            );
          }
        }

        console.log('All kills and statuses saved successfully');

        // 4. Update local state with actual DB IDs
        setKillRecords(savedRecords);
        setOriginalKillIds(new Set(savedRecords.map(r => r.id)));
      } catch (err) {
        console.error('Failed to save kills:', err);
        throw err;
      }
    }
  }), [killRecords, originalKillIds, pilotStatuses, flightDebriefId, missionId]);

  useEffect(() => {
    loadData();
  }, [pilotAssignments]);

  const loadData = async () => {
    await Promise.all([
      loadPilots(),
      loadMissionUnitPool(),
      loadExistingKills()
    ]);
    setLoading(false);
  };

  const loadPilots = async () => {
    try {
      const pilotIds = pilotAssignments.map(a => a.pilot_id);
      const { data, error } = await supabase
        .from('pilots')
        .select('id, boardNumber, callsign')
        .in('id', pilotIds);

      if (error) throw error;

      const pilotsData: PilotInfo[] = data.map(pilot => {
        const assignment = pilotAssignments.find(a => a.pilot_id === pilot.id);
        return {
          id: pilot.id,
          callsign: pilot.callsign,
          boardNumber: pilot.boardNumber.toString(),
          dashNumber: assignment?.dash_number || '1',
          flightNumber: '1',
          flightCallsign: flightCallsign,
          isFlightLead: assignment?.dash_number === '1'
        };
      });

      // Sort in display order: -2, -1, -3, -4 (like Mission Prep)
      const sortOrder = ['2', '1', '3', '4'];
      pilotsData.sort((a, b) => {
        const aIndex = sortOrder.indexOf(a.dashNumber);
        const bIndex = sortOrder.indexOf(b.dashNumber);
        return aIndex - bIndex;
      });

      setPilots(pilotsData);
    } catch (err) {
      console.error('Failed to load pilots:', err);
    }
  };

  const loadMissionUnitPool = async () => {
    try {
      // Check if missionDebriefingId is valid
      if (!missionDebriefingId || missionDebriefingId === 'undefined') {
        console.log('No mission debriefing ID available yet, skipping unit pool load');
        return;
      }

      const { data: debriefData, error: debriefError } = await supabase
        .from('mission_debriefings')
        .select('unit_type_pool')
        .eq('id', missionDebriefingId)
        .single();

      if (debriefError) throw debriefError;

      const unitTypePool = (debriefData as any).unit_type_pool;
      if (unitTypePool && Array.isArray(unitTypePool) && unitTypePool.length > 0) {
        const unitIds = unitTypePool.map((item: any) => item.unit_type_id);
        const { data: unitsData, error: unitsError } = await supabase
          .from('dcs_unit_types')
          .select('*')
          .in('id', unitIds);

        if (unitsError) throw unitsError;
        setMissionPoolUnits(unitsData as MissionUnitPoolItem[] || []);
      } else {
        await initializeUnitPoolFromMission();
      }
    } catch (err) {
      console.error('Failed to load mission unit pool:', err);
    }
  };

  const initializeUnitPoolFromMission = async () => {
    try {
      // Check if missionDebriefingId is valid before proceeding
      if (!missionDebriefingId || missionDebriefingId === 'undefined') {
        console.log('No valid mission debriefing ID, skipping unit pool initialization from mission');
        return;
      }

      const { data: missionData, error: missionError } = await supabase
        .from('missions')
        .select('miz_file_data')
        .eq('id', missionId)
        .single();

      if (missionError) throw missionError;

      const mizFileData = missionData?.miz_file_data as any;
      const redUnits = mizFileData?.red_coalition_units as string[] | undefined;

      if (redUnits && redUnits.length > 0) {
        const { data: unitsData, error: unitsError } = await supabase
          .from('dcs_unit_types')
          .select('*')
          .in('type_name', redUnits)
          .eq('is_active', true);

        if (unitsError) throw unitsError;

        if (unitsData && unitsData.length > 0) {
          const unitIds = unitsData.map(u => u.id);
          await killTrackingService.addUnitsToPool(missionDebriefingId, unitIds);
          setMissionPoolUnits(unitsData as MissionUnitPoolItem[]);
        }
      }
    } catch (err) {
      console.error('Failed to initialize unit pool from mission:', err);
    }
  };

  const loadExistingKills = async () => {
    try {
      console.log('Loading existing kills for flight debrief:', flightDebriefId);

      // Load kill records
      const kills = await killTrackingService.getUnitKillsByFlight(flightDebriefId);
      console.log('Loaded kills from DB:', kills);

      const records: UnitKillRecord[] = kills.map((kill: any) => ({
        id: kill.id,
        pilotId: kill.pilot_id,
        unitTypeId: kill.unit_type_id,
        unitDisplayName: kill.unit_type?.display_name || 'Unknown',
        unitTypeName: kill.unit_type?.type_name || 'Unknown',
        killCount: kill.kill_count || 1,
        killCategory: kill.unit_type?.kill_category || 'A2A'
      }));

      // Load pilot/aircraft statuses for ALL pilots (including those with no kills)
      const statuses = await killTrackingService.getPilotStatusesByFlight(flightDebriefId);
      console.log('Loaded pilot statuses from DB:', statuses);

      const statusMap = new Map<string, PilotStatusRecord>();
      statuses.forEach((status: any) => {
        statusMap.set(status.pilot_id, {
          pilotId: status.pilot_id,
          pilotStatus: status.pilot_status || 'alive',
          aircraftStatus: status.aircraft_status || 'recovered'
        });
      });

      console.log('Mapped kill records:', records);
      console.log('Mapped pilot statuses:', Array.from(statusMap.entries()));
      setKillRecords(records);
      setPilotStatuses(statusMap);
      setOriginalKillIds(new Set(records.map(r => r.id)));
    } catch (err) {
      console.error('Failed to load existing kills:', err);
    }
  };

  // const getUnitsForCategory = (category: 'A2A' | 'A2G' | 'A2S'): string[] => {
  //   // Get unique unit IDs that have kills recorded in this category
  //   const recordedUnitIds = new Set(
  //     killRecords
  //       .filter(k => k.killCategory === category)
  //       .map(k => k.unitTypeId)
  //   );
  //   return Array.from(recordedUnitIds);
  // };

  // const getKillRecord = (pilotId: string, unitTypeId: string): UnitKillRecord | undefined => {
  //   return killRecords.find(k => k.pilotId === pilotId && k.unitTypeId === unitTypeId);
  // };

  const handleAddButtonClick = (event: React.MouseEvent, pilotId: string, category: 'A2A' | 'A2G' | 'A2S') => {
    const rect = event.currentTarget.getBoundingClientRect();
    const buttonWidth = rect.width; // 92px
    const popupWidth = 220; // minWidth from UnitSelectorPopup
    const centerOffset = (buttonWidth - popupWidth) / 2;

    setPopupPosition({
      top: rect.bottom + window.scrollY + 4,
      left: rect.left + window.scrollX + centerOffset
    });
    setPopupPilotId(pilotId);
    setPopupKillCategory(category);
    setShowPopup(true);
  };

  const handleSelectUnit = async (unitId: string) => {
    if (!popupPilotId) {
      console.error('handleSelectUnit: No popupPilotId set');
      return;
    }

    console.log('handleSelectUnit called:', { unitId, popupPilotId, category: popupKillCategory });

    try {
      // Check if this is a generic unit (starts with GENERIC_)
      const isGeneric = unitId.startsWith('GENERIC_');

      let unitData: any;
      let actualUnitId = unitId;

      if (isGeneric) {
        // For generic units, create or find the generic unit type in database
        const category = unitId.replace('GENERIC_', '') as 'A2A' | 'A2G' | 'A2S';

        // Try to find existing generic unit
        const { data: existing } = await supabase
          .from('dcs_unit_types')
          .select('*')
          .eq('type_name', unitId)
          .maybeSingle();

        if (existing) {
          unitData = existing;
          actualUnitId = existing.id;
        } else {
          // Create new generic unit type
          const { data: created, error: createError } = await supabase
            .from('dcs_unit_types')
            .insert({
              type_name: unitId,
              display_name: `Generic ${category}`,
              category: 'UNKNOWN',
              kill_category: category,
              is_active: true,
              source: 'Manual'
            })
            .select()
            .single();

          if (createError) throw createError;
          unitData = created;
          actualUnitId = created.id;
        }
      } else {
        // Regular unit - fetch from database
        const { data, error: unitError } = await supabase
          .from('dcs_unit_types')
          .select('*')
          .eq('id', unitId)
          .single();

        if (unitError) throw unitError;
        unitData = data;
      }

      // Check if this pilot already has a kill record for this unit type
      const existingRecord = killRecords.find(
        r => r.pilotId === popupPilotId && r.unitTypeId === actualUnitId
      );
      const newKillCount = existingRecord ? existingRecord.killCount + 1 : 1;

      // Add unit to mission pool if not already there
      if (!missionPoolUnits.find(u => u.id === actualUnitId)) {
        setMissionPoolUnits(prev => [...prev, {
          id: actualUnitId,
          type_name: unitData.type_name,
          display_name: unitData.display_name,
          category: unitData.category,
          sub_category: unitData.sub_category,
          kill_category: unitData.kill_category,
          source: unitData.source,
          is_active: unitData.is_active
        }]);
      }

      // Generate a temporary ID for new records (will be replaced with actual DB ID on save)
      const recordId = existingRecord ? existingRecord.id : `temp-${Date.now()}-${Math.random()}`;

      const updatedRecord = {
        id: recordId,
        pilotId: popupPilotId,
        unitTypeId: actualUnitId,
        unitDisplayName: unitData.display_name,
        unitTypeName: unitData.type_name,
        killCount: newKillCount,
        killCategory: unitData.kill_category
      };

      console.log(existingRecord ? 'Updating kill record:' : 'Adding new kill record:', updatedRecord);
      setKillRecords(prev => {
        if (existingRecord) {
          // Update existing record
          const updated = prev.map(r =>
            r.id === existingRecord.id ? updatedRecord : r
          );
          console.log('Updated killRecords:', updated);
          return updated;
        } else {
          // Add new record
          const updated = [...prev, updatedRecord];
          console.log('Updated killRecords:', updated);
          return updated;
        }
      });

      setShowPopup(false);
      onKillsChange?.(true);
      console.log('Kill added successfully');
    } catch (err) {
      console.error('Failed to add kill:', err);
    }
  };

  const handleOpenBrowser = () => {
    setBrowserKillCategory(popupKillCategory);
    setShowPopup(false);
    setShowBrowser(true);
  };

  const handleBrowserSelectUnit = async (unitId: string) => {
    if (!popupPilotId) return;
    setShowBrowser(false);
    await handleSelectUnit(unitId);
  };

  const handleIncrement = (killRecordId: string) => {
    const record = killRecords.find(k => k.id === killRecordId);
    if (!record) return;

    setKillRecords(prev => prev.map(k =>
      k.id === killRecordId ? { ...k, killCount: k.killCount + 1 } : k
    ));
    onKillsChange?.(true);
  };

  const handleDecrement = (killRecordId: string) => {
    const record = killRecords.find(k => k.id === killRecordId);
    if (!record) return;

    if (record.killCount <= 1) {
      // Remove the record entirely
      setKillRecords(prev => prev.filter(k => k.id !== killRecordId));
    } else {
      // Decrement the count
      setKillRecords(prev => prev.map(k =>
        k.id === killRecordId ? { ...k, killCount: k.killCount - 1 } : k
      ));
    }
    onKillsChange?.(true);
  };

  const handlePilotStatusIndicatorClick = (event: React.MouseEvent, pilotId: string) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const indicatorBottom = rect.bottom;
    const indicatorLeft = rect.left;
    const gap = 4;

    // Position menu below the indicator, centered horizontally with it
    const menuWidth = 40; // 32px button + 4px padding each side
    const menuLeft = indicatorLeft + (rect.width / 2) - (menuWidth / 2);

    setStatusMenuPosition({
      pilot: { top: indicatorBottom + gap, left: menuLeft },
      aircraft: { top: 0, left: 0 } // Not used but required
    });

    setStatusMenuPilotId(pilotId);
    setShowPilotStatusMenu(true);
    setShowAircraftStatusMenu(false);
  };

  const handleAircraftStatusIndicatorClick = (event: React.MouseEvent, pilotId: string) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const indicatorBottom = rect.bottom;
    const indicatorLeft = rect.left;
    const gap = 4;

    // Position menu below the indicator, centered horizontally with it
    const menuWidth = 40; // 32px button + 4px padding each side
    const menuLeft = indicatorLeft + (rect.width / 2) - (menuWidth / 2);

    setStatusMenuPosition({
      pilot: { top: 0, left: 0 }, // Not used but required
      aircraft: { top: indicatorBottom + gap, left: menuLeft }
    });

    setStatusMenuPilotId(pilotId);
    setShowPilotStatusMenu(false);
    setShowAircraftStatusMenu(true);
  };

  const handlePilotStatusChange = (pilotId: string, status: 'alive' | 'mia' | 'kia' | 'unaccounted') => {
    setPilotStatuses(prev => {
      const newMap = new Map(prev);
      const existing = newMap.get(pilotId) || { pilotId, pilotStatus: 'unaccounted', aircraftStatus: 'unaccounted' };
      newMap.set(pilotId, { ...existing, pilotStatus: status });
      return newMap;
    });
    setShowPilotStatusMenu(false);
    onKillsChange?.(true);
  };

  const handleAircraftStatusChange = (pilotId: string, status: 'recovered' | 'damaged' | 'destroyed' | 'down' | 'unaccounted') => {
    setPilotStatuses(prev => {
      const newMap = new Map(prev);
      const existing = newMap.get(pilotId) || { pilotId, pilotStatus: 'unaccounted', aircraftStatus: 'unaccounted' };
      newMap.set(pilotId, { ...existing, aircraftStatus: status });
      return newMap;
    });
    setShowAircraftStatusMenu(false);
    onKillsChange?.(true);
  };

  // Click outside to close status menus
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;

      // Don't close if clicking inside a status menu
      if (target.closest('[data-status-menu]')) {
        return;
      }

      // Close menus on outside click
      setShowPilotStatusMenu(false);
      setShowAircraftStatusMenu(false);
    };

    if (showPilotStatusMenu || showAircraftStatusMenu) {
      // Small delay to prevent immediate closure when opening
      setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
      }, 0);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showPilotStatusMenu, showAircraftStatusMenu]);

  const renderCategorySection = (category: 'A2A' | 'A2G' | 'A2S', label: string) => {
    // Calculate totals for each pilot in this category
    const pilotTotals = allPilots.map(pilot => {
      if (!pilot) return 0;
      return killRecords
        .filter(k => k.pilotId === pilot.id && k.killCategory === category)
        .reduce((sum, k) => sum + k.killCount, 0);
    });

    // Calculate flight total for this category
    const flightTotal = pilotTotals.reduce((sum, total) => sum + total, 0);

    return (
      <div style={{ marginBottom: '12px' }}>
        {/* Category section with header on left */}
        <div
          style={{
            display: 'flex',
            border: '1px solid #E2E8F0',
            borderRadius: '8px',
            overflow: 'hidden'
          }}
        >
          {/* Category Header - vertical text on colored background */}
          <div
            style={{
              width: '32px',
              backgroundColor: categoryColors[category],
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              position: 'relative'
            }}
          >
            <div
              style={{
                writingMode: 'vertical-rl',
                transform: 'rotate(180deg)',
                fontSize: '14px',
                fontWeight: 600,
                color: '#FFFFFF',
                letterSpacing: '1px',
                textAlign: 'center'
              }}
            >
              {label}
            </div>
            {/* Flight total for this category - positioned absolutely at bottom */}
            {flightTotal > 0 && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '8px',
                  minHeight: '24px',
                  display: 'flex',
                  alignItems: 'center',
                  fontSize: '14px',
                  fontWeight: 700,
                  color: '#FFFFFF'
                }}
              >
                x{flightTotal}
              </div>
            )}
          </div>

          {/* Pilot Columns - each pilot's kills stack vertically */}
          <div style={{ display: 'flex', gap: '8px', padding: '8px' }}>
            {allPilots.map((pilot, index) => {
              const dashNumber = ['2', '1', '3', '4'][index];

              // Get this pilot's kills for this category (empty array if no pilot)
              const pilotKills = pilot ? killRecords.filter(
                k => k.pilotId === pilot.id && k.killCategory === category
              ) : [];

              const total = pilotTotals[index];

              return (
                <div key={`column-${dashNumber}`} style={{ width: '120px', display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
                  {/* Each kill for this pilot in this category */}
                  {pilotKills.map(record => {
                    return (
                      <KillCell
                        key={record.id}
                        killCount={record.killCount}
                        unitDisplayName={record.unitDisplayName}
                        onIncrement={() => handleIncrement(record.id)}
                        onDecrement={() => handleDecrement(record.id)}
                      />
                    );
                  })}
                  {/* Add button at bottom of pilot's column - only if pilot exists */}
                  {pilot && <AddKillButton onClick={(e) => handleAddButtonClick(e, pilot.id, category)} />}
                  {/* Total count - only show if there are kills */}
                  {total > 0 && (
                    <div
                      style={{
                        width: '120px',
                        minHeight: '24px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '14px',
                        fontWeight: 700,
                        color: '#000000',
                        marginTop: '4px'
                      }}
                    >
                      x{total}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>
        Loading kill tracking data...
      </div>
    );
  }

  // Get vertical offset for each position (matching Mission Prep)
  const getVerticalOffset = (dashNumber: string): number => {
    switch (dashNumber) {
      case '2': return 10;
      case '1': return 0;
      case '3': return 10;
      case '4': return 20;
      default: return 0;
    }
  };

  // Ensure we have placeholders for all 4 positions
  const allPilots: (PilotInfo | null)[] = ['2', '1', '3', '4'].map(dash =>
    pilots.find(p => p.dashNumber === dash) || null
  );

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      {/* Pilot Tiles Row - using same structure as category sections for perfect alignment */}
      <div style={{ marginBottom: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          {/* Invisible spacer matching category header width */}
          <div style={{ width: '32px', flexShrink: 0 }} />

          {/* Tiles container - matches category section structure exactly */}
          <div style={{ display: 'flex', gap: '8px', padding: '8px' }}>
            {allPilots.map((pilot, index) => {
              const dashNumber = ['2', '1', '3', '4'][index];
              const offset = getVerticalOffset(dashNumber);

              return (
                <div
                  key={`pilot-${dashNumber}`}
                  style={{
                    position: 'relative',
                    width: '120px',
                    marginTop: `${offset}px`,
                    display: 'flex',
                    justifyContent: 'center'
                  }}
                >
                  <div style={{ width: '92px' }}>
                    {pilot ? (
                      <PilotKillTile
                        boardNumber={pilot.boardNumber}
                        callsign={pilot.callsign}
                        dashNumber={pilot.dashNumber}
                        flightNumber={pilot.flightNumber}
                        flightCallsign={pilot.flightCallsign}
                        isFlightLead={pilot.isFlightLead}
                        isSectionLead={dashNumber === '3'}
                        onPilotStatusClick={(e) => handlePilotStatusIndicatorClick(e, pilot.id)}
                        onAircraftStatusClick={(e) => handleAircraftStatusIndicatorClick(e, pilot.id)}
                        pilotStatus={pilotStatuses.get(pilot.id)?.pilotStatus || 'unaccounted'}
                        aircraftStatus={pilotStatuses.get(pilot.id)?.aircraftStatus || 'unaccounted'}
                      />
                    ) : (
                      <PilotKillTile
                        boardNumber=""
                        callsign=""
                        dashNumber={dashNumber}
                        flightNumber="1"
                        flightCallsign={flightCallsign}
                        isFlightLead={dashNumber === '1'}
                        isSectionLead={dashNumber === '3'}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Kill Category Sections */}
      {renderCategorySection('A2A', 'A2A')}
      {renderCategorySection('A2G', 'A2G')}
      {renderCategorySection('A2S', 'A2S')}

      {/* Unit Selector Popup */}
      {showPopup && popupPilotId && (
        <UnitSelectorPopup
          killCategory={popupKillCategory}
          missionPoolUnits={missionPoolUnits}
          position={popupPosition}
          onSelectUnit={handleSelectUnit}
          onOpenBrowser={handleOpenBrowser}
          onClose={() => setShowPopup(false)}
        />
      )}

      {/* Unit Browser Modal */}
      {showBrowser && (
        <UnitBrowserModal
          killCategory={browserKillCategory}
          onSelectUnit={handleBrowserSelectUnit}
          onClose={() => setShowBrowser(false)}
        />
      )}

      {/* Pilot Status Menu */}
      {showPilotStatusMenu && statusMenuPilotId && (
        <PilotStatusMenu
          currentStatus={pilotStatuses.get(statusMenuPilotId)?.pilotStatus || 'alive'}
          onSelect={(status) => handlePilotStatusChange(statusMenuPilotId, status)}
          position={statusMenuPosition.pilot}
        />
      )}

      {/* Aircraft Status Menu */}
      {showAircraftStatusMenu && statusMenuPilotId && (
        <AircraftStatusMenu
          currentStatus={pilotStatuses.get(statusMenuPilotId)?.aircraftStatus || 'recovered'}
          onSelect={(status) => handleAircraftStatusChange(statusMenuPilotId, status)}
          position={statusMenuPosition.aircraft}
        />
      )}
    </div>
  );
});

EnhancedKillTrackingCardV2.displayName = 'EnhancedKillTrackingCardV2';

export default EnhancedKillTrackingCardV2;
