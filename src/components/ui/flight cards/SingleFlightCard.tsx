import React from 'react';
import type { Flight } from '../../../types/FlightData';
import FlightCard from './FlightCard';

interface SingleFlightCardProps extends Flight {
  isDragging?: boolean;
  onUpdateMemberFuel?: (dashNumber: string, newFuel: number) => void;
  insigniaUrl?: string | null;
}

/**
 * Single-ship flights use the same Coordination strip as multi-ship flights (design D02.1);
 * the strip boxes its only aircraft as the low state.
 */
const SingleFlightCard: React.FC<SingleFlightCardProps> = (props) => {
  if (!props.members?.[0]) return null;
  return <FlightCard {...props} />;
};

export default SingleFlightCard;
