begin;

-- ============================================================
-- BLOQUE 29 · CORRECCIONES LOTE 1
-- Centro Premium V6.9
--
-- Incluye:
-- - marca y logotipo configurables;
-- - catálogo administrable de servicios;
-- - fechas opcionales e independientes;
-- - cuentas completas por rama;
-- - reasignación jerárquica;
-- - validación Netflix sin proveedor externo visible;
-- - tickets validados por propietario exacto.
-- ============================================================

alter table public.account_assignments
  alter column starts_on drop not null;

alter table public.account_manager_terms
  alter column starts_on drop not null;

alter table public.service_action_requests
  add column if not exists support_ticket_id uuid
  references public.support_tickets(id)
  on delete set null;


-- ============================================================
-- 1. MARCA DEL PANEL
-- ============================================================
create table if not exists public.panel_settings(
  id smallint primary key default 1,
  brand_name text not null default 'Centro Premium',
  logo_url text,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint panel_settings_single_row check(id=1)
);

insert into public.panel_settings(id,brand_name)
values(1,'Centro Premium')
on conflict(id) do nothing;

alter table public.panel_settings enable row level security;

drop policy if exists panel_settings_read_v29
  on public.panel_settings;

create policy panel_settings_read_v29
on public.panel_settings
for select to authenticated
using(true);

revoke all on public.panel_settings from public,anon;
grant select on public.panel_settings to authenticated;


drop function if exists public.get_panel_settings_v29();

create function public.get_panel_settings_v29()
returns jsonb
language sql
security definer
set search_path=''
stable
as $$
  select jsonb_build_object(
    'brand_name',settings.brand_name,
    'logo_url',settings.logo_url,
    'updated_at',settings.updated_at
  )
  from public.panel_settings settings
  where settings.id=1;
$$;

revoke all on function public.get_panel_settings_v29()
from public,anon;

grant execute on function public.get_panel_settings_v29()
to authenticated;


drop function if exists
  public.admin_update_panel_settings_v29(text,text);

