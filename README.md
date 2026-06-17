# 🏒 NHL Player API

Express + MongoDB backend that proxies, caches, and enriches data from the [NHL API](https://api-web.nhle.com/v1). Built to power the [NHL Player Compare](../nhl-player-app/) SPA.

## Tech Stack

| Layer | Choice |
|-------|--------|
| Runtime | Node.js + TypeScript |
| Framework | Express 5 |
| Database | MongoDB Atlas (Mongoose 9) |
| E2E testing | Playwright (API `request` fixture) |
| Dev tools | ts-node, nodemon |

## Prerequisites

- Node.js 18+
- A [MongoDB Atlas](https://www.mongodb.com/atlas) cluster (free tier works)

## Getting Started

```bash
# 1. Install
cd nhl-player-api
npm install

# 2. Configure environment
# Create .env with:
#   MONGO_URI=mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/<db>
#   PORT=3001

# 3. Seed the player directory
npm run seed

# 4. Populate aggregated stats (hits the real NHL API — takes ~60s)
curl -X POST http://localhost:3001/players/aggregate

# 5. Start the dev server
npm run dev
# → API running on http://localhost:3001

# 6. Run E2E tests (server must be running)
npx playwright test
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start with nodemon (auto-reload) |
| `npm run seed` | Fetch all 32 NHL rosters → populate `Player` collection |
| `npx playwright test` | E2E tests against the running server |

## API Endpoints

All routes are mounted at `/players`.

### Players

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/players` | All active NHL players, sorted alphabetically |
| `GET` | `/players/:id/stats` | Raw NHL player landing data (cached 24hr, proxy to NHL API on miss) |
| `GET` | `/players/:id/aggregated` | Pre-computed season stats for one player |
| `POST` | `/players/batch` | Aggregated stats + 0–99 percentiles for 1–100 players in one call |

### Stats

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/players/aggregate` | Fetch all skater + goalie stats from NHL API → upsert into `AggregatedStats` |
| `GET` | `/players/aggregated` | All aggregated stats (filterable by `?isGoalie=true`) |
| `GET` | `/players/percentiles/:playerId` | 0–99 percentile ranks vs. all qualified peers |

### Example: `POST /players/batch`

```json
// Request
{ "ids": [8478402, 8476454] }

// Response
{
  "aggregated": [
    { "playerId": 8478402, "fullName": "Connor McDavid", "isGoalie": false, "goals": 48, "assists": 90, "points": 138, ... },
    { "playerId": 8476454, "fullName": "Sidney Crosby", "isGoalie": false, "goals": 35, "assists": 52, "points": 87, ... }
  ],
  "percentiles": [
    { "playerId": 8478402, "percentiles": { "goals": 99, "assists": 99, "points": 99, ... } },
    { "playerId": 8476454, "percentiles": { "goals": 91, "assists": 85, "points": 90, ... } }
  ]
}
```

## Project Structure

```
src/
├── index.ts              # Express app + MongoDB connection
├── seed.ts               # Roster seeding script
├── models/
│   ├── Player.ts          # Player directory (id, name, team, position)
│   ├── PlayerCache.ts     # NHL landing API response cache (24hr TTL)
│   └── AggregatedStats.ts # Pre-computed flat season stats (skaters + goalies)
├── routes/
│   ├── players.ts         # /players endpoints + POST /batch
│   └── stats.ts           # /players/aggregate, /aggregated, /percentiles/:id
└── utils/
    └── percentiles.ts     # Shared percentile computation + constants
e2e/
└── api.spec.ts            # Playwright E2E tests (16 tests, ~55s)
docs/
└── PRD.md                 # Full product requirements + testing strategy
```

## Data Flow

1. **Seed** (`npm run seed`) — fetches all 32 NHL team rosters and populates `Player` with every active player's ID, name, team, and position
2. **Aggregate** (`POST /players/aggregate`) — fetches current-season stats from the NHL stats API (skater summary, skater realtime, goalie summary), flattens them into `AggregatedStats` documents, and removes stale players no longer in the league
3. **Player stats** (`GET /players/:id/stats`) — checks `PlayerCache`; returns cached data if < 24 hours old, otherwise proxies to the NHL landing API
4. **Batch** (`POST /players/batch`) — single-call endpoint that returns aggregated stats + percentile ranks for multiple players. Percentile peer queries are shared across players of the same position type (skaters vs skaters, goalies vs goalies)
5. **Percentiles** (`GET /players/percentiles/:playerId`) — ranks one player against all qualified peers (min 10 GP skaters, min 5 GP goalies) on a 0–99 scale

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MONGO_URI` | Yes | MongoDB Atlas connection string |
| `PORT` | No | Server port (default: 3001) |
