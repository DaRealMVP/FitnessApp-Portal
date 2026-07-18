import { useAuth } from '../hooks/useAuth';
import { isCloudConfigured } from '../lib/cloudConfig';
import { isTrainer } from '../lib/roles';
import Auth from './Auth';
import UpdatePassword from './UpdatePassword';
import App from '../App';
import StudentPortal from './StudentPortal';

// Decides what to render after authentication:
// - Cloud not configured -> local-only trainer app (backward compatible)
// - Password recovery     -> set-new-password screen
// - Not signed in         -> login screen
// - Trainer email         -> full trainer app
// - Anyone else           -> read-only student portal
export default function Root() {
  const { session, ready, recovery, clearRecovery } = useAuth();

  if (!isCloudConfigured) return <App />;

  if (!ready) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)' }}>
        Loading…
      </div>
    );
  }

  if (recovery) return <UpdatePassword onDone={clearRecovery} />;

  if (!session) return <Auth />;

  return isTrainer(session.user.email) ? <App /> : <StudentPortal session={session} />;
}
