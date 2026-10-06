import { promises as fs } from "node:fs";
import path from "node:path";
import { curatedHackathons } from "../src/data/curated";
import type { Hackathon } from "../src/lib/types";

/**
 * Writes one new blog article per day into `content/blog`.
 *
 * The articles are assembled from templates and use only facts read from the
 * real dataset (`src/data/hackathons.json` plus the curated records), so no
 * API key is needed and nothing is invented. It only ever adds a file: if
 * today's article already exists the script does nothing.
 *
 *   npx tsx scripts/generate-post.ts
 */

const DIR = path.join(process.cwd(), "content", "blog");
const DATA = path.join(process.cwd(), "src", "data", "hackathons.json");

interface Facts {
  hackathons: Hackathon[];
  lastUpdated: string;
}

interface Template {
  slug: string;
  title: string;
  description: string;
  body: (facts: Facts) => string;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function usd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function shortDate(iso: string): string {
  const parts = iso.split("-");
  return parts.length === 3 ? `${parts[1]}/${parts[2]}/${parts[0]}` : iso;
}

function active(first: number): (f: Facts) => Hackathon[] {
  return (f) =>
    f.hackathons
      .filter((h) => h.status !== "past")
      .sort((a, b) => a.endDate.localeCompare(b.endDate))
      .slice(0, first);
}

function bestPrizes(first: number): (f: Facts) => Hackathon[] {
  return (f) =>
    f.hackathons
      .filter((h) => h.totalPrizeUsd > 0)
      .sort((a, b) => b.totalPrizeUsd - a.totalPrizeUsd)
      .slice(0, first);
}

const TEMPLATES: Template[] = [
  {
    slug: "biggest-prize-pools",
    title: "The biggest AI hackathon prize pools right now",
    description:
      "Which AI hackathons currently offer the largest prize money, and how to read those figures honestly.",
    body: (f) => {
      const lines = bestPrizes(6)(f).map((h, i) => {
        const detail =
          h.prizeBreakdownPublished && h.cashPrizeUsd > 0 && h.cashPrizeUsd < h.totalPrizeUsd
            ? ` of which ${usd(h.cashPrizeUsd)} is listed as cash`
            : h.prizeBreakdownPublished && h.cashPrizeUsd > 0
              ? ", published as a cash prize"
              : ", an announced total with no published cash and credits split";
        return `${i + 1}. **${usd(h.totalPrizeUsd)}** — *${h.name}* (${h.status}${detail}).`;
      });
      const list = lines.length
        ? lines.join("\n")
        : "No prize pools are published right now. The moment an organizer states a total, it appears here automatically.";

      return `Every figure in this article is read from the live dataset, last updated ${f.lastUpdated.slice(0, 10)}. Nothing is estimated.

Prize money is the first thing most people check about a hackathon, and it is also the easiest number to misread. This article lists the largest published pools, then explains what each figure actually means.

## The largest published pools

${list}

These are total pools, not cash in the bank. Some organizers publish a full list of prizes, clearing separating cash from credits and hardware; others state only a headline total such as **$100,000 in prizes** and leave the split to a page that may change later. We label the second kind as an announced pool and never guess the breakdown.

## Cash and credits are different

A prize in cloud credits pays for compute and APIs, not groceries. When an organizer lists both, we count them in separate columns, so the cash number you see is really cash. If you are deciding between events, compare the cash prizes first and treat credit prizes as a useful top-up rather than income.

## How to check a prize yourself

Every event on this site keeps both an official link and the link we read the data from. Open the official page before you register and look for:

- a published prize table or rules page that lists amounts and winners get them,
- the payment format (cash wire, bank transfer, or platform credits),
- whether the pool is shared across tracks or split per category.

## The takeaway

A big announced pool is a good sign an event is well funded, but the real question is what the winners actually receive. Prefer events that publish the full breakdown, and use the official page to confirm before spending a weekend on it.`;
    },
  },
  {
    slug: "three-events-you-can-enter",
    title: "Three AI hackathons you can enter right now",
    description:
      "Real, currently open AI hackathons from the dataset with dates, locations, prizes and official links.",
    body: (f) => {
      const events = active(3)(f);
      const detail = events
        .map((h) => {
          const prize = h.totalPrizeUsd > 0 ? ` Prize pool: **${usd(h.totalPrizeUsd)}**.` : "";
          const where = h.location && h.location !== "Online" ? h.location : h.mode === "online" ? "Fully online" : "Location not published";
          const winners = h.winners.length
            ? ` Previous winners are published (${h.winners.length} project${h.winners.length > 1 ? "s" : ""}).`
            : "";
          return `### ${h.name}

- **Runs:** ${shortDate(h.startDate)} to ${shortDate(h.endDate)}
- **Where:** ${where}
- **Status:** ${h.status}${prize}${winners}
- **Official page:** <${h.officialUrl}>`;
        })
        .join("\n\n");
      const fallback =
        "No event is currently open in the dataset. The next refresh (every six hours) usually adds new ones, so check back tomorrow.";

      return `The three events below are live entries in our dataset, last updated ${f.lastUpdated.slice(0, 10)}. Each one is a real, published AI hackathon with an official page you can open yourself.

## The events

${events.length ? detail : fallback}

## What to check before you register

- **Dates and timezone.** Note the submission deadline as well as the event start and end dates. Some events keep running while they stop accepting submissions.
- **Prize breakdown.** Prefer events that publish cash and credits separately. A headline pool is not the same as cash in hand.
- **Previous winners.** If an event has published winners before, their projects show what the organizers reward: polished demos, strong research, or working integrations.

## The takeaway

Pick the event whose dates fit your calendar and whose prize structure matches what you want to win. Everything above is one click away on the official page — registering takes minutes, and most events are free.`;
    },
  },
  {
    slug: "ai-hackathons-around-the-world",
    title: "AI hackathons are a global sport",
    description:
      "Where AI hackathons happen, how many are online, and how the site reads location data from public pages.",
    body: (f) => {
      const total = f.hackathons.length;
      const byStatus = (s: Hackathon["status"]) => f.hackathons.filter((h) => h.status === s).length;
      const online = f.hackathons.filter((h) => h.mode === "online").length;
      const inPerson = f.hackathons.filter((h) => h.mode === "in-person").length;
      const hybrid = f.hackathons.filter((h) => h.mode === "hybrid").length;
      const countryLines = (Array.from(
        f.hackathons.reduce<Map<string, number>>((map, h) => {
          if (h.country) map.set(h.country, (map.get(h.country) ?? 0) + 1);
          return map;
        }, new Map<string, number>()).entries(),
      )
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([country, count], i) => `${i + 1}. **${country}** — ${count} ${count === 1 ? "event" : "events"}`)
        .join("\n") || "No country data is published right now.");

      return `AI hackathons started as a mostly American and European thing, but the organizers publish locations from every corner of the world. This article walks through the numbers in the live dataset, last updated ${f.lastUpdated.slice(0, 10)}.

## How big is the scene?

At the last update the dataset held **${total} events**: ${byStatus("upcoming")} upcoming, ${byStatus("ongoing")} ongoing and ${byStatus("past")} past. The count changes every refresh, and past entries stay so you can still look up prizes and winners.

## Where events run

Every country below is read from the location text the organizer themselves published on the event page. No location is guessed.

${f.hackathons.length ? countryLines : "No country data is published right now."}

## Online versus in person

- **${online} events** are fully online
- **${inPerson} events** are in person
- **${hybrid} events** blend both (you can often join online even when there is a venue)

Online events are why a hackathon in one country can be joined by teams in five others.

## Why this matters

Location decides more than travel costs. Timezones set the demo and judging schedule, in-person events usually mean stronger networking, and regional events are the easiest way to find co-founders who live nearby.

## The takeaway

This is a global field. Filter by mode and read the published location before you enter, and a hackathon almost anywhere becomes one you can realistically compete in.`;
    },
  },
  {
    slug: "what-winning-projects-look-like",
    title: "What winning AI hackathon projects look like",
    description:
      "Real winner examples from the dataset, plus why some events never publish their winners.",
    body: (f) => {
      const withWinners = curatedHackathons.filter((h) => h.winners.length > 0);
      const totalWinners = withWinners.reduce((sum, h) => sum + h.winners.length, 0);
      const examples = withWinners
        .flatMap((h) =>
          h.winners.slice(0, 2).map((w) => ({
            project: w.project,
            summary: w.summary,
            prize: w.prize,
            event: h.name,
          })),
        )
        .slice(0, 5);
      const exampleLines = examples
        .map((e, i) => {
          const summary = e.summary ? ` — ${e.summary}` : "";
          const prize = e.prize ? ` Prize: *${e.prize}*.` : "";
          return `${i + 1}. **${e.project}**, from *${e.event}*${summary}.${prize}`;
        })
        .join("\n");

      return `Winning projects are the best way to understand what a hackathon's judges reward. Everything in this article comes from the published winner lists in our dataset, last updated ${f.lastUpdated.slice(0, 10)}.

## How many winners we list

Across all events we currently list **${totalWinners} winning projects** from **${withWinners.length} events**. Each one is taken from the organizer's own page, and each keeps a link back so you can open the project yourself.

## Real examples

${exampleLines}

## Why some events have no winners

Not every organizer publishes winning projects as open data:

- some publish only a winner count ("20 winners announced");
- some announce winners on Discord or in an email and never list them on the public page;
- some are still running or just ended, so winners have not been decided yet.

When winners are not public, we do not add them. No winner name on this site is invented.

## How to read a winner list

- Look at the project summary, not just the name — it tells you what the team actually built.
- Check which prize it won. First place in a category often matters more than a tiny part of a shared pool.
- Open the project to see how far it got: a deployable demo usually beats a slide deck.

## The takeaway

Winner lists are the honest evidence that a hackathon run really happened. Use them to spot organizers whose standards match your own, then enter their next event with confidence.`;
    },
  },
  {
    slug: "upcoming-ongoing-or-past",
    title: "Upcoming, ongoing or past: how the status works",
    description:
      "How every event on this site gets its status, why registration is a separate signal, and how dates are read.",
    body: (f) => {
      const total = f.hackathons.length;
      const pick = (s: Hackathon["status"]): Hackathon | undefined =>
        f.hackathons.find((h) => h.status === s);
      const example = (s: Hackathon["status"]) => {
        const h = pick(s);
        if (!h) return "";
        const prize = h.totalPrizeUsd > 0 ? `, with a published pool of **${usd(h.totalPrizeUsd)}**` : "";
        return `A current ${s} example is **${h.name}** — it runs ${shortDate(h.startDate)} to ${shortDate(h.endDate)}${prize}, and its official page is <${h.officialUrl}>.`;
      };

      return `Every event on this site carries a status: **upcoming**, **ongoing** or **past**. The label is never hard-coded — it is worked out from the start and end dates on every read. This article explains the system using the live dataset, last updated ${f.lastUpdated.slice(0, 10)}.

## The three labels

- **Upcoming** — the start date is still in the future. The organizer has opened registration but teams have not begun.
- **Ongoing** — the event has started and has not ended yet. Teams are building and submitting.
- **Past** — the event has ended. Prizes and winners may already be published.

At the last update: ${total} events total.

${example("upcoming")}

${example("ongoing")}

${example("past")}

## Status and registration are different things

An event can be **ongoing** while its registration is **closed**: many hackathons stop accepting sign-ups days before the end date so judges have time. We show both signals separately:

- the event status comes from the dates;
- the registration state comes from what the organizer page says.

## Why dates drive everything

Dates are the one fact organizers hardly ever get wrong. Deriving status from them means:

- an event moves from upcoming to ongoing to past on its own;
- there is no manual flip a refresh can get wrong;
- a listing that misses dates is flagged and never published.

## The takeaway

Check the dates before the labels: the status is correct by construction, but timezones mean your own "today" can differ from the organizer's. Filter by status to browse, then open the event page to confirm the schedule in your own timezone.`;
    },
  },
];

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

