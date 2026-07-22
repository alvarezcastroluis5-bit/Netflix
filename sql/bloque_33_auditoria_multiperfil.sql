begin;

-- ============================================================
-- 1. TICKETS DE SOPORTE: LECTURA SEGURA PARA ADMIN/SOPORTE
-- ============================================================
create or replace function public.staff_list_tickets_v33()
returns table(
  id uuid,
  ticket_number text,
  service text,
  reported_email text,
  account_email_snapshot text,
  title text,
  category text,
  description text,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  closed_at timestamptz,
  account_id uuid,
  created_by uuid,
  creator_full_name text,
  creator_business_name text,
  creator_parent_id uuid
)
language plpgsql
security definer
set search_path=''
stable
as $$
begin
  if not private.is_staff() then
    raise exception 'Solo administración o soporte pueden consultar todos los tickets.';
  end if;

  return query
  select
    ticket.id,
    ticket.ticket_number::text,
    ticket.service::text,
    ticket.reported_email,
    ticket.account_email_snapshot,
    ticket.title,
    ticket.category,
    ticket.description,
    ticket.status::text,
    ticket.created_at,
    ticket.updated_at,
    ticket.closed_at,
    ticket.account_id,
    ticket.created_by,
    creator.full_name,
    creator.business_name,
    creator.parent_id
  from public.support_tickets ticket
  left join public.profiles creator
    on creator.id=ticket.created_by
  order by ticket.updated_at desc;
end;
$$;

revoke all on function public.staff_list_tickets_v33()
from public,anon;
grant execute on function public.staff_list_tickets_v33()
to authenticated;


create or replace function public.staff_list_ticket_messages_v33(
  p_ticket_id uuid
)
returns table(
  id uuid,
  message text,
  is_system boolean,
  created_at timestamptz,
  author_id uuid,
  author_full_name text,
  author_business_name text,
  author_role text
)
language plpgsql
security definer
set search_path=''
stable
as $$
begin
  if not private.is_staff() then
    raise exception 'Solo administración o soporte pueden consultar este historial.';
  end if;

  if not exists(
    select 1
    from public.support_tickets ticket
    where ticket.id=p_ticket_id
  ) then
    raise exception 'El ticket no existe.';
  end if;

  return query
  select
    message.id,
    message.message,
    message.is_system,
    message.created_at,
    message.author_id,
    author.full_name,
    author.business_name,
    author.role::text
  from public.ticket_messages message
  left join public.profiles author
    on author.id=message.author_id
  where message.ticket_id=p_ticket_id
  order by message.created_at;
end;
$$;

revoke all on function public.staff_list_ticket_messages_v33(uuid)
from public,anon;
grant execute on function public.staff_list_ticket_messages_v33(uuid)
to authenticated;


