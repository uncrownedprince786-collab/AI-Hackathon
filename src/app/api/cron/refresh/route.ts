import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { refreshDataset, revalidationTags } from "@/lib/collector";
import { CACHE_TAG } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Vercel Cron entry point. Reads public sources, saves the dataset, and drops the
 * ISR cache so every page picks up the new numbers.
 */
export async function GET(request: Request) {
  const started = Date.now();
  const secret = process.env.CRON_SECRET;

  if (secret) {
    const header = request.headers.get("authorization");
    const provided = header?.replace(/^Bearer\s+/i, "") ?? request.headers.get("x-cron-secret");
    if (provided !== secret) {
      return NextResponse.json({ message: "Not authorized." }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { message: "CRON_SECRET is not set." },
      { status: 500 },
    );
  }

  try {
    const result = await refreshDataset({
      pages: Number(process.env.REFRESH_PAGES ?? 8),
      detailLimit: Number(process.env.REFRESH_DETAIL_LIMIT ?? 240),
    });

    revalidateTag(CACHE_TAG);
    for (const path of [
      "/",
      "/hackathons",
      "/upcoming",
      "/ongoing",
      "/past",
      "/winners",
      "/events",
    ]) {
      revalidatePath(path);
    }

    return NextResponse.json(
      {
        ok: result.writtenTo !== "none",
        total: result.dataset.hackathons.length,
        counts: result.dataset.meta.counts,
        totalPrizeUsd: result.dataset.meta.totalPrizeUsd,
        sources: result.dataset.meta.sources,
        added: result.added,
        updated: result.updated,
        removed: result.removed,
        storage: result.writtenTo,
        warning:
          result.writtenTo === "none"
            ? "Nothing was saved: the filesystem is read-only and SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY are not set."
            : undefined,
        tags: revalidationTags(),
        durationMs: Date.now() - started,
      },
      { status: result.writtenTo === "none" ? 503 : 200 },
    );
  } catch (error) {
    console.error("[cron] refresh failed", error);
    return NextResponse.json(
      { message: "Refresh failed.", error: (error as Error).message },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  return GET(request);
}
