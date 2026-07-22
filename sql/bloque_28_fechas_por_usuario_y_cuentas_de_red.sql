begin;

-- ============================================================
-- 1. FECHAS INDEPENDIENTES PARA CADA USUARIO
--
-- La misma cuenta puede tener fechas distintas según el usuario:
--
-- Luis  -> fecha en que Luis la entregó.
-- Sofía -> fecha en que Sofía la vendió.
-- Maly  -> fecha en que Maly la vendió.
-- Lessss-> fecha propia de recepción/gestión.
--
-- Cambiar la fecha de un usuario no modifica la de los demás.
-- ============================================================
create table if not exists public.account_manager_terms(
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null
    references public.netflix_accounts(id)
    on delete cascade,
  manager_id uuid not null
    references public.profiles(id)
    on delete cascade,
  starts_on date not null,
  duration_days integer not null default 30,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_manager_terms_unique
    unique(account_id,manager_id),
  constraint account_manager_terms_duration
    check(duration_days=30)
);

create index if not exists account_manager_terms_manager_idx
  on public.account_manager_terms(manager_id,account_id);

create index if not exists account_manager_terms_account_idx
  on public.account_manager_terms(account_id,manager_id);

alter table public.account_manager_terms enable row level security;

drop policy if exists account_manager_terms_read_v28
  on public.account_manager_terms;

create policy account_manager_terms_read_v28
on public.account_manager_terms
for select
to authenticated
using(
  manager_id=(select auth.uid())
  or private.is_staff()
);

revoke all on public.account_manager_terms from public,anon;
grant select on public.account_manager_terms to authenticated;


-- ============================================================
-- 2. MIGRACIÓN SEGURA DE FECHAS EXISTENTES
--
-- Primero toma la última venta realizada por cada usuario.
-- Después toma la última recepción para usuarios que aún no
-- vendieron esa cuenta.
--
-- ON CONFLICT DO NOTHING evita sobrescribir fechas que el usuario
-- ya haya editado al ejecutar nuevamente este bloque.
-- ============================================================
insert into public.account_manager_terms(
  account_id,manager_id,starts_on,duration_days,
  created_at,updated_at
)
select
  latest.account_id,
  latest.seller_id,
  latest.starts_on,
  30,
  latest.created_at,
  latest.created_at
from(
  select distinct on(
    assignment.account_id,
    assignment.seller_id
  )
    assignment.account_id,
    assignment.seller_id,
    assignment.starts_on,
    assignment.created_at
  from public.account_assignments assignment
  where assignment.seller_id is not null
  order by
    assignment.account_id,
    assignment.seller_id,
    assignment.created_at desc
) latest
on conflict(account_id,manager_id) do nothing;

insert into public.account_manager_terms(
  account_id,manager_id,starts_on,duration_days,
  created_at,updated_at
)
select
  latest.account_id,
  latest.buyer_reseller_id,
  latest.starts_on,
  30,
  latest.created_at,
  latest.created_at
from(
  select distinct on(
    assignment.account_id,
    assignment.buyer_reseller_id
  )
    assignment.account_id,
    assignment.buyer_reseller_id,
    assignment.starts_on,
    assignment.created_at
  from public.account_assignments assignment
  where assignment.buyer_reseller_id is not null
  order by
    assignment.account_id,
    assignment.buyer_reseller_id,
    assignment.created_at desc
) latest
on conflict(account_id,manager_id) do nothing;

insert into public.account_manager_terms(
  account_id,manager_id,starts_on,duration_days
)
select
  account.id,
  account.created_by,
  account.created_at::date,
  30
from public.netflix_accounts account
join public.profiles creator
  on creator.id=account.created_by
where creator.role::text in('admin','reseller')
on conflict(account_id,manager_id) do nothing;


-- ============================================================
-- 3. CUENTAS GENERALES PARA ADMINISTRACIÓN
--
-- La fecha y días mostrados pertenecen al usuario conectado.
-- El propietario continúa siendo el propietario actual real.
-- ============================================================
create or replace function public.staff_list_service_accounts_v28()
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
    coalesce(
      manager_term.starts_on,
      active_assignment.starts_on,
      account.created_at::date
    ),
    30,
    (
      coalesce(
        manager_term.starts_on,
        active_assignment.starts_on,
        account.created_at::date
      )+30
    )::date,
    greatest(
      (
        coalesce(
          manager_term.starts_on,
          active_assignment.starts_on,
          account.created_at::date
        )+30
      )::date-current_date,
      0
    )::integer,
    case
      when (
        coalesce(
          manager_term.starts_on,
          active_assignment.starts_on,
          account.created_at::date
        )+30
      )::date<current_date
      then 'expired'
      when (
        coalesce(
          manager_term.starts_on,
          active_assignment.starts_on,
          account.created_at::date
        )+30
      )::date<=current_date+3
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

