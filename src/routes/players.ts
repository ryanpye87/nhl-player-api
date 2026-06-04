import {Router, Request, Response } from 'express'
import Player from '../models/Player'

const router = Router()

//GET /players - return all players
router.get('/', async (req: Request, res: Response) => {
    try {
        const players = await Player.find().sort({ fullName: 1 })
        res.json(players)
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch players"})
    }
})

export default router