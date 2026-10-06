import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Blog posts live as markdown files in `content/blog`, so they ship with the
 * repository and need no database. The daily generator only ever adds a file,
 * it never rewrites one that exists.
 */

export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  date: string;
  tags: string[];
  author: string;
  body: string;
}

const DIR = path.join(process.cwd(), "content", "blog");

interface Frontmatter {
  title?: string;
  slug?: string;
  date?: string;
  description?: string;
  tags?: string;
  author?: string;
}

function parseFile(name: string, raw: string): BlogPost | null {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return null;

  const frontmatter: Frontmatter = {};
  for (const line of match[1].split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim() as keyof Frontmatter;
    const value = line.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    if (value) frontmatter[key] = value;
  }

  if (!frontmatter.title || !frontmatter.date) return null;

  const fallbackSlug = name.replace(/\.md$/, "");
  const slug = (frontmatter.slug ?? fallbackSlug).trim().toLowerCase();
  if (!/^[a-z0-9-]+$/.test(slug)) return null;

  return {
    slug,
    title: frontmatter.title,
    description: frontmatter.description ?? "",
    date: frontmatter.date,
    tags: (frontmatter.tags ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
    author: frontmatter.author ?? "AI Hackathons",
    body: match[2].trim(),
  };
}

let cache: BlogPost[] | null = null;

export async function getPosts(): Promise<BlogPost[]> {
  if (cache) return cache;

  let files: string[] = [];
  try {
    files = await fs.readdir(DIR);
  } catch {
    cache = [];
    return cache;
  }

  const posts: BlogPost[] = [];
  for (const file of files.filter((f) => f.endsWith(".md")).sort().reverse()) {
    try {
      const raw = await fs.readFile(path.join(DIR, file), "utf8");
      const post = parseFile(file, raw);
      if (post) posts.push(post);
    } catch {
      // A broken file must never take the whole page down.
    }
  }

  posts.sort((a, b) => b.date.localeCompare(a.date));
  cache = posts;
  return posts;
}

export async function getPost(slug: string): Promise<BlogPost | null> {
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  const posts = await getPosts();
  return posts.find((post) => post.slug === slug) ?? null;
}

export function readingMinutes(body: string): number {
  const words = body.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

export function formatDateLong(date: string): string {
  const stamp = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(stamp)) return date;
  return new Date(stamp).toLocaleDateString("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
