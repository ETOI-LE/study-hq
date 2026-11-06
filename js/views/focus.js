// Focus sessions: one-screen setup, start ritual, sprints, breaks, blurting, review.
import { S, on, save } from '../store.js';
import {
  SESSION_TYPES, PRACTICE_TYPES, typeLabel, subjectById, subjectLabel, topicsOf, topicById, topicLabel,
  dueMistakes, newMistakeFields, today, lastSession,
} from '../logic.js';
import { esc, icon, bus, chips, fmtClock, toast, confirmDialog, plural, subjectDot, fmtDay, emptyState } from '../ui.js';
import * as session from '../session.js';
import { openQuickAdd, openRedo } from './mistakes.js';

let pending = undefined; // prefill from Today / shortcuts
let draft = null;
let rv = { goalDone: null, attempted: '', correct: '', focus: null };
let hist = { q: '', subjectId: '', limit: 20 };
let gapText = '';

const PHASE1_TYPES = SESSION_TYPES.filter((t) => t.key !== 'flashcards' || on('flashcards'));

function defaultHardStop(totalMin) {
  const d = new Date(Date.now() + (totalMin + 30) * 60000);
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function buildDraft(p) {
  const st = S.settings;
  const last = st.lastSetup || {};
  const base = {
    subjectId: last.subjectId && subjectById(last.subjectId) ? last.subjectId : (S.subjects[0]?.id || null),
    topicIds: (last.topicIds || []).filter((id) => topicById(id)),
    type: last.type || 'practice',
    goal: '',
    sprintLen: last.sprintLen || st.sprintLen || 20,
    breakLen: last.breakLen ?? st.breakLen ?? 5,
    sprints: last.sprints || st.sprints || 2,
    hardStop: !!st.hardStopOn,
    hardStopTime: '',
    planId: null,
  };
  if (p) {
    Object.assign(base, Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined && v !== null)));
    if (p.subjectId && p.subjectId !== last.subjectId && !p.topicIds) base.topicIds = [];
  }
  if (base.type === 'blurting' && !p?.sprintLen) base.sprintLen = 10;
  if (base.type === 'flashcards' && !on('flashcards')) base.type = 'practice';
  base.hardStopTime = defaultHardStop(base.sprintLen * base.sprints + base.breakLen * (base.sprints - 1));
  return base;
}

// ---------- Setup ----------
function setupHtml() {
  const d = draft;
  const subjects = [...S.subjects.map((s) => ({ value: s.id, label: subjectLabel(s), dot: s.color })), { value: '', label: 'No subject' }];
  const topics = d.subjectId ? topicsOf(d.subjectId) : [];
  const ordered = topics.filter((t) => !t.parentId).flatMap((t) => [t, ...topics.filter((c) => c.parentId === t.id)]);
  const lens = d.type === 'blurting' ? [5, 10, 15, 20] : [15, 20, 25, 45];
  const required = on('goalRequired');
  return `
  <div class="page-head"><div><h1>Focus session</h1><p class="muted">Everything is filled in — just press Start.</p></div>
    <button class="btn btn-primary" type="submit" form="setup-form" style="min-height:52px;padding:0 26px">${icon('play')} Start</button></div>
  <form class="card" data-submit="start" id="setup-form">
    <div class="field"><span class="field-label">Subject</span>${chips('subjectId', subjects, d.subjectId || '', { act: 'set' })}</div>
    ${d.subjectId ? `<div class="field"><span class="field-label">Topic${ordered.length ? 's' : ''} <span class="hint">(optional)</span></span>
      ${ordered.length ? chips('topicIds', ordered.map((t) => ({ value: t.id, label: topicLabel(t) })), d.topicIds, { multi: true, act: 'set' })
        : `<p class="small muted">No topics for this subject yet. ${on('topicTracker') ? `<a href="#topics/${d.subjectId}">Add topics</a>` : `<a href="#topics/${d.subjectId}">Add topics</a>`}</p>`}</div>` : ''}
    <div class="field"><span class="field-label">Session type</span>${chips('type', PHASE1_TYPES.map((t) => ({ value: t.key, label: t.label })), d.type, { act: 'set' })}</div>
    <label class="field"><span>Done means… ${required ? '' : '<span class="hint">(optional)</span>'}</span>
      <input type="text" name="goal" value="${esc(d.goal)}" placeholder="e.g. all 4 hard questions attempted" ${required ? 'required' : ''} data-input="goal"></label>
    <div class="grid2">
      <div class="field"><span class="field-label">${d.type === 'blurting' ? 'Blurt for' : 'Sprint length'}</span>${chips('sprintLen', lens.map((n) => ({ value: String(n), label: `${n} min` })), String(d.sprintLen), { act: 'set' })}</div>
      ${d.type === 'blurting' ? '' : `<div class="field"><span class="field-label">Sprints and breaks</span>
        <div class="row wrap"><div class="stepper" aria-label="Number of sprints"><button type="button" data-act="sprints" data-d="-1" aria-label="Fewer sprints">−</button><span>${d.sprints}</span><button type="button" data-act="sprints" data-d="1" aria-label="More sprints">+</button></div>
        <span class="small muted">sprints, with</span>
        <select name="breakLen" data-change="breakLen" style="width:auto">${[3, 5, 10, 15].map((n) => `<option value="${n}"${n === d.breakLen ? ' selected' : ''}>${n} min</option>`).join('')}</select>
        <span class="small muted">breaks</span></div></div>`}
    </div>
    <label class="toggle"><span><b>Hard stop</b><span class="small muted" style="display:block">An alarm at a set time, so a long focus streak doesn’t eat your other plans.</span></span>
      <input type="checkbox" data-change="hardStop" ${d.hardStop ? 'checked' : ''}><span class="switch"></span></label>
    ${d.hardStop ? `<label class="field" style="margin-top:10px"><span>Alarm at</span><input type="time" name="hardStopTime" value="${esc(d.hardStopTime)}" data-input="hardStopTime" style="max-width:180px"></label>` : ''}
    <button class="btn btn-primary btn-big" type="submit" style="margin-top:14px">${icon('play')} Start${on('startRitual') ? '' : ` · ${d.sprintLen} min`}</button>
  </form>
  ${historyHtml()}`;
}

