import { NextResponse } from "next/server";
import { readDataset } from "@/lib/store";
import { mergedDataset } from "@/lib/dataset";
import { computeStats } from "@/lib/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Lightweight public health report: the last successful refresh, current
 * canonical counts, and per-source outcome timestamps so a failed or stale
 * collection is visible. Read-only — it never writes anything and exposes no
 * secrets.
 */
export async function GET() {
  const dataset = await readDataset();
  const hackathons = mergedDataset(dataset.hackathons ?? [], new Date());
  const stats = computeStats(hackathons);
  const now = Date.now();

  const sources = (dataset.meta.sources ?? []).map((s) => ({
    name: s.name,
    ok: s.ok,
    fetched: s.fetched,
    lastOkAt: s.lastOkAt ?? null,
    staleMs: s.lastOkAt ? Math.max(0, now - Date.parse(s.lastOkAt)) : null,
    error: s.error ?? null,
  }));

  // Live table sources (Devpost + lablab) are refreshed every 6 hours; anything
  // older than 9 hours means the scheduled refresh is failing.
  const live = sources.filter((s) => ["Devpost", "lablab.ai"].includes(s.name));
  const healthy = live.length > 0 && live.every((s) => s.ok && s.staleMs !== null && s.staleMs < 9 * 3600 * 1000);

  return NextResponse.json({
    lastUpdated: dataset.meta.lastUpdated,
    total: stats.total,
    counts: { upcoming: stats.upcoming, ongoing: stats.ongoing, past: stats.past },
    sources,
    healthy,
  });
}