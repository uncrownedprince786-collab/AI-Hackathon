import { promises as fs } from "node:fs";
import path from "node:path";
import { mergedDataset } from "../src/lib/dataset";
import { computeStats } from "../src/lib/stats";
import { statusFor } from "../src/lib/sources/devpost";
import { curatedHackathons } from "../src/data/curated";
import type { Hackathon } from "../src/lib/types";

/**
 * Read-only production integrity audit. Recomputes every headline number from
 * the committed dataset + curated records using the SAME merge and stats code
 * the frontend runs, then reports status disagreements, source honesty
 * problems, prize accounting, duplicates and date anomalies.
 *
 * Usage: npm run refresh:data -- --audit-only  (or)
 *        npx tsx scripts/probe-integrity.ts
 */
async function main() {
  const file = path.join(process.cwd(), "src", "data", "hackathons.json");
  const dataset = JSON.parse(await fs.readFile(file, "utf8")) as {
    meta: Record<string, unknown> & {
      lastUpdated: string;
      counts: Record<string, number>;
      totalPrizeUsd: number;
      sources: {
        name: string;
        url: string;
        ok: boolean;
        fetched: number;
        lastOkAt?: string;
        error?: string;
      }[];
      countries?: { country: string; count: number }[];
    };
    hackathons: Hackathon[];
  };

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const stored = dataset.hackathons;
  const merged = mergedDataset(stored, now);
  const stats = computeStats(merged);

  const line = (label: string, value: unknown) =>
    console.log(`  ${label.padEnd(30)} ${String(value)}`);

  console.log(`\n=== RECONCILED INTEGRITY AUDIT @ ${now.toISOString()} (today=${today}) ===`);

  console.log("\n-- dataset file");
  line("stored records", stored.length);
  line("stored lastUpdated", dataset.meta.lastUpdated);
  line("stored counts", JSON.stringify(dataset.meta.counts));
  line("stored totalPrizeUsd", dataset.meta.totalPrizeUsd);

  console.log("\n-- canonical numbers (merged, statuses re-derived now)");
  line("total", stats.total);
  line("upcoming", stats.upcoming);
  line("ongoing", stats.ongoing);
  line("past", stats.past);
  line("counts sum -> total", stats.upcoming + stats.ongoing + stats.past === stats.total);
  line("totalPrizeUsd", stats.totalPrizeUsd);
  line("cashPrizeUsd", stats.cashPrizeUsd);
  line("creditPrizeUsd", stats.creditPrizeUsd);
  line("announcedPrizeUsd", stats.announcedPrizeUsd);
  line("announcedPoolCount", stats.announcedPoolCount);
  line("nonUsdAnnounced", stats.nonUsdAnnounced);
  line("noPrizeInfo", stats.noPrizeInfo);
  line("withWinners", stats.withWinners);
  line("totalWinners", stats.totalWinners);
  line("online/inperson/hybrid", `${stats.online}/${stats.inPerson}/${stats.hybrid}`);
  line("uniqueOrganizers", stats.uniqueOrganizers);
  line("totalParticipants", stats.totalParticipants);
  line("upcomingPrizesUsd", stats.upcomingPrizesUsd);

  console.log("\n-- cash + credits + announced vs total");
  line(
    "cash+credits+announced",
    stats.cashPrizeUsd + stats.creditPrizeUsd + stats.announcedPrizeUsd,
  );
  line("gap (itemised 'other' + non-USD pools)", stats.totalPrizeUsd - (stats.cashPrizeUsd + stats.creditPrizeUsd + stats.announcedPrizeUsd));

  console.log("\n-- status disagreements (stored vs dates as of today)");
  const disagreements = merged.filter(
    (h) => h.status !== (stored.find((s) => s.id === h.id)?.status ?? h.status),
  );
  if (disagreements.length === 0) {
    console.log("  none — stored statuses match the canonical re-derivation");
  } else {
    for (const h of disagreements) {
      console.log(
        `  ${h.id.padEnd(28)} stored=${stored.find((s) => s.id === h.id)?.status} derived=${h.status} (${h.startDate} -> ${h.endDate}) ${h.name.slice(0, 40)}`,
      );
    }
  }

  // Boundary spot-checks on a fixed clock.
  console.log("\n-- status boundary behavior (canonical statusFor)");
  const atNoon = (d: string) => new Date(`${d}T12:00:00Z`);
  const caseDay = (day: Date) => day.toISOString().slice(0, 10);
  const cases: { label: string; start: string; end: string; now: Date; want: string }[] = [
    { label: "starts today is ongoing", start: today, end: "2026-10-20", now: atNoon(today), want: "ongoing" },
    { label: "ends today is ongoing", start: "2026-10-01", end: today, now: atNoon(today), want: "ongoing" },
    {
      label: "ended yesterday is past",
      start: "2026-10-01",
      end: caseDay(new Date(new Date(`${today}T12:00:00Z`).getTime() - 86400000)),
      now: atNoon(today),
      want: "past",
    },
    { label: "starts tomorrow is upcoming", start: "2026-10-20", end: "2026-10-21", now: atNoon(today), want: "upcoming" },
    { label: "spans a year boundary is ongoing", start: "2026-12-31", end: "2027-01-02", now: atNoon("2027-01-01"), want: "ongoing" },
    { label: "ended before NYE is past", start: "2026-12-30", end: "2026-12-31", now: atNoon("2027-01-01"), want: "past" },
    { label: "starts after NYE is upcoming", start: "2027-01-02", end: "2027-01-03", now: atNoon("2027-01-01"), want: "upcoming" },
    { label: "single-day event today is ongoing", start: today, end: today, now: atNoon(today), want: "ongoing" },
  ];
  for (const c of cases) {
    const got = statusFor(c.start, c.end, c.now);
    console.log(
      `  ${c.label.padEnd(34)} ${c.start}->${c.end} @${caseDay(c.now)} = ${got} ${got === c.want ? "(ok)" : `(EXPECTED ${c.want})`}`,
    );
  }

  console.log("\n-- curated/winners integrity");
  line("curated events", curatedHackathons.length);
  line("curated winners", curatedHackathons.reduce((n, c) => n + c.winners.length, 0));
  line(
    "curated winners with summary",
    curatedHackathons.reduce(
      (n, c) => n + c.winners.filter((w) => (w.summary ?? "").length >= 20).length,
      0,
    ),
  );
  const dupWinners = curatedHackathons
    .map((c) => {
      const seen = new Set<string>();
      const dupes = c.winners.filter((w) => {
        const key = w.project.toLowerCase();
        if (seen.has(key)) return true;
        seen.add(key);
        return false;
      });
      return dupes.length ? `${c.name}: ${dupes.map((d) => d.project).join(", ")}` : null;
    })
    .filter(Boolean);
  line("duplicate winners within event", dupWinners.length ? dupWinners.join(" | ") : "none");

  console.log("\n-- source honesty");
  const recordSources = new Map<string, number>();
  for (const h of stored) recordSources.set(h.sourceName, (recordSources.get(h.sourceName) ?? 0) + 1);
  const metaSources = new Map(dataset.meta.sources.map((s) => [s.name, s]));
  console.log("  record sourceName -> count (|| in meta):");
  for (const [name, count] of [...recordSources.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${name.padEnd(24)} ${count}   ${metaSources.has(name) ? "in meta" : "** MISSING FROM meta.sources **"}`);
  }
  const missingFromMeta = [...recordSources.keys()].filter((s) => !metaSources.has(s));
  if (missingFromMeta.length) console.log(`  DEFECT: records whose source is missing from meta.sources: ${missingFromMeta.join(", ")}`);
  for (const s of dataset.meta.sources) {
    if (!recordSources.has(s.name)) {
      if (s.ok) console.log(`  meta source "${s.name}" read data but every record was held/rejected by the accuracy gate (not a defect)`);
      else if (!s.lastOkAt) console.log(`  meta source "${s.name}" is dead: ok=false and never produced (lastOkAt missing)`);
    }
  }
  const noTimestamp = dataset.meta.sources.filter((s) => !("lastOkAt" in s) && recordSources.has(s.name));
  if (noTimestamp.length)
    console.log(`  DEFECT: sources with records but NO lastOkAt (stale-hiding): ${noTimestamp.map((s) => s.name).join(", ")}`);
  console.log("  per-source lastOkAt:");
  for (const s of dataset.meta.sources) console.log(`    ${s.name.padEnd(24)} ok=${s.ok} fetched=${s.fetched} lastOkAt=${s.lastOkAt ?? "none"}`);

  console.log("\n-- URL checks");
  const equalUrls = stored.filter((h) => h.officialUrl === h.sourceUrl).length;
  line("officialUrl === sourceUrl", equalUrls);
  line("missing officialUrl", stored.filter((h) => !h.officialUrl).length);
  line(
    "http (not https) officialUrl",
    stored.filter((h) => h.officialUrl && !h.officialUrl.startsWith("https://")).length,
  );

  console.log("\n-- duplication");
  const bySlug = new Map<string, string[]>();
  for (const h of stored) bySlug.set(h.slug, [...(bySlug.get(h.slug) ?? []), h.id]);
  const dupSlugs = [...bySlug.entries()].filter(([, ids]) => ids.length > 1);
  line("duplicate slugs", dupSlugs.length ? dupSlugs.map(([s, i]) => `${s} (${i.join("/")})`).join(", ") : "none");

  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const byName = new Map<string, string[]>();
  for (const h of stored) byName.set(norm(h.name), [...(byName.get(norm(h.name)) ?? []), h.id]);
  const dupNames = [...byName.entries()].filter(([, ids]) => ids.length > 1);
  line("duplicate names", dupNames.length);
  for (const [name, ids] of dupNames.slice(0, 10)) console.log(`    ${name.slice(0, 50)} -> ${ids.join(", ")}`);

  console.log("\n-- date anomalies");
  const bad = stored.filter(
    (h) =>
      !h.startDate ||
      !h.endDate ||
      !/^\d{4}-\d{2}-\d{2}$/.test(h.startDate) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(h.endDate) ||
      h.startDate > h.endDate,
  );
  line("invalid/missing/reversed dates", bad.length);
  for (const h of bad.slice(0, 10)) console.log(`    ${h.id} ${h.startDate} -> ${h.endDate}`);

  console.log("\n-- record completeness (top issues only)");
  line("no organizers", stored.filter((h) => !(h.organizer ?? "").trim()).length);
  line("no country", stored.filter((h) => !h.country).length);
  line("no prizes at all", stored.filter((h) => h.prizes.length === 0 && !h.claimedPrize && !h.totalPrizeUsd).length);
  line("prize total 0 but crash/no info", stats.noPrizeInfo);

  console.log("\n=== DONE ===");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});