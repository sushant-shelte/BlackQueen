"""API routes for Black Queen."""
from fastapi import APIRouter, HTTPException, Depends, status
from typing import Optional

from ..models.enums import Suit
from ..models.schemas import (
    CreateRoomRequest, JoinRoomRequest, RoomCreatedResponse, JoinRoomResponse,
    PlayerReadyRequest, StartGameRequest, BidRequest, AnnounceTrumpRequest,
    AnnouncePartnersRequest, PlayCardRequest, KickPlayerRequest, LeaveRoomRequest,
    ErrorResponse
)
from ..models.game import Room
from ..services.room_manager import RoomManager
from ..services.game_engine import GameEngine
from ..models.enums import GameState
from ..websocket.manager import ws_manager

# Global room manager (in production, use dependency injection)
room_manager = RoomManager()

router = APIRouter(prefix="/api", tags=["game"])


def get_room_manager() -> RoomManager:
    """Dependency to get room manager."""
    return room_manager


async def broadcast_room_update(room_code: str, event_type: str, payload: dict) -> None:
    """Notify all connected clients that a room has changed."""
    await ws_manager.broadcast_to_room(room_code.strip().upper(), event_type, payload)


@router.post("/rooms", response_model=RoomCreatedResponse, status_code=status.HTTP_201_CREATED)
async def create_room(
    request: CreateRoomRequest,
    manager: RoomManager = Depends(get_room_manager)
):
    """Create a new game room."""
    try:
        player_name = request.player_name.strip()
        if not player_name:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Player name is required"
            )

        if request.num_teammates < 1 or request.num_teammates > (request.max_players // 2 - 1):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid number of teammates for this player count"
            )
        
        room = manager.create_room(player_name, request.max_players, request.num_teammates, request.num_rounds or 1)
        
        return RoomCreatedResponse(
            room_code=room.room_code,
            player_id=room.players[0].player_id,
            owner_id=room.owner_id,
            state=room.state,
            max_players=room.max_players,
            num_teammates=room.num_teammates,
            num_rounds=room.num_rounds,
            players=[p.to_dict() for p in room.players],
            created_at=room.created_at
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/rooms/{room_code}")
def get_room_state(
    room_code: str,
    player_id: Optional[str] = None,
    manager: RoomManager = Depends(get_room_manager)
):
    """Get current room state."""
    room_code = room_code.strip().upper()
    room = manager.get_room(room_code)
    if not room:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")
    
    return room.to_dict(viewer_player_id=player_id)


@router.post("/rooms/{room_code}/join", response_model=JoinRoomResponse)
async def join_room(
    room_code: str,
    request: JoinRoomRequest,
    manager: RoomManager = Depends(get_room_manager)
):
    """Join an existing room."""
    room_code = room_code.strip().upper()
    player_name = request.player_name.strip()
    if not player_name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Player name is required")

    room = manager.get_room(room_code)
    if not room:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")

    if len(room.players) >= room.max_players and not room.get_available_bot():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Room is full")

    existing_player = room.get_player_by_name(player_name)
    if existing_player and not existing_player.is_disconnected:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Player name already exists in room"
        )

    room, player = manager.join_room(room_code, player_name)
    
    if not room or not player:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot join room")
    
    await broadcast_room_update(room.room_code, "PLAYER_JOINED", {
        "player_id": player.player_id,
        "player_name": player.name,
        "seat": player.seat,
        "total_players": len(room.players)
    })

    return JoinRoomResponse(
        player_id=player.player_id,
        room_code=room.room_code,
        seat=player.seat,
        state=room.state
    )


