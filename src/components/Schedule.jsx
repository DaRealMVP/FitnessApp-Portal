import { useState, useRef, useMemo, Fragment } from 'react';
import { Plus, Upload, Trash2, FileText, Check, X, ChevronLeft, ChevronRight, DollarSign, Flag, Plane } from 'lucide-react';
import { startOfWeek, addDays, addWeeks, subWeeks, format, isSameDay, getDay } from 'date-fns';
import * as pdfjsLib from 'pdfjs-dist';
import workerText from 'pdfjs-dist/build/pdf.worker.min.mjs?raw';

const workerBlob = new Blob([workerText], { type: 'application/javascript' });
pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(workerBlob);

const HOUR_START = 5;
const HOUR_END = 22;
const SLOT_HEIGHT = 48;

// Reserved session name for personal (non-client) time. Excluded from stats.
const PERSONAL = 'Personal';

// Flag states cycle: none -> red -> yellow -> blue -> none
const FLAG_NEXT = { none: 'red', red: 'yellow', yellow: 'blue', blue: 'none' };
const FLAG_COLORS = { none: 'rgba(255,255,255,0.3)', red: '#f87171', yellow: '#fbbf24', blue: '#60a5fa' };

const SESSION_COLORS = [
  '#6c63ff', '#e05297', '#34d399', '#f59e0b', '#3b82f6',
  '#ef4444', '#8b5cf6', '#14b8a6', '#f97316', '#ec4899',
  '#06b6d4', '#84cc16', '#a855f7', '#22d3ee', '#fb923c',
];

function getClientColor(name, clients) {
  if (!name) return SESSION_COLORS[0];
  if (name === PERSONAL) return '#64748b';
  if (clients) {
    const c = clients.find(c => c.name === name);
    if (c && c.color) return c.color;
  }
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return SESSION_COLORS[Math.abs(hash) % SESSION_COLORS.length];
}

function getVacationForDate(clientName, date, clients) {
  if (!clientName || !date) return null;
  const client = clients.find(c => c.name === clientName);
  return (client?.vacations || []).find(v => date >= v.startDate && date <= v.endDate) || null;
}

function formatVacationRange(vacation) {
  const start = format(new Date(`${vacation.startDate}T00:00`), 'MMM d');
  const end = format(new Date(`${vacation.endDate}T00:00`), 'MMM d');
  return start === end ? start : `${start} - ${end}`;
}

function suggestNextSession(clientName, schedule) {
  const sessions = schedule.filter(s => s.clientName === clientName);
  if (sessions.length === 0) return null;
  const dayCounts = {};
  const timeCounts = {};
  for (const s of sessions) {
    const dow = getDay(new Date(s.date + 'T00:00'));
    dayCounts[dow] = (dayCounts[dow] || 0) + 1;
    timeCounts[s.time] = (timeCounts[s.time] || 0) + 1;
  }
  const bestDay = parseInt(Object.entries(dayCounts).sort((a, b) => b[1] - a[1])[0][0]);
  if (isNaN(bestDay)) return null;
  const bestTime = Object.entries(timeCounts).sort((a, b) => b[1] - a[1])[0][0];
  const bestDuration = sessions[sessions.length - 1].duration;
  const today = new Date();
  let nextDate = today;
  for (let i = 0; i < 8; i++) {
    if (getDay(nextDate) === bestDay && nextDate >= today) {
      const dateStr = format(nextDate, 'yyyy-MM-dd');
      if (!schedule.some(s => s.date === dateStr && s.time === bestTime)) {
        return { date: dateStr, time: bestTime, duration: bestDuration };
      }
    }
    nextDate = addDays(nextDate, 1);
  }
  nextDate = addDays(today, 7);
  let guard = 0;
  while (getDay(nextDate) !== bestDay && guard++ < 8) nextDate = addDays(nextDate, 1);
  return { date: format(nextDate, 'yyyy-MM-dd'), time: bestTime, duration: bestDuration };
}

// ============ PDF PARSER (unchanged logic) ============
function parseTime12(str) {
  const m = str.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!m) return null;
  let h = parseInt(m[1]); const min = parseInt(m[2]); const pm = m[3].toUpperCase() === 'PM';
  if (pm && h !== 12) h += 12; if (!pm && h === 12) h = 0;
  return { h, min, total: h * 60 + min };
}

function nearestDay(x, cols) {
  let best = cols[0], bestD = Infinity;
  for (const d of cols) { const dist = Math.abs(x - d.x); if (dist < bestD) { bestD = dist; best = d; } }
  return best;
}

