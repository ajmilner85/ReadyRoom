import { useState, useEffect, useCallback, useRef } from 'react';
import { changeLogService } from '../utils/changeLogService';
import type { ChangeLogPostWithStats } from '../types/ChangeLogTypes';
import { useAuth } from '../context/AuthContext';

interface UseChangeLogState {
  posts: ChangeLogPostWithStats[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  lastUpdated: Date;
}

interface UseChangeLogReturn extends UseChangeLogState {
  loadMore: () => Promise<void>;
  react: (postId: string, type: 'thumbs_up' | 'thumbs_down') => Promise<void>;
  removeReaction: (postId: string) => Promise<void>;
  refresh: () => Promise<void>;
  optimisticReact: (postId: string, type: 'thumbs_up' | 'thumbs_down') => void;
  rollbackReaction: (postId: string) => void;
}

export const useChangeLog = (enablePolling: boolean = false): UseChangeLogReturn => {
  const { user } = useAuth();
  const [state, setState] = useState<UseChangeLogState>({
    posts: [],
    loading: true,
    error: null,
    hasMore: true,
    lastUpdated: new Date(),
  });

  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastUpdateTimestampRef = useRef<number>(0);
  const nextCursorRef = useRef<string | undefined>(undefined);
  const optimisticUpdatesRef = useRef<Map<string, { oldReaction?: 'thumbs_up' | 'thumbs_down'; newReaction?: 'thumbs_up' | 'thumbs_down' }>>(new Map());

  // Load initial posts
  const loadPosts = useCallback(async (reset: boolean = true) => {
    try {
      setState(prev => ({ ...prev, loading: true, error: null }));
      
      const response = await changeLogService.getPosts(20);
      
      setState(prev => ({
        ...prev,
        posts: reset ? response.posts : [...prev.posts, ...response.posts],
        hasMore: response.hasMore,
        loading: false,
        lastUpdated: new Date(),
      }));

      nextCursorRef.current = response.nextCursor;
      lastUpdateTimestampRef.current = Date.now();
    } catch (error) {
      // If API endpoints don't exist yet, show empty state instead of error
      if (error instanceof Error && error.message.includes('Cannot GET')) {
        setState(prev => ({
          ...prev,
          posts: [],
          hasMore: false,
          loading: false,
          error: null,
          lastUpdated: new Date(),
        }));
      } else {
        setState(prev => ({
          ...prev,
          error: error instanceof Error ? error.message : 'Failed to load change log',
          loading: false,
        }));
      }
    }
  }, []);

  // Load more posts (pagination)
  const loadMore = useCallback(async () => {
    if (!state.hasMore || state.loading) return;

    try {
      setState(prev => ({ ...prev, loading: true }));
      
      const response = await changeLogService.getPosts(20, nextCursorRef.current);
      
      setState(prev => ({
        ...prev,
        posts: [...prev.posts, ...response.posts],
        hasMore: response.hasMore,
        loading: false,
      }));

      nextCursorRef.current = response.nextCursor;
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to load more posts',
        loading: false,
      }));
    }
  }, [state.hasMore, state.loading]);

  // Poll for reaction updates
  const pollForUpdates = useCallback(async () => {
    try {
      const updates = await changeLogService.getUpdates();
      
      if (Object.keys(updates).length === 0) {
        return; // No updates
      }

      setState(prev => {
        const updatedPosts = prev.posts.map(post => {
          const update = updates[post.id];
          if (update) {
            // Update reactions
            const updatedPost = {
              ...post,
              reactions: update.reactions,
            };
            
            // Recalculate stats
            return changeLogService.calculateStats(updatedPost, user?.id);
          }
          return post;
        });

        return {
          ...prev,
          posts: updatedPosts,
          lastUpdated: new Date(),
        };
      });

      // Update timestamp for next poll
      const latestTimestamp = Math.max(...Object.values(updates).map(u => u.timestamp));
      if (latestTimestamp > lastUpdateTimestampRef.current) {
        lastUpdateTimestampRef.current = latestTimestamp;
      }
    } catch (error) {
      console.error('Error polling for change log updates:', error);
    }
  }, [user?.id]);

  // Optimistic reaction update
  const optimisticReact = useCallback((postId: string, type: 'thumbs_up' | 'thumbs_down') => {
    if (!user?.id) return;

    setState(prev => {
      const postIndex = prev.posts.findIndex(p => p.id === postId);
      if (postIndex === -1) return prev;

      const post = prev.posts[postIndex];
      const currentReaction = post.stats.user_reaction;
      
      // Store for potential rollback
      optimisticUpdatesRef.current.set(postId, {
        oldReaction: currentReaction || undefined,
        newReaction: type,
      });

      // Update reactions
      const newReactions = {
        thumbs_up: [...(post.reactions.thumbs_up || [])],
        thumbs_down: [...(post.reactions.thumbs_down || [])],
      };

      // Remove user from all reaction types
      newReactions.thumbs_up = newReactions.thumbs_up.filter(id => id !== user.id);
      newReactions.thumbs_down = newReactions.thumbs_down.filter(id => id !== user.id);

      // Add user to the new reaction type
      newReactions[type].push(user.id);

      const updatedPost = {
        ...post,
        reactions: newReactions,
      };

      const postWithStats = changeLogService.calculateStats(updatedPost, user.id);

      const newPosts = [...prev.posts];
      newPosts[postIndex] = postWithStats;

      return {
        ...prev,
        posts: newPosts,
      };
    });
  }, [user?.id]);

  // Rollback optimistic reaction
  const rollbackReaction = useCallback((postId: string) => {
    if (!user?.id) return;

    const optimisticUpdate = optimisticUpdatesRef.current.get(postId);
    if (!optimisticUpdate) return;

    setState(prev => {
      const postIndex = prev.posts.findIndex(p => p.id === postId);
      if (postIndex === -1) return prev;

      const post = prev.posts[postIndex];
      
      // Restore original reaction state
      const newReactions = {
        thumbs_up: [...(post.reactions.thumbs_up || [])],
        thumbs_down: [...(post.reactions.thumbs_down || [])],
      };

      // Remove user from all reaction types
      newReactions.thumbs_up = newReactions.thumbs_up.filter(id => id !== user.id);
      newReactions.thumbs_down = newReactions.thumbs_down.filter(id => id !== user.id);

      // Add user back to original reaction if they had one
      if (optimisticUpdate.oldReaction) {
        newReactions[optimisticUpdate.oldReaction].push(user.id);
      }

      const updatedPost = {
        ...post,
        reactions: newReactions,
      };

      const postWithStats = changeLogService.calculateStats(updatedPost, user.id);

      const newPosts = [...prev.posts];
      newPosts[postIndex] = postWithStats;

      return {
        ...prev,
        posts: newPosts,
      };
    });

    // Clear optimistic update
    optimisticUpdatesRef.current.delete(postId);
  }, [user?.id]);

  // React function with optimistic updates
  const react = useCallback(async (postId: string, type: 'thumbs_up' | 'thumbs_down') => {
    if (!user?.id) return;

    // Apply optimistic update
    optimisticReact(postId, type);

    try {
      await changeLogService.reactToPost(postId, { type });
      // Clear optimistic update on success
      optimisticUpdatesRef.current.delete(postId);
    } catch (error) {
      // Rollback on error
      rollbackReaction(postId);
      throw error;
    }
  }, [user?.id, optimisticReact, rollbackReaction]);

  // Remove reaction function
  const removeReaction = useCallback(async (postId: string) => {
    if (!user?.id) return;

    // Apply optimistic update (remove reaction)
    setState(prev => {
      const postIndex = prev.posts.findIndex(p => p.id === postId);
      if (postIndex === -1) return prev;

      const post = prev.posts[postIndex];
      const currentReaction = post.stats.user_reaction;
      
      // Store for potential rollback
      optimisticUpdatesRef.current.set(postId, {
        oldReaction: currentReaction || undefined,
        newReaction: undefined,
      });

      // Remove user from all reactions
      const newReactions = {
        thumbs_up: post.reactions.thumbs_up.filter(id => id !== user.id),
        thumbs_down: post.reactions.thumbs_down.filter(id => id !== user.id),
      };

      const updatedPost = {
        ...post,
        reactions: newReactions,
      };

      const postWithStats = changeLogService.calculateStats(updatedPost, user.id);

      const newPosts = [...prev.posts];
      newPosts[postIndex] = postWithStats;

      return {
        ...prev,
        posts: newPosts,
      };
    });

    try {
      await changeLogService.removeReaction(postId);
      // Clear optimistic update on success
      optimisticUpdatesRef.current.delete(postId);
    } catch (error) {
      // Rollback on error
      rollbackReaction(postId);
      throw error;
    }
  }, [user?.id, rollbackReaction]);

  // Refresh function
  const refresh = useCallback(async () => {
    nextCursorRef.current = undefined;
    await loadPosts(true);
  }, [loadPosts]);

  // Initial load
  useEffect(() => {
    loadPosts(true);
  }, [loadPosts]);

  // Set up polling for real-time updates
  useEffect(() => {
    if (!enablePolling) return;

    const startPolling = () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
      
      // Poll every 45 seconds
      pollingIntervalRef.current = setInterval(pollForUpdates, 45000);
    };

    // Start polling after initial load
    if (!state.loading) {
      startPolling();
    }

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [enablePolling, pollForUpdates, state.loading]);

  return {
    ...state,
    loadMore,
    react,
    removeReaction,
    refresh,
    optimisticReact,
    rollbackReaction,
  };
};