create function public.admin_update_panel_settings_v29(
  p_brand_name text,
  p_logo_url text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_name text := trim(coalesce(p_brand_name,''));
  v_logo text := nullif(trim(coalesce(p_logo_url,'')),'');
begin
  if not private.is_admin() then
    raise exception
      'Solo administración puede modificar la marca.';
  end if;

  if length(v_name)<3 then
    raise exception
      'El nombre debe tener al menos 3 caracteres.';
  end if;

  insert into public.panel_settings(
    id,brand_name,logo_url,updated_by,updated_at
  )
  values(
    1,v_name,v_logo,v_actor,now()
  )
  on conflict(id)
  do update set
    brand_name=excluded.brand_name,
    logo_url=excluded.logo_url,
    updated_by=excluded.updated_by,
    updated_at=now();

  return jsonb_build_object(
    'success',true,
    'brand_name',v_name,
    'logo_url',v_logo
  );
end;
$$;

revoke all
on function public.admin_update_panel_settings_v29(text,text)
from public,anon;

grant execute
on function public.admin_update_panel_settings_v29(text,text)
to authenticated;


-- ============================================================
-- 2. CATÁLOGO DE SERVICIOS
-- ============================================================
create table if not exists public.service_catalog(
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text not null default '',
  logo_url text,
  web_url text,
  mode text not null default 'coming_soon',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint service_catalog_mode_check
    check(mode in(
      'netflix_internal',
      'coming_soon',
      'external',
      'accounts_filter'
    ))
);

insert into public.service_catalog(
  slug,name,description,mode,is_active,sort_order
)
values
(
  'netflix',
  'Netflix',
  'Validación de cuentas, códigos y solicitudes Netflix.',
  'netflix_internal',
  true,
  10
),
(
  'spotify',
  'Spotify',
  'Estamos trabajando para darte este servicio.',
  'coming_soon',
  true,
  20
)
on conflict(slug)
do update set
  name=excluded.name,
  description=excluded.description,
  mode=excluded.mode,
  is_active=true;

alter table public.service_catalog enable row level security;

drop policy if exists service_catalog_read_v29
  on public.service_catalog;

create policy service_catalog_read_v29
on public.service_catalog
for select to authenticated
using(is_active or private.is_admin());

revoke all on public.service_catalog from public,anon;
grant select on public.service_catalog to authenticated;


drop function if exists public.list_service_catalog_v29();

create function public.list_service_catalog_v29()
returns table(
  id uuid,
  slug text,
  name text,
  description text,
  logo_url text,
  web_url text,
  mode text,
  is_active boolean,
  sort_order integer
)
language sql
security definer
set search_path=''
stable
as $$
  select
    service.id,
    service.slug,
    service.name,
    service.description,
    service.logo_url,
    service.web_url,
    service.mode,
    service.is_active,
    service.sort_order
  from public.service_catalog service
  where service.is_active
     or private.is_admin()
  order by service.sort_order,service.name;
$$;

revoke all on function public.list_service_catalog_v29()
from public,anon;

grant execute on function public.list_service_catalog_v29()
to authenticated;


drop function if exists public.admin_upsert_service_v29(
  uuid,text,text,text,text,text,boolean,integer
);

create function public.admin_upsert_service_v29(
  p_id uuid,
  p_slug text,
  p_name text,
  p_description text,
  p_logo_url text,
  p_web_url text,
  p_mode text,
  p_is_active boolean,
  p_sort_order integer
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_id uuid;
  v_slug text := lower(
    regexp_replace(trim(coalesce(p_slug,'')),'[^a-zA-Z0-9]+','-','g')
  );
  v_name text := trim(coalesce(p_name,''));
  v_mode text := lower(trim(coalesce(p_mode,'')));
begin
  if not private.is_admin() then
    raise exception
      'Solo administración puede gestionar servicios.';
  end if;

  if v_slug='' or v_name='' then
    raise exception 'Completa el nombre y el identificador.';
  end if;

  if v_mode not in(
    'netflix_internal',
    'coming_soon',
    'external',
    'accounts_filter'
  ) then
    raise exception 'Modo de servicio no válido.';
  end if;

  if p_id is null then
    insert into public.service_catalog(
      slug,name,description,logo_url,web_url,mode,
      is_active,sort_order,created_by,updated_at
    )
    values(
      v_slug,
      v_name,
      coalesce(p_description,''),
      nullif(trim(coalesce(p_logo_url,'')),''),
      nullif(trim(coalesce(p_web_url,'')),''),
      v_mode,
      coalesce(p_is_active,true),
      coalesce(p_sort_order,0),
      v_actor,
      now()
    )
    returning id into v_id;
  else
    update public.service_catalog
    set
      slug=v_slug,
      name=v_name,
      description=coalesce(p_description,''),
      logo_url=nullif(trim(coalesce(p_logo_url,'')),''),
      web_url=nullif(trim(coalesce(p_web_url,'')),''),
      mode=v_mode,
      is_active=coalesce(p_is_active,true),
      sort_order=coalesce(p_sort_order,0),
      updated_at=now()
    where id=p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'El servicio no existe.';
    end if;
  end if;

  return jsonb_build_object(
    'success',true,
    'id',v_id
  );
end;
$$;

revoke all on function public.admin_upsert_service_v29(
  uuid,text,text,text,text,text,text,boolean,integer
) from public,anon;

grant execute on function public.admin_upsert_service_v29(
  uuid,text,text,text,text,text,text,boolean,integer
) to authenticated;


drop function if exists public.admin_delete_service_v29(uuid);

create function public.admin_delete_service_v29(
  p_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
begin
  if not private.is_admin() then
    raise exception
      'Solo administración puede eliminar servicios.';
  end if;

  if exists(
    select 1
    from public.service_catalog
    where id=p_id
      and slug in('netflix','spotify')
  ) then
    raise exception
      'Netflix y Spotify no pueden eliminarse; puedes desactivarlos.';
  end if;

  delete from public.service_catalog
  where id=p_id;

  return jsonb_build_object(
    'success',true
  );
end;
$$;

revoke all on function public.admin_delete_service_v29(uuid)
from public,anon;

grant execute on function public.admin_delete_service_v29(uuid)
to authenticated;


-- ============================================================
-- 3. ESTRENOS PUBLICADOS
-- ============================================================
drop function if exists public.list_published_content_v29();

create function public.list_published_content_v29()
returns setof public.entertainment_content
language sql
security definer
set search_path=''
stable
as $$
  select content.*
  from public.entertainment_content content
  where content.status::text='published'
  order by content.display_order,content.created_at desc;
$$;

revoke all on function public.list_published_content_v29()
from public,anon;

grant execute on function public.list_published_content_v29()
to authenticated;


-- ============================================================
-- 4. LISTAS DE CUENTAS CON FECHA PERSONAL OPCIONAL
-- ============================================================
drop function if exists public.staff_list_service_accounts_v29();

create function public.staff_list_service_accounts_v29()
returns table(
  id uuid,
  service text,
  current_email text,
  country text,
  account_type text,
  status text,
  current_reseller_id uuid,
  current_client_id uuid,
  origin_distributor_id uuid,
  inventory_admin_id uuid,
  created_at timestamptz,
  reseller_full_name text,
  reseller_business_name text,
  reseller_parent_id uuid,
  parent_full_name text,
  parent_business_name text,
  origin_full_name text,
  origin_business_name text,
  assignment_id uuid,
  assignment_status text,
  seller_id uuid,
  buyer_reseller_id uuid,
  buyer_client_id uuid,
  starts_on date,
  duration_days integer,
  expires_on date,
  days_remaining integer,
  calculated_status text,
  assignment_created_at timestamptz
)
language sql
security definer
set search_path=''
stable
as $$
  select
    base.id,
    base.service,
    base.current_email,
    base.country,
    base.account_type,
    base.status,
    base.current_reseller_id,
    base.current_client_id,
    base.origin_distributor_id,
    base.inventory_admin_id,
    base.created_at,
    base.reseller_full_name,
    base.reseller_business_name,
    base.reseller_parent_id,
    base.parent_full_name,
    base.parent_business_name,
    base.origin_full_name,
    base.origin_business_name,
    base.assignment_id,
    base.assignment_status,
    base.seller_id,
    base.buyer_reseller_id,
    base.buyer_client_id,
    term.starts_on,
    30,
    case
      when term.starts_on is null then null
      else (term.starts_on+30)::date
    end,
    case
      when term.starts_on is null then null
      else greatest(
        ((term.starts_on+30)::date-current_date),
        0
      )::integer
    end,
    case
      when base.status='available' then 'available'
      when term.starts_on is null then 'pending_date'
      when (term.starts_on+30)::date<=current_date then 'expired'
      else 'active'
    end,
    base.assignment_created_at
  from public.staff_list_service_accounts_v28() base
  left join public.account_manager_terms term
    on term.account_id=base.id
   and term.manager_id=(select auth.uid());
$$;

revoke all on function public.staff_list_service_accounts_v29()
from public,anon;

grant execute on function public.staff_list_service_accounts_v29()
to authenticated;


drop function if exists public.reseller_list_branch_accounts_v29();

create function public.reseller_list_branch_accounts_v29()
returns table(
  id uuid,
  service text,
  current_email text,
  country text,
  account_type text,
  status text,
  current_reseller_id uuid,
  current_client_id uuid,
  origin_distributor_id uuid,
  created_at timestamptz,
  reseller_full_name text,
  reseller_business_name text,
  reseller_parent_id uuid,
  parent_full_name text,
  parent_business_name text,
  origin_full_name text,
  origin_business_name text,
  assignment_id uuid,
  assignment_status text,
  seller_id uuid,
  buyer_reseller_id uuid,
  buyer_client_id uuid,
  starts_on date,
  duration_days integer,
  expires_on date,
  days_remaining integer,
  calculated_status text,
  assignment_created_at timestamptz
)
language sql
security definer
set search_path=''
stable
as $$
  select
    base.id,
    base.service,
    base.current_email,
    base.country,
    base.account_type,
    base.status,
    base.current_reseller_id,
    base.current_client_id,
    base.origin_distributor_id,
    base.created_at,
    base.reseller_full_name,
    base.reseller_business_name,
    base.reseller_parent_id,
    base.parent_full_name,
    base.parent_business_name,
    base.origin_full_name,
    base.origin_business_name,
    base.assignment_id,
    base.assignment_status,
    base.seller_id,
    base.buyer_reseller_id,
    base.buyer_client_id,
    term.starts_on,
    30,
    case
      when term.starts_on is null then null
      else (term.starts_on+30)::date
    end,
    case
      when term.starts_on is null then null
      else greatest(
        ((term.starts_on+30)::date-current_date),
        0
      )::integer
    end,
    case
      when term.starts_on is null then 'pending_date'
      when (term.starts_on+30)::date<=current_date then 'expired'
      else 'active'
    end,
    base.assignment_created_at
  from public.reseller_list_branch_accounts_v28() base
  left join public.account_manager_terms term
    on term.account_id=base.id
   and term.manager_id=(select auth.uid());
$$;

revoke all on function public.reseller_list_branch_accounts_v29()
from public,anon;

grant execute on function public.reseller_list_branch_accounts_v29()
to authenticated;


drop function if exists
  public.staff_list_user_branch_accounts_v29(uuid);

create function public.staff_list_user_branch_accounts_v29(
  p_distributor_id uuid
)
returns table(
  id uuid,
  service text,
  current_email text,
  country text,
  account_type text,
  status text,
  current_reseller_id uuid,
  origin_distributor_id uuid,
  created_at timestamptz,
  reseller_full_name text,
  reseller_business_name text,
  reseller_parent_id uuid,
  parent_full_name text,
  parent_business_name text,
  origin_full_name text,
  origin_business_name text,
  starts_on date,
  expires_on date,
  days_remaining integer,
  calculated_status text
)
language sql
security definer
set search_path=''
stable
as $$
  select
    base.id,
    base.service,
    base.current_email,
    base.country,
    base.account_type,
    base.status,
    base.current_reseller_id,
    base.origin_distributor_id,
    base.created_at,
    base.reseller_full_name,
    base.reseller_business_name,
    base.reseller_parent_id,
    base.parent_full_name,
    base.parent_business_name,
    base.origin_full_name,
    base.origin_business_name,
    term.starts_on,
    case
      when term.starts_on is null then null
      else (term.starts_on+30)::date
    end,
    case
      when term.starts_on is null then null
      else greatest(
        ((term.starts_on+30)::date-current_date),
        0
      )::integer
    end,
    case
      when term.starts_on is null then 'pending_date'
      when (term.starts_on+30)::date<=current_date then 'expired'
      else 'active'
    end
  from public.staff_list_user_branch_accounts_v28(
    p_distributor_id
  ) base
  left join public.account_manager_terms term
    on term.account_id=base.id
   and term.manager_id=(select auth.uid());
$$;

revoke all
on function public.staff_list_user_branch_accounts_v29(uuid)
from public,anon;

grant execute
on function public.staff_list_user_branch_accounts_v29(uuid)
to authenticated;


drop function if exists
  public.reseller_list_user_branch_accounts_v29(uuid);

create function public.reseller_list_user_branch_accounts_v29(
  p_distributor_id uuid
)
returns table(
  id uuid,
  service text,
  current_email text,
  country text,
  account_type text,
  status text,
  current_reseller_id uuid,
  origin_distributor_id uuid,
  created_at timestamptz,
  reseller_full_name text,
  reseller_business_name text,
  reseller_parent_id uuid,
  parent_full_name text,
  parent_business_name text,
  starts_on date,
  expires_on date,
  days_remaining integer,
  calculated_status text
)
language sql
security definer
set search_path=''
stable
as $$
  select
    base.id,
    base.service,
    base.current_email,
    base.country,
    base.account_type,
    base.status,
    base.current_reseller_id,
    base.origin_distributor_id,
    base.created_at,
    base.reseller_full_name,
    base.reseller_business_name,
    base.reseller_parent_id,
    base.parent_full_name,
    base.parent_business_name,
    term.starts_on,
    case
      when term.starts_on is null then null
      else (term.starts_on+30)::date
    end,
    case
      when term.starts_on is null then null
      else greatest(
        ((term.starts_on+30)::date-current_date),
        0
      )::integer
    end,
    case
      when term.starts_on is null then 'pending_date'
      when (term.starts_on+30)::date<=current_date then 'expired'
      else 'active'
    end
  from public.reseller_list_user_branch_accounts_v28(
    p_distributor_id
  ) base
  left join public.account_manager_terms term
    on term.account_id=base.id
   and term.manager_id=(select auth.uid());
$$;

revoke all
on function public.reseller_list_user_branch_accounts_v29(uuid)
from public,anon;

grant execute
on function public.reseller_list_user_branch_accounts_v29(uuid)
to authenticated;


-- ============================================================
-- 5. FECHA PERSONAL OPCIONAL
-- ============================================================
drop function if exists
  public.update_my_account_term_v29(uuid,date);

create function public.update_my_account_term_v29(
  p_account_id uuid,
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
  v_allowed boolean := false;
begin
  if v_actor is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  select profile.role::text
  into v_role
  from public.profiles profile
  where profile.id=v_actor
    and profile.status::text='active';

  if v_role='admin' then
    v_allowed := exists(
      select 1
      from public.netflix_accounts
      where id=p_account_id
    );
  elsif v_role='reseller' then
    v_allowed := exists(
      with recursive branch as(
        select
          profile.id,
          array[profile.id]::uuid[] path
        from public.profiles profile
        where profile.id=v_actor

        union all

        select
          child.id,
          branch.path||child.id
        from public.profiles child
        join branch on child.parent_id=branch.id
        where child.role::text='reseller'
          and child.status::text='active'
          and not child.id=any(branch.path)
      )
      select 1
      from public.netflix_accounts account
      join branch
        on branch.id=account.current_reseller_id
      where account.id=p_account_id
    );
  end if;

  if not v_allowed then
    raise exception
      'No tienes permiso para gestionar la fecha de esta cuenta.';
  end if;

  if p_starts_on is null then
    delete from public.account_manager_terms
    where account_id=p_account_id
      and manager_id=v_actor;

    return jsonb_build_object(
      'success',true,
      'message','La cuenta quedó sin fecha para tu usuario.'
    );
  end if;

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

  return jsonb_build_object(
    'success',true,
    'message','Tu fecha fue actualizada sin modificar a otros usuarios.'
  );
end;
$$;

revoke all
on function public.update_my_account_term_v29(uuid,date)
from public,anon;

grant execute
on function public.update_my_account_term_v29(uuid,date)
to authenticated;


drop function if exists
  public.bulk_update_my_account_terms_v29(text,text[],date);

create function public.bulk_update_my_account_terms_v29(
  p_service text,
  p_account_emails text[],
  p_starts_on date
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_email text;
  v_account_id uuid;
  v_updated integer := 0;
  v_not_found integer := 0;
  v_not_allowed integer := 0;
begin
  foreach v_email in array p_account_emails loop
    select account.id
    into v_account_id
    from public.netflix_accounts account
    where account.service::text=lower(trim(p_service))
      and lower(account.current_email)=lower(trim(v_email))
    limit 1;

    if v_account_id is null then
      v_not_found := v_not_found+1;
      continue;
    end if;

    begin
      perform public.update_my_account_term_v29(
        v_account_id,p_starts_on
      );
      v_updated := v_updated+1;
    exception
      when others then
        v_not_allowed := v_not_allowed+1;
    end;
  end loop;

  return jsonb_build_object(
    'success',true,
    'updated',v_updated,
    'not_found',v_not_found,
    'not_allowed',v_not_allowed,
    'invalid',0
  );
end;
$$;

revoke all
on function public.bulk_update_my_account_terms_v29(
  text,text[],date
)
from public,anon;

grant execute
on function public.bulk_update_my_account_terms_v29(
  text,text[],date
)
to authenticated;


-- ============================================================
-- 6. REASIGNACIÓN JERÁRQUICA Y FECHA OPCIONAL
-- ============================================================
drop function if exists
  public.reassign_account_hierarchical_v29(uuid,uuid,date);

create function public.reassign_account_hierarchical_v29(
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

  select *
  into v_account
  from public.netflix_accounts
  where id=p_account_id
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

      union all

      select
        child.id,
        branch.path||child.id
      from public.profiles child
      join branch on child.parent_id=branch.id
      where child.role::text='reseller'
        and child.status::text='active'
        and not child.id=any(branch.path)
    )
    select
      exists(
        select 1 from branch
        where id=v_account.current_reseller_id
      ),
      exists(
        select 1 from branch
        where id=p_owner_id
      )
    into v_actor_allowed,v_owner_allowed;
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
      account_id,seller_id,buyer_reseller_id,
      starts_on,duration_days,status,created_by
    )
    values(
      p_account_id,v_actor,p_owner_id,
      p_starts_on,30,'active',v_actor
    );
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
  end if;

  update public.netflix_accounts
  set
    current_reseller_id=p_owner_id,
    current_client_id=null,
    origin_distributor_id=coalesce(
      origin_distributor_id,p_owner_id
    ),
    status=case
      when p_owner_id is null
        then 'available'::public.account_status
      else 'assigned'::public.account_status
    end
  where id=p_account_id;

  return jsonb_build_object(
    'success',true,
    'message','Propietario actualizado sin modificar fechas ajenas.'
  );
end;
$$;

revoke all
on function public.reassign_account_hierarchical_v29(
  uuid,uuid,date
)
from public,anon;

grant execute
on function public.reassign_account_hierarchical_v29(
  uuid,uuid,date
)
to authenticated;


drop function if exists
  public.bulk_assign_service_accounts_v29(
    text,text[],uuid,date
  );

create function public.bulk_assign_service_accounts_v29(
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
    select *
    into v_account
    from public.netflix_accounts account
    where account.service::text=lower(trim(p_service))
      and lower(account.current_email)=lower(trim(v_email))
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
      account_id,seller_id,buyer_reseller_id,
      starts_on,duration_days,status,created_by
    )
    values(
      v_account.id,v_actor,p_distributor_id,
      p_starts_on,30,'active',v_actor
    );

    if p_starts_on is not null then
      insert into public.account_manager_terms(
        account_id,manager_id,starts_on,duration_days,
        created_at,updated_at
      )
      values(
        v_account.id,v_actor,p_starts_on,30,now(),now()
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
        origin_distributor_id,p_distributor_id
      ),
      inventory_admin_id=coalesce(
        inventory_admin_id,v_actor
      ),
      status='assigned'::public.account_status
    where id=v_account.id;

    v_assigned := v_assigned+1;
  end loop;

  return jsonb_build_object(
    'success',true,
    'assigned',v_assigned,
    'unavailable',v_unavailable,
    'not_found',v_not_found
  );
end;
$$;

revoke all
on function public.bulk_assign_service_accounts_v29(
  text,text[],uuid,date
)
from public,anon;

grant execute
on function public.bulk_assign_service_accounts_v29(
  text,text[],uuid,date
)
to authenticated;


drop function if exists public.admin_edit_service_account_v29(
  uuid,text,text,text,uuid,date
);

create function public.admin_edit_service_account_v29(
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
  v_old_owner uuid;
begin
  if not private.is_admin() then
    raise exception
      'Solo administración puede editar cuentas.';
  end if;

  select account.current_reseller_id
  into v_old_owner
  from public.netflix_accounts account
  where account.id=p_account_id
  for update;

  if not found then
    raise exception 'La cuenta no existe.';
  end if;

  update public.netflix_accounts
  set
    service=lower(trim(p_service)),
    account_type=coalesce(
      nullif(trim(p_account_type),''),
      'Cuenta completa'
    ),
    country=coalesce(
      nullif(trim(p_country),''),
      'Sin configurar'
    )
  where id=p_account_id;

  if p_owner_id is distinct from v_old_owner then
    perform public.reassign_account_hierarchical_v29(
      p_account_id,p_owner_id,p_starts_on
    );
  elsif p_starts_on is not null then
    perform public.update_my_account_term_v29(
      p_account_id,p_starts_on
    );
  end if;

  return jsonb_build_object(
    'success',true,
    'message','Cuenta actualizada correctamente.'
  );
end;
$$;

revoke all
on function public.admin_edit_service_account_v29(
  uuid,text,text,text,uuid,date
)
from public,anon;

grant execute
on function public.admin_edit_service_account_v29(
  uuid,text,text,text,uuid,date
)
to authenticated;


-- ============================================================
-- 7. NETFLIX PROPIO: VALIDACIÓN POR RAMA
-- ============================================================
drop function if exists public.validate_netflix_access_v29(text);

create function public.validate_netflix_access_v29(
  p_email text
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
  v_owner_name text;
  v_parent_name text;
begin
  if v_actor is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  select profile.role::text
  into v_role
  from public.profiles profile
  where profile.id=v_actor
    and profile.status::text='active';

  select account.*
  into v_account
  from public.netflix_accounts account
  where account.service::text='netflix'
    and lower(account.current_email)=lower(trim(p_email))
    and account.current_client_id is null
    and account.status::text='assigned'
    and (
      v_role in('admin','support')
      or exists(
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
          join branch on child.parent_id=branch.id
          where child.role::text='reseller'
            and child.status::text='active'
            and not child.id=any(branch.path)
        )
        select 1
        from branch
        where branch.id=account.current_reseller_id
      )
    )
  limit 1;

  if not found then
    raise exception
      'El correo no está asociado a tu usuario ni a un subordinado de tu rama.';
  end if;

  select
    coalesce(
      nullif(trim(owner.business_name),''),
      nullif(trim(owner.full_name),''),
      owner.email
    ),
    coalesce(
      nullif(trim(parent.business_name),''),
      nullif(trim(parent.full_name),''),
      parent.email
    )
  into v_owner_name,v_parent_name
  from public.profiles owner
  left join public.profiles parent
    on parent.id=owner.parent_id
  where owner.id=v_account.current_reseller_id;

  return jsonb_build_object(
    'allowed',true,
    'account_id',v_account.id,
    'email',v_account.current_email,
    'country',v_account.country,
    'owner_name',v_owner_name,
    'parent_name',v_parent_name
  );
end;
$$;

revoke all on function public.validate_netflix_access_v29(text)
from public,anon;

grant execute on function public.validate_netflix_access_v29(text)
to authenticated;


drop function if exists
  public.create_netflix_action_request_v29(text,text);

create function public.create_netflix_action_request_v29(
  p_email text,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_validation jsonb;
  v_account_id uuid;
  v_action text := lower(trim(p_action));
  v_label text;
  v_ticket_id uuid;
  v_request_id uuid;
  v_email text;
  v_country text;
begin
  if v_action not in(
    'actualizar_hogar',
    'inicio_sesion_codigo',
    'restablecer_contrasena',
    'codigo_6_digitos',
    'acceso_temporal'
  ) then
    raise exception 'Selecciona una acción válida.';
  end if;

  select public.validate_netflix_access_v29(p_email)
  into v_validation;

  v_account_id := (v_validation->>'account_id')::uuid;
  v_email := v_validation->>'email';
  v_country := v_validation->>'country';

  v_label := case v_action
    when 'actualizar_hogar'
      then 'Actualizar hogar'
    when 'inicio_sesion_codigo'
      then 'Inicio de sesión por código'
    when 'restablecer_contrasena'
      then 'Restablecer contraseña'
    when 'codigo_6_digitos'
      then 'Código de 6 dígitos'
    else 'Acceso temporal'
  end;

  insert into public.support_tickets(
    created_by,account_id,title,category,description,status,
    account_email_snapshot,service,reported_email,
    assigned_support_id,closed_at
  )
  values(
    v_actor,
    v_account_id,
    'Netflix · '||v_label,
    v_label,
    'Solicitud Netflix: '||v_label||
    E'\nCuenta: '||v_email||
    E'\nPaís: '||coalesce(v_country,'Sin configurar'),
    'open'::public.ticket_status,
    v_email,
    'netflix',
    v_email,
    null,
    null
  )
  returning id into v_ticket_id;

  insert into public.ticket_messages(
    ticket_id,author_id,message,is_system
  )
  values(
    v_ticket_id,
    v_actor,
    'Solicitud Netflix: '||v_label||
    E'\nCuenta: '||v_email,
    false
  );

  insert into public.service_action_requests(
    requested_by,account_id,service,action_type,
    account_email_snapshot,country_snapshot,status,
    support_ticket_id
  )
  values(
    v_actor,v_account_id,'netflix',v_action,
    v_email,v_country,'authorized',v_ticket_id
  )
  returning id into v_request_id;

  return jsonb_build_object(
    'success',true,
    'request_id',v_request_id,
    'ticket_id',v_ticket_id,
    'action_label',v_label,
    'email',v_email,
    'message',
      'Solicitud registrada para Administración y Soporte.'
  );
end;
$$;

revoke all
on function public.create_netflix_action_request_v29(text,text)
from public,anon;

grant execute
on function public.create_netflix_action_request_v29(text,text)
to authenticated;


-- ============================================================
-- 8. TICKETS: CORREO EXACTAMENTE A NOMBRE DEL CREADOR
-- ============================================================
drop function if exists public.create_support_ticket_v29(
  text,text,text,text,text
);

create function public.create_support_ticket_v29(
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
  v_actor uuid := (select auth.uid());
  v_role text;
  v_account_id uuid;
  v_email text := lower(trim(p_reported_email));
  v_service text := lower(trim(p_service));
  v_ticket_id uuid;
begin
  if v_actor is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  select profile.role::text
  into v_role
  from public.profiles profile
  where profile.id=v_actor
    and profile.status::text='active';

  select account.id
  into v_account_id
  from public.netflix_accounts account
  where account.service::text=v_service
    and lower(account.current_email)=v_email
    and (
      v_role in('admin','support')
      or account.current_reseller_id=v_actor
    )
  limit 1;

  if v_account_id is null then
    if v_role='reseller' then
      raise exception
        'El correo debe estar exactamente a nombre de tu usuario.';
    end if;

    raise exception
      'No se encontró una cuenta con ese correo y plataforma.';
  end if;

  insert into public.support_tickets(
    created_by,account_id,title,category,description,status,
    account_email_snapshot,service,reported_email,
    assigned_support_id,closed_at
  )
  values(
    v_actor,
    v_account_id,
    trim(p_title),
    trim(p_category),
    coalesce(
      nullif(trim(p_description),''),
      trim(p_title)
    ),
    'open'::public.ticket_status,
    v_email,
    v_service,
    v_email,
    null,
    null
  )
  returning id into v_ticket_id;

  insert into public.ticket_messages(
    ticket_id,author_id,message,is_system
  )
  values(
    v_ticket_id,
    v_actor,
    coalesce(
      nullif(trim(p_description),''),
      trim(p_title)
    ),
    false
  );

  return jsonb_build_object(
    'success',true,
    'ticket_id',v_ticket_id,
    'message','Ticket creado correctamente.'
  );
end;
$$;

revoke all
on function public.create_support_ticket_v29(
  text,text,text,text,text
)
from public,anon;

grant execute
on function public.create_support_ticket_v29(
  text,text,text,text,text
)
to authenticated;


commit;

select pg_notify('pgrst','reload schema');

select
  'BLOQUE 29 CREADO CORRECTAMENTE'
  as resultado;
