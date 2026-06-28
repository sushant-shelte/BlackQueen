"""SQLite-backed persistence for room state."""
import os
import pickle
import sqlite3
import threading
from pathlib import Path
from typing import Dict, Optional

from ..models.game import Room


class SQLiteRoomStore:
    """Stores complete room snapshots in SQLite.

    The in-memory Room model is still the runtime source of truth. SQLite keeps
    durable snapshots so rooms can be restored after a backend reload/restart.
    """

    def __init__(self, db_path: Optional[str] = None):
        default_path = Path(__file__).resolve().parents[2] / "data" / "blackqueen.sqlite3"
        self.db_path = Path(db_path or os.getenv("BLACKQUEEN_DB_PATH", default_path))
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        return sqlite3.connect(self.db_path)

    def _initialize(self) -> None:
        with self._lock, self._connect() as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS rooms (
                    room_code TEXT PRIMARY KEY,
                    state BLOB NOT NULL,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            connection.commit()

    def load_rooms(self) -> Dict[str, Room]:
        """Load all persisted rooms."""
        rooms: Dict[str, Room] = {}
        with self._lock, self._connect() as connection:
            rows = connection.execute("SELECT room_code, state FROM rooms").fetchall()

        for room_code, state in rows:
            try:
                room = pickle.loads(state)
                rooms[room_code] = room
            except Exception:
                # Skip corrupt snapshots instead of blocking the whole server.
                continue

        return rooms

    def save_room(self, room: Room) -> None:
        """Persist a room snapshot."""
        payload = pickle.dumps(room, protocol=pickle.HIGHEST_PROTOCOL)
        with self._lock, self._connect() as connection:
            connection.execute(
                """
                INSERT INTO rooms (room_code, state, updated_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(room_code) DO UPDATE SET
                    state = excluded.state,
                    updated_at = CURRENT_TIMESTAMP
                """,
                (room.room_code, payload),
            )
            connection.commit()

    def delete_room(self, room_code: str) -> None:
        """Delete a persisted room snapshot."""
        with self._lock, self._connect() as connection:
            connection.execute("DELETE FROM rooms WHERE room_code = ?", (room_code.strip().upper(),))
            connection.commit()
