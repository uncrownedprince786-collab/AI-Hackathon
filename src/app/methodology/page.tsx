import type { Metadata } from "next";
import Link from "next/link";
import {
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  Clock,
  Database,
  FileJson,
  Link2,
  RefreshCw,
  Scale,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { getDataset } from "@/lib/hackathons";
import { JsonLd } from "@/components/json-ld";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buildMetadata } from "@/lib/seo";
import { faqJsonLd } from "@/lib/structured-data";
import { formatCount } from "@/lib/format";

export const metadata: Metadata = buildMetadata({
  title: "How We Collect AI Hackathon Data — Methodology",
  description:
    "Exactly where our AI hackathon data comes from: which public pages we read, how often we re-check them, how we separate cash prizes from credits, and how to correct anything that looks wrong.",
  path: "/methodology",
  keywords: [
    "how we collect ai hackathon data",
    "ai hackathon data sources",
    "hackathon prize data accuracy",
    "ai hackathon methodology",
  ],
});

const STEPS = [
  {
    icon: Database,
    title: "1. We read public pages",
    body: "We read the public event pages of hackathon platforms. Nothing is read behind a login, and we never ask for anyone's account.",
  },
  {
    icon: Scale,
    title: "2. We keep cash and credits apart",
    body: "A prize is either cash, cloud or API credits, or something else. We list them separately so you can see the real cash number, not a blended guess.",
  },
  {
    icon: Clock,
    title: "3. We work out the status from dates",
    body: "Every hackathon is ongoing, upcoming or past based only on its start and end dates. When an event ends, it moves to past on its own.",
  },
  {
    icon: RefreshCw,
    title: "4. A scheduled job re-checks every 6 hours",
    body: "A cron job reads the sources again every six hours, updates the numbers, and refreshes the pages you see.",
  },
  {
    icon: Sparkles,
    title: "5. Every record passes a set of checks",
    body: "Before a listing appears, a set of rules runs over it: it must clearly be about AI, have valid dates, a working official page, a prize figure that makes sense and a clean organizer name. Listings that fall short are kept out of the site. The checks only use the text on the public pages and never invent a prize, a date or a winner.",
  },
  {
    icon: ShieldCheck,
    title: "6. We keep the source link",
    body: "Each hackathon keeps a link to the official page and a link to where the data came from, so you can always check the facts yourself.",
  },
];

const FAQ = [
  {
    question: "What does the \"Total prize money\" figure mean?",
    answer:
      "It is the sum of every event's published prize pool, counted in US dollars only. Cash prizes and cloud credits stay in separate columns, and a headline pool an organizer announces without a breakdown is counted as an announced total and labelled as such. A pool stated in another currency is shown in that currency and never converted. The winners page shows its own narrower figure — the prize money of the events whose results are listed there — so the two numbers are not the same thing and are not meant to be compared as if they were.",
  },
  {
    question: "Where does the AI hackathon data come from?",
    answer:
      "We read public event listings and event pages from hackathon platforms such as Devpost and lablab.ai, plus a small set of hand-checked records for major AI hackathons. Every record keeps the link it was read from.",
  },
  {
    question: "How often is the data updated?",
    answer:
      "A scheduled job runs every 6 hours. It re-reads the sources, recalculates each status from the dates, and updates the site. Each event also shows when it was last verified.",
  },
  {
    question: "How do you work out the prize money?",
    answer:
      "We read the prize table the organizer published and keep cash, credits and other prizes in separate columns. If an organizer only announces a headline pool such as \"$400,000 in prizes\" without listing each prize, we show that figure and label it as an announced total with no published breakdown, rather than guessing the split.",
  },
  {
    question: "Why does an event say \"applications closed\" while it is still running?",
    answer:
      "Running and open for sign-ups are different things. Many events stop accepting submissions while the hackathon itself is still running, so we show the status of the event and the status of applications separately.",
  },
  {
    question: "Why are some hackathons missing winners?",
    answer:
      "Not every organizer publishes winning projects as open data. Some publish only a winner count. We only list named winners when the organizer has published them, so we never guess.",
  },
  {
    question: "Do you use AI to fill in the data?",
    answer:
      "No. Every number on the site is read from a public event page or hand-checked. The pipeline runs a set of rules that only drop listings which are not clearly about AI or which miss a date, a working link or a prize figure that makes sense. No model writes, guesses or copies any data onto the site.",
  },
  {
    question: "I found a mistake. How do I fix it?",
    answer:
      "Use the submit form and include the official link. We re-read the source page and update the record.",
  },
  {
    question: "Can I use this data?",
    answer:
      "Yes. The whole dataset is free to read as JSON, and the pages have no login and no signup.",
  },
];

