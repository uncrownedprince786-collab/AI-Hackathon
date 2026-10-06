const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 ai-hackathons-site/1.0";

const pages = [
  "https://pear.vc/pear-x-anthropic-hackathon/",
  "https://cerebralvalley.ai/e/mistral-mcp-hackathon",
  "https://cerebralvalley.ai/e/aiewf-hackathon-2025",
  "https://www.anthropic.com/news",
];

const needles = [
  "Survival of the Feature",
  "Strava MCP",
  "SHIELD",
  "Claude Code On the Go",
  "Hackababies",
  "Nardwuar",
];

async function main() {
  for (const u of pages) {
    try {
      const r = await fetch(u, { headers: { "user-agent": UA } });
      const h = await r.text();
      const text = h
        .replace(/<script[\s\S]*?<\/script>/g, " ")
        .replace(/<style[\s\S]*?<\/style>/g, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ");
      console.log("---", u, r.status, "len", text.length);
      for (const needle of needles) {
        const i = text.indexOf(needle);
        if (i >= 0) {
          console.log("  ", needle, "=>", text.slice(Math.max(0, i - 200), i + 300));
        }
      }
    } catch (e) {
      console.log("ERR", u, (e as Error).message);
    }
  }
}

main();
export {};
