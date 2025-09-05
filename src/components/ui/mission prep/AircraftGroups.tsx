import React, { useEffect } from 'react';
import { Card } from '../card';
import { styles } from '../../../styles/MissionPrepStyles';

type Unit = {
  name: string;
  type: string;
  onboard_num: string;
  callsign?: { [key: number]: string | number } | string;
  fuel: number;
  payload?: {
    pylons?: Record<string, { CLSID: string }> | Array<{ CLSID: string }>;
  };
};

interface AircraftGroup {
  name: string;
  units: Unit[];
}

interface AircraftGroupsProps {
  missionData: any;
  width: string;
  aircraftType?: string;
  onExtractedFlights?: (flights: AircraftGroup[]) => void;
}

// Add interface for group structure from mission file
interface MissionGroup {
  name: string;
  units: Unit | Unit[];
}

const AircraftGroups: React.FC<AircraftGroupsProps> = ({ 
  missionData, 
  width, 
  aircraftType,
  onExtractedFlights
}) => {
  // Function to calculate total fuel including external tanks
  const calculateTotalFuel = (unit: Unit): number => {
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

  // Function to get formatted name/callsign
  const getFormattedName = (unit: Unit, groupName: string, unitIndex: number): string => {
    if (!unit.callsign) return unit.name || `${groupName}-${unitIndex + 1}`;
    
    try {
      if (typeof unit.callsign === 'object') {
        // Western aircraft format: Callsign Flight-Number
        if (unit.callsign[1] !== undefined && 
            unit.callsign[2] !== undefined && 
            unit.callsign[3] !== undefined) {
          return `${getCallsignName(unit.callsign[1] as number)} ${unit.callsign[2]}-${unit.callsign[3]}`;
        }
      } else if (typeof unit.callsign === 'string') {
        return unit.callsign;
      }
    } catch (error) {
      console.error('Error formatting name:', error);
    }
    
    return unit.name || `${groupName}-${unitIndex + 1}`;
  };

  // Get aircraft groups from mission data
  const getAircraftGroups = (): AircraftGroup[] => {
    console.log('AircraftGroups: Processing mission data for aircraft type:', aircraftType);
    
    if (!missionData?.coalition?.blue?.country) {
      console.log('AircraftGroups: No blue coalition country data found');
      return [];
    }

    const groups: AircraftGroup[] = [];
    
    // Iterate through all countries in blue coalition
    // Handle both array and object formats
    const countries = Array.isArray(missionData.coalition.blue.country) 
      ? missionData.coalition.blue.country 
      : Object.values(missionData.coalition.blue.country);
    
    countries.forEach((country: any, countryIndex: number) => {
      console.log(`AircraftGroups: Processing country ${countryIndex}:`, country.name || 'Unknown');
      
      // Process both plane and helicopter groups
      const categories = ['plane', 'helicopter'] as const;
      categories.forEach((category) => {
        if (!country[category]?.group) {
          console.log(`AircraftGroups: No ${category} groups found in country`);
          return;
        }
        
        console.log(`AircraftGroups: Found ${category} groups in country`);
        
        const countryGroups = (Array.isArray(country[category].group) 
          ? country[category].group
          : [country[category].group]
        ).filter((group: MissionGroup) => {
          if (!group.units) return false;
          const units = Array.isArray(group.units) ? group.units : [group.units];
          
          if (aircraftType) {
            const hasMatchingType = units.some((unit: Unit) => {
              console.log(`AircraftGroups: Checking unit type '${unit.type}' against '${aircraftType}'`);
              return unit.type === aircraftType;
            });
            console.log(`AircraftGroups: Group '${group.name}' has matching aircraft type:`, hasMatchingType);
            return hasMatchingType;
          }
          return true;
        }).map((group: MissionGroup): AircraftGroup => ({
          ...group,
          name: group.name.replace('-', ' '),
          units: Array.isArray(group.units) ? group.units : [group.units]
        }));
        
        console.log(`AircraftGroups: Adding ${countryGroups.length} ${category} groups`);
        groups.push(...countryGroups);
      });
    });

    console.log(`AircraftGroups: Total groups found: ${groups.length}`);
    return groups;
  };

  const filteredGroups = getAircraftGroups();

  // Call onExtractedFlights when groups are available
  useEffect(() => {
    console.log('🔍 AircraftGroups: useEffect triggered:', {
      hasCallback: !!onExtractedFlights,
      aircraftType,
      groupsLength: filteredGroups.length,
      groups: filteredGroups.map(g => ({ name: g.name, units: g.units.length }))
    });
    
    if (onExtractedFlights && aircraftType === 'FA-18C_hornet' && filteredGroups.length > 0) {
      console.log('✈️ AircraftGroups: Calling onExtractedFlights with', filteredGroups.length, 'F/A-18C groups');
      console.log('✈️ AircraftGroups: Group details:', filteredGroups.map(g => ({
        name: g.name,
        unitCount: g.units.length,
        unitTypes: g.units.map(u => u.type)
      })));
      onExtractedFlights(filteredGroups);
    } else {
      console.log('⚠️ AircraftGroups: Not calling onExtractedFlights because:', {
        noCallback: !onExtractedFlights,
        wrongAircraftType: aircraftType !== 'FA-18C_hornet',
        noGroups: filteredGroups.length === 0
      });
    }
  }, [filteredGroups, onExtractedFlights, aircraftType]);

  // No groups found - either return null or a message
  if (filteredGroups.length === 0) {
    if (aircraftType) {
      return null;
    }
    
    return (
      <Card 
        style={{
          width: width,
          backgroundColor: '#FFFFFF',
          boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)',
          borderRadius: '8px',
          padding: '24px',
          marginBottom: '20px',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative'
        }}
      >
        <div style={{
          width: '100%',
          textAlign: 'center',
          marginBottom: '16px'
        }}>
          <span style={styles.headerLabel}>Aircraft Groups</span>
        </div>
        <div style={{ padding: '16px', textAlign: 'center', color: '#64748B' }}>
          No aircraft groups found in mission data.
        </div>
      </Card>
    );
  }

  // Determine card title based on aircraft type
  const cardTitle = aircraftType ? 
    aircraftType === 'FA-18C_hornet' ? 'F/A-18C Groups' :
    aircraftType === 'F-16C_50' ? 'F-16C Groups' :
    aircraftType.startsWith('F-14') ? 'F-14 Groups' :
    `${aircraftType} Groups` :
    'Aircraft Groups';
  
  return (
    <Card 
      style={{
        width: width,
        backgroundColor: '#FFFFFF',
        boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)',
        borderRadius: '8px',
        padding: '24px',
        marginBottom: '20px',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative'
      }}
    >
      <div style={{
        width: '100%',
        textAlign: 'center',
        marginBottom: '16px'
      }}>
        <span style={styles.headerLabel}>{cardTitle}</span>
      </div>
      <div style={{ overflowY: 'auto', maxHeight: '400px' }}>
        {filteredGroups.map((group, groupIndex) => {
          const validUnits = group.units.filter((unit: Unit) => {
            if (!aircraftType) return true;
            return unit.type === aircraftType;
          });
          
          if (validUnits.length === 0) return null;

          return (
            <div 
              key={`group-${groupIndex}`}
              style={{
                marginBottom: '16px',
                padding: '16px',
                borderRadius: '4px',
                backgroundColor: '#F8FAFC',
                border: '1px solid #E2E8F0'
              }}
            >
              <h3 style={{
                margin: '0 0 12px 0',
                fontSize: '16px',
                fontWeight: 600,
                color: '#334155'
              }}>{group.name}</h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {validUnits.map((unit: Unit, unitIndex: number) => {
                  const formattedName = getFormattedName(unit, group.name, unitIndex);
                  const totalFuel = calculateTotalFuel(unit);
                  
                  return (
                    <div 
                      key={unit.name} 
                      style={{
                        padding: '8px',
                        borderRadius: '4px',
                        backgroundColor: '#FFFFFF',
                        border: '1px solid #E2E8F0',
                        display: 'flex',
                        gap: '16px',
                        alignItems: 'center',
                        fontSize: '14px'
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>{formattedName}</span>
                      <span style={{ color: '#64748B' }}>{unit.onboard_num || 'N/A'}</span>
                      <span style={{ color: '#64748B' }}>{totalFuel.toLocaleString()} lbs</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
};

// Function to get callsign name from index
const getCallsignName = (index: number): string => {
  const callsignNames = [
    'Enfield', 'Springfield', 'Uzi', 'Colt', 'Dodge', 'Ford', 'Chevy',
    'Pontiac', 'Hawk', 'Eagle', 'Falcon', 'Vampire'
  ];
  
  return index <= callsignNames.length ? callsignNames[index - 1] : `Callsign ${index}`;
};

export default AircraftGroups;