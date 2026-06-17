import { test, expect } from "@playwright/test"

// ── Helpers ───────────────────────────────────────────────────────────

/** Shared player ID used across tests — pick a known superstar that always exists. */
const KNOWN_SKATER = 8478402 // Connor McDavid
const KNOWN_GOALIE = 8478044 // Igor Shesterkin (approx — adjust if needed)

// ── GET /players ──────────────────────────────────────────────────────

test.describe("GET /players", () => {
  test("returns a non-empty array sorted by fullName", async ({ request }) => {
    const res = await request.get("/players")
    expect(res.status()).toBe(200)

    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
    expect(body.length).toBeGreaterThan(500) // 32 teams × ~20 players

    // Verify shape of first element
    const player = body[0]
    expect(player).toHaveProperty("id")
    expect(player).toHaveProperty("fullName")
    expect(player).toHaveProperty("teamAbbrev")
    expect(player).toHaveProperty("position")
    expect(typeof player.id).toBe("number")
    expect(typeof player.fullName).toBe("string")

    // Verify sorted
    const names = body.map((p: any) => p.fullName)
    const sorted = [...names].sort()
    expect(names).toEqual(sorted)
  })
})

// ── GET /players/:id/stats ────────────────────────────────────────────

test.describe("GET /players/:id/stats", () => {
  test("returns landing data for a known skater", async ({ request }) => {
    const res = await request.get(`/players/${KNOWN_SKATER}/stats`)
    expect(res.status()).toBe(200)

    const body = await res.json()
    expect(body).toHaveProperty("playerId")
    expect(body).toHaveProperty("firstName")
    expect(body).toHaveProperty("lastName")
    expect(body).toHaveProperty("currentTeamAbbrev")
    expect(body).toHaveProperty("position")
    expect(body).toHaveProperty("fromCache")
    expect(typeof body.fromCache).toBe("boolean")
  })

  test("returns 500 for a non-numeric id", async ({ request }) => {
    const res = await request.get("/players/notanumber/stats")
    expect(res.status()).toBe(500)
  })
})

// ── GET /players/:id/aggregated ───────────────────────────────────────

test.describe("GET /players/:id/aggregated", () => {
  test("returns aggregated stats for a known skater", async ({ request }) => {
    const res = await request.get(`/players/${KNOWN_SKATER}/aggregated`)
    // Works if aggregate has been run; 404 if not
    expect([200, 404]).toContain(res.status())

    if (res.status() === 200) {
      const body = await res.json()
      expect(body).toHaveProperty("playerId", KNOWN_SKATER)
      expect(body).toHaveProperty("isGoalie", false)
      expect(body).toHaveProperty("gamesPlayed")
      expect(body).toHaveProperty("goals")
      expect(body).toHaveProperty("assists")
      expect(body).toHaveProperty("points")
      expect(typeof body.goals).toBe("number")
    }
  })

  test("returns 404 for a non-existent player", async ({ request }) => {
    const res = await request.get("/players/99999999/aggregated")
    expect(res.status()).toBe(404)
  })
})

// ── POST /players/batch ───────────────────────────────────────────────

test.describe("POST /players/batch", () => {
  test("returns aggregated stats + percentiles for a single skater", async ({
    request,
  }) => {
    const res = await request.post("/players/batch", {
      data: { ids: [KNOWN_SKATER] },
    })
    expect(res.status()).toBe(200)

    const body = await res.json()
    expect(body).toHaveProperty("aggregated")
    expect(body).toHaveProperty("percentiles")
    expect(Array.isArray(body.aggregated)).toBe(true)
    expect(Array.isArray(body.percentiles)).toBe(true)

    // Aggregated shape
    const agg = body.aggregated[0]
    expect(agg).toHaveProperty("playerId", KNOWN_SKATER)
    expect(agg).toHaveProperty("fullName")
    expect(agg).toHaveProperty("isGoalie", false)

    // Percentile shape
    if (body.percentiles.length > 0) {
      const pct = body.percentiles[0]
      expect(pct).toHaveProperty("playerId", KNOWN_SKATER)
      expect(pct).toHaveProperty("percentiles")
      expect(typeof pct.percentiles).toBe("object")

      // Spot-check a few stats
      const keys = Object.keys(pct.percentiles)
      expect(keys).toContain("goals")
      expect(keys).toContain("assists")
      expect(keys).toContain("points")

      // Values are 0–99
      for (const v of Object.values(pct.percentiles) as number[]) {
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(99)
      }
    }
  })

  test("returns aggregated stats for multiple players", async ({ request }) => {
    // Use two players that we know have been aggregated
    const res = await request.post("/players/batch", {
      data: { ids: [8478402, 8476454] },
    })
    expect(res.status()).toBe(200)

    const body = await res.json()
    expect(body.aggregated.length).toBeGreaterThanOrEqual(1)
  })

  test("returns 400 for missing ids", async ({ request }) => {
    const res = await request.post("/players/batch", {
      data: {},
    })
    expect(res.status()).toBe(400)
  })

  test("returns 400 for empty ids array", async ({ request }) => {
    const res = await request.post("/players/batch", {
      data: { ids: [] },
    })
    expect(res.status()).toBe(400)
  })

  test("returns empty arrays for unknown player IDs", async ({ request }) => {
    const res = await request.post("/players/batch", {
      data: { ids: [99999999] },
    })
    expect(res.status()).toBe(200)

    const body = await res.json()
    expect(body.aggregated).toHaveLength(0)
    expect(body.percentiles).toHaveLength(0)
  })
})

