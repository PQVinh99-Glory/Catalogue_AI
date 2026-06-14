# Deployment Plan

## Recommended First Deployment

Use GitHub Pages for the React app and Supabase for auth, database, storage, and RLS.

Security is enforced by Supabase:

- Users must sign in through Supabase Auth.
- `products` and `product_images` are protected by RLS.
- `product-images` Storage bucket is private.
- Images are displayed through short-lived signed URLs.

The frontend itself can be hosted publicly because it does not contain service-role credentials. The anon key is expected to be public, and RLS is the security boundary.

## GitHub Pages Steps

1. Merge the feature branch into `main`.
2. In GitHub, open `Settings` -> `Pages`.
3. Set `Source` to `GitHub Actions`.
4. Push to `main`.
5. Wait for the `Deploy catalogue app to GitHub Pages` workflow to finish.

## Supabase Auth Settings

In Supabase, manually create users in `Authentication` -> `Users`.

For stricter access:

- Do not expose a signup form in the app.
- Keep magic link with `shouldCreateUser: false`.
- Keep Storage bucket `product-images` private.

## AI Search Status

Browser-side CLIP loading is not reliable enough for production. The app currently allows catalogue data and images to be saved without AI embeddings, so the handbook can operate normally.

Production AI should be moved to a backend process:

- Supabase Edge Function, or
- a small private API service, or
- a hosted inference service with a server-side token.

That backend should:

1. Read new `product_images` rows where `embedding is null`.
2. Load the private image object from Supabase Storage.
3. Generate a 512-dimension CLIP embedding.
4. Update `product_images.embedding`.

Until that backend exists, text/BOM/side search is production-ready, while AI image search is a later enhancement.
