import mongoose, { Schema, Document } from "mongoose"

export interface IAggregatedStats extends Document {
  playerId: number
  fullName: string
  position: string
  teamAbbrev: string
  season: string
  isGoalie: boolean

  // Skater stats
  gamesPlayed: number
  goals: number
  assists: number
  points: number
  plusMinus: number
  shots: number
  shootingPctg: number
  avgToi: number
  hits: number
  blockedShots: number
  pim: number

  // Goalie stats
  wins: number
  losses: number
  otLosses: number
  shutouts: number
  savePctg: number
  goalsAgainstAvg: number

  updatedAt: Date
}

const AggregatedStatsSchema = new Schema({
  playerId: { type: Number, required: true, unique: true },
  fullName: { type: String, required: true },
  position: { type: String, required: true },
  teamAbbrev: { type: String, required: true },
  season: { type: String, required: true },
  isGoalie: { type: Boolean, required: true },

  gamesPlayed: { type: Number, default: 0 },
  goals: { type: Number, default: 0 },
  assists: { type: Number, default: 0 },
  points: { type: Number, default: 0 },
  plusMinus: { type: Number, default: 0 },
  shots: { type: Number, default: 0 },
  shootingPctg: { type: Number, default: 0 },
  avgToi: { type: Number, default: 0 },
  hits: { type: Number, default: 0 },
  blockedShots: { type: Number, default: 0 },
  pim: { type: Number, default: 0 },

  wins: { type: Number, default: 0 },
  losses: { type: Number, default: 0 },
  otLosses: { type: Number, default: 0 },
  shutouts: { type: Number, default: 0 },
  savePctg: { type: Number, default: 0 },
  goalsAgainstAvg: { type: Number, default: 0 },

  updatedAt: { type: Date, default: Date.now },
})

// Index for percentile queries — filter by position type
AggregatedStatsSchema.index({ isGoalie: 1, season: 1 })

export default mongoose.model<IAggregatedStats>(
  "AggregatedStats",
  AggregatedStatsSchema,
)
