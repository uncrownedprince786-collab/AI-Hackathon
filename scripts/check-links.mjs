// Checks every URL in the sitemap plus every internal link found on the site.
// Usage: node scripts/check-links.mjs [baseUrl]
const base = (process.argv[2] || "http://localhost:3000").replace(/\/$/, "");

async function getText(path) {
  const res = await fetch(base + path, { redirect: "follow" });
  return { status: res.status, body: res.ok ? await res.text() : "", url: res.url };
}

const sitemap = await getText("/sitemap.xml");
const urls = new Set();
for (const m of sitemap.body.matchAll(/<loc>([^<]+)<\/loc>/g)) {
  const u = m[1];
  urls.add(u.startsWith(base) ? u.slice(base.length) || "/" : u);
}

const pages = ["/", "/hackathons", "/ongoing", "/upcoming", "/past", "/winners", "/privacy"];
const bodies = [];
for (const p of pages) {
  try {
    const r = await getText(p);
    bodies.push([p, r.body]);
    urls.add(p);
  } catch {
    bodies.push([p, ""]);
  }
}

for (const [, body] of bodies) {
  for (const m of body.matchAll(/href="(\/[^"#?]*)/g)) urls.add(m[1]);
  for (const m of body.matchAll(/href="https?:\/\/[^"]*ai-hackathon[^"]*"/g)) urls.add(m[0].slice(6, -1));
}

const list = [...urls].sort();
const failures = [];
const redirects = [];
let done = 0;
const limit = 12;

async function worker() {
  while (done < list.length) {
    const path = list[done++];
    if (!path.startsWith("/") && !path.startsWith(base)) continue;
    const target = path.startsWith("/") ? base + path : path;
    try {
      const res = await fetch(target, { redirect: "manual" });
      if (res.status >= 400) failures.push(`${res.status} ${path}`);
      else if (res.status >= 300) redirects.push(`${res.status} ${path}`);
    } catch (e) {
      failures.push(`ERR ${path} ${e.message}`);
    }
  }
}
await Promise.all(Array.from({ length: limit }, worker));

console.log(`checked ${list.length} urls against ${base}`);
if (redirects.length) console.log(`\nredirects (${redirects.length}):\n  ` + redirects.join("\n  "));
if (failures.length) {
  console.log(`\nFAILURES (${failures.length}):\n  ` + failures.join("\n  "));
  process.exit(1);
}
console.log("\nall urls ok");
