import type { Poll, PollWithResults, CreatePollRequest, UpdatePollRequest, VoteRequest, PollUpdates } from '../types/PollTypes';
import { supabase, getCurrentUser } from './supabaseClient';

// Get all active polls with results
export const getActivePolls = async (): Promise<PollWithResults[]> => {
  console.log('getActivePolls: Starting query...');
  
  const { data: polls, error } = await supabase
    .from('polls')
    .select('*')
    .eq('is_active', true)
    .is('archived_at', null)
    .order('created_at', { ascending: false });

  console.log('getActivePolls: Query result:', { polls, error });

  if (error) {
    console.error('getActivePolls: Database error:', error);
    throw error;
  }

  // Calculate results for each poll
  const pollsWithResults = await Promise.all(
    (polls || []).map(async (poll) => calculateResults(poll))
  );

  return pollsWithResults;
};

// Get all polls (including archived) - admin only
export const getAllPolls = async (): Promise<PollWithResults[]> => {
  const { data: polls, error } = await supabase
    .from('polls')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;

  // Calculate results for each poll
  const pollsWithResults = await Promise.all(
    (polls || []).map(async (poll) => calculateResults(poll))
  );

  return pollsWithResults;
};

// Get a specific poll by ID
export const getPoll = async (id: string): Promise<PollWithResults> => {
  const { data: poll, error } = await supabase
    .from('polls')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;

  return calculateResults(poll);
};

// Create a new poll
export const createPoll = async (poll: CreatePollRequest): Promise<Poll> => {
  console.log('createPoll: Starting poll creation...', poll);
  
  const { user, error: userError } = await getCurrentUser();
  if (userError || !user) {
    console.error('createPoll: User authentication error:', userError);
    throw userError || new Error('User not authenticated');
  }

  console.log('createPoll: Authenticated user:', user);

  // Get the user profile ID from the user_profiles table
  const { data: userProfile, error: profileError } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .single();

  console.log('createPoll: User profile lookup:', { userProfile, profileError });

  if (profileError || !userProfile) {
    console.error('createPoll: Failed to find user profile:', profileError);
    throw new Error('User profile not found');
  }

  const profileId = userProfile.id;

  // Generate unique IDs for options
  const optionsWithIds = poll.options.map((option, index) => ({
    id: `option_${Date.now()}_${index}`,
    title: option.title,
    description: option.description || null,
    order: option.order
  }));

  console.log('createPoll: Options with IDs:', optionsWithIds);

  const insertData = {
    title: poll.title,
    description: poll.description || null,
    options: optionsWithIds,
    votes: [],
    created_by: profileId,
    is_active: true,
    archived_at: null
  };

  console.log('createPoll: Insert data:', insertData);

  const { data: newPoll, error } = await supabase
    .from('polls')
    .insert(insertData)
    .select()
    .single();

  console.log('createPoll: Database response:', { newPoll, error });

  if (error) {
    console.error('createPoll: Database error:', error);
    throw error;
  }

  console.log('createPoll: Success!', newPoll);
  return newPoll;
};

// Update an existing poll
export const updatePoll = async (id: string, updates: UpdatePollRequest): Promise<Poll> => {
  const updateData: any = {};
  
  if (updates.title !== undefined) updateData.title = updates.title;
  if (updates.description !== undefined) updateData.description = updates.description || null;
  
  // Handle options update with proper IDs
  if (updates.options !== undefined) {
    const optionsWithIds = updates.options.map((option, index) => ({
      id: `option_${Date.now()}_${index}`,
      title: option.title,
      description: option.description || null,
      order: option.order
    }));
    updateData.options = optionsWithIds;
  }

  const { data: updatedPoll, error } = await supabase
    .from('polls')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;

  return updatedPoll;
};

// Delete a poll
export const deletePoll = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('polls')
    .delete()
    .eq('id', id);

  if (error) throw error;
};

