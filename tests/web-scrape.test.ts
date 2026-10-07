import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyWinnerSummaries,
  buildWebDraft,
  collectWinnerTargets,
  dedupeCandidates,
  extractDatesFromText,
  inferMode,
  isAiScrapeCandidate,
  isLikelyEventPath,
  plausibleWinnerSummary,
  siteNameFor,
  structuredEvent,
  tagsFromText,
  webDraftToHackathon,
  winnerSummaryFromExtract,
  type PageExtract,
} from "../src/lib/web-scrape";
import { findCityInText } from "../src/lib/geo";
import { hackathon } from "./helpers";

/* ---------------------------------------------------------------- *
 * Search / candidate helpers
 * ---------------------------------------------------------------- */

test("isAiScrapeCandidate accepts real AI hackathons", () => {
  assert.equal(
    isAiScrapeCandidate(
      "Generative AI Hackathon 2026",
      "Build with large language models and generative AI tools.",
      "https://example.org/ai-hackathon",
    ),
    true,
  );
  assert.equal(
    isAiScrapeCandidate(
      "ML Hackathon",
      "A machine learning competition for students worldwide.",
      "https://mlh.io/events/foo",
    ),
    true,
  );
});

test("isAiScrapeCandidate rejects non-AI events", () => {
  assert.equal(
    isAiScrapeCandidate(
      "Community Beach Cleanup",
      "Join us to clean the local coastline this weekend.",
      "https://example.org/cleanup",
    ),
    false,
  );
});

test("explicit non-AI text is rejected", () => {
  assert.equal(
    isAiScrapeCandidate(
      "Finance Meetup 2026",
      "A finance networking event that is not an AI hackathon.",
      "https://example.org/finance",
    ),
    false,
  );
});

test("siteNameFor maps listing platforms to friendly names", () => {
  assert.equal(siteNameFor("https://mlh.io/events/x"), "MLH");
  assert.equal(siteNameFor("https://www.eventbrite.com/e/foo"), "Eventbrite");
  assert.equal(siteNameFor("https://www.unstop.com/competitions/x"), "Unstop");
  assert.equal(siteNameFor("https://www.kaggle.com/competitions/x"), "Kaggle");
  assert.equal(siteNameFor("https://example.org/hackathon"), "example");
});

test("isLikelyEventPath recognises event page shapes", () => {
  assert.equal(isLikelyEventPath("https://www.eventbrite.com/e/ai-hackathon-tickets-123"), true);
  assert.equal(isLikelyEventPath("https://www.kaggle.com/competitions/ai-computer-vision"), true);
  assert.equal(isLikelyEventPath("https://www.kaggle.com/competitions"), false);
  assert.equal(isLikelyEventPath("https://www.eventbrite.com/d/online/ai/"), false);
  assert.equal(isLikelyEventPath("https://twitter.com/x"), false);
});

test("dedupeCandidates keeps one entry per normalized url", () => {
  const out = dedupeCandidates([
    { url: "https://example.org/hackathon?utm_source=x", text: "a" },
    { url: "https://example.org/hackathon", text: "b" },
    { url: "https://other.org/", text: "c" },
  ]);
  assert.equal(out.length, 2);
});

/* ---------------------------------------------------------------- *
 * Structured data + dates
 * ---------------------------------------------------------------- */

test("structuredEvent reads a Hackathon JSON-LD block", () => {
  const html = `<script type="application/ld+json">{"@type":"Hackathon","name":"AI Buildathon","startDate":"2026-06-10","endDate":"2026-06-12","description":"A generative AI weekend.","location":{"name":"Berlin","address":{"addressLocality":"Berlin","addressCountry":"DE"}},"organizer":{"name":"AI Campus"}}</script>`;
  const event = structuredEvent(html);
  assert.equal(event.name, "AI Buildathon");
  assert.equal(event.startDate, "2026-06-10");
  assert.equal(event.endDate, "2026-06-12");
  assert.equal(event.location, "Berlin, DE");
  assert.equal(event.organizer, "AI Campus");
});

