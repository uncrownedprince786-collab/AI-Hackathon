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

export type LlmProvider = "groq" | "gemini";

export interface LlmReview {
  /** Free-text provider id, e.g. "groq:llama-3.3-70b-versatile". */
  model: string;
  at: string;
  /** Hash of the reviewed text, so unchanged events are never re-billed. */
  hash: string;
  keep: boolean;
  reason: string;
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
  /** Behind-the-scenes AI check, kept so the site can explain how data is verified. */
  llmReview?: LlmReview;
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
  /** Global coverage, read from the location text organizers publish. */
  countries?: { country: string; count: number }[];
  regions?: { region: string; count: number }[];
  /** Result of the behind-the-scenes AI accuracy check, when it ran. */
  aiReview?: {
    provider: string;
    model: string;
    at: string;
    reviewed: number;
    rejected: number;
    fixed: number;
    /** Records the check removed because they were not AI events or were incomplete. */
    dropped?: number;
  };
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
