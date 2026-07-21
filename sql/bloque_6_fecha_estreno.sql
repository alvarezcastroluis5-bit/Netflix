-- =========================================================
-- BLOQUE 6: FECHA EXACTA DE ESTRENO
-- Ejecutar una sola vez después del Bloque 5.
-- =========================================================

alter table public.entertainment_content
  add column if not exists release_date date;

comment on column public.entertainment_content.release_date
is 'Fecha exacta de estreno del contenido publicado.';

grant select, insert, update, delete
on public.entertainment_content
to authenticated;

select 'BLOQUE 6 CREADO CORRECTAMENTE' as resultado;
