import React, { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { ActivityFeedEntry, Room, Player, WSMessage } from '../types/game';
import { API_BASE_ERROR, apiFetch, getWebSocketUrl } from '../utils/api';
import { playGameSound } from '../utils/sound';

interface GameContextType {
  room: Room | null;
  player: Player | null;
  setRoom: (room: Room | null) => void;
  setPlayer: (player: Player | null) => void;
  joinRoom: (roomCode: string, playerName: string) => Promise<void>;
  createRoom: (playerName: string, maxPlayers: number, numTeammates: number, numRounds: number) => Promise<void>;
  leaveRoom: () => Promise<void>;
  advanceRound: () => Promise<void>;
  refreshRoom: () => Promise<void>;
  isLoading: boolean;
  error: string | null;
  activityFeed: ActivityFeedEntry[];
}

const GameContext = createContext<GameContextType | undefined>(undefined);

interface GameProviderProps {
  children: ReactNode;
}

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

const saveLocalSession = (roomCode: string, playerId: string) => {
  localStorage.setItem(LOCAL_ROOM_CODE_KEY, roomCode);
  sessionStorage.setItem(SESSION_ROOM_CODE_KEY, roomCode);
  sessionStorage.setItem(SESSION_PLAYER_ID_KEY, playerId);
};

const clearLocalSession = () => {
  localStorage.removeItem(LOCAL_ROOM_CODE_KEY);
  sessionStorage.removeItem(SESSION_ROOM_CODE_KEY);
  sessionStorage.removeItem(SESSION_PLAYER_ID_KEY);
};

const isMissingRoomResponse = (response: Response) => response.status === 404;

const makeFeedEntry = (message: WSMessage): ActivityFeedEntry | null => {
  const payload = message.payload || {};

  switch (message.type) {
    case 'PLAYER_JOINED':
      return {
        id: `${message.timestamp}-${message.type}-${payload.player_id || 'join'}`,
        type: message.type,
        tone: 'positive',
        title: 'Player joined',
        detail: `${payload.player_name || 'A player'} entered room ${payload.room_code || ''}`.trim(),
        timestamp: message.timestamp
      };
    case 'PLAYER_LEFT':
      return {
        id: `${message.timestamp}-${message.type}-${payload.player_id || 'leave'}`,
        type: message.type,
        tone: 'warning',
        title: 'Player left',
        detail: payload.bot_replacement
          ? `${payload.player_name || 'A player'} left the room. A bot now controls that seat.`
          : `${payload.player_name || 'A player'} left the room`,
        timestamp: message.timestamp
      };
    case 'GAME_STARTED':
      return {
        id: `${message.timestamp}-${message.type}`,
        type: message.type,
        tone: 'positive',
        title: 'Round started',
        detail: `Round ${payload.round_number || 1} began with ${payload.first_player_name || 'the dealer'} opening bidding.`,
        timestamp: message.timestamp
      };
    case 'BID_PLACED':
      return {
        id: `${message.timestamp}-${message.type}-${payload.player_id || 'bid'}`,
        type: message.type,
        tone: payload.bid_amount ? 'positive' : 'neutral',
        title: payload.bid_amount ? 'Bid raised' : 'Passed',
        detail: payload.bid_amount
          ? `${payload.player_name || 'A player'} bid ${payload.bid_amount}`
          : `${payload.player_name || 'A player'} passed`,
        timestamp: message.timestamp
      };
    case 'TRUMP_ANNOUNCED':
      return {
        id: `${message.timestamp}-${message.type}`,
        type: message.type,
        tone: 'positive',
        title: 'Trump announced',
        detail: `${payload.announced_by_name || 'The bidder'} named ${payload.trump_suit || 'a suit'} as trump`,
        timestamp: message.timestamp
      };
    case 'PARTNERS_ANNOUNCED':
      return {
        id: `${message.timestamp}-${message.type}`,
        type: message.type,
        tone: 'positive',
        title: 'Partners locked in',
        detail: `${payload.announced_by_name || 'The bidder'} announced partner cards`,
        timestamp: message.timestamp
      };
    case 'CARD_PLAYED':
      return {
        id: `${message.timestamp}-${message.type}-${payload.card || 'card'}`,
        type: message.type,
        tone: 'neutral',
        title: 'Card played',
        detail: `${payload.player_name || 'A player'} played ${payload.card || 'a card'}`,
        timestamp: message.timestamp
      };
    case 'TRICK_WON':
      return {
        id: `${message.timestamp}-${message.type}-${payload.trick_number || 'trick'}`,
        type: message.type,
        tone: 'positive',
        title: 'Trick won',
        detail: `${payload.winner_name || 'A player'} took trick ${payload.trick_number || ''} for ${payload.trick_points || 0} points`.trim(),
        timestamp: message.timestamp
      };
    case 'ROUND_ENDED':
      return {
        id: `${message.timestamp}-${message.type}`,
        type: message.type,
        tone: payload.bid_achieved ? 'positive' : 'warning',
        title: payload.bid_achieved ? 'Bid made' : 'Bid missed',
        detail: `Team scored ${payload.team_points || 0} against a target of ${payload.highest_bid || 0}`,
        timestamp: message.timestamp
      };
    case 'GAME_ENDED':
      return {
        id: `${message.timestamp}-${message.type}`,
        type: message.type,
        tone: 'positive',
        title: 'Game ended',
        detail: 'Final standings are ready.',
        timestamp: message.timestamp
      };
    default:
      return null;
  }
};

const soundForMessage = (message: WSMessage) => {
  switch (message.type) {
    case 'PLAYER_JOINED':
      return 'join' as const;
    case 'PLAYER_LEFT':
    case 'PLAYER_DISCONNECTED':
      return 'leave' as const;
    case 'GAME_STARTED':
    case 'CARDS_DEALT':
      return 'deal' as const;
    case 'BID_PLACED':
      return message.payload?.bid_amount ? 'bid' as const : 'pass' as const;
    case 'TRICK_WON':
      return 'trick' as const;
    case 'ROUND_ENDED':
    case 'GAME_ENDED':
      return 'round' as const;
    default:
      return null;
  }
};

export const GameProvider: React.FC<GameProviderProps> = ({ children }) => {
  const [room, setRoom] = useState<Room | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activityFeed, setActivityFeed] = useState<ActivityFeedEntry[]>([]);

  const pushFeedEntry = useCallback((entry: ActivityFeedEntry) => {
    setActivityFeed((current) => [entry, ...current].slice(0, 10));
  }, []);

  useEffect(() => {
    if (API_BASE_ERROR) {
      setError(API_BASE_ERROR);
      return;
    }

    const restoreLocalSession = async () => {
      const savedRoomCode = sessionStorage.getItem(SESSION_ROOM_CODE_KEY) || localStorage.getItem(LOCAL_ROOM_CODE_KEY);
      const savedPlayerId = sessionStorage.getItem(SESSION_PLAYER_ID_KEY);

      if (!savedRoomCode || !savedPlayerId) return;

      setIsLoading(true);
      try {
        const response = await apiFetch(`/rooms/${savedRoomCode}?player_id=${encodeURIComponent(savedPlayerId)}`);
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
        setActivityFeed([]);
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

    const response = await apiFetch(`/rooms/${room.room_code}?player_id=${encodeURIComponent(player.player_id)}`);
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

    socket.onmessage = (event) => {
      if (isCancelled) return;

      try {
        const message = JSON.parse(event.data) as WSMessage;
        const feedEntry = makeFeedEntry(message);
        const sound = soundForMessage(message);

        if (feedEntry) {
          pushFeedEntry(feedEntry);
        }

        if (sound) {
          void playGameSound(sound);
        }
      } catch {
        // Ignore malformed websocket messages and just refresh state.
      }

      void refreshRoom();
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
      const response = await apiFetch('/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_name: cleanPlayerName, max_players: maxPlayers, num_teammates: numTeammates, num_rounds: numRounds })
      });

      if (!response.ok) throw new Error(await getErrorMessage(response, 'Failed to create room'));

      const data = await response.json();
      setRoom(data);
      setPlayer(data.players[0]);
      saveLocalSession(data.room_code, data.players[0].player_id);
      setActivityFeed([]);
      pushFeedEntry({
        id: `${Date.now()}-room-created`,
        type: 'ROOM_CREATED',
        tone: 'positive',
        title: 'Room created',
        detail: `Room ${data.room_code} is ready. Share the code to invite players.`,
        timestamp: new Date().toISOString()
      });
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

      const response = await apiFetch(`/rooms/${cleanRoomCode}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_name: cleanPlayerName })
      });

      if (!response.ok) throw new Error(await getErrorMessage(response, 'Failed to join room'));

      const data = await response.json();
      
      // Fetch full room state
      const roomResponse = await apiFetch(`/rooms/${cleanRoomCode}?player_id=${encodeURIComponent(data.player_id)}`);
      if (!roomResponse.ok) throw new Error(await getErrorMessage(roomResponse, 'Failed to load room'));
      const roomData = await roomResponse.json();
      const joinedPlayer = roomData.players.find((p: Player) => p.player_id === data.player_id);
      
      setRoom(roomData);
      setPlayer(joinedPlayer || null);
      if (joinedPlayer) {
        saveLocalSession(cleanRoomCode, joinedPlayer.player_id);
      }
      setActivityFeed([]);
      pushFeedEntry({
        id: `${Date.now()}-room-joined`,
        type: 'ROOM_JOINED',
        tone: 'positive',
        title: 'Joined room',
        detail: `You joined room ${cleanRoomCode}.`,
        timestamp: new Date().toISOString()
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const leaveRoom = async () => {
    if (!room || !player) return;

    try {
      await apiFetch(`/rooms/${room.room_code}/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_id: player.player_id })
      });

      setRoom(null);
      setPlayer(null);
      clearLocalSession();
      setActivityFeed([]);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const advanceRound = async () => {
    if (!room?.room_code) return;

    setIsLoading(true);
    setError(null);
    try {
      const response = await apiFetch(`/rooms/${room.room_code}/next-round`, {
        method: 'POST'
      });

      if (!response.ok) throw new Error(await getErrorMessage(response, 'Failed to start next round'));

      await refreshRoom();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <GameContext.Provider value={{ room, player, setRoom, setPlayer, joinRoom, createRoom, leaveRoom, advanceRound, refreshRoom, isLoading, error, activityFeed }}>
      {children}
    </GameContext.Provider>
  );
};

export const useGame = () => {
  const context = useContext(GameContext);
  if (context === undefined) throw new Error('useGame must be used within GameProvider');
  return context;
};
