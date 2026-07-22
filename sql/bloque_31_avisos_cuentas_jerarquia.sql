begin;

-- ============================================================
-- 1. AVISOS CON TEXTO, IMAGEN O AMBOS
--
-- Corrige el error de caché:
-- Could not find send_hierarchical_notification(...)
-- ============================================================
alter table public.notifications
  add column if not exists allow_forward boolean
  not null default false;

alter table public.notifications
  add column if not exists forwarded_from_id uuid
  references public.notifications(id)
  on delete set null;

alter table public.notification_recipients
  add column if not exists forwarded_at timestamptz;

drop function if exists public.send_hierarchical_notification(
  text,
  uuid[],
  text,
  text,
  text
);

drop function if exists public.send_hierarchical_notification(
  text,
  uuid[],
  text,
  text,
  text,
  boolean
);

create function public.send_hierarchical_notification(
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
  v_image_url text := nullif(
    trim(coalesce(p_image_url,'')),
    ''
  );
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
    and profile.status::text='active';

  if v_sender_role not in('admin','reseller') then
    raise exception 'No tienes permiso para enviar avisos.';
  end if;

  if length(v_title)<2 then
    raise exception 'Coloca un título válido.';
  end if;

  -- Permite:
  -- 1. solo texto;
  -- 2. solo imagen;
  -- 3. texto e imagen.
  if v_message='' and v_image_url is null then
    raise exception
      'Escribe un mensaje o adjunta una imagen.';
  end if;

  if v_sender_role='admin'
     and v_scope not in(
       'selected',
       'all_distributors',
       'all_panel'
     )
  then
    raise exception 'El alcance seleccionado no es válido.';
  end if;

  if v_sender_role='reseller'
     and v_scope not in(
       'selected',
       'all_direct'
     )
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
        and profile.status::text='active'
        and profile.role::text in(
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
      where profile.status::text='active'
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
      where profile.status::text='active'
        and profile.role::text in(
          'admin',
          'support',
          'reseller'
        )
        and profile.id<>v_sender
      on conflict do nothing;
    end if;

  else
    -- El distribuidor solo puede enviar avisos a hijos directos.
    if v_scope='selected' then
      if coalesce(array_length(p_recipient_ids,1),0)=0 then
        raise exception
          'Selecciona al menos un distribuidor directo.';
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
        and child.status::text='active'
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
        and child.status::text='active'
        and child.role::text='reseller'
      on conflict do nothing;
    end if;
  end if;

  select count(*)
  into v_count
  from public.notification_recipients recipient
  where recipient.notification_id=v_notification;

  if v_count=0 then
    delete from public.notifications
    where id=v_notification;

    raise exception
      'No existen destinatarios válidos para este aviso.';
  end if;

  return jsonb_build_object(
    'success',true,
    'recipients',v_count,
    'notification_id',v_notification,
    'scope',v_scope,
    'has_image',v_image_url is not null,
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


-- ============================================================
-- 2. EDITAR Y ASIGNAR CUENTAS SIN ERROR DE ENUM
--
-- Corrige:
-- column "status" is of type public.account_status
-- but expression is of type text
-- ============================================================
create or replace function public.admin_edit_service_account_v30(
  p_account_id uuid,
  p_service text,
  p_account_type text,
  p_country text,
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
  v_account public.netflix_accounts;
  v_old_owner uuid;
  v_service text := lower(trim(coalesce(p_service,'')));
  v_type text := trim(coalesce(p_account_type,''));
  v_new_status public.account_status;
begin
  if not private.is_admin() then
    raise exception
      'Solo el administrador puede editar esta información.';
  end if;

  if p_starts_on is null then
    raise exception 'Selecciona una fecha válida.';
  end if;

  select *
  into v_account
  from public.netflix_accounts
  where id=p_account_id
  for update;

  if not found then
    raise exception 'La cuenta no existe.';
  end if;

  if v_service not in('netflix','spotify') then
    raise exception 'Servicio no válido.';
  end if;

  if v_service='netflix' then
    v_type := 'Cuenta completa';
  elsif v_type not in(
    'Cuenta familiar',
    'Cuenta individual'
  ) then
    raise exception
      'Spotify solo admite Cuenta familiar o Cuenta individual.';
  end if;

  v_old_owner := v_account.current_reseller_id;

  -- Al cambiar propietario, el administrador solo puede entregar
  -- directamente a un distribuidor que él mismo creó.
  if p_owner_id is distinct from v_old_owner
     and p_owner_id is not null
     and not exists(
       select 1
       from public.profiles profile
       where profile.id=p_owner_id
         and profile.parent_id=v_actor
         and profile.role::text='reseller'
         and profile.status::text='active'
     )
  then
    raise exception
      'Solo puedes asignar directamente a tus distribuidores.';
  end if;

  -- Si el propietario no cambia, se permite conservar a un
  -- descendiente actual y editar país, tipo o fecha administrativa.
  if p_owner_id is not null
     and p_owner_id is not distinct from v_old_owner
     and not exists(
       select 1
       from public.profiles profile
       where profile.id=p_owner_id
         and profile.role::text='reseller'
         and profile.status::text='active'
     )
  then
    raise exception 'El propietario actual no está activo.';
  end if;

  insert into public.account_manager_terms(
    account_id,
    manager_id,
    starts_on,
    duration_days,
    created_at,
    updated_at
  )
  values(
    p_account_id,
    v_actor,
    p_starts_on,
    30,
    now(),
    now()
  )
  on conflict(account_id,manager_id)
  do update set
    starts_on=excluded.starts_on,
    duration_days=30,
    updated_at=now();

  if p_owner_id is distinct from v_old_owner then
    update public.account_assignments
    set status='cancelled'
    where account_id=p_account_id
      and status::text='active';

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

      insert into public.account_manager_terms(
        account_id,
        manager_id,
        starts_on,
        duration_days,
        created_at,
        updated_at
      )
      values(
        p_account_id,
        p_owner_id,
        p_starts_on,
        30,
        now(),
        now()
      )
      on conflict(account_id,manager_id)
      do update set
        starts_on=excluded.starts_on,
        duration_days=30,
        updated_at=now();
    end if;
  end if;

  if p_owner_id is null then
    v_new_status := 'available'::public.account_status;
  else
    v_new_status := 'assigned'::public.account_status;
  end if;

  update public.netflix_accounts
  set
    service=v_service,
    account_type=v_type,
    country=coalesce(
      nullif(trim(p_country),''),
      'Sin configurar'
    ),
    current_reseller_id=p_owner_id,
    current_client_id=null,
    origin_distributor_id=case
      when origin_distributor_id is null
       and p_owner_id is not null
      then p_owner_id
      else origin_distributor_id
    end,
    inventory_admin_id=coalesce(
      inventory_admin_id,
      v_actor
    ),
    status=v_new_status
  where id=p_account_id;

  return jsonb_build_object(
    'success',true,
    'message','Cuenta actualizada correctamente.',
    'owner_changed',
      p_owner_id is distinct from v_old_owner,
    'status',v_new_status::text
  );
end;
$$;

revoke all
on function public.admin_edit_service_account_v30(
  uuid,
  text,
  text,
  text,
  uuid,
  date
)
from public,anon;

grant execute
on function public.admin_edit_service_account_v30(
  uuid,
  text,
  text,
  text,
  uuid,
  date
)
to authenticated;


-- ============================================================
-- 3. REFRESCAR CACHÉ DE POSTGREST
-- ============================================================
commit;

select pg_notify('pgrst','reload schema');

select 'BLOQUE 31 CREADO CORRECTAMENTE' as resultado;
