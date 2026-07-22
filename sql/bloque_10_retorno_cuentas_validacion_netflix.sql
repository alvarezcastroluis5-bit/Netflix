-- =========================================================
-- BLOQUE 10:
-- 1. DEVOLVER CUENTAS AL SUPERIOR AL ELIMINAR DISTRIBUIDOR
-- 2. VALIDAR CUENTA ANTES DE ABRIR CÓDIGOS NETFLIX
-- Ejecutar una sola vez después de los bloques anteriores.
-- =========================================================

-- ---------------------------------------------------------
-- 1. DEVOLUCIÓN AUTOMÁTICA DE CUENTAS
--
-- Esta función es utilizada únicamente por hyper-processor.
-- Si el superior es distribuidor activo:
--   las cuentas vuelven a ese superior.
-- Si el superior es administrador o no existe:
--   las cuentas vuelven a la base central como disponibles.
--
-- Solo regresan las cuentas que el usuario eliminado conserva
-- actualmente. Las cuentas ya entregadas a otro distribuidor
-- permanecen con ese distribuidor.
-- ---------------------------------------------------------

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
  v_returned_to_parent integer := 0;
  v_returned_to_base integer := 0;
  v_cancelled_assignments integer := 0;
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
      'cancelled_assignments',0
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

  -- Cancelar únicamente la relación activa que entregó esas
  -- cuentas al distribuidor que se está eliminando.
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
  else
    update public.netflix_accounts account
    set
      current_reseller_id=null,
      current_client_id=null,
      status='available'
    where account.current_reseller_id=p_reseller_id;

    get diagnostics v_returned_to_base=row_count;
  end if;

  return jsonb_build_object(
    'success',true,
    'parent_id',v_parent_id,
    'returned_to_parent',v_returned_to_parent,
    'returned_to_base',v_returned_to_base,
    'cancelled_assignments',v_cancelled_assignments,
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

-- ---------------------------------------------------------
-- 2. VALIDACIÓN DE CUENTA NETFLIX
--
-- El distribuidor solo obtiene autorización cuando:
-- - está activo;
-- - el correo existe en Netflix;
-- - la cuenta está actualmente a su nombre;
-- - la cuenta no fue entregada a otro usuario;
-- - la cuenta continúa asignada.
-- ---------------------------------------------------------

create or replace function public.verify_my_service_account(
  p_service text,
  p_email text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid := (select auth.uid());
  v_role text;
  v_service text := lower(trim(coalesce(p_service,'')));
  v_email text := lower(trim(coalesce(p_email,'')));
  v_account_id uuid;
begin
  if v_user is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  select profile.role::text
  into v_role
  from public.profiles profile
  where profile.id=v_user
    and profile.status='active';

  if v_role<>'reseller' then
    raise exception 'Solo un distribuidor activo puede validar una cuenta.';
  end if;

  if v_service not in ('netflix','spotify') then
    raise exception 'Plataforma no válida.';
  end if;

  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Coloca un correo válido.';
  end if;

  select account.id
  into v_account_id
  from public.netflix_accounts account
  where account.service=v_service
    and lower(account.current_email)=v_email
    and account.current_reseller_id=v_user
    and account.current_client_id is null
    and account.status='assigned'
  limit 1;

  if v_account_id is null then
    raise exception 'Acceso negado. Ese correo no está asignado actualmente a tu usuario. Coloca una cuenta que esté a tu nombre.';
  end if;

  return jsonb_build_object(
    'success',true,
    'allowed',true,
    'account_id',v_account_id,
    'email',v_email,
    'service',v_service
  );
end;
$$;

revoke all
on function public.verify_my_service_account(text,text)
from public, anon;

grant execute
on function public.verify_my_service_account(text,text)
to authenticated;

select 'BLOQUE 10 CREADO CORRECTAMENTE' as resultado;
