"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, RefreshCw, X } from "lucide-react";
import { Logo, Wordmark } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { formatCount } from "@/lib/format";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/hackathons", label: "All" },
  { href: "/ongoing", label: "Ongoing" },
  { href: "/upcoming", label: "Upcoming" },
  { href: "/past", label: "Past" },
  { href: "/winners", label: "Winners" },
  { href: "/stats", label: "Stats" },
];

export function SiteHeader({
  lastUpdated,
  counts,
}: {
  lastUpdated: string;
  counts: { total: number; ongoing: number; upcoming: number };
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) =>
    href === "/hackathons" ? pathname === "/hackathons" : pathname === href;

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">
        <div className="flex items-center gap-2">
          <Logo />
          <Wordmark />
        </div>

        <nav
          aria-label="Main"
          className="ml-4 hidden items-center gap-0.5 md:flex"
        >
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={cn(
                "rounded-lg px-2.5 py-1.5 text-sm transition-colors",
                isActive(item.href)
                  ? "bg-secondary font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <span
            className="hidden items-center gap-1.5 text-xs text-muted-foreground lg:flex"
            title={`Last updated ${new Date(lastUpdated).toUTCString()}`}
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
            <span className="tabular-nums">{formatCount(counts.total)}</span> listed
            {counts.ongoing > 0 ? (
              <>
                {" · "}
                <span className="text-success">{counts.ongoing} live</span>
              </>
            ) : null}
          </span>

          <Button asChild size="sm" variant="outline" className="hidden sm:inline-flex">
            <Link href="/submit">Submit</Link>
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X /> : <Menu />}
          </Button>
        </div>
      </div>

      {open ? (
        <div className="border-t border-border md:hidden">
          <nav aria-label="Mobile" className="mx-auto max-w-7xl px-4 py-2">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "block rounded-lg px-3 py-2.5 text-sm",
                  isActive(item.href)
                    ? "bg-secondary font-medium"
                    : "text-muted-foreground",
                )}
              >
                {item.label}
              </Link>
            ))}
            <div className="grid grid-cols-2 gap-2 p-2">
              <Button asChild size="sm" variant="outline">
                <Link href="/submit" onClick={() => setOpen(false)}>
                  Submit
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/how-we-collect-data" onClick={() => setOpen(false)}>
                  Our data
                </Link>
              </Button>
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
