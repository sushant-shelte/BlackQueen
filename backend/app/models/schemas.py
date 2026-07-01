"""Minimal Pydantic schemas for API requests/responses."""
from typing import Any, Dict, List, Optional
from datetime import datetime
from pydantic import BaseModel


class CreateRoomRequest(BaseModel):
    player_name: str
    max_players: int
    num_teammates: int
    num_rounds: Optional[int] = 1
    bot_difficulty: str = "medium"


class JoinRoomRequest(BaseModel):
    player_name: str


class PlayerReadyRequest(BaseModel):
    player_id: str
    is_ready: bool


class StartGameRequest(BaseModel):
    owner_id: str


class BidRequest(BaseModel):
    player_id: str
    bid_amount: Optional[int] = None


class AnnounceTrumpRequest(BaseModel):
    player_id: str
    trump_suit: str


class AnnouncePartnersRequest(BaseModel):
    player_id: str
    partner_cards: List[str]


class PlayCardRequest(BaseModel):
    player_id: str
    card: str


class KickPlayerRequest(BaseModel):
    owner_id: str
    player_id_to_kick: str


class LeaveRoomRequest(BaseModel):
    player_id: str


class UpdateBotDifficultyRequest(BaseModel):
    owner_id: str
    bot_difficulty: str = "medium"


class PlayerDTO(BaseModel):
    player_id: str
    name: str
    seat: int
    is_bot: bool = False
    is_owner: bool = False
    is_ready: bool = False
    is_disconnected: bool = False
    cumulative_score: int = 0
    hand_count: int = 0


class CardPlayedDTO(BaseModel):
    player_id: str
    card: str
    order: int


class TrickInfoDTO(BaseModel):
    trick_number: int
    led_suit: Optional[str] = None
    cards_played: List[CardPlayedDTO] = []
    winner_id: Optional[str] = None
    trick_points: int = 0


class AnnouncedPartnerCardDTO(BaseModel):
    card: str
    revealed: bool = False
    player_id: Optional[str] = None


class GameStateDTO(BaseModel):
    bidding_player_index: Optional[int] = None
    highest_bid: Optional[int] = None
    highest_bidder_id: Optional[str] = None
    trump_suit: Optional[str] = None
    current_trick: Optional[TrickInfoDTO] = None
    last_completed_trick: Optional[TrickInfoDTO] = None
    announced_partner_cards: List[AnnouncedPartnerCardDTO] = []
    revealed_partners: Dict[str, bool] = {}
    team_member_ids: List[str] = []
    team_points: Optional[int] = None
    player_points: Dict[str, int] = {}
    current_trick_points: int = 0
    round_results: Dict[str, Any] = {}
    round_story: Dict[str, Any] = {}


class RoomDTO(BaseModel):
    room_code: str
    owner_id: str
    state: str
    max_players: int
    num_teammates: int
    num_rounds: int = 1
    bot_difficulty: str = "medium"
    players: List[PlayerDTO]
    current_round: int
    game_state: Optional[GameStateDTO] = None
    created_at: datetime


class RoomCreatedResponse(BaseModel):
    room_code: str
    player_id: str
    owner_id: str
    state: str
    max_players: int
    num_teammates: int
    num_rounds: int = 1
    bot_difficulty: str = "medium"
    players: List[PlayerDTO]
    created_at: datetime


class JoinRoomResponse(BaseModel):
    player_id: str
    room_code: str
    seat: int
    state: str


class BidResponse(BaseModel):
    success: bool
    current_bid: Optional[int] = None
    highest_bidder: Optional[str] = None
    bidding_player_index: int
    bids_status: Dict[str, Optional[int]]


class RoundResultDTO(BaseModel):
    player_id: str
    player_name: str
    role: str
    is_partner: bool
    player_points: int = 0
    round_score: int
    cumulative_score: int


class RoundEndedDTO(BaseModel):
    round_number: int
    highest_bid: int
    bid_achieved: bool
    team_points: int
    results: List[RoundResultDTO]


class GameEndedDTO(BaseModel):
    rank: int
    player_id: str
    player_name: str
    total_score: int


class ErrorResponse(BaseModel):
    error_code: str
    error_message: str
    details: Optional[Dict[str, Any]] = None


class WebSocketMessage(BaseModel):
    type: str
    timestamp: datetime
    payload: Dict[str, Any]