export default async function HowWeCollectDataPage() {
  const dataset = await getDataset();

  return (
    <>
      <JsonLd data={faqJsonLd(FAQ)} />

      <PageHeader
        eyebrow="Trust"
        title="How we collect AI hackathon data"
        description="Short version: we read public pages, keep cash and credits separate, work out the status from the dates, and re-check everything every six hours. Here is the full method."
        stats={[
          { label: "Sources", value: String(dataset.meta.sources.length) },
          { label: "Records", value: formatCount(dataset.hackathons.length) },
          { label: "Refresh rate", value: "6 hours" },
          { label: "Login needed", value: "No" },
        ]}
      />

      <div className="mx-auto max-w-4xl space-y-12 px-4 py-10 sm:px-6">
        <section>
          <h2 className="text-xl font-bold tracking-tight">The short version</h2>
          <p className="mt-3 text-muted-foreground">
            This site is a list, not an account. There is no login and no signup. A
            scheduled job reads public event pages, reads the prize and date information,
            and works out on its own whether each hackathon is upcoming, ongoing or past.
            Every record keeps a link to the official page, so nothing is hidden.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold tracking-tight">Where the data comes from</h2>
          <div className="mt-4 space-y-3">
            {dataset.meta.sources.map((source) => (
              <Card key={source.name} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-medium">{source.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {source.url} · {formatCount(source.fetched)} records read this run
                  </p>
                </div>
                <Badge variant={source.ok ? "ongoing" : "past"}>
                  {source.ok ? (
                    <>
                      <CheckCircle2 aria-hidden="true" />
                      Working
                    </>
                  ) : (
                    "Unavailable"
                  )}
                </Badge>
              </Card>
            ))}
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            We also keep a small set of hand-checked records for major AI hackathons, so
            the biggest events always have correct prize splits and winner names.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold tracking-tight">How we read prize money</h2>
          <p className="mt-3 text-muted-foreground">
            Prize money is the number people check first, and it is also the easiest to get
            wrong. Cloud credits, API keys and sponsor products are often worth dollars but
            are not cash, so we never add them into a cash figure.
          </p>
          <div className="mt-4 space-y-3">
            {[
              {
                icon: Scale,
                title: "Cash and credits stay apart",
                body: "When an organizer lists prizes, we keep the cash total, the credits total and anything else separately. A card that says \"$200k cash + $300k credits\" is showing you both numbers, not one blended guess.",
              },
              {
                icon: BadgeCheck,
                title: "A headline pool is labelled as such",
                body: "Plenty of organizers only publish \"$400,000 in prizes\" without listing each prize. We show that announced total and label it clearly, instead of writing \"no cash prize\" or inventing a split.",
              },
              {
                icon: Link2,
                title: "Every number keeps its source",
                body: "Each record links to the official event page and to the page we read the data from, so you can check any figure yourself in one click.",
              },
            ].map((item) => (
              <div key={item.title} className="flex gap-4 rounded-xl border border-border bg-card p-4">
                <item.icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                <div>
                  <h3 className="font-semibold">{item.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{item.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-xl font-bold tracking-tight">How we track open applications</h2>
          <p className="mt-3 text-muted-foreground">
            An event can still be running after it stops accepting submissions, so we track
            the two separately. The status badge tells you whether the hackathon is upcoming,
            ongoing or past, and a second badge tells you whether you can still sign up. When
            the source page states that registration is closed, we believe the page.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge variant="ongoing">Applications open</Badge>
            <Badge variant="outline">Applications closed</Badge>
            <Badge variant="past">Closed</Badge>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-bold tracking-tight">When each record was last checked</h2>
          <p className="mt-3 text-muted-foreground">
            Every card and every event page carries a last-verified date. The whole dataset is
            re-read every six hours, so a &quot;verified today&quot; stamp means the figures were
            taken from the organizer&apos;s own page today rather than copied from somewhere else.
            Past events are kept in the list but are only re-read when a source changes them, so
            an old record may show an older stamp on purpose.
          </p>
          <Card className="mt-4 flex flex-wrap items-center justify-between gap-4 p-5">
            <div>
              <p className="font-medium">Last full refresh</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {new Date(dataset.meta.lastUpdated).toUTCString()}
              </p>
            </div>
            <Badge variant="outline">
              <CalendarClock aria-hidden="true" />
              Every 6 hours
            </Badge>
          </Card>
        </section>

        <section>
          <h2 className="text-xl font-bold tracking-tight">How it works, step by step</h2>
          <ol className="mt-4 space-y-3">
            {STEPS.map((step) => (
              <li key={step.title} className="flex gap-4 rounded-xl border border-border bg-card p-4">
                <step.icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                <div>
                  <h3 className="font-semibold">{step.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section>
          <h2 className="text-xl font-bold tracking-tight">How we work out the status</h2>
          <div className="mt-4 overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <caption className="sr-only">How each hackathon status is decided</caption>
              <thead className="bg-secondary/50 text-left">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">When it applies</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr className="bg-card">
                  <th scope="row" className="px-4 py-2.5 text-left">
                    <Badge variant="upcoming">Upcoming</Badge>
                  </th>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    The start date is still in the future.
                  </td>
                </tr>
                <tr className="bg-card">
                  <th scope="row" className="px-4 py-2.5 text-left">
                    <Badge variant="ongoing">Ongoing</Badge>
                  </th>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    Today falls between the start date and the end date.
                  </td>
                </tr>
                <tr className="bg-card">
                  <th scope="row" className="px-4 py-2.5 text-left">
                    <Badge variant="past">Past</Badge>
                  </th>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    The end date has passed. Winners are shown if the organizer published them.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-bold tracking-tight">What we do not do</h2>
          <ul className="mt-4 space-y-2 text-muted-foreground">
            {[
              "We never ask you to create an account or sign in.",
              "We never guess a prize amount. If it is not published, we leave it blank.",
              "We never convert a prize stated in another currency into US dollars; we show it in the currency the organizer published.",
              "We never invent winner names. If the organizer did not publish results, we say nothing.",
              "We never hide where a number came from. Each record keeps its source link.",
            ].map((item) => (
              <li key={item} className="flex gap-2">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold tracking-tight">Use the data yourself</h2>
          <Card className="mt-4 flex flex-wrap items-center justify-between gap-4 p-5">
            <div>
              <p className="font-medium">Download everything as JSON</p>
              <p className="mt-1 text-sm text-muted-foreground">
                No key, no login, no rate limit.
              </p>
            </div>
            <Link
              href="/api/data"
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
            >
              <FileJson aria-hidden="true" />
              Open the dataset
            </Link>
          </Card>
        </section>

        <section>
          <h2 className="text-xl font-bold tracking-tight">Common questions</h2>
          <div className="mt-4 space-y-2">
            {FAQ.map((item) => (
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

        <section>
          <h2 className="text-xl font-bold tracking-tight">Found a mistake?</h2>
          <p className="mt-3 text-muted-foreground">
            Send us the official link. There is no form to log into and no account to make.
          </p>
          <Link
            href="/submit"
            className="mt-4 inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            Submit or correct a hackathon
          </Link>
        </section>
      </div>
    </>
  );
}
