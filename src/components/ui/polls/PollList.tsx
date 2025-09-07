import React from 'react';
import type { PollWithResults } from '../../../types/PollTypes';
import PollItem from './PollItem';

interface PollListProps {
  polls: PollWithResults[];
  onVote?: (pollId: string, optionId: string) => Promise<void>;
  onRemoveVote?: (pollId: string) => Promise<void>;
  primaryColor: string;
  accentColor: string;
}

const PollList: React.FC<PollListProps> = ({ 
  polls, 
  onVote, 
  onRemoveVote, 
  primaryColor, 
  accentColor 
}) => {
  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    flex: 1,
    overflowY: 'auto',
    paddingRight: '4px', // Space for scrollbar
  };

  // Sort polls by creation date (newest first)
  const sortedPolls = [...polls].sort((a, b) => 
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return (
    <div style={containerStyle}>
      {sortedPolls.map(poll => (
        <PollItem
          key={poll.id}
          poll={poll}
          onVote={onVote}
          onRemoveVote={onRemoveVote}
          primaryColor={primaryColor}
          accentColor={accentColor}
        />
      ))}
    </div>
  );
};

export default PollList;