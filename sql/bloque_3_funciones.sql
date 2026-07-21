-- =========================================================
-- BLOQUE 3: FUNCIONES OPERATIVAS
-- Ejecutar una sola vez después de los bloques 1 y 2.
-- =========================================================

-- 1. WhatsApp del creador directo.
create or replace function public.get_my_parent_contact()
returns table (
  id uuid,
  full_name text,
  whatsapp text
)
language sql
stable
security definer
set search_path = ''
as $$
  select parent.id, parent.full_name, parent.whatsapp
  from public.profiles me
  join public.profiles parent on parent.id = me.parent_id
  where me.id = (select auth.uid())
  limit 1;
$$;

revoke all on function public.get_my_parent_contact() from public, anon;
grant execute on function public.get_my_parent_contact() to authenticated;

-- 2. Crear ticket conservando el correo original.
create or replace function public.create_support_ticket(
  p_account_id uuid,
  p_client_id uuid,
  p_title text,
  p_category text,
  p_description text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_email text;
  v_ticket public.support_tickets;
begin
  if v_user is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  if not private.can_view_account(p_account_id) then
    raise exception 'No tienes acceso a esta cuenta.';
  end if;

  select current_email into v_email
  from public.netflix_accounts
  where id = p_account_id;

  if v_email is null then
    raise exception 'La cuenta no existe.';
  end if;

  insert into public.support_tickets (
    created_by, account_id, client_id, title, category,
    description, status, account_email_snapshot
  )
  values (
    v_user, p_account_id, p_client_id,
    trim(p_title), trim(p_category), trim(p_description),
    'open', v_email
  )
  returning * into v_ticket;

  insert into public.ticket_messages (
    ticket_id, author_id, message, is_system
  )
  values (
    v_ticket.id, v_user,
    'Por favor, necesito soporte para esta cuenta.',
    false
  );

  return jsonb_build_object(
    'success', true,
    'message', 'Ticket creado correctamente.',
    'ticket_id', v_ticket.id,
    'ticket_number', v_ticket.ticket_number
  );
end;
$$;

revoke all on function public.create_support_ticket(uuid,uuid,text,text,text) from public, anon;
grant execute on function public.create_support_ticket(uuid,uuid,text,text,text) to authenticated;

-- 3. Asignar cuenta a un revendedor directo.
create or replace function public.assign_account_to_reseller(
  p_account_id uuid,
  p_buyer_reseller_id uuid,
  p_starts_on date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_role public.app_role;
  v_current_reseller uuid;
  v_status public.account_status;
begin
  select role into v_role from public.profiles where id = v_user and status = 'active';
  if v_role not in ('admin','reseller') then
    raise exception 'No tienes permiso para asignar cuentas.';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = p_buyer_reseller_id
      and p.parent_id = v_user
      and p.role = 'reseller'
      and p.status = 'active'
  ) then
    raise exception 'Solo puedes asignar a un revendedor creado directamente por ti.';
  end if;

  select current_reseller_id, status
  into v_current_reseller, v_status
  from public.netflix_accounts
  where id = p_account_id
  for update;

  if not found then raise exception 'La cuenta no existe.'; end if;

  if v_role = 'admin' then
    if v_status not in ('available','assigned') then
      raise exception 'La cuenta no está disponible para asignación.';
    end if;
  elsif v_current_reseller is distinct from v_user then
    raise exception 'La cuenta no está asignada actualmente a tu usuario.';
  end if;

  update public.account_assignments
  set status = 'cancelled'
  where account_id = p_account_id
    and seller_id = v_user
    and status = 'active';

  insert into public.account_assignments (
    account_id, seller_id, buyer_reseller_id,
    starts_on, duration_days, status, created_by
  )
  values (
    p_account_id, v_user, p_buyer_reseller_id,
    p_starts_on, 30, 'active', v_user
  );

  update public.netflix_accounts
  set current_reseller_id = p_buyer_reseller_id,
      current_client_id = null,
      status = 'assigned'
  where id = p_account_id;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, details)
  values (
    v_user, 'asignar_cuenta_revendedor', 'netflix_account', p_account_id,
    jsonb_build_object('buyer_reseller_id', p_buyer_reseller_id, 'starts_on', p_starts_on)
  );

  return jsonb_build_object(
    'success', true,
    'message', 'Cuenta asignada al revendedor por 30 días.'
  );
end;
$$;

revoke all on function public.assign_account_to_reseller(uuid,uuid,date) from public, anon;
grant execute on function public.assign_account_to_reseller(uuid,uuid,date) to authenticated;

