/**
 * Human-like web collector.
 *
 * Runs behind the scenes only (local `npm run scrape:web`, GitHub Actions cron).
 * The frontend never sees any of this: the collector feeds the produced draft
 * records and winner summaries into the same key-free accuracy engine that
 * every other source goes through, so the published dataset stays clean.
 *
 * Two jobs:
 *   1. Discover real AI hackathons worldwide — open a search engine (Google
 *      first), visit authentic listing sites (MLH, Unstop, Eventbrite,
 *      Kaggle, Hackathon.com, organizer pages) the way a person would, and
 *      extract drafts.
 *   2. Winners "what they built" — for winners that have a public project
 *      page but no summary yet, visit the page and read the tagline /
 *      description. Only real, on-page text is kept; nothing is invented, and
 *      a winner stays name-only when the page says nothing reliable.
 *
 * Puppeteer is loaded lazily so the Next.js build never touches it.
 */
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  hasAnyAiSignal,
  isExplicitlyNotAi,
  isSaneDate,
  isUsableEventUrl,
  normalizeUrl,
  stripHtml,
} from "./sources/accuracy-engine";
import { statusFor, slugify } from "./sources/devpost";
import { extractPrizeAnnouncement } from "./sources/prize-extract";
import { findCityInText } from "./geo";
import type { Hackathon, HackathonMode, Prize } from "./types";

export interface WebDraft {
  name: string;
  organizer: string;
  officialUrl: string;
  sourceUrl: string;
  sourceName: string;
  description: string;
  startDate: string;
  endDate: string;
  registrationDeadline?: string;
  location?: string;
  mode: HackathonMode;
  /** The raw prize paragraph(s) from the page, for honest prize accounting. */
  prizeText: string;
  tags: string[];
  participants?: number;
}

export interface WinnerSummaryEntry {
  url: string;
  project: string;
  summary: string;
}

/* ------------------------------------------------------------------ *
 * Paths + persistence (same convention as store.ts)
 * ------------------------------------------------------------------ */

const DATA_DIR = path.join(process.cwd(), "src", "data");

export const WEB_DRAFTS_FILE = path.join(DATA_DIR, "web-drafts.json");
export const WINNER_SUMMARIES_FILE = path.join(DATA_DIR, "winner-summaries.json");

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function loadWebDrafts(): Promise<WebDraft[]> {
  const data = await readJson<{ records?: WebDraft[] }>(WEB_DRAFTS_FILE, {});
  return Array.isArray(data.records) ? data.records : [];
}

export async function loadWinnerSummaries(): Promise<WinnerSummaryEntry[]> {
  const data = await readJson<{ entries?: WinnerSummaryEntry[] }>(WINNER_SUMMARIES_FILE, {});
  return Array.isArray(data.entries) ? data.entries : [];
}

/* ------------------------------------------------------------------ *
 * Random time / choices — the scraper moves with human irregularity.
 * ------------------------------------------------------------------ */

export function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function pickRandom<T>(items: T[]): T | undefined {
  if (!items.length) return undefined;
  return items[Math.floor(Math.random() * items.length)];
}

export function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** A pause that feels busy: 1.2–3.6s for normal stops, faster after clicks. */
export function humanPause(min = 1200, max = 3600): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, randomBetween(min, max)));
}

/* ------------------------------------------------------------------ *
 * AI relevance gate — same signals as the accuracy engine, so what we
 * fetch to scan is what we would actually publish.
 * ------------------------------------------------------------------ */

export function isAiScrapeCandidate(name: string, description: string, officialUrl: string): boolean {
  const sample: Hackathon = {
    id: "sample",
    slug: "sample",
    name,
    description: description.slice(0, 1200),
    status: "upcoming",
    mode: "online",
    organizer: "Sample",
    startDate: "2026-01-01",
    endDate: "2026-02-01",
    prizes: [],
    totalPrizeUsd: 0,
    cashPrizeUsd: 0,
    creditPrizeUsd: 0,
    winners: [],
    tags: [],
    officialUrl,
    sourceUrl: officialUrl,
    sourceName: "sample",
    sourceId: "sample",
    firstSeenAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
  if (isExplicitlyNotAi(name, description)) return false;
  return hasAnyAiSignal(sample);
}

/* ------------------------------------------------------------------ *
 * Candidate links
 * ------------------------------------------------------------------ */

/** Friendly source name shown on cards and in the dataset meta. */
export function siteNameFor(url: string): string {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    host = "";
  }
  if (host === "mlh.io") return "MLH";
  if (host.endsWith("eventbrite.com")) return "Eventbrite";
  if (host.endsWith("unstop.com")) return "Unstop";
  if (host.endsWith("kaggle.com")) return "Kaggle";
  if (host === "hackathon.com") return "Hackathon.com";
  if (host.endsWith("lablab.ai")) return "lablab.ai";
  if (host.endsWith("devpost.com")) return "Devpost";
  if (host.endsWith("github.com")) return "Organizer page";
  const parts = host.split(".");
  return parts.length >= 2 ? parts[parts.length - 2] : host;
}

