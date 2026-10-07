import { test } from "node:test";
import assert from "node:assert/strict";
import * as cheerio from "cheerio";
import { extractWinners } from "../src/lib/sources/devpost";

const HTML = `<article id="prizes">
  <div class="prize">
    <div class="prize-title">Winner</div>
    <div class="prize-value"><span>$500,000</span></div>
    <div class="prize-content">
      <a href="https://devpost.com/software/robo-lens">Robo Lens</a>
      <a href="/software/neo-nurse">Neo Nurse</a>
      <a href="https://twitter.com/team">Twitter</a>
    </div>
  </div>
  <div class="prize">
    <div class="prize-title">Participation prize</div>
    <div class="prize-content"></div>
  </div>
  <div class="prize">
    <div class="prize-title">Second place</div>
    <div class="prize-content">Winners: Solo-Mode and Friends</div>
  </div>
</article>`;

test("extractWinners reads grand prize project pages and inline winners", () => {
  const winners = extractWinners(cheerio.load(HTML));
  assert.equal(winners.length, 3);
  assert.deepEqual(winners[0], {
    project: "Robo Lens",
    url: "https://devpost.com/software/robo-lens",
    prize: "Winner",
  });
  assert.deepEqual(winners[1], {
    project: "Neo Nurse",
    url: "https://devpost.com/software/neo-nurse",
    prize: "Winner",
  });
  assert.equal(winners[2].project, "Solo-Mode and Friends");
  for (const w of winners) assert.ok(!w.url || w.url.startsWith("https://devpost.com/software/"));
});

test("extractWinners ignores non-winner prize rows and keeps names unique", () => {
  const winners = extractWinners(cheerio.load(HTML));
  const names = winners.map((w) => w.project);
  assert.ok(!names.includes("Twitter"));
  assert.equal(new Set(names).size, names.length);
});