import test from "node:test";
import assert from "node:assert/strict";
import { pickQueries } from "../src/lib/web-scrape";

test("pickQueries returns the full worldwide query set on any day", () => {
  const d1 = pickQueries();
  const d2 = pickQueries();
  assert.equal(d1.length, d2.length);
  assert.ok(d1.length >= 55, "expect all topic, site and region queries");
  const joins = [...new Set([...d1, ...d2])];
  assert.equal(joins.length, d1.length, "same query set every run, no regional cap");
  assert.ok(d1.every((q) => q.length > 10));
});

test("pickQueries searches every inhabited continent", () => {
  const queries = pickQueries();
  const regions: Array<[string, RegExp]> = [
    ["South Asia", /india|pakistan|bangladesh|sri lanka|nepal/i],
    ["East Asia", /japan|south korea|china|taiwan|hong kong/i],
    ["South-East Asia", /vietnam|thailand|philippines|malaysia|singapore|indonesia/i],
    ["Middle East", /dubai|saudi|qatar|israel|turkey|egypt|morocco/i],
    ["Europe", /london|france|spain|italy|netherlands|switzerland|poland|helsinki|lisbon|germany/i],
    ["Africa", /nigeria|south africa|kenya|ghana|ethiopia/i],
    ["Oceania", /australia|new zealand/i],
    ["Latin America", /colombia|argentina|chile|peru|brazil|mexico/i],
    ["North America", /canada/i],
  ];
  for (const [name, pattern] of regions) {
    assert.ok(queries.some((q) => pattern.test(q)), `${name} has a targeted query`);
  }
});