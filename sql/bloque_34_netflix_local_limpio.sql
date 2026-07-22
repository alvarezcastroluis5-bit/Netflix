begin;

-- ============================================================
-- BLOQUE 34 · NETFLIX LOCAL LIMPIO
-- Centro Premium V6.9.14
--
-- No utiliza iframe ni página externa.
-- Revalida propiedad, PIN y operación en Supabase.
-- Registra la solicitud y crea el ticket correspondiente.
-- ============================================================

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.netflix_access_settings(
  id smallint primary key default 1,
  pin_hash text not null,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint netflix_access_settings_single_row check(id=1)
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
  updated_by=coalesce(excluded.updated_by,public.netflix_access_settings.updated_by),
  updated_at=now();

alter table public.netflix_access_settings enable row level security;
revoke all on public.netflix_access_settings from public,anon,authenticated;


drop function if exists public.process_netflix_local_v34(text,text,text);

create function public.process_netflix_local_v34(
  p_email text,
  p_pin text,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_pin text := trim(coalesce(p_pin,''));
  v_action text := lower(trim(coalesce(p_action,'')));
  v_expected_hash text;
  v_received_hash text;
  v_access jsonb;
  v_result jsonb;
begin
  if v_actor is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  if v_pin !~ '^[0-9]{6}$' then
    raise exception 'El PIN debe contener exactamente 6 dígitos.';
  end if;

  if v_action not in(
    'actualizar_hogar',
    'inicio_sesion_codigo',
    'restablecer_contrasena',
    'codigo_6_digitos',
    'acceso_temporal'
  ) then
    raise exception 'Selecciona una operación válida.';
  end if;

  -- Revalida la propiedad jerárquica justo antes de procesar.
  select public.validate_netflix_access_v29(p_email)
  into v_access;

  select settings.pin_hash
  into v_expected_hash
  from public.netflix_access_settings settings
  where settings.id=1;

  if v_expected_hash is null then
    raise exception 'El PIN de Netflix no está configurado.';
  end if;

  v_received_hash := encode(
    extensions.digest(
      convert_to(v_pin,'UTF8'),
      'sha256'
    ),
    'hex'
  );

  if v_received_hash<>v_expected_hash then
    raise exception 'PIN incorrecto.';
  end if;

  select public.create_netflix_action_request_v29(
    p_email,
    v_action
  )
  into v_result;

  return v_result || jsonb_build_object(
    'local_interface',true,
    'pin_validated',true,
    'owner_name',v_access->>'owner_name',
    'parent_name',v_access->>'parent_name',
    'country',v_access->>'country'
  );
end;
$$;

revoke all
on function public.process_netflix_local_v34(text,text,text)
from public,anon;

grant execute
on function public.process_netflix_local_v34(text,text,text)
to authenticated;

commit;

select pg_notify('pgrst','reload schema');

select
  'BLOQUE 34 CREADO CORRECTAMENTE: NETFLIX LOCAL LIMPIO'
  as resultado;