-- ============================================================
-- 2. CREAR TICKET: DISTRIBUIDOR SOLO CON CUENTA PROPIA
-- ============================================================
create or replace function public.create_support_ticket_v2(
  p_service text,
  p_reported_email text,
  p_title text,
  p_category text,
  p_description text
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
  v_email text := lower(trim(coalesce(p_reported_email,'')));
  v_category text := trim(coalesce(p_category,''));
  v_account uuid;
  v_ticket public.support_tickets;
begin
  if v_user is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  select profile.role::text
  into v_role
  from public.profiles profile
  where profile.id=v_user
    and profile.status::text='active';

  if v_role not in('admin','support','reseller') then
    raise exception 'Tu usuario no puede crear tickets.';
  end if;

  if v_service not in('netflix','spotify') then
    raise exception 'Plataforma no válida.';
  end if;

  if v_category not in(
    'Caída','Falla','Restablecer contraseña','Contraseña incorrecta'
  ) then
    raise exception 'Categoría no válida.';
  end if;

  if length(trim(coalesce(p_title,'')))<3 then
    raise exception 'Describe el error en el título.';
  end if;

  select account.id
  into v_account
  from public.netflix_accounts account
  where account.service::text=v_service
    and lower(account.current_email)=v_email
    and (
      v_role in('admin','support')
      or(
        v_role='reseller'
        and account.current_reseller_id=v_user
        and account.current_client_id is null
      )
    )
  limit 1;

  if v_account is null then
    if v_role='reseller' then
      raise exception 'La cuenta no está actualmente a tu nombre.';
    end if;

    raise exception 'No se encontró la cuenta con ese correo y plataforma.';
  end if;

  insert into public.support_tickets(
    created_by,account_id,title,category,description,status,
    account_email_snapshot,service,reported_email,
    assigned_support_id,closed_at
  )
  values(
    v_user,v_account,trim(p_title),v_category,
    coalesce(nullif(trim(coalesce(p_description,'')),''),trim(p_title)),
    'open'::public.ticket_status,
    v_email,v_service,v_email,null,null
  )
  returning * into v_ticket;

  insert into public.ticket_messages(
    ticket_id,author_id,message,is_system
  )
  values(
    v_ticket.id,v_user,
    coalesce(nullif(trim(coalesce(p_description,'')),''),trim(p_title)),
    false
  );

  return jsonb_build_object(
    'success',true,
    'message','Ticket enviado. El caso está en revisión.',
    'ticket_id',v_ticket.id,
    'ticket_number',v_ticket.ticket_number
  );
end;
$$;

revoke all on function public.create_support_ticket_v2(
  text,text,text,text,text
) from public,anon;
grant execute on function public.create_support_ticket_v2(
  text,text,text,text,text
) to authenticated;


-- ============================================================
-- 3. MENSAJES DEL DISTRIBUIDOR O DE UN SUPERIOR DE SU RAMA
-- ============================================================
create or replace function public.reseller_add_ticket_message_v33(
  p_ticket_id uuid,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid := (select auth.uid());
  v_message text := trim(coalesce(p_message,''));
  v_ticket public.support_tickets;
begin
  if v_user is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  if v_message='' then
    raise exception 'El mensaje no puede estar vacío.';
  end if;

  select ticket.*
  into v_ticket
  from public.support_tickets ticket
  where ticket.id=p_ticket_id
  for update;

  if not found then
    raise exception 'El ticket no existe.';
  end if;

  if v_ticket.status::text in('closed','resolved') then
    raise exception 'Este caso ya está cerrado.';
  end if;

  if not exists(
    with recursive visible_users as(
      select
        me.id,
        array[me.id]::uuid[] path
      from public.profiles me
      where me.id=v_user
        and me.role::text='reseller'
        and me.status::text='active'

      union all

      select
        child.id,
        visible_users.path||child.id
      from public.profiles child
      join visible_users
        on child.parent_id=visible_users.id
      where child.role::text='reseller'
        and child.status::text='active'
        and not child.id=any(visible_users.path)
    )
    select 1
    from visible_users
    where visible_users.id=v_ticket.created_by
  ) then
    raise exception 'No tienes permiso para responder este ticket.';
  end if;

  insert into public.ticket_messages(
    ticket_id,author_id,message,is_system
  )
  values(
    p_ticket_id,v_user,v_message,false
  );

  update public.support_tickets
  set updated_at=now()
  where id=p_ticket_id;

  return jsonb_build_object(
    'success',true,
    'message','Mensaje enviado a soporte.'
  );
end;
$$;

revoke all on function public.reseller_add_ticket_message_v33(uuid,text)
from public,anon;
grant execute on function public.reseller_add_ticket_message_v33(uuid,text)
to authenticated;


-- ============================================================
-- 4. RESPUESTA DE SOPORTE: NO RESPONDER CASOS CERRADOS
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
begin
  if not private.is_staff() then
    raise exception 'Solo administración o soporte pueden responder.';
  end if;

  select ticket.*
  into v_ticket
  from public.support_tickets ticket
  where ticket.id=p_ticket_id
  for update;

  if not found then
    raise exception 'El ticket no existe.';
  end if;

  if v_ticket.status::text in('closed','resolved') then
    raise exception 'Este caso ya está cerrado.';
  end if;

  if v_type not in('failure','password') then
    raise exception 'Tipo de respuesta no válido.';
  end if;

  if v_value='' then
    raise exception 'La respuesta no puede estar vacía.';
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
    ticket_id,author_id,message,is_system
  )
  values(p_ticket_id,v_actor,v_message,true);

  update public.support_tickets
  set
    status='in_review'::public.ticket_status,
    assigned_support_id=v_actor,
    updated_at=now()
  where id=p_ticket_id;

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

revoke all on function public.staff_send_ticket_response_v17(
  uuid,text,text
) from public,anon;
grant execute on function public.staff_send_ticket_response_v17(
  uuid,text,text
) to authenticated;


-- ============================================================
-- 5. HISTORIAL VISIBLE PARA CADA RAMA
-- ============================================================
create or replace function public.reseller_list_change_history_v33()
returns table(
  id uuid,
  account_id uuid,
  ticket_id uuid,
  service text,
  old_email text,
  new_email text,
  change_type text,
  reason text,
  created_at timestamptz,
  performed_by uuid,
  operator_full_name text,
  operator_business_name text
)
language sql
security definer
set search_path=''
stable
as $$
  with recursive branch as(
    select
      me.id,
      array[me.id]::uuid[] path
    from public.profiles me
    where me.id=(select auth.uid())
      and me.role::text='reseller'
      and me.status::text='active'

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
    history.id,
    history.account_id,
    history.ticket_id,
    history.service::text,
    history.old_email,
    history.new_email,
    history.change_type,
    history.reason,
    history.created_at,
    history.performed_by,
    operator.full_name,
    operator.business_name
  from public.account_change_history history
  join public.netflix_accounts account
    on account.id=history.account_id
  left join public.profiles operator
    on operator.id=history.performed_by
  where
    account.current_reseller_id in(select id from branch)
    or account.origin_distributor_id=(select auth.uid())
  order by history.created_at desc;
$$;

revoke all on function public.reseller_list_change_history_v33()
from public,anon;
grant execute on function public.reseller_list_change_history_v33()
to authenticated;


-- ============================================================
-- 6. MÉTRICAS REALES DE TODA LA RAMA
-- ============================================================
create or replace function public.reseller_dashboard_metrics_v33()
returns jsonb
language plpgsql
security definer
set search_path=''
stable
as $$
declare
  v_user uuid := (select auth.uid());
  v_branch_accounts integer := 0;
  v_descendants integer := 0;
  v_expiring integer := 0;
  v_network_tickets integer := 0;
begin
  if v_user is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  with recursive branch as(
    select
      me.id,
      array[me.id]::uuid[] path
    from public.profiles me
    where me.id=v_user
      and me.role::text='reseller'
      and me.status::text='active'

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
    count(*) filter(where branch.id<>v_user),
    (
      select count(*)
      from public.netflix_accounts account
      where account.current_reseller_id in(select id from branch)
        and account.current_client_id is null
    ),
    (
      select count(*)
      from public.account_manager_terms term
      join public.netflix_accounts account
        on account.id=term.account_id
      where term.manager_id=v_user
        and account.current_reseller_id in(select id from branch)
        and (term.starts_on+30)::date
          between current_date and current_date+3
    ),
    (
      select count(*)
      from public.support_tickets ticket
      where ticket.created_by in(select id from branch)
        and ticket.status::text not in('closed','resolved')
    )
  into
    v_descendants,
    v_branch_accounts,
    v_expiring,
    v_network_tickets
  from branch
  limit 1;

  return jsonb_build_object(
    'success',true,
    'branch_accounts',coalesce(v_branch_accounts,0),
    'network_distributors',coalesce(v_descendants,0),
    'expiring_accounts',coalesce(v_expiring,0),
    'network_open_tickets',coalesce(v_network_tickets,0)
  );
end;
$$;

revoke all on function public.reseller_dashboard_metrics_v33()
from public,anon;
grant execute on function public.reseller_dashboard_metrics_v33()
to authenticated;


-- ============================================================
-- 7. REASIGNACIÓN JERÁRQUICA SIN BORRAR FECHAS AJENAS
--
-- Fecha vacía:
-- - si cambia el propietario, el nuevo propietario queda sin fecha;
-- - no elimina la fecha histórica del actor ni del propietario anterior;
-- - si no cambia el propietario, conserva todas las fechas.
-- ============================================================
create or replace function public.reassign_account_hierarchical_v33(
  p_account_id uuid,
  p_new_owner_id uuid,
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
  v_old_owner uuid;
  v_owner_changed boolean;
  v_new_status public.account_status;
  v_origin uuid;
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
    raise exception 'Tu usuario no puede cambiar propietarios.';
  end if;

  select account.*
  into v_account
  from public.netflix_accounts account
  where account.id=p_account_id
  for update;

  if not found then
    raise exception 'La cuenta no existe.';
  end if;

  if v_account.current_client_id is not null then
    raise exception 'La cuenta está asignada a un cliente.';
  end if;

  v_old_owner := v_account.current_reseller_id;
  v_owner_changed := p_new_owner_id is distinct from v_old_owner;

  if p_new_owner_id is not null and not exists(
    select 1
    from public.profiles profile
    where profile.id=p_new_owner_id
      and profile.role::text='reseller'
      and profile.status::text='active'
  ) then
    raise exception 'El nuevo propietario no es un distribuidor activo.';
  end if;

  if v_role='reseller' then
    if p_new_owner_id is null then
      raise exception 'Un distribuidor no puede dejar la cuenta sin propietario.';
    end if;

    if not exists(
      with recursive branch as(
        select me.id,array[me.id]::uuid[] path
        from public.profiles me
        where me.id=v_actor and me.status::text='active'
        union all
        select child.id,branch.path||child.id
        from public.profiles child
        join branch on child.parent_id=branch.id
        where child.role::text='reseller'
          and child.status::text='active'
          and not child.id=any(branch.path)
      )
      select 1 from branch where branch.id=v_old_owner
    ) then
      raise exception 'La cuenta no pertenece actualmente a tu rama.';
    end if;

    if not exists(
      with recursive branch as(
        select me.id,array[me.id]::uuid[] path
        from public.profiles me
        where me.id=v_actor and me.status::text='active'
        union all
        select child.id,branch.path||child.id
        from public.profiles child
        join branch on child.parent_id=branch.id
        where child.role::text='reseller'
          and child.status::text='active'
          and not child.id=any(branch.path)
      )
      select 1 from branch where branch.id=p_new_owner_id
    ) then
      raise exception 'Solo puedes asignar dentro de tu propia jerarquía.';
    end if;
  end if;

  if v_owner_changed then
    update public.account_assignments
    set status='cancelled'
    where account_id=p_account_id
      and status::text='active';

    if p_new_owner_id is not null then
      insert into public.account_assignments(
        account_id,seller_id,buyer_reseller_id,
        starts_on,duration_days,status,created_by
      )
      values(
        p_account_id,v_actor,p_new_owner_id,
        coalesce(p_starts_on,current_date),30,'active',v_actor
      );
    end if;
  end if;

  if p_starts_on is not null then
    insert into public.account_manager_terms(
      account_id,manager_id,starts_on,duration_days,
      created_at,updated_at
    )
    values(
      p_account_id,v_actor,p_starts_on,30,now(),now()
    )
    on conflict(account_id,manager_id)
    do update set
      starts_on=excluded.starts_on,
      duration_days=30,
      updated_at=now();

    if v_owner_changed and p_new_owner_id is not null then
      insert into public.account_manager_terms(
        account_id,manager_id,starts_on,duration_days,
        created_at,updated_at
      )
      values(
        p_account_id,p_new_owner_id,p_starts_on,30,now(),now()
      )
      on conflict(account_id,manager_id)
      do update set
        starts_on=excluded.starts_on,
        duration_days=30,
        updated_at=now();
    end if;
  elsif v_owner_changed and p_new_owner_id is not null then
    delete from public.account_manager_terms
    where account_id=p_account_id
      and manager_id=p_new_owner_id;
  end if;

  v_new_status := case
    when p_new_owner_id is null
      then 'available'::public.account_status
    else 'assigned'::public.account_status
  end;

  v_origin := v_account.origin_distributor_id;

  if v_origin is null and p_new_owner_id is not null then
    if v_role='admin' then
      with recursive ancestors as(
        select profile.id,profile.parent_id,0 depth,
          array[profile.id]::uuid[] path
        from public.profiles profile
        where profile.id=p_new_owner_id
        union all
        select parent.id,parent.parent_id,ancestors.depth+1,
          ancestors.path||parent.id
        from public.profiles parent
        join ancestors on parent.id=ancestors.parent_id
        where not parent.id=any(ancestors.path)
      )
      select ancestors.id
      into v_origin
      from ancestors
      where ancestors.parent_id=v_actor
      order by ancestors.depth desc
      limit 1;

      v_origin := coalesce(v_origin,p_new_owner_id);
    else
      v_origin := v_actor;
    end if;
  end if;

  update public.netflix_accounts
  set
    current_reseller_id=p_new_owner_id,
    current_client_id=null,
    origin_distributor_id=v_origin,
    inventory_admin_id=case
      when v_role='admin'
        then coalesce(inventory_admin_id,v_actor)
      else inventory_admin_id
    end,
    status=v_new_status
  where id=p_account_id;

  return jsonb_build_object(
    'success',true,
    'old_owner_id',v_old_owner,
    'new_owner_id',p_new_owner_id,
    'owner_changed',v_owner_changed,
    'date_saved',p_starts_on is not null,
    'message',case
      when p_new_owner_id is null
        then 'La cuenta quedó disponible.'
      when v_owner_changed and p_starts_on is null
        then 'Propietario actualizado. La fecha del nuevo propietario quedó pendiente.'
      when p_starts_on is not null
        then 'Propietario y fecha actualizados correctamente.'
      else 'La cuenta fue guardada sin modificar las fechas existentes.'
    end
  );
end;
$$;

revoke all on function public.reassign_account_hierarchical_v33(uuid,uuid,date)
from public,anon;
grant execute on function public.reassign_account_hierarchical_v33(uuid,uuid,date)
to authenticated;


create or replace function public.admin_edit_service_account_v33(
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
  v_service text := lower(trim(coalesce(p_service,'')));
  v_type text := trim(coalesce(p_account_type,''));
  v_result jsonb;
begin
  if not private.is_admin() then
    raise exception 'Solo el administrador puede editar esta información.';
  end if;

  if v_service not in('netflix','spotify') then
    raise exception 'Servicio no válido.';
  end if;

  if v_service='netflix' then
    v_type := 'Cuenta completa';
  elsif v_type not in('Cuenta familiar','Cuenta individual') then
    raise exception 'Spotify solo admite Cuenta familiar o Cuenta individual.';
  end if;

  v_result := public.reassign_account_hierarchical_v33(
    p_account_id,p_owner_id,p_starts_on
  );

  update public.netflix_accounts
  set
    service=v_service,
    account_type=v_type,
    country=coalesce(nullif(trim(p_country),''),'Sin configurar')
  where id=p_account_id;

  return coalesce(v_result,'{}'::jsonb)
    ||jsonb_build_object('success',true);
end;
$$;

revoke all on function public.admin_edit_service_account_v33(
  uuid,text,text,text,uuid,date
) from public,anon;
grant execute on function public.admin_edit_service_account_v33(
  uuid,text,text,text,uuid,date
) to authenticated;


create or replace function public.bulk_assign_service_accounts_v33(
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
  v_service text := lower(trim(coalesce(p_service,'')));
  v_raw text;
  v_email text;
  v_account_id uuid;
  v_assigned integer := 0;
  v_unavailable integer := 0;
  v_not_found integer := 0;
begin
  if not private.is_admin() then
    raise exception 'Solo el administrador puede realizar esta asignación.';
  end if;

  if v_service not in('netflix','spotify') then
    raise exception 'Servicio no válido.';
  end if;

  if not exists(
    select 1 from public.profiles profile
    where profile.id=p_distributor_id
      and profile.role::text='reseller'
      and profile.status::text='active'
  ) then
    raise exception 'Distribuidor no válido.';
  end if;

  foreach v_raw in array p_account_emails loop
    v_email := lower(trim(coalesce(v_raw,'')));
    v_account_id := null;

    select account.id
    into v_account_id
    from public.netflix_accounts account
    where account.service::text=v_service
      and lower(account.current_email)=v_email
      and account.current_reseller_id is null
      and account.current_client_id is null
      and account.status::text='available'
    for update;

    if v_account_id is null then
      if exists(
        select 1 from public.netflix_accounts account
        where account.service::text=v_service
          and lower(account.current_email)=v_email
      ) then
        v_unavailable := v_unavailable+1;
      else
        v_not_found := v_not_found+1;
      end if;
      continue;
    end if;

    perform public.reassign_account_hierarchical_v33(
      v_account_id,p_distributor_id,p_starts_on
    );

    v_assigned := v_assigned+1;
  end loop;

  return jsonb_build_object(
    'success',true,
    'assigned',v_assigned,
    'unavailable',v_unavailable,
    'not_found',v_not_found,
    'date_saved',p_starts_on is not null
  );
end;
$$;

revoke all on function public.bulk_assign_service_accounts_v33(
  text,text[],uuid,date
) from public,anon;
grant execute on function public.bulk_assign_service_accounts_v33(
  text,text[],uuid,date
) to authenticated;

commit;
select pg_notify('pgrst','reload schema');
select 'BLOQUE 33 CREADO CORRECTAMENTE' as resultado;
