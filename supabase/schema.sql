-- Impiria29 Kita production foundation.
-- Access model: residents are approved and linked to one house; AJK can manage
-- community content but not finances/audit logs; admin has full access.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  phone text not null,
  requested_house_number smallint check (requested_house_number between 1 and 43),
  house_number smallint check (house_number between 1 and 43),
  role text not null default 'resident' check (role in ('resident','ajk','bendahari','admin')),
  approval_status text not null default 'pending' check (approval_status in ('pending','approved','rejected')),
  created_at timestamptz not null default now()
);

create table if not exists public.community_state (
  state_key text primary key default 'impiria29',
  data jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint only_impiria29_state check (state_key = 'impiria29')
);

create table if not exists public.poll_votes (
  poll_id text not null,
  house_number smallint not null check (house_number between 1 and 43),
  option_index integer not null check (option_index >= 0),
  voted_by uuid not null references auth.users(id) on delete cascade,
  voted_at timestamptz not null default now(),
  primary key (poll_id, house_number)
);

alter table public.profiles enable row level security;
alter table public.community_state enable row level security;
alter table public.poll_votes enable row level security;

create or replace function public.is_approved_member()
returns boolean language sql stable security definer set search_path = public, auth
as $$ select exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.approval_status = 'approved' and p.house_number between 1 and 43) $$;

create or replace function public.is_ajk()
returns boolean language sql stable security definer set search_path = public, auth
as $$ select exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.approval_status = 'approved' and p.role in ('ajk','admin')) $$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public, auth
as $ select exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.approval_status = 'approved' and p.role = 'admin') $;

create or replace function public.is_finance_manager()
returns boolean language sql stable security definer set search_path = public, auth
as $ select exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.approval_status = 'approved' and p.role in ('bendahari','admin')) $;

create or replace function public.create_pending_profile()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles(user_id, full_name, phone, requested_house_number)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'),''), 'Penduduk'),
    coalesce(nullif(trim(new.raw_user_meta_data->>'phone'),''), ''),
    case when coalesce(new.raw_user_meta_data->>'house_number','') ~ '^(?:[1-9]|[1-3][0-9]|4[0-3])$'
      then (new.raw_user_meta_data->>'house_number')::smallint else null end
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile after insert on auth.users
for each row execute procedure public.create_pending_profile();

create or replace function public.get_app_snapshot()
returns jsonb language plpgsql stable security definer set search_path = public, auth
as $$
declare v_data jsonb; v_profile public.profiles%rowtype; v_house smallint;
begin
  if not public.is_approved_member() then raise exception 'Akaun belum diluluskan atau belum dipautkan kepada rumah.'; end if;
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
    'residentBlocks',coalesce((select jsonb_agg(case when coalesce(b->>'number','') = v_house::text then b else jsonb_build_object('id',b->>'id','number',(b->>'number'),'status',b->>'status') end order by (b->>'number')::int) from jsonb_array_elements(coalesce(v_data->'residentBlocks','[]'::jsonb)) b),'[]'::jsonb),
    'residentNotices',coalesce((select jsonb_agg(n) from jsonb_array_elements(coalesce(v_data->'residentNotices','[]'::jsonb)) n where (n->>'status'='published' and n->>'audience'='Semua penduduk') or coalesce(n->>'submitterUnit','')=v_house::text),'[]'::jsonb),
    'transactions','[]'::jsonb,
    'auditLogs','[]'::jsonb
  );
end;
$$;

create or replace function public.save_app_snapshot(p_data jsonb)
returns void language plpgsql security definer set search_path = public, auth
as $$
declare v_old jsonb;
begin
  if not public.is_ajk() and not public.is_finance_manager() then raise exception 'Akaun tidak dibenarkan menyimpan data komuniti.'; end if;
  if jsonb_typeof(p_data) <> 'object' then raise exception 'Format data tidak sah.'; end if;
  select data into v_old from public.community_state where state_key='impiria29' for update;
  if v_old is null then raise exception 'Data komuniti belum disediakan.'; end if;
  if public.is_finance_manager() and not public.is_admin() and not public.is_ajk() then
    if jsonb_typeof(p_data->'transactions') <> 'array' then raise exception 'Senarai transaksi tidak sah.'; end if;
    update public.community_state set data=jsonb_set(v_old,'{transactions}',p_data->'transactions',true),updated_by=auth.uid(),updated_at=now() where state_key='impiria29';
    return;
  end if;
  if not public.is_admin() then
    p_data := p_data || jsonb_build_object('transactions',coalesce(v_old->'transactions','[]'::jsonb),'auditLogs',coalesce(v_old->'auditLogs','[]'::jsonb));
  end if;
  if jsonb_typeof(p_data->'polls')='array' then
    p_data := jsonb_set(p_data,'{polls}',coalesce((select jsonb_agg(p - 'votes') from jsonb_array_elements(p_data->'polls') p),'[]'::jsonb));
  end if;
  insert into public.community_state(state_key,data,updated_by,updated_at)
    values ('impiria29',p_data,auth.uid(),now())
    on conflict (state_key) do update set data=excluded.data,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
