begin;

drop function if exists public.authorize_netflix_access_v35(text);

create function public.authorize_netflix_access_v35(
  p_email text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid := (select auth.uid());
  v_role text;
  v_account public.netflix_accounts;
  v_owner_name text;
  v_owner_parent_name text;
  v_access_scope text;
  v_request_id uuid;
begin
  if v_user is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  select profile.role::text
  into v_role
  from public.profiles profile
  where profile.id=v_user
    and profile.status::text='active';

  if v_role<>'reseller' then
    raise exception
      'Solo los distribuidores activos pueden utilizar esta herramienta.';
  end if;

  select account.*
  into v_account
  from public.netflix_accounts account
  where account.service::text='netflix'
    and lower(account.current_email)=lower(trim(p_email))
    and account.current_client_id is null
    and account.status::text='assigned'
    and exists(
      with recursive branch as(
        select
          profile.id,
          array[profile.id]::uuid[] as path
        from public.profiles profile
        where profile.id=v_user
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
      select 1
      from branch
      where branch.id=account.current_reseller_id
    )
  for share;

  if not found then
    raise exception
      'La cuenta no está asignada a ti ni a un subordinado de tu rama.';
  end if;

  select
    coalesce(
      nullif(trim(owner.business_name),''),
      nullif(trim(owner.full_name),''),
      owner.email,
      'Distribuidor'
    ),
    coalesce(
      nullif(trim(parent.business_name),''),
      nullif(trim(parent.full_name),''),
      parent.email,
      'Sin superior'
    )
  into
    v_owner_name,
    v_owner_parent_name
  from public.profiles owner
  left join public.profiles parent
    on parent.id=owner.parent_id
  where owner.id=v_account.current_reseller_id;

  v_access_scope := case
    when v_account.current_reseller_id=v_user
      then 'own'
    else 'subordinate'
  end;

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
    'owner_id',v_account.current_reseller_id,
    'owner_name',v_owner_name,
    'owner_parent_name',v_owner_parent_name,
    'access_scope',v_access_scope,
    'vpn_message',
      'Si vas a restablecer la contraseña, activa un VPN del país indicado antes de continuar.'
  );
end;
$$;

revoke all
on function public.authorize_netflix_access_v35(text)
from public,anon;

grant execute
on function public.authorize_netflix_access_v35(text)
to authenticated;

commit;

select pg_notify('pgrst','reload schema');

select
  'BLOQUE 35 CREADO CORRECTAMENTE: ACCESO NETFLIX POR RAMA'
  as resultado;
