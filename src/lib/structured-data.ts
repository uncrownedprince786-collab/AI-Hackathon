import type { Hackathon, HackathonStatus, Winner } from "@/lib/types";
import { absoluteUrl } from "@/lib/seo";
import { formatCurrency, formatDate, formatUsdLong, modeLabel } from "@/lib/format";

export function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "AI Hackathons",
    alternateName: "AI Hackathon Directory",
    url: absoluteUrl("/"),
    description:
      "All AI hackathons in one place. Prizes, winners, dates and upcoming AI hackathon events.",
    inLanguage: "en",
    publisher: {
      "@type": "Organization",
      name: "AI Hackathons",
      url: absoluteUrl("/"),
    },
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${absoluteUrl("/hackathons")}?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "AI Hackathons",
    url: absoluteUrl("/"),
    logo: absoluteUrl("/logo.svg"),
    description:
      "A public, no-login directory of AI hackathons with prize pools, dates and winners.",
  };
}

export function eventJsonLd(hackathon: Hackathon) {
  const isPast = hackathon.status === "past";

  const event: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: hackathon.name,
    url: absoluteUrl(`/hackathons/${hackathon.slug}`),
    description: hackathon.description,
    startDate: hackathon.startDate,
    endDate: hackathon.endDate,
    eventStatus: isPast
      ? "https://schema.org/EventCompleted"
      : "https://schema.org/EventScheduled",
    eventAttendanceMode:
      hackathon.mode === "online"
        ? "https://schema.org/OnlineEventAttendanceMode"
        : hackathon.mode === "hybrid"
          ? "https://schema.org/MixedEventAttendanceMode"
          : "https://schema.org/OfflineEventAttendanceMode",
    organizer: {
      "@type": "Organization",
      name: hackathon.organizer,
      ...(hackathon.officialUrl ? { url: hackathon.officialUrl } : {}),
    },
    ...(hackathon.totalPrizeUsd > 0 || hackathon.claimedPrize
      ? {
          offers: {
            "@type": "Offer",
            price: "0",
            priceCurrency: "USD",
            availability: "https://schema.org/InStock",
            url: hackathon.officialUrl || absoluteUrl(`/hackathons/${hackathon.slug}`),
            description:
              hackathon.totalPrizeUsd > 0
                ? `${formatUsdLong(hackathon.totalPrizeUsd)} total prize pool`
                : `${formatCurrency(hackathon.claimedPrize!.amount, hackathon.claimedPrize!.currency)} total prize pool`,
          },
        }
      : {}),
    ...(hackathon.imageUrl ? { image: [hackathon.imageUrl] } : {}),
    ...(hackathon.location
      ? {
          location: {
            "@type": hackathon.mode === "online" ? "VirtualLocation" : "Place",
            ...(hackathon.mode === "online"
              ? { url: hackathon.officialUrl }
              : { name: hackathon.location, address: hackathon.location }),
          },
        }
      : {}),
  };

  return event;
}

export function itemListJsonLd(
  hackathons: Hackathon[],
  { name, path }: { name: string; path: string },
) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    url: absoluteUrl(path),
    numberOfItems: hackathons.length,
    itemListElement: hackathons.slice(0, 100).map((h, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: absoluteUrl(`/hackathons/${h.slug}`),
      name: h.name,
    })),
  };
}

export function faqJsonLd(items: { question: string; answer: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
}

export function breadcrumbJsonLd(trail: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export function winnerJsonLd(hackathon: Hackathon, winner: Winner) {
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: (winner.team ?? []).join(", ") || winner.project,
    ...(winner.url ? { url: winner.url } : {}),
    ...(winner.prize
      ? {
          award: `${winner.prize} - ${hackathon.name} (${formatDate(hackathon.endDate)})`,
        }
      : {}),
  };
}

export function datasetJsonLd(counts: Record<HackathonStatus, number>, totalPrizeUsd: number) {
  return {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: "AI Hackathons dataset",
    description:
      "Public dataset of AI hackathons with prize pools, dates, organizers and winners.",
    url: absoluteUrl("/methodology"),
    creator: { "@type": "Organization", name: "AI Hackathons" },
    isAccessibleForFree: true,
    license: "https://creativecommons.org/licenses/by/4.0/",
    distribution: {
      "@type": "DataDownload",
      encodingFormat: "application/json",
      contentUrl: absoluteUrl("/api/data"),
    },
    variableMeasured: [
      { "@type": "PropertyValue", name: "Total hackathons", value: String(counts.upcoming + counts.ongoing + counts.past) },
      { "@type": "PropertyValue", name: "Total prize money", value: formatUsdLong(totalPrizeUsd) },
    ],
  };
}

export { modeLabel };
