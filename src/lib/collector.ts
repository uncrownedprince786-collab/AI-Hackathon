import {
  fetchDevpostDetail,
  fetchDevpostList,
  listItemToHackathon,
  statusFor,
  type DevpostListItem,
} from "./sources/devpost";
import { isAiRelevant } from "./sources/ai-signals";
import { fetchLablabEvent, fetchLablabIndex } from "./sources/lablab";
import type {
  Dataset,
  Hackathon,
  HackathonStatus,
  SourceStatus,
  Winner,
} from "./types";
import { CACHE_TAG, hasSupabase, readDataset, writeDataset, type StorageTarget } from "./store";

export interface CollectOptions {
  /** Listing pages per status. */
  pages?: number;
  /** Hackathon detail pages to enrich. */
  detailLimit?: number;
  concurrency?: number;
  /** Which public sources to read. Defaults to all of them. */
  sources?: ("devpost" | "lablab")[];
  /** Re-read every Devpost detail page, even ones already enriched. */
  forceDetail?: boolean;
  now?: Date;
  signal?: AbortSignal;
}

export interface CollectResult {
  dataset: Dataset;
  writtenTo: StorageTarget;
  added: number;
  updated: number;
  removed: number;
}

const LOG = (...args: unknown[]) =>
  console.log(`[collect ${new Date().toISOString()}]`, ...args);

function normalizeDates(h: Hackathon, now: Date): void {
  const status = statusFor(h.startDate, h.endDate, now);
  h.status = status;
  if (!h.registrationDeadline) h.registrationDeadline = h.endDate;
}

function sumPrizes(h: Hackathon): void {
  let cash = 0;
  let credits = 0;
  let other = 0;
  for (const p of h.prizes) {
    if (p.type === "cash") cash += p.amount;
    else if (p.type === "credits") credits += p.amount;
    else other += p.amount;
  }
  h.cashPrizeUsd = cash;
  h.creditPrizeUsd = credits;
  h.totalPrizeUsd = cash + credits + other;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  });

  await Promise.all(runners);
  return results;
}

async function enrich(
  base: Hackathon,
  signal?: AbortSignal,
): Promise<Hackathon> {
  try {
    const detail = await fetchDevpostDetail(base.officialUrl, signal);
    const prizes = detail.prizes.length ? detail.prizes : base.prizes;

    const merged: Hackathon = {
      ...base,
      description: detail.description || base.description,
      // The listing API carries a reliable globe/pin icon, so only upgrade the
      // mode when the detail page actually says the event is hybrid.
      mode: detail.mode === "hybrid" ? "hybrid" : base.mode,
      location: detail.location ?? base.location,
      organizer: detail.organizer || base.organizer,
      participants: detail.participants ?? base.participants,
      submissions: detail.submissions ?? base.submissions,
      invitedOnly: detail.invitedOnly || base.invitedOnly,
      tags: detail.description
        ? base.tags
        : [...new Set([...base.tags, ...inferTags(detail.description)])],
      prizes,
      winners: dedupeWinners([...(base.winners ?? []), ...(detail.winners ?? [])]),
    };

    if (
      !isAiRelevant({
        title: merged.name,
        description: detail.description,
        themes: merged.tags.map((t) => ({ id: -1, name: t })),
      })
    ) {
      return { ...merged, description: merged.description || base.description };
    }

    sumPrizes(merged);
    return merged;
  } catch (error) {
    console.error(`[collect] detail failed ${base.officialUrl}`, (error as Error).message);
    sumPrizes(base);
    return base;
  }
}

function inferTags(text: string): string[] {
  const found: string[] = [];
  const map: [RegExp, string][] = [
    [/\bllm|large language model/i, "LLM"],
    [/\bagent(ic|s)?\b/i, "AI Agents"],
    [/\bgenerative|genai|gen ai\b/i, "Generative AI"],
    [/\bmachine learning\b/i, "Machine Learning"],
    [/\bdeep learning|neural\b/i, "Deep Learning"],
    [/\bcomputer vision|image generation\b/i, "Computer Vision"],
    [/\bnlp|natural language/i, "NLP"],
    [/\bopenai|gpt-?4|gpt-?5\b/i, "OpenAI"],
    [/\bcloud|aws|azure|gcp\b/i, "Cloud"],
    [/robo|autonomous|drone/i, "Robotics"],
  ];
  for (const [re, tag] of map) if (re.test(text)) found.push(tag);
  return found.slice(0, 5);
}

