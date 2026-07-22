-- =========================================================
-- BLOQUE 23 · ACTUALIZAR FECHAS DESDE ADMINISTRACIÓN/SOPORTE
-- =========================================================

begin;

create or replace function public.staff_bulk_update_account_dates_v23(
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
  v_service text := lower(trim(coalesce(p_service,'')));
  v_email text;
  v_account_id uuid;
  v_updated integer := 0;
  v_not_found integer := 0;
  v_not_assigned integer := 0;
begin
  if not private.is_staff() then
    raise exception
      'Solo administración o soporte pueden actualizar fechas.';
  end if;

  if v_service not in('netflix','spotify') then
    raise exception 'Plataforma no válida.';
  end if;

  if p_starts_on is null then
    raise exception 'Selecciona una fecha.';
  end if;

  foreach v_email in array coalesce(p_account_emails,array[]::text[])
  loop
    v_email := lower(trim(v_email));

    select account.id
    into v_account_id
    from public.netflix_accounts account
    where account.service=v_service
      and lower(account.current_email)=v_email
    limit 1;

    if v_account_id is null then
      v_not_found := v_not_found+1;
      continue;
    end if;

    update public.account_assignments
    set
      starts_on=p_starts_on,
      duration_days=30
    where account_id=v_account_id
      and status='active';

    if found then
      v_updated := v_updated+1;
    else
      v_not_assigned := v_not_assigned+1;
    end if;

    v_account_id := null;
  end loop;

  return jsonb_build_object(
    'success',true,
    'updated',v_updated,
    'not_found',v_not_found,
    'not_assigned',v_not_assigned
  );
end;
$$;

revoke all
on function public.staff_bulk_update_account_dates_v23(
  text,text[],date
)
from public,anon;

grant execute
on function public.staff_bulk_update_account_dates_v23(
  text,text[],date
)
to authenticated;

commit;

select 'BLOQUE 23 CREADO CORRECTAMENTE' as resultado;
