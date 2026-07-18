# Cloud Sync + Publishing Setup

This app now supports **cloud sync** (your data lives in Supabase and syncs across
devices/browsers) and **publishing to GitHub Pages** (a stable URL — no more losing
data when you open the file from a different folder).

Until you finish steps 1–3, the app keeps working exactly as before (local-only, no login).

---

## 1. Create a free Supabase project

1. Go to https://supabase.com → sign up (free tier is plenty).
2. Click **New project**. Pick a name and a strong database password (you won't need it often).
3. Wait ~2 minutes for it to provision.

## 2. Create the data table

In your Supabase project: **SQL Editor → New query**, paste this, click **Run**:

```sql
create table if not exists public.trainer_state (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.trainer_state enable row level security;

create policy "own row - select" on public.trainer_state
  for select using (auth.uid() = user_id);
create policy "own row - insert" on public.trainer_state
  for insert with check (auth.uid() = user_id);
create policy "own row - update" on public.trainer_state
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own row - delete" on public.trainer_state
  for delete using (auth.uid() = user_id);
```

Each logged-in user can only ever read/write their **own** row. Perfect for you + 1–2 others.

### (Optional) Skip email confirmation for faster signups
**Authentication → Providers → Email** → turn **Confirm email** OFF. Then signup logs you
straight in. Leave it ON if you prefer email verification.

## 3. Plug in your keys

In Supabase: **Project Settings → API**. Copy:
- **Project URL**
- **anon public** key (safe to publish — protected by the policies above)

Then either:
- **Simple:** edit `src/lib/cloudConfig.js` and replace the two `YOUR_...` placeholders, **or**
- **CI-friendly:** in GitHub → repo **Settings → Secrets and variables → Actions → Variables**,
  add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

Run `npm run dev` — you should now see a login screen. Sign up, and your existing
browser data is pushed to the cloud automatically on first login.

---

## 4. Publish to GitHub Pages

1. Create a GitHub repo and push this project to it (`main` branch).
2. In GitHub → repo **Settings → Pages → Build and deployment → Source = GitHub Actions**.
3. Push to `main` (or run the **Deploy to GitHub Pages** workflow manually).
   The included workflow (`.github/workflows/deploy.yml`) builds and deploys `dist/`.
4. Your app will be live at `https://<your-username>.github.io/<repo-name>/`.

> Because the build is a single self-contained `index.html`, the GitHub Pages
> sub-path works with no extra config.

---

## How data is protected now
- **Cloud is the source of truth on login**, cached to `localStorage` for offline use.
- Changes auto-save to the cloud (debounced ~1s); the sidebar shows **Synced / Saving…**.
- Across devices it's **last-write-wins** — fine for a couple of users; just avoid
  editing the same thing on two devices at the exact same time.
- **Export / Import** still work as manual backups. Import now **warns** before letting
  an empty backup wipe a category that currently has data.
