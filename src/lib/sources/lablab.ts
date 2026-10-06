import * as cheerio from "cheerio";
import { classifyPrize, cleanOrganizerName, detectRegistrationStatus, extractClaimedPool } from "./ai-signals";
import type { Hackathon, Prize } from "../types";
import { slugify, sleep, statusFor } from "./devpost";

const LIST_URL = "https://lablab.ai/ai-hackathons";
const UA =
  "Mozilla/5.0 (compatible; AIHackathonsBot/1.0; +https://ai-hackathons-tawny.vercel.app)";

interface LablabEventLd {
  name?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  eventStatus?: string;
  eventAttendanceMode?: string;
  image?: string;
  url?: string;
  location?: { name?: string; address?: { addressLocality?: string } };
  organizer?: { name?: string } | { name?: string }[];
}

export interface LablabItem {
  url: string;
  name: string;
}

async function getHtml(url: string, signal?: AbortSignal): Promise<string> {
  const res = await fetch(url, {
    signal,
    headers: {
      "user-agent": UA,
      accept: "text/html,application/xhtml+xml",
    },
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.text();
}

/** lablab.ai publishes a schema.org ItemList of every AI hackathon on its index page. */
export async function fetchLablabIndex(signal?: AbortSignal): Promise<LablabItem[]> {
  const html = await getHtml(LIST_URL, signal);
  const $ = cheerio.load(html);

  const items: LablabItem[] = [];
  const seen = new Set<string>();

  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).text().trim();
    if (!raw) return;
    let parsed: { "@graph"?: { "@type"?: string; itemListElement?: unknown }[] };
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    for (const node of parsed["@graph"] ?? []) {
      if (node["@type"] !== "ItemList" || !Array.isArray(node.itemListElement)) continue;
      for (const entry of node.itemListElement) {
        // schema.org ListItem puts name/url at the top level, but some payloads
        // wrap them in a referenced `item` object.
        const candidate = entry as { name?: string; url?: string; item?: { name?: string; url?: string } };
        const item = candidate.item ?? candidate;
        if (!item?.url || !item.name) continue;
        if (!item.url.includes("/ai-hackathons/")) continue;
        if (seen.has(item.url)) continue;
        seen.add(item.url);
        items.push({ url: item.url, name: item.name });
      }
    }
  });

  return items;
}

