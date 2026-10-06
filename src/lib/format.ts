import type { Hackathon, HackathonMode, HackathonStatus, Prize } from "./types";
import { extractClaimedPool } from "./sources/ai-signals";

const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function parts(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return { y, m: m - 1, d };
}

/** "12 Mar 2026" */
export function formatDate(iso: string): string {
  if (!iso) return "TBC";
  const { y, m, d } = parts(iso);
  if (Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d)) return "TBC";
  return `${d} ${MONTHS_SHORT[m]} ${y}`;
}

/** "12 March 2026" */
export function formatDateLong(iso: string): string {
  if (!iso) return "To be confirmed";
  const { y, m, d } = parts(iso);
  if (Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d)) return "To be confirmed";
  return `${d} ${MONTHS_LONG[m]} ${y}`;
}

export function formatDateRange(start: string, end: string): string {
  if (start === end) return formatDate(start);
  const a = parts(start);
  const b = parts(end);
  if (a.y === b.y && a.m === b.m) {
    return `${a.d}-${b.d} ${MONTHS_SHORT[b.m]} ${b.y}`;
  }
  return `${formatDate(start)} - ${formatDate(end)}`;
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function daysUntil(iso: string, from = todayIso()): number {
  const target = Date.parse(`${iso}T00:00:00Z`);
  const base = Date.parse(`${from}T00:00:00Z`);
  if (Number.isNaN(target) || Number.isNaN(base)) return 0;
  return Math.round((target - base) / 86_400_000);
}

/** "$1,250" or "$1.25M" */
export function formatUsd(amount: number): string {
  if (!amount || amount <= 0) return "$0";
  if (amount >= 1_000_000) {
    const m = amount / 1_000_000;
    return `$${m >= 10 ? Math.round(m) : Math.round(m * 100) / 100}M`;
  }
  if (amount >= 1_000) return `$${Math.round(amount).toLocaleString("en-US")}`;
  return `$${Math.round(amount)}`;
}

export function formatUsdLong(amount: number): string {
  if (!amount || amount <= 0) return "$0";
  return `$${Math.round(amount).toLocaleString("en-US")}`;
}

export function formatCount(value: number): string {
  if (!value || value <= 0) return "0";
  if (value >= 1_000_000) return `${Math.round(value / 100_000) / 10}M`;
  if (value >= 1_000) return `${Math.round(value / 100) / 10}K`;
  return String(Math.round(value));
}

export const statusLabels: Record<HackathonStatus, string> = {
  ongoing: "Ongoing now",
  upcoming: "Upcoming",
  past: "Past",
};

export const modeLabels: Record<HackathonMode, string> = {
  online: "Online",
  "in-person": "In-person",
  hybrid: "Hybrid",
};

export function statusLabel(status: HackathonStatus): string {
  return statusLabels[status];
}

export function modeLabel(mode: HackathonMode): string {
  return modeLabels[mode];
}

/** "in 12 days" / "today" / "3 days ago" */
export function relativeDay(iso: string): string {
  const diff = daysUntil(iso);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff === -1) return "yesterday";
  if (diff > 0) return `in ${diff} days`;
  return `${Math.abs(diff)} days ago`;
}

export function deadlineText(h: Hackathon): string {
  if (h.status === "past") return `Ended ${formatDate(h.endDate)}`;
  if (h.status === "ongoing") {
    const left = daysUntil(h.registrationDeadline ?? h.endDate);
    if (left <= 0) return "Closed now";
    return `Closes ${relativeDay(h.registrationDeadline ?? h.endDate)}`;
  }
  return `Starts ${relativeDay(h.startDate)}`;
}

