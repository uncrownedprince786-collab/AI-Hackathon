import { NextResponse } from "next/server";
import { readDataset } from "@/lib/store";
import { mergedDataset } from "@/lib/dataset";
import { computeStats } from "@/lib/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Read-only public health report. It separates the two things people actually
 * ask about:
 *
 *   service  — is the dataset intact and computing (the app itself);
 *   coverage — is every ACTIVE source (Devpost, lablab.ai) fresh on schedule.
 *
 * Sources that were retired from the schedule are listed separately under
 * `retiredSources` and never count against coverage, so a historical source
 * can never read as "active but silently stale". The endpoint never writes and
 * exposes no secrets.
 */
export async function GET() {
  let dataset;
  try {
    dataset = await readDataset();
  } catch (error) {
    return NextResponse.json(
      {
        service: { ok: false, status: "error", error: (error as Error).message },
        healthy: false,
      },
      { status: 503 },
    );
  }

  const merged = mergedDataset(dataset.hackathons ?? [], new Date());
  const stats = computeStats(merged);
  const now = Date.now();

  const FRESH_WINDOW_MS = 9 * 3600 * 1000; // 6-hour schedule + 3-hour runway

  const coverageSources = (dataset.meta.sources ?? []).map((s) => {
    const staleMs = s.lastOkAt ? Math.max(0, now - Date.parse(s.lastOkAt)) : null;
    const status = s.ok && staleMs !== null && staleMs < FRESH_WINDOW_MS
      ? "ok"
      : s.lastOkAt
        ? "stale"
        : "down";
    return {
      name: s.name,
      url: s.url,
      ok: s.ok,
      fetched: s.fetched,
      lastOkAt: s.lastOkAt ?? null,
      staleMs,
      status,
      error: s.error ?? null,
    };
  });

  const coverageStatus =
    coverageSources.length === 0
      ? "down"
      : coverageSources.every((s) => s.status === "ok")
        ? "ok"
        : "stale";

  const retiredSources = (dataset.meta.retiredSources ?? []).map((s) => ({
    name: s.name,
    url: s.url ?? null,
    fetched: s.fetched,
    lastOkAt: s.lastOkAt ?? null,
    lastCollectedAt: s.lastCollectedAt ?? null,
    retiredAt: s.retiredAt,
    reason: s.reason ?? null,
    error: s.error ?? null,
  }));

  // `healthy` is an alias kept for backward compatibility: the service is up
  // AND every active source is fresh.
  const healthy = coverageStatus === "ok";

  return NextResponse.json({
    service: {
      ok: true,
      status: "ok",
      lastUpdated: dataset.meta.lastUpdated,
      total: stats.total,
      counts: { upcoming: stats.upcoming, ongoing: stats.ongoing, past: stats.past },
    },
    coverage: {
      status: coverageStatus,
      schedule: dataset.meta.cronSchedule,
      requiredSources: coverageSources.map((s) => s.name),
      freshWindowHours: FRESH_WINDOW_MS / 3600000,
      sources: coverageSources,
    },
    retiredSources,
    healthy,
  });
}