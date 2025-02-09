import React, { useState } from 'react';
import { Edit2, Trash2 } from 'lucide-react';
import { useSections, Division } from './SectionContext';

interface DivisionEditorProps {
  sectionTitle: string;
  division: Division;
}

const DivisionEditor: React.FC<DivisionEditorProps> = ({ sectionTitle, division }) => {
  const { updateDivisionLabel, removeDivision } = useSections();
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(division.label);

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
  };

  const handleSave = () => {
    if (editValue.trim()) {
      updateDivisionLabel(sectionTitle, division.id, editValue.trim());
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
      setEditValue(division.label);
    }
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    removeDivision(sectionTitle, division.id);
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      position: 'absolute',
      right: '8px',
      top: '50%',
      transform: 'translateY(-50%)',
      zIndex: 5 // Lowered from 20 to 5
    }}>
      {isEditing ? (
        <input
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          style={{
            padding: '4px 8px',
            border: '1px solid #CBD5E1',
            borderRadius: '4px',
            fontSize: '14px'
          }}
          autoFocus
        />
      ) : (
        <>
          <button
            onClick={handleEditClick}
            style={{
              padding: '4px',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
            title="Edit division"
          >
            <Edit2 size={16} />
          </button>
          <button
            onClick={handleRemove}
            style={{
              padding: '4px',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
            title="Remove division"
          >
            <Trash2 size={16} />
          </button>
        </>
      )}
    </div>
  );
};

export const AddDivisionButton: React.FC<{
  sectionTitle: string;
  position: 'top' | 'bottom';
}> = ({ sectionTitle, position }) => {
  const { addDivision } = useSections();
  const [isAdding, setIsAdding] = useState(false);
  const [newLabel, setNewLabel] = useState('');

  const handleAdd = () => {
    if (newLabel.trim()) {
      addDivision(sectionTitle, newLabel.trim(), position);
      setNewLabel('');
    }
    setIsAdding(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleAdd();
    } else if (e.key === 'Escape') {
      setIsAdding(false);
      setNewLabel('');
    }
  };

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      padding: '18px',
      position: 'relative',
      zIndex: 5 // Added explicit z-index
    }}>
      {isAdding ? (
        <input
          type="text"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onBlur={handleAdd}
          onKeyDown={handleKeyDown}
          placeholder="Enter division label"
          style={{
            width: '119px',
            height: '30px',
            padding: '4px 8px',
            border: '1px solid #CBD5E1',
            borderRadius: '8px',
            fontSize: '14px'
          }}
          autoFocus
        />
      ) : (
        <button
          onClick={() => setIsAdding(true)}
          style={{
            position: 'absolute',
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
            justifyContent: 'center',
            zIndex: 5 // Added explicit z-index
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
      )}
    </div>
  );
};

export default DivisionEditor;