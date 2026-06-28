import React, { useEffect, useMemo, useState } from 'react';
import { useGame } from '../context/GameContext';
import { Suit } from '../types/game';
import { PlayingCard } from './PlayingCard';
import { allCardCodes, getCardLabel } from '../utils/cards';
import { apiFetch } from '../utils/api';
const suits: { value: Suit; label: string }[] = [
  { value: 'H', label: 'Hearts' },
  { value: 'D', label: 'Diamonds' },
  { value: 'C', label: 'Clubs' },
  { value: 'S', label: 'Spades' }
];

export const BiddingScreen: React.FC = () => {
  const { room, player, refreshRoom } = useGame();
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
  const hand = player.hand || [];
  const highestBid = room.game_state?.highest_bid ?? 75;
  const highestBidder = room.players.find((roomPlayer) => roomPlayer.player_id === room.game_state?.highest_bidder_id);
  const isYourBidTurn = room.state === 'BIDDING' && currentBidder?.player_id === player.player_id;
  const isHighestBidder = room.game_state?.highest_bidder_id === player.player_id;
  const nextMinimumBid = highestBidder ? highestBid + 5 : 75;
  const bidOptions = [];
  for (let value = Math.max(nextMinimumBid, 75); value <= 150; value += 5) {
    bidOptions.push(value);
  }
  const cardOptions = useMemo(() => allCardCodes(), []);
  const bidderHand = isHighestBidder ? hand : [];
  const allowedPartnerOptions = useMemo(
    () => cardOptions.filter((card) => !bidderHand.includes(card)),
    [cardOptions, bidderHand]
  );
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

  return (
    <div className="game-screen">
      <h1>BLACK QUEEN v1.0.0</h1>
      <div className="status-line">
        <strong>Player:</strong> {player.name} {player.is_owner && '(Owner)'}
        <span style={{ marginLeft: '20px' }}><strong>Room:</strong> {room.room_code}</span>
      </div>

      <h2>{title}</h2>
      <p className="status-line">Round {room.current_round}</p>

      <div className="game-panel" style={{ marginBottom: '20px' }}>
        <h3>Players ({room.players.length}/{room.max_players})</h3>
        <ul>
          {room.players.map((roomPlayer, index) => (
            <li key={roomPlayer.player_id}>
              {index === room.game_state?.bidding_player_index ? '→ ' : ''}
              {roomPlayer.name}
              {roomPlayer.is_bot && ' (Bot)'}
              {roomPlayer.player_id === player.player_id && ' (You)'}
              {' - '}
              {roomPlayer.cumulative_score} pts
            </li>
          ))}
        </ul>
      </div>

      <div className="game-panel" style={{ marginBottom: '20px' }}>
        <p><strong>Current bidder:</strong> {currentBidder?.name || 'Waiting...'}</p>
        <p><strong>Highest bid:</strong> {highestBidder ? highestBid : 'None yet'}</p>
        <p><strong>Highest bidder:</strong> {highestBidder?.name || 'None yet'}</p>

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
            >
              Raise Bid
            </button>
            <button
              onClick={() => submitJson(`/rooms/${room.room_code}/bid`, {
                player_id: player.player_id,
                bid_amount: null
              }, 'Failed to pass')}
              disabled={!isYourBidTurn || isSubmitting}
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
