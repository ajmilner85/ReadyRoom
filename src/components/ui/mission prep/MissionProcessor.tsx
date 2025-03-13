import { useState, useCallback } from 'react';
import JSZip from 'jszip';
import { load } from 'fengari-web';
import { extractAircraftGroups, AircraftGroup } from '../../../utils/aircraftExtractor';

interface MissionProcessorProps {
  onMissionProcessed?: (groups: AircraftGroup[]) => void;
}

export function MissionProcessor({ onMissionProcessed }: MissionProcessorProps) {
  const [status, setStatus] = useState<string>('');

  const processMissionFile = useCallback(async (missionContent: string) => {
    try {
      console.log('Processing mission file content, size:', missionContent.length);
      
      // Load the json2 module
      const response = await fetch('/json2.lua');
      const json2lua = await response.text();
      console.log('json2.lua loaded successfully');
      
      // Load and run json2.lua to define the json module
      load(json2lua)();
      console.log('json2.lua executed');
      
      // Create and execute the Lua code to process the mission
      const luaCode = `
        local function debug_print(msg)
          print("[DEBUG] " .. tostring(msg))
        end
        debug_print("Starting Lua code execution")
        
        -- Create an environment to safely execute the mission code
        local env = {}
        debug_print("Created sandbox environment")
        
        -- Load the mission content
        local missionCode = ${JSON.stringify(missionContent)}
        debug_print("Mission content length: " .. #missionCode)
        debug_print("Mission content starts with: " .. string.sub(missionCode, 1, 100))
        
        -- Create a function that will execute in our environment
        local fn, err = load(missionCode, "mission", "t", env)
        if not fn then
          error("Failed to load mission code: " .. tostring(err))
        end
        
        -- Execute the code in our environment
        local status, result = pcall(fn)
        if not status then
          error("Failed to execute mission code: " .. tostring(result))
        end
        debug_print("Mission code executed successfully")
        
        -- The mission table should now be in our environment
        local missionTable = env.mission
        debug_print("Type of mission data: " .. type(missionTable))
        
        -- Verify we got a table
        if type(missionTable) ~= "table" then
          error("Mission did not return a table, got: " .. type(missionTable))
        end
        
        -- Now try to convert to JSON
        debug_print("Starting JSON conversion")
        local jsonStatus, jsonResult = pcall(function()
          return json.encode(missionTable)
        end)
        
        if not jsonStatus then
          error("JSON conversion failed: " .. tostring(jsonResult))
        end
        
        if not jsonResult then
          error("JSON encoding returned nil")
        end
        
        debug_print("JSON conversion successful")
        debug_print("JSON length: " .. #jsonResult)
        
        return jsonResult
      `;
      
      console.log('Executing Lua conversion code...');
      
      try {
        const jsonResult = load(luaCode)();
        console.log('Lua code executed successfully');
        
        if (typeof jsonResult !== 'string') {
          console.error('Invalid result type:', typeof jsonResult);
          throw new Error('Invalid JSON result from Lua conversion');
        }
        
        if (!jsonResult || jsonResult === 'null') {
          throw new Error('JSON conversion resulted in null or empty output');
        }
        
        console.log('JSON result length:', jsonResult.length);
        
        // Parse the JSON
        const parsedMission = JSON.parse(jsonResult);
        
        // Extract aircraft groups
        const aircraftGroups = extractAircraftGroups(parsedMission);
        console.log('Extracted aircraft groups:', aircraftGroups.length);
        
        // Call the callback function if provided
        if (onMissionProcessed) {
          onMissionProcessed(aircraftGroups);
        }
        
        setStatus('Mission processed successfully');
        return aircraftGroups;
      } catch (luaError) {
        console.error('Lua execution error:', luaError);
        setStatus(`Error: Lua execution failed - ${luaError}`);
        throw new Error('Failed to execute Lua code: ' + luaError);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error('Process failed:', error);
      setStatus(`Error: ${errorMessage}`);
      throw error;
    }
  }, [onMissionProcessed]);

  const processMizFile = useCallback(async (file: File) => {
    try {
      setStatus('Processing .miz file...');
      console.log('Starting .miz file processing...');
      
      // Load and process the .miz file
      const zip = new JSZip();
      const zipContents = await zip.loadAsync(file);
      console.log('ZIP file loaded successfully');
      
      // Find and extract the mission file
      const missionFile = zipContents.file('mission');
      if (!missionFile) {
        console.error('Mission file not found in ZIP');
        setStatus('Error: No mission file found in the .miz archive');
        throw new Error('No mission file found in the .miz archive');
      }
      
      console.log('Mission file found in ZIP');
      
      // Get mission file content as string
      const missionContent = await missionFile.async('string');
      console.log('Mission content loaded, size:', missionContent.length);
      
      // Process the mission file content
      return await processMissionFile(missionContent);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error('Process failed:', error);
      setStatus(`Error: ${errorMessage}`);
      throw error;
    }
  }, [processMissionFile]);

  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    if (!file.name.endsWith('.miz')) {
      setStatus('Please select a .miz file');
      return;
    }
    
    processMizFile(file)
      .then(() => {
        console.log('Mission processing completed successfully');
      })
      .catch(error => {
        console.error('Mission processing failed:', error);
      });
  }, [processMizFile]);

  return (
    <div className="mission-processor">
      <input
        type="file"
        accept=".miz"
        onChange={handleFileUpload}
        id="mission-file-input"
        className="hidden"
      />
      <label
        htmlFor="mission-file-input"
        className="cursor-pointer bg-blue-500 hover:bg-blue-700 text-white py-2 px-4 rounded"
      >
        Import Mission
      </label>
      {status && <p className="mt-2 text-sm text-gray-600">{status}</p>}
    </div>
  );
}