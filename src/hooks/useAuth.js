import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// Tracks the current Supabase auth session.
// `ready` becomes true once the initial session lookup completes.
export function useAuth() {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(!supabase); // no cloud => nothing to wait for
  const [recovery, setRecovery] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session ?? null);
      setReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s ?? null);
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { session, ready, recovery, clearRecovery: () => setRecovery(false) };
}
