# Black Queen - Multiplayer Card Game

## Project Structure

```
BlackQueen/
├── backend/                  # FastAPI backend
│   ├── app/
│   │   ├── models/          # Data models (Card, Player, Room, Game)
│   │   ├── services/        # Business logic (GameEngine, RoomManager)
│   │   ├── api/            # API routes
│   │   ├── websocket/      # WebSocket handlers
│   │   └── main.py         # FastAPI app
│   ├── run.py              # Entry point
│   ├── requirements.txt    # Python dependencies
│   └── .env                # Environment variables
│
├── frontend/               # React frontend
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── context/        # React context
│   │   ├── hooks/          # Custom hooks
│   │   ├── types/          # TypeScript types
│   │   ├── App.tsx         # Main app
│   │   └── index.tsx       # Entry point
│   ├── public/             # Static assets
│   ├── package.json        # NPM dependencies
│   ├── tsconfig.json       # TypeScript config
│   └── vite.config.ts      # Vite config
│
├── REQUIREMENTS.md         # Game requirements
└── README.md              # This file
```

## Getting Started

### Backend Setup

```bash
# Navigate to backend directory
cd backend

# Install dependencies
pip install -r requirements.txt

# Run server
python run.py
```

Server will be available at `http://localhost:8000`

### Frontend Setup

```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Start dev server
npm run dev
```

Frontend will be available at `http://localhost:5173`

## Features Implemented

### Backend
- ✅ Room management (create, join, leave, kick)
- ✅ Player management and reconnection
- ✅ Game state machine
- ✅ Card dealing and deck management
- ✅ Bidding logic
- ✅ Partnership announcement with validation
- ✅ Trick-taking and scoring
- ✅ API endpoints for all game actions
- ✅ WebSocket support for real-time updates

### Frontend
- ✅ Home screen
- ✅ Create room screen
- ✅ Join room screen
- ✅ Lobby screen
- ✅ Game context for state management
- ✅ Component structure for other screens
- 🔄 Bidding, Playing, Scoreboard screens (UI components created, logic to be connected)

## API Documentation

See `REQUIREMENTS.md` for complete API endpoint documentation and WebSocket message format.

## Development Notes

- Backend uses FastAPI with Pydantic for validation
- Frontend uses React with TypeScript
- State machine ensures consistent game flow
- WebSocket Manager handles real-time communication
- In-memory storage (can be replaced with database)

## Next Steps

1. Connect WebSocket to frontend components
2. Implement real-time game updates
3. Complete UI for bidding, playing, and scoreboard screens
4. Add proper error handling and validation UI
5. Add animations and visual improvements
6. Test with multiple players
7. Deploy to production

## Version

v1.0.0
