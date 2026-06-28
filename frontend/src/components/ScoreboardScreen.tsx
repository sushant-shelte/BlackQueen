import React from 'react';
import { useGame } from '../context/GameContext';

export const ScoreboardScreen: React.FC = () => {
  const { room, leaveRoom } = useGame();

  if (!room) {
    return (
      <div className="game-screen">
        <h1>BLACK QUEEN v1.0.0</h1>
        <p>Loading scoreboard...</p>
      </div>
    );
  }

  const gameState = room.game_state;
  const results = gameState?.round_results || {};
  const teamMemberIds = new Set(gameState?.team_member_ids || []);
  const bidder = room.players.find((player) => player.player_id === gameState?.highest_bidder_id);
  const highestBid = gameState?.highest_bid || 0;
  const teamPoints = gameState?.team_points || 0;
  const bidAchieved = gameState ? teamPoints >= highestBid : false;
  const roundWinnerLabel = gameState
    ? (bidAchieved ? 'Bidder team' : 'Opponents')
    : 'Round results syncing';
  const getPlayerPoints = (playerId: string) => gameState?.player_points?.[playerId] || results[playerId]?.player_points || 0;
  const getRole = (playerId: string) => {
    if (playerId === gameState?.highest_bidder_id) return 'Bidder';
    if (teamMemberIds.has(playerId)) return 'Partner';
    return 'Opponent';
  };

  return (
    <div className="game-screen">
      <h1>BLACK QUEEN v1.0.0</h1>
      <div className="game-panel">
        <h2>Round {room.current_round} Complete</h2>
        <p className="status-line">
          Bidder: {bidder?.name || 'Unknown'} - Bid {highestBid} - Team {teamPoints} pts
        </p>
        <h3>
          {gameState
            ? (bidAchieved ? 'Bidder team made the bid' : 'Bidder team missed the bid')
            : 'Round results are still syncing'}
        </h3>
        <p className="status-line">Round winner: {roundWinnerLabel}</p>
      </div>

      <div className="scoreboard-grid">
        {room.players.map((roomPlayer) => {
          const result = results[roomPlayer.player_id];
          return (
            <div
              key={roomPlayer.player_id}
              className={[
                'scoreboard-player',
                teamMemberIds.has(roomPlayer.player_id) ? 'scoreboard-player--team' : ''
              ].filter(Boolean).join(' ')}
            >
              <div>
                <strong>{roomPlayer.name}</strong>
                <small>{getRole(roomPlayer.player_id)}</small>
              </div>
              <span>{getPlayerPoints(roomPlayer.player_id)} player pts</span>
              <span>{result?.round_score ?? 0} round score</span>
              <span>{result?.cumulative_score ?? roomPlayer.cumulative_score} total</span>
            </div>
          );
        })}
      </div>

      <button onClick={leaveRoom} type="button">
        Back to Home
      </button>
    </div>
  );
};
