import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Card } from '../card';
import FlightAssignmentCard from '../flight cards/FlightAssignmentCard';
import AddFlightDialog from '../dialogs/AddFlightDialog';
import type { Pilot } from '../../../types/PilotTypes';

interface Flight {
  id: string;
  callsign: string;
  flightNumber: string;
  pilots: Array<{
    boardNumber: string;
    callsign: string;
    dashNumber: string;
  }>;
  midsA?: string;
  midsB?: string;
  creationOrder: number; // Track the creation order
}

// Extended Pilot type with dashNumber for flight assignments
interface AssignedPilot extends Pilot {
  dashNumber: string;
}

// Add mission commander interface
interface MissionCommanderInfo {
  boardNumber: string;
  callsign: string;
  flightId: string;
  flightCallsign: string;
  flightNumber: string;
}

interface ExtractedFlight {
  name: string;
  units: {
    name: string;
    type: string;
    onboard_num: string;
    callsign?: { [key: number]: string | number } | string;
    fuel: number;
  }[];
}

interface FlightAssignmentsProps {
  width: string;
  assignedPilots?: Record<string, AssignedPilot[]> | null;
  missionCommander?: MissionCommanderInfo | null;
  extractedFlights?: ExtractedFlight[];
  onFlightsChange?: (flights: Flight[]) => void;
  initialFlights?: Flight[];
}

