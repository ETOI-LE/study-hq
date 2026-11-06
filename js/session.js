// Focus-session engine. Timestamp-based, so it stays accurate in background tabs.
// Sounds are pre-scheduled on the Web Audio clock at the exact end time.
import { S, setMeta, save, saveSettings, uid, on } from './store.js';
import { dayStr, topicById, subjectById, subjectLabel, topicLabel } from './logic.js';

let ctx = null;
let scheduled = [];   // audio nodes
let timeouts = [];    // wake-up timers
let listeners = [];

export function onSessionChange(fn) { listeners.push(fn); }
function changed() { listeners.forEach((f) => f()); }

export const active = () => S.meta.active || null;

function persist(a) { setMeta('active', a ? { ...a } : null); }

// ---------- Audio ----------
export function unlockAudio() {
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch { /* no audio */ }
}
export const audioReady = () => !!ctx && ctx.state === 'running';

const TUNES = {
  sprint: [523.25, 659.25, 783.99, 1046.5],
  break: [783.99, 659.25, 523.25],
  alarm: [880, 660, 880, 660, 880, 660],
  test: [659.25, 783.99],
};

function chimeAt(whenMs, kind) {
  if (!S.settings.sound || !audioReady()) return false;
  const start = ctx.currentTime + Math.max(0, (whenMs - Date.now()) / 1000);
  const notes = TUNES[kind] || TUNES.sprint;
  notes.forEach((f, i) => {
    const t = start + i * (kind === 'alarm' ? 0.28 : 0.2);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.28, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 1);
    scheduled.push({ osc, t: start });
  });
  return true;
}

export function testSound() { unlockAudio(); setTimeout(() => chimeAt(Date.now(), 'test'), 60); }

function cancelScheduled() {
  // Only cancel sounds that haven't started yet, so a chime that is playing finishes.
  const now = ctx ? ctx.currentTime : 0;
  scheduled.forEach(({ osc, t }) => { if (t > now + 0.05) { try { osc.stop(); } catch { /* already stopped */ } } });
  scheduled = [];
  timeouts.forEach(clearTimeout);
  timeouts = [];
}

const chimed = new Set(); // phase end timestamps that already have a scheduled sound

function scheduleAll(a) {
  cancelScheduled();
  chimed.clear();
  if (!a || a.paused) return;
  if (a.phase === 'sprint' || a.phase === 'break') {
    if (chimeAt(a.phaseEnd, a.phase === 'sprint' ? 'sprint' : 'break')) chimed.add(a.phaseEnd);
    // If a break follows this sprint, pre-schedule its end chime too.
    if (a.phase === 'sprint' && willBreakAfter(a)) {
      const breakEnd = a.phaseEnd + a.breakMs;
      if (chimeAt(breakEnd, 'break')) chimed.add(breakEnd);
      timeouts.push(setTimeout(tick, Math.max(0, breakEnd - Date.now()) + 50));
    }
    timeouts.push(setTimeout(tick, Math.max(0, a.phaseEnd - Date.now()) + 50));
  }
  if (a.hardStopAt && !a.hardStopFired && a.hardStopAt > Date.now()) {
    if (chimeAt(a.hardStopAt, 'alarm')) chimed.add(a.hardStopAt);
    timeouts.push(setTimeout(tick, a.hardStopAt - Date.now() + 50));
  }
}

function willBreakAfter(a) {
  return !(a.quick5 && !a.extended) && a.type !== 'blurting' && a.sprintsDone + 1 < a.sprintsPlanned;
}

// ---------- Notifications ----------
export async function askNotifications() {
  try {
    if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission();
  } catch { /* ignore */ }
}

function notify(title, body) {
  try {
    if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
      new Notification(title, { body, icon: 'icons/icon.svg', tag: 'study-hq' });
    }
  } catch { /* ignore */ }
}

// ---------- Lifecycle ----------
export function describe(a = active()) {
  if (!a) return '';
  const s = subjectById(a.subjectId);
  const ts = (a.topicIds || []).map((id) => topicLabel(topicById(id))).filter(Boolean);
  return [subjectLabel(s), ts.join(', ')].filter(Boolean).join(' · ');
}

