/**
 * Red coalition unit extraction utility for DCS mission files
 * Extracts unique unit types from red coalition forces for AAR pre-population
 */

/**
 * Extract unique red coalition unit types from parsed mission data
 * Scans all red coalition groups (planes, helicopters, ground units, ships) and returns
 * a deduplicated array of unit type names that can be matched against dcs_unit_types.type_name
 *
 * @param missionData Parsed mission data JSON from .miz file
 * @returns Array of unique unit type strings (matching dcs_unit_types.type_name)
 */
export function extractRedCoalitionUnitTypes(missionData: any): string[] {
  console.log('🔍 Extracting red coalition unit types from mission data');

  if (!missionData?.coalition?.red?.country) {
    console.warn('⚠️ No red coalition country data found in mission');
    return [];
  }

  // Use Set to automatically deduplicate unit types
  const unitTypes = new Set<string>();

  // Iterate through all countries in red coalition
  const countries = Array.isArray(missionData.coalition.red.country)
    ? missionData.coalition.red.country
    : Object.values(missionData.coalition.red.country);

  countries.forEach((country: any) => {
    console.log(`📍 Processing red country: ${country.name || 'Unknown'}`);

    // Process plane groups
    if (country.plane?.group) {
      const planeGroups = Array.isArray(country.plane.group)
        ? country.plane.group
        : Object.values(country.plane.group);

      planeGroups.forEach((group: any) => {
        if (group.units && Array.isArray(group.units)) {
          group.units.forEach((unit: any) => {
            if (unit.type) {
              unitTypes.add(unit.type);
              console.log(`  ✈️  Added plane type: ${unit.type}`);
            }
          });
        }
      });
    }

    // Process helicopter groups
    if (country.helicopter?.group) {
      const heliGroups = Array.isArray(country.helicopter.group)
        ? country.helicopter.group
        : Object.values(country.helicopter.group);

      heliGroups.forEach((group: any) => {
        if (group.units && Array.isArray(group.units)) {
          group.units.forEach((unit: any) => {
            if (unit.type) {
              unitTypes.add(unit.type);
              console.log(`  🚁 Added helicopter type: ${unit.type}`);
            }
          });
        }
      });
    }

    // Process vehicle/ground unit groups
    if (country.vehicle?.group) {
      const vehicleGroups = Array.isArray(country.vehicle.group)
        ? country.vehicle.group
        : Object.values(country.vehicle.group);

      vehicleGroups.forEach((group: any) => {
        if (group.units && Array.isArray(group.units)) {
          group.units.forEach((unit: any) => {
            if (unit.type) {
              unitTypes.add(unit.type);
              console.log(`  🚗 Added ground unit type: ${unit.type}`);
            }
          });
        }
      });
    }

    // Process ship groups
    if (country.ship?.group) {
      const shipGroups = Array.isArray(country.ship.group)
        ? country.ship.group
        : Object.values(country.ship.group);

      shipGroups.forEach((group: any) => {
        if (group.units && Array.isArray(group.units)) {
          group.units.forEach((unit: any) => {
            if (unit.type) {
              unitTypes.add(unit.type);
              console.log(`  🚢 Added ship type: ${unit.type}`);
            }
          });
        }
      });
    }

    // Process static objects (structures, etc.)
    if (country.static?.group) {
      const staticGroups = Array.isArray(country.static.group)
        ? country.static.group
        : Object.values(country.static.group);

      staticGroups.forEach((group: any) => {
        if (group.units && Array.isArray(group.units)) {
          group.units.forEach((unit: any) => {
            if (unit.type) {
              unitTypes.add(unit.type);
              console.log(`  🏭 Added static/structure type: ${unit.type}`);
            }
          });
        }
      });
    }
  });

  const uniqueTypes = Array.from(unitTypes);
  console.log(`✅ Extracted ${uniqueTypes.length} unique red coalition unit types`);
  console.log('📋 Unit types:', uniqueTypes);

  return uniqueTypes;
}

/**
 * Extract detailed red coalition unit information including counts
 * Useful for debugging or advanced features
 *
 * @param missionData Parsed mission data JSON from .miz file
 * @returns Object mapping unit types to their occurrence count
 */
export function extractRedCoalitionUnitCounts(missionData: any): Record<string, number> {
  console.log('🔍 Extracting red coalition unit counts from mission data');

  if (!missionData?.coalition?.red?.country) {
    console.warn('⚠️ No red coalition country data found in mission');
    return {};
  }

  const unitCounts: Record<string, number> = {};

  const countries = Array.isArray(missionData.coalition.red.country)
    ? missionData.coalition.red.country
    : Object.values(missionData.coalition.red.country);

  countries.forEach((country: any) => {
    const processUnits = (groups: any[]) => {
      groups.forEach((group: any) => {
        if (group.units && Array.isArray(group.units)) {
          group.units.forEach((unit: any) => {
            if (unit.type) {
              unitCounts[unit.type] = (unitCounts[unit.type] || 0) + 1;
            }
          });
        }
      });
    };

    // Process all unit categories
    if (country.plane?.group) {
      const groups = Array.isArray(country.plane.group) ? country.plane.group : Object.values(country.plane.group);
      processUnits(groups);
    }
    if (country.helicopter?.group) {
      const groups = Array.isArray(country.helicopter.group) ? country.helicopter.group : Object.values(country.helicopter.group);
      processUnits(groups);
    }
    if (country.vehicle?.group) {
      const groups = Array.isArray(country.vehicle.group) ? country.vehicle.group : Object.values(country.vehicle.group);
      processUnits(groups);
    }
    if (country.ship?.group) {
      const groups = Array.isArray(country.ship.group) ? country.ship.group : Object.values(country.ship.group);
      processUnits(groups);
    }
    if (country.static?.group) {
      const groups = Array.isArray(country.static.group) ? country.static.group : Object.values(country.static.group);
      processUnits(groups);
    }
  });

  console.log('📊 Unit counts:', unitCounts);
  return unitCounts;
}
