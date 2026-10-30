-- Log aktiviti berpusat. Hanya Admin boleh membaca rekod audit.
create table if not exists public.app_activity_logs (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  session_id text,
  actor_name text not null default 'Pengguna',
  action text not null,
  section text not null,
  record_label text not null default 'Rekod',
  changed_fields text[] not null default '{}',
  occurred_at timestamptz not null default now()
);
create index if not exists app_activity_logs_occurred_at_idx on public.app_activity_logs (occurred_at desc);
create unique index if not exists app_activity_logs_login_session_idx on public.app_activity_logs(actor_user_id,session_id) where section='auth' and session_id is not null;
alter table public.app_activity_logs enable row level security;
revoke all on public.app_activity_logs from public, anon, authenticated;

create or replace function public.get_admin_activity_logs(p_limit integer default 500)
returns table(id bigint, actor_name text, action text, section text, record_label text, changed_fields text[], occurred_at timestamptz)
language plpgsql stable security definer set search_path = public, auth
as $$
begin
  if not public.is_admin() then raise exception 'Log aktiviti hanya untuk Admin.'; end if;
  return query select l.id,l.actor_name,l.action,l.section,l.record_label,l.changed_fields,l.occurred_at
    from public.app_activity_logs l order by l.occurred_at desc limit greatest(1,least(coalesce(p_limit,500),2000));
end;
$$;

create or replace function public.record_member_login()
returns void language plpgsql security definer set search_path = public, auth
as $$
declare v_name text;
begin
  if not public.is_approved_member() then raise exception 'Akaun belum diluluskan.'; end if;
  select full_name into v_name from public.profiles where user_id=auth.uid();
  insert into public.app_activity_logs(actor_user_id,session_id,actor_name,action,section,record_label,changed_fields)
  values(auth.uid(),auth.jwt()->>'session_id',coalesce(v_name,'Pengguna'),'Log masuk','auth','Akses komuniti','{}')
  on conflict (actor_user_id,session_id) where section='auth' and session_id is not null do nothing;
end;
$$;

create or replace function public.activity_field_label(p_key text)
returns text language sql immutable
as $$ select case p_key
  when 'title' then 'Tajuk' when 'category' then 'Kategori' when 'date' then 'Tarikh' when 'body' then 'Kandungan'
  when 'time' then 'Masa' when 'location' then 'Lokasi' when 'attendees' then 'Kehadiran' when 'description' then 'Penerangan'
  when 'phone' then 'Nombor telefon' when 'head' then 'Ketua keluarga' when 'unit' then 'Nombor rumah' when 'members' then 'Ahli keluarga'
  when 'status' then 'Status' when 'adults' then 'Bilangan dewasa' when 'children' then 'Bilangan anak' when 'notes' then 'Catatan'
  when 'question' then 'Soalan' when 'options' then 'Pilihan jawapan' when 'endDate' then 'Tarikh tutup' when 'name' then 'Nama'
  when 'position' then 'Jawatan' when 'portfolio' then 'Tanggungjawab' when 'email' then 'E-mel' when 'audience' then 'Sasaran hebahan'
  when 'action' then 'Tindakan diminta' when 'term' then 'Sesi' when 'type' then 'Jenis transaksi' when 'amount' then 'Jumlah'
  when 'memberNames' then 'Nama ahli keluarga' when 'headDateOfBirth' then 'Tarikh lahir ketua keluarga' else p_key end $$;

