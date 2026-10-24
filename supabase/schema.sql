-- ============================================================
-- Little Memories Club — database + storage setup (PRIVATE WALLS)
-- Paste this whole file into: Supabase Dashboard -> SQL Editor -> Run
-- Safe to re-run. Also upgrades the older "one public wall" version:
-- old public memories are removed (they belonged to no account).
-- ============================================================

-- 1) Walls: every account owns exactly one wall, opened with a secret share link.
create table if not exists public.walls (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null unique references auth.users(id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 60),
  share_token text not null unique check (share_token ~ '^[0-9a-f]{32}$'),
  created_at  timestamptz not null default now()
);
alter table public.walls enable row level security;
revoke all on table public.walls from anon, authenticated;

-- 2) Memories: belong to a wall.
create table if not exists public.memories (
  id           uuid primary key default gen_random_uuid(),
  wall_id      uuid references public.walls(id) on delete cascade,
  caption      text not null check (char_length(caption) between 1 and 500),
  display_name text check (display_name is null or char_length(display_name) <= 40),
  memory_date  date,
  images       jsonb not null
               check (jsonb_typeof(images) = 'array'
                      and jsonb_array_length(images) between 1 and 6),
  like_count   integer not null default 0,
  created_at   timestamptz not null default now()
);
-- upgrade path from the old single-wall version
alter table public.memories add column if not exists wall_id uuid references public.walls(id) on delete cascade;
alter table public.memories add column if not exists like_count integer not null default 0;
delete from public.memories where wall_id is null;
alter table public.memories alter column wall_id set not null;

create index if not exists memories_wall_idx on public.memories (wall_id, created_at desc, id desc);

-- Nobody can read or write these tables straight from the browser.
-- ALL access goes through the Edge Functions (which check the share link / login).
alter table public.memories enable row level security;
drop policy if exists "memories are publicly readable" on public.memories;
revoke all on table public.memories from anon, authenticated;

drop table if exists public.memory_secrets;   -- replaced by real accounts

-- 3) Likes (one per device per memory).
create table if not exists public.likes (
  memory_id  uuid not null references public.memories(id) on delete cascade,
  voter_id   text not null check (char_length(voter_id) between 8 and 64),
  created_at timestamptz not null default now(),
  primary key (memory_id, voter_id)
);
alter table public.likes enable row level security;
revoke all on table public.likes from anon, authenticated;

create or replace function public.bump_like_count() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.memories set like_count = like_count + 1 where id = new.memory_id;
  elsif tg_op = 'DELETE' then
    update public.memories set like_count = greatest(like_count - 1, 0) where id = old.memory_id;
  end if;
  return null;
end $$;

drop trigger if exists likes_count on public.likes;
create trigger likes_count after insert or delete on public.likes
  for each row execute function public.bump_like_count();

-- 4) Rate limiting log (uploads per account, likes per network address).
create table if not exists public.upload_attempts (
  id         bigint generated always as identity primary key,
  ip_hash    text not null,
  created_at timestamptz not null default now()
);
alter table public.upload_attempts add column if not exists kind text not null default 'upload';
create index if not exists upload_attempts_ip_idx on public.upload_attempts (ip_hash, created_at desc);
alter table public.upload_attempts enable row level security;
revoke all on table public.upload_attempts from anon, authenticated;

-- 5) Storage bucket: PRIVATE. Pictures are only shown through short-lived
--    signed links that the Edge Functions hand out to people who have the wall link.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'memories', 'memories', false, 8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
