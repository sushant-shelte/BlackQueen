"""Room management service."""
import random
import string
from typing import Optional, Dict
from ..models.game import Room, Player
from ..models.enums import GameState
from .room_store import SQLiteRoomStore


class RoomManager:
    """Manages all game rooms."""
    
    def __init__(self, store: Optional[SQLiteRoomStore] = None):
        self.store = store or SQLiteRoomStore()
        self.rooms: Dict[str, Room] = self.store.load_rooms()

    def save_room(self, room: Room) -> None:
        """Persist a room snapshot."""
        self.rooms[room.room_code] = room
        self.store.save_room(room)

    def delete_room(self, room_code: str) -> None:
        """Remove a room from memory and storage."""
        room_code = room_code.strip().upper()
        self.rooms.pop(room_code, None)
        self.store.delete_room(room_code)
    
    def create_room(self, player_name: str, max_players: int, num_teammates: int, num_rounds: int = 1) -> Room:
        """Create a new room."""
        # Generate unique room code
        while True:
            room_code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
            if room_code not in self.rooms:
                break
        
        # Create room
        room = Room(room_code, max_players, num_teammates, num_rounds)
        
        # Create and add first player (owner)
        player = Player(player_name, 0)
        room.add_player(player)
        
        # Store room
        self.save_room(room)
        
        return room

    def fill_empty_seats_with_bots(self, room_code: str) -> int:
        """Fill all open seats in a room with bot players."""
        room = self.get_room(room_code)
        if not room:
            return 0

        bots_added = 0
        while len(room.players) < room.max_players:
            bot_number = 1
            existing_names = {player.name for player in room.players}
            while f"Bot {bot_number}" in existing_names:
                bot_number += 1
            bot = Player(f"Bot {bot_number}", len(room.players), is_bot=True)
            room.add_player(bot)
            bots_added += 1

        if bots_added:
            self.save_room(room)

        return bots_added
    
    def get_room(self, room_code: str) -> Optional[Room]:
        """Get room by code."""
        return self.rooms.get(room_code.strip().upper())
    
    def join_room(self, room_code: str, player_name: str) -> tuple:
        """
        Join an existing room.
        Returns (room, player) if successful, (None, None) if failed
        """
        room_code = room_code.strip().upper()
        player_name = player_name.strip()
        room = self.get_room(room_code)
        if not room:
            return None, None

        # Check for reconnection
        existing_player = room.get_player_by_name(player_name)
        if existing_player:
            if existing_player.is_disconnected:
                existing_player.is_bot = False
                existing_player.is_disconnected = False
                existing_player.disconnected_at = None
                self.save_room(room)
                return room, existing_player
            if existing_player.is_bot:
                existing_player.name = player_name
                existing_player.is_bot = False
                existing_player.is_ready = room.state not in [GameState.WAITING_FOR_PLAYERS, GameState.READY_CHECK]
                existing_player.is_disconnected = False
                existing_player.disconnected_at = None
                self.save_room(room)
                return room, existing_player
            else:
                return None, None  # Duplicate name

        bot_player = room.get_available_bot()
        if bot_player:
            bot_player.name = player_name
            bot_player.is_bot = False
            bot_player.is_ready = room.state not in [GameState.WAITING_FOR_PLAYERS, GameState.READY_CHECK]
            bot_player.is_disconnected = False
            bot_player.disconnected_at = None
            self.save_room(room)
            return room, bot_player

        if len(room.players) >= room.max_players:
            return None, None  # Room full
        
        # Create new player
        player = Player(player_name, len(room.players))
        room.add_player(player)
        self.save_room(room)
        
        return room, player
    
    def leave_room(self, room_code: str, player_id: str) -> bool:
        """
        Remove player from room, or convert them to a bot if a round is active.
        Returns True if successful.
        """
        room_code = room_code.strip().upper()
        room = self.get_room(room_code)
        if not room:
            return False
        
        player = room.get_player(player_id)
        if not player:
            return False

        active_game_states = {
            GameState.BIDDING,
            GameState.ANNOUNCING_TRUMP,
            GameState.ANNOUNCING_PARTNERS,
            GameState.PLAYING_TRICKS,
            GameState.ROUND_COMPLETE,
            GameState.GAME_PAUSED,
        }

        if room.state in active_game_states:
            player.is_bot = True
            player.is_disconnected = True
            from datetime import datetime
            player.disconnected_at = datetime.now()
            self.save_room(room)
            return True

        room.remove_player(player_id)

        # Clean up empty rooms
        if len(room.players) == 0:
            self.delete_room(room_code)
        else:
            self.save_room(room)

        return True
    
    def disconnect_player(self, room_code: str, player_id: str) -> bool:
        """Mark player as disconnected."""
        room = self.get_room(room_code)
        if not room:
            return False
        
        player = room.get_player(player_id)
        if not player:
            return False
        
        player.is_disconnected = True
        from datetime import datetime
        player.disconnected_at = datetime.now()
        
        # Pause game if in progress
        if room.state not in [GameState.WAITING_FOR_PLAYERS, GameState.READY_CHECK, GameState.GAME_ENDED]:
            room.paused_state = room.state
            room.state = GameState.GAME_PAUSED
        
        self.save_room(room)
        return True
    
    def reconnect_player(self, room_code: str, player_id: str) -> bool:
        """Reconnect a player."""
        room = self.get_room(room_code)
        if not room:
            return False
        
        player = room.get_player(player_id)
        if not player:
            return False
        
        player.is_bot = False
        player.is_disconnected = False
        player.disconnected_at = None
        
        # Resume game if paused due to disconnection
        if room.state == GameState.GAME_PAUSED and room.paused_state:
            room.state = room.paused_state
            room.paused_state = None
        
        self.save_room(room)
        return True
    
    def kick_player(self, room_code: str, owner_id: str, player_id_to_kick: str) -> bool:
        """
        Owner kicks a player from room.
        Returns True if successful.
        """
        room = self.get_room(room_code)
        if not room:
            return False
        
        owner = room.get_player(owner_id)
        if not owner or not owner.is_owner:
            return False
        
        removed_player = room.remove_player(player_id_to_kick)
        if removed_player:
            if len(room.players) == 0:
                self.delete_room(room_code)
            else:
                self.save_room(room)
            return True

        return False
    
    def mark_ready(self, room_code: str, player_id: str, is_ready: bool) -> bool:
        """Mark player as ready/not ready."""
        room = self.get_room(room_code)
        if not room:
            return False
        
        player = room.get_player(player_id)
        if not player:
            return False
        
        player.is_ready = is_ready
        
        # Auto-start if all ready and minimum players
        if room.state == GameState.READY_CHECK and room.all_ready() and len(room.players) >= 2:
            # Transition to bidding will be done by game logic
            pass
        
        self.save_room(room)
        return True
    
    def cleanup_idle_rooms(self, idle_seconds: int = 1800) -> None:
        """Clean up rooms that have been idle for too long."""
        from datetime import datetime, timedelta
        
        current_time = datetime.now()
        rooms_to_delete = []
        
        for room_code, room in self.rooms.items():
            if (current_time - room.created_at).total_seconds() > idle_seconds:
                # Check if any activity
                if room.state == GameState.WAITING_FOR_PLAYERS and len(room.players) == 0:
                    rooms_to_delete.append(room_code)
        
        for room_code in rooms_to_delete:
            self.delete_room(room_code)
