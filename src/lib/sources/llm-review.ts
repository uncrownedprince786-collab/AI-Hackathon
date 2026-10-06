import { createHash } from "node:crypto";
import type { Hackathon, LlmProvider } from "@/lib/types";
import { cleanOrganizerName, extractClaimedPool } from "./ai-signals";

/**
 * Behind-the-scenes accuracy check.
 *
 * A free text model (Groq Llama, or Gemini Flash) reads each new or changed
 * organizer listing and answers three questions:
 *   1. Is this really an AI / ML / generative-AI hackathon?
 *   2. Is the listing complete enough to show (real dates, real organizer)?
 *   3. Does the text state a cash prize or a total pool we missed?
 *
 * Hard rules, so the model can never invent data:
 *   - the model may only return amounts and organizer names that appear verbatim
 *     in the organizer text, and anything else is ignored;
 *   - dates and status always come from our own date logic, not the model;
 *   - results are cached on the record, so unchanged events are never re-sent;
 *   - with no API key the whole step is skipped and the pipeline continues.
 */

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
const BATCH_SIZE = 10;
const MAX_ROWS = Number(process.env.LLM_REVIEW_LIMIT ?? 400);
const TIMEOUT_MS = 45_000;
const UA = "ai-hackathons-site/1.0 (+https://ai-hackathons-tawny.vercel.app)";

export interface LlmConfig {
  provider: LlmProvider;
  key: string;
  model: string;
}

export interface ReviewInput {
  id: string;
  name: string;
  organizer: string;
  description: string;
  location?: string;
  tags: string[];
  sourceName: string;
  url: string;
  cashPrizeUsd: number;
  claimedPrizeUsd: number;
}

export interface ReviewVerdict {
  id: string;
  isAi: boolean;
  complete: boolean;
  registrationStatus?: "open" | "closed";
  /** Only applied when the string is found in the organizer's own text. */
  organizerClean?: string;
  /** Only applied when the amount is found in the organizer's own text. */
  cashPrizeUsd?: number;
  /** Only applied when the amount is found in the organizer's own text. */
  claimedPrizeUsd?: number;
  reason: string;
}

export function llmConfig(): LlmConfig | null {
  const groq = process.env.GROQ_API_KEY?.trim();
  if (groq) return { provider: "groq", key: groq, model: GROQ_MODEL };
  const gemini = process.env.GEMINI_API_KEY?.trim();
  if (gemini) return { provider: "gemini", key: gemini, model: GEMINI_MODEL };
  return null;
}

export function reviewHash(h: Hackathon): string {
  const material = [
    h.name,
    h.organizer,
    h.description.slice(0, 1200),
    h.location ?? "",
    h.tags.join(","),
    h.cashPrizeUsd,
    h.claimedPrizeUsd ?? 0,
  ].join("|");
  return createHash("sha256").update(material).digest("hex").slice(0, 32);
}

const SYSTEM_PROMPT = `You check listings for a public directory of AI hackathons.

For each listing return one JSON object with:
- "id": copy the id exactly
- "isAi": true only if the event is really about AI, machine learning, LLMs, generative AI, data/ML engineering, or an AI build challenge. False for generic software, blockchain-only, finance-only, design-only or non-technical events.
- "complete": true only if the listing names an organizer and real dates and looks like a real event that people can register for or that already happened. False for placeholders, test pages, duplicates or spam.
- "registrationStatus": "open", "closed", or null. Only say open or closed when the text states it.
- "organizerClean": the organizer's short name without legal suffixes, only if the exact words appear in the text. Otherwise null.
- "cashPrizeUsd": the cash prize total in whole US dollars only if the text states a cash amount. Otherwise null.
- "claimedPrizeUsd": the total announced prize pool in whole US dollars only if the text states a total pool. Otherwise null.
- "reason": under 12 words, plain English.

Never guess. If a value is not written in the text, return null. Return only a JSON array.`;

function buildUserPrompt(rows: ReviewInput[]): string {
  const payload = rows.map((r) => ({
    id: r.id,
    name: r.name,
    organizer: r.organizer,
    location: r.location ?? "",
    topics: r.tags.join(", "),
    source: r.sourceName,
    url: r.url,
    text: r.description.slice(0, 1200),
  }));
  return `Listings:\n${JSON.stringify(payload, null, 1)}\n\nJSON array of ${rows.length} verdicts:`;
}

async function askGroq(config: LlmConfig, rows: ReviewInput[]): Promise<ReviewVerdict[]> {
  const response = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.key}`,
      "user-agent": UA,
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0,
      max_tokens: Math.min(4096, 320 * rows.length),
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `${buildUserPrompt(rows)}\n\nWrap the array in {"results": [...]}.`,
        },
      ],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`groq ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
  const body = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = body.choices?.[0]?.message?.content ?? "";
  return parseVerdicts(content);
}

