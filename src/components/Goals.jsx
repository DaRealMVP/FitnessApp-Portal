import { useState } from 'react';
import { Plus, Trash2, Target, CheckCircle } from 'lucide-react';

export default function Goals({ goals, setGoals, clients }) {
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ clientName: '', goal: '', target: '', current: '0', unit: '', deadline: '', notes: '' });

  const addGoal = () => {
    if (!form.clientName || !form.goal) return;
    setGoals([...goals, { ...form, id: Date.now(), current: parseFloat(form.current) || 0, target: parseFloat(form.target) || 0 }]);
    setForm({ clientName: '', goal: '', target: '', current: '0', unit: '', deadline: '', notes: '' });
    setShowModal(false);
  };

  const deleteGoal = (id) => setGoals(goals.filter(g => g.id !== id));

  const updateProgress = (id, value) => {
    setGoals(goals.map(g => g.id === id ? { ...g, current: parseFloat(value) || 0 } : g));
  };

  const clientNames = [...new Set(goals.map(g => g.clientName))];
  const [filter, setFilter] = useState('all');

  const filtered = filter === 'all' ? goals : goals.filter(g => g.clientName === filter);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Client Goals</h1>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}><Plus size={16} /> Add Goal</button>
      </div>

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-value">{goals.length}</div>
          <div className="stat-label">Total Goals</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{goals.filter(g => g.target > 0 && g.current >= g.target).length}</div>
          <div className="stat-label">Achieved</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{new Set(goals.map(g => g.clientName)).size}</div>
          <div className="stat-label">Clients with Goals</div>
        </div>
      </div>

      {clientNames.length > 0 && (
        <div className="tabs">
          <button className={`tab ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>All</button>
          {clientNames.map(name => (
            <button key={name} className={`tab ${filter === name ? 'active' : ''}`} onClick={() => setFilter(name)}>{name}</button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-dim)' }}>
          No goals set yet. Track your clients' progress by adding goals.
        </div>
      ) : (
        <div className="card-grid">
          {filtered.map(g => {
            const pct = g.target > 0 ? Math.min(100, Math.round((g.current / g.target) * 100)) : 0;
            const achieved = g.target > 0 && g.current >= g.target;
            return (
              <div className="card" key={g.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {achieved ? <CheckCircle size={18} color="var(--success)" /> : <Target size={18} color="var(--accent)" />}
                    <h3 style={{ fontSize: '1rem' }}>{g.goal}</h3>
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={() => deleteGoal(g.id)}><Trash2 size={14} /></button>
                </div>
                <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>{g.clientName}</p>

                {g.target > 0 && (
                  <div style={{ marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.3rem' }}>
                      <span>{g.current} / {g.target} {g.unit}</span>
                      <span style={{ color: achieved ? 'var(--success)' : 'var(--accent)' }}>{pct}%</span>
                    </div>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${pct}%`, background: achieved ? 'var(--success)' : 'var(--accent)' }} />
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <label className="form-label" style={{ margin: 0, whiteSpace: 'nowrap' }}>Update:</label>
                  <input
                    type="number"
                    value={g.current}
                    onChange={e => updateProgress(g.id, e.target.value)}
                    style={{ width: 100 }}
                  />
                  {g.unit && <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>{g.unit}</span>}
                </div>

                {g.deadline && <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Deadline: {g.deadline}</p>}
                {g.notes && <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginTop: '0.3rem' }}>{g.notes}</p>}
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">Add Goal</h2>
            <div className="form-group">
              <label className="form-label">Client Name</label>
              <input list="goal-clients" value={form.clientName} onChange={e => setForm({...form, clientName: e.target.value})} placeholder="Client name" />
              <datalist id="goal-clients">
                {clients.map(c => <option key={c.id} value={c.name} />)}
              </datalist>
            </div>
            <div className="form-group">
              <label className="form-label">Goal</label>
              <input value={form.goal} onChange={e => setForm({...form, goal: e.target.value})} placeholder="e.g. Lose 20 lbs, Run a 5K, Bench 225" />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Target Value</label>
                <input type="number" value={form.target} onChange={e => setForm({...form, target: e.target.value})} placeholder="e.g. 20" />
              </div>
              <div className="form-group">
                <label className="form-label">Unit</label>
                <input value={form.unit} onChange={e => setForm({...form, unit: e.target.value})} placeholder="e.g. lbs, miles, reps" />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Starting Value</label>
                <input type="number" value={form.current} onChange={e => setForm({...form, current: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Deadline</label>
                <input type="date" value={form.deadline} onChange={e => setForm({...form, deadline: e.target.value})} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Notes</label>
              <textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder="Training notes, milestones..." />
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={addGoal}>Add Goal</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
