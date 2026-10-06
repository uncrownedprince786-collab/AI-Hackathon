import type { Metadata } from "next";
import { ArrowUpRight, CalendarDays, Globe, MapPin, Video } from "lucide-react";
import { getAiEvents, type AiEvent } from "@/lib/events";
import { JsonLd } from "@/components/json-ld";
import { Breadcrumbs, PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { buildMetadata, absoluteUrl } from "@/lib/seo";
import { formatDate } from "@/lib/format";

export const revalidate = 21600;

export const metadata: Metadata = buildMetadata({
  title: "AI Events — Conferences, Meetups, Summits and Workshops",
  description:
    "Upcoming AI events around the world: conferences, meetups, summits and workshops, with dates, format and the official page.",
  path: "/events",
  keywords: [
    "ai events",
    "ai conferences 2026",
    "machine learning meetups",
    "ai summits",
    "ai workshops",
  ],
});

const MODE_LABEL: Record<AiEvent["mode"], string> = {
  online: "Online",
  "in-person": "In person",
  hybrid: "Hybrid",
};

function monthLabel(iso: string): string {
  const [year, month] = iso.split("-");
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

export default async function EventsPage() {
  const { events, sources } = await getAiEvents();

  const grouped = new Map<string, AiEvent[]>();
  for (const event of events) {
    const key = monthLabel(event.startDate);
    const list = grouped.get(key) ?? [];
    list.push(event);
    grouped.set(key, list);
  }

  const online = events.filter((e) => e.mode !== "in-person").length;

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: "Upcoming AI events",
          url: absoluteUrl("/events"),
          numberOfItems: events.length,
          itemListElement: events.slice(0, 50).map((event, index) => ({
            "@type": "ListItem",
            position: index + 1,
            item: {
              "@type": "Event",
              name: event.name,
              startDate: event.startDate,
              endDate: event.endDate ?? event.startDate,
              url: event.url,
              eventAttendanceMode:
                event.mode === "online"
                  ? "https://schema.org/OnlineEventAttendanceMode"
                  : event.mode === "hybrid"
                    ? "https://schema.org/MixedEventAttendanceMode"
                    : "https://schema.org/OfflineEventAttendanceMode",
            },
          })),
        }}
      />

      <PageHeader
        eyebrow="Beyond hackathons"
        title="AI events"
        description="Conferences, meetups, summits and workshops about AI, machine learning and generative AI. Separate from our hackathon list, with the official page for every event."
        stats={[
          { label: "Upcoming events", value: String(events.length) },
          { label: "Online friendly", value: String(online) },
          { label: "Sources checked", value: String(sources.filter((s) => s.ok).length) },
        ]}
      />

      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <Breadcrumbs trail={[{ name: "AI events", path: "/events" }]} />

        {events.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-6 py-16 text-center">
            <Globe className="mx-auto size-6 text-muted-foreground" aria-hidden="true" />
            <p className="mt-3 font-medium">No events loaded right now</p>
            <p className="mt-1 text-sm text-muted-foreground">
              The event source did not answer. Try again later, or open the source directly.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {sources.map((source) => (
                <a
                  key={source.url}
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-primary"
                >
                  {source.name}
                  <ArrowUpRight className="size-3.5" aria-hidden="true" />
                </a>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-10">
            {[...grouped.entries()].map(([month, monthEvents]) => (
              <section key={month}>
                <div className="flex items-baseline gap-3">
                  <h2 className="text-xl font-bold tracking-tight">{month}</h2>
                  <span className="text-sm text-muted-foreground">
                    {monthEvents.length} event{monthEvents.length === 1 ? "" : "s"}
                  </span>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  {monthEvents.map((event) => (
                    <article
                      key={event.id}
                      className="group flex flex-col gap-3 rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={event.mode === "online" ? "ongoing" : "outline"}>
                          {event.mode === "online" ? (
                            <Video aria-hidden="true" />
                          ) : (
                            <MapPin aria-hidden="true" />
                          )}
                          {MODE_LABEL[event.mode]}
                        </Badge>
                        <Badge variant="outline">
                          <CalendarDays aria-hidden="true" />
                          {event.endDate
                            ? `${formatDate(event.startDate)} – ${formatDate(event.endDate)}`
                            : formatDate(event.startDate)}
                        </Badge>
                      </div>

                      <div>
                        <h3 className="text-base font-semibold leading-snug tracking-tight">
                          <a
                            href={event.url}
                            target="_blank"
                            rel="noopener noreferrer nofollow"
                            className="hover:text-primary"
                          >
                            {event.name}
                          </a>
                        </h3>
                        {event.location ? (
                          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                            <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
                            {event.location}
                          </p>
                        ) : null}
                      </div>

                      {event.description ? (
                        <p className="text-sm leading-relaxed text-muted-foreground">
                          {event.description}
                        </p>
                      ) : null}

                      <a
                        href={event.url}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="mt-auto inline-flex w-fit items-center gap-1 text-xs font-medium text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
                      >
                        Official page
                        <ArrowUpRight className="size-3" aria-hidden="true" />
                      </a>
                    </article>
                  ))}
                </div>
              </section>
            ))}

            <p className="text-xs text-muted-foreground">
              Events are read from public event listings and grouped by month. Dates and links
              belong to the organizer.{" "}
              {sources.some((s) => s.ok) ? (
                <a
                  href={sources.find((s) => s.ok)?.url ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="underline underline-offset-4 hover:text-primary"
                >
                  See the source listing
                </a>
              ) : null}
            </p>
          </div>
        )}
      </div>
    </>
  );
}
