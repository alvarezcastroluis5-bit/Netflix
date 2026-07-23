begin;

-- ============================================================
-- BLOQUE 38
-- REPARAR PERMISOS DEL PANEL + NETFLIX JERÁRQUICO
-- ============================================================
-- Corrige:
--   permission denied for function staff_list_service_accounts_v29
--   permission denied for function staff_list_profiles_v24
--   permission denied for function list_service_catalog_v29
--   permission denied for table support_tickets
--
-- Regla Netflix:
--   Un distribuidor puede solicitar códigos de sus propias cuentas y de
--   todas las cuentas que estén en cualquier nivel inferior de su rama.
--
-- Ejemplo:
--   Sofía -> José -> Manuel -> Jhon
--   Si Jhon tiene la cuenta, Sofía, José, Manuel y Jhon pueden validarla.
--   Usuarios de otras ramas no pueden acceder.
-- ============================================================

create schema if not exists private;

grant usage on schema public to authenticated;
grant usage on schema private to authenticated;

-- Las políticas RLS utilizan funciones auxiliares del esquema private.
grant execute on all functions in schema private to authenticated;

-- Permisos de tablas que el frontend consulta directamente.
grant select on public.profiles to authenticated;
grant select on public.netflix_accounts to authenticated;
grant select on public.account_assignments to authenticated;
grant select on public.account_change_history to authenticated;
grant select,insert,update on public.support_tickets to authenticated;
grant select,insert on public.ticket_messages to authenticated;
grant select,insert,update,delete on public.entertainment_content to authenticated;
grant select on public.help_articles to authenticated;
grant select on public.service_catalog to authenticated;
grant select on public.notifications to authenticated;
grant select,update on public.notification_recipients to authenticated;
grant usage,select on all sequences in schema public to authenticated;

-- Reponer RLS para administración y soporte sin abrir datos a distribuidores.
alter table public.profiles enable row level security;
alter table public.support_tickets enable row level security;
alter table public.ticket_messages enable row level security;
alter table public.account_change_history enable row level security;

drop policy if exists profiles_staff_read_v38 on public.profiles;
create policy profiles_staff_read_v38
on public.profiles
for select to authenticated
using(private.is_staff());

drop policy if exists support_tickets_staff_read_v38 on public.support_tickets;
create policy support_tickets_staff_read_v38
on public.support_tickets
for select to authenticated
using(private.is_staff());

drop policy if exists support_tickets_staff_update_v38 on public.support_tickets;
create policy support_tickets_staff_update_v38
on public.support_tickets
for update to authenticated
using(private.is_staff())
with check(private.is_staff());

drop policy if exists ticket_messages_staff_read_v38 on public.ticket_messages;
create policy ticket_messages_staff_read_v38
on public.ticket_messages
for select to authenticated
using(private.is_staff());

drop policy if exists ticket_messages_staff_insert_v38 on public.ticket_messages;
create policy ticket_messages_staff_insert_v38
on public.ticket_messages
for insert to authenticated
with check(
  private.is_staff()
  and author_id=(select auth.uid())
);

drop policy if exists account_change_history_staff_read_v38
on public.account_change_history;
create policy account_change_history_staff_read_v38
on public.account_change_history
for select to authenticated
using(private.is_staff());

-- ============================================================
-- RESTAURAR EXECUTE EN TODOS LOS RPC ACTIVOS DE LA V6.9.18.6
-- Se recorren todas las firmas existentes para evitar errores por firmas
-- antiguas o funciones sobrecargadas.
-- ============================================================
do $$
declare
  v_function record;
  v_names text[] := array[
    'admin_delete_help_article',
    'admin_delete_service_account',
    'admin_delete_service_accounts',
    'admin_delete_service_v29',
    'admin_edit_service_account_v29',
    'admin_save_help_article',
    'admin_update_panel_settings_v29',
    'admin_upsert_service_v29',
    'bulk_add_service_accounts_v27',
    'bulk_reassign_service_accounts_v36',
    'bulk_update_my_account_terms_v28',
    'bulk_update_my_account_terms_v29',
    'create_support_ticket_v29',
    'forward_notification_to_my_network',
    'get_my_parent_contact',
    'get_panel_settings_v29',
    'list_published_content_v29',
    'list_service_catalog_v29',
    'mark_notification_read_v21',
    'reassign_account_hierarchical_v29',
    'replace_service_account',
    'reseller_dashboard_metrics_v26',
    'reseller_list_branch_accounts_v29',
    'reseller_list_network_v25',
    'reseller_list_ticket_messages_v26',
    'reseller_list_tickets_v26',
    'reseller_list_user_branch_accounts_v29',
    'send_hierarchical_notification_v36',
    'set_my_notification_preferences',
    'staff_apply_ticket_replacement_v17',
    'staff_list_profiles_v24',
    'staff_list_service_accounts_v29',
    'staff_list_user_branch_accounts_v29',
    'staff_send_ticket_response_v17',
    'staff_set_ticket_status_v17',
    'support_update_service_email',
    'update_my_account_term_v29',
    'update_my_profile',
    'validate_netflix_owner_access_v35'
  ];