// ── GET /players/percentiles/:playerId ────────────────────────────────

test.describe("GET /players/percentiles/:playerId", () => {
  test("returns percentile data for a known skater", async ({ request }) => {
    const res = await request.get(`/players/percentiles/${KNOWN_SKATER}`)
    expect([200, 404]).toContain(res.status())

    if (res.status() === 200) {
      const body = await res.json()
      expect(body).toHaveProperty("playerId", KNOWN_SKATER)
      expect(body).toHaveProperty("fullName")
      expect(body).toHaveProperty("percentiles")
      expect(body).toHaveProperty("season")

      for (const v of Object.values(body.percentiles) as number[]) {
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(99)
      }
    }
  })
})

// ── POST /players/aggregate ───────────────────────────────────────────

test.describe("POST /players/aggregate", () => {
  test("returns a processed count", async ({ request }) => {
    test.setTimeout(120_000) // hits the real NHL API — can be slow
    const res = await request.post("/players/aggregate")
    expect(res.status()).toBe(200)

    const body = await res.json()
    expect(body).toHaveProperty("processed")
    expect(body).toHaveProperty("skaters")
    expect(body).toHaveProperty("goalies")
    expect(typeof body.processed).toBe("number")
    expect(body.processed).toBeGreaterThan(0)
    expect(body.processed).toBe(body.skaters + body.goalies)
  })
})

// ── GET /players/aggregated ───────────────────────────────────────────

test.describe("GET /players/aggregated", () => {
  test("returns a non-empty array", async ({ request }) => {
    const res = await request.get("/players/aggregated")
    expect(res.status()).toBe(200)

    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
    expect(body.length).toBeGreaterThan(0)
  })

  test("filters by isGoalie=true", async ({ request }) => {
    const res = await request.get("/players/aggregated?isGoalie=true")
    expect(res.status()).toBe(200)

    const body = await res.json()
    for (const doc of body) {
      expect(doc.isGoalie).toBe(true)
    }
  })

  test("filters by isGoalie=false", async ({ request }) => {
    const res = await request.get("/players/aggregated?isGoalie=false")
    expect(res.status()).toBe(200)

    const body = await res.json()
    for (const doc of body) {
      expect(doc.isGoalie).toBe(false)
    }
  })
})

// ── Cross-endpoint consistency ────────────────────────────────────────

test.describe("Cross-endpoint consistency", () => {
  test("batch and single aggregated return same data for a player", async ({
    request,
  }) => {
    // Single
    const single = await request.get(`/players/${KNOWN_SKATER}/aggregated`)
    if (single.status() !== 200) return // skip if not aggregated

    const singleBody = await single.json()

    // Batch
    const batch = await request.post("/players/batch", {
      data: { ids: [KNOWN_SKATER] },
    })
    const batchBody = await batch.json()

    const batchAgg = batchBody.aggregated[0]

    // Core stat fields should match
    expect(batchAgg.playerId).toBe(singleBody.playerId)
    expect(batchAgg.fullName).toBe(singleBody.fullName)
    expect(batchAgg.gamesPlayed).toBe(singleBody.gamesPlayed)
    expect(batchAgg.goals).toBe(singleBody.goals)
    expect(batchAgg.assists).toBe(singleBody.assists)
    expect(batchAgg.points).toBe(singleBody.points)
  })
})
