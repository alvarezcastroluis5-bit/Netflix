
begin;

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
  v_service text := lower(trim(p_service));
  v_email text := lower(trim(p_reported_email));
  v_account uuid;
  v_ticket public.support_tickets;
  v_category text := trim(coalesce(p_category,''));
  v_initial_status public.ticket_status := 'open'::public.ticket_status;
begin
  if v_service not in('netflix','spotify') then
    raise exception 'Plataforma no válida.';
  end if;

  if v_category not in(
    'Caída','Falla','Restablecer contraseña','Contraseña incorrecta'
  ) then
    raise exception 'Categoría no válida.';
  end if;

  select account.id
  into v_account
  from public.netflix_accounts account
  where account.service=v_service
    and lower(account.current_email)=v_email
    and (private.is_staff() or private.can_view_account(account.id))
  limit 1;

  if v_account is null then
    raise exception 'No se encontró una cuenta visible con ese correo y plataforma.';
  end if;

  insert into public.support_tickets(
    created_by,account_id,title,category,description,status,
    account_email_snapshot,service,reported_email,
    assigned_support_id,closed_at
  )
  values(
    v_user,v_account,trim(p_title),v_category,
    coalesce(nullif(trim(p_description),''),trim(p_title)),
    v_initial_status,v_email,v_service,v_email,null,null
  )
  returning * into v_ticket;

  insert into public.ticket_messages(
    ticket_id,author_id,message,is_system
  )
  values(
    v_ticket.id,v_user,
    coalesce(nullif(trim(p_description),''),trim(p_title)),
    false
  );

  return jsonb_build_object(
    'success',true,
    'message','Ticket enviado. El caso está en revisión.',
    'ticket_id',v_ticket.id
  );
end;
$$;

revoke all on function public.create_support_ticket_v2(
  text,text,text,text,text
) from public,anon;

grant execute on function public.create_support_ticket_v2(
  text,text,text,text,text
) to authenticated;


create or replace function public.staff_set_ticket_status_v17(
  p_ticket_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_status_text text := lower(trim(coalesce(p_status,'')));
  v_status public.ticket_status;
begin
  if not private.is_staff() then
    raise exception 'Solo administración o soporte pueden cambiar el estado.';
  end if;

  if v_status_text not in('open','in_review','closed') then
    raise exception 'Estado de soporte no válido.';
  end if;

  v_status := v_status_text::public.ticket_status;

  update public.support_tickets
  set
    status=v_status,
    assigned_support_id=case
      when v_status='open'::public.ticket_status then assigned_support_id
      else v_actor
    end,
    closed_at=case
      when v_status='closed'::public.ticket_status then now()
      else null
    end,
    updated_at=now()
  where id=p_ticket_id;

  if not found then
    raise exception 'El ticket no existe.';
  end if;

  if v_status='in_review'::public.ticket_status then
    insert into public.ticket_messages(
      ticket_id,author_id,message,is_system
    )
    values(
      p_ticket_id,v_actor,'Tu solicitud está en proceso.',true
    );
  end if;

  return jsonb_build_object(
    'success',true,
    'status',v_status_text,
    'message',case
      when v_status='in_review'::public.ticket_status
        then 'Ticket marcado en proceso.'
      when v_status='closed'::public.ticket_status
        then 'Ticket cerrado correctamente.'
      else 'Estado actualizado.'
    end
  );
end;
$$;

revoke all on function public.staff_set_ticket_status_v17(
  uuid,text
) from public,anon;

grant execute on function public.staff_set_ticket_status_v17(
  uuid,text
) to authenticated;


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
  v_process_status public.ticket_status :=
    'in_review'::public.ticket_status;
begin
  if not private.is_staff() then
    raise exception 'Solo administración o soporte pueden responder.';
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
    status=v_process_status,
    assigned_support_id=v_actor,
    updated_at=now()
  where id=p_ticket_id;

  if not found then
    raise exception 'El ticket no existe.';
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

revoke all on function public.staff_send_ticket_response_v17(
  uuid,text,text
) from public,anon;

grant execute on function public.staff_send_ticket_response_v17(
  uuid,text,text
) to authenticated;


create or replace function public.staff_apply_ticket_replacement_v17(
  p_ticket_id uuid,
  p_new_email text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_ticket public.support_tickets;
  v_old_email text;
  v_new_email text := lower(trim(coalesce(p_new_email,'')));
  v_service text;
  v_process_status public.ticket_status :=
    'in_review'::public.ticket_status;
begin
  if not private.is_staff() then
    raise exception 'Solo administración o soporte pueden aplicar garantías.';
  end if;

  if v_new_email !~
    '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  then
    raise exception 'Correo de reemplazo no válido.';
  end if;

  select *
  into v_ticket
  from public.support_tickets
  where id=p_ticket_id
  for update;

  if not found then
    raise exception 'El ticket no existe.';
  end if;

  if v_ticket.account_id is null then
    raise exception 'El ticket no tiene una cuenta vinculada.';
  end if;

  select current_email,service
  into v_old_email,v_service
  from public.netflix_accounts
  where id=v_ticket.account_id
  for update;

  if v_old_email is null then
    raise exception 'La cuenta reportada ya no existe.';
  end if;

  if exists(
    select 1
    from public.netflix_accounts
    where service=v_service
      and lower(current_email)=v_new_email
      and id<>v_ticket.account_id
  ) then
    raise exception 'El correo nuevo ya existe en la misma plataforma.';
  end if;

  update public.netflix_accounts
  set current_email=v_new_email
  where id=v_ticket.account_id;

  insert into public.account_change_history(
    account_id,ticket_id,old_email,new_email,
    change_type,reason,performed_by,service
  )
  values(
    v_ticket.account_id,p_ticket_id,v_old_email,v_new_email,
    'Cambio por garantía','Cuenta caída',v_actor,v_service
  );

  insert into public.ticket_messages(
    ticket_id,author_id,message,is_system
  )
  values(
    p_ticket_id,v_actor,
    'Cuenta asignada exitosamente. Cuenta: '||v_new_email,
    true
  );

  update public.support_tickets
  set
    status=v_process_status,
    assigned_support_id=v_actor,
    updated_at=now()
  where id=p_ticket_id;

  return jsonb_build_object(
    'success',true,
    'message','Cuenta de garantía asignada. Ahora puedes cerrar el caso.',
    'old_email',v_old_email,
    'new_email',v_new_email
  );
end;
$$;

revoke all on function public.staff_apply_ticket_replacement_v17(
  uuid,text
) from public,anon;

grant execute on function public.staff_apply_ticket_replacement_v17(
  uuid,text
) to authenticated;

commit;

select 'BLOQUE 18 CREADO CORRECTAMENTE' as resultado;
