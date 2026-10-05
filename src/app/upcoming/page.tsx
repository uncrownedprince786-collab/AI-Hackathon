import type { Metadata } from "next";
import { getByStatus } from "@/lib/hackathons";
import { HackathonExplorer } from "@/components/hackathon-explorer";
import { JsonLd } from "@/components/json-ld";
import { PageHeader } from "@/components/page-header";
import { buildMetadata } from "@/lib/seo";
import { itemListJsonLd } from "@/lib/structured-data";
import { formatUsd } from "@/lib/format";

export const metadata: Metadata = buildMetadata({
  title: "Upcoming AI Hackathons — Dates, Deadlines and Prize Money",
  description:
    "The next AI hackathons you can join. Start dates, registration deadlines, prize pools and whether they are online or in person.",
  path: "/upcoming",
  keywords: ["upcoming ai hackathons", "ai hackathon calendar", "hackathons 2026"],
});

export default async function UpcomingPage() {
  const hackathons = await getByStatus("upcoming");
  const prizeTotal = hackathons.reduce((sum, h) => sum + h.totalPrizeUsd, 0);
  const soonest = [...hackathons].sort((a, b) => a.startDate.localeCompare(b.startDate))[0];

  return (
    <>
      <JsonLd
        data={itemListJsonLd(hackathons, {
          name: "Upcoming AI hackathons",
          path: "/upcoming",
        })}
      />

      <PageHeader
        eyebrow="Plan ahead"
        title="Upcoming AI hackathons"
        description="Sorted by start date, soonest first. Save the date, check who can join, and open the official page to register."
        stats={[
          { label: "Listed", value: String(hackathons.length) },
          { label: "Prize money", value: formatUsd(prizeTotal) },
          { label: "Next one opens", value: soonest ? soonest.startDate : "TBC" },
          { label: "Open to all", value: String(hackathons.filter((h) => !h.invitedOnly).length) },
        ]}
      />

      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        {hackathons.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-6 py-20 text-center text-muted-foreground">
            No upcoming hackathons yet. The list refreshes every 6 hours.
          </p>
        ) : (
          <HackathonExplorer hackathons={hackathons} showStatusFilter={false} />
        )}
      </div>
    </>
  );
}
