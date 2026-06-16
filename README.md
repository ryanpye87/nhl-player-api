# 🏒 NHL Player API

Express + MongoDB backend that proxies, caches, and enriches data from the [NHL Web API](https://api-web.nhle.com/v1). Built to power the [NHL Player Compare](../nhl-player-app/) SPA.

## Tech Stack

| Layer | Choice |
|-------|--------|
| Runtime | Node.js + TypeScript |
| Framework | Express 5 |
| Database | MongoDB Atlas (Mongoose 9) |
| Dev tools | ts-node, nodemon |

## Prerequisites

- Node.js 18+
- A [MongoDB Atlas](https://www.mongodb.com/atlas) cluster (free tier works)
- Git Bash or WSL for running scripts on Windows

## Getting Started

```bash
# 1. Clone and install
cd nhl-player-api
npm install

# 2. Configure environment
cp .env.example .env   # if a template exists, or create .env with:
                       #   MONGO_URI=mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/<db>
                       #   PORT=3001

# 3. Seed the player directory
npm run seed

# 4. Start the dev server
npm run dev
# → API running on http://localhost:3001
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start with nodemon (auto-reload) |
| `npm run seed` | Fetch all 32 NHL rosters and populate the `Player` collection |

## API Endpoints

### Players

#### `GET /players`
Returns all active NHL players, sorted alphabetically.

```json
[
  { "id": 8478402, "fullName": "Connor McDavid", "teamAbbrev": "EDM", "position": "C" },
  { "id": 8471679, "fullName": "Sidney Crosby", "teamAbbrev": "PIT", "position": "C" }
]
```

#### `GET /players/:id/stats`
Returns the full NHL player landing page data. Responses are cached in MongoDB for 24 hours; cache misses proxy to the NHL API in real time.

```json
{
  "playerId": 8478402,
  "firstName": { "default": "Connor" },
  "lastName": { "default": "McDavid" },
  "currentTeamAbbrev": "EDM",
  "position": "C",
  "seasonTotals": [ /* ...per-season stat arrays... */ ],
  "fromCache": true
}
```

### Stats *(planned — see [PRD](docs/PRD.md))*

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/stats/aggregate` | Process all cached player data into flat, queryable stat documents |
| `GET` | `/stats/aggregated` | Get all aggregated stats (filterable by skater/goalie) |
| `GET` | `/stats/percentiles/:playerId` | Get 0–99 percentile ranks for a player vs. the league |

## Project Structure

```
src/
├── index.ts              # Express app + MongoDB connection
├── seed.ts               # Roster seeding script
├── models/
│   ├── Player.ts          # Player directory (id, name, team, position)
│   └── PlayerCache.ts     # Raw NHL API response cache
├── routes/
│   └── players.ts         # /players endpoints
```

## Data Flow

1. **Seed** (`npm run seed`) — fetches all 32 NHL team rosters from the public API and populates the `Player` collection with every active player's ID, name, team, and position
2. **Player stats request** — `GET /players/:id/stats` checks `PlayerCache`; if the cached entry is < 24 hours old it's returned immediately, otherwise the NHL API is called and the response is cached
3. **Aggregation** *(planned)* — a `POST /stats/aggregate` endpoint processes all `PlayerCache` entries, extracts current-season stats from the nested `seasonTotals` array, and flattens them into a new `AggregatedStats` collection for efficient league-wide queries
4. **Percentiles** *(planned)* — `GET /stats/percentiles/:playerId` ranks a player against all qualified peers in `AggregatedStats` and returns 0–99 scores ready for visualization

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MONGO_URI` | Yes | MongoDB Atlas connection string |
| `PORT` | No | Server port (default: 3001) |
