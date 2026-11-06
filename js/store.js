// In-memory state, mirrored to IndexedDB on every change.
import * as db from './db.js';

export const COLLECTIONS = [
  'subjects', 'topics', 'sessions', 'mistakes',
  'practiceSets', 'papers', 'gradeBoundaries', 'flashcards', 'weeklyReviews',
];

export const S = {
  ready: false,
  profile: null,
  settings: null,
  meta: {},
  subjects: [], topics: [], sessions: [], mistakes: [],
  practiceSets: [], papers: [], gradeBoundaries: [], flashcards: [], weeklyReviews: [],
};

let errorHandler = (e) => console.error(e);
export function onSaveError(fn) { errorHandler = fn; }

export function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

export const nowIso = () => new Date().toISOString();

export async function load() {
  const [profile, settings, metaRows, ...colls] = await Promise.all([
    db.get('profile', 'me'),
    db.get('settings', 'settings'),
    db.getAll('meta'),
    ...COLLECTIONS.map((c) => db.getAll(c)),
  ]);
  S.profile = profile || null;
  S.settings = settings ? { ...defaultSettings(), ...settings } : defaultSettings();
  S.meta = {};
  for (const r of metaRows) S.meta[r.id] = r.value;
  COLLECTIONS.forEach((c, i) => { S[c] = colls[i] || []; });
  S.subjects.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  S.ready = true;
}

function stamp(obj) {
  const t = nowIso();
  if (!obj.id) obj.id = uid();
  if (!obj.createdAt) obj.createdAt = t;
  obj.updatedAt = t;
  return obj;
}

function persist(store, obj) {
  db.put(store, obj).catch(errorHandler);
}

export function save(coll, obj) {
  stamp(obj);
  const arr = S[coll];
  const i = arr.findIndex((x) => x.id === obj.id);
  if (i >= 0) arr[i] = obj; else arr.push(obj);
  persist(coll, obj);
  return obj;
}

export function saveMany(coll, objs) {
  for (const o of objs) {
    stamp(o);
    const i = S[coll].findIndex((x) => x.id === o.id);
    if (i >= 0) S[coll][i] = o; else S[coll].push(o);
  }
  db.putMany(coll, objs).catch(errorHandler);
}

export function remove(coll, id) {
  S[coll] = S[coll].filter((x) => x.id !== id);
  db.del(coll, id).catch(errorHandler);
}

export function removeMany(coll, ids) {
  const set = new Set(ids);
  S[coll] = S[coll].filter((x) => !set.has(x.id));
  db.delMany(coll, ids).catch(errorHandler);
}

export function saveProfile(patch) {
  S.profile = stamp({ ...(S.profile || { id: 'me' }), ...patch, id: 'me' });
  persist('profile', S.profile);
  return S.profile;
}

export function saveSettings(patch) {
  S.settings = stamp({ ...S.settings, ...patch, id: 'settings' });
  persist('settings', S.settings);
  return S.settings;
}

export function setMeta(key, value) {
  if (value === undefined || value === null) {
    delete S.meta[key];
    db.del('meta', key).catch(errorHandler);
  } else {
    S.meta[key] = value;
    db.put('meta', { id: key, value }).catch(errorHandler);
  }
}

// ---------- Photos (stored as Blobs, separate from records) ----------
const urlCache = new Map();

export async function savePhoto(blob) {
  const id = uid();
  await db.put('photos', { id, blob, type: blob.type, createdAt: nowIso() });
  return id;
}

export async function photoUrl(id) {
  if (!id) return null;
  if (urlCache.has(id)) return urlCache.get(id);
  const row = await db.get('photos', id);
  if (!row) return null;
  const url = URL.createObjectURL(row.blob);
  urlCache.set(id, url);
  return url;
}

export function deletePhotos(ids) {
  const list = ids.filter(Boolean);
  if (!list.length) return;
  list.forEach((id) => { const u = urlCache.get(id); if (u) URL.revokeObjectURL(u); urlCache.delete(id); });
  db.delMany('photos', list).catch(errorHandler);
}

