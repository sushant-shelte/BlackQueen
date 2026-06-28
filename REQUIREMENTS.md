# Black Queen Web App - Requirements

## Overview
A multiplayer web-based card game application for playing Black Queen with dynamic partnerships and live updates. Players can create private rooms, join with shareable codes, and play through multiple rounds.

---

## Tech Stack
- **Backend**: Python FastAPI
- **Frontend**: React
- **Real-time Communication**: WebSockets
- **Storage**: SQLite-backed room snapshots with in-memory runtime objects
- **Authentication**: None required

---

## Current App Architecture

### Backend
- FastAPI application served from `backend/app/main.py`
- API routes are mounted under `/api` from `backend/app/api/routes.py`
- WebSocket endpoint is mounted at `/ws/{room_code}/{player_id}`
- `RoomManager` is the runtime source of truth for active room objects
- `GameEngine` mutates the current `Room` and `GameRound` during game actions
- Room state is persisted through `SQLiteRoomStore`

### Frontend
- React + TypeScript app under `frontend/src`
- `GameContext` owns the current client-side `room`, `player`, loading state, and API actions
- The client restores identity from browser `localStorage`
- The frontend stores only `roomCode` and `playerId` locally; the backend remains authoritative for room/game state
- On reload or new tab, the frontend calls `GET /api/rooms/{room_code}` and restores the player only if the backend still has that player in the room
- If the backend returns `404`, local identity is cleared and the user is asked to create or join a valid room

### Persistence Model
- SQLite database path defaults to `backend/app/data/blackqueen.sqlite3`
- Database path can be overridden with `BLACKQUEEN_DB_PATH`
- Rooms are loaded from SQLite when `RoomManager` starts
- Rooms are saved after mutating actions:
  - create room
  - join room
  - leave room
  - ready/not ready
  - disconnect/reconnect
  - kick player
  - fill seats with bots
  - start game
  - bid
  - announce trump
  - announce partners
  - play card
- Empty rooms are removed from memory and SQLite
- The current implementation stores complete room snapshots. This is suitable for the current prototype and restart recovery; a production version should use structured tables or Redis/Postgres-backed state with migrations.

### Runtime State Flow
1. Client creates or joins a room through HTTP API.
2. Backend updates the in-memory `Room`.
3. Backend saves the updated room snapshot to SQLite.
4. Client receives response and saves `roomCode/playerId` in `localStorage`.
5. New tabs or refreshed pages restore by asking the backend for the authoritative room state.
6. WebSocket connections are used for live connection presence and future real-time event delivery.

---

## Core Features

### 1. Room Management
- **Room Creation**
  - Generate 6-character alphanumeric room code (unique per room)
  - Shareable code for other players to join
  - Room code displayed prominently for easy sharing
  
- **Room Configuration** (set during creation)
  - Number of players: 5-10
  - Number of teammates (for each player): 1 to (N/2)-1
  - Example: 6 players → teammates can be 1 or 2
  
- **Room State**
  - Waiting for players to join
  - Game in progress
  - Round completed
  - Room auto-closes after all rounds complete or when all players disconnect

### 2. Card Distribution Logic

#### Deck Selection
- **Single Deck** (1-9 players): 52 cards
- **Double Deck** (10 players): 104 cards

#### Card Removal
- Cards removed from lowest values first (2s, 3s, etc.) to make total divisible by number of players
- Each player gets exactly: `total_cards / number_of_players` cards
- **Removal Order**: Hearts → Clubs → Diamonds → Spades (same suit, same rank)
- Example: 7 players → 49 cards needed → remove 2♥, 2♣, 2♦ from standard deck
- **Card Dealing**: Cards are dealt randomly to each player every game (shuffled deck distribution)

#### Point-Scoring Cards
- Aces (A): 15 points each (4 cards = 60 points)
- Tens (10): 10 points each (4 cards = 40 points)
- Fives (5): 5 points each (4 cards = 20 points)
- Queen of Spades (Q♠): 30 points (1 card = 30 points)
- **Total**: 150 points per deck

### 3. Game Flow

#### Phase 1: Bidding Round
- Starting bid: 75 points
- Bidding starts with first player (rotates each round)
- Players can:
  - Bid higher (in multiples of 5: 80, 85, 90, 95, 100, 105, ... up to 150)
  - Pass (cannot bid again in this round)
