/**
 * Human-like web collector. Runs behind the scenes only.
 *
 *   npm run scrape:web
 *   SCRAPE_MAX_EVENTS=20 SCRAPE_MAX_WINNERS=24 npm run scrape:web
 *
 * Produces:
 *   src/data/web-drafts.json        candidate AI hackathons worldwide
 *   src/data/winner-summaries.json  "what they built" for winners
 *
 * The next `npm run refresh:data` feeds the drafts through the accuracy engine
 * and merges the winner summaries into the dataset.
 */
import {
  launchScraperBrowser,
  newBrowserPage,
  runWebScrape,
  runWinnerPass,
  scrapeSettings,
  type ScrapeReport,
} from "../src/lib/web-scrape";

async function printReport(report: ScrapeReport) {
  console.log("");
  console.log(`Search candidates:  ${report.searchCandidates}`);
  console.log(`Listing candidates: ${report.listingCandidates}`);
  console.log(`Pages visited:      ${report.visited}`);
  console.log(`Event drafts:       ${report.drafts}`);
  console.log(`Winners visited:    ${report.winners}`);
  console.log(`Winner summaries:   ${report.winnerSummaries}`);
  if (report.error) {
    console.error(`Scrape error:       ${report.error}`);
    process.exit(2);
  }
}

async function main() {
  const settings = scrapeSettings();
  console.log(
    `Web scrape (maxEvents=${settings.maxEvents}, maxWinners=${settings.maxWinners}, winners=${
      settings.disableWinners ? "off" : "on"
    }, headful=${settings.headful})`,
  );

  // Events pass is skipped (SCRAPE_MAX_EVENTS=0) so the winner pass can run
  // against a dataset that was refreshed after the event collection.
  if (settings.maxEvents <= 0) {
    const now = new Date();
    const browser = await launchScraperBrowser(settings);
    try {
      const page = await newBrowserPage(browser);
      const result = await runWinnerPass(page, settings.maxWinners, now);
      console.log("");
      console.log(`Winners visited:    ${result.visited}`);
      console.log(`Winner summaries:   ${result.stored}`);
      console.log("(events pass skipped: SCRAPE_MAX_EVENTS=0)");
    } finally {
      await browser.close();
    }
    return;
  }

  const report = await runWebScrape(settings);
  await printReport(report);
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);