/** "$500k" style, for tight spots like cards and badges. */
export function formatPrize(value: number): string {
  if (!value || value <= 0) return "$0";
  if (value >= 1_000_000) {
    const m = value / 1_000_000;
    return `$${m >= 10 ? Math.round(m) : Number(m.toFixed(1))}M`;
  }
  if (value >= 10_000) {
    const k = value / 1_000;
    return `$${k >= 100 ? Math.round(k) : Number(k.toFixed(1))}k`;
  }
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

export interface PrizeSummary {
  /** Total pool, from the itemised list or the organizer's headline figure. */
  totalUsd: number;
  cashUsd: number;
  creditUsd: number;
  /** True when cash and credits are itemised, false for a headline figure only. */
  breakdownPublished: boolean;
  /** Short label, e.g. "$500k total pool" or "$200k cash + $300k credits". */
  label: string;
  /** True when the organizer states a pool but publishes no cash/credits split. */
  claimedOnly: boolean;
}

/**
 * A lot of organizers publish only a headline pool ("$400,000 in prizes") without
 * itemising it, so we never show "no cash prize" when a pool is stated. Instead we
 * say the pool is announced and mark that the breakdown is not published.
 */
export function prizeSummary(h: Hackathon): PrizeSummary {
  const cashUsd = h.cashPrizeUsd ?? 0;
  const creditUsd = h.creditPrizeUsd ?? 0;
  const breakdownPublished = h.prizeBreakdownPublished ?? cashUsd > 0;

  // Safety net: if the record has no figure yet but the organizer's own title or
  // description states a pool, show that pool. We never say "no prize" when the
  // source clearly mentions money.
  const statedInText = h.totalPrizeUsd ? 0 : extractClaimedPool(h.name, h.description);
  const totalUsd = Math.max(h.totalPrizeUsd ?? 0, h.claimedPrizeUsd ?? 0, statedInText);
  const claimedOnly = totalUsd > 0 && (h.claimedPrizeUsd ?? 0) + statedInText > (h.totalPrizeUsd ?? 0);

  if (!totalUsd) {
    return {
      totalUsd: 0,
      cashUsd,
      creditUsd,
      breakdownPublished,
      label: "No prize pool published",
      claimedOnly: false,
    };
  }
  if (claimedOnly) {
    return {
      totalUsd,
      cashUsd,
      creditUsd,
      breakdownPublished,
      label: `${formatPrize(totalUsd)} total pool`,
      claimedOnly: true,
    };
  }
  if (breakdownPublished && cashUsd > 0 && creditUsd > 0) {
    return {
      totalUsd,
      cashUsd,
      creditUsd,
      breakdownPublished,
      label: `${formatPrize(cashUsd)} cash + ${formatPrize(creditUsd)} credits`,
      claimedOnly: false,
    };
  }
  if (breakdownPublished && cashUsd > 0) {
    return { totalUsd, cashUsd, creditUsd, breakdownPublished, label: `${formatPrize(cashUsd)} cash`, claimedOnly: false };
  }
  if (breakdownPublished && creditUsd > 0) {
    return { totalUsd, cashUsd, creditUsd, breakdownPublished, label: `${formatPrize(creditUsd)} in credits`, claimedOnly: false };
  }
  return {
    totalUsd,
    cashUsd,
    creditUsd,
    breakdownPublished,
    label: `${formatPrize(totalUsd)} total pool`,
    claimedOnly: true,
  };
}

export interface ApplicationStatus {
  isOpen: boolean;
  /** Short badge text. */
  label: string;
  /** Sentence used on detail pages and in FAQ answers. */
  detail: string;
  /** ISO date the deadline falls on, when known. */
  deadline?: string;
}

/**
 * An event can still be running after registration closes, so "ongoing" and
 * "applications open" are different things.
 */
export function applicationStatus(h: Hackathon, today = todayIso()): ApplicationStatus {
  const deadline = h.registrationDeadline ?? h.endDate;
  const passed = deadline ? deadline < today : false;
  const statedClosed = h.registrationStatus === "closed";

  if (h.status === "past") {
    return { isOpen: false, label: "Closed", detail: `Submissions closed on ${deadline ?? h.endDate}.`, deadline };
  }
  if (statedClosed || passed) {
    return {
      isOpen: false,
      label: "Applications closed",
      detail: `Registration is closed; the submission deadline was ${deadline ?? h.endDate}.`,
      deadline,
    };
  }
  return {
    isOpen: true,
    label: "Applications open",
    detail: `Applications are open until ${deadline ?? h.endDate}.`,
    deadline,
  };
}

/** Whole days until the submission deadline. Negative once it has passed. */
export function daysUntilDeadline(h: Hackathon, today = todayIso()): number | undefined {
  const deadline = h.registrationDeadline ?? h.endDate;
  if (!deadline) return undefined;
  return daysUntil(deadline, today);
}

/** Short countdown: "closes today", "closes in 6 days", "closed 3 days ago". */
export function countdownText(h: Hackathon, today = todayIso()): string {
  if (h.status === "past") return `Ended ${formatDate(h.endDate)}`;
  const left = daysUntilDeadline(h, today);
  if (left === undefined) return "Deadline not published";
  if (left < 0) return "Applications closed";
  if (left === 0) return "Closes today";
  if (left === 1) return "Closes tomorrow";
  return `Closes in ${left} days`;
}

/** When this event's data was last read from its source page. */
export function verifiedLabel(h: Hackathon, now = new Date()): string {
  const stamp = Date.parse(h.updatedAt || h.firstSeenAt || "");
  if (Number.isNaN(stamp)) return "Recently checked";
  const days = Math.max(0, Math.round((now.getTime() - stamp) / 86_400_000));
  if (days === 0) return "Verified today";
  if (days === 1) return "Verified yesterday";
  if (days < 30) return `Verified ${days} days ago`;
  if (days < 365) {
    const months = Math.round(days / 30);
    return `Verified ${months} month${months === 1 ? "" : "s"} ago`;
  }
  return `Verified ${formatDate(h.updatedAt.slice(0, 10))}`;
}

export function prizeParts(h: Hackathon): { cash: number; credits: number; other: number } {
  let cash = 0;
  let credits = 0;
  let other = 0;
  for (const p of h.prizes) {
    if (p.type === "cash") cash += p.amount;
    else if (p.type === "credits") credits += p.amount;
    else other += p.amount;
  }
  return { cash, credits, other };
}

export function prizeTypeLabel(prize: Prize): string {
  if (prize.type === "cash") return "Cash";
  if (prize.type === "credits") return "Credits";
  return "Other";
}

export function toIsoDate(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : new Date(trimmed).toISOString().slice(0, 10);
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

export function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trimEnd()}…`;
}