async function askGemini(config: LlmConfig, rows: ReviewInput[]): Promise<ReviewVerdict[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    config.model,
  )}:generateContent?key=${encodeURIComponent(config.key)}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": UA },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: buildUserPrompt(rows) }] }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: Math.min(8192, 400 * rows.length),
        responseMimeType: "application/json",
        responseSchema: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              id: { type: "STRING" },
              isAi: { type: "BOOLEAN" },
              complete: { type: "BOOLEAN" },
              registrationStatus: { type: "STRING", nullable: true },
              organizerClean: { type: "STRING", nullable: true },
              cashPrizeUsd: { type: "INTEGER", nullable: true },
              claimedPrizeUsd: { type: "INTEGER", nullable: true },
              reason: { type: "STRING" },
            },
            required: ["id", "isAi", "complete", "reason"],
          },
        },
      },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`gemini ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
  const body = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const content = body.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return parseVerdicts(content);
}

function parseVerdicts(raw: string): ReviewVerdict[] {
  const trimmed = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = trimmed.search(/[[{]/);
  if (start === -1) throw new Error("no json in model reply");

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed.slice(start));
  } catch {
    // Models sometimes append a sentence after the array; retry on the array only.
    const end = trimmed.lastIndexOf(trimmed.startsWith("{", start) ? "}" : "]");
    parsed = JSON.parse(trimmed.slice(start, end + 1));
  }

  const list = Array.isArray(parsed)
    ? parsed
    : ((parsed as { results?: unknown[] }).results ?? []);
  if (!Array.isArray(list)) return [];

  const out: ReviewVerdict[] = [];
  for (const raw of list) {
    if (typeof raw !== "object" || raw === null) continue;
    const v = raw as Record<string, unknown>;
    const id = String(v.id ?? "");
    if (!id) continue;
    const status = v.registrationStatus;
    out.push({
      id,
      isAi: v.isAi !== false,
      complete: v.complete !== false,
      registrationStatus: status === "open" || status === "closed" ? status : undefined,
      organizerClean: typeof v.organizerClean === "string" ? v.organizerClean : undefined,
      cashPrizeUsd:
        typeof v.cashPrizeUsd === "number" && Number.isFinite(v.cashPrizeUsd)
          ? Math.round(v.cashPrizeUsd)
          : undefined,
      claimedPrizeUsd:
        typeof v.claimedPrizeUsd === "number" && Number.isFinite(v.claimedPrizeUsd)
          ? Math.round(v.claimedPrizeUsd)
          : undefined,
      reason: typeof v.reason === "string" ? v.reason.slice(0, 160) : "",
    });
  }
  return out;
}

/** Accepts a model number only when the same figure is written in the source text. */
function amountIsStated(amount: number, texts: string[]): boolean {
  if (!Number.isFinite(amount) || amount <= 0) return false;
  const plain = Math.round(amount);
  const variants = new Set([
    String(plain),
    plain.toLocaleString("en-US"),
    plain.toLocaleString("en-IN"),
    String(Math.round(amount / 1000)),
    String(Math.round(amount / 1_000_000)),
  ]);
  const haystack = texts.join(" ").replace(/\s+/g, " ");
  for (const variant of variants) {
    if (haystack.includes(variant)) return true;
  }
  // "$400k" / "$1.2M" style.
  const k = Math.round(amount / 1000);
  if (k >= 100 && new RegExp(`\\b${k}\\s*[kK]\\b`).test(haystack)) return true;
  const m = Math.round(amount / 1_000_000);
  if (m >= 1 && new RegExp(`\\b${m}(\\.\\d+)?\\s*[mM]\\b`).test(haystack)) return true;
  return false;
}

function organizerIsStated(name: string, current: string, texts: string[]): boolean {
  const value = cleanOrganizerName(name);
  if (value.length < 2) return false;
  // A pure re-casing of what we already have is always safe.
  if (value.toLowerCase() === current.trim().toLowerCase()) return true;
  const haystack = [current, ...texts].join(" ").toLowerCase();
  return value.length > 3 && haystack.includes(value.toLowerCase());
}

export interface ReviewOutcome {
  verdicts: Map<string, ReviewVerdict>;
  reviewed: number;
  rejected: number;
  fixed: number;
  provider?: LlmProvider;
  model?: string;
  error?: string;
}

/**
 * Reviews the given records, applies only source-verified corrections, and writes
 * the cache stamp onto each record it looked at.
 */
export async function reviewWithLlm(
  items: Hackathon[],
  config: LlmConfig | null = llmConfig(),
): Promise<ReviewOutcome> {
  const outcome: ReviewOutcome = { verdicts: new Map(), reviewed: 0, rejected: 0, fixed: 0 };
  if (!config) return outcome;

  const nowIso = new Date().toISOString();
  const pending = items
    .filter((h) => {
      const hash = reviewHash(h);
      return h.llmReview?.hash !== hash;
    })
    .slice(0, MAX_ROWS);

  if (pending.length === 0) return outcome;

  const rows: ReviewInput[] = pending.map((h) => ({
    id: h.id,
    name: h.name,
    organizer: h.organizer,
    description: h.description,
    location: h.location,
    tags: h.tags,
    sourceName: h.sourceName,
    url: h.officialUrl,
    cashPrizeUsd: h.cashPrizeUsd,
    claimedPrizeUsd: h.claimedPrizeUsd ?? 0,
  }));

  const batches: ReviewInput[][] = [];
  for (let i = 0; i < rows.length; i += BATCH_SIZE) batches.push(rows.slice(i, i + BATCH_SIZE));

  let provider = config.provider;
  let model = config.model;

  for (const batch of batches) {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 2 && !lastError; attempt += 1) {
      try {
        const verdicts =
          provider === "groq" ? await askGroq({ ...config, model }, batch) : await askGemini({ ...config, model }, batch);
        for (const verdict of verdicts) outcome.verdicts.set(verdict.id, verdict);
        break;
      } catch (error) {
        lastError = error as Error;
        // Groq is the default; if it is unavailable fall back to Gemini once.
        if (provider === "groq" && process.env.GEMINI_API_KEY && attempt === 1) {
          provider = "gemini";
          model = GEMINI_MODEL;
        }
      }
    }
    if (lastError) {
      console.warn(`[llm] batch failed: ${lastError.message}`);
      outcome.error = lastError.message;
    }
  }

  outcome.reviewed = outcome.verdicts.size;
  outcome.provider = provider;
  outcome.model = `${provider}:${model}`;

  for (const h of pending) {
    const verdict = outcome.verdicts.get(h.id);
    if (!verdict) {
      // A row the model did not return is kept as it is. Only leave it unstamped
      // when a whole batch failed, so the next refresh retries it for free.
      if (!outcome.error) {
        h.llmReview = {
          model: outcome.model,
          at: nowIso,
          hash: "",
          keep: true,
          reason: "no verdict returned",
        };
      }
      continue;
    }

    const texts = [h.name, h.description, h.location ?? ""].filter(
      (t): t is string => typeof t === "string" && t.length > 0,
    );

    let fixedSomething = false;

    if (
      verdict.organizerClean &&
      organizerIsStated(verdict.organizerClean, h.organizer, texts)
    ) {
      const cleaned = cleanOrganizerName(verdict.organizerClean);
      if (cleaned && cleaned !== h.organizer) {
        h.organizer = cleaned;
        fixedSomething = true;
      }
    }

    if (verdict.registrationStatus && !h.registrationStatus) {
      h.registrationStatus = verdict.registrationStatus;
      fixedSomething = true;
    }

    const claimed =
      verdict.claimedPrizeUsd && amountIsStated(verdict.claimedPrizeUsd, texts)
        ? verdict.claimedPrizeUsd
        : 0;
    const cash =
      verdict.cashPrizeUsd && amountIsStated(verdict.cashPrizeUsd, texts) ? verdict.cashPrizeUsd : 0;

    if (claimed > 0 && (h.claimedPrizeUsd ?? 0) < claimed) {
      h.claimedPrizeUsd = claimed;
      fixedSomething = true;
    }
    if (cash > h.cashPrizeUsd) {
      if (cash > 0) h.prizes = [...h.prizes, { amount: cash, currency: "USD", type: "cash", label: "Cash prizes" }];
      fixedSomething = true;
    }
    if (fixedSomething) outcome.fixed += 1;

    h.llmReview = {
      model: outcome.model,
      at: nowIso,
      hash: reviewHash(h),
      keep: verdict.isAi && verdict.complete,
      reason: verdict.reason,
    };
    if (!verdict.isAi || !verdict.complete) outcome.rejected += 1;
  }

  // Keep the deterministic prize logic authoritative after corrections land.
  for (const h of pending) {
    if (!h.llmReview) continue;
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
      h.prizeBreakdownPublished = itemised > 0 && cash > 0;
    } else {
      h.totalPrizeUsd = itemised || claimed;
      h.prizeBreakdownPublished = cash > 0;
    }
    // Stamp last: the cache key must describe the state we actually stored.
    h.llmReview.hash = reviewHash(h);
  }

  return outcome;
}

/**
 * Second pass for records that were never reviewed and have no cache stamp.
 * Used when a key is added after data already exists.
 */
export function needsReview(h: Hackathon): boolean {
  return !h.llmReview;
}

export function localPoolFromText(h: Hackathon): number {
  return extractClaimedPool(h.name, h.description);
}
