import { useState, useMemo } from 'react';
import { Plus, Trash2, Edit2, User, Target, CheckCircle, X, ChevronDown, ChevronRight, FileText, Download, Palette, Flag } from 'lucide-react';
import * as XLSX from 'xlsx';

const FLAG_COLORS = { none: 'rgba(255,255,255,0.3)', red: '#f87171', yellow: '#fbbf24', blue: '#60a5fa' };

export default function Clients({ clients, setClients, goals, setGoals, schedule, setSchedule, payments, setPayments }) {
  const [showClientModal, setShowClientModal] = useState(false);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [goalForClient, setGoalForClient] = useState('');
  const [expanded, setExpanded] = useState({});
  const [clientForm, setClientForm] = useState({ name: '', email: '', phone: '', notes: '', plan: '', color: '' });
  const [exportClient, setExportClient] = useState(null); // client name for download modal
  const [exportRange, setExportRange] = useState({ from: '', to: '' });
  const [goalForm, setGoalForm] = useState({ goal: '', target: '', current: '0', unit: '', deadline: '', notes: '' });

  const today = new Date().toISOString().split('T')[0];

  // Auto-fill: merge all unique names from schedule + clients + payments
  const allClientEntries = useMemo(() => {
    const clientMap = new Map();
    clients.forEach(c => clientMap.set(c.name, c));
    schedule.forEach(s => {
      if (s.clientName && s.clientName !== 'Personal' && !clientMap.has(s.clientName)) {
        clientMap.set(s.clientName, { id: 'auto_' + s.clientName, name: s.clientName, email: '', phone: '', notes: '', plan: '', _auto: true });
      }
    });
    (payments || []).forEach(p => {
      if (p.clientName && p.clientName !== 'Personal' && !clientMap.has(p.clientName)) {
        clientMap.set(p.clientName, { id: 'auto_' + p.clientName, name: p.clientName, email: '', phone: '', notes: '', plan: '', _auto: true });
      }
    });
    return [...clientMap.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [clients, schedule, payments]);

  // Client CRUD
  const openAddClient = () => { setClientForm({ name: '', email: '', phone: '', notes: '', plan: '', color: '' }); setEditId(null); setShowClientModal(true); };
  const openEditClient = (c) => {
    setClientForm({ name: c.name, email: c.email || '', phone: c.phone || '', notes: c.notes || '', plan: c.plan || '', color: c.color || '' });
    setEditId(c.id);
    setShowClientModal(true);
  };
  const saveClient = () => {
    if (!clientForm.name) return;
    if (editId) {
      // Find the old name to propagate rename
      const oldClient = typeof editId === 'string' && editId.startsWith('auto_')
        ? allClientEntries.find(c => c.id === editId)
        : clients.find(c => c.id === editId);
      const oldName = oldClient?.name;
      const newName = clientForm.name.trim();

      if (typeof editId === 'string' && editId.startsWith('auto_')) {
        // Promoting auto-client to real client
        setClients(prev => [...prev, { ...clientForm, name: newName, id: Date.now() + Math.random() }]);
      } else {
        setClients(prev => prev.map(c => c.id === editId ? { ...c, ...clientForm, name: newName } : c));
      }

      // If name changed, propagate to schedule, payments, goals
      if (oldName && oldName !== newName) {
        setSchedule(prev => prev.map(s => s.clientName === oldName ? { ...s, clientName: newName } : s));
        setPayments(prev => prev.map(p => p.clientName === oldName ? { ...p, clientName: newName } : p));
        setGoals(prev => prev.map(g => g.clientName === oldName ? { ...g, clientName: newName } : g));
      }
    } else {
      setClients(prev => [...prev, { ...clientForm, id: Date.now() + Math.random() }]);
    }
    setShowClientModal(false);
  };
  const deleteClient = (id) => {
    setClients(prev => {
      const client = prev.find(c => c.id === id);
      if (client) setGoals(gp => gp.filter(g => g.clientName !== client.name));
      return prev.filter(c => c.id !== id);
    });
  };

  const savePlan = (clientName, plan) => {
    setClients(prev => {
      const existing = prev.find(c => c.name === clientName);
      if (existing) {
        return prev.map(c => c.name === clientName ? { ...c, plan } : c);
      } else {
        return [...prev, { id: Date.now() + Math.random(), name: clientName, email: '', phone: '', notes: '', plan }];
      }
    });
  };

  // Goal CRUD
  const openAddGoal = (clientName) => { setGoalForClient(clientName); setGoalForm({ goal: '', target: '', current: '0', unit: '', deadline: '', notes: '' }); setShowGoalModal(true); };
  const addGoal = () => {
    if (!goalForm.goal) return;
    setGoals(prev => [...prev, { ...goalForm, clientName: goalForClient, id: Date.now() + Math.random(), current: parseFloat(goalForm.current) || 0, target: parseFloat(goalForm.target) || 0 }]);
    setShowGoalModal(false);
  };
  const deleteGoal = (id) => setGoals(prev => prev.filter(g => g.id !== id));
  const updateGoalProgress = (id, value) => setGoals(prev => prev.map(g => g.id === id ? { ...g, current: parseFloat(value) || 0 } : g));

  const activeClients = new Set(schedule.filter(s => s.date >= today && s.clientName !== 'Personal').map(s => s.clientName));
  const achievedGoals = goals.filter(g => g.target > 0 && g.current >= g.target).length;

  const toggle = (name) => setExpanded(e => ({ ...e, [name]: !e[name] }));

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Clients</h1>
        <button className="btn btn-primary" onClick={openAddClient}><Plus size={16} /> Add Client</button>
      </div>

      <div className="stats-row">
        <div className="stat-card"><div className="stat-value">{allClientEntries.length}</div><div className="stat-label">Total Clients</div></div>
        <div className="stat-card"><div className="stat-value">{activeClients.size}</div><div className="stat-label">Active</div></div>
        <div className="stat-card"><div className="stat-value">{goals.length}</div><div className="stat-label">Goals</div></div>
        <div className="stat-card"><div className="stat-value" style={{ color: 'var(--success)' }}>{achievedGoals}</div><div className="stat-label">Achieved</div></div>
      </div>

      {allClientEntries.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-dim)' }}>No clients yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {allClientEntries.map(c => {
            const isExpanded = expanded[c.name];
            const clientGoals = goals.filter(g => g.clientName === c.name);
            const clientSessions = schedule.filter(s => s.clientName === c.name).sort((a, b) => a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date));
            const futureSessions = clientSessions.filter(s => s.date >= today);
            const pastSessions = clientSessions.filter(s => s.date < today).reverse();
            const isActive = activeClients.has(c.name);
            const realClient = clients.find(cl => cl.name === c.name);
            const plan = realClient?.plan || '';

            const bought = (payments || []).filter(p => p.clientName === c.name).reduce((s, p) => s + (p.classesPurchased || 0), 0);
            const attended = schedule.filter(s => s.clientName === c.name && (s.status === 'completed' || s.status === 'no-show' || (!s.status && s.date < today))).length;
            const remaining = bought - attended;
            const hasPkg = (payments || []).some(p => p.clientName === c.name);

            return (
              <div className="card" key={c.id} style={{ padding: 0 }}>
                {/* Row header - always visible */}
                <div
                  style={{ display: 'flex', alignItems: 'center', padding: '0.75rem 1rem', cursor: 'pointer', gap: '0.75rem' }}
                  onClick={() => toggle(c.name)}
                >
                  {isExpanded ? <ChevronDown size={16} color="var(--text-dim)" /> : <ChevronRight size={16} color="var(--text-dim)" />}
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: realClient?.color || (isActive ? 'var(--accent)' : 'var(--border)'), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <User size={16} color="white" />
                    </div>
                    <input
                      type="color"
                      value={realClient?.color || '#6c63ff'}
                      onChange={e => {
                        const newColor = e.target.value;
                        setClients(prev => {
                          const existing = prev.find(cl => cl.name === c.name);
                          if (existing) return prev.map(cl => cl.name === c.name ? { ...cl, color: newColor } : cl);
                          return [...prev, { id: Date.now() + Math.random(), name: c.name, email: '', phone: '', notes: '', plan: '', color: newColor }];
                        });
                      }}
                      onClick={e => e.stopPropagation()}
                      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
                      title="Pick color"
                    />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontWeight: 600 }}>{c.name}</span>
                      {c._auto && <span style={{ fontSize: '0.6rem', color: 'var(--text-dim)', background: 'var(--border)', borderRadius: 4, padding: '1px 5px' }}>auto</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '1.25rem', fontSize: '0.8rem', color: 'var(--text-dim)', flexShrink: 0 }}>
                    <span><strong style={{ color: 'var(--text)' }}>{futureSessions.length}</strong> upcoming</span>
                    <span><strong style={{ color: 'var(--text)' }}>{pastSessions.length}</strong> past</span>
                    {hasPkg && (
                      <span style={{ color: remaining <= 0 ? 'var(--danger)' : remaining <= 3 ? 'var(--warning)' : 'var(--success)' }}>
                        <strong>{remaining}</strong> left
                      </span>
                    )}
                    <span>{clientGoals.length} goal{clientGoals.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                    <button className="btn btn-ghost btn-sm" onClick={() => openEditClient(c)}><Edit2 size={14} /></button>
                    {!c._auto && <button className="btn btn-ghost btn-sm" onClick={() => deleteClient(c.id)}><Trash2 size={14} /></button>}
                  </div>
                </div>

                {/* Expanded content */}
                {isExpanded && (
                  <div style={{ padding: '0 1rem 1rem', borderTop: '1px solid var(--border)' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '0.75rem' }}>
                      {/* Left column: Info + Plan */}
                      <div>
                        {/* Contact info */}
                        {(c.email || c.phone || c.notes) && (
                          <div style={{ marginBottom: '0.75rem' }}>
                            {c.email && <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>{c.email}</p>}
                            {c.phone && <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>{c.phone}</p>}
                            {c.notes && <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginTop: '0.3rem' }}>{c.notes}</p>}
                          </div>
                        )}

                        {/* Training Plan */}
                        <div style={{ marginBottom: '0.75rem' }}>
                          <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <FileText size={12} /> Training Plan
                          </label>
                          <textarea
                            value={plan}
                            onChange={e => savePlan(c.name, e.target.value)}
                            placeholder="Write training plan, notes, schedule preferences..."
                            style={{ minHeight: 80, fontSize: '0.8rem' }}
                          />
                        </div>

                        {/* Goals */}
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                            <label className="form-label" style={{ margin: 0 }}>Goals</label>
                            <button className="btn btn-ghost btn-sm" onClick={() => openAddGoal(c.name)} style={{ padding: '0.2rem 0.5rem' }}><Plus size={12} /></button>
                          </div>
                          {clientGoals.length === 0 ? (
                            <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', fontStyle: 'italic' }}>No goals set</p>
                          ) : (
                            clientGoals.map(g => {
                              const pct = g.target > 0 ? Math.min(100, Math.round((g.current / g.target) * 100)) : 0;
                              const achieved = g.target > 0 && g.current >= g.target;
                              return (
                                <div key={g.id} className="goal-item">
                                  {achieved ? <CheckCircle size={14} color="var(--success)" style={{ flexShrink: 0 }} /> : <Target size={14} color="var(--accent)" style={{ flexShrink: 0 }} />}
                                  <div className="goal-info">
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.2rem' }}>
                                      <span>{g.goal}</span>
                                      {g.target > 0 && <span style={{ color: achieved ? 'var(--success)' : 'var(--text-dim)' }}>{g.current}/{g.target} {g.unit}</span>}
                                    </div>
                                    {g.target > 0 && (
                                      <div className="progress-bar"><div className="progress-fill" style={{ width: `${pct}%`, background: achieved ? 'var(--success)' : 'var(--accent)' }} /></div>
                                    )}
                                  </div>
                                  <input type="number" value={g.current} onChange={e => updateGoalProgress(g.id, e.target.value)} style={{ width: 55, padding: '0.2rem 0.4rem', fontSize: '0.75rem', flexShrink: 0 }} />
                                  <button className="btn btn-ghost btn-sm" onClick={() => deleteGoal(g.id)} style={{ padding: '0.15rem', flexShrink: 0 }}><X size={12} /></button>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>

                      {/* Right column: Sessions + Workout Log */}
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                          <label className="form-label" style={{ margin: 0 }}>Sessions & Workout Log</label>
                          {clientSessions.length > 0 && (
                            <button className="btn btn-ghost btn-sm" onClick={() => { setExportClient(c.name); setExportRange({ from: pastSessions.length > 0 ? pastSessions[pastSessions.length - 1].date : '', to: today }); }}>
                              <Download size={12} /> Export
                            </button>
                          )}
                        </div>
                        <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                          {futureSessions.length > 0 && (
                            <>
                              <div style={{ fontSize: '0.7rem', color: 'var(--accent)', fontWeight: 600, marginBottom: '0.3rem' }}>UPCOMING</div>
                              {futureSessions.map(s => (
                                <div key={s.id} style={{ fontSize: '0.8rem', padding: '0.3rem 0', borderBottom: '1px solid rgba(42,46,61,0.3)' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                      {s.flag && s.flag !== 'none' && <Flag size={12} color={FLAG_COLORS[s.flag]} fill={FLAG_COLORS[s.flag]} />}
                                      {s.date} <span style={{ color: 'var(--text-dim)' }}>{s.time}</span>
                                    </span>
                                    <span style={{ color: 'var(--text-dim)' }}>{s.duration}m {s.classType && `- ${s.classType}`}</span>
                                  </div>
                                  {s.notes && <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '0.15rem', whiteSpace: 'pre-wrap' }}>{s.notes}</div>}
                                </div>
                              ))}
                            </>
                          )}
                          {pastSessions.length > 0 && (
                            <>
                              <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 600, marginBottom: '0.3rem', marginTop: '0.5rem' }}>RECENT</div>
                              {pastSessions.slice(0, 15).map(s => {
                                const status = s.status || 'completed';
                                const exercises = s.exercises || [];
                                return (
                                  <div key={s.id} style={{ fontSize: '0.8rem', padding: '0.3rem 0', borderBottom: '1px solid rgba(42,46,61,0.3)', opacity: status === 'no-show' ? 0.5 : 0.85 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                        {s.flag && s.flag !== 'none' && <Flag size={12} color={FLAG_COLORS[s.flag]} fill={FLAG_COLORS[s.flag]} />}
                                        {s.date} <span style={{ color: 'var(--text-dim)' }}>{s.time}</span>
                                        {status === 'no-show' && <span style={{ color: 'var(--danger)', marginLeft: 4, fontSize: '0.7rem' }}>(no-show)</span>}
                                      </span>
                                      <span style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>{s.classType || ''}</span>
                                    </div>
                                    {s.notes && <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '0.15rem', whiteSpace: 'pre-wrap' }}>{s.notes}</div>}
                                    {exercises.length > 0 && (
                                      <div style={{ marginTop: '0.2rem', paddingLeft: '0.5rem', borderLeft: '2px solid var(--border)' }}>
                                        {exercises.map((ex, ei) => (
                                          <div key={ei} style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                                            {ex.name}{ex.sets && ` ${ex.sets}x${ex.reps || '?'}`}{ex.weight && ` @${ex.weight}`}{ex.notes && ` - ${ex.notes}`}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                              {pastSessions.length > 15 && <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '0.3rem' }}>+{pastSessions.length - 15} more</p>}
                            </>
                          )}
                          {clientSessions.length === 0 && <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', fontStyle: 'italic' }}>No sessions</p>}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Client Modal */}
      {showClientModal && (
        <div className="modal-overlay" onClick={() => setShowClientModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">{editId ? 'Edit' : 'Add'} Client</h2>
            <div className="form-group">
              <label className="form-label">Name</label>
              <input value={clientForm.name} onChange={e => setClientForm({ ...clientForm, name: e.target.value })} placeholder="Full name" />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Email</label>
                <input type="email" value={clientForm.email} onChange={e => setClientForm({ ...clientForm, email: e.target.value })} placeholder="email@example.com" />
              </div>
              <div className="form-group">
                <label className="form-label">Phone</label>
                <input value={clientForm.phone} onChange={e => setClientForm({ ...clientForm, phone: e.target.value })} placeholder="(555) 123-4567" />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Notes</label>
              <textarea value={clientForm.notes} onChange={e => setClientForm({ ...clientForm, notes: e.target.value })} placeholder="Medical conditions, preferences..." />
            </div>
            <div className="form-group">
              <label className="form-label">Training Plan</label>
              <textarea value={clientForm.plan} onChange={e => setClientForm({ ...clientForm, plan: e.target.value })} placeholder="Training plan, schedule preferences..." />
            </div>
            <div className="form-group">
              <label className="form-label">Calendar Color</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <input type="color" value={clientForm.color || '#6c63ff'} onChange={e => setClientForm({ ...clientForm, color: e.target.value })} style={{ width: 40, height: 32, padding: 2, cursor: 'pointer' }} />
                <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>{clientForm.color || 'Default'}</span>
                {clientForm.color && <button className="btn btn-ghost btn-sm" onClick={() => setClientForm({ ...clientForm, color: '' })}>Reset</button>}
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowClientModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveClient}>{editId ? 'Save' : 'Add'} Client</button>
            </div>
          </div>
        </div>
      )}

      {/* Goal Modal */}
      {showGoalModal && (
        <div className="modal-overlay" onClick={() => setShowGoalModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">Add Goal for {goalForClient}</h2>
            <div className="form-group">
              <label className="form-label">Goal</label>
              <input value={goalForm.goal} onChange={e => setGoalForm({ ...goalForm, goal: e.target.value })} placeholder="e.g. Lose 20 lbs, Run 5K, Bench 225" />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Target Value</label>
                <input type="number" value={goalForm.target} onChange={e => setGoalForm({ ...goalForm, target: e.target.value })} placeholder="20" />
              </div>
              <div className="form-group">
                <label className="form-label">Unit</label>
                <input value={goalForm.unit} onChange={e => setGoalForm({ ...goalForm, unit: e.target.value })} placeholder="lbs, miles, reps" />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Starting Value</label>
                <input type="number" value={goalForm.current} onChange={e => setGoalForm({ ...goalForm, current: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Deadline</label>
                <input type="date" value={goalForm.deadline} onChange={e => setGoalForm({ ...goalForm, deadline: e.target.value })} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Notes</label>
              <textarea value={goalForm.notes} onChange={e => setGoalForm({ ...goalForm, notes: e.target.value })} placeholder="Training notes..." />
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowGoalModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={addGoal}>Add Goal</button>
            </div>
          </div>
        </div>
      )}
      {/* Export Workout Log Modal */}
      {exportClient && (
        <div className="modal-overlay" onClick={() => setExportClient(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <h2 className="modal-title"><Download size={16} style={{ display: 'inline', marginRight: 6 }} />Export Workout Log</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '1rem' }}>{exportClient}</p>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">From</label>
                <input type="date" value={exportRange.from} onChange={e => setExportRange({ ...exportRange, from: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">To</label>
                <input type="date" value={exportRange.to} onChange={e => setExportRange({ ...exportRange, to: e.target.value })} />
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setExportClient(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => {
                const sessions = schedule
                  .filter(s => s.clientName === exportClient && (!exportRange.from || s.date >= exportRange.from) && (!exportRange.to || s.date <= exportRange.to))
                  .sort((a, b) => a.date === b.date ? (a.time || '').localeCompare(b.time || '') : a.date.localeCompare(b.date));
                const client = clients.find(c => c.name === exportClient);
                const clientGoals = goals.filter(g => g.clientName === exportClient);

                const wb = XLSX.utils.book_new();

                // Info sheet
                const infoData = [
                  ['Workout Log', exportClient],
                  ['Period', `${exportRange.from || 'start'} to ${exportRange.to || 'present'}`],
                  ['Total Sessions', sessions.length],
                ];
                if (client?.email) infoData.push(['Email', client.email]);
                if (client?.phone) infoData.push(['Phone', client.phone]);
                if (client?.plan) { infoData.push([]); infoData.push(['Training Plan']); infoData.push([client.plan]); }
                if (clientGoals.length > 0) {
                  infoData.push([]); infoData.push(['Goals']);
                  infoData.push(['Goal', 'Current', 'Target', 'Unit', 'Progress', 'Deadline']);
                  clientGoals.forEach(g => {
                    const pct = g.target > 0 ? Math.round((g.current / g.target) * 100) + '%' : '';
                    infoData.push([g.goal, g.current, g.target, g.unit, pct, g.deadline || '']);
                  });
                }
                const wsInfo = XLSX.utils.aoa_to_sheet(infoData);
                wsInfo['!cols'] = [{ wch: 20 }, { wch: 30 }];
                XLSX.utils.book_append_sheet(wb, wsInfo, 'Info');

                // Sessions sheet
                const sessRows = [['Date', 'Time', 'Duration (min)', 'Status', 'Class Type', 'Notes']];
                sessions.forEach(s => {
                  sessRows.push([s.date, s.time, parseInt(s.duration) || 60, s.status || 'scheduled', s.classType || '', s.notes || '']);
                });
                const wsSess = XLSX.utils.aoa_to_sheet(sessRows);
                wsSess['!cols'] = [{ wch: 12 }, { wch: 8 }, { wch: 12 }, { wch: 10 }, { wch: 15 }, { wch: 30 }];
                XLSX.utils.book_append_sheet(wb, wsSess, 'Sessions');

                // Exercises sheet - one row per exercise with session date
                const exRows = [['Date', 'Time', 'Exercise', 'Sets', 'Reps', 'Weight', 'Notes']];
                sessions.forEach(s => {
                  (s.exercises || []).forEach(ex => {
                    exRows.push([s.date, s.time, ex.name || '', ex.sets || '', ex.reps || '', ex.weight || '', ex.notes || '']);
                  });
                });
                if (exRows.length > 1) {
                  const wsEx = XLSX.utils.aoa_to_sheet(exRows);
                  wsEx['!cols'] = [{ wch: 12 }, { wch: 8 }, { wch: 20 }, { wch: 6 }, { wch: 6 }, { wch: 10 }, { wch: 25 }];
                  XLSX.utils.book_append_sheet(wb, wsEx, 'Exercises');
                }

                const filename = `${exportClient.replace(/[^a-zA-Z0-9]/g, '_')}_workout_log.xlsx`;
                XLSX.writeFile(wb, filename);
                setExportClient(null);
              }}>
                <Download size={14} /> Download
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