revoke all on function public.staff_list_service_accounts_v28()
from public,anon;

grant execute on function public.staff_list_service_accounts_v28()
to authenticated;


-- ============================================================
-- 4. CUENTAS GENERALES DEL DISTRIBUIDOR
--
-- Muestra todas las cuentas cuyo propietario actual está dentro
-- de su propia rama. La fecha pertenece al usuario conectado.
-- ============================================================
create or replace function public.reseller_list_branch_accounts_v28()
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
    'active',
    active_assignment.seller_id,
    active_assignment.buyer_reseller_id,
    active_assignment.buyer_client_id,
    coalesce(
      manager_term.starts_on,
      active_assignment.starts_on,
      account.created_at::date
    ),
    30,
    (
      coalesce(
        manager_term.starts_on,
        active_assignment.starts_on,
        account.created_at::date
      )+30
    )::date,
    greatest(
      (
        coalesce(
          manager_term.starts_on,
          active_assignment.starts_on,
          account.created_at::date
        )+30
      )::date-current_date,
      0
    )::integer,
    case
      when (
        coalesce(
          manager_term.starts_on,
          active_assignment.starts_on,
          account.created_at::date
        )+30
      )::date<current_date
      then 'expired'
      when (
        coalesce(
          manager_term.starts_on,
          active_assignment.starts_on,
          account.created_at::date
        )+30
      )::date<=current_date+3
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

revoke all on function public.reseller_list_branch_accounts_v28()
from public,anon;

grant execute on function public.reseller_list_branch_accounts_v28()
to authenticated;


-- ============================================================
-- 5. ADMINISTRACIÓN -> USUARIO -> CUENTAS
--
-- Sofía muestra:
-- - todas las cuentas entregadas originalmente a Sofía;
-- - todas las cuentas que actualmente siguen en su rama.
--
-- La fecha mostrada pertenece al administrador conectado.
-- ============================================================
create or replace function public.staff_list_user_branch_accounts_v28(
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
    coalesce(
      manager_term.starts_on,
      active_assignment.starts_on,
      account.created_at::date
    ),
    (
      coalesce(
        manager_term.starts_on,
        active_assignment.starts_on,
        account.created_at::date
      )+30
    )::date,
    greatest(
      (
        coalesce(
          manager_term.starts_on,
          active_assignment.starts_on,
          account.created_at::date
        )+30
      )::date-current_date,
      0
    )::integer,
    case
      when (
        coalesce(
          manager_term.starts_on,
          active_assignment.starts_on,
          account.created_at::date
        )+30
      )::date<current_date
      then 'expired'
      when (
        coalesce(
          manager_term.starts_on,
          active_assignment.starts_on,
          account.created_at::date
        )+30
      )::date<=current_date+3
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
  left join lateral(
    select assignment.*
    from public.account_assignments assignment
    where assignment.account_id=account.id
      and assignment.status::text='active'
    order by assignment.created_at desc
    limit 1
  ) active_assignment on true
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
on function public.staff_list_user_branch_accounts_v28(uuid)
from public,anon;

grant execute
on function public.staff_list_user_branch_accounts_v28(uuid)
to authenticated;


-- ============================================================
-- 6. DISTRIBUIDOR -> USUARIO -> CUENTAS
--
-- Sofía puede abrir Maly -> Cuentas.
-- Maly puede abrir Lessss -> Cuentas.
-- Solo se permite consultar descendientes de la propia rama.
-- ============================================================
create or replace function public.reseller_list_user_branch_accounts_v28(
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
        child.id,
        array[child.id]::uuid[] path
      from public.profiles child
      where child.parent_id=v_actor
        and child.role::text='reseller'
        and child.status::text='active'

      union all

      select
        descendant.id,
        allowed.path||descendant.id
      from public.profiles descendant
      join allowed
        on descendant.parent_id=allowed.id
      where descendant.role::text='reseller'
        and descendant.status::text='active'
        and not descendant.id=any(allowed.path)
    )
    select 1
    from allowed
    where allowed.id=p_distributor_id
  ) then
    raise exception
      'Solo puedes consultar usuarios que pertenezcan a tu propia rama.';
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
    coalesce(
      manager_term.starts_on,
      active_assignment.starts_on,
      account.created_at::date
    ),
    (
      coalesce(
        manager_term.starts_on,
        active_assignment.starts_on,
        account.created_at::date
      )+30
    )::date,
    greatest(
      (
        coalesce(
          manager_term.starts_on,
          active_assignment.starts_on,
          account.created_at::date
        )+30
      )::date-current_date,
      0
    )::integer,
    case
      when (
        coalesce(
          manager_term.starts_on,
          active_assignment.starts_on,
          account.created_at::date
        )+30
      )::date<current_date
      then 'expired'
      when (
        coalesce(
          manager_term.starts_on,
          active_assignment.starts_on,
          account.created_at::date
        )+30
      )::date<=current_date+3
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
  left join lateral(
    select assignment.*
    from public.account_assignments assignment
    where assignment.account_id=account.id
      and assignment.status::text='active'
    order by assignment.created_at desc
    limit 1
  ) active_assignment on true
  order by account.created_at desc;
