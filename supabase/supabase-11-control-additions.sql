-- Kiibo Control 1.1.0, database part 11. Run it ONCE in the Supabase SQL Editor (after parts 1 to 10).
-- It only ADDS things: new functions and one new storage rule. No table, policy, function or row that already exists is changed.
-- It is safe to run again.

-- everything about one club: details, members and payments (platform owners only)
create or replace function public.admin_club_detail(p_club uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'Not allowed'; end if;
  return (
    select jsonb_build_object(
      'id', c.id, 'name', c.name, 'location', c.location, 'join_code', c.join_code,
      'plan', c.plan, 'active', c.active, 'paid_until', c.paid_until, 'grace_days', c.grace_days,
      'created_at', c.created_at, 'teams', to_jsonb(c.teams),
      'members', coalesce((
        select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'email', p.email, 'name', p.full_name,
                 'role', m.role::text, 'status', m.status, 'last_seen', p.last_seen)
               order by (m.status = 'active') desc, m.role::text, p.email)
        from public.club_members m join public.profiles p on p.id = m.user_id where m.club_id = c.id), '[]'::jsonb),
      'payments', coalesce((
        select jsonb_agg(to_jsonb(y) order by y.created_at desc)
        from (select amount, currency, method, note, paid_on, paid_until, created_at
              from public.payments where club_id = c.id order by created_at desc limit 20) y), '[]'::jsonb),
      'media_count', (select count(*) from public.media_items i where i.club_id = c.id)
    ) from public.clubs c where c.id = p_club);
end $$;

-- change a club's name or town
create or replace function public.admin_update_club(p_club uuid, p_name text, p_location text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'Not allowed'; end if;
  if p_name is null or length(trim(p_name)) < 2 then raise exception 'Give the club a name'; end if;
  update public.clubs set name = trim(p_name), location = nullif(trim(coalesce(p_location, '')), '') where id = p_club;
  insert into public.audit_log (club_id, user_id, action, detail) values (p_club, auth.uid(), 'admin_update_club', trim(p_name));
end $$;

-- approve, decline or change the role of one member
create or replace function public.admin_set_member(p_user uuid, p_club uuid, p_role text, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'Not allowed'; end if;
  if p_role not in ('owner', 'coach', 'media') then raise exception 'Unknown role'; end if;
  if p_status not in ('pending', 'active', 'removed') then raise exception 'Unknown status'; end if;
  update public.club_members set role = p_role::public.member_role, status = p_status
   where user_id = p_user and club_id = p_club;
  insert into public.audit_log (club_id, user_id, action, detail)
  values (p_club, auth.uid(), 'admin_set_member', (select email from public.profiles where id = p_user) || ' ' || p_role || ' ' || p_status);
end $$;

-- the stored files (logo, photos, videos) that belong to a club, so the app can clear them
create or replace function public.admin_club_files(p_club uuid) returns text[]
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'Not allowed'; end if;
  return coalesce((select array_agg(o.name) from storage.objects o
                    where o.bucket_id = 'club-media' and o.name like p_club::text || '/%'), '{}');
end $$;

-- delete a club for good: players, fixtures, squads, media records, sport data, payments, announcements and members go with it.
-- p_delete_accounts = true also deletes the accounts that belong to no other club (platform owners are never deleted).
create or replace function public.admin_delete_club(p_club uuid, p_delete_accounts boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare cname text; ids uuid[]; u uuid; n int := 0;
begin
  if not public.is_platform_admin() then raise exception 'Not allowed'; end if;
  select name into cname from public.clubs where id = p_club;
  if cname is null then raise exception 'Club not found'; end if;
  if p_delete_accounts then
    select coalesce(array_agg(m.user_id), '{}') into ids from public.club_members m
     where m.club_id = p_club
       and not exists (select 1 from public.platform_admins a where a.user_id = m.user_id)
       and not exists (select 1 from public.club_members o where o.user_id = m.user_id and o.club_id <> p_club and o.status <> 'removed');
  else ids := '{}'; end if;
  insert into public.audit_log (user_id, action, detail)
  values (auth.uid(), 'admin_delete_club', cname || case when p_delete_accounts then ' (and its accounts)' else '' end);
  delete from public.clubs where id = p_club;
  foreach u in array ids loop
    perform public.admin_delete_user(u);
    n := n + 1;
  end loop;
  return jsonb_build_object('name', cname, 'accounts_deleted', n);
end $$;

-- lets a platform owner remove a deleted club's files from storage
drop policy if exists "platform admin media delete" on storage.objects;
create policy "platform admin media delete" on storage.objects for delete to authenticated
  using (bucket_id = 'club-media' and public.is_platform_admin());

revoke all on function public.admin_club_detail(uuid) from public, anon;
revoke all on function public.admin_update_club(uuid, text, text) from public, anon;
revoke all on function public.admin_set_member(uuid, uuid, text, text) from public, anon;
revoke all on function public.admin_club_files(uuid) from public, anon;
revoke all on function public.admin_delete_club(uuid, boolean) from public, anon;
grant execute on function public.admin_club_detail(uuid) to authenticated;
grant execute on function public.admin_update_club(uuid, text, text) to authenticated;
grant execute on function public.admin_set_member(uuid, uuid, text, text) to authenticated;
grant execute on function public.admin_club_files(uuid) to authenticated;
grant execute on function public.admin_delete_club(uuid, boolean) to authenticated;
