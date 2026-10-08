import type { Metadata } from "next";
import type { Prize } from "@/lib/types";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowUpRight,
  Award,
  CalendarDays,
  Clock,
  Coins,
  Database,
  ExternalLink,
  Info,
  MapPin,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
  Video,
} from "lucide-react";
import { getAllSlugs, getBySlug, getRelated } from "@/lib/hackathons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { JsonLd } from "@/components/json-ld";
import { Breadcrumbs } from "@/components/page-header";
import { HackathonCard } from "@/components/hackathon-card";
import { StatusBadge } from "@/components/status-badge";
import { PrizeAmount } from "@/components/prize-amount";
import { buildMetadata } from "@/lib/seo";
import { eventJsonLd } from "@/lib/structured-data";
import {
  applicationStatus,
  countdownText,
  daysUntilDeadline,
  formatCount,
  formatDateLong,
  formatUsdLong,
  modeLabel,
  prizeSummary,
  prizeTypeLabel,
  truncate,
  verifiedLabel,
} from "@/lib/format";

export async function generateStaticParams() {
  const slugs = await getAllSlugs();
  return slugs.map((slug) => ({ slug }));
}

export const revalidate = 21600;
export const dynamicParams = true;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const hackathon = await getBySlug(slug);
  if (!hackathon) {
    return buildMetadata({
      title: "Hackathon not found",
      description: "This AI hackathon page could not be found.",
      path: `/hackathons/${slug}`,
      noIndex: true,
    });
  }

  const prize = prizeSummary(hackathon);
  const prizeText =
    prize.claimedOnly && prize.totalUsd > 0
      ? ` Announced prize pool ${formatUsdLong(prize.totalUsd)} (cash and credits split not published).`
      : prize.totalUsd > 0
        ? ` Prize pool ${formatUsdLong(prize.totalUsd)}, including ${formatUsdLong(prize.cashUsd)} in cash.`
        : " No prize pool published yet.";

  const dateText = `${formatDateLong(hackathon.startDate)} to ${formatDateLong(hackathon.endDate)}.`;
  const modeText = `${modeLabel(hackathon.mode)} event organised by ${hackathon.organizer}.`;
  const openText =
    hackathon.status === "past"
      ? " This event has finished."
      : ` Applications are ${applicationStatus(hackathon).isOpen ? "open" : "closed"}.`;

  return buildMetadata({
    title: `${hackathon.name} — AI Hackathon, ${formatUsdLong(hackathon.totalPrizeUsd)} Prize Pool`,
    description: truncate(
      `${hackathon.name} is an ${modeLabel(hackathon.mode).toLowerCase()} AI hackathon by ${hackathon.organizer}.${prizeText} ${dateText}${openText} ${modeText}`,
      300,
    ),
    path: `/hackathons/${hackathon.slug}`,
    keywords: [
      `${hackathon.name.toLowerCase()} ai hackathon`,
      hackathon.organizer.toLowerCase(),
      ...hackathon.tags.map((t) => t.toLowerCase()),
      `${hackathon.name} winners`,
      `${hackathon.name} prizes`,
      hackathon.totalPrizeUsd > 0 ? "ai hackathon prize pool" : "upcoming ai hackathons",
    ],
  });
}

