import { useState } from 'react';
import { Plus, Trash2, Edit2 } from 'lucide-react';

export default function Classes({ classes, setClasses }) {
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', capacity: '', price: '', duration: '60', category: '' });

  const openAdd = () => {
    setForm({ name: '', description: '', capacity: '', price: '', duration: '60', category: '' });
    setEditId(null);
    setShowModal(true);
  };

  const openEdit = (cls) => {
    setForm({ name: cls.name, description: cls.description, capacity: cls.capacity, price: cls.price, duration: cls.duration, category: cls.category });
    setEditId(cls.id);
    setShowModal(true);
  };

  const save = () => {
    if (!form.name) return;
    if (editId) {
      setClasses(classes.map(c => c.id === editId ? { ...c, ...form } : c));
    } else {
      setClasses([...classes, { ...form, id: Date.now() + Math.random() }]);
    }
    setShowModal(false);
  };

  const deleteClass = (id) => setClasses(classes.filter(c => c.id !== id));

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Class Details</h1>
        <button className="btn btn-primary" onClick={openAdd}><Plus size={16} /> Add Class</button>
      </div>

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-value">{classes.length}</div>
          <div className="stat-label">Total Classes</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{new Set(classes.map(c => c.category).filter(Boolean)).size}</div>
          <div className="stat-label">Categories</div>
        </div>
      </div>

      {classes.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-dim)' }}>
          No classes defined yet. Add your first class type.
        </div>
      ) : (
        <div className="card-grid">
          {classes.map(cls => (
            <div className="card" key={cls.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                <div>
                  <h3 style={{ fontSize: '1.1rem' }}>{cls.name}</h3>
                  {cls.category && <span className="badge badge-paid" style={{ marginTop: '0.3rem' }}>{cls.category}</span>}
                </div>
                <div style={{ display: 'flex', gap: '0.3rem' }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => openEdit(cls)}><Edit2 size={14} /></button>
                  <button className="btn btn-ghost btn-sm" onClick={() => deleteClass(cls.id)}><Trash2 size={14} /></button>
                </div>
              </div>
              {cls.description && <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>{cls.description}</p>}
              <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.85rem' }}>
                {cls.duration && <span><strong>{cls.duration}</strong> min</span>}
                {cls.capacity && <span><strong>{cls.capacity}</strong> capacity</span>}
                {cls.price && <span><strong>${cls.price}</strong>/session</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">{editId ? 'Edit' : 'Add'} Class</h2>
            <div className="form-group">
              <label className="form-label">Class Name</label>
              <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="e.g. HIIT Training" />
            </div>
            <div className="form-group">
              <label className="form-label">Category</label>
              <input value={form.category} onChange={e => setForm({...form, category: e.target.value})} placeholder="e.g. Strength, Cardio, Flexibility" />
            </div>
            <div className="form-group">
              <label className="form-label">Description</label>
              <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="Class description..." />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Duration (min)</label>
                <input type="number" value={form.duration} onChange={e => setForm({...form, duration: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Capacity</label>
                <input type="number" value={form.capacity} onChange={e => setForm({...form, capacity: e.target.value})} placeholder="Max participants" />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Price per Session ($)</label>
              <input type="number" value={form.price} onChange={e => setForm({...form, price: e.target.value})} placeholder="0.00" />
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={save}>{editId ? 'Save' : 'Add'} Class</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
