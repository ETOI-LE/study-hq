// Smart logic: dates, redo schedule, topic priority, Today suggestions, weekly stats.
import { S, on } from './store.js';
import { IB_GRADES, CORE_GRADES } from './data-ib.js';

// ---------- Dates (local calendar days as 'YYYY-MM-DD') ----------
export function dayStr(d = new Date()) {
  const x = d instanceof Date ? d : new Date(d);
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${x.getFullYear()}-${m}-${day}`;
}
export function parseDay(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
export function addDays(s, n) { const d = parseDay(s); d.setDate(d.getDate() + n); return dayStr(d); }
export function daysBetween(a, b) { return Math.round((parseDay(b) - parseDay(a)) / 86400000); }
export const today = () => dayStr();

export function weekStart(s = today()) {
  const d = parseDay(s);
  const dow = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - dow);
  return dayStr(d);
}

// ---------- Lookups ----------
export const subjectById = (id) => S.subjects.find((s) => s.id === id);
export const topicById = (id) => S.topics.find((t) => t.id === id);
export const topicsOf = (subjectId) => S.topics.filter((t) => t.subjectId === subjectId);
export const childTopics = (id) => S.topics.filter((t) => t.parentId === id);

export function subjectLabel(s) {
  if (!s) return 'No subject';
  return s.level && s.level !== 'Core' ? `${s.short || s.name} ${s.level}` : (s.short || s.name);
}
export function topicLabel(t) {
  if (!t) return '';
  if (t.parentId) { const p = topicById(t.parentId); return p ? `${p.name} › ${t.name}` : t.name; }
  return t.name;
}

export function gradeScale(subject) {
  if (!subject) return null;
  if (subject.scale === 'core') return CORE_GRADES;
  if (subject.scale === 'ib') return IB_GRADES;
  return null; // free text
}

// How far a subject is from its target (bigger = further away).
export function subjectGap(s) {
  const scale = gradeScale(s);
  if (!scale || !s.current || !s.target) return 0;
  const c = scale.indexOf(String(s.current));
  const t = scale.indexOf(String(s.target));
  if (c < 0 || t < 0) return 0;
  return Math.max(0, t - c);
}

export function subjectsByGap() {
  return [...S.subjects].sort((a, b) => subjectGap(b) - subjectGap(a) || (a.order ?? 0) - (b.order ?? 0));
}

// ---------- Mistake redo schedule ----------
export const FIRST_REDO_DAYS = 3;
export const GOT_IT_DAYS = 7;
export const NOT_YET_DAYS = 2;

export function newMistakeFields(day = today()) {
  return { status: 'open', dueAt: addDays(day, FIRST_REDO_DAYS), gotIt: 0, lastGotItDay: null, redoHistory: [] };
}

export function isDue(m, d = today()) { return m.status === 'open' && m.dueAt && m.dueAt <= d; }

export function dueMistakes(filter = {}) {
  const d = today();
  return S.mistakes
    .filter((m) => isDue(m, d))
    .filter((m) => !filter.subjectId || m.subjectId === filter.subjectId)
    .filter((m) => !filter.topicId || m.topicId === filter.topicId || topicById(m.topicId)?.parentId === filter.topicId)
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
}

/** Apply a redo result. Returns { mistake, fixed } (mutates a copy). */
export function applyRedo(m, result, d = today()) {
  const x = { ...m, redoHistory: [...(m.redoHistory || []), { day: d, result }] };
  let fixed = false;
  if (result === 'got') {
    if (x.gotIt >= 1 && x.lastGotItDay && x.lastGotItDay !== d) {
      x.status = 'fixed';
      x.fixedAt = new Date().toISOString();
      x.gotIt = 2;
      x.dueAt = null;
      fixed = true;
    } else {
      // First Got it (or a repeat on the same day): next redo in 7 days.
      x.gotIt = Math.max(1, x.gotIt || 0);
      x.lastGotItDay = d;
      x.dueAt = addDays(d, GOT_IT_DAYS);
    }
  } else {
    x.gotIt = 0;
    x.lastGotItDay = null;
    x.dueAt = addDays(d, NOT_YET_DAYS);
  }
  return { mistake: x, fixed };
}

export function dueLabel(m) {
  if (m.status === 'fixed') return 'Fixed';
  if (!m.dueAt) return 'Open';
  const n = daysBetween(today(), m.dueAt);
  if (n <= 0) return 'Ready to redo';
  if (n === 1) return 'Redo tomorrow';
  return `Redo in ${n} days`;
}

// ---------- Topics ----------
function topicFamilyIds(t) { return [t.id, ...childTopics(t.id).map((c) => c.id)]; }

export function topicLastStudied(t) {
  const ids = new Set(topicFamilyIds(t));
  let last = null;
  for (const s of S.sessions) {
    if (!s.topicIds || !s.topicIds.some((id) => ids.has(id))) continue;
    const when = s.endedAt || s.startedAt;
    const d = when ? dayStr(new Date(when)) : null;
    if (d && (!last || d > last)) last = d;
  }
  return last;
}

export function openMistakesIn(t) {
  const ids = new Set(topicFamilyIds(t));
  return S.mistakes.filter((m) => m.status === 'open' && ids.has(m.topicId)).length;
}

// Focus topics are picked in the weekly review and last until the next one (8 days).
export function activeFocusIds() {
  const f = S.meta.focusTopics;
  if (!f || !f.ids || !on('weeklyReview')) return [];
  const d = today();
  if (f.from && f.until && d >= f.from && d < f.until) return f.ids;
  return [];
}
export function isFocusTopic(t) { return activeFocusIds().includes(t.id); }

export function practiceDoneIn(t) {
  const ids = new Set(topicFamilyIds(t));
  return S.practiceSets.filter((p) => ids.has(p.topicId)).reduce((n, p) => n + (p.attempted || 0), 0);
}

export function topicStats(t) {
  const conf = t.confidence || null;
  const confForScore = conf ?? 3;
  const open = openMistakesIn(t);
  const last = topicLastStudied(t);
  const daysSince = last ? daysBetween(last, today()) : null;
  const staleness = daysSince === null ? 4 : Math.min(daysSince / 7, 4);
  const focus = isFocusTopic(t);
  const practiced = on('practiceLog') ? practiceDoneIn(t) : 0;
  const score = 2 * (5 - confForScore) + open + staleness + (focus ? 3 : 0);

  const reasons = [];
  reasons.push(conf ? `Confidence ${conf}/5` : 'Confidence not rated yet');
  if (open) reasons.push(`${open} open mistake${open === 1 ? '' : 's'}`);
  if (daysSince === null) reasons.push('not studied yet');
  else if (daysSince === 0) reasons.push('studied today');
  else reasons.push(`not studied for ${daysSince} day${daysSince === 1 ? '' : 's'}`);
  if (focus) reasons.push('focus topic this week');
  return { conf, open, last, daysSince, practiced, score: Math.round(score * 10) / 10, reason: reasons.join(' · '), focus };
}

export function suggestedType(t, st = topicStats(t)) {
  const lowConf = (st.conf ?? 3) <= (on('blurtMore') ? 3 : 2);
  const stale = st.daysSince === null || st.daysSince >= 7;
  return lowConf && stale ? 'blurting' : 'practice';
}

export function rankedTopics(subjectId = null) {
  const gapRank = new Map(subjectsByGap().map((s, i) => [s.id, i]));
  return S.topics
    .filter((t) => !subjectId || t.subjectId === subjectId)
    .filter((t) => subjectById(t.subjectId))
    .map((t) => ({ topic: t, stats: topicStats(t) }))
    .sort((a, b) => b.stats.score - a.stats.score
      || (gapRank.get(a.topic.subjectId) ?? 99) - (gapRank.get(b.topic.subjectId) ?? 99));
}

// ---------- Today: what to do next ----------
export const SESSION_TYPES = [
  { key: 'practice', label: 'Practice questions' },
  { key: 'redo', label: 'Mistake redo' },
  { key: 'paper', label: 'Past paper' },
  { key: 'blurting', label: 'Blurting' },
  { key: 'flashcards', label: 'Flashcards' },
  { key: 'notes', label: 'Notes review' },
];
export const typeLabel = (k) => SESSION_TYPES.find((t) => t.key === k)?.label || k;
export const PRACTICE_TYPES = new Set(['practice', 'redo', 'paper']);

export function activePlan() {
  const p = S.meta.plan;
  if (!p || p.used) return null;
  const d = today();
  if (p.forDay > d) return null;          // set tonight for tomorrow
  if (daysBetween(p.forDay, d) > 3) return null; // stale after a few days
  return p;
}

export function upNext() {
  const items = [];
  const plan = activePlan();
  if (plan) {
    const s = subjectById(plan.subjectId);
    const t = topicById(plan.topicId);
    items.push({
      kind: 'plan',
      title: plan.step,
      sub: [subjectLabel(s), t && topicLabel(t)].filter(Boolean).join(' · '),
      reason: 'Your first step, set last night',
      prefill: { subjectId: plan.subjectId, topicIds: plan.topicId ? [plan.topicId] : [], type: plan.type || 'practice', goal: plan.step, sprintLen: plan.length, planId: plan.id },
    });
  }
  const due = dueMistakes().slice(0, 2);
  for (const m of due) {
    const s = subjectById(m.subjectId);
    const tries = (m.redoHistory || []).length;
    items.push({
      kind: 'redo',
      mistakeId: m.id,
      title: `Redo: ${m.source}`,
      sub: [subjectLabel(s), topicLabel(topicById(m.topicId))].filter(Boolean).join(' · '),
      reason: tries === 0
        ? `Logged ${daysBetween(dayStr(new Date(m.createdAt)), today())} days ago — first redo is due`
        : (m.gotIt ? 'You got it last time — one more on a new day fixes it' : 'Not fixed yet — another try is due'),
      prefill: { subjectId: m.subjectId, topicIds: m.topicId ? [m.topicId] : [], type: 'redo', goal: 'Redo my due mistakes' },
    });
  }
  if (on('flashcards')) {
    const n = Math.min(dueCards().length, cardsLeftToday());
    if (n > 0) {
      items.push({
        kind: 'cards', title: `Review ${n} flashcard${n === 1 ? '' : 's'}`, sub: '',
        reason: `Due today — about ${Math.max(1, Math.round(n / 4))} min`,
        prefill: { type: 'flashcards', goal: `Review ${n} due cards`, sprintLen: 15 },
      });
    }
  }
  const top = rankedTopics().find(({ topic }) => !items.some((i) => i.prefill?.topicIds?.includes(topic.id)));
  if (top && items.length < 4) {
    const type = suggestedType(top.topic, top.stats);
    const s = subjectById(top.topic.subjectId);
    items.push({
      kind: 'topic',
      topicId: top.topic.id,
      title: `${topicLabel(top.topic)} — ${typeLabel(type).toLowerCase()}`,
      sub: subjectLabel(s),
      reason: top.stats.reason + (type === 'blurting' ? ' → blurt first to see what you remember' : ''),
      prefill: { subjectId: s.id, topicIds: [top.topic.id], type },
    });
  }
  return items.slice(0, 4);
}

// ---------- This week ----------
export function weekStats() {
  const start = weekStart();
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const studied = new Set();
  const minutes = new Map();
  let total = 0;
  for (const s of S.sessions) {
    const d = dayStr(new Date(s.endedAt || s.startedAt));
    if (d < start || d > days[6]) continue;
    const mins = Math.round((s.focusMs || 0) / 60000);
    if (mins > 0) studied.add(d);
    total += mins;
    const key = s.subjectId || '_none';
    minutes.set(key, (minutes.get(key) || 0) + mins);
  }
  return { days, studied, minutes, total };
}

export function lastSession() {
  return [...S.sessions].sort((a, b) => (b.endedAt || '').localeCompare(a.endedAt || ''))[0] || null;
}

// ---------- Flashcards (Phase 2) ----------
export const BOX_DAYS = [1, 3, 7, 14, 30];
export const CARD_TYPES = [
  { key: 'formula', label: 'Formula' },
  { key: 'explain', label: 'Explain key phrase' },
  { key: 'definition', label: 'Definition' },
  { key: 'gdc', label: 'Calculator (GDC) steps' },
  { key: 'fix', label: 'Fix / rule' },
];
export const cardTypeLabel = (k) => CARD_TYPES.find((t) => t.key === k)?.label || k;
export function newCardFields() { return { box: 1, dueAt: today(), lastReviewed: null, history: [] }; }

/** Good → up one box, Easy → up two, Again → box 1. Next due = today + that box's interval. */
export function gradeCard(c, grade, d = today()) {
  let box = c.box || 1;
  if (grade === 'again') box = 1;
  else if (grade === 'good') box = Math.min(5, box + 1);
  else if (grade === 'easy') box = Math.min(5, box + 2);
  return { ...c, box, dueAt: addDays(d, BOX_DAYS[box - 1]), lastReviewed: d, history: [...(c.history || []), { day: d, grade }] };
}
export function dueCards(filter = {}) {
  const d = today();
  return S.flashcards
    .filter((c) => c.dueAt && c.dueAt <= d)
    .filter((c) => !filter.subjectId || c.subjectId === filter.subjectId)
    .filter((c) => !filter.topicIds || !filter.topicIds.length || filter.topicIds.includes(c.topicId) || filter.topicIds.includes(topicById(c.topicId)?.parentId))
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt) || (a.box || 1) - (b.box || 1));
}
export const dailyCap = () => Number(S.settings.cardCap) || 20;
export function cardsReviewedToday() {
  const r = S.meta.cardReviews;
  return r && r.day === today() ? r.n : 0;
}
export function cardsLeftToday() { return Math.max(0, dailyCap() - cardsReviewedToday()); }

// ---------- Practice log (Phase 2) ----------
export const PRACTICE_EXTRA_SOURCES = ['Past paper', 'Textbook', 'Worksheet', 'Other'];
export function practiceSources() {
  const own = (S.settings.practiceSources || []).filter((x) => !PRACTICE_EXTRA_SOURCES.includes(x) && x !== 'Past papers');
  return [...own, ...PRACTICE_EXTRA_SOURCES];
}
/** Questions counted for a set: attempted questions, or marks available when logged as marks. */
export const setQuestions = (p) => (p.mode === 'marks' ? 0 : p.attempted || 0);
export function setAccuracy(p) {
  if (p.mode === 'marks') return p.marksMax ? p.marksGot / p.marksMax : null;
  return p.attempted ? (p.correct || 0) / p.attempted : null;
}
export function practiceWeek(start = weekStart()) {
  const end = addDays(start, 6);
  const sets = S.practiceSets.filter((p) => p.date >= start && p.date <= end);
  const bySubject = new Map();
  let q = 0, hard = 0, got = 0, max = 0;
  for (const p of sets) {
    const k = p.subjectId || '_none';
    if (!bySubject.has(k)) bySubject.set(k, { q: 0, hard: 0, got: 0, max: 0, sets: 0 });
    const r = bySubject.get(k);
    const n = p.mode === 'marks' ? 0 : (p.attempted || 0);
    const g = p.mode === 'marks' ? (p.marksGot || 0) : (p.correct || 0);
    const m = p.mode === 'marks' ? (p.marksMax || 0) : (p.attempted || 0);
    const h = p.difficulty === 'hard' ? (p.mode === 'marks' ? m : n) : 0;
    r.q += n; r.got += g; r.max += m; r.sets++; r.hard += h;
    q += n; got += g; max += m; hard += h;
  }
  return { sets, bySubject, questions: q, accuracy: max ? got / max : null, hardShare: max ? hard / max : null, total: max };
}

// ---------- Past papers (Phase 2) ----------
export const PAPER_STATUS = ['Not started', 'Done', 'Reviewed'];
export function paperLabel(p) {
  const s = subjectById(p.subjectId);
  const bits = [p.session, p.year, p.paper ? `P${p.paper}` : '', p.tz && p.tz !== 'none' ? p.tz : ''].filter(Boolean).join(' ');
  return bits || (s ? subjectLabel(s) : 'Paper');
}
export const paperPct = (p) => (p.score !== null && p.score !== undefined && p.score !== '' && p.max ? (Number(p.score) / Number(p.max)) * 100 : null);
export function boundaryFor(p) {
  return S.gradeBoundaries.find((b) => b.subjectId === p.subjectId && String(b.paper || '') === String(p.paper || '')
    && String(b.year || '') === String(p.year || '') && (b.session || '') === (p.session || '')) || null;
}
/** Estimated grade from entered boundaries (marks). Never hardcoded. */
export function estimatedGrade(p) {
  const b = boundaryFor(p);
  if (!b || p.score === null || p.score === undefined || p.score === '') return null;
  const rows = (b.rows || []).filter((r) => r.min !== '' && r.min !== null && r.min !== undefined).sort((x, y) => Number(y.min) - Number(x.min));
  const hit = rows.find((r) => Number(p.score) >= Number(r.min));
  return hit ? hit.grade : (rows.length ? rows[rows.length - 1].grade : null);
}
/** Target line: the average % needed for the target grade across boundaries the user entered. */
export function targetPct(subject) {
  if (!subject?.target) return null;
  const vals = S.gradeBoundaries.filter((b) => b.subjectId === subject.id && b.max).map((b) => {
    const r = (b.rows || []).find((x) => String(x.grade) === String(subject.target));
    return r && r.min !== '' && r.min !== null ? (Number(r.min) / Number(b.max)) * 100 : null;
  }).filter((v) => v !== null);
  return vals.length ? vals.reduce((a, v) => a + v, 0) / vals.length : null;
}

// ---------- Weekly review ----------
export function reviewDue() {
  if (!on('weeklyReview')) return false;
  const day = S.profile?.answers?.reviewDay ?? 0; // 0 = Sunday
  if (new Date().getDay() !== day) return false;
  const ws = weekStart();
  return !S.weeklyReviews.some((r) => r.date >= ws);
}
