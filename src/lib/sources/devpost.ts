import * as cheerio from "cheerio";
import {
  classifyPrize,
  isAiRelevant,
  parsePeriodDates,
  parsePrizeAmount,
} from "./ai-signals";
import type { Hackathon, Prize, Winner } from "../types";

const API = "https://devpost.com/api/hackathons";
const UA =
  "Mozilla/5.0 (compatible; AIHackathonsBot/1.0; +https://ai-hackathons.vercel.app)";

export interface DevpostListItem {
  id: number;
  title: string;
  url: string;
  open_state: "open" | "upcoming" | "ended";
  displayed_location: { icon: string; location: string };
  submission_period_dates?: string;
  prize_amount?: string;
  prizes_counts?: { cash: number; other: number };
  registrations_count?: number;
  organization_name?: string;
  winners_announced?: boolean;
  thumbnail_url?: string;
  featured?: boolean;
  invite_only?: boolean;
  themes: { id: number; name: string }[];
}

export interface FetchOptions {
  pages?: number;
  perPage?: number;
  signal?: AbortSignal;
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    signal,
    headers: { accept: "application/json", "user-agent": UA },
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return (await res.json()) as T;
}

async function getHtml(url: string, signal?: AbortSignal): Promise<string> {
  const res = await fetch(url, {
    signal,
    headers: {
      "user-agent": UA,
      accept: "text/html,application/xhtml+xml",
    },
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.text();
}

export async function fetchDevpostList(
  status: "open" | "upcoming" | "ended",
  options: FetchOptions = {},
): Promise<DevpostListItem[]> {
  const pages = options.pages ?? 4;
  const perPage = options.perPage ?? 50;
  const out: DevpostListItem[] = [];

  for (let page = 1; page <= pages; page += 1) {
    const url = `${API}?status[]=${status}&page=${page}&per_page=${perPage}`;
    let payload: { hackathons?: DevpostListItem[] };
    try {
      payload = await getJson<{ hackathons?: DevpostListItem[] }>(url, options.signal);
    } catch {
      break;
    }
    const items = payload.hackathons ?? [];
    if (items.length === 0) break;
    out.push(...items);
    if (items.length < perPage) break;
    await sleep(250);
  }

  return out;
}

export interface DevpostDetail {
  description: string;
  tagline?: string;
  prizes: Prize[];
  winners: Winner[];
  mode: Hackathon["mode"];
  location?: string;
  participants?: number;
  submissions?: number;
  organizer?: string;
  invitedOnly?: boolean;
}

function clean(text: string | undefined | null): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

function detectMode(location: string | undefined, icon: string | undefined) {
  const loc = (location ?? "").toLowerCase();
  const ic = (icon ?? "").toLowerCase();
  const online = ic.includes("globe") || loc.includes("online") || loc.includes("internet");
  if (online && (loc.includes(" and ") || loc.includes("hybrid"))) return "hybrid" as const;
  if (online) return "online" as const;
  if (loc.includes(" and ")) return "hybrid" as const;
  return "in-person" as const;
}

function absolute(url: string | undefined): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("//")) return `https:${url}`;
  if (url.startsWith("/")) return `https://devpost.com${url}`;
  return url;
}

export async function fetchDevpostDetail(
  hackathonUrl: string,
  signal?: AbortSignal,
): Promise<DevpostDetail> {
  const html = await getHtml(hackathonUrl, signal);
  const $ = cheerio.load(html);

  const description = clean(
    $("article#challenge-description")
      .text()
      .replace(/About the challenge\s*/i, ""),
  ).slice(0, 1400);

  const tagline = clean($("#introduction h1").first().nextAll("h3").first().text()) || undefined;

  const locationText = clean(
    $("#challenge-information .fa-map-marker-alt").parent().find(".info").first().text(),
  );

  const participantsRaw = clean(
    $("#challenge-information")
      .text()
      .match(/([\d,]+)\s+participants?/i)?.[1],
  );

  const submissionsRaw = clean(
    $("#challenge-information")
      .text()
      .match(/([\d,]+)\s+(?:projects?|submissions?)/i)?.[1],
  );

  const organizer = clean(
    $("#challenge-information .host-label").first().text(),
  ) || undefined;

  const invitedOnly = /invite only/i.test($("#challenge-information").text());

  const prizes: Prize[] = [];
  $("article#prizes .prize").each((_, el) => {
    const node = $(el);
    const label = clean(node.find(".prize-title").text());
    if (!label) return;
    const valueHtml = clean(node.find(".prize-value").html() ?? "");
    const amount = parsePrizeAmount(valueHtml);
    if (amount <= 0) return;
    const detail = clean(node.find(".prize-content").text());
    prizes.push({
      amount,
      currency: "USD",
      type: classifyPrize(detail || label),
      label,
    });
  });

  const winners = extractWinners($);

  return {
    description,
    tagline,
    prizes,
    winners,
    mode: detectMode(locationText, undefined),
    location: locationText || undefined,
    participants: participantsRaw ? Number(participantsRaw.replace(/,/g, "")) : undefined,
    submissions: submissionsRaw ? Number(submissionsRaw.replace(/,/g, "")) : undefined,
    organizer,
    invitedOnly,
  };
}

