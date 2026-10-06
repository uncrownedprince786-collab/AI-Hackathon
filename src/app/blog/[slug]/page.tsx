import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, CalendarDays, Clock, User } from "lucide-react";
import { getPost, getPosts, readingMinutes, formatDateLong } from "@/lib/blog";
import { renderMarkdown } from "@/lib/markdown";
import { JsonLd } from "@/components/json-ld";
import { Breadcrumbs } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { buildMetadata, absoluteUrl } from "@/lib/seo";

export const revalidate = 3600;
export const dynamicParams = true;

export async function generateStaticParams() {
  const posts = await getPosts();
  return posts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) {
    return buildMetadata({
      title: "Article not found",
      description: "This article could not be found.",
      path: `/blog/${slug}`,
      noIndex: true,
    });
  }

  return buildMetadata({
    title: post.title,
    description: post.description,
    path: `/blog/${post.slug}`,
    keywords: post.tags.map((t) => t.toLowerCase()),
  });
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound();

  const posts = await getPosts();
  const index = posts.findIndex((p) => p.slug === post.slug);
  const newer = index > 0 ? posts[index - 1] : null;
  const older = index < posts.length - 1 ? posts[index + 1] : null;
  const minutes = readingMinutes(post.body);

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BlogPosting",
          headline: post.title,
          description: post.description,
          datePublished: post.date,
          dateModified: post.date,
          author: { "@type": "Organization", name: post.author },
          publisher: { "@type": "Organization", name: "AI Hackathons" },
          mainEntityOfPage: absoluteUrl(`/blog/${post.slug}`),
        }}
      />

      <div className="mx-auto max-w-3xl px-4 pt-10 sm:px-6">
        <Breadcrumbs
          trail={[
            { name: "Blog", path: "/blog" },
            { name: post.title, path: `/blog/${post.slug}` },
          ]}
        />

        <header className="mt-6">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="size-3.5" aria-hidden="true" />
              {formatDateLong(post.date)}
            </span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5" aria-hidden="true" />
              {minutes} min read
            </span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1">
              <User className="size-3.5" aria-hidden="true" />
              {post.author}
            </span>
          </div>

          <h1 className="mt-3 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
            {post.title}
          </h1>

          <p className="mt-3 text-base leading-relaxed text-muted-foreground">
            {post.description}
          </p>

          {post.tags.length ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {post.tags.map((tag) => (
                <Badge key={tag} variant="outline">
                  {tag}
                </Badge>
              ))}
            </div>
          ) : null}
        </header>

        <article
          className="prose-custom mt-8"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(post.body) }}
        />

        <nav className="mt-10 flex flex-col gap-3 border-t border-border pt-6 sm:flex-row sm:justify-between">
          {older ? (
            <Link
              href={`/blog/${older.slug}`}
              className="group inline-flex max-w-sm items-start gap-2 text-sm"
            >
              <ArrowLeft className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span>
                <span className="block text-xs uppercase tracking-wider text-muted-foreground">
                  Newer article
                </span>
                <span className="font-medium group-hover:text-primary">{older.title}</span>
              </span>
            </Link>
          ) : (
            <span />
          )}
          {newer ? (
            <Link
              href={`/blog/${newer.slug}`}
              className="group inline-flex max-w-sm items-start gap-2 text-sm sm:text-right"
            >
              <span>
                <span className="block text-xs uppercase tracking-wider text-muted-foreground">
                  Older article
                </span>
                <span className="font-medium group-hover:text-primary">{newer.title}</span>
              </span>
              <ArrowRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>
          ) : null}
        </nav>

        <div className="mt-10 rounded-xl border border-border bg-secondary/40 p-5 text-sm">
          <p className="text-muted-foreground">
            Looking for events you can join?{" "}
            <Link href="/events" className="font-medium text-primary hover:underline">
              Browse upcoming AI events
            </Link>{" "}
            or{" "}
            <Link href="/hackathons" className="font-medium text-primary hover:underline">
              find an AI hackathon
            </Link>
            .
          </p>
        </div>
      </div>
    </>
  );
}