@router.post("/rooms/{room_code}/leave")
async def leave_room(
    room_code: str,
    request: LeaveRoomRequest,
    manager: RoomManager = Depends(get_room_manager)
):
    """Leave a room."""
    if not manager.leave_room(room_code, request.player_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot leave room")

    await broadcast_room_update(room_code, "PLAYER_LEFT", {
        "player_id": request.player_id
    })
    
    return {"success": True, "message": "Left room successfully"}


@router.post("/rooms/{room_code}/ready")
async def mark_player_ready(
    room_code: str,
    request: PlayerReadyRequest,
    manager: RoomManager = Depends(get_room_manager)
):
    """Mark player as ready."""
    room = manager.get_room(room_code)
    if not room:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")
    
    if not manager.mark_ready(room_code, request.player_id, request.is_ready):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot mark ready")
    
    player = room.get_player(request.player_id)
    
    await broadcast_room_update(room_code, "PLAYER_READY_CHANGED", {
        "player_id": request.player_id,
        "is_ready": request.is_ready,
        "room_state": room.state.value,
        "all_ready": room.all_ready()
    })

    return {
        "player_id": request.player_id,
        "is_ready": request.is_ready,
        "room_state": room.state.value,
        "all_ready": room.all_ready()
    }


@router.post("/rooms/{room_code}/start-game")
async def start_game(
    room_code: str,
    request: StartGameRequest,
    manager: RoomManager = Depends(get_room_manager)
):
    """Start the game (owner only)."""
    room = manager.get_room(room_code)
    if not room:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")
    
    owner = room.get_player(request.owner_id)
    if not owner or not owner.is_owner:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only owner can start game")

    if room.state not in [GameState.WAITING_FOR_PLAYERS, GameState.READY_CHECK]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Game already started")
    
    bots_added = manager.fill_empty_seats_with_bots(room_code)
    
    # Start first round
    game = GameEngine.start_round(room)
    room.state = GameState.BIDDING
    manager.save_room(room)
    
    # Send cards to each player
    player_data = []
    for player in room.players:
        player_data.append({
            "player_id": player.player_id,
            "is_bot": player.is_bot,
            "hand": [str(card) for card in player.hand]
        })
    
    await broadcast_room_update(room_code, "GAME_STARTED", {
        "first_player_index": game.first_player_index,
        "first_player_name": room.players[game.first_player_index].name,
        "round_number": room.current_round
    })

    return {
        "success": True,
        "state": room.state.value,
        "first_player_index": game.first_player_index,
        "bots_added": bots_added,
        "players": player_data
    }


@router.post("/rooms/{room_code}/bid")
async def place_bid(
    room_code: str,
    request: BidRequest,
    manager: RoomManager = Depends(get_room_manager)
):
    """Place a bid or pass."""
    room = manager.get_room(room_code)
    if not room:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")
    
    game = room.current_game
    if not game:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No active game")
    
    success, msg = GameEngine.place_bid(game, request.player_id, request.bid_amount)
    
    if not success:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)

    while msg != "Bidding complete":
        current_player = game.players[game.bidding_player_index]
        if not current_player.is_bot:
            break

        success, msg = GameEngine.place_bid(game, current_player.player_id, None)
        if not success:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)
    
    # Check if bidding complete
    bidding_complete = msg == "Bidding complete"
    
    if bidding_complete:
        room.state = GameState.ANNOUNCING_TRUMP
    
    manager.save_room(room)
    
    await broadcast_room_update(room_code, "BID_PLACED", {
        "player_id": request.player_id,
        "current_bid": game.highest_bid,
        "highest_bidder": game.highest_bidder_id,
        "bidding_player_index": game.bidding_player_index,
        "bidding_complete": bidding_complete
    })

    return {
        "success": True,
        "current_bid": game.highest_bid,
        "highest_bidder": game.highest_bidder_id,
        "bidding_player_index": game.bidding_player_index,
        "bids_status": game.bids,
        "bidding_complete": bidding_complete
    }


@router.post("/rooms/{room_code}/announce-trump")
async def announce_trump(
    room_code: str,
    request: AnnounceTrumpRequest,
    manager: RoomManager = Depends(get_room_manager)
):
    """Announce trump suit."""
    room = manager.get_room(room_code)
    if not room:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")
    
    game = room.current_game
    if not game:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No active game")
    
    success, msg = GameEngine.announce_trump(game, request.player_id, request.trump_suit)
    
    if not success:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)
    
    room.state = GameState.ANNOUNCING_PARTNERS
    manager.save_room(room)
    
    await broadcast_room_update(room_code, "TRUMP_ANNOUNCED", {
        "trump_suit": game.trump_suit.value,
        "announced_by": request.player_id
    })

    return {
        "success": True,
        "trump_suit": game.trump_suit.value,
        "state": room.state.value
    }


@router.post("/rooms/{room_code}/announce-partners")
async def announce_partners(
    room_code: str,
    request: AnnouncePartnersRequest,
    manager: RoomManager = Depends(get_room_manager)
):
    """Announce partner cards."""
    room = manager.get_room(room_code)
    if not room:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")
    
    game = room.current_game
    if not game:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No active game")
    
    success, msg = GameEngine.announce_partners(game, request.player_id, request.partner_cards)
    
    if not success:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)
    
    room.state = GameState.PLAYING_TRICKS
    manager.save_room(room)
    
    await broadcast_room_update(room_code, "PARTNERS_ANNOUNCED", {
        "announced_cards": [str(card) for card in game.announced_cards],
        "announced_by": request.player_id,
        "next_phase": room.state.value
    })

    return {
        "success": True,
        "announced_cards": [str(card) for card in game.announced_cards],
        "state": room.state.value,
        "current_trick": {
            "trick_number": game.current_trick.trick_number,
            "led_suit": None,
            "cards_played": []
        }
    }


