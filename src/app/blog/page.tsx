import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Clock, Sparkles } from "lucide-react";
import { getPosts, readingMinutes, formatDateLong } from "@/lib/blog";
import { JsonLd } from "@/components/json-ld";
import { Breadcrumbs, PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { buildMetadata, absoluteUrl } from "@/lib/seo";

export const revalidate = 3600;

export const metadata: Metadata = buildMetadata({
  title: "AI Blog — Plain-English Articles on AI, LLMs and Agents",
  description:
    "Simple daily articles about AI: what new tools do, how they help, and what is coming next. Written for people who build.",
  path: "/blog",
  keywords: [
    "ai blog",
    "artificial intelligence articles",
    "llm explained",
    "ai agents guide",
    "genai news",
  ],
});

export default async function BlogPage() {
  const posts = await getPosts();

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Blog",
          name: "AI Hackathons blog",
          url: absoluteUrl("/blog"),
          description:
            "Plain-English articles about AI, large language models and agents for people who build.",
          blogPost: posts.slice(0, 20).map((post) => ({
            "@type": "BlogPosting",
            headline: post.title,
            description: post.description,
            datePublished: post.date,
            url: absoluteUrl(`/blog/${post.slug}`),
            author: { "@type": "Organization", name: post.author },
          })),
        }}
      />

      <PageHeader
        eyebrow="Blog"
        title="AI, explained simply"
        description="Short articles about what AI tools actually do, how they help, and what is coming next. One useful piece at a time, written in common language."
        stats={[
          { label: "Articles", value: String(posts.length) },
          { label: "Updated", value: posts.length ? formatDateLong(posts[0].date) : "—" },
        ]}
      />

      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <Breadcrumbs trail={[{ name: "Blog", path: "/blog" }]} />

        {posts.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-6 py-16 text-center text-muted-foreground">
            No articles published yet.
          </p>
        ) : (
          <div className="space-y-4">
            {posts.map((post) => (
              <article
                key={post.slug}
                className="group rounded-xl border border-border bg-card p-6 transition-colors hover:border-primary/40"
              >
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{formatDateLong(post.date)}</span>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="size-3.5" aria-hidden="true" />
                    {readingMinutes(post.body)} min read
                  </span>
                </div>

                <h2 className="mt-2 text-xl font-bold tracking-tight">
                  <Link href={`/blog/${post.slug}`} className="hover:text-primary">
                    {post.title}
                  </Link>
                </h2>

                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {post.description}
                </p>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {post.tags.map((tag) => (
                    <Badge key={tag} variant="outline">
                      {tag}
                    </Badge>
                  ))}
                  <Link
                    href={`/blog/${post.slug}`}
                    className="ml-auto inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-primary"
                  >
                    Read article
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}

        <div className="mt-8 rounded-xl border border-border bg-secondary/40 p-5 text-sm text-muted-foreground">
          <p className="flex items-start gap-2">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            <span>
              New articles are added regularly and cover one useful idea each: what a tool does,
              how people use it, and what to watch next. No hype, no buzzwords.
            </span>
          </p>
        </div>
      </div>
    </>
  );
}