test("structuredEvent ignores non-event JSON-LD but finds Event inside collections", () => {
  const html = `<script type="application/ld+json">{"@type":"WebSite","name":"Home"}</script><script type="application/ld+json">{"@type":"ItemList","itemListElement":[{"@type":"Event","name":"AI Expo","startDate":"2026-08-01","endDate":"2026-08-02"}]}</script>`;
  const event = structuredEvent(html);
  assert.equal(event.name, "AI Expo");
});

test("extractDatesFromText reads month-name ranges", () => {
  assert.deepEqual(extractDatesFromText("July 4-6, 2026"), { start: "2026-07-04", end: "2026-07-06" });
  assert.deepEqual(extractDatesFromText("starts March 1 2026 and runs until March 5 2026"), {
    start: "2026-03-01",
    end: "2026-03-05",
  });
});

test("extractDatesFromText reads ISO dates and returns null when absent", () => {
  assert.deepEqual(extractDatesFromText("From 2026-09-15 to 2026-09-17 online."), {
    start: "2026-09-15",
    end: "2026-09-17",
  });
  assert.equal(extractDatesFromText("Prizes and fun for everyone."), null);
});

test("inferMode recognises online, hybrid and in-person", () => {
  assert.equal(inferMode("Online, from anywhere in the world"), "online");
  assert.equal(inferMode("Hybrid event in Singapore"), "hybrid");
  assert.equal(inferMode("On the MIT campus in Boston"), "in-person");
  assert.equal(inferMode(undefined), "in-person");
});

test("tagsFromText pulls site vocabulary tags", () => {
  const tags = tagsFromText("A generative AI hackathon with LLM agents and vision");
  assert.ok(tags.includes("Generative AI"));
  assert.ok(tags.includes("LLM"));
  assert.ok(tags.includes("AI Agents"));
});

/* ---------------------------------------------------------------- *
 * Draft building
 * ---------------------------------------------------------------- */

function fixturePageExtract(overrides: Partial<PageExtract> = {}): PageExtract {
  return {
    url: "https://example.org/ai-innovate-hackathon",
    title: "AI Innovate Hackathon 2026 - Build with AI",
    h1: ["AI Innovate Hackathon 2026"],
    ogTitle: "AI Innovate Hackathon 2026",
    ogDescription: "",
    metaDescription: "A machine learning hackathon where teams build with LLMs.",
    bodyText:
      "AI Innovate Hackathon 2026 starts July 10 2026 and ends July 12 2026. Prizes: $400,000 in prizes. A machine learning hackathon using generative AI.",
paragraphs: ["A machine learning hackathon where teams build with LLMs."],
  jsonLd: [],
  sameHostEventLinks: 0,
  ...overrides,
};
}

test("buildWebDraft extracts a usable AI event with honest prize text", () => {
  const draft = buildWebDraft("Organizer page", fixturePageExtract(), new Date("2026-01-01T00:00:00Z"));
  assert.ok(draft);
  assert.equal(draft?.name, "AI Innovate Hackathon 2026");
  assert.equal(draft?.startDate, "2026-07-10");
  assert.equal(draft?.endDate, "2026-07-12");
  assert.match(draft?.prizeText ?? "", /\$400,000/);
  assert.equal(draft?.sourceName, "Organizer page");
});

test("buildWebDraft rejects non-AI pages and pages without dates", () => {
  const nonAi = buildWebDraft(
    "Organizer page",
    fixturePageExtract({
      h1: ["Summer Music Festival 2026"],
      metaDescription: "A weekend of live concerts and food.",
      bodyText: "Summer Music Festival on July 10 2026. Tickets on sale now.",
    }),
    new Date("2026-01-01T00:00:00Z"),
  );
  assert.equal(nonAi, null);

  const noDates = buildWebDraft(
    "Organizer page",
    fixturePageExtract({ bodyText: "AI hackathon with prizes and fun. Sign up today." }),
    new Date("2026-01-01T00:00:00Z"),
  );
  assert.equal(noDates, null);
});

