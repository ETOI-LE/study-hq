// Onboarding: one question per screen, skippable, under 3 minutes.
import { S, save, saveProfile, saveSettings, featuresFor, DEFAULT_RITUAL } from '../store.js';
import { IB_SUBJECTS, IB_TOPICS, IB_GRADES, CORE_GRADES, SUBJECT_COLORS } from '../data-ib.js';
import { esc, icon, chips, bus, toast } from '../ui.js';
import { topicsOf } from '../logic.js';
import * as session from '../session.js';
import { addSampleData } from '../sample.js';

const QUESTIONS = ['name', 'course', 'subjects', 'grades', 'hardest', 'focus', 'hyperfocus', 'practice', 'notes', 'taskApp', 'reviewDay', 'startMode'];
const FLOW = ['welcome', ...QUESTIONS, 'summary', 'tourAsk', 'tour1', 'tour2', 'tour3', 'finish'];

const HARDEST = [
  { value: 'starting', label: 'Getting started' },
  { value: 'focus', label: 'Staying focused' },
  { value: 'finishing', label: 'Finishing tasks' },
  { value: 'organised', label: 'Staying organised' },
  { value: 'remembering', label: 'Remembering content' },
  { value: 'careless', label: 'Careless mistakes' },
];
const FOCUS = [
  { value: '15', label: '10–15 min' }, { value: '20', label: '20 min' }, { value: '25', label: '25 min' },
  { value: '45', label: '45+ min' }, { value: 'unsure', label: 'Not sure' },
];
const PRACTICE = ['Revision Village', 'Pestle', 'Save My Exams', 'Past papers', 'Textbook', 'Other'];
const NOTES = [
  { value: 'paper', label: 'Paper' }, { value: 'tablet', label: 'Tablet (reMarkable, iPad…)' },
  { value: 'laptop', label: 'Laptop' }, { value: 'mix', label: 'A mix' },
];
const TASK_APPS = ['TickTick', 'Todoist', 'Google Calendar', 'School planner', 'Other', 'Nothing yet'];
const DAYS = [
  { value: 1, label: 'Mon' }, { value: 2, label: 'Tue' }, { value: 3, label: 'Wed' }, { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' }, { value: 6, label: 'Sat' }, { value: 0, label: 'Sun' },
];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

let A = null;        // draft answers
let step = 'welcome';
let fromSummary = false;
let mode = 'new';    // 'new' | 'redo' | 'edit'
let subjQuery = '';
let customName = '';
let customLevel = '';

function blankAnswers() {
  return {
    name: '', course: null, subjects: [], hardest: [], focus: null, hyperfocus: null,
    practice: [], notes: null, taskApp: null, taskAppOther: '', reviewDay: 0, startMode: 'simple',
  };
}

function answersFromProfile() {
  const p = S.profile || {};
  const a = { ...blankAnswers(), ...(p.answers || {}) };
  // Current subjects become the selection.
  a.subjects = S.subjects.filter((s) => !s.sample).map((s) => ({
    sid: s.ibKey ? `${s.ibKey}|${s.level}` : `c:${s.name}|${s.level || ''}`,
    ibKey: s.ibKey || null, name: s.name, short: s.short, level: s.level || '', scale: s.scale,
    current: s.current || '', target: s.target || '', existingId: s.id,
  }));
  return a;
}

const sidOf = (key, level) => `${key}|${level}`;
const course = () => A.course || 'ib';

function progress() {
  const i = QUESTIONS.indexOf(step);
  if (i < 0) return '';
  const pct = Math.round(((i + 1) / QUESTIONS.length) * 100);
  return `<div class="ob-top">
    <button class="icon-btn" data-act="back" aria-label="Back">${icon('back')}</button>
    <div class="ob-progress" role="progressbar" aria-valuenow="${i + 1}" aria-valuemin="1" aria-valuemax="${QUESTIONS.length}" aria-label="Question ${i + 1} of ${QUESTIONS.length}"><div style="width:${pct}%"></div></div>
    <span class="muted small">${i + 1}/${QUESTIONS.length}</span></div>`;
}

function actions(nextLabel = 'Next', skipLabel = 'Skip') {
  return `<div class="ob-actions">
    <button class="btn btn-primary" data-act="next">${fromSummary ? 'Back to summary' : esc(nextLabel)}</button>
    ${skipLabel ? `<button class="link-btn" data-act="skip">${esc(skipLabel)}</button>` : ''}
  </div>`;
}

function q(title, lead, body, opts = {}) {
  return `${progress()}<h1>${esc(title)}</h1>${lead ? `<p class="lead">${esc(lead)}</p>` : ''}${body}${actions(opts.next, opts.skip === undefined ? 'Skip' : opts.skip)}`;
}

// ---------- Subjects step ----------
function subjectListHtml() {
  const query = subjQuery.trim().toLowerCase();
  const list = IB_SUBJECTS.filter((s) => !query || s.name.toLowerCase().includes(query) || (s.short || '').toLowerCase().includes(query) || s.group.toLowerCase().includes(query));
  if (!list.length) return `<p class="muted small" style="padding:12px">No match. Add it as your own subject below.</p>`;
  return list.map((s) => `<div class="subj-item">
    <span class="name">${esc(s.name)} <span class="muted tiny">${esc(s.group)}</span></span>
    ${s.levels.map((lv) => {
      const sel = A.subjects.some((x) => x.sid === sidOf(s.key, lv));
      return `<button type="button" class="chip lv${sel ? ' on' : ''}" aria-pressed="${sel}" data-act="toggleSubj" data-key="${s.key}" data-level="${lv}">${lv}</button>`;
    }).join('')}
  </div>`).join('');
}

function selectedSubjectsHtml() {
  if (!A.subjects.length) return `<p class="muted small">No subjects picked yet.</p>`;
  return `<div class="chips">${A.subjects.map((s) => `<button type="button" class="chip on" data-act="removeSubj" data-sid="${esc(s.sid)}" aria-label="Remove ${esc(s.name)}">${esc(s.short || s.name)} ${esc(s.level)} ${icon('close', 14)}</button>`).join('')}</div>`;
}

function stepSubjects() {
  const ib = course() === 'ib';
  const custom = `<div class="card quiet" style="margin-top:14px">
      <div class="field-label">${ib ? 'Add your own' : 'Add a subject'}</div>
      <form class="row wrap" data-submit="addCustom">
        <input type="text" class="grow" id="ob-custom-name" placeholder="${ib ? 'e.g. Korean A: Literature' : 'e.g. A-level Chemistry'}" value="${esc(customName)}" data-input="customName" style="flex:2 1 200px">
        <input type="text" id="ob-custom-level" placeholder="Level (optional)" value="${esc(customLevel)}" data-input="customLevel" style="flex:1 1 120px">
        <button class="btn" type="submit">${icon('plus')} Add</button>
      </form></div>`;
  const body = `
    <div id="ob-selected">${selectedSubjectsHtml()}</div>
    ${ib ? `<div class="search" style="margin-top:14px">${icon('search')}<input type="search" placeholder="Search IB subjects" value="${esc(subjQuery)}" data-input="subjSearch" aria-label="Search IB subjects"></div>
    <div class="subj-list" id="ob-subj-list">${subjectListHtml()}</div>` : ''}
    ${custom}`;
  return q('Pick your subjects', ib ? 'Tap SL or HL. Colours are picked for you, and you can change them later.' : 'Add each subject you study. Topics can be added later.', body);
}

// ---------- Grades step ----------
function gradeInput(s, field) {
  const val = s[field] || '';
  const label = `${field === 'current' ? 'Current' : 'Target'} grade for ${s.name}`;
  if (s.scale === 'ib' || s.scale === 'core') {
    const opts = s.scale === 'core' ? CORE_GRADES : IB_GRADES;
    return `<select data-change="grade" data-sid="${esc(s.sid)}" data-field="${field}" aria-label="${esc(label)}"><option value="">–</option>${opts.map((g) => `<option${g === val ? ' selected' : ''}>${g}</option>`).join('')}</select>`;
  }
  return `<input type="text" value="${esc(val)}" placeholder="e.g. B" data-input="gradeText" data-sid="${esc(s.sid)}" data-field="${field}" aria-label="${esc(label)}">`;
}

function stepGrades() {
  if (!A.subjects.length) {
    return q('Current and target grade', 'You haven’t picked any subjects yet, so there’s nothing to set here. You can add grades later in Settings.', '');
  }
  const body = `<div class="grade-row muted small" style="border:0;padding-bottom:0"><span>Subject</span><span>Now</span><span>Target</span></div>
    ${A.subjects.map((s) => `<div class="grade-row"><span>${esc(s.short || s.name)} ${esc(s.level)}</span>${gradeInput(s, 'current')}${gradeInput(s, 'target')}</div>`).join('')}`;
  return q('Current and target grade', 'Optional. Subjects furthest from target show up first on Today.', body);
}

// ---------- Summary ----------
const labelOf = (list, v) => (list.find((x) => (x.value ?? x) === v)?.label) || v;

function summaryRows() {
  const fx = featuresFor(A);
  const sprint = A.focus && A.focus !== 'unsure' ? `${A.focus} min` : '20 min';
  const onList = [
    'Today', 'Focus sessions', 'Mistake log',
    fx.topicTracker && 'Topic tracker',
    fx.startRitual && 'Start ritual',
    fx.justFiveMain && '“Just 5 minutes” as the main button',
    fx.eveningPrompt && 'Evening “Set up tomorrow” prompt',
    fx.goalRequired && 'A “Done means…” goal for every session',
    fx.askType && 'Mistake type on every mistake',
    fx.notesField && '“Where my notes are” on every topic',
    fx.blurtMore && 'More blurting suggestions',
  ].filter(Boolean);
  const rows = [
    ['name', 'Name', A.name || 'Skipped'],
    ['course', 'Studying', course() === 'ib' ? 'IB Diploma' : 'Other course'],
    ['subjects', 'Subjects', A.subjects.length ? A.subjects.map((s) => `${s.short || s.name} ${s.level}`.trim()).join(', ') : 'None yet — add them any time'],
    ['grades', 'Grades', A.subjects.some((s) => s.current || s.target) ? A.subjects.filter((s) => s.current || s.target).map((s) => `${s.short || s.name}: ${s.current || '–'} → ${s.target || '–'}`).join(', ') : 'Skipped'],
    ['hardest', 'Hardest for you', A.hardest.length ? A.hardest.map((h) => labelOf(HARDEST, h)).join(', ') : 'Skipped'],
    ['focus', 'Sprint length', sprint],
    ['hyperfocus', 'Hard-stop alarm', A.hyperfocus ? 'On by default' : 'Off by default'],
    ['practice', 'Practice sources', A.practice.length ? A.practice.join(', ') : 'Skipped'],
    ['notes', 'Notes', A.notes ? labelOf(NOTES, A.notes) : 'Skipped'],
    ['taskApp', 'Homework app', taskAppName() || 'Skipped'],
    ['reviewDay', 'Weekly review day', DAY_NAMES[A.reviewDay ?? 0]],
    ['startMode', 'Start with', A.startMode === 'everything' ? 'Everything' : 'Simple'],
  ];
  return { rows, onList };
}

function taskAppName() {
  if (!A.taskApp || A.taskApp === 'Nothing yet') return A.taskApp || '';
  if (A.taskApp === 'Other') return A.taskAppOther.trim() || 'Other';
  return A.taskApp;
}

function stepSummary() {
  const { rows, onList } = summaryRows();
  return `<h1>Here’s your setup</h1>
    <p class="lead">You can change any of this later in Settings › My setup.</p>
    <div class="card"><ul class="summary-list">${rows.map(([k, label, v]) => `<li><span class="k">${esc(label)}</span><span class="v">${esc(v)}</span><button class="link-btn" data-act="jump" data-step="${k}">Change</button></li>`).join('')}</ul></div>
    <div class="card soft"><h3>Switched on for you</h3><p class="small" style="margin:0">${esc(onList.join(' · '))}</p>
    <p class="small muted" style="margin:8px 0 0">Everything else is one switch away in Settings.</p></div>
    ${mode !== 'new' ? `<p class="small muted">Subjects you already have are kept. New ones are added.</p>` : ''}
    <div class="ob-actions"><button class="btn btn-primary" data-act="apply">Looks good</button><button class="btn" data-act="jump" data-step="name" data-from="walk">Change something</button></div>`;
}

const TOURS = {
  tour1: ['today', 'Today tells you what’s next', 'Press Start studying and the session is already set up for the top suggestion. Each suggestion says why it’s there.'],
  tour2: ['focus', 'Focus sessions', 'Short sprints with breaks. Your goal stays on screen, and you can log a mistake without leaving the timer.'],
  tour3: ['mistakes', 'The mistake log', 'Log a mistake in three lines. Study HQ brings it back for a redo in 3 days, then again a week later, until it’s fixed.'],
};

function render() {
  if (!A) { A = blankAnswers(); step = 'welcome'; mode = 'new'; }
  let html = '';
  switch (step) {
    case 'welcome':
      html = `<div class="tour-art">${icon('focus', 64)}</div>
        <h1>Welcome to Study HQ</h1>
        <p class="lead">One place for your mistakes, topics and focus sessions. A few quick questions set it up for you — about 2 minutes.</p>
        <p class="small muted">Homework and deadlines stay in your own planner. Your data stays in this browser and nobody else can see it.</p>
        <div class="ob-actions"><button class="btn btn-primary btn-big" data-act="next" style="max-width:280px">Let’s go</button>
        <button class="link-btn" data-act="skipAll">Skip setup and use defaults</button></div>`;
      break;
    case 'name':
      html = q('What should we call you?', 'Just for the greeting on your Today screen.',
        `<input type="text" id="ob-name" placeholder="Your name" value="${esc(A.name)}" data-input="name" autocomplete="given-name" aria-label="Your name" autofocus>`);
      break;
    case 'course':
      html = q('What are you studying?', '', `<div class="opt-list">${chips('course', [
        { value: 'ib', label: 'IB Diploma' }, { value: 'other', label: 'Other course' }], A.course, { act: 'pick' })}</div>
        <p class="small muted" style="margin-top:12px">Skipping uses IB Diploma.</p>`);
      break;
    case 'subjects': html = stepSubjects(); break;
    case 'grades': html = stepGrades(); break;
    case 'hardest':
      html = q('What’s hardest for you?', 'Pick any. This switches on the tools that help with it.',
        `<div class="opt-list">${chips('hardest', HARDEST, A.hardest, { multi: true, act: 'pick' })}</div>`);
      break;
    case 'focus': {
      const pre = A.focus ?? (A.hardest.includes('focus') ? '15' : null);
      html = q('How long can you usually focus before you need a break?', A.hardest.includes('focus') && !A.focus ? 'We suggest 15-minute sprints to start — you can change this any time.' : 'This sets your default sprint length.',
        `<div class="opt-list">${chips('focus', FOCUS, pre, { act: 'pick' })}</div>`);
      break;
    }
    case 'hyperfocus':
      html = q('Do you sometimes get so absorbed you lose track of time?', 'If yes, sessions get a hard-stop alarm by default so a long streak doesn’t eat your other plans.',
        `<div class="opt-list">${chips('hyperfocus', [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }], A.hyperfocus === null ? null : (A.hyperfocus ? 'yes' : 'no'), { act: 'pick' })}</div>`);
      break;
    case 'practice':
      html = q('Where do you practise questions?', 'Pick any. These show up as quick options when you log a mistake.',
        `<div class="opt-list">${chips('practice', PRACTICE, A.practice, { multi: true, act: 'pick' })}</div>`);
      break;
    case 'notes':
      html = q('Where do you take notes?', 'Study HQ doesn’t store notes — it just remembers where yours are.',
        `<div class="opt-list">${chips('notes', NOTES, A.notes, { act: 'pick' })}</div>`);
      break;
    case 'taskApp':
      html = q('What do you use for homework and deadlines?', 'Study HQ leaves deadlines to that app, and will remind you to put dates there.',
        `<div class="opt-list">${chips('taskApp', TASK_APPS, A.taskApp, { act: 'pick' })}</div>
        ${A.taskApp === 'Other' ? `<input type="text" style="margin-top:12px" placeholder="Which app?" value="${esc(A.taskAppOther)}" data-input="taskAppOther" aria-label="Which app">` : ''}`);
      break;
    case 'reviewDay':
      html = q('Which day suits a 15-minute weekly review?', 'A short look back at your week. Default is Sunday.',
        chips('reviewDay', DAYS.map((d) => ({ value: String(d.value), label: d.label })), String(A.reviewDay ?? 0), { act: 'pick' }));
      break;
    case 'startMode':
      html = q('How much do you want to start with?', '', `<div class="opt-list">${chips('startMode', [
        { value: 'simple', label: 'Start simple (recommended) — Today, focus sessions and the mistake log' },
        { value: 'everything', label: 'Everything — all the tools switched on' }], A.startMode, { act: 'pick' })}</div>
        <p class="small muted" style="margin-top:12px">Anything else can be switched on in Settings.</p>`, { next: 'See my setup' });
      break;
    case 'summary': html = stepSummary(); break;
    case 'tourAsk':
      html = `<div class="tour-art">${icon('sparkle', 56)}</div><h1>All set${A.name ? `, ${esc(A.name)}` : ''}!</h1>
        <p class="lead">Want a quick tour? It’s 3 screens.</p>
        <div class="ob-actions"><button class="btn btn-primary" data-act="goto" data-step="tour1">Show me</button><button class="btn" data-act="goto" data-step="finish">Skip the tour</button></div>`;
      break;
    case 'tour1': case 'tour2': case 'tour3': {
      const [ic, title, text] = TOURS[step];
      const n = Number(step.slice(-1));
      html = `<div class="ob-top"><div class="ob-progress"><div style="width:${(n / 3) * 100}%"></div></div><span class="muted small">${n}/3</span></div>
        <div class="tour-art">${icon(ic, 64)}</div><h1>${esc(title)}</h1><p class="lead">${esc(text)}</p>
        <div class="ob-actions"><button class="btn btn-primary" data-act="goto" data-step="${n < 3 ? `tour${n + 1}` : 'finish'}">${n < 3 ? 'Next' : 'Done'}</button>
        <button class="link-btn" data-act="goto" data-step="finish">Skip</button></div>`;
      break;
    }
    case 'finish':
      html = `<div class="tour-art">${icon('play', 56)}</div><h1>Ready when you are</h1>
        <p class="lead">The best way to start is to start small.</p>
        <div class="start-block"><button class="btn btn-primary btn-big" data-act="start5">Start my first 5 minutes</button>
        <button class="btn btn-big" data-act="sample">Try it with sample data</button></div>
        <p class="center"><button class="link-btn" data-act="toToday">Just take me to Today</button></p>`;
      break;
  }
  return `<div class="ob">${html}</div>`;
}

function rerender() { bus.refresh(); }

function goStep(s) { step = s; rerender(); window.scrollTo(0, 0); }

function next() {
  if (fromSummary && QUESTIONS.includes(step)) { fromSummary = false; goStep('summary'); return; }
  const i = FLOW.indexOf(step);
  goStep(FLOW[Math.min(i + 1, FLOW.length - 1)]);
}

function back() {
  if (fromSummary) { fromSummary = false; goStep('summary'); return; }
  if (mode !== 'new' && step === 'name') { A = null; mode = 'new'; step = 'welcome'; bus.go('#settings'); return; }
  const i = FLOW.indexOf(step);
  goStep(FLOW[Math.max(i - 1, 0)]);
}

// Skipping a question uses the default shown.
const DEFAULTS = {
  name: () => { A.name = ''; },
  course: () => { if (!A.course) A.course = 'ib'; },
  focus: () => { if (!A.focus) A.focus = A.hardest.includes('focus') ? '15' : 'unsure'; },
  hyperfocus: () => { if (A.hyperfocus === null) A.hyperfocus = false; },
};

function nextColor(used) {
  return SUBJECT_COLORS.find((c) => !used.has(c)) || SUBJECT_COLORS[used.size % SUBJECT_COLORS.length];
}

/** Turn the answers into a real setup. */
export function applyAnswers(ans, { isNew = true } = {}) {
  const a = { ...blankAnswers(), ...ans };
  if (!a.course) a.course = 'ib';
  if (!a.focus) a.focus = a.hardest.includes('focus') ? '15' : 'unsure';
  if (a.hyperfocus === null) a.hyperfocus = false;
  const features = featuresFor(a);
  const { subjects, ...stored } = a;
  saveProfile({ answers: stored, name: a.name.trim(), course: a.course, features, onboarded: true, onboardedAt: new Date().toISOString() });

  const sprintLen = a.focus === 'unsure' ? 20 : Number(a.focus);
  const ritual = a.hardest.includes('focus') || a.startMode === 'everything' || !features.startRitual
    ? [...DEFAULT_RITUAL] : DEFAULT_RITUAL.filter((x) => x !== 'Only this tab open');
  const patch = { sprintLen, hardStopOn: !!a.hyperfocus, taskApp: taskAppFrom(a), practiceSources: a.practice.filter((p) => p !== 'Other') };
  if (isNew || !S.settings.ritualCustomised) patch.ritualItems = ritual;
  saveSettings(patch);

  // Subjects and pre-filled topics
  const used = new Set(S.subjects.map((s) => s.color));
  let order = S.subjects.length;
  for (const s of subjects) {
    const existing = s.existingId ? S.subjects.find((x) => x.id === s.existingId)
      : S.subjects.find((x) => !x.sample && (s.ibKey ? x.ibKey === s.ibKey && x.level === s.level : x.name === s.name && (x.level || '') === (s.level || '')));
    if (existing) {
      save('subjects', { ...existing, current: s.current || existing.current || '', target: s.target || existing.target || '' });
      continue;
    }
    const color = nextColor(used); used.add(color);
    const subj = save('subjects', {
      name: s.name, short: s.short || '', level: s.level || '', ibKey: s.ibKey || null,
      scale: s.scale || (a.course === 'ib' && s.ibKey ? 'ib' : 'text'), color,
      current: s.current || '', target: s.target || '', order: order++,
    });
    const list = s.ibKey ? IB_TOPICS[s.ibKey] : null;
    if (list && !topicsOf(subj.id).length) {
      list.forEach((name, i) => save('topics', { subjectId: subj.id, parentId: null, name, confidence: null, notes: '', order: i }));
    }
  }
}

function taskAppFrom(a) {
  if (!a.taskApp || a.taskApp === 'Nothing yet') return '';
  if (a.taskApp === 'Other') return (a.taskAppOther || '').trim();
  return a.taskApp;
}

export default {
  isActive: () => mode !== 'new' && A !== null,
  enter(params) {
    const m = params[0];
    if (m === 'redo' || m === 'edit') {
      if (mode === m && A) return;
      mode = m;
      A = answersFromProfile();
      step = m === 'edit' ? 'summary' : 'name';
      fromSummary = false;
    } else if (!A) {
      mode = 'new'; A = blankAnswers(); step = 'welcome';
    }
  },
  render,
  on: {
    next: () => { if (DEFAULTS[step]) DEFAULTS[step](); next(); },
    skip: () => { if (DEFAULTS[step]) DEFAULTS[step](); next(); },
    back,
    jump: (el) => { fromSummary = el.dataset.from !== 'walk'; goStep(el.dataset.step); },
    goto: (el) => goStep(el.dataset.step),
    skipAll: () => {
      applyAnswers(blankAnswers(), { isNew: true });
      A = null; mode = 'new'; step = 'welcome';
      toast('Set up with defaults. Change anything in Settings.');
      bus.go('#today');
    },
    pick: (el) => {
      const { name, value } = el.dataset;
      if (name === 'hardest' || name === 'practice') {
        const set = new Set(A[name]);
        set.has(value) ? set.delete(value) : set.add(value);
        A[name] = [...set];
        rerender();
        return;
      }
      if (name === 'hyperfocus') A.hyperfocus = value === 'yes';
      else if (name === 'reviewDay') A.reviewDay = Number(value);
      else if (name === 'course') {
        if (A.course && A.course !== value) A.subjects = A.subjects.filter((s) => !s.ibKey || value === 'ib');
        A.course = value;
      } else A[name] = value;
      if (name === 'taskApp' && value === 'Other') { rerender(); return; }
      rerender();
      // Single-choice questions move on by themselves.
      setTimeout(() => { if (step === name) next(); }, 180);
    },
    toggleSubj: (el) => {
      const { key, level } = el.dataset;
      const sid = sidOf(key, level);
      const i = A.subjects.findIndex((s) => s.sid === sid);
      if (i >= 0) A.subjects.splice(i, 1);
      else {
        // Only one level of a subject at a time.
        A.subjects = A.subjects.filter((s) => s.ibKey !== key);
        const ib = IB_SUBJECTS.find((s) => s.key === key);
        A.subjects.push({ sid, ibKey: key, name: ib.name, short: ib.short || '', level, scale: ib.scale || 'ib', current: '', target: '' });
      }
      document.getElementById('ob-subj-list').innerHTML = subjectListHtml();
      document.getElementById('ob-selected').innerHTML = selectedSubjectsHtml();
    },
    removeSubj: (el) => {
      A.subjects = A.subjects.filter((s) => s.sid !== el.dataset.sid);
      const list = document.getElementById('ob-subj-list');
      if (list) list.innerHTML = subjectListHtml();
      document.getElementById('ob-selected').innerHTML = selectedSubjectsHtml();
    },
    addCustom: () => {
      const name = customName.trim();
      if (!name) { document.getElementById('ob-custom-name').focus(); return; }
      const level = customLevel.trim();
      const sid = `c:${name}|${level}`;
      if (!A.subjects.some((s) => s.sid === sid)) A.subjects.push({ sid, ibKey: null, name, short: '', level, scale: 'text', current: '', target: '' });
      customName = ''; customLevel = '';
      rerender();
      setTimeout(() => document.getElementById('ob-custom-name')?.focus(), 0);
    },
    apply: () => {
      applyAnswers(A, { isNew: mode === 'new' });
      if (mode !== 'new') {
        A = null; mode = 'new'; step = 'welcome';
        toast('Setup updated.');
        bus.go('#settings');
        return;
      }
      goStep('tourAsk');
    },
    start5: () => {
      const first = S.subjects[0];
      session.createSession({ subjectId: first?.id || null, type: 'practice', quick5: true, sprintLen: 5, goal: 'Just start — 5 minutes' });
      A = null; step = 'welcome';
      bus.go('#focus');
    },
    sample: () => {
      addSampleData();
      A = null; step = 'welcome';
      toast('Sample data added. Clear it any time in Settings.');
      bus.go('#today');
    },
    toToday: () => { A = null; step = 'welcome'; bus.go('#today'); },
  },
  // Text inputs update the draft without re-rendering (keeps focus).
  mount(root) {
    root.querySelectorAll('[data-input]').forEach((inp) => {
      inp.addEventListener('input', () => {
        const k = inp.dataset.input;
        if (k === 'name') A.name = inp.value;
        else if (k === 'taskAppOther') A.taskAppOther = inp.value;
        else if (k === 'customName') customName = inp.value;
        else if (k === 'customLevel') customLevel = inp.value;
        else if (k === 'subjSearch') { subjQuery = inp.value; document.getElementById('ob-subj-list').innerHTML = subjectListHtml(); }
        else if (k === 'gradeText') { const s = A.subjects.find((x) => x.sid === inp.dataset.sid); if (s) s[inp.dataset.field] = inp.value; }
      });
    });
    root.querySelectorAll('[data-change="grade"]').forEach((sel) => {
      sel.addEventListener('change', () => { const s = A.subjects.find((x) => x.sid === sel.dataset.sid); if (s) s[sel.dataset.field] = sel.value; });
    });
    const name = root.querySelector('#ob-name');
    if (name) name.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); next(); } });
    if (step === 'name' && name) setTimeout(() => name.focus(), 30);
  },
};

export { HARDEST, DAY_NAMES, NOTES, FOCUS, labelOf };
