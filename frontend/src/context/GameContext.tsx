import React, { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { Room, Player } from '../types/game';

interface GameContextType {
  room: Room | null;
  player: Player | null;
  setRoom: (room: Room | null) => void;
  setPlayer: (player: Player | null) => void;
  joinRoom: (roomCode: string, playerName: string) => Promise<void>;
  createRoom: (playerName: string, maxPlayers: number, numTeammates: number, numRounds: number) => Promise<void>;
  leaveRoom: () => Promise<void>;
  refreshRoom: () => Promise<void>;
  isLoading: boolean;
  error: string | null;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

interface GameProviderProps {
  children: ReactNode;
}

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';
const LOCAL_ROOM_CODE_KEY = 'blackQueen.roomCode';
const SESSION_ROOM_CODE_KEY = 'blackQueen.roomCode';
const SESSION_PLAYER_ID_KEY = 'blackQueen.playerId';

const getErrorMessage = async (response: Response, fallback: string) => {
  try {
    const data = await response.json();
    return data.detail || data.error_message || fallback;
  } catch {
    return fallback;
  }
};

const getWebSocketUrl = (roomCode: string, playerId: string) => {
  const apiUrl = new URL(API_BASE);
  apiUrl.protocol = apiUrl.protocol === 'https:' ? 'wss:' : 'ws:';
  apiUrl.pathname = apiUrl.pathname.replace(/\/api\/?$/, `/ws/${roomCode}/${playerId}`);
  apiUrl.search = '';
  apiUrl.hash = '';
  return apiUrl.toString();
};

const getRoomUrl = (roomCode: string, playerId?: string | null) => {
  const params = playerId ? `?player_id=${encodeURIComponent(playerId)}` : '';
  return `${API_BASE}/rooms/${roomCode}${params}`;
};

const saveLocalSession = (roomCode: string, playerId: string) => {
  localStorage.setItem(LOCAL_ROOM_CODE_KEY, roomCode);
  sessionStorage.setItem(SESSION_ROOM_CODE_KEY, roomCode);
  sessionStorage.setItem(SESSION_PLAYER_ID_KEY, playerId);
};

const clearLocalSession = () => {
  sessionStorage.removeItem(SESSION_ROOM_CODE_KEY);
  sessionStorage.removeItem(SESSION_PLAYER_ID_KEY);
};

const isMissingRoomResponse = (response: Response) => response.status === 404;

export const GameProvider: React.FC<GameProviderProps> = ({ children }) => {
  const [room, setRoom] = useState<Room | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const restoreLocalSession = async () => {
      const savedRoomCode = sessionStorage.getItem(SESSION_ROOM_CODE_KEY) || localStorage.getItem(LOCAL_ROOM_CODE_KEY);
      const savedPlayerId = sessionStorage.getItem(SESSION_PLAYER_ID_KEY);

      if (!savedRoomCode || !savedPlayerId) return;

      setIsLoading(true);
      try {
        const response = await fetch(getRoomUrl(savedRoomCode, savedPlayerId));
        if (!response.ok) {
          clearLocalSession();
          if (isMissingRoomResponse(response)) {
            setError('Room no longer exists. Please create a new room.');
          }
          return;
        }

        const roomData = await response.json();
        const savedPlayer = roomData.players.find((p: Player) => p.player_id === savedPlayerId);

        if (!savedPlayer) {
          clearLocalSession();
          return;
        }

        setRoom(roomData);
        setPlayer(savedPlayer);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    restoreLocalSession();
  }, []);

  const refreshRoom = useCallback(async () => {
    if (!room?.room_code || !player?.player_id) return;

    const response = await fetch(getRoomUrl(room.room_code, player.player_id));
    if (!response.ok) {
      if (isMissingRoomResponse(response)) {
        setRoom(null);
        setPlayer(null);
        clearLocalSession();
        setError('Room no longer exists. Please create a new room.');
      }
      return;
    }

    const roomData = await response.json();
    const refreshedPlayer = roomData.players.find((p: Player) => p.player_id === player.player_id);
    setRoom(roomData);
    setPlayer(refreshedPlayer || null);
  }, [room?.room_code, player?.player_id]);

  useEffect(() => {
    if (!room?.room_code || !player?.player_id) return;

    const socket = new WebSocket(getWebSocketUrl(room.room_code, player.player_id));
    let isCancelled = false;

    socket.onopen = () => {
      if (!isCancelled) {
        void refreshRoom();
      }
    };

    socket.onmessage = () => {
      if (!isCancelled) {
        void refreshRoom();
      }
    };

    return () => {
      isCancelled = true;
      socket.close();
    };
  }, [room?.room_code, player?.player_id, refreshRoom]);

  const createRoom = async (playerName: string, maxPlayers: number, numTeammates: number, numRounds: number) => {
    setIsLoading(true);
    setError(null);

    try {
      const cleanPlayerName = playerName.trim();
      const response = await fetch(`${API_BASE}/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_name: cleanPlayerName, max_players: maxPlayers, num_teammates: numTeammates, num_rounds: numRounds })
      });

      if (!response.ok) throw new Error(await getErrorMessage(response, 'Failed to create room'));

      const data = await response.json();
      setRoom(data);
      setPlayer(data.players[0]);
      saveLocalSession(data.room_code, data.players[0].player_id);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const joinRoom = async (roomCode: string, playerName: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const cleanRoomCode = roomCode.trim().toUpperCase();
      const cleanPlayerName = playerName.trim();

      const response = await fetch(`${API_BASE}/rooms/${cleanRoomCode}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_name: cleanPlayerName })
      });

      if (!response.ok) throw new Error(await getErrorMessage(response, 'Failed to join room'));

      const data = await response.json();
      
      // Fetch full room state
      const roomResponse = await fetch(getRoomUrl(cleanRoomCode, data.player_id));
      if (!roomResponse.ok) throw new Error(await getErrorMessage(roomResponse, 'Failed to load room'));
      const roomData = await roomResponse.json();
      const joinedPlayer = roomData.players.find((p: Player) => p.player_id === data.player_id);
      
      setRoom(roomData);
      setPlayer(joinedPlayer || null);
      if (joinedPlayer) {
        saveLocalSession(cleanRoomCode, joinedPlayer.player_id);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const leaveRoom = async () => {
    if (!room || !player) return;

    try {
      await fetch(`${API_BASE}/rooms/${room.room_code}/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_id: player.player_id })
      });

      setRoom(null);
      setPlayer(null);
      clearLocalSession();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <GameContext.Provider value={{ room, player, setRoom, setPlayer, joinRoom, createRoom, leaveRoom, refreshRoom, isLoading, error }}>
      {children}
    </GameContext.Provider>
  );
};

export const useGame = () => {
  const context = useContext(GameContext);
  if (context === undefined) throw new Error('useGame must be used within GameProvider');
  return context;
};
