// JavaScript implementation of coordinate conversion using Proj4js
import proj4 from 'proj4';

/**
 * DMS (Degrees Minutes Seconds) coordinate format
 */
export interface DMS {
  degrees: number;
  minutes: number;
  seconds: number;
  direction: string; // 'N', 'S', 'E', 'W'
}

/**
 * Complete coordinate with both decimal and DMS representations
 */
export interface LatLonCoordinate {
  lat_decimal: number;
  lon_decimal: number;
  lat_dms: DMS;
  lon_dms: DMS;
}

/**
 * TransverseMercator projection parameters for each DCS theatre
 */
class TransverseMercator {
  constructor(
    public centralMeridian: number,
    public falseEasting: number,
    public falseNorthing: number,
    public scaleFactor: number
  ) {}

  /**
   * Get proj4 projection string
   */
  toProj4String(): string {
    return `+proj=tmerc +lat_0=0 +lon_0=${this.centralMeridian} +k_0=${this.scaleFactor} +x_0=${this.falseEasting} +y_0=${this.falseNorthing}`;
  }
}

// DCS Theatre projection constants
const PROJECTION_DEFS = {
  PersianGulf: new TransverseMercator(57, 75755.99999999645, -2894933.0000000377, 0.9996),
  Falklands: new TransverseMercator(-57, 147639.99999997593, 5815417.000000032, 0.9996),
  Caucasus: new TransverseMercator(33, -99516.99999997323, -4998114.999999984, 0.9996),
  MarianaIslands: new TransverseMercator(147, 238417.99999989968, -1491840.000000048, 0.9996),
  Nevada: new TransverseMercator(-117, -193996.80999964548, -4410028.063999966, 0.9996),
  Normandy: new TransverseMercator(-3, -195526.00000000204, -5484812.999999951, 0.9996),
  Syria: new TransverseMercator(39, 282801.00000003993, -3879865.9999999935, 0.9996),
  SinaiMap: new TransverseMercator(33, 169221.9999999585, -3325312.9999999693, 0.9996)
};

/**
 * Get projection definition for a specific theatre
 */
function getProjectionForTheatre(theatre: string): string {
  const projection = PROJECTION_DEFS[theatre];
  if (!projection) {
    throw new Error(`TransverseMercator not known for ${theatre}`);
  }
  return projection.toProj4String();
}

/**
 * Convert decimal degrees to DMS (Degrees Minutes Seconds)
 */
export function decimalToDms(value: number, isLatitude: boolean): DMS {
  const absValue = Math.abs(value);
  const degrees = Math.floor(absValue);
  const minutesFloat = (absValue - degrees) * 60.0;
  const minutes = Math.floor(minutesFloat);
  const seconds = (minutesFloat - minutes) * 60.0;
  
  // Determine direction
  const direction = isLatitude
    ? (value >= 0.0 ? 'N' : 'S')
    : (value >= 0.0 ? 'E' : 'W');
  
  return {
    degrees,
    minutes,
    seconds,
    direction,
  };
}

/**
 * Convert DCS game x,y coordinates to latitude/longitude using the appropriate projection for the given theatre
 */
export function convertDcsToLatLon(
  x: number, 
  y: number, 
  theatre: string
): LatLonCoordinate {
  try {
    // Get projection definition for the theatre
    const projectionDef = getProjectionForTheatre(theatre);
    
    // Create projection
    const projection = proj4(projectionDef, 'EPSG:4326');
    
    // Convert coordinates (note the swap of x and y for proj4)
    const [lon, lat] = projection.forward([y, x]);
    
    // Create latitude/longitude object with both decimal and DMS formats
    return {
      lat_decimal: lat,
      lon_decimal: lon,
      lat_dms: decimalToDms(lat, true),
      lon_dms: decimalToDms(lon, false),
    };
  } catch (error) {
    console.error('Error converting DCS coordinates:', error);
    throw error;
  }
}

/**
 * Convert bullseye coordinates from a mission file
 */
