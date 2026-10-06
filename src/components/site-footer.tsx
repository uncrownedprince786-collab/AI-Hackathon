import Link from "next/link";
import { Logo } from "@/components/logo";
import { absoluteUrl } from "@/lib/seo";

const COLUMNS = [
  {
    title: "Browse",
    links: [
      { href: "/hackathons", label: "All AI hackathons" },
      { href: "/ongoing", label: "Ongoing now" },
      { href: "/upcoming", label: "Upcoming" },
      { href: "/past", label: "Past hackathons" },
      { href: "/winners", label: "Winners" },
      { href: "/events", label: "AI events" },
      { href: "/blog", label: "Blog" },
    ],
  },
  {
    title: "Info",
    links: [
      { href: "/stats", label: "Stats" },
      { href: "/methodology", label: "How we collect data" },
      { href: "/submit", label: "Submit a hackathon" },
      { href: "/api/data", label: "Data (JSON)" },
    ],
  },
];

export function SiteFooter({ lastUpdated }: { lastUpdated: string }) {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-20 border-t border-border bg-card/40">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 md:grid-cols-4">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2">
              <Logo />
              <span className="text-sm font-bold tracking-tight">AI Hackathons</span>
            </div>
            <p className="mt-3 max-w-sm text-sm text-muted-foreground">
              All AI hackathons in one place — prizes, winners and upcoming events.
            </p>
            <p className="mt-4 text-xs text-muted-foreground">
              Data last updated{" "}
              <time dateTime={lastUpdated}>
                {new Date(lastUpdated).toUTCString().replace(" GMT", " UTC")}
              </time>
              . Updated every 6 hours.
            </p>
          </div>

          {COLUMNS.map((column) => (
            <div key={column.title}>
              <h2 className="text-sm font-semibold">{column.title}</h2>
              <ul className="mt-3 space-y-2">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-primary"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>
            &copy; {year} AI Hackathons. Free to use, no login needed.
          </p>
          <p>
            Prize data comes from each organizer. Always check the{" "}
            <Link href="/methodology" className="underline hover:text-primary">
              official page
            </Link>{" "}
            before you enter.
          </p>
        </div>
      </div>
      <div className="sr-only">
        <Link href={absoluteUrl("/")}>AI Hackathons</Link>
      </div>
    </footer>
  );
}
