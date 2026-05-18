export type Role = 'admin' | 'user';
export type Mode = 'doubles' | 'singles';
export type Position = 'attacker' | 'defender' | 'singles';

export interface User {
  id: number;
  name: string;
  avatar_url: string | null;
  role: Role;
  has_password: boolean;
  rating_attacker: number;
  rating_defender: number;
  rating_singles: number;
  games_attacker: number;
  games_defender: number;
  games_singles: number;
  created_at: string;
}

export interface UserCreateResult {
  user: User;
  password_set_url: string | null;
}

export interface MatchPlayer {
  user_id: number;
  team: 1 | 2;
  position: Position;
  rating_before: number;
  rating_after: number;
  rating_delta: number;
}

export interface Match {
  id: number;
  mode: Mode;
  goals_to_win: number;
  team1_score: number;
  team2_score: number;
  winner_team: 1 | 2;
  created_at: string;
  created_by_user_id: number | null;
  players: MatchPlayer[];
}

export interface MatchPlayerInput {
  user_id: number;
  team: 1 | 2;
  position: Position;
}

export interface Lineup {
  team1_attacker: number;
  team1_defender: number;
  team2_attacker: number;
  team2_defender: number;
  win_prob_team1: number;
}

export interface BalanceResult {
  best: Lineup;
  alternatives: Lineup[];
}

export interface PreviewOutcome {
  team1_score: number;
  team2_score: number;
  deltas: Record<number, number>;
}

export interface PreviewResult {
  win_prob_team1: number;
  outcomes: PreviewOutcome[];
}

export interface Settings {
  default_goals_to_win: number;
}

export interface RatingHistoryPoint {
  match_id: number;
  created_at: string;
  rating_after: number;
  rating_delta: number;
}

export interface WLRecord {
  wins: number;
  losses: number;
}

export interface UserStats {
  user: User;
  history: {
    attacker: RatingHistoryPoint[];
    defender: RatingHistoryPoint[];
    singles: RatingHistoryPoint[];
  };
  totals: {
    attacker: WLRecord;
    defender: WLRecord;
    singles: WLRecord;
  };
  top_partners: { user_id: number; games: number }[];
  top_opponents: { user_id: number; games: number }[];
}

export interface GlobalStats {
  total_matches: number;
  doubles_matches: number;
  singles_matches: number;
  active_players: number;
}

export type LeaderboardMode = 'doubles' | 'attacker' | 'defender' | 'singles';

export interface AppConfig {
  public_mode: boolean;
}
