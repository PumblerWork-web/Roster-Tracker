export type DayType = 'Day Shift' | 'Night Shift' | 'Days Off' | 'Annual Leave' | 'Public Holiday' | 'Sick Leave' | 'Training' | 'Travel Day' | 'Custom Event';
export type EntryType = 'note' | 'event' | 'memory' | 'appointment' | 'custom';
export type Profile = { id: string; name: string; color: string; visible: boolean; enabled: boolean; startDate: string; pattern: DayType[]; annualAllowance?: number };
export type Override = { id: string; profileId: string; date: string; dayType: DayType; label?: string; note?: string; workedHoliday?: boolean };
export type Entry = { id: string; date: string; profileId?: string; type: EntryType; title: string; text: string; photo?: string; createdAt: string; updatedAt: string };
export type Store = { profiles: Profile[]; overrides: Override[]; entries: Entry[]; preferences: { theme: 'light' | 'dark'; compact: boolean; dayTypeColors?: Partial<Record<DayType, string>> } };

export const DAY_TYPES: DayType[] = ['Day Shift', 'Night Shift', 'Days Off', 'Annual Leave', 'Public Holiday', 'Sick Leave', 'Training', 'Travel Day', 'Custom Event'];
export const DEFAULT_DAY_TYPE_COLORS: Record<DayType, string> = {
  'Day Shift': '#f2c94c',
  'Night Shift': '#4b83e8',
  'Days Off': '#8caaa0',
  'Annual Leave': '#dc9850',
  'Public Holiday': '#c46e4f',
  'Sick Leave': '#cb6e79',
  Training: '#8b79c6',
  'Travel Day': '#469b91',
  'Custom Event': '#98745b',
};
export const ENTRY_TYPES: EntryType[] = ['note', 'event', 'memory', 'appointment', 'custom'];
const KEY = 'roster-tracker-v1';
const isoToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const validDate = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T12:00:00`).getTime()) && localDate(new Date(`${value}T12:00:00`)) === value;
export const defaultStore = (): Store => ({
  profiles: [{ id: uid(), name: 'My roster', color: '#d9785c', visible: true, enabled: true, startDate: isoToday(), pattern: ['Day Shift', 'Day Shift', 'Day Shift', 'Night Shift', 'Night Shift', 'Night Shift', 'Days Off', 'Days Off', 'Days Off', 'Days Off', 'Days Off', 'Days Off'], annualAllowance: 28 }],
  overrides: [],
  entries: [],
  preferences: { theme: 'light', compact: false, dayTypeColors: { ...DEFAULT_DAY_TYPE_COLORS } },
});

export function validateStore(value: unknown): value is Store {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<Store>;
  if (!Array.isArray(v.profiles) || !Array.isArray(v.overrides) || !Array.isArray(v.entries) || !v.preferences) return false;
  if (v.profiles.some(p => !p || typeof p.id !== 'string' || !p.id || typeof p.name !== 'string' || typeof p.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(p.color) || !validDate(p.startDate) || !Array.isArray(p.pattern) || !p.pattern.length || p.pattern.length > 366 || p.pattern.some(t => !DAY_TYPES.includes(t)) || typeof p.visible !== 'boolean' || typeof p.enabled !== 'boolean' || (p.annualAllowance !== undefined && (typeof p.annualAllowance !== 'number' || !Number.isFinite(p.annualAllowance) || p.annualAllowance < 0 || p.annualAllowance > 366)))) return false;
  if (v.overrides.some(o => !o || typeof o.id !== 'string' || typeof o.profileId !== 'string' || !validDate(o.date) || !DAY_TYPES.includes(o.dayType) || (o.label !== undefined && typeof o.label !== 'string') || (o.note !== undefined && typeof o.note !== 'string') || (o.workedHoliday !== undefined && typeof o.workedHoliday !== 'boolean'))) return false;
  if (v.entries.some(e => !e || typeof e.id !== 'string' || !validDate(e.date) || typeof e.title !== 'string' || typeof e.text !== 'string' || !ENTRY_TYPES.includes(e.type) || typeof e.createdAt !== 'string' || Number.isNaN(Date.parse(e.createdAt)) || typeof e.updatedAt !== 'string' || Number.isNaN(Date.parse(e.updatedAt)) || (e.profileId !== undefined && typeof e.profileId !== 'string') || (e.photo !== undefined && (typeof e.photo !== 'string' || !e.photo.startsWith('data:image/'))))) return false;
  const dayTypeColors = v.preferences.dayTypeColors;
  if (dayTypeColors !== undefined && (!dayTypeColors || typeof dayTypeColors !== 'object' || DAY_TYPES.some(type => typeof dayTypeColors[type] !== 'string' || !/^#[0-9a-f]{6}$/i.test(dayTypeColors[type] as string)))) return false;
  return (v.preferences.theme === 'light' || v.preferences.theme === 'dark') && typeof v.preferences.compact === 'boolean';
}

export const normalizeStore = (store: Store): Store => ({
  ...store,
  preferences: {
    ...store.preferences,
    dayTypeColors: { ...DEFAULT_DAY_TYPE_COLORS, ...store.preferences.dayTypeColors },
  },
});

export const dayTypeColor = (type: DayType, colors?: Partial<Record<DayType, string>>) =>
  colors?.[type] ?? DEFAULT_DAY_TYPE_COLORS[type];

export function readStore(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultStore();
    const parsed: unknown = JSON.parse(raw);
    return validateStore(parsed) ? normalizeStore(parsed) : defaultStore();
  } catch { return defaultStore(); }
}
export function persistStore(store: Store): boolean {
  try { localStorage.setItem(KEY, JSON.stringify(store)); return true; } catch { return false; }
}
export const localDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export const shiftDate = (date: Date, amount: number) => { const d = new Date(date); d.setDate(d.getDate() + amount); return d; };
export const rosterType = (profile: Profile, date: string, overrides: Override[]): DayType => {
  const override = overrides.find(o => o.profileId === profile.id && o.date === date);
  if (override) return override.dayType;
  const start = new Date(`${profile.startDate}T12:00:00`).getTime();
  const current = new Date(`${date}T12:00:00`).getTime();
  const offset = Math.round((current - start) / 86400000);
  return profile.pattern[((offset % profile.pattern.length) + profile.pattern.length) % profile.pattern.length];
};
export const fmtDate = (date: string, options: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric', year: 'numeric' }) =>
  new Date(`${date}T12:00:00`).toLocaleDateString(undefined, options);

export async function compressPhoto(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file.');
  if (file.size > 15 * 1024 * 1024) throw new Error('That image is over 15 MB. Choose a smaller file.');
  const source = await createImageBitmap(file);
  const scale = Math.min(1, 1500 / Math.max(source.width, source.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not prepare this photo in your browser.');
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  source.close();
  return canvas.toDataURL('image/jpeg', 0.78);
}