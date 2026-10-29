-- Колода: схема базы для Supabase.
-- Запустить один раз: Supabase → SQL Editor → New query → вставить весь файл → Run.
-- Повторный запуск безопасен.

-- 1. Карточки: одна строка на карточку, каждая привязана к владельцу.
create table if not exists public.cards (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  id         text        not null check (id ~ '^[A-Za-z0-9_-]{1,64}$'),
  data       jsonb       not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 16384),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- 2. Настройки и статистика: одна строка на пользователя.
create table if not exists public.user_state (
  user_id    uuid        primary key default auth.uid() references auth.users (id) on delete cascade,
  settings   jsonb       not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object' and pg_column_size(settings) <= 8192),
  stats      jsonb       not null default '{}'::jsonb check (jsonb_typeof(stats) = 'object' and pg_column_size(stats) <= 262144),
  updated_at timestamptz not null default now()
);

-- 2а. Заметки по грамматике: одна строка на заметку (правило, примеры, ошибки).
create table if not exists public.grammar_notes (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  id         text        not null check (id ~ '^[A-Za-z0-9_-]{1,64}$'),
  data       jsonb       not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 65536),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- 3. Время изменения ставит сервер, а не браузер.
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists cards_touch on public.cards;
create trigger cards_touch before insert or update on public.cards
  for each row execute function public.touch_updated_at();
drop trigger if exists grammar_notes_touch on public.grammar_notes;
create trigger grammar_notes_touch before insert or update on public.grammar_notes
  for each row execute function public.touch_updated_at();
drop trigger if exists user_state_touch on public.user_state;
create trigger user_state_touch before insert or update on public.user_state
  for each row execute function public.touch_updated_at();

-- 4. Защита от злоупотреблений: не больше 10 000 карточек на человека.
create or replace function public.enforce_card_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.cards where user_id = new.user_id) >= 10000
     and not exists (select 1 from public.cards where user_id = new.user_id and id = new.id) then
    raise exception 'card limit reached';
  end if;
  return new;
end $$;
drop trigger if exists cards_limit on public.cards;
create trigger cards_limit before insert on public.cards
  for each row execute function public.enforce_card_limit();

-- 4а. Не больше 2 000 заметок на человека.
create or replace function public.enforce_note_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.grammar_notes where user_id = new.user_id) >= 2000
     and not exists (select 1 from public.grammar_notes where user_id = new.user_id and id = new.id) then
    raise exception 'note limit reached';
  end if;
  return new;
end $$;
drop trigger if exists grammar_notes_limit on public.grammar_notes;
create trigger grammar_notes_limit before insert on public.grammar_notes
  for each row execute function public.enforce_note_limit();

-- 5. Row Level Security: каждый видит и меняет только свои строки.
alter table public.cards      enable row level security;
alter table public.cards      force  row level security;
alter table public.grammar_notes enable row level security;
alter table public.grammar_notes force  row level security;
alter table public.user_state enable row level security;
alter table public.user_state force  row level security;

revoke all on public.cards, public.user_state, public.grammar_notes from anon, public;
grant select, insert, update, delete on public.cards, public.user_state, public.grammar_notes to authenticated;

drop policy if exists cards_select on public.cards;
drop policy if exists cards_insert on public.cards;
drop policy if exists cards_update on public.cards;
drop policy if exists cards_delete on public.cards;
create policy cards_select on public.cards for select to authenticated using ((select auth.uid()) = user_id);
create policy cards_insert on public.cards for insert to authenticated with check ((select auth.uid()) = user_id);
create policy cards_update on public.cards for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy cards_delete on public.cards for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists notes_select on public.grammar_notes;
drop policy if exists notes_insert on public.grammar_notes;
drop policy if exists notes_update on public.grammar_notes;
drop policy if exists notes_delete on public.grammar_notes;
create policy notes_select on public.grammar_notes for select to authenticated using ((select auth.uid()) = user_id);
create policy notes_insert on public.grammar_notes for insert to authenticated with check ((select auth.uid()) = user_id);
create policy notes_update on public.grammar_notes for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy notes_delete on public.grammar_notes for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists state_select on public.user_state;
drop policy if exists state_insert on public.user_state;
drop policy if exists state_update on public.user_state;
drop policy if exists state_delete on public.user_state;
create policy state_select on public.user_state for select to authenticated using ((select auth.uid()) = user_id);
create policy state_insert on public.user_state for insert to authenticated with check ((select auth.uid()) = user_id);
create policy state_update on public.user_state for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy state_delete on public.user_state for delete to authenticated using ((select auth.uid()) = user_id);

-- 6. Удаление аккаунта самим пользователем (вместе со всеми данными — каскадом).
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  delete from public.cards      where user_id = uid;
  delete from public.grammar_notes where user_id = uid;
  delete from public.user_state where user_id = uid;
  delete from auth.users        where id = uid;
end $$;

revoke all on function public.delete_my_account()   from public, anon;
grant execute on function public.delete_my_account() to authenticated;
revoke all on function public.enforce_card_limit()  from public, anon, authenticated;
revoke all on function public.enforce_note_limit()  from public, anon, authenticated;
revoke all on function public.touch_updated_at()    from public, anon, authenticated;