/** URLs that are probably an actual event, by known listing-site path shapes. */
export function isLikelyEventPath(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (!isUsableEventUrl(raw)) return false;
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const path = url.pathname.toLowerCase().replace(/\/+$/, "");
  if (path === "" || path === "/") return false;
  if (host.endsWith("eventbrite.com")) return /\/e\//.test(path);
  if (host === "mlh.io") return /\/events\//.test(path);
  if (host.endsWith("unstop.com")) {
    return /^\/competitions?\//.test(path) || /^\/hackathons?\//.test(path);
  }
  if (host.endsWith("kaggle.com")) return path.startsWith("/competitions/") && path !== "/competitions";
  if (host.endsWith("lablab.ai")) return path.startsWith("/ai-hackathons/");
  if (host.endsWith("devpost.com")) {
    return path.startsWith("/hackathons/") && path !== "/hackathons";
  }
  if (host === "hackathon.com") return path.includes("/hackathon");
  // Organizer and university pages: a page with a hackathon word in the path.
  return /hackathon|hack|competition/i.test(path);
}

/** De-duplicates candidate URLs, keeping the first occurrence. */
export function dedupeCandidates(candidates: { url: string; text: string }[]): { url: string; text: string }[] {
  const seen = new Set<string>();
  const out: { url: string; text: string }[] = [];
  for (const c of candidates) {
    const key = normalizeUrl(c.url);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

/** Sorts candidates so hackathon-like results are visited first. */
export function rankCandidates(candidates: { url: string; text: string }[]): { url: string; text: string }[] {
  const rank = (c: { url: string; text: string }): number => {
    const hay = `${c.text} ${c.url}`.toLowerCase();
    let score = 0;
    if (/hackathon/.test(hay)) score += 4;
    if (/\bai\b| artificial intelligence|machine learning|llm|generative/.test(hay)) score += 3;
    if (/prize|prizes/.test(hay)) score += 2;
    if (isLikelyEventPath(c.url)) score += 2;
    if (/(^[\w-]+\.(com|org|io|dev|ai|co|me|ca|uk|in)\/)+/.test(c.url)) score += 1;
    return score;
  };
  return [...candidates].sort((a, b) => rank(b) - rank(a) || a.url.localeCompare(b.url));
}

/* ------------------------------------------------------------------ *
 * Page extraction (runs inside the headless browser)
 * ------------------------------------------------------------------ */

export interface PageExtract {
  url: string;
  title: string;
  h1: string[];
  ogTitle: string;
  ogDescription: string;
  metaDescription: string;
  bodyText: string;
  paragraphs: string[];
  jsonLd: unknown[];
  /** How many same-host links look like event sub-pages (hubs list many). */
  sameHostEventLinks: number;
}

export function extractFromDom(): PageExtract {
  function pick(selector: string): string {
    return (document.querySelector(selector)?.getAttribute("content") ?? "").trim();
  }
  const h1 = [...document.querySelectorAll("h1")]
    .map((e) => (e.innerText ?? "").replace(/\s+/g, " ").trim())
    .filter((t) => t.length >= 3);
  const paragraphs = [...document.querySelectorAll("p")]
    .map((p) => (p.innerText ?? "").replace(/\s+/g, " ").trim())
    .filter((t) => t.length >= 24);
  const bodyText = (document.body?.innerText ?? "").replace(/\s+/g, " ").trim().slice(0, 8000);
  const jsonLd: unknown[] = [];
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      jsonLd.push(JSON.parse(script.textContent ?? "null"));
    } catch {
      /* not JSON-LD */
    }
  }
  let sameHostEventLinks = 0;
  try {
    const here = new URL(location.href);
    for (const a of document.querySelectorAll<HTMLAnchorElement>("a[href]")) {
      const href = a.href || "";
      let u: URL;
      try {
        u = new URL(href);
      } catch {
        continue;
      }
      if (u.hostname !== here.hostname) continue;
      if (/\/hackathon|hackathon|\/hack\b|\/competition|\/challenge|\/event\//i.test(u.pathname)) {
        sameHostEventLinks += 1;
      }
    }
  } catch {
    /* keep zero */
  }
  return {
    url: location.href,
    title: (document.title ?? "").trim(),
    h1,
    ogTitle: pick('meta[property="og:title"]'),
    ogDescription: pick('meta[property="og:description"]'),
    metaDescription: pick('meta[name="description"]'),
    bodyText,
    paragraphs,
    jsonLd,
    sameHostEventLinks,
  };
}

/* ------------------------------------------------------------------ *
 * Pure parsing helpers (unit-testable, network-free)
 * ------------------------------------------------------------------ */

/** Finds the first JSON-LD object that looks like an event/hackathon. */
export function structuredEvent(html: string): {
  name?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  location?: string;
  organizer?: string;
} {
  const blocks = html.match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) ?? [];
  for (const block of blocks) {
    const inner = block.replace(/<script[^>]*>/, "").replace(/<\/script>/i, "").trim();
    for (const candidate of [inner]) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(candidate);
      } catch {
        continue;
      }
      const found = findEventish(parsed);
      if (found) return found;
    }
  }
  return {};
}

