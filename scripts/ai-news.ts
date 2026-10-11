import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * "Today in AI" — a resilient, no-key news sidecar for the daily article.
 *
 * Every day the generator appends a short section of real, linked headlines
 * from established AI outlets. Design rules:
 *
 * - NO invented facts: we render the headline, the outlet, the date and a link
 *   to the original story and nothing else. Every claim belongs to the linked
 *   article and is flagged as such in the section footer.
 * - NO API keys and no dependencies: plain RSS/Atom over the global fetch.
 * - Graceful everywhere: a feed that fails is skipped; if the whole fetch fails
 *   we reuse the last good cache (72h window); if there is still nothing, the
 *   article simply omits the section. The daily cadence never depends on news.
 * - Money-safe: any $ figure in a headline is stripped so the article's
 *   fact-check gate (which only allows dataset figures) can never be tripped.
 */

export interface NewsItem {
  title: string;
  link: string;
  source: string;
  /** ISO date (yyyy-mm-dd) of the item's publication date. */
  date: string;
}

const FEEDS: { url: string; source: string }[] = [
  { url: "https://rss.arxiv.org/rss/cs.AI", source: "arXiv AI" },
  { url: "https://rss.arxiv.org/rss/cs.LG", source: "arXiv ML" },
  { url: "https://huggingface.co/blog/feed.xml", source: "Hugging Face" },
  { url: "https://the-decoder.com/feed/", source: "The Decoder" },
  { url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml", source: "The Verge" },
  { url: "https://techcrunch.com/category/artificial-intelligence/feed/", source: "TechCrunch" },
  { url: "https://news.mit.edu/rss/topic/artificial-intelligence2", source: "MIT News" },
];

/** AI-first keywords (strong hits) plus a soft net for the fallback. */
const STRONG = [
  " llm", " llms", "large language model", "gpt", "openai", "anthropic", "claude",
  "gemini", "deepmind", "llama", "mistral", "hugging face", "neural", "machine learning",
  "deep learning", "diffusion", " ai agent", " ai agents", "ai model", "ai models",
  "ai research", "computer vision", "transformer", "ai tools", "ai startup",
];
const WEAK = [
  "ai", "research", "model", "dataset", "inference", "compute", "open source",
  "automation", "robot", "intelligence", "chip", "software",
];

export function stripMoney(text: string): string {
  // Remove $ amounts (including K/M/B and word suffixes) so no headline can
  // ever trip the dataset fact-check gate. Longest suffixes first, so
  // "billion" is not eaten one letter at a time by the bare "b" alternative.
  return text.replace(/\$\s?\d[\d,.]*(?:\s?(?:million|billion|thousand|K|M|B))?/gi, "$");
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  hellip: "…", mdash: "—", ndash: "–", rsquo: "’", lsquo: "‘",
  rdquo: "”", ldquo: "“", copy: "©", reg: "®", trade: "™",
};

function decodeHtml(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => NAMED_ENTITIES[name.toLowerCase()] ?? m);
}

