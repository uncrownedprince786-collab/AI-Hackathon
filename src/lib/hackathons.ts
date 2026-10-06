import "server-only";
import { unstable_cache } from "next/cache";
import type {
  Dataset,
  Hackathon,
  HackathonMode,
  HackathonStatus,
} from "./types";
import { CACHE_TAG, readDataset } from "./store";
import { curatedHackathons } from "@/data/curated";

export const REVALIDATE_SECONDS = 60 * 60 * 6;

export const getDataset = unstable_cache(
  async (): Promise<Dataset> => {
    const stored = await readDataset();
    return withCurated(stored);
  },
  ["hackathon-dataset"],
  { revalidate: REVALIDATE_SECONDS, tags: [CACHE_TAG] },
);

function withCurated(dataset: Dataset): Dataset {
  const scraped = dataset.hackathons ?? [];
  const byId = new Map(scraped.map((h) => [h.id, h]));
  const nowIso = new Date().toISOString();

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
      winners: entry.winners.length ? entry.winners : existing.winners,
      officialUrl: entry.officialUrl || existing.officialUrl,
      firstSeenAt: existing.firstSeenAt ?? entry.firstSeenAt,
      updatedAt: nowIso,
    });
  }

  const hackathons = [...byId.values()];
  return { ...dataset, hackathons, meta: recalcMeta(dataset.meta, hackathons) };
}

function recalcMeta(
  meta: Dataset["meta"],
  hackathons: Hackathon[],
): Dataset["meta"] {
  const counts: Record<HackathonStatus, number> = { upcoming: 0, ongoing: 0, past: 0 };
  let totalPrizeUsd = 0;
  for (const h of hackathons) {
    counts[h.status] += 1;
    totalPrizeUsd += h.totalPrizeUsd ?? 0;
  }
  return { ...meta, total: hackathons.length, counts, totalPrizeUsd };
}

const STATUS_WEIGHT: Record<HackathonStatus, number> = {
  ongoing: 0,
  upcoming: 1,
  past: 2,
};

function byRelevance(a: Hackathon, b: Hackathon): number {
  if (a.status !== b.status) return STATUS_WEIGHT[a.status] - STATUS_WEIGHT[b.status];
  if (a.status === "past") {
    return b.endDate.localeCompare(a.endDate);
  }
  if (a.startDate !== b.startDate) return a.startDate.localeCompare(b.startDate);
  return b.totalPrizeUsd - a.totalPrizeUsd;
}

export async function getAllHackathons(): Promise<Hackathon[]> {
  const { hackathons } = await getDataset();
  return [...hackathons].sort(byRelevance);
}

export async function getByStatus(status: HackathonStatus): Promise<Hackathon[]> {
  const all = await getAllHackathons();
  return all.filter((h) => h.status === status);
}

export async function getFeatured(limit = 6): Promise<Hackathon[]> {
  const [ongoing, upcoming] = await Promise.all([
    getByStatus("ongoing"),
    getByStatus("upcoming"),
  ]);
  return [...ongoing, ...upcoming].slice(0, limit);
}

export async function getBySlug(slug: string): Promise<Hackathon | undefined> {
  const all = await getAllHackathons();
  return all.find((h) => h.slug === slug);
}

export async function getAllSlugs(): Promise<string[]> {
  const all = await getAllHackathons();
  return all.map((h) => h.slug);
}

export async function getRelated(hackathon: Hackathon, limit = 4): Promise<Hackathon[]> {
  const all = await getAllHackathons();
  const tags = new Set(hackathon.tags.map((t) => t.toLowerCase()));
  return all
    .filter((h) => h.id !== hackathon.id)
    .map((h) => {
      let score = 0;
      if (h.status === hackathon.status) score += 3;
      if (h.organizer.toLowerCase() === hackathon.organizer.toLowerCase()) score += 4;
      score += h.tags.filter((t) => tags.has(t.toLowerCase())).length * 2;
      if (h.mode === hackathon.mode) score += 1;
      return { h, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || byRelevance(a.h, b.h))
    .slice(0, limit)
    .map((x) => x.h);
}

export async function getWinners(): Promise<
  { hackathon: Hackathon; winner: Hackathon["winners"][number] }[]
> {
  const all = await getAllHackathons();
  const out: { hackathon: Hackathon; winner: Hackathon["winners"][number] }[] = [];
  for (const hackathon of all) {
    for (const winner of hackathon.winners) {
      out.push({ hackathon, winner });
    }
  }
  return out
    .sort((a, b) => b.hackathon.endDate.localeCompare(a.hackathon.endDate))
    .slice(0, 200);
}

export interface Stats {
  total: number;
  upcoming: number;
  ongoing: number;
  past: number;
  totalPrizeUsd: number;
  cashPrizeUsd: number;
  creditPrizeUsd: number;
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

export async function getStats(): Promise<Stats> {
  const all = await getAllHackathons();
  const organizers = new Map<string, number>();
  const byYearMap = new Map<number, { count: number; prizeUsd: number }>();
  let totalPrizeUsd = 0;
  let cashPrizeUsd = 0;
  let creditPrizeUsd = 0;
  let withWinners = 0;
  let totalWinners = 0;
  let online = 0;
  let inPerson = 0;
  let hybrid = 0;
  let totalParticipants = 0;

  for (const h of all) {
    totalPrizeUsd += h.totalPrizeUsd ?? 0;
    cashPrizeUsd += h.cashPrizeUsd ?? 0;
    creditPrizeUsd += h.creditPrizeUsd ?? 0;
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

  return {
    total: all.length,
    upcoming: all.filter((h) => h.status === "upcoming").length,
    ongoing: all.filter((h) => h.status === "ongoing").length,
    past: all.filter((h) => h.status === "past").length,
    totalPrizeUsd,
    cashPrizeUsd,
    creditPrizeUsd,
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

export async function getLastUpdated(): Promise<string> {
  const { meta } = await getDataset();
  return meta.lastUpdated;
}

