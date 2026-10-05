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

type SortKey = "relevance" | "prize-desc" | "prize-asc" | "date-asc" | "date-desc";

const SORTS: { value: SortKey; label: string }[] = [
  { value: "relevance", label: "Best first" },
  { value: "prize-desc", label: "Prize: high to low" },
  { value: "prize-asc", label: "Prize: low to high" },
  { value: "date-asc", label: "Closing soonest" },
  { value: "date-desc", label: "Latest first" },
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const floor = Number(minPrize) || 0;

    const result = hackathons.filter((h) => {
      if (status !== "all" && h.status !== status) return false;
      if (mode !== "all" && h.mode !== mode) return false;
      if (organizer !== "all" && h.organizer !== organizer) return false;
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
        default: {
          if (a.status !== b.status) return weight[a.status] - weight[b.status];
          if (a.status === "past") return b.endDate.localeCompare(a.endDate);
          return a.startDate.localeCompare(b.startDate) || b.totalPrizeUsd - a.totalPrizeUsd;
        }
      }
    });
  }, [hackathons, query, status, mode, organizer, minPrize, sort]);

  const hasFilters =
    query !== "" || status !== "all" || mode !== "all" || organizer !== "all" || minPrize !== "0";

  function reset() {
    setQuery("");
    setStatus("all");
    setMode("all");
    setOrganizer("all");
    setMinPrize("0");
    setVisible(PAGE_SIZE);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
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
              placeholder="Search by name, organizer, tag or winner"
              aria-label="Search hackathons"
              className="pl-9"
            />
          </div>

          {showStatusFilter ? (
            <Select
              value={status}
              onValueChange={(v) => {
                setStatus(v as HackathonStatus | "all");
                setVisible(PAGE_SIZE);
              }}
            >
              <SelectTrigger aria-label="Filter by status">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}

          <Select
            value={mode}
            onValueChange={(v) => {
              setMode(v as HackathonMode | "all");
              setVisible(PAGE_SIZE);
            }}
          >
            <SelectTrigger aria-label="Filter by format">
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
            <SelectTrigger aria-label="Filter by organizer">
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

          <Select value={minPrize} onValueChange={setMinPrize}>
            <SelectTrigger aria-label="Minimum prize">
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

          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger aria-label="Sort results">
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
