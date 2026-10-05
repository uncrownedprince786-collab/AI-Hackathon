import type { Metadata } from "next";
import { Clock, ShieldCheck, Zap } from "lucide-react";
import { SubmitForm } from "@/components/submit-form";
import { JsonLd } from "@/components/json-ld";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { buildMetadata } from "@/lib/seo";
import { faqJsonLd } from "@/lib/structured-data";

export const metadata: Metadata = buildMetadata({
  title: "Submit an AI Hackathon — No Login Needed",
  description:
    "Send us your AI hackathon and we will add it to the list. One simple form, no account, no signup. Include the official link, the dates and the prize money.",
  path: "/submit",
  keywords: ["submit ai hackathon", "add hackathon", "list your hackathon"],
});

const FAQ = [
  {
    question: "Do I need an account to submit?",
    answer:
      "No. There is no login and no signup. Fill in the form and that is it.",
  },
  {
    question: "What happens after I send it?",
    answer:
      "A scheduled job re-reads the official link you send, fills in the prize money, dates and organizer, and the hackathon appears in the right list.",
  },
  {
    question: "Is my email shared?",
    answer:
      "No. Your email is only used if we have a question about the link. It is never published on the site.",
  },
];

export default function SubmitPage() {
  return (
    <>
      <JsonLd data={faqJsonLd(FAQ)} />

      <PageHeader
        eyebrow="Add to the list"
        title="Submit an AI hackathon"
        description="Running an AI hackathon? Send us the link and we will add it. There is no account to create and no password to remember."
        stats={[
          { label: "Login required", value: "No" },
          { label: "Time to fill", value: "1 min" },
          { label: "Refresh rate", value: "6 hours" },
        ]}
      />

      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <Card className="p-6 sm:p-8">
          <SubmitForm />
        </Card>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <Card className="p-4">
            <Zap className="size-4 text-primary" aria-hidden="true" />
            <p className="mt-2 text-sm font-medium">Fast</p>
            <p className="mt-1 text-xs text-muted-foreground">
              We re-read your page every 6 hours, so details stay correct.
            </p>
          </Card>
          <Card className="p-4">
            <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
            <p className="mt-2 text-sm font-medium">Public</p>
            <p className="mt-1 text-xs text-muted-foreground">
              We publish your link and prize. Your email stays private.
            </p>
          </Card>
          <Card className="p-4">
            <Clock className="size-4 text-primary" aria-hidden="true" />
            <p className="mt-2 text-sm font-medium">Automatic</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Status moves from upcoming to ongoing to past on its own.
            </p>
          </Card>
        </div>

        <div className="mt-10">
          <h2 className="text-lg font-bold tracking-tight">Common questions</h2>
          <div className="mt-3 space-y-2">
            {FAQ.map((item) => (
              <details
                key={item.question}
                className="rounded-lg border border-border bg-card px-4 py-3"
              >
                <summary className="cursor-pointer list-none text-sm font-medium marker:content-none">
                  {item.question}
                </summary>
                <p className="mt-2 text-sm text-muted-foreground">{item.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
