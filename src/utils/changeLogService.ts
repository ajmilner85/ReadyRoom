import type { 
  ChangeLogPost, 
  ChangeLogPostWithStats, 
  CreatePostRequest, 
  UpdatePostRequest, 
  ReactionRequest, 
  ChangeLogUpdates,
  ChangeLogFeedResponse 
} from '../types/ChangeLogTypes';

const API_URL = import.meta.env.VITE_API_URL;

class ChangeLogService {
  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`${API_URL}${endpoint}`, {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(error || `HTTP error! status: ${response.status}`);
    }

    return response.json();
  }

  // Get change log posts feed with pagination
  async getPosts(limit: number = 20, cursor?: string): Promise<ChangeLogFeedResponse> {
    const params = new URLSearchParams();
    params.append('limit', limit.toString());
    if (cursor) {
      params.append('cursor', cursor);
    }
    
    return this.request<ChangeLogFeedResponse>(`/api/change-log?${params.toString()}`);
  }

  // Get all posts (including archived) - admin only
  async getAllPosts(limit: number = 50, cursor?: string): Promise<ChangeLogFeedResponse> {
    const params = new URLSearchParams();
    params.append('limit', limit.toString());
    params.append('include_archived', 'true');
    if (cursor) {
      params.append('cursor', cursor);
    }
    
    return this.request<ChangeLogFeedResponse>(`/api/change-log?${params.toString()}`);
  }

  // Get a specific post by ID
  async getPost(id: string): Promise<ChangeLogPostWithStats> {
    return this.request<ChangeLogPostWithStats>(`/api/change-log/${id}`);
  }

  // Create a new post
  async createPost(post: CreatePostRequest): Promise<ChangeLogPost> {
    return this.request<ChangeLogPost>('/api/change-log', {
      method: 'POST',
      body: JSON.stringify(post),
    });
  }

  // Update an existing post
  async updatePost(id: string, updates: UpdatePostRequest): Promise<ChangeLogPost> {
    return this.request<ChangeLogPost>(`/api/change-log/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  // Delete a post
  async deletePost(id: string): Promise<void> {
    await this.request(`/api/change-log/${id}`, {
      method: 'DELETE',
    });
  }

  // Archive/unarchive a post
  async archivePost(id: string, archived: boolean = true): Promise<ChangeLogPost> {
    return this.request<ChangeLogPost>(`/api/change-log/${id}/archive`, {
      method: 'POST',
      body: JSON.stringify({ archived }),
    });
  }

  // Add or update a reaction to a post
  async reactToPost(postId: string, reaction: ReactionRequest): Promise<void> {
    await this.request(`/api/change-log/${postId}/react`, {
      method: 'POST',
      body: JSON.stringify(reaction),
    });
  }

  // Remove a reaction from a post
  async removeReaction(postId: string): Promise<void> {
    await this.request(`/api/change-log/${postId}/react`, {
      method: 'DELETE',
    });
  }

  // Get updates for real-time polling (returns only posts with changed reactions)
  async getUpdates(since?: number): Promise<ChangeLogUpdates> {
    const query = since ? `?since=${since}` : '';
    return this.request<ChangeLogUpdates>(`/api/change-log/updates${query}`);
  }

  // Calculate reaction stats from raw post data (client-side utility)
  calculateStats(post: ChangeLogPost, currentUserId?: string): ChangeLogPostWithStats {
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

  // Render markdown content to HTML (client-side utility)
  renderMarkdown(content: string): string {
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
  }
}

export const changeLogService = new ChangeLogService();