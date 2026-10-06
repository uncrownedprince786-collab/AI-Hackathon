import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  CalendarClock,
  Coins,
  Database,
  Gauge,
  RefreshCw,
  Search,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HackathonCard, HackathonRow } from "@/components/hackathon-card";
import { JsonLd } from "@/components/json-ld";
import {
  getAllHackathons,
  getByStatus,
  getDataset,
  getStats,
  getWinners,
} from "@/lib/hackathons";
import { buildMetadata, description } from "@/lib/seo";
import { faqJsonLd, itemListJsonLd } from "@/lib/structured-data";
import { formatCount, formatUsd } from "@/lib/format";

export const metadata: Metadata = buildMetadata({
  title: "AI Hackathons — All AI Hackathons, Prizes and Winners",
  description,
  path: "/",
});

const FAQ = [
  {
    question: "What is an AI hackathon?",
    answer:
      "An AI hackathon is a short competition where people build projects using artificial intelligence. Teams usually get a few days to build, then present their work to judges. Many hackathons offer cash prizes, cloud credits, or both.",
  },
  {
    question: "How much prize money is available in AI hackathons?",
    answer:
      "Prizes range from a few hundred dollars to several hundred thousand dollars. The biggest AI hackathons we track offer over $100,000, and some offer more when cloud and API credits are included.",
  },
  {
    question: "How often is this list updated?",
    answer:
      "The list refreshes automatically every 6 hours. Each hackathon moves from upcoming to ongoing to past on its own, based on its real start and end dates.",
  },
  {
    question: "Do I need an account to use this site?",
    answer:
      "No. There is no login and no signup. Every page is open to everyone, and you can also download the whole dataset as JSON.",
  },
];

