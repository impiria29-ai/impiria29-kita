create or replace function public.get_public_birthdays()
returns jsonb language plpgsql stable security definer set search_path = public, auth
as $$
declare v_birthdays jsonb;
begin
  if not public.is_approved_member() then raise exception 'Akaun belum diluluskan.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('name',b.name,'relationship',b.relationship,'date',right(b.dob,5)) order by right(b.dob,5),b.name),'[]'::jsonb)
    into v_birthdays
  from public.community_state s
  cross join lateral (
    select h->>'head' as name,'Ketua keluarga'::text as relationship,h->>'headDateOfBirth' as dob
    from jsonb_array_elements(coalesce(s.data->'households','[]'::jsonb)) h
    where h->>'headBirthdayPublic'='true'
    union all
    select m->>'name',coalesce(nullif(m->>'relationship',''),'Ahli keluarga'),m->>'dateOfBirth'
    from jsonb_array_elements(coalesce(s.data->'households','[]'::jsonb)) h
    cross join lateral jsonb_array_elements(coalesce(h->'members','[]'::jsonb)) m
    where m->>'shareBirthday'='true'
  ) b
  where s.state_key='impiria29' and coalesce(b.name,'')<>'' and coalesce(b.dob,'') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$';
  return v_birthdays;
end;
$$;

revoke all on function public.get_public_birthdays() from public,anon;
grant execute on function public.get_public_birthdays() to authenticated;
