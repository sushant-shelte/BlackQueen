import React, { useState, useEffect } from 'react';
import { GameProvider, useGame } from './context/GameContext';
import { CreateRoomScreen } from './components/CreateRoomScreen';
import { JoinRoomScreen } from './components/JoinRoomScreen';
import { LobbyScreenModern } from './components/LobbyScreenModern';
import { BiddingScreenModern } from './components/BiddingScreenModern';
import { PlayingScreenModern } from './components/PlayingScreenModern';
import { ScoreboardScreenModern } from './components/ScoreboardScreenModern';
import { FinalStandingsScreen } from './components/FinalStandingsScreen';
import { ActionFeedPanel } from './components/ActionFeedPanel';
import { GameState } from './types/game';
import './App.css';

interface AppContentProps {
  view: 'home' | 'create' | 'join' | 'lobby' | 'bidding' | 'playing' | 'scoreboard' | 'ended';
  setView: (view: any) => void;
}

const AppContent: React.FC<AppContentProps> = ({ view, setView }) => {
  const { room, player, leaveRoom } = useGame();

  useEffect(() => {
    if (room) {
      const stateMap: { [key in GameState]: string } = {
        'WAITING_FOR_PLAYERS': 'lobby',
        'READY_CHECK': 'lobby',
        'BIDDING': 'bidding',
        'ANNOUNCING_TRUMP': 'bidding',
        'ANNOUNCING_PARTNERS': 'bidding',
        'PLAYING_TRICKS': 'playing',
        'ROUND_COMPLETE': 'playing',
        'GAME_PAUSED': 'playing',
        'GAME_ENDED': 'ended'
      };
      setView(stateMap[room.state]);
      return;
    }

    if (view !== 'home' && view !== 'create' && view !== 'join') {
      setView('home');
    }
  }, [room?.state, view]);

  const renderContent = () => {
    switch (view) {
      case 'home':
        return (
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <h1>BLACK QUEEN</h1>
            <p>Dynamic Partnership Card Game</p>
            <button onClick={() => setView('create')} style={{ marginRight: '10px', padding: '10px 20px' }}>
              Create Room
            </button>
            <button onClick={() => setView('join')} style={{ padding: '10px 20px' }}>
              Join Room
            </button>
          </div>
        );
      case 'create':
        return <CreateRoomScreen />;
      case 'join':
        return <JoinRoomScreen />;
      case 'lobby':
        return <LobbyScreenModern />;
      case 'bidding':
        return <BiddingScreenModern />;
      case 'playing':
        return <PlayingScreenModern />;
      case 'scoreboard':
        return <ScoreboardScreenModern />;
      case 'ended':
        return <FinalStandingsScreen onReturnHome={() => setView('home')} />;
      default:
        return null;
    }
  };

  return (
    <div className="app-shell">
      <main className="app-main">
        <div className={room ? 'app-body app-body--with-sidebar' : 'app-body'}>
          <section className="app-content">
            {room && (
              <div className="app-topbar">
                <div className="app-topbar__meta">
                  <small>Player: {player?.name || 'Guest'}</small>
                  <small>Room: {room.room_code}</small>
                </div>
                <div className="app-topbar__actions">
                  <button
                    onClick={() => navigator.clipboard.writeText(room.room_code)}
                    className="topbar-action"
                    type="button"
                  >
                    Copy Code
                  </button>
                  <button
                    onClick={async () => {
                      await leaveRoom();
                      setView('home');
                    }}
                    className="topbar-action"
                    type="button"
                  >
                    {room.state === 'WAITING_FOR_PLAYERS' || room.state === 'READY_CHECK' ? 'Leave Room' : 'Leave Game'}
                  </button>
                </div>
              </div>
            )}
            {renderContent()}
          </section>
          {room && <ActionFeedPanel />}
        </div>
      </main>
      <footer style={{ textAlign: 'center', padding: '20px', marginTop: '40px', borderTop: '1px solid #333' }}>
        <small>Black Queen | © 2024</small>
      </footer>
    </div>
  );
};

export const App: React.FC = () => {
  const [view, setView] = useState<'home' | 'create' | 'join' | 'lobby' | 'bidding' | 'playing' | 'scoreboard' | 'ended'>('home');

  return (
    <GameProvider>
      <AppContent view={view} setView={setView} />
    </GameProvider>
  );
};

export default App;

