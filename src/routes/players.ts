import {Router, Request, Response } from 'express'
import Player from '../models/Player'
import PlayerCache from '../models/PlayerCache'
import AggregatedStats from '../models/AggregatedStats'
import {
  MIN_GP_SKATER,
  MIN_GP_GOALIE,
  INVERTED_SKATER,
  INVERTED_GOALIE,
  SKATER_KEYS,
  GOALIE_KEYS,
  computePercentiles,
} from '../utils/percentiles'

const router = Router()

const CACHE_TTL_HOURS = 24

function isCacheStale(cachedAt: Date): boolean {
    const ageMs = Date.now() - cachedAt.getTime()
    const ageHours = ageMs / (1000 * 60 * 60)
    return ageHours > CACHE_TTL_HOURS
}

//GET /players - return all players
router.get('/', async (req: Request, res: Response) => {
    try {
        const players = await Player.find().sort({ fullName: 1 })
        res.json(players)
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch players"})
    }
})

// GET /players/:id/stats — return stats with caching
router.get('/:id/stats', async (req: Request, res: Response) => {
    const playerId = parseInt(req.params.id as string)

    try {
        const cached = await PlayerCache.findOne({ playerId })

        if (cached && !isCacheStale(cached.cachedAt)) {
            console.log(`Cache hit for player ${playerId}`)
            return res.json({ ...cached.data, fromCache: true })
        }

        console.log(`Cache miss for player ${playerId} - fetching from NHL API`)
        const response = await fetch(`https://api-web.nhle.com/v1/player/${playerId}/landing`)
        if (!response.ok) throw new Error(`NHL API request failed`)
        const data = await response.json() as object

        await PlayerCache.findOneAndUpdate(
            { playerId },
            { data, cachedAt: new Date() },
            { upsert: true }
        )

        res.json({ ...data, fromCache: false})
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch player stats'})
    }
})

// GET /players/:id/aggregated — return flat AggregatedStats for one player
router.get('/:id/aggregated', async (req: Request, res: Response) => {
    const playerId = parseInt(req.params.id as string)

    try {
        const doc = await AggregatedStats.findOne({ playerId })
        if (!doc) {
            return res.status(404).json({ error: 'Aggregated stats not found for this player' })
        }
        res.json(doc)
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch aggregated stats' })
    }
})

// POST /players/batch — aggregated stats + percentiles for multiple players
router.post('/batch', async (req: Request, res: Response) => {
    try {
        const { ids } = req.body as { ids: number[] }

        if (!Array.isArray(ids) || ids.length === 0 || ids.length > 100) {
            return res
                .status(400)
                .json({ error: 'ids must be an array of 1–100 player IDs' })
        }

        // 1. Fetch aggregated stats for all requested players
        const aggregated = await AggregatedStats.find({
            playerId: { $in: ids },
        })

        // 2. Percentiles — group by position type, fetch peers once per group
        const percentiles: any[] = []

        const skaters = aggregated.filter(
            (p) => !p.isGoalie && p.gamesPlayed >= MIN_GP_SKATER,
        )
        const goalies = aggregated.filter(
            (p) => p.isGoalie && p.gamesPlayed >= MIN_GP_GOALIE,
        )

        if (skaters.length > 0) {
            const peers = await AggregatedStats.find({
                isGoalie: false,
                gamesPlayed: { $gte: MIN_GP_SKATER },
            })
            for (const player of skaters) {
                percentiles.push({
                    playerId: player.playerId,
                    percentiles: computePercentiles(player, peers, SKATER_KEYS, INVERTED_SKATER),
                })
            }
        }

        if (goalies.length > 0) {
            const peers = await AggregatedStats.find({
                isGoalie: true,
                gamesPlayed: { $gte: MIN_GP_GOALIE },
            })
            for (const player of goalies) {
                percentiles.push({
                    playerId: player.playerId,
                    percentiles: computePercentiles(player, peers, GOALIE_KEYS, INVERTED_GOALIE),
                })
            }
        }

        res.json({ aggregated, percentiles })
    } catch (err) {
        console.error('Batch fetch failed:', err)
        res.status(500).json({ error: 'Failed to fetch batch data' })
    }
})

export default router