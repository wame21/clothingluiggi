-- Boutique ERP · 4/4 · Almacenamiento de logotipos
-- Bucket público `logos`. Ruta: <business_id>/<archivo>. Solo el dueño de ese negocio puede subir,
-- reemplazar o borrar dentro de su carpeta; la URL pública se guarda en profile.logoUrl.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logos', 'logos', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Listar y reemplazar (upsert) necesitan lectura: cada quien ve solo la carpeta de su negocio
create policy "equipo lee logos de su negocio" on storage.objects
  for select to authenticated
  using (bucket_id = 'logos' and (storage.foldername(name))[1] = (select public.current_business_id())::text);

create policy "dueño sube logos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'logos' and public.is_owner() and (storage.foldername(name))[1] = (select public.current_business_id())::text);

create policy "dueño reemplaza logos" on storage.objects
  for update to authenticated
  using (bucket_id = 'logos' and public.is_owner() and (storage.foldername(name))[1] = (select public.current_business_id())::text)
  with check (bucket_id = 'logos' and public.is_owner() and (storage.foldername(name))[1] = (select public.current_business_id())::text);

create policy "dueño borra logos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'logos' and public.is_owner() and (storage.foldername(name))[1] = (select public.current_business_id())::text);
