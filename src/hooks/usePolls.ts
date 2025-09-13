import { useState, useEffect, useCallback, useRef } from 'react';
import { pollService } from '../utils/pollService';
import type { PollWithResults } from '../types/PollTypes';
import { useAuth } from '../context/AuthContext';

interface UsePollsState {
  polls: PollWithResults[];
  loading: boolean;
  error: string | null;
  lastUpdated: Date;
}

interface UsePollsReturn extends UsePollsState {
  vote: (pollId: string, optionId: string) => Promise<void>;
  removeVote: (pollId: string) => Promise<void>;
  refresh: () => Promise<void>;
  optimisticVote: (pollId: string, optionId: string) => void;
  rollbackVote: (pollId: string) => void;
}

export const usePolls = (enablePolling: boolean = false): UsePollsReturn => {
  const { user } = useAuth();
  const [state, setState] = useState<UsePollsState>({
    polls: [],
    loading: true,
    error: null,
    lastUpdated: new Date(),
  });

  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastUpdateTimestampRef = useRef<number>(0);
  const optimisticUpdatesRef = useRef<Map<string, { oldVote?: string; newVote?: string }>>(new Map());

  // Load initial polls data
  const loadPolls = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, loading: true, error: null }));
      const polls = await pollService.getActivePolls();
      setState(prev => ({
        ...prev,
        polls,
        loading: false,
        lastUpdated: new Date(),
      }));
      lastUpdateTimestampRef.current = Date.now();
    } catch (error) {
      // If API endpoints don't exist yet, show empty state instead of error
      if (error instanceof Error && error.message.includes('Cannot GET')) {
        setState(prev => ({
          ...prev,
          polls: [],
          loading: false,
          error: null,
          lastUpdated: new Date(),
        }));
      } else {
        setState(prev => ({
          ...prev,
          error: error instanceof Error ? error.message : 'Failed to load polls',
          loading: false,
        }));
      }
    }
  }, []);

  // Poll for updates
  const pollForUpdates = useCallback(async () => {
    try {
      const updates = await pollService.getPollUpdates();
      
      if (Object.keys(updates).length === 0) {
        return; // No updates
      }

      setState(prev => {
        const updatedPolls = prev.polls.map(poll => {
          const update = updates[poll.id];
          if (update) {
            // Merge new votes with existing poll data
            const updatedPoll = {
              ...poll,
              votes: update.votes,
            };
            
            // Recalculate results
            return pollService.calculateResults(updatedPoll, user?.id);
          }
          return poll;
        });

        return {
          ...prev,
          polls: updatedPolls,
          lastUpdated: new Date(),
        };
      });

      // Update timestamp for next poll
      const latestTimestamp = Math.max(...Object.values(updates).map(u => u.timestamp));
      if (latestTimestamp > lastUpdateTimestampRef.current) {
        lastUpdateTimestampRef.current = latestTimestamp;
      }
    } catch (error) {
      // Only log error if it's not the expected "endpoint doesn't exist" error
      if (error instanceof Error && !error.message.includes('Cannot GET')) {
        console.error('Error polling for poll updates:', error);
      }
    }
  }, [user?.id]);

  // Optimistic vote update
  const optimisticVote = useCallback((pollId: string, optionId: string) => {
    if (!user?.id) return;

    setState(prev => {
      const pollIndex = prev.polls.findIndex(p => p.id === pollId);
      if (pollIndex === -1) return prev;

      const poll = prev.polls[pollIndex];
      const currentVote = poll.votes.find(v => v.user_id === user.id);
      
      // Store for potential rollback
      optimisticUpdatesRef.current.set(pollId, {
        oldVote: currentVote?.option_id,
        newVote: optionId,
      });

      // Create new votes array
      const newVotes = poll.votes.filter(v => v.user_id !== user.id);
      newVotes.push({
        user_id: user.id,
        option_id: optionId,
        timestamp: new Date().toISOString(),
      });

      // Update poll with new votes
      const updatedPoll = { ...poll, votes: newVotes };
      const pollWithResults = pollService.calculateResults(updatedPoll, user.id);

      const newPolls = [...prev.polls];
      newPolls[pollIndex] = pollWithResults;

      return {
        ...prev,
        polls: newPolls,
      };
    });
  }, [user?.id]);

  // Rollback optimistic vote
  const rollbackVote = useCallback((pollId: string) => {
    if (!user?.id) return;

    const optimisticUpdate = optimisticUpdatesRef.current.get(pollId);
    if (!optimisticUpdate) return;

    setState(prev => {
      const pollIndex = prev.polls.findIndex(p => p.id === pollId);
      if (pollIndex === -1) return prev;

      const poll = prev.polls[pollIndex];
      
      // Restore original vote state
      const newVotes = poll.votes.filter(v => v.user_id !== user.id);
      if (optimisticUpdate.oldVote) {
        newVotes.push({
          user_id: user.id,
          option_id: optimisticUpdate.oldVote,
          timestamp: new Date().toISOString(),
        });
      }

      const updatedPoll = { ...poll, votes: newVotes };
      const pollWithResults = pollService.calculateResults(updatedPoll, user.id);

      const newPolls = [...prev.polls];
      newPolls[pollIndex] = pollWithResults;

      return {
        ...prev,
        polls: newPolls,
      };
    });

    // Clear optimistic update
    optimisticUpdatesRef.current.delete(pollId);
  }, [user?.id]);

  // Vote function with optimistic updates
  const vote = useCallback(async (pollId: string, optionId: string) => {
    if (!user?.id) return;

    // Apply optimistic update
    optimisticVote(pollId, optionId);

    try {
      await pollService.vote(pollId, { option_id: optionId });
      // Clear optimistic update on success
      optimisticUpdatesRef.current.delete(pollId);
    } catch (error) {
      // Rollback on error
      rollbackVote(pollId);
      throw error;
    }
  }, [user?.id, optimisticVote, rollbackVote]);

  // Remove vote function
  const removeVote = useCallback(async (pollId: string) => {
    if (!user?.id) return;

    // Apply optimistic update (remove vote)
    setState(prev => {
      const pollIndex = prev.polls.findIndex(p => p.id === pollId);
      if (pollIndex === -1) return prev;

      const poll = prev.polls[pollIndex];
      const currentVote = poll.votes.find(v => v.user_id === user.id);
      
      // Store for potential rollback
      optimisticUpdatesRef.current.set(pollId, {
        oldVote: currentVote?.option_id,
        newVote: undefined,
      });

      // Remove user's vote
      const newVotes = poll.votes.filter(v => v.user_id !== user.id);
      const updatedPoll = { ...poll, votes: newVotes };
      const pollWithResults = pollService.calculateResults(updatedPoll, user.id);

      const newPolls = [...prev.polls];
      newPolls[pollIndex] = pollWithResults;

      return {
        ...prev,
        polls: newPolls,
      };
    });

    try {
      await pollService.removeVote(pollId);
      // Clear optimistic update on success
      optimisticUpdatesRef.current.delete(pollId);
    } catch (error) {
      // Rollback on error
      rollbackVote(pollId);
      throw error;
    }
  }, [user?.id, rollbackVote]);

  // Refresh function
  const refresh = useCallback(async () => {
    await loadPolls();
  }, [loadPolls]);

  // Initial load
  useEffect(() => {
    loadPolls();
  }, [loadPolls]);

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
    vote,
    removeVote,
    refresh,
    optimisticVote,
    rollbackVote,
  };
};