function dedupeWinners(winners: Winner[]): Winner[] {
  const seen = new Set<string>();
  const out: Winner[] = [];
  for (const w of winners) {
    const key = `${w.project.toLowerCase()}|${w.team?.join(",") ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(w);
  }
  return out.slice(0, 25);
}

export async function collectDataset(
  options: CollectOptions = {},
): Promise<CollectResult> {
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();
  const pages = options.pages ?? 4;
  const detailLimit = options.detailLimit ?? 120;
  const concurrency = options.concurrency ?? 6;

  const previous = await readDataset();
  const previousById = new Map(previous.hackathons.map((h) => [h.id, h]));
  const sources: SourceStatus[] = [];
  const enabled = new Set(options.sources ?? ["devpost", "lablab"]);
  const seenIds = new Set<string>();
  const drafts: Hackathon[] = [];

  if (enabled.has("devpost")) {
    LOG(`fetching devpost listings (${pages} pages/status)...`);
    const lists = await Promise.all([
      fetchDevpostList("open", { pages, signal: options.signal }),
      fetchDevpostList("upcoming", { pages, signal: options.signal }),
      fetchDevpostList("ended", { pages: Math.max(pages, 6), signal: options.signal }),
    ]);
    const [open, upcoming, ended] = lists;
    const allItems: DevpostListItem[] = [...open, ...upcoming, ...ended];

    for (const item of allItems) {
      const draft = listItemToHackathon(item, now);
      if (!draft) continue;
      if (seenIds.has(draft.id)) continue;
      seenIds.add(draft.id);
      drafts.push(draft);
    }

    sources.push({
      name: "Devpost",
      url: "https://devpost.com/hackathons",
      ok: drafts.length > 0,
      fetched: drafts.length,
    });

    LOG(`devpost ai drafts: ${drafts.length}`);
  }

  // lablab.ai publishes schema.org Event data for every AI hackathon it hosts.
  let lablabCount = 0;
  if (enabled.has("lablab")) {
    try {
      const index = await fetchLablabIndex(options.signal);
      LOG(`lablab index: ${index.length} events`);
      const lablabDrafts: Hackathon[] = [];
      await mapWithConcurrency(index, Math.min(concurrency, 4), async (item, i) => {
        if (i % 20 === 0) LOG(`  lablab ${i}/${index.length}`);
        try {
          const event = await fetchLablabEvent(item, now, options.signal);
          if (event) lablabDrafts.push(event);
        } catch (error) {
          console.error(`[collect] lablab failed ${item.url}`, (error as Error).message);
        }
      });
      for (const event of lablabDrafts) {
        if (seenIds.has(event.id)) continue;
        seenIds.add(event.id);
        drafts.push(event);
      }
      lablabCount = lablabDrafts.length;
      sources.push({
        name: "lablab.ai",
        url: "https://lablab.ai/ai-hackathons",
        ok: true,
        fetched: lablabCount,
      });
    } catch (error) {
      sources.push({
        name: "lablab.ai",
        url: "https://lablab.ai/ai-hackathons",
        ok: false,
        fetched: 0,
        error: (error as Error).message,
      });
    }
  }

  LOG(`total drafts: ${drafts.length}`);

  // Preserve hand-checked data and skip re-fetching pages we already enriched.
  const needsDetail = drafts.filter((d) => {
    if (d.sourceName !== "Devpost") return false;
    if (options.forceDetail) return true;
    const prev = previousById.get(d.id);
    if (!prev) return true;
    if (prev.status !== d.status) return true;
    if (!prev.description || prev.description.length < 120) return true;
    return false;
  });

  // Ongoing and upcoming entries move fastest, so enrich them first.
  needsDetail.sort((a, b) => {
    const rank = { ongoing: 0, upcoming: 1, past: 2 } as const;
    if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
    return b.totalPrizeUsd - a.totalPrizeUsd;
  });

  const toEnrich = needsDetail.slice(0, detailLimit);
  LOG(`enriching ${toEnrich.length} of ${needsDetail.length} needing detail...`);

  const enriched = new Map<string, Hackathon>();
  await mapWithConcurrency(toEnrich, concurrency, async (draft) => {
    const result = await enrich(draft, options.signal);
    enriched.set(draft.id, result);
  });

  const merged: Hackathon[] = drafts.map((draft) => {
    const prev = previousById.get(draft.id);
    const wasEnriched = enriched.has(draft.id);
    const fresh = enriched.get(draft.id) ?? draft;

    if (!prev) {
      fresh.updatedAt = nowIso;
      normalizeDates(fresh, now);
      sumPrizes(fresh);
      return fresh;
    }

    // Listing pages carry thinner data than detail pages, so an un-enriched draft
    // must never overwrite what we already read from the detail page.
    const base: Hackathon = {
      ...prev,
      ...fresh,
      description:
        (fresh.description?.length ?? 0) > (prev.description?.length ?? 0)
          ? fresh.description
          : prev.description,
      location: fresh.location ?? prev.location,
      organizer: fresh.organizer || prev.organizer,
      participants: fresh.participants ?? prev.participants,
      submissions: fresh.submissions ?? prev.submissions,
      registrationDeadline: fresh.registrationDeadline ?? prev.registrationDeadline,
      tags: [...new Set([...prev.tags, ...fresh.tags])].slice(0, 8),
      prizes: wasEnriched
        ? fresh.prizes.length
          ? fresh.prizes
          : prev.prizes
        : prev.prizes.length
          ? prev.prizes
          : fresh.prizes,
      winners: prev.winners.length ? prev.winners : fresh.winners,
      firstSeenAt: prev.firstSeenAt ?? fresh.firstSeenAt,
    };

    base.updatedAt = nowIso;
    normalizeDates(base, now);
    sumPrizes(base);
    return base;
  });

  // Keep curated/past entries that the listing no longer returns.
  const liveIds = new Set(merged.map((h) => h.id));
  const retained = previous.hackathons.filter((h) => {
    if (liveIds.has(h.id)) return false;
    if (!h.sourceName || h.sourceName === "Curated") return true;
    if (h.status === "past") return true;
    return false;
  });

  const all = [...merged, ...retained];
  const counts: Record<HackathonStatus, number> = { upcoming: 0, ongoing: 0, past: 0 };
  let totalPrizeUsd = 0;
  for (const h of all) {
    counts[h.status] += 1;
    totalPrizeUsd += h.totalPrizeUsd ?? 0;
  }

  const dataset: Dataset = {
    meta: {
      ...previous.meta,
      lastUpdated: nowIso,
      cronSchedule: "0 */6 * * *",
      total: all.length,
      counts,
      totalPrizeUsd,
      sources,
    },
    hackathons: all,
  };

  const added = merged.filter((h) => !previousById.has(h.id)).length;
  const updated = merged.length - added;
  // Anything from the previous run that is neither live nor retained is dropped.
  const keptIds = new Set(all.map((h) => h.id));
  const removed = previous.hackathons.filter((h) => !keptIds.has(h.id)).length;

  return {
    dataset,
    writtenTo: "json",
    added,
    updated,
    removed,
  };
}

export async function refreshDataset(
  options: CollectOptions = {},
): Promise<CollectResult> {
  const result = await collectDataset(options);
  result.writtenTo = await writeDataset(result.dataset);
if (result.writtenTo === "none") {
  LOG("no writable store: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to persist this refresh");
}
  LOG(
    `saved ${result.dataset.hackathons.length} hackathons to ${result.writtenTo} (+${result.added} new, ${result.updated} updated)`,
  );
  return result;
}

export function revalidationTags(): string[] {
  return [CACHE_TAG];
}

export function storageMode(): string {
  return hasSupabase() ? "supabase" : "json";
}
