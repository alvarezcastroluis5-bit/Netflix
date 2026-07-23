-- =========================================================
-- BLOQUE 22 · CADA USUARIO VE SOLO SUS NOTIFICACIONES
--
-- Corrige el caso donde el administrador veía un aviso
-- destinado a otro usuario.
-- =========================================================

begin;

alter table public.notification_recipients
enable row level security;

-- Eliminar políticas anteriores que permitían al personal
-- consultar todos los destinatarios.
drop policy if exists notification_recipients_select_visible
on public.notification_recipients;

drop policy if exists notification_recipients_staff_read_v22
on public.notification_recipients;

drop policy if exists notification_recipients_own_read_v22
on public.notification_recipients;

create policy notification_recipients_own_read_v22
on public.notification_recipients
for select
to authenticated
using(
  recipient_id=(select auth.uid())
);

-- Solo el destinatario puede modificar su lectura.
drop policy if exists notification_recipients_update_own
on public.notification_recipients;

drop policy if exists notification_recipients_own_update_v22
on public.notification_recipients;

create policy notification_recipients_own_update_v22
on public.notification_recipients
for update
to authenticated
using(
  recipient_id=(select auth.uid())
)
with check(
  recipient_id=(select auth.uid())
);

grant select,update
on public.notification_recipients
to authenticated;

-- Las notificaciones se leen únicamente cuando existe
-- un registro de destinatario para el usuario conectado.
drop policy if exists notifications_select_visible
on public.notifications;

drop policy if exists notifications_recipient_read_v22
on public.notifications;

create policy notifications_recipient_read_v22
on public.notifications
for select
to authenticated
using(
  exists(
    select 1
    from public.notification_recipients recipient
    where recipient.notification_id=notifications.id
      and recipient.recipient_id=(select auth.uid())
  )
  or sender_id=(select auth.uid())
);

commit;

select 'BLOQUE 22 CREADO CORRECTAMENTE' as resultado;