function parseCalendarPdf(items) {
  const monthMap = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11,january:0,february:1,march:2,april:3,june:5,july:6,august:7,september:8,october:9,november:10,december:11 };
  let year = null; const months = [];
  const sortedByY = [...items].sort((a, b) => b.transform[5] - a.transform[5]);
  for (const item of sortedByY.slice(0, 50)) { const s = item.str.trim().toLowerCase(); if (!year && /^20\d{2}$/.test(s)) year = parseInt(s); if (s in monthMap && !months.includes(monthMap[s])) months.push(monthMap[s]); }
  if (!year) year = new Date().getFullYear();
  const dayRe = /^(\d{1,2})\s+(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/i;
  const dayColumns = [];
  for (const item of items) { const m = item.str.trim().match(dayRe); if (m) dayColumns.push({ dayNum: parseInt(m[1]), x: Math.round(item.transform[4]) }); }
  if (dayColumns.length < 7) { const dayNameItems = items.filter(i => /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/i.test(i.str.trim())); for (const dni of dayNameItems) { const dniY = Math.round(dni.transform[5]), dniX = Math.round(dni.transform[4]); for (const item of items) { if (Math.abs(Math.round(item.transform[5]) - dniY) > 3) continue; const num = parseInt(item.str.trim()); if (isNaN(num) || num < 1 || num > 31) continue; const itemX = Math.round(item.transform[4]); if (itemX < dniX && dniX - itemX < 30 && !dayColumns.find(d => d.dayNum === num && Math.abs(d.x - itemX) < 20)) dayColumns.push({ dayNum: num, x: itemX }); } } }
  dayColumns.sort((a, b) => a.x - b.x);
  if (dayColumns.length === 0) return [];
  let prevNum = 0, mi = months.length > 0 ? months[0] : 0;
  for (const col of dayColumns) { if (col.dayNum < prevNum && months.length > 1) mi = months[1]; col.date = `${year}-${String(mi + 1).padStart(2, '0')}-${String(col.dayNum).padStart(2, '0')}`; prevNum = col.dayNum; }
  const timeRangeRe = /(\d{1,2}:\d{2}\s*(?:AM|PM))\s*-\s*(\d{1,2}:\d{2}\s*(?:AM|PM))/i;
  const hourLabelRe = /^\d{1,2}(?:AM|PM)$/i;
  const capacityRe = /^\d+\/\d+$/;
  const clientItems = [], timeItems = [];
  const yGroups = {};
  for (const item of items) { const y = Math.round(item.transform[5]); if (!yGroups[y]) yGroups[y] = []; yGroups[y].push({ str: item.str, x: Math.round(item.transform[4]), w: Math.round(item.width || 0) }); }
  for (const [yStr, group] of Object.entries(yGroups)) {
    const y = parseInt(yStr); const fullText = group.map(g => g.str).join(' ');
    if (timeRangeRe.test(fullText)) { let i = 0; while (i < group.length) { const combined = group.slice(i, i + 5).map(g => g.str).join(' '); const tm = combined.match(timeRangeRe); if (tm) { timeItems.push({ startStr: tm[1], endStr: tm[2], x: group[i].x, y }); let skip = 0, acc = ''; for (let j = i; j < group.length; j++) { acc += (acc ? ' ' : '') + group[j].str; skip++; if (timeRangeRe.test(acc)) break; } i += skip; } else { i++; } } continue; }
    if (hourLabelRe.test(fullText.trim())) continue;
    const stripped = fullText.replace(/\s+/g, ' ').trim(); if (!stripped) continue;
    const segments = []; let seg = { items: [], startX: 0 };
    for (const item of group) { const s = item.str.trim(); if (!s) continue; if (seg.items.length > 0 && item.x - (seg.items[seg.items.length - 1].x + seg.items[seg.items.length - 1].w) > 40) { segments.push(seg); seg = { items: [], startX: item.x }; } if (seg.items.length === 0) seg.startX = item.x; seg.items.push(item); }
    if (seg.items.length > 0) segments.push(seg);
    for (const segment of segments) { const parts = segment.items.map(i => i.str.trim()).filter(Boolean); let name = ''; for (const p of parts) { if (p === '(' || p === ')' || capacityRe.test(p)) break; name += (name ? ' ' : '') + p; } name = name.trim(); if (!name || name.length > 80) continue; if (hourLabelRe.test(name)) continue; if (/^(Your calendar|Your calendars|Eve Tsai|Connect calendar|Share|Unlock|Grow|Calendar|Receptionist|Services|Customers|Payments|Integrations|Settings|Get Pro|Learn more|Help|PDT|All customer|Today|E)$/i.test(name)) continue; if (/^\d+\s+(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/i.test(name)) continue; if (/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/i.test(name)) continue; if (/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|January|February|March|April|June|July|August|September|October|November|December)$/i.test(name)) continue; if (/^20\d{2}$/.test(name) || /^\d+$/.test(name)) continue; clientItems.push({ name, x: segment.startX, y }); }
  }
  const sessions = [], usedClients = new Set();
  for (const ti of timeItems) { const start = parseTime12(ti.startStr), end = parseTime12(ti.endStr); if (!start || !end) continue; const day = nearestDay(ti.x, dayColumns); const duration = end.total - start.total; const timeStr = `${String(start.h).padStart(2, '0')}:${String(start.min).padStart(2, '0')}`; let bestClient = null, bestYDist = Infinity; for (let ci = 0; ci < clientItems.length; ci++) { if (usedClients.has(ci)) continue; const c = clientItems[ci]; const yDist = c.y - ti.y; if (yDist <= 0 || yDist > 20) continue; if (Math.abs(c.x - ti.x) > 60) continue; if (yDist < bestYDist) { bestYDist = yDist; bestClient = { idx: ci, ...c }; } } if (bestClient) { usedClients.add(bestClient.idx); sessions.push({ clientName: bestClient.name, date: day.date, time: timeStr, duration: String(duration > 0 ? duration : 60), classType: '', notes: '', exercises: [], id: Date.now() + Math.random() }); } }
  sessions.sort((a, b) => a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date));
  return sessions;
}

async function extractPdfItems(file) {
  const ab = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: ab }).promise;
  let all = [];
  for (let i = 1; i <= pdf.numPages; i++) { const p = await pdf.getPage(i); const c = await p.getTextContent(); all = all.concat(c.items); }
  return all;
}

// Compute remaining classes for a client from payments and schedule
function getClientRemaining(clientName, payments, schedule) {
  const bought = payments.filter(p => p.clientName === clientName).reduce((s, p) => s + (p.classesPurchased || 0), 0);
  const used = schedule.filter(s => s.clientName === clientName && (s.status === 'completed' || s.status === 'no-show' || (!s.status && s.date < new Date().toISOString().split('T')[0]))).length;
  return bought - used;
}