function toDateOnly(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function organizerName(value: LablabEventLd["organizer"]): string | undefined {
  if (!value) return undefined;
  const raw = Array.isArray(value)
    ? value.map((o) => o?.name).filter(Boolean).join(" + ")
    : value.name;
  // lablab marks its own events with "lablab.ai"; "nill" is their points currency.
  const cleaned = cleanOrganizerName(raw);
  return cleaned || undefined;
}

function detectMode(ld: LablabEventLd, text: string): Hackathon["mode"] {
  const mode = (ld.eventAttendanceMode ?? "").toLowerCase();
  if (mode.includes("mixed") || mode.includes("hybrid")) return "hybrid";
  if (mode.includes("offline") || mode.includes("physical")) return "in-person";
  if (mode.includes("online")) return "online";
  if (/\bhybrid\b/i.test(text)) return "hybrid";
  if (/\bon-?site only\b|\bin-?person\b/i.test(text)) return "in-person";
  return "online";
}

/** Prize labels as lablab writes them, e.g. "1st place", "Cash prizes", "Grand prize". */
const LABEL =
  /(\d(?:st|nd|rd|th)\s+place(?:\s*[-–—]\s*[^\d$]{0,40})?|cash\s+prizes?|credits?|grand\s+prize|prize\s*pool|best\s+use\s+of\s+[^\d$]{0,30})/gi;

function expand(amount: string, suffix?: string): number {
  let value = Number.parseFloat(amount.replace(/,/g, ""));
  if (!Number.isFinite(value)) return 0;
  const s = (suffix ?? "").toLowerCase();
  if (s.startsWith("k")) value *= 1_000;
  if (s.startsWith("m")) value *= 1_000_000;
  return Math.round(value);
}

function looksLikeLabel(value: string): boolean {
  const label = value.trim();
  if (label.length < 3 || label.length > 70) return false;
  if (!/[a-z]{2}/i.test(label)) return false;
  if (/[<>{}[\]\\@#%|]/.test(label)) return false;
  return true;
}

/**
 * lablab renders prizes as flat "label … amount" text. We pair each label with the
 * nearest amount that follows it, because the page interleaves unrelated amounts.
 */
function parsePrizes(text: string): Prize[] {
  const prizes: Prize[] = [];
  const seen = new Set<string>();

  const add = (prize: Prize) => {
    const key = `${prize.label.toLowerCase()}|${prize.amount}`;
    if (seen.has(key)) return;
    seen.add(key);
    prizes.push(prize);
  };

  // "$10,000 Prize Pool" and "Prize Pool: $10,000" are both used.
  const poolTotal = (() => {
    const before = text.match(/\$\s?([\d][\d,.]*)\s?(k\b|m\b)?[^$]{0,24}prize\s*pool/i);
    if (before) return expand(before[1], before[2]);
    const after = text.match(/prize\s*pool[^$]{0,24}\$\s?([\d][\d,.]*)\s?(k\b|m\b)?/i);
    if (after) return expand(after[1], after[2]);
    return 0;
  })();

  // "$10,000 Prize Pool ($5k cash + $5k in AAI credits)" splits cash from credits.
  const split = text.match(
    /\$\s?([\d][\d,.]*)\s?(k\b|m\b)?\s*(?:in\s+)?cash\s*\+\s*\$?\s?([\d][\d,.]*)\s?(k\b|m\b)?\s*(?:in\s+)?([a-z0-9][a-z0-9 ]{2,24}?)\s*credits/i,
  );
  if (split) {
    const cash = expand(split[1], split[2]);
    const credits = expand(split[3], split[4]);
    if (cash > 0) add({ amount: cash, currency: "USD", type: "cash", label: "Cash prizes" });
    if (credits > 0) {
      add({
        amount: credits,
        currency: "USD",
        type: "credits",
        label: `${split[5].trim()} credits`,
      });
    }
    // The split is the full breakdown, so the per-place lines would double count.
    return prizes.slice(0, 20);
  }

  const details: Prize[] = [];
  LABEL.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = LABEL.exec(text)) !== null) {
    const rawLabel = match[1].replace(/\s+/g, " ").replace(/[\s:–—-]+$/, "").trim();
    if (!looksLikeLabel(rawLabel)) continue;

    // Only look a short distance ahead, and never across another number, so a
    // label can never pick up a neighbouring prize's amount.
    const tail = text.slice(match.index + match[0].length, match.index + match[0].length + 40);
    const amountMatch = tail.match(
      /^[\s:–—-]*(?:valued\s*at\s*)?\$?\s?([\d][\d,.]*)\s?(k\b|m\b)?/i,
    );
    if (!amountMatch) continue;

    const amount = expand(amountMatch[1], amountMatch[2]);
    if (amount < 10) continue;

    // Bare words like "credits" also appear in sentences ("$10 in credits"),
    // so only trust them when the number is big enough to be a real prize row.
    if (/^(credits?|cash\s+prizes?|prize\s*pool)$/i.test(rawLabel) && amount < 100) continue;

    add({ amount, currency: "USD", type: classifyPrize(`${rawLabel} ${tail.slice(0, 30)}`), label: rawLabel });
    details.push(prizes[prizes.length - 1]);
  }

  // If nothing on the page mentions cash or credits, the ranked prizes are cash.
  if (details.length && details.every((p) => p.type === "other")) {
    for (const prize of details) prize.type = "cash";
  }

  const detailedTotal = details.reduce((sum, p) => sum + p.amount, 0);

  if (details.length === 0) {
    if (poolTotal > 0) {
      add({ amount: poolTotal, currency: "USD", type: "cash", label: "Total prize pool" });
    }
    return prizes.slice(0, 20);
  }

  if (poolTotal > 0) {
    if (detailedTotal > poolTotal * 1.05) {
      // The breakdown cannot be trusted, so use the headline pool on its own.
      return [
        { amount: poolTotal, currency: "USD", type: "cash", label: "Total prize pool" },
      ];
    }
    // The headline pool is the authority when the breakdown adds up to less.
    if (poolTotal > detailedTotal) {
      add({
        amount: poolTotal - detailedTotal,
        currency: "USD",
        type: "other",
        label: "Other prizes",
      });
    }
  }

  return prizes.slice(0, 20);
}

function parseParticipants(text: string): number | undefined {
  const m = text.match(/([\d,]+)\s+(?:participants?|people|hackers?|joined)\b/i);
  if (!m) return undefined;
  const value = Number.parseInt(m[1].replace(/,/g, ""), 10);
  return Number.isFinite(value) ? value : undefined;
}

export async function fetchLablabEvent(
  item: LablabItem,
  now: Date,
  signal?: AbortSignal,
): Promise<Hackathon | null> {
  const html = await getHtml(item.url, signal);
  const $ = cheerio.load(html);

  let ld: LablabEventLd | null = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    if (ld) return;
    const raw = $(el).text().trim();
    if (!raw || !raw.includes('"Event"')) return;
    try {
      const parsed = JSON.parse(raw) as LablabEventLd & { "@type"?: string };
      if (parsed["@type"] === "Event") {
        ld = parsed;
      }
    } catch {
      /* ignore malformed blocks */
    }
  });

  if (!ld) return null;
  const event = ld as LablabEventLd;

  const startDate = toDateOnly(event.startDate);
  const endDate = toDateOnly(event.endDate);
  if (!startDate || !endDate) return null;

  // Strip scripts and styles first: their bodies are not visible page text and
  // would otherwise leak markup into prize labels.
  $("script, style, noscript, svg").remove();
  const text = $("body").text().replace(/\s+/g, " ");

  const prizes = parsePrizes(text);
  const description = (event.description ?? text)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1200);

  const locationText =
    event.location?.name ??
    event.location?.address?.addressLocality ??
    undefined;

  const mode = detectMode(event, text);
  const nowIso = now.toISOString();
  const claimedPool = extractClaimedPool(event.name, text);

  const hackathon: Hackathon = {
    id: `lablab-${slugify(item.url.replace(/^https?:\/\/[^/]+/, ""))}`,
    slug: slugify(item.url.replace(/^https?:\/\/[^/]+/, "").replace(/^\//, "")),
    name: event.name ?? item.name,
    description,
    status: statusFor(startDate, endDate, now),
    mode,
    organizer: organizerName(event.organizer) ?? "lablab.ai",
    startDate,
    endDate,
    registrationDeadline: endDate,
    claimedPrizeUsd: claimedPool || undefined,
    registrationStatus: detectRegistrationStatus(text),
    location: locationText,
    prizes,
    totalPrizeUsd: 0,
    cashPrizeUsd: 0,
    creditPrizeUsd: 0,
    winners: [],
    tags: extractTags(text),
    officialUrl: item.url,
    sourceUrl: item.url,
    sourceName: "lablab.ai",
    sourceId: item.url,
    imageUrl: event.image,
    participants: parseParticipants(text),
    firstSeenAt: nowIso,
    updatedAt: nowIso,
  };

  sumLablabPrizes(hackathon);
  hackathon.prizeBreakdownPublished = prizes.some((p) => p.type === "cash");
  return hackathon;
}

function sumLablabPrizes(h: Hackathon): void {
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
  const itemised = cash + credits + other;
  const claimed = h.claimedPrizeUsd ?? 0;
  if (claimed > itemised) {
    h.totalPrizeUsd = claimed;
  } else {
    h.claimedPrizeUsd = claimed || undefined;
    h.totalPrizeUsd = itemised || claimed;
  }
}

const TAG_MAP: [RegExp, string][] = [
  [/\bvoice\b/i, "Voice AI"],
  [/\bagent(ic|s)?\b/i, "AI Agents"],
  [/\bllm|large language model\b/i, "LLM"],
  [/\bmulti-?agent\b/i, "Multi-Agent"],
  [/\btrading\b|\bfintech\b/i, "Fintech"],
  [/\bhealth\b|\bmedical\b/i, "Health"],
  [/\bllama\b|\bexaone\b|\bsmol\b/i, "Open Models"],
  [/\bamd\b|\brocm\b/i, "AMD"],
  [/\brobot|embodied|on-?device/i, "Robotics"],
  [/\bdevops\b|\binfrastructure\b|\binfra\b/i, "Infrastructure"],
  [/\beducation\b|\blearning\b/i, "Education"],
];

function extractTags(text: string): string[] {
  const tags: string[] = [];
  for (const [re, tag] of TAG_MAP) if (re.test(text)) tags.push(tag);
  return tags.slice(0, 6);
}

export { sleep };
