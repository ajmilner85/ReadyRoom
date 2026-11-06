import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button, EmptyState, Pane, ToolbarButton, ToolbarGroup, legibleColor } from '../primitives';
import { 
  isValidFrequency, 
  isValidTACAN, 
  isValidILS,
  isValidKYFill,
  hasFrequencyConflict 
} from '../../../utils/commsUtils';
import { 
  CommsPlanEntry, 
  generateInitialCommsData,
  normalizeCommsEntries
} from '../../../types/CommsTypes';
import { Flight, FlightMember } from '../../../types/FlightData';
import { resolveNewMissionCommsPlan } from '../../../utils/commsTemplateService';
import { usePermissions } from '../../../hooks/usePermissions';
import CopyCommsPopover from './CopyCommsPopover';
import SaveCommsTemplatePopover from './SaveCommsTemplatePopover';

interface CommunicationsProps {
  width: string;
  assignedPilots?: Record<string, any> | null;
  onTransferToMission?: (flights: Flight[]) => void;
  flights?: any[];
  extractedFlights?: Array<{
    name: string;
    units: Array<{
      name: string;
      type: string;
      onboard_num: string;
      callsign?: { [key: number]: string | number } | string;
      fuel: number;
    }>;
  }>;
  squadrons?: Array<{
    id: string;
    name: string;
    callsigns?: string[];
    color_palette?: any;
  }>;
  updateMissionSettings?: (settings: any) => Promise<boolean>;
  mission?: any; // Mission object to load comms_plan from
}

