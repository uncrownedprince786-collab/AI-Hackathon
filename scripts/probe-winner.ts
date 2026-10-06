const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 ai-hackathons-site/1.0 (+https://ai-hackathons-tawny.vercel.app)";

async function main() {
  const target = process.argv[2] ?? "https://forge-ai-challenge.devpost.com/";
  const r = await fetch(target, { headers: { "user-agent": UA } });
  console.log("status", r.status, target);
  const html = await r.text();
  const links = [...html.matchAll(/href="(https:\/\/devpost\.com\/software\/[^"]+)"/g)].map(
    (m) => m[1],
  );
  console.log("software links:", links.length);
  console.log(links.slice(0, 5).join("\n"));

  const projectUrl = links[0];
  if (projectUrl) {
    const p = await fetch(projectUrl, { headers: { "user-agent": UA } });
    const page = await p.text();
    const desc = page.match(/<meta name="description" content="([^"]*)"/i)?.[1];
    const og = page.match(/<meta property="og:description" content="([^"]*)"/i)?.[1];
    const title = page.match(/<title>([^<]*)<\/title>/i)?.[1];
    const tagline = page.match(/class="app-details"[^>]*>\s*<p>([^<]*)/i)?.[1];
    console.log("\nproject page:", projectUrl, p.status);
    console.log("title:", title);
    console.log("meta description:", desc);
    console.log("og description:", og);
    console.log("tagline:", tagline);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
export {};
