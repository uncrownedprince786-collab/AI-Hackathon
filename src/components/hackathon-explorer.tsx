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
import { detectRegion } from "@/lib/geo";
import { cn } from "@/lib/utils";

type SortKey =
  | "relevance"
  | "prize-desc"
  | "prize-asc"
  | "date-asc"
  | "date-desc"
  | "participants-desc"
  | "newest";

type DateWindow = "any" | "next-30" | "next-90" | "next-365" | "past";

const DATE_WINDOWS: { value: DateWindow; label: string }[] = [
  { value: "any", label: "Any dates" },
  { value: "next-30", label: "Starts in 30 days" },
  { value: "next-90", label: "Starts in 3 months" },
  { value: "next-365", label: "Starts in a year" },
  { value: "past", label: "Already started / past" },
];

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
  lastUpdated,
}: {
  hackathons: Hackathon[];
  initialQuery?: string;
  showStatusFilter?: boolean;
  lastUpdated?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [status, setStatus] = useState<HackathonStatus | "all">("all");
  const [mode, setMode] = useState<HackathonMode | "all">("all");
  const [minPrize, setMinPrize] = useState("0");
  const [sort, setSort] = useState<SortKey>("relevance");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [dateWindow, setDateWindow] = useState<DateWindow>("any");
  const [country, setCountry] = useState("all");
  const [region, setRegion] = useState("all");

  const organizerOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const h of hackathons) {
      const name = h.organizer.trim();
      if (!name) continue;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
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

  const regionOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const h of hackathons) {
      const region = detectRegion(h.location);
      if (region) counts.set(region, (counts.get(region) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name]) => name);
  }, [hackathons]);

  const countryOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const h of hackathons) {
      if (h.country) counts.set(h.country, (counts.get(h.country) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 60)
      .map(([name]) => name);
  }, [hackathons]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const floor = Number(minPrize) || 0;
    const today = new Date().toISOString().slice(0, 10);
    const horizon = (days: number) => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() + days);
      return d.toISOString().slice(0, 10);
    };
    const windowPlanned =
      dateWindow === "next-30"
        ? { min: today, max: horizon(30) }
        : dateWindow === "next-90"
          ? { min: today, max: horizon(90) }
          : dateWindow === "next-365"
            ? { min: today, max: horizon(365) }
            : null;

    const result = hackathons.filter((h) => {
      if (status !== "all" && h.status !== status) return false;
      if (mode !== "all" && h.mode !== mode) return false;
      if (organizer !== "all" && h.organizer !== organizer) return false;
      if (tag !== "all" && !h.tags.includes(tag)) return false;
      if (country !== "all" && h.country !== country) return false;
      if (region !== "all" && detectRegion(h.location) !== region) return false;
      if (cashOnly && (h.cashPrizeUsd ?? 0) <= 0) return false;
      if (floor > 0 && (h.totalPrizeUsd ?? 0) < floor) return false;
      if (dateWindow === "past" && h.startDate >= today) return false;
      if (windowPlanned && (h.startDate < windowPlanned.min || h.startDate > windowPlanned.max)) return false;
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
  }, [hackathons, query, status, mode, organizer, tag, cashOnly, minPrize, sort, country, region, dateWindow]);

  const hasFilters =
    query !== "" ||
    status !== "all" ||
    mode !== "all" ||
    organizer !== "all" ||
    tag !== "all" ||
    cashOnly ||
    minPrize !== "0" ||
    country !== "all" ||
    region !== "all" ||
    dateWindow !== "any";

  function reset() {
    setQuery("");
    setStatus("all");
    setMode("all");
    setOrganizer("all");
    setTag("all");
    setCashOnly(false);
    setMinPrize("0");
    setCountry("all");
    setRegion("all");
    setDateWindow("any");
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

          <Select
            value={country}
            onValueChange={(v) => {
              setCountry(v);
              setVisible(PAGE_SIZE);
            }}
          >
            <SelectTrigger className="h-9" aria-label="Filter by country">
              <SelectValue placeholder="Country" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any country</SelectItem>
              {countryOptions.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={region}
            onValueChange={(v) => {
              setRegion(v);
              setVisible(PAGE_SIZE);
            }}
          >
            <SelectTrigger className="h-9" aria-label="Filter by region">
              <SelectValue placeholder="Region" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any region</SelectItem>
              {regionOptions.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={dateWindow}
            onValueChange={(v) => {
              setDateWindow(v as DateWindow);
              setVisible(PAGE_SIZE);
            }}
          >
            <SelectTrigger className="h-9" aria-label="Filter by dates">
              <SelectValue placeholder="Dates" />
            </SelectTrigger>
            <SelectContent>
              {DATE_WINDOWS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
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
            {lastUpdated ? (
              <>
                {" "}
                · data refreshed{" "}
                <time dateTime={lastUpdated}>
                  {new Date(lastUpdated).toUTCString().replace(" GMT", " UTC")}
                </time>
              </>
            ) : null}
          </p>
        </>
      )}
    </div>
  );
}
