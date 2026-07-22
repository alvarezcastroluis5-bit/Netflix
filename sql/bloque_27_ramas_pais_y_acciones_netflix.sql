begin;

-- ============================================================
-- DATOS PERMANENTES DE INVENTARIO
-- ============================================================
alter table public.netflix_accounts
  add column if not exists country text not null default 'Sin configurar';

alter table public.netflix_accounts
  add column if not exists origin_distributor_id uuid
  references public.profiles(id) on delete set null;

alter table public.netflix_accounts
  add column if not exists inventory_admin_id uuid
  references public.profiles(id) on delete set null;

create index if not exists netflix_accounts_origin_distributor_idx
  on public.netflix_accounts(origin_distributor_id);

create index if not exists netflix_accounts_current_reseller_idx
  on public.netflix_accounts(current_reseller_id);

-- La primera asignación conocida define la rama de origen.
update public.netflix_accounts account
set origin_distributor_id=(
  select assignment.buyer_reseller_id
  from public.account_assignments assignment
  where assignment.account_id=account.id
    and assignment.buyer_reseller_id is not null
  order by assignment.created_at asc
  limit 1
)
where account.origin_distributor_id is null
  and exists(
    select 1
    from public.account_assignments assignment
    where assignment.account_id=account.id
      and assignment.buyer_reseller_id is not null
  );

-- El administrador que creó la cuenta queda como inventario principal.
update public.netflix_accounts account
set inventory_admin_id=account.created_by
where account.inventory_admin_id is null
  and exists(
    select 1
    from public.profiles profile
    where profile.id=account.created_by
      and profile.role::text='admin'
  );

-- ============================================================
-- REGISTRO DE ACCIONES NETFLIX
-- ============================================================
create table if not exists public.service_action_requests(
  id uuid primary key default gen_random_uuid(),
  requested_by uuid not null references public.profiles(id),
  account_id uuid not null references public.netflix_accounts(id),
  service text not null,
  action_type text not null,
  account_email_snapshot text not null,
  country_snapshot text,
  status text not null default 'authorized',
  created_at timestamptz not null default now(),
  constraint service_action_requests_service_check
    check(service in('netflix','spotify')),
  constraint service_action_requests_status_check
    check(status in('authorized','completed','failed','cancelled'))
);

create index if not exists service_action_requests_user_idx
  on public.service_action_requests(requested_by,created_at desc);

create index if not exists service_action_requests_account_idx
  on public.service_action_requests(account_id,created_at desc);

alter table public.service_action_requests enable row level security;

grant select on public.service_action_requests to authenticated;

drop policy if exists service_action_requests_own_select
  on public.service_action_requests;

create policy service_action_requests_own_select
on public.service_action_requests
for select to authenticated
using(
  requested_by=(select auth.uid())
  or private.is_staff()
);

