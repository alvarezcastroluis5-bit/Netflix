begin;

alter table public.notifications
add column if not exists allow_forward boolean
not null default false;

alter table public.notifications
add column if not exists forwarded_from_id uuid
references public.notifications(id)
on delete set null;

alter table public.notification_recipients
add column if not exists forwarded_at timestamptz;

create schema if not exists private;

create or replace function private.create_direct_notification_v36(
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
  if p_sender_id is null or p_recipient_id is null then
    return null;
  end if;

  insert into public.notifications(
    sender_id,title,message,image_url,allow_forward,created_at
  ) values(
    p_sender_id,
    trim(coalesce(p_title,'')),
    trim(coalesce(p_message,'')),
    null,
    false,
    now()
  ) returning id into v_notification_id;

  insert into public.notification_recipients(
    notification_id,recipient_id,read_at,created_at
  ) values(
    v_notification_id,p_recipient_id,null,now()
  ) on conflict(notification_id,recipient_id) do nothing;

  return v_notification_id;
end;
$$;

-- Función nueva para evitar conflictos de firmas antiguas y schema cache.
drop function if exists public.send_hierarchical_notification_v36(
  text,uuid[],text,text,text,boolean
);

create function public.send_hierarchical_notification_v36(
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
  v_role text;
  v_scope text := lower(trim(coalesce(p_scope,'')));
  v_title text := trim(coalesce(p_title,''));
  v_message text := trim(coalesce(p_message,''));
  v_image text := nullif(trim(coalesce(p_image_url,'')),'');
  v_notification uuid;
  v_count integer := 0;
begin
  if v_sender is null then raise exception 'Debes iniciar sesión.'; end if;

  select profile.role::text into v_role
  from public.profiles profile
  where profile.id=v_sender and profile.status::text='active';

  if v_role not in('admin','reseller') then
    raise exception 'No tienes permiso para enviar avisos.';
  end if;
  if length(v_title)<2 then raise exception 'Coloca un título válido.'; end if;
  if v_message='' and v_image is null then
    raise exception 'Escribe un mensaje o adjunta una imagen.';
  end if;

  if v_role='admin' and v_scope not in('selected','all_distributors','all_panel') then
    raise exception 'El alcance seleccionado no es válido.';
  end if;
  if v_role='reseller' and v_scope not in('selected','all_direct') then
    raise exception 'El alcance seleccionado no es válido.';
  end if;

  insert into public.notifications(
    sender_id,title,message,image_url,allow_forward,created_at
  ) values(
    v_sender,v_title,v_message,v_image,coalesce(p_allow_forward,false),now()
  ) returning id into v_notification;

  if v_role='admin' and v_scope='selected' then
    insert into public.notification_recipients(notification_id,recipient_id)
    select v_notification,p.id
    from public.profiles p
    where p.id=any(coalesce(p_recipient_ids,array[]::uuid[]))
      and p.id<>v_sender
      and p.status::text='active'
      and p.role::text in('admin','support','reseller')
    on conflict(notification_id,recipient_id) do nothing;
  elsif v_role='admin' and v_scope='all_distributors' then
    insert into public.notification_recipients(notification_id,recipient_id)
    select v_notification,p.id from public.profiles p
    where p.id<>v_sender and p.status::text='active' and p.role::text='reseller'
    on conflict(notification_id,recipient_id) do nothing;
  elsif v_role='admin' and v_scope='all_panel' then
    insert into public.notification_recipients(notification_id,recipient_id)
    select v_notification,p.id from public.profiles p
    where p.id<>v_sender and p.status::text='active'
      and p.role::text in('admin','support','reseller')
    on conflict(notification_id,recipient_id) do nothing;
  elsif v_role='reseller' and v_scope='selected' then
    insert into public.notification_recipients(notification_id,recipient_id)
    select v_notification,p.id from public.profiles p
    where p.id=any(coalesce(p_recipient_ids,array[]::uuid[]))
      and p.parent_id=v_sender
      and p.status::text='active' and p.role::text='reseller'
    on conflict(notification_id,recipient_id) do nothing;
  elsif v_role='reseller' and v_scope='all_direct' then
    insert into public.notification_recipients(notification_id,recipient_id)
    select v_notification,p.id from public.profiles p
    where p.parent_id=v_sender
      and p.status::text='active' and p.role::text='reseller'
    on conflict(notification_id,recipient_id) do nothing;
  end if;

  select count(*) into v_count
  from public.notification_recipients nr
  where nr.notification_id=v_notification;

  if v_count=0 then
    delete from public.notifications where id=v_notification;
    raise exception 'No existen destinatarios válidos para este aviso.';
  end if;

  return jsonb_build_object(
    'success',true,'recipients',v_count,
    'notification_id',v_notification,
    'scope',v_scope
  );
end;
$$;

revoke all on function public.send_hierarchical_notification_v36(
  text,uuid[],text,text,text,boolean
) from public,anon;
grant execute on function public.send_hierarchical_notification_v36(
  text,uuid[],text,text,text,boolean
) to authenticated;

-- Asignación y transferencia en bloque para admin y distribuidores.
drop function if exists public.bulk_reassign_service_accounts_v36(
  text,text[],uuid,date
);

create function public.bulk_reassign_service_accounts_v36(
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
  v_role text;
  v_branch_ids uuid[] := array[]::uuid[];
  v_email text;
  v_account public.netflix_accounts;
  v_assigned integer := 0;
  v_transferred integer := 0;
  v_not_allowed integer := 0;
  v_not_found integer := 0;
  v_service_label text;
  v_sender_name text;
begin
  if v_actor is null then raise exception 'Debes iniciar sesión.'; end if;

  select p.role::text into v_role
  from public.profiles p
  where p.id=v_actor and p.status::text='active';

  if v_role not in('admin','reseller') then
    raise exception 'Tu usuario no puede asignar cuentas.';
  end if;

  if not exists(
    select 1 from public.profiles p
    where p.id=p_distributor_id
      and p.role::text='reseller'
      and p.status::text='active'
  ) then raise exception 'Distribuidor no válido.'; end if;

  if v_role='reseller' then
    with recursive branch as(
      select p.id,array[p.id]::uuid[] path
      from public.profiles p
      where p.id=v_actor and p.status::text='active' and p.role::text='reseller'
      union all
      select child.id,branch.path||child.id
      from public.profiles child
      join branch on child.parent_id=branch.id
      where child.status::text='active' and child.role::text='reseller'
        and not child.id=any(branch.path)
    )
    select coalesce(array_agg(id),array[]::uuid[]) into v_branch_ids from branch;

    if not p_distributor_id=any(v_branch_ids) then
      raise exception 'El destinatario no pertenece a tu propia rama.';
    end if;
  end if;

  foreach v_email in array coalesce(p_account_emails,array[]::text[]) loop
    v_email:=lower(trim(coalesce(v_email,'')));
    if v_email='' then continue; end if;

    select a.* into v_account
    from public.netflix_accounts a
    where a.service::text=lower(trim(p_service))
      and lower(a.current_email)=v_email
    for update;

    if not found then
      v_not_found:=v_not_found+1;
      continue;
    end if;

    if v_role='reseller' and (
      v_account.current_reseller_id is null
      or not (v_account.current_reseller_id=any(v_branch_ids))
    ) then
      v_not_allowed:=v_not_allowed+1;
      continue;
    end if;

    if v_account.current_reseller_id is not null
       and v_account.current_reseller_id<>p_distributor_id then
      v_transferred:=v_transferred+1;
    end if;

    update public.account_assignments
    set status='cancelled'
    where account_id=v_account.id and status::text='active';

    insert into public.account_assignments(
      account_id,seller_id,buyer_reseller_id,starts_on,
      duration_days,status,created_by
    ) values(
      v_account.id,v_actor,p_distributor_id,p_starts_on,
      30,'active',v_actor
    );

    if p_starts_on is not null then
      insert into public.account_manager_terms(
        account_id,manager_id,starts_on,duration_days,created_at,updated_at
      ) values(
        v_account.id,v_actor,p_starts_on,30,now(),now()
      ) on conflict(account_id,manager_id) do update set
        starts_on=excluded.starts_on,
        duration_days=30,
        updated_at=now();
    end if;

    update public.netflix_accounts set
      current_reseller_id=p_distributor_id,
      current_client_id=null,
      origin_distributor_id=coalesce(origin_distributor_id,p_distributor_id),
      inventory_admin_id=case when v_role='admin'
        then coalesce(inventory_admin_id,v_actor)
        else inventory_admin_id end,
      status='assigned'::public.account_status
    where id=v_account.id;

    v_assigned:=v_assigned+1;
  end loop;

  if v_assigned>0 and p_distributor_id<>v_actor then
    v_service_label:=case lower(trim(p_service))
      when 'netflix' then 'Netflix'
      when 'spotify' then 'Spotify'
      else initcap(lower(trim(p_service))) end;

    select coalesce(nullif(trim(p.business_name),''),nullif(trim(p.full_name),''),p.email,'Tu superior')
    into v_sender_name from public.profiles p where p.id=v_actor;

    perform private.create_direct_notification_v36(
      v_actor,p_distributor_id,'Cuentas asignadas',
      coalesce(v_sender_name,'Tu superior')||' te asignó '||v_assigned::text||
      case when v_assigned=1 then ' cuenta ' else ' cuentas ' end||
      v_service_label||'. Ingresa a Cuentas para revisarlas.'
    );
  end if;

  return jsonb_build_object(
    'success',true,
    'assigned',v_assigned,
    'transferred',v_transferred,
    'not_allowed',v_not_allowed,
    'not_found',v_not_found
  );
end;
$$;

revoke all on function public.bulk_reassign_service_accounts_v36(
  text,text[],uuid,date
) from public,anon;
grant execute on function public.bulk_reassign_service_accounts_v36(
  text,text[],uuid,date
) to authenticated;

commit;
select pg_notify('pgrst','reload schema');
select 'BLOQUE 36 CREADO CORRECTAMENTE: AVISOS, REASIGNACIÓN Y PANEL' as resultado;
