-- Senarai, kemaskini dan padam akaun penduduk melalui frontend AJK/admin.


create or replace function public.list_managed_accounts()
returns table(
  user_id uuid,
  email text,
  full_name text,
  phone text,
  requested_house_number smallint,
  house_number smallint,
  role text,
  approval_status text,
  created_at timestamptz
)
language sql stable security definer set search_path = public, auth
as $$
  select p.user_id, coalesce(u.email,''), p.full_name, p.phone,
         p.requested_house_number, p.house_number, p.role, p.approval_status, p.created_at
    from public.profiles p
    join auth.users u on u.id = p.user_id
   where public.is_ajk()
     and (public.is_admin() or p.role <> 'admin')
   order by p.created_at desc;
$$;

create or replace function public.update_managed_account(
  p_user_id uuid,
  p_full_name text,
  p_phone text,
  p_house_number smallint,
  p_approval_status text,
  p_role text
)
returns void
language plpgsql security definer set search_path = public, auth
as $$
declare
  v_target_role text;
begin
  if not public.is_ajk() then raise exception 'Hanya AJK atau admin boleh mengurus akaun.'; end if;
  if coalesce(trim(p_full_name),'') = '' or coalesce(trim(p_phone),'') = '' then
    raise exception 'Nama dan nombor telefon wajib diisi.';
  end if;
  if p_house_number is not null and p_house_number not between 1 and 43 then
    raise exception 'Nombor rumah tidak sah.';
  end if;
  if p_approval_status is null or p_approval_status not in ('pending','approved','rejected') then
    raise exception 'Status kelulusan tidak sah.';
  end if;
  if p_approval_status = 'approved' and p_house_number is null then
    raise exception 'Pilih nombor rumah sebelum meluluskan akaun.';
  end if;
  if p_role is null or p_role not in ('resident','ajk','admin') then raise exception 'Peranan tidak sah.'; end if;

  select p.role into v_target_role from public.profiles p where p.user_id=p_user_id for update;
  if not found then raise exception 'Akaun tidak ditemui.'; end if;
  if not public.is_admin() and v_target_role='admin' then
    raise exception 'AJK tidak boleh mengubah akaun admin.';
  end if;
  if not public.is_admin() and p_role<>v_target_role then
    raise exception 'Hanya admin boleh menukar peranan akaun.';
  end if;
  if p_role='admin' and not public.is_admin() then
    raise exception 'Hanya admin boleh memberikan peranan admin.';
  end if;
  if p_user_id=auth.uid() and (p_role<>'admin' or p_approval_status<>'approved' or p_house_number is null) then
    raise exception 'Akaun sendiri tidak boleh dinyahaktifkan atau diturunkan peranannya.';
  end if;

  update public.profiles
     set full_name=trim(p_full_name), phone=trim(p_phone), house_number=p_house_number,
         approval_status=p_approval_status, role=p_role
   where user_id=p_user_id;
end;
$$;

create or replace function public.delete_managed_account(p_user_id uuid)
returns void
language plpgsql security definer set search_path = public, auth
as $$
declare
  v_target_role text;
  v_active_admins integer;
begin
  if not public.is_ajk() then raise exception 'Hanya AJK atau admin boleh memadam akaun.'; end if;
  if p_user_id=auth.uid() then raise exception 'Anda tidak boleh memadam akaun yang sedang digunakan.'; end if;
  select p.role into v_target_role from public.profiles p where p.user_id=p_user_id for update;
  if not found then raise exception 'Akaun tidak ditemui.'; end if;
  if v_target_role='admin' and not public.is_admin() then
    raise exception 'AJK tidak boleh memadam akaun admin.';
  end if;
  if v_target_role='admin' then
    select count(*) into v_active_admins from public.profiles
     where role='admin' and approval_status='approved' and house_number between 1 and 43;
    if v_active_admins <= 1 then raise exception 'Admin terakhir tidak boleh dipadam.'; end if;
  end if;
  delete from auth.users where id=p_user_id;
  if not found then raise exception 'Akaun log masuk tidak ditemui.'; end if;
end;
$$;

revoke all on function public.list_managed_accounts(),public.update_managed_account(uuid,text,text,smallint,text,text),public.delete_managed_account(uuid) from public,anon;
grant execute on function public.list_managed_accounts(),public.update_managed_account(uuid,text,text,smallint,text,text),public.delete_managed_account(uuid) to authenticated;
