-- Kiibo Control, database part 8. Run it ONCE in the Supabase SQL Editor (after part 7).

-- set a new password for any account (they are also signed out of every phone)
create or replace function public.admin_set_password(p_user uuid, p_password text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'Not allowed'; end if;
  if p_user = auth.uid() or exists (select 1 from public.platform_admins where user_id = p_user) then
    raise exception 'Change a platform owner password in Supabase instead'; end if;
  if p_password is null or length(p_password) < 6 then raise exception 'Use at least 6 characters'; end if;
  update auth.users set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')), updated_at = now()
  where id = p_user;
  begin delete from auth.sessions where user_id = p_user; exception when others then null; end;
  insert into public.audit_log (user_id, action, detail)
  values (auth.uid(), 'admin_password', (select email from public.profiles where id = p_user));
end $$;

-- delete an account for good (their club data such as players and fixtures stays with the club)
create or replace function public.admin_delete_user(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare who text;
begin
  if not public.is_platform_admin() then raise exception 'Not allowed'; end if;
  if p_user = auth.uid() or exists (select 1 from public.platform_admins where user_id = p_user) then
    raise exception 'You cannot delete a platform owner'; end if;
  select email into who from public.profiles where id = p_user;
  insert into public.audit_log (user_id, action, detail) values (auth.uid(), 'admin_delete', who);
  update public.clubs set created_by = null where created_by = p_user;
  update public.fixtures set confirmed_by = null where confirmed_by = p_user;
  update public.media_items set uploaded_by = null where uploaded_by = p_user;
  update public.payments set recorded_by = null where recorded_by = p_user;
  delete from auth.users where id = p_user;
end $$;

revoke all on function public.admin_set_password(uuid, text) from public, anon;
revoke all on function public.admin_delete_user(uuid) from public, anon;
grant execute on function public.admin_set_password(uuid, text) to authenticated;
grant execute on function public.admin_delete_user(uuid) to authenticated;
