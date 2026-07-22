-- =========================================================
-- BLOQUE 8: ACTUALIZAR FECHAS DE CUENTAS DE FORMA SEGURA
-- Ejecutar una sola vez después de los bloques anteriores.
-- =========================================================

create or replace function public.bulk_update_my_account_dates(
  p_service text,
  p_account_emails text[],
  p_starts_on date
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_role text;
  v_service text := lower(trim(coalesce(p_service,'')));
  v_raw text;
  v_email text;
  v_account_id uuid;
  v_assignment_id uuid;
  v_updated integer := 0;
  v_not_found integer := 0;
  v_not_allowed integer := 0;
  v_invalid integer := 0;
begin
  select role::text
  into v_role
  from public.profiles
  where id=v_actor
    and status='active';

  if v_role <> 'reseller' then
    raise exception 'Solo los distribuidores pueden actualizar sus fechas.';
  end if;

  if v_service not in ('netflix','spotify') then
    raise exception 'Plataforma no válida.';
  end if;

  if p_starts_on is null then
    raise exception 'Selecciona una fecha válida.';
  end if;

  if coalesce(array_length(p_account_emails,1),0)=0 then
    raise exception 'Coloca al menos una cuenta.';
  end if;

  foreach v_raw in array p_account_emails loop
    v_email := lower(trim(coalesce(v_raw,'')));
    v_account_id := null;
    v_assignment_id := null;

    if v_email='' or
       v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    then
      v_invalid := v_invalid + 1;
      continue;
    end if;

    select account.id
    into v_account_id
    from public.netflix_accounts account
    where account.service=v_service
      and lower(account.current_email)=v_email
      and private.can_view_account(account.id)
    limit 1;

    if v_account_id is null then
      v_not_found := v_not_found + 1;
      continue;
    end if;

    select assignment.id
    into v_assignment_id
    from public.account_assignments assignment
    where assignment.account_id=v_account_id
      and assignment.status='active'
      and (
        assignment.seller_id=v_actor
        or assignment.buyer_reseller_id=v_actor
      )
    order by
      case
        when assignment.seller_id=v_actor then 0
        else 1
      end,
      assignment.created_at desc
    limit 1
    for update;

    if v_assignment_id is null then
      v_not_allowed := v_not_allowed + 1;
      continue;
    end if;

    update public.account_assignments
    set
      starts_on=p_starts_on,
      duration_days=30
    where id=v_assignment_id;

    v_updated := v_updated + 1;
  end loop;

  return jsonb_build_object(
    'success',true,
    'updated',v_updated,
    'not_found',v_not_found,
    'not_allowed',v_not_allowed,
    'invalid',v_invalid,
    'duration_days',30
  );
end;
$$;

revoke all
on function public.bulk_update_my_account_dates(text,text[],date)
from public, anon;

grant execute
on function public.bulk_update_my_account_dates(text,text[],date)
to authenticated;

select 'BLOQUE 8 CREADO CORRECTAMENTE' as resultado;
