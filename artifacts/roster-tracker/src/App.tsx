import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from 'react';
import { Link, Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import { CalendarDays, CalendarRange, ChevronLeft, ChevronRight, Clock3, Download, FileUp, Heart, ImagePlus, Moon, NotebookPen, Plus, Search, Settings2, Sun, Trash2, UsersRound, X, Edit3, CalendarCheck2, Sparkles } from 'lucide-react';
import { type DayType, type Entry, type EntryType, type Override, type Profile, type Store, DAY_TYPES, DEFAULT_DAY_TYPE_COLORS, ENTRY_TYPES, compressPhoto, dayTypeColor, fmtDate, localDate, normalizeStore, persistStore, readStore, rosterType, shiftDate, uid, validateStore } from '@/lib/roster';

type ViewMode = 'month' | 'three' | 'year';
const colors = ['#d9785c', '#4f8c83', '#d1a24e', '#7c82a9', '#b47786', '#6390a3', '#9b865c'];
const months = Array.from({ length: 12 }, (_, i) => new Date(2024, i, 1).toLocaleDateString(undefined, { month: 'long' }));
const today = localDate(new Date());
const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const dateParts = (date: string) => new Date(`${date}T12:00:00`);
const humanType = (type: EntryType) => type === 'custom' ? 'Custom' : type.charAt(0).toUpperCase() + type.slice(1);

function App() {
  return <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><RosterTracker /></WouterRouter>;
}

function RosterTracker() {
  const [store, setStore] = useState<Store>(() => readStore());
  const [location, setLocation] = useLocation();
  const [toast, setToast] = useState('');
  const [visibleDate, setVisibleDate] = useState(() => new Date());
  const [view, setView] = useState<ViewMode>('month');
  const [activeDay, setActiveDay] = useState<string | null>(null);
  const [editEntryId, setEditEntryId] = useState<string | null>(null);
  const [selectedProfile, setSelectedProfile] = useState('');
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', store.preferences.theme === 'dark');
  }, [store.preferences.theme]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const commit = (next: Store, successText = 'Saved on this device.') => {
    if (!persistStore(next)) {
      setToast('This change could not be saved. Your existing data is safe; try removing a large photo or exporting a backup.');
      return false;
    }
    setStore(next);
    setToast(successText);
    return true;
  };
  const update = (change: (current: Store) => Store, message?: string) => commit(change(store), message);
  const openDay = (date: string, entryId: string | null = null) => {
    setActiveDay(date);
    setEditEntryId(entryId);
  };
  const saveEntry = (entry: Entry) => {
    if (!update(current => {
      const exists = current.entries.some(e => e.id === entry.id);
      return { ...current, entries: exists ? current.entries.map(e => e.id === entry.id ? entry : e) : [...current.entries, entry] };
    }, 'Your note is tucked away.')) return;
    setEditEntryId(null);
  };
  const removeEntry = (id: string) => {
    if (!window.confirm('Delete this entry? This cannot be undone.')) return;
    update(current => ({ ...current, entries: current.entries.filter(e => e.id !== id) }), 'Entry deleted.');
    if (editEntryId === id) setEditEntryId(null);
  };
  const saveOverride = (override: Override) => update(current => ({
    ...current, overrides: current.overrides.some(o => o.id === override.id)
      ? current.overrides.map(o => o.id === override.id ? override : o)
      : [...current.overrides, override],
  }), 'Roster day updated.');
  const removeOverride = (id: string) => update(current => ({ ...current, overrides: current.overrides.filter(o => o.id !== id) }), 'Roster override removed.');
  const toggleProfile = (id: string) => update(current => ({ ...current, profiles: current.profiles.map(p => p.id === id ? { ...p, visible: !p.visible } : p) }), 'Calendar visibility updated.');
  const profileChanged = (profile: Profile) => update(current => ({
    ...current, profiles: current.profiles.some(p => p.id === profile.id) ? current.profiles.map(p => p.id === profile.id ? profile : p) : [...current.profiles, profile],
  }), 'Roster profile saved.');
  const deleteProfile = (id: string) => {
    if (!window.confirm('Remove this roster profile and its date overrides? Personal notes will remain.')) return;
    update(current => ({
      ...current,
      profiles: current.profiles.filter(p => p.id !== id),
      overrides: current.overrides.filter(o => o.profileId !== id),
      entries: current.entries.map(entry => entry.profileId === id ? { ...entry, profileId: undefined } : entry),
    }), 'Roster profile removed.');
  };
  const setTheme = (theme: 'light' | 'dark') => update(current => ({ ...current, preferences: { ...current.preferences, theme } }), 'Display preference saved.');
  const setCompact = (compact: boolean) => update(current => ({ ...current, preferences: { ...current.preferences, compact } }), 'Display preference saved.');
  const setShiftColor = (type: DayType, color: string) => {
    if (!/^#[0-9a-f]{6}$/i.test(color)) return;
    update(current => ({ ...current, preferences: { ...current.preferences, dayTypeColors: { ...DEFAULT_DAY_TYPE_COLORS, ...current.preferences.dayTypeColors, [type]: color } } }), 'Shift color saved.');
  };
  const resetShiftColors = () => update(current => ({ ...current, preferences: { ...current.preferences, dayTypeColors: { ...DEFAULT_DAY_TYPE_COLORS } } }), 'Shift colors restored.');
  const exportBackup = () => {
    const blob = new Blob([JSON.stringify({ format: 'roster-tracker', version: 1, exportedAt: new Date().toISOString(), data: store }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `roster-tracker-${today}.json`; a.click();
    URL.revokeObjectURL(url);
    setToast('Backup downloaded, including your photos.');
  };
  const importBackup = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 30 * 1024 * 1024) throw new Error('That backup is larger than 30 MB.');
      const parsed: unknown = JSON.parse(await file.text());
      let candidate: unknown = parsed;
      if (parsed && typeof parsed === 'object' && 'data' in parsed) {
        const wrapper = parsed as { format?: unknown; version?: unknown; data?: unknown };
        if (wrapper.format !== 'roster-tracker' || wrapper.version !== 1) throw new Error('This is not a supported Roster Tracker backup.');
        candidate = wrapper.data;
      }
      if (!validateStore(candidate)) throw new Error('The backup does not match the expected profile, roster, and entry format.');
      const data = normalizeStore(candidate as Store);
      if (data.overrides.some(o => !data.profiles.some(p => p.id === o.profileId)) || data.entries.some(e => e.profileId && !data.profiles.some(p => p.id === e.profileId))) {
        throw new Error('This backup refers to a profile that is missing. Your current data was not changed.');
      }
      if (!window.confirm(`Replace this device's roster with the ${data.profiles.length} profile and ${data.entries.length} entry backup? Export your current data first if you want to keep it.`)) return;
      if (!commit(data, 'Backup restored successfully.')) return;
      setSelectedProfile(data.profiles[0]?.id ?? '');
      setLocation('/');
    } catch (error) {
      setToast(error instanceof Error ? `${error.message} Current data is unchanged.` : 'Could not read this backup. Current data is unchanged.');
    } finally {
      if (importRef.current) importRef.current.value = '';
    }
  };
  const memoryUse = Math.min(100, Math.round(JSON.stringify(store).length / (5 * 1024 * 1024) * 100));

  return <div className="app-shell">
      <SideNav location={location} />
      <div className="main-area">
        <header className="topbar">
          <div className="crumb">A little more room to plan</div>
          <div className="top-actions">
            <span className="subtle">{store.profiles.length} {store.profiles.length === 1 ? 'roster' : 'rosters'}</span>
            <button className="icon-btn" type="button" data-testid="button-toggle-theme" aria-label="Toggle light or dark theme" onClick={() => setTheme(store.preferences.theme === 'light' ? 'dark' : 'light')}>
              {store.preferences.theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
            </button>
          </div>
        </header>
        <Switch>
          <Route path="/">
            <CalendarPage store={store} view={view} setView={setView} visibleDate={visibleDate} setVisibleDate={setVisibleDate} openDay={openDay} toggleProfile={toggleProfile} selectedProfile={selectedProfile} setSelectedProfile={setSelectedProfile} />
          </Route>
          <Route path="/timeline">
            <TimelinePage store={store} onEdit={(entry) => openDay(entry.date, entry.id)} onDelete={removeEntry} />
          </Route>
          <Route path="/settings">
            <SettingsPage store={store} onSave={profileChanged} onDelete={deleteProfile} onToggleProfile={toggleProfile} onTheme={setTheme} onCompact={setCompact} onShiftColor={setShiftColor} onResetShiftColors={resetShiftColors} onExport={exportBackup} onImport={() => importRef.current?.click()} memoryUse={memoryUse} />
          </Route>
          <Route>
            <main className="page-wrap"><div className="empty-state"><div className="empty-mark"><CalendarDays /></div><h3>That page isn't on the calendar.</h3><Link href="/" className="btn primary" data-testid="link-return-calendar">Back to calendar</Link></div></main>
          </Route>
        </Switch>
      </div>
      <MobileNav location={location} />
      <input ref={importRef} type="file" accept="application/json,.json" hidden data-testid="input-import-backup" onChange={e => void importBackup(e.target.files?.[0])} />
      {activeDay && <DaySheet date={activeDay} profiles={store.profiles} overrides={store.overrides} entries={store.entries.filter(e => e.date === activeDay)} selectedEntryId={editEntryId} setSelectedEntryId={setEditEntryId} onClose={() => setActiveDay(null)} onSaveOverride={saveOverride} onRemoveOverride={removeOverride} onSaveEntry={saveEntry} onDeleteEntry={removeEntry} />}
      {toast && <div className="toast-message" role="status" data-testid="status-app-message">{toast}</div>}
    </div>;
}

function SideNav({ location }: { location: string }) {
  return <aside className="sidebar">
    <Link href="/" className="brand" data-testid="link-brand-calendar"><span className="brand-mark"><CalendarRange size={20} /></span><span className="brand-copy"><span className="brand-name">Roster & days</span><span className="brand-kicker">your family almanac</span></span></Link>
    <div className="side-label">Your space</div>
    <nav className="side-nav">
      <Link href="/" className={`nav-link ${location === '/' ? 'active' : ''}`} data-testid="link-calendar"><CalendarDays size={17} /><span>Calendar</span></Link>
      <Link href="/timeline" className={`nav-link ${location === '/timeline' ? 'active' : ''}`} data-testid="link-timeline"><Clock3 size={17} /><span>Timeline</span></Link>
      <Link href="/settings" className={`nav-link ${location === '/settings' ? 'active' : ''}`} data-testid="link-settings"><Settings2 size={17} /><span>Settings</span></Link>
    </nav>
    <div className="sidebar-foot"><div className="sidebar-note">The shifts pass.<br />The good days stay.</div><div className="sidebar-date">{new Date().getFullYear()} · KEPT CLOSE</div></div>
  </aside>;
}

function MobileNav({ location }: { location: string }) {
  return <nav className="mobile-nav" aria-label="Main navigation">
    <Link href="/" className={`nav-link ${location === '/' ? 'active' : ''}`} data-testid="mobile-link-calendar"><CalendarDays size={16} /><span>Calendar</span></Link>
    <Link href="/timeline" className={`nav-link ${location === '/timeline' ? 'active' : ''}`} data-testid="mobile-link-timeline"><Clock3 size={16} /><span>Timeline</span></Link>
    <Link href="/settings" className={`nav-link ${location === '/settings' ? 'active' : ''}`} data-testid="mobile-link-settings"><Settings2 size={16} /><span>Settings</span></Link>
  </nav>;
}

type CalendarProps = { store: Store; view: ViewMode; setView: (view: ViewMode) => void; visibleDate: Date; setVisibleDate: (date: Date) => void; openDay: (date: string) => void; toggleProfile: (id: string) => void; selectedProfile: string; setSelectedProfile: (id: string) => void };
function CalendarPage({ store, view, setView, visibleDate, setVisibleDate, openDay, toggleProfile, selectedProfile, setSelectedProfile }: CalendarProps) {
  const [, setLocation] = useLocation();
  const year = visibleDate.getFullYear();
  const next = (dir: number) => setVisibleDate(new Date(year, visibleDate.getMonth() + dir * (view === 'month' ? 1 : view === 'three' ? 3 : 12), 1));
  const activeProfiles = store.profiles.filter(p => p.visible && p.enabled);
  const focusProfile = store.profiles.find(p => p.id === selectedProfile) ?? store.profiles[0];
  const stats = focusProfile ? calculateStats(focusProfile, year, store.overrides) : null;
  const title = view === 'year' ? String(year) : view === 'three' ? `${months[visibleDate.getMonth()].slice(0, 3)} – ${new Date(year, visibleDate.getMonth() + 2, 1).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}` : `${months[visibleDate.getMonth()]} ${year}`;
  return <main className="page-wrap">
    <div className="page-heading">
      <div><div className="eyebrow">Your time, together</div><h1 className="page-title">Make room for life.</h1><p className="page-subtitle">Work days, days off, and everything you want to remember.</p></div>
      <button className="btn primary" data-testid="button-add-today-entry" onClick={() => openDay(today)}><Plus size={15} /> Add to today</button>
    </div>
    <div className="calendar-layout">
      <section className="calendar-card" aria-label="Roster calendar">
        <div className="calendar-toolbar">
          <div className="toolbar-left">
            <button className="nav-arrow" aria-label="Previous period" data-testid="button-calendar-previous" onClick={() => next(-1)}><ChevronLeft size={16} /></button>
            <button className="nav-arrow" aria-label="Next period" data-testid="button-calendar-next" onClick={() => next(1)}><ChevronRight size={16} /></button>
            <div className="month-name" data-testid="text-calendar-period">{title}</div>
            <button className="btn small" data-testid="button-calendar-today" onClick={() => setVisibleDate(new Date())}>Today</button>
          </div>
          <div className="toolbar-right">
            <div className="jump-controls"><select aria-label="Jump to month" data-testid="select-calendar-month" value={visibleDate.getMonth()} onChange={e => setVisibleDate(new Date(year, Number(e.target.value), 1))}>{months.map((m, i) => <option value={i} key={m}>{m}</option>)}</select><YearJump year={year} month={visibleDate.getMonth()} setVisibleDate={setVisibleDate} /></div>
            <div className="segmented" role="group" aria-label="Calendar display">
              <button className={`seg-button ${view === 'month' ? 'selected' : ''}`} data-testid="button-view-month" onClick={() => setView('month')}>Month</button>
              <button className={`seg-button ${view === 'three' ? 'selected' : ''}`} data-testid="button-view-three-month" onClick={() => setView('three')}>3 Month</button>
              <button className={`seg-button ${view === 'year' ? 'selected' : ''}`} data-testid="button-view-year" onClick={() => setView('year')}>12 Month</button>
              <button className="seg-button" data-testid="button-view-timeline" onClick={() => setLocation('/timeline')}>Timeline</button>
            </div>
          </div>
        </div>
        {view === 'month' && <MonthGrid monthDate={visibleDate} profiles={activeProfiles} store={store} openDay={openDay} compact={store.preferences.compact} />}
        {view === 'three' && <div className="three-months">{[0, 1, 2].map(offset => <MiniMonth key={`${year}-${visibleDate.getMonth() + offset}`} date={new Date(year, visibleDate.getMonth() + offset, 1)} profiles={activeProfiles} store={store} openDay={openDay} />)}</div>}
        {view === 'year' && <div className="year-grid">{Array.from({ length: 12 }, (_, month) => <MiniMonth key={month} date={new Date(year, month, 1)} profiles={activeProfiles} store={store} openDay={openDay} compact />)}</div>}
     <div className="calendar-legend">
          {activeProfiles.map(p => <span className="legend-item" key={p.id} data-testid={`legend-profile-${p.id}`}><span className="legend-dot" style={{ background: p.color }} />{p.name}</span>)}
          {DAY_TYPES.map((type, index) => <span className="legend-item" key={type} data-testid={`legend-shift-${index}`}><span className="legend-dot" style={{ background: dayTypeColor(type, store.preferences.dayTypeColors) }} />{type === 'Day Shift' ? 'Day' : type === 'Night Shift' ? 'Night' : type === 'Days Off' ? 'Off' : type}</span>)}
        </div>
      </section>
      <aside className="stats-column">
        <div className="panel stats-panel">
          <h2 className="panel-heading">A year in view <CalendarCheck2 size={16} /></h2>
          <label className="form-field" style={{ marginBottom: 13 }}>Count whose year?
            <select data-testid="select-stats-profile" value={focusProfile?.id ?? ''} onChange={e => setSelectedProfile(e.target.value)}>{store.profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          </label>
          {stats && <>
            <div className="stat-feature" data-testid="stat-days-worked"><div className="stat-big">{stats.worked}</div><div className="stat-caption">days worked in {year}</div></div>
            <div className="stats-list">
              <div className="stat-row"><span>Night shifts</span><span className="stat-value" data-testid="stat-night-shifts">{stats.nights}</span></div>
              <div className="stat-row"><span>Leave used</span><span className="stat-value" data-testid="stat-leave-used">{stats.leave}{focusProfile?.annualAllowance ? ` / ${focusProfile.annualAllowance}` : ''}</span></div>
              <div className="stat-row"><span>Public holidays worked</span><span className="stat-value" data-testid="stat-public-holidays">{stats.holidays}</span></div>
              <div className="stat-row"><span>Longest break</span><span className="stat-value" data-testid="stat-longest-break">{stats.breakDays} days</span></div>
              <div className="stat-row"><span>Next leave begins</span><span className="stat-value" data-testid="stat-next-leave">{stats.nextLeave === null ? '—' : `${stats.nextLeave} days`}</span></div>
            </div>
          </>}
          {!focusProfile && <p className="subtle">Add a roster profile to see your year at a glance.</p>}
        </div>
        <div className="panel stats-panel">
          <h2 className="panel-heading">In this calendar <UsersRound size={16} /></h2>
          {store.profiles.length ? <div className="profile-switches">{store.profiles.map(p => <label className="profile-toggle" key={p.id} data-testid={`toggle-visible-${p.id}`}><input type="checkbox" checked={p.visible} onChange={() => toggleProfile(p.id)} /><span className="color-swatch" style={{ background: p.color }} /><span>{p.name}</span></label>)}</div> : <div className="subtle">No rosters yet. Add one in settings.</div>}
        </div>
        <div className="notice"><Sparkles size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />Work is one part of the story. Add a note to any day to keep the rest.</div>
      </aside>
    </div>
  </main>;
}

function YearJump({ year, month, setVisibleDate }: { year: number; month: number; setVisibleDate: (date: Date) => void }) {
  const [value, setValue] = useState(String(year));
  useEffect(() => setValue(String(year)), [year]);
  const commit = () => {
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 9999) setVisibleDate(new Date(parsed, month, 1));
    else setValue(String(year));
  };
  return <input type="number" min="1" max="9999" aria-label="Jump to year" data-testid="input-calendar-year" value={value} onChange={e => setValue(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} style={{ width: 82, padding: '6px 7px', fontSize: 11 }} />;
}

function buildMonthDays(date: Date) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
}

function DayContents({ date, profiles, store, openDay, compact = false, inMonth = true }: { date: Date; profiles: Profile[]; store: Store; openDay: (date: string) => void; compact?: boolean; inMonth?: boolean }) {
  const key = localDate(date);
  const current = date.getDate();
  const isToday = key === today;
  const types = profiles.map(p => ({ profile: p, type: rosterType(p, key, store.overrides) }));
  const hasLeave = types.some(x => x.type === 'Annual Leave');
  const entries = store.entries.filter(e => e.date === key);
  return <button type="button" className={`day-cell ${!inMonth ? 'outside' : ''} ${isToday ? 'today' : ''} ${hasLeave ? 'leave-day' : ''}`} data-testid={`button-calendar-day-${key}`} onClick={() => openDay(key)} aria-label={`${fmtDate(key)}, ${types.map(x => `${x.profile.name}: ${x.type}`).join(', ')}`}>
    <span className="day-number">{current}</span>
    <div className="day-labels">{types.slice(0, compact ? 1 : 3).map(({ profile, type }) => <span key={profile.id} className={`shift-chip ${type === 'Days Off' ? 'off' : ''}`} title={`${profile.name}: ${type}`} style={{ '--profile-color': profile.color, '--shift-color': dayTypeColor(type, store.preferences.dayTypeColors) } as CSSProperties}>{type === 'Day Shift' ? 'Day' : type === 'Night Shift' ? 'Night' : type === 'Days Off' ? 'Off' : type === 'Annual Leave' ? 'Leave' : type}</span>)}{types.length > (compact ? 1 : 3) && <span className="shift-chip more-chip">+{types.length - (compact ? 1 : 3)}</span>}</div>
    {compact && hasLeave && <span className="entry-dot" aria-label="Annual leave" />}
    {entries.length > 0 && <span className="entry-dot" aria-label={`${entries.length} personal entries`} />}
  </button>;
}

function MonthGrid({ monthDate, profiles, store, openDay, compact }: { monthDate: Date; profiles: Profile[]; store: Store; openDay: (date: string) => void; compact: boolean }) {
  return <div className="calendar-grid" data-testid="calendar-month-grid">
    {dayNames.map(d => <div className="weekday" key={d}>{d}</div>)}
    {buildMonthDays(monthDate).map(d => <DayContents key={localDate(d)} date={d} inMonth={d.getMonth() === monthDate.getMonth()} profiles={profiles} store={store} openDay={openDay} compact={compact} />)}
  </div>;
}

function MiniMonth({ date, profiles, store, openDay, compact = false }: { date: Date; profiles: Profile[]; store: Store; openDay: (date: string) => void; compact?: boolean }) {
  const days = buildMonthDays(date);
  const count = 42;
  return <div className={compact ? 'year-month' : 'mini-month'}>
    <div className="mini-title">{date.toLocaleDateString(undefined, { month: 'long', ...(compact ? {} : { year: 'numeric' }) })}</div>
    <div className="mini-grid">{dayNames.map((d, i) => <div className="weekday" key={d} style={{ padding: '3px 0', fontSize: 8 }}>{d.slice(0, 1)}</div>)}
      {days.slice(0, count).map(d => {
        const key = localDate(d);
        const inMonth = d.getMonth() === date.getMonth();
        const isToday = key === today;
        const dayTypes = profiles.map(profile => ({ profile, type: rosterType(profile, key, store.overrides) }));
        const hasLeave = dayTypes.some(x => x.type === 'Annual Leave');
        return <button key={key} className={`mini-day ${!inMonth ? 'off-month' : ''} ${isToday ? 'is-today' : ''} ${hasLeave ? 'has-leave' : ''}`} data-testid={`button-mini-day-${key}`} aria-label={`${fmtDate(key)}${dayTypes.length ? `, ${dayTypes.map(x => `${x.profile.name}: ${x.type}`).join(', ')}` : ''}`} onClick={() => openDay(key)}>{d.getDate()}{!compact && <span className="mini-indicators">{dayTypes.slice(0, 4).map(x => <i key={x.profile.id} style={{ background: dayTypeColor(x.type, store.preferences.dayTypeColors) }} />)}</span>}</button>;
      })}
    </div>
  </div>;
}

function calculateStats(profile: Profile, year: number, overrides: Override[]) {
  let worked = 0, nights = 0, leave = 0, holidays = 0, breakDays = 0, longest = 0;
  let nextLeave: number | null = null;
  for (let i = 0; i < 365 + (new Date(year, 1, 29).getMonth() === 1 ? 1 : 0); i++) {
    const date = new Date(year, 0, 1 + i);
    const type = rosterType(profile, localDate(date), overrides);
    if (type === 'Day Shift' || type === 'Night Shift' || type === 'Training' || type === 'Travel Day') worked++;
    if (type === 'Night Shift') nights++;
    if (type === 'Annual Leave') {
      leave++;
      if (nextLeave === null && localDate(date) >= today) nextLeave = Math.ceil((dateParts(localDate(date)).getTime() - dateParts(today).getTime()) / 86400000);
    }
    const override = overrides.find(o => o.profileId === profile.id && o.date === localDate(date));
    if (type === 'Public Holiday' && override?.workedHoliday) holidays++;
    if (type === 'Days Off' || type === 'Annual Leave' || type === 'Public Holiday') { breakDays++; longest = Math.max(longest, breakDays); } else breakDays = 0;
  }
  if (nextLeave === null) {
    const scheduled = overrides.filter(o => o.profileId === profile.id && o.dayType === 'Annual Leave' && o.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
    if (!profile.pattern.includes('Annual Leave')) {
      if (scheduled) nextLeave = Math.ceil((dateParts(scheduled.date).getTime() - dateParts(today).getTime()) / 86400000);
    } else {
      const searchStart = new Date(year, 11, 31);
      for (let i = 1; i <= 3660; i++) {
        const date = shiftDate(searchStart, i);
        if (localDate(date) >= today && rosterType(profile, localDate(date), overrides) === 'Annual Leave') {
          nextLeave = Math.ceil((date.getTime() - dateParts(today).getTime()) / 86400000); break;
        }
      }
      if (scheduled && (nextLeave === null || Math.ceil((dateParts(scheduled.date).getTime() - dateParts(today).getTime()) / 86400000) < nextLeave)) {
        nextLeave = Math.ceil((dateParts(scheduled.date).getTime() - dateParts(today).getTime()) / 86400000);
      }
    }
  }
  return { worked, nights, leave, holidays, breakDays: longest, nextLeave };
}

function TimelinePage({ store, onEdit, onDelete }: { store: Store; onEdit: (entry: Entry) => void; onDelete: (id: string) => void }) {
  const [query, setQuery] = useState('');
  const [person, setPerson] = useState('all');
  const [year, setYear] = useState('all');
  const [type, setType] = useState('all');
  const years = useMemo(() => Array.from(new Set(store.entries.map(e => dateParts(e.date).getFullYear()))).sort((a, b) => b - a), [store.entries]);
  const matches = store.entries.filter(e => {
    const pName = store.profiles.find(p => p.id === e.profileId)?.name ?? '';
    const haystack = `${e.title} ${e.text} ${pName}`.toLocaleLowerCase();
    return (!query || haystack.includes(query.toLocaleLowerCase())) && (person === 'all' || e.profileId === person || (person === 'family' && !e.profileId)) && (year === 'all' || dateParts(e.date).getFullYear() === Number(year)) && (type === 'all' || e.type === type);
  }).sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt));
  return <main className="page-wrap">
    <div className="page-heading"><div><div className="eyebrow">The days worth keeping</div><h1 className="page-title">A life in little notes.</h1><p className="page-subtitle">Memories, plans and the everyday things you don't want to lose.</p></div></div>
    <div className="timeline-tools">
      <div className="search-box"><Search size={15} /><input type="search" placeholder="Search notes and titles" aria-label="Search timeline" value={query} onChange={e => setQuery(e.target.value)} data-testid="input-timeline-search" /></div>
      <select aria-label="Filter timeline by person" value={person} onChange={e => setPerson(e.target.value)} data-testid="select-timeline-person"><option value="all">Everyone</option><option value="family">Family notes</option>{store.profiles.map(p => <option value={p.id} key={p.id}>{p.name}</option>)}</select>
      <select aria-label="Filter timeline by year" value={year} onChange={e => setYear(e.target.value)} data-testid="select-timeline-year"><option value="all">All years</option>{years.map(y => <option value={y} key={y}>{y}</option>)}</select>
      <select aria-label="Filter timeline by entry type" value={type} onChange={e => setType(e.target.value)} data-testid="select-timeline-type"><option value="all">All kinds</option>{ENTRY_TYPES.map(t => <option value={t} key={t}>{humanType(t)}</option>)}</select>
    </div>
    {matches.length ? <div className="timeline-list" data-testid="timeline-results">{matches.map(entry => {
      const profile = store.profiles.find(p => p.id === entry.profileId);
      return <article className="panel timeline-entry" key={entry.id} data-testid={`card-timeline-entry-${entry.id}`}>
        <div className="timeline-date">{fmtDate(entry.date, { month: 'short', day: 'numeric', year: 'numeric' })}</div>
        <div className="entry-content"><div className="entry-meta"><span className="color-swatch" style={{ background: profile?.color ?? '#d1a24e' }} />{profile?.name ?? 'Family'} <span>·</span>{humanType(entry.type)}</div><h2 className="entry-title">{entry.title || 'Untitled note'}</h2>{entry.text && <div className="entry-text">{entry.text}</div>}{entry.photo && <img src={entry.photo} className="entry-photo" alt={`Photo for ${entry.title || 'entry'}`} data-testid={`img-timeline-photo-${entry.id}`} />}</div>
        <div className="entry-actions"><button className="icon-btn" aria-label={`Edit ${entry.title}`} data-testid={`button-edit-entry-${entry.id}`} onClick={() => onEdit(entry)}><Edit3 size={14} /></button><button className="icon-btn" aria-label={`Delete ${entry.title}`} data-testid={`button-delete-entry-${entry.id}`} onClick={() => onDelete(entry.id)}><Trash2 size={14} /></button></div>
      </article>;
    })}</div> : <div className="panel empty-state" data-testid="empty-timeline"><div className="empty-mark"><NotebookPen size={20} /></div><h3>{store.entries.length ? 'Nothing in this part of the story.' : 'A blank page, for now.'}</h3><p>{store.entries.length ? 'Try a different search or loosen one of the filters.' : 'Choose any day on the calendar to save a memory, a plan, or a small detail.'}</p><Link href="/" className="btn primary" data-testid="link-timeline-calendar"><CalendarDays size={14} /> Go to calendar</Link></div>}
  </main>;
}

function SettingsPage({ store, onSave, onDelete, onToggleProfile, onTheme, onCompact, onShiftColor, onResetShiftColors, onExport, onImport, memoryUse }: { store: Store; onSave: (profile: Profile) => boolean; onDelete: (id: string) => void; onToggleProfile: (id: string) => void; onTheme: (theme: 'light' | 'dark') => void; onCompact: (compact: boolean) => void; onShiftColor: (type: DayType, color: string) => void; onResetShiftColors: () => void; onExport: () => void; onImport: () => void; memoryUse: number }) {
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const shiftColors = store.preferences.dayTypeColors ?? DEFAULT_DAY_TYPE_COLORS;
  return <main className="page-wrap">
    <div className="page-heading"><div><div className="eyebrow">Settle things your way</div><h1 className="page-title">Your roster, your rules.</h1><p className="page-subtitle">Keep family schedules together. Your information stays in this browser.</p></div><button className="btn primary" data-testid="button-add-profile" onClick={() => setEditing('new')}><Plus size={15} /> Add a roster</button></div>
    <div className="settings-layout">
      <section className="panel settings-panel">
        <h2 className="panel-heading">People & patterns <UsersRound size={17} /></h2>
        {store.profiles.length === 0 && editing !== 'new' && <div className="empty-state" style={{ padding: '30px 10px' }}><div className="empty-mark"><UsersRound size={19} /></div><h3>Start with one roster.</h3><p>Add the pattern that shapes your weeks. You can always change it later.</p><button className="btn primary" data-testid="button-first-profile" onClick={() => setEditing('new')}>Add a person</button></div>}
        {store.profiles.map(profile => editing === profile.id ? <ProfileForm key={profile.id} profile={profile} shiftColors={shiftColors} onSave={p => { if (onSave(p)) setEditing(null); }} onCancel={() => setEditing(null)} /> : <div className="profile-card" key={profile.id} data-testid={`card-profile-${profile.id}`}>
          <div className="profile-card-head"><div><div className="profile-name-row"><span className="color-swatch" style={{ background: profile.color }} />{profile.name}{!profile.enabled && <span className="subtle">(paused)</span>}</div><div className="profile-detail">Pattern starts {fmtDate(profile.startDate)}{profile.annualAllowance ? ` · ${profile.annualAllowance} leave days / year` : ''}</div></div>
            <div className="profile-controls"><label className="profile-toggle"><input type="checkbox" checked={profile.visible} onChange={() => onToggleProfile(profile.id)} data-testid={`input-profile-visible-${profile.id}`} /> Show</label><button className="btn small" data-testid={`button-edit-profile-${profile.id}`} onClick={() => setEditing(profile.id)}><Edit3 size={12} /> Edit</button><button className="icon-btn" aria-label={`Delete ${profile.name}`} data-testid={`button-delete-profile-${profile.id}`} onClick={() => onDelete(profile.id)}><Trash2 size={14} /></button></div>
          </div>
          <div className="profile-pattern">{profile.pattern.map((item, index) => <span className="pattern-pill" key={`${profile.id}-${index}`} style={{ '--shift-color': dayTypeColor(item, shiftColors) } as CSSProperties} data-testid={`pattern-day-${profile.id}-${index}`}>{item === 'Day Shift' ? 'Day' : item === 'Night Shift' ? 'Night' : item === 'Days Off' ? 'Off' : item}</span>)}</div>
        </div>)}
        {editing === 'new' && <ProfileForm profile={null} shiftColors={shiftColors} onSave={p => { if (onSave(p)) setEditing(null); }} onCancel={() => setEditing(null)} />}
      </section>
      <div style={{ display: 'grid', gap: 17 }}>
        <section className="panel settings-panel">
          <h2 className="panel-heading">How it feels <Sun size={17} /></h2>
          <div className="form-field">Color of the page<select data-testid="select-theme" value={store.preferences.theme} onChange={e => onTheme(e.target.value as 'light' | 'dark')}><option value="light">Daylight paper</option><option value="dark">Quiet evening</option></select></div>
          <label className="profile-toggle" style={{ marginTop: 17 }}><input type="checkbox" checked={store.preferences.compact} onChange={e => onCompact(e.target.checked)} data-testid="input-compact-display" /> Compact roster labels</label>
          <p className="subtle">Your choice is remembered on this device.</p>
        </section>
        <section className="panel settings-panel">
          <div className="shift-colors-heading"><div><h2 className="panel-heading">Shift colors <CalendarRange size={16} /></h2><p className="subtle">Choose a color for each roster day type. Day shifts start yellow and night shifts blue.</p></div></div>
          <div className="shift-color-grid">
            {DAY_TYPES.map((type, index) => <label className="shift-color-control" key={type} data-testid={`shift-color-setting-${index}`}>
              <span className="shift-color-preview" style={{ background: dayTypeColor(type, shiftColors) }} />
              <span className="shift-color-name">{type === 'Day Shift' ? 'Day shift' : type === 'Night Shift' ? 'Night shift' : type}</span>
              <input type="color" aria-label={`${type} color`} value={dayTypeColor(type, shiftColors)} onChange={e => onShiftColor(type, e.target.value)} data-testid={`input-shift-color-${index}`} />
            </label>)}
          </div>
          <button className="btn small" style={{ marginTop: 12 }} onClick={onResetShiftColors} data-testid="button-reset-shift-colors">Restore default colors</button>
        </section>
        <section className="panel settings-panel">
          <h2 className="panel-heading">Keep a copy <Heart size={16} /></h2>
          <p className="subtle" style={{ lineHeight: 1.6, marginTop: -5 }}>Backups include profile patterns, date changes, notes and selected photos.</p>
          <button className="btn primary" style={{ width: '100%', marginBottom: 8 }} onClick={onExport} data-testid="button-export-backup"><Download size={14} /> Download JSON backup</button>
          <button className="btn" style={{ width: '100%' }} onClick={onImport} data-testid="button-import-backup"><FileUp size={14} /> Restore from backup</button>
          <div className="storage-meter" aria-label={`Approximate browser storage used ${memoryUse}%`}><span style={{ width: `${Math.max(2, memoryUse)}%` }} /></div>
          <div className="subtle" data-testid="text-storage-status">Approx. {memoryUse}% of a 5 MB local storage budget used</div>
          {memoryUse > 75 && <div className="notice" style={{ marginTop: 10 }}>Photos can fill browser storage quickly. Download a backup before adding more.</div>}
        </section>
        <div className="notice">Nothing is sent anywhere. If this browser's storage is cleared, a downloaded backup is your way back.</div>
      </div>
    </div>
  </main>;
}

function ProfileForm({ profile, shiftColors, onSave, onCancel }: { profile: Profile | null; shiftColors?: Partial<Record<DayType, string>>; onSave: (profile: Profile) => void; onCancel: () => void }) {
  const [name, setName] = useState(profile?.name ?? '');
  const [color, setColor] = useState(profile?.color ?? colors[0]);
  const [startDate, setStartDate] = useState(profile?.startDate ?? today);
  const [allowance, setAllowance] = useState(profile?.annualAllowance?.toString() ?? '');
  const [enabled, setEnabled] = useState(profile?.enabled ?? true);
  const [pattern, setPattern] = useState<DayType[]>(profile?.pattern ?? ['Day Shift', 'Day Shift', 'Day Shift', 'Night Shift', 'Night Shift', 'Night Shift', 'Days Off', 'Days Off', 'Days Off', 'Days Off', 'Days Off', 'Days Off']);
  const [preset, setPreset] = useState('custom');
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const [patternMessage, setPatternMessage] = useState('');
  const patternDragType = 'application/x-roster-pattern-item';

  const addDay = (dayType: DayType) => {
    if (pattern.length >= 366) {
      setPatternMessage('A repeating pattern can contain up to 366 days.');
      return;
    }
    setPattern(current => [...current, dayType]);
    setPreset('custom');
    setPatternMessage('');
  };
  const moveDay = (from: number, to: number) => {
    if (from === to || to < 0 || to >= pattern.length) return;
    setPattern(current => {
      const next = [...current];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
    setPreset('custom');
    setPatternMessage('');
  };
  const removeDay = (index: number) => {
    if (pattern.length <= 1) {
      setPatternMessage('Keep at least one day in the repeating pattern.');
      return;
    }
    setPattern(current => current.filter((_, i) => i !== index));
    setPreset('custom');
    setPatternMessage('');
  };
  const startPaletteDrag = (event: DragEvent<HTMLButtonElement>, dayType: DayType) => {
    event.dataTransfer.setData(patternDragType, JSON.stringify({ source: 'palette', dayType }));
    event.dataTransfer.effectAllowed = 'copy';
  };
  const startSequenceDrag = (event: DragEvent<HTMLButtonElement>, index: number) => {
    event.dataTransfer.setData(patternDragType, JSON.stringify({ source: 'sequence', index }));
    event.dataTransfer.effectAllowed = 'move';
  };
  const dropDay = (event: DragEvent<HTMLElement>, targetIndex: number) => {
    event.preventDefault();
    event.stopPropagation();
    setDropTarget(null);
    const raw = event.dataTransfer.getData(patternDragType);
    if (!raw) return;
    try {
      const payload: unknown = JSON.parse(raw);
      if (!payload || typeof payload !== 'object') return;
      const data = payload as { source?: unknown; dayType?: unknown; index?: unknown };
      if (data.source === 'palette' && typeof data.dayType === 'string' && DAY_TYPES.includes(data.dayType as DayType)) {
        if (pattern.length >= 366) {
          setPatternMessage('A repeating pattern can contain up to 366 days.');
          return;
        }
        setPattern(current => {
          const next = [...current];
          next.splice(Math.min(targetIndex, next.length), 0, data.dayType as DayType);
          return next;
        });
      } else if (data.source === 'sequence' && typeof data.index === 'number' && Number.isInteger(data.index) && data.index >= 0 && data.index < pattern.length) {
        const from = data.index;
        setPattern(current => {
          const next = [...current];
          const [item] = next.splice(from, 1);
          const insertion = from < targetIndex ? targetIndex - 1 : targetIndex;
          next.splice(Math.max(0, Math.min(insertion, next.length)), 0, item);
          return next;
        });
      } else {
        return;
      }
      setPreset('custom');
      setPatternMessage('');
    } catch {
      setPatternMessage('That shift could not be added. Try dragging it again.');
    }
  };
  const submit = () => {
    if (!name.trim() || !startDate || !pattern.length || pattern.length > 366 || pattern.some(type => !DAY_TYPES.includes(type))) return;
    onSave({ id: profile?.id ?? uid(), name: name.trim(), color, visible: profile?.visible ?? true, enabled, startDate, pattern, annualAllowance: allowance === '' ? undefined : Math.max(0, Number(allowance)) });
  };
  const applyPreset = (value: string) => {
    setPreset(value);
    if (value === '3-3-6') setPattern(['Day Shift', 'Day Shift', 'Day Shift', 'Night Shift', 'Night Shift', 'Night Shift', 'Days Off', 'Days Off', 'Days Off', 'Days Off', 'Days Off', 'Days Off']);
    else if (value === '7-7') setPattern([...Array<DayType>(7).fill('Day Shift'), ...Array<DayType>(7).fill('Days Off')]);
    setPatternMessage('');
  };
  const patternValid = pattern.length > 0 && pattern.length <= 366 && pattern.every(type => DAY_TYPES.includes(type));
  const readableDayType = (type: DayType) => type === 'Day Shift' ? 'Day shift' : type === 'Night Shift' ? 'Night shift' : type;
  return <div className="profile-card" data-testid="form-profile">
    <h3 className="panel-heading">{profile ? 'Edit this roster' : 'A new roster'} <UsersRound size={15} /></h3>
    <div className="form-grid">
      <label className="form-field">Name<input data-testid="input-profile-name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Jamie" maxLength={40} /></label>
      <label className="form-field">Pattern begins<input type="date" data-testid="input-profile-start-date" value={startDate} onChange={e => setStartDate(e.target.value)} /></label>
      <label className="form-field">Annual leave allowance<input type="number" min="0" max="365" data-testid="input-profile-allowance" value={allowance} onChange={e => setAllowance(e.target.value)} placeholder="Optional days" /></label>
      <label className="form-field">Roster status<select data-testid="select-profile-enabled" value={enabled ? 'on' : 'off'} onChange={e => setEnabled(e.target.value === 'on')}><option value="on">Active</option><option value="off">Paused</option></select></label>
      <div className="form-field span-2">Profile color<div style={{ display: 'flex', gap: 9 }}>{colors.map(c => <button key={c} type="button" aria-label={`Choose color ${c}`} data-testid={`button-profile-color-${c.slice(1)}`} onClick={() => setColor(c)} style={{ width: 25, height: 25, borderRadius: '50%', background: c, border: color === c ? '3px solid hsl(var(--foreground))' : '2px solid transparent' }} />)}</div></div>
      <label className="form-field span-2">Pattern preset<select data-testid="select-pattern-preset" value={preset} onChange={e => applyPreset(e.target.value)}><option value="custom">Custom sequence</option><option value="3-3-6">3 Day / 3 Night / 6 Off</option><option value="7-7">7 On / 7 Off</option></select></label>
      <div className="form-field span-2 pattern-builder">
        <div className="pattern-builder-heading"><span>Build your repeating sequence</span><span>{pattern.length} {pattern.length === 1 ? 'day' : 'days'}</span></div>
        <span className="subtle">Drag a shift onto a day to place it before that day, or drop it in the open space at the end. Tap a shift type to add it at the end.</span>
        <div className="pattern-palette" aria-label="Available shift types">
          {DAY_TYPES.map((dayType, index) => <button key={dayType} type="button" className="pattern-palette-item" draggable={pattern.length < 366} onDragStart={event => startPaletteDrag(event, dayType)} onClick={() => addDay(dayType)} disabled={pattern.length >= 366} data-testid={`button-add-pattern-${index}`}><span className="pattern-palette-swatch" style={{ background: dayTypeColor(dayType, shiftColors) }} /><Plus size={12} /><span>{readableDayType(dayType)}</span></button>)}
        </div>
        <div className={`pattern-sequence${dropTarget === pattern.length ? ' is-drop-target' : ''}`} aria-label="Repeating roster sequence" data-testid="list-roster-pattern" onDragOver={event => { event.preventDefault(); setDropTarget(pattern.length); }} onDragLeave={() => setDropTarget(null)} onDrop={event => dropDay(event, pattern.length)}>
          {pattern.map((dayType, index) => <div key={`${dayType}-${index}`} className={`pattern-step${dropTarget === index ? ' is-drop-target' : ''}`} role="listitem" style={{ '--shift-color': dayTypeColor(dayType, shiftColors) } as CSSProperties} data-testid={`pattern-step-${index}`} onDragOver={event => { event.preventDefault(); event.stopPropagation(); setDropTarget(index); }} onDragLeave={() => setDropTarget(null)} onDrop={event => dropDay(event, index)}>
            <button type="button" className="pattern-drag-handle" draggable onDragStart={event => startSequenceDrag(event, index)} onDragEnd={() => setDropTarget(null)} aria-label={`Drag ${readableDayType(dayType)} day ${index + 1} to reorder`} title="Drag to reorder" data-testid={`button-drag-pattern-${index}`}><span className="pattern-step-number">{index + 1}</span><span>{readableDayType(dayType)}</span></button>
            <div className="pattern-step-actions">
              <button type="button" className="pattern-step-action" aria-label={`Move ${readableDayType(dayType)} day ${index + 1} earlier`} title="Move earlier" disabled={index === 0} onClick={() => moveDay(index, index - 1)} data-testid={`button-pattern-earlier-${index}`}><ChevronLeft size={13} /></button>
              <button type="button" className="pattern-step-action" aria-label={`Move ${readableDayType(dayType)} day ${index + 1} later`} title="Move later" disabled={index === pattern.length - 1} onClick={() => moveDay(index, index + 1)} data-testid={`button-pattern-later-${index}`}><ChevronRight size={13} /></button>
              <button type="button" className="pattern-step-action remove" aria-label={`Remove ${readableDayType(dayType)} day ${index + 1}`} title="Remove day" onClick={() => removeDay(index)} data-testid={`button-pattern-remove-${index}`}><X size={13} /></button>
            </div>
          </div>)}
          <div className={`pattern-drop-end${dropTarget === pattern.length ? ' is-drop-target' : ''}`} aria-hidden="true"><Plus size={14} /></div>
        </div>
        <span className="subtle">The sequence repeats from the pattern start date. Use the arrow controls to reorder without dragging.</span>
      </div>
    </div>
    {!patternValid && <p className="subtle" style={{ color: 'hsl(var(--destructive))' }}>Add at least one day and keep the pattern under 366 days.</p>}
    {patternMessage && <p className="subtle" role="status" data-testid="text-pattern-message" style={{ color: 'hsl(var(--destructive))' }}>{patternMessage}</p>}
    <div className="form-actions"><button className="btn" onClick={onCancel} data-testid="button-cancel-profile">Cancel</button><button className="btn primary" disabled={!name.trim() || !patternValid} onClick={submit} data-testid="button-save-profile">Save roster</button></div>
  </div>;
}

function OverrideEditor({ profile, date, current, onSave, onRemove }: { profile: Profile; date: string; current?: Override; onSave: (override: Override) => void; onRemove: (id: string) => void }) {
  const generated = rosterType(profile, date, []);
  const [type, setType] = useState<DayType>(current?.dayType ?? generated);
  const [label, setLabel] = useState(current?.label ?? '');
  const [note, setNote] = useState(current?.note ?? '');
  const [worked, setWorked] = useState(current?.workedHoliday ?? false);
  useEffect(() => {
    setType(current?.dayType ?? generated); setLabel(current?.label ?? ''); setNote(current?.note ?? ''); setWorked(current?.workedHoliday ?? false);
  }, [current?.id, current?.dayType, generated, date]);
  const save = () => onSave({ id: current?.id ?? uid(), profileId: profile.id, date, dayType: type, label: label.trim() || undefined, note: note.trim() || undefined, workedHoliday: type === 'Public Holiday' ? worked : undefined });
  return <div className="override-card" data-testid={`editor-override-${profile.id}`}>
    <div className="override-top"><span><span className="color-swatch" style={{ background: profile.color, display: 'inline-block', marginRight: 7 }} />{profile.name}</span><span className="subtle">{current ? 'Changed' : 'Pattern day'}</span></div>
    <div className="form-grid">
      <label className="form-field span-2">Roster day<select data-testid={`select-override-type-${profile.id}`} value={type} onChange={e => setType(e.target.value as DayType)}>{DAY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></label>
      <label className="form-field span-2">Short label<input data-testid={`input-override-label-${profile.id}`} value={label} onChange={e => setLabel(e.target.value)} placeholder="Optional, e.g. swap with Sam" maxLength={70} /></label>
      <label className="form-field span-2">Details<textarea data-testid={`input-override-note-${profile.id}`} rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="A detail for this roster day" /></label>
    </div>
    {type === 'Public Holiday' && <label className="profile-toggle" style={{ marginTop: 10 }}><input type="checkbox" checked={worked} onChange={e => setWorked(e.target.checked)} data-testid={`input-holiday-worked-${profile.id}`} /> Worked this public holiday</label>}
    <div className="form-actions"><button className="btn small primary" onClick={save} data-testid={`button-save-override-${profile.id}`}>{current ? 'Save change' : 'Add override'}</button>{current && <button className="btn small danger" onClick={() => onRemove(current.id)} data-testid={`button-remove-override-${profile.id}`}>Reset to pattern</button>}</div>
  </div>;
}

function DaySheet({ date, profiles, overrides, entries, selectedEntryId, setSelectedEntryId, onClose, onSaveOverride, onRemoveOverride, onSaveEntry, onDeleteEntry }: { date: string; profiles: Profile[]; overrides: Override[]; entries: Entry[]; selectedEntryId: string | null; setSelectedEntryId: (id: string | null) => void; onClose: () => void; onSaveOverride: (override: Override) => void; onRemoveOverride: (id: string) => void; onSaveEntry: (entry: Entry) => void; onDeleteEntry: (id: string) => void }) {
  const relevantProfiles = profiles.filter(p => p.enabled);
  const current = selectedEntryId === 'new' ? undefined : entries.find(e => e.id === selectedEntryId);
  const editing = selectedEntryId === 'new' || Boolean(current);
  return <div className="modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <aside className="modal-sheet" role="dialog" aria-modal="true" aria-labelledby="day-sheet-title" data-testid="dialog-day-detail">
      <div className="modal-head"><div><div className="eyebrow">The day, up close</div><h2 className="modal-title" id="day-sheet-title">{fmtDate(date)}</h2></div><button className="icon-btn" aria-label="Close day details" data-testid="button-close-day-detail" onClick={onClose}><X size={17} /></button></div>
      {!editing && <>
        <section className="modal-section"><h3 className="modal-section-title">Roster for this day</h3>
          {relevantProfiles.length ? relevantProfiles.map(profile => <OverrideEditor key={`${profile.id}-${date}-${overrides.find(o => o.profileId === profile.id && o.date === date)?.id ?? 'pattern'}`} profile={profile} date={date} current={overrides.find(o => o.profileId === profile.id && o.date === date)} onSave={onSaveOverride} onRemove={onRemoveOverride} />) : <div className="notice">There are no active rosters yet. Add one in Settings.</div>}
        </section>
        <section className="modal-section"><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><h3 className="modal-section-title">The rest of the day</h3><button className="btn small primary" data-testid="button-add-day-entry" onClick={() => setSelectedEntryId('new')}><Plus size={13} /> Add note</button></div>
          {entries.length ? entries.map(entry => <EntryCard key={entry.id} entry={entry} profile={profiles.find(p => p.id === entry.profileId)} onEdit={() => setSelectedEntryId(entry.id)} onDelete={() => onDeleteEntry(entry.id)} />) : <div className="subtle">No notes saved for this day yet.</div>}
        </section>
      </>}
      {editing && <EntryEditor key={current?.id ?? `${date}-new`} date={date} profiles={profiles} entry={current} onSave={onSaveEntry} onCancel={() => setSelectedEntryId(null)} />}
    </aside>
  </div>;
}

function EntryCard({ entry, profile, onEdit, onDelete }: { entry: Entry; profile?: Profile; onEdit: () => void; onDelete: () => void }) {
  return <div className="entry-card" data-testid={`card-day-entry-${entry.id}`}><div className="entry-card-row"><div><div className="entry-meta"><span className="color-swatch" style={{ background: profile?.color ?? '#d1a24e' }} />{profile?.name ?? 'Family'} · {humanType(entry.type)}</div><h3 className="entry-title" style={{ fontSize: 15 }}>{entry.title}</h3></div><div className="inline-actions"><button aria-label={`Edit ${entry.title}`} data-testid={`button-edit-day-entry-${entry.id}`} onClick={onEdit}><Edit3 size={14} /></button><button aria-label={`Delete ${entry.title}`} data-testid={`button-remove-day-entry-${entry.id}`} onClick={onDelete}><Trash2 size={14} /></button></div></div>{entry.text && <div className="entry-text">{entry.text}</div>}{entry.photo && <img className="entry-photo" alt={`Photo for ${entry.title}`} src={entry.photo} data-testid={`img-day-entry-${entry.id}`} />}</div>;
}

function EntryEditor({ date, profiles, entry, onSave, onCancel }: { date: string; profiles: Profile[]; entry?: Entry; onSave: (entry: Entry) => void; onCancel: () => void }) {
  const [title, setTitle] = useState(entry?.title ?? '');
  const [text, setText] = useState(entry?.text ?? '');
  const [type, setType] = useState<EntryType>(entry?.type ?? 'note');
  const [profileId, setProfileId] = useState(entry?.profileId ?? '');
  const [photo, setPhoto] = useState(entry?.photo ?? '');
  const [photoNotice, setPhotoNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const handleFile = async (file?: File) => {
    if (!file) return;
    setBusy(true); setPhotoNotice('');
    try {
      const compressed = await compressPhoto(file);
      setPhoto(compressed);
      setPhotoNotice(`Photo ready · ${(compressed.length / 1024).toFixed(0)} KB after compression.`);
    } catch (error) { setPhotoNotice(error instanceof Error ? error.message : 'Could not add that photo.'); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  };
  const submit = () => {
    if (!title.trim()) return;
    const now = new Date().toISOString();
    onSave({ id: entry?.id ?? uid(), date, title: title.trim(), text, type, profileId: profileId || undefined, photo: photo || undefined, createdAt: entry?.createdAt ?? now, updatedAt: now });
  };
  return <section className="modal-section" data-testid="form-day-entry">
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><h3 className="modal-section-title">{entry ? 'Edit this entry' : 'Add something to remember'}</h3><button className="icon-btn" aria-label="Cancel entry edit" data-testid="button-cancel-entry-edit" onClick={onCancel}><X size={15} /></button></div>
    <div className="form-grid">
      <label className="form-field span-2">Title<input autoFocus maxLength={100} data-testid="input-entry-title" value={title} onChange={e => setTitle(e.target.value)} placeholder="A name for this moment" /></label>
      <label className="form-field">Kind<select data-testid="select-entry-type" value={type} onChange={e => setType(e.target.value as EntryType)}>{ENTRY_TYPES.map(t => <option value={t} key={t}>{humanType(t)}</option>)}</select></label>
      <label className="form-field">For<select data-testid="select-entry-profile" value={profileId} onChange={e => setProfileId(e.target.value)}><option value="">Everyone / family</option>{profiles.map(p => <option value={p.id} key={p.id}>{p.name}</option>)}</select></label>
      <label className="form-field span-2">Details<textarea rows={5} maxLength={8000} data-testid="input-entry-text" value={text} onChange={e => setText(e.target.value)} placeholder="A little context, a plan, a memory…" /></label>
    </div>
    <input ref={fileRef} type="file" hidden accept="image/*" data-testid="input-entry-photo" onChange={e => void handleFile(e.target.files?.[0])} />
    <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}><button className="btn small" type="button" disabled={busy} onClick={() => fileRef.current?.click()} data-testid="button-attach-photo"><ImagePlus size={13} />{busy ? 'Preparing…' : photo ? 'Replace photo' : 'Add a photo'}</button>{photo && <button className="btn small danger" type="button" onClick={() => { setPhoto(''); setPhotoNotice('Photo removed from this entry.'); }} data-testid="button-remove-photo">Remove photo</button>}</div>
    {photo && <img className="entry-photo" src={photo} alt="Selected for this entry" data-testid="img-entry-photo-preview" />}
    {photoNotice && <p className="subtle" role="status" data-testid="status-photo">{photoNotice}</p>}
    <div className="form-actions"><button className="btn" onClick={onCancel} data-testid="button-cancel-entry">Cancel</button><button className="btn primary" disabled={!title.trim() || busy} onClick={submit} data-testid="button-save-entry">{entry ? 'Save entry' : 'Add to this day'}</button></div>
  </section>;
}

export default App;