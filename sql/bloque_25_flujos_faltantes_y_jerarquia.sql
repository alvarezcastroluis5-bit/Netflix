begin;

-- ============================================================
-- CORRECCIÓN:
-- PostgreSQL no permite cambiar las columnas OUT o el tipo de
-- retorno de una función existente mediante CREATE OR REPLACE.
-- Se eliminan primero las definiciones antiguas exactas.
-- ============================================================
drop function if exists public.get_my_parent_contact();
drop function if exists public.reseller_list_network_v25();
drop function if exists public.assign_account_to_reseller(
  uuid,
  uuid,
  date
);
drop function if exists public.reseller_list_tickets_v25();
drop function if exists public.reseller_list_ticket_messages_v25(uuid);

-- 1. Contacto del superior directo.
create or replace function public.get_my_parent_contact()
returns table(id uuid,full_name text,business_name text,whatsapp text,email text)
language sql security definer set search_path='' stable
as $$
  select parent.id,parent.full_name,parent.business_name,parent.whatsapp,parent.email
  from public.profiles me
  join public.profiles parent on parent.id=me.parent_id
  where me.id=(select auth.uid())
    and me.status::text='active'
    and parent.status::text='active'
  limit 1;
$$;
revoke all on function public.get_my_parent_contact() from public,anon;
grant execute on function public.get_my_parent_contact() to authenticated;

-- 2. Red visible: solo descendientes del usuario conectado.
create or replace function public.reseller_list_network_v25()
returns table(id uuid,full_name text,email text,whatsapp text,status text,parent_id uuid,business_name text,created_at timestamptz)
language sql security definer set search_path='' stable
as $$
  with recursive network as(
    select p.id,p.full_name,p.email,p.whatsapp,p.status::text,p.parent_id,p.business_name,p.created_at,array[p.id]::uuid[] path
    from public.profiles p
    where p.parent_id=(select auth.uid()) and p.role::text='reseller' and p.status::text='active'
    union all
    select c.id,c.full_name,c.email,c.whatsapp,c.status::text,c.parent_id,c.business_name,c.created_at,n.path||c.id
    from public.profiles c
    join network n on c.parent_id=n.id
    where c.role::text='reseller' and c.status::text='active' and not c.id=any(n.path)
  )
  select id,full_name,email,whatsapp,status,parent_id,business_name,created_at
  from network order by created_at desc;
$$;
revoke all on function public.reseller_list_network_v25() from public,anon;
grant execute on function public.reseller_list_network_v25() to authenticated;

-- 3. Asignación de una cuenta propia a un distribuidor directo.
create or replace function public.assign_account_to_reseller(
  p_account_id uuid,p_buyer_reseller_id uuid,p_starts_on date
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_actor uuid:=(select auth.uid());
  v_account public.netflix_accounts;
begin
  if v_actor is null then raise exception 'Debes iniciar sesión.'; end if;
  if p_starts_on is null then raise exception 'Selecciona una fecha.'; end if;

  select * into v_account from public.netflix_accounts
  where id=p_account_id for update;
  if not found then raise exception 'La cuenta no existe.'; end if;
  if v_account.current_reseller_id is distinct from v_actor or v_account.current_client_id is not null then
    raise exception 'Solo puedes asignar cuentas que estén directamente a tu nombre.';
  end if;
  if not exists(
    select 1 from public.profiles
    where id=p_buyer_reseller_id and parent_id=v_actor
      and role::text='reseller' and status::text='active'
  ) then raise exception 'Solo puedes asignar a un distribuidor directo activo.'; end if;

  update public.account_assignments set status='cancelled'
  where account_id=p_account_id and status::text='active';

  insert into public.account_assignments(
    account_id,seller_id,buyer_reseller_id,starts_on,duration_days,status,created_by
  ) values(
    p_account_id,v_actor,p_buyer_reseller_id,p_starts_on,30,'active',v_actor
  );

  update public.netflix_accounts set
    current_reseller_id=p_buyer_reseller_id,
    current_client_id=null,
    status='assigned'
  where id=p_account_id;

  return jsonb_build_object('success',true,'message','Cuenta asignada correctamente.');
end;
$$;
revoke all on function public.assign_account_to_reseller(uuid,uuid,date) from public,anon;
grant execute on function public.assign_account_to_reseller(uuid,uuid,date) to authenticated;

-- 4. Tickets visibles para el usuario y todos sus descendientes.
create or replace function public.reseller_list_tickets_v25()
returns table(
  id uuid,service text,reported_email text,account_email_snapshot text,
  title text,category text,description text,status text,created_at timestamptz,
  updated_at timestamptz,closed_at timestamptz,account_id uuid,created_by uuid,
  creator_full_name text
)
language sql security definer set search_path='' stable
as $$
  with recursive visible_users as(
    select (select auth.uid()) id,array[(select auth.uid())]::uuid[] path
    union all
    select p.id,v.path||p.id
    from public.profiles p join visible_users v on p.parent_id=v.id
    where p.role::text='reseller' and p.status::text='active' and not p.id=any(v.path)
  )
  select t.id,t.service::text,t.reported_email,t.account_email_snapshot,
    t.title,t.category,t.description,t.status::text,t.created_at,t.updated_at,
    t.closed_at,t.account_id,t.created_by,p.full_name
  from public.support_tickets t
  join visible_users v on v.id=t.created_by
  left join public.profiles p on p.id=t.created_by
  order by t.updated_at desc;
$$;
revoke all on function public.reseller_list_tickets_v25() from public,anon;
grant execute on function public.reseller_list_tickets_v25() to authenticated;

-- 5. Mensajes de tickets visibles por jerarquía.
create or replace function public.reseller_list_ticket_messages_v25(p_ticket_id uuid)
returns table(id uuid,message text,is_system boolean,created_at timestamptz,author_full_name text)
language plpgsql security definer set search_path='' stable
as $$
begin
  if not exists(
    with recursive visible_users as(
      select (select auth.uid()) id,array[(select auth.uid())]::uuid[] path
      union all
      select p.id,v.path||p.id from public.profiles p
      join visible_users v on p.parent_id=v.id
      where p.role::text='reseller' and p.status::text='active' and not p.id=any(v.path)
    )
    select 1 from public.support_tickets t join visible_users v on v.id=t.created_by
    where t.id=p_ticket_id
  ) then raise exception 'No tienes permiso para ver este ticket.'; end if;

  return query
  select m.id,m.message,m.is_system,m.created_at,p.full_name
  from public.ticket_messages m
  left join public.profiles p on p.id=m.author_id
  where m.ticket_id=p_ticket_id order by m.created_at;
end;
$$;
revoke all on function public.reseller_list_ticket_messages_v25(uuid) from public,anon;
grant execute on function public.reseller_list_ticket_messages_v25(uuid) to authenticated;

commit;
select 'BLOQUE 25 CREADO CORRECTAMENTE' as resultado;
