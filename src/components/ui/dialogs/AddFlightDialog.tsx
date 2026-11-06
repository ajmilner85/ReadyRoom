import React, { useState, useEffect } from 'react';
import { Button, Dialog, Icon, IconButton, TextInput, legibleColor } from '../primitives';
import { tagBase } from '../primitives/color';

interface FlightEntry {
  callsign: string;
  quantity: number;
}

interface AddFlightDialogProps {
  onSave: (data: { flights: FlightEntry[] }) => void;
  onCancel: () => void;
  existingCallsigns: string[];
  initialCallsign?: string;
  title?: string;
  squadronCallsigns?: Array<{ squadronId: string; name: string; designation: string; insignia_url?: string | null; color_palette?: any; callsigns: string[] }>;
  selectedEvent?: any;
}

export const AddFlightDialog: React.FC<AddFlightDialogProps> = ({
  onSave,
  onCancel,
  existingCallsigns = [],
  squadronCallsigns = [],
  title,
}) => {
  const [squadronFlights, setSquadronFlights] = useState<Record<string, number>>({});
  const [otherCallsign, setOtherCallsign] = useState('');
  const [otherFlights, setOtherFlights] = useState<Record<string, number>>({});
  const [error, setError] = useState('');
  
  // Auto-clear error message after 3 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(''), 3000);
      return () => clearTimeout(timer);
    }
  }, [error]);


  // Use the pre-filtered participating squadrons directly from the cache
  const participatingSquadrons = squadronCallsigns;

  // Add squadron flight
  const addSquadronFlight = (callsign: string) => {
    const currentCount = (squadronFlights[callsign] || 0) + (otherFlights[callsign] || 0);
    const existingCount = existingCallsigns.filter(c => c === callsign).length;
    
    if (currentCount + existingCount >= 6) {
      setError(`Cannot create more than 6 flights with callsign ${callsign}`);
      return;
    }
    
    setSquadronFlights(prev => ({
      ...prev,
      [callsign]: (prev[callsign] || 0) + 1
    }));
    setError('');
  };

  // Add other flight
  const addOtherFlight = () => {
    if (!otherCallsign.trim()) return;
    
    const callsign = otherCallsign.trim().toUpperCase();
    const currentCount = (squadronFlights[callsign] || 0) + (otherFlights[callsign] || 0);
    const existingCount = existingCallsigns.filter(c => c === callsign).length;
    
    if (currentCount + existingCount >= 6) {
      setError(`Cannot create more than 6 flights with callsign ${callsign}`);
      return;
    }
    
    setOtherFlights(prev => ({
      ...prev,
      [callsign]: (prev[callsign] || 0) + 1
    }));
    // Keep the callsign in the field so user can quickly add another
    setError('');
  };

  // Get all flights to be added as pills
  const getAllFlights = () => {
    const flights: Array<{ callsign: string; number: number; source: 'squadron' | 'other' | 'existing' }> = [];
    
    // Add existing flights
    existingCallsigns.forEach(callsign => {
      const existingCount = flights.filter(f => f.callsign === callsign).length + 1;
      flights.push({ callsign, number: existingCount, source: 'existing' });
    });
    
    // Add squadron flights
    Object.entries(squadronFlights).forEach(([callsign, count]) => {
      const baseCount = flights.filter(f => f.callsign === callsign).length;
      for (let i = 0; i < count; i++) {
        flights.push({ callsign, number: baseCount + i + 1, source: 'squadron' });
      }
    });
    
    // Add other flights
    Object.entries(otherFlights).forEach(([callsign, count]) => {
      const baseCount = flights.filter(f => f.callsign === callsign).length;
      for (let i = 0; i < count; i++) {
        flights.push({ callsign, number: baseCount + i + 1, source: 'other' });
      }
    });
    
    return flights;
  };

  // Group flights by callsign for row display
  const getFlightRows = () => {
    const flights = getAllFlights();
    const grouped: Record<string, Array<{ callsign: string; number: number; source: 'squadron' | 'other' | 'existing' }>> = {};
    
    flights.forEach(flight => {
      if (!grouped[flight.callsign]) {
        grouped[flight.callsign] = [];
      }
      grouped[flight.callsign].push(flight);
    });
    
    return Object.entries(grouped).map(([callsign, flights]) => ({
      callsign,
      flights: flights.sort((a, b) => a.number - b.number)
    }));
  };

  // Remove last flight from a callsign group
  const removeLastFlight = (callsign: string) => {
    // First try to remove from other flights
    if (otherFlights[callsign] > 0) {
      setOtherFlights(prev => ({
        ...prev,
        [callsign]: prev[callsign] - 1
      }));
    } else if (squadronFlights[callsign] > 0) {
      setSquadronFlights(prev => ({
        ...prev,
        [callsign]: prev[callsign] - 1
      }));
    }
  };

  // Handle save
  const handleSave = () => {
    const allFlights: FlightEntry[] = [];
    
    Object.entries(squadronFlights).forEach(([callsign, count]) => {
      if (count > 0) {
        allFlights.push({ callsign, quantity: count });
      }
    });
    
    Object.entries(otherFlights).forEach(([callsign, count]) => {
      if (count > 0) {
        allFlights.push({ callsign, quantity: count });
      }
    });
    
    onSave({ flights: allFlights });
  };

  // Tag tint for a squadron colour: tinted fill, coloured border, legible text (same recipe as QualTag)
  const tint = (raw?: string | null) => {
    const base = raw ? tagBase(raw) : 'var(--rr-text3)';
    return {
      background: `color-mix(in srgb, ${base} 16%, transparent)`,
      border: `1px solid color-mix(in srgb, ${base} 55%, transparent)`,
      color: raw ? legibleColor(raw, 'var(--rr-text2)') : 'var(--rr-text2)',
    };
  };

  const flightRows = getFlightRows();
  const pendingCount = Object.values(squadronFlights).reduce((a, b) => a + b, 0) + Object.values(otherFlights).reduce((a, b) => a + b, 0);
  const pendingFor = (callsign: string) => (squadronFlights[callsign] || 0) + (otherFlights[callsign] || 0);
  const cols = Math.min(Math.max(participatingSquadrons.length, 1), 3);

  return (
    <Dialog
      open
      onClose={onCancel}
      title={title || 'Add Flights'}
      width={cols >= 3 ? 720 : 560}
      zIndex={1001}
      footer={
        <>
          {error ? <span className="mr-auto text-[12.5px] text-bad">{error}</span> : null}
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button variant="primary" icon="plus" onClick={handleSave} disabled={pendingCount === 0}>
            {pendingCount === 0 ? 'Add Flights' : `Add ${pendingCount} Flight${pendingCount === 1 ? '' : 's'}`}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-[18px]">
        {/* Participating squadrons: click a callsign to queue another flight */}
        {participatingSquadrons.length > 0 ? (
          <div>
            <div className="rr-label mb-2">Participating squadrons</div>
            <div className="grid gap-[10px]" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
              {participatingSquadrons.map((squadron) => (
                <div key={squadron.squadronId} className="rounded-rr-lg bg-panel2 border border-border p-3 flex flex-col gap-[10px]">
                  <div className="flex items-center gap-2 min-w-0">
                    {squadron.insignia_url
                      ? <img src={squadron.insignia_url} alt="" className="w-6 h-6 object-contain flex-none" />
                      : <span className="w-6 h-6 rounded-full flex-none" style={{ background: tagBase(squadron.color_palette?.primary || '#646F7E') }} />}
                    <div className="min-w-0 leading-tight">
                      <div className="text-[12.5px] font-bold truncate">{squadron.designation}</div>
                      <div className="text-[10.5px] text-text3 truncate">{squadron.name}</div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-[6px]">
                    {squadron.callsigns.map((callsign) => {
                      const n = pendingFor(callsign);
                      return (
                        <button
                          key={callsign}
                          type="button"
                          onClick={() => addSquadronFlight(callsign)}
                          title={`Add a ${callsign} flight`}
                          className="h-8 px-3 rounded-rr-md flex items-center gap-2 font-mono text-[12px] font-semibold tracking-[.04em] uppercase cursor-pointer transition-[filter,transform] duration-150 hover:brightness-125 active:scale-[.97]"
                          style={tint(squadron.color_palette?.primary)}
                        >
                          <span className="flex-1 text-left">{callsign}</span>
                          {n ? <span className="text-[10.5px] opacity-80">+{n}</span> : null}
                          <Icon name="plus" size={14} />
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Ad hoc callsign */}
        <div>
          <div className="rr-label mb-2">{participatingSquadrons.length > 0 ? 'Other callsign' : 'Callsign'}</div>
          <div className="flex items-center gap-2 max-w-[320px]">
            <TextInput
              mono
              placeholder="e.g. ENFIELD"
              value={otherCallsign}
              onChange={(e) => setOtherCallsign(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addOtherFlight()}
              className="uppercase"
            />
            <Button variant="secondary" icon="plus" onClick={addOtherFlight} disabled={!otherCallsign.trim()}>Add</Button>
          </div>
        </div>

        {/* Preview: existing flights (outlined) + queued flights (filled), one row per callsign */}
        <div>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="rr-label">Flights</span>
            <span className="text-[11px] text-text3">existing dimmed · new highlighted</span>
          </div>
          <div className="rounded-rr-lg bg-panel2 border border-border p-3 min-h-[88px]">
            {flightRows.length === 0 ? (
              <div className="h-[62px] flex items-center justify-center text-[12.5px] text-text3">No flights yet. Click a callsign above to add one.</div>
            ) : (
              <div className="flex flex-col gap-[6px]">
                {flightRows.map((row) => {
                  return (
                    <div key={row.callsign} className="flex items-center gap-[6px] flex-wrap">
                      {row.flights.map((flight) => {
                        const existing = flight.source === 'existing';
                        return (
                          <span
                            key={`${flight.callsign}-${flight.number}`}
                            className="inline-flex items-center h-6 px-[9px] rounded-[6px] font-mono text-[11px] font-semibold uppercase whitespace-nowrap"
                            // Neutral pills (a red squadron tint would read as the danger style): existing dim, new bright
                            style={existing
                              ? { background: 'var(--rr-panel3)', border: '1px solid transparent', color: 'var(--rr-text3)' }
                              : { background: 'var(--rr-panel3)', border: '1px solid var(--rr-border2)', color: 'var(--rr-text)' }}
                            title={existing ? 'Already on the board' : 'Will be added'}
                          >
                            {flight.callsign} {flight.number}
                          </span>
                        );
                      })}
                      {pendingFor(row.callsign) > 0 ? (
                        // Kit danger icon button: removing a queued flight is a destructive action
                        <IconButton icon="minus" variant="danger" size={24} iconSize={13} label={`Remove last ${row.callsign} flight`} onClick={() => removeLastFlight(row.callsign)} />
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </Dialog>
  );
};

export default AddFlightDialog;