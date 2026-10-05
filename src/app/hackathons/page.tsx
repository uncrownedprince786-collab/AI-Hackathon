import type { Metadata } from "next";
import { getAllHackathons, getStats } from "@/lib/hackathons";
import { HackathonExplorer } from "@/components/hackathon-explorer";
import { JsonLd } from "@/components/json-ld";
import { PageHeader } from "@/components/page-header";
import { buildMetadata } from "@/lib/seo";
import { itemListJsonLd } from "@/lib/structured-data";
import { formatUsd } from "@/lib/format";

export const metadata: Metadata = buildMetadata({
  title: "All AI Hackathons — Full List with Prizes and Dates",
  description:
    "The complete list of AI hackathons. Filter by status, online or in-person, organizer and prize money. See cash prizes, cloud credits, dates, deadlines and winners.",
  path: "/hackathons",
  keywords: ["list of ai hackathons", "all hackathons", "hackathon calendar"],
});

export default async function AllHackathonsPage() {
  const [hackathons, stats] = await Promise.all([getAllHackathons(), getStats()]);

  return (
    <>
      <JsonLd
        data={itemListJsonLd(hackathons, {
          name: "All AI hackathons",
          path: "/hackathons",
        })}
      />

      <PageHeader
        eyebrow="Directory"
        title="All AI hackathons"
        description="Every AI hackathon we track, in one list. Filter it down to what matters: live now, online only, big prizes, or a specific organizer."
        stats={[
          { label: "Total listed", value: String(stats.total) },
          { label: "Ongoing", value: String(stats.ongoing) },
          { label: "Upcoming", value: String(stats.upcoming) },
          { label: "Prize money", value: formatUsd(stats.totalPrizeUsd) },
        ]}
      />

      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <HackathonExplorer hackathons={hackathons} />
      </div>
    </>
  );
}
