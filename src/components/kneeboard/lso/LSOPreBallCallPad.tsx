import React from 'react';
import { Delete } from 'lucide-react';

interface LSOPreBallCallPadProps {
  theme: 'light' | 'dark';
  colors: Record<string, string>;
  boardNumber: string;
  aircraftType: string;
  fuelState: string;
  onBoardNumberChange: (value: string) => void;
  onAircraftTypeChange: (value: string) => void;
  onFuelStateChange: (value: string) => void;
  onBallCall: () => void;
  onKeyPress: () => void;
  cellSize: number;
}

const GAP = 6;

const LSOPreBallCallPad: React.FC<LSOPreBallCallPadProps> = ({
  theme,
  colors,
  boardNumber,
  aircraftType,
  fuelState,
  onBoardNumberChange,
  onAircraftTypeChange,
  onFuelStateChange,
  onBallCall,
  onKeyPress,
  cellSize,
}) => {
  const B = cellSize;
  const TRIPLE_W = B * 3 + GAP * 2;

  const sq = (isSelected = false): React.CSSProperties => ({
    width: `${B}px`,
    height: `${B}px`,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: isSelected
      ? (theme === 'dark' ? 'rgba(124, 58, 237, 0.3)' : 'rgba(124, 58, 237, 0.15)')
      : (theme === 'dark' ? '#2a2a4e' : '#e5e7eb'),
    border: isSelected ? `2px solid ${colors.accent}` : `1px solid ${colors.border}`,
    borderRadius: '8px',
    cursor: 'pointer',
    color: isSelected ? colors.text : colors.textSecondary,
    fontSize: '44px',
    fontWeight: 600,
  });

  const empty: React.CSSProperties = {
    width: `${B}px`,
    height: `${B}px`,
    flexShrink: 0,
  };

  const emptyTriple: React.CSSProperties = {
    width: `${TRIPLE_W}px`,
    height: `${B}px`,
    flexShrink: 0,
  };

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    gap: `${GAP}px`,
  };

  const handleBoardKey = (key: string) => {
    onKeyPress();
    if (key === 'del') {
      onBoardNumberChange(boardNumber.slice(0, -1));
    } else if (boardNumber.length < 4) {
      onBoardNumberChange(boardNumber + key);
    }
  };

  const handleFuelKey = (key: string) => {
    onKeyPress();
    if (key === 'del') {
      onFuelStateChange(fuelState.slice(0, -1));
    } else if (key === '.') {
      if (!fuelState.includes('.') && fuelState.length > 0) {
        onFuelStateChange(fuelState + '.');
      }
    } else if (fuelState.length < 5) {
      onFuelStateChange(fuelState + key);
    }
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: `${GAP}px`,
      flexShrink: 0,
    }}>
      {/* Row 1: 7 8 9 | HORNET(3-wide) | 7 8 9 */}
      <div style={rowStyle}>
        <button onClick={() => handleBoardKey('7')} style={sq()}>7</button>
        <button onClick={() => handleBoardKey('8')} style={sq()}>8</button>
        <button onClick={() => handleBoardKey('9')} style={sq()}>9</button>
        <button
          onClick={() => { onKeyPress(); onAircraftTypeChange(aircraftType === 'HORNET' ? '' : 'HORNET'); }}
          style={{
            ...sq(aircraftType === 'HORNET'),
            width: `${TRIPLE_W}px`,
            fontSize: '36px',
            fontFamily: 'Inter, system-ui, sans-serif',
          }}
        >
          HORNET
        </button>
        <button onClick={() => handleFuelKey('7')} style={sq()}>7</button>
        <button onClick={() => handleFuelKey('8')} style={sq()}>8</button>
        <button onClick={() => handleFuelKey('9')} style={sq()}>9</button>
      </div>

      {/* Row 2: 4 5 6 | (empty 3-wide) | 4 5 6 */}
      <div style={rowStyle}>
        <button onClick={() => handleBoardKey('4')} style={sq()}>4</button>
        <button onClick={() => handleBoardKey('5')} style={sq()}>5</button>
        <button onClick={() => handleBoardKey('6')} style={sq()}>6</button>
        <div style={emptyTriple} />
        <button onClick={() => handleFuelKey('4')} style={sq()}>4</button>
        <button onClick={() => handleFuelKey('5')} style={sq()}>5</button>
        <button onClick={() => handleFuelKey('6')} style={sq()}>6</button>
      </div>

      {/* Row 3: 1 2 3 | (empty 3-wide) | 1 2 3 */}
      <div style={rowStyle}>
        <button onClick={() => handleBoardKey('1')} style={sq()}>1</button>
        <button onClick={() => handleBoardKey('2')} style={sq()}>2</button>
        <button onClick={() => handleBoardKey('3')} style={sq()}>3</button>
        <div style={emptyTriple} />
        <button onClick={() => handleFuelKey('1')} style={sq()}>1</button>
        <button onClick={() => handleFuelKey('2')} style={sq()}>2</button>
        <button onClick={() => handleFuelKey('3')} style={sq()}>3</button>
      </div>

      {/* Row 4: del 0 empty | empty [BC](1x1) empty | del 0 . */}
      <div style={rowStyle}>
        <button onClick={() => handleBoardKey('del')} style={sq()}>
          <Delete size={40} strokeWidth={2.5} />
        </button>
        <button onClick={() => handleBoardKey('0')} style={sq()}>0</button>
        <div style={empty} />
        <div style={empty} />
        <button
          onClick={() => { onKeyPress(); onBallCall(); }}
          style={sq()}
        >
          [BC]
        </button>
        <div style={empty} />
        <button onClick={() => handleFuelKey('del')} style={sq()}>
          <Delete size={40} strokeWidth={2.5} />
        </button>
        <button onClick={() => handleFuelKey('0')} style={sq()}>0</button>
        <button onClick={() => handleFuelKey('.')} style={sq()}>.</button>
      </div>

      {/* Display values row */}
      <div style={rowStyle}>
        <div style={{
          width: `${B * 3 + GAP * 2}px`,
          height: `${B}px`,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme === 'dark' ? '#1a1a2e' : '#f8f9fa',
          borderRadius: '8px',
          fontSize: '44px',
          fontWeight: 700,
          color: boardNumber ? colors.text : colors.textSecondary,
        }}>
          {boardNumber || '---'}
        </div>
        <div style={{
          width: `${TRIPLE_W}px`,
          height: `${B}px`,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme === 'dark' ? '#1a1a2e' : '#f8f9fa',
          borderRadius: '8px',
          fontSize: '36px',
          fontWeight: 700,
          color: aircraftType ? colors.text : colors.textSecondary,
        }}>
          {aircraftType || '--'}
        </div>
        <div style={{
          width: `${B * 3 + GAP * 2}px`,
          height: `${B}px`,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme === 'dark' ? '#1a1a2e' : '#f8f9fa',
          borderRadius: '8px',
          fontSize: '44px',
          fontWeight: 700,
          color: fuelState ? colors.text : colors.textSecondary,
        }}>
          {fuelState || '--.-'}
        </div>
      </div>

      {/* Empty filler rows — reserve same vertical space as the grading pad */}
      <div style={rowStyle}>
        <div style={empty} /><div style={empty} /><div style={empty} />
        <div style={emptyTriple} />
        <div style={empty} /><div style={empty} /><div style={empty} />
      </div>
      <div style={rowStyle}>
        <div style={empty} /><div style={empty} /><div style={empty} />
        <div style={emptyTriple} />
        <div style={empty} /><div style={empty} /><div style={empty} />
      </div>
      <div style={rowStyle}>
        <div style={empty} /><div style={empty} /><div style={empty} />
        <div style={emptyTriple} />
        <div style={empty} /><div style={empty} /><div style={empty} />
      </div>
      <div style={rowStyle}>
        <div style={empty} /><div style={empty} /><div style={empty} />
        <div style={emptyTriple} />
        <div style={empty} /><div style={empty} /><div style={empty} />
      </div>
    </div>
  );
};

export default LSOPreBallCallPad;
