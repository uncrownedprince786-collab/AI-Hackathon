import type { Metadata } from "next";
import Link from "next/link";
import { getByStatus } from "@/lib/hackathons";
import { HackathonExplorer } from "@/components/hackathon-explorer";
import { JsonLd } from "@/components/json-ld";
import { PageHeader } from "@/components/page-header";
import { buildMetadata } from "@/lib/seo";
import { itemListJsonLd } from "@/lib/structured-data";
import { formatUsd } from "@/lib/format";

export const metadata: Metadata = buildMetadata({
  title: "Ongoing AI Hackathons — Live Right Now",
  description:
    "AI hackathons that are open right now. See the prize money, the closing date and the deadline so you can still join today.",
  path: "/ongoing",
  keywords: ["ongoing ai hackathons", "live hackathons", "hackathons open now"],
});

export default async function OngoingPage() {
  const hackathons = await getByStatus("ongoing");
  const prizeTotal = hackathons.reduce((sum, h) => sum + h.totalPrizeUsd, 0);

  return (
    <>
      <JsonLd
        data={itemListJsonLd(hackathons, {
          name: "Ongoing AI hackathons",
          path: "/ongoing",
        })}
      />

      <PageHeader
        eyebrow="Live now"
        title="Ongoing AI hackathons"
        description="These are open today. Check the closing date on each card, then open the official link to sign up."
        stats={[
          { label: "Open now", value: String(hackathons.length) },
          { label: "Prize money", value: formatUsd(prizeTotal) },
          {
            label: "Online",
            value: String(hackathons.filter((h) => h.mode === "online").length),
          },
          {
            label: "In-person or hybrid",
            value: String(hackathons.filter((h) => h.mode !== "online").length),
          },
        ]}
      />

      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        {hackathons.length === 0 ? (
          <EmptyState
            title="Nothing is open right this second"
            body="That changes often. The upcoming list is the next place to look."
            href="/upcoming"
            label="See upcoming hackathons"
          />
        ) : (
          <HackathonExplorer hackathons={hackathons} showStatusFilter={false} />
        )}
      </div>
    </>
  );
}

function EmptyState({
  title,
  body,
  href,
  label,
}: {
  title: string;
  body: string;
  href: string;
  label: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border px-6 py-20 text-center">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{body}</p>
      <Link
        href={href}
        className="mt-5 inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
      >
        {label}
      </Link>
    </div>
  );
}
