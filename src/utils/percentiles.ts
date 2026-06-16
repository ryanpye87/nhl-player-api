/** Minimum games played to qualify for percentile rankings */
export const MIN_GP_SKATER = 10
export const MIN_GP_GOALIE = 5

/** Stats that are inverted — lower raw value = better (higher percentile) */
export const INVERTED_SKATER = new Set(["pim"])
export const INVERTED_GOALIE = new Set(["goalsAgainstAvg", "losses"])

/** Stat keys used for percentile computation */
export const SKATER_KEYS = [
  "gamesPlayed", "goals", "assists", "points", "plusMinus",
  "shots", "shootingPctg", "avgToi", "hits", "blockedShots", "pim",
]
export const GOALIE_KEYS = [
  "gamesPlayed", "wins", "losses", "otLosses", "shutouts",
  "savePctg", "goalsAgainstAvg", "avgToi",
]

/** Compute percentile ranks for one player against a peer set. */
export function computePercentiles(
  target: any,
  peers: any[],
  statKeys: string[],
  invertedSet: Set<string>,
): Record<string, number> {
  const result: Record<string, number> = {}
  for (const key of statKeys) {
    const targetValue = target[key] ?? 0
    let lowerCount = 0
    for (const peer of peers) {
      const peerValue = peer[key] ?? 0
      if (invertedSet.has(key)) {
        if (peerValue > targetValue) lowerCount++
      } else {
        if (peerValue < targetValue) lowerCount++
      }
    }
    const pct = Math.round((lowerCount / peers.length) * 99)
    result[key] = Math.min(99, Math.max(0, pct))
  }
  return result
}
