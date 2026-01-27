// filepath: c:\Users\ajmil\OneDrive\Desktop\pri-fly\src\components\ui\mission prep\AvailablePilots.tsx
import React, { useState, useMemo, useRef, useEffect } from 'react';
import QualificationBadge from '../QualificationBadge';
import { ClipboardCheck, Settings, X, HelpCircle, MessageCircleOff, ArrowUpDown } from 'lucide-react';
import { useDraggable } from '@dnd-kit/core';
import type { Pilot, QualificationType } from '../../../types/PilotTypes';
import type { Event } from '../../../types/EventTypes';
import type { AssignedPilot } from '../../../types/MissionPrepTypes';
import { updateRollCallResponse, syncRollCallResponses } from '../../../utils/rollCallUtils';
import { useAppSettings } from '../../../context/AppSettingsContext';
import FilterDrawer, { QualificationFilterMode } from '../roster/FilterDrawer';
import { Squadron } from '../../../utils/squadronService';
import { Status } from '../../../utils/statusService';
import { Standing } from '../../../utils/standingService';
import { Role } from '../../../utils/roleService';
import { Qualification } from '../../../utils/qualificationService';

// Define the structure for the polled attendance data (matching MissionPreparation)
interface RealtimeAttendanceRecord {
  discord_id: string;
  response: 'accepted' | 'declined' | 'tentative';
  roll_call_response?: 'Present' | 'Absent' | 'Tentative'; // Add roll call response
}


interface AvailablePilotsProps {
  width: string;
  pilots: Pilot[];
  selectedEvent: Event | null;
  assignedPilots?: Record<string, AssignedPilot[]>; // Use AssignedPilot type
  setAssignedPilots: React.Dispatch<React.SetStateAction<Record<string, AssignedPilot[]>>>; // *** ADD THIS PROP ***
  onAutoAssign: (pilotsForAssignment?: Pilot[]) => void; // *** FIX TYPE for onAutoAssign ***
  onAutoAssignSettings: () => void; // *** ADD SETTINGS HANDLER ***
  onClearAssignments: () => void;
  pilotQualifications?: Record<string, any[]>;
  realtimeAttendanceData: RealtimeAttendanceRecord[];
  // FilterDrawer props
  squadrons: Squadron[];
  statuses: Status[];
  standings: Standing[];
  roles: Role[];
  qualifications: Qualification[];
}

// These should match the updated QualificationType
const QUALIFICATION_ORDER: QualificationType[] = [
  'FAC(A)', 'TL', '4FL', '2FL', 'WQ', 'T/O', 'NATOPS', 'DFL', 'DTL'
];

// Recognized qualification types for grouping
const RECOGNIZED_QUALIFICATIONS: QualificationType[] = [
  ...QUALIFICATION_ORDER,
  'Strike Lead', 'Instructor Pilot', 'LSO', 'Flight Lead', 'Section Lead', 
  'CQ', 'Night CQ', 'Wingman'
];

