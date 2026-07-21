begin;

create table if not exists public.help_articles(
  id uuid primary key default gen_random_uuid(),
  article_type text not null default 'faq' check(article_type in('faq','guide')),
  title text not null,
  answer text not null,
  detail text,
  media_type text not null default 'none' check(media_type in('none','image','video')),
  media_url text,
  display_order integer not null default 0,
  status text not null default 'published' check(status in('draft','published')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists help_articles_status_order_idx
on public.help_articles(status,article_type,display_order,created_at);

alter table public.help_articles enable row level security;
grant select on public.help_articles to authenticated;

drop policy if exists help_articles_read_v16 on public.help_articles;
create policy help_articles_read_v16
on public.help_articles for select to authenticated
using(private.is_admin() or status='published');

create or replace function public.admin_save_help_article(
  p_id uuid,p_article_type text,p_title text,p_answer text,p_detail text,
  p_media_type text,p_media_url text,p_display_order integer,p_status text
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_actor uuid:=(select auth.uid());
  v_id uuid;
  v_type text:=lower(trim(coalesce(p_article_type,'')));
  v_media text:=lower(trim(coalesce(p_media_type,'none')));
  v_status text:=lower(trim(coalesce(p_status,'published')));
begin
  if not private.is_admin() then raise exception 'Solo el administrador puede editar el centro de ayuda.'; end if;
  if v_type not in('faq','guide') then raise exception 'Tipo no válido.'; end if;
  if v_media not in('none','image','video') then raise exception 'Contenido visual no válido.'; end if;
  if v_status not in('draft','published') then raise exception 'Estado no válido.'; end if;
  if length(trim(coalesce(p_title,'')))<3 then raise exception 'Coloca un título válido.'; end if;
  if length(trim(coalesce(p_answer,'')))<2 then raise exception 'Coloca una respuesta.'; end if;

  if p_id is null then
    insert into public.help_articles(
      article_type,title,answer,detail,media_type,media_url,display_order,status,created_by
    ) values(
      v_type,trim(p_title),trim(p_answer),nullif(trim(coalesce(p_detail,'')),''),
      v_media,case when v_media='none' then null else nullif(trim(coalesce(p_media_url,'')),'') end,
      greatest(coalesce(p_display_order,0),0),v_status,v_actor
    ) returning id into v_id;
  else
    update public.help_articles set
      article_type=v_type,title=trim(p_title),answer=trim(p_answer),
      detail=nullif(trim(coalesce(p_detail,'')),''),
      media_type=v_media,
      media_url=case when v_media='none' then null else nullif(trim(coalesce(p_media_url,'')),'') end,
      display_order=greatest(coalesce(p_display_order,0),0),
      status=v_status,updated_at=now()
    where id=p_id returning id into v_id;
    if v_id is null then raise exception 'El contenido no existe.'; end if;
  end if;

  return jsonb_build_object('success',true,'id',v_id,'message','Contenido de ayuda guardado correctamente.');
end;
$$;

revoke all on function public.admin_save_help_article(uuid,text,text,text,text,text,text,integer,text) from public,anon;
grant execute on function public.admin_save_help_article(uuid,text,text,text,text,text,text,integer,text) to authenticated;

create or replace function public.admin_delete_help_article(p_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
begin
  if not private.is_admin() then raise exception 'Solo el administrador puede eliminar contenido.'; end if;
  delete from public.help_articles where id=p_id;
  if not found then raise exception 'El contenido no existe.'; end if;
  return jsonb_build_object('success',true,'message','Contenido eliminado.');
end;
$$;

revoke all on function public.admin_delete_help_article(uuid) from public,anon;
grant execute on function public.admin_delete_help_article(uuid) to authenticated;

insert into storage.buckets(id,name,public)
values('help-media','help-media',true)
on conflict(id) do update set public=true;

drop policy if exists help_media_admin_insert_v16 on storage.objects;
create policy help_media_admin_insert_v16
on storage.objects for insert to authenticated
with check(
  bucket_id='help-media'
  and private.is_admin()
  and (storage.foldername(name))[1]=(select auth.uid())::text
);

drop policy if exists help_media_public_read_v16 on storage.objects;
create policy help_media_public_read_v16
on storage.objects for select to public
using(bucket_id='help-media');

create or replace function public.create_support_ticket_v2(
  p_service text,p_reported_email text,p_title text,p_category text,p_description text
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_user uuid:=(select auth.uid());
  v_service text:=lower(trim(p_service));
  v_email text:=lower(trim(p_reported_email));
  v_account uuid;
  v_ticket public.support_tickets;
begin
  if v_service not in('netflix','spotify') then raise exception 'Plataforma no válida.'; end if;
  if p_category not in('Caída','Falla','Contraseña incorrecta') then raise exception 'Categoría no válida.'; end if;

  select account.id into v_account
  from public.netflix_accounts account
  where account.service=v_service
    and lower(account.current_email)=v_email
    and (private.is_staff() or private.can_view_account(account.id))
  limit 1;

  if v_account is null then raise exception 'No se encontró una cuenta visible con ese correo y plataforma.'; end if;

  insert into public.support_tickets(
    created_by,account_id,title,category,description,status,account_email_snapshot,service,reported_email
  ) values(
    v_user,v_account,trim(p_title),p_category,
    coalesce(nullif(trim(p_description),''),trim(p_title)),
    'open',v_email,v_service,v_email
  ) returning * into v_ticket;

  insert into public.ticket_messages(ticket_id,author_id,message,is_system)
  values(v_ticket.id,v_user,coalesce(nullif(trim(p_description),''),trim(p_title)),false);

  return jsonb_build_object('success',true,'message','Ticket creado correctamente.','ticket_id',v_ticket.id,'ticket_number',v_ticket.ticket_number);
end;
$$;

revoke all on function public.create_support_ticket_v2(text,text,text,text,text) from public,anon;
grant execute on function public.create_support_ticket_v2(text,text,text,text,text) to authenticated;

create or replace function public.notify_ticket_resolved_v16()
returns trigger language plpgsql security definer set search_path=''
as $$
declare
  v_sender uuid;
  v_notification uuid;
  v_label text;
begin
  if new.status in('resolved','closed') and old.status not in('resolved','closed') then
    v_sender:=coalesce(new.assigned_support_id,(select auth.uid()),new.created_by);
    v_label:=case when new.status='resolved' then 'resuelto' else 'cerrado' end;

    insert into public.notifications(sender_id,title,message,allow_forward)
    values(
      v_sender,
      'Ticket #'||new.ticket_number||' resuelto',
      'Tu solicitud "'||new.title||'" fue marcada como '||v_label||'. Ingresa a Soporte para revisar la respuesta.',
      false
    ) returning id into v_notification;

    insert into public.notification_recipients(notification_id,recipient_id)
    values(v_notification,new.created_by)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists support_ticket_resolved_notification_v16 on public.support_tickets;
create trigger support_ticket_resolved_notification_v16
after update of status on public.support_tickets
for each row execute function public.notify_ticket_resolved_v16();

create or replace function public.replace_service_account(
  p_account_id uuid,p_new_email text,p_ticket_id uuid default null,
  p_reason text default 'Cambio por garantía'
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_user uuid:=(select auth.uid());
  v_old text;
  v_service text;
  v_new text:=lower(trim(p_new_email));
begin
  if not private.is_staff() then raise exception 'Solo administración o soporte pueden reemplazar cuentas.'; end if;

  select current_email,service into v_old,v_service
  from public.netflix_accounts where id=p_account_id for update;

  if v_old is null then raise exception 'La cuenta no existe.'; end if;
  if exists(
    select 1 from public.netflix_accounts
    where service=v_service and lower(current_email)=v_new and id<>p_account_id
  ) then raise exception 'El correo nuevo ya existe.'; end if;

  update public.netflix_accounts set current_email=v_new where id=p_account_id;

  insert into public.account_change_history(
    account_id,ticket_id,old_email,new_email,change_type,reason,performed_by,service
  ) values(
    p_account_id,p_ticket_id,v_old,v_new,'Cambio por garantía',
    coalesce(nullif(trim(p_reason),''),'Cambio por garantía'),
    v_user,v_service
  );

  if p_ticket_id is not null then
    insert into public.ticket_messages(ticket_id,author_id,message,is_system)
    values(
      p_ticket_id,v_user,
      'Garantía aplicada. Cuenta antigua: '||v_old||' · Cuenta nueva: '||v_new,
      true
    );

    update public.support_tickets set
      status='resolved',assigned_support_id=v_user,closed_at=now()
    where id=p_ticket_id;
  end if;

  return jsonb_build_object(
    'success',true,
    'message','Garantía aplicada. El cambio quedó registrado en el historial.',
    'old_email',v_old,'new_email',v_new
  );
end;
$$;

revoke all on function public.replace_service_account(uuid,text,uuid,text) from public,anon;
grant execute on function public.replace_service_account(uuid,text,uuid,text) to authenticated;

commit;

select 'BLOQUE 16 CREADO CORRECTAMENTE' as resultado;
