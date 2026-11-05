import React, { useState } from 'react';
import { Check, Users } from 'lucide-react';
import type { PollWithResults } from '../../../types/PollTypes';

interface PollItemProps {
  poll: PollWithResults;
  onVote?: (pollId: string, optionId: string) => Promise<void>;
  onRemoveVote?: (pollId: string) => Promise<void>;
  primaryColor: string;
}

const PollItem: React.FC<PollItemProps> = ({ 
  poll, 
  onVote, 
  onRemoveVote, 
  primaryColor 
}) => {
  const [isVoting, setIsVoting] = useState<string | null>(null);

  const handleVote = async (optionId: string) => {
    if (!onVote || isVoting) return;
    
    try {
      setIsVoting(optionId);
      
      // If user already voted for this option, remove the vote
      if (poll.userVote === optionId) {
        await onRemoveVote?.(poll.id);
      } else {
        await onVote(poll.id, optionId);
      }
    } catch (error) {
      console.error('Error voting:', error);
    } finally {
      setIsVoting(null);
    }
  };

  const containerStyle: React.CSSProperties = {
    border: '1px solid var(--rr-border)',
    borderRadius: '8px',
    padding: '20px',
    backgroundColor: 'var(--rr-panel2)',
  };

  const titleStyle: React.CSSProperties = {
    fontSize: '16px',
    fontWeight: 600,
    color: 'var(--rr-text)',
    margin: '0 0 8px 0',
  };

  const descriptionStyle: React.CSSProperties = {
    fontSize: '14px',
    color: 'var(--rr-text2)',
    margin: '0 0 16px 0',
    lineHeight: '1.5',
  };

  const optionsStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    marginBottom: '16px',
  };

  const statsStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '12px',
    color: 'var(--rr-text2)',
  };

  // Sort options by their order
  const sortedOptions = [...poll.options].sort((a, b) => a.order - b.order);

  return (
    <div style={containerStyle}>
      {/* Title and Description */}
      <h3 style={titleStyle}>{poll.title}</h3>
      {poll.description && (
        <p style={descriptionStyle}>{poll.description}</p>
      )}

      {/* Poll Options */}
      <div style={optionsStyle}>
        {sortedOptions.map(option => {
          const result = poll.results[option.id];
          const isSelected = poll.userVote === option.id;
          const isVotingThis = isVoting === option.id;
          const canVote = Boolean(onVote);

          const optionStyle: React.CSSProperties = {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            border: `1px solid ${isSelected ? primaryColor : 'var(--rr-border2)'}`,
            borderRadius: '6px',
            backgroundColor: isSelected ? `color-mix(in srgb, ${primaryColor} 6%, transparent)` : 'var(--rr-panel2)',
            cursor: canVote ? 'pointer' : 'default',
            transition: 'all 0.2s ease',
            position: 'relative',
            overflow: 'hidden',
          };

          const progressBarStyle: React.CSSProperties = {
            position: 'absolute',
            top: 0,
            left: 0,
            height: '100%',
            width: `${result?.percentage || 0}%`,
            backgroundColor: isSelected ? `color-mix(in srgb, ${primaryColor} 13%, transparent)` : `color-mix(in srgb, ${primaryColor} 8%, transparent)`,
            transition: 'width 0.3s ease',
            zIndex: 0,
          };

          const contentStyle: React.CSSProperties = {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            position: 'relative',
            zIndex: 1,
          };

          const textStyle: React.CSSProperties = {
            fontSize: '14px',
            fontWeight: 500,
            color: isSelected ? 'var(--rr-accent-text)' : 'var(--rr-text)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          };

          const statsTextStyle: React.CSSProperties = {
            fontSize: '12px',
            color: 'var(--rr-text2)',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          };

          return (
            <div
              key={option.id}
              style={optionStyle}
              onClick={() => canVote && handleVote(option.id)}
              onMouseEnter={e => {
                if (canVote) {
                  e.currentTarget.style.borderColor = primaryColor;
                }
              }}
              onMouseLeave={e => {
                if (canVote) {
                  e.currentTarget.style.borderColor = isSelected ? primaryColor : 'var(--rr-border2)';
                }
              }}
            >
              {/* Progress bar background */}
              <div style={progressBarStyle} />
              
              {/* Content */}
              <div style={contentStyle}>
                <div style={textStyle}>
                  {isSelected && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '16px',
                      height: '16px',
                      borderRadius: '50%',
                      backgroundColor: primaryColor,
                      color: '#FFFFFF',
                    }}>
                      <Check size={10} />
                    </div>
                  )}
                  {isVotingThis ? (
                    <>
                      <div style={{
                        width: '16px',
                        height: '16px',
                        border: `2px solid color-mix(in srgb, ${primaryColor} 25%, transparent)`,
                        borderTopColor: primaryColor,
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite',
                      }} />
                      Voting...
                    </>
                  ) : (
                    <div style={{ flex: 1, minWidth: 0, marginRight: '16px' }}>
                      <div style={{ 
                        fontWeight: 500,
                        fontSize: '14px',
                        color: isSelected ? 'var(--rr-accent-text)' : 'var(--rr-text)'
                      }}>
                        {(option as any).title || (option as any).text || ''}
                      </div>
                      {(option as any).description && (
                        <div style={{ 
                          fontSize: '12px',
                          color: 'var(--rr-text2)',
                          marginTop: '4px',
                          lineHeight: '1.4',
                          wordWrap: 'break-word',
                          whiteSpace: 'normal'
                        }}>
                          {(option as any).description}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                
                <div style={statsTextStyle}>
                  <span>{result?.count || 0}</span>
                  <span>({result?.percentage || 0}%)</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Total Votes */}
      <div style={statsStyle}>
        <Users size={14} />
        <span>{poll.totalVotes} vote{poll.totalVotes !== 1 ? 's' : ''}</span>
        {poll.totalVotes > 0 && (
          <>
            <span>•</span>
            <span>
              {poll.userVote ? 'You voted' : 'You haven\'t voted'}
            </span>
          </>
        )}
      </div>
    </div>
  );
};

export default PollItem;