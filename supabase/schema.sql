-- AI Hackathons — optional storage for the dataset and submissions.
-- Run this once in the Supabase SQL editor, then set the env vars in Vercel.

create table if not exists public.hackathons (
  id bigint generated always as identity primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.submissions (
  id bigint generated always as identity primary key,
  name text not null,
  organizer text not null,
  official_url text not null,
  start_date date not null,
  end_date date not null,
  prize_pool text,
  mode text not null,
  email text,
  notes text,
  submitted_at timestamptz not null default now()
);

-- The dataset is public: everyone can read the site, so the row must be too.
alter table public.hackathons enable row level security;

drop policy if exists "hackathons are public" on public.hackathons;
create policy "hackathons are public"
  on public.hackathons for select
  using (true);

-- Submissions are write-only from the site: nobody reads them without the
-- service role key, and the public cannot insert or update rows.
alter table public.submissions enable row level security;
