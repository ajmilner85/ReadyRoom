import React, { useState, useRef, useEffect } from 'react';
import { Avatar, Button, Field, Icon, IconButton, Pane, PopoverMenu, Select, TextInput, Textarea } from '../primitives';
import type { Event, Cycle } from '../../../types/EventTypes';
import { processMissionCoordinates } from '../../../utils/coordinateUtils';
import { saveToLocalStorage, loadFromLocalStorage, STORAGE_KEYS } from '../../../utils/localStorageUtils';
import { fetchCycles } from '../../../utils/supabaseClient';
import JSZip from 'jszip';
import { load } from 'fengari-web';
import AircraftGroups from './AircraftGroups';
import { useAppSettings } from '../../../context/AppSettingsContext';
import { extractRedCoalitionUnitTypes } from '../../../utils/redUnitExtractor';
import { MizImportOptionsDialog, type MizImportMode } from '../dialogs/MizImportOptionsDialog';
import { ConfirmationDialog } from '../dialogs/ConfirmationDialog';

interface MissionCommanderInfo {
  boardNumber: string;
  callsign: string;
  flightId: string;
  flightCallsign: string;
  flightNumber: string;
}

interface MissionDetailsProps {
  width: string;
  events: Event[];
  selectedEvent: Event | null;
  onEventSelect: (event: Event | null) => void;
  missionCommander: MissionCommanderInfo | null;
  setMissionCommander: (commander: MissionCommanderInfo | null) => void;
  getMissionCommanderCandidates: () => {
    label: string;
    value: string;
    boardNumber: string;
    callsign: string;
    flightId: string;
    flightCallsign: string;
    flightNumber: string;
  }[];
  onExtractedFlights?: (flights: any[], mode?: MizImportMode) => void;
  onStepTimeChange?: (stepTime: string) => void;
  mission?: any; // Mission object from database
  updateMissionData?: (updates: any) => Promise<any>; // Function to update mission in database
  prepFlights?: any[]; // Current flights for checking if merge is needed
  onClearAssignments?: () => void; // Callback to clear all pilot assignments
}

interface MissionDetailsData {
  taskUnit: string;
  mother: string;
  missionDateTime: string;
  stepTime: string;
  missionCommander: string;
  bullseyeLatLon: string;
  weather: string;
}

