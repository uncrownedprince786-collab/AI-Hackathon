import { curatedHackathons } from "@/data/curated";
import { cleanWinners } from "./winners";
import { statusFor } from "./sources/devpost";
import type { Hackathon } from "./types";

/**
 * One merge rule for the dataset: stored records + hand-checked curated
 * records, with every status re-derived from the organizer's own dates at the
 * given reference time. Both the app (withCurated) and the audit scripts run
 * the same function, so displayed numbers and reported numbers can never drift.
 */
export function mergedDataset(stored: Hackathon[], now: Date): Hackathon[] {
  const byId = new Map(stored.map((h) => [h.id, h]));
  const nowIso = now.toISOString();

  for (const entry of curatedHackathons) {
    const existing = byId.get(entry.id);
    if (!existing) {
      byId.set(entry.id, entry);
      continue;
    }
    byId.set(entry.id, {
      ...existing,
      // Hand-checked fields always win; scraped fields fill the gaps.
      description: entry.description || existing.description,
      organizer: entry.organizer || existing.organizer,
      prizes: entry.prizes.length ? entry.prizes : existing.prizes,
      winners: cleanWinners(entry.winners.length ? entry.winners : existing.winners),
      officialUrl: entry.officialUrl || existing.officialUrl,
      firstSeenAt: existing.firstSeenAt ?? entry.firstSeenAt,
      updatedAt: nowIso,
    });
  }

  return [...byId.values()].map((h) => ({
    ...h,
    status: statusFor(h.startDate, h.endDate, now),
  }));
}