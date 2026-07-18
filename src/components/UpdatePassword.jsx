import { useState } from 'react';
import { KeyRound, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';

// Shown after a user clicks a password-recovery link. Supabase has already
// signed them in with a temporary recovery session; here they set a new password.
export default function UpdatePassword({ onDone }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('Use at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      onDone?.();
    } catch (err) {
      setError(err?.message || 'Could not update password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: '1.5rem',
    }}>
      <form onSubmit={submit} style={{
        width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column',
        gap: '0.85rem', background: 'var(--surface, #1a1a1a)', padding: '2rem',
        borderRadius: 16, boxShadow: '0 10px 40px rgba(0,0,0,0.35)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center', fontSize: '1.15rem', fontWeight: 700 }}>
          <KeyRound size={22} /> Set a new password
        </div>
        <input
          type="password" placeholder="New password" value={password}
          autoComplete="new-password" onChange={(e) => setPassword(e.target.value)}
          style={inputStyle}
        />
        <input
          type="password" placeholder="Confirm new password" value={confirm}
          autoComplete="new-password" onChange={(e) => setConfirm(e.target.value)}
          style={inputStyle}
        />
        {error && <div style={{ color: '#f87171', fontSize: '0.8rem' }}>{error}</div>}
        <button type="submit" className="btn btn-primary" disabled={busy}
          style={{ justifyContent: 'center', marginTop: '0.25rem' }}>
          <Check size={16} /> {busy ? 'Saving…' : 'Save Password'}
        </button>
      </form>
    </div>
  );
}

const inputStyle = {
  padding: '0.65rem 0.8rem', borderRadius: 8,
  border: '1px solid var(--border, #333)', background: 'var(--bg, #111)',
  color: 'var(--text, #eee)', fontSize: '0.9rem', width: '100%', boxSizing: 'border-box',
};
