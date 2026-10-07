import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeClaimedPrize } from "../src/lib/collector";
import { adapterForSourceId } from "../src/lib/sources/registry";

test("a corrected fresh value replaces a previously inflated stored value", () => {
  assert.equal(mergeClaimedPrize(6300, 6300000000), 6300);
});

test("an empty fresh value falls back to the stored figure", () => {
  assert.equal(mergeClaimedPrize(undefined, 6300000000), 6300000000);
});

test("adapter lookup matches by id", () => {
  assert.equal(adapterForSourceId("devpost")?.name, "Devpost");
  assert.equal(adapterForSourceId("lablab")?.name, "lablab.ai");
});

test("adapter lookup also matches display name so detail enrichment is not disabled", () => {
  const devpost = adapterForSourceId("Devpost");
  assert.ok(devpost?.requiresDetail, "Devpost must resolve for sourceName 'Devpost'");
  assert.equal(adapterForSourceId("lablab.ai")?.id, "lablab");
  assert.equal(adapterForSourceId("nope"), undefined);
});