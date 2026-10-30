-- Peranan Bendahari: akses baca/tulis khusus transaksi kewangan, tanpa kuasa admin.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('resident','ajk','bendahari','admin'));

create or replace function public.is_finance_manager()
returns boolean language sql stable security definer set search_path = public, auth
as $$
  select exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid()
      and p.approval_status = 'approved'
      and p.role in ('bendahari','admin')
  );
$$;

create or replace function public.get_app_snapshot()
returns jsonb language plpgsql stable security definer set search_path = public, auth
as $$
declare
  v_data jsonb;
  v_profile public.profiles%rowtype;
  v_house smallint;
begin
  if not public.is_approved_member() then
    raise exception 'Akaun belum diluluskan atau belum dipautkan kepada rumah.';
  end if;
  select * into v_profile from public.profiles where user_id = auth.uid();
  select data into v_data from public.community_state where state_key = 'impiria29';
  if v_data is null then return null; end if;
  if v_profile.role = 'admin' then return v_data; end if;
  if v_profile.role = 'bendahari' then
    return jsonb_build_object(
      'announcements',coalesce(v_data->'announcements','[]'::jsonb),
      'events',coalesce(v_data->'events','[]'::jsonb),
      'committee',coalesce(v_data->'committee','[]'::jsonb),
      'committeeRoles',coalesce(v_data->'committeeRoles','[]'::jsonb),
      'committeeTerm',coalesce(v_data->'committeeTerm','""'::jsonb),
      'committeeHistory',coalesce(v_data->'committeeHistory','[]'::jsonb),
      'polls',coalesce(v_data->'polls','[]'::jsonb),
      'households','[]'::jsonb,
      'residentBlocks',coalesce((select jsonb_agg(jsonb_build_object('id',b->>'id','number',b->>'number','status',b->>'status') order by (b->>'number')::int) from jsonb_array_elements(coalesce(v_data->'residentBlocks','[]'::jsonb)) b),'[]'::jsonb),
      'residentNotices',coalesce((select jsonb_agg(n) from jsonb_array_elements(coalesce(v_data->'residentNotices','[]'::jsonb)) n where n->>'status'='published' and n->>'audience'='Semua penduduk'),'[]'::jsonb),
      'transactions',coalesce(v_data->'transactions','[]'::jsonb),
      'auditLogs','[]'::jsonb
    );
  end if;
  v_house := v_profile.house_number;
  if v_profile.role = 'ajk' then
    return v_data || jsonb_build_object('transactions','[]'::jsonb,'auditLogs','[]'::jsonb);
  end if;
  return jsonb_build_object(
    'announcements',coalesce(v_data->'announcements','[]'::jsonb),
    'events',coalesce(v_data->'events','[]'::jsonb),
    'committee',coalesce(v_data->'committee','[]'::jsonb),
    'committeeRoles',coalesce(v_data->'committeeRoles','[]'::jsonb),
    'committeeTerm',coalesce(v_data->'committeeTerm','""'::jsonb),
    'committeeHistory',coalesce(v_data->'committeeHistory','[]'::jsonb),
    'polls',coalesce(v_data->'polls','[]'::jsonb),
    'households',coalesce((select jsonb_agg(h) from jsonb_array_elements(coalesce(v_data->'households','[]'::jsonb)) h where coalesce(h->>'unit','') = v_house::text),'[]'::jsonb),
    'residentBlocks',coalesce((select jsonb_agg(case when coalesce(b->>'number','') = v_house::text then b else jsonb_build_object('id',b->>'id','number',b->>'number','status',b->>'status') end order by (b->>'number')::int) from jsonb_array_elements(coalesce(v_data->'residentBlocks','[]'::jsonb)) b),'[]'::jsonb),
    'residentNotices',coalesce((select jsonb_agg(n) from jsonb_array_elements(coalesce(v_data->'residentNotices','[]'::jsonb)) n where (n->>'status'='published' and n->>'audience'='Semua penduduk') or coalesce(n->>'submitterUnit','')=v_house::text),'[]'::jsonb),
    'transactions','[]'::jsonb,
    'auditLogs','[]'::jsonb
  );
end;
$$;

create or replace function public.save_app_snapshot(p_data jsonb)
returns void language plpgsql security definer set search_path = public, auth
as $$
declare
  v_old jsonb;
begin
  if not public.is_ajk() and not public.is_finance_manager() then
    raise exception 'Akaun tidak dibenarkan menyimpan data komuniti.';
  end if;
  if jsonb_typeof(p_data) <> 'object' then
    raise exception 'Format data tidak sah.';
  end if;
  select data into v_old from public.community_state where state_key='impiria29' for update;
  if v_old is null then raise exception 'Data komuniti belum disediakan.'; end if;

  -- Bendahari boleh mengubah senarai transaksi sahaja. Semua data lain kekal.
  if public.is_finance_manager() and not public.is_admin() and not public.is_ajk() then
    if coalesce(jsonb_typeof(p_data->'transactions'),'null') <> 'array' then
      raise exception 'Senarai transaksi tidak sah.';
    end if;
    update public.community_state
       set data=jsonb_set(v_old,'{transactions}',p_data->'transactions',true),
           updated_by=auth.uid(),updated_at=now()
     where state_key='impiria29';
    return;
  end if;

  if not public.is_admin() then
    p_data := p_data || jsonb_build_object(
      'transactions',coalesce(v_old->'transactions','[]'::jsonb),
      'auditLogs',coalesce(v_old->'auditLogs','[]'::jsonb)
    );
  end if;
  if jsonb_typeof(p_data->'polls')='array' then
    p_data := jsonb_set(p_data,'{polls}',coalesce((select jsonb_agg(p - 'votes') from jsonb_array_elements(p_data->'polls') p),'[]'::jsonb));
  end if;
  insert into public.community_state(state_key,data,updated_by,updated_at)
    values ('impiria29',p_data,auth.uid(),now())
    on conflict (state_key) do update set data=excluded.data,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
end;
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
  if p_role is null or p_role not in ('resident','ajk','bendahari','admin') then
    raise exception 'Peranan tidak sah.';
  end if;

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
