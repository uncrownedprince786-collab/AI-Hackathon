import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, Trophy } from "lucide-react";
import { getWinners, getStats } from "@/lib/hackathons";
import { JsonLd } from "@/components/json-ld";
import { PageHeader, Breadcrumbs } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buildMetadata, absoluteUrl } from "@/lib/seo";
import { formatDate, formatUsdLong } from "@/lib/format";
import type { Winner } from "@/lib/types";

export const metadata: Metadata = buildMetadata({
  title: "AI Hackathon Winners — Winning AI Projects",
  description:
    "Winning projects from past AI hackathons. See who won, what they built and how much the prize was.",
  path: "/winners",
  keywords: ["ai hackathon winners", "hackathon winners", "ai hackathon results"],
});

export default async function WinnersPage() {
  const [winners, stats] = await Promise.all([getWinners(), getStats()]);

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: "AI hackathon winners",
          url: absoluteUrl("/winners"),
          numberOfItems: winners.length,
          itemListElement: winners.slice(0, 100).map((entry, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: entry.winner.project,
            url: absoluteUrl(`/hackathons/${entry.hackathon.slug}`),
          })),
        }}
      />

      <PageHeader
        eyebrow="Results"
        title="AI hackathon winners"
        description="Projects that won money at finished AI hackathons. Each entry links back to the full event page with the full prize breakdown."
        stats={[
          { label: "Winning projects", value: String(winners.length) },
          { label: "Events covered", value: String(stats.withWinners) },
          { label: "Organizers", value: String(stats.uniqueOrganizers) },
          { label: "Prize money tracked", value: formatUsdLong(stats.totalPrizeUsd) },
        ]}
      />

      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <Breadcrumbs trail={[{ name: "Winners", path: "/winners" }]} />

        {winners.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-6 py-20 text-center text-muted-foreground">
            No winners published yet.
          </p>
        ) : (
          <div className="space-y-4">
            {winners.map(({ hackathon, winner }) => (
              <WinnerRow key={`${hackathon.id}-${winner.project}`} winner={winner} hackathon={hackathon} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function WinnerRow({
  winner,
  hackathon,
}: {
  winner: Winner;
  hackathon: {
    name: string;
    slug: string;
    endDate: string;
    organizer: string;
    totalPrizeUsd: number;
    mode: string;
  };
}) {
  return (
    <article className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {winner.rank ? (
              <Badge variant="prize">
                <Trophy aria-hidden="true" />
                {winner.rank === 1 ? "1st place" : winner.rank === 2 ? "2nd place" : "3rd place"}
              </Badge>
            ) : null}
            {winner.prize ? <Badge variant="outline">{winner.prize}</Badge> : null}
          </div>

          <h2 className="mt-2.5 text-lg font-semibold tracking-tight">
            {winner.url ? (
              <a
                href={winner.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="inline-flex items-center gap-1.5 hover:text-primary"
              >
                {winner.project}
                <ExternalLink className="size-3.5" aria-hidden="true" />
              </a>
            ) : (
              winner.project
            )}
          </h2>

          {winner.summary ? (
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-foreground/80">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                What they built:{" "}
              </span>
              {winner.summary}
            </p>
          ) : null}

          {winner.team?.length ? (
            <p className="mt-1.5 text-sm text-muted-foreground">
              Team: {winner.team.join(", ")}
            </p>
          ) : null}
          {winner.organization ? (
            <p className="mt-1 text-sm text-muted-foreground">{winner.organization}</p>
          ) : null}
        </div>

        <div className="shrink-0 sm:text-right">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Event</p>
          <p className="mt-1 text-sm font-medium">
            <Link href={`/hackathons/${hackathon.slug}`} className="hover:text-primary">
              {hackathon.name}
            </Link>
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {hackathon.organizer ? `${hackathon.organizer} · ` : ""}
            Ended {formatDate(hackathon.endDate)}
          </p>
          <Button asChild size="sm" variant="ghost" className="mt-2">
            <Link href={`/hackathons/${hackathon.slug}`}>Full details</Link>
          </Button>
        </div>
      </div>
    </article>
  );
}
