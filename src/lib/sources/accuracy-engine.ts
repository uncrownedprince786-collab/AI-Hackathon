/**
 * Key-free accuracy engine.
 *
 * Every collected record is scored with plain rules — no API keys, no models.
 * The score is written to logs only: it is never stored in the dataset and
 * never rendered anywhere, so visitors only ever see records that passed.
 *
 * Signals and weights (total 100):
 *   34  AI relevance      name / platform themes / real description / source
 *   16  Link quality      real event URL, known hackathon platform
 *   16  Prize integrity   stated pool captured, sums consistent, honest flags
 *   16  Dates & status    both dates, sane window, status matches the dates
 *   12  Completeness      real description, organizer, location, evidence
 *    6  Organizer name    clean, not a placeholder
 *
 * Verdicts: >= 75 publish, 50-74 hold back, < 50 reject. A hard rule can
 * reject a record regardless of score (no AI evidence, missing dates, broken
 * link, duplicate, "non-ai" in the text).
 */
import { cleanOrganizerName } from "./ai-signals";
import { extractPrizeAnnouncement } from "./prize-extract";
import { detectCountry } from "../geo";
import { curatedHackathons } from "@/data/curated";
import type { Hackathon } from "../types";

export const PUBLISH_THRESHOLD = 75;
export const REVIEW_THRESHOLD = 50;

export type AccuracyVerdict = "publish" | "review" | "reject";

export interface AccuracyReport {
  id: string;
  name: string;
  score: number;
  verdict: AccuracyVerdict;
  /** Log text only. Never stored, never rendered. */
  reasons: string[];
  /** Set when a hard rule rejected the record regardless of score. */
  hardReject?: string;
}

export interface AccuracyResult {
  published: Hackathon[];
  held: Hackathon[];
  reports: AccuracyReport[];
  summary: {
    total: number;
    published: number;
    held: number;
    rejected: number;
    /** Counts of the main rejection causes, for the refresh log. */
    causes: { cause: string; count: number }[];
  };
}

/* ------------------------------------------------------------------ *
 * Text helpers
 * ------------------------------------------------------------------ */

