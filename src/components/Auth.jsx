import { useState } from 'react';
import { Dumbbell, LogIn } from 'lucide-react';
import { supabase } from '../lib/supabase';

// Email + password login / signup screen. Shown when cloud sync is
// configured but the user isn't signed in yet.
export default function Auth() {
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    if (!email || !password) {
      setError('Enter your email and password.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (!data.session) {
          setMessage('Account created. Check your email to confirm, then sign in.');
          setMode('signin');
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      setError(err?.message || 'Something went wrong.');
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center', fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.25rem' }}>
          <Dumbbell size={24} /> Eve Fitness
        </div>
        <div style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
          {mode === 'signin' ? 'Sign in to sync your data' : 'Create your account'}
        </div>

        <input
          type="email" placeholder="Email" value={email} autoComplete="email"
          onChange={(e) => setEmail(e.target.value)}
          style={inputStyle}
        />
        <input
          type="password" placeholder="Password" value={password}
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          onChange={(e) => setPassword(e.target.value)}
          style={inputStyle}
        />

        {error && <div style={{ color: '#f87171', fontSize: '0.8rem' }}>{error}</div>}
        {message && <div style={{ color: '#4ade80', fontSize: '0.8rem' }}>{message}</div>}

        <button type="submit" className="btn btn-primary" disabled={busy}
          style={{ justifyContent: 'center', marginTop: '0.25rem' }}>
          <LogIn size={16} /> {busy ? 'Please wait…' : mode === 'signin' ? 'Sign In' : 'Sign Up'}
        </button>

        <button type="button" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); setMessage(''); }}
          style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: '0.8rem' }}>
          {mode === 'signin' ? "No account? Sign up" : 'Have an account? Sign in'}
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
