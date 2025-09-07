// Change log system type definitions

export interface ChangeLogReactions {
  thumbs_up: string[]; // array of user IDs
  thumbs_down: string[]; // array of user IDs
}

export interface ChangeLogPost {
  id: string;
  title: string;
  content: string; // markdown content
  reactions: ChangeLogReactions;
  archived: boolean;
  created_at: string;
  updated_at: string;
  created_by: string;
  author_name?: string; // populated from join with users table
}

export interface ChangeLogPostWithStats extends ChangeLogPost {
  stats: {
    thumbs_up_count: number;
    thumbs_down_count: number;
    user_reaction?: 'thumbs_up' | 'thumbs_down' | null;
  };
}

export interface CreatePostRequest {
  title: string;
  content: string; // markdown
}

export interface UpdatePostRequest extends CreatePostRequest {
  archived?: boolean;
}

export interface ReactionRequest {
  type: 'thumbs_up' | 'thumbs_down';
}

export interface ChangeLogUpdates {
  [postId: string]: {
    reactions: ChangeLogReactions;
    timestamp: number;
  };
}

export interface ChangeLogFeedResponse {
  posts: ChangeLogPostWithStats[];
  hasMore: boolean;
  nextCursor?: string;
}