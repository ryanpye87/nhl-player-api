import { Router, Request, Response } from "express"
import AggregatedStats from "../models/AggregatedStats"
import {
  MIN_GP_SKATER,
  MIN_GP_GOALIE,
  INVERTED_SKATER,
  INVERTED_GOALIE,
  SKATER_KEYS,
  GOALIE_KEYS,
  computePercentiles,
} from "../utils/percentiles"

const router = Router()

// ── Constants ───────────────────────────────────────────────────────

const NHL_STATS_API = "https://api.nhle.com/stats/rest/en"
const CURRENT_SEASON = "20252026"

// ── POST /aggregate ─────────────────────────────────────────────────

router.post("/aggregate", async (_req: Request, res: Response) => {
  try {
    let skaters = 0
    let goalies = 0

    // ── Skaters: summary (core stats) + realtime (hits, blocks) ────
    console.log("Fetching skater summary from NHL API...")
    const summaryUrl = `${NHL_STATS_API}/skater/summary?isAggregate=false&isGame=false&start=0&limit=0&cayenneExp=gameTypeId=2%20and%20seasonId%3C=${CURRENT_SEASON}%20and%20seasonId%3E=${CURRENT_SEASON}`
    const summaryRes = await fetch(summaryUrl)
    if (!summaryRes.ok) throw new Error(`Skater summary API returned ${summaryRes.status}`)
    const summaryData = (await summaryRes.json()) as any
    const summaryMap = new Map<number, any>()
    for (const s of summaryData.data) {
      summaryMap.set(s.playerId, s)
    }
    console.log(`  ${summaryData.data.length} skaters fetched`)

    // Small delay between API calls
    await new Promise((r) => setTimeout(r, 1000))

    console.log("Fetching skater realtime from NHL API...")
    const realtimeUrl = `${NHL_STATS_API}/skater/realtime?isAggregate=false&start=0&limit=0&cayenneExp=gameTypeId=2%20and%20seasonId%3C=${CURRENT_SEASON}%20and%20seasonId%3E=${CURRENT_SEASON}`
    const realtimeRes = await fetch(realtimeUrl)
    if (!realtimeRes.ok) throw new Error(`Skater realtime API returned ${realtimeRes.status}`)
    const realtimeData = (await realtimeRes.json()) as any
    const realtimeMap = new Map<number, any>()
    for (const r of realtimeData.data) {
      realtimeMap.set(r.playerId, r)
    }
    console.log(`  ${realtimeData.data.length} skaters in realtime`)

    // Merge and store skaters
    for (const [playerId, s] of summaryMap) {
      const rt = realtimeMap.get(playerId)

      const doc: any = {
        playerId,
        fullName: s.skaterFullName ?? "",
        position: s.positionCode ?? "",
        teamAbbrev: (s.teamAbbrevs as string)?.split(",")[0]?.trim() ?? "",
        season: s.seasonId?.toString() ?? CURRENT_SEASON,
        isGoalie: false,
        gamesPlayed: s.gamesPlayed ?? 0,
        goals: s.goals ?? 0,
        assists: s.assists ?? 0,
        points: s.points ?? 0,
        plusMinus: s.plusMinus ?? 0,
        shots: s.shots ?? 0,
        shootingPctg: s.shootingPct ?? 0,
        avgToi: (s.timeOnIcePerGame ?? 0) / 60, // seconds → decimal minutes
        pim: s.penaltyMinutes ?? 0,
        hits: rt?.hits ?? 0,
        blockedShots: rt?.blockedShots ?? 0,
      }

      await AggregatedStats.findOneAndUpdate(
        { playerId },
        { ...doc, updatedAt: new Date() },
        { upsert: true },
      )
      skaters++
    }

    // ── Goalies: summary ───────────────────────────────────────────
    console.log("Fetching goalie summary from NHL API...")
    const goalieUrl = `${NHL_STATS_API}/goalie/summary?isAggregate=false&isGame=false&start=0&limit=0&cayenneExp=gameTypeId=2%20and%20seasonId%3C=${CURRENT_SEASON}%20and%20seasonId%3E=${CURRENT_SEASON}`
    const goalieRes = await fetch(goalieUrl)
    if (!goalieRes.ok) throw new Error(`Goalie summary API returned ${goalieRes.status}`)
    const goalieData = (await goalieRes.json()) as any
    console.log(`  ${goalieData.total} goalies`)

    for (const g of goalieData.data) {
      const doc: any = {
        playerId: g.playerId,
        fullName: g.goalieFullName ?? "",
        position: "G",
        teamAbbrev: (g.teamAbbrevs as string)?.split(",")[0]?.trim() ?? "",
        season: g.seasonId?.toString() ?? CURRENT_SEASON,
        isGoalie: true,
        gamesPlayed: g.gamesPlayed ?? 0,
        wins: g.wins ?? 0,
        losses: g.losses ?? 0,
        otLosses: g.otLosses ?? 0,
        shutouts: g.shutouts ?? 0,
        savePctg: g.savePct ?? 0,
        goalsAgainstAvg: g.goalsAgainstAverage ?? 0,
        avgToi: (g.timeOnIce ?? 0) / 60 / Math.max(g.gamesPlayed ?? 1, 1), // total seconds → per-game minutes
      }

      await AggregatedStats.findOneAndUpdate(
        { playerId: g.playerId },
        { ...doc, updatedAt: new Date() },
        { upsert: true },
      )
      goalies++
    }

    // Clean up players no longer in the league
    const allPlayerIds = [
      ...summaryMap.keys(),
      ...goalieData.data.map((g: any) => g.playerId),
    ]
    const { deletedCount } = await AggregatedStats.deleteMany({
      playerId: { $nin: allPlayerIds },
    })
    if (deletedCount > 0) {
      console.log(`  Removed ${deletedCount} stale player(s)`)
    }

    console.log(`Aggregation complete: ${skaters} skaters, ${goalies} goalies`)
    res.json({ processed: skaters + goalies, skaters, goalies })
  } catch (err) {
    console.error("Aggregation failed:", err)
    res.status(500).json({ error: "Failed to aggregate stats" })
  }
})

