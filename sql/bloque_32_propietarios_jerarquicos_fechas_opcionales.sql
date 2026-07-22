begin;

-- ============================================================
-- 1. CUENTAS GENERALES DEL ADMINISTRADOR
--
-- Siempre muestra todas las cuentas subidas.
-- La fecha pertenece únicamente al administrador conectado.
-- Si el administrador todavía no registró una fecha:
-- starts_on, expires_on y days_remaining quedan en NULL.
-- ============================================================
create or replace function public.staff_list_service_accounts_v32()
returns table(
  id uuid,
  service text,
  current_email text,
  country text,
  account_type text,
  status text,
  current_reseller_id uuid,
  current_client_id uuid,
  origin_distributor_id uuid,
  inventory_admin_id uuid,
  created_at timestamptz,
  reseller_full_name text,
  reseller_business_name text,
  reseller_parent_id uuid,
  parent_full_name text,
  parent_business_name text,
  origin_full_name text,
  origin_business_name text,
  assignment_id uuid,
  assignment_status text,
  seller_id uuid,
  buyer_reseller_id uuid,
  buyer_client_id uuid,
  starts_on date,
  duration_days integer,
  expires_on date,
  days_remaining integer,
  calculated_status text,
  assignment_created_at timestamptz
)
language sql
security definer
set search_path=''
stable
as $$
  select
    account.id,
    account.service::text,
    account.current_email,
    account.country,
    account.account_type,
    account.status::text,
    account.current_reseller_id,
    account.current_client_id,
    account.origin_distributor_id,
    account.inventory_admin_id,
    account.created_at,
    owner.full_name,
    owner.business_name,
    owner.parent_id,
    parent.full_name,
    parent.business_name,
    origin.full_name,
    origin.business_name,
    coalesce(active_assignment.id,manager_term.id),
    case
      when active_assignment.id is not null
        or manager_term.id is not null
      then 'active'
      else null
    end,
    active_assignment.seller_id,
    active_assignment.buyer_reseller_id,
    active_assignment.buyer_client_id,
    manager_term.starts_on,
    case
      when manager_term.starts_on is not null then 30
      else null
    end,
    case
      when manager_term.starts_on is not null
      then (manager_term.starts_on+30)::date
      else null
    end,
    case
      when manager_term.starts_on is not null
      then greatest(
        (manager_term.starts_on+30)::date-current_date,
        0
      )::integer
      else null
    end,
    case
      when manager_term.starts_on is null then null
      when (manager_term.starts_on+30)::date<current_date
        then 'expired'
      when (manager_term.starts_on+30)::date<=current_date+3
        then 'expiring'
      else 'active'
    end,
    coalesce(
      manager_term.updated_at,
      active_assignment.created_at,
      account.created_at
    )
  from public.netflix_accounts account
  left join public.profiles owner
    on owner.id=account.current_reseller_id
  left join public.profiles parent
    on parent.id=owner.parent_id
  left join public.profiles origin
    on origin.id=account.origin_distributor_id
  left join public.account_manager_terms manager_term
    on manager_term.account_id=account.id
   and manager_term.manager_id=(select auth.uid())
  left join lateral(
    select assignment.*
    from public.account_assignments assignment
    where assignment.account_id=account.id
      and assignment.status::text='active'
    order by assignment.created_at desc
    limit 1
  ) active_assignment on true
  where private.is_staff()
  order by account.created_at desc;
$$;

revoke all on function public.staff_list_service_accounts_v32()
from public,anon;

grant execute on function public.staff_list_service_accounts_v32()
to authenticated;