create or replace function public.log_member_activity(p_action text,p_section text,p_record_label text,p_changed_fields text[] default '{}')
returns void language plpgsql security definer set search_path = public, auth
as $$
declare v_name text; v_canonical_label text; v_house smallint; v_attending boolean;
begin
  if not public.is_approved_member() then raise exception 'Akaun belum diluluskan.'; end if;
  if p_action not in ('Undian','Kehadiran') or p_section not in ('poll','event') then raise exception 'Jenis log tidak sah.'; end if;
  if p_section='poll' then
    select e->>'question' into v_canonical_label from public.community_state s cross join lateral jsonb_array_elements(coalesce(s.data->'polls','[]'::jsonb)) e where s.state_key='impiria29' and e->>'id'=p_record_label limit 1;
    select house_number into v_house from public.profiles where user_id=auth.uid();
    if not exists(select 1 from public.poll_votes where poll_id=p_record_label and house_number=v_house) then raise exception 'Undian isi rumah belum direkodkan.'; end if;
  else
    select e->>'title' into v_canonical_label from public.community_state s cross join lateral jsonb_array_elements(coalesce(s.data->'events','[]'::jsonb)) e where s.state_key='impiria29' and e->>'id'=p_record_label limit 1;
    select exists(select 1 from public.event_attendance where event_id=p_record_label and user_id=auth.uid()) into v_attending;
    if ('Pengesahan hadir'=any(coalesce(p_changed_fields,'{}')) and not v_attending) or ('Pembatalan kehadiran'=any(coalesce(p_changed_fields,'{}')) and v_attending) then raise exception 'Status kehadiran belum dikemas kini.'; end if;
  end if;
  if v_canonical_label is null then raise exception 'Rekod komuniti tidak ditemui.'; end if;
  select full_name into v_name from public.profiles where user_id=auth.uid();
  insert into public.app_activity_logs(actor_user_id,actor_name,action,section,record_label,changed_fields)
  values(auth.uid(),coalesce(v_name,'Pengguna'),p_action,p_section,left(v_canonical_label,180),case when p_action='Undian' then array['Undi dikemas kini'] else coalesce(p_changed_fields,'{}') end);
end;
$$;

create or replace function public.capture_community_snapshot_activity()
returns trigger language plpgsql security definer set search_path = public, auth
as $$
declare
  v_key text; v_section text; v_old jsonb; v_new jsonb; v_item jsonb; v_prev jsonb;
  v_id text; v_action text; v_label text; v_fields text[]; v_actor text;
