-- Impiria29 Kita: birthday sharing and frontend resident-application approvals.
-- Safe to re-run; both RPCs are CREATE OR REPLACE and grants are idempotent.

-- Public birthday greetings. Only opted-in people are included; year of birth is never returned.
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

-- Return pending applications to approved AJK/admin only.
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

-- Approve and link a pending resident to a verified house; AJK/admin only.
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