/** Create a session. cfg: subjectId, topicIds, type, goal, sprintLen, breakLen, sprints, hardStopAt, quick5, planId */
export function createSession(cfg, { ritual = false } = {}) {
  unlockAudio();
  askNotifications();
  const a = {
    id: uid(),
    subjectId: cfg.subjectId || null,
    topicIds: cfg.topicIds || [],
    type: cfg.type || 'practice',
    goal: cfg.goal || '',
    sprintMs: Math.round((cfg.sprintLen || 20) * 60000),
    breakMs: Math.round((cfg.breakLen ?? 5) * 60000),
    sprintsPlanned: cfg.type === 'blurting' || cfg.quick5 ? 1 : (cfg.sprints || 2),
    sprintsDone: 0,
    focusMs: 0,
    startedAt: new Date().toISOString(),
    phase: ritual ? 'ritual' : 'sprint',
    phaseStart: null, phaseEnd: null, phaseDur: null,
    paused: false, remaining: null,
    quick5: !!cfg.quick5, extended: false,
    hardStopAt: cfg.hardStopAt || null, hardStopFired: false, hardStopAlert: false,
    gaps: [],
    mistakeIds: [],
    planId: cfg.planId || null,
    ritualChecked: [],
  };
  if (!ritual) beginSprint(a);
  if (cfg.planId && S.meta.plan && S.meta.plan.id === cfg.planId) setMeta('plan', { ...S.meta.plan, used: true });
  // Remember choices for next time (setup is pre-filled from the last session).
  if (!cfg.quick5) {
    saveSettings({ lastSetup: { subjectId: a.subjectId, topicIds: a.topicIds, type: a.type, goal: '', sprintLen: cfg.sprintLen, breakLen: cfg.breakLen, sprints: cfg.sprints } });
  }
  persist(a);
  scheduleAll(a);
  changed();
  return a;
}

function beginSprint(a, at = Date.now()) {
  a.phase = 'sprint';
  a.phaseStart = at;
  a.phaseDur = a.sprintMs;
  a.phaseEnd = at + a.sprintMs;
  a.paused = false;
  a.remaining = null;
}

export function startFromRitual() {
  const a = active(); if (!a) return;
  unlockAudio();
  beginSprint(a);
  persist(a); scheduleAll(a); changed();
}

export function remainingMs(a = active()) {
  if (!a) return 0;
  if (a.paused) return a.remaining;
  if (a.phase !== 'sprint' && a.phase !== 'break') return 0;
  return Math.max(0, a.phaseEnd - Date.now());
}

function advance(a) {
  const endedAt = a.phaseEnd;
  if (a.phase === 'sprint') {
    a.focusMs += a.phaseDur;
    a.sprintsDone += 1;
    if (!chimed.has(endedAt)) chimeAt(Date.now(), 'sprint');
    if (a.quick5 && !a.extended) {
      a.phase = 'keepGoing';
      notify('5 minutes done', 'Keep going?');
    } else if (a.type === 'blurting') {
      a.phase = 'gaps';
      notify('Time’s up', 'What did you miss?');
    } else if (a.sprintsDone < a.sprintsPlanned) {
      a.phase = 'break';
      a.phaseStart = endedAt;
      a.phaseDur = a.breakMs;
      a.phaseEnd = endedAt + a.breakMs;
      notify('Sprint done — take a break', `${Math.round(a.breakMs / 60000)} minute break`);
    } else {
      a.phase = 'review';
      a.endedAt = new Date(endedAt).toISOString();
      notify('Session done', 'Nice work. Quick review?');
    }
  } else if (a.phase === 'break') {
    if (!chimed.has(endedAt)) chimeAt(Date.now(), 'break');
    a.phase = 'breakDone';
    notify('Break’s over', 'Ready for the next sprint?');
  }
}

export function tick() {
  const a = active();
  if (!a) return false;
  let did = false;
  if (!a.paused) {
    let guard = 0;
    while ((a.phase === 'sprint' || a.phase === 'break') && Date.now() >= a.phaseEnd && guard++ < 20) {
      advance(a); did = true;
    }
  }
  if (a.hardStopAt && !a.hardStopFired && Date.now() >= a.hardStopAt) {
    a.hardStopFired = true;
    a.hardStopAlert = true;
    if (!chimed.has(a.hardStopAt)) chimeAt(Date.now(), 'alarm');
    notify('Hard stop', 'Time to wrap up this session.');
    did = true;
  }
  if (did) { persist(a); scheduleAll(a); changed(); }
  return did;
}

