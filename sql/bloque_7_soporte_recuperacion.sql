-- =========================================================
-- BLOQUE 7: PERSONAL DE SOPORTE + RECUPERACIÓN DE CONTRASEÑA
-- Ejecutar una sola vez después de los bloques anteriores.
-- =========================================================

-- ---------------------------------------------------------
-- 1. SOLICITUDES TEMPORALES DE RECUPERACIÓN
-- No se guarda la contraseña nueva.
-- ---------------------------------------------------------

create table if not exists public.password_reset_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  parent_id uuid not null references public.profiles(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists password_reset_requests_user_created_idx
on public.password_reset_requests(user_id, created_at desc);

create index if not exists password_reset_requests_token_idx
on public.password_reset_requests(token_hash);

alter table public.password_reset_requests enable row level security;

revoke all
on public.password_reset_requests
from public, anon, authenticated;

-- ---------------------------------------------------------
-- 2. AUDITORÍA DE CAMBIOS DE CONTRASEÑA
-- Solo registra quién cambió y cuándo; nunca la contraseña.
-- ---------------------------------------------------------

create table if not exists public.password_change_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  parent_id uuid references public.profiles(id) on delete set null,
  change_source text not null default 'parent_whatsapp_recovery',
  created_at timestamptz not null default now()
);

create index if not exists password_change_audit_user_idx
on public.password_change_audit(user_id, created_at desc);

alter table public.password_change_audit enable row level security;

revoke all
on public.password_change_audit
from public, anon, authenticated;

-- ---------------------------------------------------------
-- 3. SOPORTE: CAMBIAR SOLO EL CORREO DE UNA CUENTA
-- Conserva propietario, fecha de inicio y regla de 30 días.
-- ---------------------------------------------------------

create or replace function public.support_update_service_email(
  p_account_id uuid,
  p_new_email text,
  p_reason text default 'Actualización realizada por soporte'
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_role text;
  v_old_email text;
  v_service text;
  v_new_email text := lower(trim(coalesce(p_new_email,'')));
begin
  select role::text
  into v_role
  from public.profiles
  where id=v_actor
    and status='active';

  if v_role not in ('admin','support') then
    raise exception 'Solo administración o soporte pueden cambiar correos.';
  end if;

  if v_new_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'El correo nuevo no es válido.';
  end if;

  select current_email, service
  into v_old_email, v_service
  from public.netflix_accounts
  where id=p_account_id
  for update;

  if v_old_email is null then
    raise exception 'La cuenta no existe.';
  end if;

  if exists(
    select 1
    from public.netflix_accounts
    where service=v_service
      and lower(current_email)=v_new_email
      and id<>p_account_id
  ) then
    raise exception 'Ese correo ya está registrado en la misma plataforma.';
  end if;

  update public.netflix_accounts
  set current_email=v_new_email
  where id=p_account_id;

  insert into public.account_change_history(
    account_id,
    old_email,
    new_email,
    change_type,
    reason,
    performed_by,
    service
  )
  values(
    p_account_id,
    v_old_email,
    v_new_email,
    'Actualización soporte',
    coalesce(nullif(trim(p_reason),''),'Actualización realizada por soporte'),
    v_actor,
    v_service
  );

  return jsonb_build_object(
    'success',true,
    'message','Correo actualizado. La fecha y los 30 días se conservaron.',
    'old_email',v_old_email,
    'new_email',v_new_email
  );
end;
$$;

revoke all
on function public.support_update_service_email(uuid,text,text)
from public, anon;

grant execute
on function public.support_update_service_email(uuid,text,text)
to authenticated;

-- ---------------------------------------------------------
-- 4. LECTURA NECESARIA PARA PERSONAL DE SOPORTE
-- ---------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.netflix_accounts enable row level security;
alter table public.account_assignments enable row level security;
alter table public.account_change_history enable row level security;
alter table public.support_tickets enable row level security;
alter table public.ticket_messages enable row level security;

drop policy if exists profiles_staff_read_v7 on public.profiles;
create policy profiles_staff_read_v7
on public.profiles
for select
to authenticated
using(private.is_staff());

drop policy if exists service_accounts_staff_read_v7 on public.netflix_accounts;
create policy service_accounts_staff_read_v7
on public.netflix_accounts
for select
to authenticated
using(private.is_staff());

drop policy if exists assignments_staff_read_v7 on public.account_assignments;
create policy assignments_staff_read_v7
on public.account_assignments
for select
to authenticated
using(private.is_staff());

drop policy if exists change_history_staff_read_v7 on public.account_change_history;
create policy change_history_staff_read_v7
on public.account_change_history
for select
to authenticated
using(private.is_staff());

drop policy if exists support_tickets_staff_read_v7 on public.support_tickets;
create policy support_tickets_staff_read_v7
on public.support_tickets
for select
to authenticated
using(private.is_staff());

drop policy if exists support_tickets_staff_update_v7 on public.support_tickets;
create policy support_tickets_staff_update_v7
on public.support_tickets
for update
to authenticated
using(private.is_staff())
with check(private.is_staff());

drop policy if exists ticket_messages_staff_read_v7 on public.ticket_messages;
create policy ticket_messages_staff_read_v7
on public.ticket_messages
for select
to authenticated
using(private.is_staff());

drop policy if exists ticket_messages_staff_insert_v7 on public.ticket_messages;
create policy ticket_messages_staff_insert_v7
on public.ticket_messages
for insert
to authenticated
with check(
  private.is_staff()
  and author_id=(select auth.uid())
);

grant select on public.profiles to authenticated;
grant select on public.account_assignments to authenticated;
grant select on public.account_change_history to authenticated;
grant select,update on public.support_tickets to authenticated;
grant select,insert on public.ticket_messages to authenticated;

do $$
begin
  if to_regclass('public.account_assignment_summary') is not null then
    execute 'grant select on public.account_assignment_summary to authenticated';
  end if;
end
$$;

select 'BLOQUE 7 CREADO CORRECTAMENTE' as resultado;
