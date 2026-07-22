begin;

-- ============================================================
-- BLOQUE 32 · CORREGIR ASIGNACIÓN DE CUENTAS
-- Centro Premium V6.9.6
--
-- Corrige:
-- 1. Usuarios → Asignar cuentas.
-- 2. Usuarios → Cuentas → Editar.
-- 3. Cuentas → Editar → Cambiar propietario.
--
-- Error corregido:
-- column "status" is of type public.account_status
-- but expression is of type text
-- ============================================================


-- ============================================================
-- 1. CAMBIAR PROPIETARIO DENTRO DE LA JERARQUÍA
-- ============================================================
create or replace function public.reassign_account_hierarchical_v29(
  p_account_id uuid,
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
  v_role text;
  v_account public.netflix_accounts;
  v_actor_allowed boolean := false;
  v_owner_allowed boolean := false;
  v_new_account_status public.account_status;
begin
  if v_actor is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  select profile.role::text
  into v_role
  from public.profiles profile
  where profile.id=v_actor
    and profile.status::text='active';

  if v_role not in('admin','reseller') then
    raise exception
      'Tu usuario no puede cambiar propietarios.';
  end if;

  select account.*
  into v_account
  from public.netflix_accounts account
  where account.id=p_account_id
  for update;

  if not found then
    raise exception 'La cuenta no existe.';
  end if;

  if v_role='admin' then
    v_actor_allowed := true;

    v_owner_allowed := (
      p_owner_id is null
      or exists(
        select 1
        from public.profiles profile
        where profile.id=p_owner_id
          and profile.role::text='reseller'
          and profile.status::text='active'
      )
    );
  else
    if p_owner_id is null then
      raise exception
        'Un distribuidor no puede devolver la cuenta a Disponible.';
    end if;

    with recursive branch as(
      select
        profile.id,
        array[profile.id]::uuid[] path
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
    select
      exists(
        select 1
        from branch
        where branch.id=v_account.current_reseller_id
      ),
      exists(
        select 1
        from branch
        where branch.id=p_owner_id
      )
    into
      v_actor_allowed,
      v_owner_allowed;
  end if;

  if not v_actor_allowed then
    raise exception
      'La cuenta no pertenece a tu propia rama.';
  end if;

  if not v_owner_allowed then
    raise exception
      'El nuevo propietario no pertenece a tu propia rama.';
  end if;

  update public.account_assignments
  set status='cancelled'
  where account_id=p_account_id
    and status::text='active';

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

    v_new_account_status :=
      'assigned'::public.account_status;
  else
    v_new_account_status :=
      'available'::public.account_status;
  end if;

  if p_starts_on is not null then
    insert into public.account_manager_terms(
      account_id,
      manager_id,
      starts_on,
      duration_days,
      created_at,
      updated_at
    )
    values(
      p_account_id,
      v_actor,
      p_starts_on,
      30,
      now(),
      now()
    )
    on conflict(account_id,manager_id)
    do update set
      starts_on=excluded.starts_on,
      duration_days=30,
      updated_at=now();
  end if;

  update public.netflix_accounts
  set
    current_reseller_id=p_owner_id,
    current_client_id=null,
    origin_distributor_id=coalesce(
      origin_distributor_id,
      p_owner_id
    ),
    status=v_new_account_status
  where id=p_account_id;

  return jsonb_build_object(
    'success',true,
    'account_id',p_account_id,
    'owner_id',p_owner_id,
    'status',v_new_account_status::text,
    'message',
      'Propietario actualizado sin modificar fechas ajenas.'
  );
end;
$$;

revoke all
on function public.reassign_account_hierarchical_v29(
  uuid,
  uuid,
  date
)
from public,anon;

grant execute
on function public.reassign_account_hierarchical_v29(
  uuid,
  uuid,
  date
)
to authenticated;


-- ============================================================
-- 2. ASIGNACIÓN INICIAL DESDE USUARIOS
-- ============================================================
create or replace function public.bulk_assign_service_accounts_v29(
  p_service text,
  p_account_emails text[],
  p_distributor_id uuid,
  p_starts_on date
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_email text;
  v_account public.netflix_accounts;
  v_assigned integer := 0;
  v_unavailable integer := 0;
  v_not_found integer := 0;
  v_assigned_status public.account_status :=
    'assigned'::public.account_status;
begin
  if not private.is_admin() then
    raise exception
      'Solo administración puede realizar la asignación inicial.';
  end if;

  if not exists(
    select 1
    from public.profiles profile
    where profile.id=p_distributor_id
      and profile.role::text='reseller'
      and profile.status::text='active'
  ) then
    raise exception 'Distribuidor no válido.';
  end if;

  foreach v_email in array p_account_emails loop
    v_email := lower(trim(coalesce(v_email,'')));

    select account.*
    into v_account
    from public.netflix_accounts account
    where account.service::text=lower(trim(p_service))
      and lower(account.current_email)=v_email
    for update;

    if not found then
      v_not_found := v_not_found+1;
      continue;
    end if;

    if v_account.status::text<>'available'
       or v_account.current_reseller_id is not null
    then
      v_unavailable := v_unavailable+1;
      continue;
    end if;

    update public.account_assignments
    set status='cancelled'
    where account_id=v_account.id
      and status::text='active';

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
      v_account.id,
      v_actor,
      p_distributor_id,
      p_starts_on,
      30,
      'active',
      v_actor
    );

    if p_starts_on is not null then
      insert into public.account_manager_terms(
        account_id,
        manager_id,
        starts_on,
        duration_days,
        created_at,
        updated_at
      )
      values(
        v_account.id,
        v_actor,
        p_starts_on,
        30,
        now(),
        now()
      )
      on conflict(account_id,manager_id)
      do update set
        starts_on=excluded.starts_on,
        duration_days=30,
        updated_at=now();
    end if;

    update public.netflix_accounts
    set
      current_reseller_id=p_distributor_id,
      current_client_id=null,
      origin_distributor_id=coalesce(
        origin_distributor_id,
        p_distributor_id
      ),
      inventory_admin_id=coalesce(
        inventory_admin_id,
        v_actor
      ),
      status=v_assigned_status
    where id=v_account.id;

    v_assigned := v_assigned+1;
  end loop;

  return jsonb_build_object(
    'success',true,
    'assigned',v_assigned,
    'unavailable',v_unavailable,
    'not_found',v_not_found,
    'message',
      format(
        '%s cuenta(s) asignadas correctamente.',
        v_assigned
      )
  );
end;
$$;

revoke all
on function public.bulk_assign_service_accounts_v29(
  text,
  text[],
  uuid,
  date
)
from public,anon;

grant execute
on function public.bulk_assign_service_accounts_v29(
  text,
  text[],
  uuid,
  date
)
to authenticated;


-- ============================================================
-- 3. EDITAR CUENTA DESDE ADMINISTRACIÓN
-- ============================================================
create or replace function public.admin_edit_service_account_v29(
  p_account_id uuid,
  p_service text,
  p_account_type text,
  p_country text,
  p_owner_id uuid,
  p_starts_on date
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_old_owner uuid;
begin
  if not private.is_admin() then
    raise exception
      'Solo administración puede editar cuentas.';
  end if;

  select account.current_reseller_id
  into v_old_owner
  from public.netflix_accounts account
  where account.id=p_account_id
  for update;

  if not found then
    raise exception 'La cuenta no existe.';
  end if;

  if lower(trim(p_service))
     not in('netflix','spotify')
  then
    raise exception 'Plataforma no válida.';
  end if;

  update public.netflix_accounts
  set
    service=lower(trim(p_service)),
    account_type=coalesce(
      nullif(trim(p_account_type),''),
      'Cuenta completa'
    ),
    country=coalesce(
      nullif(trim(p_country),''),
      'Sin configurar'
    )
  where id=p_account_id;

  if p_owner_id is distinct from v_old_owner then
    perform public.reassign_account_hierarchical_v29(
      p_account_id,
      p_owner_id,
      p_starts_on
    );
  elsif p_starts_on is not null then
    perform public.update_my_account_term_v29(
      p_account_id,
      p_starts_on
    );
  end if;

  return jsonb_build_object(
    'success',true,
    'account_id',p_account_id,
    'owner_id',p_owner_id,
    'message','Cuenta actualizada correctamente.'
  );
end;
$$;

revoke all
on function public.admin_edit_service_account_v29(
  uuid,
  text,
  text,
  text,
  uuid,
  date
)
from public,anon;

grant execute
on function public.admin_edit_service_account_v29(
  uuid,
  text,
  text,
  text,
  uuid,
  date
)
to authenticated;


commit;

select pg_notify('pgrst','reload schema');

select
  'BLOQUE 32 CREADO CORRECTAMENTE: ASIGNACIÓN CORREGIDA'
  as resultado;