begin
  if new.data is not distinct from old.data then return new; end if;
  select coalesce(full_name,'Pengguna') into v_actor from public.profiles where user_id=auth.uid();
  v_actor:=coalesce(v_actor,'Sistem');
  foreach v_key in array array['announcements','events','transactions','households','polls','committee','residentBlocks','residentNotices','committeeHistory','committeeRoles'] loop
    v_old:=coalesce(old.data->v_key,'[]'::jsonb); v_new:=coalesce(new.data->v_key,'[]'::jsonb);
    if v_old is not distinct from v_new then continue; end if;
    v_section:=case v_key when 'announcements' then 'announcement' when 'events' then 'event' when 'transactions' then 'transaction' when 'households' then 'household' when 'polls' then 'poll' when 'committee' then 'committee' when 'residentBlocks' then 'resident' when 'residentNotices' then 'residentNotice' when 'committeeHistory' then 'committeeHistory' when 'committeeRoles' then 'committeeRole' else v_key end;
    for v_item in select value from jsonb_array_elements(case when jsonb_typeof(v_new)='array' then v_new else '[]'::jsonb end) loop
      v_id:=coalesce(v_item->>'id',v_item->>'number',v_item->>'unit',v_item->>'roleName',v_item::text);
      select value into v_prev from jsonb_array_elements(case when jsonb_typeof(v_old)='array' then v_old else '[]'::jsonb end) where coalesce(value->>'id',value->>'number',value->>'unit',value->>'roleName',value::text)=v_id limit 1;
      if v_prev is not null and v_prev is not distinct from v_item then continue; end if;
      v_action:=case when v_prev is null then 'Tambah' else 'Kemaskini' end;
      if jsonb_typeof(v_item)='object' then
        if v_prev is null or jsonb_typeof(v_prev)<>'object' then
          select coalesce(array_agg(public.activity_field_label(key) order by key),'{}') into v_fields from jsonb_each(v_item) where key not in ('id','createdAt','updatedAt','publishedAt','archivedAt','image','photo','votes','going');
        else
          select coalesce(array_agg(public.activity_field_label(k) order by k),'{}') into v_fields from (select key k from jsonb_each(v_item) union select key from jsonb_each(v_prev)) all_keys where v_item->k is distinct from v_prev->k and k not in ('id','createdAt','updatedAt','publishedAt','archivedAt','image','photo','votes','going');
        end if;
      else
        v_fields:=array['Pilihan jawatan'];
      end if;
      v_label:=coalesce(v_item->>'title',v_item->>'question',v_item->>'term',v_item->>'head',v_item->>'number',v_item->>'unit',v_item->>'name',case when v_key='committeeRoles' then v_item#>>'{}' end,case when v_key='transactions' then v_item->>'category' end,v_section);
      insert into public.app_activity_logs(actor_user_id,actor_name,action,section,record_label,changed_fields)
      values(auth.uid(),v_actor,v_action,v_section,left(v_label,180),coalesce(v_fields,'{}'));
    end loop;
    for v_item in select value from jsonb_array_elements(case when jsonb_typeof(v_old)='array' then v_old else '[]'::jsonb end) loop
      v_id:=coalesce(v_item->>'id',v_item->>'number',v_item->>'unit',v_item->>'roleName',v_item::text);
      if not exists(select 1 from jsonb_array_elements(case when jsonb_typeof(v_new)='array' then v_new else '[]'::jsonb end) where coalesce(value->>'id',value->>'number',value->>'unit',value->>'roleName',value::text)=v_id) then
        v_label:=coalesce(v_item->>'title',v_item->>'question',v_item->>'term',v_item->>'head',v_item->>'number',v_item->>'unit',v_item->>'name',case when v_key='committeeRoles' then v_item#>>'{}' end,case when v_key='transactions' then v_item->>'category' end,v_section);
        insert into public.app_activity_logs(actor_user_id,actor_name,action,section,record_label,changed_fields)
        values(auth.uid(),v_actor,'Padam',v_section,left(v_label,180),array['Rekod dipadam']);
      end if;
    end loop;
  end loop;
  return new;
end;
$$;
drop trigger if exists community_state_activity_log on public.community_state;
create trigger community_state_activity_log after update of data on public.community_state for each row execute function public.capture_community_snapshot_activity();

create or replace function public.capture_profile_activity()
returns trigger language plpgsql security definer set search_path = public, auth
as $$
declare v_actor text; v_fields text[];
begin
  select coalesce(full_name,'Pengguna') into v_actor from public.profiles where user_id=auth.uid();
  if tg_op='UPDATE' then
    select array_remove(array[case when old.full_name is distinct from new.full_name then 'Nama' end,case when old.phone is distinct from new.phone then 'Nombor telefon' end,case when old.house_number is distinct from new.house_number then 'Nombor rumah' end,case when old.role is distinct from new.role then 'Peranan' end,case when old.approval_status is distinct from new.approval_status then 'Status kelulusan' end],'') into v_fields;
    if cardinality(v_fields)=0 then return new; end if;
    insert into public.app_activity_logs(actor_user_id,actor_name,action,section,record_label,changed_fields)
    values(auth.uid(),coalesce(v_actor,'Sistem'),'Kemaskini akaun','account',left(new.full_name,180),v_fields);
    return new;
  elsif tg_op='DELETE' then
    insert into public.app_activity_logs(actor_user_id,actor_name,action,section,record_label,changed_fields)
    values(auth.uid(),coalesce(v_actor,'Sistem'),'Padam akaun','account',left(old.full_name,180),array['Akses akaun dipadam']);
    return old;
  end if;
  return null;
end;
$$;
drop trigger if exists profiles_activity_log on public.profiles;
create trigger profiles_activity_log after update or delete on public.profiles for each row execute function public.capture_profile_activity();

create or replace function public.capture_settings_activity()
returns trigger language plpgsql security definer set search_path = public, auth
as $$
declare v_actor text;
begin
  if new.prayer_zone is not distinct from old.prayer_zone then return new; end if;
  select coalesce(full_name,'Pengguna') into v_actor from public.profiles where user_id=auth.uid();
  insert into public.app_activity_logs(actor_user_id,actor_name,action,section,record_label,changed_fields)
  values(auth.uid(),coalesce(v_actor,'Sistem'),'Kemaskini tetapan','tetapan','Zon waktu solat',array['Zon waktu solat']);
  return new;
end;
$$;
drop trigger if exists community_settings_activity_log on public.community_settings;
create trigger community_settings_activity_log after update of prayer_zone on public.community_settings for each row execute function public.capture_settings_activity();

revoke all on function public.get_admin_activity_logs(integer),public.record_member_login(),public.log_member_activity(text,text,text,text[]),public.activity_field_label(text) from public,anon;
grant execute on function public.get_admin_activity_logs(integer),public.record_member_login(),public.log_member_activity(text,text,text,text[]) to authenticated;
notify pgrst,'reload schema';
