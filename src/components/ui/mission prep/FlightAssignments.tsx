import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Card } from '../card';
import FlightAssignmentCard from '../flight cards/FlightAssignmentCard';
import AddFlightDialog from '../dialogs/AddFlightDialog';
import FlightPostOptionsDialog from '../dialogs/FlightPostOptionsDialog';
import type { AssignedPilot } from '../../../types/MissionPrepTypes';
import type { Mission } from '../../../types/MissionTypes';
import { Trash2 } from 'lucide-react';
import { useMissionPrepData } from '../../../hooks/useMissionPrepData';
import { useAppSettings } from '../../../context/AppSettingsContext';
import aircraftIconSvg from '../../../assets/Aircraft Icon.svg';
import clockIconSvg from '../../../assets/Clock.svg';

// Discord SVG icon component  
const DiscordIcon = ({ className = "", size = 16 }: { className?: string; size?: number }) => (
  <svg className={className} width={size} height={size} viewBox="0 -28.5 256 256" version="1.1" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid">
    <g>
      <path d="M216.856339,16.5966031 C200.285002,8.84328665 182.566144,3.2084988 164.041564,0 C161.766523,4.11318106 159.108624,9.64549908 157.276099,14.0464379 C137.583995,11.0849896 118.072967,11.0849896 98.7430163,14.0464379 C96.9108417,9.64549908 94.1925838,4.11318106 91.8971895,0 C73.3526068,3.2084988 55.6133949,8.86399117 39.0420583,16.6376612 C5.61752293,67.146514 -3.4433191,116.400813 1.08711069,164.955721 C23.2560196,181.510915 44.7403634,191.567697 65.8621325,198.148576 C71.0772151,190.971126 75.7283628,183.341335 79.7352139,175.300261 C72.104019,172.400575 64.7949724,168.822202 57.8887866,164.667963 C59.7209612,163.310589 61.5131304,161.891452 63.2445898,160.431257 C105.36741,180.133187 151.134928,180.133187 192.754523,160.431257 C194.506336,161.891452 196.298154,163.310589 198.110326,164.667963 C191.183787,168.842556 183.854737,172.420929 176.223542,175.320965 C180.230393,183.341335 184.861538,190.991831 190.096624,198.16893 C211.238746,191.588051 232.743023,181.531619 254.911949,164.955721 C260.227747,108.668201 245.831087,59.8662432 216.856339,16.5966031 Z M85.4738752,135.09489 C72.8290281,135.09489 62.4592217,123.290155 62.4592217,108.914901 C62.4592217,94.5396472 72.607595,82.7145587 85.4738752,82.7145587 C98.3405064,82.7145587 108.709962,94.5189427 108.488529,108.914901 C108.508531,123.290155 98.3405064,135.09489 85.4738752,135.09489 Z M170.525237,135.09489 C157.88039,135.09489 147.510584,123.290155 147.510584,108.914901 C147.510584,94.5396472 157.658606,82.7145587 170.525237,82.7145587 C183.391518,82.7145587 193.761324,94.5189427 193.539891,108.914901 C193.539891,123.290155 183.391518,135.09489 170.525237,135.09489 Z" fill="#5865F2" fillRule="nonzero"></path>
    </g>
  </svg>
);

interface Flight {
  id: string;
  callsign: string;
  flightNumber: string;
  pilots: Array<{
    boardNumber: string;
    callsign: string;
    dashNumber: string;
  }>;
  midsA?: string;
  midsB?: string;
  stepTime?: number; // Step time offset in minutes
  creationOrder: number; // Track the creation order
}

// Extended Pilot type with dashNumber for flight assignments

interface LocalSquadron {
  id: string;
  name: string;
  designation: string;
  callsigns: any;
  discord_integration?: {
    selectedGuildId?: string;
    discordChannels?: Array<{
      id: string;
      name: string;
      type: 'events' | 'briefing';
    }>;
    roleMappings?: Array<{
      id: string;
      discordRoleId: string;
      discordRoleName: string;
      appPermission: 'admin' | 'flight_lead' | 'member' | 'guest';
      priority: number;
    }>;
  };
  insignia_url?: string | null;
}

interface SquadronFlightGroup {
  squadron: LocalSquadron;
  flights: Flight[];
}

// Add mission commander interface
interface MissionCommanderInfo {
  boardNumber: string;
  callsign: string;
  flightId: string;
  flightCallsign: string;
  flightNumber: string;
}

interface ExtractedFlight {
  name: string;
  units: {
    name: string;
    type: string;
    onboard_num: string;
    callsign?: { [key: number]: string | number } | string;
    fuel: number;
  }[];
}

interface FlightAssignmentsProps {
  width: string;
  assignedPilots?: Record<string, AssignedPilot[]> | null;
  missionCommander?: MissionCommanderInfo | null;
  extractedFlights?: ExtractedFlight[];
  onFlightsChange?: (flights: Flight[], skipSave?: boolean) => void;
  initialFlights?: Flight[];
  onClearAssignments?: () => void;
  onClearFlightAssignments?: (flightId: string) => void;
  mission?: Mission | null;
}

