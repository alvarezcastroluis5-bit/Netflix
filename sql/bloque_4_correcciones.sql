-- =========================================================
-- BLOQUE 4: CORRECCIÓN DE PERMISOS Y CARGA MASIVA
-- Ejecutar después de los bloques 1, 2 y 3.
-- =========================================================

grant usage on schema public to authenticated;
grant usage on schema private to authenticated;

grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.clients to authenticated;
grant select, insert, update, delete on public.netflix_accounts to authenticated;
grant select, insert, update, delete on public.account_assignments to authenticated;
grant select, insert, update on public.support_tickets to authenticated;
grant select, insert on public.ticket_messages to authenticated;
grant select, insert on public.account_change_history to authenticated;
grant select, insert, update, delete on public.entertainment_content to authenticated;
grant select, insert, update, delete on public.netflix_service_actions to authenticated;
grant select on public.audit_logs to authenticated;
grant select on public.account_assignment_summary to authenticated;
grant usage, select on all sequences in schema public to authenticated;

alter table public.netflix_accounts enable row level security;
alter table public.entertainment_content enable row level security;

drop policy if exists accounts_select_visible on public.netflix_accounts;
drop policy if exists accounts_admin_insert on public.netflix_accounts;
drop policy if exists accounts_staff_update on public.netflix_accounts;
drop policy if exists accounts_admin_delete on public.netflix_accounts;

create policy accounts_select_visible
on public.netflix_accounts
for select
to authenticated
using (private.can_view_account(id));

create policy accounts_admin_insert
on public.netflix_accounts
for insert
to authenticated
with check (private.is_admin());

create policy accounts_staff_update
on public.netflix_accounts
for update
to authenticated
using (private.is_staff())
with check (private.is_staff());

create policy accounts_admin_delete
on public.netflix_accounts
for delete
to authenticated
using (private.is_admin());

drop policy if exists content_select_published on public.entertainment_content;
drop policy if exists content_admin_insert on public.entertainment_content;
drop policy if exists content_admin_update on public.entertainment_content;
drop policy if exists content_admin_delete on public.entertainment_content;

create policy content_select_published
on public.entertainment_content
for select
to authenticated
using (
  private.is_staff()
  or (
    status = 'published'::public.content_status
    and (publish_at is null or publish_at <= now())
    and (remove_at is null or remove_at > now())
  )
);

create policy content_admin_insert
on public.entertainment_content
for insert
to authenticated
with check (private.is_admin());

create policy content_admin_update
on public.entertainment_content
for update
to authenticated
using (private.is_admin())
with check (private.is_admin());

create policy content_admin_delete
on public.entertainment_content
for delete
to authenticated
using (private.is_admin());

create or replace function public.bulk_add_netflix_accounts(
  p_emails text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_raw text;
  v_email text;
  v_inserted integer := 0;
  v_duplicates integer := 0;
  v_invalid integer := 0;
begin
  if v_actor is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  if not private.is_admin() then
    raise exception 'Solo el administrador puede añadir cuentas a la base.';
  end if;

  if p_emails is null or coalesce(array_length(p_emails, 1), 0) = 0 then
    raise exception 'No se recibieron correos.';
  end if;

  foreach v_raw in array p_emails loop
    v_email := lower(trim(coalesce(v_raw, '')));

    if v_email = '' or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
      v_invalid := v_invalid + 1;
      continue;
    end if;

    if exists (
      select 1
      from public.netflix_accounts a
      where lower(a.current_email) = v_email
    ) then
      v_duplicates := v_duplicates + 1;
      continue;
    end if;

    begin
      insert into public.netflix_accounts (
        current_email,
        account_type,
        status,
        created_by
      )
      values (
        v_email,
        'Cuenta completa',
        'available',
        v_actor
      );

      v_inserted := v_inserted + 1;
    exception
      when unique_violation then
        v_duplicates := v_duplicates + 1;
    end;
  end loop;

  insert into public.audit_logs (
    actor_id,
    action,
    entity_type,
    details
  )
  values (
    v_actor,
    'carga_masiva_cuentas',
    'netflix_account',
    jsonb_build_object(
      'inserted', v_inserted,
      'duplicates', v_duplicates,
      'invalid', v_invalid
    )
  );

  return jsonb_build_object(
    'success', true,
    'inserted', v_inserted,
    'duplicates', v_duplicates,
    'invalid', v_invalid
  );
end;
$$;

revoke all on function public.bulk_add_netflix_accounts(text[]) from public, anon;
grant execute on function public.bulk_add_netflix_accounts(text[]) to authenticated;

select 'BLOQUE 4 CREADO CORRECTAMENTE' as resultado;
