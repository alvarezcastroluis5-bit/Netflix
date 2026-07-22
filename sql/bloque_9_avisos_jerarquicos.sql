-- =========================================================
-- BLOQUE 9: AVISOS JERÁRQUICOS
-- Ejecutar una sola vez después de los bloques anteriores.
-- =========================================================

-- ---------------------------------------------------------
-- 1. Permitir imágenes de avisos a administradores y
--    distribuidores activos, dentro de su propia carpeta.
-- ---------------------------------------------------------

drop policy if exists notification_image_admin_insert
on storage.objects;

drop policy if exists notification_image_sender_insert
on storage.objects;

create policy notification_image_sender_insert
on storage.objects
for insert
to authenticated
with check(
  bucket_id='notification-images'
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and exists(
    select 1
    from public.profiles profile
    where profile.id=(select auth.uid())
      and profile.status='active'
      and profile.role::text in ('admin','reseller')
  )
);

-- ---------------------------------------------------------
-- 2. Envío jerárquico
--
-- ADMINISTRADOR:
-- selected          = usuarios específicos
-- all_distributors  = todos los distribuidores activos
-- all_panel         = todos los usuarios activos, excepto él
--
-- DISTRIBUIDOR:
-- selected          = uno o varios subordinados directos
-- all_direct        = todos sus subordinados directos
-- ---------------------------------------------------------

create or replace function public.send_hierarchical_notification(
  p_scope text,
  p_recipient_ids uuid[],
  p_title text,
  p_message text,
  p_image_url text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_sender uuid := (select auth.uid());
  v_sender_role text;
  v_scope text := lower(trim(coalesce(p_scope,'')));
  v_title text := trim(coalesce(p_title,''));
  v_message text := trim(coalesce(p_message,''));
  v_image_url text := nullif(trim(coalesce(p_image_url,'')),'');
  v_notification uuid;
  v_count integer := 0;
begin
  if v_sender is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  select profile.role::text
  into v_sender_role
  from public.profiles profile
  where profile.id=v_sender
    and profile.status='active';

  if v_sender_role not in ('admin','reseller') then
    raise exception 'No tienes permiso para enviar avisos.';
  end if;

  if length(v_title)<2 then
    raise exception 'Coloca un título válido.';
  end if;

  if v_message='' and v_image_url is null then
    raise exception 'Escribe un mensaje o adjunta una imagen.';
  end if;

  if v_sender_role='admin'
     and v_scope not in ('selected','all_distributors','all_panel')
  then
    raise exception 'El alcance seleccionado no es válido.';
  end if;

  if v_sender_role='reseller'
     and v_scope not in ('selected','all_direct')
  then
    raise exception 'El alcance seleccionado no es válido.';
  end if;

  insert into public.notifications(
    sender_id,
    title,
    message,
    image_url
  )
  values(
    v_sender,
    v_title,
    v_message,
    v_image_url
  )
  returning id into v_notification;

  if v_sender_role='admin' then

    if v_scope='selected' then
      if coalesce(array_length(p_recipient_ids,1),0)=0 then
        raise exception 'Selecciona al menos un usuario.';
      end if;

      insert into public.notification_recipients(
        notification_id,
        recipient_id
      )
      select
        v_notification,
        profile.id
      from public.profiles profile
      where profile.id=any(p_recipient_ids)
        and profile.id<>v_sender
        and profile.status='active'
        and profile.role::text in ('admin','support','reseller')
      on conflict do nothing;

    elsif v_scope='all_distributors' then

      insert into public.notification_recipients(
        notification_id,
        recipient_id
      )
      select
        v_notification,
        profile.id
      from public.profiles profile
      where profile.status='active'
        and profile.role::text='reseller'
        and profile.id<>v_sender
      on conflict do nothing;

    elsif v_scope='all_panel' then

      insert into public.notification_recipients(
        notification_id,
        recipient_id
      )
      select
        v_notification,
        profile.id
      from public.profiles profile
      where profile.status='active'
        and profile.role::text in ('admin','support','reseller')
        and profile.id<>v_sender
      on conflict do nothing;

    end if;

  elsif v_sender_role='reseller' then

    if v_scope='selected' then
      if coalesce(array_length(p_recipient_ids,1),0)=0 then
        raise exception 'Selecciona al menos un distribuidor directo.';
      end if;

      insert into public.notification_recipients(
        notification_id,
        recipient_id
      )
      select
        v_notification,
        child.id
      from public.profiles child
      where child.id=any(p_recipient_ids)
        and child.parent_id=v_sender
        and child.status='active'
        and child.role::text='reseller'
      on conflict do nothing;

    elsif v_scope='all_direct' then

      insert into public.notification_recipients(
        notification_id,
        recipient_id
      )
      select
        v_notification,
        child.id
      from public.profiles child
      where child.parent_id=v_sender
        and child.status='active'
        and child.role::text='reseller'
      on conflict do nothing;

    end if;

  end if;

  select count(*)
  into v_count
  from public.notification_recipients recipient
  where recipient.notification_id=v_notification;

  if v_count=0 then
    raise exception 'No existen destinatarios válidos para este aviso.';
  end if;

  return jsonb_build_object(
    'success',true,
    'recipients',v_count,
    'notification_id',v_notification,
    'scope',v_scope
  );
end;
$$;

revoke all
on function public.send_hierarchical_notification(
  text,
  uuid[],
  text,
  text,
  text
)
from public, anon;

grant execute
on function public.send_hierarchical_notification(
  text,
  uuid[],
  text,
  text,
  text
)
to authenticated;

select 'BLOQUE 9 CREADO CORRECTAMENTE' as resultado;
