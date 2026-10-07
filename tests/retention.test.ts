import { test } from "node:test";
import assert from "node:assert/strict";
import { selectRetained } from "../src/lib/collector";
import { hackathon } from "./helpers";

const upDev = hackathon({
  id: "d1",
  sourceName: "devpost",
  sourceId: "d1",
  status: "upcoming",
  name: "Devpost upcoming",
  slug: "devpost-upcoming",
});
const pastDev = hackathon({
  ...upDev,
  id: "d2",
  status: "past",
  name: "Devpost past",
  slug: "devpost-past",
});
const upLab = hackathon({
  id: "l1",
  sourceName: "lablab",
  sourceId: "l1",
  status: "upcoming",
  name: "Lablab upcoming",
  slug: "lablab-upcoming",
});
const curated = hackathon({
  id: "c1",
  sourceName: "Curated",
  sourceId: "c1",
  status: "upcoming",
  name: "Curated upcoming",
  slug: "curated-upcoming",
});

test("a failed source never loses its non-past records", () => {
  const retained = selectRetained(
    [upDev, pastDev, upLab, curated],
    new Set(),
    new Set(["lablab"]),
  );
  const ids = retained.map((h) => h.id).sort();
  // devpost failed -> upcoming kept; devpost past kept; lablab succeeded and
  // absent -> dropped; curated always kept.
  assert.deepEqual(ids, ["c1", "d1", "d2"]);
});

test("non-past records from a successful source are cleared when absent", () => {
  const retained = selectRetained([upLab, pastDev], new Set(), new Set(["lablab", "devpost"]));
  assert.deepEqual(
    retained.map((h) => h.id),
    ["d2"],
  );
});

test("live records are never retained twice", () => {
  const retained = selectRetained([upDev, upLab], new Set(["d1"]), new Set());
  assert.deepEqual(
    retained.map((h) => h.id),
    ["l1"],
  );
});