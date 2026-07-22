begin;

-- ============================================================
-- BLOQUE 35 · VALIDACIÓN NETFLIX POR PROPIETARIO EXACTO
-- Centro Premium V6.9.16
--
-- Distribuidor:
--   Solo puede validar una cuenta cuyo propietario actual sea él mismo.
--
-- Administración y Soporte:
--   Conservan acceso operativo a las cuentas asignadas.
--
-- La respuesta pública del RPC solo devuelve:
--   correo, país e identificador de cuenta.
-- ============================================================

create or replace function public.validate_netflix_owner_access_v35(
  p_email text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_role text;
  v_account public.netflix_accounts;
begin
  if v_actor is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  select profile.role::text
  into v_role
  from public.profiles profile
  where profile.id=v_actor
    and profile.status::text='active';

  if v_role is null then
    raise exception 'Tu usuario no está activo.';
  end if;

  select account.*
  into v_account
  from public.netflix_accounts account
  where account.service::text='netflix'
    and lower(account.current_email)=lower(trim(p_email))
    and account.current_client_id is null
    and account.status::text='assigned'
    and (
      v_role in('admin','support')
      or (
        v_role='reseller'
        and account.current_reseller_id=v_actor
      )
    )
  limit 1;

  if not found then
    raise exception
      'La cuenta no está asignada a tu usuario.';
  end if;

  return jsonb_build_object(
    'allowed',true,
    'account_id',v_account.id,
    'email',v_account.current_email,
    'country',coalesce(
      nullif(trim(v_account.country),''),
      'Sin configurar'
    )
  );
end;
$$;

revoke all
on function public.validate_netflix_owner_access_v35(text)
from public,anon;

grant execute
on function public.validate_netflix_owner_access_v35(text)
to authenticated;

commit;

select pg_notify('pgrst','reload schema');

select
  'BLOQUE 35 CREADO CORRECTAMENTE: VALIDACIÓN NETFLIX EXACTA'
  as resultado;
