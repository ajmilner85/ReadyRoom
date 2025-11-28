/**
 * Lua Parser Utility
 * Parses DCS unit_dump.lua file format into TypeScript objects
 */

export interface DCSUnitType {
  type_name: string;
  display_name: string;
  category: 'AIRPLANE' | 'HELICOPTER' | 'GROUND_UNIT' | 'SHIP' | 'STRUCTURE' | 'HELIPORT' | 'CARGO' | 'UNKNOWN';
  sub_category?: string;
  kill_category: 'A2A' | 'A2G' | 'A2S';
  is_active: boolean;
}

/**
 * Parses a Lua unit dump file and extracts unit information
 * Expected format:
 * return {
 *   { typeName = "F-16C_50", displayName = "F-16C", category = "AIRPLANE", subCategory = "Fighter" },
 *   ...
 * }
 */
export function parseLuaUnitDump(luaContent: string): DCSUnitType[] {
  const units: DCSUnitType[] = [];

  try {
    // Remove comments (-- style)
    let cleaned = luaContent.replace(/--[^\n]*/g, '');

    // Extract the table content between `return {` and final `}`
    const tableMatch = cleaned.match(/return\s*\{([\s\S]*)\}/);
    if (!tableMatch) {
      throw new Error('Could not find return table in Lua file');
    }

    const tableContent = tableMatch[1];

    // Regex to match each unit entry
    // Matches: { typeName = "value", displayName = "value", category = "value", subCategory = "value", }
    // Flexible to handle with or without subCategory field, and with optional trailing comma
    // Updated to handle escaped quotes (\\") within strings
    const unitRegex = /\{\s*typeName\s*=\s*"((?:[^"\\]|\\.)*)"\s*,\s*displayName\s*=\s*"((?:[^"\\]|\\.)*)"\s*,\s*category\s*=\s*"((?:[^"\\]|\\.*)*)"(?:\s*,\s*subCategory\s*=\s*"(?:[^"\\]|\\.)*")?\s*,?\s*\}/g;

    // Regex to capture subCategory if present
    // The [\s\S]*? allows matching any character including newlines between subCategory and closing brace
    // Updated to handle escaped quotes (\\") within strings
    const unitWithSubCategoryRegex = /\{\s*typeName\s*=\s*"((?:[^"\\]|\\.)*)"\s*,\s*displayName\s*=\s*"((?:[^"\\]|\\.)*)"\s*,\s*category\s*=\s*"((?:[^"\\]|\\.)*)"\s*,\s*subCategory\s*=\s*"((?:[^"\\]|\\.)*)"[\s\S]*?\}/g;

    let match;

    // Helper function to unescape Lua strings (remove backslash escapes)
    const unescapeLuaString = (str: string): string => {
      return str.replace(/\\(.)/g, '$1'); // Replace \X with X for any character
    };

    // First pass: try to match units with subCategory
    tableContent.replace(unitWithSubCategoryRegex, (fullMatch, typeName, displayName, category, subCategory) => {
      // Validate category
      if (!['AIRPLANE', 'HELICOPTER', 'GROUND_UNIT', 'SHIP', 'STRUCTURE', 'HELIPORT', 'CARGO', 'UNKNOWN'].includes(category)) {
        console.warn(`Unknown category "${category}" for unit ${typeName}, skipping`);
        return fullMatch;
      }

      // Map DCS category to kill category
      const kill_category = mapCategoryToKillCategory(category);

      units.push({
        type_name: typeName, // Keep exact for .miz file matching
        display_name: unescapeLuaString(displayName), // Clean for display
        category: category as DCSUnitType['category'],
        sub_category: subCategory || undefined,
        kill_category,
        is_active: true
      });

      return fullMatch;
    });

    // Second pass: match units without subCategory (use the original regex)
    while ((match = unitRegex.exec(tableContent)) !== null) {
      const [, typeName, displayName, category] = match;

      // Skip if already processed (has subCategory)
      if (units.some(u => u.type_name === typeName)) {
        continue;
      }

      // Validate category
      if (!['AIRPLANE', 'HELICOPTER', 'GROUND_UNIT', 'SHIP', 'STRUCTURE', 'HELIPORT', 'CARGO', 'UNKNOWN'].includes(category)) {
        console.warn(`Unknown category "${category}" for unit ${typeName}, skipping`);
        continue;
      }

      // Map DCS category to kill category
      const kill_category = mapCategoryToKillCategory(category);

      units.push({
        type_name: typeName, // Keep exact for .miz file matching
        display_name: unescapeLuaString(displayName), // Clean for display
        category: category as DCSUnitType['category'],
        kill_category,
        is_active: true
      });
    }

    if (units.length === 0) {
      throw new Error('No units found in Lua file. Please check the file format.');
    }

    console.log(`Parsed ${units.length} units from Lua file`);
    return units;
  } catch (err) {
    console.error('Error parsing Lua file:', err);
    throw err;
  }
}

/**
 * Maps DCS unit category to kill tracking category
 */
function mapCategoryToKillCategory(category: string): 'A2A' | 'A2G' | 'A2S' {
  switch (category) {
    case 'AIRPLANE':
    case 'HELICOPTER':
      return 'A2A';
    case 'SHIP':
      return 'A2S';
    case 'GROUND_UNIT':
    case 'STRUCTURE':
    case 'HELIPORT':
    case 'CARGO':
    case 'UNKNOWN':
    default:
      return 'A2G';
  }
}

/**
 * Validates a parsed unit type
 */
export function validateUnitType(unit: Partial<DCSUnitType>): unit is DCSUnitType {
  return (
    typeof unit.type_name === 'string' &&
    unit.type_name.length > 0 &&
    typeof unit.display_name === 'string' &&
    unit.display_name.length > 0 &&
    ['AIRPLANE', 'HELICOPTER', 'GROUND_UNIT', 'SHIP', 'STRUCTURE', 'HELIPORT', 'CARGO', 'UNKNOWN'].includes(unit.category || '') &&
    ['A2A', 'A2G', 'A2S'].includes(unit.kill_category || '') &&
    typeof unit.is_active === 'boolean'
  );
}

/**
 * Formats Lua parsing errors for user display
 */
export function formatLuaParseError(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.includes('Could not find return table')) {
      return 'Invalid Lua file format. Expected a table starting with "return {"';
    }
    if (error.message.includes('No units found')) {
      return 'No units found in file. Please verify this is a valid unit_dump.lua file.';
    }
    return error.message;
  }
  return 'Unknown error occurred while parsing Lua file';
}
