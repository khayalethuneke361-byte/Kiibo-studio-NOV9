-- Kiibo Control, database part 7. Run it ONCE in the Supabase SQL Editor (after parts 1 to 6).

-- phones: one row per account per phone (nobody can read this table from an app, only the functions below)
create table if not exists public.user_devices (
  user_id uuid not null references auth.users on delete cascade,
  device_id text not null,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  primary key (user_id, device_id)
);
alter table public.user_devices enable row level security;

-- called by Kiibo Studios when someone opens the app
create or replace function public.touch_device(p_device text) returns void
language sql security definer set search_path = public as $$
  update public.profiles set last_seen = now() where id = auth.uid();
  insert into public.user_devices (user_id, device_id)
  select auth.uid(), left(p_device, 40) where auth.uid() is not null and p_device is not null
  on conflict (user_id, device_id) do update set last_seen = now();
$$;

-- every account, with club, role and phones
create or replace function public.admin_users()
returns table (user_id uuid, email text, full_name text, last_seen timestamptz, created_at timestamptz,
               banned boolean, club_id uuid, club_name text, role text, status text, devices text[])
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not public.is_platform_admin() then raise exception 'Not allowed'; end if;
  return query
  select p.id, p.email, p.full_name, p.last_seen, p.created_at,
         coalesce((select u.banned_until > now() from auth.users u where u.id = p.id), false),
         m.club_id, c.name, m.role::text, m.status,
         coalesce((select array_agg(d.device_id) from public.user_devices d where d.user_id = p.id), '{}')
  from public.profiles p
  left join lateral (select x.* from public.club_members x where x.user_id = p.id
                     order by (x.status = 'active') desc, x.created_at desc limit 1) m on true
  left join public.clubs c on c.id = m.club_id
  order by p.last_seen desc nulls last;
end $$;

-- ban or unban (a ban also signs the person out of every phone)
create or replace function public.admin_set_ban(p_user uuid, p_ban boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'Not allowed'; end if;
  if p_user = auth.uid() or exists (select 1 from public.platform_admins where user_id = p_user) then
    raise exception 'You cannot ban a platform owner'; end if;
  update auth.users set banned_until = case when p_ban then 'infinity'::timestamptz else null end where id = p_user;
  if p_ban then
    begin delete from auth.sessions where user_id = p_user; exception when others then null; end;
  end if;
  insert into public.audit_log (user_id, action, detail)
  values (auth.uid(), case when p_ban then 'admin_ban' else 'admin_unban' end,
          (select email from public.profiles where id = p_user));
end $$;

-- remove a person from a club
create or replace function public.admin_remove_member(p_user uuid, p_club uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'Not allowed'; end if;
  update public.club_members set status = 'removed' where user_id = p_user and club_id = p_club;
  insert into public.audit_log (club_id, user_id, action, detail)
  values (p_club, auth.uid(), 'admin_remove', (select email from public.profiles where id = p_user));
end $$;

-- latest activity across all clubs
create or replace function public.admin_activity()
returns table (created_at timestamptz, action text, detail text, club_name text, email text)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not public.is_platform_admin() then raise exception 'Not allowed'; end if;
  return query
  select a.created_at, a.action, a.detail, c.name, p.email
  from public.audit_log a
  left join public.clubs c on c.id = a.club_id
  left join public.profiles p on p.id = a.user_id
  order by a.created_at desc limit 100;
end $$;

-- who may call what
revoke all on function public.touch_device(text) from public, anon;
revoke all on function public.admin_users() from public, anon;
revoke all on function public.admin_set_ban(uuid, boolean) from public, anon;
revoke all on function public.admin_remove_member(uuid, uuid) from public, anon;
revoke all on function public.admin_activity() from public, anon;
grant execute on function public.touch_device(text) to authenticated;
grant execute on function public.admin_users() to authenticated;
grant execute on function public.admin_set_ban(uuid, boolean) to authenticated;
grant execute on function public.admin_remove_member(uuid, uuid) to authenticated;
grant execute on function public.admin_activity() to authenticated;
-- the club functions from part 3 and the helper checks need the same permission
grant execute on all functions in schema public to authenticated;
