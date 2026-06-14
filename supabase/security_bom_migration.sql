create extension if not exists vector;

alter table public.products
  add column if not exists bom_code text;

alter table public.product_images
  add column if not exists storage_path text;

alter table public.product_images
  alter column image_url drop not null;

alter table public.product_images
  alter column embedding drop not null;

create index if not exists products_bom_code_idx
  on public.products(bom_code);

create index if not exists product_images_storage_path_idx
  on public.product_images(storage_path);

create index if not exists product_images_embedding_idx
  on public.product_images
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

drop function if exists public.match_images(vector, double precision, integer);
drop function if exists public.match_images(vector(512), double precision, integer);
drop function if exists public.match_images(vector, float, int);
drop function if exists public.match_images(vector(512), float, int);

create or replace function public.match_images(
  query_embedding vector(512),
  match_threshold double precision,
  match_count integer
)
returns table (
  id uuid,
  component_code text,
  bom_code text,
  feature text,
  side text,
  user_id uuid,
  image_url text,
  storage_path text,
  similarity double precision
)
language sql
stable
as $$
  with ranked_images as (
    select
      p.id,
      p.component_code,
      p.bom_code,
      p.feature,
      p.side,
      p.user_id,
      pi.image_url,
      pi.storage_path,
      1 - (pi.embedding <=> query_embedding) as similarity,
      row_number() over (
        partition by p.id
        order by pi.embedding <=> query_embedding
      ) as image_rank
    from public.product_images pi
    join public.products p on p.id = pi.product_id
    where p.user_id = auth.uid()
      and pi.embedding is not null
      and 1 - (pi.embedding <=> query_embedding) >= match_threshold
  )
  select
    ranked_images.id,
    ranked_images.component_code,
    ranked_images.bom_code,
    ranked_images.feature,
    ranked_images.side,
    ranked_images.user_id,
    ranked_images.image_url,
    ranked_images.storage_path,
    ranked_images.similarity
  from ranked_images
  where ranked_images.image_rank = 1
  order by ranked_images.similarity desc
  limit match_count;
$$;

alter table public.products enable row level security;
alter table public.product_images enable row level security;

drop policy if exists "Users can read their products" on public.products;
create policy "Users can read their products"
  on public.products for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their products" on public.products;
create policy "Users can insert their products"
  on public.products for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their products" on public.products;
create policy "Users can update their products"
  on public.products for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their products" on public.products;
create policy "Users can delete their products"
  on public.products for delete
  using (auth.uid() = user_id);

drop policy if exists "Users can read product images" on public.product_images;
create policy "Users can read product images"
  on public.product_images for select
  using (
    exists (
      select 1
      from public.products p
      where p.id = product_images.product_id
        and p.user_id = auth.uid()
    )
  );

drop policy if exists "Users can insert product images" on public.product_images;
create policy "Users can insert product images"
  on public.product_images for insert
  with check (
    exists (
      select 1
      from public.products p
      where p.id = product_images.product_id
        and p.user_id = auth.uid()
    )
  );

drop policy if exists "Users can delete product images" on public.product_images;
create policy "Users can delete product images"
  on public.product_images for delete
  using (
    exists (
      select 1
      from public.products p
      where p.id = product_images.product_id
        and p.user_id = auth.uid()
    )
  );

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

update storage.buckets
set public = false
where id = 'product-images';

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', false)
on conflict (id) do update set public = false;

drop policy if exists "Users can read their product image objects" on storage.objects;
create policy "Users can read their product image objects"
  on storage.objects for select
  using (
    bucket_id = 'product-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can upload their product image objects" on storage.objects;
create policy "Users can upload their product image objects"
  on storage.objects for insert
  with check (
    bucket_id = 'product-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can delete their product image objects" on storage.objects;
create policy "Users can delete their product image objects"
  on storage.objects for delete
  using (
    bucket_id = 'product-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