function historyHtml() {
  const q = hist.q.trim().toLowerCase();
  const list = [...S.sessions].sort((a, b) => (b.endedAt || '').localeCompare(a.endedAt || ''))
    .filter((s) => !hist.subjectId || s.subjectId === hist.subjectId)
    .filter((s) => {
      if (!q) return true;
      const hay = [s.goal, typeLabel(s.type), subjectLabel(subjectById(s.subjectId)), ...(s.topicIds || []).map((id) => topicLabel(topicById(id))), ...(s.gaps || []).map((g) => g.text)].join(' ').toLowerCase();
      return hay.includes(q);
    });
  const rows = list.slice(0, hist.limit).map((s) => `<li class="list-item" style="cursor:default">${subjectDot(s.subjectId)}<div class="grow">
      <div class="title">${esc(typeLabel(s.type))}${s.goal ? ` — ${esc(s.goal)}` : ''}</div>
      <div class="meta small muted"><span>${esc(fmtDay(s.endedAt))}</span><span>· ${Math.round((s.focusMs || 0) / 60000)} min</span>
      <span>· ${esc(subjectLabel(subjectById(s.subjectId)))}</span>${(s.topicIds || []).length ? `<span>· ${esc(s.topicIds.map((id) => topicLabel(topicById(id))).filter(Boolean).join(', '))}</span>` : ''}
      ${s.goalDone ? `<span class="pill ${s.goalDone === 'yes' ? 'ok' : ''}">Goal: ${esc(s.goalDone)}</span>` : ''}</div></div></li>`).join('');
  return `<h2 class="section-title">Past sessions</h2>
    ${S.sessions.length ? `<div class="filters"><div class="search">${icon('search')}<input type="search" placeholder="Search sessions" value="${esc(hist.q)}" data-input="histQ" aria-label="Search sessions"></div>
      <select data-change="histSubject" aria-label="Filter by subject"><option value="">All subjects</option>${S.subjects.map((s) => `<option value="${s.id}"${s.id === hist.subjectId ? ' selected' : ''}>${esc(subjectLabel(s))}</option>`).join('')}</select></div>` : ''}
    <div class="card quiet" id="hist-list">${S.sessions.length ? (rows ? `<ul class="list">${rows}</ul>${list.length > hist.limit ? `<button class="btn btn-ghost btn-wide" data-act="more">Show more</button>` : ''}` : '<p class="muted small" style="margin:0">No sessions match.</p>')
      : emptyState('No sessions yet', 'Each focus session you finish is saved here with its goal and minutes.', 'e.g. “Practice questions — all 4 hard questions attempted · 40 min”')}</div>`;
}

