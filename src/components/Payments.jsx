import { useState, useMemo, useCallback } from 'react';
import { Plus, Trash2, DollarSign, ChevronDown, ChevronUp, TrendingUp } from 'lucide-react';
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, subWeeks, subMonths, format } from 'date-fns';

export default function Payments({ payments, setPayments, clients, schedule, setSchedule }) {
  const [showModal, setShowModal] = useState(false);
  const [view, setView] = useState('clients');
  const [expanded, setExpanded] = useState({});
  const [form, setForm] = useState({ clientName: '', amount: '', date: '', status: 'paid', method: '', description: '', classesPurchased: '', sessionDate: '', sessionTime: '' });
  const [isSingleClassPass, setIsSingleClassPass] = useState(false);

  const today = new Date();
  const todayStr = format(today, 'yyyy-MM-dd');

  const allClientNames = useMemo(() => {
    const names = new Set();
    clients.forEach(c => names.add(c.name));
    schedule.forEach(s => { if (s.clientName && s.clientName !== 'Single Class Pass' && s.clientName !== 'Personal') names.add(s.clientName); });
    payments.forEach(p => { if (p.clientName && p.clientName !== 'Single Class Pass' && p.clientName !== 'Personal') names.add(p.clientName); });
    return [...names].filter(Boolean).sort();
  }, [clients, schedule, payments]);

  const openAddPayment = (prefill) => {
    setForm({ clientName: '', amount: '', date: format(today, 'yyyy-MM-dd'), status: 'paid', method: '', description: '', classesPurchased: '', sessionDate: '', sessionTime: '', ...prefill });
    setIsSingleClassPass(prefill?.clientName === 'Single Class Pass');
    setShowModal(true);
  };

  const addPayment = () => {
    if (!form.amount || !form.date) return;
    const clientName = isSingleClassPass ? 'Single Class Pass' : form.clientName;
    if (!isSingleClassPass && !clientName) return;

    setPayments(prev => [...prev, {
      clientName: clientName || 'Single Class Pass',
      amount: parseFloat(form.amount),
      date: form.date,
      status: form.status,
      method: form.method,
      description: form.description,
      classesPurchased: parseInt(form.classesPurchased) || 0,
      id: Date.now() + Math.random(),
    }]);

    // If Single Class Pass with session date/time, also add to schedule
    if (isSingleClassPass && form.sessionDate && form.sessionTime) {
      setSchedule(prev => [...prev, {
        clientName: 'Single Class Pass',
        date: form.sessionDate,
        time: form.sessionTime,
        duration: '60',
        classType: 'Single Class Pass',
        notes: `Paid $${form.amount}`,
        exercises: [],
        status: 'completed',
        id: Date.now() + Math.random(),
      }]);
    }

    setForm({ clientName: '', amount: '', date: '', status: 'paid', method: '', description: '', classesPurchased: '', sessionDate: '', sessionTime: '' });
    setIsSingleClassPass(false);
    setShowModal(false);
  };

  const deletePayment = (id) => setPayments(prev => prev.filter(p => p.id !== id));

  const toggleStatus = (id) => {
    setPayments(prev => prev.map(p => {
      if (p.id !== id) return p;
      const next = p.status === 'paid' ? 'pending' : p.status === 'pending' ? 'overdue' : 'paid';
      return { ...p, status: next };
    }));
  };

  // Revenue = payments marked paid
  // For top-level stats: exclude SCP payments whose session isn't completed/no-show
  const completedSessionIds = new Set(schedule.filter(s => s.status === 'completed' || s.status === 'no-show').map(s => s.id));
  const countablePayments = payments.filter(p => {
    if (p.clientName === 'Single Class Pass') return p.sessionId && completedSessionIds.has(p.sessionId);
    return true;
  });
  const totalRevenue = countablePayments.filter(p => p.status === 'paid').reduce((s, p) => s + (p.amount || 0), 0);
  const totalPending = countablePayments.filter(p => p.status === 'pending').reduce((s, p) => s + (p.amount || 0), 0);
  const totalOverdue = countablePayments.filter(p => p.status === 'overdue').reduce((s, p) => s + (p.amount || 0), 0);

  // Earnings = from completed/no-show sessions (actual work done)
  const earnedSessions = schedule.filter(s => s.status === 'completed' || s.status === 'no-show');

  // Per-client summary (exclude Single Class Pass from client list)
  const clientNames = [...new Set([...payments.map(p => p.clientName), ...schedule.map(s => s.clientName)])].filter(n => n && n !== 'Single Class Pass' && n !== 'Personal').sort();

  const clientSummaries = clientNames.map(name => {
    const clientPayments = payments.filter(p => p.clientName === name);
    const totalPaid = clientPayments.filter(p => p.status === 'paid').reduce((s, p) => s + (p.amount || 0), 0);
    const classesPurchased = clientPayments.reduce((s, p) => s + (p.classesPurchased || 0), 0);
    const classesCompleted = schedule.filter(s => s.clientName === name && (s.status === 'completed' || (!s.status && s.date < todayStr))).length;
    const classesNoShow = schedule.filter(s => s.clientName === name && s.status === 'no-show').length;
    const classesRemaining = classesPurchased - classesCompleted - classesNoShow;
    return { name, totalPaid, classesPurchased, classesCompleted, classesNoShow, classesRemaining, payments: clientPayments };
  });

  // Single Class Pass summary
  const scpPayments = payments.filter(p => p.clientName === 'Single Class Pass');
  const scpTotal = scpPayments.filter(p => p.status === 'paid').reduce((s, p) => s + (p.amount || 0), 0);

  const toggleExpand = (name) => setExpanded(e => ({ ...e, [name]: !e[name] }));
  const sorted = [...payments].sort((a, b) => new Date(b.date) - new Date(a.date));

  // ===== Earnings chart data =====
  const [earningsView, setEarningsView] = useState('weekly');

  // Earnings = only count money for completed/no-show sessions
  // For regular clients: per-session rate = total paid / classes purchased, * completed sessions in period
  // For SCP: count the payment only if its linked session is completed/no-show
  const calcEarnings = useCallback((startStr, endStr) => {
    const periodSessions = schedule.filter(s =>
      (s.status === 'completed' || s.status === 'no-show') && s.date >= startStr && s.date <= endStr
    );
    let earned = 0;
    // SCP: count payments linked to completed sessions in this period
    const scpSessionIds = new Set(periodSessions.filter(s => s.clientName === 'Single Class Pass').map(s => s.id));
    earned += payments.filter(p => p.clientName === 'Single Class Pass' && p.status === 'paid' && p.sessionId && scpSessionIds.has(p.sessionId)).reduce((s, p) => s + (p.amount || 0), 0);
    // Regular clients: for each client with completed sessions, calculate per-session value
    const clientsDone = {};
    periodSessions.filter(s => s.clientName !== 'Single Class Pass' && s.clientName !== 'Personal').forEach(s => {
      clientsDone[s.clientName] = (clientsDone[s.clientName] || 0) + 1;
    });
    for (const [name, count] of Object.entries(clientsDone)) {
      const cp = payments.filter(p => p.clientName === name && p.status === 'paid');
      const totalPaid = cp.reduce((s, p) => s + (p.amount || 0), 0);
      const totalClasses = cp.reduce((s, p) => s + (p.classesPurchased || 0), 0);
      if (totalClasses > 0) {
        earned += (totalPaid / totalClasses) * count;
      }
    }
    return { earned, sessions: periodSessions.length };
  }, [payments, schedule]);

  const weeklyEarnings = useMemo(() => {
    const weeks = [];
    for (let i = 11; i >= 0; i--) {
      const ws = startOfWeek(subWeeks(today, i), { weekStartsOn: 1 });
      const we = endOfWeek(ws, { weekStartsOn: 1 });
      const { earned, sessions } = calcEarnings(format(ws, 'yyyy-MM-dd'), format(we, 'yyyy-MM-dd'));
      weeks.push({ label: format(ws, 'MMM d'), earned, sessions });
    }
    return weeks;
  }, [calcEarnings, today]);

  const monthlyEarnings = useMemo(() => {
    const months = [];
    for (let i = 11; i >= 0; i--) {
      const ms = startOfMonth(subMonths(today, i));
      const me = endOfMonth(ms);
      const { earned, sessions } = calcEarnings(format(ms, 'yyyy-MM-dd'), format(me, 'yyyy-MM-dd'));
      months.push({ label: format(ms, 'MMM yy'), earned, sessions });
    }
    return months;
  }, [calcEarnings, today]);

  const chartData = earningsView === 'weekly' ? weeklyEarnings : monthlyEarnings;
  const maxEarned = Math.max(...chartData.map(d => d.earned), 1);

  // This week / this month earned
  const thisWeekStart = format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd');
  const thisWeekEnd = format(endOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd');
  const thisMonthStart = format(startOfMonth(today), 'yyyy-MM-dd');
  const thisMonthEnd = format(endOfMonth(today), 'yyyy-MM-dd');
  const earnedThisWeek = countablePayments.filter(p => p.status === 'paid' && p.date >= thisWeekStart && p.date <= thisWeekEnd).reduce((s, p) => s + (p.amount || 0), 0);
  const earnedThisMonth = countablePayments.filter(p => p.status === 'paid' && p.date >= thisMonthStart && p.date <= thisMonthEnd).reduce((s, p) => s + (p.amount || 0), 0);
  const sessionsThisWeek = schedule.filter(s => (s.status === 'completed' || s.status === 'no-show') && s.date >= thisWeekStart && s.date <= thisWeekEnd).length;
  const sessionsThisMonth = schedule.filter(s => (s.status === 'completed' || s.status === 'no-show') && s.date >= thisMonthStart && s.date <= thisMonthEnd).length;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Payments</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-ghost" onClick={() => openAddPayment({ clientName: 'Single Class Pass' })}>
            <DollarSign size={16} /> Single Class Pass
          </button>
          <button className="btn btn-primary" onClick={() => openAddPayment({})}>
            <Plus size={16} /> Record Payment
          </button>
        </div>
      </div>

      <div className="stats-row">
        <div className="stat-card"><div className="stat-value" style={{ color: 'var(--success)' }}>${totalRevenue.toFixed(2)}</div><div className="stat-label">Total Received</div></div>
        <div className="stat-card"><div className="stat-value" style={{ color: 'var(--accent)' }}>${earnedThisWeek.toFixed(2)}</div><div className="stat-label">This Week</div></div>
        <div className="stat-card"><div className="stat-value" style={{ color: 'var(--accent)' }}>${earnedThisMonth.toFixed(2)}</div><div className="stat-label">This Month</div></div>
      </div>

      <div className="tabs">
        <button className={`tab ${view === 'clients' ? 'active' : ''}`} onClick={() => setView('clients')}>Client Summary</button>
        <button className={`tab ${view === 'log' ? 'active' : ''}`} onClick={() => setView('log')}>Transaction Log</button>
        <button className={`tab ${view === 'earnings' ? 'active' : ''}`} onClick={() => setView('earnings')}>
          <TrendingUp size={14} style={{ display: 'inline', marginRight: 4 }} />Earnings
        </button>
      </div>

      {/* ===== EARNINGS TAB ===== */}
      {view === 'earnings' && (
        <div>
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1rem' }}>Earnings Overview</h3>
              <div style={{ display: 'flex', gap: '0.25rem' }}>
                <button className={`btn btn-sm ${earningsView === 'weekly' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setEarningsView('weekly')}>Weekly</button>
                <button className={`btn btn-sm ${earningsView === 'monthly' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setEarningsView('monthly')}>Monthly</button>
              </div>
            </div>

            <div className="stats-row" style={{ marginBottom: '1.5rem' }}>
              <div className="stat-card">
                <div className="stat-value" style={{ color: 'var(--accent)' }}>${calcEarnings(thisWeekStart, thisWeekEnd).earned.toFixed(2)} <span style={{ fontSize: '0.9rem', color: 'var(--text-dim)', fontWeight: 400 }}>/ {sessionsThisWeek} sessions</span></div>
                <div className="stat-label">Earned This Week</div>
              </div>
              <div className="stat-card">
                <div className="stat-value" style={{ color: 'var(--accent)' }}>${calcEarnings(thisMonthStart, thisMonthEnd).earned.toFixed(2)} <span style={{ fontSize: '0.9rem', color: 'var(--text-dim)', fontWeight: 400 }}>/ {sessionsThisMonth} sessions</span></div>
                <div className="stat-label">Earned This Month</div>
              </div>
            </div>

            {/* Bar chart */}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: 180, padding: '0 0.5rem' }}>
              {chartData.map((d, i) => (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                  <span style={{ fontSize: '0.6rem', color: 'var(--text-dim)' }}>{d.earned > 0 ? `$${d.earned.toFixed(0)}` : ''}</span>
                  <div style={{
                    width: '100%', maxWidth: 40,
                    height: `${Math.max((d.earned / maxEarned) * 140, d.earned > 0 ? 4 : 0)}px`,
                    background: 'var(--accent)',
                    borderRadius: '4px 4px 0 0',
                    transition: 'height 0.3s',
                    opacity: d.earned > 0 ? 1 : 0.15,
                    minHeight: d.earned > 0 ? 4 : 1,
                  }} title={`${d.label}: $${d.earned.toFixed(2)} (${d.sessions} sessions)`} />
                  <span style={{ fontSize: '0.55rem', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>{d.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ===== CLIENT SUMMARY ===== */}
      {view === 'clients' && (
        <div>
          {clientSummaries.length === 0 && scpPayments.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-dim)' }}>No payment data yet.</div>
          ) : (
            <>
              {scpPayments.length > 0 && (
                <div className="card" style={{ borderLeft: '3px solid var(--warning)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => toggleExpand('__scp__')}>
                    <h3 style={{ fontSize: '1rem' }}><DollarSign size={16} style={{ display: 'inline', color: 'var(--warning)' }} /> Single Class Pass</h3>
                    {expanded['__scp__'] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                  <div style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>
                    <strong style={{ color: 'var(--success)' }}>${scpTotal.toFixed(2)}</strong> from <strong>{scpPayments.length}</strong> passes
                  </div>
                  {expanded['__scp__'] && (
                    <div style={{ marginTop: '0.75rem', borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
                      <div className="table-wrapper">
                        <table>
                          <thead><tr><th>Date</th><th>Amount</th><th>Method</th><th>Status</th><th></th></tr></thead>
                          <tbody>
                            {[...scpPayments].sort((a, b) => new Date(b.date) - new Date(a.date)).map(p => (
                              <tr key={p.id}>
                                <td>{p.date}</td>
                                <td>${(p.amount || 0).toFixed(2)}</td>
                                <td>{p.method || '-'}</td>
                                <td><button className={`badge badge-${p.status}`} onClick={() => toggleStatus(p.id)} style={{ cursor: 'pointer', border: 'none' }}>{p.status}</button></td>
                                <td><button className="btn btn-ghost btn-sm" onClick={() => deletePayment(p.id)}><Trash2 size={14} /></button></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {clientSummaries.map(cs => (
                <div className="card" key={cs.name}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => toggleExpand(cs.name)}>
                    <h3 style={{ fontSize: '1rem' }}>{cs.name}</h3>
                    {expanded[cs.name] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.75rem', marginTop: '0.75rem' }}>
                    <div><div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--success)' }}>${cs.totalPaid.toFixed(2)}</div><div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Total Paid</div></div>
                    <div><div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{cs.classesPurchased}</div><div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Bought</div></div>
                    <div><div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{cs.classesCompleted}</div><div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Attended</div></div>
                    <div><div style={{ fontSize: '1.1rem', fontWeight: 700, color: cs.classesNoShow > 0 ? 'var(--danger)' : 'var(--text-dim)' }}>{cs.classesNoShow}</div><div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>No Show</div></div>
                    <div><div style={{ fontSize: '1.1rem', fontWeight: 700, color: cs.classesRemaining > 3 ? 'var(--success)' : cs.classesRemaining > 0 ? 'var(--warning)' : 'var(--danger)' }}>{cs.classesRemaining}</div><div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Remaining</div></div>
                  </div>
                  {cs.classesRemaining <= 0 && cs.classesPurchased > 0 && (
                    <div style={{ marginTop: '0.5rem', padding: '0.4rem 0.7rem', background: 'rgba(248,113,113,0.1)', borderRadius: 'var(--radius)', fontSize: '0.8rem', color: 'var(--danger)' }}>Payment due</div>
                  )}
                  {expanded[cs.name] && cs.payments.length > 0 && (
                    <div style={{ marginTop: '0.75rem', borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
                      <div className="table-wrapper">
                        <table>
                          <thead><tr><th>Date</th><th>Amount</th><th>Classes</th><th>Method</th><th>Status</th><th></th></tr></thead>
                          <tbody>
                            {[...cs.payments].sort((a, b) => new Date(b.date) - new Date(a.date)).map(p => (
                              <tr key={p.id}><td>{p.date}</td><td>${(p.amount || 0).toFixed(2)}</td><td>{p.classesPurchased || '-'}</td><td>{p.method || '-'}</td>
                                <td><button className={`badge badge-${p.status}`} onClick={(e) => { e.stopPropagation(); toggleStatus(p.id); }} style={{ cursor: 'pointer', border: 'none' }}>{p.status}</button></td>
                                <td><button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); deletePayment(p.id); }}><Trash2 size={14} /></button></td></tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* ===== TRANSACTION LOG ===== */}
      {view === 'log' && (
        <div className="card">
          {sorted.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-dim)' }}>No payments recorded yet.</div>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead><tr><th>Date</th><th>Client</th><th>Amount</th><th>Classes</th><th>Method</th><th>Description</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {sorted.map(p => (
                    <tr key={p.id}>
                      <td>{p.date}</td>
                      <td style={{ fontWeight: 600 }}>{p.clientName === 'Single Class Pass' ? <><DollarSign size={12} style={{ display: 'inline', color: 'var(--warning)' }} /> {p.clientName}</> : p.clientName}</td>
                      <td><DollarSign size={14} style={{ display: 'inline' }} />{(p.amount || 0).toFixed(2)}</td>
                      <td>{p.classesPurchased || '-'}</td>
                      <td>{p.method || '-'}</td>
                      <td style={{ color: 'var(--text-dim)' }}>{p.description || '-'}</td>
                      <td><button className={`badge badge-${p.status}`} onClick={() => toggleStatus(p.id)} style={{ cursor: 'pointer', border: 'none' }}>{p.status}</button></td>
                      <td><button className="btn btn-ghost btn-sm" onClick={() => deletePayment(p.id)}><Trash2 size={14} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ===== RECORD PAYMENT MODAL ===== */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">{isSingleClassPass ? 'Single Class Pass Payment' : 'Record Payment'}</h2>
            {!isSingleClassPass && (
              <div className="form-group">
                <label className="form-label">Client</label>
                <select value={form.clientName} onChange={e => setForm({ ...form, clientName: e.target.value })}>
                  <option value="">Select client...</option>
                  {allClientNames.map(name => <option key={name} value={name}>{name}</option>)}
                </select>
              </div>
            )}
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Amount ($)</label>
                <input type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="0.00" />
              </div>
              <div className="form-group">
                <label className="form-label">Payment Date</label>
                <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
              </div>
            </div>
            {!isSingleClassPass && (
              <div className="form-group">
                <label className="form-label">Classes Purchased</label>
                <input type="number" value={form.classesPurchased} onChange={e => setForm({ ...form, classesPurchased: e.target.value })} placeholder="e.g. 10" />
              </div>
            )}
            {isSingleClassPass && (
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Session Date</label>
                  <input type="date" value={form.sessionDate} onChange={e => setForm({ ...form, sessionDate: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Session Time</label>
                  <input type="time" value={form.sessionTime} onChange={e => setForm({ ...form, sessionTime: e.target.value })} />
                </div>
              </div>
            )}
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Payment Method</label>
                <select value={form.method} onChange={e => setForm({ ...form, method: e.target.value })}>
                  <option value="">Select...</option>
                  <option value="Cash">Cash</option>
                  <option value="Card">Card</option>
                  <option value="Venmo">Venmo</option>
                  <option value="Zelle">Zelle</option>
                  <option value="PayPal">PayPal</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Status</label>
                <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                  <option value="paid">Paid</option>
                  <option value="pending">Pending</option>
                </select>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={addPayment}>Record Payment</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
