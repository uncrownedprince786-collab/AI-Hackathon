import Link from "next/link";
import {
  Award,
  CalendarDays,
  ExternalLink,
  MapPin,
  Trophy,
  Users,
  Video,
} from "lucide-react";
import type { Hackathon } from "@/lib/types";
import {
  deadlineText,
  formatCount,
  formatDateRange,
  formatUsdLong,
  modeLabel,
} from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PrizeAmount } from "@/components/prize-amount";
import { StatusBadge } from "@/components/status-badge";

const MODE_ICON = {
  online: Video,
  "in-person": MapPin,
  hybrid: MapPin,
} as const;

export function HackathonCard({
  hackathon,
  className,
}: {
  hackathon: Hackathon;
  className?: string;
}) {
  const ModeIcon = MODE_ICON[hackathon.mode];
  const href = `/hackathons/${hackathon.slug}`;

  return (
    <Card
      className={`group relative flex flex-col overflow-hidden transition-colors hover:border-primary/40 ${className ?? ""}`}
    >
      <div className="flex flex-1 flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={hackathon.status} />
          <Badge variant="outline">
            <ModeIcon aria-hidden="true" />
            {modeLabel(hackathon.mode)}
          </Badge>
          {hackathon.winners.length > 0 ? (
            <Badge variant="prize">
              <Trophy aria-hidden="true" />
              {hackathon.winners.length} winner{hackathon.winners.length > 1 ? "s" : ""}
            </Badge>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <h3 className="text-base font-semibold leading-snug tracking-tight">
            <Link href={href} className="after:absolute after:inset-0 hover:text-primary">
              {hackathon.name}
            </Link>
          </h3>
          <p className="text-sm text-muted-foreground">{hackathon.organizer}</p>
        </div>

        <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Prize pool
            </p>
            <PrizeAmount amount={hackathon.totalPrizeUsd} size="lg" />
          </div>
          {hackathon.cashPrizeUsd > 0 && hackathon.creditPrizeUsd > 0 ? (
            <p className="pb-1 text-xs text-muted-foreground">
              {formatUsdLong(hackathon.cashPrizeUsd)} cash +{" "}
              {formatUsdLong(hackathon.creditPrizeUsd)} credits
            </p>
          ) : null}
        </div>

        <dl className="mt-auto grid gap-1.5 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <CalendarDays className="size-4 shrink-0" aria-hidden="true" />
            <dt className="sr-only">Dates</dt>
            <dd>{formatDateRange(hackathon.startDate, hackathon.endDate)}</dd>
          </div>
          <div className="flex items-center gap-2">
            <Award className="size-4 shrink-0" aria-hidden="true" />
            <dt className="sr-only">Deadline</dt>
            <dd className={hackathon.status !== "past" ? "font-medium text-foreground" : ""}>
              {deadlineText(hackathon)}
            </dd>
          </div>
          {hackathon.participants ? (
            <div className="flex items-center gap-2">
              <Users className="size-4 shrink-0" aria-hidden="true" />
              <dt className="sr-only">Participants</dt>
              <dd>{formatCount(hackathon.participants)} participants</dd>
            </div>
          ) : null}
        </dl>
      </div>
    </Card>
  );
}

/** Compact row used in sidebars and the winners page. */
export function HackathonRow({ hackathon }: { hackathon: Hackathon }) {
  return (
    <Link
      href={`/hackathons/${hackathon.slug}`}
      className="flex items-center justify-between gap-4 rounded-lg border border-border px-4 py-3 transition-colors hover:border-primary/40 hover:bg-secondary/40"
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{hackathon.name}</span>
        <span className="block text-xs text-muted-foreground">
          {formatDateRange(hackathon.startDate, hackathon.endDate)}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <PrizeAmount amount={hackathon.totalPrizeUsd} size="sm" />
        <ExternalLink className="size-3.5 text-muted-foreground" aria-hidden="true" />
      </span>
    </Link>
  );
}
