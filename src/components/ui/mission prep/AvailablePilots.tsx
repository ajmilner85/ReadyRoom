import React, { useState, useMemo, useRef } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { Filter } from 'lucide-react';
import type { Pilot, QualificationType } from '../../../types/PilotTypes';
import type { Event } from '../../../types/EventTypes';
import QualificationBadge from '../QualificationBadge';
import { Card } from '../card';

// Define the structure for the polled attendance data (matching MissionPreparation)
interface RealtimeAttendanceRecord {
  discord_id: string;
  response: 'accepted' | 'declined' | 'tentative';
}

interface AvailablePilotsProps {
  width: string;
  pilots: Pilot[]; // Use the imported Pilot type
  selectedEvent: Event | null; // Use the imported Event type
  assignedPilots?: Record<string, any>;
  onAutoAssign: (attendingPilotInfo?: { id: string; status: 'accepted' | 'tentative' }[]) => void; // Updated signature
  onClearAssignments: () => void;
  pilotQualifications?: Record<string, any[]>; // Keep as any[] for now
  realtimeAttendanceData: RealtimeAttendanceRecord[]; // Add prop for receiving polled data
}


const QUALIFICATION_ORDER: QualificationType[] = [
  'FAC(A)', 'TL', '4FL', '2FL', 'WQ', 'T/O', 'NATOPS', 'DFL', 'DTL'
]; // These should now match the updated QualificationType


interface PilotEntryProps {
  pilot: Pilot & { attendanceStatus?: 'accepted' | 'tentative' };
  isAssigned?: boolean;
  currentFlightId?: string;
  pilotQualifications?: any[];
}

const PilotEntry: React.FC<PilotEntryProps> = ({ pilot, isAssigned = false, currentFlightId, pilotQualifications = [] }) => {
  const { attributes, listeners, setNodeRef, isDragging, transform } = useDraggable({
    id: `pilot-${pilot.id || pilot.boardNumber}`,
    data: {
      type: 'Pilot',
      pilot: { ...pilot, attendanceStatus: pilot.attendanceStatus },
      currentFlightId: isAssigned ? currentFlightId : undefined,
    },
    disabled: isAssigned,
  });

  // Simplified style, closer to original intent potentially
  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    zIndex: 999,
    cursor: 'grabbing',
    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
  } : {
    cursor: isAssigned ? 'default' : 'grab',
  };

  const renderQualificationBadges = () => {
    const dbQualifications = pilotQualifications || [];

    if (dbQualifications && dbQualifications.length > 0) {
      // Filter and map qualifications based on the actual structure
      return dbQualifications
        .filter(pq => pq.qualification) // Ensure qualification object exists
        .map((pq, index) => (
          <QualificationBadge
            key={`db-${pq.qualification.id}-${index}`}
            type={pq.qualification.name as QualificationType} // Cast name to QualificationType
            code={pq.qualification.code}
            color={pq.qualification.color}
          />
        ))
        .filter(badge => badge !== null);
    }
    return [];
  };

  // Reverted Card structure slightly, closer to potential original
  return (
    <div
      id={`pilot-${pilot.id || pilot.boardNumber}`}
      ref={setNodeRef}
      style={style}
      {...(isAssigned ? {} : { ...listeners, ...attributes })}
      className={`p-2 mb-2 flex items-center justify-between rounded shadow-sm ${isAssigned ? 'bg-gray-200 opacity-70' : 'bg-white hover:bg-gray-50'}`} // Applied styles directly
      title={isAssigned ? `Assigned to Flight ${currentFlightId}` : `Available: ${pilot.callsign}`}
    >
      <div className="flex items-center">
        {pilot.attendanceStatus === 'tentative' && (
          <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '14px',
              height: '14px',
              borderRadius: '50%',
              backgroundColor: '#5865F2', // Blurple
              color: 'white',
              fontSize: '9px',
              fontWeight: 'bold',
              marginRight: '6px',
              flexShrink: 0
            }}>?</div>
        )}
        <span className="font-semibold mr-2">{pilot.callsign}</span>
        <span className="text-sm text-gray-500">({pilot.boardNumber})</span>
      </div>
      <div className="flex space-x-1">
        {renderQualificationBadges()}
      </div>
    </div>
  );
};


