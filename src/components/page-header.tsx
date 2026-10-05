import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { JsonLd } from "@/components/json-ld";
import { breadcrumbJsonLd } from "@/lib/structured-data";

export function PageHeader({
  eyebrow,
  title,
  description,
  stats,
  children,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  stats?: { label: string; value: string }[];
  children?: ReactNode;
}) {
  return (
    <div className="border-b border-border bg-card/30">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        {eyebrow ? (
          <p className="text-xs font-medium uppercase tracking-widest text-primary">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-balance sm:text-4xl">
          {title}
        </h1>
        <p className="mt-3 max-w-3xl text-pretty text-muted-foreground">{description}</p>

        {stats?.length ? (
          <dl className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {stats.map((stat) => (
              <div key={stat.label} className="rounded-lg border border-border bg-card px-4 py-3">
                <dt className="text-xs text-muted-foreground">{stat.label}</dt>
                <dd className="mt-1 text-lg font-bold tracking-tight tabular-nums">
                  {stat.value}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}

        {children}
      </div>
    </div>
  );
}

export function Breadcrumbs({
  trail,
}: {
  trail: { name: string; path: string }[];
}) {
  const full = [{ name: "Home", path: "/" }, ...trail];

  return (
    <>
      <JsonLd data={breadcrumbJsonLd(full)} />
      <nav aria-label="Breadcrumb" className="mb-4">
        <ol className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          {full.map((item, index) => (
            <li key={item.path} className="flex items-center gap-1">
              {index > 0 ? (
                <ChevronRight className="size-3" aria-hidden="true" />
              ) : null}
              {index === full.length - 1 ? (
                <span aria-current="page" className="text-foreground">
                  {item.name}
                </span>
              ) : (
                <Link href={item.path} className="hover:text-primary">
                  {item.name}
                </Link>
              )}
            </li>
          ))}
        </ol>
      </nav>
    </>
  );
}
