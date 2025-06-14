export type KeycloakUser = {
  tokenParsed?: {
    sub?: string
    preferred_username?: string
    [key: string]: any
  }
  [key: string]: any
}

export type Dub = {
  userId: string;
  username: string;
  audioUrl: string;
  videoUrl: string;
};

export type ResultItem = {
  userId: string;
  username: string;
  average_rating: number;
  vote_count: number;
  audioUrl: string;
};