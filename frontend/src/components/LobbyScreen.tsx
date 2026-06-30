import React, { useEffect, useState } from 'react';
import { useGame } from '../context/GameContext';
import { apiFetch } from '../utils/api';

export const LobbyScreen: React.FC = () => {
  const { room, player, leaveRoom } = useGame();
  const [isReady, setIsReady] = useState(false);
  const [allReady, setAllReady] = useState(false);
  const [botDifficulty, setBotDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [isSavingDifficulty, setIsSavingDifficulty] = useState(false);
  const botCount = room?.players.filter((p) => p.is_bot).length || 0;

  useEffect(() => {
    setBotDifficulty(room?.bot_difficulty || 'medium');
  }, [room?.bot_difficulty]);

  const handleReady = async () => {
    if (!room || !player) return;

    try {
      const response = await apiFetch(`/rooms/${room.room_code}/ready`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_id: player.player_id, is_ready: !isReady })
      });

      if (response.ok) {
        setIsReady(!isReady);
        const data = await response.json();
        setAllReady(data.all_ready);
      }
    } catch (err) {
      console.error('Failed to mark ready:', err);
    }
  };

  const handleStartGame = async () => {
    if (!room || !player || !player.is_owner) return;

    try {
      const response = await apiFetch(`/rooms/${room.room_code}/start-game`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner_id: player.player_id })
      });

      if (!response.ok) throw new Error('Failed to start game');

      // Game will transition via WebSocket
    } catch (err) {
      console.error('Failed to start game:', err);
    }
  };

  const handleBotDifficultySave = async () => {
    if (!room || !player || !player.is_owner) return;

    try {
      setIsSavingDifficulty(true);
      const response = await apiFetch(`/rooms/${room.room_code}/bot-difficulty`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner_id: player.player_id, bot_difficulty: botDifficulty })
      });

      if (!response.ok) throw new Error('Failed to update bot difficulty');
    } catch (err) {
      console.error('Failed to update bot difficulty:', err);
    } finally {
      setIsSavingDifficulty(false);
    }
  };

  if (!room || !player) {
    return <div>Loading...</div>;
  }

  return (
    <div style={{ padding: '20px' }}>
      <h1>BLACK QUEEN</h1>
      <p><strong>Bot AI:</strong> {room.bot_difficulty || 'medium'}</p>
      
      <div style={{ marginBottom: '20px' }}>
        <h2>Room Code: {room.room_code}</h2>
        <button onClick={() => navigator.clipboard.writeText(room.room_code)}>
          Copy Code
        </button>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <h3>Players Joined ({room.players.length}/{room.max_players})</h3>
        <ul>
          {room.players.map((p) => (
            <li key={p.player_id}>
              {p.name} {p.is_owner && '(Owner)'} {p.is_ready ? '✓ Ready' : '✗ Not Ready'}
            </li>
          ))}
        </ul>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <button onClick={handleReady} disabled={allReady}>
          {isReady ? 'Not Ready' : 'Ready'}
        </button>
        <button
          onClick={() => {
            void leaveRoom();
          }}
          style={{ marginLeft: '10px' }}
        >
          Leave Room
        </button>
      </div>

      {player.is_owner && (
        <div>
          <div style={{ marginBottom: '12px' }}>
            <label>Bot Intelligence:</label>
            <select
              value={botDifficulty}
              onChange={(e) => setBotDifficulty(e.target.value as 'easy' | 'medium' | 'hard')}
              disabled={isSavingDifficulty || (room.state !== 'WAITING_FOR_PLAYERS' && room.state !== 'READY_CHECK')}
            >
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </div>
          <button
            onClick={handleBotDifficultySave}
            disabled={isSavingDifficulty || (room.state !== 'WAITING_FOR_PLAYERS' && room.state !== 'READY_CHECK')}
            style={{ marginRight: '10px' }}
          >
            {isSavingDifficulty ? 'Saving...' : 'Save Bot AI'}
          </button>
          <button 
            onClick={handleStartGame} 
            disabled={room.state !== 'WAITING_FOR_PLAYERS' && room.state !== 'READY_CHECK'}
          >
            {botCount > 0 ? 'Start Game' : 'Start Game with Bots'}
          </button>
        </div>
      )}
    </div>
  );
};
