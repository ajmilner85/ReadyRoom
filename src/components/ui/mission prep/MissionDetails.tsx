import React, { useState, useRef, useEffect } from 'react';
import { Card } from '../card';
import { Edit2, Check, X, Upload } from 'lucide-react';
import { styles } from '../../../styles/MissionPrepStyles';
import type { Event, Cycle } from '../../../types/EventTypes';
import { processMissionCoordinates } from '../../../utils/coordinateUtils';
import { saveToLocalStorage, loadFromLocalStorage, STORAGE_KEYS } from '../../../utils/localStorageUtils';
import { fetchCycles } from '../../../utils/supabaseClient';
import JSZip from 'jszip';
import { load } from 'fengari-web';
import AircraftGroups from './AircraftGroups';
import { useAppSettings } from '../../../context/AppSettingsContext';
import { extractRedCoalitionUnitTypes } from '../../../utils/redUnitExtractor';

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
  onExtractedFlights?: (flights: any[]) => void;
  onStepTimeChange?: (stepTime: string) => void;
  mission?: any; // Mission object from database
  updateMissionData?: (updates: any) => Promise<any>; // Function to update mission in database
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
  updateMissionData
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

  // Filter events by selected cycle and sort by date (newest first)
  const filteredAndSortedEvents = [...events]
    .filter(event => !selectedCycle || event.cycleId === selectedCycle.id)
    .sort((a, b) => {
      const dateA = new Date(a.datetime).getTime();
      const dateB = new Date(b.datetime).getTime();

      // Handle invalid dates by putting them at the end
      if (isNaN(dateA) && isNaN(dateB)) return 0;
      if (isNaN(dateA)) return 1;
      if (isNaN(dateB)) return -1;

      return dateB - dateA;
    });

  // Auto-select most recent event when cycle changes or events load
  useEffect(() => {
    console.log('🔍 MissionDetails: Event selection effect triggered:', {
      hasCycle: !!selectedCycle,
      cycleId: selectedCycle?.id,
      cycleName: selectedCycle?.name,
      filteredEventsCount: filteredAndSortedEvents.length,
      hasSelectedEvent: !!selectedEvent,
      selectedEventCycleId: selectedEvent?.cycleId,
      eventsCount: events.length
    });

    if (selectedCycle && filteredAndSortedEvents.length > 0) {
      // If current selected event is not in the filtered list, select the most recent one
      if (!selectedEvent || selectedEvent.cycleId !== selectedCycle.id) {
        console.log('🎯 MissionDetails: Auto-selecting most recent event:', filteredAndSortedEvents[0]);
        onEventSelect(filteredAndSortedEvents[0]);
      }
    } else if (!selectedCycle && selectedEvent) {
      // If no cycle selected, clear event selection
      console.log('🎯 MissionDetails: Clearing event selection (no cycle selected)');
      onEventSelect(null);
    }
  }, [selectedCycle?.id, filteredAndSortedEvents.length, events.length]);

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
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [parsedMission, setParsedMission] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [json2Lua, setJson2Lua] = useState<string | null>(null);
  const [hasExtractedForCurrentFile, setHasExtractedForCurrentFile] = useState(false);

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
    options?: { label: string; value: string; data?: any }[]
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

    return (
      <div style={{ marginBottom: '16px' }}>
        <label style={{
          display: 'block',
          marginBottom: '8px',
          fontSize: '14px',
          fontWeight: 500,
          color: '#64748B'
        }}>
          {label}
        </label>
        {isEditing ? (
          type === 'textarea' ? (
            <textarea
              value={displayValue as string}
              onChange={(e) => handleDetailChange(field, e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #CBD5E1',
                borderRadius: '4px',
                fontSize: '14px',
                minHeight: '120px',
                resize: 'vertical',
                boxSizing: 'border-box'
              }}
              placeholder={`Enter ${label.toLowerCase()}`}
            />
          ) : type === 'select' && options ? (
            <select
              value={displayValue as string}
              onChange={(e) => handleDetailChange(field, e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #CBD5E1',
                borderRadius: '4px',
                fontSize: '14px',
                boxSizing: 'border-box'
              }}
            >
              <option value="">Select {label}</option>
              {options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              type={type}
              value={displayValue as string}
              onChange={handleDateTimeChange}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #CBD5E1',
                borderRadius: '4px',
                fontSize: '14px',
                boxSizing: 'border-box'
              }}
              placeholder={`Enter ${label.toLowerCase()}`}
            />
          )
        ) : (
          <div
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: '4px',
              fontSize: '14px',
              backgroundColor: '#F8FAFC',
              color: displayValue ? '#0F172A' : '#94A3B8',
              minHeight: type === 'textarea' ? '120px' : 'auto',
              display: 'flex',
              alignItems: 'center',
              boxSizing: 'border-box'
            }}
          >
            {displayValue || '—'}
          </div>
        )}
      </div>
    );
  };

  const renderMissionCommanderDropdown = () => {
    const candidates = getMissionCommanderCandidates();
    const selectedValue = missionCommander ? missionCommander.boardNumber : '';
    
    return (
      <div style={{ marginBottom: '16px' }}>
        <label style={{
          display: 'block',
          marginBottom: '8px',
          fontSize: '14px',
          fontWeight: 500,
          color: '#64748B'
        }}>
          Mission Commander
        </label>
        <select
          value={selectedValue}
          onChange={(e) => {
            const selectedBoardNumber = e.target.value;
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
          }}
          style={{
            width: '100%',
            padding: '8px 12px',
            border: '1px solid #CBD5E1',
            borderRadius: '4px',
            fontSize: '14px',
            boxSizing: 'border-box'
          }}
        >
          <option value="">No Mission Commander</option>
          {candidates.map((option) => (
            <option key={option.boardNumber} value={option.boardNumber}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    );
  };

  // Function to process the uploaded mission file
  const processMissionFile = async (file: File) => {
    setIsProcessingFile(true);
    console.log('🔄 MissionDetails: Starting .miz file processing for:', file.name);
    
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

        // Save extracted red unit types to database
        if (mission && updateMissionData && redUnitTypes.length > 0) {
          console.log('💾 MissionDetails: Saving red unit types to database...');
          try {
            await updateMissionData({
              miz_file_data: {
                ...mission.miz_file_data,
                red_coalition_units: redUnitTypes,
                processed_at: new Date().toISOString(),
                file_name: file.name
              }
            });
            console.log('✅ MissionDetails: Red unit types saved to database successfully');
          } catch (dbError) {
            console.error('❌ MissionDetails: Failed to save red unit types to database:', dbError);
            // Don't throw - this is a non-critical error, mission processing can continue
          }
        } else if (!mission) {
          console.warn('⚠️ MissionDetails: No mission available to save red unit types');
        } else if (!updateMissionData) {
          console.warn('⚠️ MissionDetails: No updateMissionData function available');
        } else if (redUnitTypes.length === 0) {
          console.warn('⚠️ MissionDetails: No red coalition units found in mission file');
        }

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
      setSelectedFile(file);
      setHasExtractedForCurrentFile(false); // Reset extraction flag for new file
      processMissionFile(file);
    } else {
      alert('Only .miz files are supported');
    }
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

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '20px',
      width,
      height: '100%'
    }}>
      {/* Mission Details Card */}
      <Card 
        style={{
          width: '100%',
          backgroundColor: '#FFFFFF',
          boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)',
          borderRadius: '8px',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          boxSizing: 'border-box',
          height: 'auto',
          overflow: 'visible'
        }}
      >
        <div style={{
          width: '100%',
          textAlign: 'center',
          marginBottom: '16px',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          position: 'relative'
        }}>
          <span style={styles.headerLabel}>Mission Details</span>
          {!isEditing ? (
            <button
              onClick={startEditing}
              style={{
                ...styles.editButton,
                position: 'absolute',
                right: 0,
                top: '50%',
                transform: 'translateY(-50%)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.15)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
              }}
            >
              <Edit2 size={16} />
            </button>
          ) : (
            <div style={{ 
              position: 'absolute',
              right: 0,
              top: '50%',
              transform: 'translateY(-50%)',
              display: 'flex',
              gap: '8px'
            }}>
              <button
                onClick={saveChanges}
                style={{
                  ...styles.editButton,
                  marginLeft: '8px',
                  zIndex: 1
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.15)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                }}
              >
                <Check size={16} color="#64748B" />
              </button>
              <button
                onClick={cancelEditing}
                style={{
                  ...styles.editButton,
                  marginLeft: '8px',
                  zIndex: 1
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.15)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                }}
              >
                <X size={16} color="#64748B" />
              </button>
            </div>
          )}
        </div>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px'
        }}>
          <div style={{ marginBottom: '0' }}>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontSize: '14px',
              fontWeight: 500,
              color: '#64748B'
            }}>
              Cycle
            </label>
            <select
              className="w-full"
              value={selectedCycle?.id || ''}
              onChange={(e) => {
                const cycle = cycles.find(c => c.id === e.target.value);
                setSelectedCycle(cycle || null);
              }}
              disabled={cyclesLoading}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #CBD5E1',
                borderRadius: '4px',
                fontSize: '14px',
                boxSizing: 'border-box',
                backgroundColor: cyclesLoading ? '#F8FAFC' : '#FFFFFF',
                cursor: cyclesLoading ? 'not-allowed' : 'pointer'
              }}
            >
              <option value="">Select a cycle</option>
              {cycles.map(cycle => (
                <option key={cycle.id} value={cycle.id}>
                  {cycle.name}
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: '0' }}>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontSize: '14px',
              fontWeight: 500,
              color: '#64748B'
            }}>
              Event
            </label>
            <select
              className="w-full"
              value={selectedEvent?.id || ''}
              onChange={(e) => {
                const event = filteredAndSortedEvents.find(evt => evt.id === e.target.value);
                onEventSelect(event || null);
              }}
              disabled={!selectedCycle || filteredAndSortedEvents.length === 0}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #CBD5E1',
                borderRadius: '4px',
                fontSize: '14px',
                boxSizing: 'border-box',
                backgroundColor: (!selectedCycle || filteredAndSortedEvents.length === 0) ? '#F8FAFC' : '#FFFFFF',
                cursor: (!selectedCycle || filteredAndSortedEvents.length === 0) ? 'not-allowed' : 'pointer'
              }}
            >
              <option value="">
                {!selectedCycle ? 'Select a cycle first' : filteredAndSortedEvents.length === 0 ? 'No events in this cycle' : 'Select an event'}
              </option>
              {filteredAndSortedEvents.map(event => {
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

                return (
                  <option key={event.id} value={event.id}>
                    {formattedDate} - {event.title}
                  </option>
                );
              })}
            </select>
          </div>

          <div style={{ marginBottom: '0' }}>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontSize: '14px',
              fontWeight: 500,
              color: '#64748B'
            }}>
              Mission Objective
            </label>
            <textarea 
              className="w-full" 
              placeholder="Enter mission objective"
              value={selectedEvent?.description || ''}
              readOnly
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #CBD5E1',
                borderRadius: '4px',
                fontSize: '14px',
                minHeight: '120px',
                resize: 'vertical',
                boxSizing: 'border-box',
                backgroundColor: '#F8FAFC'
              }}
            />
          </div>
          
          {renderDetailRow('Task Unit', 'taskUnit')}
          {renderDetailRow('Mother', 'mother')}
          {renderDetailRow('Mission Date/Time', 'missionDateTime', 'datetime-local')}
          {renderDetailRow('Step Time', 'stepTime', 'datetime-local')}
          {renderMissionCommanderDropdown()}
          {renderDetailRow('Bullseye Lat/Lon', 'bullseyeLatLon')}
          {renderDetailRow('Weather', 'weather', 'textarea')}
        </div>
      </Card>

      {/* Import Card */}
      <Card 
        style={{
          width: '100%',
          backgroundColor: '#FFFFFF',
          boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)',
          borderRadius: '8px',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          boxSizing: 'border-box',
          height: 'auto',
          overflow: 'visible'
        }}
      >
        <div style={{
          width: '100%',
          textAlign: 'center',
          marginBottom: '16px'
        }}>
          <span style={styles.headerLabel}>Import</span>
        </div>
        <div className="flex-1" style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '12px 20px'
        }}>
          {/* Hidden file input */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileInputChange}
            accept=".miz"
            style={{ display: 'none' }}
          />

          {/* File drop zone with dashed border */}
          <div
            style={{
              width: '100%',
              height: '60px',
              border: '1px dashed #CBD5E1',
              borderRadius: '4px',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              cursor: 'pointer',
              color: '#64748B',
              fontSize: '14px',
              textAlign: 'center',
              padding: '12px',
              transition: 'background-color 0.2s ease'
            }}
            onClick={handleDropZoneClick}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#F8FAFC';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            {isProcessingFile ? (
              <span>Processing mission file...</span>
            ) : selectedFile ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Upload size={16} />
                {selectedFile.name}
              </div>
            ) : (
              <span>Drag .miz file you wish to import here, or click to open file browser.</span>
            )}
          </div>
        </div>
      </Card>

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
                console.log('🎯 MissionDetails: Extracting flights for new file upload');
                setHasExtractedForCurrentFile(true);
                onExtractedFlights(flights);
              } else {
                console.log('⚠️ MissionDetails: Skipping extraction:', {
                  hasFile: !!selectedFile,
                  alreadyExtracted: hasExtractedForCurrentFile,
                  hasCallback: !!onExtractedFlights
                });
              }
            }}
            shouldExtractFlights={!!selectedFile}
          />
        </div>
      )}
    </div>
  );
};

export default MissionDetails;