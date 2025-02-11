import React, { useState, useRef, useEffect } from 'react';

interface FuelDisplayProps {
    fuel: number;
    size?: 'small' | 'large';
    color?: string;
    onUpdateFuel?: (newFuel: number) => void;
}

const FuelDisplay: React.FC<FuelDisplayProps> = ({ 
    fuel, 
    size = 'small', 
    color = '#FF3B30',
    onUpdateFuel
}) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState(fuel.toFixed(1));
    const inputRef = useRef<HTMLInputElement>(null);

    const mainSize = size === 'large' ? '36px' : '12px';
    const decimalSize = size === 'large' ? '32px' : '10px';

    const handleDoubleClick = () => {
        setIsEditing(true);
        setEditValue(fuel.toFixed(1));
    };

    const handleBlur = () => {
        setIsEditing(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            // Validate input (ensure it's a valid fuel number)
            const parsedValue = parseFloat(editValue);
            
            if (!isNaN(parsedValue) && parsedValue >= 0) {
                const formattedValue = Number(parsedValue.toFixed(1));
                
                if (onUpdateFuel) {
                    onUpdateFuel(formattedValue);
                }
                setIsEditing(false);
            } else {
                // Revert to original value if invalid
                setEditValue(fuel.toFixed(1));
                setIsEditing(false);
            }
        } else if (e.key === 'Escape') {
            setEditValue(fuel.toFixed(1));
            setIsEditing(false);
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
            <input
                ref={inputRef}
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                style={{
                    width: '50px',
                    textAlign: 'center',
                    fontSize: mainSize,
                    color: color,
                    fontWeight: 700,
                    border: '1px solid #CBD5E1',
                    borderRadius: '4px',
                }}
            />
        );
    }

    const [whole, decimal] = fuel.toFixed(1).split('.');
    
    return (
        <div 
            style={{ 
                display: 'flex', 
                alignItems: 'baseline',
                color: color,
                fontWeight: 700,
                cursor: 'text'
            }}
            onDoubleClick={handleDoubleClick}
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