async function readFacts(): Promise<Facts> {
  let hackathons: Hackathon[] = [];
  let lastUpdated = new Date().toISOString().slice(0, 10);
  try {
    const raw = JSON.parse(await fs.readFile(DATA, "utf8")) as {
      meta?: { lastUpdated?: string };
      hackathons?: Hackathon[];
    };
    hackathons = raw.hackathons ?? [];
    lastUpdated = raw.meta?.lastUpdated ?? lastUpdated;
  } catch (error) {
    console.error(`[blog] could not read dataset: ${(error as Error).message}`);
  }
  return { hackathons, lastUpdated };
}

async function main() {
  const date = todayIso();
  const files = await fs.readdir(DIR).catch(() => [] as string[]);
  const alreadyToday = files.filter((f) => f.startsWith(date));
  if (alreadyToday.length > 0) {
    console.log(`[blog] ${date} already has an article (${alreadyToday.join(", ")}). Nothing to do.`);
    return;
  }

  const facts = await readFacts();
  const dayIndex = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
  const template = TEMPLATES[((dayIndex % TEMPLATES.length) + TEMPLATES.length) % TEMPLATES.length];
  if (!template) {
    console.error("[blog] no template selected, nothing written.");
    process.exitCode = 1;
    return;
  }

  const body = template.body(facts).trim();
  const slug = slugify(template.slug);
  const sectionCount = (body.match(/^## /gm) ?? []).length;
  if (body.length < 400 || sectionCount < 2 || !slug) {
    console.error("[blog] generated article is incomplete, nothing written.");
    process.exitCode = 1;
    return;
  }

  const frontmatter = [
    "---",
    `title: ${template.title.replace(/"/g, "'")}`,
    `slug: ${slug}`,
    `date: ${date}`,
    `description: ${template.description.replace(/"/g, "'")}`,
    "tags: AI, Getting started",
    "author: AI Hackathons",
    "---",
    "",
    body,
    "",
  ].join("\n");

  const file = path.join(DIR, `${date}-${template.slug}.md`);
  await fs.writeFile(file, frontmatter, "utf8");
  console.log(`[blog] wrote ${path.relative(process.cwd(), file)} (${body.length} chars)`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});