end;
$$;

revoke all
on function public.reseller_list_user_branch_accounts_v28(uuid)
from public,anon;

grant execute
on function public.reseller_list_user_branch_accounts_v28(uuid)
to authenticated;


-- ============================================================
-- 7. EDITAR LA FECHA PERSONAL DE UNA CUENTA
--
-- Cada usuario edita solo SU fecha.
-- No modifica la fecha de sus superiores ni subordinados.
-- ============================================================
create or replace function public.update_my_account_term_v28(
  p_account_id uuid,
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
  v_allowed boolean := false;
begin
  if v_actor is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  if p_starts_on is null then
    raise exception 'Selecciona una fecha válida.';
  end if;

  select profile.role::text
  into v_role
  from public.profiles profile
  where profile.id=v_actor
    and profile.status::text='active';

  if v_role='admin' then
    v_allowed := exists(
      select 1
      from public.netflix_accounts account
      where account.id=p_account_id
    );
  elsif v_role='reseller' then
    v_allowed := exists(
      with recursive branch as(
        select
          profile.id,
          array[profile.id]::uuid[] path
        from public.profiles profile
        where profile.id=v_actor
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
      select 1
      from public.netflix_accounts account
      where account.id=p_account_id
        and account.current_reseller_id in(
          select branch.id from branch
        )
    );
  end if;

  if not v_allowed then
    raise exception
      'No tienes permiso para modificar la fecha de esta cuenta.';
  end if;

  insert into public.account_manager_terms(
    account_id,manager_id,starts_on,duration_days,
    created_at,updated_at
  )
  values(
    p_account_id,v_actor,p_starts_on,30,
    now(),now()
  )
  on conflict(account_id,manager_id)
  do update set
    starts_on=excluded.starts_on,
    duration_days=30,
    updated_at=now();

  return jsonb_build_object(
    'success',true,
    'starts_on',p_starts_on,
    'expires_on',(p_starts_on+30)::date,
    'message','Tu fecha fue actualizada sin modificar las fechas de otros usuarios.'
  );
end;
$$;

revoke all
on function public.update_my_account_term_v28(uuid,date)
from public,anon;

grant execute
on function public.update_my_account_term_v28(uuid,date)
to authenticated;


-- ============================================================
-- 8. ACTUALIZAR VARIAS FECHAS DEL USUARIO CONECTADO
-- ============================================================
create or replace function public.bulk_update_my_account_terms_v28(
  p_service text,
  p_account_emails text[],
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
  v_service text := lower(trim(coalesce(p_service,'')));
  v_raw text;
  v_email text;
  v_account_id uuid;
  v_updated integer := 0;
  v_not_found integer := 0;
  v_not_allowed integer := 0;
  v_invalid integer := 0;
begin
  if p_starts_on is null then
    raise exception 'Selecciona una fecha válida.';
  end if;

  if v_service not in('netflix','spotify') then
    raise exception 'Servicio no válido.';
  end if;

  select profile.role::text
  into v_role
  from public.profiles profile
  where profile.id=v_actor
    and profile.status::text='active';

  if v_role not in('admin','reseller') then
    raise exception
      'Tu usuario no puede actualizar fechas de cuentas.';
  end if;

  foreach v_raw in array p_account_emails loop
    v_email := lower(trim(coalesce(v_raw,'')));
    v_account_id := null;

    if v_email='' or
       v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    then
      v_invalid := v_invalid+1;
      continue;
    end if;

    select account.id
    into v_account_id
    from public.netflix_accounts account
    where account.service::text=v_service
      and lower(account.current_email)=v_email
    limit 1;

    if v_account_id is null then
      v_not_found := v_not_found+1;
      continue;
    end if;

    begin
      perform public.update_my_account_term_v28(
        v_account_id,
        p_starts_on
      );

      v_updated := v_updated+1;
    exception
      when others then
        v_not_allowed := v_not_allowed+1;
    end;
  end loop;

  return jsonb_build_object(
    'success',true,
    'updated',v_updated,
    'not_found',v_not_found,
    'not_allowed',v_not_allowed,
    'invalid',v_invalid
  );
end;
$$;

revoke all
on function public.bulk_update_my_account_terms_v28(
  text,text[],date
)
from public,anon;

grant execute
on function public.bulk_update_my_account_terms_v28(
  text,text[],date
)
to authenticated;


-- ============================================================
-- 9. ASIGNACIÓN INICIAL DEL ADMINISTRADOR
--
-- Crea fecha independiente para:
-- - administrador vendedor;
-- - distribuidor comprador.
-- ============================================================
create or replace function public.bulk_assign_service_accounts_v28(
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
begin
  if not private.is_admin() then
    raise exception
      'Solo el administrador puede realizar esta asignación.';
  end if;

  if p_starts_on is null then
    raise exception 'Selecciona una fecha válida.';
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
    select *
    into v_account
    from public.netflix_accounts account
    where account.service::text=lower(trim(p_service))
      and lower(account.current_email)=lower(trim(v_email))
    for update;

    if not found then
      v_not_found := v_not_found+1;
      continue;
    end if;

    if v_account.status::text<>'available'
       or v_account.current_reseller_id is not null
       or v_account.current_client_id is not null
    then
      v_unavailable := v_unavailable+1;
      continue;
    end if;

    update public.account_assignments
    set status='cancelled'
    where account_id=v_account.id
      and status::text='active';

    insert into public.account_assignments(
      account_id,seller_id,buyer_reseller_id,
      starts_on,duration_days,status,created_by
    )
    values(
      v_account.id,v_actor,p_distributor_id,
      p_starts_on,30,'active',v_actor
    );

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

    insert into public.account_manager_terms(
      account_id,manager_id,starts_on,duration_days,
      created_at,updated_at
    )
    values(
      v_account.id,p_distributor_id,p_starts_on,30,now(),now()
    )
    on conflict(account_id,manager_id)
    do update set
      starts_on=excluded.starts_on,
      duration_days=30,
      updated_at=now();

    update public.netflix_accounts
    set current_reseller_id=p_distributor_id,
        current_client_id=null,
        origin_distributor_id=coalesce(
          origin_distributor_id,p_distributor_id
        ),
        inventory_admin_id=coalesce(
          inventory_admin_id,v_actor
        ),
        status='assigned'
    where id=v_account.id;

    v_assigned := v_assigned+1;
  end loop;

  return jsonb_build_object(
    'success',true,
    'assigned',v_assigned,
    'unavailable',v_unavailable,
    'not_found',v_not_found
  );
end;
$$;

revoke all
on function public.bulk_assign_service_accounts_v28(
  text,text[],uuid,date
)
from public,anon;

grant execute
on function public.bulk_assign_service_accounts_v28(
  text,text[],uuid,date
)
to authenticated;


-- ============================================================
-- 10. ASIGNACIÓN ENTRE DISTRIBUIDORES
--
-- Cambia el propietario actual, conserva la rama original y
-- guarda fechas independientes para vendedor y comprador.
-- ============================================================
create or replace function public.assign_account_to_reseller_v28(
  p_account_id uuid,
  p_buyer_reseller_id uuid,
  p_starts_on date
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_account public.netflix_accounts;
begin
  if v_actor is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  if p_starts_on is null then
    raise exception 'Selecciona una fecha válida.';
  end if;

  select *
  into v_account
  from public.netflix_accounts
  where id=p_account_id
  for update;

  if not found then
    raise exception 'La cuenta no existe.';
  end if;

  if v_account.current_reseller_id is distinct from v_actor
     or v_account.current_client_id is not null
  then
    raise exception
      'Solo puedes asignar cuentas que estén directamente a tu nombre.';
  end if;

  if not exists(
    select 1
    from public.profiles profile
    where profile.id=p_buyer_reseller_id
      and profile.parent_id=v_actor
      and profile.role::text='reseller'
      and profile.status::text='active'
  ) then
    raise exception
      'Solo puedes asignar a un distribuidor directo activo.';
  end if;

  update public.account_assignments
  set status='cancelled'
  where account_id=p_account_id
    and status::text='active';

  insert into public.account_assignments(
    account_id,seller_id,buyer_reseller_id,
    starts_on,duration_days,status,created_by
  )
  values(
    p_account_id,v_actor,p_buyer_reseller_id,
    p_starts_on,30,'active',v_actor
  );

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

  insert into public.account_manager_terms(
    account_id,manager_id,starts_on,duration_days,
    created_at,updated_at
  )
  values(
    p_account_id,p_buyer_reseller_id,p_starts_on,30,now(),now()
  )
  on conflict(account_id,manager_id)
  do update set
    starts_on=excluded.starts_on,
    duration_days=30,
    updated_at=now();

  update public.netflix_accounts
  set current_reseller_id=p_buyer_reseller_id,
      current_client_id=null,
      status='assigned'
  where id=p_account_id;

  return jsonb_build_object(
    'success',true,
    'message','Cuenta asignada correctamente con fechas independientes.'
  );
end;
$$;

revoke all
on function public.assign_account_to_reseller_v28(
  uuid,uuid,date
)
from public,anon;

grant execute
on function public.assign_account_to_reseller_v28(
  uuid,uuid,date
)
to authenticated;


-- ============================================================
-- 11. EDICIÓN ADMINISTRATIVA
--
-- País y metadatos: solo administración.
-- Fecha: modifica únicamente la fecha personal del administrador.
-- ============================================================
create or replace function public.admin_edit_service_account_v28(
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
  v_actor uuid := (select auth.uid());
  v_account public.netflix_accounts;
  v_old_owner uuid;
begin
  if not private.is_admin() then
    raise exception
      'Solo el administrador puede editar esta información.';
  end if;

  if p_starts_on is null then
    raise exception 'Selecciona una fecha válida.';
  end if;

  select *
  into v_account
  from public.netflix_accounts
  where id=p_account_id
  for update;

  if not found then
    raise exception 'La cuenta no existe.';
  end if;

  if lower(trim(p_service)) not in('netflix','spotify') then
    raise exception 'Servicio no válido.';
  end if;

  if p_owner_id is not null and not exists(
    select 1
    from public.profiles profile
    where profile.id=p_owner_id
      and profile.role::text='reseller'
      and profile.status::text='active'
  ) then
    raise exception 'Propietario no válido.';
  end if;

  v_old_owner := v_account.current_reseller_id;

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

  if p_owner_id is distinct from v_old_owner then
    update public.account_assignments
    set status='cancelled'
    where account_id=p_account_id
      and status::text='active';

    if p_owner_id is not null then
      insert into public.account_assignments(
        account_id,seller_id,buyer_reseller_id,
        starts_on,duration_days,status,created_by
      )
      values(
        p_account_id,v_actor,p_owner_id,
        p_starts_on,30,'active',v_actor
      );

      insert into public.account_manager_terms(
        account_id,manager_id,starts_on,duration_days,
        created_at,updated_at
      )
      values(
        p_account_id,p_owner_id,p_starts_on,30,now(),now()
      )
      on conflict(account_id,manager_id)
      do update set
        starts_on=excluded.starts_on,
        duration_days=30,
        updated_at=now();
    end if;
  end if;

  update public.netflix_accounts
  set service=lower(trim(p_service)),
      account_type=coalesce(
        nullif(trim(p_account_type),''),
        'Cuenta completa'
      ),
      country=coalesce(
        nullif(trim(p_country),''),
        'Sin configurar'
      ),
      current_reseller_id=p_owner_id,
      current_client_id=null,
      origin_distributor_id=case
        when origin_distributor_id is null
         and p_owner_id is not null
        then p_owner_id
        else origin_distributor_id
      end,
      inventory_admin_id=coalesce(
        inventory_admin_id,v_actor
      ),
      status=case
        when p_owner_id is null then 'available'
        else 'assigned'
      end
  where id=p_account_id;

  return jsonb_build_object(
    'success',true,
    'message','Cuenta actualizada. La fecha modificada pertenece solo a tu usuario.'
  );
end;
$$;

revoke all
on function public.admin_edit_service_account_v28(
  uuid,text,text,text,uuid,date
)
from public,anon;

grant execute
on function public.admin_edit_service_account_v28(
  uuid,text,text,text,uuid,date
)
to authenticated;

commit;

select 'BLOQUE 28 CREADO CORRECTAMENTE' as resultado;
