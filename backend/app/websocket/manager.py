"""WebSocket manager for real-time communication."""
from typing import Dict, Set, Optional
from fastapi import WebSocketDisconnect, WebSocket
import json
from datetime import datetime
import asyncio

from ..models.schemas import WebSocketMessage


class WebSocketManager:
    """Manages WebSocket connections per room."""
    
    def __init__(self):
        # room_code -> {player_id -> WebSocket}
        self.active_connections: Dict[str, Dict[str, WebSocket]] = {}
    
    async def connect(self, room_code: str, player_id: str, websocket: WebSocket) -> None:
        """Register a WebSocket connection."""
        await websocket.accept()
        
        if room_code not in self.active_connections:
            self.active_connections[room_code] = {}
        
        self.active_connections[room_code][player_id] = websocket
    
    def disconnect(self, room_code: str, player_id: str) -> None:
        """Unregister a WebSocket connection."""
        if room_code in self.active_connections:
            self.active_connections[room_code].pop(player_id, None)
            
            if not self.active_connections[room_code]:
                del self.active_connections[room_code]
    
    async def broadcast_to_room(self, room_code: str, event_type: str, payload: dict) -> None:
        """Send an event to all connected players in a room."""
        if room_code not in self.active_connections:
            return
        
        message = {
            "type": event_type,
            "timestamp": datetime.now().isoformat(),
            "payload": payload
        }
        
        # Send to all connected clients
        disconnected = []
        for player_id, websocket in self.active_connections[room_code].items():
            try:
                await websocket.send_json(message)
            except Exception as e:
                # Mark for removal if error
                disconnected.append(player_id)
        
        # Remove disconnected clients
        for player_id in disconnected:
            self.active_connections[room_code].pop(player_id, None)
    
    async def send_to_player(self, room_code: str, player_id: str, event_type: str, payload: dict) -> bool:
        """Send an event to a specific player."""
        if room_code not in self.active_connections:
            return False
        
        websocket = self.active_connections[room_code].get(player_id)
        if not websocket:
            return False
        
        message = {
            "type": event_type,
            "timestamp": datetime.now().isoformat(),
            "payload": payload
        }
        
        try:
            await websocket.send_json(message)
            return True
        except Exception:
            return False
    
    def is_connected(self, room_code: str, player_id: str) -> bool:
        """Check if a player is connected."""
        return (room_code in self.active_connections and 
                player_id in self.active_connections[room_code])
    
    def get_connected_players(self, room_code: str) -> Set[str]:
        """Get set of connected player IDs in a room."""
        if room_code not in self.active_connections:
            return set()
        return set(self.active_connections[room_code].keys())


# Global WebSocket manager
ws_manager = WebSocketManager()