const MissionDetails: React.FC<MissionDetailsProps> = ({
  width,
  events,
  selectedEvent,
  onEventSelect,
  missionCommander,
  setMissionCommander,
  getMissionCommanderCandidates,
  onExtractedFlights,
  onStepTimeChange,
  mission,
  updateMissionData,
  prepFlights,
  onClearAssignments
}) => {
  const { settings } = useAppSettings();

  // State for cycles
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [selectedCycle, setSelectedCycle] = useState<Cycle | null>(null);
  const [cyclesLoading, setCyclesLoading] = useState<boolean>(true);

  // Get cycle ID from URL if navigating from Events Management page
  const getCycleIdFromUrl = () => {
    const params = new URLSearchParams(window.location.search);
    return params.get('cycleId');
  };

  // Helper function to convert UTC datetime to timezone-local datetime string for input
  const utcToTimezoneLocal = (utcDateString: string, timezone: string): string => {
    if (!utcDateString) return '';
    try {
      const utcDate = new Date(utcDateString);
      const formatter = new Intl.DateTimeFormat('en', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });

      const parts = formatter.formatToParts(utcDate);
      const year = parts.find(p => p.type === 'year')?.value;
      const month = parts.find(p => p.type === 'month')?.value;
      const day = parts.find(p => p.type === 'day')?.value;
      const hour = parts.find(p => p.type === 'hour')?.value;
      const minute = parts.find(p => p.type === 'minute')?.value;

      return `${year}-${month}-${day}T${hour}:${minute}`;
    } catch (error) {
      console.warn('Error converting UTC to timezone local:', error);
      return new Date(utcDateString).toISOString().slice(0, 16);
    }
  };

  // Helper function to convert timezone-local datetime string to UTC for storage
  const timezoneLocalToUtc = (localDateString: string, timezone: string): string => {
    if (!localDateString) return '';
    try {
      const [datePart, timePart] = localDateString.split('T');
      const [year, month, day] = datePart.split('-').map(Number);
      const [hour, minute] = timePart.split(':').map(Number);

      let guess = new Date(Date.UTC(year, month - 1, day, hour, minute));

      const formatter = new Intl.DateTimeFormat('sv-SE', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });

      const parts = formatter.formatToParts(guess);
      const resultYear = parseInt(parts.find(p => p.type === 'year')?.value || '0');
      const resultMonth = parseInt(parts.find(p => p.type === 'month')?.value || '0');
      const resultDay = parseInt(parts.find(p => p.type === 'day')?.value || '0');
      const resultHour = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
      const resultMinute = parseInt(parts.find(p => p.type === 'minute')?.value || '0');

      const targetTime = new Date(year, month - 1, day, hour, minute);
      const resultTime = new Date(resultYear, resultMonth - 1, resultDay, resultHour, resultMinute);
      const diff = targetTime.getTime() - resultTime.getTime();

      const correctedUtc = new Date(guess.getTime() + diff);

      return correctedUtc.toISOString();
    } catch (error) {
      console.warn('Error converting timezone local to UTC:', error);
      return new Date(localDateString).toISOString();
    }
  };

  // Filter events by selected cycle and sort by date (chronological, earliest first)
  const filteredAndSortedEvents = [...events]
    .filter(event => {
      // If no cycle is selected in the dropdown (user chose "Standalone Events" or hasn't selected anything yet)
      // For "Standalone Events", selectedCycle will be null but we're intentionally showing standalone events
      // We need to check if the user selected "Standalone Events" explicitly
      const standaloneSelected = selectedCycle === null && events.some(e => !e.cycleId);

      if (standaloneSelected) {
        // Show only events without a cycle
        return !event.cycleId;
      } else if (selectedCycle) {
        // Show only events for the selected cycle
        return event.cycleId === selectedCycle.id;
      } else {
        // No cycle selected and no standalone events exist, show nothing
        return false;
      }
    })
    .sort((a, b) => {
      const dateA = new Date(a.datetime).getTime();
      const dateB = new Date(b.datetime).getTime();

      // Handle invalid dates by putting them at the end
      if (isNaN(dateA) && isNaN(dateB)) return 0;
      if (isNaN(dateA)) return 1;
      if (isNaN(dateB)) return -1;

      // Sort chronologically (earliest first) for mission preparation
      return dateA - dateB;
    });

  // Check if there's an event ID in URL (navigation from Events Management)
  const getEventIdFromUrl = () => {
    const params = new URLSearchParams(window.location.search);
    return params.get('eventId');
  };

  // Track if we've processed the URL event ID to prevent re-processing
  const [hasProcessedUrlEventId, setHasProcessedUrlEventId] = useState(false);
  const urlEventId = getEventIdFromUrl();

  // Auto-select earliest upcoming event when cycle changes or events load
  useEffect(() => {
    console.log('🔍 MissionDetails: Event selection effect triggered:', {
      hasCycle: !!selectedCycle,
      cycleId: selectedCycle?.id,
      cycleName: selectedCycle?.name,
      filteredEventsCount: filteredAndSortedEvents.length,
      hasSelectedEvent: !!selectedEvent,
      selectedEventCycleId: selectedEvent?.cycleId,
      eventsCount: events.length,
      urlEventId,
      hasProcessedUrlEventId
    });

    if (filteredAndSortedEvents.length > 0) {
      // Priority 1: If URL has eventId and we haven't processed it yet, select that event
      if (urlEventId && !hasProcessedUrlEventId) {
        const urlEvent = filteredAndSortedEvents.find(e => e.id === urlEventId);
        if (urlEvent) {
          console.log('🎯 MissionDetails: Selecting event from URL:', urlEvent);
          onEventSelect(urlEvent);
          setHasProcessedUrlEventId(true);
          return; // Exit early to prevent auto-selection logic from running
        }
      }

      // Priority 2: If current selected event is not in the filtered list, select the earliest upcoming/ongoing event
      const eventStillValid = selectedEvent && filteredAndSortedEvents.some(e => e.id === selectedEvent.id);
      if (!eventStillValid && !selectedEvent) {
        // Only auto-select if there's NO selected event at all
        // If there's a selected event but it's not in the filtered list, keep it selected
        // (it just won't show in the list until the filter changes)
        // Find the earliest ongoing or upcoming event
        const now = new Date();
        const ongoingOrUpcomingEvent = filteredAndSortedEvents.find(event => {
          const eventStart = new Date(event.datetime);
          const eventEnd = event.endDatetime ? new Date(event.endDatetime) : null;

          // Event is ongoing (started but not ended)
          if (eventStart <= now && eventEnd && eventEnd >= now) {
            return true;
          }

          // Event is upcoming (hasn't started yet)
          if (eventStart > now) {
            return true;
          }

          return false;
        });
        // If there's an ongoing/upcoming event, select it; otherwise select the first event
        const eventToSelect = ongoingOrUpcomingEvent || filteredAndSortedEvents[0];
        console.log('🎯 MissionDetails: Auto-selecting earliest ongoing/upcoming event:', eventToSelect);
        onEventSelect(eventToSelect);
      }
    } else if (selectedEvent) {
      // If no events in the filtered list, clear event selection
      console.log('🎯 MissionDetails: Clearing event selection (no events in filter)');
      onEventSelect(null);
    }
  }, [selectedCycle?.id, filteredAndSortedEvents.length, events.length, urlEventId, hasProcessedUrlEventId]);

  const [missionDetails, setMissionDetails] = useState<MissionDetailsData>(() => {
    // Load mission details from localStorage or use defaults
    return loadFromLocalStorage<MissionDetailsData>(STORAGE_KEYS.MISSION_DETAILS, {
      taskUnit: 'VFA-161',
      mother: 'CVN-73 George Washington "Warfighter"',
      missionDateTime: '',
      stepTime: '',
      missionCommander: '',
      bullseyeLatLon: '',
      weather: ''
    });
  });

  const [isEditing, setIsEditing] = useState(false);
  const [editedDetails, setEditedDetails] = useState<MissionDetailsData>(missionDetails);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null); // File waiting for import mode selection
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [parsedMission, setParsedMission] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [json2Lua, setJson2Lua] = useState<string | null>(null);
  const [hasExtractedForCurrentFile, setHasExtractedForCurrentFile] = useState(false);

  // Dialog states
  const [showImportOptionsDialog, setShowImportOptionsDialog] = useState(false);
  const [showClearConfirmDialog, setShowClearConfirmDialog] = useState(false);
  const [selectedImportMode, setSelectedImportMode] = useState<MizImportMode | null>(null);

  // Fetch cycles on component mount
  useEffect(() => {
    const loadCycles = async () => {
      setCyclesLoading(true);
      console.log('🔄 MissionDetails: Loading cycles...');
      try {
        const { cycles: fetchedCycles, error } = await fetchCycles();

        if (error) {
          console.error('❌ MissionDetails: Error fetching cycles:', error);
          return;
        }

        console.log('✅ MissionDetails: Fetched cycles:', fetchedCycles?.length || 0);

        if (fetchedCycles && fetchedCycles.length > 0) {
          setCycles(fetchedCycles);

          // Check if there's a cycle ID from URL (navigating from Events Management)
          const urlCycleId = getCycleIdFromUrl();
          console.log('🔍 MissionDetails: URL cycle ID:', urlCycleId);

          if (urlCycleId) {
            const urlCycle = fetchedCycles.find(cycle => cycle.id === urlCycleId);
            if (urlCycle) {
              console.log('✅ MissionDetails: Found cycle from URL:', urlCycle.name);
              setSelectedCycle(urlCycle);
              return;
            }
          }

          // If there's a currently selected event with a cycleId, prefer that cycle.
          // This ensures the dropdown matches the event cached in localStorage rather
          // than always falling back to whichever cycle is marked "active".
          if (selectedEvent?.cycleId) {
            const eventCycle = fetchedCycles.find(cycle => cycle.id === selectedEvent.cycleId);
            if (eventCycle) {
              console.log('✅ MissionDetails: Selecting cycle matching selected event:', eventCycle.name);
              setSelectedCycle(eventCycle);
              return;
            }
          }

          // Otherwise, auto-select the active cycle with the earliest start date
          const activeCycles = fetchedCycles.filter(cycle => cycle.status === 'active');
          console.log('🔍 MissionDetails: Active cycles found:', activeCycles.length);

          if (activeCycles.length > 0) {
            const sortedActiveCycles = [...activeCycles].sort((a, b) =>
              new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
            );
            console.log('✅ MissionDetails: Auto-selecting active cycle:', sortedActiveCycles[0].name);
            setSelectedCycle(sortedActiveCycles[0]);
          } else {
            // No active cycles, select the most recent cycle by start date
            console.log('⚠️ MissionDetails: No active cycles found, selecting most recent cycle');
            const sortedCycles = [...fetchedCycles].sort((a, b) =>
              new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
            );
            console.log('✅ MissionDetails: Auto-selecting most recent cycle:', sortedCycles[0].name);
            setSelectedCycle(sortedCycles[0]);
          }
        } else {
          console.log('⚠️ MissionDetails: No cycles fetched');
        }
      } catch (err) {
        console.error('❌ MissionDetails: Failed to load cycles:', err);
      } finally {
        setCyclesLoading(false);
        console.log('🏁 MissionDetails: Finished loading cycles');
      }
    };

    loadCycles();
  }, []);

  // Load the json2.lua file on component mount
  useEffect(() => {
    async function loadJson2Lua() {
      try {
        // Make sure to use the correct path for json2.lua
        const response = await fetch('/assets/json2.lua');
        if (!response.ok) {
          throw new Error(`Failed to load json2.lua: ${response.status} ${response.statusText}`);
        }
        const luaCode = await response.text();
        setJson2Lua(luaCode);
      } catch (error) {
        console.error('Error loading json2.lua:', error);
      }
    }

    loadJson2Lua();
  }, []);

  // Save mission details to localStorage whenever they change
  useEffect(() => {
    saveToLocalStorage(STORAGE_KEYS.MISSION_DETAILS, missionDetails);
  }, [missionDetails]);

  // Load step time from mission database when mission changes
  useEffect(() => {
    if (mission?.step_time) {
      console.log('🕐 MissionDetails: Loading step time from mission:', mission.step_time);
      const timezone = settings.eventDefaults.referenceTimezone || 'America/New_York';
      setMissionDetails(prev => ({
        ...prev,
        stepTime: utcToTimezoneLocal(mission.step_time, timezone)
      }));
    }
  }, [mission?.id, mission?.step_time, settings.eventDefaults.referenceTimezone]);

  // Load mission details (taskUnit, mother, etc.) from mission_settings when mission updates.
  // mission_settings is a JSONB object so we depend on mission.updated_at (a primitive) to
  // detect when the row has changed, rather than the object reference which changes every render.
  useEffect(() => {
    if (!mission?.mission_settings) return;
    const ms = mission.mission_settings as any;
    setMissionDetails(prev => ({
      ...prev,
      ...(ms.taskUnit !== undefined ? { taskUnit: ms.taskUnit } : {}),
      ...(ms.mother !== undefined ? { mother: ms.mother } : {}),
      ...(ms.missionDateTime !== undefined ? { missionDateTime: ms.missionDateTime } : {}),
      ...(ms.bullseyeLatLon !== undefined ? { bullseyeLatLon: ms.bullseyeLatLon } : {}),
      ...(ms.weather !== undefined ? { weather: ms.weather } : {}),
    }));
  }, [mission?.id, mission?.updated_at]);

  const startEditing = () => {
    setIsEditing(true);
    setEditedDetails(missionDetails);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditedDetails(missionDetails);
  };

  const saveChanges = () => {
    console.log('💾 MissionDetails: Saving changes:', {
      stepTime: editedDetails.stepTime,
      previousStepTime: missionDetails.stepTime,
      hasCallback: !!onStepTimeChange,
      willCallCallback: !!(onStepTimeChange && editedDetails.stepTime !== missionDetails.stepTime)
    });

    setMissionDetails(editedDetails);
    setIsEditing(false);

    // Save step time to mission database if it changed and callback is provided
    if (onStepTimeChange && editedDetails.stepTime !== missionDetails.stepTime) {
      console.log('🕐 MissionDetails: Calling onStepTimeChange with:', editedDetails.stepTime);
      onStepTimeChange(editedDetails.stepTime);
    }

    // Save remaining mission details to mission_settings so they sync via realtime
    if (updateMissionData && mission) {
      updateMissionData({
        mission_settings: {
          ...(mission.mission_settings as any || {}),
          taskUnit: editedDetails.taskUnit,
          mother: editedDetails.mother,
          missionDateTime: editedDetails.missionDateTime,
          bullseyeLatLon: editedDetails.bullseyeLatLon,
          weather: editedDetails.weather,
        }
      });
    }
    // No need to explicitly save to localStorage here as the useEffect will handle it
  };

  const handleDetailChange = (field: keyof MissionDetailsData, value: string) => {
    setEditedDetails(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const renderDetailRow = (
    label: string,
    field: keyof MissionDetailsData,
    type: 'text' | 'datetime-local' | 'textarea' | 'select' = 'text',
    options?: { label: string; value: string; data?: any }[],
    opts: { mono?: boolean; block?: boolean } = {}
  ) => {
    const rawValue = isEditing ? editedDetails[field] : missionDetails[field];
    const timezone = settings.eventDefaults.referenceTimezone || 'America/New_York';

    // For datetime-local fields, convert between UTC (storage) and local timezone (display)
    const displayValue = type === 'datetime-local' && rawValue
      ? utcToTimezoneLocal(rawValue as string, timezone)
      : rawValue;

    const handleDateTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (type === 'datetime-local') {
        // Convert from local timezone to UTC for storage
        const utcValue = timezoneLocalToUtc(e.target.value, timezone);
        handleDetailChange(field, utcValue);
      } else {
        handleDetailChange(field, e.target.value);
      }
    };

    // Read-only display: datetime values render as "YYYY-MM-DD HH:MM"
    const readValue = type === 'datetime-local' && displayValue
      ? String(displayValue).replace('T', ' ')
      : (displayValue as string);

    return (
      <div className="min-w-0">
        <div className="rr-label mb-[5px]">{label}</div>
        {isEditing ? (
          type === 'textarea' ? (
            <Textarea
              value={displayValue as string}
              onChange={(e) => handleDetailChange(field, e.target.value)}
              placeholder={`Enter ${label.toLowerCase()}`}
              mono={opts.mono}
            />
          ) : type === 'select' && options ? (
            <Select
              value={(displayValue as string) || ''}
              onChange={(v) => handleDetailChange(field, v)}
              placeholder={`Select ${label}`}
              options={options.map(o => ({ value: o.value, label: o.label }))}
            />
          ) : (
            <TextInput
              type={type}
              value={displayValue as string}
              onChange={handleDateTimeChange}
              placeholder={`Enter ${label.toLowerCase()}`}
              mono={opts.mono || type === 'datetime-local'}
            />
          )
        ) : opts.block ? (
          <div
            className={`px-3 py-[10px] rounded-rr-lg bg-panel2 border border-border text-[13px] leading-[1.5] whitespace-pre-wrap ${opts.mono ? 'font-mono' : ''}`}
            style={{ color: readValue ? 'var(--rr-text)' : 'var(--rr-text3)' }}
          >
            {readValue || '—'}
          </div>
        ) : (
          <div
            className={`text-[13.5px] truncate ${opts.mono || type === 'datetime-local' ? 'font-mono font-medium' : 'font-semibold'}`}
            style={{ color: readValue ? 'var(--rr-text)' : 'var(--rr-text3)' }}
            title={readValue || undefined}
          >
            {readValue || '—'}
          </div>
        )}
      </div>
    );
  };

  const renderMissionCommanderDropdown = () => {
    const candidates = getMissionCommanderCandidates();
    const selectedValue = missionCommander ? missionCommander.boardNumber : '';
    const selectCommander = (selectedBoardNumber: string) => {
      if (!selectedBoardNumber) {
        setMissionCommander(null);
      } else {
        const selected = candidates.find(c => c.boardNumber === selectedBoardNumber);
        if (selected) {
          setMissionCommander({
            boardNumber: selected.boardNumber,
            callsign: selected.callsign,
            flightId: selected.flightId,
            flightCallsign: selected.flightCallsign,
            flightNumber: selected.flightNumber
          });
        }
      }
    };

    return (
      <div>
        <div className="rr-label mb-[6px]">Mission Commander</div>
        {missionCommander ? (
          <div
            className="flex items-center gap-[10px] px-3 py-[10px] rounded-rr-lg border"
            style={{ background: 'var(--rr-accent-weak)', borderColor: 'var(--rr-accent)' }}
          >
            <Avatar name={missionCommander.callsign} size={30} />
            <div className="min-w-0 flex-1 leading-tight">
              <div className="text-[13.5px] font-bold truncate">{missionCommander.callsign}</div>
              <div className="font-mono text-[10.5px] text-text2 truncate">
                {missionCommander.boardNumber} · {missionCommander.flightCallsign} {missionCommander.flightNumber}
              </div>
            </div>
            <PopoverMenu
              placement="bottom-end"
              width={260}
              items={[
                ...candidates.map(c => ({
                  label: c.label,
                  icon: c.boardNumber === selectedValue ? ('check' as const) : undefined,
                  onSelect: () => selectCommander(c.boardNumber),
                })),
                { label: 'No Mission Commander', icon: 'close' as const, divider: true, danger: true, onSelect: () => selectCommander('') },
              ]}
              trigger={({ ref, onClick }) => (
                <button
                  ref={ref as React.Ref<HTMLButtonElement>}
                  type="button"
                  onClick={onClick}
                  className="text-[11px] font-bold tracking-[.08em] text-accent bg-transparent border-0 cursor-pointer hover:brightness-125"
                >
                  CHANGE
                </button>
              )}
            />
          </div>
        ) : (
          <Select
            value={selectedValue}
            onChange={selectCommander}
            placeholder={candidates.length ? 'Assign mission commander' : 'Assign flights to choose a commander'}
            options={candidates.map(c => ({ value: c.boardNumber, label: c.label }))}
            disabled={candidates.length === 0}
          />
        )}
      </div>
    );
  };

  // Function to process the uploaded mission file
  const processMissionFile = async (file: File, importMode: MizImportMode = 'clear') => {
    setIsProcessingFile(true);
    console.log('🔄 MissionDetails: Starting .miz file processing for:', file.name, 'with mode:', importMode);
    // Accumulate mission_settings fields extracted from the .miz so we can save them to DB
    const mizExtractedSettings: Record<string, string> = {};

    try {
      // Make sure json2Lua is loaded
      if (!json2Lua) {
        console.error('❌ MissionDetails: json2.lua not loaded');
        throw new Error("json2.lua hasn't been loaded yet. Please try again.");
      }
      console.log('✅ MissionDetails: json2.lua is loaded');
      
      // Load the .miz file as a JSZip archive
      const zip = new JSZip();
      console.log('🔄 MissionDetails: Loading ZIP archive...');
      const archive = await zip.loadAsync(file);
      console.log('✅ MissionDetails: ZIP archive loaded successfully');
      
      // List all files in the archive for debugging
      console.log('📁 MissionDetails: Files in .miz archive:', Object.keys(archive.files));
      
      // Look for the mission file in the archive (usually named "mission")
      const missionFile = archive.file('mission');
      
      if (!missionFile) {
        console.error('❌ MissionDetails: Mission file not found in ZIP archive');
        console.error('Available files:', Object.keys(archive.files));
        throw new Error("Could not find mission file in the .miz archive");
      }
      console.log('✅ MissionDetails: Mission file found in archive');
      
      // Extract and read the mission file content
      console.log('🔄 MissionDetails: Extracting mission file content...');
      const missionContent = await missionFile.async('string');
      console.log('✅ MissionDetails: Mission content extracted, length:', missionContent.length);
      
      // Process the mission content to extract coordinates
      const coordinateData = processMissionCoordinates(missionContent);
      
      // Update the bullseye coordinates in the mission details
      if (coordinateData.blueBullseye.formatted) {
        setMissionDetails(prev => ({
          ...prev,
          bullseyeLatLon: coordinateData.blueBullseye.formatted || ''
        }));

        setEditedDetails(prev => ({
          ...prev,
          bullseyeLatLon: coordinateData.blueBullseye.formatted || ''
        }));

        mizExtractedSettings.bullseyeLatLon = coordinateData.blueBullseye.formatted;
      }
      
      try {
        // First execute json2.lua to define the json module
        console.log('🔄 MissionDetails: Loading json2.lua module...');
        load(json2Lua)();
        console.log('✅ MissionDetails: json2.lua module loaded successfully');
        
        // Create and execute the Lua code to process the mission
        console.log('🔄 MissionDetails: Preparing Lua code for mission parsing...');
        const luaCode = `
          local mission_content = [=[${missionContent}]=]
          
          -- Create a sandbox environment
          local env = {}
          
          -- Load the mission code into our environment
          local fn, err = load(mission_content, "mission", "t", env)
          if not fn then
            error("Failed to load mission content: " .. tostring(err))
          end
          
          -- Execute the mission code in our environment
          local status, err = pcall(fn)
          if not status then
            error("Failed to execute mission code: " .. tostring(err))
          end
          
          -- Now we should have a mission table in our environment
          local mission_table = env.mission
          if not mission_table then
            error("No mission table found after execution")
          end
          
          -- Return the mission table as JSON
          return json.encode(mission_table)
        `;
        
        // Execute the Lua code and get the JSON result
        console.log('🔄 MissionDetails: Executing Lua code...');
        const jsonResult = load(luaCode)();
        console.log('✅ MissionDetails: Lua code executed successfully');
        
        if (typeof jsonResult !== 'string') {
          console.error('❌ MissionDetails: Invalid result type:', typeof jsonResult);
          throw new Error('Invalid JSON result from Lua conversion');
        }
        
        if (!jsonResult || jsonResult === 'null') {
          console.error('❌ MissionDetails: Empty or null JSON result');
          throw new Error('JSON conversion resulted in null or empty output');
        }
        
        console.log('✅ MissionDetails: JSON result received, length:', jsonResult.length);
        
        // Parse the JSON into a JavaScript object
        console.log('🔄 MissionDetails: Parsing JSON data...');
        const missionData = JSON.parse(jsonResult);
        console.log('✅ MissionDetails: Successfully parsed mission data');
        
        // Detailed coalition structure logging
        console.log('🔍 MissionDetails: Mission data structure check:');
        console.log('- Coalition exists:', !!missionData.coalition);
        console.log('- Blue coalition exists:', !!missionData.coalition?.blue);
        console.log('- Blue coalition countries:', !!missionData.coalition?.blue?.country);
        
        if (missionData.coalition?.blue?.country) {
          const countries = Array.isArray(missionData.coalition.blue.country) 
            ? missionData.coalition.blue.country 
            : Object.values(missionData.coalition.blue.country);
          console.log('- Number of blue countries:', countries.length);
          
          // Check for aircraft groups in each country
          countries.forEach((country: any, index: number) => {
            console.log(`- Country ${index}:`, country.name || 'Unknown');
            console.log(`  - Has planes:`, !!country.plane?.group);
            console.log(`  - Has helicopters:`, !!country.helicopter?.group);
          });
        }
        
        // Store the parsed mission data
        console.log('💾 MissionDetails: Storing parsed mission data');
        setParsedMission(missionData);

        // Extract red coalition unit types for AAR pre-population
        console.log('🎯 MissionDetails: Extracting red coalition unit types...');
        const redUnitTypes = extractRedCoalitionUnitTypes(missionData);
        console.log(`✅ MissionDetails: Extracted ${redUnitTypes.length} unique red unit types`);

        // Save extracted red unit types to database with retry logic
        const saveMizFileData = async (retryCount = 0, maxRetries = 5) => {
          const retryDelay = 500; // 500ms between retries

          if (!updateMissionData) {
            console.warn('⚠️ MissionDetails: No updateMissionData function available');
            return;
          }

          if (redUnitTypes.length === 0) {
            console.warn('⚠️ MissionDetails: No red coalition units found in mission file');
            return;
          }

          if (mission) {
            console.log('💾 MissionDetails: Saving red unit types and extracted details to database...');
            try {
              await updateMissionData({
                miz_file_data: {
                  ...mission.miz_file_data,
                  red_coalition_units: redUnitTypes,
                  processed_at: new Date().toISOString(),
                  file_name: file.name
                },
                // Persist .miz-extracted details so they sync to other users via realtime
                ...(Object.keys(mizExtractedSettings).length > 0 ? {
                  mission_settings: {
                    ...(mission.mission_settings as any || {}),
                    ...mizExtractedSettings
                  }
                } : {})
              });
              console.log('✅ MissionDetails: Red unit types saved to database successfully');
            } catch (dbError) {
              console.error('❌ MissionDetails: Failed to save red unit types to database:', dbError);
            }
          } else if (retryCount < maxRetries) {
            console.log(`⏳ MissionDetails: Mission not yet available, retrying (${retryCount + 1}/${maxRetries}) in ${retryDelay}ms...`);
            setTimeout(() => saveMizFileData(retryCount + 1, maxRetries), retryDelay);
          } else {
            console.error('❌ MissionDetails: Failed to save red unit types - mission not available after max retries');
          }
        };

        saveMizFileData();

        // Reset selected file after successful processing to allow new imports
        // Add a small delay to ensure AircraftGroups processes the data first
        setTimeout(() => {
          console.log('🔄 MissionDetails: Resetting selected file for future imports');
          setSelectedFile(null);
          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }
        }, 1000);
        
        // Update any other details based on mission data
        if (missionData.date) {
          const missionDate = new Date(
            missionData.date.Year,
            missionData.date.Month - 1, // JS months are 0-indexed
            missionData.date.Day,
            missionData.start_time
          );

          const formattedDate = missionDate.toISOString().slice(0, 16); // Format as YYYY-MM-DDTHH:MM

          setMissionDetails(prev => ({
            ...prev,
            missionDateTime: formattedDate
          }));

          setEditedDetails(prev => ({
            ...prev,
            missionDateTime: formattedDate
          }));

          mizExtractedSettings.missionDateTime = formattedDate;
        }

        // Update weather info if available
        if (missionData.weather) {
          const weatherDetails = [
            `Cloud base: ${missionData.weather?.clouds?.base || 'N/A'} meters`,
            `Visibility: ${missionData.weather?.visibility?.distance || 'N/A'} meters`,
            `Wind at ground: ${missionData.weather?.wind?.at8000?.speed || 'N/A'} m/s from ${missionData.weather?.wind?.at8000?.dir || 'N/A'}°`
          ].join('\n');

          setMissionDetails(prev => ({
            ...prev,
            weather: weatherDetails
          }));

          setEditedDetails(prev => ({
            ...prev,
            weather: weatherDetails
          }));

          mizExtractedSettings.weather = weatherDetails;
        }
        
      } catch (luaError) {
        console.error('❌ MissionDetails: Error in Lua execution:', luaError);
        console.error('❌ MissionDetails: Lua error details:', {
          error: luaError,
          type: typeof luaError,
          message: luaError instanceof Error ? luaError.message : String(luaError)
        });
        throw new Error(`Failed to process mission file using Lua: ${luaError}`);
      }
    } catch (error) {
      console.error('❌ MissionDetails: Error processing mission file:', error);
      console.error('❌ MissionDetails: Full error details:', {
        error: error,
        type: typeof error,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      alert(`Error processing mission file: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      console.log('🏁 MissionDetails: Finished processing .miz file');
      setIsProcessingFile(false);
    }
  };

  const handleFileSelect = (file: File) => {
    if (file && file.name.endsWith('.miz')) {
      // Check if there are existing flights
      const hasExistingFlights = prepFlights && prepFlights.length > 0;

      if (hasExistingFlights) {
        // Show import options dialog
        setPendingFile(file);
        setShowImportOptionsDialog(true);
      } else {
        // No existing flights, proceed directly with clear mode
        setSelectedFile(file);
        setHasExtractedForCurrentFile(false);
        setSelectedImportMode('clear');
        processMissionFile(file, 'clear');
      }
    } else {
      alert('Only .miz files are supported');
    }
  };

  // Handle import mode selection from dialog
  const handleImportModeSelect = (mode: MizImportMode) => {
    setShowImportOptionsDialog(false);

    if (mode === 'cancel' || !pendingFile) {
      setPendingFile(null);
      return;
    }

    if (mode === 'clear') {
      // Show confirmation dialog for clear mode
      setSelectedImportMode(mode);
      setShowClearConfirmDialog(true);
    } else {
      // For merge and dataOnly modes, proceed directly
      setSelectedImportMode(mode);
      setSelectedFile(pendingFile);
      setHasExtractedForCurrentFile(false);
      processMissionFile(pendingFile, mode);
      setPendingFile(null);
    }
  };

  // Handle confirmation for clear existing flights
  const handleConfirmClear = () => {
    setShowClearConfirmDialog(false);

    if (!pendingFile) return;

    // Clear all assignments
    if (onClearAssignments) {
      onClearAssignments();
    }

    // Proceed with file processing
    setSelectedFile(pendingFile);
    setHasExtractedForCurrentFile(false);
    processMissionFile(pendingFile, 'clear');
    setPendingFile(null);
  };

  // Handle cancellation of clear confirmation
  const handleCancelClear = () => {
    setShowClearConfirmDialog(false);
    setPendingFile(null);
    setSelectedImportMode(null);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleDropZoneClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const eventOptions = filteredAndSortedEvents.map(event => {
    const eventDate = new Date(event.datetime);
    const isValidDate = !isNaN(eventDate.getTime());
    const formattedDate = isValidDate
      ? eventDate.toLocaleString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          timeZoneName: 'short'
        })
      : 'Invalid Date';
    return { value: event.id, label: event.title, description: formattedDate, searchText: `${event.title} ${formattedDate}` };
  });

  const editActions = !isEditing ? (
    <IconButton icon="edit" variant="outline" label="Edit mission details" onClick={startEditing} />
  ) : (
    <>
      <IconButton icon="close" variant="ghost" label="Cancel" onClick={cancelEditing} />
      <IconButton icon="check" variant="filled" label="Save" onClick={saveChanges} />
    </>
  );

  return (
    <div data-m="row" className="rr-page flex-1 min-h-0 min-w-0 flex items-start gap-[14px]" data-width={width}>
      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileInputChange}
        accept=".miz"
        style={{ display: 'none' }}
      />

      {/* Mission Brief */}
      <Pane
        title="Mission Brief"
        className="flex-1 min-w-[320px] max-h-full"
        actions={
          <>
            <Button size="sm" variant="secondary" icon="upload" onClick={handleDropZoneClick} disabled={isProcessingFile}>
              {isProcessingFile ? 'Processing…' : 'Import .miz'}
            </Button>
            {editActions}
          </>
        }
      >
        <div className="flex flex-col gap-[14px]">
          <div className="grid gap-3" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.6fr)' }}>
            <Field label="Cycle">
              <Select
                value={selectedCycle?.id || 'standalone'}
                onChange={(v) => {
                  if (v === 'standalone') {
                    setSelectedCycle(null);
                  } else {
                    const cycle = cycles.find(c => c.id === v);
                    setSelectedCycle(cycle || null);
                  }
                }}
                disabled={cyclesLoading}
                options={[
                  { value: 'standalone', label: 'Standalone Events' },
                  ...cycles.map(cycle => ({ value: cycle.id, label: cycle.name })),
                ]}
              />
            </Field>
            <Field label="Event">
              <Select
                value={selectedEvent?.id || ''}
                onChange={(v) => {
                  const event = filteredAndSortedEvents.find(evt => evt.id === v);
                  onEventSelect(event || null);
                }}
                disabled={filteredAndSortedEvents.length === 0}
                placeholder={filteredAndSortedEvents.length === 0 ? 'No events available' : 'Select an event'}
                options={eventOptions}
              />
            </Field>
          </div>

          <div className="h-px bg-border" />

          <div className="grid gap-x-4 gap-y-[14px]" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
            {renderDetailRow('Task Unit', 'taskUnit')}
            {renderDetailRow('Mother', 'mother')}
            {renderDetailRow('Mission Date/Time', 'missionDateTime', 'datetime-local')}
            {renderDetailRow('Step Time', 'stepTime', 'datetime-local')}
          </div>

          <div className="h-px bg-border" />

          <div>
            <div className="rr-label mb-[6px]">Mission Objective</div>
            <div className="text-[13px] leading-[1.55] text-text2 whitespace-pre-wrap">
              {selectedEvent?.description || <span className="text-text3">No event selected.</span>}
            </div>
          </div>
        </div>
      </Pane>

      {/* Conditions & Command */}
      <div className="flex-1 min-w-[300px] flex flex-col gap-[14px] min-h-0 max-h-full">
        <Pane title="Conditions & Command" className="flex-initial" actions={isEditing ? editActions : undefined}>
          <div className="flex flex-col gap-[14px]">
            {renderDetailRow('Weather · Brief', 'weather', 'textarea', undefined, { mono: true, block: true })}
            {renderDetailRow('Bullseye', 'bullseyeLatLon', 'text', undefined, { mono: true, block: true })}
            <div className="h-px bg-border" />
            {renderMissionCommanderDropdown()}
          </div>
        </Pane>

        {/* .miz import drop zone */}
        <Pane title="Import" className="flex-none" scroll={false}>
          <div
            className="h-[64px] rounded-rr-lg border border-dashed border-border2 flex items-center justify-center gap-2 cursor-pointer text-[12.5px] text-text2 text-center px-3 transition-colors duration-150 hover:bg-panel2 hover:border-accent"
            onClick={handleDropZoneClick}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            {isProcessingFile ? (
              <span>Processing mission file…</span>
            ) : selectedFile ? (
              <span className="flex items-center gap-2"><Icon name="upload" size={15} />{selectedFile.name}</span>
            ) : (
              <span>Drop a .miz file here, or click to browse.</span>
            )}
          </div>
        </Pane>
      </div>

      {/* Aircraft Groups - Hidden but still processing data */}
      {parsedMission && (
        <div style={{ display: 'none' }}>
          <AircraftGroups
            missionData={parsedMission}
            width="100%"
            aircraftType="FA-18C_hornet"
            onExtractedFlights={(flights) => {
              // Only extract flights once per file upload
              if (!!selectedFile && !hasExtractedForCurrentFile && onExtractedFlights) {
                console.log('🎯 MissionDetails: Extracting flights for new file upload with mode:', selectedImportMode);
                setHasExtractedForCurrentFile(true);
                // Pass the import mode to the parent component
                onExtractedFlights(flights, selectedImportMode || 'clear');
              } else {
                console.log('⚠️ MissionDetails: Skipping extraction:', {
                  hasFile: !!selectedFile,
                  alreadyExtracted: hasExtractedForCurrentFile,
                  hasCallback: !!onExtractedFlights
                });
              }
            }}
            shouldExtractFlights={!!selectedFile && selectedImportMode !== 'dataOnly'}
          />
        </div>
      )}

      {/* Import Options Dialog */}
      <MizImportOptionsDialog
        isOpen={showImportOptionsDialog}
        onSelectMode={handleImportModeSelect}
        existingFlightCount={prepFlights?.length || 0}
      />

      {/* Clear Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={showClearConfirmDialog}
        onConfirm={handleConfirmClear}
        onCancel={handleCancelClear}
        title="Clear Existing Flights?"
        message="This will delete all existing flights and pilot assignments. This action cannot be undone."
        confirmText="Clear All"
        cancelText="Cancel"
        type="danger"
        icon="trash"
      />
    </div>
  );
};

export default MissionDetails;