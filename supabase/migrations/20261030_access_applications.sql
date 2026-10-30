-- Permohonan penduduk: senarai pending dan kelulusan melalui frontend AJK/admin.
create or replace function public.list_access_applications()
returns table(
  user_id uuid,
  full_name text,
  phone text,
  requested_house_number smallint,
  created_at timestamptz
)
language sql stable security definer set search_path = public, auth
as $$
  select p.user_id,
         p.full_name,
         p.phone,
         coalesce(p.requested_house_number, p.house_number),
         p.created_at
  from public.profiles p
  where public.is_ajk()
    and p.role = 'resident'
    and p.approval_status = 'pending'
  order by p.created_at asc;
$$;

create or replace function public.review_access_application(
  p_user_id uuid,
  p_house_number smallint
)
returns void
language plpgsql security definer set search_path = public, auth
as $$
declare
  v_updated integer;
begin
  if not public.is_ajk() then
    raise exception 'Hanya AJK atau admin boleh meluluskan permohonan.';
  end if;
  if p_house_number is null or p_house_number not between 1 and 43 then
    raise exception 'Nombor rumah tidak sah.';
  end if;

  update public.profiles
     set approval_status = 'approved',
         house_number = p_house_number
   where user_id = p_user_id
     and role = 'resident'
     and approval_status = 'pending';

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'Permohonan tidak ditemui atau sudah diproses.';
  end if;
end;
$$;

revoke all on function public.list_access_applications(),
  public.review_access_application(uuid, smallint) from public, anon;
grant execute on function public.list_access_applications(),
  public.review_access_application(uuid, smallint) to authenticated;