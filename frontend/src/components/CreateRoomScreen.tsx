import React, { useState } from 'react';
import { useGame } from '../context/GameContext';

export const CreateRoomScreen: React.FC = () => {
  const { createRoom, isLoading, error } = useGame();
  const [playerName, setPlayerName] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(6);
  const [numTeammates, setNumTeammates] = useState(1);
  const [numRounds, setNumRounds] = useState(3);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (playerName.trim()) {
      createRoom(playerName, maxPlayers, numTeammates, numRounds);
    }
  };

  const maxTeammates = Math.floor(maxPlayers / 2) - 1;

  return (
    <div style={{ padding: '20px', maxWidth: '400px', margin: '0 auto' }}>
      <h1>BLACK QUEEN</h1>
      <h2>Create a New Room</h2>

      <form onSubmit={handleSubmit}>
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

        <div style={{ marginBottom: '15px' }}>
          <label>Max Players (5-10):</label>
          <select value={maxPlayers} onChange={(e) => setMaxPlayers(parseInt(e.target.value))}>
            {[5, 6, 7, 8, 9, 10].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label>Teammates per Player (1-{maxTeammates}):</label>
          <select value={numTeammates} onChange={(e) => setNumTeammates(parseInt(e.target.value))}>
            {Array.from({ length: maxTeammates }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label>Number of Rounds:</label>
          <input
            type="number"
            value={numRounds}
            onChange={(e) => setNumRounds(parseInt(e.target.value))}
            min="1"
            required
          />
        </div>

        <button type="submit" disabled={isLoading}>
          {isLoading ? 'Creating...' : 'Create Room'}
        </button>
      </form>

      {error && <div style={{ color: 'red', marginTop: '10px' }}>{error}</div>}
    </div>
  );
};
