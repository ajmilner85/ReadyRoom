import React, { useRef, useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { ChangeLogPostWithStats } from '../../../types/ChangeLogTypes';
import ChangeLogPost from './ChangeLogPost';
import LoadingSpinner from '../LoadingSpinner';

interface ChangeLogFeedProps {
  posts: ChangeLogPostWithStats[];
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => Promise<void>;
  onReact?: (postId: string, type: 'thumbs_up' | 'thumbs_down') => Promise<void>;
  onRemoveReaction?: (postId: string) => Promise<void>;
  primaryColor: string;
  accentColor: string;
}

const ChangeLogFeed: React.FC<ChangeLogFeedProps> = ({ 
  posts, 
  hasMore, 
  loading, 
  onLoadMore, 
  onReact, 
  onRemoveReaction, 
  primaryColor, 
  accentColor 
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minHeight: 0,
    position: 'relative',
  };

  const scrollAreaStyle: React.CSSProperties = {
    flex: 1,
    overflowY: 'auto',
    paddingRight: '4px', // Space for scrollbar
  };

  const feedStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  };

  const loadMoreStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'center',
    padding: '16px',
    marginTop: '8px',
  };

  const loadMoreButtonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    border: '1px solid #D1D5DB',
    borderRadius: '6px',
    backgroundColor: '#FFFFFF',
    color: '#6B7280',
    cursor: 'pointer',
    fontSize: '14px',
    transition: 'all 0.2s ease',
  };

  const scrollButtonStyle: React.CSSProperties = {
    position: 'absolute',
    bottom: '8px',
    right: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    borderRadius: '16px',
    backgroundColor: primaryColor,
    color: '#FFFFFF',
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
    transition: 'all 0.2s ease',
    opacity: showScrollButton ? 1 : 0,
    pointerEvents: showScrollButton ? 'auto' : 'none',
  };

  // Handle scroll to show/hide scroll button
  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
      setShowScrollButton(scrollTop > 200 && !isNearBottom);
    };

    scrollContainer.addEventListener('scroll', handleScroll);
    return () => scrollContainer.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToBottom = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  };

  const handleLoadMore = async () => {
    if (loading) return;
    await onLoadMore();
  };

  return (
    <div style={containerStyle}>
      <div ref={scrollContainerRef} style={scrollAreaStyle}>
        <div style={feedStyle}>
          {posts.map(post => (
            <ChangeLogPost
              key={post.id}
              post={post}
              onReact={onReact}
              onRemoveReaction={onRemoveReaction}
              primaryColor={primaryColor}
              accentColor={accentColor}
            />
          ))}
        </div>

        {/* Load More Button */}
        {hasMore && (
          <div style={loadMoreStyle}>
            {loading ? (
              <LoadingSpinner size="sm" />
            ) : (
              <button
                onClick={handleLoadMore}
                style={loadMoreButtonStyle}
                onMouseEnter={e => {
                  e.currentTarget.style.backgroundColor = '#F9FAFB';
                  e.currentTarget.style.borderColor = '#9CA3AF';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.backgroundColor = '#FFFFFF';
                  e.currentTarget.style.borderColor = '#D1D5DB';
                }}
              >
                Load More Posts
              </button>
            )}
          </div>
        )}
      </div>

      {/* Scroll to Bottom Button */}
      <button
        onClick={scrollToBottom}
        style={scrollButtonStyle}
        onMouseEnter={e => {
          e.currentTarget.style.transform = 'scale(1.1)';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.transform = 'scale(1)';
        }}
        title="Scroll to newest posts"
      >
        <ChevronDown size={16} />
      </button>
    </div>
  );
};

export default ChangeLogFeed;