import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractPrizeAnnouncement,
  parsePrizeAmounts,
} from "../src/lib/sources/prize-extract";

test("parsePrizeAmounts reads USD figures", () => {
  const hits = parsePrizeAmounts(
    "Grand prizes: $138,000, plus US$24,500 in credits and $100k for runners-up.",
  );
  const byAmount = new Map(hits.map((h) => [h.amount, h.currency]));
  assert.equal(byAmount.get(138000), "USD");
  assert.equal(byAmount.get(24500), "USD");
  assert.equal(byAmount.get(100000), "USD");
});

test("parsePrizeAmounts preserves non-USD currencies without converting", () => {
  const hits = parsePrizeAmounts("Prizes: €20,000 and £10,000, and 20,000 EUR mentioned twice.");
  const eur = hits.filter((h) => h.currency === "EUR");
  const gbp = hits.filter((h) => h.currency === "GBP");
  assert.ok(eur.length >= 1, "EUR figure parsed");
  assert.ok(gbp.length >= 1, "GBP figure parsed");
  for (const h of hits) assert.equal(h.usd, 0, "non-USD must never count as USD");
});

test("parsePrizeAmounts ignores bare numbers without a currency", () => {
  assert.equal(parsePrizeAmounts("1,500 participants and 300 teams registered").length, 0);
});

test("parsePrizeAmounts handles the Devpost span markup", () => {
  const hits = parsePrizeAmounts("ML Build Challenge ($<span>150,000</span> in prizes!)");
  const usd = hits.find((h) => h.currency === "USD");
  assert.ok(usd, "span-stripped figure parsed");
  assert.equal(usd!.amount, 150000);
});

test("parsePrizeAmounts handles amount-then-code form", () => {
  const hits = parsePrizeAmounts("Total prize pool: 20,000 EUR");
  assert.equal(hits.find((h) => h.currency === "EUR")?.amount, 20000);
});

test("extractPrizeAnnouncement: $400,000 announced total pool", () => {
  const ann = extractPrizeAnnouncement("AI Challenge", "$400,000 announced total pool");
  assert.equal(ann.usd, 400000);
  assert.equal(ann.nonUsd, undefined);
});

test("extractPrizeAnnouncement: 'up to US$24,500' pool", () => {
  const ann = extractPrizeAnnouncement(
    "Intel Build Challenge",
    "Prize pool worth up to US$24,500 for the top teams.",
  );
  assert.equal(ann.usd, 24500);
});

test("extractPrizeAnnouncement: $100k in prizes", () => {
  const ann = extractPrizeAnnouncement("DSH Hacks", "$100k+ in prizes!");
  assert.equal(ann.usd, 100000);
});

test("extractPrizeAnnouncement: €20,000 pool stays in EUR", () => {
  const ann = extractPrizeAnnouncement(
    "Euro AI Days",
    "There is a prize pool of €20,000 for the winners.",
  );
  assert.equal(ann.usd, undefined);
  assert.deepEqual(ann.nonUsd, { amount: 20000, currency: "EUR" });
});

test("extractPrizeAnnouncement: £10,000 pool stays in GBP", () => {
  const ann = extractPrizeAnnouncement(
    "UK Agents Hack",
    "Total £10,000 prize pool across all tracks.",
  );
  assert.deepEqual(ann.nonUsd, { amount: 10000, currency: "GBP" });
});

test("extractPrizeAnnouncement: $20k cash + $80k credits becomes an itemised split", () => {
  const ann = extractPrizeAnnouncement(
    "Prizes: $20,000 in cash and $80,000 in credits.",
  );
  assert.deepEqual(ann.split, { cash: 20000, credits: 80000 });
});

test("extractPrizeAnnouncement: cash + credits split is never mislabelled as pure cash", () => {
  const ann = extractPrizeAnnouncement(
    "Prize money: $10k cash + $90k credits.",
  );
  assert.equal(ann.usd, undefined);
  assert.deepEqual(ann.split, { cash: 10000, credits: 90000 });
});

test("extractPrizeAnnouncement: ordinary amounts are ignored ($15 for a domain)", () => {
  const ann = extractPrizeAnnouncement(
    "We will also give $15 for the best .xyz domain, and the hackathon is free.",
  );
  assert.deepEqual(ann, {});
});

test("extractPrizeAnnouncement: a design prize row is not a pool", () => {
  const ann = extractPrizeAnnouncement(
    "Best design prize: $15 gift card for one team.",
  );
  assert.deepEqual(ann, {});
});

test("extractPrizeAnnouncement: no prize information returns empty", () => {
  assert.deepEqual(
    extractPrizeAnnouncement(
      "Compete to solve challenges with our API. Winners will be announced after the event.",
    ),
    {},
  );
  assert.deepEqual(extractPrizeAnnouncement(undefined, ""), {});
});

test("extractPrizeAnnouncement: 'prizes TBD' returns empty", () => {
  assert.deepEqual(
    extractPrizeAnnouncement("Prizes TBD. Registration opens soon."),
    {},
  );
});

test("parsePrizeAmounts never scales with a letter from the next word", () => {
  // "$6,300 Main prizes" must stay $6,300 — not $6,300,000,000.
  const hits = parsePrizeAmounts("Total prize pool: $6,300 Main prizes");
  assert.equal(hits.find((h) => h.currency === "USD")?.amount, 6300);
  assert.ok(!hits.some((h) => h.amount > 6300));
});

test("extractPrizeAnnouncement: lablab '$6,300 Main prizes' stays a $6,300 pool", () => {
  const ann = extractPrizeAnnouncement(
    "Alpaca AI Trading Agents Hackathon",
    "Prizes 🏆 Total prize pool: $6,300 Main prizes 🥇 1st place $2,500 + $300 in Featherless credits.",
  );
  assert.equal(ann.usd, 6300);
});

test("parsePrizeAmounts still scales a real k/M suffix", () => {
  const hits = parsePrizeAmounts("Prize pool worth $100k and a $1M grand prize.");
  const usd = new Map(hits.map((h) => [h.amount, h.currency]));
  assert.equal(usd.get(100000), "USD");
  assert.equal(usd.get(1000000), "USD");
});

test("extractPrizeAnnouncement: a real M suffix still scales", () => {
  const ann = extractPrizeAnnouncement("Meta Challenge", "Up to $1M in prizes for the winners.");
  assert.equal(ann.usd, 1000000);
});