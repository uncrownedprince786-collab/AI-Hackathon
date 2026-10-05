import type { MetadataRoute } from "next";
import { getAllHackathons, getDataset } from "@/lib/hackathons";
import { absoluteUrl } from "@/lib/seo";

export const revalidate = 21600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [hackathons, dataset] = await Promise.all([getAllHackathons(), getDataset()]);
  const lastModified = new Date(dataset.meta.lastUpdated);

  const staticPages: MetadataRoute.Sitemap = [
    { url: absoluteUrl("/"), lastModified, changeFrequency: "daily", priority: 1 },
    { url: absoluteUrl("/hackathons"), lastModified, changeFrequency: "daily", priority: 0.95 },
    { url: absoluteUrl("/ongoing"), lastModified, changeFrequency: "hourly", priority: 0.9 },
    { url: absoluteUrl("/upcoming"), lastModified, changeFrequency: "hourly", priority: 0.9 },
    { url: absoluteUrl("/past"), lastModified, changeFrequency: "weekly", priority: 0.8 },
    { url: absoluteUrl("/winners"), lastModified, changeFrequency: "weekly", priority: 0.85 },
    { url: absoluteUrl("/stats"), lastModified, changeFrequency: "weekly", priority: 0.7 },
    {
      url: absoluteUrl("/how-we-collect-data"),
      lastModified,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    { url: absoluteUrl("/submit"), lastModified, changeFrequency: "monthly", priority: 0.6 },
  ];

  const detailPages: MetadataRoute.Sitemap = hackathons.map((h) => ({
    url: absoluteUrl(`/hackathons/${h.slug}`),
    lastModified: new Date(h.updatedAt),
    changeFrequency: h.status === "past" ? "yearly" : "weekly",
    priority: h.status === "ongoing" ? 0.9 : h.status === "upcoming" ? 0.8 : 0.6,
  }));

  return [...staticPages, ...detailPages];
}
