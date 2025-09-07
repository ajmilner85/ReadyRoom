import React, { useState } from 'react';
import { ThumbsUp, ThumbsDown, Calendar, User } from 'lucide-react';
import type { ChangeLogPostWithStats } from '../../../types/ChangeLogTypes';
import MarkdownRenderer from './MarkdownRenderer';

interface ChangeLogPostProps {
  post: ChangeLogPostWithStats;
  onReact?: (postId: string, type: 'thumbs_up' | 'thumbs_down') => Promise<void>;
  onRemoveReaction?: (postId: string) => Promise<void>;
  primaryColor: string;
  accentColor: string;
}

const ChangeLogPost: React.FC<ChangeLogPostProps> = ({ 
  post, 
  onReact, 
  onRemoveReaction, 
  primaryColor, 
  accentColor 
}) => {
  const [isReacting, setIsReacting] = useState<string | null>(null);

  const handleReaction = async (type: 'thumbs_up' | 'thumbs_down') => {
    if (!onReact || !onRemoveReaction || isReacting) return;
    
    try {
      setIsReacting(type);
      
      // If user already has this reaction, remove it
      if (post.stats.user_reaction === type) {
        await onRemoveReaction(post.id);
      } else {
        await onReact(post.id, type);
      }
    } catch (error) {
      console.error('Error reacting to post:', error);
    } finally {
      setIsReacting(null);
    }
  };

  // Format date
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
    
    if (diffInHours < 1) {
      return 'Just now';
    } else if (diffInHours < 24) {
      return `${diffInHours}h ago`;
    } else if (diffInHours < 72) {
      const diffInDays = Math.floor(diffInHours / 24);
      return `${diffInDays}d ago`;
    } else {
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
      });
    }
  };

  const containerStyle: React.CSSProperties = {
    border: '1px solid #E5E7EB',
    borderRadius: '8px',
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  };

  const headerStyle: React.CSSProperties = {
    padding: '16px 20px 12px 20px',
    borderBottom: '1px solid #F3F4F6',
  };

  const titleStyle: React.CSSProperties = {
    fontSize: '16px',
    fontWeight: 600,
    color: '#1F2937',
    margin: '0 0 8px 0',
    lineHeight: '1.4',
  };

  const metaStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    fontSize: '12px',
    color: '#6B7280',
  };

  const metaItemStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  };

  const contentStyle: React.CSSProperties = {
    padding: '16px 20px',
  };

  const footerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 20px 16px 20px',
    borderTop: '1px solid #F3F4F6',
  };

  const reactionsStyle: React.CSSProperties = {
    display: 'flex',
    gap: '8px',
  };

  const getReactionButtonStyle = (type: 'thumbs_up' | 'thumbs_down', isActive: boolean) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    borderRadius: '16px',
    border: `1px solid ${isActive ? primaryColor : '#E5E7EB'}`,
    backgroundColor: isActive ? `${primaryColor}10` : '#FFFFFF',
    color: isActive ? primaryColor : '#6B7280',
    cursor: onReact ? 'pointer' : 'default',
    fontSize: '12px',
    fontWeight: 500,
    transition: 'all 0.2s ease',
  });

  const statsStyle: React.CSSProperties = {
    fontSize: '12px',
    color: '#9CA3AF',
  };

  const canReact = Boolean(onReact && onRemoveReaction);

  return (
    <article style={containerStyle}>
      {/* Header */}
      <header style={headerStyle}>
        <h2 style={titleStyle}>{post.title}</h2>
        <div style={metaStyle}>
          <div style={metaItemStyle}>
            <Calendar size={12} />
            <span>{formatDate(post.created_at)}</span>
          </div>
          {post.author_name && (
            <div style={metaItemStyle}>
              <User size={12} />
              <span>{post.author_name}</span>
            </div>
          )}
        </div>
      </header>

      {/* Content */}
      <div style={contentStyle}>
        <MarkdownRenderer 
          content={post.content} 
          primaryColor={primaryColor}
        />
      </div>

      {/* Footer with Reactions */}
      <footer style={footerStyle}>
        <div style={reactionsStyle}>
          <button
            onClick={() => canReact && handleReaction('thumbs_up')}
            style={getReactionButtonStyle('thumbs_up', post.stats.user_reaction === 'thumbs_up')}
            disabled={!canReact || isReacting === 'thumbs_up'}
            onMouseEnter={e => {
              if (canReact && post.stats.user_reaction !== 'thumbs_up') {
                e.currentTarget.style.backgroundColor = '#F9FAFB';
                e.currentTarget.style.borderColor = '#D1D5DB';
              }
            }}
            onMouseLeave={e => {
              if (canReact && post.stats.user_reaction !== 'thumbs_up') {
                e.currentTarget.style.backgroundColor = '#FFFFFF';
                e.currentTarget.style.borderColor = '#E5E7EB';
              }
            }}
          >
            {isReacting === 'thumbs_up' ? (
              <div style={{
                width: '12px',
                height: '12px',
                border: '2px solid currentColor',
                borderTopColor: 'transparent',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }} />
            ) : (
              <ThumbsUp size={12} />
            )}
            <span>{post.stats.thumbs_up_count}</span>
          </button>

          <button
            onClick={() => canReact && handleReaction('thumbs_down')}
            style={getReactionButtonStyle('thumbs_down', post.stats.user_reaction === 'thumbs_down')}
            disabled={!canReact || isReacting === 'thumbs_down'}
            onMouseEnter={e => {
              if (canReact && post.stats.user_reaction !== 'thumbs_down') {
                e.currentTarget.style.backgroundColor = '#F9FAFB';
                e.currentTarget.style.borderColor = '#D1D5DB';
              }
            }}
            onMouseLeave={e => {
              if (canReact && post.stats.user_reaction !== 'thumbs_down') {
                e.currentTarget.style.backgroundColor = '#FFFFFF';
                e.currentTarget.style.borderColor = '#E5E7EB';
              }
            }}
          >
            {isReacting === 'thumbs_down' ? (
              <div style={{
                width: '12px',
                height: '12px',
                border: '2px solid currentColor',
                borderTopColor: 'transparent',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }} />
            ) : (
              <ThumbsDown size={12} />
            )}
            <span>{post.stats.thumbs_down_count}</span>
          </button>
        </div>

        <div style={statsStyle}>
          {post.stats.thumbs_up_count + post.stats.thumbs_down_count > 0 && (
            `${post.stats.thumbs_up_count + post.stats.thumbs_down_count} reaction${post.stats.thumbs_up_count + post.stats.thumbs_down_count !== 1 ? 's' : ''}`
          )}
        </div>
      </footer>
    </article>
  );
};

export default ChangeLogPost;