-- =========================================================
-- BLOQUE 21 · MARCAR NOTIFICACIONES COMO LEÍDAS
-- =========================================================

begin;

create or replace function public.mark_notification_read_v21(
  p_recipient_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid := (select auth.uid());
  v_read_at timestamptz;
begin
  if v_user is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  update public.notification_recipients
  set read_at=coalesce(read_at,now())
  where id=p_recipient_id
    and recipient_id=v_user
  returning read_at into v_read_at;

  if v_read_at is null then
    return jsonb_build_object(
      'success',false,
      'message','La notificación no pertenece al usuario actual o ya no existe.'
    );
  end if;

  return jsonb_build_object(
    'success',true,
    'recipient_id',p_recipient_id,
    'read_at',v_read_at
  );
end;
$$;

revoke all
on function public.mark_notification_read_v21(uuid)
from public,anon;

grant execute
on function public.mark_notification_read_v21(uuid)
to authenticated;

commit;

select 'BLOQUE 21 CREADO CORRECTAMENTE' as resultado;
