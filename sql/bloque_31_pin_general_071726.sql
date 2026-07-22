begin;

-- ============================================================
-- BLOQUE 31 · PIN GENERAL NETFLIX
-- Centro Premium V6.9.5
--
-- Establece para todos los usuarios el PIN general:
-- 071726
--
-- El valor guardado en la base es únicamente su hash SHA-256.
-- ============================================================

create extension if not exists pgcrypto
with schema extensions;

create table if not exists public.netflix_access_settings(
  id smallint primary key default 1,
  pin_hash text not null,
  updated_by uuid references public.profiles(id)
    on delete set null,
  updated_at timestamptz not null default now(),
  constraint netflix_access_settings_single_row
    check(id=1)
);

insert into public.netflix_access_settings(
  id,
  pin_hash,
  updated_by,
  updated_at
)
values(
  1,
  '6a33d61b0eb6f3c190334252aeb036a708d9189be5a60f8cb8ebae4f30f896bc',
  (select auth.uid()),
  now()
)
on conflict(id)
do update set
  pin_hash=excluded.pin_hash,
  updated_by=excluded.updated_by,
  updated_at=now();

commit;

select pg_notify('pgrst','reload schema');

select
  'BLOQUE 31 CREADO CORRECTAMENTE: PIN GENERAL 071726'
  as resultado;
