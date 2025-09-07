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
    paddingRight: '12px', // Create space for centered scrollbar
    marginRight: '-12px', // Pull container back to use the space
    // Firefox scrollbar styling
    scrollbarWidth: 'thin',
    scrollbarColor: '#CBD5E0 transparent',
  };

  // Sort polls by creation date (newest first)
  const sortedPolls = [...polls].sort((a, b) => 
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return (
    <>
      <style>{`
        .poll-list-container::-webkit-scrollbar {
          width: 12px; /* Match the padding/margin space */
        }
        .poll-list-container::-webkit-scrollbar-track {
          background: transparent;
        }
        .poll-list-container::-webkit-scrollbar-thumb {
          background-color: #CBD5E0;
          border-radius: 6px;
          border: 2px solid transparent;
          background-clip: padding-box;
        }
        .poll-list-container::-webkit-scrollbar-thumb:hover {
          background-color: #9CA3AF;
        }
      `}</style>
      <div className="poll-list-container" style={containerStyle}>
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
    </>
  );
};

export default PollList;