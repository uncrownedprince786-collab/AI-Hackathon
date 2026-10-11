// Data quality audit. Usage: node scripts/audit-data.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const data = JSON.parse(readFileSync(join(root, "src/data/hackathons.json"), "utf8"));
const curated = readFileSync(join(root, "src/data/curated.ts"), "utf8");
const records = data.hackathons ?? data;
const now = new Date();

const statusOf = (h) => {
  const start = (h.startDate ?? "") ? Date.parse(h.startDate + "T00:00:00Z") : NaN;
  const end = (h.endDate ?? "") ? Date.parse(h.endDate + "T23:59:59Z") : NaN;
  if (Number.isNaN(start)) return "unknown";
  if (!Number.isNaN(end) && now > end) return "past";
  if (now < start) return "upcoming";
  return "ongoing";
};

const out = {
  total: records.length,
  counts: {},
  claimsWithoutAmounts: [],
  inconsistentPoolTotals: [],
  dirtyOrganizers: [],
  dateAnomalies: [],
  noEndDate: [],
  brokenWinners: [],
  winnerCoverage: { eventsWithWinners: 0, totalWinners: 0, past: 0 },
  thinDescriptions: [],
};

for (const h of records) {
  const status = statusOf(h);
  out.counts[status] = (out.counts[status] || 0) + 1;

  const cash = h.cashPrizeUsd ?? 0;
  const credits = h.creditPrizeUsd ?? 0;
  const claimed = h.claimedPrizeUsd ?? 0;
  const total = h.totalPrizeUsd ?? 0;

  if (claimed > 0 && cash === 0 && credits === 0 && total === 0 && !h.claimedPrize) {
    out.claimsWithoutAmounts.push({ slug: h.slug, title: (h.name ?? "").slice(0, 70), claimed });
  }
  if (total > 0 && cash + credits > total && h.prizeBreakdownPublished) {
    out.inconsistentPoolTotals.push({
      slug: h.slug,
      note: "published cash+credits exceed the pool total",
      claimed,
      total,
      cash,
      credits,
      breakdown: h.prizeBreakdownPublished,
    });
  }

  const org = ((h.organizer ?? "") || "").trim();
  if (
    !org ||
    /^(n\/?a|unknown|tbd|pending|independent)$/i.test(org) ||
    org.length > 40 ||
    org !== org.replace(/\s+/g, " ")
  ) {
    out.dirtyOrganizers.push({ slug: h.slug, organizer: org });
  }

  const s = h.startDate ? Date.parse(h.startDate + "T00:00:00Z") : NaN;
  const e = h.endDate ? Date.parse(h.endDate + "T23:59:59Z") : NaN;
  if (!Number.isNaN(s) && !Number.isNaN(e) && e < s) {
    out.dateAnomalies.push({ slug: h.slug, start: h.startDate, end: h.endDate });
  }
  if (!h.endDate) out.noEndDate.push({ slug: h.slug, start: h.startDate, status });

  if (status === "past") out.winnerCoverage.past += 1;
  const winners = h.winners ?? [];
  if (winners.length) {
    out.winnerCoverage.eventsWithWinners += 1;
    out.winnerCoverage.totalWinners += winners.length;
  }
  for (const w of winners) {
    if (w.rank != null && (!Number.isInteger(w.rank) || w.rank < 1)) {
      out.brokenWinners.push({ slug: h.slug, project: w.project, rank: w.rank });
    }
  }
  if (!h.description || h.description.length < 120) {
    out.thinDescriptions.push({ slug: h.slug, len: (h.description ?? "").length });
  }
}

out.curatedSlugs = [...curated.matchAll(/slug:\s*"([^"]+)"/g)].map((m) => m[1]);
// Hand-checked winners live in curated.ts and are merged at read time, so the
// stored dataset never carries them. Report them alongside stored coverage.
out.curatedWinners = {
  events: out.curatedSlugs.length,
  total: (curated.match(/^\s*project:\s*"/gm) ?? []).length,
  withSummary: (curated.match(/^\s*summary:\s*"/gm) ?? []).length,
  storedEvents: out.winnerCoverage.eventsWithWinners,
};
console.log(JSON.stringify(out, null, 1));