import React, { useState, useEffect, useRef } from 'react';

const getFuelColor = (fuel: number): string => {
    const JOKER = 5.0;
    const BINGO = 3.0;

    if (fuel >= JOKER) return '#32ADE6';
    if (fuel >= BINGO && fuel < JOKER) return '#FF9500';
    return '#FF3B30';
};

interface FuelStateDialogProps {
  initialBoardNumber?: string;
  onClose: () => void;
  onUpdateFuel: (boardNumber: string, fuelState: number) => void;
}

export const FuelStateDialog: React.FC<FuelStateDialogProps> = ({
  initialBoardNumber = '',
  onClose,
  onUpdateFuel
}) => {
  const [boardNumber, setBoardNumber] = useState('');
  const [fuelState, setFuelState] = useState('');
  const boardNumberRef = useRef<HTMLInputElement>(null);
  const fuelStateRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    console.log('Dialog opened with initialBoardNumber:', initialBoardNumber);
    
    // Reset to empty state
    setBoardNumber('');
    setFuelState('');

    // Populate board number if provided
    if (initialBoardNumber) {
      setBoardNumber(initialBoardNumber);
      fuelStateRef.current?.focus();
    } else {
      boardNumberRef.current?.focus();
    }
  }, [initialBoardNumber]);

  const handleBoardNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 3);
    setBoardNumber(value);
    if (value.length === 3) {
      fuelStateRef.current?.focus();
    }
  };

  const handleFuelStateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value;
    
    // Allow empty value
    if (value === '') {
      setFuelState('');
      return;
    }

    // Only allow numbers and a single decimal point
    if (!/^\d*\.?\d*$/.test(value)) return;

    // Convert to number and validate range
    const num = parseFloat(value);
    if (!isNaN(num) && num <= 17.4) {
      setFuelState(value);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Backspace') {
      if (e.currentTarget === fuelStateRef.current && !fuelState) {
        setBoardNumber('');
        boardNumberRef.current?.focus();
      }
    } else if (e.key === 'Enter' && boardNumber.length === 3 && fuelState) {
      const fuelValue = parseFloat(fuelState);
      if (!isNaN(fuelValue)) {
        onUpdateFuel(boardNumber, fuelValue);
        onClose();
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  const fuelStateColor = fuelState ? getFuelColor(parseFloat(fuelState)) : '#64748B';

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
        width: '339px',
        height: '114px',
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
          Update State
        </div>
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '16px',
          width: '100%'
        }}>
          <input
            ref={boardNumberRef}
            type="text"
            value={boardNumber}
            onChange={handleBoardNumberChange}
            onKeyDown={handleKeyDown}
            placeholder="---"
            style={{
              width: '69px',
              height: '44px',
              fontFamily: 'Inter',
              fontStyle: 'normal',
              fontWeight: 700,
              fontSize: '36px',
              lineHeight: '44px',
              textAlign: 'center',
              color: '#000000',
              border: 'none',
              outline: 'none',
              backgroundColor: '#F8FAFC',
              borderRadius: '4px',
              caretColor: 'transparent'
            }}
          />
          <input
            ref={fuelStateRef}
            type="text"
            value={fuelState}
            onChange={handleFuelStateChange}
            onKeyDown={handleKeyDown}
            placeholder="-.-"
            style={{
              width: '69px',
              height: '44px',
              fontFamily: 'Inter',
              fontStyle: 'normal',
              fontWeight: 700,
              fontSize: '36px',
              lineHeight: '44px',
              textAlign: 'center',
              color: fuelStateColor,
              border: 'none',
              outline: 'none',
              backgroundColor: '#F8FAFC',
              borderRadius: '4px',
              caretColor: 'transparent'
            }}
          />
        </div>
      </div>
    </>
  );
};

export default FuelStateDialog;