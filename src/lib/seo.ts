import { type Metadata } from "next";
import { CACHE_TAG } from "@/lib/store";

const SITE_NAME = "AI Hackathons";
const SITE_URL =
  (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim() || "https://ai-hackathons.vercel.app";

export const siteUrl = SITE_URL;
export const siteName = SITE_NAME;

export const tagline = "All AI hackathons in one place — prizes, winners and upcoming events.";

export const description =
  "Find every AI hackathon in one place. See prize money, credits, dates, deadlines, organizers and winners for upcoming, ongoing and past AI hackathons. Updated every 6 hours.";

export function titleFor(value: string): string {
  return `${value} | ${SITE_NAME}`;
}

export function absoluteUrl(path: string): string {
  return new URL(path, SITE_URL).toString();
}

export function buildMetadata({
  title,
  description: desc,
  path = "/",
  keywords = [],
  noIndex = false,
}: {
  title: string;
  description: string;
  path?: string;
  keywords?: string[];
  noIndex?: boolean;
}): Metadata {
  const url = absoluteUrl(path);
  return {
    metadataBase: new URL(SITE_URL),
    title,
    description: desc,
    keywords: [
      "ai hackathons",
      "ai hackathon",
      "hackathon",
      "ai competitions",
      "machine learning hackathon",
      "llm hackathon",
      "ai agents hackathon",
      "hackathon prizes",
      "hackathon winners",
      "upcoming hackathons",
      ...keywords,
    ],
    alternates: { canonical: url },
    robots: noIndex
      ? { index: false, follow: false }
      : {
          index: true,
          follow: true,
          googleBot: {
            index: true,
            follow: true,
            "max-snippet": -1,
            "max-image-preview": "large",
            "max-video-preview": -1,
          },
        },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title,
      description: desc,
      url,
      locale: "en_US",
      images: [{ url: absoluteUrl("/opengraph-image"), width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: desc,
      images: [absoluteUrl("/opengraph-image")],
    },
  };
}

export { CACHE_TAG };