// ── GET /aggregated ─────────────────────────────────────────────────

router.get("/aggregated", async (req: Request, res: Response) => {
  try {
    const filter: any = {}
    if (req.query.isGoalie === "true") filter.isGoalie = true
    if (req.query.isGoalie === "false") filter.isGoalie = false

    const docs = await AggregatedStats.find(filter).sort({ fullName: 1 })
    res.json(docs)
  } catch (err) {
    console.error("Failed to fetch aggregated stats:", err)
    res.status(500).json({ error: "Failed to fetch aggregated stats" })
  }
})

// ── GET /percentiles/:playerId ──────────────────────────────────────

router.get("/percentiles/:playerId", async (req: Request, res: Response) => {
  try {
    const playerId = parseInt(req.params.playerId as string)

    const target = await AggregatedStats.findOne({ playerId })
    if (!target) {
      return res.status(404).json({ error: "Player not found in aggregated stats" })
    }

    const minGp = target.isGoalie ? MIN_GP_GOALIE : MIN_GP_SKATER
    const invertedSet = target.isGoalie ? INVERTED_GOALIE : INVERTED_SKATER
    const statKeys = target.isGoalie ? GOALIE_KEYS : SKATER_KEYS

    const peers = await AggregatedStats.find({
      isGoalie: target.isGoalie,
      gamesPlayed: { $gte: minGp },
    })

    const percentiles =
      peers.length > 0
        ? computePercentiles(target, peers, statKeys, invertedSet)
        : {}

    res.json({
      playerId: target.playerId,
      fullName: target.fullName,
      position: target.position,
      season: target.season,
      percentiles,
    })
  } catch (err) {
    console.error("Percentile computation failed:", err)
    res.status(500).json({ error: "Failed to compute percentiles" })
  }
})

// ── POST /batch ──────────────────────────────────────────────────────
// Returns aggregated stats + percentiles for multiple players in one call.
// Collapses N×2 per-player calls into 1 request and shares peer queries.

router.post("/batch", async (req: Request, res: Response) => {
  try {
    const { ids } = req.body as { ids: number[] }

    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 100) {
      return res
        .status(400)
        .json({ error: "ids must be an array of 1–100 player IDs" })
    }

    // ── 1. Fetch aggregated stats for all requested players ──────────
    const aggregated = await AggregatedStats.find({
      playerId: { $in: ids },
    })

    // ── 2. Percentiles — group by position type, fetch peers once ────
    const percentiles: any[] = []

    const skaters = aggregated.filter(
      (p) => !p.isGoalie && p.gamesPlayed >= MIN_GP_SKATER,
    )
    const goalies = aggregated.filter(
      (p) => p.isGoalie && p.gamesPlayed >= MIN_GP_GOALIE,
    )

    // Skater percentiles
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

    // Goalie percentiles
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
    console.error("Batch fetch failed:", err)
    res.status(500).json({ error: "Failed to fetch batch data" })
  }
})

export default router
