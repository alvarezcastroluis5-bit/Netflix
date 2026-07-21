-- =========================================================
-- BLOQUE 11: ELIMINACIÓN CORRECTA DE DISTRIBUIDORES
-- Ejecutar una sola vez después del Bloque 10.
-- =========================================================

create or replace function public.return_deleted_reseller_accounts(
  p_reseller_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_target_role text;
  v_parent_id uuid;
  v_parent_role text;
  v_parent_status text;
  v_actor_role text;
  v_new_parent_id uuid;
  v_returned_to_parent integer := 0;
  v_returned_to_base integer := 0;
  v_cancelled_assignments integer := 0;
  v_reassigned_children integer := 0;
  v_invalidated_resets integer := 0;
begin
  select
    target.role::text,
    target.parent_id
  into
    v_target_role,
    v_parent_id
  from public.profiles target
  where target.id=p_reseller_id
  for update;

  if not found then
    raise exception 'El usuario que se desea eliminar no existe.';
  end if;

  if v_target_role<>'reseller' then
    return jsonb_build_object(
      'success',true,
      'returned_to_parent',0,
      'returned_to_base',0,
      'cancelled_assignments',0,
      'reassigned_children',0,
      'invalidated_resets',0
    );
  end if;

  select actor.role::text
  into v_actor_role
  from public.profiles actor
  where actor.id=p_actor_id
    and actor.status='active';

  if v_actor_role is null then
    raise exception 'El usuario que realiza la eliminación no es válido.';
  end if;

  if v_actor_role<>'admin'
     and p_actor_id is distinct from v_parent_id
  then
    raise exception 'Solo el administrador o el superior directo pueden eliminar este distribuidor.';
  end if;

  if v_parent_id is not null then
    select
      parent.role::text,
      parent.status::text
    into
      v_parent_role,
      v_parent_status
    from public.profiles parent
    where parent.id=v_parent_id;
  end if;

  -- El nuevo superior de los distribuidores directos será
  -- el superior activo del usuario eliminado.
  if v_parent_id is not null
     and v_parent_status='active'
     and v_parent_role in ('admin','reseller')
  then
    v_new_parent_id := v_parent_id;

  -- Respaldo: si el superior original ya no está activo,
  -- un administrador que ejecuta la eliminación recibe la red.
  elsif v_actor_role='admin' then
    v_new_parent_id := p_actor_id;

  else
    v_new_parent_id := null;
  end if;

  -- Transferir los distribuidores directos.
  -- Ejemplo: Sofía elimina a Carlos; Hugo pasa a depender de Sofía.
  update public.profiles child
  set parent_id=v_new_parent_id
  where child.parent_id=p_reseller_id
    and child.role::text='reseller'
    and child.status='active';

  get diagnostics v_reassigned_children=row_count;

  -- Cancelar la asignación activa que entregó la cuenta
  -- al distribuidor eliminado.
  update public.account_assignments assignment
  set status='cancelled'
  where assignment.status='active'
    and assignment.buyer_reseller_id=p_reseller_id
    and exists(
      select 1
      from public.netflix_accounts account
      where account.id=assignment.account_id
        and account.current_reseller_id=p_reseller_id
    );

  get diagnostics v_cancelled_assignments=row_count;

  -- Las cuentas que Carlos todavía conserva vuelven a Sofía.
  if v_parent_id is not null
     and v_parent_role='reseller'
     and v_parent_status='active'
  then
    update public.netflix_accounts account
    set
      current_reseller_id=v_parent_id,
      current_client_id=null,
      status='assigned'
    where account.current_reseller_id=p_reseller_id;

    get diagnostics v_returned_to_parent=row_count;

  -- Si el superior es administrador, vuelven a la base central.
  else
    update public.netflix_accounts account
    set
      current_reseller_id=null,
      current_client_id=null,
      status='available'
    where account.current_reseller_id=p_reseller_id;

    get diagnostics v_returned_to_base=row_count;
  end if;

  -- Invalidar cualquier recuperación iniciada antes de la eliminación.
  update public.password_reset_requests reset_request
  set used_at=coalesce(reset_request.used_at,now())
  where reset_request.user_id=p_reseller_id
    and reset_request.used_at is null;

  get diagnostics v_invalidated_resets=row_count;

  return jsonb_build_object(
    'success',true,
    'parent_id',v_parent_id,
    'new_parent_id',v_new_parent_id,
    'returned_to_parent',v_returned_to_parent,
    'returned_to_base',v_returned_to_base,
    'cancelled_assignments',v_cancelled_assignments,
    'reassigned_children',v_reassigned_children,
    'invalidated_resets',v_invalidated_resets,
    'total_returned',v_returned_to_parent+v_returned_to_base
  );
end;
$$;

revoke all
on function public.return_deleted_reseller_accounts(uuid,uuid)
from public, anon, authenticated;

grant execute
on function public.return_deleted_reseller_accounts(uuid,uuid)
to service_role;

select 'BLOQUE 11 CREADO CORRECTAMENTE' as resultado;
