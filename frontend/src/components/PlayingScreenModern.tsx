import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useGame } from '../context/GameContext';
import { PlayingCard } from './PlayingCard';
import { TrickInfo } from '../types/game';
import { getCardLabel } from '../utils/cards';
import { apiFetch } from '../utils/api';

export const PlayingScreenModern: React.FC = () => {
  const { room, player, refreshRoom, advanceRound } = useGame();
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [completedTrickPreview, setCompletedTrickPreview] = useState<TrickInfo | null>(null);
  const [isCollectingTrick, setIsCollectingTrick] = useState(false);
  const [isDealing, setIsDealing] = useState(false);
  const lastPreviewedTrickNumber = useRef<number | null>(null);
  const lastBotActionKey = useRef<string | null>(null);

  if (!room || !player) {
    return <div>Loading...</div>;
  }

  const hand = player.hand || [];
  const dealer = room.players[room.game_state?.bidding_player_index ?? 0] || room.players[0];
  const currentPlayer = room.game_state?.current_player_index !== undefined
    ? room.players[room.game_state.current_player_index]
    : null;
  const currentPlayerId = currentPlayer?.player_id || null;
  const currentPlayerIsBot = !!currentPlayer?.is_bot;
  const isYourTurn = currentPlayer?.player_id === player.player_id;
  const trickCards = room.game_state?.current_trick?.cards_played || [];
  const displayedTrick = completedTrickPreview || room.game_state?.current_trick;
  const displayedTrickCards = displayedTrick?.cards_played || [];
  const playedCardIds = new Set(trickCards.map((card) => card.card));
  const lastCompletedTrick = room.game_state?.last_completed_trick;
  const highestBidder = room.players.find((roomPlayer) => roomPlayer.player_id === room.game_state?.highest_bidder_id) || dealer;
  const winnerId = completedTrickPreview?.winner_id || lastCompletedTrick?.winner_id || null;
  const hasPendingCompletedTrickPreview = !!lastCompletedTrick?.trick_number
    && lastPreviewedTrickNumber.current !== lastCompletedTrick.trick_number;
  const isTrickPaused = !!completedTrickPreview || hasPendingCompletedTrickPreview;
  const announcedPartnerCards = room.game_state?.announced_partner_cards || [];
  const revealedPartnerIds = new Set(
    Object.entries(room.game_state?.revealed_partners || {})
      .filter(([, revealed]) => revealed)
      .map(([playerId]) => playerId)
  );
  const tablePlayers = useMemo(() => {
    const viewerIndex = room.players.findIndex((roomPlayer) => roomPlayer.player_id === player.player_id);
    if (viewerIndex < 0) return room.players;
    return [...room.players.slice(viewerIndex), ...room.players.slice(0, viewerIndex)];
  }, [room.players, player.player_id]);

  const getPlayerName = (playerId?: string | null) =>
    room.players.find((roomPlayer) => roomPlayer.player_id === playerId)?.name || 'Player';

  const getPlayerPoints = (playerId: string) => room.game_state?.player_points?.[playerId] || 0;

  const teamPlayerIds = new Set(
    [room.game_state?.highest_bidder_id, ...Array.from(revealedPartnerIds)].filter(Boolean) as string[]
  );
  const teamPoints = room.game_state?.team_points ?? 0;
  const teamTarget = room.game_state?.highest_bid ?? 75;
  const isRoundComplete = room.state === 'ROUND_COMPLETE';
  const roundStory = room.game_state?.round_story;

  useEffect(() => {
    if (!lastCompletedTrick?.trick_number) return;
    if (lastPreviewedTrickNumber.current === lastCompletedTrick.trick_number) return;

    lastPreviewedTrickNumber.current = lastCompletedTrick.trick_number;
    setCompletedTrickPreview(lastCompletedTrick);
    setIsCollectingTrick(false);

    const collectTimer = window.setTimeout(() => setIsCollectingTrick(true), 2200);
    const clearTimer = window.setTimeout(() => {
      setCompletedTrickPreview(null);
      setIsCollectingTrick(false);
    }, 3000);

    return () => {
      window.clearTimeout(collectTimer);
      window.clearTimeout(clearTimer);
    };
  }, [lastCompletedTrick?.trick_number]);

  useEffect(() => {
    setIsDealing(true);
    const timer = window.setTimeout(() => setIsDealing(false), 650);
    return () => window.clearTimeout(timer);
  }, [room.current_round, hand.length]);

  useEffect(() => {
    if (!room?.room_code || !currentPlayerIsBot || isTrickPaused || isSubmitting) return;
    if (room.state !== 'PLAYING_TRICKS') return;

    const actionKey = `${room.room_code}-${room.game_state?.current_trick?.trick_number || 0}-${currentPlayerId}-${trickCards.length}`;
    if (lastBotActionKey.current === actionKey) return;
    lastBotActionKey.current = actionKey;

    const timerId = window.setTimeout(async () => {
      try {
        const response = await apiFetch(`/rooms/${room.room_code}/bot-play`, { method: 'POST' });
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.detail || 'Bot play failed');
        }
        await refreshRoom();
      } catch {
        lastBotActionKey.current = null;
      }
    }, 900);

    return () => window.clearTimeout(timerId);
  }, [
    room?.room_code,
    room?.state,
    room?.game_state?.current_trick?.trick_number,
    currentPlayerId,
    currentPlayerIsBot,
    isTrickPaused,
    isSubmitting,
    trickCards.length,
    refreshRoom
  ]);

  const renderPlayedCards = (cards: typeof trickCards, emptyText: string) => (
    <div className="card-row board-card-row">
      {cards.length > 0 ? cards.map((played) => {
        const winnerSeatIndex = tablePlayers.findIndex((roomPlayer) => roomPlayer.player_id === completedTrickPreview?.winner_id);
        return (
          <div
            key={`${played.player_id}-${played.order}`}
            className={[
              'played-card',
              completedTrickPreview && isCollectingTrick ? 'played-card--collecting' : '',
              completedTrickPreview && isCollectingTrick && winnerSeatIndex >= 0 ? `played-card--collect-to-${winnerSeatIndex}` : ''
            ].filter(Boolean).join(' ')}
          >
            <PlayingCard card={played.card} />
            <small>{getPlayerName(played.player_id)}</small>
          </div>
        );
      }) : (
        <p>{emptyText}</p>
      )}
    </div>
  );

  const renderCompactTrickCards = (cards: typeof trickCards, emptyText: string) => (
    <div className="last-trick-cards">
      {cards.length > 0 ? cards.map((played) => (
        <div key={`${played.player_id}-${played.order}`} className="last-trick-card">
          <PlayingCard card={played.card} />
          <small>{getPlayerName(played.player_id)}</small>
        </div>
      )) : (
        <p>{emptyText}</p>
      )}
    </div>
  );

  const playCard = async (card: string) => {
    if (!isYourTurn || isSubmitting || isTrickPaused) return;

    setIsSubmitting(true);
    setMessage(null);
    try {
      const response = await apiFetch(`/rooms/${room.room_code}/play-card`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_id: player.player_id, card })
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || 'Failed to play card');
      }

      await refreshRoom();
    } catch (err: any) {
      setMessage(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const card = event.dataTransfer.getData('text/plain');
    if (card) {
      playCard(card);
    }
  };

  return (
    <div className="game-screen gameplay-screen">
      <div className="rotate-phone-prompt">
        <h2>Rotate your phone</h2>
        <p>Black Queen works best in landscape while playing.</p>
      </div>
      <h1>BLACK QUEEN</h1>
      <div className="gameplay-summary-chips">
        <span className="chip chip--muted">Player: {player.name}</span>
        <span className="chip chip--gold">Bidder: {highestBidder?.name || 'Dealer'}</span>
        <span className="chip chip--accent">Bid: {room.game_state?.highest_bid ?? 75}</span>
        <span className="chip chip--muted">Trump: {room.game_state?.trump_suit || 'None'}</span>
        <span className="chip chip--team">Team points: {teamPoints}/{teamTarget}</span>
        <span className="chip chip--muted">
          Partners: {announcedPartnerCards.length > 0
            ? announcedPartnerCards.map((card) => getCardLabel(card.card)).join(', ')
            : 'Hidden'}
        </span>
      </div>
      <p className="status-line gameplay-status">
        {isRoundComplete
          ? 'Round complete. Review the result below, then continue when ready.'
          : completedTrickPreview
          ? `Won by ${getPlayerName(completedTrickPreview.winner_id)}. Next trick starts shortly...`
          : isYourTurn
            ? 'Your turn: click a card or drag it here.'
            : `Waiting for ${currentPlayer?.name || 'next player'}...`}
      </p>

      {isRoundComplete && (
        <section className="game-panel round-complete-banner">
          <div className="section-heading">
            <div>
              <h3>Round Complete</h3>
              <p className="status-line">
                Team scored {roundStory?.team_points ?? 0} against a target of {roundStory?.target ?? room.game_state?.highest_bid ?? 75}
              </p>
            </div>
            <span className={['chip', (roundStory?.bid_achieved ?? false) ? 'chip--gold' : 'chip--warning'].join(' ')}>
              {(roundStory?.bid_achieved ?? false) ? 'Bid made' : 'Bid missed'}
            </span>
          </div>

          <div className="story-grid">
            <div className="story-card">
              <span>Points made</span>
              <strong>{roundStory?.team_points ?? 0}</strong>
            </div>
            <div className="story-card">
              <span>Target</span>
              <strong>{roundStory?.target ?? room.game_state?.highest_bid ?? 75}</strong>
            </div>
            <div className="story-card">
              <span>Margin</span>
              <strong>{roundStory?.margin ?? 0}</strong>
            </div>
            <div className="story-card">
              <span>Top trick</span>
              <strong>{roundStory?.top_trick?.winner_name || 'Unknown'}</strong>
            </div>
          </div>

          {room.current_round < room.num_rounds && room.owner_id === player.player_id && (
            <button
              onClick={() => {
                void advanceRound();
              }}
              type="button"
              className="primary-action"
              disabled={isSubmitting}
            >
              Next Round
            </button>
          )}
          {room.current_round < room.num_rounds && room.owner_id !== player.player_id && (
            <p className="status-line">Waiting for the room owner to start the next round.</p>
          )}
        </section>
      )}

      <div className="game-grid">
        <aside className="game-panel">
          <h3>Players</h3>
          <ul className="player-strip">
            {room.players.map((roomPlayer, index) => (
              <li
                key={roomPlayer.player_id}
                className={[
                  'player-list-item',
                  index === room.game_state?.current_player_index ? 'player-list-item--active' : '',
                  teamPlayerIds.has(roomPlayer.player_id) ? 'player-list-item--team' : ''
                ].filter(Boolean).join(' ')}
              >
                <span>
                  {roomPlayer.name}
                  <strong className="player-round-points">{getPlayerPoints(roomPlayer.player_id)} pts</strong>
                </span>
                <small>{roomPlayer.cumulative_score} total pts</small>
              </li>
            ))}
          </ul>

          <h3>Partner Cards</h3>
          <div className="partner-card-list">
            {announcedPartnerCards.length > 0 ? announcedPartnerCards.map((partnerCard) => (
              <div key={partnerCard.card} className={partnerCard.revealed ? 'partner-card partner-card--revealed' : 'partner-card'}>
                <span>{getCardLabel(partnerCard.card)}</span>
                <small>{partnerCard.revealed ? `${getPlayerName(partnerCard.player_id)} is partner` : 'Waiting to reveal'}</small>
              </div>
            )) : (
              <p className="status-line">No partner cards announced.</p>
            )}
          </div>

          <h3>Current Trick</h3>
          <div className="points-box">
            <span>Unclaimed points</span>
            <strong>{room.game_state?.current_trick_points || 0}</strong>
            <small>Awarded to the trick winner.</small>
          </div>
        </aside>

        <main>
          <section
            className="game-panel table-board board-drop-zone"
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDrop}
            style={{ marginBottom: '20px' }}
          >
            <div className="table-players">
              {tablePlayers.map((roomPlayer, index) => {
                const cardCount = roomPlayer.player_id === player.player_id ? hand.length : roomPlayer.hand_count || 0;
                return (
                  <div
                    key={roomPlayer.player_id}
                    className={[
                      'table-seat',
                      index === 0 ? 'table-seat--you' : '',
                      roomPlayer.player_id === currentPlayer?.player_id ? 'table-seat--active' : '',
                      roomPlayer.player_id === winnerId ? 'table-seat--winner' : '',
                      teamPlayerIds.has(roomPlayer.player_id) ? 'table-seat--team' : ''
                    ].filter(Boolean).join(' ')}
                  >
                    <div className="table-seat__name">
                      <strong>{roomPlayer.name}</strong>
                      <small>{getPlayerPoints(roomPlayer.player_id)} pts</small>
                    </div>
                    <div className="card-backs" aria-label={`${cardCount} cards`}>
                      {Array.from({ length: Math.min(cardCount, 8) }).map((_, cardIndex) => (
                        <span key={cardIndex} className="card-back" />
                      ))}
                      {cardCount > 8 && <span className="card-back-count">+{cardCount - 8}</span>}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="table-center">
              <h2>
                Trick {displayedTrick?.trick_number || 1}
                {completedTrickPreview && ' Complete'}
              </h2>
              {renderPlayedCards(displayedTrickCards, 'Board is empty.')}
            </div>

            <aside className="last-trick-mini">
              <h3>Last Trick</h3>
              {lastCompletedTrick?.winner_id && (
                <p className="status-line">
                  {getPlayerName(lastCompletedTrick.winner_id)} - {lastCompletedTrick.trick_points || 0} pts
                </p>
              )}
              {renderCompactTrickCards(lastCompletedTrick?.cards_played || [], 'No completed trick yet.')}
            </aside>
          </section>

          <section className={['game-panel', 'hand-panel', isDealing ? 'hand-panel--dealing' : ''].filter(Boolean).join(' ')}>
            <h3>Your Hand ({hand.length})</h3>
            {highestBidder && <p className="status-line">Bidder: {highestBidder.name}</p>}
            <div className={['card-row', 'hand-card-row', isDealing ? 'hand-card-row--dealing' : ''].filter(Boolean).join(' ')}>
              {hand.map((card, index) => (
                <div
                  key={`${card}-${index}`}
                  draggable={isYourTurn && !isSubmitting}
                  onDragStart={(event) => event.dataTransfer.setData('text/plain', card)}
                  className="hand-card-wrap"
                  style={{ animationDelay: `${index * 70}ms` }}
                >
                  <PlayingCard
                    card={card}
                    onClick={() => playCard(card)}
                    disabled={!isYourTurn || isSubmitting || isTrickPaused || playedCardIds.has(card)}
                  />
                </div>
              ))}
            </div>
            {message && <p style={{ color: '#ff8a8a' }}>{message}</p>}
          </section>
        </main>
      </div>
    </div>
  );
};


