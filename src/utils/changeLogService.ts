import type { 
  ChangeLogPost, 
  ChangeLogPostWithStats, 
  CreatePostRequest, 
  UpdatePostRequest, 
  ReactionRequest, 
  ChangeLogUpdates,
  ChangeLogFeedResponse 
} from '../types/ChangeLogTypes';
import { supabase, getCurrentUser } from './supabaseClient';

// Get change log posts feed with pagination
export const getPosts = async (limit: number = 20, cursor?: string): Promise<ChangeLogFeedResponse> => {
  let query = supabase
    .from('change_log_posts' as any)
    .select(`
      id,
      title,
      content,
      reactions,
      is_archived,
      created_at,
      updated_at,
      created_by,
      user_profiles(
        discord_username,
        pilots(
          boardNumber,
          callsign
        )
      )
    `)
    .eq('is_archived', false)
    .order('created_at', { ascending: false })
    .limit(limit + 1); // Get one extra to check if there are more
    
  if (cursor) {
    query = query.lt('created_at', cursor);
  }

  const { data: posts, error } = await query;

  if (error) {
    throw error;
  }

  // Check if there are more posts
  const hasMore = (posts || []).length > limit;
  const postsToReturn = hasMore ? (posts || []).slice(0, limit) : (posts || []);
  
  // Calculate results for each post
  const postsWithResults = await Promise.all(
    postsToReturn.map(async (post) => calculateStats(post))
  );

  const nextCursor = hasMore && postsToReturn.length > 0 
    ? (postsToReturn[postsToReturn.length - 1] as any).created_at 
    : undefined;

  return {
    posts: postsWithResults,
    hasMore,
    nextCursor
  };
};

// Get all posts (including archived) - admin only
export const getAllPosts = async (limit: number = 50, cursor?: string): Promise<ChangeLogFeedResponse> => {
  let query = supabase
    .from('change_log_posts' as any)
    .select(`
      id,
      title,
      content,
      reactions,
      is_archived,
      created_at,
      updated_at,
      created_by,
      user_profiles(
        discord_username,
        pilots(
          boardNumber,
          callsign
        )
      )
    `)
    .order('created_at', { ascending: false })
    .limit(limit + 1);
    
  if (cursor) {
    query = query.lt('created_at', cursor);
  }

  const { data: posts, error } = await query;

  if (error) throw error;

  // Check if there are more posts
  const hasMore = (posts || []).length > limit;
  const postsToReturn = hasMore ? (posts || []).slice(0, limit) : (posts || []);
  
  // Calculate results for each post
  const postsWithResults = await Promise.all(
    postsToReturn.map(async (post) => calculateStats(post))
  );

  const nextCursor = hasMore && postsToReturn.length > 0 
    ? (postsToReturn[postsToReturn.length - 1] as any).created_at 
    : undefined;

  return {
    posts: postsWithResults,
    hasMore,
    nextCursor
  };
};

// Get a specific post by ID
export const getPost = async (id: string): Promise<ChangeLogPostWithStats> => {
  const { data: post, error } = await supabase
    .from('change_log_posts' as any)
    .select(`
      id,
      title,
      content,
      reactions,
      is_archived,
      created_at,
      updated_at,
      created_by,
      user_profiles!inner(discord_username)
    `)
    .eq('id', id)
    .single();

  if (error) throw error;

  return calculateStats(post);
};

// Create a new post
export const createPost = async (post: CreatePostRequest): Promise<ChangeLogPost> => {
  const { user, error: userError } = await getCurrentUser();
  if (userError || !user) {
    throw userError || new Error('User not authenticated');
  }

  // Get the user profile ID from the user_profiles table
  const { data: userProfile, error: profileError } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .single();

  if (profileError || !userProfile) {
    throw new Error('User profile not found');
  }

  const profileId = userProfile.id;

  const insertData: any = {
    title: post.title,
    content: post.content,
    reactions: { thumbs_up: [], thumbs_down: [] },
    created_by: profileId,
    is_archived: false
  };

  // Add custom creation time if provided
  if (post.created_at) {
    insertData.created_at = post.created_at;
  }

  const { data: newPost, error } = await supabase
    .from('change_log_posts' as any)
    .insert(insertData)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return newPost as unknown as ChangeLogPost;
};

// Update an existing post
export const updatePost = async (id: string, updates: UpdatePostRequest): Promise<ChangeLogPost> => {
  const updateData: any = {};
  
  if (updates.title !== undefined) updateData.title = updates.title;
  if (updates.content !== undefined) updateData.content = updates.content;
  if (updates.is_archived !== undefined) updateData.is_archived = updates.is_archived;
  if (updates.created_at !== undefined) updateData.created_at = updates.created_at;

  const { data: updatedPost, error } = await supabase
    .from('change_log_posts' as any)
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;

  return updatedPost as unknown as ChangeLogPost;
};

// Delete a post
export const deletePost = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('change_log_posts' as any)
    .delete()
    .eq('id', id);

  if (error) throw error;
};

// Archive a post
export const archivePost = async (id: string): Promise<ChangeLogPost> => {
  const { data: updatedPost, error } = await supabase
    .from('change_log_posts' as any)
    .update({ 
      is_archived: true
    } as any)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;

  return updatedPost as unknown as ChangeLogPost;
};

// Unarchive a post
export const unarchivePost = async (id: string): Promise<ChangeLogPost> => {
  const { data: updatedPost, error } = await supabase
    .from('change_log_posts' as any)
    .update({ 
      is_archived: false
    } as any)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;

  return updatedPost as unknown as ChangeLogPost;
};

