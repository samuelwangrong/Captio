-- Public profiles — one row per auth.users entry.
-- Kept minimal for MVP: display name + tier only.
create table public.profiles (
  id           uuid references auth.users(id) on delete cascade primary key,
  display_name text,
  tier         text not null default 'free' check (tier in ('free', 'pro')),
  created_at   timestamptz default now() not null,
  updated_at   timestamptz default now() not null
);

alter table public.profiles enable row level security;

create policy "Users can read own profile"
  on public.profiles for select using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);

-- Auto-create a profile row whenever a new user signs up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
