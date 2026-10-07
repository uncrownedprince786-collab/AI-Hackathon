/**
 * Source registry.
 *
 * Every data source is an adapter. Adding a worldwide source later is a matter
 * of implementing `SourceAdapter` and registering it here — nothing in the
 * collector, engine or UI needs to change. There are no hard-coded geographic
 * limits: adapters are expected to return events from anywhere on Earth, and
 * the accuracy engine decides what ships.
 *
 * Pipeline: Source Registry → Adapter → Raw → Normalizer → AI relevance →
 * Evidence → Global dedupe → Accuracy engine → Published.
 */
import type { Hackathon, Winner } from "../types";
import { extractPrizeAnnouncement } from "./prize-extract";
import {
  fetchDevpostDetail,
  fetchDevpostList,
  listItemToHackathon,
  type DevpostListItem,
} from "./devpost";
import { fetchLablabEvent, fetchLablabIndex } from "./lablab";

export interface SourceContext {
  now: Date;
  signal?: AbortSignal;
  pages: number;
  concurrency: number;
}

export interface SourceAdapter {
  id: string;
  /** Display name used in the dataset meta and the UI. */
  name: string;
  homepage: string;
  /** Whether records from this source need an extra detail-page fetch. */
  requiresDetail: boolean;
  enabled(options: { sources?: string[] }): boolean;
  /** Fetches raw listings and normalises them into draft records. */
  fetch(ctx: SourceContext): Promise<{ records: Hackathon[]; fetched: number }>;
  /** Optional: deepen a record from its official page (Devpost detail pages). */
  enrich?(record: Hackathon, signal?: AbortSignal): Promise<Hackathon>;
}

const DEVPOST: SourceAdapter = {
  id: "devpost",
  name: "Devpost",
  homepage: "https://devpost.com/hackathons",
  requiresDetail: true,
  enabled: ({ sources }) => !sources || sources.includes("devpost"),
  async fetch({ now, signal, pages }) {
    const lists = await Promise.all([
      fetchDevpostList("open", { pages, signal }),
      fetchDevpostList("upcoming", { pages, signal }),
      fetchDevpostList("ended", { pages: Math.max(pages, 6), signal }),
    ]);
    const records: Hackathon[] = [];
    const seen = new Set<string>();
    for (const item of lists.flat() as DevpostListItem[]) {
      const draft = listItemToHackathon(item, now);
      if (!draft || seen.has(draft.id)) continue;
      seen.add(draft.id);
      records.push(draft);
    }
    return { records, fetched: records.length };
  },
  async enrich(record, signal) {
    const detail = await fetchDevpostDetail(record.officialUrl, signal);
    const prizes = detail.prizes.length ? detail.prizes : record.prizes;
    const merged: Hackathon = {
      ...record,
      description: detail.description || record.description,
      // The listing API carries a reliable globe/pin icon, so only upgrade the
      // mode when the detail page actually says the event is hybrid.
      mode: detail.mode === "hybrid" ? "hybrid" : record.mode,
      location: detail.location ?? record.location,
      organizer: detail.organizer || record.organizer,
      participants: detail.participants ?? record.participants,
      submissions: detail.submissions ?? record.submissions,
      invitedOnly: detail.invitedOnly || record.invitedOnly,
      registrationStatus: detail.registrationStatus ?? record.registrationStatus,
      winnersAnnounced: detail.winners.length ? true : record.winnersAnnounced,
      officialUrl: detail.websiteUrl ?? record.officialUrl,
      sourceUrl: record.sourceUrl || record.officialUrl,
      tags: record.tags.length
        ? record.tags
        : [...new Set([...record.tags, ...detailTags(detail.description)])],
      prizes,
      winners: dedupeWinners([...(record.winners ?? []), ...(detail.winners ?? [])]).slice(0, 25),
    };

    // A headline figure anywhere in the organizer's own text ("$400,000 in
    // prizes" in the title, tagline, description or rules) counts even when the
    // prize table is missing. Non-USD pools are preserved, never converted.
    const announced = extractPrizeAnnouncement(merged.name, detail.tagline, detail.description);
    const claimed = Math.max(record.claimedPrizeUsd ?? 0, announced.usd ?? 0);
    merged.claimedPrizeUsd = claimed || undefined;
    if (announced.nonUsd && !merged.claimedPrize) {
      merged.claimedPrize = announced.nonUsd;
    }
    // A "$X cash + $Y credits" breakdown stated in prose becomes real itemised
    // prizes, so the pool is never mislabelled as pure cash.
    const hasCash = prizes.some((p) => p.type === "cash");
    if (announced.split && !hasCash) {
      merged.prizes = [
        ...prizes,
        {
          amount: announced.split.cash,
          currency: "USD",
          type: "cash",
          label: "Cash prizes",
        },
        {
          amount: announced.split.credits,
          currency: "USD",
          type: "credits",
          label: "Cloud/API credits",
        },
      ];
    }
    if (detail.hasPrizeBreakdown && hasCash) {
      merged.prizeBreakdownPublished = true;
    }
    if (announced.split && !hasCash) {
      merged.prizeBreakdownPublished = true;
    }
    return merged;
  },
};

function detailTags(text: string): string[] {
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
  const found: string[] = [];
  for (const [re, tag] of map) if (re.test(text)) found.push(tag);
  return found.slice(0, 5);
}

const LABLAB: SourceAdapter = {
  id: "lablab",
  name: "lablab.ai",
  homepage: "https://lablab.ai/ai-hackathons",
  requiresDetail: false,
  enabled: ({ sources }) => !sources || sources.includes("lablab"),
  async fetch({ now, signal, concurrency }) {
    const index = await fetchLablabIndex(signal);
    const records: Hackathon[] = [];
    await mapWithConcurrency(index, Math.min(concurrency, 4), async (item) => {
      const event = await fetchLablabEvent(item, now, signal);
      if (event) records.push(event);
    });
    return { records, fetched: records.length };
  },
};

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

/** A recommended event's winners, deduplicated by project URL (first wins). */
function dedupeWinners(list: { project: string; url?: string; prize?: string }[]): Winner[] {
  const seen = new Set<string>();
  const out: Winner[] = [];
  for (const w of list) {
    const key = w.url ?? `name:${w.project.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(w as Winner);
  }
  return out;
}

export const SOURCE_REGISTRY: SourceAdapter[] = [DEVPOST, LABLAB];

/** Looks up an adapter by its id; unknown sources are treated as inert. */
export function adapterForSourceId(id: string | undefined): SourceAdapter | undefined {
  return SOURCE_REGISTRY.find((a) => a.id === id);
}