-- Paparkan maklumat direktori isi rumah kepada semua ahli yang diluluskan.
-- Hak kemaskini kekal melalui update_my_household(), yang hanya membenarkan
-- pengguna mengemas kini rumah yang dipautkan pada akaunnya.
create or replace function public.get_app_snapshot()
returns jsonb language plpgsql stable security definer set search_path = public, auth
as $$
declare
  v_data jsonb;
  v_profile public.profiles%rowtype;
  v_house smallint;
  v_households jsonb;
  v_blocks jsonb;
begin
  if not public.is_approved_member() then
    raise exception 'Akaun belum diluluskan atau belum dipautkan kepada rumah.';
  end if;
  select * into v_profile from public.profiles where user_id = auth.uid();
  select data into v_data from public.community_state where state_key = 'impiria29';
  if v_data is null then return null; end if;
  if v_profile.role = 'admin' then return v_data; end if;

  v_house := v_profile.house_number;
  v_households := coalesce(v_data->'households','[]'::jsonb);
  v_blocks := coalesce(v_data->'residentBlocks','[]'::jsonb);

  if v_profile.role = 'bendahari' then
    return jsonb_build_object(
      'announcements',coalesce(v_data->'announcements','[]'::jsonb),
      'events',coalesce(v_data->'events','[]'::jsonb),
      'committee',coalesce(v_data->'committee','[]'::jsonb),
      'committeeRoles',coalesce(v_data->'committeeRoles','[]'::jsonb),
      'committeeTerm',coalesce(v_data->'committeeTerm','""'::jsonb),
      'committeeHistory',coalesce(v_data->'committeeHistory','[]'::jsonb),
      'polls',coalesce(v_data->'polls','[]'::jsonb),
      'households',v_households,
      'residentBlocks',v_blocks,
      'residentNotices',coalesce((select jsonb_agg(n) from jsonb_array_elements(coalesce(v_data->'residentNotices','[]'::jsonb)) n where n->>'status'='published' and n->>'audience'='Semua penduduk'),'[]'::jsonb),
      'transactions',coalesce(v_data->'transactions','[]'::jsonb),
      'auditLogs','[]'::jsonb
    );
  end if;

  if v_profile.role = 'ajk' then
    return v_data || jsonb_build_object(
      'transactions',coalesce((
        select jsonb_agg(tx.value)
        from jsonb_array_elements(coalesce(v_data->'transactions','[]'::jsonb)) as tx(value)
        where tx.value->>'type' in ('masuk','keluar')
      ),'[]'::jsonb),
      'auditLogs','[]'::jsonb
    );
  end if;

  return jsonb_build_object(
    'announcements',coalesce(v_data->'announcements','[]'::jsonb),
    'events',coalesce(v_data->'events','[]'::jsonb),
    'committee',coalesce(v_data->'committee','[]'::jsonb),
    'committeeRoles',coalesce(v_data->'committeeRoles','[]'::jsonb),
    'committeeTerm',coalesce(v_data->'committeeTerm','""'::jsonb),
    'committeeHistory',coalesce(v_data->'committeeHistory','[]'::jsonb),
    'polls',coalesce(v_data->'polls','[]'::jsonb),
    'households',v_households,
    'residentBlocks',v_blocks,
    'residentNotices',coalesce((select jsonb_agg(n) from jsonb_array_elements(coalesce(v_data->'residentNotices','[]'::jsonb)) n where (n->>'status'='published' and n->>'audience'='Semua penduduk') or coalesce(n->>'submitterUnit','')=v_house::text),'[]'::jsonb),
    'transactions','[]'::jsonb,
    'auditLogs','[]'::jsonb
  );
end;
$$;

-- Admin boleh mengurus mana-mana rumah; peranan lain hanya rumah akaun sendiri.
create or replace function public.update_my_household(p_household jsonb)
returns void language plpgsql security definer set search_path = public, auth
as $$
declare
  v_house smallint;
  v_account_house smallint;
  v_data jsonb;
  v_record jsonb;
  v_members jsonb;
  v_adults integer;
  v_children integer;
begin
  if not public.is_approved_member() then raise exception 'Akaun belum diluluskan.'; end if;
  select house_number into v_account_house from public.profiles where user_id=auth.uid();
  if public.is_admin() then
    v_house := nullif(p_household->>'unit','')::smallint;
  else
    v_house := v_account_house;
    if coalesce(p_household->>'unit','')<>v_house::text then
      raise exception 'Anda hanya boleh mengemaskini rumah yang dipautkan pada akaun anda.';
    end if;
  end if;
  if v_house is null or v_house < 1 or v_house > 43 then raise exception 'Nombor rumah tidak sah.'; end if;
  if coalesce(trim(p_household->>'head'),'')='' or coalesce(trim(p_household->>'phone'),'')='' then
    raise exception 'Nama ketua keluarga dan nombor telefon wajib diisi.';
  end if;

  v_record:=p_household || jsonb_build_object('unit',v_house::text,'id',coalesce(p_household->>'id','r'||v_house::text));
  v_members:=coalesce(v_record->'members','[]'::jsonb);
  v_adults:=1 + (select count(*) from jsonb_array_elements(v_members) m where nullif(m->>'ageAtYear','') is not null and (m->>'ageAtYear')::int >= 18);
  v_children:=(select count(*) from jsonb_array_elements(v_members) m where nullif(m->>'ageAtYear','') is not null and (m->>'ageAtYear')::int < 18);
  select data into v_data from public.community_state where state_key='impiria29' for update;
  if v_data is null then raise exception 'Data komuniti belum disediakan.'; end if;
  v_data:=jsonb_set(v_data,'{households}',coalesce((select jsonb_agg(case when coalesce(h->>'unit','')=v_house::text then v_record else h end) from jsonb_array_elements(coalesce(v_data->'households','[]'::jsonb)) h),'[]'::jsonb));
  if not exists(select 1 from jsonb_array_elements(coalesce(v_data->'households','[]'::jsonb)) h where coalesce(h->>'unit','')=v_house::text) then
    v_data:=jsonb_set(v_data,'{households}',coalesce(v_data->'households','[]'::jsonb)||jsonb_build_array(v_record));
  end if;
  v_data:=jsonb_set(v_data,'{residentBlocks}',coalesce((select jsonb_agg(case when (b->>'number')::int=v_house then b||jsonb_build_object('status','updated','head',v_record->>'head','phone',v_record->>'phone','adults',v_adults,'children',v_children,'members',coalesce((select jsonb_agg(m->>'name') from jsonb_array_elements(v_members) m),'[]'::jsonb),'updatedAt',current_date::text) else b end order by (b->>'number')::int) from jsonb_array_elements(coalesce(v_data->'residentBlocks','[]'::jsonb)) b),'[]'::jsonb));
  update public.community_state set data=v_data,updated_at=now() where state_key='impiria29';
end;
$$;

revoke all on function public.get_app_snapshot() from public, anon;
grant execute on function public.get_app_snapshot() to authenticated;
revoke all on function public.update_my_household(jsonb) from public, anon;
grant execute on function public.update_my_household(jsonb) to authenticated;
notify pgrst, 'reload schema';
