-- Saved transcripts (one row per capture session the user chose to keep)
-- and saved vocabulary (individual words/phrases clicked in the caption
-- overlay) — the two pieces of "language learning" persistence described in
-- the MVP scope (README.md: caption export, vocabulary saving).
create table public.transcripts (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references auth.users(id) on delete cascade not null,
  video_id          text not null,
  video_title       text,
  video_url         text,
  spoken_language   text not null,
  caption_language  text,
  -- Ordered list of { text, offsetMs } segments — offsetMs is milliseconds
  -- since the first segment, used to reconstruct rough timing on export.
  segments          jsonb not null default '[]'::jsonb,
  created_at        timestamptz not null default now()
);

alter table public.transcripts enable row level security;

create policy "Users can read own transcripts"
  on public.transcripts for select using (auth.uid() = user_id);

create policy "Users can insert own transcripts"
  on public.transcripts for insert with check (auth.uid() = user_id);

create policy "Users can delete own transcripts"
  on public.transcripts for delete using (auth.uid() = user_id);

create index transcripts_user_id_created_at_idx
  on public.transcripts (user_id, created_at desc);

-- Vocabulary — a word or short phrase saved from the caption overlay, with
-- the sentence it appeared in for context.
create table public.vocabulary (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users(id) on delete cascade not null,
  word         text not null,
  context      text,
  language     text,
  video_id     text,
  video_title  text,
  created_at   timestamptz not null default now()
);

alter table public.vocabulary enable row level security;

create policy "Users can read own vocabulary"
  on public.vocabulary for select using (auth.uid() = user_id);

create policy "Users can insert own vocabulary"
  on public.vocabulary for insert with check (auth.uid() = user_id);

create policy "Users can delete own vocabulary"
  on public.vocabulary for delete using (auth.uid() = user_id);

create index vocabulary_user_id_created_at_idx
  on public.vocabulary (user_id, created_at desc);
