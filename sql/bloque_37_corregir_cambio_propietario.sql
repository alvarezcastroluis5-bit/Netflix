begin;

-- ============================================================
-- BLOQUE 37
-- CORREGIR CAMBIO DE PROPIETARIO HACIA EL MISMO DISTRIBUIDOR
-- ============================================================
--
-- Corrige el error:
-- reseller_cannot_sell_to_himself
--
-- Casos cubiertos:
-- 1. Un distribuidor recupera una cuenta desde un subordinado.
-- 2. Administración mueve una cuenta entre propietarios.
-- 3. Se intenta guardar el mismo propietario actual.
-- 4. Asignaciones y transferencias en bloque hacia el propio usuario.
--
-- No elimina la restricción de seguridad. La respeta utilizando como
-- vendedor al propietario anterior cuando existe una transferencia real.
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
  v_previous_owner uuid;
  v_seller_id uuid;
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
    raise exception 'Tu usuario no puede cambiar propietarios.';
  end if;

  select account.*
  into v_account
  from public.netflix_accounts account
  where account.id=p_account_id
  for update;

  if not found then
    raise exception 'La cuenta no existe.';
  end if;

  v_previous_owner := v_account.current_reseller_id;

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
      raise exception 'Un distribuidor no puede devolver la cuenta a Disponible.';
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
      join branch on child.parent_id=branch.id
      where child.role::text='reseller'
        and child.status::text='active'
        and not child.id=any(branch.path)
    )
    select
      exists(
        select 1
        from branch
        where id=v_account.current_reseller_id
      ),
      exists(
        select 1
        from branch
        where id=p_owner_id
      )
    into v_actor_allowed,v_owner_allowed;
  end if;

  if not v_actor_allowed then
    raise exception 'La cuenta no pertenece a tu propia rama.';
  end if;

  if not v_owner_allowed then
    raise exception 'El nuevo propietario no pertenece a tu propia rama.';
  end if;

  -- Cada usuario conserva su propia fecha, incluso cuando el propietario
  -- seleccionado ya es el actual.
  if p_starts_on is not null then
    insert into public.account_manager_terms(
      account_id,manager_id,starts_on,duration_days,
      created_at,updated_at
    )
    values(
      p_account_id,v_actor,p_starts_on,30,now(),now()
    )
    on conflict(account_id,manager_id)
    do update set
      starts_on=excluded.starts_on,
      duration_days=30,
      updated_at=now();
  end if;

  -- Si ya pertenece al usuario seleccionado, no se crea una venta del
  -- usuario hacia sí mismo. Solo se conserva o actualiza su fecha.
  if p_owner_id is not distinct from v_previous_owner then
    return jsonb_build_object(
      'success',true,
      'unchanged',true,
      'message',case
        when p_starts_on is null
          then 'La cuenta ya pertenece a ese usuario. No había cambios por realizar.'
        else 'La fecha fue actualizada sin cambiar el propietario.'
      end
    );
  end if;

  update public.account_assignments
  set status='cancelled'
  where account_id=p_account_id
    and status::text='active';

  if p_owner_id is not null then
    -- En una recuperación hacia el usuario actual, el vendedor real es el
    -- propietario anterior. Así seller_id y buyer_reseller_id son distintos.
    v_seller_id := coalesce(v_previous_owner,v_actor);

    if v_seller_id=p_owner_id then
      raise exception 'No se pudo determinar un vendedor diferente del nuevo propietario.';
    end if;

    insert into public.account_assignments(
      account_id,seller_id,buyer_reseller_id,
      starts_on,duration_days,status,created_by
    )
    values(
      p_account_id,v_seller_id,p_owner_id,
      p_starts_on,30,'active',v_actor
    );
  end if;

  update public.netflix_accounts
  set
    current_reseller_id=p_owner_id,
    current_client_id=null,
    origin_distributor_id=coalesce(
      origin_distributor_id,p_owner_id
    ),
    status=case
      when p_owner_id is null
        then 'available'::public.account_status
      else 'assigned'::public.account_status
    end
  where id=p_account_id;

  return jsonb_build_object(
    'success',true,
    'unchanged',false,
    'previous_owner_id',v_previous_owner,
    'new_owner_id',p_owner_id,
    'message','Propietario actualizado correctamente sin modificar fechas ajenas.'
  );
end;
$$;

revoke all
on function public.reassign_account_hierarchical_v29(uuid,uuid,date)
from public,anon;

grant execute
on function public.reassign_account_hierarchical_v29(uuid,uuid,date)
to authenticated;


