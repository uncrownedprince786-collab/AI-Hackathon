import {
  fetchDevpostDetail,
  fetchDevpostList,
  listItemToHackathon,
  statusFor,
  type DevpostListItem,
} from "./sources/devpost";
import { extractClaimedPool, isAiRelevant } from "./sources/ai-signals";
import { fetchLablabEvent, fetchLablabIndex } from "./sources/lablab";
import { llmConfig, reviewWithLlm } from "./sources/llm-review";
import { detectCountry, detectRegion } from "./geo";
import type {
  Dataset,
  DatasetMeta,
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
  /** Behind-the-scenes AI check, for logs and the stats page. */
  aiReview?: {
    provider: string;
    model: string;
    reviewed: number;
    rejected: number;
    fixed: number;
    dropped?: number;
  };
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

  // A prize list that only adds up to credits (API keys, cloud credits, sponsor
  // products) must not overwrite the pool the organizer announces. When the two
  // disagree we keep the announced figure and say the breakdown is not published.
  const itemised = cash + credits + other;
  const claimed = h.claimedPrizeUsd ?? 0;
  if (claimed > itemised) {
    h.prizeBreakdownPublished = itemised > 0 && cash > 0;
    h.totalPrizeUsd = claimed;
  } else {
    h.claimedPrizeUsd = claimed || undefined;
    h.prizeBreakdownPublished = cash > 0;
    h.totalPrizeUsd = itemised || claimed;
  }
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
      registrationStatus: detail.registrationStatus ?? base.registrationStatus,
      winnersAnnounced: detail.winners.length ? true : base.winnersAnnounced,
      officialUrl: detail.websiteUrl ?? base.officialUrl,
      sourceUrl: base.sourceUrl || base.officialUrl,
      tags: detail.description
        ? base.tags
        : [...new Set([...base.tags, ...inferTags(detail.description)])],
      prizes,
      winners: dedupeWinners([...(base.winners ?? []), ...(detail.winners ?? [])]),
    };

    // A headline figure in the title or description ("$400,000 in prizes") counts
    // even when the prize table is missing.
    const claimed = Math.max(
      base.claimedPrizeUsd ?? 0,
      extractClaimedPool(merged.name, detail.tagline, detail.description),
    );
    merged.claimedPrizeUsd = claimed || undefined;
    if (detail.hasPrizeBreakdown && prizes.some((p) => p.type === "cash")) {
      merged.prizeBreakdownPublished = true;
    }

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

/**
 * Some organizer pages publish almost no prose. Rather than leave a near-empty
 * page, we assemble a short factual summary from the fields we already have.
 * Nothing is invented: every sentence comes from collected data.
 */
function ensureDescription(h: Hackathon): string {
  const existing = (h.description ?? "").replace(/\s+/g, " ").trim();
  if (existing.length >= 160) return existing;

  const parts: string[] = [];
  parts.push(
    `${h.name} is an AI hackathon organised by ${h.organizer}, and it runs ${formatMode(h.mode)}.`,
  );

  if (h.tags.length) parts.push(`It focuses on ${listWords(h.tags.slice(0, 4))}.`);

  if (h.registrationStatus === "closed") {
    parts.push(
      `Registration is closed${h.endDate ? ` and submissions closed on ${h.endDate}` : ""}.`,
    );
  } else if (h.endDate) {
    parts.push(`Submissions are open until ${h.endDate}.`);
  }

  if (h.cashPrizeUsd > 0) {
    parts.push(`The prize pool includes ${usd(h.cashPrizeUsd)} in cash.`);
  } else if (h.claimedPrizeUsd) {
    parts.push(
      `The organiser announces a total prize pool of ${usd(h.claimedPrizeUsd)}, but does not publish a cash and credits breakdown.`,
    );
  } else if (h.creditPrizeUsd > 0) {
    parts.push(`Prizes are offered in credits rather than cash (${usd(h.creditPrizeUsd)}).`);
  } else {
    parts.push("No prize pool is published on the organiser page.");
  }

  if (h.participants) parts.push(`${h.participants.toLocaleString("en-US")} people have registered.`);

  const combined = existing ? `${existing} ${parts.join(" ")}` : parts.join(" ");
  return combined.slice(0, 600).trim();
}

function formatMode(mode: Hackathon["mode"]): string {
  if (mode === "online") return "fully online";
  if (mode === "hybrid") return "in person and online";
  return "in person";
}

