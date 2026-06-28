import React, { useState } from 'react';
import { useGame } from '../context/GameContext';

export const JoinRoomScreen: React.FC = () => {
  const { joinRoom, isLoading, error } = useGame();
  const [roomCode, setRoomCode] = useState('');
  const [playerName, setPlayerName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanRoomCode = roomCode.trim().toUpperCase();
    const cleanPlayerName = playerName.trim();

    if (cleanRoomCode && cleanPlayerName) {
      joinRoom(cleanRoomCode, cleanPlayerName);
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '400px', margin: '0 auto' }}>
      <h1>BLACK QUEEN v1.0.0</h1>
      <h2>Join a Room</h2>

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '15px' }}>
          <label>Room Code:</label>
          <input
            type="text"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            placeholder="ABC123"
            maxLength={6}
            disabled={isLoading}
            required
          />
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label>Your Name:</label>
          <input
            type="text"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            disabled={isLoading}
            required
          />
        </div>

        <button type="submit" disabled={isLoading}>
          {isLoading ? 'Joining...' : 'Join Room'}
        </button>
      </form>

      {error && <div style={{ color: 'red', marginTop: '10px' }}>{error}</div>}
    </div>
  );
};