-- ============================================================
-- AÑADIR CUENTAS CON PAÍS: SOLO ADMIN
-- ============================================================
create or replace function public.bulk_add_service_accounts_v27(
  p_service text,
  p_account_type text,
  p_country text,
  p_emails text[]
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_service text := lower(trim(p_service));
  v_country text := coalesce(nullif(trim(p_country),''),'Sin configurar');
  v_raw text;
  v_email text;
  v_inserted integer := 0;
  v_duplicates integer := 0;
  v_invalid integer := 0;
begin
  if not private.is_admin() then
    raise exception 'Solo el administrador puede añadir cuentas.';
  end if;

  if v_service not in('netflix','spotify') then
    raise exception 'Servicio no válido.';
  end if;

  foreach v_raw in array p_emails loop
    v_email := lower(trim(coalesce(v_raw,'')));

    if v_email='' or
       v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    then
      v_invalid := v_invalid + 1;
      continue;
    end if;

    if exists(
      select 1
      from public.netflix_accounts
      where service=v_service
        and lower(current_email)=v_email
    ) then
      v_duplicates := v_duplicates + 1;
      continue;
    end if;

    insert into public.netflix_accounts(
      service,current_email,account_type,country,status,
      created_by,inventory_admin_id
    )
    values(
      v_service,
      v_email,
      coalesce(nullif(trim(p_account_type),''),'Cuenta completa'),
      v_country,
      'available',
      v_actor,
      v_actor
    );

    v_inserted := v_inserted + 1;
  end loop;

  return jsonb_build_object(
    'success',true,
    'inserted',v_inserted,
    'duplicates',v_duplicates,
    'invalid',v_invalid
  );
end;
$$;

revoke all on function public.bulk_add_service_accounts_v27(
  text,text,text,text[]
) from public,anon;

grant execute on function public.bulk_add_service_accounts_v27(
  text,text,text,text[]
) to authenticated;

-- ============================================================
-- ASIGNACIÓN INICIAL DEL ADMINISTRADOR
-- Mantiene permanentemente la rama de origen.
-- ============================================================
create or replace function public.bulk_assign_service_accounts_v27(
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
    raise exception 'Solo el administrador puede realizar esta asignación.';
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
    where account.service=lower(trim(p_service))
      and lower(account.current_email)=lower(trim(v_email))
    for update;

    if not found then
      v_not_found := v_not_found + 1;
      continue;
    end if;

    if v_account.status::text<>'available'
       or v_account.current_reseller_id is not null
       or v_account.current_client_id is not null
    then
      v_unavailable := v_unavailable + 1;
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

    update public.netflix_accounts
    set current_reseller_id=p_distributor_id,
        current_client_id=null,
        origin_distributor_id=coalesce(
          origin_distributor_id,p_distributor_id
        ),
        inventory_admin_id=coalesce(inventory_admin_id,v_actor),
        status='assigned'
    where id=v_account.id;

    v_assigned := v_assigned + 1;
  end loop;

  return jsonb_build_object(
    'success',true,
    'assigned',v_assigned,
    'unavailable',v_unavailable,
    'not_found',v_not_found
  );
end;
$$;

revoke all on function public.bulk_assign_service_accounts_v27(
  text,text[],uuid,date
) from public,anon;

grant execute on function public.bulk_assign_service_accounts_v27(
  text,text[],uuid,date
) to authenticated;

-- ============================================================
-- TRANSFERENCIA ENTRE DISTRIBUIDORES
-- Solo cambia el propietario actual. Nunca cambia el origen.
-- ============================================================
create or replace function public.assign_account_to_reseller_v27(
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

  update public.netflix_accounts
  set current_reseller_id=p_buyer_reseller_id,
      current_client_id=null,
      status='assigned'
  where id=p_account_id;

  return jsonb_build_object(
    'success',true,
    'message','Cuenta asignada correctamente.'
  );
end;
$$;

revoke all on function public.assign_account_to_reseller_v27(
  uuid,uuid,date
) from public,anon;

grant execute on function public.assign_account_to_reseller_v27(
  uuid,uuid,date
) to authenticated;

-- ============================================================
-- EDICIÓN ADMINISTRATIVA CON PAÍS
-- El país solo puede cambiarlo el administrador.
-- ============================================================
create or replace function public.admin_edit_service_account_v27(
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
    raise exception 'Solo el administrador puede editar cuentas.';
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
    end if;
  else
    update public.account_assignments
    set starts_on=p_starts_on,
        duration_days=30
    where account_id=p_account_id
      and status::text='active';

    if p_owner_id is not null and not found then
      insert into public.account_assignments(
        account_id,seller_id,buyer_reseller_id,
        starts_on,duration_days,status,created_by
      )
      values(
        p_account_id,v_actor,p_owner_id,
        p_starts_on,30,'active',v_actor
      );
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
        when origin_distributor_id is null and p_owner_id is not null
          then p_owner_id
        else origin_distributor_id
      end,
      inventory_admin_id=coalesce(inventory_admin_id,v_actor),
      status=case
        when p_owner_id is null then 'available'
        else 'assigned'
      end
  where id=p_account_id;

  return jsonb_build_object(
    'success',true,
    'message','Cuenta actualizada correctamente.'
  );
end;
$$;

revoke all on function public.admin_edit_service_account_v27(
  uuid,text,text,text,uuid,date
) from public,anon;

grant execute on function public.admin_edit_service_account_v27(
  uuid,text,text,text,uuid,date
) to authenticated;

-- ============================================================
-- API ÚNICA DE CUENTAS PARA ADMINISTRACIÓN
-- ============================================================
create or replace function public.staff_list_service_accounts_v27()
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
    assignment.id,
    assignment.status::text,
    assignment.seller_id,
    assignment.buyer_reseller_id,
    assignment.buyer_client_id,
    assignment.starts_on,
    assignment.duration_days,
    (assignment.starts_on+assignment.duration_days)::date,
    case
      when assignment.id is null then null
      else greatest(
        (
          (assignment.starts_on+assignment.duration_days)::date
          - current_date
        ),
        0
      )
    end::integer,
    case
      when assignment.id is null then account.status::text
      when (assignment.starts_on+assignment.duration_days)::date
        < current_date then 'expired'
      when (assignment.starts_on+assignment.duration_days)::date
        <= current_date+3 then 'expiring'
      else assignment.status::text
    end,
    assignment.created_at
  from public.netflix_accounts account
  left join public.profiles owner
    on owner.id=account.current_reseller_id
  left join public.profiles parent
    on parent.id=owner.parent_id
  left join public.profiles origin
    on origin.id=account.origin_distributor_id
  left join lateral(
    select candidate.*
    from public.account_assignments candidate
    where candidate.account_id=account.id
      and candidate.status::text='active'
    order by candidate.created_at desc
    limit 1
  ) assignment on true
  where private.is_staff()
  order by account.created_at desc;
$$;

revoke all on function public.staff_list_service_accounts_v27()
from public,anon;

grant execute on function public.staff_list_service_accounts_v27()
to authenticated;

-- ============================================================
-- CUENTAS VISIBLES EN LA RAMA DEL DISTRIBUIDOR CONECTADO
-- Una cuenta aparece una sola vez, con propietario actual.
-- ============================================================
create or replace function public.reseller_list_branch_accounts_v27()
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
      me.id,
      array[me.id]::uuid[] path
    from public.profiles me
    where me.id=(select auth.uid())
      and me.status::text='active'

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
    assignment.id,
    assignment.status::text,
    assignment.seller_id,
    assignment.buyer_reseller_id,
    assignment.buyer_client_id,
    assignment.starts_on,
    assignment.duration_days,
    (assignment.starts_on+assignment.duration_days)::date,
    case
      when assignment.id is null then null
      else greatest(
        (
          (assignment.starts_on+assignment.duration_days)::date
          - current_date
        ),
        0
      )
    end::integer,
    case
      when assignment.id is null then account.status::text
      when (assignment.starts_on+assignment.duration_days)::date
        < current_date then 'expired'
      when (assignment.starts_on+assignment.duration_days)::date
        <= current_date+3 then 'expiring'
      else assignment.status::text
    end,
    assignment.created_at
  from public.netflix_accounts account
  join branch
    on branch.id=account.current_reseller_id
  left join public.profiles owner
    on owner.id=account.current_reseller_id
  left join public.profiles parent
    on parent.id=owner.parent_id
  left join public.profiles origin
    on origin.id=account.origin_distributor_id
  left join lateral(
    select candidate.*
    from public.account_assignments candidate
    where candidate.account_id=account.id
      and candidate.status::text='active'
    order by candidate.created_at desc
    limit 1
  ) assignment on true
  order by account.created_at desc;
$$;

revoke all on function public.reseller_list_branch_accounts_v27()
from public,anon;

grant execute on function public.reseller_list_branch_accounts_v27()
to authenticated;

-- ============================================================
-- CUENTAS DE UN USUARIO DESDE ADMINISTRACIÓN
--
-- Sofía muestra todas las cuentas que salieron originalmente de
-- Sofía y todas las que están actualmente dentro de su rama.
-- No se duplica ninguna cuenta.
-- ============================================================
create or replace function public.staff_list_user_branch_accounts_v27(
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
      root.id,
      array[root.id]::uuid[] path
    from public.profiles root
    where root.id=p_distributor_id
      and root.role::text='reseller'

    union all

    select
      child.id,
      branch.path||child.id
    from public.profiles child
    join branch on child.parent_id=branch.id
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
    assignment.starts_on,
    (assignment.starts_on+assignment.duration_days)::date,
    case
      when assignment.id is null then null
      else greatest(
        (
          (assignment.starts_on+assignment.duration_days)::date
          - current_date
        ),
        0
      )
    end::integer,
    case
      when assignment.id is null then account.status::text
      when (assignment.starts_on+assignment.duration_days)::date
        < current_date then 'expired'
      when (assignment.starts_on+assignment.duration_days)::date
        <= current_date+3 then 'expiring'
      else assignment.status::text
    end
  from public.netflix_accounts account
  left join public.profiles owner
    on owner.id=account.current_reseller_id
  left join public.profiles parent
    on parent.id=owner.parent_id
  left join public.profiles origin
    on origin.id=account.origin_distributor_id
  left join lateral(
    select candidate.*
    from public.account_assignments candidate
    where candidate.account_id=account.id
      and candidate.status::text='active'
    order by candidate.created_at desc
    limit 1
  ) assignment on true
  where private.is_staff()
    and (
      account.origin_distributor_id=p_distributor_id
      or account.current_reseller_id in(select id from branch)
    )
  order by account.id,account.created_at desc;
$$;

revoke all on function public.staff_list_user_branch_accounts_v27(uuid)
from public,anon;

grant execute on function public.staff_list_user_branch_accounts_v27(uuid)
to authenticated;

-- ============================================================
-- AUTORIZACIÓN NETFLIX CON ACCIÓN OBLIGATORIA
-- ============================================================
create or replace function public.authorize_netflix_action_v27(
  p_email text,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid := (select auth.uid());
  v_account public.netflix_accounts;
  v_action text := lower(trim(p_action));
  v_allowed_actions text[] := array[
    'restablecer_contrasena',
    'codigo_sesion',
    'actualizar_hogar',
    'acceso_temporal',
    'verificacion_6_digitos'
  ];
  v_request_id uuid;
begin
  if v_user is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  if not v_action=any(v_allowed_actions) then
    raise exception 'Selecciona una acción válida.';
  end if;

  select *
  into v_account
  from public.netflix_accounts account
  where account.service::text='netflix'
    and lower(account.current_email)=lower(trim(p_email))
    and account.current_reseller_id=v_user
    and account.current_client_id is null
    and account.status::text='assigned'
  for share;

  if not found then
    raise exception
      'La cuenta no está actualmente a tu nombre o no está activa.';
  end if;

  if exists(
    select 1
    from public.service_action_requests request
    where request.requested_by=v_user
      and request.account_id=v_account.id
      and request.action_type=v_action
      and request.created_at>now()-interval '20 seconds'
  ) then
    raise exception
      'Espera unos segundos antes de repetir la misma solicitud.';
  end if;

  insert into public.service_action_requests(
    requested_by,account_id,service,action_type,
    account_email_snapshot,country_snapshot,status
  )
  values(
    v_user,v_account.id,'netflix',v_action,
    v_account.current_email,v_account.country,'authorized'
  )
  returning id into v_request_id;

  return jsonb_build_object(
    'allowed',true,
    'request_id',v_request_id,
    'email',v_account.current_email,
    'country',v_account.country,
    'action',v_action
  );
end;
$$;

revoke all on function public.authorize_netflix_action_v27(text,text)
from public,anon;

grant execute on function public.authorize_netflix_action_v27(text,text)
to authenticated;

commit;

select 'BLOQUE 27 CREADO CORRECTAMENTE' as resultado;
