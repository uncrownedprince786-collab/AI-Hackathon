// Data quality audit. Usage: node scripts/audit-data.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const data = JSON.parse(readFileSync(join(root, "src/data/hackathons.json"), "utf8"));
const curated = readFileSync(join(root, "src/data/curated.ts"), "utf8");
const records = data.hackathons ?? data;
const now = new Date("2026-10-05T00:00:00Z");

const statusOf = (h) => {
  const start = (h.startDate ?? h.start_date ?? "") ? Date.parse((h.startDate ?? h.start_date ?? "") + "T00:00:00Z") : NaN;
  const end = (h.endDate ?? h.end_date ?? "") ? Date.parse((h.endDate ?? h.end_date ?? "") + "T23:59:59Z") : NaN;
  if (Number.isNaN(start)) return "unknown";
  if (!Number.isNaN(end) && now > end) return "past";
  if (now < start) return "upcoming";
  return "ongoing";
};

const money = (s) => (s || "").replace(/,/g, "").match(/\$\s?(\d+(?:\.\d+)?)/g) || [];
const maxMoney = (s) => Math.max(0, ...money(s).map((m) => Number(m.replace(/[^0-9.]/g, ""))));

const out = { total: records.length, counts: {}, noCashButClaimsMoney: [], dirtyOrganizers: [], dateAnomalies: [], noEndDate: [], winnerCoverage: { withWinners: 0, past: 0 }, thinDescriptions: [], prizeTextSamples: [] };

for (const h of records) {
  const status = statusOf(h);
  out.counts[status] = (out.counts[status] || 0) + 1;

  const claimed = Math.max(maxMoney((h.name ?? h.title ?? "")), maxMoney((h.description ?? "")), maxMoney((h.prizes || []).map((p) => `${p.amount ?? ""} ${p.label ?? ""}`).join(" ")));
  const cash = h.prizePool?.cashUsd ?? 0;
  if (!cash && claimed > 0) out.noCashButClaimsMoney.push({ slug: (h.slug ?? ""), claimed, title: (h.name ?? h.title ?? "").slice(0, 80), organizer: (h.organizer ?? ""), prizes: (h.prizes || []).length });

  const org = ((h.organizer ?? "") || "").trim();
  if (!org || /nill|prize|hackathon|202\d|^\W+$/i.test(org) || org.length > 40 || org !== org.replace(/\s+/g, " ")) {
    out.dirtyOrganizers.push({ slug: (h.slug ?? ""), organizer: org });
  }

  const s = (h.startDate ?? h.start_date ?? "") ? Date.parse((h.startDate ?? h.start_date ?? "") + "T00:00:00Z") : NaN;
  const e = (h.endDate ?? h.end_date ?? "") ? Date.parse((h.endDate ?? h.end_date ?? "") + "T23:59:59Z") : NaN;
  if (!Number.isNaN(s) && !Number.isNaN(e) && e < s) out.dateAnomalies.push({ slug: (h.slug ?? ""), start: (h.startDate ?? h.start_date ?? ""), end: (h.endDate ?? h.end_date ?? "") });
  if (!(h.endDate ?? h.end_date ?? "")) out.noEndDate.push({ slug: (h.slug ?? ""), start: (h.startDate ?? h.start_date ?? ""), status });

  if (status === "past") {
    out.winnerCoverage.past += 1;
    if ((h.winners || []).length) out.winnerCoverage.withWinners += 1;
  }
  if (!(h.description ?? "") || (h.description ?? "").length < 120) out.thinDescriptions.push({ slug: (h.slug ?? ""), len: ((h.description ?? "") || "").length });
}

out.curatedSlugs = [...curated.matchAll(/slug:\s*"([^"]+)"/g)].map((m) => m[1]);
console.log(JSON.stringify(out, null, 1));

