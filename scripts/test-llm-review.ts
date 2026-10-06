import { reviewWithLlm, llmConfig } from "../src/lib/sources/llm-review";
import type { Hackathon } from "../src/lib/types";

const rows = [
  {
    id: "1",
    name: "AI Builders Cup ($400,000 in prizes)",
    organizer: "Acme Corp, Inc.",
    description:
      "A global machine learning hackathon hosted in Berlin, Germany. Cash prize pool of $400,000. Registration is open.",
    location: "Berlin, Germany",
    tags: ["Machine Learning"],
  },
  {
    id: "2",
    name: "Blockchain Pizza Hack",
    organizer: "PizzaDAO",
    description: "A pizza baking competition. No computers needed.",
    location: "Online",
    tags: ["Crypto"],
  },
];

globalThis.fetch = (async (_url: unknown, init?: { body?: string }) => {
  const body = JSON.parse(init?.body ?? "{}");
  const prompt = JSON.stringify(body.messages?.[1]?.content ?? body.contents ?? "");
  const found = rows.filter((r) => prompt.includes(r.id));
  const results = found.map((r) => ({
    id: r.id,
    isAi: r.id === "1",
    complete: r.id === "1",
    registrationStatus: r.id === "1" ? "open" : null,
    organizerClean: "Acme Corp",
    cashPrizeUsd: 400000,
    claimedPrizeUsd: 400000,
    reason: r.id === "1" ? "real ai hackathon" : "not ai, baking event",
  }));
  return {
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content: JSON.stringify({ results }) } }] }),
  } as unknown as Response;
}) as typeof fetch;

const items: Hackathon[] = rows.map((r) => ({
  id: r.id,
  slug: r.id,
  name: r.name,
  description: r.description,
  status: "upcoming",
  mode: "online",
  organizer: r.organizer,
  startDate: "2026-11-01",
  endDate: "2026-11-15",
  location: r.location,
  prizes: [],
  totalPrizeUsd: 0,
  cashPrizeUsd: 0,
  creditPrizeUsd: 0,
  winners: [],
  tags: r.tags,
  officialUrl: `https://example.com/${r.id}`,
  sourceUrl: `https://example.com/${r.id}`,
  sourceName: "Devpost",
  sourceId: r.id,
  firstSeenAt: "2026-01-01",
  updatedAt: "2026-01-01",
}));

const config = { provider: "groq" as const, key: "test", model: "llama-3.3-70b-versatile" };

async function main() {
  console.log("config found:", llmConfig());
  const first = await reviewWithLlm(items, config);
  console.log(
    "run1 reviewed/rejected/fixed:",
    first.reviewed,
    first.rejected,
    first.fixed,
    first.model,
  );
  for (const h of items) {
    console.log(
      h.id,
      "| organizer:",
      h.organizer,
      "| cash:",
      h.cashPrizeUsd,
      "| claimed:",
      h.claimedPrizeUsd,
      "| registration:",
      h.registrationStatus,
      "| keep:",
      h.llmReview?.keep,
      "| total:",
      h.totalPrizeUsd,
      "| breakdown:",
      h.prizeBreakdownPublished,
      "| hash:",
      h.llmReview?.hash.slice(0, 8),
      "|",
      h.llmReview?.reason,
    );
  }
  const second = await reviewWithLlm(items, config);
  console.log("run2 reviewed (expect 0):", second.reviewed);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
