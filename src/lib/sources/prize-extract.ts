/**
 * Prize accounting.
 *
 * The source of truth is always what an organizer publishes. We scan the whole
 * source text (title, subtitle/tagline, description, prize section, rules) for
 * a headline pool, and we preserve the original currency. We never invent a
 * currency conversion: "$"/"US$"/"USD" are read as US dollars (reliable in an
 * English-language hackathon announcement), everything else (€, £, ₹, AUD,
 * etc.) is kept in its own currency and never mixed into USD totals.
 *
 * Accounting buckets (unpublished vs published is kept separate):
 *   cash        — itemised cash prizes
 *   credits     — itemised cloud/API credits (converted to a USD estimate)
 *   announced   — a single headline pool with no cash/credits split
 *   non-USD     — a headline pool stated in another currency (kept as-is)
 *   unknown     — no prize information at all ("Prize not published")
 */

export interface MoneyAmount {
  amount: number;
  currency: string;
  /** `amount` when the currency is USD, otherwise 0 (never converted). */
  usd: number;
  /** Position in the scanned text, used for context checks. */
  index: number;
  /** The raw matched string, for provenance. */
  original: string;
}

export interface PrizeAnnouncement {
  /** Biggest USD-denominated headline pool ("$400,000 in prizes"). */
  usd?: number;
  /** A visible "$X cash + $Y credits" breakdown published in the text. */
  split?: { cash: number; credits: number };
  /** Biggest headline pool in another currency, preserved untouched. */
  nonUsd?: { amount: number; currency: string };
}

const CODES = [
  "USD",
  "EUR",
  "GBP",
  "INR",
  "JPY",
  "AUD",
  "CAD",
  "SGD",
  "CHF",
  "AED",
  "CNY",
  "NGN",
  "KES",
  "ZAR",
  "NZD",
  "SEK",
  "NOK",
  "DKK",
];

const CODE_ALTERNATION = CODES.join("|");

const CURRENCY_BY_TOKEN = new Map<string, string>([
  ["$", "USD"],
  ["€", "EUR"],
  ["£", "GBP"],
  ["₹", "INR"],
  ...CODES.map((c) => [c, c] as const),
]);

const NUMBER = String.raw`\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?`;
const SUFFIX = String.raw`\s*([kKmM])?`;
const PREFIX = String.raw`[$€£₹]|\b(?:${CODE_ALTERNATION})`;
const POSTCODE = String.raw`\b(?:${CODE_ALTERNATION})\b`;

const CHAR_PATTERN = new RegExp(`(${PREFIX})\\s*(${NUMBER})${SUFFIX}`, "g");

const POST_PATTERN = new RegExp(`(${NUMBER})\\s*([kKmM])?\\s*(${POSTCODE})`, "g");

