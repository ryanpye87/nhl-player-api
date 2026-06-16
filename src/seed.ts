import mongoose from "mongoose"
import dotenv from "dotenv"
import Player from "./models/Player"

dotenv.config()

const NHL_API = "https://api-web.nhle.com/v1"

interface NHLRosterPlayer {
  id: number
  firstName: { default: string }
  lastName: { default: string }
  positionCode: string
}

interface NHLRoster {
  forwards: NHLRosterPlayer[]
  defensemen: NHLRosterPlayer[]
  goalies: NHLRosterPlayer[]
}

interface NHLTeam {
  teamAbbrev: { default: string }
}

interface NHLStandings {
  standings: NHLTeam[]
}

async function fetchTeamAbbrevs(): Promise<string[]> {
  const res = await fetch(`${NHL_API}/standings/now`)
  if (!res.ok) throw new Error("Failed to fetch standings")
  const data = (await res.json()) as NHLStandings
  return data.standings.map((t) => t.teamAbbrev.default)
}

async function fetchRoster(teamAbbrev: string): Promise<NHLRosterPlayer[]> {
  const url = `${NHL_API}/roster/${teamAbbrev}/current`

  // Retry once on failure — the NHL API occasionally returns 307
  // for certain teams even though Node's fetch follows redirects
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url)
    if (res.ok) {
      const data = (await res.json()) as NHLRoster
      return [...data.forwards, ...data.defensemen, ...data.goalies]
    }
    if (attempt === 0) {
      // Wait 2s before retrying
      await new Promise((r) => setTimeout(r, 2000))
    }
  }

  console.warn(`Skipping ${teamAbbrev} — roster fetch failed after retry`)
  return []
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function seed() {
  await mongoose.connect(process.env.MONGO_URI!)
  console.log("Connected to MongoDB Atlas")

  const teamAbbrevs = await fetchTeamAbbrevs()
  console.log(`Found ${teamAbbrevs.length} teams`)

  const allPlayers: {
    id: number
    fullName: string
    teamAbbrev: string
    position: string
  }[] = []

  for (const abbrev of teamAbbrevs) {
    const roster = await fetchRoster(abbrev)
    for (const p of roster) {
      allPlayers.push({
        id: p.id,
        fullName: `${p.firstName.default} ${p.lastName.default}`,
        teamAbbrev: abbrev,
        position: p.positionCode,
      })
    }
    console.log(`✓ ${abbrev} — ${roster.length} players`)

    // Brief pause between teams to avoid rate limiting
    await delay(300)
  }

  let added = 0
  let updated = 0

  for (const p of allPlayers) {
    const existing = await Player.findOne({ id: p.id })
    if (existing) {
      if (
        existing.fullName !== p.fullName ||
        existing.teamAbbrev !== p.teamAbbrev ||
        existing.position !== p.position
      ) {
        await Player.updateOne({ id: p.id }, { $set: p })
        updated++
      }
    } else {
      await Player.create(p)
      added++
    }
  }

  console.log(
    `\nSeeded: ${added} added, ${updated} updated, ${allPlayers.length - added - updated} unchanged across ${teamAbbrevs.length} teams`,
  )

  // PlayerCache warms on-demand when GET /players/:id/stats is called.
  // Once players are cached, run POST /players/aggregate to populate
  // AggregatedStats for percentile computation.
}

seed().catch((err) => {
  console.error("Seed failed:", err)
  process.exit(1)
})
