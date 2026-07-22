-- DIAGNÓSTICO DE ACCESO DE UN DISTRIBUIDOR
-- Sustituye el correo de ejemplo antes de ejecutar.

select
  profile.id,
  profile.email,
  profile.full_name,
  profile.business_name,
  profile.role::text as role,
  profile.status::text as status,
  profile.parent_id,
  parent.email as superior_email,
  parent.full_name as superior_nombre,
  parent.business_name as superior_comercial,
  parent.whatsapp as superior_whatsapp,
  parent.status::text as superior_status
from public.profiles profile
left join public.profiles parent
  on parent.id=profile.parent_id
where lower(profile.email)=lower(
  'elcolomb@strshopping.com'
);
