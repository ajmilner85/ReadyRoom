import { Position } from '../types/FlightData';

// Format bearing/distance for display
export const formatPosition = (pos?: Position) => {
  if (!pos) return '';
  return `${pos.bearing}/${pos.distance}`;
};

// Format altitude for display (e.g., "12.5" -> "12,500'")
export const formatAltitude = (altitude: string) => {
  const altNum = parseFloat(altitude);
  if (isNaN(altNum)) return '';
  
  // Handle whole numbers vs decimals
  if (Number.isInteger(altNum)) {
    return `${altNum},000'`;
  } else {
    const [whole, decimal] = altitude.split('.');
    return `${whole},${decimal}00'`;
  }
};