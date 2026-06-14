select
  id,
  name,
  public as is_public
from storage.buckets
where id = 'product-images';

select
  table_name,
  row_security
from information_schema.tables
where table_schema = 'public'
  and table_name in ('products', 'product_images');

select
  column_name,
  data_type,
  udt_name,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in ('products', 'product_images')
  and column_name in ('bom_code', 'storage_path', 'embedding', 'image_url');

select
  policyname,
  tablename,
  cmd
from pg_policies
where schemaname in ('public', 'storage')
  and tablename in ('products', 'product_images', 'objects')
order by tablename, policyname;

select
  proname,
  pg_get_function_arguments(oid) as arguments,
  pg_get_function_result(oid) as result
from pg_proc
where proname = 'match_images';
