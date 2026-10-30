-- Paparan kewangan AJK baca sahaja, rekod aset/liabiliti, dan ringkasan baki bank.
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
    'households',coalesce((select jsonb_agg(h) from jsonb_array_elements(coalesce(v_data->'households','[]'::jsonb)) h where coalesce(h->>'unit','') = v_house::text),'[]'::jsonb),
    'residentBlocks',coalesce((select jsonb_agg(case when coalesce(b->>'number','') = v_house::text then b else jsonb_build_object('id',b->>'id','number',(b->>'number'),'status',b->>'status') end order by (b->>'number')::int) from jsonb_array_elements(coalesce(v_data->'residentBlocks','[]'::jsonb)) b),'[]'::jsonb),
    'residentNotices',coalesce((select jsonb_agg(n) from jsonb_array_elements(coalesce(v_data->'residentNotices','[]'::jsonb)) n where (n->>'status'='published' and n->>'audience'='Semua penduduk') or coalesce(n->>'submitterUnit','')=v_house::text),'[]'::jsonb),
    'transactions','[]'::jsonb,
    'auditLogs','[]'::jsonb
  );
end;
$$;


create or replace function public.get_resident_finance_summary()
returns jsonb
language plpgsql stable security definer set search_path = public, auth
as $$
declare
  v_data jsonb;
  v_balance numeric(14,2);
  v_bank_balance numeric(14,2);
begin
  if not public.is_approved_member() then
    raise exception 'Akaun belum diluluskan.';
  end if;

  select data into v_data
    from public.community_state
   where state_key = 'impiria29';

  if v_data is null then
    return jsonb_build_object('balance', 0);
  end if;

  -- Baki bank: ambil rekod kedudukan terkini bagi setiap akaun Tunai di Bank.
  select coalesce(sum(latest.amount),0)::numeric(14,2)
    into v_bank_balance
    from (
      select distinct on (coalesce(tx.value->>'category','') || '|' || coalesce(tx.value->>'title',''))
        coalesce(nullif(tx.value->>'amount','')::numeric,0) as amount,
        tx.value->>'category' as category
      from jsonb_array_elements(coalesce(v_data->'transactions','[]'::jsonb)) as tx(value)
      where tx.value->>'type'='aset'
        and tx.value->>'category'='Aset Semasa — Tunai di Bank'
        and coalesce(tx.value->>'amount','') ~ '^-?[0-9]+([.][0-9]+)?$'
      order by coalesce(tx.value->>'category','') || '|' || coalesce(tx.value->>'title',''),
        coalesce(tx.value->>'date','0001-01-01') desc,
        coalesce(tx.value->>'id','') desc
    ) latest;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(v_data->'transactions','[]'::jsonb)) as tx(value)
    where tx.value->>'type'='aset'
      and tx.value->>'category'='Aset Semasa — Tunai di Bank'
      and coalesce(tx.value->>'amount','') ~ '^-?[0-9]+([.][0-9]+)?$'
  ) then
    v_balance := coalesce(v_bank_balance,0);
  else
    select coalesce(sum(
      case
        when coalesce(tx.value->>'amount','') ~ '^-?[0-9]+([.][0-9]+)?$' and tx.value->>'type'='masuk' then (tx.value->>'amount')::numeric
        when coalesce(tx.value->>'amount','') ~ '^-?[0-9]+([.][0-9]+)?$' and tx.value->>'type'='keluar' then -((tx.value->>'amount')::numeric)
        else 0
      end
    ),0)::numeric(14,2)
      into v_balance
      from jsonb_array_elements(coalesce(v_data->'transactions','[]'::jsonb)) as tx(value);
  end if;

  return jsonb_build_object('balance',coalesce(v_balance,0));
end;
$$;

revoke all on function public.get_resident_finance_summary() from public,anon;
grant execute on function public.get_resident_finance_summary() to authenticated;
