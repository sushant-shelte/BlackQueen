import React, { useState } from 'react';
import { useGame } from '../context/GameContext';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

export const LobbyScreen: React.FC = () => {
  const { room, player } = useGame();
  const [isReady, setIsReady] = useState(false);
  const [allReady, setAllReady] = useState(false);
  const botCount = room?.players.filter((p) => p.is_bot).length || 0;

  const handleReady = async () => {
    if (!room || !player) return;

    try {
      const response = await fetch(`${API_BASE}/rooms/${room.room_code}/ready`, {
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
      const response = await fetch(`${API_BASE}/rooms/${room.room_code}/start-game`, {
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

  if (!room || !player) {
    return <div>Loading...</div>;
  }

  return (
    <div style={{ padding: '20px' }}>
      <h1>BLACK QUEEN v1.0.0</h1>
      
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
      </div>

      {player.is_owner && (
        <div>
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
