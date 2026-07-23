-- =========================================================
-- BLOQUE 19 · CAMBIAR CUENTA Y CERRAR EL CASO
-- =========================================================

begin;

create or replace function public.staff_apply_ticket_replacement_v17(
  p_ticket_id uuid,
  p_new_email text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_ticket public.support_tickets;
  v_old_email text;
  v_new_email text := lower(trim(coalesce(p_new_email,'')));
  v_service text;
  v_closed_status public.ticket_status := 'closed'::public.ticket_status;
begin
  if not private.is_staff() then
    raise exception 'Solo administración o soporte pueden aplicar garantías.';
  end if;

  if v_new_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Correo de reemplazo no válido.';
  end if;

  select * into v_ticket
  from public.support_tickets
  where id=p_ticket_id
  for update;

  if not found then
    raise exception 'El ticket no existe.';
  end if;

  if v_ticket.status in(
    'closed'::public.ticket_status,
    'resolved'::public.ticket_status
  ) then
    raise exception 'Este caso ya está cerrado.';
  end if;

  if v_ticket.account_id is null then
    raise exception 'El ticket no tiene una cuenta vinculada.';
  end if;

  select current_email,service
  into v_old_email,v_service
  from public.netflix_accounts
  where id=v_ticket.account_id
  for update;

  if v_old_email is null then
    raise exception 'La cuenta reportada ya no existe.';
  end if;

  if lower(v_old_email)=v_new_email then
    raise exception 'La cuenta nueva no puede ser igual a la cuenta reportada.';
  end if;

  if exists(
    select 1
    from public.netflix_accounts
    where service=v_service
      and lower(current_email)=v_new_email
      and id<>v_ticket.account_id
  ) then
    raise exception 'El correo nuevo ya existe en la misma plataforma.';
  end if;

  update public.netflix_accounts
  set current_email=v_new_email
  where id=v_ticket.account_id;

  insert into public.account_change_history(
    account_id,
    ticket_id,
    old_email,
    new_email,
    change_type,
    reason,
    performed_by,
    service
  )
  values(
    v_ticket.account_id,
    p_ticket_id,
    v_old_email,
    v_new_email,
    'Cambio por garantía',
    'Cuenta caída o falla que requiere reemplazo',
    v_actor,
    v_service
  );

  insert into public.ticket_messages(
    ticket_id,
    author_id,
    message,
    is_system
  )
  values(
    p_ticket_id,
    v_actor,
    'Cuenta asignada exitosamente. Cuenta: '||v_new_email,
    true
  );

  update public.support_tickets
  set
    status=v_closed_status,
    assigned_support_id=v_actor,
    closed_at=now(),
    updated_at=now()
  where id=p_ticket_id;

  return jsonb_build_object(
    'success',true,
    'message','Cuenta asignada exitosamente. Cuenta: '||v_new_email||'. Caso cerrado.',
    'old_email',v_old_email,
    'new_email',v_new_email,
    'status','closed'
  );
end;
$$;

revoke all
on function public.staff_apply_ticket_replacement_v17(uuid,text)
from public,anon;

grant execute
on function public.staff_apply_ticket_replacement_v17(uuid,text)
to authenticated;

commit;

select 'BLOQUE 19 CREADO CORRECTAMENTE' as resultado;
