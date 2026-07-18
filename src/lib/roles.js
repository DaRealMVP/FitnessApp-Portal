// Trainer identity. Anyone whose login email is in this list gets the full
// trainer app; everyone else gets the read-only student portal.
//
// Configure via VITE_TRAINER_EMAILS (comma-separated) or edit the fallback.
const raw =
  import.meta.env.VITE_TRAINER_EMAILS || 'liyifan0718@gmail.com';

export const TRAINER_EMAILS = raw
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export function isTrainer(email) {
  if (!email) return false;
  return TRAINER_EMAILS.includes(email.trim().toLowerCase());
}