export default async function HackathonPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const hackathon = await getBySlug(slug);
  if (!hackathon) notFound();

  const related = await getRelated(hackathon, 4);
  const prize = prizeSummary(hackathon);
  const application = applicationStatus(hackathon);
  const daysLeft = daysUntilDeadline(hackathon);
  const cashPrizes = hackathon.prizes.filter((p) => p.type === "cash");
  const creditPrizes = hackathon.prizes.filter((p) => p.type === "credits");
  const otherPrizes = hackathon.prizes.filter((p) => p.type === "other");

  const faq = [
    {
      question: `How much is the ${hackathon.name} prize pool?`,
      answer: prize.claimedOnly
        ? `The organizer announces a total prize pool of ${formatUsdLong(prize.totalUsd)}. They have not published a breakdown, so we cannot say how much of that is cash and how much is cloud or API credits. The official page has the full details.`
        : prize.totalUsd > 0
          ? `The total prize pool is ${formatUsdLong(prize.totalUsd)}, made up of ${formatUsdLong(prize.cashUsd)} in cash prizes${
              prize.creditUsd > 0 ? ` and ${formatUsdLong(prize.creditUsd)} in cloud and API credits` : ""
            }.`
          : "The organizer has not published a prize amount for this event. Check the official link for the latest details.",
    },
    {
      question: `When is the ${hackathon.name} submission deadline?`,
      answer: `The hackathon runs from ${formatDateLong(hackathon.startDate)} to ${formatDateLong(
        hackathon.endDate,
      )}. ${application.detail}${
        daysLeft !== undefined && daysLeft >= 0 && daysLeft <= 30 && hackathon.status !== "past"
          ? ` That is ${daysLeft === 0 ? "today" : daysLeft === 1 ? "tomorrow" : `${daysLeft} days from now`}.`
          : ""
      }`,
    },
    {
      question: `Is the ${hackathon.name} online or in person?`,
      answer: `It is a ${modeLabel(hackathon.mode).toLowerCase()} event${
        hackathon.location ? `, held at ${hackathon.location}` : ""
      }.${hackathon.invitedOnly ? " It is invite only." : " Anyone can sign up."}`,
    },
    {
      question: `Who organizes the ${hackathon.name}?`,
      answer: `${hackathon.organizer} organizes it. We read this listing from ${
        hackathon.sourceName
      }, and the organizer page is linked above so you can check every detail yourself.`,
    },
  ];

  return (
    <>
      <JsonLd data={eventJsonLd(hackathon)} />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: faq.map((item) => ({
            "@type": "Question",
            name: item.question,
            acceptedAnswer: { "@type": "Answer", text: item.answer },
          })),
        }}
      />

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <Breadcrumbs
          trail={[
            { name: "All hackathons", path: "/hackathons" },
            { name: hackathon.name, path: `/hackathons/${hackathon.slug}` },
          ]}
        />

        <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
          {/* Main column */}
          <div className="min-w-0 space-y-6">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={hackathon.status} />
                {hackathon.status !== "past" ? (
                  <Badge variant={application.isOpen ? "ongoing" : "outline"}>
                    <Clock aria-hidden="true" />
                    {application.label}
                  </Badge>
                ) : null}
                <Badge variant="outline">
                  {hackathon.mode === "online" ? (
                    <Video aria-hidden="true" />
                  ) : (
                    <MapPin aria-hidden="true" />
                  )}
                  {modeLabel(hackathon.mode)}
                </Badge>
                {hackathon.invitedOnly ? <Badge variant="past">Invite only</Badge> : null}
                {hackathon.tags.slice(0, 3).map((tag) => (
                  <Badge key={tag} variant="default">
                    {tag}
                  </Badge>
                ))}
              </div>

              <h1 className="mt-3 text-3xl font-bold tracking-tight text-balance sm:text-4xl">
                {hackathon.name}
              </h1>
              <p className="mt-2 text-muted-foreground">
                Organized by{" "}
                <span className="font-medium text-foreground">{hackathon.organizer}</span>
                <span className="mx-2 text-border">|</span>
                <span className="inline-flex items-center gap-1.5 text-sm">
                  <ShieldCheck className="size-3.5 text-success" aria-hidden="true" />
                  {verifiedLabel(hackathon)}
                </span>
              </p>
            </div>

            {/* Prize headline */}
            <Card className="border-prize/30 bg-prize/5 p-5">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {prize.claimedOnly ? "Announced prize pool" : "Total prize pool"}
              </p>
              <PrizeAmount
                amount={hackathon.totalPrizeUsd}
                claimed={prize.claimedOnly}
                nonUsd={prize.nonUsd}
                size="xl"
                className="mt-1"
              />
              <div className="mt-3 flex flex-wrap gap-2">
                {prize.breakdownPublished && hackathon.cashPrizeUsd > 0 ? (
                  <Badge variant="prize">
                    <Coins aria-hidden="true" />
                    {formatUsdLong(hackathon.cashPrizeUsd)} cash
                  </Badge>
                ) : null}
                {prize.breakdownPublished && hackathon.creditPrizeUsd > 0 ? (
                  <Badge variant="credits">
                    <Sparkles aria-hidden="true" />
                    {formatUsdLong(hackathon.creditPrizeUsd)} credits
                  </Badge>
                ) : null}
                {prize.claimedOnly ? (
                  <span className="text-sm text-muted-foreground">
                    The organizer announces this total but does not publish a cash and credits
                    breakdown, so we show the announced figure only.
                  </span>
                ) : null}
                {hackathon.totalPrizeUsd === 0 ? (
                  <span className="text-sm text-muted-foreground">
                    The organizer has not published a prize amount yet.
                  </span>
                ) : null}
              </div>
            </Card>

            {/* Key facts */}
            <dl className="grid gap-3 sm:grid-cols-2">
              <Fact icon={CalendarDays} label="Start date" value={formatDateLong(hackathon.startDate)} />
              <Fact icon={CalendarDays} label="End date" value={formatDateLong(hackathon.endDate)} />
              <Fact
                icon={Award}
                label="Submission deadline"
                value={
                  hackathon.registrationDeadline
                    ? `${formatDateLong(hackathon.registrationDeadline)} (${countdownText(hackathon)})`
                    : countdownText(hackathon)
                }
              />
              <Fact
                icon={hackathon.mode === "online" ? Video : MapPin}
                label="Format"
                value={hackathon.location ?? modeLabel(hackathon.mode)}
              />
              {hackathon.participants ? (
                <Fact
                  icon={Users}
                  label="Participants"
                  value={`${formatCount(hackathon.participants)} registered`}
                />
              ) : null}
              <Fact icon={Info} label="Who can join" value={hackathon.invitedOnly ? "Invite only" : "Open to everyone"} />
            </dl>

            {/* Key details: a short factual summary that is unique per event */}
            <section>
              <h2 className="text-xl font-bold tracking-tight">Key details</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {hackathon.name} is an AI hackathon run by {hackathon.organizer}
                {hackathon.tags.length ? `, focused on ${hackathon.tags.slice(0, 3).join(", ").toLowerCase()}` : ""}.{" "}
                It runs {modeLabel(hackathon.mode).toLowerCase()}
                {hackathon.startDate !== hackathon.endDate
                  ? ` from ${formatDateLong(hackathon.startDate)} to ${formatDateLong(hackathon.endDate)}`
                  : ` on ${formatDateLong(hackathon.startDate)}`}
                .{" "}
                {application.detail}{" "}
                {prize.claimedOnly
                  ? `The announced prize pool is ${formatUsdLong(prize.totalUsd)}, with no published cash and credits split.`
                  : prize.totalUsd > 0
                    ? `The prize pool is ${prize.label.toLowerCase()}.`
                    : "No prize pool is published on the organizer page."}{" "}
                {hackathon.participants
                  ? `${formatCount(hackathon.participants)} people have registered. `
                  : ""}
                This page was last checked {verifiedLabel(hackathon).toLowerCase().replace("verified ", "")} and every
                figure here comes from the organizer&apos;s own{" "}
                {hackathon.sourceName} page.
              </p>
              <p className="mt-3 text-sm">
                <Link
                  href={hackathon.status === "past" ? "/past" : `/${hackathon.status}`}
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  More {hackathon.status} AI hackathons
                </Link>
              </p>
            </section>

            {/* About */}
            {hackathon.description ? (
              <section>
                <h2 className="text-xl font-bold tracking-tight">About this hackathon</h2>
                <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
                  {hackathon.description
                    .split(/(?<=\.)\s+/)
                    .slice(0, 6)
                    .map((paragraph, index) => (
                      <p key={index}>{paragraph}</p>
                    ))}
                </div>
              </section>
            ) : null}

            {/* Prize breakdown */}
            {hackathon.prizes.length > 0 ? (
              <section>
                <h2 className="text-xl font-bold tracking-tight">Prize breakdown</h2>
                <div className="mt-3 space-y-4">
                  <PrizeTable title="Cash prizes" prizes={cashPrizes} />
                  <PrizeTable title="Cloud and API credits" prizes={creditPrizes} />
                  <PrizeTable title="Other prizes" prizes={otherPrizes} />
                </div>
                {prize.claimedOnly ? (
                  <p className="mt-3 text-sm text-muted-foreground">
                    The prizes above are the parts the organizer itemised. The announced total
                    is {formatUsdLong(prize.totalUsd)}, so some prizes may not be listed
                    individually.
                  </p>
                ) : null}
              </section>
            ) : null}

            {/* Winners */}
            {hackathon.winners.length > 0 || hackathon.winnersAnnounced ? (
              <section>
                <h2 className="text-xl font-bold tracking-tight">Winners</h2>
                {hackathon.winners.length > 0 ? (
                  <ul className="mt-3 space-y-2.5">
                    {hackathon.winners.map((winner, index) => (
                      <li
                        key={`${winner.project}-${index}`}
                        className="rounded-lg border border-border bg-card p-4"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          {winner.rank ? (
                            <Badge variant="prize">
                              <Trophy aria-hidden="true" />
                              {winner.rank === 1
                                ? "1st place"
                                : winner.rank === 2
                                  ? "2nd place"
                                  : winner.rank === 3
                                    ? "3rd place"
                                    : `${winner.rank}th place`}
                            </Badge>
                          ) : null}
                          {winner.prize ? <Badge variant="outline">{winner.prize}</Badge> : null}
                        </div>
                      <p className="mt-2 font-medium">
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
                      </p>
                      {winner.summary ? (
                        <p className="mt-1 text-sm text-muted-foreground">
                          <span className="text-xs font-semibold uppercase tracking-wider">
                            What they built:{" "}
                          </span>
                          {winner.summary}
                        </p>
                      ) : null}
                        {winner.team?.length ? (
                          <p className="mt-1 text-sm text-muted-foreground">
                            {winner.team.join(", ")}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}

                {hackathon.winners.length === 0 && hackathon.winnersAnnounced ? (
                  <Card className="mt-3 p-4">
                    <p className="text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">
                        Winners have been announced
                      </span>{" "}
                      for this event, but the organizer has not published the winning project
                      names on their page, so we do not list them. Open the official page to
                      see the results.
                    </p>
                    <Button asChild variant="outline" size="sm" className="mt-3">
                      <a
                        href={hackathon.officialUrl}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                      >
                        See the results
                        <ArrowUpRight aria-hidden="true" />
                      </a>
                    </Button>
                  </Card>
                ) : null}
              </section>
            ) : null}

            {/* FAQ */}
            <section>
              <h2 className="text-xl font-bold tracking-tight">Questions about this hackathon</h2>
              <div className="mt-3 space-y-2">
                {faq.map((item) => (
                  <details
                    key={item.question}
                    className="rounded-lg border border-border bg-card px-4 py-3"
                  >
                    <summary className="cursor-pointer list-none text-sm font-medium marker:content-none">
                      {item.question}
                    </summary>
                    <p className="mt-2 text-sm text-muted-foreground">{item.answer}</p>
                  </details>
                ))}
              </div>
            </section>

            {/* Related */}
            {related.length > 0 ? (
              <section>
                <h2 className="text-xl font-bold tracking-tight">Similar AI hackathons</h2>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  {related.map((item) => (
                    <HackathonCard key={item.id} hackathon={item} />
                  ))}
                </div>
              </section>
            ) : null}
          </div>

          {/* Sidebar */}
          <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
            <Card className="p-5">
              <h2 className="text-sm font-semibold">Take part</h2>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Everything below comes from the organizer&apos;s own page.
              </p>
              <div className="mt-4 space-y-2">
                <Button asChild size="lg" className="w-full">
                  <a
                    href={hackathon.officialUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Official page
                    <ArrowUpRight aria-hidden="true" />
                  </a>
                </Button>
                <Button asChild variant="outline" className="w-full">
                  <a href={hackathon.sourceUrl} target="_blank" rel="noopener noreferrer nofollow">
                    <Database aria-hidden="true" />
                    Where we got this
                    <ExternalLink aria-hidden="true" />
                  </a>
                </Button>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {hackathon.sourceName} · last checked{" "}
                <time dateTime={hackathon.updatedAt}>
                  {new Date(hackathon.updatedAt).toUTCString().replace(" GMT", " UTC")}
                </time>
              </p>
            </Card>

            <Card className="p-5">
              <h2 className="text-sm font-semibold">Quick facts</h2>
              <dl className="mt-3 space-y-2.5 text-sm">
                <Row
                  label={prize.claimedOnly ? "Announced pool" : "Prize pool"}
                  value={formatUsdLong(hackathon.totalPrizeUsd)}
                  highlight
                />
                {prize.breakdownPublished && hackathon.cashPrizeUsd > 0 ? (
                  <Row label="Cash" value={formatUsdLong(hackathon.cashPrizeUsd)} />
                ) : null}
                {prize.breakdownPublished && hackathon.creditPrizeUsd > 0 ? (
                  <Row label="Credits" value={formatUsdLong(hackathon.creditPrizeUsd)} />
                ) : null}
                <Row label="Format" value={modeLabel(hackathon.mode)} />
                <Row
                  label="Status"
                  value={
                    hackathon.status === "past"
                      ? `Ended ${formatDateLong(hackathon.endDate)}`
                      : countdownText(hackathon)
                  }
                />
                {hackathon.status !== "past" ? (
                  <Row label="Applications" value={application.label} />
                ) : null}
                <Row label="Organizer" value={hackathon.organizer} />
                <Row label="Source" value={hackathon.sourceName} />
                <Row label="Last checked" value={verifiedLabel(hackathon).replace("Verified ", "")} />
              </dl>
            </Card>

            {hackathon.tags.length > 0 ? (
              <Card className="p-5">
                <h2 className="text-sm font-semibold">Tags</h2>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {hackathon.tags.map((tag) => (
                    <Badge key={tag} variant="default">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </Card>
            ) : null}

            </aside>
        </div>
      </div>
    </>
  );
}

function Fact({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Info;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-4">
      <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
      <div className="min-w-0">
        <dt className="text-xs uppercase tracking-wider text-muted-foreground">{label}</dt>
        <dd className="mt-0.5 text-sm font-medium">{value}</dd>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={`text-right font-medium ${highlight ? "text-prize" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}

function PrizeTable({
  title,
  prizes,
}: {
  title: string;
  prizes: Prize[];
}) {
  if (prizes.length === 0) return null;

  return (
    <div>
      <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
      <ul className="mt-2 divide-y divide-border overflow-hidden rounded-lg border border-border">
        {prizes.map((prize, index) => (
          <li
            key={`${prize.label}-${index}`}
            className="flex items-center justify-between gap-4 bg-card px-4 py-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium">{prize.label}</p>
              {prize.sponsors?.length ? (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {prize.sponsors.join(", ")}
                </p>
              ) : null}
            </div>
            <div className="shrink-0 text-right">
              <p className="font-semibold tabular-nums">{formatUsdLong(prize.amount)}</p>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {prizeTypeLabel(prize)}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