end;
$$;

create or replace function public.cast_household_vote(p_poll_id text,p_option_index integer)
returns void language plpgsql security definer set search_path = public, auth
as $$
declare v_house smallint; v_poll jsonb; v_options jsonb; v_end date;
begin
  if not public.is_approved_member() then raise exception 'Akaun belum diluluskan.'; end if;
  select house_number into v_house from public.profiles where user_id=auth.uid();
  select p into v_poll from public.community_state s, lateral jsonb_array_elements(coalesce(s.data->'polls','[]'::jsonb)) p where s.state_key='impiria29' and p->>'id'=p_poll_id;
  if v_poll is null then raise exception 'Poll tidak ditemui.'; end if;
  v_options:=v_poll->'options'; v_end:=nullif(v_poll->>'endDate','')::date;
  if v_end is null or v_end < current_date then raise exception 'Poll telah ditutup.'; end if;
  if p_option_index < 0 or p_option_index >= jsonb_array_length(v_options) then raise exception 'Pilihan undi tidak sah.'; end if;
  insert into public.poll_votes(poll_id,house_number,option_index,voted_by)
    values(p_poll_id,v_house,p_option_index,auth.uid())
    on conflict(poll_id,house_number) do update set option_index=excluded.option_index,voted_by=excluded.voted_by,voted_at=now();
end;
$$;

create or replace function public.submit_resident_notice(p_notice jsonb)
returns void language plpgsql security definer set search_path = public, auth
as $$
declare v_house smallint; v_name text; v_notice jsonb;
begin
  if not public.is_approved_member() then raise exception 'Akaun belum diluluskan.'; end if;
  select house_number,full_name into v_house,v_name from public.profiles where user_id=auth.uid();
  v_notice:=jsonb_build_object('id',gen_random_uuid()::text,'submitter',v_name,'submitterUnit',v_house::text,
    'category',left(coalesce(p_notice->>'category','Lain-lain'),80),'title',left(coalesce(p_notice->>'title',''),160),
    'body',left(coalesce(p_notice->>'body',''),5000),'audience',case when p_notice->>'audience'='AJK sahaja' then 'AJK sahaja' else 'Semua penduduk' end,
    'action',left(coalesce(p_notice->>'action','Tiada tindakan diperlukan'),160),'status','pending','date',current_date::text);
  update public.community_state set data=jsonb_set(data,'{residentNotices}',coalesce(data->'residentNotices','[]'::jsonb)||jsonb_build_array(v_notice)),updated_at=now()
    where state_key='impiria29';
end;
$$;

create or replace function public.update_my_household(p_household jsonb)
returns void language plpgsql security definer set search_path = public, auth
as $$
declare v_house smallint; v_data jsonb; v_record jsonb; v_members jsonb; v_adults integer; v_children integer;
begin
  if not public.is_approved_member() then raise exception 'Akaun belum diluluskan.'; end if;
  select house_number into v_house from public.profiles where user_id=auth.uid();
  if coalesce(p_household->>'unit','')<>v_house::text then raise exception 'Isi rumah tidak sepadan dengan akaun.'; end if;
  if coalesce(trim(p_household->>'head'),'')='' or coalesce(trim(p_household->>'phone'),'')='' then raise exception 'Nama ketua keluarga dan nombor telefon wajib diisi.'; end if;
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

create or replace function public.get_poll_tallies(p_poll_id text)
returns table(option_index integer,vote_count bigint,my_choice integer)
language sql stable security definer set search_path = public, auth
as $$
  select i::int,count(v.house_number)::bigint,
    (select own.option_index from public.poll_votes own where own.poll_id=p_poll_id and own.house_number=(select house_number from public.profiles where user_id=auth.uid()))
  from public.community_state s
  cross join lateral jsonb_array_elements(coalesce(s.data->'polls','[]'::jsonb)) p
  cross join lateral jsonb_array_elements(p->'options') with ordinality as o(value,i)
  left join public.poll_votes v on v.poll_id=p_poll_id and v.option_index=i-1
  where s.state_key='impiria29' and p->>'id'=p_poll_id and public.is_approved_member()
  group by i order by i;
$$;

create or replace function public.list_access_applications()
returns table(user_id uuid,full_name text,phone text,requested_house_number smallint,created_at timestamptz)
language sql stable security definer set search_path = public, auth
as $$
  select p.user_id,p.full_name,p.phone,coalesce(p.requested_house_number,p.house_number),p.created_at
  from public.profiles p
  where public.is_ajk() and p.role='resident' and p.approval_status='pending'
  order by p.created_at asc;
$$;

