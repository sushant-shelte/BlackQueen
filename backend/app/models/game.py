"""Player and Game state models."""
import uuid
from typing import List, Dict, Optional, Set
from datetime import datetime
from .card import Card
from .enums import GameState, Suit


class Player:
    """Represents a player in the game."""
    
    def __init__(self, name: str, seat: int, is_bot: bool = False):
        self.player_id = str(uuid.uuid4())
        self.name = name
        self.seat = seat
        self.is_bot = is_bot
        self.is_owner = False
        self.is_ready = is_bot
        self.hand: List[Card] = []
        self.is_disconnected = False
        self.disconnected_at: Optional[datetime] = None
        self.cumulative_score = 0
    
    def to_dict(self, include_hand: bool = False) -> dict:
        """Convert to dictionary."""
        data = {
            "player_id": self.player_id,
            "name": self.name,
            "seat": self.seat,
            "is_bot": self.is_bot,
            "is_owner": self.is_owner,
            "is_ready": self.is_ready,
            "is_disconnected": self.is_disconnected,
            "cumulative_score": self.cumulative_score,
            "hand_count": len(self.hand),
        }
        if include_hand:
            data["hand"] = [str(card) for card in self.hand]
        return data


class Trick:
    """Represents a trick (set of cards played)."""
    
    def __init__(self, trick_number: int):
        self.trick_number = trick_number
        self.led_suit: Optional[Suit] = None
        self.cards_played: List[tuple] = []  # List of (player_id, card, order)
        self.winner_id: Optional[str] = None
        self.trick_points = 0

    def to_dict(self) -> dict:
        """Convert trick to API-friendly dictionary."""
        return {
            "trick_number": self.trick_number,
            "led_suit": self.led_suit.value if self.led_suit else None,
            "cards_played": [
                {
                    "player_id": player_id,
                    "card": str(card),
                    "order": order
                }
                for player_id, card, order in self.cards_played
            ],
            "winner_id": self.winner_id,
            "trick_points": self.trick_points,
        }


class GameRound:
    """Represents a single round of the game."""
    
    def __init__(self, round_number: int, players: List[Player], num_teammates: int):
        self.game_id = str(uuid.uuid4())
        self.round_number = round_number
        self.players = players
        self.num_teammates = num_teammates
        
        # Bidding phase
        self.bids: Dict[str, Optional[int]] = {p.player_id: None for p in players}
        self.passed_player_ids: Set[str] = set()
        self.highest_bidder_id: Optional[str] = None
        self.highest_bid: int = 75
        self.bidding_player_index = 0
        self.first_player_index = 0
        
        # Partnership phase
        self.trump_suit: Optional[Suit] = None
        self.announced_cards: List[Card] = []
        self.team_members: Set[str] = set()  # IDs of bidder and partners
        self.revealed_partners: Dict[str, bool] = {}  # partner_id -> revealed
        self.revealed_partner_cards: Dict[str, str] = {}  # announced card string -> partner_id
        
        # Trick-taking phase
        self.tricks: List[Trick] = []
        self.current_trick: Optional[Trick] = None
        self.current_player_index = 0
        self.team_points = 0
        self.player_points: Dict[str, int] = {p.player_id: 0 for p in players}
        self.bot_difficulty: str = "medium"
        
        # Results
        self.bid_achieved = False
        self.round_results: Dict[str, dict] = {}
        self.round_story: Dict[str, object] = {}


