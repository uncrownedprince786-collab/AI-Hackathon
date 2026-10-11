import "server-only";
import { unstable_cache } from "next/cache";
import type { Dataset, Hackathon, HackathonStatus } from "./types";
import { CACHE_TAG, readDataset } from "./store";
import { mergedDataset } from "./dataset";
import { byRelevance, computeStats, type Stats } from "./stats";

export const REVALIDATE_SECONDS = 60 * 60 * 1; // revalidate hourly for fresher statuses

export async function getDataset(): Promise<Dataset> {
  const stored = await readDataset();
  return withCurated(stored);
}

function withCurated(dataset: Dataset): Dataset {
  // Statuses are re-derived from the organizer's own dates at every read. An
  // event that ends this hour moves to "past" immediately, even if the dataset
  // file still carries the previous refresh's status — and a stopped refresh
  // can never freeze the whole list in one state.
  const hackathons = mergedDataset(dataset.hackathons ?? [], new Date());
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

export type { Stats } from "./stats";

export async function getStats(): Promise<Stats> {
  const all = await getAllHackathons();
  return computeStats(all);
}

export async function getLastUpdated(): Promise<string> {
  const { meta } = await getDataset();
  return meta.lastUpdated;
}

