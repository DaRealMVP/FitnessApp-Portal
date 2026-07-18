import { useState, useEffect, useCallback } from 'react';
import { useLocalStorage } from './hooks/useLocalStorage';
import { useAuth } from './hooks/useAuth';
import { useCloudSync } from './hooks/useCloudSync';
import { supabase } from './lib/supabase';
import { isCloudConfigured } from './lib/cloudConfig';
import Schedule from './components/Schedule';
import Payments from './components/Payments';
import Clients from './components/Clients';
import { Calendar, DollarSign, Users, Dumbbell, Download, Upload, LogOut, Cloud, CloudOff } from 'lucide-react';
import './App.css';

const VERSION = '2.0.0';
const AUTOSAVE_KEY = 'eve-fitness-autosave';
const AUTOSAVE_INTERVAL = 30 * 60 * 1000; // 30 minutes

const NAV = [
  { key: 'schedule', label: 'Schedule', icon: Calendar },
  { key: 'clients', label: 'Clients', icon: Users },
  { key: 'payments', label: 'Payments', icon: DollarSign },
];

export default function App() {
  const [page, setPage] = useState('schedule');
  const [schedule, setSchedule] = useLocalStorage('trainer-schedule', []);
  const [payments, setPayments] = useLocalStorage('trainer-payments', []);
  const [goals, setGoals] = useLocalStorage('trainer-goals', []);
  const [clients, setClients] = useLocalStorage('trainer-clients', []);

  // Cloud sync (only active when Supabase is configured)
  const { session } = useAuth();
  const { status: syncStatus } = useCloudSync({
    session,
    data: { schedule, payments, goals, clients },
    setters: { setSchedule, setPayments, setGoals, setClients },
  });

  const signOut = async () => { if (supabase) await supabase.auth.signOut(); };

  // Autosave: save a versioned backup every 30 min and on page close
  const saveBackup = useCallback(() => {
    try {
      const data = { schedule, payments, goals, clients, version: VERSION, savedAt: new Date().toISOString() };
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(data));
      // Keep last 3 backups
      const history = JSON.parse(localStorage.getItem(AUTOSAVE_KEY + '-history') || '[]');
      history.unshift({ savedAt: data.savedAt, data: JSON.stringify(data) });
      if (history.length > 3) history.length = 3;
      localStorage.setItem(AUTOSAVE_KEY + '-history', JSON.stringify(history));
    } catch { /* localStorage full - ignore */ }
  }, [schedule, payments, goals, clients]);

  // Auto-download backup on page close — max once per 24 hours
  const BACKUP_TIMESTAMP_KEY = 'eve-fitness-last-backup';
  const autoDownloadBackup = useCallback(() => {
    try {
      if (schedule.length === 0 && clients.length === 0 && payments.length === 0) return;
      const lastBackup = localStorage.getItem(BACKUP_TIMESTAMP_KEY);
      if (lastBackup && Date.now() - parseInt(lastBackup) < 48 * 60 * 60 * 1000) return;
      localStorage.setItem(BACKUP_TIMESTAMP_KEY, String(Date.now()));
      const data = { schedule, payments, goals, clients, version: VERSION, exportedAt: new Date().toISOString() };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `eve-fitness-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
    } catch { /* ignore */ }
  }, [schedule, payments, goals, clients]);

  useEffect(() => {
    const interval = setInterval(saveBackup, AUTOSAVE_INTERVAL);
    const handleBeforeUnload = () => { saveBackup(); autoDownloadBackup(); };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => { clearInterval(interval); window.removeEventListener('beforeunload', handleBeforeUnload); };
  }, [saveBackup, autoDownloadBackup]);

  const exportData = () => {
    const data = { schedule, payments, goals, clients, version: VERSION, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `eve-fitness-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const importData = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);

        const counts = [
          data.schedule ? `${data.schedule.length} sessions` : null,
          data.clients ? `${data.clients.length} clients` : null,
          data.payments ? `${data.payments.length} payments` : null,
          data.goals ? `${data.goals.length} goals` : null,
        ].filter(Boolean).join(', ');

        const confirmed = confirm(
          `Import data from "${file.name}"?\n\n` +
          `This will replace ALL current data with:\n${counts || 'empty data'}\n\n` +
          `Current data will be lost. Continue?`
        );
        if (!confirmed) return;

        // Guard against silently wiping non-empty categories with an empty
        // array from the backup file (a common cause of "my payments vanished").
        const wouldEmpty = [];
        if (Array.isArray(data.schedule) && data.schedule.length === 0 && schedule.length > 0) wouldEmpty.push(`${schedule.length} sessions`);
        if (Array.isArray(data.payments) && data.payments.length === 0 && payments.length > 0) wouldEmpty.push(`${payments.length} payments`);
        if (Array.isArray(data.clients) && data.clients.length === 0 && clients.length > 0) wouldEmpty.push(`${clients.length} clients`);
        if (Array.isArray(data.goals) && data.goals.length === 0 && goals.length > 0) wouldEmpty.push(`${goals.length} goals`);
        if (wouldEmpty.length > 0) {
          const proceed = confirm(
            `WARNING: this backup is EMPTY for some categories that currently have data:\n` +
            `${wouldEmpty.join(', ')}\n\n` +
            `Importing will DELETE those. Are you absolutely sure?`
          );
          if (!proceed) return;
        }

        if (Array.isArray(data.schedule)) setSchedule(data.schedule);
        if (Array.isArray(data.payments)) setPayments(data.payments);
        if (Array.isArray(data.goals)) setGoals(data.goals);
        if (Array.isArray(data.clients)) setClients(data.clients);
        alert('Data imported successfully!');
      } catch {
        alert('Invalid backup file.');
      }
    };
    input.click();
  };

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <Dumbbell size={24} /> Eve Fitness
        </div>
        <nav className="sidebar-nav">
          {NAV.map(({ key, label, icon: Icon }) => (
            <button key={key} className={`nav-item ${page === key ? 'active' : ''}`} onClick={() => setPage(key)}>
              <Icon size={18} /> {label}
            </button>
          ))}
        </nav>
        <div style={{ marginTop: 'auto', padding: '0 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <button className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'center' }} onClick={exportData}>
            <Download size={14} /> Export Data
          </button>
          <button className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'center' }} onClick={importData}>
            <Upload size={14} /> Import Data
          </button>
          {isCloudConfigured && session && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem', fontSize: '0.65rem', color: 'var(--text-dim)', marginTop: '0.35rem' }}>
                {syncStatus === 'error'
                  ? <><CloudOff size={12} /> Sync error</>
                  : <><Cloud size={12} /> {syncStatus === 'saving' ? 'Saving…' : 'Synced'}</>}
              </div>
              <button className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'center' }} onClick={signOut}>
                <LogOut size={14} /> Sign Out
              </button>
              <div style={{ textAlign: 'center', fontSize: '0.6rem', color: 'var(--text-dim)' }}>{session.user.email}</div>
            </>
          )}
          <div style={{ textAlign: 'center', fontSize: '0.65rem', color: 'var(--text-dim)', marginTop: '0.75rem', lineHeight: 1.4 }}>
            v{VERSION}<br />&copy; <span title="AKA the smartest person on the planet" style={{ cursor: 'default' }}>Dr.Li</span> &mdash; All Rights Reserved
          </div>
        </div>
      </aside>
      <main className="main-content">
        {page === 'schedule' && <Schedule schedule={schedule} setSchedule={setSchedule} clients={clients} setClients={setClients} payments={payments} setPayments={setPayments} />}
        {page === 'clients' && <Clients clients={clients} setClients={setClients} goals={goals} setGoals={setGoals} schedule={schedule} setSchedule={setSchedule} payments={payments} setPayments={setPayments} />}
        {page === 'payments' && <Payments payments={payments} setPayments={setPayments} clients={clients} schedule={schedule} setSchedule={setSchedule} />}
      </main>
    </div>
  );
}
