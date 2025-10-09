import React, { useState, useEffect, useRef } from 'react';

interface PositionReportDialogProps {
  initialBoardNumber?: string;
  onClose: () => void;
  onUpdatePosition: (boardNumber: string, bearing: string, distance: string, altitude: string, lowState?: number) => void;
}

export const PositionReportDialog: React.FC<PositionReportDialogProps> = ({
  initialBoardNumber = '',
  onClose,
  onUpdatePosition
}) => {
  const [boardNumber, setBoardNumber] = useState('');
  const [bearing, setBearing] = useState('');
  const [distance, setDistance] = useState('');
  const [altitude, setAltitude] = useState('');
  const [lowState, setLowState] = useState('');
  const [error, setError] = useState('');
  const [focusedInput, setFocusedInput] = useState<string | null>(null);
  
  const boardNumberRef = useRef<HTMLInputElement>(null);
  const bearingRef = useRef<HTMLInputElement>(null);
  const distanceRef = useRef<HTMLInputElement>(null);
  const altitudeRef = useRef<HTMLInputElement>(null);
  const lowStateRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setBoardNumber('');
    setBearing('');
    setDistance('');
    setAltitude('');
    setLowState('');
    setError('');

    if (initialBoardNumber) {
      setBoardNumber(initialBoardNumber);
      bearingRef.current?.focus();
    } else {
      boardNumberRef.current?.focus();
    }
  }, [initialBoardNumber]);

  const handleBoardNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 3);
    setBoardNumber(value);
    if (value.length === 3) {
      bearingRef.current?.focus();
    }
  };

  const handleBearingChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 3);
    
    // Don't allow first digit to be 4-9
    if (value.length === 1 && parseInt(value) >= 4) {
      return;
    }
    
    // Validate the complete bearing
    if (value === '' || parseInt(value) <= 360) {
      setBearing(value);
      if (value.length === 3 && parseInt(value) >= 1 && parseInt(value) <= 360) {
        distanceRef.current?.focus();
      }
    }
  };

  const handleDistanceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 2);
    if (value === '' || (parseInt(value) >= 0 && parseInt(value) <= 99)) {
      setDistance(value);
      if (value.length === 2 && parseInt(value) >= 10 && parseInt(value) <= 99) {
        altitudeRef.current?.focus();
      }
    }
  };

  const handleAltitudeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value;
    
    if (value === '') {
      setAltitude('');
      return;
    }

    // Allow only numbers and a single decimal point
    if (!/^\d*\.?\d*$/.test(value)) return;

    // Ensure only one decimal place
    if (value.includes('.')) {
      const [whole, decimal] = value.split('.');
      value = `${whole}.${decimal.slice(0, 1)}`;
    }

    const num = parseFloat(value);
    if (!isNaN(num) && num >= 0 && num <= 50) {
      setAltitude(value);
    }
  };

  const handleLowStateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value;
    
    if (value === '') {
      setLowState('');
      return;
    }

    if (!/^\d*\.?\d*$/.test(value)) return;

    const num = parseFloat(value);
    if (!isNaN(num) && num <= 17.4) {
      setLowState(value);
    }
  };

  const validateAndSubmit = () => {
    if (!boardNumber || boardNumber.length !== 3) {
      setError('Please enter a valid board number');
      return false;
    }

    const bearingNum = parseInt(bearing);
    if (!bearing || bearing.length !== 3 || bearingNum < 1 || bearingNum > 360) {
      setError('Bearing must be between 001 and 360');
      return false;
    }

    const distanceNum = parseInt(distance);
    if (!distance || distance.length !== 2 || distanceNum < 10 || distanceNum > 99) {
      setError('Distance must be between 10 and 99');
      return false;
    }

    const altitudeNum = parseFloat(altitude);
    if (!altitude || isNaN(altitudeNum) || altitudeNum < 0 || altitudeNum > 50) {
      setError('Please enter a valid altitude');
      return false;
    }

    // Only include low state if it's provided and valid
    if (lowState) {
      const lowStateNum = parseFloat(lowState);
      if (isNaN(lowStateNum) || lowStateNum > 17.4) {
        setError('Please enter a valid low state');
        return false;
      }
      onUpdatePosition(boardNumber, bearing, distance, altitude, lowStateNum);
    } else {
      onUpdatePosition(boardNumber, bearing, distance, altitude);
    }
    
    onClose();
    return true;
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (boardNumber && bearing && distance && altitude) {
        validateAndSubmit();
      }
    } else if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'Tab') {
      // Handle TAB navigation to cycle within dialog
      if (e.currentTarget === altitudeRef.current) {
        e.preventDefault();
        lowStateRef.current?.focus();
      } else if (e.currentTarget === lowStateRef.current && !e.shiftKey) {
        e.preventDefault();
        boardNumberRef.current?.focus();
      } else if (e.currentTarget === boardNumberRef.current && e.shiftKey) {
        e.preventDefault();
        lowStateRef.current?.focus();
      }
    } else if (e.key === '/' && e.currentTarget === altitudeRef.current) {
      e.preventDefault();
      lowStateRef.current?.focus();
    } else if (e.key === 'Backspace') {
      const input = e.currentTarget as HTMLInputElement;
      if (input.selectionStart === 0 && input.selectionEnd === 0) {
        e.preventDefault();
        if (input === lowStateRef.current) {
          setLowState('');
          altitudeRef.current?.focus();
          const altInput = altitudeRef.current;
          setTimeout(() => {
            if (altInput) {
              altInput.selectionStart = altInput.value.length;
              altInput.selectionEnd = altInput.value.length;
            }
          }, 0);
        } else if (input === altitudeRef.current) {
          setAltitude('');
          distanceRef.current?.focus();
          const distInput = distanceRef.current;
          setTimeout(() => {
            if (distInput) {
              distInput.selectionStart = distInput.value.length;
              distInput.selectionEnd = distInput.value.length;
            }
          }, 0);
        } else if (input === distanceRef.current) {
          setDistance('');
          bearingRef.current?.focus();
          const brgInput = bearingRef.current;
          setTimeout(() => {
            if (brgInput) {
              brgInput.selectionStart = brgInput.value.length;
              brgInput.selectionEnd = brgInput.value.length;
            }
          }, 0);
        } else if (input === bearingRef.current) {
          setBearing('');
          boardNumberRef.current?.focus();
          const boardInput = boardNumberRef.current;
          setTimeout(() => {
            if (boardInput) {
              boardInput.selectionStart = boardInput.value.length;
              boardInput.selectionEnd = boardInput.value.length;
            }
          }, 0);
        }
      }
    } else if (e.key === '/' || e.key === 'NumpadDivide') {
      e.preventDefault();
      if (e.currentTarget === bearingRef.current && bearing.length === 3) {
        distanceRef.current?.focus();
      } else if (e.currentTarget === distanceRef.current && distance.length === 2) {
        altitudeRef.current?.focus();
      } else if (e.currentTarget === altitudeRef.current && altitude) {
        lowStateRef.current?.focus();
      }
    }
  };

  const getInputStyle = (inputName: string) => ({
    width: '75px',
    height: '44px',
    fontFamily: 'Inter',
    fontStyle: 'normal',
    fontWeight: 700,
    fontSize: '20px',
    textAlign: 'center' as const,
    color: inputName === 'lowState' ? getFuelColor(parseFloat(lowState) || 0) : '#000000',
    border: focusedInput === inputName ? '2px solid #2563EB' : '2px solid transparent',
    outline: 'none',
    backgroundColor: '#F8FAFC',
    borderRadius: '4px',
    boxSizing: 'border-box' as const,
    caretColor: 'transparent'
  });

  return (
    <>
      <div 
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          zIndex: 1000
        }}
        onClick={onClose}
      />
      <div style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '463px',
        backgroundColor: '#FFFFFF',
        boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)',
        borderRadius: '8px',
        zIndex: 1001,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '12px'
      }}>
        <div style={{
          width: '100%',
          fontFamily: 'Inter',
          fontStyle: 'normal',
          fontWeight: 400,
          fontSize: '20px',
          lineHeight: '24px',
          textAlign: 'center',
          color: '#64748B',
          marginBottom: '8px'
        }}>
          Position Report
        </div>
        <div style={{
          display: 'flex',
          gap: '8px',
          justifyContent: 'center',
          width: '100%',
          padding: '0 12px'
        }}>
          <input
            ref={boardNumberRef}
            type="text"
            value={boardNumber}
            onChange={handleBoardNumberChange}
            onKeyDown={handleKeyDown}
            onFocus={() => setFocusedInput('boardNumber')}
            onBlur={() => setFocusedInput(null)}
            placeholder="###"
            style={getInputStyle('boardNumber')}
          />
          <input
            ref={bearingRef}
            type="text"
            value={bearing}
            onChange={handleBearingChange}
            onKeyDown={handleKeyDown}
            onFocus={() => setFocusedInput('bearing')}
            onBlur={() => setFocusedInput(null)}
            placeholder="BRG"
            style={getInputStyle('bearing')}
          />
          <input
            ref={distanceRef}
            type="text"
            value={distance}
            onChange={handleDistanceChange}
            onKeyDown={handleKeyDown}
            onFocus={() => setFocusedInput('distance')}
            onBlur={() => setFocusedInput(null)}
            placeholder="DST"
            style={getInputStyle('distance')}
          />
          <input
            ref={altitudeRef}
            type="text"
            value={altitude}
            onChange={handleAltitudeChange}
            onKeyDown={handleKeyDown}
            onFocus={() => setFocusedInput('altitude')}
            onBlur={() => setFocusedInput(null)}
            placeholder="ALT"
            style={getInputStyle('altitude')}
          />
          <input
            ref={lowStateRef}
            type="text"
            value={lowState}
            onChange={handleLowStateChange}
            onKeyDown={handleKeyDown}
            onFocus={() => setFocusedInput('lowState')}
            onBlur={() => setFocusedInput(null)}
            placeholder="LOW"
            style={getInputStyle('lowState')}
          />
        </div>
        {error && (
          <div style={{
            color: '#EF4444',
            fontSize: '12px',
            marginTop: '8px'
          }}>
            {error}
          </div>
        )}
      </div>
    </>
  );
};

const getFuelColor = (fuel: number): string => {
  const JOKER = 5.0;
  const BINGO = 3.0;

  if (fuel >= JOKER) return '#32ADE6';
  if (fuel >= BINGO && fuel < JOKER) return '#FF9500';
  return '#FF3B30';
};

export default PositionReportDialog;