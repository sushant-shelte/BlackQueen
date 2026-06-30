/* Game Types */

export type GameState = 
  | "WAITING_FOR_PLAYERS"
  | "READY_CHECK"
  | "BIDDING"
  | "ANNOUNCING_TRUMP"
  | "ANNOUNCING_PARTNERS"
  | "PLAYING_TRICKS"
  | "ROUND_COMPLETE"
  | "GAME_PAUSED"
  | "GAME_ENDED";

export type Suit = "H" | "C" | "D" | "S";
export type Rank = "A" | "K" | "Q" | "J" | "10" | "9" | "8" | "7" | "6" | "5" | "4" | "3" | "2";

export interface Card {
  rank: Rank;
  suit: Suit;
  deckId: number;
}

export interface Player {
  player_id: string;
  name: string;
  seat: number;
  is_bot: boolean;
  is_owner: boolean;
  is_ready: boolean;
  is_disconnected: boolean;
  cumulative_score: number;
  hand_count?: number;
  hand?: string[]; // Card strings like "AH", "KS"
}

export interface CardPlayedInfo {
  player_id: string;
  card: string;
  order: number;
}

export interface TrickInfo {
  trick_number: number;
  led_suit: Suit | null;
  cards_played: CardPlayedInfo[];
  winner_id?: string | null;
  trick_points?: number;
}

export interface AnnouncedPartnerCard {
  card: string;
  revealed: boolean;
  player_id?: string | null;
}

export interface GameStateInfo {
  bidding_player_index?: number;
  current_player_index?: number;
  highest_bid?: number;
  highest_bidder_id?: string;
  bids_status?: { [player_id: string]: number | null };
  trump_suit?: Suit;
  current_trick?: TrickInfo;
  last_completed_trick?: TrickInfo;
  announced_partner_cards?: AnnouncedPartnerCard[];
  revealed_partners: { [player_id: string]: boolean };
  team_member_ids?: string[];
  team_points?: number;
  player_points?: { [player_id: string]: number };
  current_trick_points?: number;
  round_results?: { [player_id: string]: RoundResult };
  round_story?: RoundStory;
}

export interface RoundStory {
  target: number;
  team_points: number;
  bid_achieved: boolean;
  margin: number;
  bidder_name?: string;
  top_trick?: {
    trick_number?: number | null;
    winner_id?: string | null;
    winner_name?: string | null;
    trick_points?: number;
    cards_played?: string[];
  } | null;
}

export interface Room {
  room_code: string;
  owner_id: string;
  state: GameState;
  max_players: number;
  num_teammates: number;
  num_rounds: number;
  bot_difficulty?: "easy" | "medium" | "hard";
  players: Player[];
  current_round: number;
  game_state?: GameStateInfo;
  created_at: string;
}

export interface RoundResult {
  player_id: string;
  player_name: string;
  role: "bidder" | "partner" | "opponent";
  is_partner: boolean;
  player_points?: number;
  round_score: number;
  cumulative_score: number;
}

export interface FinalStanding {
  rank: number;
  player_id: string;
  player_name: string;
  total_score: number;
}

/* WebSocket Message Types */

export interface WSMessage {
  type: string;
  timestamp: string;
  payload: { [key: string]: any };
}

export interface ActivityFeedEntry {
  id: string;
  type: string;
  tone: 'positive' | 'neutral' | 'warning' | 'negative';
  title: string;
  detail: string;
  timestamp: string;
}

export interface PlayerJoinedPayload {
  player_id: string;
  player_name: string;
  seat: number;
  total_players: number;
}

export interface GameStartedPayload {
  first_player_index: number;
  first_player_name: string;
  round_number: number;
}

export interface CardsDealtPayload {
  player_id: string;
  hand: string[];
  card_count: number;
}

export interface BiddingStartedPayload {
  bidding_player_index: number;
  bidding_player_name: string;
  min_bid: number;
  current_highest_bid: number;
}

export interface TrickWonPayload {
  trick_number: number;
  winner_id: string;
  winner_name: string;
  trick_points: number;
  cards_in_trick: string[];
  team_points_accumulated: number;
}

export interface RoundEndedPayload {
  round_number: number;
  highest_bid: number;
  bid_achieved: boolean;
  team_points: number;
  results: RoundResult[];
}

export interface GameEndedPayload {
  total_rounds: number;
  final_standings: FinalStanding[];
}

export interface PartnerRevealedPayload {
  partner_id: string;
  partner_name: string;
  revealing_card: string;
  revealed_by: string;
}

export interface ErrorPayload {
  error_code: string;
  error_message: string;
  details?: { [key: string]: any };
}
