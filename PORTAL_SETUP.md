# FitnessApp-Portal — Sandbox Setup

This is the **student-portal version**, deployed separately from your production app.
It uses a **separate Supabase project (sandbox)** so it can never affect production data.

## How roles work
- Anyone whose login email is in the **trainer allow-list** gets the full trainer app.
  Configure via `VITE_TRAINER_EMAILS` (comma-separated) or `src/lib/roles.js`
  (default: `liyifan0718@gmail.com`).
- Everyone else gets a **read-only student portal** showing only their own sessions,
  payments, and profile/goals — matched by their **login email** to a client whose
  `email` field you set in the Clients tab.

---

## 1. Create a NEW Supabase project (your sandbox)
Do **not** reuse the production project. Create a fresh one at https://supabase.com.

## 2. Run this SQL (SQL Editor → New query → Run)

```sql
-- Trainer's private full-state blob
create table if not exists public.trainer_state (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.trainer_state enable row level security;
create policy "own row - select" on public.trainer_state for select using (auth.uid() = user_id);
create policy "own row - insert" on public.trainer_state for insert with check (auth.uid() = user_id);
create policy "own row - update" on public.trainer_state for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own row - delete" on public.trainer_state for delete using (auth.uid() = user_id);

-- Read-only projections for students
create table if not exists public.student_sessions (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references auth.users(id) on delete cascade,
  student_email text not null,
  client_name text, date text, "time" text, duration text,
  class_type text, status text, notes text,
  updated_at timestamptz not null default now()
);
create table if not exists public.student_payments (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references auth.users(id) on delete cascade,
  student_email text not null,
  client_name text, date text, amount numeric, status text,
  method text, description text, classes_purchased int,
  updated_at timestamptz not null default now()
);
create table if not exists public.student_profile (
  trainer_id uuid not null references auth.users(id) on delete cascade,
  student_email text not null,
  name text, plan text, goals jsonb default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (trainer_id, student_email)
);

alter table public.student_sessions enable row level security;
alter table public.student_payments enable row level security;
alter table public.student_profile enable row level security;

-- Trainer: full control of rows they own
create policy "trainer sessions" on public.student_sessions for all using (auth.uid() = trainer_id) with check (auth.uid() = trainer_id);
create policy "trainer payments" on public.student_payments for all using (auth.uid() = trainer_id) with check (auth.uid() = trainer_id);
create policy "trainer profile"  on public.student_profile  for all using (auth.uid() = trainer_id) with check (auth.uid() = trainer_id);

-- Student: read-only, only rows addressed to their login email
create policy "student sessions" on public.student_sessions for select using (lower(student_email) = lower(auth.jwt()->>'email'));
create policy "student payments" on public.student_payments for select using (lower(student_email) = lower(auth.jwt()->>'email'));
create policy "student profile"  on public.student_profile  for select using (lower(student_email) = lower(auth.jwt()->>'email'));
```

## 3. Give me the sandbox keys
From **Project Settings → API**, send me the **Project URL** + **anon public** key.
I'll add them as repo Variables so the deployed portal points at the sandbox.

## 4. (Optional) trainer email confirmation
Same as before: **Authentication → Providers → Email → Confirm email OFF** for instant signups.

---

## Testing plan
1. Sign in with **your** email (`liyifan0718@gmail.com`) → you get the full trainer app.
2. Add a client with a **test email** you control, plus a session/payment/goal.
3. Sign out, sign up/in with that **test email** → you should see ONLY that client's data,
   read-only. I'll also verify isolation with the anonymous "stranger" test.