test("buildWebDraft rejects placeholder, thank-you walls and listing hubs", () => {
  const underConstruction = buildWebDraft(
    "Organizer page",
    fixturePageExtract({
      h1: ["Under construction, check back for updates"],
      bodyText: "AI hackathon coming soon. Prizes announced later.",
    }),
    new Date("2026-01-01T00:00:00Z"),
  );
  assert.equal(underConstruction, null);

  const thanks = buildWebDraft(
    "Organizer page",
    fixturePageExtract({
      h1: ["A round of applause to our sponsors"],
      bodyText: "Thanks everyone. AI hackathon on July 10 2026",
    }),
    new Date("2026-01-01T00:00:00Z"),
  );
  assert.equal(thanks, null);

  const hub = buildWebDraft(
    "Organizer page",
    fixturePageExtract({ h1: ["AI Hackathons"], sameHostEventLinks: 12 }),
    new Date("2026-01-01T00:00:00Z"),
  );
  assert.equal(hub, null);
});

test("buildWebDraft turns a post-event thank-you title into the event name", () => {
  const draft = buildWebDraft(
    "Organizer page",
    fixturePageExtract({
      h1: ["Thank You for Making the Global AI Hackathon 2026 a Success"],
      bodyText: "Global AI Hackathon ran July 10 2026 to July 12 2026 with $200,000 in prizes.",
    }),
    new Date("2026-01-01T00:00:00Z"),
  );
  assert.ok(draft);
  assert.equal(draft?.name, "Global AI Hackathon 2026");
});

test("extractDatesFromText never invents a year", () => {
  assert.equal(extractDatesFromText("Happening on November 15, details to come."), null);
  assert.equal(extractDatesFromText("Registration opens March 1."), null);
});

test("findCityInText recognises a known venue city", () => {
  assert.equal(findCityInText("The event is held in London and open to all."), "London");
  assert.equal(findCityInText("Venue: São Paulo, Brazil"), "Sao Paulo");
  assert.equal(findCityInText("No city mentioned anywhere here."), undefined);
});

test("buildWebDraft refuses AI-ish words as a location", () => {
  const draft = buildWebDraft(
    "Organizer page",
    fixturePageExtract({
      bodyText:
        "AI Innovate Hackathon starts July 10 2026 and ends July 12 2026 at AI Recognition Week. Prizes: $100,000 in prizes.",
    }),
    new Date("2026-01-01T00:00:00Z"),
  );
  assert.ok(draft);
  assert.equal(draft?.location, undefined);
});

test("buildWebDraft finds a real city from the body and the URL", () => {
  const fromBody = buildWebDraft(
    "Organizer page",
    fixturePageExtract({ bodyText: "AI Innovate Hackathon runs July 10 2026 to July 12 2026 in London, $100,000 prizes." }),
    new Date("2026-01-01T00:00:00Z"),
  );
  assert.equal(fromBody?.location, "London");

  const fromUrl = buildWebDraft(
    "Organizer page",
    fixturePageExtract({
      url: "https://www.deep-tech-week.com/london-2026/events/london-ai-x-science-hackathon-2026",
      bodyText: "AI Innovate Hackathon runs July 10 2026 to July 12 2026. Prizes: $100,000 in prizes.",
    }),
    new Date("2026-01-01T00:00:00Z"),
  );
  assert.equal(fromUrl?.location, "London");
});

test("webDraftToHackathon keeps an announced pool as announced, never cash", () => {
  const draft = buildWebDraft(
    "Organizer page",
    fixturePageExtract({ bodyText: "AI Innovate starts July 10 2026 ends July 12 2026. Prizes: $400,000 in prizes." }),
    new Date("2026-01-01T00:00:00Z"),
  );
  assert.ok(draft);
  const h = webDraftToHackathon(draft!, new Date("2026-01-01T00:00:00Z"));
  assert.ok(h);
  assert.equal(h!.claimedPrizeUsd, 400000);
  assert.equal(h!.prizeBreakdownPublished, false);
  assert.equal(h!.prizes.length, 0);
  assert.equal(h!.startDate, "2026-07-10");
  const hash = h!.id.split("-")[1];
  assert.ok(hash.length >= 10);
});

