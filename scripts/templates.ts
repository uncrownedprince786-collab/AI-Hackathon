import type { Hackathon } from "../src/lib/types";

/**
 * Dataset-backed article templates (blog engine v2).
 *
 * Every body is assembled only from facts passed in by the generator. Each
 * template declares what data it needs (via `fits`), so a topic is only ever
 * published when the dataset actually supports it. All money figures are
 * rendered through `usd()` and later verified by `verifyFigures`.
 */

export interface Facts {
  hackathons: Hackathon[];
  lastUpdated: string;
}

interface Template {
  slug: string;
  title: string;
  description: string;
  /** Whether this topic has enough real data today to stay coherent. */
  fits(facts: Facts): boolean;
  body(facts: Facts): string;
}

export function usd(value: number): string {
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

function sourceFooter(facts: Facts): string {
  return `> **Sources & verification.** Every figure in this article is read from the live dataset, last updated **${facts.lastUpdated.slice(0, 10)}**. Each listed event links to its official page and to its detail page here on the site, so every number is traceable. No figure is estimated.`;
}

/** Honest one-line description of how a prize total breaks down. */
function prizeDetail(h: Hackathon): string {
  if (h.prizeBreakdownPublished && h.cashPrizeUsd > 0 && h.cashPrizeUsd < h.totalPrizeUsd) {
    return `, of which ${usd(h.cashPrizeUsd)} is published as cash`;
  }
  if (h.prizeBreakdownPublished && h.cashPrizeUsd > 0) {
    return ", published as a cash prize";
  }
  return ", an announced total with no published cash and credits split";
}

const TEMPLATES: Template[] = [
  {
    slug: "biggest-prize-pools",
    title: "The biggest AI hackathon prize pools right now",
    description:
      "Which AI hackathons currently offer the largest prize money, and how to read those figures honestly without confusing announced pools for cash.",
    fits: (f) => bestPrizes(3)(f).length >= 3,
    body: (f) => {
      const lines = bestPrizes(6)(f).map((h, i) => {
        const detail = prizeDetail(h);
        return `${i + 1}. **${usd(h.totalPrizeUsd)}** — [${h.name}](/hackathons/${h.slug}) (${h.status}${detail}). Official page: <${h.officialUrl}>.`;
      });
      const list = lines.length
        ? lines.join("\n")
        : "No prize pools are published right now. The moment an organizer states a total, it appears here automatically.";

      return `Prize money is the first thing most people check about a hackathon, and it is also the easiest number to misread. This article lists the largest published pools in the dataset, then explains what each figure actually means.

## The largest published pools

${list}

These are total pools, not cash in the bank. Some organizers publish a full list of prizes, clearly separating cash from credits and hardware; others state only a headline total such as **$100,000 in prizes** and leave the split to a page that may change later. We label the second kind as an announced pool and never guess the breakdown.

## Cash and credits are different

A prize in cloud credits pays for compute and APIs, not groceries. When an organizer lists both, we count them in separate columns, so the cash number you see is really cash. If you are deciding between events, compare the cash prizes first and treat credit prizes as a useful top-up rather than income.

## How to check a prize yourself

Every event on this site keeps both an official link and the link we read the data from. Open the official page before you register and look for:

- a published prize table or rules page that lists amounts;
- the payment format (cash transfer, or platform credits);
- whether the pool is shared across tracks or split per category.

## The takeaway

A big announced pool is a good sign an event is well funded, but the real question is what the winners actually receive. Prefer events that publish the full breakdown, [browse the full list](/hackathons), and use the official page to confirm before spending a weekend on it.

${sourceFooter(f)}`;
    },
  },
  {
    slug: "three-events-you-can-enter",
    title: "Three AI hackathons you can enter right now",
    description:
      "Real, currently open AI hackathons from the dataset with dates, locations, prizes and official links.",
    fits: (f) => active(3)(f).length >= 3,
    body: (f) => {
      const events = active(3)(f);
      const detail = events
        .map((h) => {
          const prize =
            h.totalPrizeUsd > 0
              ? ` Prize total: **${usd(h.totalPrizeUsd)}**${h.claimedPrizeUsd ? " (announced pool)" : ""}.`
              : " No prize pool is published yet.";
          const where =
            h.location && h.location !== "Online"
              ? h.location
              : h.mode === "online"
                ? "Fully online"
                : "Location not published";
          const winners = h.winners.length
            ? ` Previous winners are published (${h.winners.length} project${h.winners.length > 1 ? "s" : ""}).`
            : "not published yet";
          return `### [${h.name}](/hackathons/${h.slug})

- **Runs:** ${shortDate(h.startDate)} to ${shortDate(h.endDate)}
- **Where:** ${where}
- **Status:** ${h.status}
- **Prize:** ${prize}
- **Winners:** ${winners}
- **Official page:** <${h.officialUrl}>`;
        })
        .join("\n\n");
      const fallback =
        "No event is currently open in the dataset. The next refresh (every six hours) usually adds new ones, so check back tomorrow.";

      return `The three events below are live entries in our dataset, last updated ${f.lastUpdated.slice(0, 10)}. Each one is a real, published AI hackathon with an official page you can open yourself, and each has its own detail page here.

## The events

${events.length >= 3 ? detail : fallback}

## What to check before you register

- **Dates and timezone.** Note the submission deadline as well as the event start and end dates. Some events keep running while they stop accepting submissions.
- **Prize breakdown.** Prefer events that publish cash and credits separately. A headline pool is not the same as cash in hand.
- **Previous winners.** If an event has published winners before, their projects show what the organizers reward: polished demos, strong research, or working integrations.

## The takeaway

Pick the event whose dates fit your calendar and whose prize structure matches what you want to win. Everything above is one click away on the official page — registering takes minutes, and most events are free. [Browse every open event](/hackathons) for more.

${sourceFooter(f)}`;
    },
  },
  {
    slug: "ai-hackathons-around-the-world",
    title: "AI hackathons are a global sport",
    description:
      "Where AI hackathons happen, how many are online, and how the site reads location data from public pages.",
    fits: (f) => new Set(f.hackathons.map((h) => h.country).filter(Boolean)).size >= 2,
    body: (f) => {
      const total = f.hackathons.length;
      const byStatus = (s: Hackathon["status"]) => f.hackathons.filter((h) => h.status === s).length;
      const online = f.hackathons.filter((h) => h.mode === "online").length;
      const inPerson = f.hackathons.filter((h) => h.mode === "in-person").length;
      const hybrid = f.hackathons.filter((h) => h.mode === "hybrid").length;
      const byCountry = f.hackathons.reduce<Map<string, number>>((map, h) => {
        if (h.country) map.set(h.country, (map.get(h.country) ?? 0) + 1);
        return map;
      }, new Map());
      const countryLines =
        [...byCountry.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 6)
          .map(([country, count], i) => `${i + 1}. **${country}** — ${count} ${count === 1 ? "event" : "events"}`)
          .join("\n") || "No country data is published right now.";

      return `AI hackathons started as a mostly American and European thing, but organizers publish locations from every corner of the world. This article walks through the numbers in the live dataset, last updated ${f.lastUpdated.slice(0, 10)}.

## How big is the scene?

At the last update the dataset held **${total} events** across **${byCountry.size} countries**: ${byStatus("upcoming")} upcoming, ${byStatus("ongoing")} ongoing and ${byStatus("past")} past. The count changes every refresh, and past entries stay so you can still look up prizes and winners.

## Where events run

Every country below is read from the location the organizer themselves published on the event page. No location is guessed.

${countryLines}

## Online versus in person

- **${online} events** are fully online
- **${inPerson} events** are in person
- **${hybrid} events** blend both (you can often join online even when there is a venue)

Online events are why a hackathon in one country can be joined by teams in five others.

## Why this matters

Location decides more than travel costs. Timezones set the demo and judging schedule, in-person events usually mean stronger networking, and regional events are the easiest way to find co-founders who live nearby.

## The takeaway

This is a global field. [Filter by mode and location](/hackathons) and read the published location before you enter, and a hackathon almost anywhere becomes one you can realistically compete in.

${sourceFooter(f)}`;
    },
  },
  {
    slug: "what-winning-projects-look-like",
    title: "What winning AI hackathon projects look like",
    description:
      "Real winner examples from the dataset, plus why some events never publish their winners.",
    fits: (f) => f.hackathons.some((h) => h.winners.length > 0),
    body: (f) => {
      const withWinners = f.hackathons.filter((h) => h.winners.length > 0);
      const totalWinners = withWinners.reduce((sum, h) => sum + h.winners.length, 0);
      const examples = withWinners
        .flatMap((h) =>
          h.winners.slice(0, 2).map((w) => ({
            project: w.project,
            summary: w.summary,
            prize: w.prize,
            event: h,
          })),
        )
        .slice(0, 5);
      const exampleLines = examples
        .map((e, i) => {
          const summary = e.summary ? ` — ${e.summary}` : "";
          const prize = e.prize ? ` Prize: *${e.prize}*.` : "";
          return `${i + 1}. **${e.project}**, from [${e.event.name}](/hackathons/${e.event.slug})${summary}.${prize}`;
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

Winner lists are the honest evidence that a hackathon really ran. [Browse the events with published winners](/hackathons?winners=published) to spot organizers whose standards match your own, then enter their next event with confidence.

${sourceFooter(f)}`;
    },
  },
  {
    slug: "upcoming-ongoing-or-past",
    title: "Upcoming, ongoing or past: how the status works",
    description:
      "How every event on this site gets its status, why registration is a separate signal, and how dates are read from the dataset.",
    fits: (f) => f.hackathons.length >= 1,
    body: (f) => {
      const total = f.hackathons.length;
      const pick = (s: Hackathon["status"]): Hackathon | undefined =>
        f.hackathons.find((h) => h.status === s);
      const example = (s: Hackathon["status"]) => {
        const h = pick(s);
        if (!h) return "";
        const prize = h.totalPrizeUsd > 0 ? `, with a published pool of **${usd(h.totalPrizeUsd)}**` : "";
        return `A current ${s} example is **${h.name}** ([details](/hackathons/${h.slug})), which runs ${shortDate(h.startDate)} to ${shortDate(h.endDate)}${prize}, and its official page is <${h.officialUrl}>.`;
      };

      return `Every event on this site carries a status: **upcoming**, **ongoing** or **past**. The label is never hard-coded — it is worked out from the start and end dates on every read. This article explains the system using the live dataset, last updated ${f.lastUpdated.slice(0, 10)}.

## The three labels

- **Upcoming** — the start date is still in the future. The organizer has opened registration but teams have not begun.
- **Ongoing** — the event has started and has not ended yet. Teams are building and submitting.
- **Past** — the event has ended. Prizes and winners may already be published.

At the last update: **${total} ${total === 1 ? "event" : "events"}** total.

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

Check the dates before the labels: the status is correct by construction, but timezones mean your own "today" can differ from the organizer's. [Filter by status](/hackathons) to browse, then open the event page to confirm the schedule in your own timezone.

${sourceFooter(f)}`;
    },
  },
];

export { TEMPLATES };

/**
 * Rotating, data-first topic selector: the first template in the rotated order
 * whose data actually suffices wins. Nothing passes on a thin day — the caller
 * skips publication then.
 */
export function selectTopic(facts: Facts, index: number): Template | null {
  const base = ((index % TEMPLATES.length) + TEMPLATES.length) % TEMPLATES.length;
  const ordered = TEMPLATES.slice(base).concat(TEMPLATES.slice(0, base));
  return ordered.find((template) => template.fits(facts)) ?? null;
}

/**
 * Fact-check gate. Collects every money figure the dataset actually holds and
 * verifies that every figure rendered in the body resolves to one of them.
 * Returns a list of problems; an empty list means the article can publish.
 * This is the unsupported-claim block: anything not backed by the dataset is
 * flagged and the generator refuses to write.
 */
export function verifyFigures(body: string, hackathons: Hackathon[]): string[] {
  const dataset = new Set<string>();
  const addMoney = (value: number | undefined) => {
    if (value !== undefined && Number.isFinite(value)) dataset.add(String(value));
  };
  for (const h of hackathons) {
    addMoney(h.totalPrizeUsd);
    addMoney(h.cashPrizeUsd);
    addMoney(h.creditPrizeUsd);
    addMoney(h.claimedPrizeUsd);
    for (const p of h.prizes) addMoney(p.amount);
  }

  const problems: string[] = [];
  const text = body.replace(/^(#{1,6}\s*|\s*\d+\.\s*)/gm, "");
  const moneyPattern = /\$\s?\d{1,3}(?:,\d{3})+|\$\s?\d+(?:\.\d+)?/g;
  for (const match of text.matchAll(moneyPattern)) {
    const raw = match[0].replace(/[\s$,]/g, "");
    if (!dataset.has(raw)) {
      problems.push(`figure ${match[0]} is not a value in the dataset`);
    }
  }
  return problems;
}