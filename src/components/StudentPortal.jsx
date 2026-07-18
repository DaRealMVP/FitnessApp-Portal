import { useEffect, useState } from 'react';
import { Dumbbell, LogOut, Calendar, DollarSign, Target, CalendarClock, CalendarCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { fetchStudentData } from '../lib/studentSync';

const todayStr = new Date().toISOString().split('T')[0];

function fmtDate(d) {
  if (!d) return '';
  const dt = new Date(d + 'T00:00:00');
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

export default function StudentPortal({ session }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ sessions: [], payments: [], profile: null });
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      const res = await fetchStudentData();
      if (!active) return;
      if (res.error) setError('Could not load your data. Please try again later.');
      setData({ sessions: res.sessions, payments: res.payments, profile: res.profile });
      setLoading(false);
    })();
    return () => { active = false; };
  }, []);

  const signOut = async () => { if (supabase) await supabase.auth.signOut(); };

  const upcoming = data.sessions
    .filter((s) => (s.date || '') >= todayStr)
    .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
  const past = data.sessions
    .filter((s) => (s.date || '') < todayStr)
    .sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')));

  const paidTotal = data.payments
    .filter((p) => p.status === 'paid')
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const goals = data.profile?.goals || [];
  const displayName = data.profile?.name || session?.user?.email || 'Student';

  return (
    <div style={{ maxWidth: 780, margin: '0 auto', padding: '1.5rem 1rem 4rem' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, fontSize: '1.15rem' }}>
          <Dumbbell size={22} /> Eve Fitness
        </div>
        <button className="btn btn-ghost btn-sm" onClick={signOut}><LogOut size={14} /> Sign Out</button>
      </header>

      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ fontSize: '1.35rem', fontWeight: 700 }}>Hi {displayName} 👋</div>
        <div style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>Here's your schedule, payments, and goals.</div>
      </div>

      {loading && <div style={{ color: 'var(--text-dim)' }}>Loading…</div>}
      {error && <div style={{ color: '#f87171' }}>{error}</div>}

      {!loading && !error && (
        <>
          {data.sessions.length === 0 && data.payments.length === 0 && !data.profile && (
            <div style={{ color: 'var(--text-dim)', background: 'var(--surface,#1a1a1a)', padding: '1.25rem', borderRadius: 12 }}>
              Nothing here yet. Once your trainer adds you (with this email), your sessions and payments will show up.
            </div>
          )}

          {/* Upcoming sessions */}
          {upcoming.length > 0 && (
            <Section icon={<CalendarClock size={16} />} title={`Upcoming Sessions (${upcoming.length})`}>
              {upcoming.map((s, i) => <SessionRow key={i} s={s} />)}
            </Section>
          )}

          {/* Payments */}
          {data.payments.length > 0 && (
            <Section icon={<DollarSign size={16} />} title="Payments" note={`Total paid: $${paidTotal.toFixed(2)}`}>
              {[...data.payments].sort((a, b) => (b.date || '').localeCompare(a.date || '')).map((p, i) => (
                <div key={i} style={rowStyle}>
                  <div>
                    <div style={{ fontWeight: 600 }}>${Number(p.amount || 0).toFixed(2)} {p.description ? `· ${p.description}` : ''}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{fmtDate(p.date)} {p.method ? `· ${p.method}` : ''}</div>
                  </div>
                  <StatusPill status={p.status} />
                </div>
              ))}
            </Section>
          )}

          {/* Goals */}
          {goals.length > 0 && (
            <Section icon={<Target size={16} />} title="Your Goals">
              {goals.map((g, i) => (
                <div key={i} style={rowStyle}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{g.goal}</div>
                    {(g.target || g.deadline) && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                        {g.current || 0}{g.unit ? ` ${g.unit}` : ''} {g.target ? `/ ${g.target}${g.unit ? ` ${g.unit}` : ''}` : ''}
                        {g.deadline ? ` · by ${fmtDate(g.deadline)}` : ''}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </Section>
          )}

          {/* Past sessions */}
          {past.length > 0 && (
            <Section icon={<CalendarCheck size={16} />} title={`Past Sessions (${past.length})`}>
              {past.slice(0, 50).map((s, i) => <SessionRow key={i} s={s} past />)}
            </Section>
          )}
        </>
      )}
    </div>
  );
}

function Section({ icon, title, note, children }) {
  return (
    <section style={{ marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600, fontSize: '0.95rem' }}>{icon} {title}</div>
        {note && <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>{note}</div>}
      </div>
      <div style={{ background: 'var(--surface,#1a1a1a)', borderRadius: 12, overflow: 'hidden' }}>{children}</div>
    </section>
  );
}

function SessionRow({ s, past }) {
  return (
    <div style={{ ...rowStyle, opacity: past ? 0.75 : 1 }}>
      <div>
        <div style={{ fontWeight: 600 }}><Calendar size={12} style={{ marginRight: 4 }} />{fmtDate(s.date)}{s.time ? ` · ${s.time}` : ''}</div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
          {s.class_type || 'Session'}{s.duration ? ` · ${s.duration} min` : ''}{s.notes ? ` · ${s.notes}` : ''}
        </div>
      </div>
      {s.status && <StatusPill status={s.status} />}
    </div>
  );
}

function StatusPill({ status }) {
  const colors = {
    paid: '#4ade80', completed: '#4ade80', pending: '#fbbf24',
    overdue: '#f87171', 'no-show': '#f87171', cancelled: '#94a3b8',
  };
  const c = colors[status] || '#94a3b8';
  return (
    <span style={{ fontSize: '0.7rem', fontWeight: 600, color: c, border: `1px solid ${c}`, borderRadius: 999, padding: '0.1rem 0.5rem', whiteSpace: 'nowrap' }}>
      {status}
    </span>
  );
}

const rowStyle = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  gap: '0.75rem', padding: '0.7rem 0.9rem', borderBottom: '1px solid var(--border,#2a2a2a)',
};
