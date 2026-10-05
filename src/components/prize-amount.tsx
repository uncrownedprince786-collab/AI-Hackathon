import { cn } from "@/lib/utils";

/** The single most important number on every card. */
export function PrizeAmount({
  amount,
  className,
  size = "lg",
}: {
  amount: number;
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
      <span className={cn("font-bold text-muted-foreground/70", sizes[size], className)}>
        No cash prize
      </span>
    );
  }

  return (
    <span
      className={cn(
        "font-bold tracking-tight text-prize tabular-nums",
        sizes[size],
        className,
      )}
    >
      {format(amount)}
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