export async function allPhotos() { return db.getAll('photos'); }

// ---------- Defaults ----------
export const DEFAULT_RITUAL = [
  'Phone in another room',
  'Water',
  'Materials open at the right page',
  'Only this tab open',
];

export const DEFAULT_CARELESS = [
  'Did I answer exactly what was asked (units, form, rounding)?',
  'Does the answer make sense (size, sign)?',
  'Did I re-read the question?',
  'Did I show all working?',
];

export function defaultSettings() {
  return {
    id: 'settings',
    sprintLen: 20,
    breakLen: 5,
    sprints: 2,
    hardStopOn: false,
    ritualItems: [...DEFAULT_RITUAL],
    carelessItems: [...DEFAULT_CARELESS],
    sound: true,
    theme: 'system',
    lastBackupAt: null,
  };
}

// Feature switches. Phase 2 features are stored now and light up once built.
export const FEATURES = [
  { key: 'topicTracker', label: 'Topic tracker', desc: 'Topics, confidence and priorities for each subject.', phase: 1 },
  { key: 'startRitual', label: 'Start ritual', desc: 'A short checklist before the timer starts.', phase: 1 },
  { key: 'justFiveMain', label: '“Just 5 minutes” as the main button', desc: 'Makes starting tiny on the Today screen.', phase: 1 },
  { key: 'eveningPrompt', label: 'Evening “Set up tomorrow” prompt', desc: 'After 6 pm, Today asks for tomorrow’s first step.', phase: 1 },
  { key: 'breakIdeas', label: 'Break suggestions', desc: 'One non-phone idea for each break.', phase: 1 },
  { key: 'goalRequired', label: '“Done means…” goal required', desc: 'Every session needs a one-line goal, and the review always asks about it.', phase: 1 },
  { key: 'carelessCard', label: 'Careless-error checklist', desc: 'Shown during practice sessions.', phase: 1 },
  { key: 'askType', label: 'Ask mistake type every time', desc: 'Shows mistake type on the quick-add form.', phase: 1 },
  { key: 'notesField', label: '“Where my notes are” on every topic', desc: 'Shows where your notes live right on each topic.', phase: 1 },
  { key: 'blurtMore', label: 'Suggest blurting more often', desc: 'Today suggests blurting for any topic below 4/5.', phase: 1 },
  { key: 'flashcards', label: 'Flashcards', desc: 'Coming in Phase 2.', phase: 2 },
  { key: 'weeklyReview', label: 'Weekly review', desc: 'Coming in Phase 2.', phase: 2 },
  { key: 'practiceLog', label: 'Practice log', desc: 'Coming in Phase 2.', phase: 2 },
  { key: 'papers', label: 'Past paper tracker', desc: 'Coming in Phase 2.', phase: 2 },
  { key: 'testPrep', label: 'Test prep pack', desc: 'Coming in Phase 2.', phase: 2 },
  { key: 'sharePacks', label: 'Share packs', desc: 'Coming in Phase 2.', phase: 2 },
];

export function featuresFor(answers) {
  const h = new Set(answers.hardest || []);
  const all = answers.startMode === 'everything';
  return {
    topicTracker: all,
    startRitual: all || h.has('starting') || h.has('focus'),
    justFiveMain: h.has('starting'),
    eveningPrompt: h.has('starting'),
    breakIdeas: true,
    goalRequired: h.has('finishing'),
    carelessCard: true,
    askType: h.has('careless'),
    notesField: h.has('organised'),
    blurtMore: h.has('remembering'),
    flashcards: all || h.has('remembering'),
    weeklyReview: all || h.has('organised'),
    practiceLog: all,
    papers: all,
    testPrep: all,
    sharePacks: all,
  };
}

export function on(key) {
  return !!(S.profile && S.profile.features && S.profile.features[key]);
}