create or replace function public.bulk_reassign_service_accounts_v36(
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
  v_role text;
  v_branch_ids uuid[] := array[]::uuid[];
  v_email text;
  v_account public.netflix_accounts;
  v_previous_owner uuid;
  v_seller_id uuid;
  v_assigned integer := 0;
  v_transferred integer := 0;
  v_unchanged integer := 0;
  v_not_allowed integer := 0;
  v_not_found integer := 0;
  v_service_label text;
  v_sender_name text;
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
    raise exception 'Tu usuario no puede asignar cuentas.';
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

  if v_role='reseller' then
    with recursive branch as(
      select
        profile.id,
        array[profile.id]::uuid[] path
      from public.profiles profile
      where profile.id=v_actor
        and profile.status::text='active'
        and profile.role::text='reseller'

      union all

      select
        child.id,
        branch.path||child.id
      from public.profiles child
      join branch on child.parent_id=branch.id
      where child.status::text='active'
        and child.role::text='reseller'
        and not child.id=any(branch.path)
    )
    select coalesce(array_agg(id),array[]::uuid[])
    into v_branch_ids
    from branch;

    if not p_distributor_id=any(v_branch_ids) then
      raise exception 'El destinatario no pertenece a tu propia rama.';
    end if;
  end if;

  foreach v_email in array coalesce(p_account_emails,array[]::text[]) loop
    v_email:=lower(trim(coalesce(v_email,'')));

    if v_email='' then
      continue;
    end if;

    select account.*
    into v_account
    from public.netflix_accounts account
    where account.service::text=lower(trim(p_service))
      and lower(account.current_email)=v_email
    for update;

    if not found then
      v_not_found:=v_not_found+1;
      continue;
    end if;

    if v_role='reseller' and (
      v_account.current_reseller_id is null
      or not (v_account.current_reseller_id=any(v_branch_ids))
    ) then
      v_not_allowed:=v_not_allowed+1;
      continue;
    end if;

    v_previous_owner:=v_account.current_reseller_id;

    if p_starts_on is not null then
      insert into public.account_manager_terms(
        account_id,manager_id,starts_on,duration_days,
        created_at,updated_at
      )
      values(
        v_account.id,v_actor,p_starts_on,30,now(),now()
      )
      on conflict(account_id,manager_id)
      do update set
        starts_on=excluded.starts_on,
        duration_days=30,
        updated_at=now();
    end if;

    if v_previous_owner=p_distributor_id then
      v_unchanged:=v_unchanged+1;
      continue;
    end if;

    if v_previous_owner is not null then
      v_transferred:=v_transferred+1;
    end if;

    update public.account_assignments
    set status='cancelled'
    where account_id=v_account.id
      and status::text='active';

    v_seller_id:=coalesce(v_previous_owner,v_actor);

    if v_seller_id=p_distributor_id then
      raise exception 'No se pudo determinar un vendedor diferente del nuevo propietario para %.',v_email;
    end if;

    insert into public.account_assignments(
      account_id,seller_id,buyer_reseller_id,starts_on,
      duration_days,status,created_by
    )
    values(
      v_account.id,v_seller_id,p_distributor_id,p_starts_on,
      30,'active',v_actor
    );

    update public.netflix_accounts
    set
      current_reseller_id=p_distributor_id,
      current_client_id=null,
      origin_distributor_id=coalesce(origin_distributor_id,p_distributor_id),
      inventory_admin_id=case
        when v_role='admin'
          then coalesce(inventory_admin_id,v_actor)
        else inventory_admin_id
      end,
      status='assigned'::public.account_status
    where id=v_account.id;

    v_assigned:=v_assigned+1;
  end loop;

  if v_assigned>0 and p_distributor_id<>v_actor then
    v_service_label:=case lower(trim(p_service))
      when 'netflix' then 'Netflix'
      when 'spotify' then 'Spotify'
      else initcap(lower(trim(p_service)))
    end;

    select coalesce(
      nullif(trim(profile.business_name),''),
      nullif(trim(profile.full_name),''),
      profile.email,
      'Tu superior'
    )
    into v_sender_name
    from public.profiles profile
    where profile.id=v_actor;

    perform private.create_direct_notification_v36(
      v_actor,
      p_distributor_id,
      'Cuentas asignadas',
      coalesce(v_sender_name,'Tu superior')||' te asignó '||
      v_assigned::text||
      case when v_assigned=1 then ' cuenta ' else ' cuentas ' end||
      v_service_label||'. Ingresa a Cuentas para revisarlas.'
    );
  end if;

  return jsonb_build_object(
    'success',true,
    'assigned',v_assigned,
    'transferred',v_transferred,
    'unchanged',v_unchanged,
    'not_allowed',v_not_allowed,
    'not_found',v_not_found
  );
end;
$$;

revoke all
on function public.bulk_reassign_service_accounts_v36(text,text[],uuid,date)
from public,anon;

grant execute
on function public.bulk_reassign_service_accounts_v36(text,text[],uuid,date)
to authenticated;

commit;

select pg_notify('pgrst','reload schema');

select
  'BLOQUE 37 CREADO CORRECTAMENTE: CAMBIO DE PROPIETARIO CORREGIDO'
  as resultado;
