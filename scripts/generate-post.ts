import { promises as fs } from "node:fs";
import path from "node:path";
import type { Hackathon } from "../src/lib/types";
import { selectTopic, verifyFigures, type Facts } from "./templates";
import {
  cleanNewsTitle,
  extractTitleKeywords,
  fetchDailyNews,
  matchNewsToTemplate,
  type NewsItem,
} from "./ai-news";

/**
 * Blog engine v2 — writes one dataset-backed article per day.
 *
 * - Topics are chosen by a data-richness router (see templates.ts).
 * - A fact-check gate blocks any money figure that is not a real dataset value.
 * - A "Today in AI" section appends real, linked AI headlines (see ai-news.ts)
 *   so each post also carries the day's developments — keyword-matched to the
 *   article topic and stripped of any $ figures. If no news is available the
 *   section is simply omitted; the article still publishes.
 * - Frontmatter is keyword-enriched (per-topic keywords + fresh news terms) so
 *   each post targets both the hackathon audience and the broader AI audience.
 * - Idempotent via publication state (`content/blog/.published.json`) and the
 *   date-prefixed file names: a re-run never writes twice, and a day with no
 *   supported topic is skipped cleanly.
 *
 *   npx tsx scripts/generate-post.ts
 */

export interface PublishState {
  latest: string;
  articles: Record<string, string>;
}

export function todayIso(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function dayIndex(date: string): number {
  return Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

async function readState(base: string): Promise<PublishState> {
  try {
    const raw = JSON.parse(await fs.readFile(path.join(base, "content", "blog", ".published.json"), "utf8")) as PublishState;
    return { latest: raw.latest ?? "", articles: raw.articles ?? {} };
  } catch {
    return { latest: "", articles: {} };
  }
}

export async function buildFacts(base: string): Promise<Facts> {
  let hackathons: Hackathon[] = [];
  let lastUpdated = "";
  try {
    const raw = JSON.parse(
      await fs.readFile(path.join(base, "src", "data", "hackathons.json"), "utf8"),
    ) as { meta?: { lastUpdated?: string }; hackathons?: Hackathon[] };
    hackathons = raw.hackathons ?? [];
    lastUpdated = raw.meta?.lastUpdated ?? "";
  } catch (error) {
    throw new Error(`could not read dataset: ${(error as Error).message}`);
  }
  return { hackathons, lastUpdated };
}

/** Rationalises today's topic from the live data; `null` means "skip the day". */
export function selectTopicFor(facts: Facts, date: string) {
  return selectTopic(facts, dayIndex(date));
}

/** Renders the "Today in AI" section from real, linked headlines (no $ figures). */
function newsSection(news: NewsItem[], date: string): string {
  if (news.length === 0) return "";
  const lines = news
    .slice(0, 5)
    .map(
      (item, i) =>
        `${i + 1}. **${cleanNewsTitle(item.title)}** — ${item.source} · ${item.date.slice(5).replace("-", "/")}. Source: <${item.link}>`,
    )
    .join("\n");
  const outlets = [...new Set(news.map((n) => n.source))].join(", ");
  return `## Today in AI

The developments below are headlines from established AI outlets, collected on ${date}. Each one links straight to the original story — they are not our claims, we add nothing and take nothing out. Open the sources to read the details and judge them yourself.

${lines}

> Collected from ${outlets}. Headlines and figures belong to their publishers; this site only links to them.
`;
}

/**
 * Assembles the article for a template. Runs the fact-check gate last: any
 * unsupported figure raises, so nothing unsupported can ever be written.
 * When `news` is provided, a keyword-enriched "Today in AI" section is appended.
 */
export function composeArticle(
  template: { slug: string; title: string; description: string; keywords?: string[]; body(facts: Facts): string },
  facts: Facts,
  date: string,
  news: NewsItem[] = [],
): { body: string; content: string } {
  const body = `${template.body(facts).trim()}\n\n${newsSection(news, date).trim()}`;
  const sectionCount = (body.match(/^## /gm) ?? []).length;
  if (body.length < 400 || sectionCount < 2) {
    throw new Error("generated article is incomplete; nothing written");
  }
  const problems = verifyFigures(body, facts.hackathons);
  if (problems.length > 0) {
    throw new Error(`fact-check blocked ${problems.length} unsupported figure(s): ${problems.slice(0, 3).join("; ")}`);
  }

  const slug = slugify(template.slug);
  const keywords = [
    ...(template.keywords ?? []).slice(0, 6),
    ...extractTitleKeywords(news).slice(0, 3),
  ].filter(Boolean);
  const frontmatter = [
    "---",
    `title: ${template.title.replace(/"/g, "'")}`,
    `slug: ${slug}`,
    `date: ${date}`,
    `description: ${template.description.replace(/"/g, "'")}`,
    "tags: AI hackathons, Dataset, AI news",
    ...(keywords.length ? [`keywords: ${keywords.join(", ")}`] : []),
    "author: AI Hackathons",
    "---",
    "",
    body,
    "",
  ].join("\n");
  return { body, content: frontmatter };
}

/**
 * Generates today's article into `content/blog`. Returns the file name it
 * wrote, or `null` when the day already has an article or no topic fits.
 * `options.fetchNews` lets callers inject a news source (tests) or disable the
 * sidecar entirely; the default fetches live RSS headlines best-effort.
 */
export async function runGeneration(
  date: string,
  base = process.cwd(),
  options: { fetchNews?: () => Promise<NewsItem[]> } = {},
): Promise<string | null> {
  const dir = path.join(base, "content", "blog");
  const state = await readState(base);

  if (state.articles[date]) {
    console.log(`[blog] ${date} already published (${state.articles[date]}). Nothing to do.`);
    return null;
  }
  const files = await fs.readdir(dir).catch(() => [] as string[]);
  if (files.some((f) => f.startsWith(date))) {
    console.log(`[blog] ${date} already has an article file. Nothing to do.`);
    return null;
  }

  const facts = await buildFacts(base);
  const template = selectTopicFor(facts, date);
  if (!template) {
    console.log(`[blog] no topic has enough data for ${date}; skipping the day.`);
    return null;
  }

  const fetchNews = options.fetchNews ?? (() => fetchDailyNews(base));
  const news = await fetchNews().catch(() => []);
  const matched = matchNewsToTemplate(news, template.keywords);
  if (matched.length > 0) console.log(`[blog] ${matched.length} news items matched "${template.slug}"`);

  const { content } = composeArticle(template, facts, date, matched);
  const fileName = `${date}-${template.slug}.md`;
  await fs.writeFile(path.join(dir, fileName), content, "utf8");

  state.latest = date;
  state.articles[date] = template.slug;
  await fs.writeFile(path.join(dir, ".published.json"), JSON.stringify(state, null, 2) + "\n", "utf8");

  console.log(`[blog] wrote ${fileName}`);
  return fileName;
}

async function main() {
  try {
    await runGeneration(todayIso());
  } catch (error) {
    console.error(`[blog] ${(error as Error).message}`);
    process.exitCode = 1;
  }
}

main();