// ---------- Running ----------
function carelessCard(a) {
  if (!PRACTICE_TYPES.has(a.type) || !on('carelessCard')) return '';
  const items = S.settings.carelessItems || [];
  if (!items.length) return '';
  const open = (S.profile?.answers?.hardest || []).includes('careless');
  return `<details class="card quiet" ${open ? 'open' : ''}><summary style="cursor:pointer;font-weight:600">Careless-error checklist</summary>
    <ul class="small" style="margin:10px 0 0;padding-left:20px">${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul></details>`;
}

function redoPanel(a) {
  if (a.type !== 'redo') return '';
  const due = dueMistakes({ subjectId: a.subjectId, topicId: a.topicIds[0] });
  return `<div class="card quiet"><div class="row between wrap"><div><b>Mistake redo</b><div class="small muted">${due.length ? `${plural(due.length, 'mistake')} ready to redo here.` : 'Nothing due here right now — you can still redo open ones.'}</div></div>
    <button class="btn btn-soft" data-act="openRedo">${icon('redo')} Open redo mode</button></div></div>`;
}

function soundBanner() {
  if (!S.settings.sound || session.audioReady()) return '';
  return `<div class="card quiet"><div class="row between wrap"><span class="small">Sound is paused after reloading the page.</span><button class="btn btn-soft" data-act="enableSound">Turn sound on</button></div></div>`;
}