begin
  for v_function in
    select procedure.oid::regprocedure as signature
    from pg_proc procedure
    join pg_namespace namespace
      on namespace.oid=procedure.pronamespace
    where namespace.nspname='public'
      and procedure.proname=any(v_names)
  loop
    execute format(
      'grant execute on function %s to authenticated',
      v_function.signature
    );
  end loop;
end
$$;

-- ============================================================
-- VALIDACIÓN NETFLIX PARA TODA LA RAMA DESCENDENTE
-- ============================================================
create or replace function public.validate_netflix_owner_access_v35(
  p_email text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_role text;
  v_account public.netflix_accounts;
begin
  if v_actor is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  select profile.role::text
  into v_role
  from public.profiles profile
  where profile.id=v_actor
    and profile.status::text='active';

  if v_role is null then
    raise exception 'Tu usuario no está activo.';
  end if;

  if v_role in('admin','support') then
    select account.*
    into v_account
    from public.netflix_accounts account
    where account.service::text='netflix'
      and lower(account.current_email)=lower(trim(p_email))
      and account.current_client_id is null
      and account.status::text='assigned'
    limit 1;
  elsif v_role='reseller' then
    with recursive branch as(
      select
        profile.id,
        array[profile.id]::uuid[] as path
      from public.profiles profile
      where profile.id=v_actor
        and profile.role::text='reseller'
        and profile.status::text='active'

      union all

      select
        child.id,
        branch.path||child.id
      from public.profiles child
      join branch
        on child.parent_id=branch.id
      where child.role::text='reseller'
        and child.status::text='active'
        and not child.id=any(branch.path)
    )
    select account.*
    into v_account
    from public.netflix_accounts account
    where account.service::text='netflix'
      and lower(account.current_email)=lower(trim(p_email))
      and account.current_client_id is null
      and account.status::text='assigned'
      and account.current_reseller_id in(
        select branch.id
        from branch
      )
    limit 1;
  else
    raise exception 'Tu usuario no puede solicitar códigos Netflix.';
  end if;

  if not found then
    raise exception
      'La cuenta no pertenece a tu usuario ni a ningún subordinado de tu rama.';
  end if;

  return jsonb_build_object(
    'allowed',true,
    'account_id',v_account.id,
    'email',v_account.current_email,
    'country',coalesce(
      nullif(trim(v_account.country),''),
      'Sin configurar'
    )
  );
end;
$$;

revoke all
on function public.validate_netflix_owner_access_v35(text)
from public,anon;

grant execute
on function public.validate_netflix_owner_access_v35(text)
to authenticated;

-- Diagnóstico opcional para confirmar los cuatro permisos reportados.
create or replace function public.panel_permissions_healthcheck_v38()
returns jsonb
language sql
security definer
set search_path=''
stable
as $$
  select jsonb_build_object(
    'authenticated_staff_profiles',
      has_function_privilege(
        'authenticated',
        'public.staff_list_profiles_v24()',
        'execute'
      ),
    'authenticated_staff_accounts',
      has_function_privilege(
        'authenticated',
        'public.staff_list_service_accounts_v29()',
        'execute'
      ),
    'authenticated_service_catalog',
      has_function_privilege(
        'authenticated',
        'public.list_service_catalog_v29()',
        'execute'
      ),
    'authenticated_support_tickets',
      has_table_privilege(
        'authenticated',
        'public.support_tickets',
        'select'
      ),
    'netflix_hierarchy_enabled',true
  );
$$;

revoke all
on function public.panel_permissions_healthcheck_v38()
from public,anon;

grant execute
on function public.panel_permissions_healthcheck_v38()
to authenticated;

commit;

select pg_notify('pgrst','reload schema');

select public.panel_permissions_healthcheck_v38() as diagnostico;

select
  'BLOQUE 38 CREADO CORRECTAMENTE: PERMISOS Y NETFLIX JERÁRQUICO'
  as resultado;
