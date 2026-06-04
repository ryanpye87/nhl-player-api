import mongoose from "mongoose";
import dotenv from 'dotenv'
import Player from './models/Player'

dotenv.config()

const NHL_API = 'https://api-web.nhle.com/v1'

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
    teamAbbrev: { default: string}
}

interface NHLStandings {
    standings: NHLTeam[]
}

async function fetchTeamAbbrevs(): Promise<string[]> {
    const res = await fetch(`${NHL_API}/standings/now`)
    if (!res.ok) throw new Error('Failed to fetch standings')
    const data: NHLStandings = await res.json()
    return data.standings.map(t =>t.teamAbbrev.default)
}

async function fetchRoster(teamAbbrev: string): Promise<NHLRosterPlayer[]> {
    const res = await fetch(`${NHL_API}/roster/${teamAbbrev}/current`)
    if (!res.ok) {
        console.warn(`Skipping ${teamAbbrev} - roster fetch failed`)
        return []
    }
    const data: NHLRoster = await res.json()
    return [
        ...data.forwards,
        ...data.defensemen,
        ...data.goalies,
    ]
}

async function seed() {
    await mongoose.connect(process.env.MONGO_URI!)
    console.log('Connected to MongoDB Atlas')

    const teamAbbrevs = await fetchTeamAbbrevs()
    console.log(`Found ${teamAbbrevs.length} teams`)

    const allPlayers: {id: number; fullName: string, teamAbbrev: string, position: string}[] = []

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
    }

    await Player.deleteMany({})
    await Player.insertMany(allPlayers)

    console.log(`\nSeeded ${allPlayers.length} players across ${teamAbbrevs.length} teams`)
}

seed().catch(err => {
    console.error('Seed failed:', err)
    process.exit(1)
})