// For a specific session, check if it's past the client's class limit
// Only sessions chronologically AFTER classes run out should be flagged
function getSessionPaymentInfo(session, payments, schedule) {
  const name = session.clientName;
  if (!name || name === 'Single Class Pass' || name === PERSONAL) return { usedUp: false, lastClass: false };
  const bought = payments.filter(p => p.clientName === name).reduce((s, p) => s + (p.classesPurchased || 0), 0);
  if (bought === 0) return { usedUp: false, lastClass: false };
  // Get all used sessions for this client, sorted chronologically
  const usedSessions = schedule
    .filter(s => s.clientName === name && (s.status === 'completed' || s.status === 'no-show' || (!s.status && s.date < new Date().toISOString().split('T')[0])))
    .sort((a, b) => a.date === b.date ? (a.time || '').localeCompare(b.time || '') : a.date.localeCompare(b.date));
  // Find position of this session in the used list
  const idx = usedSessions.findIndex(s => s.id === session.id);
  if (idx === -1) {
    // Session not yet used — check if remaining classes <= 0
    const remaining = bought - usedSessions.length;
    return { usedUp: remaining <= 0, lastClass: false };
  }
  // Session is used — was it the Nth class where N > bought? (i.e. over limit)
  const position = idx + 1; // 1-based
  return { usedUp: position > bought, lastClass: position === bought };
}

