import type { Metadata } from "next";
import { getByStatus } from "@/lib/hackathons";
import { HackathonExplorer } from "@/components/hackathon-explorer";
import { JsonLd } from "@/components/json-ld";
import { PageHeader } from "@/components/page-header";
import { buildMetadata } from "@/lib/seo";
import { itemListJsonLd } from "@/lib/structured-data";
import { formatUsd } from "@/lib/format";

export const metadata: Metadata = buildMetadata({
  title: "Past AI Hackathons — Results and Winners",
  description:
    "AI hackathons that have already finished. Look up prize pools, winning projects and organizers to see what has won before.",
  path: "/past",
  keywords: ["past ai hackathons", "ai hackathon results", "hackathon archive"],
});

export default async function PastPage() {
  const hackathons = await getByStatus("past");
  const prizeTotal = hackathons.reduce((sum, h) => sum + h.totalPrizeUsd, 0);
  const withWinners = hackathons.filter((h) => h.winners.length > 0).length;
  const biggest = Math.max(0, ...hackathons.map((h) => h.totalPrizeUsd));

  return (
    <>
      <JsonLd
        data={itemListJsonLd(hackathons, {
          name: "Past AI hackathons",
          path: "/past",
        })}
      />

      <PageHeader
        eyebrow="Archive"
        title="Past AI hackathons"
        description="Useful if you want to know what has already won money, and how much was on the table. Newest first."
        stats={[
          { label: "Finished events", value: String(hackathons.length) },
          { label: "With winners listed", value: String(withWinners) },
          { label: "Prize money paid", value: formatUsd(prizeTotal) },
          { label: "Largest pool", value: formatUsd(biggest) },
        ]}
      />

      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        {hackathons.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-6 py-20 text-center text-muted-foreground">
            No past hackathons yet.
          </p>
        ) : (
          <HackathonExplorer hackathons={hackathons} showStatusFilter={false} />
        )}
      </div>
    </>
  );
}
