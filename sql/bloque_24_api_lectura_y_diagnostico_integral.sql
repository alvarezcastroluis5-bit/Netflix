
begin;

-- =========================================================
-- 1. CUENTAS PARA ADMINISTRACIÓN Y SOPORTE
-- Evita fallos por RLS, vistas y relaciones anidadas.
-- =========================================================
create or replace function public.staff_list_service_accounts_v24()
returns table(
  id uuid,
  service text,
  current_email text,
  account_type text,
  status text,
  current_reseller_id uuid,
  current_client_id uuid,
  created_at timestamptz,
  reseller_full_name text,
  reseller_business_name text,
  reseller_parent_id uuid,
  client_full_name text,
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
    account.account_type,
    account.status::text,
    account.current_reseller_id,
    account.current_client_id,
    account.created_at,
    reseller.full_name,
    reseller.business_name,
    reseller.parent_id,
    client.full_name,
    assignment.id,
    assignment.status::text,
    assignment.seller_id,
    assignment.buyer_reseller_id,
    assignment.buyer_client_id,
    assignment.starts_on,
    assignment.duration_days,
    (assignment.starts_on + assignment.duration_days)::date,
    case
      when assignment.id is null then null
      else greatest(
        ((assignment.starts_on + assignment.duration_days)::date - current_date),
        0
      )
    end::integer,
    case
      when assignment.id is null then account.status::text
      when (assignment.starts_on + assignment.duration_days)::date < current_date
        then 'expired'
      when (assignment.starts_on + assignment.duration_days)::date <= current_date + 3
        then 'expiring'
      else assignment.status::text
    end,
    assignment.created_at
  from public.netflix_accounts account
  left join public.profiles reseller
    on reseller.id=account.current_reseller_id
  left join public.profiles client
    on client.id=account.current_client_id
  left join lateral(
    select candidate.*
    from public.account_assignments candidate
    where candidate.account_id=account.id
      and candidate.status='active'
    order by candidate.created_at desc
    limit 1
  ) assignment on true
  where private.is_staff()
  order by account.created_at desc;
$$;

revoke all on function public.staff_list_service_accounts_v24()
from public,anon;
grant execute on function public.staff_list_service_accounts_v24()
to authenticated;


-- =========================================================
-- 2. CUENTAS VISIBLES PARA DISTRIBUIDORES
-- =========================================================
create or replace function public.reseller_list_service_accounts_v24()
returns table(
  id uuid,
  service text,
  current_email text,
  account_type text,
  status text,
  current_reseller_id uuid,
  current_client_id uuid,
  created_at timestamptz,
  reseller_full_name text,
  reseller_business_name text,
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
    account.account_type,
    account.status::text,
    account.current_reseller_id,
    account.current_client_id,
    account.created_at,
    reseller.full_name,
    reseller.business_name,
    assignment.id,
    assignment.status::text,
    assignment.seller_id,
    assignment.buyer_reseller_id,
    assignment.buyer_client_id,
    assignment.starts_on,
    assignment.duration_days,
    (assignment.starts_on + assignment.duration_days)::date,
    case
      when assignment.id is null then null
      else greatest(
        ((assignment.starts_on + assignment.duration_days)::date - current_date),
        0
      )
    end::integer,
    case
      when assignment.id is null then account.status::text
      when (assignment.starts_on + assignment.duration_days)::date < current_date
        then 'expired'
      when (assignment.starts_on + assignment.duration_days)::date <= current_date + 3
        then 'expiring'
      else assignment.status::text
    end,
    assignment.created_at
  from public.netflix_accounts account
  left join public.profiles reseller
    on reseller.id=account.current_reseller_id
  left join lateral(
    select candidate.*
    from public.account_assignments candidate
    where candidate.account_id=account.id
      and candidate.status='active'
    order by candidate.created_at desc
    limit 1
  ) assignment on true
  where private.can_view_account(account.id)
  order by account.created_at desc;
$$;

revoke all on function public.reseller_list_service_accounts_v24()
from public,anon;
grant execute on function public.reseller_list_service_accounts_v24()
to authenticated;


-- =========================================================
-- 3. USUARIOS PARA ADMINISTRACIÓN
-- =========================================================
create or replace function public.staff_list_profiles_v24()
returns table(
  id uuid,
  full_name text,
  email text,
  whatsapp text,
  role text,
  status text,
  parent_id uuid,
  business_name text,
  avatar_url text,
  created_at timestamptz
)
language sql
security definer
set search_path=''
stable
as $$
  select
    profile.id,
    profile.full_name,
    profile.email,
    profile.whatsapp,
    profile.role::text,
    profile.status::text,
    profile.parent_id,
    profile.business_name,
    profile.avatar_url,
    profile.created_at
  from public.profiles profile
  where private.is_staff()
    and profile.role::text in('reseller','admin','support')
    and profile.status::text='active'
  order by profile.created_at desc;
$$;

revoke all on function public.staff_list_profiles_v24()
from public,anon;
grant execute on function public.staff_list_profiles_v24()
to authenticated;


-- =========================================================
-- 4. DIAGNÓSTICO INTEGRAL
-- No modifica información.
-- =========================================================
create or replace function public.panel_healthcheck_v24()
returns jsonb
language plpgsql
security definer
set search_path=''
stable
as $$
declare
  v_accounts integer;
  v_available integer;
  v_assigned integer;
  v_profiles integer;
  v_resellers integer;
  v_support integer;
  v_tickets integer;
  v_open_tickets integer;
  v_orphan_assignments integer;
  v_multiple_active integer;
  v_account_owner_without_assignment integer;
  v_assignment_without_owner integer;
  v_deleted_parent_children integer;
begin
  if not private.is_admin() then
    raise exception 'Solo el administrador puede ejecutar el diagnóstico.';
  end if;

  select count(*) into v_accounts from public.netflix_accounts;
  select count(*) into v_available
    from public.netflix_accounts where status::text='available';
  select count(*) into v_assigned
    from public.netflix_accounts where status::text='assigned';

  select count(*) into v_profiles from public.profiles;
  select count(*) into v_resellers
    from public.profiles
    where role::text='reseller' and status::text='active';
  select count(*) into v_support
    from public.profiles
    where role::text='support' and status::text='active';

  select count(*) into v_tickets from public.support_tickets;
  select count(*) into v_open_tickets
    from public.support_tickets
    where status::text not in('closed','resolved');

  select count(*) into v_orphan_assignments
  from public.account_assignments assignment
  left join public.netflix_accounts account
    on account.id=assignment.account_id
  where account.id is null;

  select count(*) into v_multiple_active
  from(
    select account_id
    from public.account_assignments
    where status::text='active'
    group by account_id
    having count(*)>1
  ) problem;

  select count(*) into v_account_owner_without_assignment
  from public.netflix_accounts account
  where (
      account.current_reseller_id is not null
      or account.current_client_id is not null
    )
    and not exists(
      select 1
      from public.account_assignments assignment
      where assignment.account_id=account.id
        and assignment.status::text='active'
    );

  select count(*) into v_assignment_without_owner
  from public.netflix_accounts account
  where account.current_reseller_id is null
    and account.current_client_id is null
    and exists(
      select 1
      from public.account_assignments assignment
      where assignment.account_id=account.id
        and assignment.status::text='active'
    );

  select count(*) into v_deleted_parent_children
  from public.profiles child
  join public.profiles parent on parent.id=child.parent_id
  where child.status::text='active'
    and parent.status::text<>'active';

  return jsonb_build_object(
    'success',true,
    'generated_at',now(),
    'counts',jsonb_build_object(
      'accounts',v_accounts,
      'available_accounts',v_available,
      'assigned_accounts',v_assigned,
      'profiles',v_profiles,
      'active_resellers',v_resellers,
      'active_support_users',v_support,
      'tickets',v_tickets,
      'open_tickets',v_open_tickets
    ),
    'integrity',jsonb_build_object(
      'orphan_assignments',v_orphan_assignments,
      'accounts_with_multiple_active_assignments',v_multiple_active,
      'owned_accounts_without_active_assignment',
        v_account_owner_without_assignment,
      'active_assignments_without_account_owner',
        v_assignment_without_owner,
      'active_children_with_inactive_parent',
        v_deleted_parent_children
    )
  );
end;
$$;

revoke all on function public.panel_healthcheck_v24()
from public,anon;
grant execute on function public.panel_healthcheck_v24()
to authenticated;

commit;

select 'BLOQUE 24 CREADO CORRECTAMENTE' as resultado;
