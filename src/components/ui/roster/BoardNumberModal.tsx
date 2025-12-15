import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { supabase } from '../../../utils/supabaseClient';

interface BoardNumberModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (boardNumber: string) => void;
}

interface BoardNumberStatus {
  number: string;
  status: 'available' | 'active' | 'inactive';
  pilot?: string;
}

const BoardNumberModal: React.FC<BoardNumberModalProps> = ({ isOpen, onClose, onSelect }) => {
  const [boardNumbers, setBoardNumbers] = useState<BoardNumberStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  // Generate all valid board numbers (5XX, 6XX, 7XX with no 0, 8, 9)
  const generateValidBoardNumbers = (): string[] => {
    const valid: string[] = [];
    const validDigits = ['1', '2', '3', '4', '5', '6', '7'];
    const prefixes = ['5', '6', '7'];

    for (const prefix of prefixes) {
      for (const d1 of validDigits) {
        for (const d2 of validDigits) {
          valid.push(prefix + d1 + d2);
        }
      }
    }

    return valid.sort();
  };

  // Load data once when modal first opens, then cache it
  useEffect(() => {
    if (isOpen && !hasLoadedOnce) {
      fetchBoardNumberStatuses();
    }
  }, [isOpen, hasLoadedOnce]);

  const fetchBoardNumberStatuses = async () => {
    setLoading(true);
    try {
      // Get all pilots with their board numbers and current status
      const { data: pilots, error } = await supabase
        .from('pilots')
        .select(`
          boardNumber,
          callsign,
          pilot_statuses!inner (
            statuses!inner (
              name
            ),
            end_date
          )
        `);

      if (error) throw error;

      // Create a map of board numbers to their status
      const boardNumberMap = new Map<string, { status: 'active' | 'inactive'; pilot: string }>();

      pilots?.forEach((pilot: any) => {
        // Get current status (where end_date is null)
        const currentStatus = pilot.pilot_statuses?.find((ps: any) => ps.end_date === null);
        if (currentStatus) {
          const statusName = currentStatus.statuses?.name;
          const isActive = statusName !== 'Retired' && statusName !== 'Removed';
          const boardNumStr = pilot.boardNumber.toString().padStart(3, '0');

          boardNumberMap.set(boardNumStr, {
            status: isActive ? 'active' : 'inactive',
            pilot: pilot.callsign
          });
        }
      });

      // Generate all valid board numbers and mark their status
      const allValidNumbers = generateValidBoardNumbers();
      const statusList: BoardNumberStatus[] = allValidNumbers.map(num => {
        const existing = boardNumberMap.get(num);
        if (existing) {
          return {
            number: num,
            status: existing.status,
            pilot: existing.pilot
          };
        }
        return {
          number: num,
          status: 'available'
        };
      });

      setBoardNumbers(statusList);
      setHasLoadedOnce(true);
    } catch (err) {
      console.error('Error fetching board number statuses:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleNumberClick = (num: BoardNumberStatus) => {
    if (num.status === 'available') {
      onSelect(num.number);
      onClose();
    }
  };

  // Split numbers by prefix and then split each prefix into two columns
  const numbers5xx = boardNumbers.filter(n => n.number.startsWith('5'));
  const numbers6xx = boardNumbers.filter(n => n.number.startsWith('6'));
  const numbers7xx = boardNumbers.filter(n => n.number.startsWith('7'));

  const mid5 = Math.ceil(numbers5xx.length / 2);
  const numbers5xx_col1 = numbers5xx.slice(0, mid5);
  const numbers5xx_col2 = numbers5xx.slice(mid5);

  const mid6 = Math.ceil(numbers6xx.length / 2);
  const numbers6xx_col1 = numbers6xx.slice(0, mid6);
  const numbers6xx_col2 = numbers6xx.slice(mid6);

  const mid7 = Math.ceil(numbers7xx.length / 2);
  const numbers7xx_col1 = numbers7xx.slice(0, mid7);
  const numbers7xx_col2 = numbers7xx.slice(mid7);

  // Don't render modal until data is loaded to prevent flickering
  if (!isOpen || loading) return null;

  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  };

  const modalStyle: React.CSSProperties = {
    backgroundColor: '#FFFFFF',
    borderRadius: '8px',
    padding: '16px 24px 24px 24px',
    maxWidth: '800px',
    width: '90%',
    maxHeight: '80vh',
    overflow: 'auto',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
  };

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: '12px',
    position: 'relative',
  };

  const titleStyle: React.CSSProperties = {
    fontFamily: 'Inter',
    fontStyle: 'normal',
    fontWeight: 300,
    fontSize: '20px',
    lineHeight: '24px',
    color: '#64748B',
    textTransform: 'uppercase',
    textAlign: 'center',
  };

  const closeButtonStyle: React.CSSProperties = {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '4px',
    color: '#64748B',
    position: 'absolute',
    right: 0,
  };

  const columnsContainerStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(6, 1fr)',
    gap: '16px',
  };

  const columnStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
  };

  const numberItemStyle = (status: 'available' | 'active' | 'inactive'): React.CSSProperties => ({
    fontSize: '12px',
    padding: '4px 8px',
    margin: '2px 0',
    cursor: status === 'available' ? 'pointer' : 'default',
    color: status === 'available' ? '#10B981' : status === 'active' ? '#EF4444' : '#94A3B8',
    backgroundColor: status === 'available' ? 'transparent' : 'transparent',
    border: 'none',
    textAlign: 'left',
    fontFamily: 'monospace',
  });

  const legendStyle: React.CSSProperties = {
    display: 'flex',
    gap: '16px',
    justifyContent: 'center',
    marginBottom: '16px',
    fontSize: '12px',
  };

  const legendItemStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  };

  const renderColumn = (numbers: BoardNumberStatus[]) => (
    <div style={columnStyle}>
      {numbers.map((num) => (
        <button
          key={num.number}
          style={numberItemStyle(num.status)}
          onClick={() => handleNumberClick(num)}
          title={num.pilot ? `Assigned to ${num.pilot}` : 'Available'}
          onMouseEnter={(e) => {
            if (num.status === 'available') {
              e.currentTarget.style.backgroundColor = '#F0FDF4';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          {num.number}
          {num.pilot && ` - ${num.pilot}`}
        </button>
      ))}
    </div>
  );

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <h2 style={titleStyle}>Select Board Number</h2>
          <button style={closeButtonStyle} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div style={legendStyle}>
          <div style={legendItemStyle}>
            <span style={{ color: '#10B981' }}>●</span>
            <span>Available</span>
          </div>
          <div style={legendItemStyle}>
            <span style={{ color: '#EF4444' }}>●</span>
            <span>Active Pilot</span>
          </div>
          <div style={legendItemStyle}>
            <span style={{ color: '#94A3B8' }}>●</span>
            <span>Inactive Pilot</span>
          </div>
        </div>

        <div style={columnsContainerStyle}>
          {renderColumn(numbers5xx_col1)}
          {renderColumn(numbers5xx_col2)}
          {renderColumn(numbers6xx_col1)}
          {renderColumn(numbers6xx_col2)}
          {renderColumn(numbers7xx_col1)}
          {renderColumn(numbers7xx_col2)}
        </div>
      </div>
    </div>
  );
};

export default BoardNumberModal;
