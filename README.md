# Resource Hubz Forum

Anonymous single-page forum intended to be embedded in a Google Sites Resource Hubz page.

## What it does

- Shows resource categories for housing, education, domestic violence, healthcare, food insecurity, undocumented immigrants, and mental health / suicide prevention.
- Lets visitors create anonymous topics.
- Lets visitors reply anonymously to topics.
- Persists categories, posts, replies, and votes in a local SQLite database at `data/resource-hubz.sqlite`.

## Run locally

This app uses React, TypeScript, Vite, and Node's built-in SQLite support. Use Node `22.5+`.

```bash
npm install
npm run dev
```

Open `http://localhost:3002`.

## Production

```bash
npm run build
npm start
```

Host the app somewhere that supports a long-running Node server and persistent disk storage for `data/resource-hubz.sqlite`. Then embed the hosted URL in Google Sites with **Embed > By URL**.

## Free Vercel + Supabase Deploy

For a free deployment, use Vercel for the static React app and Supabase for the database.

1. In Supabase, open **SQL Editor** and run `supabase-schema.sql`.
2. In Vercel, import this project.
3. Add these Vercel environment variables:

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key_here
```

4. Use the default Vite settings:
   - Build command: `npm run build`
   - Output directory: `dist`
5. Deploy and embed the Vercel URL in Google Sites.

Do not add your Supabase secret key to Vercel for this static version.

## Deploy on Render

This repo includes a `Dockerfile` and `render.yaml` blueprint. Render is a good fit because the app needs a Node server plus persistent disk storage for SQLite.

1. Push this folder to a GitHub repository.
2. In Render, create a **Blueprint** from that repository.
3. Render will use `render.yaml`, build the Docker image, and mount a 1 GB disk at `/app/data`.
4. After deploy, embed the Render URL in Google Sites.

If you choose another host, make sure it supports:

- Node `22.5+` or the included Dockerfile.
- A persistent writable disk mounted at `/app/data`.
- Long-running web services, not static-only hosting.

## Safety note

This is intentionally simple. Before using it publicly, add moderation, abuse reporting, rate limits, and clear crisis-language guidance for emergency situations.