const FlightAssignments: React.FC<FlightAssignmentsProps> = ({ 
  width, 
  assignedPilots = {},
  missionCommander,
  extractedFlights = [],
  onFlightsChange,
  initialFlights = []
}) => {
  const [flights, setFlights] = useState<Flight[]>(initialFlights);
  const [showAddFlightDialog, setShowAddFlightDialog] = useState(false);
  const [editFlightId, setEditFlightId] = useState<string | null>(null);
  const [initialEditCallsign, setInitialEditCallsign] = useState("");
  const [creationOrderCounter, setCreationOrderCounter] = useState(0);
  
  // Use a ref to track which extracted flights we've already processed
  const processedFlightTimestamps = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);

  // Initialize flights from initialFlights when first mounted
  useEffect(() => {
    if (!initializedRef.current && initialFlights.length > 0) {
      setFlights(initialFlights);
      
      // Calculate the highest creation order for future additions
      const maxCreationOrder = Math.max(...initialFlights.map(f => f.creationOrder), -1);
      setCreationOrderCounter(maxCreationOrder + 1);
      
      initializedRef.current = true;
    }
  }, [initialFlights]);

  // Notify parent component when flights change
  useEffect(() => {
    if (onFlightsChange) {
      onFlightsChange(flights);
    }
  }, [flights, onFlightsChange]);

  // Parse a group name into callsign and flight number
  const parseGroupName = (name: string): { callsign: string; flightNumber: string } => {
    // Split on last space to handle callsigns with spaces
    const lastSpaceIndex = name.lastIndexOf(' ');
    if (lastSpaceIndex === -1) {
      return { callsign: name, flightNumber: "1" };
    }
    
    const callsign = name.substring(0, lastSpaceIndex);
    const flightNumber = name.substring(lastSpaceIndex + 1);
    
    // Validate that flight number is actually a number
    if (!/^\d+$/.test(flightNumber)) {
      return { callsign: name, flightNumber: "1" };
    }
    
    return { callsign, flightNumber };
  };

  // Effect to create flight cards from extracted flights
  useEffect(() => {
    if (!extractedFlights.length) return;

    // Create a unique timestamp for this batch of flights
    const batchTimestamp = Date.now().toString();
    
    // If we've already processed a batch with the same size recently, skip it to prevent duplicates
    if (processedFlightTimestamps.current.size > 0 && 
        processedFlightTimestamps.current.size === extractedFlights.length) {
      return;
    }
    
    // Add this batch to our processed set
    processedFlightTimestamps.current.add(batchTimestamp);
    
    // Convert extracted flights to our Flight format while preserving existing flights
    setFlights(prevFlights => {
      // Check if we already have extracted flights (with IDs starting with "extracted-")
      const hasExistingExtracted = prevFlights.some(flight => flight.id.startsWith('extracted-'));
      
      // If we already have extracted flights, don't add more
      if (hasExistingExtracted) {
        return prevFlights;
      }
      
      const existingFlights = prevFlights;
      const maxCreationOrder = Math.max(...existingFlights.map(f => f.creationOrder), -1);
      
      const newFlights = extractedFlights.map((extractedFlight, index) => {
        const { callsign, flightNumber } = parseGroupName(extractedFlight.name);
        return {
          id: `extracted-${batchTimestamp}-${index}`, // Make IDs unique with timestamp
          callsign: callsign.toUpperCase(),
          flightNumber,
          pilots: [
            { boardNumber: "", callsign: "", dashNumber: "1" },
            { boardNumber: "", callsign: "", dashNumber: "2" },
            { boardNumber: "", callsign: "", dashNumber: "3" },
            { boardNumber: "", callsign: "", dashNumber: "4" }
          ],
          midsA: "",
          midsB: "",
          creationOrder: maxCreationOrder + index + 1
        };
      });

      const allFlights = [...existingFlights, ...newFlights];

      // Group flights by callsign and fix any gaps or duplicates
      const groupedByCallsign = allFlights.reduce<Record<string, Flight[]>>((acc, flight) => {
        if (!acc[flight.callsign]) {
          acc[flight.callsign] = [];
        }
        acc[flight.callsign].push(flight);
        return acc;
      }, {});

      // Sort and fix flight numbers within each group
      Object.values(groupedByCallsign).forEach(flightGroup => {
        flightGroup.sort((a, b) => parseInt(a.flightNumber) - parseInt(b.flightNumber));
        
        let expectedNumber = 1;
        flightGroup.forEach(flight => {
          if (parseInt(flight.flightNumber) !== expectedNumber) {
            flight.flightNumber = expectedNumber.toString();
          }
          expectedNumber++;
        });
      });

      // Reassign MIDS channels for all flights
      let midsCounter = 1;
      allFlights.forEach(flight => {
        flight.midsA = midsCounter.toString();
        flight.midsB = (midsCounter + 2).toString();
        midsCounter += 3;
      });

      // Sort flights by creation order and then by callsign/flight number
      return allFlights.sort((a, b) => {
        if (a.callsign === b.callsign) {
          return parseInt(a.flightNumber) - parseInt(b.flightNumber);
        }
        return a.creationOrder - b.creationOrder;
      });
    });

    // Update the creation order counter
    setCreationOrderCounter(prev => prev + extractedFlights.length);
  }, [extractedFlights]);

  // Clear processed flights when component unmounts
  useEffect(() => {
    return () => {
      processedFlightTimestamps.current.clear();
    };
  }, []);

  // Get unique existing callsigns for the dialog suggestions
  const existingCallsigns = [...new Set(flights.map(flight => flight.callsign))];

  // Transform assigned pilots into the format needed for display
  const getUpdatedFlightPilots = (flight: Flight) => {
    const assigned = assignedPilots[flight.id] || [];
    // Create a fresh array with empty positions
    const updatedPilots = flight.pilots.map(p => ({
      boardNumber: "",
      callsign: "",
      dashNumber: p.dashNumber
    }));
    
    // Place each assigned pilot in their designated position by dashNumber
    assigned.forEach(assignedPilot => {
      const dashNumber = assignedPilot.dashNumber;
      // Make sure dashNumber is a string
      const dashNumberStr = dashNumber.toString();
      
      // Find the position with matching dashNumber
      const index = updatedPilots.findIndex(p => p.dashNumber === dashNumberStr);
      
      if (index !== -1) {
        updatedPilots[index] = {
          dashNumber: dashNumberStr,
          boardNumber: assignedPilot.boardNumber,
          callsign: assignedPilot.callsign
        };
      }
    });
    
    // Debug output for tracking pilot assignments
    console.log(`For flight ${flight.id}, assigned:`, assigned, 'mapped to:', updatedPilots);
    
    return updatedPilots;
  };

  // Function to get the next flight number for a given callsign
  const getNextFlightNumber = useCallback((callsign: string) => {
    const callsignFlights = flights.filter(f => f.callsign === callsign);
    if (callsignFlights.length === 0) return "1";
    
    const flightNumbers = callsignFlights.map(f => parseInt(f.flightNumber));
    return (Math.max(...flightNumbers) + 1).toString();
  }, [flights]);

  // Function to find the next available MIDS channels set
  const findNextAvailableMIDS = useCallback(() => {
    // Create an array to track used MIDS channel triplets (A1, A2, B)
    const usedChannels = new Set<number>();
    
    // Add all currently used MIDS channels
    flights.forEach(flight => {
      const midsA = parseInt(flight.midsA || "0");
      const midsB = parseInt(flight.midsB || "0");
      
      if (midsA > 0) {
        usedChannels.add(midsA);
        // For flights with section pairs, the second section uses midsA+1
        usedChannels.add(midsA + 1);
      }
      
      if (midsB > 0) {
        usedChannels.add(midsB);
      }
    });
    
    // Find the lowest available MIDS triplet (A1, A2, B)
    // MIDS B should be a multiple of 3
    // MIDS A should start with 1 (for first flight's first section)
    for (let i = 0; i < 42; i++) { // 42 possible flight groups (127/3)
      const midsB = (i + 1) * 3; // MIDS B is a multiple of 3
      const midsA1 = i * 3 + 1;  // First section MIDS A
      const midsA2 = i * 3 + 2;  // Second section MIDS A
      
      // If none of these channels are used, we found our triplet
      if (!usedChannels.has(midsB) && !usedChannels.has(midsA1) && !usedChannels.has(midsA2)) {
        return {
          midsA: midsA1.toString(),
          midsB: midsB.toString()
        };
      }
    }
    
    // If no available channels found (very unlikely), return empty strings
    return { midsA: "", midsB: "" };
  }, [flights]);

  // Function to add a new flight with the given callsign
  const handleAddFlight = useCallback(({ callsign }: { callsign: string }) => {
    if (editFlightId) {
      // Update an existing flight's callsign
      setFlights(prevFlights => {
        const updatedFlights = prevFlights.map(flight => {
          if (flight.id === editFlightId) {
            return {
              ...flight,
              callsign: callsign.toUpperCase(),
              // If callsign changed, update flight number to be next in sequence
              flightNumber: flight.callsign === callsign ? 
                flight.flightNumber : getNextFlightNumber(callsign)
            };
          }
          return flight;
        });

        // Re-sort flights by callsign and flight number, preserving creation order groups
        return updatedFlights.sort((a, b) => {
          if (a.callsign === b.callsign) {
            return parseInt(a.flightNumber) - parseInt(b.flightNumber);
          }
          return a.creationOrder - b.creationOrder;
        });
      });
      
      // Reset edit state
      setEditFlightId(null);
      setInitialEditCallsign("");
    } else {
      // Add a new flight
      const flightNumber = getNextFlightNumber(callsign);
      const { midsA, midsB } = findNextAvailableMIDS();
      
      const newFlight: Flight = {
        id: Date.now().toString(),
        callsign: callsign.toUpperCase(),
        flightNumber,
        pilots: [
          { boardNumber: "", callsign: "", dashNumber: "1" },
          { boardNumber: "", callsign: "", dashNumber: "2" },
          { boardNumber: "", callsign: "", dashNumber: "3" },
          { boardNumber: "", callsign: "", dashNumber: "4" }
        ],
        midsA,
        midsB,
        creationOrder: creationOrderCounter
      };
  
      // Add the new flight and sort by creation order, then by callsign, then by flight number
      setFlights(prev => {
        const updatedFlights = [...prev, newFlight];
        return updatedFlights.sort((a, b) => {
          if (a.callsign === b.callsign) {
            return parseInt(a.flightNumber) - parseInt(b.flightNumber);
          }
          return a.creationOrder - b.creationOrder;
        });
      });
  
      // Increment the creation order counter for the next flight
      setCreationOrderCounter(counter => counter + 1);
    }
    
    setShowAddFlightDialog(false);
  }, [getNextFlightNumber, findNextAvailableMIDS, creationOrderCounter, editFlightId]);

  // Close the dialog without adding a flight
  const handleCancelAddFlight = () => {
    setShowAddFlightDialog(false);
    setEditFlightId(null);
    setInitialEditCallsign("");
  };

  // Handle deleting a flight
  const handleDeleteFlight = useCallback((id: string) => {
    setFlights(prevFlights => prevFlights.filter(flight => flight.id !== id));
  }, []);

  // Handle editing a flight
  const handleEditFlight = useCallback((id: string, callsign: string) => {
    setEditFlightId(id);
    setInitialEditCallsign(callsign);
    setShowAddFlightDialog(true);
  }, []);

  return (
    <div style={{ width, position: 'relative' }}>
      <Card 
        style={{
          width: '100%',
          height: '100%',
          boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)',
          borderRadius: '8px',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          overflowY: 'hidden',
          boxSizing: 'border-box',
          transition: 'all 0.2s ease-in-out',
          backgroundColor: '#FFFFFF'
        }}
      >
        <div style={{
          width: '100%',
          textAlign: 'center',
          marginBottom: '16px'
        }}>
          <span style={{
            fontFamily: 'Inter',
            fontStyle: 'normal',
            fontWeight: 300,
            fontSize: '20px',
            lineHeight: '24px',
            color: '#64748B',
            textTransform: 'uppercase'
          }}>
            Flight Assignments
          </span>
        </div>
        <div className="flex-1" style={{ overflowY: 'auto' }}>
          <div className="space-y-4">
            {flights.map((flight) => (
              <FlightAssignmentCard
                key={flight.id}
                id={flight.id}
                callsign={flight.callsign}
                flightNumber={flight.flightNumber}
                pilots={getUpdatedFlightPilots(flight)}
                midsA={flight.midsA}
                midsB={flight.midsB}
                onDeleteFlight={handleDeleteFlight}
                onEditFlight={handleEditFlight}
                missionCommander={missionCommander}
              />
            ))}
          </div>
        </div>
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          marginTop: 'auto',
          padding: '24px 0 0 0',
          borderTop: '1px solid #E2E8F0'
        }}>
          <button
            onClick={() => setShowAddFlightDialog(true)}
            style={{
              width: '119px',
              height: '30px',
              background: '#FFFFFF',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              transition: 'box-shadow 0.2s ease-in-out',
              fontFamily: 'Inter',
              fontStyle: 'normal',
              fontWeight: 400,
              fontSize: '20px',
              lineHeight: '24px',
              color: '#64748B',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.boxShadow = '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            +
          </button>
        </div>
      </Card>

      {/* Add/Edit Flight Dialog */}
      {showAddFlightDialog && (
        <>
          {/* Semi-transparent overlay */}
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 1000
          }} onClick={handleCancelAddFlight} />
          
          {/* Dialog */}
          <AddFlightDialog
            onSave={handleAddFlight}
            onCancel={handleCancelAddFlight}
            existingCallsigns={existingCallsigns}
            initialCallsign={initialEditCallsign}
            title={editFlightId ? "Edit Flight" : "Add Flight"}
          />
        </>
      )}
    </div>
  );
};

export default FlightAssignments;