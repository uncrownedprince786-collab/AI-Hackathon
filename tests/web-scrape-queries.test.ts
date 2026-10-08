import test from "node:test";
import assert from "node:assert/strict";
import { pickQueries } from "../src/lib/web-scrape";

test("pickQueries returns the full worldwide query set on any day", () => {
  const d1 = pickQueries();
  const d2 = pickQueries();
  assert.equal(d1.length, d2.length);
  assert.ok(d1.length >= 20, "expect all topic, site and region queries");
  const joins = [...new Set([...d1, ...d2])];
  assert.equal(joins.length, d1.length, "same query set every run, no regional cap");
  assert.ok(d1.every((q) => q.length > 10));
});

test("pickQueries includes several country-specific region queries", () => {
  const queries = pickQueries();
  const countryQueries = queries.filter(
    (q) => /nigeria|india|singapore|brazil|mexico|germany|kenya|indonesia|canada|uae/i.test(q),
  );
  assert.ok(countryQueries.length >= 5);
});