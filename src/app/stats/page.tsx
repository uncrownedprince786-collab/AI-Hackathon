import type { Metadata } from "next";
import Link from "next/link";
import { Building2, Coins, Globe, MapPin, Sparkles, Trophy, Users } from "lucide-react";
import { getDataset, getStats } from "@/lib/hackathons";
import { JsonLd } from "@/components/json-ld";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { HackathonRow } from "@/components/hackathon-card";
import { buildMetadata } from "@/lib/seo";
import { datasetJsonLd } from "@/lib/structured-data";
import { formatCount, formatUsd, formatUsdLong } from "@/lib/format";

export const metadata: Metadata = buildMetadata({
  title: "AI Hackathon Stats — Prizes, Numbers and Records",
  description:
    "Numbers on AI hackathons: how many we track, how much prize money is on the table, the biggest prize pools, top organizers and yearly totals.",
  path: "/stats",
  keywords: ["ai hackathon statistics", "hackathon prize money", "hackathon data"],
});

export default async function StatsPage() {
  const stats = await getStats();
  const dataset = await getDataset();
  const countries = dataset.meta.countries ?? [];
  const regions = dataset.meta.regions ?? [];
  const aiReview = dataset.meta.aiReview;
  const counts = {
    upcoming: stats.upcoming,
    ongoing: stats.ongoing,
    past: stats.past,
  };

  const maxYearPrize = Math.max(1, ...stats.byYear.map((y) => y.prizeUsd));

  return (
    <>
      <JsonLd data={datasetJsonLd(counts, stats.totalPrizeUsd)} />

      <PageHeader
        eyebrow="Numbers"
        title="AI hackathon stats"
        description="Everything we track, counted up. These numbers move on their own as the scheduled job adds new events and closes old ones."
        stats={[
          { label: "Hackathons listed", value: String(stats.total) },
          { label: "Total prize money", value: formatUsd(stats.totalPrizeUsd) },
          { label: "Organizers", value: String(stats.uniqueOrganizers) },
          { label: "Winners listed", value: String(stats.totalWinners) },
        ]}
      />

      <div className="mx-auto max-w-7xl space-y-10 px-4 py-10 sm:px-6">
        {/* Prize split */}
        <section>
          <h2 className="text-xl font-bold tracking-tight">Prize money: cash vs credits</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Cloud and API credits are real money to a builder, so we count them separately
            instead of hiding them in one number.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Card className="p-5">
              <Coins className="size-4 text-prize" aria-hidden="true" />
              <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums text-prize">
                {formatUsd(stats.cashPrizeUsd)}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">Cash prizes</p>
            </Card>
            <Card className="p-5">
              <Sparkles className="size-4 text-warning" aria-hidden="true" />
              <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums">
                {formatUsd(stats.creditPrizeUsd)}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">Cloud and API credits</p>
            </Card>
            <Card className="p-5">
              <Trophy className="size-4 text-primary" aria-hidden="true" />
              <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums">
                {formatUsd(stats.totalPrizeUsd)}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">Total combined</p>
            </Card>
          </div>
        </section>

        {/* Format + audience */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="p-5">
            <Globe className="size-4 text-primary" aria-hidden="true" />
            <p className="mt-2 text-2xl font-bold tabular-nums">{stats.online}</p>
            <p className="mt-1 text-sm text-muted-foreground">Online hackathons</p>
          </Card>
          <Card className="p-5">
            <MapPin className="size-4 text-primary" aria-hidden="true" />
            <p className="mt-2 text-2xl font-bold tabular-nums">{stats.inPerson}</p>
            <p className="mt-1 text-sm text-muted-foreground">In-person hackathons</p>
          </Card>
          <Card className="p-5">
            <Users className="size-4 text-primary" aria-hidden="true" />
            <p className="mt-2 text-2xl font-bold tabular-nums">
              {formatCount(stats.totalParticipants)}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">Participants counted</p>
          </Card>
          <Card className="p-5">
            <Trophy className="size-4 text-primary" aria-hidden="true" />
            <p className="mt-2 text-2xl font-bold tabular-nums">
              {stats.withWinners}
              <span className="text-base font-normal text-muted-foreground"> / {stats.total}</span>
            </p>
            <p className="mt-1 text-sm text-muted-foreground">Events with winners listed</p>
          </Card>
        </section>

        {/* Global coverage */}
        {countries.length > 0 ? (
          <section>
            <h2 className="text-xl font-bold tracking-tight">Global coverage</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Counted from the location each organizer publishes. Events marked online are not
              counted against a country.
            </p>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-border bg-card p-5">
                <h3 className="text-sm font-semibold">By region</h3>
                <ul className="mt-3 space-y-2.5">
                  {regions.map((region) => {
                    const max = Math.max(1, ...regions.map((r) => r.count));
                    return (
                      <li key={region.region}>
                        <div className="flex items-baseline justify-between gap-3 text-sm">
                          <span>{region.region}</span>
                          <span className="tabular-nums text-muted-foreground">
                            {region.count}
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 rounded-full bg-secondary">
                          <span
                            className="block h-1.5 rounded-full bg-primary"
                            style={{ width: `${Math.max(3, Math.round((region.count / max) * 100))}%` }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div className="rounded-xl border border-border bg-card p-5">
                <h3 className="text-sm font-semibold">Top countries</h3>
                <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {countries.slice(0, 12).map((country) => (
                    <li
                      key={country.country}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
                    >
                      <span className="flex min-w-0 items-center gap-2 text-sm">
                        <MapPin className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
                        <span className="truncate">{country.country}</span>
                      </span>
                      <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                        {country.count}
                      </span>
                    </li>
                  ))}
                </ul>
                {countries.length > 12 ? (
                  <p className="mt-3 text-xs text-muted-foreground">
                    and {countries.length - 12} more countries
                  </p>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}

        {/* Biggest pools */}
        <section>
          <h2 className="text-xl font-bold tracking-tight">Top 10 prize pools</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Cash and credits added together, across all time.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {stats.biggest.map((h) => (
              <HackathonRow key={h.id} hackathon={h} />
            ))}
          </div>
        </section>

        {/* By year */}
        {stats.byYear.length > 1 ? (
          <section>
            <h2 className="text-xl font-bold tracking-tight">Hackathons and prizes by year</h2>
            <div className="mt-4 overflow-hidden rounded-xl border border-border">
              <table className="w-full text-sm">
                <caption className="sr-only">
                  AI hackathon count and prize money by end year
                </caption>
                <thead className="bg-secondary/50 text-left">
                  <tr>
                    <th scope="col" className="px-4 py-2.5 font-medium">Year</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Hackathons</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Prize money</th>
                    <th scope="col" className="hidden px-4 py-2.5 font-medium sm:table-cell">
                      Share
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {stats.byYear.map((row) => (
                    <tr key={row.year} className="bg-card">
                      <th scope="row" className="px-4 py-2.5 text-left font-medium">
                        {row.year}
                      </th>
                      <td className="px-4 py-2.5 tabular-nums">{row.count}</td>
                      <td className="px-4 py-2.5 font-medium tabular-nums">
                        {formatUsdLong(row.prizeUsd)}
                      </td>
                      <td className="hidden px-4 py-2.5 sm:table-cell">
                        <span
                          className="block h-2 rounded-full bg-primary"
                          style={{
                            width: `${Math.max(2, Math.round((row.prizeUsd / maxYearPrize) * 100))}%`,
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {/* Organizers */}
        {stats.topOrganizers.length > 0 ? (
          <section>
            <h2 className="text-xl font-bold tracking-tight">Most active organizers</h2>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {stats.topOrganizers.map((org) => (
                <li
                  key={org.name}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Building2 className="size-4 shrink-0 text-primary" aria-hidden="true" />
                    <span className="truncate text-sm font-medium">{org.name}</span>
                  </span>
                  <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                    {org.count}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <Card className="p-5">
          <h2 className="text-sm font-semibold">Automatic accuracy check</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {aiReview ? (
              <>
                The last refresh sent{" "}
                <span className="font-medium text-foreground tabular-nums">
                  {aiReview.reviewed.toLocaleString("en-US")}
                </span>{" "}
                listings to a free language model ({aiReview.model}) to confirm they really are
                AI events, that the dates make sense and that no stated prize was missed.{" "}
                {aiReview.rejected > 0 ? (
                  <>
                    <span className="font-medium text-foreground tabular-nums">
                      {aiReview.rejected.toLocaleString("en-US")}
                    </span>{" "}
                    were dropped as not usable.{" "}
                  </>
                ) : null}
                {aiReview.fixed > 0 ? (
                  <>
                    <span className="font-medium text-foreground tabular-nums">
                      {aiReview.fixed.toLocaleString("en-US")}
                    </span>{" "}
                    had a field corrected.{" "}
                  </>
                ) : null}
                Checked {new Date(aiReview.at).toUTCString().replace(" GMT", " UTC")}.
              </>
            ) : (
              <>
                Each refresh can send new listings to a free language model to confirm they are
                real AI events, that the dates make sense and that no stated prize was missed. It
                runs in the background, only reads public pages, and never invents a prize or a
                winner. When no key is configured the check is skipped and the usual rules still
                apply.
              </>
            )}
          </p>
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold">Where does this data come from?</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            We read public event pages and their structured data, then re-check every six
            hours. Cash and credits are kept apart, and every row keeps a link back to the
            organizer so you can check it yourself.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/methodology"
              className="inline-flex h-9 items-center rounded-lg border border-border px-3 text-sm font-medium transition-colors hover:bg-secondary"
            >
              How we collect data
            </Link>
            <Link
              href="/api/data"
              className="inline-flex h-9 items-center rounded-lg border border-border px-3 text-sm font-medium transition-colors hover:bg-secondary"
            >
              Download as JSON
            </Link>
          </div>
        </Card>
      </div>
    </>
  );
}