function findEventish(value: unknown): ReturnType<typeof structuredEvent> | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findEventish(item);
      if (found) return found;
    }
    return undefined;
  }
  if (!value || typeof value !== "object") return undefined;
  const node = value as Record<string, unknown>;
  const type = Array.isArray(node["@type"])
    ? (node["@type"] as string[]).filter((t) => typeof t === "string").join(",")
    : typeof node["@type"] === "string"
      ? (node["@type"] as string)
      : "";
  const isEventish = /hackathon|event|competition/i.test(type);
  if (isEventish) {
    const combined = [] as unknown[];
    if (Array.isArray(node.date)) combined.push(...node.date);
    if (Array.isArray(node.dateStart)) combined.push(...node.dateStart);
    const location = typeof node.location === "string" ? node.location : locationFromNode(node.location);
    const organizer =
      typeof node.organizer === "string"
        ? node.organizer
        : typeof node.sponsor === "string"
          ? node.sponsor
          : partnerName(node.organizer);
    return {
      name: str(node.name),
      description: str(node.description),
      startDate: str(node.startDate) ?? str(node.dateStart),
      endDate: str(node.endDate) ?? str(node.dateEnd),
      location,
      organizer,
    };
  }
  for (const key of ["mainEntity", "events", "itemListElement"]) {
    const found = findEventish(node[key]);
    if (found) return found;
  }
  return undefined;
}

function partnerName(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return undefined;
  const node = value as Record<string, unknown>;
  return typeof node.name === "string" ? String(node.name) : undefined;
}

function locationFromNode(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const node = value as Record<string, unknown>;
  if (typeof node.address === "string") return String(node.address);
  if (node.address && typeof node.address === "object") {
    const address = node.address as Record<string, unknown>;
    const parts = [
      address.addressLocality,
      address.addressRegion,
      address.addressCountry,
    ].filter((p): p is string => typeof p === "string" && p.length > 0);
    if (parts.length) return parts.join(", ");
  }
  return partnerName(node.name ?? node["@name"]);
}

function str(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  return undefined;
}

const MONTH_NAMES =
  "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t)?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";

const DATE_TOKEN =
  `\\b(${MONTH_NAMES})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:[,]?\\s*(\\d{4}))?\\b|\\b(\\d{1,2})\\s+(?:-|\\/|\\s)?\\s*(${MONTH_NAMES})\\s*(\\d{4})?\\b|\\b(\\d{4})-(\\d{1,2})-(\\d{1,2})\\b`;

const MONTH_INDEX: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