test("webDraftToHackathon turns a published cash+credits split into items", () => {
  const draft = buildWebDraft(
    "Organizer page",
    fixturePageExtract({
      bodyText:
        "AI Innovate starts July 10 2026 ends July 12 2026. Prizes: $10,000 in cash and $90,000 in credits.",
    }),
    new Date("2026-01-01T00:00:00Z"),
  );
  assert.ok(draft);
  const h = webDraftToHackathon(draft!, new Date("2026-01-01T00:00:00Z"));
  assert.ok(h);
  assert.equal(h!.prizeBreakdownPublished, true);
  assert.equal(h!.prizes.length, 2);
  assert.ok(h!.prizes.some((p) => p.type === "cash" && p.amount === 10000));
  assert.equal(h!.claimedPrizeUsd, undefined);
});

test("webDraftToHackathon reports Prize not published when nothing is stated", () => {
  const draft = buildWebDraft(
    "Organizer page",
    fixturePageExtract({ bodyText: "AI Innovate starts July 10 2026 ends July 12 2026. Join the build." }),
    new Date("2026-01-01T00:00:00Z"),
  );
  assert.ok(draft);
  const h = webDraftToHackathon(draft!, new Date("2026-01-01T00:00:00Z"));
  assert.ok(h);
  assert.equal(h!.totalPrizeUsd, 0);
  assert.equal(h!.claimedPrizeUsd, undefined);
  assert.equal(h!.prizes.length, 0);
});

const URL = "https://devpost.com/software/robo-lens";

const page: PageExtract = {
  url: URL,
  title: "Robo Lens",
  h1: ["Robo Lens"],
  ogTitle: "Robo Lens",
  ogDescription: "",
  metaDescription: "",
  bodyText: "",
  paragraphs: ["A computer vision tool that detects potholes for city maintenance crews."],
  jsonLd: [],
  sameHostEventLinks: 0,
};

test("winnerSummaryFromExtract keeps a real project description", () => {
  assert.equal(
    winnerSummaryFromExtract("Robo Lens", page),
    "A computer vision tool that detects potholes for city maintenance crews.",
  );
});

test("plausibleWinnerSummary rejects generic page copy", () => {
  assert.equal(plausibleWinnerSummary("Robo Lens", "Devpost is the largest hackathon community worldwide."), null);
  assert.equal(plausibleWinnerSummary("Robo Lens", "Sign up now to build and submit your project."), null);
  assert.equal(plausibleWinnerSummary("Robo Lens", "Robo Lens"), null);
  assert.equal(plausibleWinnerSummary("Robo Lens", "Short"), null);
  assert.notEqual(
    plausibleWinnerSummary("Robo Lens", "A computer vision tool that detects potholes for city crews."),
    null,
  );
});

test("collectWinnerTargets picks winners missing a summary", () => {
  const base = hackathon();
  const withSummary = hackathon({
    ...base,
    id: "h2",
    winners: [
      { project: "Done", url: "https://devpost.com/software/done", summary: "Already described." },
      { project: "Missing", url: "https://devpost.com/software/missing" },
      { project: "NoLink" },
    ],
  });
  const targets = collectWinnerTargets([withSummary], []);
  assert.equal(targets.length, 1);
  assert.equal(targets[0].project, "Missing");
});

test("applyWinnerSummaries merges cached summaries without overwriting", () => {
  const base = hackathon();
  const h = hackathon({
    ...base,
    winners: [
      { project: "A", url: "https://devpost.com/software/a", summary: "Source summary." },
      { project: "B", url: "https://devpost.com/software/b" },
      { project: "C" },
    ],
  });
  const filled = applyWinnerSummaries([h], [
    { url: "https://devpost.com/software/a", project: "A", summary: "Should not replace." },
    { url: "https://devpost.com/software/b", project: "B", summary: "Built an agent that plans trips." },
  ]);
  assert.equal(filled, 1);
  assert.equal(h.winners[0].summary, "Source summary.");
  assert.equal(h.winners[1].summary, "Built an agent that plans trips.");
  assert.equal(h.winners[2].summary, undefined);
});