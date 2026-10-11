import type { Hackathon, HackathonMode } from "./types";
import { hasPublishedPrize } from "./format";

export interface Stats {
  total: number;
  upcoming: number;
  ongoing: number;
  past: number;
  totalPrizeUsd: number;
  cashPrizeUsd: number;
  creditPrizeUsd: number;
  /** Headline pools with no published cash/credits breakdown. */
  announcedPrizeUsd: number;
  announcedPoolCount: number;
  /** Pools announced in another currency (never converted to USD). */
  nonUsdAnnounced: number;
  /** Records with no prize information at all. */
  noPrizeInfo: number;
  withWinners: number;
  totalWinners: number;
  online: number;
  inPerson: number;
  hybrid: number;
  uniqueOrganizers: number;
  totalParticipants: number;
  biggest: Hackathon[];
  topOrganizers: { name: string; count: number }[];
  byYear: { year: number; count: number; prizeUsd: number }[];
  upcomingPrizesUsd: number;
}

/**
 * One canonical aggregation over a list of hackathons. Every page, script and
 * test that reports totals goes through this function so numbers never drift
 * between the hero, the directory and the audit tooling.
 */
export function computeStats(all: Hackathon[]): Stats {
  const organizers = new Map<string, number>();
  const byYearMap = new Map<number, { count: number; prizeUsd: number }>();
  let totalPrizeUsd = 0;
  let cashPrizeUsd = 0;
  let creditPrizeUsd = 0;
  let announcedPrizeUsd = 0;
  let announcedPoolCount = 0;
  let nonUsdAnnounced = 0;
  let noPrizeInfo = 0;
  let withWinners = 0;
  let totalWinners = 0;
  let online = 0;
  let inPerson = 0;
  let hybrid = 0;
  let totalParticipants = 0;

  for (const h of all) {
    const pooled = h.totalPrizeUsd ?? 0;
    const cash = h.cashPrizeUsd ?? 0;
    const credits = h.creditPrizeUsd ?? 0;
    totalPrizeUsd += pooled;
    cashPrizeUsd += cash;
    creditPrizeUsd += credits;

    const itemised = cash > 0 || credits > 0;
    if ((h.claimedPrizeUsd ?? 0) > 0 && !itemised && !h.prizeBreakdownPublished) {
      announcedPrizeUsd += pooled;
      announcedPoolCount += 1;
    } else if (h.claimedPrize && pooled === 0) {
      nonUsdAnnounced += 1;
    } else if (!pooled && !h.claimedPrize && h.prizes.length === 0) {
      noPrizeInfo += 1;
    }

    totalParticipants += h.participants ?? 0;
    if (h.winners.length > 0) {
      withWinners += 1;
      totalWinners += h.winners.length;
    }
    const mode: HackathonMode = h.mode;
    if (mode === "online") online += 1;
    else if (mode === "in-person") inPerson += 1;
    else hybrid += 1;

    const org = h.organizer || "Unknown";
    organizers.set(org, (organizers.get(org) ?? 0) + 1);

    const year = Number(h.endDate.slice(0, 4));
    const entry = byYearMap.get(year) ?? { count: 0, prizeUsd: 0 };
    entry.count += 1;
    entry.prizeUsd += h.totalPrizeUsd ?? 0;
    byYearMap.set(year, entry);
  }

  const topOrganizers = [...organizers.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  const accountedTotal = cashPrizeUsd + creditPrizeUsd + announcedPrizeUsd;
  return {
    total: all.length,
    upcoming: all.filter((h) => h.status === "upcoming").length,
    ongoing: all.filter((h) => h.status === "ongoing").length,
    past: all.filter((h) => h.status === "past").length,
    totalPrizeUsd: accountedTotal,
    cashPrizeUsd,
    creditPrizeUsd,
    announcedPrizeUsd,
    announcedPoolCount,
    nonUsdAnnounced,
    noPrizeInfo,
    withWinners,
    totalWinners,
    online,
    inPerson,
    hybrid,
    uniqueOrganizers: organizers.size,
    totalParticipants,
    biggest: [...all].sort((a, b) => b.totalPrizeUsd - a.totalPrizeUsd).slice(0, 10),
    topOrganizers,
    byYear: [...byYearMap.entries()]
      .map(([year, v]) => ({ year, ...v }))
      .sort((a, b) => a.year - b.year),
    upcomingPrizesUsd: all
      .filter((h) => h.status !== "past")
      .reduce((sum, h) => sum + (h.totalPrizeUsd ?? 0), 0),
  };
}

/** Same relevance ordering the directory uses (stable across stats and lists). */
const STATUS_WEIGHT: Record<string, number> = {
  ongoing: 0,
  upcoming: 1,
  past: 2,
};

export function byRelevance(a: Hackathon, b: Hackathon): number {
  if (a.status !== b.status) return STATUS_WEIGHT[a.status] - STATUS_WEIGHT[b.status];
  const prize = Number(hasPublishedPrize(b)) - Number(hasPublishedPrize(a));
  if (prize !== 0) return prize;
  if (a.status === "past") {
    return b.endDate.localeCompare(a.endDate);
  }
  if (a.startDate !== b.startDate) return a.startDate.localeCompare(b.startDate);
  return b.totalPrizeUsd - a.totalPrizeUsd;
}