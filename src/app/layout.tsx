import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { JsonLd } from "@/components/json-ld";
import { getAllHackathons, getDataset } from "@/lib/hackathons";
import { buildMetadata, description } from "@/lib/seo";
import { organizationJsonLd, websiteJsonLd } from "@/lib/structured-data";

const geistSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

export const metadata: Metadata = buildMetadata({
  title: "AI Hackathons — All AI Hackathons, Prizes and Winners",
  description,
  path: "/",
});

export const viewport: Viewport = {
  themeColor: "#faf8f3",
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [dataset, hackathons] = await Promise.all([getDataset(), getAllHackathons()]);

  const counts = {
    total: hackathons.length,
    ongoing: hackathons.filter((h) => h.status === "ongoing").length,
    upcoming: hackathons.filter((h) => h.status === "upcoming").length,
    past: hackathons.filter((h) => h.status === "past").length,
  };

  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="min-h-dvh font-sans antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
        >
          Skip to content
        </a>

        <JsonLd data={[websiteJsonLd(), organizationJsonLd()]} />

        <div className="flex min-h-dvh flex-col">
          <SiteHeader lastUpdated={dataset.meta.lastUpdated} counts={counts} />
          <main id="main" className="flex-1">
            {children}
          </main>
          <SiteFooter lastUpdated={dataset.meta.lastUpdated} />
        </div>
      </body>
    </html>
  );
}

export const revalidate = 21600;