export function cleanNewsTitle(title: string): string {
  return decodeHtml(stripMoney(title.trim().replace(/^["']|["']$/g, "")));
}

function titleScore(title: string): number {
  const t = ` ${title.toLowerCase()} `;
  let score = 0;
  for (const k of STRONG) if (t.includes(k)) score += 2;
  if (score === 0) for (const k of WEAK) if (t.includes(k)) score += 1;
  return score;
}

function isoDate(dateText: string | undefined): string {
  if (!dateText) return "";
  const parsed = Date.parse(dateText);
  if (Number.isFinite(parsed)) return `${new Date(parsed).toISOString().slice(0, 10)}`;
  const m = String(dateText).match(/\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : "";
}

function normalisedLink(link: string): string {
  return link.split("?")[0].replace(/\/+$/, "").toLowerCase();
}

function parseXmlItems(xml: string): { title: string; link: string; dateText?: string; dateAttr?: string }[] {
  // Accepts both RSS <item> and Atom <entry> blocks.
  const blocks = xml.match(/<(?:item|entry)>[\s\S]*?<\/(?:item|entry)>/gi) ?? [];
  const items: { title: string; link: string; dateText?: string; dateAttr?: string }[] = [];
  for (const block of blocks) {
    const title = (block.match(/<(?:title)>([\s\S]*?)<\/(?:title)>/i)?.[1] ?? "")
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1")
      .replace(/<[^>]+>/g, "")
      .trim();
    const link =
      block.match(/<link>([\s\S]*?)<\/link>/i)?.[1]?.trim() ??
      block.match(/<link[^>]*href="([^"]+)"/i)?.[1]?.trim() ??
      "";
    if (!title || !link) continue;
    const dateText = block.match(/<(?:pubDate|published|created)>([^<]+)<\//i)?.[1]?.trim();
    const dateAttr = block.match(/<(?:published|updated)[^>]*\sdatetime="([^"]+)"/i)?.[1]?.trim();
    items.push({ title, link, dateText, dateAttr });
  }
  return items;
}

async function fetchFeed(feed: { url: string; source: string }): Promise<NewsItem[]> {
  const res = await fetch(feed.url, {
    signal: AbortSignal.timeout(9000),
    headers: { "user-agent": "ai-hackathons-blog/1.0 (+https://github.com/uncrownedprince786-collab/AI-Hackathon)" },
  });
  if (!res.ok) return [];
  const xml = await res.text();
  return parseXmlItems(xml)
    .map((it) => {
      const date = isoDate(it.dateText);
      return { title: cleanNewsTitle(it.title), link: it.link, source: feed.source, date };
    })
    .filter((it) => it.title && it.link && /^https?:\/\//.test(it.link))
    .slice(0, 10);
}

function selectBest(items: NewsItem[], limit: number): NewsItem[] {
  const seen = new Set<string>();
  const unique: NewsItem[] = [];
  for (const item of items) {
    const key = normalisedLink(item.link);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  return unique
    .filter((it) => titleScore(it.title) > 0)
    .sort((a, b) => {
      const scoreDiff = titleScore(b.title) - titleScore(a.title);
      return scoreDiff !== 0 ? scoreDiff : b.date.localeCompare(a.date);
    })
    .slice(0, limit);
}

async function readCache(
  base: string,
): Promise<NewsItem[]> {
  const file = path.join(base, "content", "blog", ".news-cache.json");
  try {
    const raw = JSON.parse(await fs.readFile(file, "utf8")) as {
      fetchedAt: string;
      items: NewsItem[];
    };
    const cutoff = Date.now() - 72 * 3600 * 1000;
    return (raw.items ?? []).filter((it) => it.date && Date.parse(it.date) >= cutoff).slice(0, 5);
  } catch {
    return [];
  }
}

async function writeCache(base: string, items: NewsItem[]): Promise<void> {
  await fs.writeFile(
    path.join(base, "content", "blog", ".news-cache.json"),
    JSON.stringify({ fetchedAt: new Date().toISOString(), items }, null, 2) + "\n",
    "utf8",
  );
}

/**
 * Fetches today's AI headlines. Best-effort: never throws, returns [] on total
 * failure, and falls back to the last good cache (within 72h) before giving up.
 */
export async function fetchDailyNews(base = process.cwd(), limit = 5): Promise<NewsItem[]> {
  try {
    const settled = await Promise.allSettled(FEEDS.map((feed) => fetchFeed(feed)));
    const collected: NewsItem[] = [];
    for (const result of settled) {
      if (result.status === "fulfilled") collected.push(...result.value);
    }
    const best = selectBest(collected, limit);
    if (best.length >= 3) {
      await writeCache(base, best);
      return best;
    }
    return readCache(base);
  } catch {
    return readCache(base);
  }
}

/**
 * Keeps news relevant to the article's topic: prefer items whose headline
 * mentions a template keyword (2+ matches → those), else use the top items.
 */
export function matchNewsToTemplate(items: NewsItem[], keywords: string[]): NewsItem[] {
  if (items.length === 0) return [];
  const kw = keywords.map((k) => k.toLowerCase());
  const scored = items.map((it) => {
    const haystack = ` ${it.title.toLowerCase()} `;
    const hits = kw.reduce((n, k) => n + (haystack.includes(k) ? 1 : 0), 0);
    return { it, hits };
  });
  const matched = scored.filter((s) => s.hits > 0).sort((a, b) => b.hits - a.hits).map((s) => s.it);
  const chosen = matched.length >= 2 ? matched : items;
  return chosen.slice(0, 5);
}

/** Pulls up to 3 short, keyword-like terms from the news titles. */
export function extractTitleKeywords(items: NewsItem[]): string[] {
  const STOP = new Set([
    "a", "an", "the", "and", "or", "but", "for", "with", "from", "this", "that",
    "its", "are", "was", "were", "how", "what", "why", "who", "you", "your", "new",
  ]);
  const out: string[] = [];
  for (const item of items) {
    for (const word of item.title.split(/[^a-z0-9]+/i)) {
      const w = word.toLowerCase();
      if (w.length >= 4 && !STOP.has(w) && !out.includes(w)) out.push(w);
      if (out.length >= 3) return out;
    }
  }
  return out;
}