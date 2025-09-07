// Poll system type definitions

export interface PollOption {
  id: string;
  title: string;
  description?: string;
  order: number;
}

export interface PollVote {
  user_id: string;
  option_id: string;
  timestamp: string;
}

export interface Poll {
  id: string;
  title: string;
  description?: string;
  options: PollOption[];
  votes: PollVote[];
  is_active: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
}

export interface PollWithResults extends Poll {
  results: {
    [optionId: string]: {
      count: number;
      percentage: number;
      voters: string[];
    };
  };
  totalVotes: number;
  userVote?: string; // option_id that current user voted for
}

export interface CreatePollRequest {
  title: string;
  description?: string;
  options: Omit<PollOption, 'id'>[];
}

export interface UpdatePollRequest {
  title?: string;
  description?: string;
  options?: Omit<PollOption, 'id'>[];
  is_active?: boolean;
  archived_at?: string | null;
}

export interface VoteRequest {
  option_id: string;
}

export interface PollUpdates {
  [pollId: string]: {
    votes: PollVote[];
    timestamp: number;
  };
}