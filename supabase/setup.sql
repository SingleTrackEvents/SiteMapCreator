-- Site Map Creator: cloud save, open and short share links.
--
-- Paste this whole file into Supabase > SQL Editor > New query and click Run.
-- It is safe to run again: it only creates things that are missing and
-- replaces the functions and policies.
--
-- Who can do what:
--   * Team members (people who created an account and entered the team
--     join code) can list, open, save, update and delete maps. The whole
--     ops team shares one library.
--   * Anyone else, signed in or not, can only open a map through its short
--     link, using get_shared_map(slug). They can't list or browse maps.
--
-- The join code itself is NOT in this file (this file is public on
-- GitHub). Set it separately in the SQL Editor:
--   insert into public.site_maps_settings (id, join_code) values (1, 'your-code')
--   on conflict (id) do update set join_code = excluded.join_code;

create extension if not exists pgcrypto;

create table if not exists public.site_maps (
  id uuid primary key default gen_random_uuid(),
  -- 12 random hex characters, used in short links (?m=slug)
  slug text not null unique default substr(encode(gen_random_bytes(8), 'hex'), 1, 12),
  name text not null default 'Untitled map',
  data jsonb not null,
  created_by_email text default (auth.jwt() ->> 'email'),
  updated_by_email text default (auth.jwt() ->> 'email'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Keep updated_at and updated_by_email current on every save.
create or replace function public.site_maps_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.updated_by_email := auth.jwt() ->> 'email';
  return new;
end;
$$;

drop trigger if exists site_maps_touch on public.site_maps;
create trigger site_maps_touch
  before update on public.site_maps
  for each row execute function public.site_maps_touch();

-- Team members: people who have entered the join code.
create table if not exists public.site_maps_members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text,
  joined_at timestamptz not null default now()
);
alter table public.site_maps_members enable row level security;
revoke all on public.site_maps_members from anon, authenticated;

-- One row holding the team join code. Nobody can read it through the API.
create table if not exists public.site_maps_settings (
  id int primary key default 1 check (id = 1),
  join_code text not null
);
alter table public.site_maps_settings enable row level security;
revoke all on public.site_maps_settings from anon, authenticated;

-- True when the signed-in user is a team member.
create or replace function public.site_maps_is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.site_maps_members where user_id = auth.uid());
$$;
revoke all on function public.site_maps_is_staff() from public, anon;
grant execute on function public.site_maps_is_staff() to authenticated;

-- Joins the team when the code matches. Returns true on success.
create or replace function public.site_maps_join(p_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  ok boolean;
begin
  if auth.uid() is null then
    return false;
  end if;
  select exists (
    select 1 from public.site_maps_settings
    where lower(trim(join_code)) = lower(trim(coalesce(p_code, '')))
  ) into ok;
  if ok then
    insert into public.site_maps_members (user_id, email)
    values (auth.uid(), auth.jwt() ->> 'email')
    on conflict (user_id) do nothing;
  end if;
  return ok;
end;
$$;
revoke all on function public.site_maps_join(text) from public, anon;
grant execute on function public.site_maps_join(text) to authenticated;

alter table public.site_maps enable row level security;

-- The data API needs table rights; the policies below decide which rows.
revoke all on public.site_maps from anon;
grant select, insert, update, delete on public.site_maps to authenticated;

drop policy if exists "staff read maps" on public.site_maps;
drop policy if exists "staff add maps" on public.site_maps;
drop policy if exists "staff update maps" on public.site_maps;
drop policy if exists "staff delete maps" on public.site_maps;

create policy "staff read maps" on public.site_maps
  for select to authenticated using (public.site_maps_is_staff());
create policy "staff add maps" on public.site_maps
  for insert to authenticated with check (public.site_maps_is_staff());
create policy "staff update maps" on public.site_maps
  for update to authenticated using (public.site_maps_is_staff()) with check (public.site_maps_is_staff());
create policy "staff delete maps" on public.site_maps
  for delete to authenticated using (public.site_maps_is_staff());

-- Opening a short link: returns one map by its slug, for anyone.
-- Runs with the owner's rights so it can read past the policies above,
-- but only ever returns the single map whose slug was given.
create or replace function public.get_shared_map(p_slug text)
returns table (name text, data jsonb, updated_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select m.name, m.data, m.updated_at
  from public.site_maps m
  where m.slug = p_slug
  limit 1;
$$;

revoke all on function public.get_shared_map(text) from public;
grant execute on function public.get_shared_map(text) to anon, authenticated;

notify pgrst, 'reload schema';
