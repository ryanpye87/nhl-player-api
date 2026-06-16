# Product Requirements Document — NHL Player API

## Overview

**NHL Player API** is an Express + MongoDB backend that proxies and caches data from the NHL's public API. It serves two consumers:

1. **nhl-player-app** (the comparison SPA) — player search, individual stats, and league-wide percentile ranks
2. **Future consumers** — any other app that needs NHL player data without hitting the NHL API directly

The API wraps the [NHL Web API](https://api-web.nhle.com/v1) with a 24-hour cache layer and enriches the raw data with pre-computed aggregations and percentile ranks.

---

## Data Model

### `Player` collection
Seeded from the NHL roster endpoint. The canonical player directory.

| Field | Type | Description |
|-------|------|-------------|
| `id` | number | NHL player ID (unique) |
| `fullName` | string | e.g. "Connor McDavid" |
| `teamAbbrev` | string | e.g. "EDM" |
| `position` | string | "C", "D", "L", "R", "G" |

### `PlayerCache` collection
Raw NHL API response blobs, one document per player.

| Field | Type | Description |
|-------|------|-------------|
| `playerId` | number | NHL player ID (unique) |
| `data` | Mixed | Full JSON response from `api-web.nhle.com/v1/player/{id}/landing` |
| `cachedAt` | Date | When this cache entry was last refreshed |

The `data` object contains `seasonTotals` — an array of per-season stat lines — plus player info, headshot URLs, current team, etc.

### `AggregatedStats` collection *(planned)*
Flat, queryable stat documents — one per player, extracted from `PlayerCache` for the current NHL regular season. Enables efficient percentile computation across the entire league.

| Field | Type | Description |
|-------|------|-------------|
| `playerId` | number | NHL player ID (unique) |
| `fullName` | string | Player name |
| `position` | string | Position code |
| `teamAbbrev` | string | Current team |
| `season` | string | Season key, e.g. "20242025" |
| `isGoalie` | boolean | True if position is "G" |
| `gamesPlayed` | number | GP in current regular season |
| `goals` | number | |
| `assists` | number | |
| `points` | number | |
| `plusMinus` | number | |
| `shots` | number | Shots on goal |
| `shootingPctg` | number | Shooting percentage (0.0–1.0) |
| `avgToi` | number | Average time on ice per game (decimal minutes) |
| `hits` | number | |
| `blockedShots` | number | |
| `pim` | number | Penalty minutes |
| `wins` | number | *Goalie only* |
| `losses` | number | *Goalie only* |
| `otLosses` | number | *Goalie only* |
| `shutouts` | number | *Goalie only* |
| `savePctg` | number | *Goalie only* |
| `goalsAgainstAvg` | number | *Goalie only* |
| `updatedAt` | Date | Last aggregation timestamp |

---

## API Endpoints

### Current

| Method | Path | Description | Cache |
|--------|------|-------------|-------|
| `GET` | `/players` | All active NHL players (sorted by name) | DB (static) |
| `GET` | `/players/:id/stats` | Raw NHL player landing data | DB (24hr TTL) |

### Planned

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/stats/aggregate` | Process all PlayerCache entries → upsert into AggregatedStats |
| `GET` | `/stats/aggregated` | Return all AggregatedStats documents (filterable by `?isGoalie=`) |
| `GET` | `/stats/percentiles/:playerId` | Return 0–99 percentile ranks for a player vs. all qualified peers |

#### `GET /stats/percentiles/:playerId` response shape

```json
{
  "playerId": 8478402,
  "fullName": "Connor McDavid",
  "position": "C",
  "season": "20242025",
  "percentiles": {
    "goals": 95,
    "assists": 99,
    "points": 99,
    "shots": 88,
    "shootingPctg": 72,
    "avgToi": 91,
    "hits": 34,
    "blockedShots": 28,
    "plusMinus": 82,
    "pim": 65
  }
}
```

All values are 0–99. Players with fewer than 10 games played are excluded from the comparison pool. Inverted stats (PIM for skaters, GAA for goalies) use reverse ranking — lower raw value = higher percentile.

---

## Architecture

```
                    ┌──────────────┐
                    │  NHL Web API │  (api-web.nhle.com)
                    └──────┬───────┘
                           │  fetch on cache miss
                    ┌──────▼───────┐
                    │  PlayerCache │  (MongoDB, 24hr TTL)
                    └──────┬───────┘
                           │  POST /stats/aggregate
                    ┌──────▼──────────┐
                    │ AggregatedStats │  (MongoDB, flat & queryable)
                    └──────┬──────────┘
                           │  GET /stats/percentiles/:id
                    ┌──────▼───────┐
                    │  Frontend    │  (nhl-player-app)
                    └──────────────┘
```

---

## Normalization Rules

### Qualification
- Skaters: minimum 10 games played in current regular season
- Goalies: minimum 5 games played

### Percentile formula
```
percentile = (players_with_lower_value / total_qualified_players) * 99
             clamped to [0, 99], rounded to nearest integer
```

### Inverted stats
The following stats use `players_with_higher_value` (lower raw = better):
- **Skaters:** PIM (penalty minutes)
- **Goalies:** GAA (goals against average), losses

### TOI parsing
The NHL API returns `avgToi` as a string `"mm:ss"`. It is parsed to decimal minutes: `minutes + (seconds / 60)`.

---

## Future Roadmap

- **Multi-season aggregation** — store stats for multiple seasons, not just the latest
- **Advanced stats integration** — ingest xGF, xGA, Corsi from Natural Stat Trick or Evolving-Hockey
- **Percentile caching** — pre-compute and cache percentile rankings to avoid O(n) scans per request
- **Position-group filtering** — percentiles scoped to position (C vs. C, D vs. D, etc.)
- **Rookie filtering** — percentiles scoped to first-year players
- **Rate limiting** — protect the NHL API from excessive requests during cache refresh storms
