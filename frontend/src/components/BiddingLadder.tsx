import React, { useMemo } from 'react';
import { useGame } from '../context/GameContext';

export const BiddingLadder: React.FC = () => {
  const { room } = useGame();

  const ladder = useMemo(() => {
    const values: number[] = [];
    values.push(75);
    values.push(80);
    for (let bid = 85; bid <= 150; bid += 5) values.push(bid);
    return values;
  }, []);

  if (!room) return null;

  const highestBid = room.game_state?.highest_bid ?? 75;
  const highestBidderId = room.game_state?.highest_bidder_id;
  const currentBidder = room.players[room.game_state?.bidding_player_index ?? 0];
  const bidStatus = room.game_state?.bids_status || {};
  const bidEntries = room.players.map((player) => ({
    player,
    value: bidStatus[player.player_id]
  }));

  return (
    <section className="game-panel bidding-ladder">
      <div className="bidding-ladder__header">
        <div>
          <h3>Bidding Ladder</h3>
          <p className="status-line">Opening bid starts at 80, then raises climb in steps of 5.</p>
        </div>
        <div className="chip chip--accent">
          {currentBidder ? `${currentBidder.name}'s turn` : 'Waiting'}
        </div>
      </div>

      <div className="bid-track">
        {ladder.map((bid) => {
          const isCurrent = bid === highestBid;
          const isRaised = bid === highestBid && !!highestBidderId;

          return (
            <div key={bid} className={['bid-step', isCurrent ? 'bid-step--current' : ''].filter(Boolean).join(' ')}>
              <span>{bid}</span>
              <div className={isCurrent ? 'bid-step__pulse' : 'bid-step__dot'} />
              <small>{isRaised ? 'live' : ''}</small>
            </div>
          );
        })}
      </div>

      <div className="bid-history">
        {bidEntries.map(({ player, value }) => (
          <div
            key={player.player_id}
            className={[
              'bid-history__entry',
              player.player_id === highestBidderId ? 'bid-history__entry--leader' : ''
            ].filter(Boolean).join(' ')}
          >
            <strong>{player.name}</strong>
            <span>{value ? `Bid ${value}` : 'Passed'}</span>
          </div>
        ))}
      </div>
    </section>
  );
};
