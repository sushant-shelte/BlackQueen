import React, { useMemo } from 'react';
import { useGame } from '../context/GameContext';

export const FinalStandingsScreen: React.FC = () => {
  const { room, leaveRoom } = useGame();

  const standings = useMemo(() => {
    if (!room) return [];
    return [...room.players].sort((a, b) => {
      if (b.cumulative_score !== a.cumulative_score) return b.cumulative_score - a.cumulative_score;
      return a.seat - b.seat;
    });
  }, [room]);

  if (!room) {
    return (
      <div className="game-screen">
        <h1>BLACK QUEEN v1.0.0</h1>
        <p>Loading final standings...</p>
      </div>
    );
  }

  const winner = standings[0];
  const roundsPlayed = room.current_round;

  return (
    <div className="game-screen">
      <h1>BLACK QUEEN v1.0.0</h1>
      <div className="game-panel">
        <h2>Game Ended</h2>
        <p className="status-line">Rounds played: {roundsPlayed}</p>
        <h3>Winner: {winner?.name || 'Unknown'}</h3>
      </div>

      <div className="scoreboard-grid">
        {standings.map((player, index) => (
          <div
            key={player.player_id}
            className={[
              'scoreboard-player',
              index === 0 ? 'scoreboard-player--team' : ''
            ].filter(Boolean).join(' ')}
          >
            <div>
              <strong>
                #{index + 1} {player.name}
              </strong>
              <small>{player.is_bot ? 'Bot' : 'Player'}</small>
            </div>
            <span>{player.cumulative_score} total</span>
          </div>
        ))}
      </div>

      <div className="game-panel" style={{ marginTop: '20px' }}>
        <p className="status-line">Thanks for playing.</p>
        <button onClick={leaveRoom} type="button">
          Back to Home
        </button>
      </div>
    </div>
  );
};