- **Special Rule**: If all players pass, first player automatically becomes "Mr. X" (Captain) with no bid amount and will select teammates
- Last remaining player (who didn't pass) becomes "Mr. X" with bid amount `y`
- Store bid amount `y` (or 0 if first player defaulted)

#### Phase 2: Partnership Announcement
- Mr. X selects trump suit
- Mr. X announces 2 cards from the entire deck as teammates:
  - Players holding these cards become his partners (identities remain hidden)
  - If both cards belong to same player → "double partner"
  - Mr. X can announce cards from his own hand as well
  
- **Two-Deck Scenario (10 players)** - Special selection logic:
  - **For 2 teammates needed**: Announce 1 card Mr. X doesn't have (both other holders become teammates)
  - **For 1 teammate needed**: Announce 1 card Mr. X has (only 1 other holder becomes teammate)
  - **For 3 teammates needed**: Announce 1 card Mr. X has + 1 card Mr. X doesn't have (creates 3 teammates)
  
- **Teammate Revelation**: Teammates are only revealed when their announced card is played in a trick
- **Default Captain (if all passed bidding)**: First player selects 2 teammates using same rules as above with bid amount = 0

#### Phase 3: Trick-Taking
- **Standard Card Rules Applied**:
  - Player must follow the led suit if they have cards of that suit
  - If no cards of led suit, player may play any card (trump or non-trump)
  - Trump cards can only be played when out of led suit
  - Highest card of led suit wins (or highest trump if trump played)
- **Card Ranking**: Ace (highest) → King → Queen → Jack → 10 → 9 → 8 → 7 → 6 → 5 → 4 → 3 → 2 (lowest)
- **Double Deck Tiebreaker** (10 players): If two players play identical cards (e.g., K♥ from both decks), first played card wins the trick
- Trick winner leads next trick
- **Track points in each trick** (players must be strategic about contributing scoring cards)
- Continue until all cards played

#### Phase 4: Scoring
- **Team Achievement Check**
  - If bid was 0 (default captain): Only Mr. X's team wins/loses based on majority of points (>75)
  - If bid was > 0: If Mr. X's team total points ≥ bid amount `y` → Success, else → Failure

- **Point Distribution** (proportional to initial hand size)
  - Mr. X gets: +2y (if success) or -2y (if failure)
  - Each partner gets: +y (if success) or -y (if failure)
  - Others get: -y/N (if Mr. X's team succeeds) or +y/N (if fails)
  - N = number of non-partners excluding Mr. X
  - **Note**: If bid was 0, adjust scoring accordingly (majority-based)

- **Score Persistence** across multiple rounds (detailed later)

#### Phase 5: Round Completion
- Display round results and individual scores
- Option to start new round or view game summary
- Continue until configured number of rounds completed or players decide to end
- **First Player Rotation**: First player position rotates to next player (in order) for next round

---

## Player Interaction

### Lobby (Before Game Start)
- [ ] Display room code
- [ ] Show list of joined players
- [ ] Waiting for minimum players to start (all should be ready or timer expires)
- [ ] Ready/Not Ready toggle per player

### During Game
- [ ] Cards visible in hand (dealt to each player)
- [ ] Current trick display (cards played so far, lead suit indicator)
- [ ] Trump suit indicator
- [ ] Bidding interface (input bid or pass)
- [ ] Partner announcement interface (for Mr. X only)
- [ ] Current points in trick
- [ ] Play card interface (drag-drop or click-based)
- [ ] Game state: current phase, whose turn, scores

### Post-Round
- [ ] Round results (bid, achieved, points)
- [ ] Individual player scores
- [ ] Cumulative scores across rounds
- [ ] Start next round button

---

## Live Updates (WebSocket)

### Real-Time Events
1. **Player Joined** - Update player list
2. **Player Disconnected** - Update player list, pause game if needed
3. **Game Started** - Transition from lobby to game
4. **Cards Dealt** - Players receive their hands
5. **Bidding Update** - Show current bid and player turn
6. **Trump Announced** - Show trump suit
7. **Partners Announced** - Update game state (but not reveal identities)
8. **Card Played** - Update trick display
9. **Trick Won** - Show winner and points
10. **Round Ended** - Show results and scores
11. **Game Ended** - Show final standings

---

## Room Capacity & Cleanup

### Room Capacity
- Max players: Set during room creation
- Room closes new joins once max reached or game started
- Allow late joins before game starts (if room not full)

### Room Cleanup
- Auto-cleanup after:
  - All players disconnect
  - 30 minutes of inactivity
  - Game completes and all players leave
- Empty rooms are deleted from both the in-memory manager and SQLite persistence

---

## Room Owner Management
- **Room Creator**: Player who creates the room becomes the Owner
- **Owner Permissions**:
  - Can kick players from the room (before game starts or after disconnection)
  - Can start the game (once minimum players reached and all ready)
  - Ownership transfers to next player (by join order) if owner disconnects or leaves
- **Owner Display**: Show owner badge/indicator in player list

---

## Rejoin & Disconnection Logic

### Reconnection
- **Player Identification**: Players are identified by `player_id`; names remain unique within a room
- **Browser Restore**: The frontend stores `roomCode` and `playerId` in `localStorage` for same-browser tab/reload recovery
- **Reconnection Strategy**:
  - Browser reload/new tab restores using saved `roomCode/playerId`
  - Manual rejoin with the same name can reconnect a disconnected player
  - Restores player to same seat/position in game
  - Player gets same cards they had before disconnection
  - Player reconnects to same WebSocket channel
  - If the room no longer exists, the frontend clears local identity and shows an expired/missing-room message

### Disconnection Handling
- **Game Pause**: Game pauses immediately when a player disconnects
- **Reconnection Window**: Player has grace period to reconnect (configurable, e.g., 5 minutes)
- **After Grace Period**: 
  - If player doesn't reconnect, owner can remove them
  - Game can continue with remaining players or be abandoned
- **Reconnection Resume**: Game resumes once player reconnects or is manually removed

---

## Partner Visibility
- **Hidden During Game**: Partner identities remain hidden until revealed
- **Revelation Trigger**: Partner revealed when their announced card is played in a trick
- **UI Display**: Once revealed, show partner name/indicator in UI for all players
- **Persistent Display**: Revealed partners remain visible for remainder of round

---

## Game State Management

### State Machine
- **States**: 
  1. `WAITING_FOR_PLAYERS` - Room created, waiting for players to join
  2. `READY_CHECK` - All players joined, waiting for ready confirmation
  3. `BIDDING` - Bidding phase in progress
  4. `ANNOUNCING_TRUMP` - Mr. X selecting and announcing trump suit
  5. `ANNOUNCING_PARTNERS` - Mr. X announcing partner cards
  6. `PLAYING_TRICKS` - Active trick-taking in progress
  7. `ROUND_COMPLETE` - Round finished, showing results
  8. `GAME_PAUSED` - Game paused due to player disconnection
  9. `GAME_ENDED` - All rounds completed, final results shown

- **Transitions**:
  - `WAITING_FOR_PLAYERS` → `READY_CHECK` (when max players joined or owner starts)
  - `READY_CHECK` → `BIDDING` (when all players ready)
  - `BIDDING` → `ANNOUNCING_TRUMP` (when bidding complete)
  - `ANNOUNCING_TRUMP` → `ANNOUNCING_PARTNERS` (when trump announced)
  - `ANNOUNCING_PARTNERS` → `PLAYING_TRICKS` (when partners announced)
  - `PLAYING_TRICKS` → `ROUND_COMPLETE` (when all tricks played)
  - `ROUND_COMPLETE` → `BIDDING` (for next round) or `GAME_ENDED` (if last round)
  - Any state → `GAME_PAUSED` (on player disconnection)
  - `GAME_PAUSED` → Previous state (on reconnection) or `GAME_ENDED` (if player removed)

### Internal Data Model

#### Room
```
{
  room_code: str (6 chars)
  owner_id: str (player ID)
  created_at: datetime
  max_players: int (5-10)
  num_teammates: int (1 to N/2-1)
  state: GameState enum
  players: List[Player]
  current_round: int
  current_game: Game (or None if not started)
}
```

#### Player
```
{
  player_id: str (UUID)
  name: str (unique within room)
  seat: int (0 to max_players-1)
  is_owner: bool
  is_ready: bool
  hand: List[Card]
  is_disconnected: bool
  disconnected_at: datetime (if disconnected)
  cumulative_score: int (across rounds)
}
```

#### Game
```
{
  game_id: str (UUID)
  round_number: int
  first_player_index: int
  bidding_player_index: int
  current_trick_index: int
  
  # Bidding
  bids: Dict[player_id -> int or None] (None means passed)
  highest_bidder_id: str
  highest_bid: int
  
  # Partnership
  trump_suit: Suit (H, C, D, S)
  announced_cards: List[Card] (2 cards)
  revealed_partners: Dict[player_id -> bool] (when revealed)
  
  # Tricks
  tricks: List[Trick]
  current_trick: Trick
  
  # Scoring
  team_points: int (accumulated from tricks)
  round_results: RoundResult
}
```

#### Card
```
{
  rank: str (A, K, Q, J, 10, 9, 8, 7, 6, 5, 4, 3, 2)
  suit: str (H=Hearts, C=Clubs, D=Diamonds, S=Spades)
  points: int (0, 5, 10, 15, or 30)
  deck_id: int (0 or 1 for double deck)
}
```

#### Trick
```
{
  trick_number: int
  led_suit: str (suit of first card played)
  cards_played: List[{player_id, card, order}] (in play order)
  winner_player_id: str
  trick_points: int
}
```

---

## Validation Rules for Card Announcements

### Mr. X Partnership Announcement Validation
1. **Must announce exactly 2 cards** from the entire deck
2. **Cards cannot be duplicated** in same announcement
3. **Single Deck (1-9 players)**:
   - Both announced cards must be distinct in a standard deck (no duplicates exist)
   
4. **Double Deck (10 players)** - Validation based on teammate count:
   - **For 1 teammate**: Must announce 1 card Mr. X has in hand (only 1 other player has it)
   - **For 2 teammates**: Must announce 1 card Mr. X doesn't have (both other holders become teammates) AND optionally 1 card Mr. X has
   - **For 3 teammates**: Must announce 1 card Mr. X has + 1 card Mr. X doesn't have
   - System validates and prevents invalid announcements

---

## Error Handling

- Invalid room code
- Room full
- Player already in another room
- Disconnection during game (handled with pause/rejoin)
- Invalid card play (follow suit if possible)
- Invalid bid (must be higher than last bid or pass)
- Invalid card announcement (validation rules above)
- Duplicate player name in room
- Owner left/removed without transfer

---

## Versioning

- **Application Version**: Semantic versioning (e.g., 1.0.0)
- **Display Location**: 
  - Shown in footer of UI on all pages
  - Format: `v1.0.0`
  - Example: "Black Queen v1.0.0"
- **Backend Header**: API responses include `X-API-Version` header
- **Changelog**: Maintained in `CHANGELOG.md`

---

## UI Wireframes

### 1. Lobby Screen
```
┌──────────────────────────────────────────┐
│           BLACK QUEEN v1.0.0              │
├──────────────────────────────────────────┤
│                                          │
│  ┌──────────────────────────────────┐   │
│  │  Room Code: ABC123               │   │
│  │  [Copy Button]                   │   │
│  └──────────────────────────────────┘   │
│                                          │
│  Players Joined (2/6)                    │
│  ┌──────────────────────────────────┐   │
│  │ • Alice (Owner) ✓ Ready          │   │
│  │ • Bob           ✗ Not Ready      │   │
│  │                                  │   │
│  │ (Waiting for 4 more players...)  │   │
│  └──────────────────────────────────┘   │
│                                          │
│  Your Name: Alice                        │
│  [Ready] [Not Ready] [Leave Room]        │
│                                          │
│  [Start Game] (Disabled - waiting)       │
│                                          │
├──────────────────────────────────────────┤
│ Black Queen v1.0.0  |  © 2024            │
└──────────────────────────────────────────┘
```

---

### 2. Bidding Screen
```
┌──────────────────────────────────────────┐
│           BLACK QUEEN v1.0.0              │
├──────────────────────────────────────────┤
│ Round 1 | Trump: [Not Yet]               │
├──────────────────────────────────────────┤
│                                          │
│  BIDDING PHASE                           │
│                                          │
│  Players:                                │
│  Alice: Pass                             │
│  Bob: 85 ← Current Bid                   │
│  Charlie: ---                            │
│  → Diana (Your Turn)                     │
│                                          │
│  ┌──────────────────────────────────┐   │
│  │ Min Bid Required: 90              │   │
│  │                                  │   │
│  │ [75] [80] [85] [90] [95]...      │   │
│  │ [100] [105] [110] ... [150]      │   │
│  │                                  │   │
│  │ [PASS]                           │   │
│  └──────────────────────────────────┘   │
│                                          │
│  Bid History:                            │
│  • Alice: Pass                           │
│  • Bob: 85                               │
│                                          │
├──────────────────────────────────────────┤
│ Black Queen v1.0.0  |  © 2024            │
└──────────────────────────────────────────┘
```

---

### 3. Playing Screen
```
┌──────────────────────────────────────────────────────┐
│              BLACK QUEEN v1.0.0                       │
├──────────────────────────────────────────────────────┤
│ Round 1 | Trump: ♥ Hearts | Bid: 90 (Bob)           │
├──────────────────────────────────────────────────────┤
│                                                      │
│  Trick 1 | Points in Trick: 15                       │
│  Led Suit: ♣ Clubs                                   │
│                                                      │
│    ┌─────────┐     ┌─────────┐                       │
│    │   Alice │     │  Charlie│                       │
│    │    K♣   │     │  10♣    │                       │
│    └─────────┘     └─────────┘                       │
│                                                      │
│                  ┌─────────┐                         │
│                  │   (You) │                         │
│                  │  Diana  │                         │
│                  └─────────┘                         │
│       Diana's Turn [Your Hand]                       │
│                                                      │
│  ┌────────────────────────────────────────────┐    │
│  │ Your Cards:                                │    │
│  │ [A♥] [K♥] [Q♦] [5♥] [J♣] [9♠] [3♠]      │    │
│  │ Played:                                    │    │
│  │  ✓ Play Card (Click above or drag)        │    │
│  └────────────────────────────────────────────┘    │
│                                                      │
│  Team Info: (Partners revealed as cards play)       │
│  • Bob (Bidder) - bid: 90                           │
│  • Charlie (Partner) - revealed! ★                  │
│  ○ Alice, Diana (Opponents)                         │
│                                                      │
│  Scores This Round:                                 │
│  • Bob's Team: 15 pts | • Others: 0 pts            │
│                                                      │
├──────────────────────────────────────────────────────┤
│ Black Queen v1.0.0  |  © 2024                        │
└──────────────────────────────────────────────────────┘
```

---

### 4. Scoreboard Screen
```
┌──────────────────────────────────────────┐
│           BLACK QUEEN v1.0.0              │
├──────────────────────────────────────────┤
│ ROUND 1 RESULTS                          │
├──────────────────────────────────────────┤
│                                          │
│ Bid: 90 (Bob) | Achieved: ✓ YES         │
│                                          │
│ ┌────────────────────────────────────┐  │
│ │ Player    | Role    | R1  | Total  │  │
│ ├────────────────────────────────────┤  │
│ │ Bob ⭐    | Bidder  |+180 | +180   │  │
│ │ Charlie   | Partner | +90 |  +90   │  │
│ │ Alice     | Opp     | -90 |  -90   │  │
│ │ Diana     | Opp     | -90 |  -90   │  │
│ └────────────────────────────────────┘  │
│                                          │
│ Points Breakdown:                        │
│ • Bidder (Bob): +2y = +180               │
│ • Partner (Charlie): +y = +90            │
│ • Opponents: -y/2 = -90 each             │
│                                          │
│ ┌────────────────────────────────────┐  │
│ │  [Next Round] [View All Results]   │  │
│ │  [End Game]   [Continue Playing]   │  │
│ └────────────────────────────────────┘  │
│                                          │
├──────────────────────────────────────────┤
│ Black Queen v1.0.0  |  © 2024            │
└──────────────────────────────────────────┘
```

---

### 5. Final Standings (After All Rounds)
```
┌──────────────────────────────────────────┐
│           BLACK QUEEN v1.0.0              │
├──────────────────────────────────────────┤
│ GAME ENDED - FINAL STANDINGS              │
├──────────────────────────────────────────┤
│                                          │
│ Total Rounds Played: 3                   │
│                                          │
│ ┌────────────────────────────────────┐  │
│ │ Rank | Player  | R1  | R2  | R3   │  │
│ │      |         |     |     | TOTAL│  │
│ ├────────────────────────────────────┤  │
│ │  1⭐  | Bob     |+180 |  0 |-85  │  │
│ │      |         |     |     |+95   │  │
│ │  2   | Alice   | -90 |+80 | +20  │  │
│ │      |         |     |     | +10  │  │
│ │  3   | Charlie | +90 | -45| -100 │  │
│ │      |         |     |     | -55  │  │
│ │  4   | Diana   | -90 | -35| +165 │  │
│ │      |         |     |     | +40  │  │
│ └────────────────────────────────────┘  │
│                                          │
│         🎉 Congratulations Bob! 🎉       │
│                                          │
│ ┌────────────────────────────────────┐  │
│ │  [New Game] [View Detailed Stats]  │  │
│ │  [Leave Room] [Share Scores]       │  │
│ └────────────────────────────────────┘  │
│                                          │
├──────────────────────────────────────────┤
│ Black Queen v1.0.0  |  © 2024            │
└──────────────────────────────────────────┘
```

---

## UI Component Notes

### Responsive Design
- Mobile-friendly layout (cards stack vertically on small screens)
- Tablets: 2-column layout
- Desktop: Full layout as shown

### Color Scheme (To Be Defined)
- Primary: Dark blue background
- Accents: Gold/yellow for highlights
- Suits: ♥ Red, ♦ Red, ♣ Black, ♠ Black
- Cards: White with border

### Icons/Indicators
- ⭐ Owner badge
- ★ Revealed partner indicator
- ✓ Ready status
- ✗ Not ready status
- → Current player indicator

### Animations
- Card slide-in when played
- Trick winner highlight
- Score updates with transitions

---

## Future Enhancements (Out of Scope)
- User authentication and accounts
- Structured database schema with migrations instead of complete room snapshots
- Redis/Postgres-backed state for multi-worker or production deployments
- Leaderboard
- Game replay/history
- AI opponents
- Mobile app
- Scoring across multiple round strategies (to be detailed later)

---

## API Endpoints with Payloads

### Room Management

#### `POST /rooms` - Create Room
**Request**:
```json
{
  "player_name": "Alice",
  "max_players": 6,
  "num_teammates": 1,
  "num_rounds": 1
}
```

**Response (201)**:
```json
{
  "room_code": "ABC123",
  "player_id": "uuid-1234",
  "owner_id": "uuid-1234",
  "state": "WAITING_FOR_PLAYERS",
  "max_players": 6,
  "num_teammates": 1,
  "num_rounds": 1,
  "players": [
    {
      "player_id": "uuid-1234",
      "name": "Alice",
      "seat": 0,
      "is_bot": false,
      "is_owner": true,
      "is_ready": false,
      "is_disconnected": false,
      "cumulative_score": 0
    }
  ],
  "created_at": "2024-01-01T10:00:00Z"
}
```

---

#### `GET /rooms/{room_code}` - Get Room State
**Response (200)**:
```json
{
  "room_code": "ABC123",
  "owner_id": "uuid-1234",
  "state": "PLAYING_TRICKS",
  "max_players": 6,
  "num_teammates": 1,
  "num_rounds": 1,
  "players": [
    {
      "player_id": "uuid-1234",
      "name": "Alice",
      "seat": 0,
      "is_bot": false,
      "is_owner": true,
      "is_ready": true,
      "is_disconnected": false,
      "cumulative_score": 0
    },
    {
      "player_id": "uuid-5678",
      "name": "Bob",
      "seat": 1,
      "is_bot": false,
      "is_owner": false,
      "is_ready": true,
      "is_disconnected": false,
      "cumulative_score": 0
    }
  ],
  "current_round": 1,
  "game_state": {
    "bidding_player_index": 0,
    "highest_bid": 90,
    "trump_suit": "H",
    "current_trick": {
      "trick_number": 1,
      "led_suit": "C",
      "cards_played": [
        {"player_id": "uuid-1234", "card": "5C", "order": 0}
      ]
    }
  }
}
```

---

#### `POST /rooms/{room_code}/join` - Join Room
**Request**:
```json
{
  "player_name": "Bob"
}
```

**Response (200)**:
```json
{
  "player_id": "uuid-5678",
  "room_code": "ABC123",
  "seat": 1,
  "state": "WAITING_FOR_PLAYERS"
}
```

---

#### `POST /rooms/{room_code}/leave` - Leave Room
**Request**:
```json
{
  "player_id": "uuid-5678"
}
```

**Response (200)**:
```json
{
  "success": true,
  "message": "Player left room"
}
```

---

### Game Actions

#### `POST /rooms/{room_code}/ready` - Mark Player Ready
**Request**:
```json
{
  "player_id": "uuid-1234",
  "is_ready": true
}
```

**Response (200)**:
```json
{
  "player_id": "uuid-1234",
  "is_ready": true,
  "room_state": "READY_CHECK",
  "all_ready": false
}
```

---

#### `POST /rooms/{room_code}/start-game` - Start Game (Owner Only)
**Request**:
```json
{
  "owner_id": "uuid-1234"
}
```

**Response (200)**:
```json
{
  "success": true,
  "state": "BIDDING",
  "first_player_index": 0,
  "players": [
    {
      "player_id": "uuid-1234",
      "hand": ["AC", "KH", "5D", "2S", "10C", "QC"]
    }
  ]
}
```

---

#### `POST /rooms/{room_code}/bid` - Place Bid
**Request**:
```json
{
  "player_id": "uuid-5678",
  "bid_amount": 85
}
```

**Alternative** (Pass):
```json
{
  "player_id": "uuid-5678",
  "bid_amount": null
}
```

**Response (200)**:
```json
{
  "success": true,
  "current_bid": 85,
  "highest_bidder": "uuid-5678",
  "bidding_player_index": 2,
  "bids_status": {
    "uuid-1234": null,
    "uuid-5678": 85,
    "uuid-9012": null
  }
}
```

---

#### `POST /rooms/{room_code}/announce-trump` - Announce Trump Suit
**Request**:
```json
{
  "player_id": "uuid-5678",
  "trump_suit": "H"
}
```

**Response (200)**:
```json
{
  "success": true,
  "trump_suit": "H",
  "state": "ANNOUNCING_PARTNERS"
}
```

---

#### `POST /rooms/{room_code}/announce-partners` - Announce Partner Cards
**Request**:
```json
{
  "player_id": "uuid-5678",
  "partner_cards": ["AC", "KH"]
}
```

**Response (200)**:
```json
{
  "success": true,
  "announced_cards": ["AC", "KH"],
  "state": "PLAYING_TRICKS",
  "current_trick": {
    "trick_number": 1,
    "led_suit": null,
    "cards_played": []
  }
}
```

---

#### `POST /rooms/{room_code}/play-card` - Play a Card
**Request**:
```json
{
  "player_id": "uuid-1234",
  "card": "5H"
}
```

**Response (200)**:
```json
{
  "success": true,
  "card_played": "5H",
  "current_trick": {
    "trick_number": 1,
    "led_suit": "H",
    "cards_played": [
      {"player_id": "uuid-1234", "card": "5H", "order": 0}
    ]
  },
  "next_player_index": 1
}
```

**Response (if trick complete)**:
```json
{
  "success": true,
  "card_played": "QH",
  "trick_result": {
    "trick_number": 1,
    "winner_player_id": "uuid-5678",
    "winner_name": "Bob",
    "cards_played": [
      {"player_id": "uuid-1234", "card": "5H"},
      {"player_id": "uuid-5678", "card": "QH"}
    ],
    "trick_points": 5,
    "revealed_partners": ["uuid-5678"]
  },
  "next_state": "PLAYING_TRICKS"
}
```

---

#### `POST /rooms/{room_code}/kick-player` - Owner Kicks Player
**Request**:
```json
{
  "owner_id": "uuid-1234",
  "player_id_to_kick": "uuid-9012"
}
```

**Response (200)**:
```json
{
  "success": true,
  "kicked_player": "uuid-9012",
  "kicked_player_name": "Charlie"
}
```

---

## WebSocket Messages

### Connection URL
`ws://{host}/ws/{room_code}/{player_id}`

### Message Format
All WebSocket messages follow this structure:
```json
{
  "type": "EVENT_TYPE",
  "timestamp": "2024-01-01T10:00:00Z",
  "payload": {}
}
```

### Server → Client Events

#### 1. `PLAYER_JOINED`
```json
{
  "type": "PLAYER_JOINED",
  "timestamp": "2024-01-01T10:00:00Z",
  "payload": {
    "player_id": "uuid-5678",
    "player_name": "Bob",
    "seat": 1,
    "total_players": 2
  }
}
```

---

#### 2. `PLAYER_DISCONNECTED`
```json
{
  "type": "PLAYER_DISCONNECTED",
  "timestamp": "2024-01-01T10:00:00Z",
  "payload": {
    "player_id": "uuid-5678",
    "player_name": "Bob",
    "reason": "connection_lost",
    "room_state": "GAME_PAUSED"
  }
}
```

---

#### 3. `GAME_STARTED`
```json
{
  "type": "GAME_STARTED",
  "timestamp": "2024-01-01T10:00:00Z",
  "payload": {
    "first_player_index": 0,
    "first_player_name": "Alice",
    "round_number": 1
  }
}
```

---

#### 4. `CARDS_DEALT`
```json
{
  "type": "CARDS_DEALT",
  "timestamp": "2024-01-01T10:00:00Z",
  "payload": {
    "player_id": "uuid-1234",
    "hand": ["AC", "KH", "5D", "2S", "10C", "QC", "JD"],
    "card_count": 7
  }
}
```

---

#### 5. `BIDDING_STARTED`
```json
{
  "type": "BIDDING_STARTED",
  "timestamp": "2024-01-01T10:00:00Z",
  "payload": {
    "bidding_player_index": 0,
    "bidding_player_name": "Alice",
    "min_bid": 75,
    "current_highest_bid": 75
  }
}
```

---

#### 6. `BID_PLACED`
```json
{
  "type": "BID_PLACED",
  "timestamp": "2024-01-01T10:00:00Z",
  "payload": {
    "player_id": "uuid-5678",
    "player_name": "Bob",
    "bid_amount": 85,
    "next_bidding_player_index": 2
  }
}
```

---

#### 7. `BIDDING_COMPLETE`
```json
{
  "type": "BIDDING_COMPLETE",
  "timestamp": "2024-01-01T10:00:00Z",
  "payload": {
    "highest_bidder_id": "uuid-5678",
    "highest_bidder_name": "Bob",
    "highest_bid": 90,
    "next_phase": "ANNOUNCING_TRUMP"
  }
}
```

---

#### 8. `TRUMP_ANNOUNCED`
```json
{
  "type": "TRUMP_ANNOUNCED",
  "timestamp": "2024-01-01T10:00:00Z",
  "payload": {
    "trump_suit": "H",
    "announced_by": "Bob"
  }
}
```

---

#### 9. `PARTNERS_ANNOUNCED`
```json
{
  "type": "PARTNERS_ANNOUNCED",
  "timestamp": "2024-01-01T10:00:00Z",
  "payload": {
    "announced_cards": ["AC", "KH"],
    "announced_by": "Bob",
    "next_phase": "PLAYING_TRICKS"
  }
}
```

---

#### 10. `TRICK_STARTED`
```json
{
  "type": "TRICK_STARTED",
  "timestamp": "2024-01-01T10:00:00Z",
  "payload": {
    "trick_number": 1,
    "leading_player_index": 0,
    "leading_player_name": "Alice"
  }
}
```

---

#### 11. `CARD_PLAYED`
```json
{
  "type": "CARD_PLAYED",
  "timestamp": "2024-01-01T10:00:00Z",
  "payload": {
    "player_id": "uuid-1234",
    "player_name": "Alice",
    "card": "5H",
    "trick_number": 1,
    "cards_played_count": 1,
    "next_player_index": 1,
    "next_player_name": "Bob"
  }
}
```

---

#### 12. `PARTNER_REVEALED`
```json
{
  "type": "PARTNER_REVEALED",
  "timestamp": "2024-01-01T10:00:00Z",
  "payload": {
    "partner_id": "uuid-9012",
    "partner_name": "Charlie",
    "revealing_card": "AC",
    "revealed_by": "Bob"
  }
}
```

---

#### 13. `TRICK_WON`
```json
{
  "type": "TRICK_WON",
  "timestamp": "2024-01-01T10:00:00Z",
  "payload": {
    "trick_number": 1,
    "winner_id": "uuid-5678",
    "winner_name": "Bob",
    "trick_points": 15,
    "cards_in_trick": ["5H", "QH", "10D", "3C"],
    "team_points_accumulated": 15
  }
}
```

---

#### 14. `ROUND_ENDED`
```json
{
  "type": "ROUND_ENDED",
  "timestamp": "2024-01-01T10:00:00Z",
  "payload": {
    "round_number": 1,
    "highest_bid": 90,
    "bid_achieved": true,
    "team_points": 95,
    "results": [
      {
        "player_id": "uuid-1234",
        "player_name": "Alice",
        "role": "bidder",
        "is_partner": false,
        "round_score": 180,
        "cumulative_score": 180
      },
      {
        "player_id": "uuid-5678",
        "player_name": "Bob",
        "role": "partner",
        "is_partner": true,
        "round_score": 90,
        "cumulative_score": 90
      },
      {
        "player_id": "uuid-9012",
        "player_name": "Charlie",
        "role": "opponent",
        "is_partner": false,
        "round_score": -30,
        "cumulative_score": -30
      }
    ]
  }
}
```

---

#### 15. `GAME_PAUSED`
```json
{
  "type": "GAME_PAUSED",
  "timestamp": "2024-01-01T10:00:00Z",
  "payload": {
    "reason": "player_disconnected",
    "disconnected_player_name": "Charlie",
    "pause_state": "PLAYING_TRICKS",
    "reconnect_timeout_seconds": 300
  }
}
```

---

#### 16. `GAME_RESUMED`
```json
{
  "type": "GAME_RESUMED",
  "timestamp": "2024-01-01T10:00:00Z",
  "payload": {
    "reconnected_player_name": "Charlie",
    "resume_state": "PLAYING_TRICKS"
  }
}
```

---

#### 17. `GAME_ENDED`
```json
{
  "type": "GAME_ENDED",
  "timestamp": "2024-01-01T10:00:00Z",
  "payload": {
    "total_rounds": 3,
    "final_standings": [
      {
        "rank": 1,
        "player_id": "uuid-5678",
        "player_name": "Bob",
        "total_score": 450
      },
      {
        "rank": 2,
        "player_id": "uuid-1234",
        "player_name": "Alice",
        "total_score": 380
      },
      {
        "rank": 3,
        "player_id": "uuid-9012",
        "player_name": "Charlie",
        "total_score": -230
      }
    ]
  }
}
```

---

#### 18. `PLAYER_KICKED`
```json
{
  "type": "PLAYER_KICKED",
  "timestamp": "2024-01-01T10:00:00Z",
  "payload": {
    "kicked_player_id": "uuid-9012",
    "kicked_player_name": "Charlie",
    "kicked_by_owner": "Alice"
  }
}
```

---

#### 19. `ERROR`
```json
{
  "type": "ERROR",
  "timestamp": "2024-01-01T10:00:00Z",
  "payload": {
    "error_code": "INVALID_CARD_PLAY",
    "error_message": "Must follow suit if possible",
    "details": {
      "led_suit": "H",
      "player_hand": ["5C", "10D", "KS"]
    }
  }
}
```

---

### Client → Server Events

#### `PLAYER_ACTION`
```json
{
  "type": "READY",
  "timestamp": "2024-01-01T10:00:00Z",
  "payload": {}
}
```

Other client actions use the HTTP API endpoints.

---

## Notes
- Scoring across multiple rounds: TBD
- Specific UI/UX mockups: TBD
- Card distribution edge cases: Handle gracefully
- No timers implemented yet (can be added in future)
- Game state always accessible via GET /rooms/{room_code}