interface PilotEntryProps {
  pilot: Pilot & {
    attendanceStatus?: 'accepted' | 'tentative' | 'declined';
    rollCallStatus?: 'Present' | 'Absent' | 'Tentative';
  };
  isAssigned?: boolean;
  currentFlightId?: string;
  pilotQualifications?: any[];
  isRollCallMode?: boolean;
  onRollCallResponse?: (pilotId: string, response: 'Present' | 'Absent' | 'Tentative') => void;
  displayWithSquadronColors?: boolean;
}  const PilotEntry: React.FC<PilotEntryProps> = ({
  pilot,
  isAssigned = false,
  currentFlightId,
  pilotQualifications,
  isRollCallMode = false,
  onRollCallResponse,
  displayWithSquadronColors = false
}) => {
  const [showTooltip, setShowTooltip] = useState(false);

  // Get squadron primary color for callsign styling
  const getSquadronPrimaryColor = () => {
    // When setting is disabled, use black for all pilots
    if (!displayWithSquadronColors) {
      return '#000000';
    }
    // Use squadron primary color from color_palette.primary if available, otherwise dark gray
    const squadronData = pilot.currentSquadron as any;
    const colorPalette = squadronData?.color_palette as { primary?: string } | null;
    return colorPalette?.primary || '#374151';
  };

  // Make sure we explicitly include attendanceStatus in drag data
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `pilot-${pilot.id || pilot.boardNumber}`,
    data: {
      type: 'Pilot',
      pilot: {
        ...pilot,
        // Explicitly ensure attendanceStatus is included
        attendanceStatus: pilot.attendanceStatus,
        rollCallStatus: pilot.rollCallStatus
      },
      currentFlightId
    },
    disabled: isRollCallMode // Only disable dragging in roll call mode, regardless of assignment
  });
  
  const originalStyle = useRef<CSSStyleDeclaration | null>(null);
  
  useEffect(() => {
    if (isDragging) {
      const element = document.getElementById(`pilot-${pilot.id || pilot.boardNumber}`);
      if (element) {
        originalStyle.current = window.getComputedStyle(element);
        element.style.transform = 'none';
        element.style.transition = 'none';
        element.style.zIndex = '1';
        element.style.opacity = '0.4';
      }
    } else if (originalStyle.current) {
      const element = document.getElementById(`pilot-${pilot.id || pilot.boardNumber}`);
      if (element) {
        element.style.opacity = isAssigned ? '0.5' : '1';
        element.style.zIndex = '1';
      }
      originalStyle.current = null;
    }
  }, [isDragging, pilot.id, pilot.boardNumber, isAssigned]);
  const style: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    height: '24px',
    marginBottom: '10px',
    transition: 'background-color 0.2s ease, opacity 0.2s ease',
    borderRadius: '8px',
    padding: '0 6px 0 2px',
    cursor: isRollCallMode ? 'default' : (isAssigned ? 'default' : 'grab'), // Change cursor when in roll call mode
    position: 'relative',
    left: 0,
    width: 'calc(100% - 8px)',
    zIndex: 1,
    maxWidth: '100%',
    overflow: 'hidden',
    opacity: (isRollCallMode || !isAssigned) ? 1 : 0.5, // No opacity reduction in roll call mode
  };

  const renderQualificationBadges = () => {
    if (isRollCallMode) {
      return null; // Don't show qualification badges in roll call mode
    }

    const dbQualifications = pilotQualifications || [];

    if (!dbQualifications || dbQualifications.length === 0) {
      return [];
    }

    // Sort qualifications by order
    const sortedQuals = dbQualifications
      .filter(pq => pq.qualification)
      .sort((a, b) => (a.qualification?.order || 999) - (b.qualification?.order || 999));

    // Each badge is 37px wide with 4px gap = 41px per badge
    // With the available space, we can show up to 8 badges before overflow
    const MAX_VISIBLE_BADGES = 8;

    if (sortedQuals.length <= MAX_VISIBLE_BADGES) {
      // Show all badges normally
      return sortedQuals.map((pq, index) => (
        <QualificationBadge
          key={`db-${pq.qualification.id}-${index}`}
          type={pq.qualification.name as QualificationType}
          code={pq.qualification.code}
          color={pq.qualification.color}
        />
      ));
    }

    // Show first (MAX_VISIBLE_BADGES - 1) badges plus overflow indicator
    const visibleQuals = sortedQuals.slice(0, MAX_VISIBLE_BADGES - 1);
    const overflowQuals = sortedQuals.slice(MAX_VISIBLE_BADGES - 1);

    return (
      <>
        {visibleQuals.map((pq, index) => (
          <QualificationBadge
            key={`db-${pq.qualification.id}-${index}`}
            type={pq.qualification.name as QualificationType}
            code={pq.qualification.code}
            color={pq.qualification.color}
          />
        ))}
        <div
          style={{ position: 'relative' }}
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          <div
            style={{
              backgroundColor: '#9CA3AF',
              borderRadius: '8px',
              width: '37px',
              height: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#F9FAFB',
              fontSize: '12px',
              fontWeight: 400,
              cursor: 'pointer'
            }}
          >
            +{overflowQuals.length}
          </div>
          {showTooltip && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: '4px',
                backgroundColor: '#1F2937',
                borderRadius: '8px',
                padding: '8px',
                display: 'flex',
                flexWrap: 'wrap',
                gap: '4px',
                maxWidth: '200px',
                zIndex: 1000,
                boxShadow: '0px 4px 6px -1px rgba(0, 0, 0, 0.1), 0px 2px 4px -1px rgba(0, 0, 0, 0.06)'
              }}
            >
              {overflowQuals.map((pq, index) => (
                <QualificationBadge
                  key={`db-${pq.qualification.id}-${index}-tooltip`}
                  type={pq.qualification.name as QualificationType}
                  code={pq.qualification.code}
                  color={pq.qualification.color}
                />
              ))}
            </div>
          )}
        </div>
      </>
    );
  };

  const renderRollCallButtons = () => {
    if (!isRollCallMode) return null;
    
    const pilotId = pilot.id || pilot.boardNumber;
    const currentRollCallStatus = pilot.rollCallStatus;
    
    // Define button styles
    const baseButtonStyle: React.CSSProperties = {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '28px',
      height: '24px',
      borderRadius: '4px',
      border: '1px solid #CBD5E1',
      backgroundColor: '#FFFFFF',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      marginLeft: '4px'
    };

    // Present button (checkmark)
    const isPresentActive = currentRollCallStatus === 'Present';
    const presentButtonStyle: React.CSSProperties = {
      ...baseButtonStyle,
      backgroundColor: isPresentActive ? '#22C55E' : '#FFFFFF',
      borderColor: isPresentActive ? '#22C55E' : '#CBD5E1',
      color: isPresentActive ? 'white' : '#64748B',
    };

    // Absent button (X)
    const isAbsentActive = currentRollCallStatus === 'Absent';
    const absentButtonStyle: React.CSSProperties = {
      ...baseButtonStyle,
      backgroundColor: isAbsentActive ? '#EF4444' : '#FFFFFF',
      borderColor: isAbsentActive ? '#EF4444' : '#CBD5E1',
      color: isAbsentActive ? 'white' : '#64748B',
    };

    // Tentative button (?)
    const isTentativeActive = currentRollCallStatus === 'Tentative';
    const tentativeButtonStyle: React.CSSProperties = {
      ...baseButtonStyle,
      backgroundColor: isTentativeActive ? '#5865F2' : '#FFFFFF', // Blurple color
      borderColor: isTentativeActive ? '#5865F2' : '#CBD5E1',
      color: isTentativeActive ? 'white' : '#64748B',
    };

    return (
      <div style={{ display: 'flex', marginLeft: 'auto', gap: '4px' }}>
        {/* Present button */}
        <button 
          style={presentButtonStyle}
          onClick={(e) => {
            e.stopPropagation();
            if (onRollCallResponse) onRollCallResponse(pilotId, 'Present');
          }}
        >
          ✓
        </button>
        
        {/* Absent button */}
        <button 
          style={absentButtonStyle}
          onClick={(e) => {
            e.stopPropagation();
            if (onRollCallResponse) onRollCallResponse(pilotId, 'Absent');
          }}
        >
          ✗
        </button>
        
        {/* Tentative button */}
        <button 
          style={tentativeButtonStyle}
          onClick={(e) => {
            e.stopPropagation();
            if (onRollCallResponse) onRollCallResponse(pilotId, 'Tentative');
          }}
        >
          ?
        </button>
      </div>
    );
  };

  return (
    <div
      id={`pilot-${pilot.id || pilot.boardNumber}`}
      ref={setNodeRef}
      style={style}
      {...(isAssigned || isRollCallMode ? {} : { ...listeners, ...attributes })} // Don't add drag handlers in roll call mode
      data-dragging={isDragging ? 'true' : 'false'}
      data-assigned={isAssigned ? 'true' : 'false'}
    >
      <span style={{
        width: '36px',
        textAlign: 'left',
        fontSize: '16px',
        fontWeight: 400,
        color: '#646F7E'
      }}>
        {pilot.boardNumber}
      </span>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        width: '120px',
        gap: '4px'
      }}>
        <span style={{
          fontSize: '16px',
          fontWeight: 700,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          color: getSquadronPrimaryColor()
        }}>
          {pilot.callsign}
        </span>        {/* Show tentative, declined, and no response badges - prioritizing roll call response over Discord response */}
        {(() => {
          // Calculate whether to show badges
          const isTentativeRollCall = pilot.rollCallStatus === 'Tentative';
          const isTentativeDiscord = pilot.attendanceStatus === 'tentative';
          const isDeclinedDiscord = pilot.attendanceStatus === 'declined';
          const isAbsentRollCall = pilot.rollCallStatus === 'Absent';
          const isRollCallOverriding = pilot.rollCallStatus === 'Present' || pilot.rollCallStatus === 'Absent' || pilot.rollCallStatus === 'Tentative';

          const shouldShowAbsentDeclinedBadge = isAbsentRollCall || (isDeclinedDiscord && !isRollCallOverriding);
          const shouldShowTentativeBadge = isTentativeRollCall || (isTentativeDiscord && !isRollCallOverriding);

          // Show "no response" badge if no Discord attendance and no roll call response
          const hasNoResponse = !pilot.attendanceStatus && !pilot.rollCallStatus;

          return (
            <>
              {shouldShowAbsentDeclinedBadge && (
                <X
                  key={`declined-badge-${pilot.id || pilot.boardNumber}`}
                  size={14}
                  strokeWidth={3}
                  style={{
                    color: '#DC2626',
                    flexShrink: 0,
                    marginTop: '2px',
                  }}
                />
              )}
              {shouldShowTentativeBadge && (
                <HelpCircle
                  key={`tentative-badge-${pilot.id || pilot.boardNumber}`}
                  size={14}
                  strokeWidth={2.5}
                  style={{
                    color: '#5865F2',
                    flexShrink: 0,
                    marginTop: '2px',
                  }}
                />
              )}
              {hasNoResponse && (
                <MessageCircleOff
                  key={`no-response-badge-${pilot.id || pilot.boardNumber}`}
                  size={14}
                  strokeWidth={2}
                  style={{
                    color: '#9CA3AF',
                    flexShrink: 0,
                    marginTop: '2px',
                  }}
                />
              )}
            </>
          );
        })()}
      </div>

      {isRollCallMode ? renderRollCallButtons() : (
        <div style={{
          display: 'flex',
          gap: '4px',
          marginLeft: 'auto',
          height: '24px'
        }}>
          {renderQualificationBadges()}
        </div>
      )}
    </div>
  );
};

