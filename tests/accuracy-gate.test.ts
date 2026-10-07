import { test } from "node:test";
import assert from "node:assert/strict";
import { genericContentSignals, scoreRecord } from "../src/lib/sources/accuracy-engine";
import { hackathon } from "./helpers";

const realDescription =
  "Build AI prototypes — chatbots, agents and generative apps — over a weekend. " +
  "Teams produce a working demo and pitch to judges. Mentors from the sponsor " +
  "are online throughout the event. Prizes are announced per track.";

const base = hackathon({
  name: "Global AI Build Weekend",
  organizer: "Build Fest LLC",
  startDate: "2026-12-10",
  endDate: "2026-12-12",
  description: realDescription,
  tags: ["Generative AI", "AI Agents", "LLM"],
  officialUrl: "https://buildfest.example/global-ai-weekend",
  sourceUrl: "https://buildfest.example/global-ai-weekend",
  sourceName: "devpost",
  sourceId: "devpost-1",
});

test("a substantive event description has no fillers", () => {
  assert.equal(genericContentSignals(realDescription), 0);
  assert.equal(scoreRecord(base).verdict, "publish");
});

test("a real description with one hype phrase still publishes", () => {
  const hype = hackathon({
    ...base,
    description: `Unlock your potential and ${realDescription}`,
  });
  assert.equal(genericContentSignals(hype.description), 1);
  assert.equal(scoreRecord(hype).verdict, "publish");
});

test("filler-dominant short copy is held, not published", () => {
  const slop = hackathon({
    ...base,
    description:
      "Unlock your potential. Don't miss this opportunity to dive into the world of AI " +
      "and unleash your creativity. This is your chance to boost your profile.",
  });
  const report = scoreRecord(slop);
  assert.equal(genericContentSignals(slop.description), 5);
  assert.equal(report.verdict, "review");
  assert.ok(report.reasons.some((r) => r.includes("generic marketing copy")));
});

test("filler phrases in a long real description are not penalised", () => {
  const longSlop = hackathon({
    ...base,
    description:
      "Don't miss this once in a year chance to get hands-on with production LLM " +
      "infrastructure, batch inference, retrieval pipelines, evals and agent " +
      "runtimes, with workshops from the platform team and three judging " +
      "tracks covering research, product and open source impact. " +
      "Dive into the world of AI agents, vector search and evaluation harnesses " +
      "and ship something the judges can run end to end before the demo deadline.",
  });
  assert.ok(longSlop.description.length >= 220);
  assert.equal(scoreRecord(longSlop).verdict, "publish");
});