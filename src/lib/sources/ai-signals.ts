export const AI_THEME_IDS = new Set([6, 47, 44]);

export const AI_THEME_NAMES = [
  "Machine Learning/AI",
  "Artificial Intelligence",
  "AI Agents",
  "Generative AI",
  "LLM",
  "Computer Vision",
  "NLP",
];

export const AI_KEYWORDS = [
  "ai",
  "a.i",
  "artificial intelligence",
  "machine learning",
  "deep learning",
  "neural",
  "llm",
  "large language model",
  "generative",
  "genai",
  "gen ai",
  "gpt",
  "openai",
  "agent",
  "agentic",
  "copilot",
  "chatbot",
  "computer vision",
  "nlp",
  "natural language",
  "diffusion",
  "ml ",
  "mlops",
  "data science",
  "predictive",
  "inference",
  "transformer",
  "claude",
  "gemini",
  "llama",
  "mistral",
  "hugging face",
  "vector",
  "rag",
  "prompt",
];

const AI_EXCLUDE = [
  "non-ai",
  "not ai",
];

export function isAiRelevant(input: {
  title?: string;
  tagline?: string;
  description?: string;
  themes?: { id: number; name: string }[];
}): boolean {
  const { themes = [], title = "", tagline = "", description = "" } = input;

  if (themes.some((t) => AI_THEME_IDS.has(t.id))) return true;

  const themeNames = themes.map((t) => t.name.toLowerCase()).join(" ");
  if (/\b(ai|a\.i\.|artificial intelligence|machine learning|llm)\b/.test(themeNames)) {
    return true;
  }

  const haystack = `${title} ${tagline} ${description} ${themeNames}`
    .toLowerCase()
    .replace(/[^a-z0-9.\s-]/g, " ")
    .replace(/\s+/g, " ");

  if (AI_EXCLUDE.some((x) => haystack.includes(x))) return false;

  return AI_KEYWORDS.some((k) => haystack.includes(k));
}

const MONTHS: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

function parseMonthDay(raw: string, fallbackYear: number): string | null {
  const m = raw
    .trim()
    .toLowerCase()
    .match(/^([a-z]+)\.?\s+(\d{1,2})\s*(?:,\s*(\d{4}))?$/);
  if (!m) return null;
  const month = MONTHS[m[1]];
  if (month === undefined) return null;
  return toIso(m[3] ? Number(m[3]) : fallbackYear, month, Number(m[2]));
}

export function toIso(year: number, month: number, day: number): string {
  const d = new Date(Date.UTC(year, month, day));
  return d.toISOString().slice(0, 10);
}

/**
 * Devpost renders submission windows in a few shapes:
 *   "Aug 31 - Oct 23, 2026"  "Apr 05 - 06, 2024"  "Sep 03 - 25, 2026"
 *   "Nov 15, 2026"           "Nov 15 - Dec 02, 2025"
 */
export function parsePeriodDates(
  raw: string | undefined,
  today = new Date(),
): { startDate: string; endDate: string } | null {
  if (!raw) return null;
  const text = raw.replace(/\u2013/g, "-").replace(/\s+/g, " ").trim();
  if (!text) return null;

  const yearMatch = text.match(/(\d{4})/);
  const year = yearMatch ? Number(yearMatch[1]) : today.getUTCFullYear();

  const dashSplit = text.split(/\s*-\s*/);
  if (dashSplit.length === 2) {
    const [a, b] = dashSplit;
    const start = parseMonthDay(a, year);
    let end = parseMonthDay(b, year);
    if (start && !end) {
      // "Apr 05 - 06, 2024" and "Sep 03 - 25, 2026": the end only has a day.
      const day = b.trim().match(/^(\d{1,2})\s*(?:,\s*(\d{4}))?$/);
      if (day) {
        const endYear = day[2] ? Number(day[2]) : year;
        end = toIso(endYear, Number(start.slice(5, 7)) - 1, Number(day[1]));
      }
    }
    if (start && end) {
      return { startDate: start <= end ? start : end, endDate: start <= end ? end : start };
    }
  }

  const full = text.match(/([a-z]+)\.?\s+(\d{1,2}),?\s*(\d{4})?/i);
  if (full) {
    const month = MONTHS[full[1].toLowerCase()];
    if (month !== undefined) {
      const y = full[3] ? Number(full[3]) : year;
      const iso = toIso(y, month, Number(full[2]));
      return { startDate: iso, endDate: iso };
    }
  }

  return null;
}

const CREDIT_WORDS = [
  "credit",
  "credits",
  "cloud",
  "aws",
  "azure",
  "gcp",
  "google cloud",
  "api",
  "apis",
  "token",
  "tokens",
  "voucher",
  "gpu",
  "gpu hours",
  "compute",
  "openai",
  "anthropic",
  "subscription",
  "usage",
  "promo",
];

