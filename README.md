# AI Hackathons

All AI hackathons in one place — prizes, winners and upcoming events.

Live site: **https://ai-hackathons-tawny.vercel.app**

A public, read-only directory of AI hackathons. No login, no signup, no admin.
A scheduled job re-reads public event listings every 6 hours, works out each
event's status from its dates, and refreshes every page.

Repository: `github.com/uncrownedprince786-collab/AI-Hackathon`

## Stack

- Next.js 15 (App Router, React 19, TypeScript)
- Tailwind CSS v4 + shadcn-style components + Lucide icons
- Data from Devpost and lablab.ai public pages
- JSON file locally, Supabase in production, ISR revalidation every 6 hours

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
| `npx tsx scripts/generate-post.ts` | Write today's blog article into `content/blog` (needs a free AI key) |
| `node scripts/check-links.mjs` | Crawl every internal link on a running server |

`REFRESH_FORCE=1 npm run refresh:data` re-reads every detail page instead of only
the ones that changed. `REFRESH_LABLAB=0` collects Devpost only.

## Data flow

1. `src/lib/sources/devpost.ts` and `src/lib/sources/lablab.ts` read public pages.
2. `src/lib/collector.ts` merges the results with the previous dataset so
   hand-checked data survives, recalculates totals, and saves. It also infers a
   country and region from each published location.
3. When a free AI key is set, `src/lib/sources/llm-review.ts` sends only the new
   or changed records to a free language model, which may confirm that a listing
   is really an AI event, that its dates make sense, and that a stated prize or
   organizer was not missed. It can only repeat what the source already says, and
   results are cached on a content hash so nothing is sent twice.
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
| `/stats` | Totals by status, mode, prize type, country and region |
| `/how-we-collect-data` | Sources, method and FAQ |
| `/submit` | Public submission form |
| `/api/data` | Whole dataset as JSON, no key |
| `/api/submit` | `POST` for the submission form |
| `/api/cron/refresh` | Refresh endpoint, called by cron every 6 hours |
| `/sitemap.xml`, `/robots.txt` | Generated from the dataset |

## Automatic updates

`GET` or `POST /api/cron/refresh` reads the public sources, saves the dataset, then
calls `revalidateTag` and `revalidatePath` so every cached page picks up the new
numbers. It requires `Authorization: Bearer <CRON_SECRET>`.

It is called from two places:

1. **GitHub Actions**, every 6 hours — `.github/workflows/refresh-data.yml`
   (cron `17 */6 * * *`, plus a manual *Run workflow* button). This is what keeps
   the 6-hour cadence.
2. **Vercel Cron**, once a day at 09:00 UTC — `vercel.json`. Vercel's Hobby plan
   rejects anything more frequent than daily, so this is only a backstop. On the
   Pro plan, change the schedule in `vercel.json` to `0 */6 * * *` and delete the
   workflow if you prefer to keep everything in Vercel.

The endpoint answers `503` with a `warning` field when it collected successfully but
could not save, which is what happens on Vercel before Supabase is configured. The
workflow treats any non-`200` as a failure so it is visible in the Actions log.

### GitHub Actions secrets

| Secret | Value |
| --- | --- |
| `SITE_URL` | `https://ai-hackathons-tawny.vercel.app` (a repository variable works too) |
| `CRON_SECRET` | The same value as the Vercel `CRON_SECRET` env var |

### Free AI accuracy check (optional)

Set one of these where the refresh runs (Vercel project env vars, or `.env.local`
locally) and the collector will send changed records to a free language model
before saving:

| Var | Notes |
| --- | --- |
| `GROQ_API_KEY` | Preferred. Free tier, model `llama-3.3-70b-versatile` |
| `GEMINI_API_KEY` | Fallback, model `gemini-2.0-flash` |
| `GROQ_MODEL`, `GEMINI_MODEL` | Optional model overrides |
| `LLM_REVIEW_LIMIT` | Optional, max records per run (default 400) |

Rules built into the check: it may only keep, reject or restate values that are
literally in the source text, it never writes a prize or a winner that the
organizer did not publish, a failure falls back to the normal rules, and each
record's content hash is stored so unchanged records are never sent again.
Without a key the refresh logs `ai review skipped` and continues.

### Daily blog article

`.github/workflows/daily-article.yml` runs `scripts/generate-post.ts` once a day
with `GROQ_API_KEY` or `GEMINI_API_KEY`, writes a markdown file into
`content/blog/` and commits it, which triggers a new Vercel deployment. It only
ever creates a file for the current day, so it can never overwrite an article.
Add the key as a repository secret for this to run.

## Supabase (required for production writes)

Vercel's filesystem is read-only, so both the refresh and the submission form need a
writable store.

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the SQL editor.
3. Add these Vercel **production** env vars:
   - `SUPABASE_URL` — project URL
   - `SUPABASE_SERVICE_ROLE_KEY` — service role key (writes need it; the anon key
     can only read)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — optional, reads only
4. Redeploy, then call the refresh endpoint once to confirm `storage: "supabase"`.

Without those, the site still serves the committed JSON dataset, but the cron and
the submit form will report that they could not save.

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
- The optional language-model check can only drop a listing or restate values
  that appear in the source text. It cannot add a prize, a date or a winner.
- Blog articles are evergreen explainers: no news, no version numbers, no
  citations that were not checked.
- Every record keeps `officialUrl` and `sourceUrl`.
