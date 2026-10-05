"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Mode = "online" | "in-person" | "hybrid";

const FIELDS = {
  name: "",
  organizer: "",
  officialUrl: "",
  startDate: "",
  endDate: "",
  prizePool: "",
  mode: "online" as Mode,
  email: "",
  notes: "",
};

export function SubmitForm() {
  const [values, setValues] = useState(FIELDS);
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  function set<K extends keyof typeof FIELDS>(key: K, value: (typeof FIELDS)[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("sending");
    setMessage("");

    try {
      const response = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const payload = (await response.json()) as { message?: string };

      if (!response.ok) {
        setState("error");
        setMessage(payload.message ?? "Something went wrong. Please try again.");
        return;
      }

      setState("done");
      setMessage(payload.message ?? "Thank you. We will check the link and add it.");
      setValues(FIELDS);
    } catch {
      setState("error");
      setMessage("We could not send that. Please check your connection and try again.");
    }
  }

  if (state === "done") {
    return (
      <div className="rounded-xl border border-success/40 bg-success/10 p-8 text-center">
        <CheckCircle2 className="mx-auto size-8 text-success" aria-hidden="true" />
        <h2 className="mt-3 text-lg font-semibold">Got it</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{message}</p>
        <p className="mt-4 text-xs text-muted-foreground">
          No account was created and nothing was shared publicly with your email.
        </p>
        <Button variant="outline" className="mt-5" onClick={() => setState("idle")}>
          Submit another
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Hackathon name" required htmlFor="name">
          <Input
            id="name"
            name="name"
            required
            maxLength={160}
            value={values.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="e.g. AI Agent Builders Hackathon"
          />
        </Field>

        <Field label="Organizer" required htmlFor="organizer">
          <Input
            id="organizer"
            name="organizer"
            required
            maxLength={120}
            value={values.organizer}
            onChange={(e) => set("organizer", e.target.value)}
            placeholder="e.g. Acme Labs"
          />
        </Field>
      </div>

      <Field label="Official link" required htmlFor="officialUrl" hint="The page where people sign up.">
        <Input
          id="officialUrl"
          name="officialUrl"
          type="url"
          required
          value={values.officialUrl}
          onChange={(e) => set("officialUrl", e.target.value)}
          placeholder="https://example-hackathon.devpost.com"
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="Start date" required htmlFor="startDate">
          <Input
            id="startDate"
            name="startDate"
            type="date"
            required
            value={values.startDate}
            onChange={(e) => set("startDate", e.target.value)}
          />
        </Field>
        <Field label="End date" required htmlFor="endDate">
          <Input
            id="endDate"
            name="endDate"
            type="date"
            required
            value={values.endDate}
            onChange={(e) => set("endDate", e.target.value)}
          />
        </Field>
        <Field label="Online or in person" required htmlFor="mode">
          <Select value={values.mode} onValueChange={(v) => set("mode", v as Mode)}>
            <SelectTrigger id="mode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="online">Online</SelectItem>
              <SelectItem value="in-person">In person</SelectItem>
              <SelectItem value="hybrid">Hybrid</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>

      <Field
        label="Prize pool"
        htmlFor="prizePool"
        hint="Write it as you would say it, e.g. $10,000 or $5k cash + $5k credits."
      >
        <Input
          id="prizePool"
          name="prizePool"
          maxLength={120}
          value={values.prizePool}
          onChange={(e) => set("prizePool", e.target.value)}
          placeholder="$10,000"
        />
      </Field>

      <Field
        label="Your email"
        htmlFor="email"
        hint="Optional. Only used if we have a question about the link."
      >
        <Input
          id="email"
          name="email"
          type="email"
          maxLength={160}
          value={values.email}
          onChange={(e) => set("email", e.target.value)}
          placeholder="you@example.com"
        />
      </Field>

      <Field label="Anything else" htmlFor="notes">
        <Textarea
          id="notes"
          name="notes"
          maxLength={1000}
          value={values.notes}
          onChange={(e) => set("notes", e.target.value)}
          placeholder="Winners page, judge list, team size, anything useful."
        />
      </Field>

      {state === "error" && message ? (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {message}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={state === "sending"}>
          {state === "sending" ? (
            <>
              <Loader2 className="animate-spin" aria-hidden="true" />
              Sending
            </>
          ) : (
            <>
              <Send aria-hidden="true" />
              Send
            </>
          )}
        </Button>
        <p className="text-xs text-muted-foreground">
          No login. No account. We only use the link you send.
        </p>
      </div>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  required = false,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>
        {label}
        {required ? <span className="ml-1 text-primary">*</span> : null}
      </Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
