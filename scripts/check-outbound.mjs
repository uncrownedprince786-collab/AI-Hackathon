// Authenticity pass: HEAD/GET every unique officialUrl in the dataset and
// report reachability without inventing anything. Transient failures (403
// anti-bot walls, timeouts) are classified separately — a 4xx/5xx from the
// organizer's own infra is a link defect; a 403 from an anti-bot wall is not.
// Usage: node scripts/check-outbound.mjs [concurrency=8] [timeoutMs=12000]
import { promises as fs } from "node:fs";
import path from "node:path";

const concurrency = Number(process.argv[2] ?? 8);
const timeoutMs = Number(process.argv[3] ?? 12000);

async function main() {
  const file = path.join(process.cwd(), "src", "data", "hackathons.json");
  const dataset = JSON.parse(await fs.readFile(file, "utf8"));
  const urls = [...new Set(dataset.hackathons.map((h) => h.officialUrl))].sort();
  console.log(`checking ${urls.length} unique official URLs...\n`);

  const results = [];
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, urls.length) }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= urls.length) return;
      const url = urls[index];
      try {
        const res = await fetch(url, {
          method: "GET",
          redirect: "follow",
          signal: AbortSignal.timeout(timeoutMs),
          headers: { "user-agent": "Mozilla/5.0" },
        });
        results[index] = { url, status: res.status };
      } catch (error) {
        results[index] = { url, status: `ERR ${error.name}`, error: error.message.slice(0, 80) };
      }
    }
  });
  await Promise.all(workers);

  const ok = results.filter((r) => r.status >= 200 && r.status < 400);
  const linksDead = results.filter(
    (r) => typeof r.status === "number" && r.status >= 400 && r.status !== 403,
  );
  const antiBot = results.filter((r) => r.status === 403);
  const timedOut = results.filter((r) => String(r.status).startsWith("ERR"));

  const print = (r) => `  ${String(r.status).padEnd(10)} ${r.url}`;
  console.log(`ok/redirect:       ${ok.length}/${urls.length}`);
  console.log(`404+/5xx (broken): ${linksDead.length}`);
  if (linksDead.length) console.log(linksDead.map(print).join("\n"));
  console.log(`403 anti-bot wall: ${antiBot.length}`);
  if (antiBot.length) console.log(antiBot.map(print).join("\n"));
  console.log(`error/timeout:     ${timedOut.length}`);
  if (timedOut.length) console.log(timedOut.map(print).join("\n"));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});