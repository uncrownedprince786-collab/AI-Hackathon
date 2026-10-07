import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { selectTopic, verifyFigures, type Facts } from "../scripts/templates";
import { composeArticle, runGeneration } from "../scripts/generate-post";
import { hackathon } from "./helpers";

function facts(hackathons: ReturnType<typeof hackathon>[] = [], lastUpdated = "2026-10-06T06:00:00.000Z"): Facts {
  return { hackathons, lastUpdated };
}

const sample = hackathon({
  name: "Global AI Build Weekend",
  slug: "global-ai-build-weekend",
  organizer: "Build Fest",
  status: "upcoming",
  mode: "online",
  country: "Canada",
  startDate: "2026-12-10",
  endDate: "2026-12-12",
  totalPrizeUsd: 90000,
  claimedPrizeUsd: 90000,
});

test("a thin dataset skips the day instead of publishing thin content", () => {
  assert.equal(selectTopic(facts([]), 0), null);
});

test("the topic router picks the first rotating topic the data supports", () => {
  assert.equal(selectTopic(facts([sample]), 0)?.slug, "upcoming-ongoing-or-past");
  const rich = facts([
    sample,
    hackathon({ ...sample, id: "x2", name: "GenAI Sprint", slug: "genai-sprint", totalPrizeUsd: 5000, claimedPrizeUsd: 2000, cashPrizeUsd: 2000, prizeBreakdownPublished: true, status: "ongoing", prizes: [{ amount: 2000, currency: "USD", type: "cash", label: "Cash" }] }),
    hackathon({ ...sample, id: "x3", name: "LLM Jam", slug: "llm-jam", totalPrizeUsd: 3000, claimedPrizeUsd: 3000, status: "past" }),
  ]);
  assert.equal(selectTopic(rich, 0)?.slug, "biggest-prize-pools");
});

test("composition writes valid frontmatter and a truthful source footer", () => {
  const topic = selectTopic(facts([sample]), 1)!;
  const { content } = composeArticle(topic, facts([sample]), "2026-10-07");
  assert.match(content, /^---\r?\ntitle: /);
  assert.match(content, /Sources & verification/);
  assert.match(content, /last updated \*\*2026-10-06\*\*/);
  assert.match(content, /\]\(\/hackathons\/global-ai-build-weekend\)/);
});

test("the fact-check gate blocks invented money figures", () => {
  const problems = verifyFigures("This pool is worth **$1,000,000** and **$90,000** today.", [sample]);
  assert.ok(problems.some((p) => p.includes("$1,000,000")));
  assert.ok(!problems.some((p) => p.includes("$90,000")), "an inventoried figure passes");
});

test("running the generator twice publishes exactly one article", async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "blog-engine-"));
  const dataDir = path.join(base, "src", "data");
  const blogDir = path.join(base, "content", "blog");
  await fs.mkdir(dataDir, { recursive: true });
  await fs.mkdir(blogDir, { recursive: true });
  await fs.writeFile(
    path.join(dataDir, "hackathons.json"),
    JSON.stringify({ meta: { lastUpdated: "2026-10-06T06:00:00.000Z" }, hackathons: [sample] }),
    "utf8",
  );

  const first = await runGeneration("2026-10-07", base);
  const second = await runGeneration("2026-10-07", base);

  assert.ok(first && first.startsWith("2026-10-07"));
  assert.equal(second, null, "the second run must be a no-op");
  const files = await fs.readdir(blogDir);
  assert.equal(files.filter((f) => f.startsWith("2026-10-07")).length, 1);
  const state = JSON.parse(await fs.readFile(path.join(blogDir, ".published.json"), "utf8"));
  assert.equal(state.articles["2026-10-07"], first.replace("2026-10-07-", "").replace(".md", ""));

  await fs.rm(base, { recursive: true, force: true });
});

test("a date whose topic skips leaves no new files behind", async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "blog-skip-"));
  await fs.mkdir(path.join(base, "src", "data"), { recursive: true });
  await fs.mkdir(path.join(base, "content", "blog"), { recursive: true });
  await fs.writeFile(
    path.join(base, "src", "data", "hackathons.json"),
    JSON.stringify({ meta: { lastUpdated: "2026-10-06T06:00:00.000Z" }, hackathons: [] }),
    "utf8",
  );
  const result = await runGeneration("2026-10-08", base);
  assert.equal(result, null);
  const files = await fs.readdir(path.join(base, "content", "blog"));
  assert.deepEqual(files, []);
  await fs.rm(base, { recursive: true, force: true });
});