-- 4. Asignar cuenta a cliente final propio.
create or replace function public.assign_account_to_client(
  p_account_id uuid,
  p_client_id uuid,
  p_starts_on date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_role public.app_role;
  v_current_reseller uuid;
begin
  select role into v_role from public.profiles where id = v_user and status = 'active';
  if v_role not in ('admin','reseller') then
    raise exception 'No tienes permiso para asignar cuentas.';
  end if;

  if not exists (
    select 1 from public.clients c
    where c.id = p_client_id and c.owner_id = v_user and c.status = 'active'
  ) then
    raise exception 'El cliente no pertenece a tu usuario.';
  end if;

  select current_reseller_id
  into v_current_reseller
  from public.netflix_accounts
  where id = p_account_id
  for update;

  if not found then raise exception 'La cuenta no existe.'; end if;

  if v_role = 'reseller' and v_current_reseller is distinct from v_user then
    raise exception 'La cuenta no está asignada actualmente a tu usuario.';
  end if;

  update public.account_assignments
  set status = 'cancelled'
  where account_id = p_account_id
    and seller_id = v_user
    and status = 'active';

  insert into public.account_assignments (
    account_id, seller_id, buyer_client_id,
    starts_on, duration_days, status, created_by
  )
  values (
    p_account_id, v_user, p_client_id,
    p_starts_on, 30, 'active', v_user
  );

  update public.netflix_accounts
  set current_reseller_id = v_user,
      current_client_id = p_client_id,
      status = 'assigned'
  where id = p_account_id;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, details)
  values (
    v_user, 'asignar_cuenta_cliente', 'netflix_account', p_account_id,
    jsonb_build_object('client_id', p_client_id, 'starts_on', p_starts_on)
  );

  return jsonb_build_object(
    'success', true,
    'message', 'Cuenta asignada al cliente por 30 días.'
  );
end;
$$;

revoke all on function public.assign_account_to_client(uuid,uuid,date) from public, anon;
grant execute on function public.assign_account_to_client(uuid,uuid,date) to authenticated;

-- 5. Reemplazar correo sin tocar fechas.
create or replace function public.replace_netflix_account(
  p_account_id uuid,
  p_new_email text,
  p_ticket_id uuid default null,
  p_reason text default 'Cambio por garantía'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_old_email text;
  v_clean_email text := lower(trim(p_new_email));
begin
  if not private.is_staff() then
    raise exception 'Solo administración o soporte pueden reemplazar cuentas.';
  end if;

  if v_clean_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'El correo nuevo no es válido.';
  end if;

  if exists (
    select 1 from public.netflix_accounts
    where lower(current_email) = v_clean_email and id <> p_account_id
  ) then
    raise exception 'El correo nuevo ya está registrado en otra cuenta.';
  end if;

  select current_email into v_old_email
  from public.netflix_accounts
  where id = p_account_id
  for update;

  if not found then raise exception 'La cuenta no existe.'; end if;

  update public.netflix_accounts
  set current_email = v_clean_email
  where id = p_account_id;

  insert into public.account_change_history (
    account_id, ticket_id, old_email, new_email,
    change_type, reason, performed_by
  )
  values (
    p_account_id, p_ticket_id, v_old_email, v_clean_email,
    'Cambio por garantía', p_reason, v_user
  );

  if p_ticket_id is not null then
    if not exists (
      select 1 from public.support_tickets
      where id = p_ticket_id and account_id = p_account_id
    ) then
      raise exception 'El ticket no pertenece a esta cuenta.';
    end if;

    insert into public.ticket_messages (
      ticket_id, author_id, message, is_system
    )
    values (
      p_ticket_id, v_user,
      'Cuenta asignada exitosamente. Cuenta nueva: ' || v_clean_email,
      true
    );

    update public.support_tickets
    set status = 'closed',
        assigned_support_id = v_user,
        closed_at = now()
    where id = p_ticket_id;
  end if;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, details)
  values (
    v_user, 'reemplazar_cuenta', 'netflix_account', p_account_id,
    jsonb_build_object(
      'old_email', v_old_email,
      'new_email', v_clean_email,
      'ticket_id', p_ticket_id,
      'dates_preserved', true
    )
  );

  return jsonb_build_object(
    'success', true,
    'message', 'Correo reemplazado. Las fechas de 30 días se conservaron.',
    'old_email', v_old_email,
    'new_email', v_clean_email
  );
end;
$$;

revoke all on function public.replace_netflix_account(uuid,text,uuid,text) from public, anon;
grant execute on function public.replace_netflix_account(uuid,text,uuid,text) to authenticated;

-- 6. Permitir al creador del ticket agregar mensajes a sus tickets,
-- además de administradores, soporte y revendedores superiores.
drop policy if exists messages_insert_visible on public.ticket_messages;

create policy messages_insert_visible
on public.ticket_messages
for insert
to authenticated
with check (
  author_id = (select auth.uid())
  and private.can_view_ticket(ticket_id)
  and (is_system = false or private.is_staff())
);

select 'BLOQUE 3 CREADO CORRECTAMENTE' as resultado;
