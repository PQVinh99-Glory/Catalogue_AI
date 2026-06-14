alter table public.product_images
  alter column embedding drop not null;

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