const AvailablePilots: React.FC<AvailablePilotsProps> = ({
  width,
  pilots,
  selectedEvent,
  assignedPilots = {},
  setAssignedPilots,
  onAutoAssign,
  onAutoAssignSettings,
  onClearAssignments,
  pilotQualifications = {},
  realtimeAttendanceData,
  squadrons,
  statuses,
  standings,
  roles,
  qualifications
}) => {
  const { settings } = useAppSettings();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showOnlyAttending, setShowOnlyAttending] = useState(false);
  const [selectedQualifications, setSelectedQualifications] = useState<QualificationType[]>([]);
  const [isRollCallMode, setIsRollCallMode] = useState(false);
  const [rollCallResponses, setRollCallResponses] = useState<Record<string, 'Present' | 'Absent' | 'Tentative'>>({});

  // Sort state
  const [sortBy, setSortBy] = useState<'callsign' | 'boardNumber'>('callsign');
  const [sortBySquadron, setSortBySquadron] = useState<boolean>(true);

  // Filter state
  const [selectedSquadronIds, setSelectedSquadronIds] = useState<string[]>([]);
  const [selectedStatusIds, setSelectedStatusIds] = useState<string[]>([]);
  const [selectedStandingIds, setSelectedStandingIds] = useState<string[]>([]);
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const [qualificationFilters, setQualificationFilters] = useState<Record<string, QualificationFilterMode>>({});
  const [filtersEnabled, setFiltersEnabled] = useState<boolean>(true);  // Handle Roll Call response
  const handleRollCallResponse = async (pilotId: string, response: 'Present' | 'Absent' | 'Tentative') => {
    // console.log(`[ROLL-CALL-DEBUG] handleRollCallResponse called for pilotId: ${pilotId}, response: ${response}`); // LOGGING
    // Determine if this is a toggle (same response clicked twice) or new selection
    const isToggleOff = rollCallResponses[pilotId] === response;
    const responseValue = isToggleOff ? null : response; // Use null when toggling off
    // console.log(`[ROLL-CALL-DEBUG] isToggleOff: ${isToggleOff}, responseValue: ${responseValue}`); // LOGGING

    // Update local state immediately for better UX
    setRollCallResponses(prev => {
      const newResponses = {...prev};
      if (isToggleOff) {
        delete newResponses[pilotId]; // Remove if toggling off
      } else {
        newResponses[pilotId] = response; // Set new response
      }
      return newResponses;
    });

    // *** NEW: Update the assignedPilots state in the parent component ***
    setAssignedPilots((prevAssignedPilots: Record<string, AssignedPilot[]>) => { // Add type for prevAssignedPilots
      console.log(`[ROLL-CALL-UPDATE-DEBUG] Updating parent assignedPilots state for ${pilotId} with response ${responseValue}`);
      console.log('[ROLL-CALL-UPDATE-DEBUG] Previous state:', JSON.stringify(prevAssignedPilots));
      let needsUpdate = false;
      const nextAssignedPilots = { ...prevAssignedPilots }; // Shallow copy

      for (const flightId in prevAssignedPilots) {
        let flightNeedsUpdate = false;
        const originalFlightPilots = prevAssignedPilots[flightId];
        const updatedFlightPilots = originalFlightPilots.map((pilot: AssignedPilot) => { // Add type for pilot
          // Check if this is the pilot whose roll call status changed
          if (pilot.id === pilotId || pilot.boardNumber === pilotId) {
            // console.log(`[ROLL-CALL-DEBUG] Found pilot ${pilot.callsign} in flight ${flightId}. Current rollCallStatus: ${pilot.rollCallStatus}`); // LOGGING
            // Check if the status actually changed
            if (pilot.rollCallStatus !== responseValue) {
              // console.log(`[ROLL-CALL-DEBUG] Status changed! Applying new status: ${responseValue}`); // LOGGING
              flightNeedsUpdate = true;
              needsUpdate = true; // Mark overall update needed
              // Return a new pilot object with the updated status
              return { ...pilot, rollCallStatus: responseValue || undefined }; // Use undefined if responseValue is null
            } else {
              // console.log(`[ROLL-CALL-DEBUG] Status for ${pilot.callsign} did not change.`); // LOGGING
            }
          }
          // Return the original pilot object if no change
          return pilot;
        });

        // If any pilot in this flight was updated, use the new array
        if (flightNeedsUpdate) {
          // console.log(`[ROLL-CALL-DEBUG] Flight ${flightId} needs update. Assigning new pilot array.`); // LOGGING
          nextAssignedPilots[flightId] = updatedFlightPilots;
          // needsUpdate = true; // Already set above
        }
      }

      console.log(`[ROLL-CALL-UPDATE-DEBUG] Finished processing. needsUpdate: ${needsUpdate}`);
      if (needsUpdate) {
        console.log('[ROLL-CALL-UPDATE-DEBUG] Next state:', JSON.stringify(nextAssignedPilots));
      }
      // Only return the new object if an update actually occurred
      return needsUpdate ? nextAssignedPilots : prevAssignedPilots;
    });

    // Only update the database if we have a selected event
    if (!selectedEvent || !selectedEvent.id) {
      console.log('Cannot update roll call response: No event selected');
      return;
    }

    // Generate a synthetic Discord event ID if the event doesn't have one
    // This allows manual roll call entry for events created before Discord integration
    const effectiveDiscordEventId = selectedEvent.discordEventId || `manual-${selectedEvent.id}`;

    // Find the pilot's Discord ID
    const pilot = pilots.find(p => p.id === pilotId || p.boardNumber === pilotId);
    if (!pilot) {
      console.log(`Cannot find pilot with ID ${pilotId}`);
      return;
    }

    // Use discord_id (numeric ID) for Discord API calls
    const discordId = (pilot as any).discord_id;
    if (!discordId) {
      console.log(`Pilot ${pilot.callsign} has no Discord ID`);
      return;
    }

    // Use the utility function to update the roll call response
    await updateRollCallResponse(
      effectiveDiscordEventId,
      discordId,
      pilot.callsign,
      responseValue
    );
  };

  // Get all available qualifications from the pilots' data
  const allQualifications = useMemo(() => {
    const qualSet = new Set<QualificationType>();
    
    // Always ensure we have Wingman category available for unqualified pilots
    qualSet.add('Wingman');
    
    // Add all qualifications from pilots' data
    Object.values(pilotQualifications).forEach(qualArray => {
      if (Array.isArray(qualArray)) {
        qualArray.forEach(qual => {
          if (qual.qualification && qual.qualification.name) {
            // Directly use the name if it's a valid QualificationType
            const qualName = qual.qualification.name as QualificationType;
            // Check if it's one of the recognized types before adding
            if (RECOGNIZED_QUALIFICATIONS.includes(qualName)) {
              qualSet.add(qualName);
            }
          }
        });
      }
    });
    
    // Create ordered list: QUALIFICATION_ORDER first, then others alphabetically, Wingman last
    const orderedQuals = QUALIFICATION_ORDER.filter(q => qualSet.has(q));
    const otherQuals = Array.from(qualSet).filter(q => 
      !QUALIFICATION_ORDER.includes(q) && q !== 'Wingman'
    ).sort();
    
    // Combine in proper order
    const finalQuals = [...orderedQuals, ...otherQuals];
    
    // Ensure Wingman is last
    if (qualSet.has('Wingman')) {
      finalQuals.push('Wingman');
    }

    return finalQuals;
  }, [pilotQualifications]);

  // Toggle a qualification for filtering

  // Check if a pilot has a specific qualification
  const hasDatabaseQualification = (pilotIdOrBoardNumber: string, qualType: QualificationType) => {
    const pilotQuals = pilotQualifications[pilotIdOrBoardNumber] || [];
    return pilotQuals.some(qual => {
      const mappedType = qual.qualification?.name as QualificationType;
      return mappedType === qualType;
    });
  };

  // Add attendance status to pilots based on realtime data
  // Note: pilots prop is already filtered to active pilots by useMissionPrepData hook
  const pilotsWithAttendanceStatus = useMemo(() => {
    if (!selectedEvent || !realtimeAttendanceData || realtimeAttendanceData.length === 0) {
      // If no event or no realtime data, return pilots without status updates
      return pilots.map(p => ({ ...p, attendanceStatus: undefined }));
    }
      return pilots.map(pilot => {
      const pilotCopy = { 
        ...pilot, 
        attendanceStatus: undefined as ('accepted' | 'tentative' | 'declined' | undefined),
        rollCallStatus: undefined as ('Present' | 'Absent' | 'Tentative' | undefined)
      };
      const pilotId = pilotCopy.id || pilotCopy.boardNumber;
      // Use discord_id (numeric ID) for matching attendance data
      const discordId = (pilotCopy as any).discord_id;
      
      // Add roll call status first (higher priority)
      if (pilotId && rollCallResponses[pilotId]) {
        pilotCopy.rollCallStatus = rollCallResponses[pilotId];
      }
      
      // Then add Discord attendance status (lower priority)
      if (discordId) {
        const attendanceRecord = realtimeAttendanceData.find(record => record.discord_id === discordId);

        if (attendanceRecord) {
          if (attendanceRecord.response === 'tentative') pilotCopy.attendanceStatus = 'tentative';
          else if (attendanceRecord.response === 'accepted') pilotCopy.attendanceStatus = 'accepted';
          else if (attendanceRecord.response === 'declined') pilotCopy.attendanceStatus = 'declined';
        }
      }

      return pilotCopy;
    });
  }, [pilots, selectedEvent, realtimeAttendanceData, rollCallResponses]);

  // Filter pilots based on attendance and selected qualifications
  const filteredPilots = useMemo(() => {
    let filtered = [...pilotsWithAttendanceStatus];

    // Apply FilterDrawer filters only when filters are enabled
    if (filtersEnabled) {
      // Squadron filter
      if (selectedSquadronIds.length > 0) {
        filtered = filtered.filter(pilot => {
          if (!pilot.currentSquadron?.id) {
            return selectedSquadronIds.includes('unassigned');
          } else {
            return selectedSquadronIds.includes(pilot.currentSquadron.id);
          }
        });
      }

      // Status filter
      if (selectedStatusIds.length > 0) {
        filtered = filtered.filter(pilot => {
          return pilot.currentStatus?.id && selectedStatusIds.includes(pilot.currentStatus.id);
        });
      }

      // Standing filter
      if (selectedStandingIds.length > 0) {
        filtered = filtered.filter(pilot => {
          return pilot.currentStanding?.id && selectedStandingIds.includes(pilot.currentStanding.id);
        });
      }

      // Role filter
      if (selectedRoleIds.length > 0) {
        filtered = filtered.filter(pilot => {
          return pilot.roles?.some(role => role.role?.id && selectedRoleIds.includes(role.role.id));
        });
      }

      // Qualification filter (from FilterDrawer)
      const activeQualFilters = Object.entries(qualificationFilters);
      if (activeQualFilters.length > 0) {
        filtered = filtered.filter(pilot => {
          const pilotId = pilot.id;
          const pilotQuals = pilotQualifications[pilotId] || [];

          return activeQualFilters.every(([qualId, mode]) => {
            const hasQual = pilotQuals.some((pq: any) => pq.qualification?.id === qualId);
            return mode === 'include' ? hasQual : !hasQual;
          });
        });
      }
    }

    // Filter by attendance if that option is selected (legacy filter - still works)
    if (showOnlyAttending && selectedEvent) {
      if (realtimeAttendanceData.length > 0) {
        const attendingDiscordIds = realtimeAttendanceData
          .filter(record => record.response === 'accepted' || record.response === 'tentative')
          .map(record => record.discord_id);

        filtered = filtered.filter(pilot => {
          const discordId = (pilot as any).discord_id;
          return discordId && attendingDiscordIds.includes(discordId);
        });
      } else {
        filtered = [];
      }
    }

    // Filter by selected qualifications (legacy filter - still works for qualification badges)
    if (selectedQualifications.length > 0) {
      filtered = filtered.filter(pilot => {
        const pilotIdKey = pilot.id || pilot.boardNumber;
        const hasQual = selectedQualifications.some(qualType => hasDatabaseQualification(pilotIdKey, qualType));
        return hasQual;
      });
    }
    
    // Sort pilots
    return filtered.sort((a, b) => {
      // First sort by squadron ID if enabled
      if (sortBySquadron) {
        const squadronA = a.currentSquadron?.id || '';
        const squadronB = b.currentSquadron?.id || '';
        const squadronCompare = squadronA.localeCompare(squadronB);
        if (squadronCompare !== 0) return squadronCompare;
      }

      // Then sort by board number or callsign
      if (sortBy === 'boardNumber') {
        const numA = parseInt(a.boardNumber || '0') || 0;
        const numB = parseInt(b.boardNumber || '0') || 0;
        return numA - numB;
      } else {
        return (a.callsign || '').localeCompare(b.callsign || '');
      }
    });
  }, [pilotsWithAttendanceStatus, selectedEvent, showOnlyAttending, selectedQualifications, pilotQualifications, hasDatabaseQualification, realtimeAttendanceData, sortBy, sortBySquadron, filtersEnabled, selectedSquadronIds, selectedStatusIds, selectedStandingIds, selectedRoleIds, qualificationFilters]);

  // Check if a pilot is assigned to a flight
  const isPilotAssignedToFlight = (pilot: Pilot): { isAssigned: boolean; flightId?: string } => {
    if (!assignedPilots) return { isAssigned: false };
    
    for (const flightId in assignedPilots) {
      const flightPilots = assignedPilots[flightId];
      if (flightPilots.some((p: any) => (p.id && p.id === pilot.id) || p.boardNumber === pilot.boardNumber)) {
        return { isAssigned: true, flightId: flightId };
      }
    }
    return { isAssigned: false };
  };  // Group pilots by their highest qualification or attendance status
  const groupedPilots = useMemo(() => {
    // Initialize result object to hold grouped pilots
    const resultGroups: Record<string, Pilot[]> = {};
    let groupingOrder: string[] = [];
    
    if (isRollCallMode || showOnlyAttending) {
      // In roll call mode, show all attendance groups. In filter mode, show only attending/tentative.
      const attendanceGroups = isRollCallMode
        ? ['accepted', 'tentative', 'declined', 'No Response']
        : ['accepted', 'tentative'];
      groupingOrder = attendanceGroups;
      
      // Initialize all groups
      attendanceGroups.forEach(group => {
        resultGroups[group] = [];
      });
      
      // Sort pilots based on their Discord attendance status (not roll call status)
      filteredPilots.forEach(pilot => {
        // Use the attendanceStatus that was already determined in pilotsWithAttendanceStatus
        const attendanceStatus = (pilot as any).attendanceStatus;

        if (attendanceStatus === 'accepted') {
          resultGroups['accepted'].push(pilot);
        } else if (attendanceStatus === 'tentative') {
          resultGroups['tentative'].push(pilot);
        } else if (attendanceStatus === 'declined') {
          resultGroups['declined'].push(pilot);
        } else {
          // No Discord attendance status for this pilot
          resultGroups['No Response'].push(pilot);
        }
      });
    } else {
      // Regular mode - group by qualifications
      const qualTypeOrder = [...allQualifications];
      
      // Make sure Wingman is last (for unqualified pilots)
      if (qualTypeOrder.includes('Wingman')) {
        const wingmanIndex = qualTypeOrder.indexOf('Wingman');
        qualTypeOrder.splice(wingmanIndex, 1);
        qualTypeOrder.push('Wingman');
      } else {
        // Add Wingman if not present
        qualTypeOrder.push('Wingman');
      }
      
      groupingOrder = qualTypeOrder;
      
      // Initialize all groups
      qualTypeOrder.forEach(qual => { 
        resultGroups[qual] = []; 
      });
      
      // Assign each pilot to their highest qualification group
      filteredPilots.forEach(pilot => {
        // Default to Wingman if no other qualification matches
        let highestQual: QualificationType = 'Wingman';
        const pilotIdKey = pilot.id || pilot.boardNumber;
        const pilotDbQuals = pilotQualifications[pilotIdKey] || [];

        // Get qualification names from pilot data
        if (pilotDbQuals.length > 0) {
          const pilotQualNames = pilotDbQuals
            .filter(q => q.qualification && q.qualification.name)
            .map(q => q.qualification.name as QualificationType)
            .filter(name => qualTypeOrder.includes(name));
          
          // Find the highest qualification based on the group order
          for (const qual of qualTypeOrder) {
            if (pilotQualNames.includes(qual as QualificationType)) {
              highestQual = qual as QualificationType;
              break; // Found the highest one
            }
          }
        }
        
        // Add pilot to the appropriate group
        resultGroups[highestQual].push(pilot);
      });
    }
      return { 
      groups: resultGroups, 
      order: groupingOrder 
    };
  }, [filteredPilots, pilotQualifications, allQualifications, isRollCallMode, showOnlyAttending, realtimeAttendanceData]);

  // Set up some style attributes for drag operations
  useEffect(() => {
    const originalOverflow = document.body.style.overflowX;
    
    const styleElement = document.createElement('style');
    styleElement.textContent = `
      .pilots-container, 
      .pilots-container * {
        overflow-x: hidden !important;
        max-width: ${width};
        scrollbar-width: thin;
      }
      
      .pilots-scroll-container {
        overflow-y: auto;
        overflow-x: hidden !important;
        scrollbar-width: thin;
        width: 100%;
        contain: strict;
        scrollbar-gutter: stable;
      }
      
      .qualification-group {
        overflow-x: hidden !important;
        width: 100%;
        position: relative;
      }
      
      body.dragging .pilots-scroll-container {
        overflow-x: hidden !important;
        transform: translateZ(0);
        will-change: transform;
      }
      
      [data-dragging="true"] {
        pointer-events: auto !important;
        z-index: 9999 !important;
      }
    `;
    document.head.appendChild(styleElement);
    
    const handleDragStart = () => {
      document.body.style.overflowX = 'hidden';
      
      const containers = document.querySelectorAll('.pilots-scroll-container, .qualification-group');
      containers.forEach(container => {
        if (container instanceof HTMLElement) {
          container.style.overflowX = 'hidden';
          container.style.maxWidth = width;
        }
      });
    };
    
    const handleDragEnd = () => {
      document.body.style.overflowX = originalOverflow;
    };
    
    document.addEventListener('dragstart', handleDragStart);
    document.addEventListener('dragend', handleDragEnd);
    
    return () => {
      document.removeEventListener('dragstart', handleDragStart);
      document.removeEventListener('dragend', handleDragEnd);
      document.body.style.overflowX = originalOverflow;
      document.head.removeChild(styleElement);
    };
  }, [width, assignedPilots]);

  // Effect to sync roll call responses whenever the selected event changes
  useEffect(() => {
    const syncRollCall = async () => {
      if (selectedEvent?.id) {
        try {
          // Use synthetic Discord event ID if the event doesn't have a real one
          const effectiveDiscordEventId = selectedEvent.discordEventId || `manual-${selectedEvent.id}`;
          const discordIdToRollCallMap = await syncRollCallResponses(effectiveDiscordEventId);

          // Map Discord IDs to pilot IDs
          const pilotRollCallResponses: Record<string, 'Present' | 'Absent' | 'Tentative'> = {};

          // For each pilot, check if they have a roll call response
          pilots.forEach(pilot => {
            const pilotId = pilot.id || pilot.boardNumber;
            // Use discord_id (numeric ID) for matching roll call data
            const discordId = (pilot as any).discord_id;

            if (discordId && discordIdToRollCallMap[discordId]) {
              pilotRollCallResponses[pilotId] = discordIdToRollCallMap[discordId];
            }
          });

          // Update the state with all roll call responses
          setRollCallResponses(pilotRollCallResponses);

          // console.log('[ROLL-CALL-DEBUG] Synced roll call responses for event:', selectedEvent.id);
        } catch (error) {
          console.error('Error syncing roll call responses:', error);
        }
      }
    };
    
    syncRollCall();
  }, [selectedEvent, pilots]);

  // Define button style for Roll Call button
  const rollCallButtonStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '8px 16px',
    backgroundColor: isRollCallMode ? '#EFF6FF' : '#FFFFFF',
    color: isRollCallMode ? '#2563EB' : '#64748B',
    borderRadius: '8px',
    border: isRollCallMode ? '1px solid #2563EB' : '1px solid #CBD5E1',
    cursor: 'pointer',
    transition: 'background-color 0.2s ease',
    fontFamily: 'Inter',
    fontSize: '14px',
    fontWeight: 400,
    flex: '0 0 25%'
  };

  // Add a useEffect to update the pilot entries when roll call status changes
  useEffect(() => {
    // Force re-render of the entire list when roll call responses change
    // console.log('[ROLL-CALL-DEBUG] Roll call responses updated, refreshing pilot list');

    // No need to do anything else - the state change will trigger a re-render
  }, [rollCallResponses]);

  // Render sort controls
  const renderSortControls = () => (
    <div style={{
      display: 'flex',
      gap: '8px',
      marginBottom: '12px',
      justifyContent: 'flex-end'
    }}>
      <span style={{ fontSize: '12px', color: '#6B7280', marginRight: '4px', alignSelf: 'center' }}>
        Sort by:
      </span>
      <button
        type="button"
        onClick={() => setSortBySquadron(!sortBySquadron)}
        style={{
          padding: '4px 12px',
          backgroundColor: sortBySquadron ? '#2563EB' : 'white',
          color: sortBySquadron ? 'white' : '#6B7280',
          border: `1px solid ${sortBySquadron ? '#2563EB' : '#D1D5DB'}`,
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '12px',
          fontWeight: 500,
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          transition: 'all 0.2s ease'
        }}
      >
        <ArrowUpDown size={12} />
        Squadron
      </button>
      <button
        type="button"
        onClick={() => setSortBy('boardNumber')}
        style={{
          padding: '4px 12px',
          backgroundColor: sortBy === 'boardNumber' ? '#2563EB' : 'white',
          color: sortBy === 'boardNumber' ? 'white' : '#6B7280',
          border: `1px solid ${sortBy === 'boardNumber' ? '#2563EB' : '#D1D5DB'}`,
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '12px',
          fontWeight: 500,
          transition: 'all 0.2s ease'
        }}
      >
        Board Number
      </button>
      <button
        type="button"
        onClick={() => setSortBy('callsign')}
        style={{
          padding: '4px 12px',
          backgroundColor: sortBy === 'callsign' ? '#2563EB' : 'white',
          color: sortBy === 'callsign' ? 'white' : '#6B7280',
          border: `1px solid ${sortBy === 'callsign' ? '#2563EB' : '#D1D5DB'}`,
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '12px',
          fontWeight: 500,
          transition: 'all 0.2s ease'
        }}
      >
        Callsign
      </button>
    </div>
  );

  return (
    <div style={{
      width,
      minWidth: width,
      flexShrink: 0,
      backgroundColor: '#FFFFFF',
      boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)',
      borderRadius: '8px',
      padding: '24px',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      overflow: 'hidden',
      height: '100%',
      boxSizing: 'border-box'
    }}>
        <div style={{
          width: '100%',
          textAlign: 'center',
          marginBottom: '16px'
        }}>
          <span style={{
            fontFamily: 'Inter',
            fontStyle: 'normal',
            fontWeight: 300,
            fontSize: '20px',
            lineHeight: '24px',
            color: '#64748B',
            textTransform: 'uppercase'
          }}>
            Available Pilots
          </span>
        </div>

        {/* Filter Drawer */}
        <FilterDrawer
          squadrons={squadrons}
          statuses={statuses}
          standings={standings}
          roles={roles}
          qualifications={qualifications}
          pilots={pilots}
          allPilotQualifications={pilotQualifications}
          selectedSquadronIds={selectedSquadronIds}
          selectedStatusIds={selectedStatusIds}
          selectedStandingIds={selectedStandingIds}
          selectedRoleIds={selectedRoleIds}
          qualificationFilters={qualificationFilters}
          filtersEnabled={filtersEnabled}
          setSelectedSquadronIds={setSelectedSquadronIds}
          setSelectedStatusIds={setSelectedStatusIds}
          setSelectedStandingIds={setSelectedStandingIds}
          setSelectedRoleIds={setSelectedRoleIds}
          setQualificationFilters={setQualificationFilters}
          setFiltersEnabled={setFiltersEnabled}
        />

        {/* Sort Controls */}
        {renderSortControls()}

        <div
          ref={scrollContainerRef}
          className="pilots-scroll-container"
          style={{
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden',
            width: '100%',
            position: 'relative',
            padding: '0',
            paddingRight: '4px',
            boxSizing: 'border-box',
            scrollbarGutter: 'stable'
          }}
        >          {groupedPilots.order.map((groupName: string) => {
            const pilotsInGroup = groupedPilots.groups[groupName] || [];
            // When filtering by attendance, always show all divisions even if empty
            const shouldShowEmptyGroups = isRollCallMode || showOnlyAttending;
            if (pilotsInGroup.length === 0 && !shouldShowEmptyGroups) return null;

            return (
              <div key={groupName} className="qualification-group" style={{
                width: '100%',
                overflowX: 'hidden',
                position: 'relative'
              }}>
                <div
                  style={{
                    position: 'relative',
                    textAlign: 'center',
                    margin: '20px 0'
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      top: '50%',
                      height: '1px',
                      backgroundColor: '#E2E8F0'
                    }}
                  />                  <span
                    style={{
                      position: 'relative',
                      backgroundColor: '#FFFFFF',
                      padding: '0 16px',
                      color: '#646F7E',
                      fontSize: '12px',
                      fontFamily: 'Inter',
                      fontWeight: 300,
                      textTransform: 'uppercase'
                    }}
                  >
                    {/* Display friendly names for attendance statuses with counts in roll call mode or when filtering by attendance */}
                    {(isRollCallMode || showOnlyAttending)
                      ? (groupName === 'accepted' ? `Attending (${pilotsInGroup.length})` :
                         groupName === 'tentative' ? `Tentative (${pilotsInGroup.length})` :
                         groupName === 'declined' ? `Declined (${pilotsInGroup.length})` :
                         `No Response (${pilotsInGroup.length})`)
                      : groupName}
                  </span>
                </div>                <div style={{ 
                  width: '100%', 
                  position: 'relative', 
                  overflowX: 'hidden' 
                }}>                  {pilotsInGroup.map((pilot: Pilot) => {
                    // In roll call mode, we still track assignment but don't visually dim the pilot
                    const assignment = isPilotAssignedToFlight(pilot);
                    const pilotIdKey = pilot.id || pilot.boardNumber;
                    const specificPilotQuals = pilotQualifications[pilotIdKey] || [];
                    const pilotWithRollCall = {
                      ...pilot,
                      rollCallStatus: rollCallResponses[pilotIdKey],
                      attendanceStatus: pilot.attendanceStatus
                    };

                    return (
                      <PilotEntry
                        key={pilotIdKey}
                        pilot={pilotWithRollCall}
                        isAssigned={assignment.isAssigned}
                        currentFlightId={assignment.flightId}
                        pilotQualifications={specificPilotQuals}
                        isRollCallMode={isRollCallMode}
                        onRollCallResponse={handleRollCallResponse}
                        displayWithSquadronColors={settings.displayPilotsWithSquadronColors}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '18px 0 0 0',
          borderTop: '1px solid #E2E8F0',
          marginTop: 'auto'
        }}>
            {/* Roll Call Button */}            <button
              onClick={() => {
                if (!isRollCallMode && selectedQualifications.length > 0) {
                  // Clear any qualification filters before entering roll call mode
                  setSelectedQualifications([]);
                }
                if (!isRollCallMode && showOnlyAttending) {
                  // Disable attendance filter before entering roll call mode
                  setShowOnlyAttending(false);
                }
                // Toggle roll call mode
                setIsRollCallMode(!isRollCallMode);
              }}
              style={rollCallButtonStyle}
              onMouseEnter={e => {
                e.currentTarget.style.backgroundColor = isRollCallMode ? '#DBEAFE' : '#F8FAFC';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.backgroundColor = isRollCallMode ? '#EFF6FF' : '#FFFFFF';
              }}
            >
              <ClipboardCheck size={16} />
              Roll Call
            </button>
            
            {/* Split Auto Assign Button */}
            <div style={{
              display: 'flex',
              flex: '0 0 calc(30% + 20px)',
              borderRadius: '8px',
              border: '1px solid #CBD5E1',
              overflow: 'hidden'
            }}>
              {/* Main Auto Assign Button */}
              <button
                onClick={async () => {
                  if (onAutoAssign) {
                    // First, sync the latest roll call data from Discord to ensure we have fresh data
                    let freshRollCallResponses = { ...rollCallResponses };

                    if (selectedEvent?.id) {
                      try {
                        // Use synthetic Discord event ID if the event doesn't have a real one
                        const effectiveDiscordEventId = selectedEvent.discordEventId || `manual-${selectedEvent.id}`;
                        const freshRollCallData = await syncRollCallResponses(effectiveDiscordEventId);

                        // Convert Discord ID based responses to pilot ID based responses
                        const freshPilotResponses: Record<string, 'Present' | 'Absent' | 'Tentative'> = {};

                        pilots.forEach(pilot => {
                          const pilotId = pilot.id || pilot.boardNumber;
                          // Use discord_id (numeric ID) for matching roll call data
                          const discordId = (pilot as any).discord_id;

                          if (discordId && freshRollCallData[discordId]) {
                            freshPilotResponses[pilotId] = freshRollCallData[discordId];
                          }
                        });

                        freshRollCallResponses = freshPilotResponses;

                        // Update local state with fresh data
                        setRollCallResponses(freshRollCallResponses);
                      } catch (error) {
                        // Continue with existing data if sync fails
                      }
                    }

                    // Prepare pilot data with fresh roll call data
                    const pilotsForAutoAssign = pilots
                      .map(pilot => {
                        const pilotId = pilot.id || pilot.boardNumber;
                        // Use discord_id (numeric ID) for matching attendance data
                        const discordId = (pilot as any).discord_id;
                        
                        // Apply fresh roll call status
                        let rollCallStatus = freshRollCallResponses[pilotId];
                        
                        // Apply Discord attendance status
                        let attendanceStatus: 'accepted' | 'tentative' | 'declined' | undefined;
                        if (discordId) {
                          const attendanceRecord = realtimeAttendanceData.find(record => record.discord_id === discordId);
                          if (attendanceRecord) {
                            if (attendanceRecord.response === 'tentative') attendanceStatus = 'tentative';
                            else if (attendanceRecord.response === 'accepted') attendanceStatus = 'accepted';
                            else if (attendanceRecord.response === 'declined') attendanceStatus = 'declined';
                          }
                        }
                        
                        return {
                          ...pilot, 
                          attendanceStatus, 
                          rollCallStatus 
                        };
                      });
                    
                    
                    // Pass the enriched pilot data array directly
                    onAutoAssign(pilotsForAutoAssign);
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '8px 12px',
                  backgroundColor: '#FFFFFF',
                  color: '#64748B',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s ease',
                  fontFamily: 'Inter',
                  fontSize: '14px',
                  fontWeight: 400,
                  flex: 1,
                  borderRight: '1px solid #CBD5E1'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.backgroundColor = '#F8FAFC';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.backgroundColor = '#FFFFFF';
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4" />
                  <line x1="14" y1="15" x2="20" y2="9" />
                  <path d="M9 15h4.5c.28 0 .5-.22.5-.5v-4c0-.28-.22-.5-.5-.5H9" />
                  <line x1="5" y1="9" x2="5" y2="15" />
                </svg>
                Auto Assign
              </button>
              
              {/* Settings Button */}
              <button
                onClick={onAutoAssignSettings}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '8px',
                  backgroundColor: '#FFFFFF',
                  color: '#64748B',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s ease',
                  minWidth: '32px'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.backgroundColor = '#F8FAFC';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.backgroundColor = '#FFFFFF';
                }}
                title="Auto-assignment settings"
              >
                <Settings size={16} />
              </button>
            </div>
            
            {/* Clear Assignments Button */}
            <button
              onClick={onClearAssignments}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '8px 16px',
                backgroundColor: '#FFFFFF',
                color: '#64748B',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
                cursor: 'pointer',
                transition: 'background-color 0.2s ease',
                fontFamily: 'Inter',
                fontSize: '14px',
                fontWeight: 400,
                flex: '0 0 30%'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.backgroundColor = '#F8FAFC';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.backgroundColor = '#FFFFFF';
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>              Unassign All
            </button>
          </div>
    </div>
  );
};

export default AvailablePilots;
