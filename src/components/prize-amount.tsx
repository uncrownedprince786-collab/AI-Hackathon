import { cn } from "@/lib/utils";

/**
 * The most important number on a card. `claimed` switches the wording: when an
 * organizer announces a pool without publishing a breakdown we say so instead of
 * implying the money is confirmed cash.
 */
export function PrizeAmount({
  amount,
  claimed = false,
  className,
  size = "lg",
}: {
  amount: number;
  claimed?: boolean;
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
    return (
      <span className={cn("font-semibold text-muted-foreground/80", sizes[size], className)}>
        No prize pool published
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
