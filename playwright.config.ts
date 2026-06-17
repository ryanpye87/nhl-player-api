import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  timeout: 15_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: "list",

  use: {
    baseURL: "http://localhost:3001",
    // No browser needed — API-only tests use the `request` fixture
  },

  // API server must already be running
  // (no webServer config — the API needs MongoDB, so we start it manually)
})
