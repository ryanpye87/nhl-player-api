import {Router, Request, Response } from 'express'
import Player from '../models/Player'
import PlayerCache from '../models/PlayerCache'

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

export default router