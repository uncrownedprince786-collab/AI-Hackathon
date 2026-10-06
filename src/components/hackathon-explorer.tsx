"use client";

import { useMemo, useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import type { Hackathon, HackathonMode, HackathonStatus } from "@/lib/types";
import { HackathonCard } from "@/components/hackathon-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatUsd } from "@/lib/format";
import { cn } from "@/lib/utils";

type SortKey =
  | "relevance"
  | "prize-desc"
  | "prize-asc"
  | "date-asc"
  | "date-desc"
  | "participants-desc"
  | "newest";

const SORTS: { value: SortKey; label: string }[] = [
  { value: "relevance", label: "Best first" },
  { value: "prize-desc", label: "Prize: high to low" },
  { value: "prize-asc", label: "Prize: low to high" },
  { value: "date-asc", label: "Deadline: soonest" },
  { value: "date-desc", label: "Deadline: latest" },
  { value: "participants-desc", label: "Participants: most" },
  { value: "newest", label: "Recently added" },
];

const STATUSES: { value: HackathonStatus | "all"; label: string }[] = [
  { value: "all", label: "Any status" },
  { value: "ongoing", label: "Ongoing" },
  { value: "upcoming", label: "Upcoming" },
  { value: "past", label: "Past" },
];

const MODES: { value: HackathonMode | "all"; label: string }[] = [
  { value: "all", label: "Any format" },
  { value: "online", label: "Online" },
  { value: "in-person", label: "In-person" },
  { value: "hybrid", label: "Hybrid" },
];

const PAGE_SIZE = 24;

export function HackathonExplorer({
  hackathons,
  initialQuery = "",
  showStatusFilter = true,
}: {
  hackathons: Hackathon[];
  initialQuery?: string;
  showStatusFilter?: boolean;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [status, setStatus] = useState<HackathonStatus | "all">("all");
  const [mode, setMode] = useState<HackathonMode | "all">("all");
  const [minPrize, setMinPrize] = useState("0");
  const [sort, setSort] = useState<SortKey>("relevance");
  const [visible, setVisible] = useState(PAGE_SIZE);

  const organizerOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const h of hackathons) counts.set(h.organizer, (counts.get(h.organizer) ?? 0) + 1);
    return [...counts.entries()]
      .filter(([name, count]) => count > 1 || name !== "Independent")
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 40)
      .map(([name]) => name);
  }, [hackathons]);

  const [organizer, setOrganizer] = useState("all");
  const [tag, setTag] = useState("all");
  const [cashOnly, setCashOnly] = useState(false);

  const tagOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const h of hackathons) {
      for (const t of h.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return [...counts.entries()]
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 30)
      .map(([name]) => name);
  }, [hackathons]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const floor = Number(minPrize) || 0;

    const result = hackathons.filter((h) => {
      if (status !== "all" && h.status !== status) return false;
      if (mode !== "all" && h.mode !== mode) return false;
      if (organizer !== "all" && h.organizer !== organizer) return false;
      if (tag !== "all" && !h.tags.includes(tag)) return false;
      if (cashOnly && (h.cashPrizeUsd ?? 0) <= 0) return false;
      if (floor > 0 && (h.totalPrizeUsd ?? 0) < floor) return false;
      if (!q) return true;
      return (
        h.name.toLowerCase().includes(q) ||
        h.organizer.toLowerCase().includes(q) ||
        h.description.toLowerCase().includes(q) ||
        h.tags.some((t) => t.toLowerCase().includes(q)) ||
        h.winners.some((w) => w.project.toLowerCase().includes(q))
      );
    });

    const weight: Record<HackathonStatus, number> = { ongoing: 0, upcoming: 1, past: 2 };
    return result.sort((a, b) => {
      switch (sort) {
        case "prize-desc":
          return b.totalPrizeUsd - a.totalPrizeUsd || a.name.localeCompare(b.name);
        case "prize-asc":
          return a.totalPrizeUsd - b.totalPrizeUsd || a.name.localeCompare(b.name);
        case "date-asc":
          return (
            (a.registrationDeadline ?? a.endDate).localeCompare(
              b.registrationDeadline ?? b.endDate,
            ) || a.name.localeCompare(b.name)
          );
        case "date-desc":
          return (
            (b.registrationDeadline ?? b.endDate).localeCompare(
              a.registrationDeadline ?? a.endDate,
            ) || a.name.localeCompare(b.name)
          );
        case "participants-desc":
          return (b.participants ?? 0) - (a.participants ?? 0) || b.totalPrizeUsd - a.totalPrizeUsd;
        case "newest":
          return (
            (b.firstSeenAt ?? "").localeCompare(a.firstSeenAt ?? "") ||
            (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "")
          );
        default: {
          if (a.status !== b.status) return weight[a.status] - weight[b.status];
          if (a.status === "past") return b.endDate.localeCompare(a.endDate);
          return a.startDate.localeCompare(b.startDate) || b.totalPrizeUsd - a.totalPrizeUsd;
        }
      }
    });
  }, [hackathons, query, status, mode, organizer, tag, cashOnly, minPrize, sort]);

  const hasFilters =
    query !== "" ||
    status !== "all" ||
    mode !== "all" ||
    organizer !== "all" ||
    tag !== "all" ||
    cashOnly ||
    minPrize !== "0";

  function reset() {
    setQuery("");
    setStatus("all");
    setMode("all");
    setOrganizer("all");
    setTag("all");
    setCashOnly(false);
    setMinPrize("0");
    setVisible(PAGE_SIZE);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-3.5">
        {showStatusFilter ? (
          <div className="mb-3 flex flex-wrap items-center gap-1 rounded-lg bg-secondary/70 p-1">
            {STATUSES.map((option) => {
              const active = status === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setStatus(option.value);
                    setVisible(PAGE_SIZE);
                  }}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    active
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
          <div className="relative lg:col-span-2">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setVisible(PAGE_SIZE);
              }}
              placeholder="Search name, organizer or topic"
              aria-label="Search hackathons"
              className="h-9 pl-9"
            />
          </div>

          <Select
            value={mode}
            onValueChange={(v) => {
              setMode(v as HackathonMode | "all");
              setVisible(PAGE_SIZE);
            }}
          >
            <SelectTrigger className="h-9" aria-label="Filter by format">
              <SelectValue placeholder="Format" />
            </SelectTrigger>
            <SelectContent>
              {MODES.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={organizer}
            onValueChange={(v) => {
              setOrganizer(v);
              setVisible(PAGE_SIZE);
            }}
          >
            <SelectTrigger className="h-9" aria-label="Filter by organizer">
              <SelectValue placeholder="Organizer" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any organizer</SelectItem>
              {organizerOptions.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={minPrize}
            onValueChange={(v) => {
              setMinPrize(v);
              setVisible(PAGE_SIZE);
            }}
          >
            <SelectTrigger className="h-9" aria-label="Minimum prize">
              <SelectValue placeholder="Minimum prize" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">Any prize</SelectItem>
              <SelectItem value="1000">$1,000+</SelectItem>
              <SelectItem value="5000">$5,000+</SelectItem>
              <SelectItem value="10000">$10,000+</SelectItem>
              <SelectItem value="50000">$50,000+</SelectItem>
              <SelectItem value="100000">$100,000+</SelectItem>
            </SelectContent>
          </Select>

          {tagOptions.length > 0 ? (
            <Select
              value={tag}
              onValueChange={(v) => {
                setTag(v);
                setVisible(PAGE_SIZE);
              }}
            >
              <SelectTrigger className="h-9" aria-label="Filter by topic">
                <SelectValue placeholder="Topic" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any topic</SelectItem>
                {tagOptions.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}

          <label className="flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={cashOnly}
              onChange={(e) => {
                setCashOnly(e.target.checked);
                setVisible(PAGE_SIZE);
              }}
              className="size-4 accent-primary"
            />
            Cash prizes published
          </label>

          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger className="h-9" aria-label="Sort results">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              {SORTS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
          <p aria-live="polite">
            <span className="font-medium text-foreground tabular-nums">
              {filtered.length.toLocaleString("en-US")}
            </span>{" "}
            hackathon{filtered.length === 1 ? "" : "s"}
            {hasFilters ? " match your filters" : ""}
          </p>
          {hasFilters ? (
            <Button variant="ghost" size="sm" onClick={reset}>
              <X aria-hidden="true" />
              Clear filters
            </Button>
          ) : null}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-6 py-16 text-center">
          <SlidersHorizontal className="mx-auto size-6 text-muted-foreground" aria-hidden="true" />
          <p className="mt-3 font-medium">No hackathons match those filters</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Try a lower minimum prize, or clear the filters.
          </p>
          <Button variant="outline" size="sm" className="mt-4" onClick={reset}>
            Clear filters
          </Button>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.slice(0, visible).map((h) => (
              <HackathonCard key={h.id} hackathon={h} />
            ))}
          </div>

          {visible < filtered.length ? (
            <div className="flex justify-center pt-2">
              <Button
                variant="outline"
                onClick={() => setVisible((v) => v + PAGE_SIZE)}
              >
                Show {Math.min(PAGE_SIZE, filtered.length - visible)} more
                <span className="text-muted-foreground">
                  ({filtered.length - visible} left)
                </span>
              </Button>
            </div>
          ) : null}

          <p className="pt-2 text-center text-xs text-muted-foreground">
            Showing {Math.min(visible, filtered.length)} of {filtered.length}. Biggest pool:{" "}
            <span className="text-prize">
              {formatUsd(Math.max(0, ...filtered.map((h) => h.totalPrizeUsd)))}
            </span>
          </p>
        </>
      )}
    </div>
  );
}
