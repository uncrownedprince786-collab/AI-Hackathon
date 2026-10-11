# AI Hackathons

All AI hackathons in one place — prizes, winners and upcoming events.

Live site: **https://ai-hackathons-tawny.vercel.app**

A public, read-only directory of AI hackathons. No login, no signup, no admin.
A scheduled job re-reads public event listings throughout the day (about every 6 hours), works out each
event's status from its dates, and refreshes every page.

Repository: `github.com/uncrownedprince786-collab/AI-Hackathon`

## Stack

- Next.js 15 (App Router, React 19, TypeScript)
- Tailwind CSS v4 + shadcn-style components + Lucide icons
- Data from Devpost and lablab.ai public pages (refreshed throughout the day, about every 6 hours). A
  retired open-web collector's records are preserved and its sites documented
  in `meta.retiredSources` (see *Source coverage* below)
- JSON file locally, Supabase in production, ISR revalidation (hourly by default)

## Getting started

```bash
npm install
cp .env.example .env.local   # optional: only needed for Supabase
npm run dev
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Local dev server on http://localhost:3000 |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run refresh:data` | Re-read the sources and rewrite `src/data/hackathons.json` |
| `npm run scrape:web` | Manual open-web collector (Puppeteer, retired from CI) — drafts feed the accuracy engine |
| `npx tsx scripts/generate-post.ts` | Write today's blog article into `content/blog` (no key needed) |
| `node scripts/check-links.mjs` | Crawl every internal link on a running server |

`REFRESH_FORCE=1 npm run refresh:data` re-reads every detail page instead of only
the ones that changed. `REFRESH_LABLAB=0` collects Devpost only.

## Data flow

1. `src/lib/sources/devpost.ts` and `src/lib/sources/lablab.ts` read public pages.
2. `src/lib/collector.ts` merges the results with the previous dataset so
   hand-checked data survives, recalculates totals, and saves. It also infers a
   country and region from each published location.
3. `src/lib/sources/accuracy-engine.ts` scores every record behind the scenes:
   is it clearly about AI, does it have valid dates, a working official page, a
   prize figure that makes sense and a clean organizer name. Only records that
   pass are published; the rest are dropped. The scoring never reaches the
   frontend and can only use text the sources already publish.
4. `src/lib/store.ts` writes to Supabase when configured, otherwise to
   `src/data/hackathons.json`.
5. `src/lib/hackathons.ts` reads it back through `unstable_cache` with a 6 hour
   window, and merges `src/data/curated.ts` (verified winners) on top.

Statuses are never stored as truth: they are derived from the dates on every read,
so an event moves from upcoming to ongoing to past on its own.

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Landing page with live, upcoming and winner highlights |
| `/hackathons` | Full filterable list (search, status, mode, cash, credits, sort) |
| `/ongoing`, `/upcoming`, `/past` | Status archives |
| `/hackathons/[slug]` | Event detail, prizes, winners, FAQ |
| `/winners` | Past events with published winning projects |
| `/events` | Upcoming AI events and meetups (Eventbrite, no API key) |
| `/blog` | Short plain-English AI articles, one per day |
| `/blog/[slug]` | A single article |
| `/privacy` | Plain-language notice about the public data we show |
| `/api/health` | Read-only report: service health and per-source freshness |
| `/sitemap.xml`, `/robots.txt` | Generated from the dataset |

## Automatic updates

`.github/workflows/refresh-data.yml` runs throughout the day (cron `17 */6 * * *`,
plus a manual *Run workflow* button): it re-reads the public sources, pushes
them through the accuracy engine, commits `src/data/hackathons.json`, and
pushes. The Vercel Git integration then deploys the new commit. No secrets and
no writable store are required: the dataset lives in the repository, so
Vercel's read-only filesystem is never a problem.

There is no Vercel cron and no `/api/cron/refresh` endpoint anymore. A read-only
**`GET /api/health`** reports service health (is the dataset intact and
computing?) separately from source coverage (are the active sources fresh on
the 6-hour schedule?), plus the documented retired sources. `healthy` is true
only when both hold.

### Source coverage

| Site | Status | Role |
| --- | --- | --- |
| Devpost | active, every 6 h | main listing + detail enrichment |
| lablab.ai | active, every 6 h | secondary listing |
| deep-tech-week | retired 2026-10-11 | 1 retained record (London AI x Science Hackathon 2026) |
| upenn | retired 2026-10-11 | 1 retained record (Wharton Hack-AI-thon 2027) |
| vercel | retired 2026-10-11 | 1 draft never cleared the accuracy gate |

Retired sites are listed in `meta.retiredSources` with their last-collected
timestamps and the reason, and never count against coverage — so a historical
source can't read as "active but silently stale". Their records stay in the
dataset under each site's own name. `.github/workflows/daily-collect.yml` (the
Puppeteer open-web collector) is kept as a manual-only tool: it stopped
completing in CI on Oct 8 2026 because the search engines it relies on block
datacenter IPs, and produced only ~2 retained records in its lifetime.

### Daily blog article

`.github/workflows/daily-article.yml` runs `scripts/generate-post.ts` once a day
(cron `23 5 * * *`). It writes one markdown file into `content/blog/` from a
fixed set of plain-English templates, using only facts taken from the dataset,
and commits it, which triggers a new Vercel deployment. It only ever creates a
file for the current day, so it can never overwrite an article, and it needs no
API key.

Every article also gets a keyword-matched **"Today in AI"** section
(`scripts/ai-news.ts`): the day's real headlines from established AI outlets
(arXiv, Hugging Face, The Verge, TechCrunch, MIT News, The Decoder), each one a
linked headline with nothing added — and any `$` figure is stripped so the
article's fact-check gate is never tripped. If the feeds fail, the last good
cache (72h) is reused and, failing that, the section is simply omitted: the
daily article never depends on external availability. Frontmatter is enriched
with per-topic SEO keywords plus fresh news terms, and rendered as `<meta
name="keywords">` on each article page.

## Supabase (optional legacy writes)

Production refreshes commit straight to the repository (see *Automatic
updates*), so a writable database is not needed. The old code path in
`src/lib/store.ts` can still mirror to Supabase if configured:

1. Create a Supabase project.
2. Add these Vercel **production** env vars:
   - `SUPABASE_URL` — project URL
   - `SUPABASE_SERVICE_ROLE_KEY` — service role key (writes need it; the anon key
     can only read)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — optional, reads only

Without those, the site serves the committed JSON dataset.

## Deploy

```bash
vercel --prod --scope <your-team>
```

`NEXT_PUBLIC_SITE_URL` must match the deployed URL so canonical links, the sitemap
and the Open Graph image resolve correctly.

## Adding a hackathon by hand

Add an entry to `src/data/curated.ts`. Curated records are merged last, so they
win over scraped values and are never overwritten by a refresh. Use this for
events whose winners are published.

## Data honesty

- Cash and credits are tracked separately and shown separately.
- Nothing is invented: no prize figure and no winner name is added unless the
  organizer published it.
- Blog articles are evergreen explainers: no news, no version numbers, no
  citations that were not checked.
- Every record keeps `officialUrl` and `sourceUrl`.
