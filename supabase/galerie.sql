-- ============================================================
-- Close-Pro — Galerie de médias (photos / vidéos produits) partagée par l'équipe.
-- Compartiment Supabase Storage PUBLIC (lien direct nécessaire pour l'envoi WhatsApp).
-- Lecture + ajout : tout utilisateur connecté. Suppression : l'auteur du média ou le propriétaire.
-- Idempotent.
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('galerie', 'galerie', true, 52428800, array['image/*', 'video/*'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "galerie_lecture" on storage.objects;
create policy "galerie_lecture" on storage.objects
  for select to authenticated using (bucket_id = 'galerie');

drop policy if exists "galerie_ajout" on storage.objects;
create policy "galerie_ajout" on storage.objects
  for insert to authenticated with check (bucket_id = 'galerie');

drop policy if exists "galerie_suppression" on storage.objects;
create policy "galerie_suppression" on storage.objects
  for delete to authenticated
  using (bucket_id = 'galerie' and (owner_id = (select auth.uid())::text or public.is_owner()));
