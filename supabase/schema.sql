-- Lesemaus – Supabase schema
-- Supabase Dashboard → SQL Editor → New query → paste everything → Run.

create extension if not exists pgcrypto;

-- ---------- Tables ----------
create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  invite_code text not null unique default upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 10)),
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  bio text not null default '' check (char_length(bio) <= 140),
  avatar text not null default '☾' check (char_length(avatar) <= 4),
  color text not null default '#b8a4ff' check (color ~ '^#[0-9a-fA-F]{6}$'),
  goal int not null default 24 check (goal between 1 and 999),
  group_id uuid references public.groups on delete set null,
  data jsonb not null default '{}'::jsonb check (pg_column_size(data) < 4000000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_group_idx on public.profiles (group_id);

-- ---------- Helpers ----------
-- security definer avoids RLS recursion when policies need the caller's group
create or replace function public.my_group()
returns uuid language sql stable security definer set search_path = public as $$
  select group_id from public.profiles where id = auth.uid()
$$;

-- ---------- Row Level Security ----------
alter table public.groups enable row level security;
alter table public.profiles enable row level security;

drop policy if exists "read own and group profiles" on public.profiles;
create policy "read own and group profiles" on public.profiles for select to authenticated
  using (id = auth.uid() or (group_id is not null and group_id = public.my_group()));

drop policy if exists "insert own profile" on public.profiles;
create policy "insert own profile" on public.profiles for insert to authenticated
  with check (id = auth.uid() and group_id is null);

drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "delete own profile" on public.profiles;
create policy "delete own profile" on public.profiles for delete to authenticated
  using (id = auth.uid());

drop policy if exists "read own group" on public.groups;
create policy "read own group" on public.groups for select to authenticated
  using (id = public.my_group());

-- Column-level privileges: group membership can only change through the functions below.
revoke all on public.profiles from anon, authenticated;
revoke all on public.groups from anon, authenticated;
grant select, delete on public.profiles to authenticated;
grant insert (id, name, bio, avatar, color, goal, data) on public.profiles to authenticated;
grant update (name, bio, avatar, color, goal, data, updated_at) on public.profiles to authenticated;
grant select on public.groups to authenticated;

-- ---------- Group functions ----------
create or replace function public.create_group(group_name text)
returns public.groups language plpgsql security definer set search_path = public as $$
declare g public.groups;
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet'; end if;
  insert into public.groups (name, created_by) values (trim(group_name), auth.uid()) returning * into g;
  update public.profiles set group_id = g.id where id = auth.uid();
  return g;
end $$;

create or replace function public.join_group(code text)
returns public.groups language plpgsql security definer set search_path = public as $$
declare g public.groups;
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet'; end if;
  select * into g from public.groups where invite_code = upper(trim(code));
  if not found then raise exception 'Ungültiger Einladungscode'; end if;
  update public.profiles set group_id = g.id where id = auth.uid();
  return g;
end $$;

create or replace function public.leave_group()
returns void language sql security definer set search_path = public as $$
  update public.profiles set group_id = null where id = auth.uid();
$$;

revoke execute on function public.my_group(), public.create_group(text), public.join_group(text), public.leave_group() from public, anon;
grant execute on function public.my_group(), public.create_group(text), public.join_group(text), public.leave_group() to authenticated;
