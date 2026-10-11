export type HackathonStatus = "upcoming" | "ongoing" | "past";

export type HackathonMode = "online" | "in-person" | "hybrid";

export type PrizeType = "cash" | "credits" | "other";

export interface Prize {
  /** Amount in `currency` units. `credits` prizes are converted to a USD estimate. */
  amount: number;
  currency: string;
  type: PrizeType;
  label: string;
  sponsors?: string[];
}

export interface Winner {
  rank?: number;
  project: string;
  /** One line on what the project does, taken from the organizer's own page. */
  summary?: string;
  team?: string[];
  organization?: string;
  url?: string;
  prize?: string;
}

export interface Hackathon {
  id: string;
  slug: string;
  name: string;
  description: string;
  status: HackathonStatus;
  mode: HackathonMode;
  organizer: string;
  startDate: string;
  endDate: string;
  registrationDeadline?: string;
  /** Set when the organizer states a total pool but publishes no itemised list. */
  claimedPrizeUsd?: number;
  /** Headline pool in another currency (€, £, ₹, …). Kept as-is; never converted. */
  claimedPrize?: { amount: number; currency: string };
  /** False when only a headline pool figure is known (no cash/credits split). */
  prizeBreakdownPublished?: boolean;
  /** "closed" when the source page says registration or submissions are closed. */
  registrationStatus?: "open" | "closed";
  /** True when the organizer has announced winners (names may live on their page). */
  winnersAnnounced?: boolean;
  location?: string;
  timezone?: string;
  /** Country or region taken from the organizer's own location text. */
  country?: string;
  prizes: Prize[];
  totalPrizeUsd: number;
  cashPrizeUsd: number;
  creditPrizeUsd: number;
  winners: Winner[];
  tags: string[];
  officialUrl: string;
  sourceUrl: string;
  sourceName: string;
  sourceId: string;
  imageUrl?: string;
  participants?: number;
  submissions?: number;
  featured?: boolean;
  invitedOnly?: boolean;
  firstSeenAt: string;
  updatedAt: string;
}

export interface SourceStatus {
  name: string;
  url: string;
  ok: boolean;
  fetched: number;
  /** When this source last produced data. Absent = never succeeded. */
  lastOkAt?: string;
  error?: string;
}

/**
 * A source that is no longer collected on a schedule. Kept in the meta so a
 * historical source can never read as "active but silently stale": it appears
 * here with a retiredAt timestamp and the reason, while any records it
 * produced stay in the dataset under its own name.
 */
export interface RetiredSourceStatus {
  name: string;
  url?: string;
  /** Always false after retirement: the entry documents history, not activity. */
  ok: boolean;
  fetched: number;
  /** When this site last produced data while it was still collected. */
  lastOkAt?: string;
  /** When the last collected draft batch for this site was written. */
  lastCollectedAt?: string;
  /** When the source was retired from the scheduled pipeline. */
  retiredAt: string;
  reason?: string;
  error?: string;
}

export interface DatasetMeta {
  lastUpdated: string;
  cronSchedule: string;
  total: number;
  counts: Record<HackathonStatus, number>;
  /** Sources that are actively collected on the schedule. */
  sources: SourceStatus[];
  /** Sources retired from the schedule, documented so they are not shown as stale-active. */
  retiredSources?: RetiredSourceStatus[];
  totalPrizeUsd: number;
  /** Global coverage, read from the location text organizers publish. */
  countries?: { country: string; count: number }[];
  regions?: { region: string; count: number }[];
}

export interface Dataset {
  meta: DatasetMeta;
  hackathons: Hackathon[];
}

export interface Submission {
  name: string;
  organizer: string;
  officialUrl: string;
  startDate: string;
  endDate: string;
  prizePool: string;
  mode: HackathonMode;
  email?: string;
  notes?: string;
  submittedAt: string;
}
