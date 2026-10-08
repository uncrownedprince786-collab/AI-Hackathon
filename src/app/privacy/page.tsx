import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/page-header";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Privacy — AI Hackathons",
  description:
    "A plain-language privacy notice. This site shows public hackathon information, has no login and does not collect personal data from visitors.",
  path: "/privacy",
});

const SECTIONS: { title: string; body: ReactNode }[] = [
  {
    title: "Public information only",
    body: "Everything on this site comes from public pages published by hackathon organizers: event names, dates, locations, prize pools and winners. We do not host your projects, your profile or any content you create.",
  },
  {
    title: "No account, no personal data",
    body: "There is no login and no signup. We do not collect names, email addresses or any other personal details from visitors. The only data sent is what your browser sends to any website, like an IP address, and that is handled by the standard server logs of the hosting platform.",
  },
  {
    title: "Nothing to submit",
    body: "This site has no submission form. We never ask you to send personal information through this website, and there is no way to enter a competition through us.",
  },
  {
    title: "Event information can change",
    body: "Hackathon details — dates, prizes, deadlines and judging rules — are set by the organizers and can change without notice. A prize pool may also be announced without a published breakdown. We record what the organizers publish at the time we read it, and we never invent amounts.",
  },
  {
    title: "Not a complete or official record",
    body: "We work hard to keep this list accurate, but this site is not the source of truth. It can be incomplete, contain mistakes or lag behind a change on an official page. Always check the organizer's own event page before you register or rely on any detail.",
  },
  {
    title: "Provided as-is",
    body: "This site is provided \"as is\", without warranties of accuracy, completeness or suitability for any purpose. Use it at your own discretion.",
  },
  {
    title: "Contact",
    body: (
      <>
        If you believe something on this site is wrong, or you want a detail
        corrected or removed,{" "}
        <a
          href="https://github.com/uncrownedprince786-collab/AI-Hackathon/issues"
          target="_blank"
          rel="noopener noreferrer"
          className="underline-offset-4 hover:text-primary hover:underline"
        >
          open an issue on the project&apos;s GitHub repository
        </a>{" "}
        and we will take a look.
      </>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <>
      <PageHeader
        eyebrow="About"
        title="Privacy"
        description="Short version: this site shows public hackathon information, has no login and does not collect personal data from visitors."
      />

      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <div className="space-y-8">
          {SECTIONS.map((section) => (
            <section key={section.title}>
              <h2 className="text-lg font-semibold tracking-tight">{section.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {section.body}
              </p>
            </section>
          ))}
        </div>

        <p className="mt-12 text-xs text-muted-foreground">
          <Link href="/" className="underline-offset-4 hover:text-primary hover:underline">
            Back to the homepage
          </Link>
        </p>
      </div>
    </>
  );
}