function monthNumber(name: string): number {
  return MONTH_INDEX[name.toLowerCase().slice(0, 3) === "sep" ? "sep" : name.toLowerCase()] ?? MONTH_INDEX[name.toLowerCase()] ?? 0;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

const JUNK_NAME = /^\s*(under ?construction|coming soon|check back for|stay tuned|we('\u2019)?re building|a round of applause|loading|sign up now|this page is|welcome to the home of|new|updates)\b/i;

const LISTING_NAME =
  /^\s*(all |top |best |upcoming |latest |online |active )*(ai |ml |machine learning |generative |gen? ?ai )*(&|and )?hackathons?( in| of| for)?\s*\d{0,4}[.,'\u2019 -]*$/i;

/** Reads one-or-two date mentions out of free-form event prose. A year is
 *  required: we never invent one, so placeholder pages fail. */
export function extractDatesFromText(text: string | undefined): { start: string; end: string } | null {
  const haystack = (text ?? "").replace(/\s+/g, " ");
  const found = new Set<string>();

  // "July 4-6, 2026" — a day range shares one month and one (required) year.
  const rangeRe = new RegExp(
    `\\b(${MONTH_NAMES})\\s+(\\d{1,2})\\s*[-–—]\\s*(\\d{1,2})(?:st|nd|rd|th)?(?:[,]?\\s*(\\d{4}))\\b`,
    "i",
  );
  const rangeMatch = rangeRe.exec(haystack);
  if (rangeMatch) {
    const mon = monthNumber(rangeMatch[1]);
    const year = Number(rangeMatch[4]);
    if (mon) {
      found.add(`${year}-${pad(mon)}-${pad(Number(rangeMatch[2]))}`);
      found.add(`${year}-${pad(mon)}-${pad(Number(rangeMatch[3]))}`);
    }
  }

  const re = new RegExp(DATE_TOKEN, "gi");
  let match: RegExpExecArray | null;
  while ((match = re.exec(haystack)) !== null) {
    const [, monA, dayA, yearA, dayB, monB, yearB, isoY, isoM, isoD] = match;
    if (isoY && isoM && isoD) {
      found.add(`${isoY}-${pad(Number(isoM))}-${pad(Number(isoD))}`);
      continue;
    }
    if (monA && dayA && yearA) {
      const m = monthNumber(monA);
      if (!m) continue;
      found.add(`${yearA}-${pad(m)}-${pad(Number(dayA))}`);
      continue;
    }
    if (dayB && monB && yearB) {
      const m = monthNumber(monB);
      if (!m) continue;
      found.add(`${yearB}-${pad(m)}-${pad(Number(dayB))}`);
    }
  }
  const dates = [...found].filter((d) => isSaneDate(d)).sort();
  if (dates.length === 0) return null;
  return { start: dates[0], end: dates[dates.length - 1] };
}

/** A short region of the page that mentions prizes, for honest accounting. */
export function extractPrizeSnippet(text: string | undefined): string {
  const haystack = (text ?? "").replace(/\s+/g, " ");
  if (!/prize|prizes|\$|€|£|₹/i.test(haystack)) return "";
  const first = haystack.search(/prize|prizes|\$|€|£|₹/i);
  if (first < 0) return "";
  const start = Math.max(0, first - 300);
  return haystack.slice(start, start + 700).trim();
}

/** Organizer from the page URL hostname when the page names nobody (university + organizer pages). */
export function organizerFromUrl(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const parts = host.split(".");
    return parts.length >= 2 ? parts[parts.length - 2] : host;
  } catch {
    return hostFallback(url);
  }
}

function hostFallback(url: string): string {
  const m = /^https?:\/\/(?:www\.)?([^/]+)/i.exec(url);
  return m ? m[1].split(".").slice(-2, -1)[0] ?? m[1] : "";
}

export function inferMode(text: string | undefined): HackathonMode {
  const hay = (text ?? "").toLowerCase();
  if (/online|virtual|remote|anywhere in the world|from anywhere|worldwide|fully online/i.test(hay)) {
    return "online";
  }
  if (/\bhybrid\b/i.test(hay)) return "hybrid";
  if (/in[- ]person|on[- ]site|campus|venue|at \[|auditorium|amphitheatre/i.test(hay)) return "in-person";
  return "in-person";
}

/** Small topic tags from the page text, matching the site's tag vocabulary. */
export function tagsFromText(text: string | undefined): string[] {
  const hay = (text ?? "").toLowerCase();
  const map: [RegExp, string][] = [
    [/\bllm|large language model/i, "LLM"],
    [/\bagent(|ic|s)\b/i, "AI Agents"],
    [/\bgenerative|genai\b/i, "Generative AI"],
    [/\bmachine learning/i, "Machine Learning"],
    [/\bcomputer vision|image|vision/i, "Computer Vision"],
    [/\bnlp|natural language/i, "NLP"],
    [/\brobot|autonomous|drone/i, "Robotics"],
    [/\bdata science|analytics/i, "Data Science"],
    [/\bcloud|api|aws|azure|gcp/i, "Cloud"],
  ];
  const found: string[] = [];
  for (const [re, tag] of map) if (re.test(hay)) found.push(tag);
  return [...new Set(found)].slice(0, 4);
}

/** Builds a draft from a visited page. Dates/org/facts only come from the page. */
export function buildWebDraft(site: string, e: PageExtract, now: Date): WebDraft | null {
  const structured = structuredEventFromPage(e);
  let name = stripHtml(e.h1[0] || e.ogTitle || structured.name || e.title || "");
  // A thank-you page can still name the event: "Thank You for Making the
  // Global AI Hackathon 2026 a Success".
  name = name
    .replace(/^\s*(?:thank you for (?:making|joining) (?:the )?)\s*/i, "")
    .replace(/\s+a (?:resounding )?success\s*$/i, "");
  name = name.replace(/\s+/g, " ").trim();
  const description = stripHtml(
    e.ogDescription || e.metaDescription || structured.description || e.paragraphs[0] || "",
  );
  if (name.length < 8 || name.length > 120) return null;
  if (JUNK_NAME.test(name)) return null;
  if (LISTING_NAME.test(name)) return null;
  if (e.sameHostEventLinks > 7) return null;
  if (!isAiScrapeCandidate(name, description, e.url)) return null;

  const dates = structured.startDate && structured.endDate
    ? { start: structured.startDate, end: structured.endDate }
    : extractDatesFromText(`${structured.startDate ?? ""} ${structured.endDate ?? ""} ${e.bodyText}`);
  if (!dates || !isSaneDate(dates.start) || !isSaneDate(dates.end)) return null;

  const location =
    (structured.location || extractLocation(e) || findCityInText(e.bodyText) || findCityInText(e.url) || "").trim() ||
    undefined;
  const organizer = (structured.organizer || organizerFromUrl(e.url)).trim() || "Independent";
  const prizeText = extractPrizeSnippet(e.bodyText);
  const tags = tagsFromText(`${name} ${description} ${e.title}`);

  return {
    name,
    organizer,
    officialUrl: e.url,
    sourceUrl: e.url,
    sourceName: site,
    description: (description || name).slice(0, 500),
    startDate: dates.start,
    endDate: dates.end,
    registrationDeadline:
      statusFor(dates.start, dates.end, now) === "upcoming" ? undefined : dates.end,
    location,
    mode: inferMode(location),
    prizeText,
    tags,
  };
}

function structuredEventFromPage(e: PageExtract): ReturnType<typeof structuredEvent> {
  for (const node of e.jsonLd) {
    const read = findEventish(node);
    if (read) return read;
  }
  return {};
}

function extractLocation(e: PageExtract): string {
  const hay = e.bodyText.slice(0, 4000);
  const patterns = [
    /location\s*[:\-]\s*([A-Z][a-zA-Z ,.\-]{2,45})/i,
    /venue\s*[:\-]\s*([A-Z][a-zA-Z ,.\-]{2,45})/i,
    /(?:held|happening|taking place|running|hosted)\s+(?:in|at)\s+([A-Z][a-zA-Z ]{2,40}\s*(?:[,a-z ]{0,20}))\b/i,
    /(?:in|at)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,2})(?:[.,\s]+(?:United States|USA|UK|Canada|India|Singapore|Germany|France|London|Paris|Berlin|Tokyo|Sydney))?/,
  ];
  const junk = /ai\b|llm|artificial|intelligence|recognition|machine learning|natural language|computer vision|deep learning|submit|registration|cookies|privacy|challenge terms|winners|\bml\b/i;
  for (const re of patterns) {
    const m = re.exec(hay);
    const value = m && m[1] ? m[1].replace(/[.,\s]+$/, "").trim() : "";
    if (value.length >= 4 && value.length <= 48 && !junk.test(value)) return value;
  }
  return "";
}

/* ------------------------------------------------------------------ *
 * Web draft → Hackathon (feeds the accuracy engine exactly like other sources)
 * ------------------------------------------------------------------ */

export function webDraftToHackathon(draft: WebDraft, now: Date): Hackathon | null {
  if (!isSaneDate(draft.startDate) || !isSaneDate(draft.endDate)) return null;
  if (!isUsableEventUrl(draft.officialUrl)) return null;

  const nowIso = now.toISOString();
  const hash = createHash("sha1").update(draft.officialUrl).digest("hex").slice(0, 12);
  const id = `web-${hash}`;
  const announced = extractPrizeAnnouncement(draft.name, draft.prizeText, draft.description);
  const splitPrizes: Prize[] = announced.split
    ? [
        { amount: announced.split.cash, currency: "USD", type: "cash", label: "Cash prizes" },
        { amount: announced.split.credits, currency: "USD", type: "credits", label: "Cloud/API credits" },
      ]
    : [];
  const status = statusFor(draft.startDate, draft.endDate, now);

  return {
    id,
    slug: slugify(`${draft.name}-${hash}`).slice(0, 80),
    name: draft.name,
    description: (draft.description || draft.name).slice(0, 500),
    status,
    mode: draft.mode,
    organizer: draft.organizer || "Independent",
    startDate: draft.startDate,
    endDate: draft.endDate,
    registrationDeadline: status === "upcoming" ? undefined : draft.endDate,
    claimedPrizeUsd: announced.usd ?? undefined,
    claimedPrize: announced.nonUsd,
    prizeBreakdownPublished: Boolean(announced.split),
    location: draft.location || undefined,
    prizes: splitPrizes,
    totalPrizeUsd: 0,
    cashPrizeUsd: 0,
    creditPrizeUsd: 0,
    winners: [],
    tags: draft.tags.slice(0, 6),
    officialUrl: draft.officialUrl,
    sourceUrl: draft.sourceUrl || draft.officialUrl,
    sourceName: draft.sourceName,
    sourceId: draft.officialUrl,
    participants: draft.participants,
    firstSeenAt: nowIso,
    updatedAt: nowIso,
  };
}

/* ------------------------------------------------------------------ *
 * Winner "what they built" helpers
 * ------------------------------------------------------------------ */

const GENERIC_WINNER_PHRASES = [
  /devpost is (?:the|a)/i,
  /sign up|register(?: now| here)?/i,
  /join now|create an account/i,
  /hackathon community/i,
  /build and submit/i,
  /this page does not exist|page not found|we couldn't find/i,
  /view project|see the project/i,
  /participate in/i,
];

/** Only real, specific project descriptions pass. Generic copy is rejected. */
export function plausibleWinnerSummary(name: string, raw: string | undefined): string | null {
  const text = (raw ?? "").replace(/\s+/g, " ").trim();
  if (text.length < 20 || text.length > 320) return null;
  if (GENERIC_WINNER_PHRASES.some((re) => re.test(text))) return null;
  const lower = text.toLowerCase();
  if (lower === name.toLowerCase()) return null;
  if (lower.startsWith(name.toLowerCase()) && text.length < 60) return null;
  // Must not be a page that happens to share the site name.
  if (/^(ai hackathons|devpost|mlh|eventbrite)[\.:]/i.test(text)) return null;
  return text;
}

/** Picks the most project-specific description off a winner's page. */
export function winnerSummaryFromExtract(
  name: string,
  e: Pick<PageExtract, "ogTitle" | "ogDescription" | "metaDescription" | "paragraphs" | "title">,
): string | null {
  const candidates = [e.ogDescription, e.metaDescription, e.paragraphs[0], e.paragraphs[1], e.ogTitle];
  for (const candidate of candidates) {
    const summary = plausibleWinnerSummary(name, candidate);
    if (summary) return summary;
  }
  return null;
}

/** Winners we should try to enrich: have a project page but no summary yet. */
export function collectWinnerTargets(
  hackathons: Hackathon[],
  cached: WinnerSummaryEntry[],
): { url: string; project: string }[] {
  const cachedUrls = new Set(cached.map((c) => normalizeUrl(c.url)));
  const seen = new Set<string>();
  const targets: { url: string; project: string }[] = [];
  for (const h of hackathons) {
    for (const w of h.winners) {
      if (w.summary && w.summary.trim().length >= 12) continue;
      const url = w.url?.trim();
      if (!url || !isUsableEventUrl(url)) continue;
      const key = normalizeUrl(url);
      if (!key || seen.has(key) || cachedUrls.has(key)) continue;
      seen.add(key);
      targets.push({ url: key, project: w.project.trim() });
    }
  }
  return targets;
}

/** Merges cached summaries into winner records. Never overwrites a real source summary. */
export function applyWinnerSummaries(hackathons: Hackathon[], cached: WinnerSummaryEntry[]): number {
  const byUrl = new Map<string, string>();
  for (const entry of cached) {
    const key = normalizeUrl(entry.url);
    if (key && entry.summary) byUrl.set(key, entry.summary);
  }
  let filled = 0;
  for (const h of hackathons) {
    for (const w of h.winners) {
      if (w.summary && w.summary.trim().length >= 12) continue;
      const url = w.url ? normalizeUrl(w.url) : "";
      const summary = byUrl.get(url);
      if (summary) {
        w.summary = summary;
        filled += 1;
      }
    }
  }
  return filled;
}

/* ------------------------------------------------------------------ *
 * Runtime (puppeteer) — lazily loaded, never part of the Next build graph.
 * ------------------------------------------------------------------ */

export async function resolveChromePath(): Promise<string | null> {
  const fromEnv = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (fromEnv && (await exists(fromEnv))) return fromEnv;

  const candidates: string[] = [];
  if (process.platform === "win32") {
    candidates.push(
      `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`,
      `${process.env["PROGRAMFILES(X86)"]}\\Google\\Chrome\\Application\\chrome.exe`,
      `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
      `${process.env.PROGRAMFILES}\\Microsoft\\Edge\\Application\\msedge.exe`,
      `${process.env["PROGRAMFILES(X86)"]}\\Microsoft\\Edge\\Application\\msedge.exe`,
    );
  } else if (process.platform === "darwin") {
    candidates.push(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    );
  } else {
    candidates.push("/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable");
  }

  for (const candidate of candidates) {
    if (candidate && (await exists(candidate))) return candidate;
  }

  return null;
}

async function exists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

export interface ScrapeSettings {
  maxEvents: number;
  maxWinners: number;
  disableWinners: boolean;
  headful: boolean;
}

export function scrapeSettings(): ScrapeSettings {
  return {
    maxEvents: Number(process.env.SCRAPE_MAX_EVENTS ?? 80),
    maxWinners: Number(process.env.SCRAPE_MAX_WINNERS ?? 60),
    disableWinners: process.env.SCRAPE_WINNERS === "0",
    headful: process.env.SCRAPE_HEADFUL === "1",
  };
}

export interface ScrapeReport {
  searchCandidates: number;
  listingCandidates: number;
  visited: number;
  drafts: number;
  winners: number;
  winnerSummaries: number;
  error?: string;
}

/* ------------------------------------------------------------------ *
 * Searching and listing like a person
 * ------------------------------------------------------------------ */

const SEED_SITES: { label: string; url: string }[] = [
  { label: "MLH", url: "https://mlh.io/seasons/2026/events" },
  { label: "Unstop", url: "https://www.unstop.com/hackathons" },
  { label: "Eventbrite", url: "https://www.eventbrite.com/d/worldwide/ai--hackathon/" },
  { label: "Hackathon.com", url: "https://hackathon.com/" },
  { label: "Kaggle", url: "https://www.kaggle.com/competitions" },
  { label: "lablab.ai", url: "https://lablab.ai/ai-hackathons" },
  { label: "Devpost", url: "https://devpost.com/hackathons?challenge_type=online" },
];

const SEARCH_QUERIES = [
  "AI hackathon 2026",
  "generative AI hackathon prizes 2026",
  "machine learning hackathon open registration",
  "LLM hackathon online worldwide",
  "AI hackathon artificial intelligence university",
  "data science hackathon competition 2026",
];

const REGION_QUERIES = [
  "AI hackathon Nigeria 2026",
  "GenAI hackathon India 2026",
  "AI hackathon Singapore 2026",
  "Generative AI competition Brazil 2026",
  "AI hackathon London university 2026",
  "LLM hackathon Dubai 2026",
  "Computer vision hackathon Mexico 2026",
  "AI competition Germany university 2026",
  "AI hackathon Kenya Nairobi 2026",
  "Machine learning hackathon Indonesia 2026",
  "AI hackathon Canada 2026",
  "AI hackathon UAE women 2026",
];

const SITE_SEARCH_QUERIES = [
  "site:mlh.io AI hackathon",
  "site:eventbrite.com AI hackathon",
  "site:unstop.com hackathon",
  "site:kaggle.com AI competition",
  "site:hackathon.com hackathon",
  "site:lablab.ai AI hackathon",
];

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const log = (...args: unknown[]) =>
  console.log(`[scrape ${new Date().toISOString()}]`, ...args);

export async function newBrowserPage(browser: import("puppeteer-core").Browser) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 900 });
  await page.setUserAgent(UA);
  await page.setExtraHTTPHeaders({ "accept-language": "en-US,en;q=0.9" });
  await page.setDefaultNavigationTimeout(45_000);
  return page;
}

/**
 * esbuild (run through tsx) rewrites named functions into
 * `const fn = __name(...,"fn")` / `__name(fn,"fn")` pairs to preserve names.
 * Those helpers exist at module scope in Node but not inside the page, so we
 * serialise the callback to a string, drop the `__name(...)` calls and run it
 * as an IIFE in the browser.
 */
function browserScript(fn: () => unknown): string {
  const src = Function.prototype.toString.call(fn).replace(/\s*__name\([^)]*\);/g, "");
  return `(${src})()`;
}

async function evaluateScript<T>(page: import("puppeteer-core").Page, fn: () => T): Promise<T> {
  return page.evaluate(browserScript(fn)) as Promise<T>;
}

async function humanMouse(page: import("puppeteer-core").Page): Promise<void> {
  const viewport = page.viewport();
  if (!viewport) return;
  const x = randomBetween(120, viewport.width - 120);
  const y = randomBetween(100, viewport.height - 90);
  await page.mouse.move(x, y, { steps: randomBetween(9, 20) });
  await humanPause(250, 700);
}

async function humanScroll(page: import("puppeteer-core").Page): Promise<void> {
  const height =
    (await page.evaluate(
      () => document.body?.scrollHeight || document.documentElement?.scrollHeight || 0,
    )) || 0;
  if (height <= 900) {
    await page.evaluate((y) => window.scrollTo(0, y), randomBetween(40, Math.max(0, height - 80)));
    await humanPause(350, 900);
    return;
  }
  const stops = [
    Math.floor(height * 0.3),
    Math.floor(height * 0.6),
    Math.floor(height * 0.85),
    0,
  ];
  for (const y of stops) {
    await page.evaluate((y) => window.scrollTo(0, y), y);
    await humanPause(300, 900);
  }
}

export async function gotoLikeHuman(
  page: import("puppeteer-core").Page,
  url: string,
  longPause = false,
): Promise<void> {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await humanPause(longPause ? 1700 : 1100, longPause ? 3400 : 2300);
  await humanMouse(page);
  await humanScroll(page);
  await humanPause(600, 1400);
}

async function collectSearchLinks(page: import("puppeteer-core").Page): Promise<{ url: string; text: string }[]> {
  return evaluateScript(page, () => {
    function decodeSearchUrl(ref: string): string {
      const ddg = /[?&]uddg=([^&]+)/.exec(ref);
      if (ddg) {
        try {
          return decodeURIComponent(ddg[1]);
        } catch {
          return ref;
        }
      }
      const bing = /[?&]u=a1([^&]+)/.exec(ref);
      if (bing) {
        try {
          const s = bing[1].replace(/-/g, "+").replace(/_/g, "/");
          const raw = atob(s + "===".slice((s.length % 4) || 4));
          return decodeURIComponent(escape(raw));
        } catch {
          return ref;
        }
      }
      return ref;
    }
    const out: { url: string; text: string }[] = [];
    for (const a of document.querySelectorAll<HTMLAnchorElement>("a[href]")) {
      const href = decodeSearchUrl(a.href || "");
      const text = (a.innerText ?? "").replace(/\s+/g, " ").trim();
      if (!href.startsWith("http")) continue;
      let host = "";
      try {
        host = new URL(href).hostname;
      } catch {
        continue;
      }
      if (
        /google\.|gstatic\.|bing\.|duckduckgo\.|microsoft\.|youtube\.|reddit\.|twitter\.|facebook\.|linkedin\.|instagram\.|medium\.|github\.com/.test(host)
      )
        continue;
      if (text.length < 10) continue;
      out.push({ url: href, text: text.slice(0, 140) });
    }
    return out;
  });
}

async function searchGoogle(page: import("puppeteer-core").Page, query: string) {
  const url = `https://www.google.com/search?hl=en&gl=us&q=${encodeURIComponent(query)}&num=20`;
  try {
    await gotoLikeHuman(page, url, true);
    const blocked = page.url().includes("/sorry/");
    if (blocked) return [];
    return await collectSearchLinks(page);
  } catch {
    return [];
  }
}

async function searchDuckDuckGo(page: import("puppeteer-core").Page, query: string) {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  try {
    await gotoLikeHuman(page, url, true);
    return await collectSearchLinks(page);
  } catch {
    return [];
  }
}

async function searchBing(page: import("puppeteer-core").Page, query: string) {
  const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=20`;
  try {
    await gotoLikeHuman(page, url, true);
    return await collectSearchLinks(page);
  } catch {
    return [];
  }
}

async function searchQuery(page: import("puppeteer-core").Page, query: string) {
  const google = await searchGoogle(page, query);
  if (google.length >= 3) return google;
  const duck = await searchDuckDuckGo(page, query);
  if (duck.length >= 3) return duck;
  return searchBing(page, query);
}

async function collectListingLinks(
  page: import("puppeteer-core").Page,
  seedUrl: string,
): Promise<{ url: string; text: string }[]> {
  try {
    await gotoLikeHuman(page, seedUrl);
  } catch {
    return [];
  }
  const links = await evaluateScript(page, () => {
    const out: { url: string; text: string }[] = [];
    for (const a of document.querySelectorAll<HTMLAnchorElement>("a[href]")) {
      const href = a.href || "";
      const text = (a.innerText ?? "").replace(/\s+/g, " ").trim();
      if (!href.startsWith("http") || text.length < 8) continue;
      out.push({ url: href, text: text.slice(0, 140) });
    }
    return out;
  });
  return links.filter((l) => isUsableEventUrl(l.url) && isLikelyEventPath(l.url));
}

export function pickQueries(): string[] {
  // Worldwide coverage with no regional cap: every run searches the full set
  // of global topic queries plus every country/region query. Quality is still
  // guaranteed downstream — only the accuracy engine decides what ships.
  return [...SEARCH_QUERIES, ...SITE_SEARCH_QUERIES, ...REGION_QUERIES];
}

async function visitPage(page: import("puppeteer-core").Page, url: string): Promise<PageExtract> {
  await gotoLikeHuman(page, url);
  return evaluateScript(page, extractFromDom);
}

export async function runWinnerPass(
  page: import("puppeteer-core").Page,
  max: number,
  now: Date,
): Promise<{ stored: number; visited: number }> {
  const { readDataset } = await import("./store");
  const dataset = await readDataset();
  const existing = await loadWinnerSummaries();
  const targets = shuffle(collectWinnerTargets(dataset.hackathons, existing)).slice(0, max);
  if (targets.length === 0) return { stored: existing.length, visited: 0 };

  const entries: WinnerSummaryEntry[] = [...existing];
  let visited = 0;
  for (const target of targets) {
    try {
      const extract = await visitPage(page, target.url);
      const summary = winnerSummaryFromExtract(target.project, extract);
      if (summary) {
        entries.push({ url: target.url, project: target.project, summary });
      }
      visited += 1;
    } catch (error) {
      log(`winner page failed ${target.url}`, (error as Error).message);
    }
    await humanPause(1300, 3200);
  }

  const merged = new Map<string, WinnerSummaryEntry>();
  for (const entry of entries) {
    const key = normalizeUrl(entry.url);
    if (!merged.has(key)) merged.set(key, entry);
  }
  const finalEntries = [...merged.values()];
  await writeJson(WINNER_SUMMARIES_FILE, { collectedAt: now.toISOString(), entries: finalEntries });
  log(`winner summaries stored: ${finalEntries.length} (visited ${visited})`);
  return { stored: finalEntries.length, visited };
}

export async function launchScraperBrowser(settings: ScrapeSettings) {
  const executablePath = await resolveChromePath();
  if (!executablePath) {
    throw new Error(
      "No Chrome/Edge found. Install one or set PUPPETEER_EXECUTABLE_PATH. In CI, run: npx puppeteer browsers install chrome",
    );
  }
  const { default: puppeteer } = await import("puppeteer-core");
  return puppeteer.launch({
    executablePath,
    headless: !settings.headful,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--window-size=1366,900",
    ],
    defaultViewport: { width: 1366, height: 900 },
  });
}

export async function runWebScrape(settings: ScrapeSettings = scrapeSettings()): Promise<ScrapeReport> {
  const now = new Date();
  const report: ScrapeReport = {
    searchCandidates: 0,
    listingCandidates: 0,
    visited: 0,
    drafts: 0,
    winners: 0,
    winnerSummaries: 0,
  };

  const browser = await launchScraperBrowser(settings);
  try {
    const page = await newBrowserPage(browser);
    const candidates: { url: string; text: string }[] = [];

    // 1. Search engines, like a person searching the web. Only results that
    // actually describe an event are kept — corporate/tips never get visited.
    for (const query of pickQueries()) {
      log(`searching: ${query}`);
      const results = await searchQuery(page, query);
      for (const r of results) {
        if (!isUsableEventUrl(r.url)) continue;
        if (!/hackathon|hack|competition|challenge|ai|machine|llm|genai|build/i.test(r.text)) continue;
        try {
          const host = new URL(r.url).hostname.replace(/^www\./, "");
          const hubHost =
            /(hackathon\.com|eventbrite\.com|lablab\.ai|devpost\.com|kaggle\.com|mlh\.io|unstop\.com)$/.test(host);
          if (hubHost && !isLikelyEventPath(r.url)) continue;
        } catch {
          continue;
        }
        candidates.push(r);
      }
      report.searchCandidates += results.length;
      await humanPause(2200, 4800);
    }

    // 2. Authentic listing sites, all worldwide hubs; candidates are deduped below.
    for (const seed of shuffle(SEED_SITES)) {
      log(`reading listing: ${seed.url}`);
      const links = await collectListingLinks(page, seed.url);
      const onSite = links.filter((l) => {
        try {
          return new URL(l.url).hostname === new URL(seed.url).hostname;
        } catch {
          return false;
        }
      });
      candidates.push(...onSite);
      report.listingCandidates += onSite.length;
      await humanPause(2000, 4200);
    }

    const ranked = rankCandidates(dedupeCandidates(candidates));
    log(`candidates ready: ${ranked.length}`);

    // 3. Visit the most promising pages, extract honestly, keep AI events.
    const drafts: WebDraft[] = [];
    for (const candidate of ranked) {
      if (drafts.length >= settings.maxEvents) break;
      try {
        const extract = await visitPage(page, candidate.url);
        report.visited += 1;
        const draft = buildWebDraft(siteNameFor(candidate.url), extract, now);
        if (draft) {
          drafts.push(draft);
          report.drafts += 1;
          log(`draft ${report.drafts}/${settings.maxEvents}: ${draft.name}`);
        }
      } catch (error) {
        log(`visit failed ${candidate.url}`, (error as Error).message);
      }
      await humanPause(1500, 3400);
    }

    await writeJson(WEB_DRAFTS_FILE, { collectedAt: now.toISOString(), records: drafts });
    log(`web drafts written: ${drafts.length}`);

    // 4. Winner pass: "what they built" for winners missing a summary.
    if (!settings.disableWinners) {
      const result = await runWinnerPass(page, settings.maxWinners, now);
      report.winners = result.visited;
      report.winnerSummaries = result.stored;
    }
  } catch (error) {
    report.error = (error as Error).message;
    log("web scrape failed", report.error);
  } finally {
    await browser.close();
  }
  return report;
}