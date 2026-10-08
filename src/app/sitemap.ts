import type { MetadataRoute } from "next";
import { getAllHackathons, getDataset } from "@/lib/hackathons";
import { getPosts } from "@/lib/blog";
import { absoluteUrl } from "@/lib/seo";

export const revalidate = 21600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [hackathons, dataset, posts] = await Promise.all([
    getAllHackathons(),
    getDataset(),
    getPosts(),
  ]);
  const lastModified = new Date(dataset.meta.lastUpdated);

  const staticPages: MetadataRoute.Sitemap = [
    { url: absoluteUrl("/"), lastModified, changeFrequency: "daily", priority: 1 },
    { url: absoluteUrl("/hackathons"), lastModified, changeFrequency: "daily", priority: 0.95 },
    { url: absoluteUrl("/ongoing"), lastModified, changeFrequency: "hourly", priority: 0.9 },
    { url: absoluteUrl("/upcoming"), lastModified, changeFrequency: "hourly", priority: 0.9 },
    { url: absoluteUrl("/past"), lastModified, changeFrequency: "weekly", priority: 0.8 },
    { url: absoluteUrl("/winners"), lastModified, changeFrequency: "weekly", priority: 0.85 },
    { url: absoluteUrl("/events"), lastModified, changeFrequency: "daily", priority: 0.8 },
    { url: absoluteUrl("/blog"), lastModified, changeFrequency: "daily", priority: 0.7 },
    { url: absoluteUrl("/privacy"), lastModified, changeFrequency: "yearly", priority: 0.3 },
  ];

  const detailPages: MetadataRoute.Sitemap = hackathons.map((h) => ({
    url: absoluteUrl(`/hackathons/${h.slug}`),
    lastModified: new Date(h.updatedAt),
    changeFrequency: h.status === "past" ? "yearly" : "weekly",
    priority: h.status === "ongoing" ? 0.9 : h.status === "upcoming" ? 0.8 : 0.6,
  }));

  const blogPages: MetadataRoute.Sitemap = posts.map((post) => ({
    url: absoluteUrl(`/blog/${post.slug}`),
    lastModified: new Date(post.date),
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  return [...staticPages, ...detailPages, ...blogPages];
}
