import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Writes one new blog article per day into `content/blog`.
 *
 * It only ever adds a file: if today's article already exists the script does
 * nothing, so running it from a workflow twice cannot overwrite anything.
 * With no free API key configured it exits quietly.
 *
 *   npx tsx scripts/generate-post.ts
 *   npx tsx scripts/generate-post.ts "How AI image generators work"
 */

const DIR = path.join(process.cwd(), "content", "blog");
const UA = "ai-hackathons-site/1.0 (+https://ai-hackathons-tawny.vercel.app)";

/** Evergreen topics, so an article is never built on unverified news. */
const TOPICS = [
  "How AI image generators work",
  "What embedding models do and why search uses them",
  "Fine-tuning versus prompting, and when each one wins",
  "How AI coding assistants help without taking over",
  "How to evaluate an AI feature before you ship it",
  "Running a small model on your own machine",
  "What multimodal AI can actually see and hear",
  "Vector databases in plain English",
  "How AI copilots differ from AI agents",
  "Getting reliable output from an AI feature",
  "Where AI still struggles, and how to design around it",
  "How AI is used in healthcare and science",
  "What is coming next in AI, and how to keep up",
  "How AI helps people who do not code",
];

const SYSTEM = `You write short, honest articles for a public directory of AI hackathons.

Rules:
- Plain, common English. No buzzwords, no hype, no "revolutionary", no emojis.
- Factual and checkable. Never invent news, dates, versions, prices, quotes or citations.
- Explain what something is, how people use it, and where it fails.
- 420 to 600 words.
- Markdown with two or three "##" headings, short paragraphs and short lists where useful.
- Start with a one sentence intro. End with one practical takeaway.

Return only a JSON object with "title", "slug" (lowercase words separated by hyphens),
"description" (under 160 characters) and "body" (the markdown, no frontmatter).`;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function topicForDay(date: string): string {
  const stamp = Date.parse(`${date}T00:00:00Z`);
  const dayIndex = Math.floor(stamp / 86_400_000);
  return TOPICS[((dayIndex % TOPICS.length) + TOPICS.length) % TOPICS.length];
}

async function askGroq(key: string, model: string, topic: string): Promise<string> {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}`, "user-agent": UA },
    body: JSON.stringify({
      model,
      temperature: 0.7,
      max_tokens: 2000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `Write the article about: ${topic}` },
      ],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`groq ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  return body.choices?.[0]?.message?.content ?? "";
}

async function askGemini(key: string, model: string, topic: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model,
  )}:generateContent?key=${encodeURIComponent(key)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": UA },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: "user", parts: [{ text: `Write the article about: ${topic}` }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2400,
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            title: { type: "STRING" },
            slug: { type: "STRING" },
            description: { type: "STRING" },
            body: { type: "STRING" },
          },
          required: ["title", "slug", "description", "body"],
        },
      },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`gemini ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const body = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  return body.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

function safeSlug(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70)
    .replace(/-+$/g, "");
}

async function main() {
  const date = todayIso();
  const explicitTopic = process.argv.slice(2).join(" ").trim();

  const files = await fs.readdir(DIR).catch(() => [] as string[]);
  const alreadyToday = files.filter((f) => f.startsWith(date));
  if (alreadyToday.length > 0 && !explicitTopic) {
    console.log(`[blog] ${date} already has an article (${alreadyToday.join(", ")}). Nothing to do.`);
    return;
  }

  const groq = process.env.GROQ_API_KEY?.trim();
  const gemini = process.env.GEMINI_API_KEY?.trim();
  if (!groq && !gemini) {
    console.log("[blog] no GROQ_API_KEY or GEMINI_API_KEY set, skipping article generation.");
    return;
  }

  const topic = explicitTopic || topicForDay(date);
  console.log(`[blog] writing "${topic}" for ${date}...`);

  let raw = "";
  try {
    raw = groq
      ? await askGroq(groq, process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile", topic)
      : await askGemini(gemini!, process.env.GEMINI_MODEL ?? "gemini-2.0-flash", topic);
  } catch (error) {
    console.error(`[blog] generation failed: ${(error as Error).message}`);
    process.exitCode = 1;
    return;
  }

  let parsed: { title?: string; slug?: string; description?: string; body?: string };
  try {
    parsed = JSON.parse(raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim());
  } catch {
    console.error("[blog] model did not return valid JSON");
    process.exitCode = 1;
    return;
  }

  const title = (parsed.title ?? "").trim();
  const slug = safeSlug(parsed.slug ?? topic);
  const description = (parsed.description ?? "").trim().slice(0, 180);
  const body = (parsed.body ?? "").trim();

  if (!title || !slug || body.length < 400) {
    console.error("[blog] incomplete article from the model, nothing written.");
    process.exitCode = 1;
    return;
  }

  const file = path.join(DIR, `${date}-${slug}.md`);
  const frontmatter = [
    "---",
    `title: ${title.replace(/"/g, "'")}`,
    `slug: ${slug}`,
    `date: ${date}`,
    `description: ${description.replace(/"/g, "'")}`,
    "tags: AI, Getting started",
    "author: AI Hackathons",
    "---",
    "",
    body,
    "",
  ].join("\n");

  await fs.writeFile(file, frontmatter, "utf8");
  console.log(`[blog] wrote ${path.relative(process.cwd(), file)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