create or replace function public.review_access_application(p_user_id uuid,p_house_number smallint)
returns void language plpgsql security definer set search_path = public, auth
as $$
declare v_updated integer;
begin
  if not public.is_ajk() then raise exception 'Hanya AJK atau admin boleh meluluskan permohonan.'; end if;
  if p_house_number is null or p_house_number not between 1 and 43 then raise exception 'Nombor rumah tidak sah.'; end if;
  update public.profiles set approval_status='approved',house_number=p_house_number
    where user_id=p_user_id and role='resident' and approval_status='pending';
  get diagnostics v_updated = row_count;
  if v_updated=0 then raise exception 'Permohonan tidak ditemui atau sudah diproses.'; end if;
end;
$$;


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
  if p_role is null or p_role not in ('resident','ajk','bendahari','admin') then raise exception 'Peranan tidak sah.'; end if;

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

revoke all on public.profiles,public.community_state,public.poll_votes from anon,authenticated;
revoke all on function public.is_approved_member(),public.is_ajk(),public.is_admin(),public.get_app_snapshot(),public.save_app_snapshot(jsonb),public.cast_household_vote(text,integer),public.submit_resident_notice(jsonb),public.update_my_household(jsonb),public.get_poll_tallies(text),public.get_public_birthdays(),public.list_access_applications(),public.review_access_application(uuid,smallint),public.list_managed_accounts(),public.update_managed_account(uuid,text,text,smallint,text,text),public.delete_managed_account(uuid) from public,anon;
grant select,update(full_name,phone) on public.profiles to authenticated;
grant select on public.poll_votes to authenticated;
grant execute on function public.is_approved_member(),public.is_ajk(),public.is_admin(),public.get_app_snapshot(),public.save_app_snapshot(jsonb),public.cast_household_vote(text,integer),public.submit_resident_notice(jsonb),public.update_my_household(jsonb),public.get_poll_tallies(text),public.get_public_birthdays(),public.list_access_applications(),public.review_access_application(uuid,smallint),public.list_managed_accounts(),public.update_managed_account(uuid,text,text,smallint,text,text),public.delete_managed_account(uuid) to authenticated;
revoke all on function public.create_pending_profile() from public,anon,authenticated;

create policy "profile self read" on public.profiles for select to authenticated using(user_id=auth.uid() or public.is_admin());
create policy "profile self contact update" on public.profiles for update to authenticated using(user_id=auth.uid() or public.is_admin()) with check(user_id=auth.uid() or public.is_admin());
create policy "poll vote row private" on public.poll_votes for select to authenticated using(false);

comment on table public.profiles is 'Akaun perlu diluluskan dan dipautkan kepada rumah oleh admin sebelum akses komuniti.';
comment on table public.community_state is 'Data komuniti; akses biasa melalui RPC get_app_snapshot dan save_app_snapshot sahaja.';
comment on table public.poll_votes is 'Satu undi setiap rumah bagi setiap poll; pilihan individu tidak boleh dibaca terus.';


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

drop function if exists public.set_event_attendance(boolean,text);
 drop function if exists public.set_event_attendance(text,boolean);
create function public.set_event_attendance(p_event_id text, p_attending boolean)
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

-- Tetapan komuniti yang boleh diubah oleh admin dan dibaca oleh ahli diluluskan.
create table if not exists public.community_settings (
  setting_key text primary key default 'impiria29' check (setting_key = 'impiria29'),
  prayer_zone text not null default 'SGR01' check (prayer_zone in ('SGR01','SGR03')),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.community_settings(setting_key,prayer_zone)
values ('impiria29','SGR01') on conflict (setting_key) do nothing;
alter table public.community_settings enable row level security;
revoke all on public.community_settings from anon, authenticated;

create or replace function public.get_community_settings()
returns table(prayer_zone text)
language plpgsql stable security definer set search_path = public, auth
as $$
begin
  if not public.is_approved_member() then raise exception 'Akaun belum diluluskan.'; end if;
  return query select s.prayer_zone from public.community_settings s where s.setting_key='impiria29';
end;
$$;

create or replace function public.update_community_settings(p_prayer_zone text)
returns table(prayer_zone text)
language plpgsql security definer set search_path = public, auth
as $$
begin
  if not public.is_admin() then raise exception 'Hanya admin boleh mengubah tetapan sistem.'; end if;
  if p_prayer_zone is null or p_prayer_zone not in ('SGR01','SGR03') then raise exception 'Zon waktu solat tidak sah.'; end if;
  return query
    insert into public.community_settings(setting_key,prayer_zone,updated_by,updated_at)
    values ('impiria29',p_prayer_zone,auth.uid(),now())
    on conflict (setting_key) do update
      set prayer_zone=excluded.prayer_zone,updated_by=excluded.updated_by,updated_at=now()
    returning community_settings.prayer_zone;
end;
$$;
revoke all on function public.get_community_settings(), public.update_community_settings(text) from public, anon;
grant execute on function public.get_community_settings(), public.update_community_settings(text) to authenticated;

-- Refresh PostgREST so the attendance RPCs added above are immediately discoverable.
notify pgrst, 'reload schema';