function hardStopAlert(a) {
  if (!a.hardStopAlert) return '';
  const t = new Date(a.hardStopAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `<div class="card alert-card"><h3>It’s ${esc(t)} — your hard stop</h3><p class="small">Time to wrap up so the rest of your plans don’t get eaten.</p>
    <div class="row wrap"><button class="btn btn-primary" data-act="stopNow">Wrap up now</button><button class="btn" data-act="dismissStop">Keep going a bit</button></div></div>`;
}

function runHtml(a) {
  const desc = session.describe(a);
  const head = `<div class="row between" style="margin-bottom:6px"><span class="small muted">${esc(typeLabel(a.type))}${desc ? ` · ${esc(desc)}` : ''}</span>
    ${a.phase === 'sprint' || a.phase === 'break' ? `<button class="btn btn-ghost" data-act="stop">${icon('stop', 18)} End</button>` : ''}</div>`;

  if (a.phase === 'ritual') {
    const items = S.settings.ritualItems || [];
    return `${head}<div class="card"><h2>Before you start</h2><p class="muted small">Tick everything and the timer starts.</p>
      <div class="checklist">${items.map((it, i) => `<label><input type="checkbox" data-change="ritual" data-i="${i}" ${a.ritualChecked.includes(i) ? 'checked' : ''}>${esc(it)}</label>`).join('')}</div>
      <div class="row between" style="margin-top:14px"><button class="link-btn" data-act="skipRitual">skip</button><button class="btn btn-ghost" data-act="cancel">Cancel</button></div></div>`;
  }

  if (a.phase === 'sprint' || a.phase === 'break') {
    const isBreak = a.phase === 'break';
    const rem = session.remainingMs(a);
    const pct = a.phaseDur ? 100 - (rem / a.phaseDur) * 100 : 0;
    const label = isBreak ? 'Break' : a.type === 'blurting' ? 'Blurting' : a.quick5 ? (a.extended ? 'Keep-going sprint' : 'Just 5 minutes') : `Sprint ${a.sprintsDone + 1} of ${a.sprintsPlanned}`;
    const topicName = a.topicIds.map((id) => topicLabel(topicById(id))).filter(Boolean).join(', ');
    return `${head}${hardStopAlert(a)}${soundBanner()}
      <div class="timer-wrap">
        <div class="phase">${esc(label)}${a.paused ? ' · paused' : ''}</div>
        ${a.type === 'blurting' && !isBreak ? `<div class="blurt-topic">${esc(topicName || subjectLabel(subjectById(a.subjectId)))}</div><p class="small muted">Write everything you remember — on paper or your tablet.</p>` : ''}
        <div class="countdown${a.paused ? ' paused' : ''}" id="countdown" aria-live="off">${fmtClock(rem)}</div>
        <div class="progress-ring"><div id="progress" style="width:${pct}%"></div></div>
        ${isBreak ? `<p class="goal-line" style="margin-top:18px">${esc(session.breakIdea(a) || 'Take a proper break away from the screen.')}</p>`
          : a.goal ? `<p class="goal-line" style="margin-top:18px"><span class="muted small">Done means</span><br>${esc(a.goal)}</p>` : ''}
        <div class="timer-controls">
          ${a.paused ? `<button class="btn btn-primary" data-act="resume">${icon('play')} Resume</button>` : `<button class="btn" data-act="pause">${icon('pause')} Pause</button>`}
          ${isBreak ? `<button class="btn btn-primary" data-act="nextSprint">Skip break</button>` : `<button class="btn btn-soft" data-act="logMistake">${icon('plus')} Log mistake</button>`}
        </div>
      </div>
      ${isBreak ? '' : redoPanel(a) + carelessCard(a)}`;
  }

  if (a.phase === 'breakDone') {
    return `${head}${hardStopAlert(a)}<div class="timer-wrap"><div class="phase">Break’s over</div>
      <h1 style="margin:14px 0">Ready for sprint ${a.sprintsDone + 1} of ${a.sprintsPlanned}?</h1>
      ${a.goal ? `<p class="goal-line">${esc(a.goal)}</p>` : ''}
      <div class="timer-controls"><button class="btn btn-primary btn-big" style="max-width:320px" data-act="nextSprint">${icon('play')} Next sprint</button></div>
      <button class="link-btn" data-act="toReview">Finish the session instead</button></div>`;
  }

  if (a.phase === 'keepGoing') {
    return `<div class="timer-wrap"><div class="phase">5 minutes done</div><h1 style="margin:14px 0">Nice — you started. Keep going?</h1>
      <p class="muted">Yes turns this into a normal ${S.settings.sprintLen || 20}-minute sprint.</p>
      <div class="timer-controls"><button class="btn btn-primary" data-act="keepYes">Yes, keep going</button><button class="btn" data-act="keepNo">No, I’m done</button></div></div>`;
  }

  if (a.phase === 'gaps') {
    const subjectId = a.subjectId;
    return `<div class="card"><h2>What did you miss?</h2><p class="muted small">Check your notes. Type each gap — each one can go into your mistake log with one tap.</p>
      <form class="row" data-submit="addGap"><input type="text" class="grow" id="gap-input" placeholder="e.g. Forgot the units of magnetic flux" value="${esc(gapText)}" data-input="gapText" autofocus><button class="btn" type="submit">${icon('plus')} Add</button></form>
      <ul class="list" style="margin-top:10px">${a.gaps.map((g, i) => `<li class="list-item" style="cursor:default;align-items:center"><span class="grow">${esc(g.text)}</span>
        ${g.mistakeId ? `<span class="pill ok">${icon('check', 14)} In mistake log</span>` : `<button class="btn btn-soft" data-act="gapToMistake" data-i="${i}" ${subjectId ? '' : ''}>→ Mistake log</button>`}</li>`).join('')}</ul>
      <div class="row-actions end"><button class="btn btn-primary" data-act="toReview">Continue</button></div></div>`;
  }

  // Review
  const asksGoal = !!a.goal || on('goalRequired');
  const mins = Math.round(a.focusMs / 60000);
  return `<div class="card"><h2>Quick review</h2><p class="muted small">${mins ? `${mins} minutes of focus` : 'Short one'}${desc ? ` on ${esc(desc)}` : ''}. Everything here is optional.</p>
    ${asksGoal ? `<div class="field"><span class="field-label">Was the goal done?${a.goal ? ` <span class="hint">“${esc(a.goal)}”</span>` : ''}</span>
      ${chips('goalDone', [{ value: 'yes', label: 'Yes' }, { value: 'partly', label: 'Partly' }, { value: 'no', label: 'No' }], rv.goalDone, { act: 'rv' })}</div>` : ''}
    ${PRACTICE_TYPES.has(a.type) || a.type === 'blurting' ? `<div class="grid2">
      <label class="field"><span>Questions attempted</span><input type="number" min="0" inputmode="numeric" value="${esc(rv.attempted)}" data-input="rvAttempted"></label>
      <label class="field"><span>Correct</span><input type="number" min="0" inputmode="numeric" value="${esc(rv.correct)}" data-input="rvCorrect"></label></div>` : ''}
    <div class="field"><span class="field-label">Focus <span class="hint">(1 = scattered, 5 = locked in)</span></span>
      <div class="scale">${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="${rv.focus === n ? 'on' : ''}" data-act="rvFocus" data-v="${n}">${n}</button>`).join('')}</div></div>
    <div class="card soft" style="margin:6px 0 0"><div class="row between wrap"><span>Any mistakes to log? ${a.mistakeIds.length ? `<span class="small muted">(${plural(a.mistakeIds.length, 'logged')} this session)</span>` : ''}</span>
      <button class="btn" data-act="logMistake">${icon('plus')} Log a mistake</button></div></div>
    <div class="row-actions between" style="justify-content:space-between"><button class="link-btn" data-act="discard">Discard session</button>
      <button class="btn btn-primary" data-act="save">Save session</button></div>
    ${S.settings.taskApp ? `<p class="tiny muted" style="margin:12px 0 0">Remembered a deadline? Add the date to ${esc(S.settings.taskApp)}.</p>` : ''}</div>`;
}

function render() {
  const a = session.active();
  if (a) { document.title = titleFor(a); return runHtml(a); }
  document.title = 'Study HQ';
  if (!draft || pending !== undefined) { draft = buildDraft(pending); pending = undefined; }
  return setupHtml();
}

function titleFor(a) {
  if (a.phase === 'sprint') return `${fmtClock(session.remainingMs(a))} · Focus — Study HQ`;
  if (a.phase === 'break') return `${fmtClock(session.remainingMs(a))} · Break — Study HQ`;
  return 'Study HQ';
}

function updateClock() {
  const a = session.active();
  if (!a || (a.phase !== 'sprint' && a.phase !== 'break')) return;
  const el = document.getElementById('countdown');
  const rem = session.remainingMs(a);
  if (el) el.textContent = fmtClock(rem);
  const p = document.getElementById('progress');
  if (p && a.phaseDur) p.style.width = `${100 - (rem / a.phaseDur) * 100}%`;
  document.title = titleFor(a);
}

function readGoal() {
  const g = document.querySelector('#setup-form [name=goal]');
  if (g && draft) draft.goal = g.value;
}

function startFromDraft() {
  readGoal();
  const d = draft;
  if (on('goalRequired') && !d.goal.trim()) {
    toast('Add a one-line “Done means…” goal first.');
    document.querySelector('#setup-form [name=goal]')?.focus();
    return;
  }
  let hardStopAt = null;
  if (d.hardStop && d.hardStopTime) {
    const [h, m] = d.hardStopTime.split(':').map(Number);
    const t = new Date(); t.setHours(h, m, 0, 0);
    if (t.getTime() < Date.now()) t.setDate(t.getDate() + 1);
    hardStopAt = t.getTime();
  }
  session.createSession({
    subjectId: d.subjectId || null, topicIds: d.topicIds, type: d.type, goal: d.goal.trim(),
    sprintLen: d.sprintLen, breakLen: d.breakLen, sprints: d.sprints, hardStopAt, planId: d.planId,
  }, { ritual: on('startRitual') && (S.settings.ritualItems || []).length > 0 });
  draft = null;
  rv = { goalDone: null, attempted: '', correct: '', focus: null };
  gapText = '';
}

function logMistake() {
  const a = session.active();
  openQuickAdd({
    subjectId: a?.subjectId, topicId: a?.topicIds?.[0], sessionId: a?.id,
    onSaved: (m) => { const cur = session.active(); if (cur) session.update({ mistakeIds: [...cur.mistakeIds, m.id] }); if (cur?.phase === 'review') bus.refresh(); },
  });
}

export default {
  prefill(p) { pending = p; draft = null; },
  updateClock,
  render,
  mount(root) {
    root.querySelectorAll('[data-input]').forEach((inp) => inp.addEventListener('input', () => {
      const k = inp.dataset.input;
      if (k === 'goal' && draft) draft.goal = inp.value;
      else if (k === 'hardStopTime' && draft) draft.hardStopTime = inp.value;
      else if (k === 'histQ') { hist.q = inp.value; document.getElementById('hist-list').outerHTML; refreshHistory(); }
      else if (k === 'gapText') gapText = inp.value;
      else if (k === 'rvAttempted') rv.attempted = inp.value;
      else if (k === 'rvCorrect') rv.correct = inp.value;
    }));
  },
  on: {
    set: (el) => {
      readGoal();
      const { name, value } = el.dataset;
      if (name === 'subjectId') { draft.subjectId = value || null; draft.topicIds = []; }
      else if (name === 'topicIds') {
        const s = new Set(draft.topicIds); s.has(value) ? s.delete(value) : s.add(value); draft.topicIds = [...s];
      } else if (name === 'type') {
        const was = draft.type; draft.type = value;
        if (value === 'blurting' && was !== 'blurting') draft.sprintLen = 10;
        if (was === 'blurting' && value !== 'blurting') draft.sprintLen = S.settings.sprintLen || 20;
      } else if (name === 'sprintLen') draft.sprintLen = Number(value);
      bus.refresh();
    },
    sprints: (el) => { readGoal(); draft.sprints = Math.min(8, Math.max(1, draft.sprints + Number(el.dataset.d))); bus.refresh(); },
    breakLen: (el) => { draft.breakLen = Number(el.value); },
    hardStop: (el) => {
      readGoal(); draft.hardStop = el.checked;
      if (el.checked) draft.hardStopTime = defaultHardStop(draft.sprintLen * draft.sprints + draft.breakLen * (draft.sprints - 1));
      bus.refresh();
    },
    histSubject: (el) => { hist.subjectId = el.value; refreshHistory(); },
    more: () => { hist.limit += 20; refreshHistory(); },
    start: startFromDraft,
    ritual: (el) => {
      const a = session.active(); const i = Number(el.dataset.i);
      const set = new Set(a.ritualChecked); el.checked ? set.add(i) : set.delete(i);
      session.update({ ritualChecked: [...set] });
      session.unlockAudio();
      if (set.size >= (S.settings.ritualItems || []).length) setTimeout(() => session.startFromRitual(), 250);
    },
    skipRitual: () => session.startFromRitual(),
    cancel: () => session.discard(),
    pause: () => session.pause(),
    resume: () => session.resume(),
    nextSprint: () => session.nextSprint(),
    stop: async () => {
      if (await confirmDialog('End this session?', 'Your focus time so far is kept, and you’ll get the quick review.', 'End session')) session.stop();
    },
    stopNow: () => session.stop(),
    dismissStop: () => session.dismissHardStop(),
    enableSound: () => { session.unlockAudio(); setTimeout(() => { session.rescheduleSounds(); bus.refresh(); }, 100); },
    toReview: () => session.toReview(),
    keepYes: () => session.keepGoing(true),
    keepNo: () => session.keepGoing(false),
    logMistake,
    openRedo: () => { const a = session.active(); openRedo({ subjectId: a.subjectId, topicId: a.topicIds[0], allowOpen: true }); },
    addGap: () => {
      const t = gapText.trim(); if (!t) return;
      const a = session.active();
      session.update({ gaps: [...a.gaps, { text: t, mistakeId: null }] });
      gapText = '';
      bus.refresh();
      setTimeout(() => document.getElementById('gap-input')?.focus(), 0);
    },
    gapToMistake: (el) => {
      const a = session.active(); const i = Number(el.dataset.i);
      const g = a.gaps[i]; if (!g) return;
      const topic = topicById(a.topicIds[0]);
      const m = save('mistakes', {
        subjectId: a.subjectId, topicId: a.topicIds[0] || null,
        source: `Blurting${topic ? ` · ${topic.name}` : ''}`,
        wrong: `Missed when blurting: ${g.text}`,
        fix: g.text,
        type: 'Content', date: today(), sessionId: a.id, ...newMistakeFields(),
      });
      const gaps = a.gaps.map((x, j) => (j === i ? { ...x, mistakeId: m.id } : x));
      session.update({ gaps, mistakeIds: [...a.mistakeIds, m.id] });
      bus.refresh();
    },
    rv: (el) => { rv.goalDone = el.dataset.value; bus.refresh(); },
    rvFocus: (el) => { const v = Number(el.dataset.v); rv.focus = rv.focus === v ? null : v; bus.refresh(); },
    discard: async () => {
      if (await confirmDialog('Discard this session?', 'It won’t be saved or counted. Mistakes you logged stay in your log.', 'Discard', true)) {
        session.discard(); bus.go('#today');
      }
    },
    save: () => {
      const num = (v) => (v === '' || v === null ? null : Math.max(0, Number(v)));
      const rec = session.finish({ goalDone: rv.goalDone, attempted: num(rv.attempted), correct: num(rv.correct), focus: rv.focus });
      rv = { goalDone: null, attempted: '', correct: '', focus: null };
      const mins = Math.round((rec?.focusMs || 0) / 60000);
      toast(mins ? `Saved — ${mins} minutes${rec.subjectId ? ` on ${subjectLabel(subjectById(rec.subjectId))}` : ''}.` : 'Saved.');
      bus.go('#today');
    },
  },
};

function refreshHistory() {
  const holder = document.getElementById('hist-list');
  if (!holder) return;
  const tmp = document.createElement('div');
  tmp.innerHTML = historyHtml();
  const fresh = tmp.querySelector('#hist-list');
  if (fresh) holder.replaceWith(fresh);
}

export { lastSession };
