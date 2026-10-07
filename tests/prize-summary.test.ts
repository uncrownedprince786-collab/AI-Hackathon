import { test } from "node:test";
import assert from "node:assert/strict";
import { prizeSummary } from "../src/lib/format";
import { hackathon } from "./helpers";

test("announced pool is labelled as announced, never as cash", () => {
  const s = prizeSummary(
    hackathon({ claimedPrizeUsd: 400000, prizes: [], totalPrizeUsd: 0 }),
  );
  assert.equal(s.claimedOnly, true);
  assert.equal(s.label, "$400,000 announced pool");
  assert.match(s.label, /announced pool/);
  assert.doesNotMatch(s.label, /cash/);
});

test("itemised cash and credits keep their own accounting", () => {
  const s = prizeSummary(
    hackathon({
      cashPrizeUsd: 20000,
      creditPrizeUsd: 80000,
      prizeBreakdownPublished: true,
      totalPrizeUsd: 100000,
    }),
  );
  assert.equal(s.claimedOnly, false);
  assert.equal(s.label, "$20,000 cash + $80,000 credits");
});

test("no prize information is 'Prize not published', never 'No cash prize'", () => {
  const labels = [
    prizeSummary(hackathon()),
    prizeSummary(hackathon({ prizes: [], claimedPrizeUsd: undefined })),
    prizeSummary(
      hackathon({ name: "X", description: "Nothing here" }),
    ),
  ].map((s) => s.label);
  for (const label of labels) {
    assert.equal(label, "Prize not published");
    assert.doesNotMatch(label, /no cash prize/i);
  }
});

test("non-USD pool is preserved in its own currency with zero USD", () => {
  const s = prizeSummary(
    hackathon({ claimedPrize: { amount: 20000, currency: "EUR" } }),
  );
  assert.equal(s.totalUsd, 0);
  assert.equal(s.label, "€20,000 announced pool");
  assert.deepEqual(s.nonUsd, { amount: 20000, currency: "EUR" });
});

test("GBP pool label", () => {
  const s = prizeSummary(
    hackathon({ claimedPrize: { amount: 10000, currency: "GBP" } }),
  );
  assert.equal(s.label, "£10,000 announced pool");
});

test("headline stated in title/description is captured by the safety net", () => {
  const s = prizeSummary(
    hackathon({ name: "Mega AI Hack", description: "$75,000 in prizes for the winners." }),
  );
  assert.equal(s.totalUsd, 75000);
  assert.equal(s.claimedOnly, true);
});

test("a pool figure never implies a cash-only figure when items are absent", () => {
  const s = prizeSummary(
    hackathon({ claimedPrizeUsd: 50000, cashPrizeUsd: 0, creditPrizeUsd: 0, totalPrizeUsd: 50000 }),
  );
  assert.equal(s.claimedOnly, true);
  assert.doesNotMatch(s.label, / cash/);
});