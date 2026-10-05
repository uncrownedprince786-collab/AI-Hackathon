/**
 * Local data refresh. Writes the same dataset the Vercel Cron job writes.
 *
 *   npm run refresh:data
 *   REFRESH_FORCE=1 npm run refresh:data     re-read every detail page
 */
import { refreshDataset } from "../src/lib/collector";

async function main() {
  const pages = Number(process.env.REFRESH_PAGES ?? 4);
  const detailLimit = Number(process.env.REFRESH_DETAIL_LIMIT ?? 120);
  const useLablab = process.env.REFRESH_LABLAB !== "0";
  const forceDetail = process.env.REFRESH_FORCE === "1";

  console.log(
    `Refreshing hackathon data (pages=${pages}, detail=${detailLimit}, lablab=${useLablab}, force=${forceDetail})`,
  );

  const result = await refreshDataset({
    pages,
    detailLimit,
    forceDetail,
    sources: useLablab ? ["devpost", "lablab"] : ["devpost"],
  });

  const counts = result.dataset.meta.counts;
  console.log("");
  console.log(`Total:   ${result.dataset.hackathons.length}`);
  console.log(`Ongoing: ${counts.ongoing}`);
  console.log(`Upcoming:${counts.upcoming}`);
  console.log(`Past:    ${counts.past}`);
  console.log(`Storage: ${result.writtenTo}`);
  for (const source of result.dataset.meta.sources) {
    console.log(`  - ${source.name}: ${source.fetched} (${source.ok ? "ok" : "failed"})`);
  }
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
