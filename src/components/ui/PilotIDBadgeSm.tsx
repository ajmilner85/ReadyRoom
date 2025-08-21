import React from 'react';

interface PilotIDBadgeSmProps {
  squadronTailCode?: string;
  boardNumber?: string;
  squadronInsigniaUrl?: string;
}

const PilotIDBadgeSm: React.FC<PilotIDBadgeSmProps> = ({
  squadronTailCode,
  boardNumber = '00',
  squadronInsigniaUrl
}) => {
  // Only show squadron info if pilot is assigned to a squadron
  const hasSquadronAssignment = squadronTailCode && squadronTailCode.trim() !== '';
  
  // Ensure squadron tail code is max 2 characters for display
  const displaySquadron = hasSquadronAssignment 
    ? (squadronTailCode.length > 2 
        ? squadronTailCode.substring(0, 2).toUpperCase()
        : squadronTailCode.toUpperCase())
    : '';

  // Display full board number without truncation
  const displayBoardNumber = boardNumber;

  return (
    <div style={{
      position: 'relative',
      width: hasSquadronAssignment ? '104px' : '44px',
      height: '24px',
      marginLeft: hasSquadronAssignment ? '0px' : '60px' // 104px - 44px = 60px offset for right alignment
    }}>
      {/* Background pill */}
      <div style={{
        position: 'absolute',
        left: hasSquadronAssignment ? '13.45%' : '0%',
        right: '0%',
        top: '0%',
        bottom: '0%',
        background: '#9DA6AA',
        borderRadius: '8px'
      }} />
      
      {/* Squadron tail code text (left) - only show if pilot has squadron assignment */}
      {hasSquadronAssignment && (
        <div style={{
          position: 'absolute',
          left: '34.45%',
          right: '44.54%',
          top: '0px',
          bottom: '2px',
          fontFamily: 'USN Stencil',
          fontStyle: 'normal',
          fontWeight: 400,
          fontSize: '20px',
          lineHeight: '20px',
          display: 'flex',
          alignItems: 'center',
          textAlign: 'center',
          color: '#575A58'
        }}>
          {displaySquadron}
        </div>
      )}

      {/* Board number text (right) */}
      <div style={{
        position: 'absolute',
        left: hasSquadronAssignment ? '68.07%' : '0%',
        right: hasSquadronAssignment ? '6.72%' : '0%',
        top: '0px',
        bottom: '2px',
        fontFamily: 'USN Stencil',
        fontStyle: 'normal',
        fontWeight: 400,
        fontSize: '20px',
        lineHeight: '20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#575A58'
      }}>
        {displayBoardNumber}
      </div>

      {/* Squadron insignia (left side) - only show if pilot has squadron assignment */}
      {hasSquadronAssignment && squadronInsigniaUrl && (
        <div style={{
          position: 'absolute',
          height: '24px',
          left: '15.13%',
          right: '72.27%',
          top: '0px',
          backgroundImage: `url(${squadronInsigniaUrl})`,
          backgroundSize: 'contain',
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'center'
        }} />
      )}
    </div>
  );
};

export default PilotIDBadgeSm;