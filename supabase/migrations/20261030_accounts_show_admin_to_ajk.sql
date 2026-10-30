-- Let AJK see Admin accounts in the frontend account directory.
-- Existing update/delete RPC guards still prevent an AJK from modifying an Admin.
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
  select p.user_id,
         case when public.is_admin() or p.role <> 'admin' then coalesce(u.email,'') else '' end,
         p.full_name,
         case when public.is_admin() or p.role <> 'admin' then p.phone else null end,
         case when public.is_admin() or p.role <> 'admin' then p.requested_house_number else null end,
         case when public.is_admin() or p.role <> 'admin' then p.house_number else null end,
         p.role, p.approval_status, p.created_at
    from public.profiles p
    join auth.users u on u.id = p.user_id
   where public.is_ajk()
   order by p.created_at desc;
$$;

revoke all on function public.list_managed_accounts() from public, anon;
grant execute on function public.list_managed_accounts() to authenticated;
