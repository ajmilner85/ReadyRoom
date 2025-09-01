import React from 'react';
import type { Pilot } from '../../../types/PilotTypes';

interface PilotDragOverlayProps {
  draggedPilot: Pilot | null;
  dragSource: 'tile' | 'list' | null;
}

const PilotDragOverlay: React.FC<PilotDragOverlayProps> = ({ draggedPilot, dragSource }) => {
  if (!draggedPilot) return null;

  return dragSource === 'tile' ? (
    // Mini Aircraft Tile design for when dragging from a tile
    <div
      style={{
        width: '70px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        backgroundColor: '#F9FAFB', // LIGHT_SLATE_GREY
        borderRadius: '8px',
        boxShadow: '0px 4px 6px rgba(0, 0, 0, 0.1)',
        padding: '6px',
        pointerEvents: 'none',
        cursor: 'grabbing',
        opacity: 0.9
      }}
    >
      <img
        src="/src/assets/Aircraft Icon.svg"
        alt=""
        style={{
          width: '24px',
          height: '32px',
          filter: 'drop-shadow(0px 2px 2px rgba(0, 0, 0, 0.1))',
          marginBottom: '2px'
        }}
      />
      <div
        style={{
          fontSize: '14px',
          fontWeight: 400,
          textAlign: 'center',
          color: '#646F7E',
          marginBottom: '1px'
        }}
      >
        {draggedPilot.boardNumber}
      </div>
      <div
        style={{
          fontSize: '12px',
          fontWeight: 700,
          textAlign: 'center',
          color: '#000000',
        }}
      >
        {draggedPilot.callsign}
      </div>
    </div>
  ) : (
    // Regular row design for when dragging from the available pilots list
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        height: '24px',
        padding: '0 10px',
        backgroundColor: 'white',
        borderRadius: '8px',
        boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.25)',
        opacity: 0.9,
        cursor: 'grabbing',
        pointerEvents: 'none', // Prevent the overlay from interfering with drops
        transform: 'translateZ(0)', // Force GPU acceleration
        willChange: 'transform', // Performance optimization
        width: 'auto',
        minWidth: '180px', // Ensure minimum width to look good from both sources
        maxWidth: '200px' // Limit width to make it more compact
      }}
    >
      <span style={{ 
        width: '50px', 
        textAlign: 'center', 
        fontSize: '16px', 
        color: '#646F7E',
        marginRight: '8px' 
      }}>
        {draggedPilot.boardNumber}
      </span>
      <span style={{ 
        fontSize: '16px', 
        fontWeight: 700,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis'
      }}>
        {draggedPilot.callsign}
      </span>
    </div>
  );
};

export default PilotDragOverlay;