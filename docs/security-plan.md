# Security Plan - Sofa Component Smart Notebook

## Goal

This app stores company component images used for sofa frame assembly. Images and part metadata should be visible only to authenticated users who own or are allowed to access that data.

## Recommended Baseline

1. Require Supabase Auth for every user.
2. Keep the `product-images` Storage bucket private.
3. Store `storage_path` in `product_images`, not public image URLs.
4. Generate short-lived signed URLs in the app only after the user passes Row Level Security.
5. Enforce ownership with RLS on `products`, `product_images`, and `storage.objects`.
6. Keep `service_role` keys out of frontend code. The frontend should only use the anon key.

## Current Data Model

`products`

- `id`
- `component_code`
- `bom_code`
- `feature`
- `side`: `trái`, `phải`, `cả hai`
- `user_id`
- `created_at`

`product_images`

- `id`
- `product_id`
- `storage_path`
- `image_url`: nullable fallback for old public data
- `embedding vector(512)`
- `created_at`

## Storage Path Convention

Use this object path format:

```text
{user_id}/{product_id}/{random_uuid}.jpg
```

The first path segment is the authenticated user id. Storage policies use that segment to allow only the owner to read, upload, and delete files.

## Access Control

RLS policy rules:

- A user can select, insert, update, and delete only rows in `products` where `products.user_id = auth.uid()`.
- A user can read, insert, and delete `product_images` only when the linked product belongs to that user.
- A user can read, upload, and delete Storage objects only when the first folder name equals `auth.uid()`.

## AI Search Security

The `match_images` RPC filters by:

```sql
where p.user_id = auth.uid()
```

This prevents a user from searching across another user's image embeddings.

## Operational Notes

- Invite users manually from Supabase Auth if usage must be restricted to a small internal team.
- Disable public signups unless the company explicitly wants self-registration.
- Use strong passwords or magic-link auth for non-technical users.
- Rotate the anon key if it was exposed in an unsafe place. The anon key is public by design, but RLS must be correct.
- Do not make the Storage bucket public after switching to signed URLs.

## Next Hardening Step

For team-level access instead of owner-only access, add:

- `organizations`
- `organization_members`
- `products.organization_id`

Then replace owner-only RLS with organization membership checks. This is the right model when multiple employees need to share the same catalogue.
