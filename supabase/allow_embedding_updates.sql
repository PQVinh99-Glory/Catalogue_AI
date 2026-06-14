alter table public.product_images
  alter column embedding drop not null;

drop policy if exists "Users can update product image embeddings" on public.product_images;
create policy "Users can update product image embeddings"
  on public.product_images for update
  using (
    exists (
      select 1
      from public.products p
      where p.id = product_images.product_id
        and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.products p
      where p.id = product_images.product_id
        and p.user_id = auth.uid()
    )
  );