const Communications: React.FC<CommunicationsProps> = ({
  width,
  assignedPilots = {},
  onTransferToMission,
  flights = [],
  extractedFlights = [],
  squadrons = [],
  updateMissionSettings,
  mission
}) => {
  const hasMissionComms = (m: any) =>
    Array.isArray(m?.mission_settings?.comms_plan) && m.mission_settings.comms_plan.length > 0;

  // Initialize from the mission's saved comms plan; otherwise the built-in card until the
  // org-configured initial plan is resolved (see effect below).
  const [commsData, setCommsData] = useState<CommsPlanEntry[]>(() =>
    hasMissionComms(mission)
      ? normalizeCommsEntries(mission.mission_settings.comms_plan)
      : generateInitialCommsData()
  );

  const [isEditing, setIsEditing] = useState(false);
  const [editedData, setEditedData] = useState<CommsPlanEntry[]>([]);
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [openPopover, setOpenPopover] = useState<'copy' | 'save' | null>(null);
  const copyButtonRef = useRef<HTMLButtonElement>(null);
  const saveTemplateButtonRef = useRef<HTMLButtonElement>(null);
  const { hasPermission } = usePermissions();
  const canManageTemplates = hasPermission('manage_comms_templates');

  // Tracks the JSON of the last comms plan loaded from / written to the DB so we only call
  // setCommsData when the content actually changed.
  const lastLoadedCommsJsonRef = useRef<string>('');
  // Mission IDs we've already seeded with an initial comms plan (prevents duplicate seeding)
  const seededMissionIdsRef = useRef<Set<string>>(new Set());
  // Latest mission, so persistComms can merge into the current mission_settings
  const missionRef = useRef<any>(mission);
  missionRef.current = mission;

  // Persist an explicit local change (edit, copy, initial seed) to the mission.
  // Only called for local actions — remote changes arrive via the mission prop and are
  // never re-saved, which keeps collaborators from ping-ponging saves.
  const persistComms = useCallback((entries: CommsPlanEntry[]) => {
    const normalized = normalizeCommsEntries(entries);
    lastLoadedCommsJsonRef.current = JSON.stringify(normalized);
    setCommsData(normalized);
    if (updateMissionSettings && missionRef.current?.id) {
      updateMissionSettings({
        ...(missionRef.current.mission_settings || {}),
        comms_plan: normalized
      });
    }
  }, [updateMissionSettings]);

  // Load comms plan from mission when it changes (including remote collaborator changes).
  // Missions with no comms plan are seeded once per the org Mission Preparation setting.
  useEffect(() => {
    if (!mission?.id) return;

    if (hasMissionComms(mission)) {
      const incoming = normalizeCommsEntries(mission.mission_settings.comms_plan);
      const incomingJson = JSON.stringify(incoming);
      if (incomingJson !== lastLoadedCommsJsonRef.current) {
        console.log('[COMMS] Mission comms plan changed, reloading from database');
        lastLoadedCommsJsonRef.current = incomingJson;
        setCommsData(incoming);
      }
      return;
    }

    if (seededMissionIdsRef.current.has(mission.id)) return;
    seededMissionIdsRef.current.add(mission.id);

    const missionId = mission.id;
    resolveNewMissionCommsPlan(mission.event_id).then(plan => {
      // Bail if the user switched missions, or a collaborator seeded it first
      if (missionRef.current?.id !== missionId || hasMissionComms(missionRef.current)) return;
      console.log('[COMMS] Seeding empty mission comms plan');
      persistComms(plan);
    });
    // Only re-run when the mission or its settings change, not on every mission field update
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mission?.id, mission?.mission_settings, persistComms]);

  const startEditing = () => {
    setIsEditing(true);
    setEditedData([...commsData]);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditedData([]);
  };

  const saveChanges = () => {
    persistComms(editedData);
    setIsEditing(false);
  };

  const applyCopiedComms = (entries: CommsPlanEntry[]) => {
    persistComms(entries);
    setIsEditing(false);
    setEditedData([]);
    setOpenPopover(null);
  };

  const handleCellEdit = (index: number, field: keyof CommsPlanEntry, value: string) => {
    const newData = [...editedData];
    let processedValue = value;

    // Format empty values
    if (value.trim() === '') {
      processedValue = '——';
    }

    // For frequency field, store the raw value without formatting
    // Formatting will happen on blur or save
    if (field === 'freq' && value !== '——') {
      processedValue = value;
    } else if (field === 'ils' && value !== '——') {
      // Make sure ILS is an integer between 1-20
      const ilsNum = parseInt(value, 10);
      if (!isNaN(ilsNum) && isValidILS(value)) {
        processedValue = ilsNum.toString();
      }
    } else if (field === 'kyFill' && value !== '——') {
      // Make sure KY Fill is an integer between 1-6
      const kyFillNum = parseInt(value, 10);
      if (!isNaN(kyFillNum) && isValidKYFill(value)) {
        processedValue = kyFillNum.toString();
      }
    }

    newData[index] = {
      ...newData[index],
      [field]: processedValue
    };

    setEditedData(newData);
  };

  // Format frequency field when user leaves the input
  const handleFrequencyBlur = (index: number) => {
    const newData = [...editedData];
    const freq = newData[index].freq;
    
    if (freq !== '——' && freq !== '') {
      const numValue = parseFloat(freq);
      if (!isNaN(numValue) && isValidFrequency(freq)) {
        newData[index].freq = numValue.toFixed(3);
        setEditedData(newData);
      }
    }
  };

  // Function to calculate total fuel including external tanks
  const calculateTotalFuel = (unit: any) => {
    let totalFuel = unit.fuel || 4900; // Default to standard F/A-18C internal fuel if not specified

    try {
      if (unit.payload?.pylons) {
        // Handle both array and object pylon structures
        const pylonValues = Array.isArray(unit.payload.pylons) 
          ? unit.payload.pylons
          : Object.values(unit.payload.pylons);

        pylonValues.forEach((pylon: { CLSID: string }) => {
          if (!pylon || typeof pylon !== 'object') return;
          
          const clsid = pylon.CLSID;
          if (!clsid) return;

          // Only count FPU-8A tanks for F/A-18C
          if (clsid === '{FPU_8A_FUEL_TANK}' && unit.type === 'FA-18C_hornet') {
            totalFuel += 2200;
          }
        });
      }
    } catch (error) {
      console.error('Error calculating fuel:', error);
    }

    return totalFuel;
  };

  // Parse a group name into callsign and flight number
  const parseGroupName = (name: string): { callsign: string; flightNumber: string } => {
    // Split on last space to handle callsigns with spaces
    const lastSpaceIndex = name.lastIndexOf(' ');
    if (lastSpaceIndex === -1) {
      return { callsign: name, flightNumber: "1" };
    }
    
    const callsign = name.substring(0, lastSpaceIndex);
    const flightNumber = name.substring(lastSpaceIndex + 1);
    
    // Validate that flight number is actually a number
    if (!/^\d+$/.test(flightNumber)) {
      return { callsign: name, flightNumber: "1" };
    }
    
    return { callsign, flightNumber };
  };

  const handleTransferToMission = () => {
    if (onTransferToMission && flights.length > 0) {
      // If there are already flights in the mission execution page, show confirmation dialog
      setShowConfirmDialog(true);
    } else {
      // Otherwise, transfer flights immediately
      transferFlights();
    }
  };

  const transferFlights = () => {
    if (!onTransferToMission) return;
    
    // Convert flight assignments to Flight objects
    const transferFlights: Flight[] = flights.map(flight => {
      const assigned = assignedPilots?.[flight.id] || [];
      
      // Find which squadron owns this callsign
      const owningSquadron = squadrons.find(sq => 
        sq.callsigns && Array.isArray(sq.callsigns) && 
        sq.callsigns.some((cs: string) => cs.toUpperCase() === flight.callsign.toUpperCase())
      );
      
      // Find matching extracted flight directly from extractedFlights by callsign and flight number
      const matchingExtractedFlight = extractedFlights.find(ef => {
        const { callsign, flightNumber } = parseGroupName(ef.name);
        return callsign.toUpperCase() === flight.callsign && 
               flightNumber === flight.flightNumber;
      });
      
      // Create a FlightMember for each assigned pilot
      const members = flight.pilots.map((pilot: any) => {
        const assignedPilot = assigned.find((p: any) => p.dashNumber === pilot.dashNumber);
        
        // Default fuel value - will use this if we can't find a match
        let fuelValue = 5.0;
        
        // Try to get fuel directly from matching extracted flight
        if (matchingExtractedFlight && matchingExtractedFlight.units) {
          // Get the dash number (1-based) and convert to 0-based index
          const dashPosition = parseInt(pilot.dashNumber) - 1;
          
          // Check if we have that unit position in the extracted flight
          if (dashPosition >= 0 && dashPosition < matchingExtractedFlight.units.length) {
            const unit = matchingExtractedFlight.units[dashPosition];
            
            // Use our calculateTotalFuel function to get the proper total fuel value including external tanks
            if (unit) {
              // Calculate total fuel in pounds including external tanks
              const totalFuelPounds = calculateTotalFuel(unit);
              
              // Convert from pounds to 1000s of pounds (divide by 1000)
              fuelValue = totalFuelPounds / 1000;
            }
          }
        }
        
        return {
          dashNumber: pilot.dashNumber,
          boardNumber: assignedPilot?.boardNumber || "",
          fuel: fuelValue,
          pilotCallsign: assignedPilot?.callsign || ""
        };
      }).filter((member: any) => member.boardNumber !== ""); // Only include members with assigned board numbers
      
      // Only include flights that have at least one assigned pilot
      if (members.length === 0) return null;
      
      // Calculate the low state as the minimum fuel among all members
      const lowState = Math.min(...members.map((m: FlightMember) => m.fuel));
      
      // Determine aircraft type from squadron's airframe (preferred) or DCS mission data (fallback)
      let aircraftType: string | undefined;
      
      // First priority: Use squadron's airframe if available
      if (owningSquadron && (owningSquadron as any).airframe) {
        aircraftType = (owningSquadron as any).airframe.designation;
      } 
      // Fallback: Extract from DCS mission file
      else if (matchingExtractedFlight && matchingExtractedFlight.units && matchingExtractedFlight.units.length > 0) {
        aircraftType = matchingExtractedFlight.units[0].type;
      }
      
      const flightData = {
        id: `transferred-${flight.id}-${Date.now()}`,
        flightNumber: flight.flightNumber,
        callsign: flight.callsign,
        members,
        lowState, // Use calculated low state instead of hardcoded value
        currentSection: "", // Empty string for unassigned flights - will be set to Launch in App.tsx
        currentDivision: 0, // Will be updated based on stepTime in App.tsx
        formation: members.length > 1 ? "group" : "single",
        squadronId: owningSquadron?.id,
        squadronColorPalette: owningSquadron?.color_palette ? {
          primary: owningSquadron.color_palette.primary,
          accent: owningSquadron.color_palette.accent
        } : undefined,
        aircraftType,
        stepTime: flight.stepTime ?? 0 // Transfer step time from flight assignments
      };

      return flightData;
    }).filter(Boolean) as Flight[];
      onTransferToMission(transferFlights);
    setShowConfirmDialog(false);
  };

  // ---- Channel table: CH 1–20 in the centre, PRI preset fields to the left, AUX to the right.
  // Entries carry radio: 'PRI' | 'AUX' (legacy data = PRI); each row shows its fields on that side.
  type CommsField = 'name' | 'freq' | 'tacan' | 'ils' | 'kyFill';
  const isBlank = (v: string) => !v || v === '——';
  const renderCommsCell = (row: any, index: number, field: CommsField, align: 'left' | 'right' | 'center') => {
    const raw = row[field] as string;
    const invalid = isEditing && (
      (field === 'freq' && (!isValidFrequency(raw) || hasFrequencyConflict(raw, editedData, index))) ||
      (field === 'tacan' && !isValidTACAN(raw)) ||
      (field === 'ils' && !isValidILS(raw)) ||
      (field === 'kyFill' && !isValidKYFill(raw))
    );
    const conflict = !isEditing && field === 'freq' && hasFrequencyConflict(raw, commsData, index);
    if (isEditing) {
      return (
        <input
          type="text"
          value={isBlank(raw) ? '' : raw}
          onChange={(e) => handleCellEdit(index, field, field === 'tacan' ? e.target.value.toUpperCase() : e.target.value)}
          onBlur={field === 'freq' ? () => handleFrequencyBlur(index) : undefined}
          className={`w-full h-[22px] px-1 rounded-rr-sm bg-panel2 border text-[12px] focus:outline-none focus:border-accent ${field === 'name' ? '' : 'font-mono'} ${invalid ? 'border-bad text-bad' : 'border-border2 text-text'}`}
          style={{ textAlign: align }}
        />
      );
    }
    if (isBlank(raw)) return <span className="text-text3">—</span>;
    if (field === 'kyFill') return <span className="font-mono font-semibold text-good">{raw}</span>;
    return (
      <span className={field === 'name' ? 'font-semibold text-text' : `font-mono ${conflict ? 'text-bad' : field === 'freq' ? 'text-text' : 'text-text2'}`}>
        {raw}
      </span>
    );
  };

  const renderCommsPlanTable = () => {
    const rows = isEditing ? editedData : commsData;
    const side = (row: any, radio: 'PRI' | 'AUX', index: number) => {
      const on = (row.radio === 'AUX' ? 'AUX' : 'PRI') === radio;
      const cells: { f: CommsField; w?: string; align: 'left' | 'right' | 'center' }[] = radio === 'PRI'
        ? [{ f: 'name', align: 'left' }, { f: 'freq', w: '78px', align: 'right' }, { f: 'tacan', w: '52px', align: 'center' }, { f: 'ils', w: '38px', align: 'center' }, { f: 'kyFill', w: '34px', align: 'center' }]
        : [{ f: 'kyFill', w: '34px', align: 'center' }, { f: 'ils', w: '38px', align: 'center' }, { f: 'tacan', w: '52px', align: 'center' }, { f: 'freq', w: '78px', align: 'left' }, { f: 'name', align: 'right' }];
      return cells.map(c => (
        <td key={`${radio}-${c.f}`} className="px-2 py-[5px] text-[12.5px] whitespace-nowrap" style={{ width: c.w, textAlign: c.align }}>
          {on ? renderCommsCell(row, index, c.f, c.align) : <span className="text-text3">—</span>}
        </td>
      ));
    };
    const th = 'px-2 py-[6px] font-mono text-[9.5px] tracking-[.1em] text-text3 font-normal';
    return (
      <table className="w-full border-collapse" style={{ tableLayout: 'auto' }}>
        <thead className="sticky top-0 z-[1] bg-panel2">
          <tr className="border-b border-border">
            <th colSpan={5} className="py-[6px] font-mono text-[10px] tracking-[.14em] text-accent text-center font-semibold">PRIMARY · PRI</th>
            <th className="py-[6px] font-mono text-[10px] tracking-[.14em] text-text3 text-center border-x border-border font-normal">CH</th>
            <th colSpan={5} className="py-[6px] font-mono text-[10px] tracking-[.14em] text-text3 text-center font-normal">AUXILIARY · AUX</th>
          </tr>
          <tr className="border-b border-border">
            <th className={th} style={{ textAlign: 'left' }}>NAME</th>
            <th className={th} style={{ textAlign: 'right' }}>FREQ</th>
            <th className={th}>TACAN</th>
            <th className={th}>ILS</th>
            <th className={th}>KY</th>
            <th className={`${th} text-text border-x border-border`}>CH</th>
            <th className={th}>KY</th>
            <th className={th}>ILS</th>
            <th className={th}>TACAN</th>
            <th className={th} style={{ textAlign: 'left' }}>FREQ</th>
            <th className={th} style={{ textAlign: 'right' }}>NAME</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={index}
              className="border-b border-border transition-colors"
              style={{ backgroundColor: hoveredRow === index ? 'var(--rr-panel2)' : 'transparent' }}
              onMouseEnter={() => setHoveredRow(index)}
              onMouseLeave={() => setHoveredRow(null)}
            >
              {side(row, 'PRI', index)}
              <td className="px-2 py-[5px] text-center border-x border-border" style={{ width: '44px' }}>
                <span className="inline-flex items-center justify-center min-w-[22px] h-[18px] px-1 rounded-rr-sm bg-panel3 font-mono text-[11px] font-semibold text-text">{row.chan}</span>
              </td>
              {side(row, 'AUX', index)}
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  // MIDS: B = one channel per flight (inter-flight); A = one channel per two-ship section.
  const midsRows = [...(flights || [])]
    .filter((f: any) => f && (f.midsA || f.midsB))
    .sort((a: any, b: any) => (a.callsign === b.callsign ? parseInt(a.flightNumber) - parseInt(b.flightNumber) : String(a.callsign).localeCompare(String(b.callsign))))
    .map((f: any) => {
      const a1 = parseInt(f.midsA) || 0;
      // Owning squadron = the one whose callsign list contains this flight's callsign (keyed by id, never tail code)
      const cs = String(f.callsign || '').toUpperCase();
      const owner = squadrons.find(sq => Array.isArray(sq.callsigns) && sq.callsigns.some(c => String(c).toUpperCase() === cs));
      return {
        id: f.id,
        name: `${f.callsign} ${f.flightNumber}`,
        color: legibleColor(owner?.color_palette?.primary, 'var(--rr-text3)'),
        b: f.midsB,
        sections: [
          { label: `${f.flightNumber}-1 / ${f.flightNumber}-2`, a: f.midsA },
          { label: `${f.flightNumber}-3 / ${f.flightNumber}-4`, a: a1 > 0 ? String(a1 + 1) : '' },
        ],
      };
    });
  return (
    <div data-m="row" className="rr-page flex-1 min-h-0 flex items-start gap-[14px]" data-width={width}>
      <Pane
        title="Comms Presets"
        className="flex-1 min-w-0 max-h-full"
        flush
        actions={
          !isEditing ? (
            <>
              <ToolbarGroup>
                {mission?.id ? (
                  <ToolbarButton
                    ref={copyButtonRef as React.Ref<HTMLButtonElement>}
                    icon="copy"
                    label="Copy comms card from a previous mission or template"
                    active={openPopover === 'copy'}
                    onClick={() => setOpenPopover(openPopover === 'copy' ? null : 'copy')}
                  />
                ) : null}
                {canManageTemplates ? (
                  <ToolbarButton
                    ref={saveTemplateButtonRef as React.Ref<HTMLButtonElement>}
                    icon="save"
                    label="Save comms card as template"
                    active={openPopover === 'save'}
                    onClick={() => setOpenPopover(openPopover === 'save' ? null : 'save')}
                  />
                ) : null}
                <ToolbarButton icon="edit" label="Edit comms card" onClick={() => { setOpenPopover(null); startEditing(); }} />
              </ToolbarGroup>
              {openPopover === 'copy' && (
                <CopyCommsPopover
                  anchorRef={copyButtonRef}
                  currentEventId={mission?.event_id}
                  currentCycleId={mission?.event?.cycleId}
                  onConfirm={applyCopiedComms}
                  onClose={() => setOpenPopover(null)}
                />
              )}
              {openPopover === 'save' && (
                <SaveCommsTemplatePopover
                  anchorRef={saveTemplateButtonRef}
                  entries={commsData}
                  onClose={() => setOpenPopover(null)}
                />
              )}
            </>
          ) : (
            <>
              <Button size="sm" variant="ghost" onClick={cancelEditing}>Cancel</Button>
              <Button size="sm" variant="primary" icon="check" onClick={saveChanges}>Save</Button>
            </>
          )
        }
      >
        <div className="min-w-[760px]">{renderCommsPlanTable()}</div>
        <div className="px-3 py-2 text-[11px] text-text2 border-t border-border">
          KY = cypher number (green); unencrypted shows —. Channels are assigned to PRI or AUX in Settings › Mission Preparation templates.
        </div>
      </Pane>

      <div className="flex-none w-[360px] flex flex-col gap-[14px] min-h-0 max-h-full">
        <Pane
          title="MIDS Channels"
          className="flex-initial"
          meta={<span className="font-mono text-[10px] text-text3">B = FLIGHT · A = SECTION</span>}
        >
          {midsRows.length === 0 ? (
            <EmptyState compact title="No MIDS assignments" message="Flights with MIDS channels appear here." />
          ) : (
            <div className="flex flex-col gap-2">
              {midsRows.map(r => (
                <div key={r.id} className="rounded-rr-lg bg-panel2 border border-border">
                  <div className="flex items-center gap-2 px-3 py-[7px] border-b border-border">
                    <span className="w-[3px] h-[13px] rounded-[2px]" style={{ background: r.color }} />
                    <span className="text-[12.5px] font-bold">{r.name}</span>
                    <span className="ml-auto font-mono text-[9.5px] tracking-[.1em] text-text3">MIDS B</span>
                    <span className="font-mono text-[15px] font-bold text-text">{r.b || '—'}</span>
                  </div>
                  {r.sections.map(sec => (
                    <div key={sec.label} className="flex items-center gap-2 px-3 py-[4px] font-mono text-[11px] text-text2">
                      <span>SECTION {sec.label}</span>
                      <span className="ml-auto text-[9.5px] tracking-[.1em] text-text3">MIDS A</span>
                      <span className="w-6 text-right text-[13px] font-bold text-accent">{sec.a || '—'}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </Pane>

        <Pane title="Export" className="flex-none" scroll={false}>
          <div className="flex flex-col gap-2">
            <Button variant="secondary" icon="fileDown" block>Export Kneeboards</Button>
            <Button variant="primary" icon="send" block onClick={handleTransferToMission}>Transfer to Mission</Button>
          </div>
        </Pane>
      </div>

      {/* Confirmation Dialog */}
      {showConfirmDialog && (
        <>
          {/* Semi-transparent overlay */}
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 1000,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center'
          }} onClick={() => setShowConfirmDialog(false)} />
          
          {/* Dialog */}
          <div style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: 'var(--rr-panel)',
            padding: '24px',
            borderRadius: '10px',
            boxShadow: 'var(--rr-shadow)',
          border: '1px solid var(--rr-border)',
            width: '400px',
            zIndex: 1001
          }}>
            <h3 style={{
              fontSize: '18px',
              fontWeight: 600,
              marginBottom: '16px',
              textAlign: 'center'
            }}>
              Replace Mission Cards
            </h3>
            <p style={{
              fontSize: '14px',
              marginBottom: '24px',
              textAlign: 'center'
            }}>
              This will replace all existing cards in the Mission Execution page. Are you sure you want to continue?
            </p>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between'
            }}>
              <button
                onClick={() => setShowConfirmDialog(false)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: 'var(--rr-panel2)',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 500,
                  color: 'var(--rr-text2)'
                }}
              >
                Cancel
              </button>
              <button
                onClick={transferFlights}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#F24607',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 500,
                  color: 'white'
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Communications;