import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-4 py-20 text-center sm:px-6">
      <p className="text-sm font-medium text-primary">404</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
        We could not find that page
      </h1>
      <p className="mt-3 text-muted-foreground">
        The hackathon may have been removed, or the link may be wrong. Try the full list
        instead.
      </p>
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <Button asChild size="lg">
          <Link href="/hackathons">Browse all AI hackathons</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/ongoing">What&apos;s live now</Link>
        </Button>
      </div>
    </div>
  );
}
