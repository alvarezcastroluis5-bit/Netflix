-- =========================================================
-- BLOQUE 15:
-- 1. CORREGIR ASIGNACIÓN DESDE EDITAR CUENTA
-- 2. AVISOS JERÁRQUICOS CON REENVÍO OPCIONAL
-- 3. AVISOS PERSISTENTES HASTA MARCAR COMO LEÍDOS
-- =========================================================

begin;

-- ---------------------------------------------------------
-- A. CORRECCIÓN DEL ENUM public.account_status
-- ---------------------------------------------------------

create or replace function public.admin_edit_service_account(
  p_account_id uuid,
  p_service text,
  p_email text,
  p_account_type text,
  p_owner_id uuid,
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
  v_type text := trim(coalesce(p_account_type,''));
  v_existing_email text;
  v_new_status public.account_status;
begin
  if not private.is_admin() then
    raise exception 'Solo el administrador puede editar cuentas.';
  end if;

  select account.current_email
  into v_existing_email
  from public.netflix_accounts account
  where account.id=p_account_id
  for update;

  if v_existing_email is null then
    raise exception 'La cuenta no existe.';
  end if;

  if v_service not in ('netflix','spotify') then
    raise exception 'Plataforma no válida.';
  end if;

  if v_service='netflix' then
    v_type := 'Cuenta completa';
  elsif v_type not in ('Cuenta familiar','Cuenta individual') then
    raise exception 'Spotify solo admite Cuenta familiar o Cuenta individual.';
  end if;

  if p_owner_id is not null and not exists(
    select 1
    from public.profiles profile
    where profile.id=p_owner_id
      and profile.role='reseller'
      and profile.status='active'
  ) then
    raise exception 'Propietario no válido.';
  end if;

  update public.account_assignments
  set status='cancelled'
  where account_id=p_account_id
    and status='active';

  if p_owner_id is not null then
    insert into public.account_assignments(
      account_id,
      seller_id,
      buyer_reseller_id,
      starts_on,
      duration_days,
      status,
      created_by
    )
    values(
      p_account_id,
      v_actor,
      p_owner_id,
      p_starts_on,
      30,
      'active',
      v_actor
    );

    v_new_status := 'assigned'::public.account_status;
  else
    v_new_status := 'available'::public.account_status;
  end if;

  update public.netflix_accounts
  set
    service=v_service,
    account_type=v_type,
    current_reseller_id=p_owner_id,
    current_client_id=null,
    status=v_new_status
  where id=p_account_id;

  return jsonb_build_object(
    'success',true,
    'message','Cuenta actualizada y asignada correctamente.',
    'email',v_existing_email
  );
end;
$$;

revoke all
on function public.admin_edit_service_account(
  uuid,text,text,text,uuid,date
)
from public,anon;

grant execute
on function public.admin_edit_service_account(
  uuid,text,text,text,uuid,date
)
to authenticated;

-- ---------------------------------------------------------
-- B. COLUMNAS DE REENVÍO
-- ---------------------------------------------------------

alter table public.notifications
add column if not exists allow_forward boolean
not null default false;

alter table public.notifications
add column if not exists forwarded_from_id uuid
references public.notifications(id)
on delete set null;

alter table public.notification_recipients
add column if not exists forwarded_at timestamptz;

create index if not exists notifications_forwarded_from_idx
on public.notifications(forwarded_from_id);

-- Eliminar la versión anterior de cinco argumentos.
drop function if exists public.send_hierarchical_notification(
  text,
  uuid[],
  text,
  text,
  text
);

-- ---------------------------------------------------------
-- C. ENVÍO JERÁRQUICO
-- ---------------------------------------------------------

create or replace function public.send_hierarchical_notification(
  p_scope text,
  p_recipient_ids uuid[],
  p_title text,
  p_message text,
  p_image_url text,
  p_allow_forward boolean
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
     and v_scope not in (
       'selected',
       'all_distributors',
       'all_panel'
     )
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
    image_url,
    allow_forward
  )
  values(
    v_sender,
    v_title,
    v_message,
    v_image_url,
    coalesce(p_allow_forward,false)
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
        and profile.role::text in (
          'admin',
          'support',
          'reseller'
        )
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
        and profile.role::text in (
          'admin',
          'support',
          'reseller'
        )
        and profile.id<>v_sender
      on conflict do nothing;
    end if;

  else
    -- Un distribuidor solo puede enviar a subordinados directos.
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
    'scope',v_scope,
    'allow_forward',coalesce(p_allow_forward,false)
  );
end;
$$;

revoke all
on function public.send_hierarchical_notification(
  text,
  uuid[],
  text,
  text,
  text,
  boolean
)
from public,anon;

grant execute
on function public.send_hierarchical_notification(
  text,
  uuid[],
  text,
  text,
  text,
  boolean
)
to authenticated;

-- ---------------------------------------------------------
-- D. REENVIAR UN AVISO RECIBIDO A LA RED DIRECTA
-- ---------------------------------------------------------

create or replace function public.forward_notification_to_my_network(
  p_recipient_id uuid,
  p_allow_forward boolean
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_sender uuid := (select auth.uid());
  v_sender_role text;
  v_source_notification public.notifications;
  v_new_notification uuid;
  v_count integer := 0;
begin
  select profile.role::text
  into v_sender_role
  from public.profiles profile
  where profile.id=v_sender
    and profile.status='active';

  if v_sender_role<>'reseller' then
    raise exception 'Solo un distribuidor activo puede reenviar avisos.';
  end if;

  select notification.*
  into v_source_notification
  from public.notification_recipients recipient
  join public.notifications notification
    on notification.id=recipient.notification_id
  where recipient.id=p_recipient_id
    and recipient.recipient_id=v_sender
    and recipient.forwarded_at is null
    and notification.allow_forward=true
  for update of recipient;

  if not found then
    raise exception 'Este aviso no permite reenvío o ya fue reenviado.';
  end if;

  if not exists(
    select 1
    from public.profiles child
    where child.parent_id=v_sender
      and child.status='active'
      and child.role::text='reseller'
  ) then
    raise exception 'No tienes distribuidores directos para recibir el aviso.';
  end if;

  insert into public.notifications(
    sender_id,
    title,
    message,
    image_url,
    allow_forward,
    forwarded_from_id
  )
  values(
    v_sender,
    v_source_notification.title,
    v_source_notification.message,
    v_source_notification.image_url,
    coalesce(p_allow_forward,false),
    v_source_notification.id
  )
  returning id into v_new_notification;

  insert into public.notification_recipients(
    notification_id,
    recipient_id
  )
  select
    v_new_notification,
    child.id
  from public.profiles child
  where child.parent_id=v_sender
    and child.status='active'
    and child.role::text='reseller'
  on conflict do nothing;

  update public.notification_recipients
  set forwarded_at=now()
  where id=p_recipient_id
    and recipient_id=v_sender;

  select count(*)
  into v_count
  from public.notification_recipients
  where notification_id=v_new_notification;

  return jsonb_build_object(
    'success',true,
    'recipients',v_count,
    'notification_id',v_new_notification
  );
end;
$$;

revoke all
on function public.forward_notification_to_my_network(
  uuid,
  boolean
)
from public,anon;

grant execute
on function public.forward_notification_to_my_network(
  uuid,
  boolean
)
to authenticated;

commit;

select 'BLOQUE 15 CREADO CORRECTAMENTE' as resultado;
