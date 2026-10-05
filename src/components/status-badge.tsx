import type { HackathonStatus } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { statusLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

const ICONS: Record<HackathonStatus, string> = {
  ongoing: "M12 8v4l3 2",
  upcoming: "M12 6v6l4 2",
  past: "M5 12h14",
};

export function StatusBadge({
  status,
  className,
}: {
  status: HackathonStatus;
  className?: string;
}) {
  return (
    <Badge variant={status} className={cn("font-medium", className)}>
      {status === "ongoing" ? (
        <span className="relative flex size-1.5">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-75" />
          <span className="relative inline-flex size-1.5 rounded-full bg-success" />
        </span>
      ) : null}
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        className="size-3"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" />
        <path d={ICONS[status]} />
      </svg>
      {statusLabel(status)}
    </Badge>
  );
}
