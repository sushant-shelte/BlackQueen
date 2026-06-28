import React from 'react';
import { useGame } from '../context/GameContext';

export const ScoreboardScreenModern: React.FC = () => {
  const { room, player, leaveRoom, advanceRound, isLoading } = useGame();

  if (!room) {
    return (
      <div className="game-screen">
        <h1>BLACK QUEEN</h1>
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
  const hasMoreRounds = room.current_round < room.num_rounds;
  const canAdvanceRound = room.owner_id === player?.player_id;
  const roundWinnerLabel = gameState
    ? (bidAchieved ? 'Bidder team' : 'Opponents')
    : 'Round results syncing';
  const story = gameState?.round_story;
  const topTrick = story?.top_trick;
  const getPlayerPoints = (playerId: string) => gameState?.player_points?.[playerId] || results[playerId]?.player_points || 0;
  const getRole = (playerId: string) => {
    if (playerId === gameState?.highest_bidder_id) return 'Bidder';
    if (teamMemberIds.has(playerId)) return 'Partner';
    return 'Opponent';
  };

  return (
    <div className="game-screen scoreboard-screen">
      <h1>BLACK QUEEN</h1>

      <div className="story-panel game-panel">
        <div className="section-heading">
          <div>
            <h2>Round {room.current_round} Complete</h2>
            <p className="status-line">
              Bidder: {bidder?.name || 'Unknown'} - Bid {highestBid} - Team {teamPoints} pts
            </p>
          </div>
          <span className={['chip', bidAchieved ? 'chip--gold' : 'chip--warning'].join(' ')}>
            {bidAchieved ? 'Bid made' : 'Bid missed'}
          </span>
        </div>

        <div className="story-grid">
          <div className="story-card">
            <span>Bid target</span>
            <strong>{story?.target ?? highestBid}</strong>
          </div>
          <div className="story-card">
            <span>Points made</span>
            <strong>{story?.team_points ?? teamPoints}</strong>
          </div>
          <div className="story-card">
            <span>Result</span>
            <strong>{story?.bid_achieved ? 'Made it' : 'Missed it'}</strong>
          </div>
          <div className="story-card">
            <span>Top trick</span>
            <strong>{topTrick ? `${topTrick.winner_name || 'Unknown'} - ${topTrick.trick_points || 0}` : 'Waiting'}</strong>
          </div>
        </div>

        <p className="status-line">
          {gameState
            ? (bidAchieved ? 'Bidder team made the bid' : 'Bidder team missed the bid')
            : 'Round results are still syncing'}
        </p>
        <p className="status-line">Round winner: {roundWinnerLabel}</p>
        {topTrick && (
          <p className="status-line">
            Top trick moment: Trick {topTrick.trick_number} won by {topTrick.winner_name || 'Unknown'} for {topTrick.trick_points} points.
          </p>
        )}
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

      <div className="game-panel scoreboard-actions">
        {hasMoreRounds && canAdvanceRound && (
          <button
            onClick={() => {
              void advanceRound();
            }}
            type="button"
            className="primary-action"
            disabled={isLoading}
          >
            Next Round
          </button>
        )}
        {hasMoreRounds && !canAdvanceRound && (
          <p className="status-line">Waiting for the room owner to start the next round.</p>
        )}
        <button
          onClick={async () => {
            await leaveRoom();
          }}
          type="button"
          className="secondary-action"
        >
          Back to Home
        </button>
      </div>
    </div>
  );
};
