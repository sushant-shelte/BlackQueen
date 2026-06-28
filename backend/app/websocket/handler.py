"""WebSocket endpoints."""
import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, status

from .manager import ws_manager, WebSocketManager
from ..services.room_manager import RoomManager
from ..api.routes import get_room_manager

router = APIRouter(tags=["websocket"])


async def cleanup_disconnected_player(
    room_code: str,
    player_id: str,
    manager: RoomManager,
    delay_seconds: int = 10
) -> None:
    """Remove a player if they do not reconnect after a disconnect grace period."""
    await asyncio.sleep(delay_seconds)

    room = manager.get_room(room_code)
    if not room:
        return

    player = room.get_player(player_id)
    if not player or not player.is_disconnected or ws_manager.is_connected(room_code, player_id):
        return

    player_name = player.name
    manager.leave_room(room_code, player_id)

    await ws_manager.broadcast_to_room(room_code, "PLAYER_LEFT", {
        "player_id": player_id,
        "player_name": player_name,
        "reason": "connection_closed"
    })


@router.websocket("/ws/{room_code}/{player_id}")
async def websocket_endpoint(
    room_code: str,
    player_id: str,
    websocket: WebSocket,
    manager: RoomManager = Depends(get_room_manager)
):
    """WebSocket endpoint for game updates."""
    room_code = room_code.strip().upper()

    # Connect player
    await ws_manager.connect(room_code, player_id, websocket)
    
    # Verify room exists
    room = manager.get_room(room_code)
    if not room:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Room not found")
        ws_manager.disconnect(room_code, player_id)
        return
    
    # Verify player in room
    player = room.get_player(player_id)
    if not player:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Player not in room")
        ws_manager.disconnect(room_code, player_id)
        return
    
    # Mark player as reconnected if was disconnected
    if player.is_disconnected:
        manager.reconnect_player(room_code, player_id)
        
        # Notify others
        await ws_manager.broadcast_to_room(room_code, "GAME_RESUMED", {
            "reconnected_player_name": player.name,
            "resume_state": room.state.value
        })
    
    try:
        while True:
            # Receive message from client
            data = await websocket.receive_json()
            
            # Handle message (echo back for now)
            # In production, handle specific message types
            
    except WebSocketDisconnect:
        ws_manager.disconnect(room_code, player_id)
        
        # Mark player as disconnected
        manager.disconnect_player(room_code, player_id)
        
        # Notify others
        await ws_manager.broadcast_to_room(room_code, "PLAYER_DISCONNECTED", {
            "player_id": player_id,
            "player_name": player.name,
            "reason": "connection_lost",
            "room_state": room.state.value
        })
        asyncio.create_task(cleanup_disconnected_player(room_code, player_id, manager))
    except Exception as e:
        ws_manager.disconnect(room_code, player_id)
        manager.disconnect_player(room_code, player_id)
        asyncio.create_task(cleanup_disconnected_player(room_code, player_id, manager))
        await websocket.close(code=status.WS_1011_SERVER_ERROR, reason=str(e))
