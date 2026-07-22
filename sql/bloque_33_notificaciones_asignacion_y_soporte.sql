begin;

-- ============================================================
-- BLOQUE 33 · NOTIFICACIONES DE ASIGNACIÓN Y SOPORTE
-- Centro Premium V6.9.7
--
-- Genera notificaciones cuando:
-- 1. Administración asigna cuentas a un distribuidor.
-- 2. Un distribuidor entrega una cuenta dentro de su rama.
-- 3. Administración o Soporte responden un ticket.
-- ============================================================


-- ============================================================
-- 1. FUNCIÓN INTERNA PARA NOTIFICACIONES DIRECTAS
-- ============================================================
create or replace function private.create_direct_notification_v33(
  p_sender_id uuid,
  p_recipient_id uuid,
  p_title text,
  p_message text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_notification_id uuid;
begin
  if p_sender_id is null
     or p_recipient_id is null
  then
    return null;
  end if;

  insert into public.notifications(
    sender_id,
    title,
    message,
    image_url,
    allow_forward,
    created_at
  )
  values(
    p_sender_id,
    trim(p_title),
    trim(p_message),
    null,
    false,
    now()
  )
  returning id into v_notification_id;

  insert into public.notification_recipients(
    notification_id,
    recipient_id,
    read_at,
    created_at
  )
  values(
    v_notification_id,
    p_recipient_id,
    null,
    now()
  )
  on conflict(notification_id,recipient_id)
  do nothing;

  return v_notification_id;
end;
$$;


-- ============================================================
-- 2. REASIGNAR UNA CUENTA Y NOTIFICAR AL NUEVO PROPIETARIO
-- ============================================================
create or replace function public.reassign_account_hierarchical_v29(
  p_account_id uuid,
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
  v_role text;
  v_account public.netflix_accounts;
  v_actor_allowed boolean := false;
  v_owner_allowed boolean := false;
  v_new_account_status public.account_status;
  v_service_label text;
  v_sender_name text;
begin
  if v_actor is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  select profile.role::text
  into v_role
  from public.profiles profile
  where profile.id=v_actor
    and profile.status::text='active';

  if v_role not in('admin','reseller') then
    raise exception
      'Tu usuario no puede cambiar propietarios.';
  end if;

  select account.*
  into v_account
  from public.netflix_accounts account
  where account.id=p_account_id
  for update;

  if not found then
    raise exception 'La cuenta no existe.';
  end if;

  if v_role='admin' then
    v_actor_allowed := true;

    v_owner_allowed := (
      p_owner_id is null
      or exists(
        select 1
        from public.profiles profile
        where profile.id=p_owner_id
          and profile.role::text='reseller'
          and profile.status::text='active'
      )
    );
  else
    if p_owner_id is null then
      raise exception
        'Un distribuidor no puede devolver la cuenta a Disponible.';
    end if;

    with recursive branch as(
      select
        profile.id,
        array[profile.id]::uuid[] path
      from public.profiles profile
      where profile.id=v_actor
        and profile.role::text='reseller'
        and profile.status::text='active'

      union all

      select
        child.id,
        branch.path||child.id
      from public.profiles child
      join branch
        on child.parent_id=branch.id
      where child.role::text='reseller'
        and child.status::text='active'
        and not child.id=any(branch.path)
    )
    select
      exists(
        select 1
        from branch
        where branch.id=v_account.current_reseller_id
      ),
      exists(
        select 1
        from branch
        where branch.id=p_owner_id
      )
    into
      v_actor_allowed,
      v_owner_allowed;
  end if;

  if not v_actor_allowed then
    raise exception
      'La cuenta no pertenece a tu propia rama.';
  end if;

  if not v_owner_allowed then
    raise exception
      'El nuevo propietario no pertenece a tu propia rama.';
  end if;

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

    v_new_account_status :=
      'assigned'::public.account_status;
  else
    v_new_account_status :=
      'available'::public.account_status;
  end if;

  if p_starts_on is not null then
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
  end if;

  update public.netflix_accounts
  set
    current_reseller_id=p_owner_id,
    current_client_id=null,
    origin_distributor_id=coalesce(
      origin_distributor_id,
      p_owner_id
    ),
    status=v_new_account_status
  where id=p_account_id;

  if p_owner_id is not null
     and p_owner_id<>v_actor
  then
    v_service_label := case
      when v_account.service::text='netflix'
        then 'Netflix'
      when v_account.service::text='spotify'
        then 'Spotify'
      else initcap(v_account.service::text)
    end;

    select coalesce(
      nullif(trim(profile.business_name),''),
      nullif(trim(profile.full_name),''),
      profile.email,
      'Tu superior'
    )
    into v_sender_name
    from public.profiles profile
    where profile.id=v_actor;

    perform private.create_direct_notification_v33(
      v_actor,
      p_owner_id,
      'Nueva cuenta asignada',
      coalesce(v_sender_name,'Tu superior')||
      ' te asignó una cuenta '||
      v_service_label||': '||
      v_account.current_email||
      '. Ingresa a Cuentas para revisarla.'
    );
  end if;

  return jsonb_build_object(
    'success',true,
    'account_id',p_account_id,
    'owner_id',p_owner_id,
    'status',v_new_account_status::text,
    'message',
      'Propietario actualizado sin modificar fechas ajenas.'
  );
end;
$$;

revoke all
on function public.reassign_account_hierarchical_v29(
  uuid,
  uuid,
  date
)
from public,anon;

grant execute
on function public.reassign_account_hierarchical_v29(
  uuid,
  uuid,
  date
)
to authenticated;


-- ============================================================
-- 3. ASIGNACIÓN EN BLOQUE: UNA SOLA NOTIFICACIÓN CON EL TOTAL
-- ============================================================
create or replace function public.bulk_assign_service_accounts_v29(
  p_service text,
  p_account_emails text[],
  p_distributor_id uuid,
  p_starts_on date
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_email text;
  v_account public.netflix_accounts;
  v_assigned integer := 0;
  v_unavailable integer := 0;
  v_not_found integer := 0;
  v_assigned_status public.account_status :=
    'assigned'::public.account_status;
  v_service_label text;
  v_sender_name text;
begin
  if not private.is_admin() then
    raise exception
      'Solo administración puede realizar la asignación inicial.';
  end if;

  if not exists(
    select 1
    from public.profiles profile
    where profile.id=p_distributor_id
      and profile.role::text='reseller'
      and profile.status::text='active'
  ) then
    raise exception 'Distribuidor no válido.';
  end if;

  foreach v_email in array p_account_emails loop
    v_email := lower(trim(coalesce(v_email,'')));

    select account.*
    into v_account
    from public.netflix_accounts account
    where account.service::text=lower(trim(p_service))
      and lower(account.current_email)=v_email
    for update;

    if not found then
      v_not_found := v_not_found+1;
      continue;
    end if;

    if v_account.status::text<>'available'
       or v_account.current_reseller_id is not null
    then
      v_unavailable := v_unavailable+1;
      continue;
    end if;

    update public.account_assignments
    set status='cancelled'
    where account_id=v_account.id
      and status::text='active';

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
      v_account.id,
      v_actor,
      p_distributor_id,
      p_starts_on,
      30,
      'active',
      v_actor
    );

    if p_starts_on is not null then
      insert into public.account_manager_terms(
        account_id,
        manager_id,
        starts_on,
        duration_days,
        created_at,
        updated_at
      )
      values(
        v_account.id,
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
    end if;

    update public.netflix_accounts
    set
      current_reseller_id=p_distributor_id,
      current_client_id=null,
      origin_distributor_id=coalesce(
        origin_distributor_id,
        p_distributor_id
      ),
      inventory_admin_id=coalesce(
        inventory_admin_id,
        v_actor
      ),
      status=v_assigned_status
    where id=v_account.id;

    v_assigned := v_assigned+1;
  end loop;

  if v_assigned>0 then
    v_service_label := case
      when lower(trim(p_service))='netflix'
        then 'Netflix'
      when lower(trim(p_service))='spotify'
        then 'Spotify'
      else initcap(lower(trim(p_service)))
    end;

    select coalesce(
      nullif(trim(profile.business_name),''),
      nullif(trim(profile.full_name),''),
      profile.email,
      'Administración'
    )
    into v_sender_name
    from public.profiles profile
    where profile.id=v_actor;

    perform private.create_direct_notification_v33(
      v_actor,
      p_distributor_id,
      'Cuentas asignadas',
      coalesce(v_sender_name,'Administración')||
      ' te asignó '||
      v_assigned::text||
      case when v_assigned=1
        then ' cuenta '
        else ' cuentas '
      end||
      v_service_label||
      '. Ingresa a Cuentas para revisarlas.'
    );
  end if;

  return jsonb_build_object(
    'success',true,
    'assigned',v_assigned,
    'unavailable',v_unavailable,
    'not_found',v_not_found,
    'message',
      format(
        '%s cuenta(s) asignadas correctamente.',
        v_assigned
      )
  );
end;
$$;

revoke all
on function public.bulk_assign_service_accounts_v29(
  text,
  text[],
  uuid,
  date
)
from public,anon;

grant execute
on function public.bulk_assign_service_accounts_v29(
  text,
  text[],
  uuid,
  date
)
to authenticated;


-- ============================================================
-- 4. RESPUESTA DE SOPORTE: NOTIFICAR AL CREADOR DEL TICKET
-- ============================================================
create or replace function public.staff_send_ticket_response_v17(
  p_ticket_id uuid,
  p_response_type text,
  p_value text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_type text := lower(trim(coalesce(p_response_type,'')));
  v_value text := trim(coalesce(p_value,''));
  v_message text;
  v_ticket public.support_tickets;
  v_review_status public.ticket_status :=
    'in_review'::public.ticket_status;
  v_sender_name text;
begin
  if not private.is_staff() then
    raise exception
      'Solo administración o soporte pueden responder.';
  end if;

  if v_type not in('failure','password') then
    raise exception 'Tipo de respuesta no válido.';
  end if;

  if v_value='' then
    raise exception 'La respuesta no puede estar vacía.';
  end if;

  select ticket.*
  into v_ticket
  from public.support_tickets ticket
  where ticket.id=p_ticket_id
  for update;

  if not found then
    raise exception 'El ticket no existe.';
  end if;

  if v_type='password' then
    if v_value !~* '^https?://' then
      raise exception 'Coloca un enlace válido.';
    end if;

    v_message := '[PASSWORD_RESET_LINK]'||v_value;
  else
    v_message := v_value;
  end if;

  insert into public.ticket_messages(
    ticket_id,
    author_id,
    message,
    is_system
  )
  values(
    p_ticket_id,
    v_actor,
    v_message,
    true
  );

  update public.support_tickets
  set
    status=v_review_status,
    assigned_support_id=v_actor,
    updated_at=now()
  where id=p_ticket_id;

  if v_ticket.created_by<>v_actor then
    select coalesce(
      nullif(trim(profile.business_name),''),
      nullif(trim(profile.full_name),''),
      profile.email,
      'Soporte'
    )
    into v_sender_name
    from public.profiles profile
    where profile.id=v_actor;

    perform private.create_direct_notification_v33(
      v_actor,
      v_ticket.created_by,
      'Soporte respondió tu ticket',
      coalesce(v_sender_name,'Soporte')||
      ' respondió la solicitud "'||
      v_ticket.title||
      '". Ingresa a Soporte para revisar el mensaje.'
    );
  end if;

  return jsonb_build_object(
    'success',true,
    'message',case
      when v_type='password'
        then 'Enlace de restablecimiento enviado.'
      else 'Respuesta enviada correctamente.'
    end
  );
end;
$$;

revoke all
on function public.staff_send_ticket_response_v17(
  uuid,
  text,
  text
)
from public,anon;

grant execute
on function public.staff_send_ticket_response_v17(
  uuid,
  text,
  text
)
to authenticated;


-- ============================================================
-- 5. ACTIVAR REALTIME PARA LOS DESTINATARIOS, SI ESTÁ DISPONIBLE
-- ============================================================
do $$
begin
  if exists(
    select 1
    from pg_publication
    where pubname='supabase_realtime'
  )
  and not exists(
    select 1
    from pg_publication_tables
    where pubname='supabase_realtime'
      and schemaname='public'
      and tablename='notification_recipients'
  )
  then
    execute
      'alter publication supabase_realtime '||
      'add table public.notification_recipients';
  end if;
exception
  when duplicate_object then
    null;
  when insufficient_privilege then
    null;
end;
$$;


commit;

select pg_notify('pgrst','reload schema');

select
  'BLOQUE 33 CREADO CORRECTAMENTE: NOTIFICACIONES ACTIVAS'
  as resultado;
