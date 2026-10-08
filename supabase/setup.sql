-- Site Map Creator: cloud save, open and short share links.
--
-- Paste this whole file into Supabase > SQL Editor > New query and click Run.
-- It is safe to run again: it only creates things that are missing and
-- replaces the functions and policies.
--
-- Who can do what:
--   * Anyone signed in with an @singletrack.com.au email can list, open,
--     save, update and delete maps (the whole ops team shares one library).
--   * Anyone else, signed in or not, can only open a map through its short
--     link, using get_shared_map(slug). They can't list or browse maps.

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

-- True when the signed-in user has a SingleTrack email address.
create or replace function public.site_maps_is_staff()
returns boolean
language sql
stable
as $$
  select coalesce(lower(auth.jwt() ->> 'email') like '%@singletrack.com.au', false);
$$;

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