export default async function HomePage() {
  const [ongoing, upcoming, stats, winners, dataset, all] = await Promise.all([
    getByStatus("ongoing"),
    getByStatus("upcoming"),
    getStats(),
    getWinners(),
    getDataset(),
    getAllHackathons(),
  ]);

  const featured = [...ongoing.slice(0, 4), ...upcoming.slice(0, 4)];

  return (
    <>
      <JsonLd data={faqJsonLd(FAQ)} />
      <JsonLd
        data={itemListJsonLd(featured, {
          name: "Current AI hackathons",
          path: "/",
        })}
      />

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="grid-bg absolute inset-0 opacity-60" aria-hidden="true" />
        <div
          className="absolute inset-x-0 -top-40 h-80 bg-[radial-gradient(60%_60%_at_50%_0%,var(--primary)_0%,transparent_70%)] opacity-15"
          aria-hidden="true"
        />

        <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <Badge variant="outline" className="mb-5">
              <RefreshCw aria-hidden="true" />
              Updated every 6 hours · {formatCount(all.length)} hackathons
            </Badge>

            <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
              All AI hackathons in one place
            </h1>

            <p className="mx-auto mt-5 max-w-2xl text-pretty text-base text-muted-foreground sm:text-lg">
              Prizes, winners and upcoming events. See the money first, then the dates,
              the organizer and the deadline. No login, no signup.
            </p>

            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/hackathons">
                  <Search aria-hidden="true" />
                  Browse all hackathons
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/ongoing">
                  <Gauge aria-hidden="true" />
                  What&apos;s live now ({ongoing.length})
                </Link>
              </Button>
            </div>

            <p className="mt-6 text-xs text-muted-foreground">
              Last updated{" "}
              <time dateTime={dataset.meta.lastUpdated}>
                {new Date(dataset.meta.lastUpdated).toUTCString().replace(" GMT", " UTC")}
              </time>
            </p>
          </div>

          {/* Stats strip */}
          <div className="mx-auto mt-14 grid max-w-5xl grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile
              icon={CalendarClock}
              label="Ongoing now"
              value={String(ongoing.length)}
              href="/ongoing"
            />
            <StatTile
              icon={Sparkles}
              label="Upcoming"
              value={String(upcoming.length)}
              href="/upcoming"
            />
            <StatTile
              icon={Coins}
              label="Prize money tracked"
              value={formatUsd(stats.totalPrizeUsd)}
              href="/stats"
            />
            <StatTile
              icon={Trophy}
              label="Winners listed"
              value={String(stats.totalWinners)}
              href="/winners"
            />
          </div>
        </div>
      </section>

      {/* Live now */}
      {ongoing.length > 0 ? (
        <Section
          title="Ongoing now"
          description="You can still join these. Check the closing date first."
          href="/ongoing"
          linkLabel="All ongoing"
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {ongoing.slice(0, 4).map((h) => (
              <HackathonCard key={h.id} hackathon={h} />
            ))}
          </div>
        </Section>
      ) : null}

      {/* Upcoming */}
      {upcoming.length > 0 ? (
        <Section
          title="Upcoming"
          description="Open or opening soon. Save the date and the prize amount."
          href="/upcoming"
          linkLabel="All upcoming"
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {upcoming.slice(0, 4).map((h) => (
              <HackathonCard key={h.id} hackathon={h} />
            ))}
          </div>
        </Section>
      ) : null}

      {/* Biggest prizes */}
      <Section
        title="Biggest prize pools"
        description="Ranked by total prize money, cash and credits together."
        href="/stats"
        linkLabel="See full stats"
      >
        <div className="grid gap-3 md:grid-cols-2">
          {stats.biggest.slice(0, 6).map((h) => (
            <div key={h.id} className="flex items-center justify-between gap-4">
              <HackathonRow hackathon={h} />
            </div>
          ))}
        </div>
      </Section>

      {/* Winners */}
      {winners.length > 0 ? (
        <Section
          title="Recent winners"
          description="Winning projects from past AI hackathons."
          href="/winners"
          linkLabel="All winners"
        >
          <ul className="grid gap-3 sm:grid-cols-2">
            {winners.slice(0, 6).map(({ hackathon, winner }) => (
              <li key={`${hackathon.id}-${winner.project}`}>
                <Link
                  href={`/hackathons/${hackathon.slug}`}
                  className="flex h-full flex-col rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
                >
                  <div className="flex items-start gap-2">
                    <Trophy className="mt-0.5 size-4 shrink-0 text-prize" aria-hidden="true" />
                    <span className="font-medium leading-snug">{winner.project}</span>
                  </div>
                  {winner.team?.length ? (
                    <p className="mt-1 pl-6 text-sm text-muted-foreground">
                      {winner.team.join(", ")}
                    </p>
                  ) : null}
                  {winner.prize ? (
                    <p className="mt-2 pl-6 text-xs text-primary">{winner.prize}</p>
                  ) : null}
                  <p className="mt-2 pl-6 text-xs text-muted-foreground">
                    {hackathon.name}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {/* Trust + data */}
      <section className="border-t border-border bg-card/30">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 md:grid-cols-2">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">How this list stays correct</h2>
            <p className="mt-3 text-muted-foreground">
              Every hackathon has an official link and a source link, so you can always
              check the facts yourself. A scheduled job reads public pages every six
              hours, reads the dates again, and moves each event between upcoming,
              ongoing and past on its own.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild variant="outline">
                <Link href="/methodology">
                  <Database aria-hidden="true" />
                  How we collect data
                </Link>
              </Button>
              <Button asChild variant="ghost">
                <Link href="/api/data">
                  Download the data
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <MiniStat
              icon={Users}
              label="Participants counted"
              value={formatCount(stats.totalParticipants)}
            />
            <MiniStat
              icon={Coins}
              label="Cash prizes"
              value={formatUsd(stats.cashPrizeUsd)}
            />
            <MiniStat
              icon={Sparkles}
              label="Cloud & API credits"
              value={formatUsd(stats.creditPrizeUsd)}
            />
            <MiniStat
              icon={Trophy}
              label="Events with winners"
              value={`${stats.withWinners} of ${stats.total}`}
            />
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <h2 className="text-2xl font-bold tracking-tight">Common questions</h2>
        <div className="mt-6 space-y-3">
          {FAQ.map((item) => (
            <details
              key={item.question}
              className="group rounded-xl border border-border bg-card px-5 py-4"
            >
              <summary className="cursor-pointer list-none font-medium marker:content-none">
                {item.question}
              </summary>
              <p className="mt-2 text-sm text-muted-foreground">{item.answer}</p>
            </details>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-4 pb-4 sm:px-6">
        <Card className="flex flex-col items-start gap-4 border-primary/30 bg-primary/5 p-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold tracking-tight">
              Running an AI hackathon?
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Send us the link. It takes one minute and there is no account to create.
            </p>
          </div>
          <Button asChild size="lg" className="shrink-0">
            <Link href="/submit">
              Submit a hackathon
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </Card>
      </section>
    </>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: typeof Trophy;
  label: string;
  value: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
    >
      <Icon className="size-4 text-primary" aria-hidden="true" />
      <p className="mt-2 text-xl font-bold tracking-tight tabular-nums sm:text-2xl">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </Link>
  );
}

function MiniStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Trophy;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <Icon className="size-4 text-primary" aria-hidden="true" />
      <p className="mt-2 text-lg font-bold tracking-tight tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function Section({
  title,
  description,
  href,
  linkLabel,
  children,
}: {
  title: string;
  description: string;
  href: string;
  linkLabel: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link href={href}>
            {linkLabel}
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </div>
      {children}
    </section>
  );
}