export function stripHtml(text: string | undefined | null): string {
  return (text ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The placeholder Devpost listing copy, written before the detail page is read. */
const SYNTHETIC_DESCRIPTION = /^AI hackathon hosted on Devpost by/i;

function isSyntheticDescription(text: string): boolean {
  return SYNTHETIC_DESCRIPTION.test(text.trim());
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasWord(text: string, word: string): boolean {
  const cleaned = word.trim().toLowerCase();
  if (!cleaned) return false;
  const pattern = `\\b${escapeRegExp(cleaned)}s?\\b`;
  return new RegExp(pattern, "i").test(text);
}

/* ------------------------------------------------------------------ *
 * AI relevance
 * ------------------------------------------------------------------ */

/** Phrases that prove AI focus on their own. Word boundaries, no substrings. */
const AI_PHRASES = [
  "artificial intelligence",
  "machine learning",
  "deep learning",
  "generative ai",
  "generative artificial intelligence",
  "large language model",
  "machine learning/ai",
  "computer vision",
  "natural language processing",
  "natural language understanding",
  "neural network",
  "neural machine",
  "data science",
  "prompt engineering",
  "retrieval augmented generation",
  "ai agent",
  "ai agents",
  "agentic ai",
  "mlops",
  "a i",
  "gen ai",
  "ml/ai",
  "ai/ml",
  "artificial intelligence/ai",
  "diffusion model",
  "vision language model",
  "foundation model",
  "speech recognition",
  "image generation",
  "text generation",
  "recommendation system",
  "predictive model",
  "autonomous vehicle",
  "robotics",
];

const AI_WORDS = [
  "ai",
  "a.i",
  "llm",
  "llms",
  "gpt",
  "genai",
  "chatgpt",
  "openai",
  "claude",
  "gemini",
  "copilot",
  "chatbot",
  "chatbots",
  "agentic",
  "agent",
  "agents",
  "nlp",
  "rag",
  "mlops",
  "pytorch",
  "tensorflow",
  "huggingface",
  "hugging face",
  "midjourney",
  "diffusion",
  "kaggle",
  "anthropic",
  "mistral",
  "llama",
  "bert",
  "transformer",
  "stablediffusion",
  "stable diffusion",
  "dalle",
  "dall-e",
  "whisper",
  "langchain",
  "vector database",
  "embeddings",
  "inference",
  "ml",
  "prompt",
  "prompts",
  "elevenlabs",
  "perplexity",
  "deepseek",
  "cohere",
  "ai21",
  "sagemaker",
  "vertex ai",
  "watson",
  "synthesia",
  "heygen",
  "computer vision",
];

/**
 * "SmartAIthon", "AICore", "xAI": an uppercase AI glued to a normal word is a
 * real signal, while THAILAND, RAIL and MAINTAIN are not.
 */
const CAMEL_AI = /(?<![A-Z])AI[a-z]|[a-z]AI(?![A-Z])|(?<![A-Z])AI(?=[A-Z][a-z])/;

/** Explicitly not an AI event. Anything here is a hard reject. */
const NOT_AI_PATTERNS = [
  /\bnon[- ]?ai\b/i,
  /\bnot (?:an? )?ai\b/i,
  /\bai[- ]free\b/i,
  /\bwithout (?:any )?ai\b/i,
  /\bno ai (?:allowed|needed|usage)\b/i,
];

const AI_THEME_NAME_PATTERNS = [
  "artificial intelligence",
  "machine learning",
  "ai",
  "llm",
  "generative",
  "computer vision",
  "nlp",
  "data science",
  "deep learning",
  "agents",
];

function aiHit(text: string): { hit: boolean; terms: string[] } {
  const original = stripHtml(text);
  const haystack = original.toLowerCase();
  if (!haystack) return { hit: false, terms: [] };
  const terms = new Set<string>();
  for (const phrase of AI_PHRASES) {
    if (new RegExp(`\\b${escapeRegExp(phrase)}\\b`, "i").test(haystack)) terms.add(phrase);
  }
  for (const word of AI_WORDS) {
    if (hasWord(haystack, word)) terms.add(word);
  }
  if (CAMEL_AI.test(original)) terms.add("AI in a compound name");
  return { hit: terms.size > 0, terms: [...terms] };
}

/** How often AI terms appear anywhere in the prose. A heavy mention is real focus. */
function countAiOccurrences(text: string): number {
  const haystack = stripHtml(text).toLowerCase();
  if (!haystack) return 0;
  let count = 0;
  for (const phrase of AI_PHRASES) {
    const re = new RegExp(`\\b${escapeRegExp(phrase)}\\b`, "gi");
    count += (haystack.match(re) ?? []).length;
  }
  for (const word of AI_WORDS) {
    const re = new RegExp(`\\b${escapeRegExp(word)}\\b`, "gi");
    count += (haystack.match(re) ?? []).length;
  }
  if (CAMEL_AI.test(text)) count += 1;
  return count;
}

function themeHit(h: Hackathon): boolean {
  const names = (h.tags ?? []).map((t) => stripHtml(t).toLowerCase()).filter(Boolean);
  if (!names.length) return false;
  return names.some(
    (n) => AI_THEME_NAME_PATTERNS.some((p) => hasWord(n, p) || n.includes(`${p}/`) || n.includes(`/${p}`)),
  );
}

function sourceIsAiOnly(h: Hackathon): boolean {
  const source = (h.sourceName ?? "").toLowerCase();
  return source.includes("lablab") || source.includes("ai hackathon");
}

function domainIsAiFocused(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return [
      "openai.com",
      "anthropic.com",
      "huggingface.co",
      "deepmind.google",
      "ai21.com",
      "cohere.com",
      "mistral.ai",
      "midjourney.com",
      "stability.ai",
    ].some((d) => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

function scoreAiRelevance(h: Hackathon): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  const description = stripHtml(h.description);
  const realDescription = !isSyntheticDescription(description) && description.length >= 40;

  const name = aiHit(h.name);
  const tags = aiHit((h.tags ?? []).join(" "));
  const desc = realDescription ? aiHit(description) : { hit: false, terms: [] };

  let score = 0;

  if (name.hit) {
    score += 16;
    reasons.push("AI term in the title");
  }

  if (themeHit(h) || tags.hit) {
    score += 16;
    reasons.push("AI theme or track");
  } else if (sourceIsAiOnly(h)) {
    score += 6;
    reasons.push("AI-only platform");
  }

  if (desc.hit) {
    score += 7;
    reasons.push("AI terms in the description");
  }

  if (!name.hit && domainIsAiFocused(h.officialUrl ?? "")) {
    score += 6;
    reasons.push("AI organisation domain");
  }

  const distinct = new Set([...name.terms, ...tags.terms, ...desc.terms]);
  if (distinct.size >= 3) {
    score += 3;
    reasons.push("several distinct AI terms");
  } else if (distinct.size === 2) {
    score += 2;
    reasons.push("two distinct AI terms");
  }

  if (realDescription) {
    const mentions = countAiOccurrences(description);
    if (mentions >= 6) {
      score += 8;
      reasons.push("repeated AI terms in the description");
    } else if (mentions >= 3) {
      score += 4;
      reasons.push("several AI mentions in the description");
    }
  }

  return { score: Math.min(34, score), reasons };
}

export function hasAnyAiSignal(h: Hackathon): boolean {
  const description = stripHtml(h.description);
  const real = !isSyntheticDescription(description) && description.length >= 40;
  return (
    aiHit(h.name).hit ||
    aiHit((h.tags ?? []).join(" ")).hit ||
    (real && aiHit(description).hit) ||
    themeHit(h) ||
    sourceIsAiOnly(h) ||
    domainIsAiFocused(h.officialUrl ?? "")
  );
}

export function isExplicitlyNotAi(...texts: (string | undefined)[]): boolean {
  const haystack = texts.filter(Boolean).join(" ").toLowerCase();
  return NOT_AI_PATTERNS.some((p) => p.test(haystack));
}

/* ------------------------------------------------------------------ *
 * Link quality
 * ------------------------------------------------------------------ */

const KNOWN_PLATFORMS = [
  "devpost.com",
  "lablab.ai",
  "mlh.io",
  "devfolio.co",
  "dorahacks.io",
  "ethglobal.com",
  "hackathon.com",
  "kaggle.com",
  "github.com",
  "gitcoin.co",
  "taikai.network",
  "hl.dev",
  "lumx.io",
  "crevinal.com",
  "hackerearth.com",
  "coderbounty.com",
  "devpost.io",
  "showcase",
];

const SHORTENERS = [
  "bit.ly",
  "tinyurl.com",
  "t.co",
  "goo.gl",
  "rb.gy",
  "is.gd",
  "cutt.ly",
  "ow.ly",
  "rebrand.ly",
  "lnkd.in",
  "buff.ly",
  "shorturl.at",
  "trib.al",
  "bl.ink",
];

/** Addresses that are never an event's own page (a map, a profile, a share link). */
const NOT_EVENT_HOSTS = [
  "maps.google.com",
  "map.google.com",
  "google.com",
  "linktr.ee",
  "linktail.com",
  "instagram.com",
  "facebook.com",
  "fb.com",
  "twitter.com",
  "x.com",
  "linkedin.com",
  "wa.me",
  "whatsapp.com",
  "calendly.com",
  "forms.gle",
];

export function normalizeUrl(raw: string | undefined): string {
  if (!raw) return "";
  try {
    const url = new URL(raw.trim());
    url.hash = "";
    const kept: string[] = [];
    for (const [key, value] of url.searchParams) {
      if (/^(utm_|fbclid|gclid|ref$|ref_|mc_cid|mc_eid|igshid|oly_anon_id|oly_enc_id)/i.test(key)) {
        continue;
      }
      kept.push(`${key}=${value}`);
    }
    const query = kept.length ? `?${kept.join("&")}` : "";
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const path = url.pathname.replace(/\/+$/, "");
    return `${url.protocol}//${host}${path}${query}`;
  } catch {
    return "";
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function scoreLink(h: Hackathon): { score: number; reasons: string[]; missing: boolean } {
  const reasons: string[] = [];
  const url = (h.officialUrl ?? "").trim();
  let parsed: URL | null = null;
  try {
    parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") parsed = null;
  } catch {
    parsed = null;
  }

  if (!parsed) return { score: 0, reasons: ["no usable event link"], missing: true };

  if (!isUsableEventUrl(url)) {
    return { score: 2, reasons: ["link is not an event page"], missing: false };
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  let score = 6;
  reasons.push("valid event link");

  if (KNOWN_PLATFORMS.some((p) => host === p || host.endsWith(`.${p}`))) {
    score += 7;
    reasons.push("known hackathon platform");
  } else if (host.includes(".") && host.length <= 253) {
    score += 2;
    reasons.push("own domain");
  }

  if ((h.sourceUrl ?? "").trim() && normalizeUrl(h.sourceUrl) !== normalizeUrl(url)) {
    score += 3;
    reasons.push("separate source link");
  } else if ((h.sourceUrl ?? "").trim()) {
    score += 1;
  }

  return { score: Math.min(16, score), reasons, missing: false };
}

export function isShortenedLink(url: string | undefined): boolean {
  const host = hostOf(url ?? "");
  if (!host) return false;
  return SHORTENERS.some((s) => host === s || host.endsWith(`.${s}`));
}

/**
 * True when the URL looks like an event or organizer page and not a map link,
 * a social profile, a form or a shortened redirect.
 */
export function isUsableEventUrl(url: string | undefined): boolean {
  if (!url) return false;
  if (isShortenedLink(url)) return false;
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  } catch {
    return false;
  }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  if (!host.includes(".")) return false;
  if (host === "google.com" && (parsed.pathname.startsWith("/maps") || parsed.searchParams.has("q"))) {
    return false;
  }
  if (NOT_EVENT_HOSTS.some((n) => host === n || host.endsWith(`.${n}`))) return false;
  return true;
}

/* ------------------------------------------------------------------ *
 * Prize integrity
 * ------------------------------------------------------------------ */

function scorePrizes(h: Hackathon): { score: number; reasons: string[]; problems: string[] } {
  const reasons: string[] = [];
  const problems: string[] = [];
  let score = 10;

  const claimed = h.claimedPrizeUsd ?? 0;
  const total = h.totalPrizeUsd ?? 0;
  const cash = h.cashPrizeUsd ?? 0;
  const credits = h.creditPrizeUsd ?? 0;
  const stated = extractPrizeAnnouncement(h.name, stripHtml(h.description)).usd ?? 0;
  const hasAnything =
    claimed > 0 ||
    total > 0 ||
    cash > 0 ||
    credits > 0 ||
    h.prizes.length > 0 || Boolean(h.claimedPrize);

  if (hasAnything) {
    score += 3;
    reasons.push("prize figure present");
  }

  if (stated > 0 && claimed > 0) {
    score += 3;
    reasons.push("stated pool captured");
  } else if (stated > 0 && claimed === 0) {
    score -= 5;
    problems.push("pool stated in the text but not stored");
  }

  if (claimed > 0 && total > 0 && total > claimed * 3) {
    score -= 4;
    problems.push("total is far above the announced pool");
  }

  if (cash > 0 && claimed > 0 && cash > claimed * 1.5) {
    score -= 3;
    problems.push("cash exceeds the announced pool");
  }

  if (h.prizeBreakdownPublished && cash === 0) {
    score -= 3;
    problems.push("breakdown claimed but no cash listed");
  }

  if (h.prizes.some((p) => !Number.isFinite(p.amount) || p.amount < 0)) {
    score -= 3;
    problems.push("negative or invalid prize entry");
  }

  const itemised = h.prizes.reduce((sum, p) => sum + (p.amount || 0), 0);
  if (itemised > 0 && total > itemised * 5 && cash === 0 && credits === 0) {
    score -= 2;
    problems.push("headline pool with no matching breakdown");
  }

  if (problems.length === 0 && hasAnything) reasons.push("prize figures consistent");

  return { score: Math.max(0, Math.min(16, score)), reasons, problems };
}

/* ------------------------------------------------------------------ *
 * Dates and status
 * ------------------------------------------------------------------ */

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function isSaneDate(value: string | undefined): boolean {
  return !!value && ISO.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function deriveStatus(h: Hackathon, now: Date): Hackathon["status"] {
  const today = now.toISOString().slice(0, 10);
  if (h.endDate < today) return "past";
  if (h.startDate <= today) return "ongoing";
  return "upcoming";
}

function scoreDates(h: Hackathon, now: Date): {
  score: number;
  reasons: string[];
  missing: boolean;
} {
  const reasons: string[] = [];
  const start = h.startDate;
  const end = h.endDate;

  if (!isSaneDate(start) || !isSaneDate(end)) {
    return { score: 0, reasons: ["missing or unreadable dates"], missing: true };
  }

  let score = 6;
  reasons.push("start and end dates present");

  if (end >= start) {
    score += 4;
    reasons.push("date order is correct");
  } else {
    score -= 4;
    reasons.push("end date is before the start date");
  }

  const nowMs = now.getTime();
  const sixYearsAgo = new Date(nowMs - 6 * 365.25 * 86_400_000).toISOString().slice(0, 10);
  const twoYearsAhead = new Date(nowMs + 2 * 365.25 * 86_400_000).toISOString().slice(0, 10);
  if (start >= sixYearsAgo && end <= twoYearsAhead) {
    score += 4;
    reasons.push("dates are within a believable range");
  } else {
    score -= 6;
    reasons.push("dates are outside a believable range");
  }

  if (h.registrationDeadline && isSaneDate(h.registrationDeadline)) {
    const slack = 60 * 86_400_000;
    const endMs = Date.parse(`${end}T00:00:00Z`);
    const deadlineMs = Date.parse(`${h.registrationDeadline}T00:00:00Z`);
    if (deadlineMs <= endMs + slack) {
      score += 2;
      reasons.push("registration deadline fits the event window");
    }
  }

  if (h.status !== deriveStatus(h, now)) score -= 2;

  return { score: Math.max(0, Math.min(16, score)), reasons, missing: false };
}

/* ------------------------------------------------------------------ *
 * Completeness and organizer
 * ------------------------------------------------------------------ */

function scoreCompleteness(h: Hackathon): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  const description = stripHtml(h.description);
  const real = !isSyntheticDescription(description);
  if (real && description.length >= 160) {
    score += 4;
    reasons.push("full description");
  } else if (real && description.length >= 80) {
    score += 2;
    reasons.push("short description");
  }

  const organizer = cleanOrganizerName(h.organizer);
  if (organizer && !isPlaceholderOrganizer(organizer)) {
    score += 3;
    reasons.push("organizer named");
  }

  const location = stripHtml(h.location);
  const onlineish = h.mode === "online" || /^(online|virtual|remote|anywhere|worldwide|internet)/i.test(location);
  if (onlineish || location) {
    score += 1;
    if (h.country) score += 2;
    else if (!onlineish && location) score += 1;
    else if (onlineish) score += 1;
  }

  const evidence =
    (h.participants ?? 0) > 0 ||
    (h.submissions ?? 0) > 0 ||
    h.winners.length > 0 ||
    h.tags.length >= 2;
  if (evidence) {
    score += 2;
    reasons.push("participants, winners or topics listed");
  }

  return { score: Math.max(0, Math.min(12, score)), reasons };
}

const PLACEHOLDER_ORGANIZERS = new Set([
  "independent",
  "nill",
  "nil",
  "tbd",
  "tba",
  "unknown",
  "admin",
  "administrator",
  "user",
  "test",
  "testing",
  "none",
  "null",
  "n/a",
  "na",
  "no",
  "yes",
  "hackathon",
  "event",
  "events",
  "organizer",
  "organisation",
  "organization",
  "org",
  "team",
  "host",
]);

export function isPlaceholderOrganizer(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (!v) return true;
  if (PLACEHOLDER_ORGANIZERS.has(v)) return true;
  if (/^\d+$/.test(v)) return true;
  if (!/[a-z]/i.test(v)) return true;
  if (/^[_\W]+$/.test(v)) return true;
  return false;
}

function scoreOrganizer(h: Hackathon): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  const organizer = cleanOrganizerName(h.organizer);
  let score = 0;

  if (organizer && !isPlaceholderOrganizer(organizer)) {
    score += 3;
    reasons.push("organizer cleaned");
    if (organizer.length <= 45) score += 2;
    if (!/[|]{2,}| {4,}|\.{4,}/.test(organizer)) score += 1;
  } else if (organizer) {
    reasons.push("organizer is a placeholder");
  } else {
    reasons.push("no organizer");
  }

  return { score: Math.max(0, Math.min(6, score)), reasons };
}

/* ------------------------------------------------------------------ *
 * Hard rules
 * ------------------------------------------------------------------ */

function hardRejectReason(h: Hackathon): string | undefined {
  const name = stripHtml(h.name);
  if (!name || name.length < 8) return "title is too short or missing";
  if (!isSaneDate(h.startDate) || !isSaneDate(h.endDate)) return "missing dates";
  if (!isUsableEventUrl(h.officialUrl) && !isUsableEventUrl(h.sourceUrl)) {
    return "no usable event link";
  }
  if (isExplicitlyNotAi(h.name, stripHtml(h.description), (h.tags ?? []).join(" "))) {
    return "marked as not an AI event";
  }
  if (!hasAnyAiSignal(h)) return "no AI evidence in the listing";
  return undefined;
}

/* ------------------------------------------------------------------ *
 * Scoring
 * ------------------------------------------------------------------ */

export function scoreRecord(input: Hackathon, now = new Date()): AccuracyReport {
  const h = prepareRecord(input, now);
  const reasons: string[] = [];

  const ai = scoreAiRelevance(h);
  const link = scoreLink(h);
  const prizes = scorePrizes(h);
  const dates = scoreDates(h, now);
  const completeness = scoreCompleteness(h);
  const organizer = scoreOrganizer(h);

  reasons.push(...ai.reasons, ...link.reasons, ...prizes.reasons, ...dates.reasons);
  reasons.push(...completeness.reasons, ...organizer.reasons);

  const score = Math.round(
    Math.max(0, Math.min(100, ai.score + link.score + prizes.score + dates.score + completeness.score + organizer.score)),
  );

  const hard = hardRejectReason(h);
  if (hard) {
    return { id: h.id, name: h.name, score, verdict: "reject", reasons, hardReject: hard };
  }

  const verdict: AccuracyVerdict =
    score >= PUBLISH_THRESHOLD ? "publish" : score >= REVIEW_THRESHOLD ? "review" : "reject";
  return { id: h.id, name: h.name, score, verdict, reasons };
}

/* ------------------------------------------------------------------ *
 * Source-derived fixes
 *
 * Only values that already exist in the collected text are used. Nothing is
 * guessed: an empty field stays empty.
 * ------------------------------------------------------------------ */

export function prepareRecord(input: Hackathon, now = new Date()): Hackathon {
  const h: Hackathon = { ...input };

  // A link that is really a map, a profile or a shortener is replaced by the
  // collected source page when that one is usable. Both come from the source.
  if (!isUsableEventUrl(h.officialUrl) && isUsableEventUrl(h.sourceUrl)) {
    h.officialUrl = h.sourceUrl;
  }

  h.name = stripHtml(h.name).slice(0, 160);
  h.description = stripHtml(h.description).slice(0, 1200);

  const organizer = cleanOrganizerName(h.organizer);
  h.organizer = organizer && !isPlaceholderOrganizer(organizer) ? organizer : "";

  const announced = extractPrizeAnnouncement(h.name, h.description);
  if (announced.usd) h.claimedPrizeUsd = Math.max(h.claimedPrizeUsd ?? 0, announced.usd);
  if (!h.claimedPrize && announced.nonUsd && !h.claimedPrizeUsd) {
    h.claimedPrize = announced.nonUsd;
  }

  const seen = new Set<string>();
  h.tags = (h.tags ?? [])
    .map((t) => stripHtml(t).replace(/^#+/, "").trim())
    .filter((t) => {
      if (!t || t.length > 48) return false;
      const key = t.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8);

  h.prizes = (h.prizes ?? []).filter((p) => p && p.amount > 0 && Number.isFinite(p.amount));

  if (isSaneDate(h.startDate) && isSaneDate(h.endDate) && h.endDate < h.startDate) {
    const start = h.startDate;
    h.startDate = h.endDate;
    h.endDate = start;
  }

  const today = now.toISOString().slice(0, 10);
  if (isSaneDate(h.startDate) && isSaneDate(h.endDate)) {
    h.status = h.endDate < today ? "past" : h.startDate <= today ? "ongoing" : "upcoming";
  }

  if (!isSaneDate(h.registrationDeadline)) h.registrationDeadline = h.endDate;

  const location = stripHtml(h.location);
  h.location = location || undefined;
  if (h.mode !== "online" && /^(online|virtual|remote|anywhere in the world|worldwide|internet only)$/i.test(location)) {
    h.mode = "online";
  }
  if (h.mode === "online") {
    const online = /^(online|virtual|remote|anywhere|worldwide|internet|global)/i.test(location);
    if (!online && location) h.mode = "hybrid";
  }

  h.country = detectCountry(h.location) ?? h.country;

  return h;
}

/* ------------------------------------------------------------------ *
 * Screening: fixes, dedupe, score, filter
 * ------------------------------------------------------------------ */

const CURATED_IDS = new Set(curatedHackathons.map((c) => c.id));
const CURATED_KEYS = new Set(
  curatedHackathons.map((c) => `${normalizeName(c.name)}|${c.startDate ?? ""}`),
);

function normalizeName(value: string): string {
  return stripHtml(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "");
}

function isCurated(h: Hackathon): boolean {
  return CURATED_IDS.has(h.id) || (h.sourceName ?? "").toLowerCase() === "curated";
}

function rankOf(h: Hackathon, report: AccuracyReport): number {
  return (
    (isCurated(h) ? 1_000_000 : 0) +
    report.score * 1000 +
    Math.min(999, stripHtml(h.description).length) +
    Math.min(99, h.winners.length * 10)
  );
}

export function screenRecords(items: Hackathon[], now = new Date()): AccuracyResult {
  const prepared = items.map((h) => prepareRecord(h, now));
  const scored = prepared.map((h) => ({ h, report: scoreRecord(h, now) }));

  // Duplicates: identical links, identical title on the same start date, or
  // the same event published by two sources under different URLs (same
  // normalized name + organizer + dates).
  const taken = new Set<string>();
  const kept: { h: Hackathon; report: AccuracyReport }[] = [];
  const ranked = [...scored].sort((a, b) => rankOf(b.h, b.report) - rankOf(a.h, a.report));

  const causes = new Map<string, number>();
  const bump = (cause: string) => causes.set(cause, (causes.get(cause) ?? 0) + 1);

  for (const entry of ranked) {
    const { h, report } = entry;
    const urlKey = normalizeUrl(h.officialUrl);
    const nameKey = `${normalizeName(h.name)}|${h.startDate ?? ""}`;
    const identityKey = `${normalizeName(h.name)}|${normalizeName(h.organizer)}|${h.startDate ?? ""}`;

    const dupUrl = urlKey && taken.has(`url:${urlKey}`);
    const dupName = taken.has(`name:${nameKey}`) || CURATED_KEYS.has(nameKey);
    const dupIdentity = taken.has(`identity:${identityKey}`);

    if (dupUrl || dupName || dupIdentity) {
      bump("duplicate listing");
      continue;
    }

    // Hand-checked records are always published, whatever the score says.
    if (isCurated(h)) {
      if (urlKey) taken.add(`url:${urlKey}`);
      taken.add(`name:${nameKey}`);
      taken.add(`identity:${identityKey}`);
      kept.push(entry);
      continue;
    }

    if (report.verdict === "reject") {
      bump(report.hardReject ?? `score ${report.score} below ${REVIEW_THRESHOLD}`);
      continue;
    }

    if (report.verdict === "review") {
      bump(`held for review (score ${report.score})`);
      continue;
    }

    if (urlKey) taken.add(`url:${urlKey}`);
    taken.add(`name:${nameKey}`);
    taken.add(`identity:${identityKey}`);
    kept.push(entry);
  }

  const held = ranked
    .filter((e) => e.report.verdict === "review")
    .map((e) => e.h)
    .filter((h) => !kept.some((k) => k.h.id === h.id));

  const published = kept.map((k) => k.h);
  const reports = scored.map((s) => s.report);

  return {
    published,
    held,
    reports,
    summary: {
      total: items.length,
      published: published.length,
      held: held.length,
      rejected: items.length - published.length - held.length,
      causes: [...causes.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([cause, count]) => ({ cause, count })),
    },
  };
}
