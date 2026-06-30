import React, { useEffect, useState } from 'react';
import { useGame } from '../context/GameContext';
import { apiFetch } from '../utils/api';

export const LobbyScreenModern: React.FC = () => {
  const { room, player, leaveRoom } = useGame();
  const [isReady, setIsReady] = useState(false);
  const [allReady, setAllReady] = useState(false);
  const [botDifficulty, setBotDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [isSavingDifficulty, setIsSavingDifficulty] = useState(false);

  const botCount = room?.players.filter((p) => p.is_bot).length || 0;
  const readyCount = room?.players.filter((p) => p.is_ready).length || 0;
  const humanCount = room?.players.filter((p) => !p.is_bot).length || 0;
  const waitingPlayers = room?.players.filter((p) => !p.is_ready && !p.is_bot).map((p) => p.name) || [];
  useEffect(() => {
    setBotDifficulty(room?.bot_difficulty || 'medium');
  }, [room?.bot_difficulty]);

  const handleReady = async () => {
    if (!room || !player) return;

    try {
      const response = await apiFetch(`/rooms/${room.room_code}/ready`, {
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
      const response = await apiFetch(`/rooms/${room.room_code}/start-game`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner_id: player.player_id })
      });

      if (!response.ok) throw new Error('Failed to start game');
    } catch (err) {
      console.error('Failed to start game:', err);
    }
  };

  const handleBotDifficultySave = async () => {
    if (!room || !player || !player.is_owner) return;

    try {
      setIsSavingDifficulty(true);
      const response = await apiFetch(`/rooms/${room.room_code}/bot-difficulty`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner_id: player.player_id, bot_difficulty: botDifficulty })
      });

      if (!response.ok) throw new Error('Failed to update bot difficulty');
    } catch (err) {
      console.error('Failed to update bot difficulty:', err);
    } finally {
      setIsSavingDifficulty(false);
    }
  };

  if (!room || !player) {
    return <div>Loading...</div>;
  }

  return (
    <div className="game-screen lobby-screen">
      <div className="lobby-hero game-panel">
        <div className="lobby-hero__copy">
          <span className="chip chip--gold">Waiting Room</span>
          <h1>BLACK QUEEN</h1>
          <p>Gather the table, lock in readiness, and start the contract.</p>
        </div>
        <div className="lobby-hero__stats">
          <div className="stat-card">
            <span>Room Code</span>
            <strong>{room.room_code}</strong>
          </div>
          <div className="stat-card">
            <span>Players</span>
            <strong>{room.players.length}/{room.max_players}</strong>
          </div>
          <div className="stat-card">
            <span>Ready</span>
            <strong>{readyCount}/{room.players.length}</strong>
          </div>
          <div className="stat-card">
            <span>Bot AI</span>
            <strong>{botDifficulty}</strong>
          </div>
        </div>
      </div>

      <div className="lobby-grid">
        <section className="game-panel">
          <div className="section-heading">
            <h3>Room Table</h3>
          </div>

          <div className="room-status-strip">
            <span className="chip chip--accent">{humanCount} human{humanCount === 1 ? '' : 's'}</span>
            <span className="chip chip--muted">{botCount} bot{botCount === 1 ? '' : 's'}</span>
            <span className="chip chip--muted">{room.max_players - room.players.length} seats open</span>
          </div>

          <ul className="lobby-player-list">
            {room.players.map((p) => (
              <li
                key={p.player_id}
                className={[
                  'lobby-player',
                  p.is_owner ? 'lobby-player--owner' : '',
                  p.is_ready ? 'lobby-player--ready' : ''
                ].filter(Boolean).join(' ')}
              >
                <div className="lobby-player__main">
                  <strong>{p.name}</strong>
                  {p.is_owner && <span className="chip chip--gold">Owner</span>}
                  {p.is_bot && <span className="chip chip--muted">Bot</span>}
                </div>
                <small>{p.is_ready ? 'Ready' : 'Waiting'}</small>
              </li>
            ))}
          </ul>

          {waitingPlayers.length > 0 && (
            <p className="status-line">
              Waiting for {waitingPlayers.join(', ')} to ready up.
            </p>
          )}
        </section>

        <aside className="game-panel lobby-actions">
          <h3>Controls</h3>
          {player.is_owner && (
            <label style={{ display: 'block', marginBottom: '14px' }}>
              Bot Intelligence
              <select
                value={botDifficulty}
                onChange={(event) => setBotDifficulty(event.target.value as 'easy' | 'medium' | 'hard')}
                disabled={isSavingDifficulty || room.state !== 'WAITING_FOR_PLAYERS' && room.state !== 'READY_CHECK'}
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </label>
          )}
          {player.is_owner && (
            <button
              onClick={handleBotDifficultySave}
              disabled={isSavingDifficulty || room.state !== 'WAITING_FOR_PLAYERS' && room.state !== 'READY_CHECK'}
              className="secondary-action"
              type="button"
            >
              {isSavingDifficulty ? 'Saving...' : 'Save Bot AI'}
            </button>
          )}
          <button onClick={handleReady} disabled={allReady} className="primary-action" type="button">
            {isReady ? 'Unset Ready' : 'Mark Ready'}
          </button>
          <button
            onClick={() => {
              void leaveRoom();
            }}
            className="secondary-action"
            type="button"
          >
            Leave Room
          </button>

          {player.is_owner && (
            <button
              onClick={handleStartGame}
              disabled={room.state !== 'WAITING_FOR_PLAYERS' && room.state !== 'READY_CHECK'}
              className="start-game-action"
              type="button"
            >
              {botCount > 0 ? 'Start Game with Bots' : 'Start Game'}
            </button>
          )}
        </aside>
      </div>
    </div>
  );
};
