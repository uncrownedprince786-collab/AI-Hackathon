import {
  SOURCE_REGISTRY,
  adapterForSourceId,
} from "./sources/registry";
import { statusFor } from "./sources/devpost";
import { screenRecords } from "./sources/accuracy-engine";
import {
  applyWinnerSummaries,
  loadWebDrafts,
  loadWinnerSummaries,
  webDraftToHackathon,
} from "./web-scrape";
import { detectCountry, detectRegion } from "./geo";
import { cleanWinners } from "./winners";
import type { Dataset, Hackathon, HackathonStatus, SourceStatus } from "./types";
import { CACHE_TAG, hasSupabase, readDataset, writeDataset, type StorageTarget } from "./store";

export interface CollectOptions {
  /** Listing pages per status. */
  pages?: number;
  /** Hackathon detail pages to enrich. */
  detailLimit?: number;
  concurrency?: number;
  /** Which public sources to read. Defaults to all of them. */
  sources?: ("devpost" | "lablab")[];
  /** Fold the Puppeteer-collected drafts (web-drafts.json) through the engine. */
  useWeb?: boolean;
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
    // Non-USD prizes are preserved in the list but never added to USD totals:
    // converting them would be inventing a rate.
    const isUsd = !p.currency || p.currency.toUpperCase() === "USD";
    if (p.type === "cash") cash += isUsd ? p.amount : 0;
    else if (p.type === "credits") credits += isUsd ? p.amount : 0;
    else other += isUsd ? p.amount : 0;
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
  // A non-USD headline pool never feeds USD totals; keep it purely descriptive.
  if (h.claimedPrize) h.claimedPrizeUsd = undefined;
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

/**
 * Retention rule for records that did not reappear in this refresh's listings:
 * past events and curated/hand-checked entries are always kept; non-past
 * records from a source that ran successfully are treated as removed; non-past
 * records from a source that failed or returned nothing are preserved so a
 * transient outage never wipes data.
 */
export function selectRetained(
  previous: Hackathon[],
  liveIds: Set<string>,
  succeededSourceIds: Set<string>,
): Hackathon[] {
  return previous.filter((h) => {
    if (liveIds.has(h.id)) return false;
    if (!h.sourceName || h.sourceName === "Curated") return true;
    if (h.status === "past") return true;
    if (!succeededSourceIds.has(h.sourceName)) return true;
    return false;
  });
}

/** What the source reports now wins; the stored figure is only a fallback. */
export function mergeClaimedPrize(
  fresh: number | undefined,
  prev: number | undefined,
): number | undefined {
  return fresh ?? prev;
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
  const enabled = new Set(options.sources ?? SOURCE_REGISTRY.map((a) => a.id));
  const seenIds = new Set<string>();
  const drafts: Hackathon[] = [];

  // Run every enabled adapter in the registry. Adding a worldwide source is a
  // new adapter entry, nothing else changes.
  for (const adapter of SOURCE_REGISTRY) {
    if (!enabled.has(adapter.id)) continue;
    try {
      LOG(`fetching ${adapter.name}...`);
      const result = await adapter.fetch({
        now,
        signal: options.signal,
        pages,
        concurrency,
      });
      let accepted = 0;
      for (const record of result.records) {
        if (seenIds.has(record.id)) continue;
        seenIds.add(record.id);
        drafts.push(record);
        accepted += 1;
      }
      LOG(`${adapter.name} records: ${accepted}/${result.records.length}`);
      sources.push({
        name: adapter.name,
        url: adapter.homepage,
        ok: result.fetched > 0,
        fetched: result.fetched,
      });
    } catch (error) {
      sources.push({
        name: adapter.name,
        url: adapter.homepage,
        ok: false,
        fetched: 0,
        error: (error as Error).message,
      });
    }
  }

  LOG(`total drafts: ${drafts.length}`);

  // Web drafts come from the human-like Puppeteer collector (scripts/scrape.ts),
  // which runs offline in GitHub Actions. They are already detailed, so the
  // engine treats them exactly like any other source: prizes accounted, global
  // dedupe by URL/name/identity, then publish/hold/reject.
  const useWeb = options.useWeb ?? true;
  if (useWeb) {
    const webDrafts = await loadWebDrafts();
    const nowWeb = now.toISOString();
    let accepted = 0;
    if (webDrafts.length > 0) {
      LOG(`web drafts: ${webDrafts.length}`);
      for (const draft of webDrafts) {
        const h = webDraftToHackathon(draft, now);
        if (!h || seenIds.has(h.id)) continue;
        seenIds.add(h.id);
        drafts.push(h);
        accepted += 1;
      }
      sources.push({
        name: "Authentic web pages",
        url: "https://github.com/uncrownedprince786-collab/AI-Hackathon/blob/main/.github/workflows/daily-collect.yml",
        ok: accepted > 0,
        fetched: accepted,
      });
      // Keep the timestamps on fresh drafts consistent with this run.
      for (const d of drafts) if (d.id.startsWith("web-")) d.updatedAt = nowWeb;
    }
    LOG(`web drafts accepted: ${accepted}`);
  }

  // Preserve hand-checked data and skip re-fetching pages we already enriched.
  const needsDetail = drafts.filter((d) => {
    const adapter = adapterForSourceId(d.sourceName);
    if (!adapter?.requiresDetail) return false;
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
    const adapter = adapterForSourceId(draft.sourceName);
    if (!adapter?.enrich) {
      sumPrizes(draft);
      enriched.set(draft.id, draft);
      return;
    }
    try {
      const merged = await adapter.enrich(draft, options.signal);
      sumPrizes(merged);
      enriched.set(draft.id, merged);
    } catch (error) {
      // A failed detail read must never masquerade as an enrichment: marking it
      // enriched would overwrite the richer previously-published version with
      // the thin listing card. Leave the entry out so prev detail is kept.
      console.error(`[collect] detail failed ${draft.officialUrl}`, (error as Error).message);
      sumPrizes(draft);
    }
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
      // What the source says now wins; the stored figure only fills a gap when
      // this run saw no prize at all. A max() here would freeze any inflated
      // value forever, so a corrected source value could never ship again.
      claimedPrizeUsd: mergeClaimedPrize(fresh.claimedPrizeUsd, prev.claimedPrizeUsd),
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

  // Keep curated/past entries that the listing no longer returns. Crucially,
  // a source that failed or returned nothing this run must NOT trigger drops:
  // that would wipe its non-past records on a transient outage (e.g. a 503).
  const liveIds = new Set(merged.map((h) => h.id));
  const succeededIds = new Set<string>();
  for (const adapter of SOURCE_REGISTRY) {
    const status = sources.find((s) => s.name === adapter.name);
    if (status && status.ok) succeededIds.add(adapter.id);
  }
  const retained = selectRetained(previous.hackathons, liveIds, succeededIds);

  const all = [...merged, ...retained];

  // Clean results written by older parser versions: a "Finalist" row names
  // projects that did not win money, and one project read from a link and again
  // inline without a link must not appear twice. Running this on every refresh
  // heals stored data that no longer needs a full detail re-read.
  for (const h of all) {
    h.winners = cleanWinners(h.winners);
  }

  // "What they built": visitors of winner project pages (the Puppeteer pass)
  // publish a short description read from the project's own page. Existing
  // summaries from the organizer are never overwritten.
  const winnerCache = await loadWinnerSummaries();
  if (winnerCache.length) {
    const filled = applyWinnerSummaries(all, winnerCache);
    if (filled > 0) LOG(`winner summaries merged: ${filled}`);
  }

  // Location text is what organizers publish, so the country is read from it.
  for (const h of all) {
    h.country = detectCountry(h.location) ?? h.country;
  }

  // Only the accuracy engine decides what ships: the release threshold is a
  // score of 75 or higher, curated records always pass, borderline records are
  // held for a future refresh and poor ones are dropped. The scoring never
  // reaches the frontend — the pipeline hand over clean data only.
  const accuracy = screenRecords(all);
  LOG(
    `accuracy engine: ${accuracy.published.length} published, ${accuracy.held.length} held, ${accuracy.summary.rejected} rejected`,
  );

  const verified = accuracy.published;
  const dropped = all.length - verified.length;
  if (dropped > 0) LOG(`dropped ${dropped} record(s) that are not high-quality AI events`);

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
