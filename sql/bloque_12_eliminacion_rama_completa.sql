-- =========================================================
-- BLOQUE 12: ELIMINACIÓN COMPLETA DE UNA RAMA
-- Ejecutar una sola vez después del Bloque 11.
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
  v_deleted_ids uuid[];
  v_deleted_count integer := 0;
  v_returned_to_parent integer := 0;
  v_returned_to_base integer := 0;
  v_cancelled_assignments integer := 0;
  v_invalidated_resets integer := 0;
begin
  select target.role::text, target.parent_id
  into v_target_role, v_parent_id
  from public.profiles target
  where target.id=p_reseller_id
  for update;

  if not found then
    raise exception 'El usuario que se desea eliminar no existe.';
  end if;

  if v_target_role<>'reseller' then
    return jsonb_build_object(
      'success',true,
      'deleted_user_ids',jsonb_build_array(p_reseller_id),
      'deleted_count',1,
      'returned_to_parent',0,
      'returned_to_base',0,
      'cancelled_assignments',0,
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
    raise exception 'Solo el administrador o el superior directo pueden eliminar esta rama.';
  end if;

  if v_parent_id is not null then
    select parent.role::text, parent.status::text
    into v_parent_role, v_parent_status
    from public.profiles parent
    where parent.id=v_parent_id;
  end if;

  with recursive deleted_branch as (
    select profile.id
    from public.profiles profile
    where profile.id=p_reseller_id

    union all

    select child.id
    from public.profiles child
    join deleted_branch parent_branch
      on child.parent_id=parent_branch.id
    where child.role::text='reseller'
  )
  select array_agg(id), count(*)
  into v_deleted_ids, v_deleted_count
  from deleted_branch;

  if coalesce(v_deleted_count,0)=0 then
    raise exception 'No se pudo identificar la rama que será eliminada.';
  end if;

  update public.account_assignments assignment
  set status='cancelled'
  where assignment.status='active'
    and (
      assignment.buyer_reseller_id=any(v_deleted_ids)
      or assignment.seller_id=any(v_deleted_ids)
    )
    and exists(
      select 1
      from public.netflix_accounts account
      where account.id=assignment.account_id
        and account.current_reseller_id=any(v_deleted_ids)
    );

  get diagnostics v_cancelled_assignments=row_count;

  if v_parent_id is not null
     and v_parent_role='reseller'
     and v_parent_status='active'
  then
    update public.netflix_accounts account
    set
      current_reseller_id=v_parent_id,
      current_client_id=null,
      status='assigned'
    where account.current_reseller_id=any(v_deleted_ids);

    get diagnostics v_returned_to_parent=row_count;
  else
    update public.netflix_accounts account
    set
      current_reseller_id=null,
      current_client_id=null,
      status='available'
    where account.current_reseller_id=any(v_deleted_ids);

    get diagnostics v_returned_to_base=row_count;
  end if;

  update public.password_reset_requests reset_request
  set used_at=coalesce(reset_request.used_at,now())
  where reset_request.user_id=any(v_deleted_ids)
    and reset_request.used_at is null;

  get diagnostics v_invalidated_resets=row_count;

  update public.profiles profile
  set status='blocked'
  where profile.id=any(v_deleted_ids);

  return jsonb_build_object(
    'success',true,
    'parent_id',v_parent_id,
    'deleted_user_ids',to_jsonb(v_deleted_ids),
    'deleted_count',v_deleted_count,
    'returned_to_parent',v_returned_to_parent,
    'returned_to_base',v_returned_to_base,
    'cancelled_assignments',v_cancelled_assignments,
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

select 'BLOQUE 12 CREADO CORRECTAMENTE' as resultado;