const FlightAssignments: React.FC<FlightAssignmentsProps> = ({
  width,
  assignedPilots = {},
  missionCommander,
  extractedFlights = [],
  onFlightsChange,
  initialFlights = [],
  onClearAssignments,
  onClearFlightAssignments,
  mission
}) => {
  // Debug logging for assignedPilots data
  // React.useEffect(() => {
  //   if (assignedPilots && Object.keys(assignedPilots).length > 0) {
  //     console.log('🔍 FlightAssignments: Received assignedPilots data:', Object.keys(assignedPilots).length, 'flights with assignments');
  //     Object.entries(assignedPilots).forEach(([flightId, pilots]) => {
  //       console.log(`Flight ${flightId}:`, pilots.map(p => ({ callsign: p.callsign, boardNumber: p.boardNumber, dashNumber: p.dashNumber })));
  //     });
  //   }
  // }, [assignedPilots]);

  const [flights, setFlights] = useState<Flight[]>(initialFlights);
  const [showAddFlightDialog, setShowAddFlightDialog] = useState(false);
  const [showPostOptionsDialog, setShowPostOptionsDialog] = useState(false);
  const [existingPosts, setExistingPosts] = useState<any[]>([]);
  
  // Update flights when initialFlights prop changes (e.g., from database restoration)
  React.useEffect(() => {
    // console.log('🔄 FlightAssignments: initialFlights prop changed:', {
    //   hasFlights: !!initialFlights,
    //   length: initialFlights?.length || 0,
    //   flights: initialFlights?.map(f => ({ id: f.id, callsign: f.callsign })) || []
    // });
    
    // Always sync with initialFlights, even if empty (to clear stale state)
    setFlights(initialFlights || []);
    
    // if (initialFlights && initialFlights.length > 0) {
    //   console.log('🔄 FlightAssignments: Updated flights from initialFlights prop:', initialFlights.length, 'flights');
    // } else {
    //   console.log('🔄 FlightAssignments: Cleared flights (initialFlights is empty or null)');
    // }
  }, [initialFlights]);
  const [editFlightId, setEditFlightId] = useState<string | null>(null);
  const [initialEditCallsign, setInitialEditCallsign] = useState("");
  const [creationOrderCounter, setCreationOrderCounter] = useState(0);
  const [showRemoveAllDialog, setShowRemoveAllDialog] = useState(false);

  // Get selected event, participating squadrons, and all squadrons for Discord message and flight dialog
  const { selectedEvent, participatingSquadrons, squadrons } = useMissionPrepData();
  const { settings } = useAppSettings();

  // Debug: Log mission changes
  useEffect(() => {
    console.log('🎯 FlightAssignments: Mission prop changed:', {
      hasMission: !!mission,
      missionId: mission?.id,
      stepTime: mission?.step_time,
      missionKeys: mission ? Object.keys(mission) : []
    });
  }, [mission]);

  // Helper function to format step time for Discord post title
  const formatStepTime = useCallback((): string | null => {
    console.log('formatStepTime called:', {
      hasMission: !!mission,
      missionId: mission?.id,
      stepTime: mission?.step_time,
      referenceTimezone: settings.eventDefaults.referenceTimezone
    });

    if (!mission?.step_time) return null;

    const timezone = settings.eventDefaults.referenceTimezone || 'America/New_York';
    const stepTimeDate = new Date(mission.step_time);

    // Format in reference timezone
    const localFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });

    // Get timezone abbreviation
    const tzFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'short'
    });
    const tzParts = tzFormatter.formatToParts(stepTimeDate);
    const tzAbbr = tzParts.find(p => p.type === 'timeZoneName')?.value || timezone;

    // Format in Zulu (UTC)
    const zuluFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });

    const localTime = localFormatter.format(stepTimeDate);
    const zuluTime = zuluFormatter.format(stepTimeDate);

    return `[STEP @${localTime} ${tzAbbr}/${zuluTime}Z]`;
  }, [mission?.step_time, settings.eventDefaults.referenceTimezone]);



  // Check for existing flight assignment posts
  const checkExistingPosts = useCallback(async () => {
    if (!selectedEvent?.id) {
      return { hasExisting: false, posts: [] };
    }

    try {
      // Add timestamp to URL to prevent caching without using CORS-restricted headers
      const timestamp = Date.now();
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/discord/flight-posts/${selectedEvent.id}?_t=${timestamp}`, {
        cache: 'no-cache'  // Browser-level cache control (doesn't trigger CORS preflight)
      });
      const data = await response.json();
      
      if (data.success) {
        return {
          hasExisting: data.hasExistingPosts,
          posts: data.existingPosts || []
        };
      } else {
        console.error('Error checking existing posts:', data.error);
        return { hasExisting: false, posts: [] };
      }
    } catch (error) {
      console.error('Error checking existing posts:', error);
      return { hasExisting: false, posts: [] };
    }
  }, [selectedEvent?.id]);
  
  // Use a ref to track which extracted flights we've already processed
  const processedFlightTimestamps = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);

  // Normalize flight data to ensure it has the correct structure
  const normalizeFlight = (flight: any): Flight => {
    return {
      ...flight,
      pilots: flight.pilots || [
        { boardNumber: "", callsign: "", dashNumber: "1" },
        { boardNumber: "", callsign: "", dashNumber: "2" },
        { boardNumber: "", callsign: "", dashNumber: "3" },
        { boardNumber: "", callsign: "", dashNumber: "4" }
      ],
      stepTime: flight.stepTime || 0,
      creationOrder: flight.creationOrder || 0
    };
  };

  // Track the last initialFlights to prevent circular updates
  const lastInitialFlightsRef = useRef<string>('');
  
  // Initialize flights from initialFlights when they change
  useEffect(() => {
    // Create a stable identifier for the current initialFlights
    const initialFlightsId = initialFlights.map(f => `${f.id}:${f.callsign}`).sort().join('|');
    
    // Only update if initialFlights actually changed (not just a re-render with same data)
    if (initialFlightsId !== lastInitialFlightsRef.current) {
      // console.log('FlightAssignments: initialFlights changed:', initialFlights.length, initialFlights.map(f => f.callsign));
      lastInitialFlightsRef.current = initialFlightsId;
      
      const normalizedFlights = initialFlights.map(normalizeFlight);
      setFlights(normalizedFlights);
      
      // Calculate the highest creation order for future additions
      const maxCreationOrder = Math.max(...normalizedFlights.map(f => f.creationOrder), -1);
      setCreationOrderCounter(maxCreationOrder + 1);
      
      // Reset the initialization flag when flights change
      initializedRef.current = normalizedFlights.length > 0;
    }
  }, [initialFlights]); // Remove flights dependency to break circular loop
  // Track if this is a user-initiated change vs system update
  const isUserInitiatedChange = useRef(false);
  
  // Notify parent component when flights change or when assigned pilots change
  useEffect(() => {
    if (onFlightsChange) {
      // Only trigger save for user-initiated changes
      onFlightsChange(flights, !isUserInitiatedChange.current);
    }
    // Reset the flag after notifying
    isUserInitiatedChange.current = false;
  }, [flights]); // Removed onFlightsChange from dependencies to prevent infinite re-render
  // Force re-render when assignedPilots changes to update attendance status badges
  // Note: We don't need to update flights array, just force a re-render of the component
  // The getUpdatedFlightPilots function will use the latest assignedPilots automatically
  const [, forceUpdate] = useState({});
  useEffect(() => {
    // Just force a re-render without changing flights array
    forceUpdate({});
  }, [assignedPilots]);

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

  // Effect to create flight cards from extracted flights
  useEffect(() => {
    if (!extractedFlights.length) {
      return;
    }

    // Create a unique timestamp for this batch of flights
    const batchTimestamp = Date.now().toString();
    
    // If we've already processed a batch with the same size recently, skip it to prevent duplicates
    if (processedFlightTimestamps.current.size > 0 && 
        processedFlightTimestamps.current.size === extractedFlights.length) {
      console.log('⚠️ FlightAssignments: Skipping duplicate batch processing');
      return;
    }
    
    console.log('🔄 FlightAssignments: Processing new batch of extracted flights');
    // Add this batch to our processed set
    processedFlightTimestamps.current.add(batchTimestamp);
    
    // Convert extracted flights to our Flight format while preserving existing flights
    setFlights(prevFlights => {
      console.log('🔄 FlightAssignments: Converting extracted flights to Flight format');
      console.log('🔍 FlightAssignments: Current flights:', prevFlights.map(f => ({ id: f.id, callsign: f.callsign })));
      
      // Check if we already have extracted flights (with IDs starting with "extracted-")
      const hasExistingExtracted = prevFlights.some(flight => flight.id.startsWith('extracted-'));
      console.log('🔍 FlightAssignments: Has existing extracted flights:', hasExistingExtracted);
      
      // If we already have extracted flights, don't add more
      if (hasExistingExtracted) {
        console.log('⚠️ FlightAssignments: Skipping - extracted flights already exist');
        return prevFlights;
      }
      
      const existingFlights = prevFlights;
      const maxCreationOrder = Math.max(...existingFlights.map(f => f.creationOrder), -1);
      
      console.log('🛩️ FlightAssignments: Creating flight cards from extracted flights');
      const newFlights = extractedFlights.map((extractedFlight, index) => {
        const { callsign, flightNumber } = parseGroupName(extractedFlight.name);
        const newFlight = {
          id: `extracted-${batchTimestamp}-${index}`, // Make IDs unique with timestamp
          callsign: callsign.toUpperCase(),
          flightNumber,
          pilots: [
            { boardNumber: "", callsign: "", dashNumber: "1" },
            { boardNumber: "", callsign: "", dashNumber: "2" },
            { boardNumber: "", callsign: "", dashNumber: "3" },
            { boardNumber: "", callsign: "", dashNumber: "4" }
          ],
          midsA: "",
          midsB: "",
          creationOrder: maxCreationOrder + index + 1,
          // Store metadata about the original extracted flight index for later reference
          metadata: {
            extractedIndex: index,
            originalName: extractedFlight.name,
            fuelValues: extractedFlight.units.map(unit => unit.fuel)
          }
        };
        
        
        return newFlight;
      });
      

      const allFlights = [...existingFlights, ...newFlights];

      // Group flights by callsign and fix any gaps or duplicates
      const groupedByCallsign = allFlights.reduce<Record<string, Flight[]>>((acc, flight) => {
        if (!acc[flight.callsign]) {
          acc[flight.callsign] = [];
        }
        acc[flight.callsign].push(flight);
        return acc;
      }, {});

      // Sort and fix flight numbers within each group
      Object.values(groupedByCallsign).forEach(flightGroup => {
        flightGroup.sort((a, b) => parseInt(a.flightNumber) - parseInt(b.flightNumber));
        
        let expectedNumber = 1;
        flightGroup.forEach(flight => {
          if (parseInt(flight.flightNumber) !== expectedNumber) {
            flight.flightNumber = expectedNumber.toString();
          }
          expectedNumber++;
        });
      });

      // Reassign MIDS channels for all flights
      let midsCounter = 1;
      allFlights.forEach(flight => {
        flight.midsA = midsCounter.toString();
        flight.midsB = (midsCounter + 2).toString();
        midsCounter += 3;
      });

      // Sort flights by creation order and then by callsign/flight number
      const sortedFlights = allFlights.sort((a, b) => {
        if (a.callsign === b.callsign) {
          return parseInt(a.flightNumber) - parseInt(b.flightNumber);
        }
        return a.creationOrder - b.creationOrder;
      });
      
      console.log('🎯 FlightAssignments: Final flight list:', sortedFlights.map(f => ({
        id: f.id,
        callsign: f.callsign,
        flightNumber: f.flightNumber,
        midsA: f.midsA,
        midsB: f.midsB
      })));
      
      return sortedFlights;
    });

    // Update the creation order counter
    setCreationOrderCounter(prev => prev + extractedFlights.length);
  }, [extractedFlights]);

  // Clear processed flights when component unmounts
  useEffect(() => {
    return () => {
      processedFlightTimestamps.current.clear();
    };
  }, []);

  // Get all existing callsigns (including duplicates) for the dialog
  const existingCallsigns = flights.map(flight => flight.callsign);  // Transform assigned pilots into the format needed for display
  const getUpdatedFlightPilots = (flight: Flight) => {
    const assigned = assignedPilots?.[flight.id] || [];
    
    // Debug logging for pilot data issues
    // if (assigned.length > 0) {
    //   console.log(`🔍 FlightAssignments: Processing flight ${flight.callsign} ${flight.flightNumber} with ${assigned.length} assigned pilots:`, 
    //     assigned.map(p => ({ id: p.id, callsign: p.callsign, boardNumber: p.boardNumber, dashNumber: p.dashNumber }))
    //   );
    // }
    
    // Normalize the flight first to ensure pilots array exists
    const normalizedFlight = normalizeFlight(flight);
    const flightPilots = normalizedFlight.pilots;
    const updatedPilots = flightPilots.map(p => ({
      id: `empty-${flight.id}-${p.dashNumber}`, // Provide a default id for empty slots
      boardNumber: "",
      callsign: "",
      dashNumber: p.dashNumber,
      attendanceStatus: undefined as 'accepted' | 'tentative' | 'declined' | undefined
    }));
    
    // Place each assigned pilot in their designated position by dashNumber
    assigned.forEach(assignedPilot => {
      const dashNumber = assignedPilot.dashNumber;
      // Make sure dashNumber is a string - skip if undefined
      if (!dashNumber) return;
      const dashNumberStr = dashNumber.toString();
      
      // Find the position with matching dashNumber
      const index = updatedPilots.findIndex(p => p.dashNumber === dashNumberStr);      
      if (index !== -1) {        updatedPilots[index] = {
          ...assignedPilot,  // Spread all properties from the assigned pilot
          dashNumber: dashNumberStr, // Ensure the dashNumber is properly set
          attendanceStatus: assignedPilot.attendanceStatus // Keep all attendance statuses including declined
        };
      }
    });
    
    return updatedPilots;
  };

  // Function to get the next flight number for a given callsign
  const getNextFlightNumber = useCallback((callsign: string) => {
    const callsignFlights = flights.filter(f => f.callsign === callsign);
    if (callsignFlights.length === 0) return "1";
    
    const flightNumbers = callsignFlights.map(f => parseInt(f.flightNumber));
    return (Math.max(...flightNumbers) + 1).toString();
  }, [flights]);

  // Function to find the next available MIDS channels set
  const findNextAvailableMIDS = useCallback(() => {
    // Create an array to track used MIDS channel triplets (A1, A2, B)
    const usedChannels = new Set<number>();
    
    // Add all currently used MIDS channels
    flights.forEach(flight => {
      const midsA = parseInt(flight.midsA || "0");
      const midsB = parseInt(flight.midsB || "0");
      
      if (midsA > 0) {
        usedChannels.add(midsA);
        // For flights with section pairs, the second section uses midsA+1
        usedChannels.add(midsA + 1);
      }
      
      if (midsB > 0) {
        usedChannels.add(midsB);
      }
    });
    
    // Find the lowest available MIDS triplet (A1, A2, B)
    // MIDS B should be a multiple of 3
    // MIDS A should start with 1 (for first flight's first section)
    for (let i = 0; i < 42; i++) { // 42 possible flight groups (127/3)
      const midsB = (i + 1) * 3; // MIDS B is a multiple of 3
      const midsA1 = i * 3 + 1;  // First section MIDS A
      const midsA2 = i * 3 + 2;  // Second section MIDS A
      
      // If none of these channels are used, we found our triplet
      if (!usedChannels.has(midsB) && !usedChannels.has(midsA1) && !usedChannels.has(midsA2)) {
        return {
          midsA: midsA1.toString(),
          midsB: midsB.toString()
        };
      }
    }
    
    // If no available channels found (very unlikely), return empty strings
    return { midsA: "", midsB: "" };
  }, [flights]);

  // Function to add a new flight with the given callsign
  const handleAddFlight = useCallback(({ flights: flightEntries }: { flights: { callsign: string; quantity: number }[] }) => {
    isUserInitiatedChange.current = true;
    
    if (editFlightId) {
      // Legacy edit mode - expect single flight entry
      const singleFlight = flightEntries[0];
      if (singleFlight) {
        // Update an existing flight's callsign
        setFlights(prevFlights => {
          const updatedFlights = prevFlights.map(flight => {
            if (flight.id === editFlightId) {
              return {
                ...flight,
                callsign: singleFlight.callsign.toUpperCase(),
                // If callsign changed, update flight number to be next in sequence
                flightNumber: flight.callsign === singleFlight.callsign ? 
                  flight.flightNumber : getNextFlightNumber(singleFlight.callsign)
              };
            }
            return flight;
          });

          // Re-sort flights by callsign and flight number, preserving creation order groups
          return updatedFlights.sort((a, b) => {
            if (a.callsign === b.callsign) {
              return parseInt(a.flightNumber) - parseInt(b.flightNumber);
            }
            return a.creationOrder - b.creationOrder;
          });
        });
        
        // Reset edit state
        setEditFlightId(null);
        setInitialEditCallsign("");
      }
    } else {
      // Multi-flight creation mode
      const newFlights: Flight[] = [];
      let currentCreationOrder = creationOrderCounter;
      
      // Pre-calculate flight numbers to avoid conflicts within the batch
      const flightNumberTracker: Record<string, number> = {};
      
      // Initialize tracker with existing flight numbers
      flights.forEach(flight => {
        const callsignUpper = flight.callsign.toUpperCase();
        const flightNum = parseInt(flight.flightNumber);
        if (!flightNumberTracker[callsignUpper] || flightNumberTracker[callsignUpper] < flightNum) {
          flightNumberTracker[callsignUpper] = flightNum;
        }
      });
      
      // Create flights for each entry
      flightEntries.forEach(({ callsign, quantity }) => {
        const callsignUpper = callsign.toUpperCase();
        
        for (let i = 0; i < quantity; i++) {
          // Get next flight number for this callsign
          flightNumberTracker[callsignUpper] = (flightNumberTracker[callsignUpper] || 0) + 1;
          const flightNumber = flightNumberTracker[callsignUpper].toString();
          
          const { midsA, midsB } = findNextAvailableMIDS();
          
          const newFlight: Flight = {
            id: `${Date.now()}-${callsignUpper}-${i}-${Math.random()}`,
            callsign: callsignUpper,
            flightNumber,
            pilots: [
              { boardNumber: "", callsign: "", dashNumber: "1" },
              { boardNumber: "", callsign: "", dashNumber: "2" },
              { boardNumber: "", callsign: "", dashNumber: "3" },
              { boardNumber: "", callsign: "", dashNumber: "4" }
            ],
            midsA,
            midsB,
            creationOrder: currentCreationOrder
          };
          
          newFlights.push(newFlight);
          currentCreationOrder++;
        }
      });
      
      // Add the new flights and sort
      setFlights(prev => {
        const updatedFlights = [...prev, ...newFlights];
        // Group flights by callsign and renumber them properly
        const groupedByCallsign = updatedFlights.reduce<Record<string, Flight[]>>((acc, flight) => {
          if (!acc[flight.callsign]) {
            acc[flight.callsign] = [];
          }
          acc[flight.callsign].push(flight);
          return acc;
        }, {});

        // Sort and fix flight numbers within each group
        Object.values(groupedByCallsign).forEach(flightGroup => {
          flightGroup.sort((a, b) => parseInt(a.flightNumber) - parseInt(b.flightNumber));

          let expectedNumber = 1;
          flightGroup.forEach(flight => {
            if (parseInt(flight.flightNumber) !== expectedNumber) {
              flight.flightNumber = expectedNumber.toString();
            }
            expectedNumber++;
          });
        });

        // Reassign MIDS channels globally for all flights
        let midsCounter = 1;
        updatedFlights.forEach(flight => {
          flight.midsA = midsCounter.toString();
          flight.midsB = (midsCounter + 2).toString();
          midsCounter += 3;
        });

        return updatedFlights.sort((a, b) => {
          if (a.callsign === b.callsign) {
            return parseInt(a.flightNumber) - parseInt(b.flightNumber);
          }
          return a.creationOrder - b.creationOrder;
        });
      });
  
      // Update the creation order counter
      setCreationOrderCounter(currentCreationOrder);
    }
    
    setShowAddFlightDialog(false);
  }, [getNextFlightNumber, findNextAvailableMIDS, creationOrderCounter, editFlightId]);

  // Close the dialog without adding a flight
  const handleCancelAddFlight = () => {
    setShowAddFlightDialog(false);
    setEditFlightId(null);
    setInitialEditCallsign("");
  };

  // State for delete confirmation dialog
  const [showDeleteConfirmDialog, setShowDeleteConfirmDialog] = useState(false);
  const [deletingFlightId, setDeletingFlightId] = useState<string | null>(null);
  const [deletingFlightHasPilots, setDeletingFlightHasPilots] = useState(false);

  // Handle deleting a flight
  const handleDeleteFlight = useCallback((id: string) => {
    const flight = flights.find(f => f.id === id);
    if (!flight) return;

    // Check if flight has any assigned pilots (check assignedPilots prop, not flight.pilots)
    const assignedToFlight = assignedPilots?.[id] || [];
    const hasPilots = assignedToFlight.length > 0 && assignedToFlight.some(p => p.boardNumber && p.callsign);

    if (hasPilots) {
      // Show confirmation dialog for flights with pilots
      setDeletingFlightId(id);
      setDeletingFlightHasPilots(true);
      setShowDeleteConfirmDialog(true);
    } else {
      // Delete immediately if no pilots assigned
      confirmDeleteFlight(id);
    }
  }, [flights, assignedPilots]);

  // Confirm delete flight
  const confirmDeleteFlight = useCallback((flightId?: string) => {
    const id = flightId || deletingFlightId;
    if (!id) return;

    isUserInitiatedChange.current = true;

    // Clear pilot assignments for this specific flight
    if (onClearFlightAssignments) {
      onClearFlightAssignments(id);
    }

    // Remove the flight
    setFlights(prevFlights => prevFlights.filter(flight => flight.id !== id));
    setShowDeleteConfirmDialog(false);
    setDeletingFlightId(null);
    setDeletingFlightHasPilots(false);
  }, [deletingFlightId, onClearFlightAssignments]);

  // Cancel delete
  const cancelDeleteFlight = useCallback(() => {
    setShowDeleteConfirmDialog(false);
    setDeletingFlightId(null);
    setDeletingFlightHasPilots(false);
  }, []);

  // State for edit flight dialog
  const [showEditFlightDialog, setShowEditFlightDialog] = useState(false);
  const [editingFlightId, setEditingFlightId] = useState<string | null>(null);
  const [editingCallsign, setEditingCallsign] = useState('');
  const [editingStepTime, setEditingStepTime] = useState(0);

  // Handle editing a flight
  const handleEditFlight = useCallback((id: string) => {
    const flight = flights.find(f => f.id === id);
    if (flight) {
      setEditingFlightId(id);
      setEditingCallsign(flight.callsign);
      setEditingStepTime(flight.stepTime || 0);
      setShowEditFlightDialog(true);
    }
  }, [flights]);

  // Handle saving edited flight
  const handleSaveEditedFlight = useCallback(() => {
    if (!editingFlightId) return;

    isUserInitiatedChange.current = true;
    setFlights(prevFlights =>
      prevFlights.map(flight =>
        flight.id === editingFlightId
          ? { ...flight, callsign: editingCallsign, stepTime: editingStepTime }
          : flight
      )
    );
    setShowEditFlightDialog(false);
    setEditingFlightId(null);
  }, [editingFlightId, editingCallsign, editingStepTime]);

  // Handle canceling edit
  const handleCancelEdit = useCallback(() => {
    setShowEditFlightDialog(false);
    setEditingFlightId(null);
  }, []);

  // Handle step time changes for individual flights
  const handleStepTimeChange = useCallback((flightId: string, stepTime: number) => {
    isUserInitiatedChange.current = true;
    setFlights(prevFlights =>
      prevFlights.map(flight =>
        flight.id === flightId
          ? { ...flight, stepTime }
          : flight
      )
    );
  }, []);

  // Handle removing all flights
  const handleRemoveAll = useCallback(() => {
    setShowRemoveAllDialog(true);
  }, []);

  // Confirm remove all flights
  const confirmRemoveAll = useCallback(() => {
    isUserInitiatedChange.current = true;
    
    // Clear pilot assignments first
    if (onClearAssignments) {
      onClearAssignments();
    }
    
    // Then clear the flights
    setFlights([]);
    setCreationOrderCounter(0);
    setShowRemoveAllDialog(false);
  }, [onClearAssignments]);

  // Cancel remove all
  const cancelRemoveAll = useCallback(() => {
    setShowRemoveAllDialog(false);
  }, []);

  // Group flights by squadron based on callsigns
  const groupFlightsBySquadron = useCallback(async (): Promise<SquadronFlightGroup[]> => {
    const squadronGroups: SquadronFlightGroup[] = [];

    for (const squadron of squadrons) {
      if (!squadron.callsigns || !Array.isArray(squadron.callsigns)) {
        continue;
      }

      const squadronFlights = flights.filter(flight =>
        squadron.callsigns!.some((callsign: string) =>
          flight.callsign.toUpperCase() === callsign.toUpperCase()
        )
      );

      // Only include squadron if it has flights with assigned pilots
      const hasAssignedPilots = squadronFlights.some(flight =>
        flight.pilots && flight.pilots.length > 0
      );

      if (squadronFlights.length > 0 && hasAssignedPilots) {
        squadronGroups.push({
          squadron: squadron as LocalSquadron,
          flights: squadronFlights
        });
      }
    }

    return squadronGroups;
  }, [flights, squadrons]);

  // Generate flight assignment table image for a squadron using Canvas
  const generateFlightAssignmentImage = useCallback(async (squadronGroup: SquadronFlightGroup, revision?: number): Promise<Blob | null> => {
    try {
      // Canvas dimensions
      const padding = 20;
      const flightHeaderColumnWidth = 120; // Width of the left column with flight info
      const columnWidths = [25, 140, 130, 90, 90]; // MC indicator, Slot, Pilot, MIDS A, MIDS B
      const tablePadding = 15; // Left padding inside data table
      const rightPadding = 15; // Right padding after last column
      const dataTableWidth = columnWidths.reduce((sum, width) => sum + width, 0) + tablePadding + rightPadding;
      const tableWidth = flightHeaderColumnWidth + dataTableWidth; // Total width = flight info column + data columns
      const width = tableWidth + padding * 2; // Canvas width = table width + left/right padding
      const titleHeight = 100; // Increased for squadron name and extra spacing after STEP time
      const headerHeight = 40; // Height for column headers
      const rowHeight = 35;

      // Prepare flight data - each flight gets its own table with metadata
      const flightTables: {
        flightName: string;
        data: string[][];
        strength: number;
        callsign: string;
        tasking: string;
        stepOffset: string;
      }[] = [];
      const headers = ['', 'Slot', 'Pilot', 'MIDS A', 'MIDS B']; // Empty header for MC indicator column

      // Helper function to format step time
      const formatStepTimeForImage = (minutes?: number): string => {
        if (minutes === undefined || minutes === null) return '+0';
        if (minutes === 0) return '+0';
        if (minutes < 0) return `-${Math.abs(minutes)}`;
        return `+${minutes}`;
      };

      // Helper function to check if a pilot is the mission commander
      const isMissionCommander = (pilot: any, flight: Flight) => {
        if (!missionCommander) return false;
        const boardNumber = pilot.boardNumber || (pilot as any).board_number || (pilot as any).onboard_num || (pilot as any).pilotBoardNumber || '000';
        return missionCommander.boardNumber === boardNumber &&
               missionCommander.flightId === flight.id;
      };

      if (squadronGroup.flights.length === 0) {
        flightTables.push({
          flightName: 'No Flights',
          data: [['', 'No flight assignments found', '', '', '']],
          strength: 0,
          callsign: '',
          tasking: '',
          stepOffset: ''
        });
      } else {
        squadronGroup.flights.forEach((flight) => {
          const updatedPilots = getUpdatedFlightPilots(flight);
          const flightData: string[][] = [];
          const stepTimeStr = formatStepTimeForImage(flight.stepTime);

          // Calculate flight strength (number of assigned pilots)
          const strength = updatedPilots.filter(p => p.boardNumber && p.callsign).length;

          // Calculate MIDS channels for second section (dash 3 & 4)
          const midsANum = parseInt(flight.midsA || '0');
          const secondSectionMidsA = midsANum > 0 ? (midsANum + 1).toString() : '—';

          if (updatedPilots.length === 0) {
            // Show empty slots if no pilots assigned
            for (let i = 1; i <= 4; i++) {
              // Determine MIDS A channel based on section
              const sectionMidsA = (i === 1 || i === 2) ? (flight.midsA || '—') : secondSectionMidsA;

              flightData.push([
                '', // No mission commander indicator for empty slots
                `${flight.callsign} ${flight.flightNumber}-${i}`,
                '—',
                sectionMidsA,
                flight.midsB || '—'
              ]);
            }
          } else {
            updatedPilots.forEach((pilot) => {
              // Get pilot info - check multiple possible properties
              const boardNumber = pilot.boardNumber || (pilot as any).board_number || (pilot as any).onboard_num || (pilot as any).pilotBoardNumber || '000';
              const callsign = pilot.callsign || (pilot as any).pilot_callsign || (pilot as any).pilotCallsign || '—';
              const pilotDisplay = callsign !== '—' ? `${boardNumber} ${callsign}` : '—';

              // Determine MIDS A channel based on section
              const dashNum = parseInt(pilot.dashNumber);
              const sectionMidsA = (dashNum === 1 || dashNum === 2) ? (flight.midsA || '—') : secondSectionMidsA;

              // Check if this pilot is the mission commander
              const mcIndicator = isMissionCommander(pilot, flight) ? '★' : '';

              flightData.push([
                mcIndicator, // Mission commander indicator (star or empty)
                `${flight.callsign} ${flight.flightNumber}-${pilot.dashNumber}`,
                pilotDisplay,
                sectionMidsA,
                flight.midsB || '—'
              ]);
            });
          }

          flightTables.push({
            flightName: `${flight.callsign} ${flight.flightNumber}`,
            data: flightData,
            strength,
            callsign: `${flight.callsign} ${flight.flightNumber}`,
            tasking: '', // Will be implemented later
            stepOffset: stepTimeStr
          });
        });
      }

      // Calculate total height: title + (column header once + all rows) + spacing between tables + bottom padding for revision
      const tableSpacing = 15; // Space between flight tables (3x original 5px)
      const totalRows = flightTables.reduce((sum, table) => sum + table.data.length, 0);
      const bottomPadding = 30; // Extra space at bottom for revision number
      const totalHeight = padding * 2 + titleHeight + headerHeight + (totalRows * rowHeight) + ((flightTables.length - 1) * tableSpacing) + bottomPadding;

      // Load aircraft and clock icons BEFORE creating canvas
      const aircraftIcon = new Image();
      aircraftIcon.src = aircraftIconSvg;
      const clockIcon = new Image();
      clockIcon.src = clockIconSvg;

      await Promise.all([
        new Promise((resolve, reject) => {
          aircraftIcon.onload = resolve;
          aircraftIcon.onerror = reject;
        }),
        new Promise((resolve, reject) => {
          clockIcon.onload = resolve;
          clockIcon.onerror = reject;
        })
      ]);

      // Create canvas
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = totalHeight;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        throw new Error('Could not get canvas context');
      }

      // Background - updated color
      ctx.fillStyle = '#1A1A1E';
      ctx.fillRect(0, 0, width, totalHeight);

      // LEFT SIDE: Squadron insignia and info
      const insigniaSize = 40;
      const insigniaY = padding + 10;
      const insigniaX = padding + 10; // Position to far left
      
      // Try to load squadron insignia if URL exists
      if (squadronGroup.squadron.insignia_url) {
        try {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          
          await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = squadronGroup.squadron.insignia_url!;
          });
          
          ctx.drawImage(img, insigniaX, insigniaY, insigniaSize, insigniaSize);
        } catch (error) {
          // Draw placeholder on error
          ctx.strokeStyle = '#666666';
          ctx.lineWidth = 1;
          ctx.strokeRect(insigniaX, insigniaY, insigniaSize, insigniaSize);
          ctx.fillStyle = '#333333';
          ctx.fillRect(insigniaX, insigniaY, insigniaSize, insigniaSize);
        }
      } else {
        // Draw placeholder if no URL
        ctx.strokeStyle = '#666666';
        ctx.lineWidth = 1;
        ctx.strokeRect(insigniaX, insigniaY, insigniaSize, insigniaSize);
        ctx.fillStyle = '#333333';
        ctx.fillRect(insigniaX, insigniaY, insigniaSize, insigniaSize);
      }
      
      // Squadron designation next to insignia
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 24px Arial, sans-serif';
      ctx.textAlign = 'left';
      const designationText = squadronGroup.squadron.designation;
      const designationX = insigniaX + insigniaSize + 15;
      ctx.fillText(designationText, designationX, insigniaY + 25);

      // Squadron name below designation (same size as event info)
      ctx.font = '16px Arial, sans-serif';
      ctx.fillStyle = '#CCCCCC';
      const squadronName = squadronGroup.squadron.name;
      ctx.fillText(squadronName, designationX, insigniaY + 45);

      // RIGHT SIDE: Event name and date/time
      ctx.textAlign = 'right';
      const rightX = width - padding - 10;

      // Event name (bold, same size as squadron name) with wrapping if needed
      const eventName = selectedEvent?.title || 'Event';
      ctx.font = 'bold 16px Arial, sans-serif';
      ctx.fillStyle = '#FFFFFF';

      // Calculate available space for event name (rightX - end of squadron designation)
      const squadronTextEndX = designationX + ctx.measureText(designationText).width + 40; // Add 40px margin between left and right header elements
      const availableWidth = rightX - squadronTextEndX;
      const eventNameWidth = ctx.measureText(eventName).width;

      let eventNameIsWrapped = false;

      if (eventNameWidth > availableWidth) {
        // Text is too long, wrap it to two lines
        eventNameIsWrapped = true;
        const words = eventName.split(' ');
        let line1 = '';
        let line2 = '';
        let currentLine = '';

        for (let i = 0; i < words.length; i++) {
          const testLine = currentLine + (currentLine ? ' ' : '') + words[i];
          const testWidth = ctx.measureText(testLine).width;

          if (testWidth <= availableWidth || currentLine === '') {
            currentLine = testLine;
          } else {
            // Move to second line
            if (!line1) {
              line1 = currentLine;
              currentLine = words[i];
            } else {
              line2 = currentLine;
              break;
            }
          }
        }

        // Assign remaining words
        if (!line1) {
          line1 = currentLine;
        } else if (!line2) {
          line2 = currentLine;
        }

        // Draw wrapped lines
        ctx.fillText(line1, rightX, insigniaY + 17);
        ctx.fillText(line2, rightX, insigniaY + 35);
      } else {
        // Text fits on one line
        ctx.fillText(eventName, rightX, insigniaY + 25);
      }

      // Event date and time (regular weight, same size as squadron name)
      // Push down if event name was wrapped
      let lastTextY = eventNameIsWrapped ? insigniaY + 53 : insigniaY + 45;
      if (selectedEvent?.datetime) {
        const eventDate = new Date(selectedEvent.datetime);
        const timezone = settings.eventDefaults.referenceTimezone || 'America/New_York';
        const formattedDateTime = eventDate.toLocaleString('en-US', {
          timeZone: timezone,
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        });

        ctx.font = '16px Arial, sans-serif';
        ctx.fillStyle = '#CCCCCC';
        ctx.fillText(formattedDateTime, rightX, lastTextY);
      }

      // Mission step time (if available) - bold, below event time
      // Format: STEP ⏰ 21:20 PM EDT / 01:20Z
      if (mission?.step_time) {
        const stepTimeDate = new Date(mission.step_time);
        const timezone = settings.eventDefaults.referenceTimezone || 'America/New_York';

        // Format in reference timezone (12-hour format with colons)
        const localFormatter = new Intl.DateTimeFormat('en-US', {
          timeZone: timezone,
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        });

        // Get timezone abbreviation
        const tzFormatter = new Intl.DateTimeFormat('en-US', {
          timeZone: timezone,
          timeZoneName: 'short'
        });
        const tzParts = tzFormatter.formatToParts(stepTimeDate);
        const tzAbbr = tzParts.find(p => p.type === 'timeZoneName')?.value || timezone;

        // Format in Zulu (UTC, 24-hour format without colons)
        const zuluFormatter = new Intl.DateTimeFormat('en-US', {
          timeZone: 'UTC',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        });

        const localTime = localFormatter.format(stepTimeDate);
        const zuluTimeRaw = zuluFormatter.format(stepTimeDate);
        const zuluTime = zuluTimeRaw.replace(':', ''); // Remove colon for military format

        // Draw STEP time line: STEP ⏰ 21:20 PM EDT / 01:20Z
        ctx.font = 'bold 16px Arial, sans-serif';
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'right';
        const stepTextY = lastTextY + 20;

        // Build the complete string and measure it
        const stepTimeText = `${localTime} ${tzAbbr} / ${zuluTime}Z`;
        const clockIconSize = 16;

        // Measure components
        const timeWidth = ctx.measureText(stepTimeText).width;
        const stepWidth = ctx.measureText('STEP').width;
        const totalWidth = stepWidth + 4 + clockIconSize + 4 + timeWidth;

        // Calculate starting X position (working right to left)
        const startX = rightX - totalWidth;

        // Draw "STEP"
        ctx.textAlign = 'left';
        ctx.fillText('STEP', startX, stepTextY);

        // Draw clock icon after "STEP"
        const clockX = startX + stepWidth + 4;
        const clockY = stepTextY - clockIconSize + 3;
        ctx.drawImage(clockIcon, clockX, clockY, clockIconSize, clockIconSize);

        // Draw time text after clock
        const timeX = clockX + clockIconSize + 4;
        ctx.fillText(stepTimeText, timeX, stepTextY);
      }

      // Render separate tables for each flight
      let currentY = padding + titleHeight;
      let isFirstFlight = true;

      for (const flightTable of flightTables) {
        // Add spacing between tables (skip for first flight)
        if (!isFirstFlight) {
          currentY += tableSpacing;
        }

        // Calculate the current table's total height
        // Only include header height for the first flight
        const tableRowsHeight = flightTable.data.length * rowHeight;
        const totalTableHeight = (isFirstFlight ? headerHeight : 0) + tableRowsHeight;

        // Draw flight header COLUMN (left side) - spans the entire height of header + rows
        ctx.fillStyle = '#2D3748';
        ctx.fillRect(padding, currentY, flightHeaderColumnWidth, totalTableHeight);

        // Calculate vertical positioning for the content group - with DATA ROWS ONLY (not header)
        const dataRowsStartY = currentY + (isFirstFlight ? headerHeight : 0);
        const iconSize = 65;
        const spacingBetween = 8;
        const verticalPadding = 8; // Equal padding above and below content
        const startY = dataRowsStartY + verticalPadding;

        // Draw aircraft icon centered
        const iconX = padding + (flightHeaderColumnWidth - iconSize) / 2;
        const iconY = startY;
        ctx.drawImage(aircraftIcon, iconX, iconY, iconSize, iconSize);

        // Draw "xN" (strength indicator) OVERLAYED on icon (centered vertically and horizontally)
        const strengthText = `x${flightTable.strength}`;
        ctx.font = '14px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#FFFFFF';
        const strengthY = iconY + (iconSize / 2) + 5; // Center vertically on icon
        ctx.fillText(strengthText, padding + flightHeaderColumnWidth / 2, strengthY);

        // Draw callsign below icon
        const callsignY = iconY + iconSize + spacingBetween + 10;
        ctx.font = 'bold 18px Arial, sans-serif';
        ctx.fillText(flightTable.callsign, padding + flightHeaderColumnWidth / 2, callsignY);

        // Draw tasking below callsign (placeholder text or empty space)
        const taskingY = callsignY + spacingBetween + 12;
        if (flightTable.tasking) {
          ctx.font = '14px Arial, sans-serif';
          ctx.fillText(flightTable.tasking, padding + flightHeaderColumnWidth / 2, taskingY);
        }

        // Draw step offset with clock icon below tasking
        const stepOffsetY = taskingY + spacingBetween + 12;
        ctx.font = '14px Arial, sans-serif';

        // Draw clock icon (from SVG)
        const clockSize = 14;
        const clockX = padding + flightHeaderColumnWidth / 2 - 22;
        const clockY = stepOffsetY - clockSize + 2;
        ctx.drawImage(clockIcon, clockX, clockY, clockSize, clockSize);

        // Draw step offset text next to clock (with 4px space)
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(flightTable.stepOffset, padding + flightHeaderColumnWidth / 2 + 2, stepOffsetY);

        // Draw column header row (to the right of flight header column) - ONLY FOR FIRST FLIGHT
        const dataTableX = padding + flightHeaderColumnWidth;
        if (isFirstFlight) {
          // Use same background color as flight header column (#2D3748)
          ctx.fillStyle = '#2D3748';
          ctx.fillRect(dataTableX, currentY, dataTableWidth, headerHeight);

          ctx.fillStyle = '#FFFFFF';
          ctx.font = 'bold 16px Arial, sans-serif';
          ctx.textAlign = 'left';

          let headerX = dataTableX + tablePadding;
          headers.forEach((header, index) => {
            if (index >= 3) { // MIDS A and MIDS B columns (center-aligned)
              ctx.textAlign = 'center';
              ctx.fillText(header, headerX + columnWidths[index] / 2, currentY + 25);
            } else if (index === 0) { // Mission commander indicator column
              ctx.textAlign = 'center';
              ctx.fillText(header, headerX + columnWidths[index] / 2, currentY + 25);
            } else {
              ctx.textAlign = 'left';
              ctx.fillText(header, headerX, currentY + 25);
            }
            headerX += columnWidths[index];
          });

          currentY += headerHeight;
        }

        // Draw table rows (to the right of flight header column)
        ctx.font = '14px Arial, sans-serif';

        flightTable.data.forEach((row, rowIndex) => {
          // Only add headerHeight offset for first flight (since header was drawn)
          const rowY = currentY + (rowIndex * rowHeight);

          // Alternate row colors (only for data table area)
          ctx.fillStyle = rowIndex % 2 === 0 ? '#4A5568' : '#374151';
          ctx.fillRect(dataTableX, rowY, dataTableWidth, rowHeight);

          // Check if this row contains mission commander (has star in first column)
          const isMCRow = row[0] === '★';

          // Row text
          ctx.fillStyle = '#FFFFFF';
          let cellX = dataTableX + tablePadding;

          row.forEach((cell, cellIndex) => {
            // Set font weight based on mission commander status and column
            if (isMCRow && (cellIndex === 1 || cellIndex === 2)) { // Slot and Pilot columns
              ctx.font = 'bold 14px Arial, sans-serif';
            } else {
              ctx.font = '14px Arial, sans-serif';
            }

            // Special handling for empty pilot cells
            if (cellIndex === 2 && cell === '—') { // Pilot column
              ctx.fillStyle = '#9CA3AF';
            } else {
              ctx.fillStyle = '#FFFFFF';
            }

            // Text alignment
            if (cellIndex === 0) { // Mission commander indicator column
              ctx.textAlign = 'center';
              ctx.fillText(cell, cellX + columnWidths[cellIndex] / 2, rowY + 22);
            } else if (cellIndex >= 3) { // MIDS A and MIDS B columns (center-aligned)
              ctx.textAlign = 'center';
              ctx.fillText(cell, cellX + columnWidths[cellIndex] / 2, rowY + 22);
            } else {
              ctx.textAlign = 'left';
              ctx.fillText(cell, cellX, rowY + 22);
            }

            cellX += columnWidths[cellIndex];
          });
        });

        // Move to next table position (add only the data rows height since currentY already accounts for header)
        currentY += tableRowsHeight;
        isFirstFlight = false; // Ensure subsequent flights don't render headers
      }

      // Add revision number in bottom right corner if provided
      if (revision) {
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 14px Arial, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(`v${revision}`, width - padding - 10, totalHeight - padding);
      }

      // Convert canvas to blob
      return new Promise((resolve) => {
        canvas.toBlob(resolve, 'image/png', 0.95);
      });
      
    } catch (error) {
      console.error('Error generating canvas flight assignment image:', error);
      return null;
    }
  }, [getUpdatedFlightPilots]);

  // Expose preview function to window for console testing
  useEffect(() => {
    const previewFlightAssignments = async () => {
      console.log('📸 Generating flight assignment image preview...');

      try {
        const squadronGroups = await groupFlightsBySquadron();

        if (squadronGroups.length === 0) {
          console.error('No squadron groups found with flights.');
          return;
        }

        // Generate image for first squadron group
        const squadronGroup = squadronGroups[0];
        console.log(`Generating preview for ${squadronGroup.squadron.name}...`);

        const imageBlob = await generateFlightAssignmentImage(squadronGroup, 1);

        if (!imageBlob) {
          console.error('Failed to generate image blob.');
          return;
        }

        // Open image in new tab
        const url = URL.createObjectURL(imageBlob);
        const newTab = window.open(url, '_blank');

        if (newTab) {
          console.log('✅ Preview opened in new tab!');
          // Clean up URL after tab is loaded
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        } else {
          console.error('Failed to open new tab. Check your popup blocker settings.');
        }
      } catch (error) {
        console.error('Error generating preview:', error);
      }
    };

    (window as any).previewFlightAssignments = previewFlightAssignments;

    return () => {
      delete (window as any).previewFlightAssignments;
    };
  }, [groupFlightsBySquadron, generateFlightAssignmentImage]);

  // Save flight post record to database
  const saveFlightPostRecord = useCallback(async (eventId: string, squadronId: string, guildId: string, channelId: string, messageId: string, isUpdate: boolean = false) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/discord/save-flight-post`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          eventId,
          squadronId,
          guildId,
          channelId,
          messageId,
          isUpdate
        }),
      });

      const result = await response.json();
      if (!result.success) {
        console.error('Failed to save flight post record:', result.error);
      }
      return result.success;
    } catch (error) {
      console.error('Error saving flight post record:', error);
      return false;
    }
  }, []);

  // Update existing Discord message with new image
  const updateExistingDiscordMessage = useCallback(async (squadronGroup: SquadronFlightGroup, imageBlob: Blob, existingPost: any): Promise<boolean> => {
    try {
      // Create FormData for the image upload
      const formData = new FormData();
      formData.append('image', imageBlob, `${squadronGroup.squadron.designation}_flight_assignments.png`);
      formData.append('guildId', String(existingPost.guildId));
      formData.append('channelId', String(existingPost.channelId));

      // Get event date for Discord message
      const timezone = settings.eventDefaults.referenceTimezone || 'America/New_York';
      const eventDate = selectedEvent?.datetime ?
        new Date(selectedEvent.datetime).toLocaleDateString('en-US', {
          timeZone: timezone,
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        }) : 'TBD';

      // Get the current revision (will be incremented by the backend)
      const nextRevision = (existingPost.revision || 1) + 1;
      const stepTimeString = formatStepTime();
      const messageText = stepTimeString
        ? `**${eventDate} Flight Assignments (v${nextRevision}) ${stepTimeString}**`
        : `**${eventDate} Flight Assignments (v${nextRevision})**`;
      formData.append('message', messageText);

      console.log(`Updating Discord message for ${squadronGroup.squadron.name}:`, {
        messageId: existingPost.messageId,
        guildId: existingPost.guildId,
        channelId: existingPost.channelId,
        messageText,
        stepTimeString,
        apiUrl: `${import.meta.env.VITE_API_URL}/api/discord/update-image/${existingPost.messageId}`
      });

      // Send to the backend API for Discord message update
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/discord/update-image/${existingPost.messageId}`, {
        method: 'PUT',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Failed to update Discord message:', errorData);
        return false;
      }

      const result = await response.json();
      console.log('Successfully updated Discord message:', result);
      
      // Save/update the flight post record
      if (selectedEvent?.id) {
        await saveFlightPostRecord(
          selectedEvent.id,
          squadronGroup.squadron.id,
          existingPost.guildId,
          existingPost.channelId,
          existingPost.messageId,
          true
        );
      }
      
      return true;
    } catch (error) {
      console.error('Error updating Discord message:', error);
      return false;
    }
  }, [selectedEvent, saveFlightPostRecord, formatStepTime]);

  // Publish flight assignments to Discord
  const publishToDiscordChannel = useCallback(async (squadronGroup: SquadronFlightGroup, imageBlob: Blob): Promise<boolean> => {
    try {
      if (!squadronGroup.squadron.discord_integration) {
        console.error('No Discord integration configured for squadron:', squadronGroup.squadron.name);
        return false;
      }

      const discordIntegration = squadronGroup.squadron.discord_integration;
      const briefingChannel = discordIntegration.discordChannels?.find((ch: any) => ch.type === 'briefing');
      
      if (!briefingChannel) {
        console.error('No briefing channel configured for squadron:', squadronGroup.squadron.name);
        return false;
      }

      // Create FormData for the image upload
      const formData = new FormData();
      formData.append('image', imageBlob, `${squadronGroup.squadron.designation}_flight_assignments.png`);
      formData.append('guildId', String(discordIntegration.selectedGuildId));
      formData.append('channelId', String(briefingChannel.id));
      // Get event date for Discord message
      const timezone = settings.eventDefaults.referenceTimezone || 'America/New_York';
      const eventDate = selectedEvent?.datetime ?
        new Date(selectedEvent.datetime).toLocaleDateString('en-US', {
          timeZone: timezone,
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        }) : 'TBD';

      const stepTimeString = formatStepTime();
      const messageText = stepTimeString
        ? `**${eventDate} Flight Assignments (v1) ${stepTimeString}**`
        : `**${eventDate} Flight Assignments (v1)**`;
      formData.append('message', messageText);
      
      // Add role mentions if configured for the event
      if (selectedEvent?.eventSettings?.initialNotificationRoles && selectedEvent.eventSettings.initialNotificationRoles.length > 0) {
        formData.append('roleMentions', JSON.stringify(selectedEvent.eventSettings.initialNotificationRoles));
      }

      console.log(`Publishing to Discord - Squadron: ${squadronGroup.squadron.name}, Guild: ${discordIntegration.selectedGuildId}, Channel: ${briefingChannel.id} (${briefingChannel.name})`);

      // Send to the backend API for Discord posting
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/discord/post-image`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error(`Failed to post to Discord for ${squadronGroup.squadron.name}:`, errorData);
        return false;
      }

      const result = await response.json();
      console.log('Successfully posted flight assignments to Discord:', result);

      // Save the flight post record to the database (IDs are UUIDs, not numbers)
      if (selectedEvent?.id && result.messageId && discordIntegration.selectedGuildId) {
        await saveFlightPostRecord(
          selectedEvent.id,
          squadronGroup.squadron.id,
          discordIntegration.selectedGuildId,
          briefingChannel.id,
          result.messageId,
          false
        );
      }
      
      return true;
    } catch (error) {
      console.error('Error posting to Discord:', error);
      return false;
    }
  }, [selectedEvent, saveFlightPostRecord, formatStepTime]);

  // Handle dialog responses
  const handleUpdateExisting = useCallback(async () => {
    setShowPostOptionsDialog(false);
    await performPublishAction('update');
  }, [existingPosts, groupFlightsBySquadron, generateFlightAssignmentImage, publishToDiscordChannel, updateExistingDiscordMessage]);

  const handleCreateNew = useCallback(async () => {
    setShowPostOptionsDialog(false);
    await performPublishAction('create');
  }, [groupFlightsBySquadron, generateFlightAssignmentImage, publishToDiscordChannel]);

  const handleCancelDialog = useCallback(() => {
    setShowPostOptionsDialog(false);
    setExistingPosts([]);
  }, []);

  // Perform the actual publish action
  const performPublishAction = useCallback(async (action: 'create' | 'update') => {
    try {
      const squadronGroups = await groupFlightsBySquadron();

      console.log('Squadron groups for publishing:', squadronGroups.map(sg => ({
        name: sg.squadron.name,
        id: sg.squadron.id,
        hasDiscordIntegration: !!sg.squadron.discord_integration,
        hasBriefingChannel: !!sg.squadron.discord_integration?.discordChannels?.find((ch: any) => ch.type === 'briefing'),
        flightCount: sg.flights.length
      })));

      if (squadronGroups.length === 0) {
        alert('No squadrons found with matching callsigns. Please ensure squadrons have their callsigns configured in Organization > Squadron Settings.');
        return;
      }

      const publishPromises = squadronGroups.map(async (squadronGroup) => {
        try {
          let revision = 1; // Default for new posts
          let existingPost = null;

          if (action === 'update') {
            // Find existing post for this squadron
            existingPost = existingPosts.find(post => post.squadronId === squadronGroup.squadron.id);
            console.log(`Looking for existing post for ${squadronGroup.squadron.name} (${squadronGroup.squadron.id}):`, {
              found: !!existingPost,
              existingPost,
              allExistingPosts: existingPosts.map(p => ({ squadronId: p.squadronId, revision: p.revision }))
            });
            if (existingPost) {
              revision = (existingPost.revision || 1) + 1;
            }
          }

          // Check if squadron has Discord integration configured before proceeding
          // This is especially important when updating, as we might have flights for squadrons
          // that don't have Discord configured in the local environment
          const hasDiscordIntegration = squadronGroup.squadron.discord_integration;
          const hasBriefingChannel = hasDiscordIntegration?.discordChannels?.find((ch: any) => ch.type === 'briefing');

          if (!hasDiscordIntegration || !hasBriefingChannel) {
            console.warn(`Skipping ${action} for squadron ${squadronGroup.squadron.name} - Discord integration not configured`);
            return {
              squadron: squadronGroup.squadron.name,
              success: false,
              error: 'Discord integration not configured',
              skipped: true
            };
          }

          const imageBlob = await generateFlightAssignmentImage(squadronGroup, revision);
          if (!imageBlob) {
            console.error('Failed to generate image for squadron:', squadronGroup.squadron.name);
            return { squadron: squadronGroup.squadron.name, success: false, error: 'Failed to generate image' };
          }

          let success: boolean;

          if (action === 'update' && existingPost) {
            success = await updateExistingDiscordMessage(squadronGroup, imageBlob, existingPost);
          } else {
            // Create new post (either action is 'create' or no existing post found)
            success = await publishToDiscordChannel(squadronGroup, imageBlob);
          }

          return { 
            squadron: squadronGroup.squadron.name, 
            success, 
            error: success ? null : `Failed to ${action} Discord post`
          };
        } catch (error) {
          return { 
            squadron: squadronGroup.squadron.name, 
            success: false, 
            error: error instanceof Error ? error.message : 'Unknown error'
          };
        }
      });

      const results = await Promise.all(publishPromises);

      const successCount = results.filter(r => r.success).length;
      const skippedResults = results.filter((r: any) => r.skipped);
      const failedResults = results.filter((r: any) => !r.success && !r.skipped);

      if (successCount > 0) {
        const successMessage = action === 'update'
          ? `Successfully updated flight assignments for ${successCount} squadron${successCount > 1 ? 's' : ''}.`
          : `Successfully published flight assignments to ${successCount} squadron${successCount > 1 ? 's' : ''}.`;

        if (skippedResults.length > 0) {
          const skippedMessage = skippedResults.map((r: any) => r.squadron).join(', ');
          console.log(`${successMessage}\n\nSkipped ${skippedResults.length} squadron${skippedResults.length > 1 ? 's' : ''} (no Discord config): ${skippedMessage}`);
        }

        if (failedResults.length > 0) {
          const failedMessage = failedResults.map((r: any) => `${r.squadron}: ${r.error}`).join('\n');
          console.error(`${successMessage}\n\nFailed to ${action}:\n${failedMessage}`);
        } else if (skippedResults.length === 0) {
          console.log(successMessage);
        }
      } else {
        if (skippedResults.length > 0 && failedResults.length === 0) {
          const skippedMessage = skippedResults.map((r: any) => r.squadron).join(', ');
          console.log(`Skipped all ${skippedResults.length} squadron${skippedResults.length > 1 ? 's' : ''} (no Discord config): ${skippedMessage}`);
        } else {
          const failedMessage = failedResults.map((r: any) => `${r.squadron}: ${r.error}`).join('\n');
          console.error(`Failed to ${action} flight assignments:\n${failedMessage}`);
        }
      }

      // Clear existing posts after action is complete
      setExistingPosts([]);
    } catch (error) {
      console.error(`Error ${action === 'update' ? 'updating' : 'publishing'} to Discord:`, error);
      alert(`An unexpected error occurred while ${action === 'update' ? 'updating' : 'publishing'} to Discord.`);
    }
  }, [existingPosts, groupFlightsBySquadron, generateFlightAssignmentImage, publishToDiscordChannel, updateExistingDiscordMessage]);

  // Handle publish to Discord
  const handlePublishToDiscord = useCallback(async () => {
    try {
      if (flights.length === 0) {
        alert('No flight assignments to publish.');
        return;
      }

      // Check for existing posts
      const { hasExisting, posts } = await checkExistingPosts();
      console.log('Existing posts check:', { hasExisting, postsCount: posts.length, posts });

      if (hasExisting && posts.length > 0) {
        // Show dialog for user to choose action
        console.log('Found existing posts, showing dialog');
        setExistingPosts(posts);
        setShowPostOptionsDialog(true);
        return;
      }

      // No existing posts, proceed with normal publish
      console.log('No existing posts found, creating new posts');
      await performPublishAction('create');
    } catch (error) {
      console.error('Error in handlePublishToDiscord:', error);
      alert('An unexpected error occurred while preparing to publish to Discord.');
    }
  }, [flights, checkExistingPosts, performPublishAction]);


  return (
    <div style={{ 
      width, 
      position: 'relative',
      padding: '10px',
      margin: '-10px',
      paddingBottom: '20px',
      height: '100%', // Added to ensure full height same as Available Pilots
    }}>
      <Card 
        style={{
          width: '100%',
          height: '100%', // Ensures card takes full height of container
          boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)',
          borderRadius: '8px',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          overflowY: 'hidden',
          boxSizing: 'border-box',
          transition: 'all 0.2s ease-in-out',
          backgroundColor: '#FFFFFF'
        }}
      >
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
            Flight Assignments
          </span>
        </div>
        <div className="flex-1" style={{ overflowY: 'auto' }}>
          <div className="space-y-4">
            {[...flights].sort((a, b) => {
              // Primary sort: by callsign alphabetically
              if (a.callsign !== b.callsign) {
                return a.callsign.localeCompare(b.callsign);
              }
              // Secondary sort: by flight number numerically
              return parseInt(a.flightNumber) - parseInt(b.flightNumber);
            }).map((flight) => (
              <FlightAssignmentCard
                key={flight.id}
                id={flight.id}
                callsign={flight.callsign}
                flightNumber={flight.flightNumber}
                pilots={getUpdatedFlightPilots(flight)}
                midsA={flight.midsA}
                midsB={flight.midsB}
                stepTime={flight.stepTime || 0}
                onDeleteFlight={handleDeleteFlight}
                onEditFlight={handleEditFlight}
                onStepTimeChange={handleStepTimeChange}
                missionCommander={missionCommander}
              />
            ))}
          </div>
        </div>
        <div style={{
          display: 'flex',
          justifyContent: 'space-around',
          padding: '18px 0 0 0',
          borderTop: '1px solid #E2E8F0'
        }}>
          <button
            onClick={handleRemoveAll}
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
              flex: '0 0 30%',
              margin: '0 8px'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.backgroundColor = '#F8FAFC';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.backgroundColor = '#FFFFFF';
            }}
          >
            <Trash2 size={16} />
            Remove All
          </button>
          <button
            onClick={() => setShowAddFlightDialog(true)}
            style={{
              width: '119px',
              height: '30px',
              background: '#FFFFFF',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              transition: 'box-shadow 0.2s ease-in-out',
              fontFamily: 'Inter',
              fontStyle: 'normal',
              fontWeight: 400,
              fontSize: '20px',
              lineHeight: '24px',
              color: '#64748B',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.boxShadow = '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            +
          </button>
          <button
            onClick={handlePublishToDiscord}
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
              flex: '0 0 30%',
              margin: '0 8px'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.backgroundColor = '#F8FAFC';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.backgroundColor = '#FFFFFF';
            }}
          >
            <DiscordIcon size={16} />
            Publish
          </button>
        </div>
      </Card>

      {/* Add/Edit Flight Dialog */}
      {showAddFlightDialog && (
        <>
          {/* Semi-transparent overlay */}
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 1000
          }} onClick={handleCancelAddFlight} />
          
          {/* Dialog */}
          <AddFlightDialog
            onSave={handleAddFlight}
            onCancel={handleCancelAddFlight}
            existingCallsigns={existingCallsigns}
            initialCallsign={initialEditCallsign}
            title={editFlightId ? "Edit Flight" : "Add Flights"}
            squadronCallsigns={participatingSquadrons}
            selectedEvent={selectedEvent}
          />
        </>
      )}

      {/* Remove All Confirmation Dialog */}
      {showRemoveAllDialog && (
        <>
          {/* Semi-transparent overlay */}
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 1000
          }} onClick={cancelRemoveAll} />
          
          {/* Dialog */}
          <div style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: '#FFFFFF',
            borderRadius: '8px',
            padding: '24px',
            boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)',
            zIndex: 1001,
            minWidth: '400px'
          }}>
            <div style={{
              fontFamily: 'Inter',
              fontSize: '18px',
              fontWeight: 500,
              color: '#1F2937',
              marginBottom: '16px',
              textAlign: 'center'
            }}>
              Remove All Flight Assignments?
            </div>
            <div style={{
              fontFamily: 'Inter',
              fontSize: '14px',
              color: '#6B7280',
              marginBottom: '24px',
              textAlign: 'center'
            }}>
              This will remove all flight cards and pilot assignments, restoring the Flight Assignments section to a clean slate. This action cannot be undone.
            </div>
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              gap: '12px'
            }}>
              <button
                onClick={cancelRemoveAll}
                style={{
                  width: '100px',
                  height: '32px',
                  background: '#F3F4F6',
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: 'Inter',
                  fontSize: '14px',
                  color: '#374151'
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmRemoveAll}
                style={{
                  width: '100px',
                  height: '32px',
                  background: '#EF4444',
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: 'Inter',
                  fontSize: '14px',
                  color: '#FFFFFF'
                }}
              >
                Remove All
              </button>
            </div>
          </div>
        </>
      )}

      {/* Edit Flight Dialog */}
      {showEditFlightDialog && (
        <>
          {/* Semi-transparent overlay */}
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 1000
          }} onClick={handleCancelEdit} />

          {/* Dialog */}
          <div style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: '#FFFFFF',
            borderRadius: '8px',
            padding: '24px',
            boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)',
            zIndex: 1001,
            minWidth: '400px'
          }}>
            <div style={{
              fontFamily: 'Inter',
              fontSize: '18px',
              fontWeight: 500,
              color: '#1F2937',
              marginBottom: '24px',
              textAlign: 'center'
            }}>
              Edit Flight
            </div>

            {/* Callsign Input */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block',
                fontFamily: 'Inter',
                fontSize: '14px',
                fontWeight: 500,
                color: '#64748B',
                marginBottom: '8px'
              }}>
                Callsign
              </label>
              <input
                type="text"
                value={editingCallsign}
                onChange={(e) => setEditingCallsign(e.target.value.toUpperCase())}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #CBD5E1',
                  borderRadius: '4px',
                  fontSize: '14px',
                  fontFamily: 'Inter',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Step Time Input */}
            <div style={{ marginBottom: '24px' }}>
              <label style={{
                display: 'block',
                fontFamily: 'Inter',
                fontSize: '14px',
                fontWeight: 500,
                color: '#64748B',
                marginBottom: '8px'
              }}>
                Step Time Offset (minutes)
              </label>
              <input
                type="number"
                value={editingStepTime}
                onChange={(e) => setEditingStepTime(parseInt(e.target.value) || 0)}
                min="-999"
                max="999"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #CBD5E1',
                  borderRadius: '4px',
                  fontSize: '14px',
                  fontFamily: 'Inter',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Buttons */}
            <div style={{
              display: 'flex',
              gap: '12px',
              justifyContent: 'flex-end'
            }}>
              <button
                onClick={handleCancelEdit}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#FFFFFF',
                  color: '#64748B',
                  border: '1px solid #CBD5E1',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontFamily: 'Inter',
                  fontSize: '14px',
                  fontWeight: 400
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEditedFlight}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#3B82F6',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontFamily: 'Inter',
                  fontSize: '14px',
                  fontWeight: 500
                }}
              >
                Save
              </button>
            </div>
          </div>
        </>
      )}

      {/* Delete Flight Confirmation Dialog */}
      {showDeleteConfirmDialog && (
        <>
          {/* Semi-transparent overlay */}
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 1000
          }} onClick={cancelDeleteFlight} />

          {/* Dialog */}
          <div style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: '#FFFFFF',
            borderRadius: '8px',
            padding: '24px',
            boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)',
            zIndex: 1001,
            minWidth: '400px'
          }}>
            <div style={{
              fontFamily: 'Inter',
              fontSize: '18px',
              fontWeight: 500,
              color: '#1F2937',
              marginBottom: '16px',
              textAlign: 'center'
            }}>
              Delete Flight?
            </div>
            <div style={{
              fontFamily: 'Inter',
              fontSize: '14px',
              color: '#64748B',
              marginBottom: '24px',
              textAlign: 'center'
            }}>
              {deletingFlightHasPilots
                ? 'This flight has pilots assigned. They will be unassigned if you delete this flight.'
                : 'Are you sure you want to delete this flight?'}
            </div>
            <div style={{
              display: 'flex',
              gap: '12px',
              justifyContent: 'center'
            }}>
              <button
                onClick={cancelDeleteFlight}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#FFFFFF',
                  color: '#64748B',
                  border: '1px solid #CBD5E1',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontFamily: 'Inter',
                  fontSize: '14px',
                  fontWeight: 400
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => confirmDeleteFlight()}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#EF4444',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontFamily: 'Inter',
                  fontSize: '14px',
                  fontWeight: 500
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </>
      )}

      {/* Flight Post Options Dialog */}
      {showPostOptionsDialog && (
        <FlightPostOptionsDialog
          onCancel={handleCancelDialog}
          onUpdateExisting={handleUpdateExisting}
          onCreateNew={handleCreateNew}
          existingPostsCount={existingPosts.length}
        />
      )}
    </div>
  );
};

export default FlightAssignments;