import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";

/**
 * The most important number on a card. `claimed` switches the wording: when an
 * organizer announces a pool without publishing a breakdown we say so instead of
 * implying the money is confirmed cash. `nonUsd` renders a headline pool in its
 * original currency without converting it.
 */
export function PrizeAmount({
  amount,
  claimed = false,
  nonUsd,
  className,
  size = "lg",
}: {
  amount: number;
  claimed?: boolean;
  nonUsd?: { amount: number; currency: string };
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const sizes = {
    sm: "text-sm",
    md: "text-lg",
    lg: "text-2xl",
    xl: "text-4xl sm:text-5xl",
  };

  if (!amount || amount <= 0) {
    if (nonUsd && nonUsd.amount > 0) {
      return (
        <span className="inline-flex flex-col gap-0.5">
          <span
            className={cn(
              "font-bold tracking-tight text-prize tabular-nums",
              sizes[size],
              className,
            )}
          >
            {formatCurrency(nonUsd.amount, nonUsd.currency)}
          </span>
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Announced total pool
          </span>
        </span>
      );
    }
    // A missing prize is shown quietly: smaller and muted, so real prize
    // numbers always stand out. The event is never hidden over its prize.
    return (
      <span
        className={cn(
          "font-normal leading-snug text-muted-foreground/60",
          size === "xl" ? "text-lg" : "text-sm",
          className,
        )}
      >
        Prize not published
      </span>
    );
  }

  return (
    <span className="inline-flex flex-col gap-0.5">
      <span
        className={cn(
          "font-bold tracking-tight text-prize tabular-nums",
          sizes[size],
          className,
        )}
      >
        {format(amount)}
      </span>
      {claimed ? (
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Announced total pool
        </span>
      ) : null}
    </span>
  );
}

function format(amount: number): string {
  if (amount >= 1_000_000) {
    const m = amount / 1_000_000;
    return `$${m >= 10 ? Math.round(m) : Math.round(m * 100) / 100}M`;
  }
  return `$${Math.round(amount).toLocaleString("en-US")}`;
}