class Room:
    """Represents a game room."""
    
    def __init__(self, room_code: str, max_players: int, num_teammates: int, num_rounds: int = 1, bot_difficulty: str = "medium"):
        self.room_code = room_code
        self.max_players = max_players
        self.num_teammates = num_teammates
        self.num_rounds = num_rounds
        self.bot_difficulty = bot_difficulty
        self.state = GameState.WAITING_FOR_PLAYERS
        self.players: List[Player] = []
        self.owner_id: Optional[str] = None
        self.created_at = datetime.now()
        self.current_round = 0
        self.current_game: Optional[GameRound] = None
        self.paused_state: Optional[GameState] = None
    
    def add_player(self, player: Player) -> None:
        """Add player to room."""
        if len(self.players) >= self.max_players:
            raise ValueError("Room is full")
        
        # Check for duplicate name
        if any(p.name == player.name for p in self.players):
            raise ValueError("Player name already exists in room")
        
        player.seat = len(self.players)
        self.players.append(player)
        
        # First player is owner
        if len(self.players) == 1:
            player.is_owner = True
            self.owner_id = player.player_id

    def get_available_bot(self) -> Optional[Player]:
        """Get the first bot that can be replaced by a human player."""
        for player in self.players:
            if player.is_bot:
                return player
        return None
    
    def remove_player(self, player_id: str) -> Optional[Player]:
        """Remove player from room."""
        for i, player in enumerate(self.players):
            if player.player_id == player_id:
                self.players.pop(i)
                
                # Transfer ownership if owner was removed
                if player.is_owner and self.players:
                    player.is_owner = False
                    new_owner = self.players[0]
                    new_owner.is_owner = True
                    self.owner_id = new_owner.player_id
                
                # Update seats
                for j, p in enumerate(self.players):
                    p.seat = j
                
                return player
        return None
    
    def get_player(self, player_id: str) -> Optional[Player]:
        """Get player by ID."""
        for player in self.players:
            if player.player_id == player_id:
                return player
        return None
    
    def get_player_by_name(self, name: str) -> Optional[Player]:
        """Get player by name."""
        for player in self.players:
            if player.name == name:
                return player
        return None
    
    def get_ready_count(self) -> int:
        """Count ready players."""
        return sum(1 for p in self.players if p.is_ready)
    
    def all_ready(self) -> bool:
        """Check if all players are ready."""
        return len(self.players) >= 2 and all(p.is_ready for p in self.players)
    
    def to_dict(self, include_game_state: bool = True, viewer_player_id: Optional[str] = None) -> dict:
        """Convert to dictionary."""
        data = {
            "room_code": self.room_code,
            "owner_id": self.owner_id,
            "state": self.state.value,
            "max_players": self.max_players,
            "num_teammates": self.num_teammates,
            "num_rounds": self.num_rounds,
            "bot_difficulty": getattr(self, "bot_difficulty", "medium"),
            "players": [p.to_dict(include_hand=p.player_id == viewer_player_id) for p in self.players],
            "current_round": self.current_round,
            "created_at": self.created_at.isoformat(),
        }
        
        if include_game_state and self.current_game:
            game = self.current_game
            game_state = {
                "bidding_player_index": game.bidding_player_index if self.state == GameState.BIDDING else None,
                "highest_bid": game.highest_bid,
                "highest_bidder_id": game.highest_bidder_id,
                "current_player_index": game.current_player_index,
                "bids_status": game.bids,
                "trump_suit": game.trump_suit.value if game.trump_suit else None,
                "announced_partner_cards": [
                    {
                        "card": str(card),
                        "revealed": str(card) in getattr(game, "revealed_partner_cards", {}),
                        "player_id": getattr(game, "revealed_partner_cards", {}).get(str(card))
                    }
                    for card in game.announced_cards
                ],
                "team_member_ids": [
                    player_id
                    for player_id in game.team_members
                    if player_id == game.highest_bidder_id or game.revealed_partners.get(player_id, False)
                ],
                "player_points": getattr(game, "player_points", {p.player_id: 0 for p in game.players}),
                "current_trick_points": game.current_trick.trick_points if game.current_trick else 0,
                "round_story": getattr(game, "round_story", {}),
            }

            if self.state in [GameState.ROUND_COMPLETE, GameState.GAME_ENDED]:
                game_state["team_member_ids"] = list(game.team_members)
                game_state["team_points"] = game.team_points
                game_state["announced_partner_cards"] = [
                    {
                        "card": str(card),
                        "revealed": True,
                        "player_id": next(
                            (
                                player.player_id
                                for player in game.players
                                if any(card == hand_card for hand_card in player.hand)
                                or player.player_id == getattr(game, "revealed_partner_cards", {}).get(str(card))
                            ),
                            getattr(game, "revealed_partner_cards", {}).get(str(card))
                        )
                    }
                    for card in game.announced_cards
                ]
                game_state["round_results"] = game.round_results
            
            if game.current_trick:
                game_state["current_trick"] = game.current_trick.to_dict()

            if game.tricks:
                game_state["last_completed_trick"] = game.tricks[-1].to_dict()
            
            game_state["revealed_partners"] = game.revealed_partners
            data["game_state"] = game_state
        
        return data
