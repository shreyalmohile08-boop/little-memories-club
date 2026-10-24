# Little Memories Club ♡

A whimsical photo scrapbook where **everyone gets their own private wall**. You sign up, add pictures and little notes, and send your wall link to the people you choose. They can look and leave a ♡, nothing else. Three full themes (Pink Whimsy, Garden Whimsy, Spider-Verse), each with its own cursor, decorations and frames.

**Stack:** plain HTML/CSS/JS (no framework) · Supabase (Auth, Postgres, private Storage, Edge Functions) · Vercel or Netlify.

```
public/                   the website (static)
  index.html · css/styles.css · js/app.js · js/config.js (generated)
scripts/build-config.mjs  writes js/config.js from your env vars
supabase/
  schema.sql              tables, security, private storage bucket
  functions/
    _shared/common.ts     helpers used by both functions
    wall-api/             view a wall, like, my wall, rename, new link, delete
    submit-memory/        validated uploads (logged-in owners only)
    .env.example          optional server settings
.env.example · vercel.json · netlify.toml
```

## How it works

- **Sign up / log in** with email + password (Supabase Auth). Each account gets one wall, created automatically.
- **Your wall link** looks like `https://your-site/w/<32 random characters>`. Only people who have it can see your pictures. "Make a new link" in your wall instantly stops the old one working.
- **Viewers** need no account. They see the wall read-only and can tap ♡ (one like per device per picture).
- **Nothing is public.** The database tables are locked (no browser access at all) and the picture bucket is private. Everything goes through two Edge Functions, which check the share link or your login, and hand out short-lived (6 hour) picture links.
- **Uploads** are checked on the server (real file type from the bytes, max 8 MB each, 6 pictures, note and name length, date), limited to 20 per account per hour, and resized/stripped of GPS data in the browser before sending.
- Likes are limited to 240 per network address per hour.

Honest limits: anyone you give the link to can forward it (reset it if that happens); a viewer who clears their browser data or uses another browser can like again.

## Setup

You need: a free Supabase account, a free Vercel (or Netlify) account, Node.js 18+, a GitHub account.

### 1. Supabase project
Create a project. Note the **Project URL**, the public **anon / publishable** key (never the secret/service_role key) and the **project ref** (Project Settings → API).

### 2. Allow instant sign-up
Authentication → **Sign In / Providers → Email**: turn **Confirm email OFF** (otherwise every sign-up must click an email link, and Supabase's free email sender only allows a few emails per hour).
Authentication → **URL Configuration**: set **Site URL** to your live address (once you have it) and add `http://localhost:3000` under Redirect URLs. This is used by "Forgot your password?".

### 3. Database
SQL Editor → New query → paste all of `supabase/schema.sql` → Run. (If you used the older single-wall version, this upgrade deletes the old public memories; confirm the warning. Then empty Storage → `memories` by hand to remove the old files.)

### 4. Edge Functions
```bash
npx supabase login
npx supabase functions deploy wall-api --no-verify-jwt --project-ref YOUR_PROJECT_REF
npx supabase functions deploy submit-memory --no-verify-jwt --project-ref YOUR_PROJECT_REF
npx supabase secrets set RATE_SALT="some-random-text" ALLOWED_ORIGIN="*" --project-ref YOUR_PROJECT_REF
```
Later change `ALLOWED_ORIGIN` to `"https://your-site.vercel.app,http://localhost:3000"`.
Upgrading? Remove the old function: `npx supabase functions delete delete-memory --project-ref YOUR_PROJECT_REF`.

### 5. Run locally
Copy `.env.example` to `.env`, fill in `SUPABASE_URL` (just `https://xxxx.supabase.co`) and `SUPABASE_ANON_KEY`, then:
```bash
npm run dev      # http://localhost:3000
```

### 6. Deploy
Push to GitHub, import into Vercel (or Netlify), add the same two environment variables, deploy. `vercel.json` / `netlify.toml` already contain the `/w/<token>` rewrite.

## Testing checklist

**Accounts:** sign up (name, email, 8+ char password) → lands on your wall; log out/in works; wrong password shows a clear message; "Forgot your password?" sends a reset email.
**Privacy:** logged-out visitors at `/` see only the welcome + login (no pictures); `/w/<random>` shows "doesn't work"; picture URLs stop working after ~6 hours.
**Uploads:** 1 and 3+ pictures, remove/replace before publishing, bad file types rejected, note required, progress bar, success message, card appears at once, still there after refresh.
**Sharing:** copy your wall link; open in a private window → read-only wall, no upload/delete, ♡ works and can be undone; opening your own link while logged in takes you to your wall.
**Owner tools:** rename wall; "Make a new link" kills the old link; delete a memory from the viewer.
**Themes & responsive:** all three themes switch without reload and persist; custom cursor only with a mouse; phone width has no sideways scroll; reduced-motion setting calms animations.
**Permissions:** in the browser console, direct calls to `/rest/v1/memories`, `/rest/v1/walls`, `/rest/v1/likes` and `/storage/v1/object/memories/...` with the public key are all refused.