const AvailablePilots: React.FC<AvailablePilotsProps> = ({
  width,
  pilots,
  selectedEvent,
  assignedPilots = {},
  onAutoAssign,
  onClearAssignments,
  pilotQualifications = {},
  realtimeAttendanceData
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showOnlyAttending, setShowOnlyAttending] = useState(false);
  const [selectedQualifications, setSelectedQualifications] = useState<QualificationType[]>([]);

  // Simplified allQualifications derivation, assuming mapQualificationNameToType is not needed if types match
   const allQualifications = useMemo(() => {
    const qualSet = new Set<QualificationType>();
    Object.values(pilotQualifications).forEach(qualArray => {
      if (Array.isArray(qualArray)) {
        qualArray.forEach(qual => {
          if (qual.qualification && qual.qualification.name) {
            // Directly use the name if it's a valid QualificationType
            const qualName = qual.qualification.name as QualificationType;
             // Check if it's one of the defined types before adding
            if ([...QUALIFICATION_ORDER, 'Wingman', 'Strike Lead', 'Instructor Pilot', 'LSO', 'Flight Lead', 'Section Lead', 'CQ', 'Night CQ'].includes(qualName)) {
               qualSet.add(qualName);
            }
          }
        });
      }
    });
    // Ensure QUALIFICATION_ORDER items are prioritized, then add others
    const orderedQuals = QUALIFICATION_ORDER.filter(q => qualSet.has(q));
    const otherQuals = Array.from(qualSet).filter(q => !QUALIFICATION_ORDER.includes(q));
    // Add Wingman if present, ensuring it's last unless it's the only one
    const wingmanPresent = qualSet.has('Wingman');
    const finalQuals = [...orderedQuals, ...otherQuals.filter(q => q !== 'Wingman')];
    if (wingmanPresent) finalQuals.push('Wingman');

    return finalQuals;
  }, [pilotQualifications]);


  const toggleQualification = (qual: QualificationType) => {
    setSelectedQualifications(prev =>
      prev.includes(qual)
        ? prev.filter(q => q !== qual)
        : [...prev, qual]
    );
  };

  // Simplified hasDatabaseQualification
  const hasDatabaseQualification = (pilotIdOrBoardNumber: string, qualType: QualificationType) => {
    const pilotQuals = pilotQualifications[pilotIdOrBoardNumber] || [];
    return pilotQuals.some(qual => qual.qualification?.name === qualType);
  };


  const pilotsWithAttendanceStatus = useMemo(() => {
    if (!selectedEvent || !realtimeAttendanceData || realtimeAttendanceData.length === 0) {
      // If no event or no realtime data, return pilots without status updates
      return pilots.map(p => ({ ...p, attendanceStatus: undefined }));
    }
    return pilots.map(pilot => {
      const pilotCopy = { ...pilot, attendanceStatus: undefined as ('accepted' | 'tentative' | undefined) };
      const discordId = pilotCopy.discordId || (pilotCopy as any).discord_original_id || (pilotCopy as any).discord_id;
      if (discordId) {
        const attendanceRecord = realtimeAttendanceData.find(record => record.discord_id === discordId);
        if (attendanceRecord) {
          if (attendanceRecord.response === 'tentative') pilotCopy.attendanceStatus = 'tentative';
          else if (attendanceRecord.response === 'accepted') pilotCopy.attendanceStatus = 'accepted';
        }
      }
      return pilotCopy;
    });
  }, [pilots, selectedEvent, realtimeAttendanceData]);

  const filteredPilots = useMemo(() => {
    let filtered = [...pilotsWithAttendanceStatus];
    if (showOnlyAttending && selectedEvent) {
      if (realtimeAttendanceData.length > 0) {
        const attendingDiscordIds = realtimeAttendanceData
          .filter(record => record.response === 'accepted' || record.response === 'tentative')
          .map(record => record.discord_id);
        filtered = filtered.filter(pilot => {
          const discordId = pilot.discordId || (pilot as any).discord_original_id || (pilot as any).discord_id;
          return discordId && attendingDiscordIds.includes(discordId);
        });
      } else {
        filtered = [];
      }
    }
    if (selectedQualifications.length > 0) {
      filtered = filtered.filter(pilot => {
        const pilotIdKey = pilot.id || pilot.boardNumber;
        const hasQual = selectedQualifications.some(qualType => hasDatabaseQualification(pilotIdKey, qualType));
        return hasQual;
      });
    }
    return filtered.sort((a, b) => (a.callsign || '').localeCompare(b.callsign || ''));
  }, [pilotsWithAttendanceStatus, selectedEvent, showOnlyAttending, selectedQualifications, pilotQualifications, hasDatabaseQualification, realtimeAttendanceData]);


  const isPilotAssignedToFlight = (pilot: Pilot): { isAssigned: boolean; flightId?: string } => {
    if (!assignedPilots) return { isAssigned: false };
    for (const flightId in assignedPilots) {
      const flightPilots = assignedPilots[flightId];
      if (flightPilots.some((p: any) => (p.id && p.id === pilot.id) || p.boardNumber === pilot.boardNumber)) {
        return { isAssigned: true, flightId: flightId };
      }
    }
    return { isAssigned: false };
  };


  // Simplified groupedPilots logic
  const groupedPilots = useMemo(() => {
    const result: Record<string, Pilot[]> = {}; // Use string index signature
    // Use allQualifications for the order, ensuring Wingman is last if present
    const groupOrder = allQualifications.includes('Wingman')
      ? [...allQualifications.filter(q => q !== 'Wingman'), 'Wingman']
      : [...allQualifications];

    groupOrder.forEach(qual => { result[qual] = []; }); // Initialize groups based on available quals

    filteredPilots.forEach(pilot => {
      let highestQual: QualificationType = 'Wingman';
      const pilotIdKey = pilot.id || pilot.boardNumber;
      const pilotDbQuals = pilotQualifications[pilotIdKey] || [];

      if (pilotDbQuals.length > 0) {
        const pilotQualNames = pilotDbQuals
          .map(q => q.qualification?.name as QualificationType)
          .filter(name => name && allQualifications.includes(name)); // Get valid qualification names present in allQualifications

        // Find the highest qualification based on the groupOrder
        for (const qual of groupOrder) {
          if (pilotQualNames.includes(qual)) {
            highestQual = qual;
            break;
          }
        }
      }
      // Add pilot to the determined group (ensure group exists)
      if (!result[highestQual]) { result[highestQual] = []; }
      result[highestQual].push(pilot);
    });
    return { groups: result, order: groupOrder }; // Return both groups and the order
  }, [filteredPilots, pilotQualifications, allQualifications]);


  // Restore main structure using Card and simplified styles
  return (
    <Card className="flex flex-col" style={{ width, height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div className="p-4 border-b text-center mb-4">
        <span className="font-light text-xl text-slate-500 uppercase tracking-wider">
          Available Pilots
        </span>
      </div>

      {/* Filters */}
      <div className="mb-4 px-4 flex justify-between items-center">
         {/* Qualification Filter Buttons */}
         <div className="flex items-center gap-1 flex-wrap flex-1">
              {allQualifications.map(qual => (
                <button
                  key={qual}
                  onClick={() => toggleQualification(qual)}
                  style={{
                    padding: 0,
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    opacity: selectedQualifications.length === 0 || selectedQualifications.includes(qual) ? 1 : 0.3,
                    transition: 'opacity 0.2s ease'
                  }}
                  title={`Filter by ${qual}`}
                >
                  {/* Ensure QualificationBadge receives a valid type */}
                  <QualificationBadge type={qual} />
                </button>
              ))}
         </div>
         {/* Attendance Filter Button */}
         <div className="relative inline-block ml-2">
              <button
                onClick={() => setShowOnlyAttending(!showOnlyAttending)}
                disabled={!selectedEvent}
                title={selectedEvent
                  ? (showOnlyAttending
                    ? "Show all pilots"
                    : "Show only pilots attending event")
                  : "Select an event to filter by attendance"}
                style={{
                  padding: '4px',
                  borderRadius: '4px',
                  cursor: selectedEvent ? 'pointer' : 'not-allowed',
                  background: showOnlyAttending ? '#EFF6FF' : 'white',
                  boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)', // Subtle shadow
                  border: '1px solid #D1D5DB',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <Filter size={16} color={showOnlyAttending ? '#2563EB' : '#64748B'} />
              </button>
         </div>
      </div>

      {/* Pilot List - Simplified scroll container */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto px-4" // Use Tailwind for padding/overflow
      >
        {/* Map over qualification groups using the order from groupedPilots */}
        {groupedPilots.order.map(qualification => {
          const qualPilots = groupedPilots.groups[qualification] || [];
          if (qualPilots.length === 0) return null;

          return (
            <div key={qualification} className="mb-4"> {/* Group spacing */}
              {/* Group Divider - Simplified */}
              <div className="relative text-center my-3">
                 <div className="absolute inset-0 flex items-center" aria-hidden="true">
                    <div className="w-full border-t border-gray-300" />
                 </div>
                 <div className="relative flex justify-center">
                    <span className="bg-white px-3 text-sm text-gray-500 uppercase"> {/* Match Card background */}
                      {qualification}
                    </span>
                 </div>
              </div>

              {/* Pilot Entries */}
              <div>
                {qualPilots.map(pilot => {
                  const assignment = isPilotAssignedToFlight(pilot);
                  const pilotIdKey = pilot.id || pilot.boardNumber;
                  const specificPilotQuals = pilotQualifications[pilotIdKey] || [];
                  return (
                    <PilotEntry
                      key={pilot.id || pilot.boardNumber}
                      pilot={pilot}
                      isAssigned={assignment.isAssigned}
                      currentFlightId={assignment.flightId}
                      pilotQualifications={specificPilotQuals}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="p-4 border-t flex justify-between">
        {/* Auto-Assign Button */}
         <button
            onClick={() => {
              if (onAutoAssign) {
                const attendingPilotInfo = pilotsWithAttendanceStatus
                  .filter(pilot => pilot.attendanceStatus === 'accepted' || pilot.attendanceStatus === 'tentative')
                  .map(pilot => ({
                    id: pilot.id || pilot.discordId || (pilot as any).discord_original_id || pilot.boardNumber,
                    status: pilot.attendanceStatus as 'accepted' | 'tentative'
                  }))
                  .filter(info => info.id && info.status);
                onAutoAssign(attendingPilotInfo);
              }
            }}
            disabled={!selectedEvent || pilotsWithAttendanceStatus.filter(p => p.attendanceStatus === 'accepted' || p.attendanceStatus === 'tentative').length === 0}
            className={`px-4 py-2 rounded ${(!selectedEvent || pilotsWithAttendanceStatus.filter(p => p.attendanceStatus === 'accepted' || p.attendanceStatus === 'tentative').length === 0) ? 'bg-gray-300 cursor-not-allowed' : 'bg-blue-500 text-white hover:bg-blue-600'}`}
          >
            Auto-Assign
          </button>
        {/* Clear Button */}
         <button
            onClick={onClearAssignments}
            className="px-4 py-2 rounded bg-red-500 text-white hover:bg-red-600"
          >
            Clear All
          </button>
      </div>
    </Card>
  );
};

export default AvailablePilots;