import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, isCloudConfigured } from './cloudConfig';

// Single shared Supabase client. Null when cloud sync isn't configured yet,
// so the rest of the app can cleanly fall back to local-only mode.
export const supabase = isCloudConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null;

// Name of the table that stores each user's full app state as a JSON blob.
export const STATE_TABLE = 'trainer_state';
