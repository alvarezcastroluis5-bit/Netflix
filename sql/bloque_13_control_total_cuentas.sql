-- =========================================================
-- BLOQUE 13: CONTROL TOTAL DE CUENTAS DESDE ADMINISTRACIÓN
-- Ejecutar una sola vez después de los bloques anteriores.
-- =========================================================

-- ---------------------------------------------------------
-- 1. NORMALIZACIÓN Y VALIDACIÓN DE TIPOS
-- Netflix: Cuenta completa
-- Spotify: Cuenta familiar o Cuenta individual
-- ---------------------------------------------------------

create or replace function public.bulk_add_service_accounts(
  p_service text,
  p_account_type text,
  p_emails text[]
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_service text := lower(trim(coalesce(p_service,'')));
  v_type text := trim(coalesce(p_account_type,''));
  v_raw text;
  v_email text;
  v_inserted integer := 0;
  v_duplicates integer := 0;
  v_invalid integer := 0;
begin
  if not private.is_admin() then
    raise exception 'Solo el administrador puede añadir cuentas.';
  end if;

  if v_service not in ('netflix','spotify') then
    raise exception 'Plataforma no válida.';
  end if;

  if v_service='netflix' then
    v_type := 'Cuenta completa';
  elsif v_type not in ('Cuenta familiar','Cuenta individual') then
    raise exception 'Spotify solo admite Cuenta familiar o Cuenta individual.';
  end if;

  foreach v_raw in array p_emails loop
    v_email:=lower(trim(coalesce(v_raw,'')));

    if v_email='' or
       v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    then
      v_invalid:=v_invalid+1;
      continue;
    end if;

    if exists(
      select 1
      from public.netflix_accounts account
      where account.service=v_service
        and lower(account.current_email)=v_email
    ) then
      v_duplicates:=v_duplicates+1;
      continue;
    end if;

    insert into public.netflix_accounts(
      service,
      current_email,
      account_type,
      status,
      created_by
    )
    values(
      v_service,
      v_email,
      v_type,
      'available',
      v_actor
    );

    v_inserted:=v_inserted+1;
  end loop;

  return jsonb_build_object(
    'success',true,
    'inserted',v_inserted,
    'duplicates',v_duplicates,
    'invalid',v_invalid
  );
end;
$$;

revoke all
on function public.bulk_add_service_accounts(text,text,text[])
from public,anon;

grant execute
on function public.bulk_add_service_accounts(text,text,text[])
to authenticated;

-- ---------------------------------------------------------
-- 2. EDICIÓN ADMINISTRATIVA
-- El correo recibido se ignora deliberadamente.
-- Solo soporte puede cambiar el correo.
-- ---------------------------------------------------------

create or replace function public.admin_edit_service_account(
  p_account_id uuid,
  p_service text,
  p_email text,
  p_account_type text,
  p_owner_id uuid,
  p_starts_on date
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_service text := lower(trim(coalesce(p_service,'')));
  v_type text := trim(coalesce(p_account_type,''));
  v_existing_email text;
begin
  if not private.is_admin() then
    raise exception 'Solo el administrador puede editar cuentas.';
  end if;

  select account.current_email
  into v_existing_email
  from public.netflix_accounts account
  where account.id=p_account_id
  for update;

  if v_existing_email is null then
    raise exception 'La cuenta no existe.';
  end if;

  if v_service not in ('netflix','spotify') then
    raise exception 'Plataforma no válida.';
  end if;

  if v_service='netflix' then
    v_type := 'Cuenta completa';
  elsif v_type not in ('Cuenta familiar','Cuenta individual') then
    raise exception 'Spotify solo admite Cuenta familiar o Cuenta individual.';
  end if;

  if p_owner_id is not null and not exists(
    select 1
    from public.profiles profile
    where profile.id=p_owner_id
      and profile.role='reseller'
      and profile.status='active'
  ) then
    raise exception 'Propietario no válido.';
  end if;

  update public.account_assignments
  set status='cancelled'
  where account_id=p_account_id
    and status='active';

  if p_owner_id is not null then
    insert into public.account_assignments(
      account_id,
      seller_id,
      buyer_reseller_id,
      starts_on,
      duration_days,
      status,
      created_by
    )
    values(
      p_account_id,
      v_actor,
      p_owner_id,
      p_starts_on,
      30,
      'active',
      v_actor
    );
  end if;

  update public.netflix_accounts
  set
    service=v_service,
    -- current_email NO se modifica.
    account_type=v_type,
    current_reseller_id=p_owner_id,
    current_client_id=null,
    status=case
      when p_owner_id is null then 'available'
      else 'assigned'
    end
  where id=p_account_id;

  return jsonb_build_object(
    'success',true,
    'message','Cuenta actualizada. El correo se mantuvo bloqueado.',
    'email',v_existing_email
  );
end;
$$;

revoke all
on function public.admin_edit_service_account(
  uuid,text,text,text,uuid,date
)
from public,anon;

grant execute
on function public.admin_edit_service_account(
  uuid,text,text,text,uuid,date
)
to authenticated;

-- ---------------------------------------------------------
-- 3. ELIMINACIÓN INDIVIDUAL DEFINITIVA
-- ---------------------------------------------------------

create or replace function public.admin_delete_service_account(
  p_account_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_email text;
  v_service text;
  v_ticket_ids uuid[];
begin
  if not private.is_admin() then
    raise exception 'Solo el administrador puede eliminar cuentas.';
  end if;

  select account.current_email,account.service
  into v_email,v_service
  from public.netflix_accounts account
  where account.id=p_account_id
  for update;

  if v_email is null then
    raise exception 'La cuenta no existe o ya fue eliminada.';
  end if;

  select array_agg(ticket.id)
  into v_ticket_ids
  from public.support_tickets ticket
  where ticket.account_id=p_account_id;

  if coalesce(array_length(v_ticket_ids,1),0)>0 then
    delete from public.ticket_messages
    where ticket_id=any(v_ticket_ids);

    delete from public.support_tickets
    where id=any(v_ticket_ids);
  end if;

  delete from public.account_change_history
  where account_id=p_account_id;

  delete from public.account_assignments
  where account_id=p_account_id;

  delete from public.netflix_accounts
  where id=p_account_id;

  return jsonb_build_object(
    'success',true,
    'message','Cuenta eliminada definitivamente de todo el sistema.',
    'email',v_email,
    'service',v_service
  );
end;
$$;

revoke all
on function public.admin_delete_service_account(uuid)
from public,anon;

grant execute
on function public.admin_delete_service_account(uuid)
to authenticated;

-- ---------------------------------------------------------
-- 4. ELIMINACIÓN MASIVA DEFINITIVA
-- ---------------------------------------------------------

create or replace function public.admin_delete_service_accounts(
  p_service text,
  p_emails text[]
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_service text := lower(trim(coalesce(p_service,'')));
  v_raw text;
  v_email text;
  v_account_id uuid;
  v_result jsonb;
  v_deleted integer := 0;
  v_not_found integer := 0;
  v_invalid integer := 0;
begin
  if not private.is_admin() then
    raise exception 'Solo el administrador puede eliminar cuentas.';
  end if;

  if v_service not in ('netflix','spotify') then
    raise exception 'Plataforma no válida.';
  end if;

  if coalesce(array_length(p_emails,1),0)=0 then
    raise exception 'Coloca al menos un correo.';
  end if;

  foreach v_raw in array p_emails loop
    v_email:=lower(trim(coalesce(v_raw,'')));
    v_account_id:=null;

    if v_email='' or
       v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    then
      v_invalid:=v_invalid+1;
      continue;
    end if;

    select account.id
    into v_account_id
    from public.netflix_accounts account
    where account.service=v_service
      and lower(account.current_email)=v_email
    limit 1;

    if v_account_id is null then
      v_not_found:=v_not_found+1;
      continue;
    end if;

    v_result:=public.admin_delete_service_account(v_account_id);
    v_deleted:=v_deleted+1;
  end loop;

  return jsonb_build_object(
    'success',true,
    'deleted',v_deleted,
    'not_found',v_not_found,
    'invalid',v_invalid
  );
end;
$$;

revoke all
on function public.admin_delete_service_accounts(text,text[])
from public,anon;

grant execute
on function public.admin_delete_service_accounts(text,text[])
to authenticated;

select 'BLOQUE 13 CREADO CORRECTAMENTE' as resultado;
