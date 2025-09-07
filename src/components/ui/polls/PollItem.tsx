import React, { useState } from 'react';
import { Check, Users } from 'lucide-react';
import type { PollWithResults } from '../../../types/PollTypes';

interface PollItemProps {
  poll: PollWithResults;
  onVote?: (pollId: string, optionId: string) => Promise<void>;
  onRemoveVote?: (pollId: string) => Promise<void>;
  primaryColor: string;
  accentColor: string;
}

const PollItem: React.FC<PollItemProps> = ({ 
  poll, 
  onVote, 
  onRemoveVote, 
  primaryColor, 
  accentColor 
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
    border: '1px solid #E5E7EB',
    borderRadius: '8px',
    padding: '20px',
    backgroundColor: '#FAFAFA',
  };

  const titleStyle: React.CSSProperties = {
    fontSize: '16px',
    fontWeight: 600,
    color: '#1F2937',
    margin: '0 0 8px 0',
  };

  const descriptionStyle: React.CSSProperties = {
    fontSize: '14px',
    color: '#6B7280',
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
    color: '#6B7280',
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
            border: `1px solid ${isSelected ? primaryColor : '#D1D5DB'}`,
            borderRadius: '6px',
            backgroundColor: isSelected ? `${primaryColor}10` : '#FFFFFF',
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
            backgroundColor: isSelected ? `${primaryColor}20` : `${primaryColor}08`,
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
            color: isSelected ? primaryColor : '#374151',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          };

          const statsTextStyle: React.CSSProperties = {
            fontSize: '12px',
            color: '#6B7280',
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
                  e.currentTarget.style.borderColor = isSelected ? primaryColor : '#D1D5DB';
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
                        border: `2px solid ${primaryColor}40`,
                        borderTopColor: primaryColor,
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite',
                      }} />
                      Voting...
                    </>
                  ) : (
                    <div style={{ flex: 1, maxWidth: '75%' }}>
                      <div style={{ 
                        fontWeight: 500,
                        fontSize: '14px',
                        color: isSelected ? primaryColor : '#374151'
                      }}>
                        {(option as any).title || (option as any).text || ''}
                      </div>
                      {(option as any).description && (
                        <div style={{ 
                          fontSize: '12px',
                          color: '#6B7280',
                          marginTop: '4px',
                          lineHeight: '1.4',
                          wordWrap: 'break-word'
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