@router.post("/rooms/{room_code}/play-card")
async def play_card(
    room_code: str,
    request: PlayCardRequest,
    manager: RoomManager = Depends(get_room_manager)
):
    """Play a card in the current trick."""
    room = manager.get_room(room_code)
    if not room:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")
    
    game = room.current_game
    if not game:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No active game")
    
    current_player = game.players[game.current_player_index] if game.players else None
    if current_player and current_player.player_id != request.player_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Not your turn to play")

    success, msg = GameEngine.play_card(game, request.player_id, request.card)
    
    if not success:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)

    # Check if round complete
    if msg == "Round complete":
        room.state = GameState.ROUND_COMPLETE
        GameEngine.reveal_team(game)
        results = GameEngine.calculate_scores(game)
        
        # Check if all rounds done
        if room.current_round >= room.num_rounds:
            room.state = GameState.GAME_ENDED
        
        manager.save_room(room)
        await broadcast_room_update(room_code, "ROUND_ENDED", {
            "round_number": room.current_round,
            "highest_bid": game.highest_bid,
            "bid_achieved": game.bid_achieved,
            "team_points": game.team_points,
            "results": results,
            "state": room.state.value
        })
        
        return {
            "success": True,
            "card_played": request.card,
            "round_complete": True,
            "results": results,
            "state": room.state.value
        }
    
    # Check if trick complete
    if len(game.current_trick.cards_played) == len(room.players):
        trick = game.tricks[-1] if game.tricks else None
        revealed_partners = [pid for pid, revealed in game.revealed_partners.items() if revealed]
        manager.save_room(room)
        await broadcast_room_update(room_code, "TRICK_WON", {
            "trick_number": trick.trick_number if trick else 0,
            "winner_id": trick.winner_id if trick else None,
            "trick_points": trick.trick_points if trick else 0,
            "revealed_partners": revealed_partners
        })
        
        return {
            "success": True,
            "card_played": request.card,
            "trick_result": {
                "trick_number": trick.trick_number if trick else 0,
                "winner_player_id": trick.winner_id if trick else None,
                "cards_played": [str(card) for _, card, _ in game.current_trick.cards_played[:-1]],
                "trick_points": trick.trick_points if trick else 0,
                "revealed_partners": revealed_partners
            },
            "next_state": room.state.value
        }
    
    manager.save_room(room)

    await broadcast_room_update(room_code, "CARD_PLAYED", {
        "player_id": request.player_id,
        "card": request.card,
        "next_player_index": game.current_player_index
    })

    return {
        "success": True,
        "card_played": request.card,
        "current_trick": {
            "trick_number": game.current_trick.trick_number,
            "led_suit": game.current_trick.led_suit.value if game.current_trick.led_suit else None,
            "cards_played": [
                {
                    "player_id": pid,
                    "card": str(card),
                    "order": order
                }
                for pid, card, order in game.current_trick.cards_played
            ]
        },
        "next_player_index": game.current_player_index
    }


@router.post("/rooms/{room_code}/bot-play")
async def bot_play_card(
    room_code: str,
    manager: RoomManager = Depends(get_room_manager)
):
    """Play one card for the current bot player."""
    room = manager.get_room(room_code)
    if not room:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")

    game = room.current_game
    if not game:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No active game")

    if room.state != GameState.PLAYING_TRICKS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Game is not in trick play")

    current_player = game.players[game.current_player_index] if game.players else None
    if not current_player or not current_player.is_bot:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current player is not a bot")

    valid_cards = GameEngine.get_valid_cards(current_player, game)
    if not valid_cards:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Bot has no valid cards")

    played_card = str(valid_cards[0])
    success, msg = GameEngine.play_card(game, current_player.player_id, played_card)
    if not success:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)

    if msg == "Round complete":
        room.state = GameState.ROUND_COMPLETE
        GameEngine.reveal_team(game)
        results = GameEngine.calculate_scores(game)

        if room.current_round >= room.num_rounds:
            room.state = GameState.GAME_ENDED

        manager.save_room(room)
        await broadcast_room_update(room_code, "ROUND_ENDED", {
            "round_number": room.current_round,
            "highest_bid": game.highest_bid,
            "bid_achieved": game.bid_achieved,
            "team_points": game.team_points,
            "results": results,
            "state": room.state.value
        })
        return {
            "success": True,
            "card_played": played_card,
            "round_complete": True,
            "results": results,
            "state": room.state.value
        }

    manager.save_room(room)
    await broadcast_room_update(room_code, "CARD_PLAYED", {
        "player_id": current_player.player_id,
        "card": played_card,
        "next_player_index": game.current_player_index
    })

    return {
        "success": True,
        "card_played": played_card,
        "state": room.state.value,
        "next_player_index": game.current_player_index
    }


@router.post("/rooms/{room_code}/kick-player")
def kick_player(
    room_code: str,
    request: KickPlayerRequest,
    manager: RoomManager = Depends(get_room_manager)
):
    """Kick a player from room (owner only)."""
    room = manager.get_room(room_code)
    if not room:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")
    
    if not manager.kick_player(room_code, request.owner_id, request.player_id_to_kick):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot kick player")
    
    kicked_player = room.get_player(request.player_id_to_kick)
    kicked_name = kicked_player.name if kicked_player else "Unknown"
    
    return {
        "success": True,
        "kicked_player": request.player_id_to_kick,
        "kicked_player_name": kicked_name
    }
