import React, { useState, useRef, useEffect } from 'react';

interface FuelDisplayProps {
    fuel: number | undefined;
    /** 'strip' = Coordination strip chip: mono 11px, design thresholds (good ≥5.0, warn 4.0–4.9, bad <4.0). */
    size?: 'small' | 'large' | 'strip';
    bold?: boolean;
    onUpdateFuel?: (newFuel: number) => void;
    onEditStateChange?: (isEditing: boolean) => void;
}

/** Strip fuel colour (design): good ≥ 5.0, warn 4.0–4.9, bad < 4.0. */
export const stripFuelColor = (fuel: number | undefined): string => {
    if (fuel === undefined || fuel === null || Number.isNaN(fuel)) return 'var(--rr-text3)';
    if (fuel >= 5.0) return 'var(--rr-good)';
    if (fuel >= 4.0) return 'var(--rr-warn)';
    return 'var(--rr-bad)';
};

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
    onEditStateChange,
    bold
}) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState(fuel?.toFixed(1) || '');
    const inputRef = useRef<HTMLInputElement>(null);

    const isStrip = size === 'strip';
    const mainSize = size === 'large' ? '36px' : isStrip ? '11px' : '14px';
    const decimalSize = size === 'large' ? '32px' : isStrip ? '11px' : '12px';
    const fuelColor = isStrip ? stripFuelColor(fuel) : getFuelColor(fuel);
    const weight = isStrip ? (bold ? 700 : 500) : 700;
    const family = isStrip ? 'var(--rr-font-mono)' : undefined;

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
                        width: isStrip ? '38px' : '50px',
                        textAlign: 'center',
                        fontSize: mainSize,
                        fontFamily: family,
                        color: fuelColor,
                        fontWeight: 700,
                        background: 'var(--rr-panel)',
                        border: '1px solid var(--rr-accent)',
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
                    fontWeight: weight,
                    fontFamily: family,
                    cursor: onUpdateFuel ? 'text' : 'default'
                }}
                onDoubleClick={handleDoubleClick}
                onClick={e => e.stopPropagation()}
                onMouseDown={e => e.stopPropagation()}
            >
                <span style={{ fontSize: mainSize, lineHeight: mainSize }}>{isStrip ? '—' : '-.-'}</span>
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
                fontWeight: weight,
                fontFamily: family,
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