function extractWinners($: cheerio.CheerioAPI): Winner[] {
  const winners: Winner[] = [];
  const seen = new Set<string>();

  $("article#prizes .prize").each((_, el) => {
    const node = $(el);
    const label = clean(node.find(".prize-title").text());
    if (!/winner|grand prize|first place|1st place/i.test(label)) return;

    const links = node.find(".prize-content a[href]");
    links.each((__, a) => {
      const href = $(a).attr("href");
      const name = clean($(a).text());
      if (!href || !name || seen.has(name)) return;
      if (!/devpost\.com\/software|devpost\.com\/software\//.test(href)) return;
      seen.add(name);
      winners.push({ project: name, url: href, prize: label });
    });

    const text = clean(node.find(".prize-content").text());
    const inline = text.match(/winner[s]?:\s*([^|]{2,120})/i);
    if (inline && !seen.has(inline[1].trim())) {
      seen.add(inline[1].trim());
      winners.push({ project: inline[1].trim(), prize: label });
    }
  });

  return winners.slice(0, 20);
}

export function listItemToHackathon(
  item: DevpostListItem,
  now: Date,
): Hackathon | null {
  const period = parsePeriodDates(item.submission_period_dates, now);
  if (!period) return null;

  const location = clean(item.displayed_location?.location);
  const description = clean(
    `AI hackathon hosted on Devpost by ${item.organization_name ?? "an independent organizer"}.`,
  );

  if (
    !isAiRelevant({
      title: item.title,
      tagline: location,
      description,
      themes: item.themes ?? [],
    })
  ) {
    return null;
  }

  const totalPrizeUsd = parsePrizeAmount(item.prize_amount);
  const nowIso = now.toISOString();

  return {
    id: `devpost-${item.id}`,
    slug: slugify(`${item.title}-${item.id}`),
    name: clean(item.title),
    description,
    status: statusFor(period.startDate, period.endDate, now),
    mode: detectMode(location, item.displayed_location?.icon),
    organizer: clean(item.organization_name) || "Independent",
    startDate: period.startDate,
    endDate: period.endDate,
    registrationDeadline:
      item.open_state === "upcoming" ? undefined : period.endDate,
    location: location || undefined,
    prizes: totalPrizeUsd
      ? [
          {
            amount: totalPrizeUsd,
            currency: "USD",
            type: "cash",
            label: "Total prize pool",
          },
        ]
      : [],
    totalPrizeUsd,
    cashPrizeUsd: totalPrizeUsd,
    creditPrizeUsd: 0,
    winners: [],
    tags: (item.themes ?? []).map((t) => t.name).slice(0, 6),
    officialUrl: item.url,
    sourceUrl: `https://devpost.com/hackathons/${item.id}`,
    sourceName: "Devpost",
    sourceId: String(item.id),
    imageUrl: absolute(item.thumbnail_url),
    participants: item.registrations_count,
    featured: item.featured,
    invitedOnly: item.invite_only,
    firstSeenAt: nowIso,
    updatedAt: nowIso,
  };
}

export function statusFor(
  startDate: string,
  endDate: string,
  now: Date,
): Hackathon["status"] {
  const today = now.toISOString().slice(0, 10);
  if (endDate < today) return "past";
  if (startDate <= today) return "ongoing";
  return "upcoming";
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
