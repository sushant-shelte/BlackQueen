import React, { useEffect, useMemo, useState } from 'react';
import { useGame } from '../context/GameContext';
import { Suit } from '../types/game';
import { PlayingCard } from './PlayingCard';
import { allCardCodes, getCardLabel } from '../utils/cards';
import { apiFetch } from '../utils/api';
import { BiddingLadder } from './BiddingLadder';

const suits: { value: Suit; label: string }[] = [
  { value: 'H', label: 'Hearts' },
  { value: 'D', label: 'Diamonds' },
  { value: 'C', label: 'Clubs' },
  { value: 'S', label: 'Spades' }
];

export const BiddingScreenModern: React.FC = () => {
  const { room, player, refreshRoom, activityFeed } = useGame();
  const [bidAmount, setBidAmount] = useState(80);
  const [trumpSuit, setTrumpSuit] = useState<Suit>('H');
  const [partnerCards, setPartnerCards] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!room || !player) {
    return <div>Loading...</div>;
  }

  const currentBidder = room.game_state?.bidding_player_index !== undefined
    ? room.players[room.game_state.bidding_player_index]
    : null;
  const dealer = room.players[0];
  const hand = player.hand || [];
  const highestBid = room.game_state?.highest_bid ?? 75;
  const highestBidder = room.players.find((roomPlayer) => roomPlayer.player_id === room.game_state?.highest_bidder_id) || dealer;
  const isYourBidTurn = room.state === 'BIDDING' && currentBidder?.player_id === player.player_id;
  const isHighestBidder = (room.game_state?.highest_bidder_id || dealer?.player_id) === player.player_id;
  const nextMinimumBid = highestBid <= 75 ? 80 : highestBid + 5;

  useEffect(() => {
    setBidAmount((current) => (current < nextMinimumBid ? nextMinimumBid : current));
  }, [nextMinimumBid]);

  const bidOptions = [];
  for (let value = Math.max(nextMinimumBid, 80); value <= 150; value += 5) {
    bidOptions.push(value);
  }

  const cardOptions = useMemo(() => allCardCodes(), []);
  const bidderHand = isHighestBidder ? hand : [];
  const allowedPartnerOptions = useMemo(
    () => cardOptions.filter((card) => !bidderHand.includes(card)),
    [cardOptions, bidderHand]
  );

  const latestFeedEvent = activityFeed.find((entry) => entry.type === 'BID_PLACED');

  const isValidPartnerSelection = (cards: string[]) => {
    if (cards.length !== room.num_teammates || cards.some((card) => !card)) return false;
    if (new Set(cards).size !== cards.length) return false;
    return cards.every((card) => allowedPartnerOptions.includes(card));
  };

  const getPartnerOptions = (selectedIndex: number) => {
    const selectedOtherCards = new Set(
      partnerCards.filter((card, index) => index !== selectedIndex && card)
    );
    return allowedPartnerOptions.filter((card) => !selectedOtherCards.has(card) || card === partnerCards[selectedIndex]);
  };

  const setPartnerCardAt = (selectedIndex: number, card: string) => {
    setPartnerCards((currentCards) => {
      const nextCards = [...currentCards];
      nextCards[selectedIndex] = card;
      return nextCards;
    });
  };

  useEffect(() => {
    if (room.state !== 'ANNOUNCING_PARTNERS' || !isHighestBidder) return;

    const nextCards = partnerCards.slice(0, room.num_teammates);
    while (nextCards.length < room.num_teammates) {
      nextCards.push('');
    }

    const usedCards = new Set<string>();
    const normalizedCards = nextCards.map((card) => {
      if (card && allowedPartnerOptions.includes(card) && !usedCards.has(card)) {
        usedCards.add(card);
        return card;
      }

      const replacement = allowedPartnerOptions.find((option) => !usedCards.has(option)) || '';
      if (replacement) usedCards.add(replacement);
      return replacement;
    });

    if (normalizedCards.join('|') !== partnerCards.join('|')) {
      setPartnerCards(normalizedCards);
    }
  }, [room.state, room.num_teammates, isHighestBidder, partnerCards, allowedPartnerOptions]);

  const submitJson = async (path: string, body: object, fallback: string) => {
    setIsSubmitting(true);
    setMessage(null);
    try {
      const response = await apiFetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || fallback);
      }

      await refreshRoom();
    } catch (err: any) {
      setMessage(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const title = room.state === 'BIDDING'
    ? 'Bidding Phase'
    : room.state === 'ANNOUNCING_TRUMP'
      ? 'Announce Trump'
      : 'Announce Partners';

  const recentPassCount = Object.values(room.game_state?.bids_status || {}).filter((value) => value === null).length;

  return (
    <div className="game-screen bidding-screen">
      <h1>BLACK QUEEN</h1>
      <div className="gameplay-summary-chips">
        <span className="chip chip--muted">Dealer: {dealer.name}</span>
        <span className="chip chip--gold">Current bidder: {currentBidder?.name || 'Waiting...'}</span>
        <span className="chip chip--accent">Highest bid: {highestBid}</span>
        <span className="chip chip--muted">Passes: {recentPassCount}</span>
      </div>

      <section className="game-panel">
        <div className="section-heading">
          <div>
            <h2>{title}</h2>
            <p className="status-line">Round {room.current_round}</p>
          </div>
        </div>

        <div className="bidding-summary-strip">
          <div className="summary-pill summary-pill--current">
            <span>Highest bid</span>
            <strong>{highestBid}</strong>
          </div>
          <div className="summary-pill">
            <span>Highest bidder</span>
            <strong>{highestBidder?.name || 'Dealer'}</strong>
          </div>
          <div className={['summary-pill', latestFeedEvent ? 'summary-pill--pulse' : ''].join(' ')}>
            <span>Latest bid event</span>
            <strong>{latestFeedEvent ? latestFeedEvent.title : 'Waiting'}</strong>
          </div>
        </div>

        <BiddingLadder />
      </section>

      <div className="game-panel bidding-actions">
        {room.state === 'BIDDING' && (
          <div className="action-row">
            <label>
              Raise to
              <select
                value={bidAmount}
                onChange={(event) => setBidAmount(Number(event.target.value))}
                disabled={!isYourBidTurn || isSubmitting || bidOptions.length === 0}
              >
                {bidOptions.map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </label>
            <button
              onClick={() => submitJson(`/rooms/${room.room_code}/bid`, {
                player_id: player.player_id,
                bid_amount: bidAmount
              }, 'Failed to place bid')}
              disabled={!isYourBidTurn || isSubmitting || bidOptions.length === 0}
              className={['primary-action', isYourBidTurn ? 'primary-action--pulse' : ''].join(' ')}
            >
              Raise Bid
            </button>
            <button
              onClick={() => submitJson(`/rooms/${room.room_code}/bid`, {
                player_id: player.player_id,
                bid_amount: null
              }, 'Failed to pass')}
              disabled={!isYourBidTurn || isSubmitting}
              className="secondary-action"
            >
              Pass
            </button>
            {!isYourBidTurn && <span className="status-line">Waiting for {currentBidder?.name || 'next player'}...</span>}
          </div>
        )}

        {room.state === 'ANNOUNCING_TRUMP' && (
          isHighestBidder ? (
            <div className="action-row">
              <label>
                Trump suit
                <select value={trumpSuit} onChange={(event) => setTrumpSuit(event.target.value as Suit)} disabled={isSubmitting}>
                  {suits.map((suit) => (
                    <option key={suit.value} value={suit.value}>{suit.label}</option>
                  ))}
                </select>
              </label>
              <button
                onClick={() => submitJson(`/rooms/${room.room_code}/announce-trump`, {
                  player_id: player.player_id,
                  trump_suit: trumpSuit
                }, 'Failed to announce trump')}
                disabled={isSubmitting}
                className="primary-action"
              >
                Announce Trump
              </button>
            </div>
          ) : (
            <p>Waiting for {highestBidder?.name || 'highest bidder'} to announce trump.</p>
          )
        )}

        {room.state === 'ANNOUNCING_PARTNERS' && (
          isHighestBidder ? (
            <div className="action-row">
              {Array.from({ length: room.num_teammates }).map((_, partnerIndex) => (
                <label key={partnerIndex}>
                  Partner card {partnerIndex + 1}
                  <select
                    value={partnerCards[partnerIndex] || ''}
                    onChange={(event) => setPartnerCardAt(partnerIndex, event.target.value)}
                    disabled={isSubmitting}
                  >
                    {getPartnerOptions(partnerIndex).map((card) => (
                      <option key={card} value={card}>{getCardLabel(card)}</option>
                    ))}
                  </select>
                </label>
              ))}
              <button
                onClick={() => submitJson(`/rooms/${room.room_code}/announce-partners`, {
                  player_id: player.player_id,
                  partner_cards: partnerCards
                }, 'Failed to announce partners')}
                disabled={isSubmitting || !isValidPartnerSelection(partnerCards)}
                className="primary-action"
              >
                Announce Partners
              </button>
            </div>
          ) : (
            <p>Waiting for {highestBidder?.name || 'highest bidder'} to announce partner cards.</p>
          )
        )}

        {message && <p style={{ color: '#ff8a8a' }}>{message}</p>}
      </div>

      <div className="game-panel">
        <h3>Your Cards ({hand.length})</h3>
        {hand.length > 0 ? (
          <div className="card-row">
            {hand.map((card, index) => (
              <PlayingCard key={`${card}-${index}`} card={card} />
            ))}
          </div>
        ) : (
          <p>Cards are being dealt...</p>
        )}
      </div>
    </div>
  );
};
