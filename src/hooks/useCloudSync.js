import { useEffect, useRef, useState } from 'react';
import { supabase, STATE_TABLE } from '../lib/supabase';
import { isTrainer } from '../lib/roles';
import { materializeStudentData } from '../lib/studentSync';

// Syncs the app's four data arrays to a single per-user row in Supabase.
// - On login: loads the cloud row and hydrates local state. If no row exists
//   yet, the current local data is pushed up (first-time migration) so nothing
//   already in this browser is lost.
// - On change: debounced upsert of the full state back to the cloud.
//
// Last-write-wins across devices (fine for a small number of users).
export function useCloudSync({ session, data, setters }) {
  const { schedule, payments, goals, clients } = data;
  const { setSchedule, setPayments, setGoals, setClients } = setters;

  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState('idle'); // idle | loading | saving | saved | error
  const skipNextPush = useRef(false);

  // Load (or migrate) when a session becomes available.
  useEffect(() => {
    if (!supabase || !session) {
      setLoaded(false);
      return;
    }
    let cancelled = false;
    setStatus('loading');

    (async () => {
      const { data: row, error } = await supabase
        .from(STATE_TABLE)
        .select('data')
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        setStatus('error');
        setLoaded(true); // fall back to local data
        return;
      }

      const cloud = row?.data;
      if (cloud && typeof cloud === 'object') {
        // Cloud is the source of truth on login. Don't fire a redundant push
        // for the values we just hydrated.
        skipNextPush.current = true;
        if (Array.isArray(cloud.schedule)) setSchedule(cloud.schedule);
        if (Array.isArray(cloud.payments)) setPayments(cloud.payments);
        if (Array.isArray(cloud.goals)) setGoals(cloud.goals);
        if (Array.isArray(cloud.clients)) setClients(cloud.clients);
        setStatus('saved');
      } else {
        // No cloud row yet: push whatever is already in this browser.
        await supabase.from(STATE_TABLE).upsert({
          user_id: session.user.id,
          data: { schedule, payments, goals, clients },
          updated_at: new Date().toISOString(),
        });
        setStatus('saved');
      }
      setLoaded(true);
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // Debounced push on any data change.
  useEffect(() => {
    if (!supabase || !session || !loaded) return;
    if (skipNextPush.current) {
      skipNextPush.current = false;
      return;
    }
    setStatus('saving');
    const t = setTimeout(async () => {
      const { error } = await supabase.from(STATE_TABLE).upsert({
        user_id: session.user.id,
        data: { schedule, payments, goals, clients },
        updated_at: new Date().toISOString(),
      });
      // Trainer only: project data into read-only student tables.
      if (!error && isTrainer(session.user.email)) {
        try {
          await materializeStudentData(session.user.id, { schedule, payments, goals, clients });
        } catch { /* projection best-effort; blob is source of truth */ }
      }
      setStatus(error ? 'error' : 'saved');
    }, 1200);
    return () => clearTimeout(t);
  }, [schedule, payments, goals, clients, session, loaded]);

  return { loaded, status };
}