// ============ COMPONENT ============
export default function Schedule({ schedule, setSchedule, clients, setClients, payments, setPayments }) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [viewMode, setViewMode] = useState('calendar'); // 'calendar' | 'list'
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(null); // session id
  const [showImportModal, setShowImportModal] = useState(false);
  const [showScpPayment, setShowScpPayment] = useState(null); // session id for SCP payment prompt
  const [showVacationModal, setShowVacationModal] = useState(false);
  const [parsedEntries, setParsedEntries] = useState([]);
  const [importing, setImporting] = useState(false);
  const [form, setForm] = useState({ clientName: '', date: '', time: '', duration: '60', classType: '', notes: '' });
  const [vacationForm, setVacationForm] = useState({ clientName: '', startDate: '', endDate: '', note: '' });
  const fileRef = useRef();

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const today = new Date();
  const todayStr = format(today, 'yyyy-MM-dd');

  // Merge client names from both clients list and schedule
  const allClientNames = useMemo(() => {
    const names = new Set(clients.map(c => c.name));
    schedule.forEach(s => { if (s.clientName) names.add(s.clientName); });
    names.delete(PERSONAL);
    return [...names].sort();
  }, [clients, schedule]);

  // Per-client remaining classes (for warnings)
  const clientRemaining = useMemo(() => {
    const map = {};
    allClientNames.forEach(name => { map[name] = getClientRemaining(name, payments, schedule); });
    return map;
  }, [allClientNames, payments, schedule]);

  const weekSessions = useMemo(() => {
    const start = format(weekDays[0], 'yyyy-MM-dd');
    const end = format(weekDays[6], 'yyyy-MM-dd');
    return schedule.filter(s => s.date >= start && s.date <= end);
  }, [schedule, weekDays]);

  const vacationsByDay = useMemo(() => {
    const byDay = {};
    weekDays.forEach(day => { byDay[format(day, 'yyyy-MM-dd')] = []; });
    clients.forEach(client => {
      (client.vacations || []).forEach(vacation => {
        weekDays.forEach(day => {
          const date = format(day, 'yyyy-MM-dd');
          if (date >= vacation.startDate && date <= vacation.endDate) {
            byDay[date].push({ client, vacation });
          }
        });
      });
    });
    return byDay;
  }, [clients, weekDays]);

  const weekStats = useMemo(() => {
    const counted = weekSessions.filter(s => s.clientName !== PERSONAL);
    const count = counted.length;
    const totalMins = counted.reduce((sum, s) => sum + (parseInt(s.duration) || 60), 0);
    const hours = totalMins / 60;
    return { count, hoursStr: Number.isInteger(hours) ? String(hours) : hours.toFixed(1) };
  }, [weekSessions]);

  // Detect conflicts: sessions that overlap in time on the same day
  const conflictIds = useMemo(() => {
    const ids = new Set();
    for (let i = 0; i < weekSessions.length; i++) {
      const a = weekSessions[i];
      const [ah, am] = (a.time || '00:00').split(':').map(Number);
      const aStart = ah * 60 + am;
      const aEnd = aStart + (parseInt(a.duration) || 60);
      for (let j = i + 1; j < weekSessions.length; j++) {
        const b = weekSessions[j];
        if (a.date !== b.date) continue;
        const [bh, bm] = (b.time || '00:00').split(':').map(Number);
        const bStart = bh * 60 + bm;
        const bEnd = bStart + (parseInt(b.duration) || 60);
        if (aStart < bEnd && bStart < aEnd) {
          ids.add(a.id);
          ids.add(b.id);
        }
      }
    }
    return ids;
  }, [weekSessions]);

  // Add session — auto-create client if new
  const addEntry = () => {
    const name = form.clientName === '__new__' ? (form._newName || '').trim() : (form.clientName || '').trim();
    if (!name || !form.date || !form.time) return;
    const vacation = getVacationForDate(name, form.date, clients);
    if (vacation) {
      const proceed = confirm(
        `${name} is on vacation ${formatVacationRange(vacation)}${vacation.note ? ` (${vacation.note})` : ''}.\n\nSchedule this class anyway?`
      );
      if (!proceed) return;
    }
    if (name !== PERSONAL) setClients(prev => prev.some(c => c.name === name) ? prev : [...prev, { id: Date.now() + Math.random(), name, email: '', phone: '', notes: '', plan: '' }]);
    setSchedule(prev => [...prev, { ...form, clientName: name, exercises: [], status: 'scheduled', id: Date.now() + Math.random() }]);
    setForm({ clientName: '', date: '', time: '', duration: '60', classType: '', notes: '' });
    setShowAddModal(false);
  };

  const deleteEntry = (id) => setSchedule(prev => prev.filter(s => s.id !== id));

  const updateSession = (id, updates) => {
    setSchedule(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  // Client selection — only suggest date/time if opened from button (not calendar click)
  const handleClientChange = (value) => {
    setForm(f => {
      if (value === '__new__') return { ...f, clientName: value };
      // If date/time were pre-filled by clicking a calendar cell, don't overwrite
      if (f._fromCell) return { ...f, clientName: value };
      const suggestion = suggestNextSession(value, schedule);
      if (suggestion) return { ...f, clientName: value, date: suggestion.date, time: suggestion.time, duration: suggestion.duration };
      return { ...f, clientName: value };
    });
  };

  // Open add modal from calendar click
  const openAddFromCell = (day, hour) => {
    setForm({ clientName: '', date: format(day, 'yyyy-MM-dd'), time: `${String(hour).padStart(2, '0')}:00`, duration: '60', classType: '', notes: '', _fromCell: true });
    setShowAddModal(true);
  };

  const openAddModal = () => {
    setForm({ clientName: '', date: '', time: '', duration: '60', classType: '', notes: '', _fromCell: false });
    setShowAddModal(true);
  };

  const openVacationModal = () => {
    setVacationForm({ clientName: '', startDate: '', endDate: '', note: '' });
    setShowVacationModal(true);
  };

  const addVacation = () => {
    const { clientName, startDate, endDate, note } = vacationForm;
    if (!clientName || !startDate || !endDate) return;
    if (endDate < startDate) {
      alert('Vacation end date must be on or after the start date.');
      return;
    }
    const vacation = { id: Date.now() + Math.random(), startDate, endDate, note: note.trim() };
    setClients(prev => {
      const existing = prev.find(c => c.name === clientName);
      if (existing) {
        return prev.map(c => c.name === clientName
          ? { ...c, vacations: [...(c.vacations || []), vacation] }
          : c);
      }
      return [...prev, { id: Date.now() + Math.random(), name: clientName, email: '', phone: '', notes: '', plan: '', vacations: [vacation] }];
    });
    setShowVacationModal(false);
  };

  const deleteVacation = (clientName, vacationId) => {
    setClients(prev => prev.map(c => c.name === clientName
      ? { ...c, vacations: (c.vacations || []).filter(v => v.id !== vacationId) }
      : c));
  };

  // PDF import
  const handlePdfUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setImporting(true);
    let all = [];
    for (const f of files) { try { const items = await extractPdfItems(f); all = all.concat(parseCalendarPdf(items)); } catch (err) { console.error(err); } }
    all.sort((a, b) => a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date));
    setParsedEntries(all);
    setShowImportModal(true);
    setImporting(false);
    e.target.value = '';
  };

  const importAllParsed = () => {
    const valid = parsedEntries.filter(e => e.clientName && e.date && e.time);
    if (!valid.length) return;
    setSchedule(prev => [...prev, ...valid.map(e => ({ ...e, status: e.status || 'scheduled', exercises: e.exercises || [], id: Date.now() + Math.random() }))]);
    setShowImportModal(false);
    setParsedEntries([]);
  };

  // Detail modal
  const detailSession = showDetailModal ? schedule.find(s => s.id === showDetailModal) : null;

  const addExercise = () => {
    if (!detailSession) return;
    const exercises = [...(detailSession.exercises || []), { name: '', sets: '', reps: '', weight: '', notes: '' }];
    updateSession(detailSession.id, { exercises });
  };

  const updateExercise = (idx, field, value) => {
    if (!detailSession) return;
    const exercises = (detailSession.exercises || []).map((ex, i) => i === idx ? { ...ex, [field]: value } : ex);
    updateSession(detailSession.id, { exercises });
  };

  const removeExercise = (idx) => {
    if (!detailSession) return;
    const exercises = (detailSession.exercises || []).filter((_, i) => i !== idx);
    updateSession(detailSession.id, { exercises });
  };

  // Hours for calendar
  const hours = [];
  for (let h = HOUR_START; h < HOUR_END; h++) hours.push(h);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Schedule</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-ghost" onClick={() => fileRef.current.click()} disabled={importing}>
            <Upload size={16} /> {importing ? 'Reading...' : 'Import PDF'}
          </button>
          <input ref={fileRef} type="file" accept=".pdf" multiple hidden onChange={handlePdfUpload} />
          <button className="btn btn-ghost" onClick={openVacationModal}>
            <Plane size={16} /> Add Vacation
          </button>
          <button className="btn btn-primary" onClick={openAddModal}>
            <Plus size={16} /> Add Session
          </button>
        </div>
      </div>

      {/* Calendar nav */}
      <div className="calendar-nav">
        <button className="btn btn-ghost btn-sm" onClick={() => setWeekStart(subWeeks(weekStart, 1))}><ChevronLeft size={16} /></button>
        <button className="btn btn-ghost btn-sm" onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}>Today</button>
        <button className="btn btn-ghost btn-sm" onClick={() => setWeekStart(addWeeks(weekStart, 1))}><ChevronRight size={16} /></button>
        <span className="week-label">{format(weekDays[0], 'MMM d')} - {format(weekDays[6], 'MMM d, yyyy')}</span>
        {weekStats.count > 0 && (
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
            {weekStats.count} session{weekStats.count !== 1 ? 's' : ''} · {weekStats.hoursStr} hrs
          </span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.25rem' }}>
          <button className={`btn btn-sm ${viewMode === 'calendar' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setViewMode('calendar')}>Grid</button>
          <button className={`btn btn-sm ${viewMode === 'list' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setViewMode('list')}>List</button>
        </div>
      </div>
      {conflictIds.size > 0 && (
        <div style={{ background: 'rgba(251,191,36,0.12)', border: '1px solid var(--warning)', borderRadius: 'var(--radius)', padding: '0.5rem 0.75rem', marginBottom: '0.75rem', fontSize: '0.8rem', color: 'var(--warning)' }}>
          {conflictIds.size / 2 | 0} time conflict{conflictIds.size > 2 ? 's' : ''} detected this week — overlapping sessions are highlighted
        </div>
      )}

      {/* ===== CALENDAR GRID VIEW ===== */}
      {viewMode === 'calendar' && (
        <div className="calendar-container">
          <div className="calendar-grid-wrapper">
            <div className="vacation-grid">
              <div className="vacation-label"><Plane size={13} /> Away</div>
              {weekDays.map(day => {
                const date = format(day, 'yyyy-MM-dd');
                return (
                  <div key={date} className="vacation-day">
                    {(vacationsByDay[date] || []).map(({ client, vacation }) => (
                      <div
                        key={`${client.id}-${vacation.id}`}
                        className="vacation-chip"
                        style={{ borderColor: client.color || getClientColor(client.name, clients) }}
                        title={`${client.name}: ${formatVacationRange(vacation)}${vacation.note ? ` - ${vacation.note}` : ''}`}
                      >
                        <span>{client.name}</span>
                        <button
                          type="button"
                          aria-label={`Delete ${client.name} vacation`}
                          onClick={() => deleteVacation(client.name, vacation.id)}
                        ><X size={10} /></button>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
            <div className="calendar-grid">
              <div className="calendar-corner" />
              {weekDays.map((day, i) => (
                <div key={i} className={`calendar-header-cell ${isSameDay(day, today) ? 'today' : ''}`}>
                  {format(day, 'EEE')}
                  <span className="day-num">{format(day, 'd')}</span>
                </div>
              ))}
              {hours.map(h => (
                <Fragment key={h}>
                  <div className="calendar-time-cell">
                    {h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`}
                  </div>
                  {weekDays.map((day, di) => {
                    const dateStr = format(day, 'yyyy-MM-dd');
                    const cellSessions = weekSessions.filter(s => {
                      if (s.date !== dateStr) return false;
                      const [sh] = (s.time || '0').split(':').map(Number);
                      return sh === h;
                    });
                    return (
                      <div key={di} className="calendar-day-col" onClick={(e) => {
                        if (e.target === e.currentTarget) openAddFromCell(day, h);
                      }}>
                        {cellSessions.map(s => {
                          const [, sm] = (s.time || '0:0').split(':').map(Number);
                          const dur = parseInt(s.duration) || 60;
                          const topOffset = (sm / 60) * SLOT_HEIGHT;
                          const height = (dur / 60) * SLOT_HEIGHT;
                          const color = getClientColor(s.clientName, clients);
                          const status = s.status || 'scheduled';
                          const flag = s.flag || 'none';
                          const payInfo = getSessionPaymentInfo(s, payments || [], schedule);
                          const hasConflict = conflictIds.has(s.id);
                          const isScp = s.clientName === 'Single Class Pass';
                          const scpPaid = isScp && (payments || []).some(p => p.sessionId === s.id);
                          const cycleStatus = (e) => {
                            e.stopPropagation();
                            updateSession(s.id, { status: status === 'scheduled' ? 'completed' : status === 'completed' ? 'no-show' : 'scheduled' });
                          };
                          const cycleFlag = (e) => {
                            e.stopPropagation();
                            updateSession(s.id, { flag: FLAG_NEXT[flag] });
                          };
                          const openScpPayment = (e) => {
                            e.stopPropagation();
                            if (!scpPaid) setShowScpPayment(s.id);
                          };
                          return (
                            <div key={s.id} className="calendar-session" style={{
                              top: topOffset, height: Math.max(height, 20),
                              background: status === 'no-show' ? color + '44' : color + 'cc',
                              border: hasConflict ? '2px solid var(--warning)' : payInfo.usedUp ? '2px solid var(--danger)' : payInfo.lastClass ? '2px solid var(--warning)' : isScp ? '1px dashed var(--warning)' : 'none',
                              textDecoration: status === 'no-show' ? 'line-through' : 'none',
                            }} onClick={(e) => { e.stopPropagation(); setShowDetailModal(s.id); }}>
                              {/* Checkmark - status toggle (all sessions) */}
                              <span onClick={cycleStatus} style={{
                                position: 'absolute', top: 1, right: isScp ? 18 : 2, fontSize: '0.6rem', fontWeight: 700,
                                color: status === 'completed' ? '#34d399' : status === 'no-show' ? '#f87171' : 'rgba(255,255,255,0.3)',
                                background: status !== 'scheduled' ? 'rgba(0,0,0,0.5)' : 'transparent',
                                borderRadius: '50%', width: 14, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 2,
                              }} title={`Status: ${status}`}>{status === 'completed' ? '\u2713' : status === 'no-show' ? '\u2717' : '\u2713'}</span>
                              {/* Flag toggle (all sessions): none -> red -> yellow -> blue */}
                              <span onClick={cycleFlag} style={{
                                position: 'absolute', top: 1, right: isScp ? 34 : 18,
                                width: 14, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                cursor: 'pointer', zIndex: 2,
                                background: flag !== 'none' ? 'rgba(0,0,0,0.5)' : 'transparent', borderRadius: 3,
                              }} title={flag === 'none' ? 'No flag — click to flag' : `Flag: ${flag}`}>
                                <Flag size={9} color={FLAG_COLORS[flag]} fill={flag === 'none' ? 'none' : FLAG_COLORS[flag]} strokeWidth={2.5} />
                              </span>
                              {/* Dollar sign - SCP payment (only for Single Class Pass) */}
                              {isScp && (
                                <span onClick={openScpPayment} style={{
                                  position: 'absolute', top: 1, right: 2, fontSize: '0.65rem', fontWeight: 700,
                                  color: scpPaid ? '#fbbf24' : 'rgba(255,255,255,0.2)',
                                  background: scpPaid ? 'rgba(0,0,0,0.5)' : 'transparent',
                                  borderRadius: 3, width: 14, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: scpPaid ? 'default' : 'pointer', zIndex: 2,
                                }} title={scpPaid ? 'Payment recorded' : 'Click to record payment'}>$</span>
                              )}
                              {payInfo.usedUp && !isScp && <span style={{ position: 'absolute', top: 1, right: 34, fontSize: '0.55rem', fontWeight: 700, color: 'var(--danger)', background: 'rgba(0,0,0,0.5)', borderRadius: 3, padding: '0 3px' }}>$</span>}
                              {payInfo.lastClass && !isScp && <span style={{ position: 'absolute', bottom: 1, right: 2, fontSize: '0.5rem', fontWeight: 700, color: 'var(--warning)', background: 'rgba(0,0,0,0.5)', borderRadius: 3, padding: '0 3px' }}>LAST</span>}
                              {hasConflict && <span style={{ position: 'absolute', top: 1, left: 2, fontSize: '0.55rem', fontWeight: 700, color: 'var(--warning)', background: 'rgba(0,0,0,0.5)', borderRadius: 3, padding: '0 3px' }}>!!</span>}
                              <div className="session-client" style={{ paddingRight: 16 }}>{s.clientName}</div>
                              {height > 26 && <div className="session-time">{s.time} ({dur}m)</div>}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </Fragment>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ===== LIST VIEW ===== */}
      {viewMode === 'list' && (
        <div className="card">
          {weekSessions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-dim)' }}>No sessions this week.</div>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr><th>Day</th><th>Time</th><th>Client</th><th>Duration</th><th>Type</th><th>Status</th><th>Flag</th><th></th><th></th></tr>
                </thead>
                <tbody>
                  {[...weekSessions].sort((a, b) => a.date === b.date ? (a.time || '').localeCompare(b.time || '') : a.date.localeCompare(b.date)).map(s => {
                    const status = s.status || 'scheduled';
                    const flag = s.flag || 'none';
                    const color = getClientColor(s.clientName, clients);
                    const hasConflict = conflictIds.has(s.id);
                    const payInfo = getSessionPaymentInfo(s, payments || [], schedule);
                    return (
                      <tr key={s.id} style={{
                        opacity: status === 'no-show' ? 0.5 : 1,
                        background: hasConflict ? 'rgba(251,191,36,0.08)' : undefined,
                      }}>
                        <td>
                          <span style={{ fontSize: '0.8rem' }}>{s.date}</span>
                          <br /><span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>{format(new Date(s.date + 'T00:00'), 'EEE')}</span>
                        </td>
                        <td style={{ fontWeight: 600 }}>{s.time}</td>
                        <td>
                          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: color, marginRight: 6 }} />
                          {s.clientName}
                          {payInfo.usedUp && <span style={{ color: 'var(--danger)', fontSize: '0.7rem', marginLeft: 4 }}>($)</span>}
                          {payInfo.lastClass && <span style={{ color: 'var(--warning)', fontSize: '0.7rem', marginLeft: 4 }}>(last)</span>}
                          {hasConflict && <span style={{ color: 'var(--warning)', fontSize: '0.7rem', marginLeft: 4 }}>(conflict)</span>}
                        </td>
                        <td>{s.duration || 60}m</td>
                        <td style={{ color: 'var(--text-dim)' }}>{s.classType || '-'}</td>
                        <td>
                          <button
                            className={`badge badge-${status === 'completed' ? 'paid' : status === 'no-show' ? 'overdue' : 'pending'}`}
                            style={{ cursor: 'pointer', border: 'none' }}
                            onClick={() => updateSession(s.id, { status: status === 'scheduled' ? 'completed' : status === 'completed' ? 'no-show' : 'scheduled' })}
                          >{status}</button>
                        </td>
                        <td>
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ padding: '0.2rem 0.4rem', cursor: 'pointer' }}
                            title={flag === 'none' ? 'No flag — click to flag' : `Flag: ${flag}`}
                            onClick={() => updateSession(s.id, { flag: FLAG_NEXT[flag] })}
                          ><Flag size={14} color={FLAG_COLORS[flag]} fill={flag === 'none' ? 'none' : FLAG_COLORS[flag]} /></button>
                        </td>
                        <td>
                          <button className="btn btn-ghost btn-sm" onClick={() => setShowDetailModal(s.id)} style={{ padding: '0.2rem 0.4rem' }}>details</button>
                        </td>
                        <td>
                          <button className="btn btn-ghost btn-sm" onClick={() => deleteEntry(s.id)}><Trash2 size={14} /></button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ===== ADD SESSION MODAL ===== */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">Add Session</h2>

            <div className="form-group">
              <label className="form-label">Client</label>
              <select value={form.clientName} onChange={e => handleClientChange(e.target.value)}>
                <option value="">Select client...</option>
                {allClientNames.map(name => <option key={name} value={name}>{name}</option>)}
                <option value="__new__">+ New Client</option>
                <option value={PERSONAL}>🧘 Personal Time</option>
              </select>
              {form.clientName === '__new__' && (
                <input
                  style={{ marginTop: '0.5rem' }}
                  value={form._newName || ''}
                  onChange={e => setForm({ ...form, _newName: e.target.value })}
                  placeholder="Type new client name..."
                  autoFocus
                />
              )}
              {form.clientName && form.clientName !== '__new__' && form.date && (
                getVacationForDate(form.clientName, form.date, clients) ? (
                  <p style={{ fontSize: '0.75rem', color: 'var(--warning)', marginTop: '0.3rem' }}>
                    <Plane size={12} style={{ verticalAlign: -2, marginRight: 4 }} />
                    This client is on vacation that day. You will be asked to confirm.
                  </p>
                ) : (
                  <p style={{ fontSize: '0.75rem', color: 'var(--accent)', marginTop: '0.3rem' }}>
                    Suggested based on previous sessions
                  </p>
                )
              )}
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Date</label>
                <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Time</label>
                <input type="time" value={form.time} onChange={e => setForm({ ...form, time: e.target.value })} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Class Type</label>
                <input value={form.classType} onChange={e => setForm({ ...form, classType: e.target.value })} placeholder="e.g. Strength, Cardio, Yoga" />
              </div>
              <div className="form-group">
                <label className="form-label">Duration (min)</label>
                <input type="number" value={form.duration} onChange={e => setForm({ ...form, duration: e.target.value })} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Notes</label>
              <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes..." />
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowAddModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={addEntry}>Add Session</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== ADD VACATION MODAL ===== */}
      {showVacationModal && (
        <div className="modal-overlay" onClick={() => setShowVacationModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <h2 className="modal-title"><Plane size={18} style={{ display: 'inline', marginRight: 8 }} />Add Client Vacation</h2>
            <div className="form-group">
              <label className="form-label">Client</label>
              <select value={vacationForm.clientName} onChange={e => setVacationForm({ ...vacationForm, clientName: e.target.value })}>
                <option value="">Select client...</option>
                {allClientNames.filter(name => name !== 'Single Class Pass').map(name => <option key={name} value={name}>{name}</option>)}
              </select>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Start date</label>
                <input type="date" value={vacationForm.startDate} onChange={e => setVacationForm({ ...vacationForm, startDate: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">End date</label>
                <input type="date" value={vacationForm.endDate} onChange={e => setVacationForm({ ...vacationForm, endDate: e.target.value })} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Note</label>
              <input value={vacationForm.note} onChange={e => setVacationForm({ ...vacationForm, note: e.target.value })} placeholder="Optional, e.g. Hawaii" />
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowVacationModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={addVacation}>Add Vacation</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== SESSION DETAIL MODAL ===== */}
      {detailSession && (
        <div className="modal-overlay" onClick={() => setShowDetailModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 600 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <div>
                <h2 className="modal-title" style={{ marginBottom: '0.25rem' }}>{detailSession.clientName}</h2>
                <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>
                  {detailSession.date} at {detailSession.time} ({detailSession.duration} min)
                  {detailSession.classType && ` - ${detailSession.classType}`}
                </p>
              </div>
              <button className="btn btn-danger btn-sm" onClick={() => { deleteEntry(detailSession.id); setShowDetailModal(null); }}>
                <Trash2 size={14} /> Delete
              </button>
            </div>

            {/* Status selector */}
            <div className="form-group">
              <label className="form-label">Status</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {[
                  { value: 'scheduled', label: 'Scheduled', color: 'var(--warning)' },
                  { value: 'completed', label: 'Completed', color: 'var(--success)' },
                  { value: 'no-show', label: 'No Show', color: 'var(--danger)' },
                ].map(opt => {
                  const active = (detailSession.status || 'scheduled') === opt.value;
                  return (
                    <button
                      key={opt.value}
                      className="btn btn-sm"
                      style={{
                        background: active ? opt.color + '22' : 'transparent',
                        color: active ? opt.color : 'var(--text-dim)',
                        border: `1px solid ${active ? opt.color : 'var(--border)'}`,
                        fontWeight: active ? 600 : 400,
                      }}
                      onClick={() => updateSession(detailSession.id, { status: opt.value })}
                    >{opt.label}</button>
                  );
                })}
              </div>
              {(() => {
                const rem = clientRemaining[detailSession.clientName];
                const hasPkg = (payments || []).some(p => p.clientName === detailSession.clientName);
                if (hasPkg && rem !== undefined && rem <= 0) {
                  return <p style={{ fontSize: '0.75rem', color: 'var(--danger)', marginTop: '0.4rem' }}>This client has used all purchased classes. Payment needed.</p>;
                }
                if (hasPkg && rem !== undefined) {
                  return <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '0.4rem' }}>{rem} class{rem !== 1 ? 'es' : ''} remaining</p>;
                }
                return null;
              })()}
            </div>

            {/* Flag selector */}
            <div className="form-group">
              <label className="form-label">Flag</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {['none', 'red', 'yellow', 'blue'].map(f => {
                  const active = (detailSession.flag || 'none') === f;
                  return (
                    <button
                      key={f}
                      className="btn btn-sm"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        background: active ? 'var(--border)' : 'transparent',
                        border: `1px solid ${active ? FLAG_COLORS[f] : 'var(--border)'}`,
                        color: 'var(--text-dim)', fontWeight: active ? 600 : 400, textTransform: 'capitalize',
                      }}
                      onClick={() => updateSession(detailSession.id, { flag: f })}
                    >
                      <Flag size={13} color={FLAG_COLORS[f]} fill={f === 'none' ? 'none' : FLAG_COLORS[f]} />
                      {f === 'none' ? 'None' : f}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Notes</label>
              <textarea value={detailSession.notes || ''} onChange={e => updateSession(detailSession.id, { notes: e.target.value })} placeholder="Session notes..." />
            </div>

            {/* Exercises / Workout log */}
            <div style={{ marginTop: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <label className="form-label" style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, color: 'var(--text)' }}>Workout Log</label>
                <button className="btn btn-ghost btn-sm" onClick={addExercise}><Plus size={14} /> Add Exercise</button>
              </div>

              {(detailSession.exercises || []).length === 0 ? (
                <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', textAlign: 'center', padding: '1rem' }}>
                  No exercises logged. Click "Add Exercise" to start tracking.
                </p>
              ) : (
                <>
                  <div className="exercise-row" style={{ marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 600 }}>EXERCISE</span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 600 }}>SETS</span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 600 }}>REPS</span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 600 }}>WEIGHT</span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 600 }}>NOTES</span>
                    <span />
                  </div>
                  {(detailSession.exercises || []).map((ex, i) => (
                    <div className="exercise-row" key={i}>
                      <input value={ex.name} onChange={e => updateExercise(i, 'name', e.target.value)} placeholder="Exercise name" />
                      <input value={ex.sets} onChange={e => updateExercise(i, 'sets', e.target.value)} placeholder="3" />
                      <input value={ex.reps} onChange={e => updateExercise(i, 'reps', e.target.value)} placeholder="10" />
                      <input value={ex.weight} onChange={e => updateExercise(i, 'weight', e.target.value)} placeholder="135 lb" />
                      <input value={ex.notes} onChange={e => updateExercise(i, 'notes', e.target.value)} placeholder="Notes" />
                      <button className="btn btn-ghost btn-sm" onClick={() => removeExercise(i)}><X size={14} /></button>
                    </div>
                  ))}
                </>
              )}
            </div>

            <div className="modal-actions">
              <button className="btn btn-primary" onClick={() => setShowDetailModal(null)}>Done</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== PDF IMPORT MODAL ===== */}
      {showImportModal && (
        <div className="modal-overlay" onClick={() => setShowImportModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 900, width: '95%' }}>
            <h2 className="modal-title"><FileText size={18} style={{ display: 'inline', marginRight: 8 }} />Import Schedule</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '0.75rem' }}>
              {parsedEntries.length} session{parsedEntries.length !== 1 ? 's' : ''} detected. Review below, then Import All.
            </p>
            {parsedEntries.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-dim)' }}>No sessions parsed.</div>
            ) : (
              <div className="table-wrapper" style={{ maxHeight: 450, overflowY: 'auto' }}>
                <table>
                  <thead><tr><th>Client</th><th>Date</th><th>Time</th><th>Duration</th><th></th></tr></thead>
                  <tbody>
                    {parsedEntries.map((entry, i) => (
                      <tr key={i} style={(!entry.clientName || !entry.date || !entry.time) ? { background: 'rgba(248,113,113,0.08)' } : {}}>
                        <td><input value={entry.clientName} onChange={e => setParsedEntries(p => p.map((en, j) => j === i ? { ...en, clientName: e.target.value } : en))} style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem' }} /></td>
                        <td><input type="date" value={entry.date} onChange={e => setParsedEntries(p => p.map((en, j) => j === i ? { ...en, date: e.target.value } : en))} style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem', width: 145 }} /></td>
                        <td><input type="time" value={entry.time} onChange={e => setParsedEntries(p => p.map((en, j) => j === i ? { ...en, time: e.target.value } : en))} style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem', width: 115 }} /></td>
                        <td><input value={entry.duration} onChange={e => setParsedEntries(p => p.map((en, j) => j === i ? { ...en, duration: e.target.value } : en))} style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem', width: 65 }} /></td>
                        <td><button className="btn btn-ghost btn-sm" onClick={() => setParsedEntries(p => p.filter((_, j) => j !== i))}><X size={14} /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowImportModal(false)}>Cancel</button>
              {parsedEntries.length > 0 && (
                <button className="btn btn-primary" onClick={importAllParsed}>
                  <Check size={14} /> Import {parsedEntries.filter(e => e.clientName && e.date && e.time).length} Sessions
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {/* ===== SINGLE CLASS PASS PAYMENT PROMPT ===== */}
      {showScpPayment && (() => {
        const session = schedule.find(s => s.id === showScpPayment);
        if (!session) return null;
        return (
          <div className="modal-overlay" onClick={() => setShowScpPayment(null)}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
              <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <DollarSign size={18} color="var(--warning)" /> Single Class Pass Payment
              </h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '1rem' }}>
                {session.date} at {session.time}
              </p>
              <div className="form-group">
                <label className="form-label">Payer Name</label>
                <input id="scp-payer" list="scp-payer-list" placeholder="Who is paying?" defaultValue="" />
                <datalist id="scp-payer-list">
                  {allClientNames.map(name => <option key={name} value={name} />)}
                </datalist>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Amount ($)</label>
                  <input id="scp-amount" type="number" step="0.01" placeholder="0.00" defaultValue="" />
                </div>
                <div className="form-group">
                  <label className="form-label">Method</label>
                  <select id="scp-method" defaultValue="">
                    <option value="">Select...</option>
                    <option value="Cash">Cash</option>
                    <option value="Card">Card</option>
                    <option value="Venmo">Venmo</option>
                    <option value="Zelle">Zelle</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>
              <div className="modal-actions">
                <button className="btn btn-ghost" onClick={() => setShowScpPayment(null)}>Cancel</button>
                <button className="btn btn-primary" onClick={() => {
                  const payer = (document.getElementById('scp-payer').value || '').trim();
                  const amount = parseFloat(document.getElementById('scp-amount').value);
                  const method = document.getElementById('scp-method').value;
                  if (!payer) { alert('Enter the payer name'); return; }
                  if (!amount || amount <= 0) { alert('Enter a valid amount'); return; }
                  setPayments(prev => [...prev, {
                    id: Date.now() + Math.random(),
                    clientName: 'Single Class Pass',
                    sessionId: session.id,
                    payer,
                    amount,
                    date: session.date,
                    status: 'paid',
                    method,
                    description: `${payer} - ${session.time}`,
                    classesPurchased: 0,
                  }]);
                  updateSession(session.id, { notes: (session.notes || '') + (session.notes ? '\n' : '') + `${payer} paid $${amount.toFixed(2)}` });
                  setShowScpPayment(null);
                }}>Record Payment</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
