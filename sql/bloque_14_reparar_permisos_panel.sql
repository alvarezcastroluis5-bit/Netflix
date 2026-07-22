-- =========================================================
-- BLOQUE 14: REPARAR PERMISOS DEL PANEL
-- Corrige:
-- permission denied for table profiles
-- permission denied for table netflix_accounts
-- permission denied for view account_assignment_summary
-- =========================================================

begin;

grant usage on schema public to authenticated;
grant usage on schema private to authenticated;

-- Las funciones privadas únicamente calculan permisos y visibilidad.
grant execute on all functions in schema private to authenticated;

grant select on public.profiles to authenticated;
grant select on public.netflix_accounts to authenticated;
grant select on public.account_assignments to authenticated;
grant select on public.account_change_history to authenticated;
grant select on public.support_tickets to authenticated;
grant select on public.ticket_messages to authenticated;
grant select on public.entertainment_content to authenticated;
grant select on public.notifications to authenticated;
grant select,update on public.notification_recipients to authenticated;

-- Permisos operativos necesarios.
grant insert,update on public.support_tickets to authenticated;
grant insert on public.ticket_messages to authenticated;
grant insert on public.account_change_history to authenticated;

-- La vista debe tener permiso explícito.
do $$
begin
  if to_regclass('public.account_assignment_summary') is not null then
    execute 'grant select on public.account_assignment_summary to authenticated';
  end if;
end
$$;

-- Activar RLS donde corresponde.
alter table public.profiles enable row level security;
alter table public.netflix_accounts enable row level security;
alter table public.account_assignments enable row level security;
alter table public.account_change_history enable row level security;
alter table public.support_tickets enable row level security;
alter table public.ticket_messages enable row level security;

-- =========================================================
-- ADMINISTRADOR Y SOPORTE PUEDEN LEER LOS DATOS NECESARIOS.
-- =========================================================

drop policy if exists profiles_staff_read_v14
on public.profiles;

create policy profiles_staff_read_v14
on public.profiles
for select
to authenticated
using(private.is_staff());

drop policy if exists netflix_accounts_staff_read_v14
on public.netflix_accounts;

create policy netflix_accounts_staff_read_v14
on public.netflix_accounts
for select
to authenticated
using(private.is_staff());

drop policy if exists assignments_staff_read_v14
on public.account_assignments;

create policy assignments_staff_read_v14
on public.account_assignments
for select
to authenticated
using(private.is_staff());

drop policy if exists change_history_staff_read_v14
on public.account_change_history;

create policy change_history_staff_read_v14
on public.account_change_history
for select
to authenticated
using(private.is_staff());

drop policy if exists support_tickets_staff_read_v14
on public.support_tickets;

create policy support_tickets_staff_read_v14
on public.support_tickets
for select
to authenticated
using(private.is_staff());

drop policy if exists ticket_messages_staff_read_v14
on public.ticket_messages;

create policy ticket_messages_staff_read_v14
on public.ticket_messages
for select
to authenticated
using(private.is_staff());

-- =========================================================
-- SOPORTE Y ADMINISTRADOR PUEDEN OPERAR GARANTÍAS/TICKETS.
-- LOS DISTRIBUIDORES NO PUEDEN MODIFICAR CUENTAS.
-- =========================================================

drop policy if exists support_tickets_staff_update_v14
on public.support_tickets;

create policy support_tickets_staff_update_v14
on public.support_tickets
for update
to authenticated
using(private.is_staff())
with check(private.is_staff());

drop policy if exists ticket_messages_staff_insert_v14
on public.ticket_messages;

create policy ticket_messages_staff_insert_v14
on public.ticket_messages
for insert
to authenticated
with check(
  private.is_staff()
  and author_id=(select auth.uid())
);

drop policy if exists change_history_staff_insert_v14
on public.account_change_history;

create policy change_history_staff_insert_v14
on public.account_change_history
for insert
to authenticated
with check(private.is_staff());

commit;

select 'BLOQUE 14 CREADO CORRECTAMENTE' as resultado;
