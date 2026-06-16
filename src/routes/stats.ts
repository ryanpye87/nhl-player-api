import { Router, Request, Response } from "express"
import AggregatedStats from "../models/AggregatedStats"

const router = Router()

// ── Constants ───────────────────────────────────────────────────────

const NHL_STATS_API = "https://api.nhle.com/stats/rest/en"
const CURRENT_SEASON = "20252026"

/** Minimum games played to qualify for percentile rankings */
const MIN_GP_SKATER = 10
const MIN_GP_GOALIE = 5

/** Stats that are inverted — lower raw value = better (higher percentile) */
const INVERTED_SKATER = new Set(["pim"])
const INVERTED_GOALIE = new Set(["goalsAgainstAvg", "losses"])

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

    // All qualified peers of the same type
    const peers = await AggregatedStats.find({
      isGoalie: target.isGoalie,
      gamesPlayed: { $gte: minGp },
    })

    if (peers.length === 0) {
      return res.json({
        playerId: target.playerId,
        fullName: target.fullName,
        position: target.position,
        season: target.season,
        percentiles: {},
      })
    }

    // Stat keys to compute percentiles for
    const statKeys = target.isGoalie
      ? ["gamesPlayed", "wins", "losses", "otLosses", "shutouts", "savePctg", "goalsAgainstAvg", "avgToi"]
      : ["gamesPlayed", "goals", "assists", "points", "plusMinus", "shots", "shootingPctg", "avgToi", "hits", "blockedShots", "pim"]

    const percentiles: Record<string, number> = {}

    for (const key of statKeys) {
      const targetValue = (target as any)[key] ?? 0

      // Count players with lower (or higher for inverted) values
      let lowerCount = 0
      for (const peer of peers) {
        const peerValue = (peer as any)[key] ?? 0
        if (invertedSet.has(key)) {
          if (peerValue > targetValue) lowerCount++
        } else {
          if (peerValue < targetValue) lowerCount++
        }
      }

      const pct = Math.round((lowerCount / peers.length) * 99)
      percentiles[key] = Math.min(99, Math.max(0, pct))
    }

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

export default router
