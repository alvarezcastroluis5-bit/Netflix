
begin;

-- =========================================================
-- 1. CUENTAS REALES DEL USUARIO CONECTADO
--
-- Una cuenta solo pertenece al distribuidor indicado en
-- current_reseller_id. No suma cuentas de subordinados.
-- =========================================================
create or replace function public.reseller_list_my_accounts_v26()
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
    owner.full_name,
    owner.business_name,
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
  left join public.profiles owner
    on owner.id=account.current_reseller_id
  left join lateral(
    select candidate.*
    from public.account_assignments candidate
    where candidate.account_id=account.id
      and candidate.status::text='active'
      and candidate.buyer_reseller_id=(select auth.uid())
    order by candidate.created_at desc
    limit 1
  ) assignment on true
  where account.current_reseller_id=(select auth.uid())
    and account.current_client_id is null
  order by account.created_at desc;
$$;

revoke all on function public.reseller_list_my_accounts_v26()
from public,anon;

grant execute on function public.reseller_list_my_accounts_v26()
to authenticated;


-- =========================================================
-- 2. RESUMEN EXACTO DEL DISTRIBUIDOR
--
-- direct_accounts: solo cuentas directamente a su nombre.
-- direct_distributors: solo hijos directos.
-- network_tickets: tickets propios y de descendientes.
-- =========================================================
create or replace function public.reseller_dashboard_metrics_v26()
returns jsonb
language plpgsql
security definer
set search_path=''
stable
as $$
declare
  v_user uuid := (select auth.uid());
  v_accounts integer;
  v_direct_distributors integer;
  v_expiring integer;
  v_own_open_tickets integer;
  v_network_open_tickets integer;
begin
  if v_user is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  select count(*)
  into v_accounts
  from public.netflix_accounts account
  where account.current_reseller_id=v_user
    and account.current_client_id is null;

  select count(*)
  into v_direct_distributors
  from public.profiles profile
  where profile.parent_id=v_user
    and profile.role::text='reseller'
    and profile.status::text='active';

  select count(*)
  into v_expiring
  from public.netflix_accounts account
  join lateral(
    select assignment.*
    from public.account_assignments assignment
    where assignment.account_id=account.id
      and assignment.status::text='active'
      and assignment.buyer_reseller_id=v_user
    order by assignment.created_at desc
    limit 1
  ) active_assignment on true
  where account.current_reseller_id=v_user
    and account.current_client_id is null
    and (
      active_assignment.starts_on
      + active_assignment.duration_days
    )::date between current_date and current_date+3;

  select count(*)
  into v_own_open_tickets
  from public.support_tickets ticket
  where ticket.created_by=v_user
    and ticket.status::text not in('closed','resolved');

  with recursive descendants as(
    select profile.id,array[profile.id]::uuid[] path
    from public.profiles profile
    where profile.parent_id=v_user
      and profile.role::text='reseller'
      and profile.status::text='active'

    union all

    select child.id,descendants.path||child.id
    from public.profiles child
    join descendants on child.parent_id=descendants.id
    where child.role::text='reseller'
      and child.status::text='active'
      and not child.id=any(descendants.path)
  )
  select count(*)
  into v_network_open_tickets
  from public.support_tickets ticket
  where (
      ticket.created_by=v_user
      or ticket.created_by in(select id from descendants)
    )
    and ticket.status::text not in('closed','resolved');

  return jsonb_build_object(
    'success',true,
    'direct_accounts',v_accounts,
    'direct_distributors',v_direct_distributors,
    'expiring_accounts',v_expiring,
    'own_open_tickets',v_own_open_tickets,
    'network_open_tickets',v_network_open_tickets
  );
end;
$$;

revoke all on function public.reseller_dashboard_metrics_v26()
from public,anon;

grant execute on function public.reseller_dashboard_metrics_v26()
to authenticated;