-- ============================================================
-- 2. CUENTAS GENERALES DEL DISTRIBUIDOR
--
-- Muestra las cuentas cuyo propietario actual está en la rama
-- del usuario conectado. La fecha mostrada es la fecha personal
-- del usuario conectado y puede estar vacía.
-- ============================================================
create or replace function public.reseller_list_branch_accounts_v32()
returns table(
  id uuid,
  service text,
  current_email text,
  country text,
  account_type text,
  status text,
  current_reseller_id uuid,
  current_client_id uuid,
  origin_distributor_id uuid,
  created_at timestamptz,
  reseller_full_name text,
  reseller_business_name text,
  reseller_parent_id uuid,
  parent_full_name text,
  parent_business_name text,
  origin_full_name text,
  origin_business_name text,
  assignment_id uuid,
  assignment_status text,
  seller_id uuid,
  buyer_reseller_id uuid,
  buyer_client_id uuid,
  starts_on date,
  duration_days integer,
  expires_on date,
  days_remaining integer,
  calculated_status text,
  assignment_created_at timestamptz
)
language sql
security definer
set search_path=''
stable
as $$
  with recursive branch as(
    select
      profile.id,
      array[profile.id]::uuid[] path
    from public.profiles profile
    where profile.id=(select auth.uid())
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
    account.id,
    account.service::text,
    account.current_email,
    account.country,
    account.account_type,
    account.status::text,
    account.current_reseller_id,
    account.current_client_id,
    account.origin_distributor_id,
    account.created_at,
    owner.full_name,
    owner.business_name,
    owner.parent_id,
    parent.full_name,
    parent.business_name,
    origin.full_name,
    origin.business_name,
    coalesce(active_assignment.id,manager_term.id),
    case
      when active_assignment.id is not null
        or manager_term.id is not null
      then 'active'
      else null
    end,
    active_assignment.seller_id,
    active_assignment.buyer_reseller_id,
    active_assignment.buyer_client_id,
    manager_term.starts_on,
    case
      when manager_term.starts_on is not null then 30
      else null
    end,
    case
      when manager_term.starts_on is not null
      then (manager_term.starts_on+30)::date
      else null
    end,
    case
      when manager_term.starts_on is not null
      then greatest(
        (manager_term.starts_on+30)::date-current_date,
        0
      )::integer
      else null
    end,
    case
      when manager_term.starts_on is null then null
      when (manager_term.starts_on+30)::date<current_date
        then 'expired'
      when (manager_term.starts_on+30)::date<=current_date+3
        then 'expiring'
      else 'active'
    end,
    coalesce(
      manager_term.updated_at,
      active_assignment.created_at,
      account.created_at
    )
  from public.netflix_accounts account
  join branch
    on branch.id=account.current_reseller_id
  left join public.profiles owner
    on owner.id=account.current_reseller_id
  left join public.profiles parent
    on parent.id=owner.parent_id
  left join public.profiles origin
    on origin.id=account.origin_distributor_id
  left join public.account_manager_terms manager_term
    on manager_term.account_id=account.id
   and manager_term.manager_id=(select auth.uid())
  left join lateral(
    select assignment.*
    from public.account_assignments assignment
    where assignment.account_id=account.id
      and assignment.status::text='active'
    order by assignment.created_at desc
    limit 1
  ) active_assignment on true
  order by account.created_at desc;
$$;

revoke all on function public.reseller_list_branch_accounts_v32()
from public,anon;

grant execute on function public.reseller_list_branch_accounts_v32()
to authenticated;


-- ============================================================
-- 3. ADMINISTRADOR -> USUARIO -> CUENTAS
--
-- Al abrir Sofía aparecen:
-- - todas las cuentas cuyo origen permanente es Sofía;
-- - todas las cuentas cuyo propietario actual sigue en su rama.
--
-- El propietario mostrado es siempre el propietario actual.
-- La fecha mostrada pertenece al administrador conectado.
-- ============================================================
create or replace function public.staff_list_user_branch_accounts_v32(
  p_distributor_id uuid
)
returns table(
  id uuid,
  service text,
  current_email text,
  country text,
  account_type text,
  status text,
  current_reseller_id uuid,
  origin_distributor_id uuid,
  created_at timestamptz,
  reseller_full_name text,
  reseller_business_name text,
  reseller_parent_id uuid,
  parent_full_name text,
  parent_business_name text,
  origin_full_name text,
  origin_business_name text,
  starts_on date,
  expires_on date,
  days_remaining integer,
  calculated_status text
)
language sql
security definer
set search_path=''
stable
as $$
  with recursive branch as(
    select
      profile.id,
      array[profile.id]::uuid[] path
    from public.profiles profile
    where profile.id=p_distributor_id
      and profile.role::text='reseller'

    union all

    select
      child.id,
      branch.path||child.id
    from public.profiles child
    join branch
      on child.parent_id=branch.id
    where child.role::text='reseller'
      and not child.id=any(branch.path)
  )
  select distinct on(account.id)
    account.id,
    account.service::text,
    account.current_email,
    account.country,
    account.account_type,
    account.status::text,
    account.current_reseller_id,
    account.origin_distributor_id,
    account.created_at,
    owner.full_name,
    owner.business_name,
    owner.parent_id,
    parent.full_name,
    parent.business_name,
    origin.full_name,
    origin.business_name,
    manager_term.starts_on,
    case
      when manager_term.starts_on is not null
      then (manager_term.starts_on+30)::date
      else null
    end,
    case
      when manager_term.starts_on is not null
      then greatest(
        (manager_term.starts_on+30)::date-current_date,
        0
      )::integer
      else null
    end,
    case
      when manager_term.starts_on is null then null
      when (manager_term.starts_on+30)::date<current_date
        then 'expired'
      when (manager_term.starts_on+30)::date<=current_date+3
        then 'expiring'
      else 'active'
    end
  from public.netflix_accounts account
  left join public.profiles owner
    on owner.id=account.current_reseller_id
  left join public.profiles parent
    on parent.id=owner.parent_id
  left join public.profiles origin
    on origin.id=account.origin_distributor_id
  left join public.account_manager_terms manager_term
    on manager_term.account_id=account.id
   and manager_term.manager_id=(select auth.uid())
  where private.is_staff()
    and (
      account.origin_distributor_id=p_distributor_id
      or account.current_reseller_id in(
        select branch.id from branch
      )
    )
  order by account.id,account.created_at desc;
$$;

revoke all
on function public.staff_list_user_branch_accounts_v32(uuid)
from public,anon;

grant execute
on function public.staff_list_user_branch_accounts_v32(uuid)
to authenticated;


-- ============================================================
-- 4. DISTRIBUIDOR -> USUARIO -> CUENTAS
--
-- Sofía puede abrir cualquier usuario de su rama.
-- La lista contiene las cuentas actuales del usuario seleccionado
-- y de todos sus subordinados.
-- ============================================================
create or replace function public.reseller_list_user_branch_accounts_v32(
  p_distributor_id uuid
)
returns table(
  id uuid,
  service text,
  current_email text,
  country text,
  account_type text,
  status text,
  current_reseller_id uuid,
  origin_distributor_id uuid,
  created_at timestamptz,
  reseller_full_name text,
  reseller_business_name text,
  reseller_parent_id uuid,
  parent_full_name text,
  parent_business_name text,
  starts_on date,
  expires_on date,
  days_remaining integer,
  calculated_status text
)
language plpgsql
security definer
set search_path=''
stable
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if not exists(
    with recursive allowed as(
      select
        me.id,
        array[me.id]::uuid[] path
      from public.profiles me
      where me.id=v_actor
        and me.role::text='reseller'
        and me.status::text='active'

      union all

      select
        child.id,
        allowed.path||child.id
      from public.profiles child
      join allowed
        on child.parent_id=allowed.id
      where child.role::text='reseller'
        and child.status::text='active'
        and not child.id=any(allowed.path)
    )
    select 1
    from allowed
    where allowed.id=p_distributor_id
      and allowed.id<>v_actor
  ) then
    raise exception
      'Solo puedes consultar usuarios de tu propia rama.';
  end if;

  return query
  with recursive branch as(
    select
      profile.id,
      array[profile.id]::uuid[] path
    from public.profiles profile
    where profile.id=p_distributor_id
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
    account.id,
    account.service::text,
    account.current_email,
    account.country,
    account.account_type,
    account.status::text,
    account.current_reseller_id,
    account.origin_distributor_id,
    account.created_at,
    owner.full_name,
    owner.business_name,
    owner.parent_id,
    parent.full_name,
    parent.business_name,
    manager_term.starts_on,
    case
      when manager_term.starts_on is not null
      then (manager_term.starts_on+30)::date
      else null
    end,
    case
      when manager_term.starts_on is not null
      then greatest(
        (manager_term.starts_on+30)::date-current_date,
        0
      )::integer
      else null
    end,
    case
      when manager_term.starts_on is null then null
      when (manager_term.starts_on+30)::date<current_date
        then 'expired'
      when (manager_term.starts_on+30)::date<=current_date+3
        then 'expiring'
      else 'active'
    end
  from public.netflix_accounts account
  join branch
    on branch.id=account.current_reseller_id
  left join public.profiles owner
    on owner.id=account.current_reseller_id
  left join public.profiles parent
    on parent.id=owner.parent_id
  left join public.account_manager_terms manager_term
    on manager_term.account_id=account.id
   and manager_term.manager_id=v_actor
  order by account.created_at desc;
end;
$$;

revoke all
on function public.reseller_list_user_branch_accounts_v32(uuid)
from public,anon;

grant execute
on function public.reseller_list_user_branch_accounts_v32(uuid)
to authenticated;


-- ============================================================
-- 5. CAMBIAR PROPIETARIO DE FORMA JERÁRQUICA
--
-- Administrador:
-- - puede cambiar a cualquier distribuidor activo;
-- - puede dejar la cuenta sin propietario.
--
-- Distribuidor:
-- - puede mover una cuenta que esté dentro de su propia rama;
-- - puede asignarla a sí mismo o a cualquier descendiente activo.
--
-- La fecha es opcional.
-- Si queda vacía, se eliminan las fechas personales del actor y
-- del nuevo propietario; fecha de corte y días quedan en blanco.
-- ============================================================
create or replace function public.reassign_account_hierarchical_v32(
  p_account_id uuid,
  p_new_owner_id uuid,
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
  v_old_owner uuid;
  v_new_status public.account_status;
  v_origin uuid;
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

  select *
  into v_account
  from public.netflix_accounts account
  where account.id=p_account_id
  for update;

  if not found then
    raise exception 'La cuenta no existe.';
  end if;

  if v_account.current_client_id is not null then
    raise exception
      'La cuenta está asignada a un cliente y no puede moverse desde esta opción.';
  end if;

  v_old_owner := v_account.current_reseller_id;

  if p_new_owner_id is not null
     and not exists(
       select 1
       from public.profiles profile
       where profile.id=p_new_owner_id
         and profile.role::text='reseller'
         and profile.status::text='active'
     )
  then
    raise exception
      'El nuevo propietario no es un distribuidor activo.';
  end if;

  if v_role='reseller' then
    if p_new_owner_id is null then
      raise exception
        'Un distribuidor no puede dejar la cuenta sin propietario.';
    end if;

    if not exists(
      with recursive branch as(
        select
          me.id,
          array[me.id]::uuid[] path
        from public.profiles me
        where me.id=v_actor
          and me.status::text='active'

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
      select 1
      from branch
      where branch.id=v_old_owner
    ) then
      raise exception
        'La cuenta no pertenece actualmente a tu rama.';
    end if;

    if not exists(
      with recursive branch as(
        select
          me.id,
          array[me.id]::uuid[] path
        from public.profiles me
        where me.id=v_actor
          and me.status::text='active'

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
      select 1
      from branch
      where branch.id=p_new_owner_id
    ) then
      raise exception
        'Solo puedes asignar dentro de tu propia jerarquía.';
    end if;
  end if;

  if p_new_owner_id is distinct from v_old_owner then
    update public.account_assignments
    set status='cancelled'
    where account_id=p_account_id
      and status::text='active';

    if p_new_owner_id is not null then
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
        p_new_owner_id,
        coalesce(p_starts_on,current_date),
        30,
        'active',
        v_actor
      );
    end if;
  end if;

  if p_starts_on is null then
    delete from public.account_manager_terms
    where account_id=p_account_id
      and manager_id=v_actor;

    if p_new_owner_id is not null then
      delete from public.account_manager_terms
      where account_id=p_account_id
        and manager_id=p_new_owner_id;
    end if;
  else
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

    if p_new_owner_id is not null then
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
        p_new_owner_id,
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
  end if;

  if p_new_owner_id is null then
    v_new_status := 'available'::public.account_status;
  else
    v_new_status := 'assigned'::public.account_status;
  end if;

  v_origin := v_account.origin_distributor_id;

  if v_origin is null and p_new_owner_id is not null then
    if v_role='admin' then
      with recursive ancestors as(
        select
          profile.id,
          profile.parent_id,
          0 depth,
          array[profile.id]::uuid[] path
        from public.profiles profile
        where profile.id=p_new_owner_id

        union all

        select
          parent.id,
          parent.parent_id,
          ancestors.depth+1,
          ancestors.path||parent.id
        from public.profiles parent
        join ancestors
          on parent.id=ancestors.parent_id
        where not parent.id=any(ancestors.path)
      )
      select ancestors.id
      into v_origin
      from ancestors
      where ancestors.parent_id=v_actor
      order by ancestors.depth desc
      limit 1;

      v_origin := coalesce(v_origin,p_new_owner_id);
    else
      v_origin := v_actor;
    end if;
  end if;

  update public.netflix_accounts
  set
    current_reseller_id=p_new_owner_id,
    current_client_id=null,
    origin_distributor_id=v_origin,
    inventory_admin_id=case
      when v_role='admin'
      then coalesce(inventory_admin_id,v_actor)
      else inventory_admin_id
    end,
    status=v_new_status
  where id=p_account_id;

  return jsonb_build_object(
    'success',true,
    'old_owner_id',v_old_owner,
    'new_owner_id',p_new_owner_id,
    'date_saved',p_starts_on is not null,
    'message',case
      when p_new_owner_id is null
        then 'La cuenta quedó disponible.'
      when p_starts_on is null
        then 'Propietario actualizado. La fecha quedó pendiente.'
      else 'Propietario y fecha actualizados correctamente.'
    end
  );
end;
$$;

revoke all
on function public.reassign_account_hierarchical_v32(
  uuid,uuid,date
)
from public,anon;

grant execute
on function public.reassign_account_hierarchical_v32(
  uuid,uuid,date
)
to authenticated;


-- ============================================================
-- 6. EDITAR METADATOS Y PROPIETARIO DESDE ADMINISTRACIÓN
-- ============================================================
create or replace function public.admin_edit_service_account_v32(
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
  v_service text := lower(trim(coalesce(p_service,'')));
  v_type text := trim(coalesce(p_account_type,''));
  v_result jsonb;
begin
  if not private.is_admin() then
    raise exception
      'Solo el administrador puede editar esta información.';
  end if;

  if v_service not in('netflix','spotify') then
    raise exception 'Servicio no válido.';
  end if;

  if v_service='netflix' then
    v_type := 'Cuenta completa';
  elsif v_type not in(
    'Cuenta familiar',
    'Cuenta individual'
  ) then
    raise exception
      'Spotify solo admite Cuenta familiar o Cuenta individual.';
  end if;

  perform public.reassign_account_hierarchical_v32(
    p_account_id,
    p_owner_id,
    p_starts_on
  );

  update public.netflix_accounts
  set
    service=v_service,
    account_type=v_type,
    country=coalesce(
      nullif(trim(p_country),''),
      'Sin configurar'
    )
  where id=p_account_id;

  select jsonb_build_object(
    'success',true,
    'message',case
      when p_starts_on is null
        then 'Cuenta actualizada. La fecha quedó pendiente.'
      else 'Cuenta actualizada correctamente.'
    end
  )
  into v_result;

  return v_result;
end;
$$;

revoke all
on function public.admin_edit_service_account_v32(
  uuid,text,text,text,uuid,date
)
from public,anon;

grant execute
on function public.admin_edit_service_account_v32(
  uuid,text,text,text,uuid,date
)
to authenticated;


-- ============================================================
-- 7. ASIGNACIÓN MASIVA DEL ADMINISTRADOR CON FECHA OPCIONAL
-- ============================================================
create or replace function public.bulk_assign_service_accounts_v32(
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
  v_service text := lower(trim(coalesce(p_service,'')));
  v_raw text;
  v_email text;
  v_account_id uuid;
  v_assigned integer := 0;
  v_unavailable integer := 0;
  v_not_found integer := 0;
begin
  if not private.is_admin() then
    raise exception
      'Solo el administrador puede realizar esta asignación.';
  end if;

  if v_service not in('netflix','spotify') then
    raise exception 'Servicio no válido.';
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

  foreach v_raw in array p_account_emails loop
    v_email := lower(trim(coalesce(v_raw,'')));
    v_account_id := null;

    select account.id
    into v_account_id
    from public.netflix_accounts account
    where account.service::text=v_service
      and lower(account.current_email)=v_email
      and account.current_reseller_id is null
      and account.current_client_id is null
      and account.status::text='available'
    for update;

    if v_account_id is null then
      if exists(
        select 1
        from public.netflix_accounts account
        where account.service::text=v_service
          and lower(account.current_email)=v_email
      ) then
        v_unavailable := v_unavailable+1;
      else
        v_not_found := v_not_found+1;
      end if;

      continue;
    end if;

    perform public.reassign_account_hierarchical_v32(
      v_account_id,
      p_distributor_id,
      p_starts_on
    );

    v_assigned := v_assigned+1;
  end loop;

  return jsonb_build_object(
    'success',true,
    'assigned',v_assigned,
    'unavailable',v_unavailable,
    'not_found',v_not_found,
    'date_saved',p_starts_on is not null
  );
end;
$$;

revoke all
on function public.bulk_assign_service_accounts_v32(
  text,text[],uuid,date
)
from public,anon;

grant execute
on function public.bulk_assign_service_accounts_v32(
  text,text[],uuid,date
)
to authenticated;

commit;

select pg_notify('pgrst','reload schema');

select 'BLOQUE 32 CREADO CORRECTAMENTE' as resultado;
