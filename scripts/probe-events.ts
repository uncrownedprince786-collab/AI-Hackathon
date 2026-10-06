const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 ai-hackathons-site/1.0";

async function main() {
  const url = process.argv[2] ?? "https://www.eventbrite.com/d/online/artificial-intelligence/";
  const html = await (
    await fetch(url, { headers: { "user-agent": UA }, redirect: "follow" })
  ).text();
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((m) => m[1]);
  console.log("blocks:", blocks.length);
  for (const b of blocks) {
    const json = JSON.parse(b);
    const items = json.itemListElement ?? json["@graph"]?.filter((x: unknown) => x);
    if (Array.isArray(items)) {
      console.log("items:", items.length);
      console.log(JSON.stringify(items.slice(0, 3), null, 1).slice(0, 3000));
      break;
    }
    console.log("type:", json["@type"], Object.keys(json).slice(0, 12).join(","));
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
export {};