function listWords(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function usd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function inferTags(text: string): string[] {  const found: string[] = [];
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
      fresh.description = ensureDescription(fresh);
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
      registrationStatus: fresh.registrationStatus ?? prev.registrationStatus,
      winnersAnnounced: fresh.winnersAnnounced || prev.winnersAnnounced,
      claimedPrizeUsd: Math.max(fresh.claimedPrizeUsd ?? 0, prev.claimedPrizeUsd ?? 0) || undefined,
      officialUrl: fresh.officialUrl || prev.officialUrl,
      sourceUrl: fresh.sourceUrl || prev.sourceUrl,
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
    base.description = ensureDescription(base);
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

  // Location text is what organizers publish, so the country is read from it.
  for (const h of all) {
    h.country = detectCountry(h.location) ?? h.country;
  }

  // Behind-the-scenes accuracy check. Skipped automatically when no free API key
  // is configured, so the refresh still works without it.
  const aiReview = await runAiReview(merged);
  const verified = aiReview ? all.filter((h) => aiReview.keep(h)) : all;
  const dropped = all.length - verified.length;
  if (aiReview?.summary) aiReview.summary.dropped = dropped;
  if (aiReview?.result) aiReview.result.dropped = dropped;
  if (dropped > 0) LOG(`ai review dropped ${dropped} record(s) that were not usable AI events`);

  const counts: Record<HackathonStatus, number> = { upcoming: 0, ongoing: 0, past: 0 };
  let totalPrizeUsd = 0;
  const countries = new Map<string, number>();
  for (const h of verified) {
    counts[h.status] += 1;
    totalPrizeUsd += h.totalPrizeUsd ?? 0;
    const country = h.country ?? detectCountry(h.location);
    if (country) countries.set(country, (countries.get(country) ?? 0) + 1);
  }

  const dataset: Dataset = {
    meta: {
      ...previous.meta,
      lastUpdated: nowIso,
      cronSchedule: "0 */6 * * *",
      total: verified.length,
      counts,
      totalPrizeUsd,
      countries: [...countries.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([country, count]) => ({ country, count })),
      regions: summariseRegions(verified),
      aiReview: aiReview?.summary,
      sources,
    },
    hackathons: verified,
  };

  const keptIds = new Set(verified.map((h) => h.id));
  const added = verified.filter((h) => !previousById.has(h.id)).length;
  const updated = verified.length - added;
  const removed = previous.hackathons.filter((h) => !keptIds.has(h.id)).length;

  return {
    dataset,
    writtenTo: "json",
    added,
    updated,
    removed,
    aiReview: aiReview?.result,
  };
}

/**
 * Runs the optional AI check over freshly collected records. Returns undefined
 * when no provider is configured so callers can tell "not configured" apart
 * from "configured and found nothing wrong".
 */
async function runAiReview(
  items: Hackathon[],
): Promise<
  | {
      keep: (h: Hackathon) => boolean;
      summary?: DatasetMeta["aiReview"];
      result?: CollectResult["aiReview"];
    }
  | undefined
> {
  const config = llmConfig();
  if (!config) {
    LOG("ai review skipped: set GROQ_API_KEY or GEMINI_API_KEY to enable it");
    return undefined;
  }

  const outcome = await reviewWithLlm(items, config);
  LOG(
    `ai review (${outcome.model ?? "unknown"}): ${outcome.reviewed} checked, ${outcome.rejected} rejected, ${outcome.fixed} corrected`,
  );
  if (outcome.error) LOG(`ai review warning: ${outcome.error}`);

  const verdicts = outcome.verdicts;
  return {
    keep: (h) => {
      const verdict = verdicts.get(h.id);
      // No verdict means the model did not return this row: keep the record.
      if (!verdict) return true;
      return verdict.isAi && verdict.complete;
    },
    summary:
      outcome.reviewed > 0
        ? {
            provider: outcome.provider ?? config.provider,
            model: outcome.model ?? config.model,
            at: new Date().toISOString(),
            reviewed: outcome.reviewed,
            rejected: outcome.rejected,
            fixed: outcome.fixed,
          }
        : undefined,
    result:
      outcome.reviewed > 0
        ? {
            provider: outcome.provider ?? config.provider,
            model: outcome.model ?? config.model,
            reviewed: outcome.reviewed,
            rejected: outcome.rejected,
            fixed: outcome.fixed,
          }
        : undefined,
  };
}

function summariseRegions(items: Hackathon[]): { region: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const h of items) {
    const region = detectRegion(h.location);
    if (region) counts.set(region, (counts.get(region) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([region, count]) => ({ region, count }));
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
