-- Bucket transitorio para "ver" PDFs generados en el visor nativo del sistema
-- (en la PWA de iOS, el visor in-app). Los PDFs generados son blobs en memoria y
-- iOS bloquea navegar a blob:/data: en standalone; subirlos a Storage les da una
-- URL https real que sí abre el visor nativo.
--
-- Cada usuario sube a su propia carpeta {auth.uid()}/preview.pdf y se sobrescribe
-- (upsert) en cada vista, así no se acumulan archivos. Es efímero: NO entra en
-- backup (los binarios de Storage nunca entran en el backup JSON).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('generated-pdfs', 'generated-pdfs', false, 20971520, array['application/pdf'])
on conflict (id) do nothing;

drop policy if exists "generated_pdfs_user_all" on storage.objects;
create policy "generated_pdfs_user_all" on storage.objects
  for all
  using (
    bucket_id = 'generated-pdfs'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = (auth.uid())::text
  )
  with check (
    bucket_id = 'generated-pdfs'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = (auth.uid())::text
  );
