-- Ringkasan baki tabung untuk paparan Ringkasan penduduk sahaja. Tiada transaksi individu didedahkan.
create or replace function public.get_resident_finance_summary()
returns jsonb
language plpgsql stable security definer set search_path = public, auth
as $$
declare
  v_data jsonb;
  v_balance numeric(14,2);
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

  select coalesce(sum(
    case
      when coalesce(t->>'amount','') ~ '^-?[0-9]+(\.[0-9]+)?$' and t->>'type' = 'masuk' then (t->>'amount')::numeric
      when coalesce(t->>'amount','') ~ '^-?[0-9]+(\.[0-9]+)?$' and t->>'type' = 'keluar' then -((t->>'amount')::numeric)
      else 0
    end
  ), 0)::numeric(14,2)
    into v_balance
    from jsonb_array_elements(coalesce(v_data->'transactions','[]'::jsonb)) t;

  return jsonb_build_object('balance', coalesce(v_balance,0));
end;
$$;

revoke all on function public.get_resident_finance_summary() from public, anon;
grant execute on function public.get_resident_finance_summary() to authenticated;