-- =========================================================
-- 3. TICKETS VISIBLES SEGÚN JERARQUÍA
--
-- Usuario conectado:
-- - ve sus propios tickets;
-- - ve tickets de TODOS sus descendientes;
-- - no ve tickets de superiores;
-- - no ve tickets de otra rama.
--
-- Ejemplo:
-- Luis -> Sofía -> José
-- Ticket José: José, Sofía y Luis.
-- Ticket Sofía: Sofía y Luis.
-- José no ve ticket de Sofía.
-- =========================================================
create or replace function public.reseller_list_tickets_v26()
returns table(
  id uuid,
  service text,
  reported_email text,
  account_email_snapshot text,
  title text,
  category text,
  description text,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  closed_at timestamptz,
  account_id uuid,
  created_by uuid,
  creator_full_name text,
  creator_business_name text,
  creator_parent_id uuid
)
language sql
security definer
set search_path=''
stable
as $$
  with recursive visible_users as(
    select
      me.id,
      array[me.id]::uuid[] path
    from public.profiles me
    where me.id=(select auth.uid())
      and me.status::text='active'

    union all

    select
      child.id,
      visible_users.path||child.id
    from public.profiles child
    join visible_users on child.parent_id=visible_users.id
    where child.role::text='reseller'
      and child.status::text='active'
      and not child.id=any(visible_users.path)
  )
  select
    ticket.id,
    ticket.service::text,
    ticket.reported_email,
    ticket.account_email_snapshot,
    ticket.title,
    ticket.category,
    ticket.description,
    ticket.status::text,
    ticket.created_at,
    ticket.updated_at,
    ticket.closed_at,
    ticket.account_id,
    ticket.created_by,
    creator.full_name,
    creator.business_name,
    creator.parent_id
  from public.support_tickets ticket
  join visible_users visible
    on visible.id=ticket.created_by
  left join public.profiles creator
    on creator.id=ticket.created_by
  order by ticket.updated_at desc;
$$;

revoke all on function public.reseller_list_tickets_v26()
from public,anon;

grant execute on function public.reseller_list_tickets_v26()
to authenticated;


-- =========================================================
-- 4. MENSAJES COMPLETOS DEL TICKET
--
-- Usa exactamente la misma jerarquía que la lista.
-- =========================================================
create or replace function public.reseller_list_ticket_messages_v26(
  p_ticket_id uuid
)
returns table(
  id uuid,
  message text,
  is_system boolean,
  created_at timestamptz,
  author_id uuid,
  author_full_name text,
  author_business_name text,
  author_role text
)
language plpgsql
security definer
set search_path=''
stable
as $$
begin
  if not exists(
    with recursive visible_users as(
      select
        me.id,
        array[me.id]::uuid[] path
      from public.profiles me
      where me.id=(select auth.uid())
        and me.status::text='active'

      union all

      select
        child.id,
        visible_users.path||child.id
      from public.profiles child
      join visible_users on child.parent_id=visible_users.id
      where child.role::text='reseller'
        and child.status::text='active'
        and not child.id=any(visible_users.path)
    )
    select 1
    from public.support_tickets ticket
    join visible_users visible
      on visible.id=ticket.created_by
    where ticket.id=p_ticket_id
  ) then
    raise exception
      'No tienes permiso para consultar este ticket.';
  end if;

  return query
  select
    message.id,
    message.message,
    message.is_system,
    message.created_at,
    message.author_id,
    author.full_name,
    author.business_name,
    author.role::text
  from public.ticket_messages message
  left join public.profiles author
    on author.id=message.author_id
  where message.ticket_id=p_ticket_id
  order by message.created_at;
end;
$$;

revoke all on function public.reseller_list_ticket_messages_v26(uuid)
from public,anon;

grant execute on function public.reseller_list_ticket_messages_v26(uuid)
to authenticated;


-- =========================================================
-- 5. PRUEBA LÓGICA DE JERARQUÍA SOBRE DATOS REALES
--
-- Devuelve quién puede ver cada ticket actualmente.
-- Solo para administrador.
-- =========================================================
create or replace function public.audit_ticket_visibility_v26()
returns table(
  ticket_id uuid,
  ticket_title text,
  creator_id uuid,
  creator_name text,
  visible_by_id uuid,
  visible_by_name text,
  hierarchy_distance integer
)
language sql
security definer
set search_path=''
stable
as $$
  with recursive ancestors as(
    select
      creator.id creator_id,
      creator.id visible_by_id,
      0 distance,
      array[creator.id]::uuid[] path
    from public.profiles creator
    where creator.status::text='active'

    union all

    select
      ancestors.creator_id,
      parent.id,
      ancestors.distance+1,
      ancestors.path||parent.id
    from ancestors
    join public.profiles child
      on child.id=ancestors.visible_by_id
    join public.profiles parent
      on parent.id=child.parent_id
    where parent.status::text='active'
      and not parent.id=any(ancestors.path)
  )
  select
    ticket.id,
    ticket.title,
    ticket.created_by,
    creator.business_name,
    ancestors.visible_by_id,
    viewer.business_name,
    ancestors.distance
  from public.support_tickets ticket
  join ancestors
    on ancestors.creator_id=ticket.created_by
  left join public.profiles creator
    on creator.id=ticket.created_by
  left join public.profiles viewer
    on viewer.id=ancestors.visible_by_id
  where private.is_admin()
  order by ticket.created_at desc,ancestors.distance;
$$;

revoke all on function public.audit_ticket_visibility_v26()
from public,anon;

grant execute on function public.audit_ticket_visibility_v26()
to authenticated;

commit;

select 'BLOQUE 26 CREADO CORRECTAMENTE' as resultado;
