import { promises as fs } from "node:fs";
import path from "node:path";
import type { Dataset, Submission } from "./types";

const DATA_DIR = path.join(process.cwd(), "src", "data");
const DATASET_FILE = path.join(DATA_DIR, "hackathons.json");
const SUBMISSIONS_FILE = path.join(DATA_DIR, "submissions.json");

export const CACHE_TAG = "hackathons";

export function hasSupabase(): boolean {
  return Boolean(
    process.env.SUPABASE_URL &&
      (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  );
}

/** Writing needs the service role key; the anon key can only read. */
export function canWriteSupabase(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

interface SupabaseResult<T> {
  ok: boolean;
  data: T | null;
}

async function supabaseRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<SupabaseResult<T>> {
  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return { ok: false, data: null };

  try {
    const res = await fetch(`${url}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
      cache: "no-store",
    });
    if (!res.ok) {
      console.error(`[supabase] ${res.status} ${res.statusText} on ${path}`);
      return { ok: false, data: null };
    }
    if (res.status === 204) return { ok: true, data: null };
    return { ok: true, data: (await res.json()) as T };
  } catch (error) {
    console.error("[supabase] request failed", error);
    return { ok: false, data: null };
  }
}

async function readJsonFile<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJsonFile(file: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export const emptyMeta = {
  lastUpdated: new Date(0).toISOString(),
  cronSchedule: "0 */6 * * *",
  total: 0,
  counts: { upcoming: 0, ongoing: 0, past: 0 } as Record<string, number>,
  sources: [],
  totalPrizeUsd: 0,
};

export async function readDataset(): Promise<Dataset> {
  if (hasSupabase()) {
    const { ok, data } = await supabaseRequest<{ data: Dataset }[]>(
      "hackathons?select=data&order=updated_at.desc&limit=1",
    );
    if (ok && data && data.length > 0 && data[0]?.data) {
      return data[0].data;
    }
  }
  return readJsonFile<Dataset>(DATASET_FILE, { meta: emptyMeta, hackathons: [] });
}

export type StorageTarget = "supabase" | "json" | "none";

export async function writeDataset(dataset: Dataset): Promise<StorageTarget> {
  if (canWriteSupabase()) {
    const { data: existing } = await supabaseRequest<{ id: number }[]>(
      "hackathons?select=id&limit=1",
    );
    const headers = { Prefer: "return=minimal" };
    const body = JSON.stringify({ data: dataset });

    if (existing && existing.length > 0) {
      const { ok } = await supabaseRequest(`hackathons?id=eq.${existing[0].id}`, {
        method: "PATCH",
        headers,
        body,
      });
      if (ok) return "supabase";
    } else {
      const { ok } = await supabaseRequest("hackathons", { method: "POST", headers, body });
      if (ok) return "supabase";
    }
  }

  try {
    await writeJsonFile(DATASET_FILE, dataset);
    return "json";
  } catch (error) {
    // Production filesystems are read-only, so this is expected without Supabase.
    console.error(
      "[store] could not write hackathons.json; set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to persist refreshes",
      (error as Error).message,
    );
    return "none";
  }
}

export async function readSubmissions(): Promise<Submission[]> {
  if (hasSupabase()) {
    const { ok, data } = await supabaseRequest<Submission[]>(
      "submissions?select=*&order=submitted_at.desc&limit=200",
    );
    if (ok && data) return data;
  }
  return readJsonFile<Submission[]>(SUBMISSIONS_FILE, []);
}

export async function writeSubmission(submission: Submission): Promise<StorageTarget> {
  if (canWriteSupabase()) {
    const { ok } = await supabaseRequest("submissions", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        name: submission.name,
        organizer: submission.organizer,
        official_url: submission.officialUrl,
        start_date: submission.startDate,
        end_date: submission.endDate,
        prize_pool: submission.prizePool,
        mode: submission.mode,
        email: submission.email ?? null,
        notes: submission.notes ?? null,
        submitted_at: submission.submittedAt,
      }),
    });
    if (ok) return "supabase";
  }

  try {
    const all = await readSubmissions();
    all.unshift(submission);
    await writeJsonFile(SUBMISSIONS_FILE, all.slice(0, 200));
    return "json";
  } catch (error) {
    console.error(
      "[store] could not write submissions.json; set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to accept submissions in production",
      (error as Error).message,
    );
    return "none";
  }
}