// Add or update a reaction to a post
export const reactToPost = async (postId: string, reaction: ReactionRequest): Promise<void> => {
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

  // Get current post
  const { data: post, error: postError } = await supabase
    .from('change_log_posts' as any)
    .select('reactions')
    .eq('id', postId)
    .single();

  if (postError) throw postError;

  // Update reactions
  const currentReactions = (post as any).reactions;
  const newReactions = {
    thumbs_up: [...(currentReactions.thumbs_up || [])],
    thumbs_down: [...(currentReactions.thumbs_down || [])]
  };

  // Remove user from all reaction types
  newReactions.thumbs_up = newReactions.thumbs_up.filter((id: string) => id !== profileId);
  newReactions.thumbs_down = newReactions.thumbs_down.filter((id: string) => id !== profileId);

  // Add user to the new reaction type
  newReactions[reaction.type].push(profileId);

  const { error: updateError } = await supabase
    .from('change_log_posts' as any)
    .update({ reactions: newReactions })
    .eq('id', postId);

  if (updateError) throw updateError;
};

// Remove a reaction from a post
export const removeReaction = async (postId: string): Promise<void> => {
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

  // Get current post
  const { data: post, error: postError } = await supabase
    .from('change_log_posts' as any)
    .select('reactions')
    .eq('id', postId)
    .single();

  if (postError) throw postError;

  // Remove user from all reactions
  const currentReactions = (post as any).reactions;
  const newReactions = {
    thumbs_up: (currentReactions.thumbs_up || []).filter((id: string) => id !== profileId),
    thumbs_down: (currentReactions.thumbs_down || []).filter((id: string) => id !== profileId)
  };

  const { error: updateError } = await supabase
    .from('change_log_posts' as any)
    .update({ reactions: newReactions })
    .eq('id', postId);

  if (updateError) throw updateError;
};

// Get updates for real-time polling (simplified - just return empty for now)
export const getUpdates = async (): Promise<ChangeLogUpdates> => {
  // For now, return empty updates - real-time updates can be implemented later
  return {};
};

// Calculate reaction stats from raw post data (client-side utility)
export const calculateStats = async (post: any, currentUserId?: string): Promise<ChangeLogPostWithStats> => {
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

  const thumbs_up_count = post.reactions.thumbs_up?.length || 0;
  const thumbs_down_count = post.reactions.thumbs_down?.length || 0;
  
  let user_reaction: 'thumbs_up' | 'thumbs_down' | null = null;
  if (userId) {
    if (post.reactions.thumbs_up?.includes(userId)) {
      user_reaction = 'thumbs_up';
    } else if (post.reactions.thumbs_down?.includes(userId)) {
      user_reaction = 'thumbs_down';
    }
  }

  // Map the author name from the joined data  
  let author_name = 'Unknown User';
  if (post.user_profiles?.pilots?.boardNumber && post.user_profiles?.pilots?.callsign) {
    author_name = `${post.user_profiles.pilots.boardNumber} ${post.user_profiles.pilots.callsign}`;
  } else if (post.user_profiles?.discord_username) {
    author_name = post.user_profiles.discord_username;
  }

  return {
    ...post,
    author_name,
    stats: {
      thumbs_up_count,
      thumbs_down_count,
      user_reaction,
    },
  };
};

// Render markdown content to HTML (client-side utility)
export const renderMarkdown = (content: string): string => {
  // Basic markdown rendering - in a real implementation, use a library like marked or remark
  // For now, just handle basic formatting
  return content
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\n/g, '<br>');
};

// Legacy class-based service for backward compatibility
class ChangeLogService {
  async getPosts(limit: number = 20, cursor?: string): Promise<ChangeLogFeedResponse> {
    return getPosts(limit, cursor);
  }

  async getAllPosts(limit: number = 50, cursor?: string): Promise<ChangeLogFeedResponse> {
    return getAllPosts(limit, cursor);
  }

  async getPost(id: string): Promise<ChangeLogPostWithStats> {
    return getPost(id);
  }

  async createPost(post: CreatePostRequest): Promise<ChangeLogPost> {
    return createPost(post);
  }

  async updatePost(id: string, updates: UpdatePostRequest): Promise<ChangeLogPost> {
    return updatePost(id, updates);
  }

  async deletePost(id: string): Promise<void> {
    return deletePost(id);
  }

  async archivePost(id: string, archived: boolean = true): Promise<ChangeLogPost> {
    return archived ? archivePost(id) : unarchivePost(id);
  }

  async reactToPost(postId: string, reaction: ReactionRequest): Promise<void> {
    return reactToPost(postId, reaction);
  }

  async removeReaction(postId: string): Promise<void> {
    return removeReaction(postId);
  }

  async getUpdates(): Promise<ChangeLogUpdates> {
    return getUpdates();
  }

  calculateStats(post: ChangeLogPost, currentUserId?: string): ChangeLogPostWithStats {
    // For synchronous compatibility, create a simplified version
    const thumbs_up_count = post.reactions.thumbs_up?.length || 0;
    const thumbs_down_count = post.reactions.thumbs_down?.length || 0;
    
    let user_reaction: 'thumbs_up' | 'thumbs_down' | null = null;
    if (currentUserId) {
      if (post.reactions.thumbs_up?.includes(currentUserId)) {
        user_reaction = 'thumbs_up';
      } else if (post.reactions.thumbs_down?.includes(currentUserId)) {
        user_reaction = 'thumbs_down';
      }
    }

    return {
      ...post,
      stats: {
        thumbs_up_count,
        thumbs_down_count,
        user_reaction,
      },
    };
  }

  renderMarkdown(content: string): string {
    return renderMarkdown(content);
  }
}

export const changeLogService = new ChangeLogService();