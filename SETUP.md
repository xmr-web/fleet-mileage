# Fleet Admin Dashboard — Setup Instructions

## 1. Install the QR code package

```bash
npm install qrcode-generator
```

## 2. Add the new files to your project

Copy these files into your existing fleet app project:

```
src/
  admin/
    index.html   ← new
    admin.js     ← new
    admin.css    ← new
vite.config.js   ← replace your existing one
```

> **Note:** The vite.config.js assumes your existing driver entry point is
> `index.html` at the project root. Adjust `main` in the rollupOptions if
> your project is structured differently.

## 3. Check your supabaseClient.js path

`admin.js` imports from `../supabaseClient.js` — meaning it expects:

```
src/
  supabaseClient.js   ← your existing Supabase client
  admin/
    admin.js
```

If your `supabaseClient.js` lives at the root (not inside `src/`), update
the import at the top of `admin.js`:

```js
// If supabaseClient.js is at the project root:
import { supabase } from '../../supabaseClient.js';
```

## 4. Run locally

```bash
npm run dev
```

Then visit:
- `http://localhost:5173/`              → driver mileage entry (unchanged)
- `http://localhost:5173/src/admin/`   → admin dashboard

## 5. Netlify deploy

Netlify will automatically pick up both pages from the Vite build output.
After deploying, the admin dashboard will be at:

```
https://weekly-mileage.netlify.app/src/admin/
```

You can optionally set up a Netlify redirect to shorten this to `/admin`.
Add to your `public/_redirects` file:

```
/admin  /src/admin/index.html  200
```

## 6. Supabase Storage — RLS policy

Because your `vehicle-images` bucket is private, the dashboard uses **signed
URLs** (valid for 1 hour). For this to work, your Supabase service role or
anon key needs permission to call `createSignedUrl`.

If photos aren't loading, check your bucket's RLS policies in:
Supabase → Storage → vehicle-images → Policies

You'll need a policy that allows `SELECT` (read) for the anon role, or
switch to using the service role key on the admin page only.

A simple permissive read policy for signed URLs:

```sql
CREATE POLICY "Allow signed URL reads"
ON storage.objects FOR SELECT
USING (bucket_id = 'vehicle-images');
```

## What each file does

| File | Purpose |
|------|---------|
| `src/admin/index.html` | HTML shell — tabs, forms, modals |
| `src/admin/admin.js` | All logic: load vehicles, render grids, handle form, generate QR codes, modals |
| `src/admin/admin.css` | Dashboard styling (dark industrial theme) |
| `vite.config.js` | Tells Vite to build both `index.html` and `src/admin/index.html` |
