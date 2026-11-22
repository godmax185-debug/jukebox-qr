-- JUKEBOX QR starter schema. Run in Supabase SQL Editor.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
set search_path = public, extensions;

create table if not exists public.queue (
  id uuid primary key default gen_random_uuid(),
  video_id text not null,
  title text not null,
  channel text,
  thumbnail text,
  requester text default 'ผู้ใช้ QR',
  status text not null default 'waiting' check (status in ('waiting','playing','played','removed')),
  position bigint generated always as identity,
  created_at timestamptz not null default now()
);

create table if not exists public.room_state (
  id int primary key check (id = 1),
  video_id text,
  title text,
  channel text,
  thumbnail text,
  updated_at timestamptz not null default now()
);
alter table public.room_state add column if not exists thumbnail text;
insert into public.room_state(id) values(1) on conflict do nothing;

create table if not exists public.app_config (
  id int primary key check (id = 1),
  admin_pin_hash text not null
);
-- Replace the example PIN before running this insert. Use a long unique PIN.
insert into public.app_config(id, admin_pin_hash)
values (1, crypt('CHANGE-ME-1234', gen_salt('bf')))
on conflict (id) do nothing;

alter table public.queue enable row level security;
alter table public.room_state enable row level security;
alter table public.app_config enable row level security;

create policy "public can read queue" on public.queue for select using (true);
create policy "public can read room" on public.room_state for select using (true);
-- No direct public writes. All writes go through the functions below.

create or replace function public.add_track(
 p_video_id text, p_title text, p_channel text, p_thumbnail text, p_requester text default 'ผู้ใช้ QR'
) returns uuid language plpgsql security definer set search_path=public, extensions as $
declare new_id uuid;
begin
 if length(p_video_id)>20 or length(p_title)>300 then raise exception 'ข้อมูลเพลงไม่ถูกต้อง'; end if;
 insert into queue(video_id,title,channel,thumbnail,requester)
 values(p_video_id,p_title,p_channel,p_thumbnail,left(coalesce(p_requester,'ผู้ใช้ QR'),60))
 returning id into new_id;
 return new_id;
end; $$;

create or replace function public.admin_next(p_pin text)
returns json language plpgsql security definer set search_path=public, extensions as $
declare next_row queue%rowtype; good boolean;
begin
 select (admin_pin_hash = crypt(p_pin,admin_pin_hash)) into good from app_config where id=1;
 if not coalesce(good,false) then raise exception 'รหัสเจ้าของเครื่องไม่ถูกต้อง'; end if;
 update queue set status='played' where status='playing';
 select * into next_row from queue where status='waiting' order by position for update skip locked limit 1;
 if not found then
   update room_state set video_id=null,title=null,channel=null,thumbnail=null,updated_at=now() where id=1;
   return null;
 end if;
 update queue set status='playing' where id=next_row.id;
 update room_state set video_id=next_row.video_id,title=next_row.title,channel=next_row.channel,thumbnail=next_row.thumbnail,updated_at=now() where id=1;
 return json_build_object('video_id',next_row.video_id,'title',next_row.title,'channel',next_row.channel,'id',next_row.id);
end; $$;

create or replace function public.admin_remove_track(p_pin text,p_track_id uuid)
returns void language plpgsql security definer set search_path=public, extensions as $
declare good boolean;
begin
 select (admin_pin_hash = crypt(p_pin,admin_pin_hash)) into good from app_config where id=1;
 if not coalesce(good,false) then raise exception 'รหัสเจ้าของเครื่องไม่ถูกต้อง'; end if;
 update queue set status='removed' where id=p_track_id and status='waiting';
end; $$;

grant execute on function public.add_track(text,text,text,text,text) to anon, authenticated;
grant execute on function public.admin_next(text) to anon, authenticated;
grant execute on function public.admin_remove_track(text,uuid) to anon, authenticated;
grant select on public.queue, public.room_state to anon, authenticated;



-- Let the host start any waiting song immediately. The current song is marked played.
create or replace function public.admin_play_track(p_pin text, p_track_id uuid)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $
declare
  chosen queue%rowtype;
  good boolean;
begin
  select (admin_pin_hash = crypt(p_pin, admin_pin_hash))
  into good
  from app_config
  where id = 1;

  if not coalesce(good, false) then
    raise exception 'รหัสเจ้าของเครื่องไม่ถูกต้อง';
  end if;

  select * into chosen
  from queue
  where id = p_track_id and status = 'waiting'
  for update;

  if not found then
    raise exception 'ไม่พบเพลงในคิว หรือเพลงนี้กำลังเล่นอยู่แล้ว';
  end if;

  update queue set status = 'played' where status = 'playing';
  update queue set status = 'playing' where id = chosen.id;

  update room_state
  set video_id = chosen.video_id,
      title = chosen.title,
      channel = chosen.channel,
      thumbnail = chosen.thumbnail,
      updated_at = now()
  where id = 1;

  return json_build_object(
    'video_id', chosen.video_id,
    'title', chosen.title,
    'channel', chosen.channel,
    'thumbnail', chosen.thumbnail,
    'id', chosen.id
  );
end;
$;
grant execute on function public.admin_play_track(text, uuid) to anon, authenticated;

-- Verify the admin PIN before showing admin-only controls in the app.
create or replace function public.verify_admin_pin(p_pin text)
returns boolean language plpgsql security definer set search_path=public, extensions as $
declare good boolean;
begin
 select (admin_pin_hash = crypt(p_pin,admin_pin_hash)) into good
 from app_config where id=1;
 return coalesce(good,false);
end; $$;
grant execute on function public.verify_admin_pin(text) to anon, authenticated;
