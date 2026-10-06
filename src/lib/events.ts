import { isAiRelevant } from "./sources/ai-signals";

/**
 * AI events (conferences, meetups, summits, workshops) — separate from
 * hackathons. Eventbrite publishes schema.org JSON-LD on its public search
 * pages, so no API key is needed. Everything here is read at request time and
 * cached by the page, nothing is stored, and a failed fetch degrades to an
 * empty list with the source link.
 */

export type AiEventMode = "online" | "in-person" | "hybrid";

export interface AiEvent {
  id: string;
  name: string;
  description: string;
  startDate: string;
  endDate?: string;
  url: string;
  mode: AiEventMode;
  location?: string;
  imageUrl?: string;
}

export interface EventSourceStatus {
  name: string;
  url: string;
  ok: boolean;
  fetched: number;
  error?: string;
}

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 ai-hackathons-site/1.0 (+https://ai-hackathons-tawny.vercel.app)";

/** Public search pages, one online and one mixed, so the list is not US-only. */
const SEARCHES: { url: string; scope: string }[] = [
  {
    url: "https://www.eventbrite.com/d/online/artificial-intelligence/",
    scope: "Online AI events",
  },
  {
    url: "https://www.eventbrite.com/d/worldwide/artificial-intelligence/",
    scope: "AI events worldwide",
  },
];

const DAY_MS = 86_400_000;
const HORIZON_DAYS = 240;

type JsonLd = {
  "@type"?: string;
  itemListElement?: { item?: Record<string, unknown> }[];
  "@graph"?: Record<string, unknown>[];
};

function asEvent(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (item["@type"] !== "Event") return null;
  if (typeof item.name !== "string" || typeof item.url !== "string") return null;
  if (typeof item.startDate !== "string") return null;
  return item;
}

function parseAddress(location: unknown): string | undefined {
  if (!location || typeof location !== "object") return undefined;
  const l = location as Record<string, unknown>;
  if (l["@type"] === "VirtualLocation") return "Online";
  const address = l.address;
  if (typeof address === "string") return address;
  if (address && typeof address === "object") {
    const a = address as Record<string, unknown>;
    const parts = [a.streetAddress, a.addressLocality, a.addressRegion, a.addressCountry]
      .filter((p): p is string => typeof p === "string" && p.length > 0);
    if (parts.length) return parts.join(", ");
  }
  if (typeof l.name === "string") return l.name;
  return undefined;
}

function modeOf(item: Record<string, unknown>, location: unknown): AiEventMode {
  const attendance = typeof item.eventAttendanceMode === "string" ? item.eventAttendanceMode : "";
  const placeLike =
    (location && typeof location === "object" && (location as Record<string, unknown>)["@type"] === "Place") ||
    attendance.includes("Mixed");
  const online = attendance.includes("Online") || (location === undefined && false);

  if (attendance.includes("Mixed") || (placeLike && attendance.includes("Online"))) return "hybrid";
  if (online) return "online";
  if (placeLike) return "in-person";
  return "online";
}

function cleanText(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function idFor(item: Record<string, unknown>): string {
  const url = String(item.url);
  const match = url.match(/-(\d{6,})(?:\?|$)/);
  return match ? match[1] : url;
}

async function fetchSearch(
  search: (typeof SEARCHES)[number],
  signal?: AbortSignal,
): Promise<{ items: AiEvent[]; status: EventSourceStatus }> {
  const status: EventSourceStatus = { name: search.scope, url: search.url, ok: false, fetched: 0 };
  try {
    const response = await fetch(search.url, {
      headers: { "user-agent": UA, "accept-language": "en" },
      signal,
      next: { revalidate: 21600 },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();

    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    const items: AiEvent[] = [];
    const now = Date.now();
    const horizon = now + HORIZON_DAYS * DAY_MS;

    for (const [, raw] of blocks) {
      let parsed: JsonLd | null = null;
      try {
        parsed = JSON.parse(raw) as JsonLd;
      } catch {
        continue;
      }

      const candidates: unknown[] = [];
      if (Array.isArray(parsed.itemListElement)) {
        for (const entry of parsed.itemListElement) candidates.push(entry?.item);
      }
      if (Array.isArray(parsed["@graph"])) candidates.push(...parsed["@graph"]);
      candidates.push(parsed);

      for (const candidate of candidates) {
        const item = asEvent(candidate);
        if (!item) continue;

        const start = String(item.startDate).slice(0, 10);
        const stamp = Date.parse(`${start}T00:00:00Z`);
        if (!Number.isFinite(stamp)) continue;
        if (stamp < now - 7 * DAY_MS || stamp > horizon) continue;

        const description = cleanText(String(item.description ?? ""));
        const name = cleanText(String(item.name));
        if (!isAiRelevant({ title: name, description })) continue;

        const location = parseAddress(item.location);
        const endRaw = typeof item.endDate === "string" ? String(item.endDate).slice(0, 10) : "";

        items.push({
          id: idFor(item),
          name,
          description: description.slice(0, 320),
          startDate: start,
          endDate: endRaw && endRaw !== start ? endRaw : undefined,
          url: String(item.url),
          mode: modeOf(item, item.location),
          location: location && location !== "Online" ? location : undefined,
          imageUrl:
            typeof item.image === "string"
              ? String(item.image).slice(0, 400)
              : undefined,
        });
      }
    }

    status.ok = items.length > 0;
    status.fetched = items.length;
    return { items, status };
  } catch (error) {
    status.error = (error as Error).message;
    return { items: [], status };
  }
}

export interface EventFeed {
  events: AiEvent[];
  sources: EventSourceStatus[];
}

/**
 * Reads every search page, drops duplicates and sorts by date. Retries nothing
 * and never throws: the page still renders with whatever came back.
 */
export async function getAiEvents(signal?: AbortSignal): Promise<EventFeed> {
  const results = await Promise.all(SEARCHES.map((search) => fetchSearch(search, signal)));

  const byId = new Map<string, AiEvent>();
  for (const { items } of results) {
    for (const item of items) {
      const existing = byId.get(item.id);
      if (!existing || existing.description.length < item.description.length) {
        byId.set(item.id, item);
      }
    }
  }

  const events = [...byId.values()].sort(
    (a, b) => a.startDate.localeCompare(b.startDate) || a.name.localeCompare(b.name),
  );

  return { events, sources: results.map((r) => r.status) };
}