export function convertBullseye(
  x: number, 
  y: number, 
  theatre: string
): LatLonCoordinate {
  return convertDcsToLatLon(x, y, theatre);
}

/**
 * Format DMS for display
 */
export function formatDMS(dms: DMS): string {
  return `${dms.degrees}°${dms.minutes.toString().padStart(2, '0')}'${dms.seconds.toFixed(3).padStart(6, '0')}"${dms.direction}`;
}

/**
 * Format a complete coordinate in DMS for display
 */
export function formatCoordinate(coordinate: LatLonCoordinate): string {
  return `${formatDMS(coordinate.lat_dms)} ${formatDMS(coordinate.lon_dms)}`;
}

/**
 * Extract theatre from mission file content
 */
export function extractTheatreFromMission(missionContent: string): string | null {
  const theatreMatch = missionContent.match(/\["theatre"\]\s*=\s*"([^"]+)"/);
  return theatreMatch ? theatreMatch[1] : null;
}

/**
 * Extract bullseye coordinates from mission file content for the blue coalition
 */
export function extractBlueBullseyeFromMission(missionContent: string): [number, number] | null {
  const bullseyeMatch = missionContent.match(/\["blue"\]\s*=\s*{[^}]*\["bullseye"\]\s*=\s*{[^}]*\["y"\]\s*=\s*([^,}]+)[^}]*\["x"\]\s*=\s*([^,}]+)/);
  
  if (bullseyeMatch) {
    const y = parseFloat(bullseyeMatch[1]);
    const x = parseFloat(bullseyeMatch[2]);
    return [x, y];
  }
  
  return null;
}

/**
 * Extract bullseye coordinates from mission file content for the red coalition
 */
export function extractRedBullseyeFromMission(missionContent: string): [number, number] | null {
  const bullseyeMatch = missionContent.match(/\["red"\]\s*=\s*{[^}]*\["bullseye"\]\s*=\s*{[^}]*\["y"\]\s*=\s*([^,}]+)[^}]*\["x"\]\s*=\s*([^,}]+)/);
  
  if (bullseyeMatch) {
    const y = parseFloat(bullseyeMatch[1]);
    const x = parseFloat(bullseyeMatch[2]);
    return [x, y];
  }
  
  return null;
}

/**
 * Process a DCS mission file and extract key coordinates in human-readable format
 */
export function processMissionCoordinates(missionContent: string): {
  theatre: string | null;
  blueBullseye: {
    dcsCoords: [number, number] | null;
    latLon: LatLonCoordinate | null;
    formatted: string | null;
  };
  redBullseye: {
    dcsCoords: [number, number] | null;
    latLon: LatLonCoordinate | null;
    formatted: string | null;
  };
} {
  const theatre = extractTheatreFromMission(missionContent);
  const blueBullseyeCoords = extractBlueBullseyeFromMission(missionContent);
  const redBullseyeCoords = extractRedBullseyeFromMission(missionContent);
  
  let blueBullseyeLatLon = null;
  let redBullseyeLatLon = null;
  
  if (theatre && blueBullseyeCoords) {
    try {
      blueBullseyeLatLon = convertBullseye(blueBullseyeCoords[0], blueBullseyeCoords[1], theatre);
    } catch (error) {
      console.error('Error converting blue bullseye coordinates:', error);
    }
  }
  
  if (theatre && redBullseyeCoords) {
    try {
      redBullseyeLatLon = convertBullseye(redBullseyeCoords[0], redBullseyeCoords[1], theatre);
    } catch (error) {
      console.error('Error converting red bullseye coordinates:', error);
    }
  }
  
  return {
    theatre,
    blueBullseye: {
      dcsCoords: blueBullseyeCoords,
      latLon: blueBullseyeLatLon,
      formatted: blueBullseyeLatLon ? formatCoordinate(blueBullseyeLatLon) : null
    },
    redBullseye: {
      dcsCoords: redBullseyeCoords,
      latLon: redBullseyeLatLon,
      formatted: redBullseyeLatLon ? formatCoordinate(redBullseyeLatLon) : null
    }
  };
}