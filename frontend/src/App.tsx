import React, { useState, useEffect } from 'react';
import { GameProvider, useGame } from './context/GameContext';
import { CreateRoomScreen } from './components/CreateRoomScreen';
import { JoinRoomScreen } from './components/JoinRoomScreen';
import { LobbyScreen } from './components/LobbyScreen';
import { BiddingScreen } from './components/BiddingScreen';
import { PlayingScreen } from './components/PlayingScreen';
import { ScoreboardScreen } from './components/ScoreboardScreen';
import { FinalStandingsScreen } from './components/FinalStandingsScreen';
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
        'ROUND_COMPLETE': 'scoreboard',
        'GAME_PAUSED': 'playing',
        'GAME_ENDED': 'ended'
      };
      setView(stateMap[room.state]);
    }
  }, [room?.state]);

  const renderContent = () => {
    switch (view) {
      case 'home':
        return (
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <h1>BLACK QUEEN v1.0.0</h1>
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
        return <LobbyScreen />;
      case 'bidding':
        return <BiddingScreen />;
      case 'playing':
        return <PlayingScreen />;
      case 'scoreboard':
        return <ScoreboardScreen />;
      case 'ended':
        return <FinalStandingsScreen />;
      default:
        return null;
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#1a1a2e', color: '#fff' }}>
      {room && (
        <div style={{ padding: '10px', textAlign: 'right' }}>
          {player && <small style={{ marginRight: '20px' }}>Player: {player.name}</small>}
          <small>Room: {room.room_code}</small>
          {room.state !== 'WAITING_FOR_PLAYERS' && room.state !== 'READY_CHECK' && (
            <button onClick={() => { leaveRoom(); setView('home'); }} style={{ marginLeft: '20px' }}>
              Leave Game
            </button>
          )}
        </div>
      )}
      {renderContent()}
      <footer style={{ textAlign: 'center', padding: '20px', marginTop: '40px', borderTop: '1px solid #333' }}>
        <small>Black Queen v1.0.0 | © 2024</small>
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
