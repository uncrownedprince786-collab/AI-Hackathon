import { test } from "node:test";
import assert from "node:assert/strict";
import { screenRecords } from "../src/lib/sources/accuracy-engine";
import { hackathon } from "./helpers";

const richDescription =
  "Build AI prototypes — chatbots, agents and generative apps — over a weekend. " +
  "Teams produce a working demo and pitch to judges. Mentors from the sponsor " +
  "are online throughout the event. Prizes are announced per track.";

const base = hackathon({
  name: "Global AI Build Weekend",
  organizer: "Build Fest LLC",
  startDate: "2026-12-10",
  endDate: "2026-12-12",
  description: richDescription,
  tags: ["Generative AI", "AI Agents", "LLM"],
  officialUrl: "https://buildfest.example/global-ai-weekend",
  sourceUrl: "https://buildfest.example/global-ai-weekend",
  sourceName: "devpost",
  sourceId: "devpost-1",
});

test("the same landing page is never published twice (URL dedupe)", () => {
  const dup = hackathon(base);
  const result = screenRecords([base, dup]);
  assert.equal(result.published.length, 1);
  const cause = result.summary.causes.find((c) => c.cause === "duplicate listing");
  assert.ok(cause && cause.count >= 1, "duplicate listing should be reported");
});

test("two sources hosting the same event collapse to one record", () => {
  const mirror = hackathon({
    ...base,
    id: "lablab-1",
    sourceId: "lablab-1",
    sourceName: "lablab",
    officialUrl: "https://events.lablab.example/global-ai-build-weekend",
    sourceUrl: "https://events.lablab.example/global-ai-build-weekend",
  });
  const result = screenRecords([mirror, base]);
  assert.equal(result.published.length, 1, "identity dedupe keeps only one");
});

test("the same title on the same start date is treated as one event", () => {
  const second = hackathon({ ...base, officialUrl: "https://other.example/event" });
  const result = screenRecords([base, second]);
  assert.equal(result.published.length, 1);
});

test("distinct events with the same title but different dates survive", () => {
  const nextRun = hackathon({
    ...base,
    startDate: "2027-03-10",
    endDate: "2027-03-12",
    officialUrl: "https://buildfest.example/next-run",
    sourceUrl: "https://buildfest.example/next-run",
  });
  const result = screenRecords([base, nextRun]);
  assert.equal(result.published.length, 2);
});