/** Strip markup/entities and normalise separators so figures can be scanned. */
function clean(text: string): string {
  return text
    .replace(/<[^>]*>/g, " ")
    .replace(/&(?:#36|#x24|dollar|dollar;)/gi, "$")
    .replace(/&(?:#8364|euro|euro;)/gi, "€")
    .replace(/&(?:#163|pound|pound;)/gi, "£")
    .replace(/&(?:#8377|inr|inr;)/gi, "₹")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\u2013|\u2014/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function scale(amount: number, suffix: string | undefined): number {
  if (suffix === "k" || suffix === "K") return amount * 1_000;
  if (suffix === "m" || suffix === "M") return amount * 1_000_000;
  return amount;
}

function toNumber(raw: string): number {
  return Number.parseFloat(raw.replace(/,/g, ""));
}

/**
 * Parses every money figure in a text. Only known currency tokens are read;
 * a bare number with no currency marker is ignored.
 */
export function parsePrizeAmounts(text: string): MoneyAmount[] {
  const source = clean(text);
  const hits: MoneyAmount[] = [];

  const push = (token: string, raw: string, suffix: string | undefined, index: number) => {
    const currency = CURRENCY_BY_TOKEN.get(token.toUpperCase());
    if (!currency) return;
    const value = Math.round(scale(toNumber(raw), suffix));
    if (!Number.isFinite(value) || value <= 0) return;
    const original = source
      .slice(index, index + token.length + raw.length + (suffix ?? "").length)
      .trim();
    hits.push({ amount: value, currency, usd: currency === "USD" ? value : 0, index, original });
  };

  CHAR_PATTERN.lastIndex = 0;
  let charMatch: RegExpExecArray | null;
  while ((charMatch = CHAR_PATTERN.exec(source)) !== null) {
    push(charMatch[1], charMatch[2], charMatch[3], charMatch.index);
  }

  POST_PATTERN.lastIndex = 0;
  let postMatch: RegExpExecArray | null;
  while ((postMatch = POST_PATTERN.exec(source)) !== null) {
    push(postMatch[3], postMatch[1], postMatch[2], postMatch.index);
  }

  return hits.sort((a, b) => b.amount - a.amount);
}

const POOL_WORDS = [
  "in prizes",
  "in prize",
  "prize pool",
  "prizes pool",
  "prize money",
  "total prize",
  "total pool",
  "prizes worth",
  "prize worth",
  "worth of prizes",
  "worth of prize",
  "in cash prizes",
  "cash prizes",
  "prizes available",
  "prize value",
  "announced total",
];

function isPoolContext(source: string, index: number): boolean {
  const window = source.slice(Math.max(0, index - 70), index + 90).toLowerCase();
  if (POOL_WORDS.some((w) => window.includes(w))) return true;
  // "Prizes: up to US$24,500" — the amount follows a plural prize heading. A
  // singular "Best design prize: $15" row is not a pool and is ignored.
  return /prizes\s*[:]/.test(window) || /prize\s+(?:pool|money|worth|value)\s*[:]/.test(window);
}

/** "$10,000 in cash and $90,000 in credits" — a split the organizer publishes. */
function detectCashCreditSplit(source: string): { cash: number; credits: number } | undefined {
  const pattern =
    /((?:\$[\d,.]+(?:k|m)?))\s*(?:in\s+)?cash\s*(?:,|and|\+)?\s*((?:\$[\d,.]+(?:k|m)?))\s*(?:in\s+)?(?:api\s+)?(?:cloud\s+)?credits/gi;
  const match = pattern.exec(source.toLowerCase());
  if (!match) return undefined;
  const parse = (raw: string): number => {
    const amount = Math.round(scale(toNumber(raw.replace("$", "")), /[km]$/i.exec(raw)?.[0]));
    return Number.isFinite(amount) ? amount : 0;
  };
  const cash = parse(match[1]);
  const credits = parse(match[2]);
  if (cash <= 0 || credits <= 0) return undefined;
  return { cash, credits };
}

/**
 * Finds the headline pool an organizer announces anywhere in the source text.
 * A figure only counts when it sits next to a pool phrase, so ordinary amounts
 * ("$15 for the .xyz domain") are ignored.
 */
export function extractPrizeAnnouncement(...texts: (string | undefined)[]): PrizeAnnouncement {
  const haystack = texts
    .filter(Boolean)
    .map((t) => clean(t!))
    .join(" ")
    .trim();
  if (!haystack) return {};

  const amounts = parsePrizeAmounts(haystack).filter((a) => isPoolContext(haystack, a.index));
  if (!amounts.length) return {};

  const usdHits = amounts.filter((a) => a.currency === "USD");
  const nonUsdHits = amounts.filter((a) => a.currency !== "USD");

  const split = detectCashCreditSplit(haystack);

  // A published cash+credits breakdown is the most precise figure we have, so
  // it wins over a nearby headline amount ("$90k credits" vs the "$10k + $90k"
  // split of the same pool).
  if (split) {
    const usd = usdHits[0]?.amount ?? 0;
    if (split.cash + split.credits >= usd) return { split };
    return { usd };
  }

  if (usdHits.length) {
    return { usd: usdHits[0].amount };
  }

  if (nonUsdHits.length) {
    const top = nonUsdHits[0];
    return { nonUsd: { amount: top.amount, currency: top.currency } };
  }

  return {};
}