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
  location?: string;
  timezone?: string;
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
  error?: string;
}

export interface DatasetMeta {
  lastUpdated: string;
  cronSchedule: string;
  total: number;
  counts: Record<HackathonStatus, number>;
  sources: SourceStatus[];
  totalPrizeUsd: number;
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
