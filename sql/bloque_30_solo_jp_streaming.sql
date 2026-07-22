begin;

-- Eliminar funciones anteriores de selección de proveedor.
drop function if exists public.staff_list_account_tools_v29();
drop function if exists public.bulk_add_service_accounts_v29(
  text,text,text,text,text[]
);
drop function if exists public.admin_edit_service_account_v29(
  uuid,text,text,text,text,uuid,date
);
drop function if exists public.admin_bulk_update_netflix_tool_v29(
  text[],text
);
drop function if exists public.authorize_netflix_access_v29(text);

alter table public.netflix_accounts
  drop constraint if exists netflix_accounts_tool_v29_check;

drop index if exists public.netflix_accounts_tool_v29_idx;

alter table public.netflix_accounts
  drop column if exists netflix_tool;

alter table public.service_action_requests
  drop column if exists tool_provider_snapshot;


create or replace function public.bulk_add_service_accounts_v30(
  p_service text,
  p_account_type text,
  p_country text,
  p_emails text[]
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_service text := lower(trim(coalesce(p_service,'')));
  v_country text := coalesce(
    nullif(trim(p_country),''),
    'Sin configurar'
  );
  v_raw text;
  v_email text;
  v_inserted integer := 0;
  v_duplicates integer := 0;
  v_invalid integer := 0;
begin
  if not private.is_admin() then
    raise exception
      'Solo el administrador puede añadir cuentas.';
  end if;

  if v_service not in('netflix','spotify') then
    raise exception 'Servicio no válido.';
  end if;

  foreach v_raw in array p_emails loop
    v_email := lower(trim(coalesce(v_raw,'')));

    if v_email=''
       or v_email
          !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    then
      v_invalid := v_invalid+1;
      continue;
    end if;

    if exists(
      select 1
      from public.netflix_accounts account
      where account.service::text=v_service
        and lower(account.current_email)=v_email
    ) then
      v_duplicates := v_duplicates+1;
      continue;
    end if;

    insert into public.netflix_accounts(
      service,
      current_email,
      account_type,
      country,
      status,
      created_by,
      inventory_admin_id
    )
    values(
      v_service,
      v_email,
      coalesce(
        nullif(trim(p_account_type),''),
        'Cuenta completa'
      ),
      v_country,
      'available',
      v_actor,
      v_actor
    );

    v_inserted := v_inserted+1;
  end loop;

  return jsonb_build_object(
    'success',true,
    'inserted',v_inserted,
    'duplicates',v_duplicates,
    'invalid',v_invalid
  );
end;
$$;

revoke all
on function public.bulk_add_service_accounts_v30(
  text,text,text,text[]
)
from public,anon;

grant execute
on function public.bulk_add_service_accounts_v30(
  text,text,text,text[]
)
to authenticated;


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
  v_result jsonb;
begin
  if not private.is_admin() then
    raise exception
      'Solo el administrador puede editar esta información.';
  end if;

  v_result := public.admin_edit_service_account_v28(
    p_account_id,
    p_service,
    p_account_type,
    p_country,
    p_owner_id,
    p_starts_on
  );

  return coalesce(v_result,'{}'::jsonb)
    ||jsonb_build_object(
      'message','Cuenta actualizada correctamente.'
    );
end;
$$;

revoke all
on function public.admin_edit_service_account_v30(
  uuid,text,text,text,uuid,date
)
from public,anon;

grant execute
on function public.admin_edit_service_account_v30(
  uuid,text,text,text,uuid,date
)
to authenticated;


create or replace function public.authorize_netflix_access_v30(
  p_email text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid := (select auth.uid());
  v_account public.netflix_accounts;
  v_request_id uuid;
begin
  if v_user is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  select *
  into v_account
  from public.netflix_accounts account
  where account.service::text='netflix'
    and lower(account.current_email)=lower(trim(p_email))
    and account.current_reseller_id=v_user
    and account.current_client_id is null
    and account.status::text='assigned'
  for share;

  if not found then
    raise exception
      'La cuenta no está actualmente a tu nombre.';
  end if;

  if exists(
    select 1
    from public.service_action_requests request
    where request.requested_by=v_user
      and request.account_id=v_account.id
      and request.action_type='abrir_jp_streaming'
      and request.created_at>now()-interval '10 seconds'
  ) then
    raise exception
      'Espera unos segundos antes de volver a abrir esta cuenta.';
  end if;

  insert into public.service_action_requests(
    requested_by,
    account_id,
    service,
    action_type,
    account_email_snapshot,
    country_snapshot,
    status
  )
  values(
    v_user,
    v_account.id,
    'netflix',
    'abrir_jp_streaming',
    v_account.current_email,
    v_account.country,
    'authorized'
  )
  returning id into v_request_id;

  return jsonb_build_object(
    'allowed',true,
    'request_id',v_request_id,
    'email',v_account.current_email,
    'country',v_account.country,
    'vpn_message',
      'Si vas a restablecer la contraseña, activa un VPN del país indicado antes de continuar.'
  );
end;
$$;

revoke all
on function public.authorize_netflix_access_v30(text)
from public,anon;

grant execute
on function public.authorize_netflix_access_v30(text)
to authenticated;

commit;

select 'BLOQUE 30 CREADO CORRECTAMENTE' as resultado;
