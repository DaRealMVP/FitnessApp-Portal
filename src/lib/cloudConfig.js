// ============================================================================
// CLOUD SYNC CONFIG
// ----------------------------------------------------------------------------
// Paste your Supabase project's URL and anon (public) key below.
// Find them in Supabase: Project Settings -> API.
//
// The anon key is safe to commit/publish — your data is protected by
// Row Level Security (each logged-in user can only read/write their own rows).
//
// While these stay as the placeholder values, the app runs in local-only
// mode (no login, data saved only in this browser) — exactly like before.
// ============================================================================

export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || 'YOUR_SUPABASE_URL';

export const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY || 'YOUR_SUPABASE_ANON_KEY';

export const isCloudConfigured =
  SUPABASE_URL &&
  SUPABASE_ANON_KEY &&
  !SUPABASE_URL.startsWith('YOUR_') &&
  !SUPABASE_ANON_KEY.startsWith('YOUR_');
