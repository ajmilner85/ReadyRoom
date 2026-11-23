/** A CATCC flight strip: FlightCard from the formation (strips.ts), with the AI aircraft mark after the callsign. */
import React from 'react';
import FlightCard from '../ui/flight cards/FlightCard';
import { IcRobot } from './icons.tsx';
import type { Formation } from './scopeModel.ts';
import { flightOf } from './strips.ts';
import { isAiFlight } from './stripFilter.ts';

export const AiMark: React.FC = () => (
  <span role="img" aria-label="AI" title="AI" style={{ display: 'inline-flex', color: '#6B7683' }}>
    <IcRobot />
  </span>
);

export const StripCard: React.FC<{ f: Formation; corner?: React.ReactNode }> = ({ f, corner }) => (
  <FlightCard {...flightOf(f)} badge={isAiFlight(f) ? <AiMark /> : undefined} corner={corner} />
);
