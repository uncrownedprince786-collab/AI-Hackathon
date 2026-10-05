import type { Hackathon, HackathonMode, HackathonStatus, Prize } from "./types";

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

export function prizeSummary(h: Hackathon): string {
  const parts: string[] = [];
  if (h.cashPrizeUsd > 0) parts.push(`${formatUsdLong(h.cashPrizeUsd)} cash`);
  if (h.creditPrizeUsd > 0) parts.push(`${formatUsdLong(h.creditPrizeUsd)} credits`);
  if (parts.length === 0) return "No cash prize listed";
  return parts.join(" + ");
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
