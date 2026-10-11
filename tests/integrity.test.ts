import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { statusFor } from "../src/lib/sources/devpost";
import { mergedDataset } from "../src/lib/dataset";
import { computeStats } from "../src/lib/stats";
import { curatedHackathons } from "../src/data/curated";
import { shouldPreserveLastGood } from "../src/lib/collector";
import { hackathon } from "./helpers";

const atNoon = (d: string) => new Date(`${d}T12:00:00Z`);

test("statusFor: start-day, end-day, midnight and year-boundary behavior", () => {
  const today = "2026-10-11";
  assert.equal(statusFor(today, "2026-10-20", atNoon(today)), "ongoing");
  assert.equal(statusFor("2026-10-01", today, atNoon(today)), "ongoing");
  assert.equal(statusFor("2026-10-01", "2026-10-10", atNoon(today)), "past");
  assert.equal(statusFor("2026-10-20", "2026-10-21", atNoon(today)), "upcoming");
  assert.equal(statusFor(today, today, atNoon(today)), "ongoing");
  // year boundary
  assert.equal(statusFor("2026-12-31", "2027-01-02", atNoon("2027-01-01")), "ongoing");
  assert.equal(statusFor("2026-12-30", "2026-12-31", atNoon("2027-01-01")), "past");
  assert.equal(statusFor("2027-01-02", "2027-01-03", atNoon("2027-01-01")), "upcoming");
});

test("mergedDataset re-derives statuses from dates at the given reference time", () => {
  const stored = hackathon({
    id: "stale-status",
    status: "upcoming",
    startDate: "2026-10-01",
    endDate: "2026-10-05",
  });
  const merged = mergedDataset([stored], atNoon("2026-10-11"));
  assert.equal(merged[0].status, "past");
});

test("computeStats counts and prize buckets are internally consistent", () => {
  const items = [
    hackathon({
      id: "a",
      status: "ongoing",
      totalPrizeUsd: 1000,
      cashPrizeUsd: 600,
      creditPrizeUsd: 400,
      prizes: [
        { amount: 600, currency: "USD", type: "cash", label: "1st" },
        { amount: 400, currency: "USD", type: "credits", label: "credits" },
      ],
      winners: [
        { rank: 1, project: "P1" },
        { rank: 2, project: "P2" },
      ],
    }),
    hackathon({
      id: "b",
      status: "upcoming",
      totalPrizeUsd: 2000,
      claimedPrizeUsd: 2000,
      prizes: [],
    }),
    hackathon({ id: "c", status: "past" }),
  ];
  const s = computeStats(items);
  assert.equal(s.total, 3);
  assert.equal(s.ongoing, 1);
  assert.equal(s.upcoming, 1);
  assert.equal(s.past, 1);
  assert.equal(s.totalPrizeUsd, 3000);
  assert.equal(s.cashPrizeUsd, 600);
  assert.equal(s.creditPrizeUsd, 400);
  // "b" announces a headline pool only -> announced bucket, not cash/credits.
  assert.equal(s.announcedPrizeUsd, 2000);
  assert.equal(s.announcedPoolCount, 1);
  assert.equal(s.withWinners, 1);
  assert.equal(s.totalWinners, 2);
});

test("failure-safe publication: all-failed run preserves the last known good dataset", () => {
  assert.ok(
    shouldPreserveLastGood(108, [
      { name: "Devpost", url: "https://devpost.com/hackathons", ok: false, fetched: 0 },
      { name: "lablab.ai", url: "https://lablab.ai/ai-hackathons", ok: false, fetched: 0 },
    ]),
  );
  assert.ok(!shouldPreserveLastGood(0, [{ name: "x", url: "u", ok: true, fetched: 5 }]));
  assert.ok(
    !shouldPreserveLastGood(108, [
      { name: "Devpost", url: "u", ok: true, fetched: 5 },
      { name: "lablab.ai", url: "u2", ok: false, fetched: 0 },
    ]),
    "a single healthy source is enough to publish",
  );
});

test("production dataset: canonical invariants hold over the merged Dataset", async () => {
  const file = path.join(process.cwd(), "src", "data", "hackathons.json");
  const dataset = JSON.parse(await fs.readFile(file, "utf8")) as {
    hackathons: Parameters<typeof mergedDataset>[0];
  };
  const now = new Date();
  const merged = mergedDataset(dataset.hackathons, now);
  const s = computeStats(merged);

  assert.equal(s.upcoming + s.ongoing + s.past, s.total);
  assert.equal(s.total, dataset.hackathons.length + curatedHackathons.length);
  assert.ok(s.cashPrizeUsd + s.creditPrizeUsd <= s.totalPrizeUsd);
  // Every curated event's winners must survive the merge.
  const curatedWinners = curatedHackathons.reduce((n, c) => n + c.winners.length, 0);
  assert.equal(s.totalWinners, curatedWinners);
  assert.equal(s.withWinners, curatedHackathons.length);
});

test("production dataset: active sources are the live adapters; web sites are retired and documented", async () => {
  const file = path.join(process.cwd(), "src", "data", "hackathons.json");
  const dataset = JSON.parse(await fs.readFile(file, "utf8")) as {
    meta: {
      sources: { name: string; ok: boolean; lastOkAt?: string }[];
      retiredSources?: { name: string; retiredAt: string; lastCollectedAt?: string }[];
    };
  };

  // Active sources: exactly the SOURCE_REGISTRY adapters, all reporting ok with
  // a lastOkAt timestamp (nothing silently stale).
  const active = dataset.meta.sources.map((s) => s.name).sort();
  assert.deepEqual(active, ["Devpost", "lablab.ai"]);
  for (const s of dataset.meta.sources) {
    assert.ok(s.ok, `${s.name} must report ok`);
    assert.ok(s.lastOkAt, `${s.name} must carry lastOkAt`);
  }

  // Former web sites are documented as retired, never counted against coverage.
  const retired = (dataset.meta.retiredSources ?? []).map((s) => s.name).sort();
  assert.deepEqual(retired, ["deep-tech-week", "upenn", "vercel"]);
  for (const s of dataset.meta.retiredSources ?? []) {
    assert.ok(s.retiredAt, `${s.name} must carry retiredAt`);
    assert.ok(s.lastCollectedAt, `${s.name} must carry lastCollectedAt`);
  }
});