// Archive a poll
export const archivePoll = async (id: string): Promise<Poll> => {
  const { data: updatedPoll, error } = await supabase
    .from('polls')
    .update({ 
      archived_at: new Date().toISOString(),
      is_active: false
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;

  return updatedPoll;
};

// Activate a poll
export const activatePoll = async (id: string): Promise<Poll> => {
  const { data: updatedPoll, error } = await supabase
    .from('polls')
    .update({ is_active: true })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;

  return updatedPoll;
};

// Deactivate a poll
export const deactivatePoll = async (id: string): Promise<Poll> => {
  const { data: updatedPoll, error } = await supabase
    .from('polls')
    .update({ is_active: false })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;

  return updatedPoll;
};

// Submit or update a vote
export const vote = async (pollId: string, voteRequest: VoteRequest): Promise<void> => {
  const { user, error: userError } = await getCurrentUser();
  if (userError || !user) {
    throw userError || new Error('User not authenticated');
  }

  // Get the user profile ID
  const { data: userProfile, error: profileError } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .single();

  if (profileError || !userProfile) {
    throw new Error('User profile not found');
  }

  const profileId = userProfile.id;

  // Get current poll
  const { data: poll, error: pollError } = await supabase
    .from('polls')
    .select('votes')
    .eq('id', pollId)
    .single();

  if (pollError) throw pollError;

  // Remove any existing vote by this user
  const existingVotes = (poll.votes as any[]).filter((v: any) => v.user_id !== profileId);
  
  // Add new vote
  const newVotes = [
    ...existingVotes,
    {
      user_id: profileId,
      option_id: voteRequest.option_id,
      timestamp: new Date().toISOString()
    }
  ];

  const { error: updateError } = await supabase
    .from('polls')
    .update({ votes: newVotes })
    .eq('id', pollId);

  if (updateError) throw updateError;
};

// Remove a vote
export const removeVote = async (pollId: string): Promise<void> => {
  const { user, error: userError } = await getCurrentUser();
  if (userError || !user) {
    throw userError || new Error('User not authenticated');
  }

  // Get the user profile ID
  const { data: userProfile, error: profileError } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .single();

  if (profileError || !userProfile) {
    throw new Error('User profile not found');
  }

  const profileId = userProfile.id;

  // Get current poll
  const { data: poll, error: pollError } = await supabase
    .from('polls')
    .select('votes')
    .eq('id', pollId)
    .single();

  if (pollError) throw pollError;

  // Remove vote by this user
  const updatedVotes = (poll.votes as any[]).filter((v: any) => v.user_id !== profileId);

  const { error: updateError } = await supabase
    .from('polls')
    .update({ votes: updatedVotes })
    .eq('id', pollId);

  if (updateError) throw updateError;
};

// Get poll results without voting (same as getPoll but more semantic)
export const getPollResults = async (id: string): Promise<PollWithResults> => {
  return getPoll(id);
};

// Get updates for real-time polling (simplified - just return empty for now)
export const getPollUpdates = async (since?: number): Promise<PollUpdates> => {
  // For now, return empty updates - real-time updates can be implemented later
  return {};
};

// Calculate poll results from raw poll data (client-side utility)
export const calculateResults = async (poll: Poll, currentUserId?: string): Promise<PollWithResults> => {
  // If no currentUserId provided, try to get from current user
  let userId = currentUserId;
  if (!userId) {
    const { user } = await getCurrentUser();
    if (user) {
      // Get the user profile ID
      const { data: userProfile } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('auth_user_id', user.id)
        .single();
      
      userId = userProfile?.id;
    }
  }

  const results: { [optionId: string]: { count: number; percentage: number; voters: string[] } } = {};
  const votes = (poll.votes as any[]) || [];
  const totalVotes = votes.length;
  let userVote: string | undefined;

  // Initialize results for all options
  (poll.options as any[]).forEach(option => {
    results[option.id] = {
      count: 0,
      percentage: 0,
      voters: [],
    };
  });

  // Count votes and find user's vote
  votes.forEach((vote: any) => {
    if (results[vote.option_id]) {
      results[vote.option_id].count++;
      results[vote.option_id].voters.push(vote.user_id);
    }

    if (userId && vote.user_id === userId) {
      userVote = vote.option_id;
    }
  });

  // Calculate percentages
  Object.keys(results).forEach(optionId => {
    if (totalVotes > 0) {
      results[optionId].percentage = Math.round((results[optionId].count / totalVotes) * 100);
    }
  });

  return {
    ...poll,
    results,
    totalVotes,
    userVote,
    stats: {
      total_votes: totalVotes,
      user_vote: userVote,
    }
  };
};

// Legacy class-based service for backward compatibility
class PollService {
  async getActivePolls(): Promise<PollWithResults[]> {
    return getActivePolls();
  }

  async getAllPolls(): Promise<PollWithResults[]> {
    return getAllPolls();
  }

  async getPoll(id: string): Promise<PollWithResults> {
    return getPoll(id);
  }

  async createPoll(poll: CreatePollRequest): Promise<Poll> {
    return createPoll(poll);
  }

  async updatePoll(id: string, updates: UpdatePollRequest): Promise<Poll> {
    return updatePoll(id, updates);
  }

  async deletePoll(id: string): Promise<void> {
    return deletePoll(id);
  }

  async archivePoll(id: string): Promise<Poll> {
    return archivePoll(id);
  }

  async activatePoll(id: string): Promise<Poll> {
    return activatePoll(id);
  }

  async deactivatePoll(id: string): Promise<Poll> {
    return deactivatePoll(id);
  }

  async vote(pollId: string, voteRequest: VoteRequest): Promise<void> {
    return vote(pollId, voteRequest);
  }

  async removeVote(pollId: string): Promise<void> {
    return removeVote(pollId);
  }

  async getPollResults(id: string): Promise<PollWithResults> {
    return getPollResults(id);
  }

  async getPollUpdates(since?: number): Promise<PollUpdates> {
    return getPollUpdates(since);
  }

  calculateResults(poll: Poll, currentUserId?: string): PollWithResults {
    // For synchronous compatibility, create a simplified version
    const results: { [optionId: string]: { count: number; percentage: number; voters: string[] } } = {};
    const votes = (poll.votes as any[]) || [];
    const totalVotes = votes.length;
    let userVote: string | undefined;

    // Initialize results for all options
    (poll.options as any[]).forEach(option => {
      results[option.id] = {
        count: 0,
        percentage: 0,
        voters: [],
      };
    });

    // Count votes and find user's vote
    votes.forEach((vote: any) => {
      if (results[vote.option_id]) {
        results[vote.option_id].count++;
        results[vote.option_id].voters.push(vote.user_id);
      }

      if (currentUserId && vote.user_id === currentUserId) {
        userVote = vote.option_id;
      }
    });

    // Calculate percentages
    Object.keys(results).forEach(optionId => {
      if (totalVotes > 0) {
        results[optionId].percentage = Math.round((results[optionId].count / totalVotes) * 100);
      }
    });

    return {
      ...poll,
      results,
      totalVotes,
      userVote,
      stats: {
        total_votes: totalVotes,
        user_vote: userVote,
      }
    };
  }
}

export const pollService = new PollService();