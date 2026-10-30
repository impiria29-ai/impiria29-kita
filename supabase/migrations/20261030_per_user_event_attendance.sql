-- Kehadiran acara berasingan bagi setiap akaun; identiti peserta tidak didedahkan.
create table if not exists public.event_attendance (
  event_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
alter table public.event_attendance enable row level security;
revoke all on public.event_attendance from anon, authenticated;

create or replace function public.get_event_attendance(p_event_ids text[])
returns table(event_id text, attendee_count bigint, attending boolean)
language plpgsql stable security definer set search_path = public, auth
as $$
begin
  if not public.is_approved_member() then raise exception 'Akaun belum diluluskan.'; end if;
  return query
    select requested.event_id, count(a.user_id), coalesce(bool_or(a.user_id = auth.uid()), false)
      from unnest(coalesce(p_event_ids, array[]::text[])) as requested(event_id)
      left join public.event_attendance a on a.event_id = requested.event_id
     where exists (
       select 1 from public.community_state s,
            lateral jsonb_array_elements(coalesce(s.data->'events','[]'::jsonb)) e
        where s.state_key='impiria29' and e->>'id'=requested.event_id
     )
     group by requested.event_id;
end;
$$;

create or replace function public.set_event_attendance(p_event_id text, p_attending boolean)
returns void
language plpgsql security definer set search_path = public, auth
as $$
begin
  if not public.is_approved_member() then raise exception 'Akaun belum diluluskan.'; end if;
  if coalesce(trim(p_event_id),'')='' or p_attending is null then raise exception 'Maklumat kehadiran tidak sah.'; end if;
  if not exists (
    select 1 from public.community_state s,
         lateral jsonb_array_elements(coalesce(s.data->'events','[]'::jsonb)) e
     where s.state_key='impiria29' and e->>'id'=p_event_id
  ) then raise exception 'Acara tidak ditemui.'; end if;
  if p_attending then
    insert into public.event_attendance(event_id,user_id) values (p_event_id,auth.uid())
      on conflict (event_id,user_id) do nothing;
  else
    delete from public.event_attendance where event_id=p_event_id and user_id=auth.uid();
  end if;
end;
$$;

revoke all on function public.get_event_attendance(text[]), public.set_event_attendance(text,boolean) from public, anon;
grant execute on function public.get_event_attendance(text[]), public.set_event_attendance(text,boolean) to authenticated;