const CASH_WORDS = ["cash", "usd", "dollar", "dollars", "$", "money", "grant"];

export function classifyPrize(text: string): "cash" | "credits" | "other" {
  const t = text.toLowerCase();
  // Credits win first: "$5,000 in AAI credits" is credits, not cash.
  if (CREDIT_WORDS.some((w) => t.includes(w))) return "credits";
  if (CASH_WORDS.some((w) => t.includes(w))) return "cash";
  return "other";
}

/** Devpost returns prize totals wrapped in markup, e.g. `$<span data-currency-value>138,000</span>`. */
export function parsePrizeAmount(raw: string | undefined): number {
  if (!raw) return 0;
  const span = raw.match(/data-currency-value>([\d,.]+)</);
  const source = span ? span[1] : raw.replace(/<[^>]*>/g, "");
  const digits = source.replace(/[^0-9.]/g, "");
  const value = Number.parseFloat(digits);
  return Number.isFinite(value) ? Math.round(value) : 0;
}

const POOL_WORDS = [
  "in prizes",
  "in prize",
  "prize pool",
  "prizes pool",
  "total prize",
  "prizes worth",
  "prize worth",
  "worth of prizes",
  "in cash prizes",
  "cash prizes",
  "prizes available",
];

const SMALL_WORDS = new Set(["and", "or", "the", "of", "for", "to", "in", "at", "on", "by", "a", "an"]);

/**
 * Finds the biggest pool figure the organizer states in prose, for example
 * "ML Empowerment Build Challenge ($400,000 in prizes!)" or "DSH Hacks V2 ($100k+ in prizes)".
 * Requires a pool word nearby so ordinary amounts ("$15 for the .xyz domain") are ignored.
 */
export function extractClaimedPool(...texts: (string | undefined)[]): number {
  const haystack = texts
    .filter(Boolean)
    .join(" ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\u2013/g, "-")
    .replace(/\s+/g, " ");
  if (!haystack) return 0;

  const amounts: number[] = [];
  const pattern = /(?:[$€£]\s?|\bUSD\s?)(\d[\d,]*(?:\.\d+)?)\s*([kKmM])?\b/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(haystack)) !== null) {
    const value = Number.parseFloat(match[1].replace(/,/g, ""));
    if (!Number.isFinite(value)) continue;
    const suffix = match[2]?.toLowerCase();
    const scaled = suffix === "k" ? value * 1_000 : suffix === "m" ? value * 1_000_000 : value;
    if (scaled <= 0) continue;
    const around = haystack.slice(Math.max(0, match.index - 60), match.index + 90).toLowerCase();
    if (POOL_WORDS.some((w) => around.includes(w))) amounts.push(Math.round(scaled));
  }
  return amounts.length ? Math.max(...amounts) : 0;
}

/** "nill" is lablab's points currency, never an organizer name. */
export function cleanOrganizerName(raw: string | undefined | null): string {
  let value = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!value) return "";
  if (/^nill$/i.test(value)) return "";
  value = value.replace(/^nill\s*[-|:]?\s*/i, "").trim();
  value = value.replace(/[\s,;:|]+$/, "").trim();
  if (!value) return "";
  if (value.length > 60) value = `${value.slice(0, 57).trimEnd()}...`;

  // Only re-case strings that are entirely lower case, so "IEEE" and "STEMise" survive.
  if (value === value.toLowerCase() && /[a-z]/.test(value)) {
    value = value
      .split(" ")
      .map((word, index) =>
        index > 0 && SMALL_WORDS.has(word.toLowerCase())
          ? word.toLowerCase()
          : word.charAt(0).toUpperCase() + word.slice(1),
      )
      .join(" ");
  }
  return value;
}

const CLOSED_PATTERNS = [
  /registration (?:is |has )?closed/i,
  /submissions? (?:are |is |has )?closed/i,
  /registration period (?:is |has )?(?:closed|ended)/i,
  /no longer accepting (?:submissions|registrations|entries)/i,
  /call for (?:submissions|entries) (?:is )?closed/i,
  /\bsubmissions?\s+closed\b/i,
];

const OPEN_PATTERNS = [
  /registration (?:is )?open/i,
  /submissions? (?:are |is )?open/i,
  /accepting (?:submissions|registrations|entries)/i,
  /\bregister now\b/i,
];

/** Reads the organizer page for an explicit registration state. */
export function detectRegistrationStatus(text: string | undefined | null): "open" | "closed" | undefined {
  if (!text) return undefined;
  if (CLOSED_PATTERNS.some((p) => p.test(text))) return "closed";
  if (OPEN_PATTERNS.some((p) => p.test(text))) return "open";
  return undefined;
}

