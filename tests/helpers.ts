import type { Hackathon } from "../src/lib/types";

/** Minimal record for unit-testing the prize presentation helpers. */
export const hackathon = (overrides: Partial<Hackathon> = {}): Hackathon => ({
  id: "test-1",
  slug: "test-1",
  name: "Test AI Hackathon",
  description: "A test record.",
  status: "upcoming",
  mode: "online",
  organizer: "Test Organizer",
  startDate: "2026-11-01",
  endDate: "2026-11-30",
  prizes: [],
  totalPrizeUsd: 0,
  cashPrizeUsd: 0,
  creditPrizeUsd: 0,
  winners: [],
  tags: ["AI"],
  officialUrl: "https://example.com/test",
  sourceUrl: "https://example.com/test",
  sourceName: "test",
  sourceId: "test-1",
  firstSeenAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  ...overrides,
});