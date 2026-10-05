import { NextResponse } from "next/server";
import { getDataset } from "@/lib/hackathons";

export const revalidate = 21600;

/** The whole dataset as JSON. No key, no login. */
export async function GET() {
  const dataset = await getDataset();

  return NextResponse.json(
    {
      meta: dataset.meta,
      hackathons: dataset.hackathons.map((h) => ({
        id: h.id,
        slug: h.slug,
        name: h.name,
        description: h.description,
        status: h.status,
        mode: h.mode,
        organizer: h.organizer,
        startDate: h.startDate,
        endDate: h.endDate,
        registrationDeadline: h.registrationDeadline,
        location: h.location,
        prizes: h.prizes,
        totalPrizeUsd: h.totalPrizeUsd,
        cashPrizeUsd: h.cashPrizeUsd,
        creditPrizeUsd: h.creditPrizeUsd,
        winners: h.winners,
        tags: h.tags,
        officialUrl: h.officialUrl,
        sourceUrl: h.sourceUrl,
        sourceName: h.sourceName,
        participants: h.participants,
        url: `/hackathons/${h.slug}`,
      })),
    },
    {
      headers: {
        "cache-control": "public, max-age=0, s-maxage=21600, stale-while-revalidate=86400",
        "access-control-allow-origin": "*",
      },
    },
  );
}