export function pause() {
  const a = active(); if (!a || a.paused) return;
  a.remaining = Math.max(0, a.phaseEnd - Date.now());
  a.paused = true;
  persist(a); scheduleAll(a); changed();
}

export function resume() {
  const a = active(); if (!a || !a.paused) return;
  unlockAudio();
  a.phaseEnd = Date.now() + a.remaining;
  a.phaseStart = a.phaseEnd - a.phaseDur;
  a.paused = false; a.remaining = null;
  persist(a); scheduleAll(a); changed();
}

export function nextSprint() {
  const a = active(); if (!a) return;
  unlockAudio();
  beginSprint(a);
  persist(a); scheduleAll(a); changed();
}

export function keepGoing(yes) {
  const a = active(); if (!a) return;
  if (yes) {
    a.extended = true;
    a.sprintMs = (S.settings.sprintLen || 20) * 60000;
    a.sprintsPlanned = a.sprintsDone + 1;
    beginSprint(a);
  } else {
    a.phase = 'review';
    a.endedAt = new Date().toISOString();
  }
  persist(a); scheduleAll(a); changed();
}

/** Stop early: count the focus time so far and go to the review. */
export function stop() {
  const a = active(); if (!a) return;
  if (a.phase === 'sprint') {
    const elapsed = a.phaseDur - remainingMs(a);
    a.focusMs += Math.max(0, elapsed);
    if (elapsed > 60000) a.sprintsDone += 1;
  }
  if (a.phase === 'ritual') { discard(); return; }
  a.phase = a.type === 'blurting' && a.phase === 'sprint' ? 'gaps' : 'review';
  a.paused = false;
  a.endedAt = new Date().toISOString();
  persist(a); scheduleAll(a); changed();
}

export function toReview() {
  const a = active(); if (!a) return;
  a.phase = 'review';
  a.endedAt = a.endedAt || new Date().toISOString();
  persist(a); changed();
}

export function update(patch) {
  const a = active(); if (!a) return;
  Object.assign(a, patch);
  persist(a);
}

export function dismissHardStop() { update({ hardStopAlert: false }); changed(); }

export function discard() {
  cancelScheduled();
  setMeta('active', null);
  changed();
}

/** Save the review as a Session record. */
export function finish(review) {
  const a = active(); if (!a) return null;
  const rec = save('sessions', {
    id: a.id,
    subjectId: a.subjectId,
    topicIds: a.topicIds,
    type: a.type,
    goal: a.goal,
    sprintLen: Math.round(a.sprintMs / 60000),
    breakLen: Math.round(a.breakMs / 60000),
    sprintsPlanned: a.sprintsPlanned,
    sprintsDone: a.sprintsDone,
    focusMs: a.focusMs,
    startedAt: a.startedAt,
    endedAt: a.endedAt || new Date().toISOString(),
    day: dayStr(new Date(a.endedAt || Date.now())),
    quick5: a.quick5,
    gaps: a.gaps,
    mistakeIds: a.mistakeIds,
    goalDone: review.goalDone || null,
    attempted: review.attempted ?? null,
    correct: review.correct ?? null,
    focus: review.focus ?? null,
  });
  if (a.subjectId) saveSettings({ lastSubjectId: a.subjectId });
  discard();
  return rec;
}

/** Resume scheduling after a page reload. */
export function restore() {
  const a = active();
  if (!a) return;
  tick();
  scheduleAll(active());
}

export function rescheduleSounds() { scheduleAll(active()); }

export const BREAK_IDEAS = [
  'Stand up and stretch your arms and back.',
  'Refill your water.',
  'Look out of a window at something far away.',
  'Walk to the end of the hall and back.',
  'Do ten slow breaths.',
  'Roll your shoulders and neck.',
  'Get a small snack.',
];

export function breakIdea(a = active()) {
  if (!on('breakIdeas')) return '';
  const i = ((a?.sprintsDone || 0) + (a?.id?.charCodeAt(0) || 0)) % BREAK_IDEAS.length;
  return BREAK_IDEAS[i];
}
