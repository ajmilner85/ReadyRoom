import React, { useState, useRef, useEffect } from 'react';

interface FuelDisplayProps {
    fuel: number | undefined;
    size?: 'small' | 'large';
    onUpdateFuel?: (newFuel: number) => void;
    onEditStateChange?: (isEditing: boolean) => void;
}

const getFuelColor = (fuel: number | undefined): string => {
    if (fuel === undefined) return '#64748B';  // Default gray color for undefined
    
    const JOKER = 5.0;
    const BINGO = 3.0;

    if (fuel >= JOKER) return '#32ADE6';
    if (fuel >= BINGO && fuel < JOKER) return '#FF9500';
    return '#FF3B30';
};

const FuelDisplay: React.FC<FuelDisplayProps> = ({ 
    fuel, 
    size = 'small', 
    onUpdateFuel,
    onEditStateChange
}) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState(fuel?.toFixed(1) || '');
    const inputRef = useRef<HTMLInputElement>(null);

    const mainSize = size === 'large' ? '36px' : '14px';
    const decimalSize = size === 'large' ? '32px' : '12px';
    const fuelColor = getFuelColor(fuel);

    const handleDoubleClick = (e: React.MouseEvent) => {
        if (!onUpdateFuel) return;
        e.preventDefault();
        e.stopPropagation();
        setIsEditing(true);
        setEditValue(fuel?.toFixed(1) || '');
        if (onEditStateChange) {
            onEditStateChange(true);
        }
    };

    const handleBlur = () => {
        setIsEditing(false);
        if (onEditStateChange) {
            onEditStateChange(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
            const parsedValue = parseFloat(editValue);
            
            if (!isNaN(parsedValue) && parsedValue >= 0) {
                const formattedValue = Number(parsedValue.toFixed(1));
                
                if (onUpdateFuel) {
                    onUpdateFuel(formattedValue);
                }
                setIsEditing(false);
                if (onEditStateChange) {
                    onEditStateChange(false);
                }
            } else {
                setEditValue(fuel?.toFixed(1) || '');
                setIsEditing(false);
                if (onEditStateChange) {
                    onEditStateChange(false);
                }
            }
        } else if (e.key === 'Escape') {
            setEditValue(fuel?.toFixed(1) || '');
            setIsEditing(false);
            if (onEditStateChange) {
                onEditStateChange(false);
            }
        }
    };

    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isEditing]);

    if (isEditing) {
        return (
            <div 
                onClick={e => e.stopPropagation()} 
                onMouseDown={e => e.stopPropagation()}
            >
                <input
                    ref={inputRef}
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={handleBlur}
                    onKeyDown={handleKeyDown}
                    onClick={e => e.stopPropagation()}
                    onMouseDown={e => e.stopPropagation()}
                    style={{
                        width: '50px',
                        textAlign: 'center',
                        fontSize: mainSize,
                        color: fuelColor,
                        fontWeight: 700,
                        border: '1px solid #CBD5E1',
                        borderRadius: '4px',
                    }}
                />
            </div>
        );
    }

    if (fuel === undefined) {
        return (
            <div 
                style={{ 
                    display: 'flex', 
                    alignItems: 'baseline',
                    color: fuelColor,
                    fontWeight: 700,
                    cursor: onUpdateFuel ? 'text' : 'default'
                }}
                onDoubleClick={handleDoubleClick}
                onClick={e => e.stopPropagation()}
                onMouseDown={e => e.stopPropagation()}
            >
                <span style={{ fontSize: mainSize, lineHeight: mainSize }}>-.-</span>
            </div>
        );
    }

    const [whole, decimal] = fuel.toFixed(1).split('.');
    
    return (
        <div 
            style={{ 
                display: 'flex', 
                alignItems: 'baseline',
                color: fuelColor,
                fontWeight: 700,
                cursor: onUpdateFuel ? 'text' : 'default'
            }}
            onDoubleClick={handleDoubleClick}
            onClick={e => e.stopPropagation()}
            onMouseDown={e => e.stopPropagation()}
        >
            <span style={{ fontSize: mainSize, lineHeight: mainSize }}>
                {whole}
            </span>
            <span style={{ fontSize: decimalSize, lineHeight: decimalSize }}>
                .{decimal}
            </span>
        </div>
    );
};

export default FuelDisplay;