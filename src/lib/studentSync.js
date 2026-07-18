import { supabase } from './supabase';

// Reserved client names that are never real students.
const NON_STUDENT = new Set(['Single Class Pass', 'Personal']);

// Build a { clientName -> lowercased email } map from clients that have an email.
function emailByName(clients) {
  const map = {};
  (clients || []).forEach((c) => {
    if (c?.name && !NON_STUDENT.has(c.name) && c.email && c.email.trim()) {
      map[c.name] = c.email.trim().toLowerCase();
    }
  });
  return map;
}

// TRAINER SIDE: project the trainer's in-app data into read-only student tables.
// Replace-all per trainer keeps it simple and correct for a small dataset.
export async function materializeStudentData(userId, data) {
  if (!supabase) return;
  const { schedule = [], payments = [], goals = [], clients = [] } = data;
  const byName = emailByName(clients);

  const sessions = schedule
    .filter((s) => byName[s.clientName])
    .map((s) => ({
      trainer_id: userId,
      student_email: byName[s.clientName],
      client_name: s.clientName,
      date: s.date || null,
      time: s.time || null,
      duration: s.duration || null,
      class_type: s.classType || null,
      status: s.status || null,
      notes: s.notes || null,
    }));

  const pays = payments
    .filter((p) => byName[p.clientName])
    .map((p) => ({
      trainer_id: userId,
      student_email: byName[p.clientName],
      client_name: p.clientName,
      date: p.date || null,
      amount: typeof p.amount === 'number' ? p.amount : parseFloat(p.amount) || 0,
      status: p.status || null,
      method: p.method || null,
      description: p.description || null,
      classes_purchased: parseInt(p.classesPurchased) || 0,
    }));

  // One profile row per unique student email (dedupe if two clients share one).
  const seen = new Set();
  const profiles = [];
  (clients || []).forEach((c) => {
    if (!c?.email || !c.email.trim() || NON_STUDENT.has(c.name)) return;
    const email = c.email.trim().toLowerCase();
    if (seen.has(email)) return;
    seen.add(email);
    profiles.push({
      trainer_id: userId,
      student_email: email,
      name: c.name,
      plan: c.plan || '',
      goals: (goals || []).filter((g) => g.clientName === c.name),
    });
  });

  // Replace this trainer's projected rows.
  await supabase.from('student_sessions').delete().eq('trainer_id', userId);
  if (sessions.length) await supabase.from('student_sessions').insert(sessions);
  await supabase.from('student_payments').delete().eq('trainer_id', userId);
  if (pays.length) await supabase.from('student_payments').insert(pays);
  await supabase.from('student_profile').delete().eq('trainer_id', userId);
  if (profiles.length) await supabase.from('student_profile').insert(profiles);
}

// STUDENT SIDE: fetch this student's own rows. RLS restricts to their email.
export async function fetchStudentData() {
  if (!supabase) return { sessions: [], payments: [], profile: null };
  const [s, p, pr] = await Promise.all([
    supabase.from('student_sessions').select('*'),
    supabase.from('student_payments').select('*'),
    supabase.from('student_profile').select('*'),
  ]);
  return {
    sessions: s.data || [],
    payments: p.data || [],
    profile: (pr.data && pr.data[0]) || null,
    error: s.error || p.error || pr.error || null,
  };
}
