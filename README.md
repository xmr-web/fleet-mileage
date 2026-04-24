# Fleet Mileage App

A mobile-first mileage logging app. Each vehicle gets a unique QR code that opens this app, pre-loaded with that vehicle's details and last recorded mileage.

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Configure Supabase
Edit `supabase.config.js` — copy the credentials from your todo app (same project).

### 3. Run locally
```bash
npm run dev
```

Test a vehicle by visiting:
```
http://localhost:5173/?vehicle=YOUR_FLEET_ID
```

### 4. Build & deploy to Netlify
```bash
npm run build
```
Push to GitHub, import repo into Netlify.
- **Build command:** `npm run build`
- **Publish directory:** `dist`

## Adding vehicles
In Supabase Table Editor → vehicles, insert a row for each vehicle:
- `id` — your existing fleet ID (e.g. VH001)
- `name` — vehicle description (e.g. Ford Transit LWB)
- `image_url` — public URL of the vehicle photo (upload via Supabase Storage)
- `last_mileage` — starting mileage (e.g. 0 or current odometer reading)

## Uploading vehicle photos (Supabase Storage)
1. Supabase Dashboard → Storage → Create bucket called `vehicle-images`
2. Set bucket to **Public**
3. Upload a photo for each vehicle
4. Click the photo → Copy URL
5. Paste into the `image_url` column for that vehicle

## Generating QR codes
Once your app is live on Netlify (e.g. https://fleet-mileage.netlify.app), generate a QR code for each vehicle at:
```
https://fleet-mileage.netlify.app/?vehicle=VH001
https://fleet-mileage.netlify.app/?vehicle=VH002
```
Use a free bulk QR generator such as: https://www.qr-code-generator.com

## Git workflow
```bash
git pull          # start of session
git add .
git commit -m "describe change"
git push          # Netlify auto-deploys
```
