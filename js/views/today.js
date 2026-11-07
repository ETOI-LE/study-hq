// Today: one big start button, what to do next (with reasons), this week.
import { S, on, setMeta, uid } from '../store.js';
import {
  upNext, weekStats, subjectById, subjectLabel, subjectsByGap, topicsOf, topicLabel, today, addDays, daysBetween, dayStr, typeLabel, reviewDue, practiceWeek,
} from '../logic.js';
import { weekPracticeCard, openPracticeLog } from './practice.js';
import { openCardEditor, openReview } from './cards.js';
import { esc, icon, bus, chips, openModal, closeModal, modalHead, renderModal, toast, plural, subjectOptions } from '../ui.js';
import * as session from '../session.js';
import focusView from './focus.js';
import { openRedo } from './mistakes.js';

function greeting() {
  const h = new Date().getHours();
  const part = h < 5 ? 'Hi' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  const name = S.profile?.name;
  return name ? `${part}, ${name}` : part;
}

export function backupDaysAgo() {
  const last = S.settings.lastBackupAt;
  if (last) return daysBetween(dayStr(new Date(last)), today());
  return null;
}

export function needsBackupReminder() {
  const hasData = S.mistakes.length + S.sessions.length > 0;
  if (!hasData) return false;
  const n = backupDaysAgo();
  if (n !== null) return n >= 7;
  const since = S.profile?.onboardedAt ? daysBetween(dayStr(new Date(S.profile.onboardedAt)), today()) : 0;
  return since >= 7;
}

function weekCard() {
  const w = weekStats();
  const labels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const t = today();
  const dots = w.days.map((d, i) => `<div class="d"><div class="c${w.studied.has(d) ? ' on' : ''}${d === t ? ' today' : ''}" title="${d}${w.studied.has(d) ? ' — studied' : ''}">${icon('check', 15)}</div>${labels[i]}</div>`).join('');
  const rows = subjectsByGap().map((s) => ({ s, m: w.minutes.get(s.id) || 0 })).filter((r) => r.m > 0);
  const none = w.minutes.get('_none') || 0;
  const max = Math.max(1, ...rows.map((r) => r.m), none);
  const bars = rows.map(({ s, m }) => `<div class="bar-row"><span class="label">${esc(subjectLabel(s))}</span><div class="track"><div class="fill" style="width:${(m / max) * 100}%;background:${esc(s.color)}"></div></div><span class="muted small tabnum">${m} min</span></div>`).join('')
    + (none ? `<div class="bar-row"><span class="label">General</span><div class="track"><div class="fill" style="width:${(none / max) * 100}%"></div></div><span class="muted small tabnum">${none} min</span></div>` : '');
  const n = w.studied.size;
  return `<div class="card"><div class="card-head"><h3>This week</h3><span class="muted small">${n ? `<b data-count="${n}">${n}</b> ${n === 1 ? 'day' : 'days'} studied · <span data-count="${w.total}">${w.total}</span> min` : 'A fresh week'}</span></div>
    <div class="week-dots" aria-label="Days studied this week">${dots}</div>
    ${bars ? `<div class="bars">${bars}</div>` : `<p class="muted small" style="margin:0">Minutes per subject show up here after your first session.</p>`}</div>`;
}

const KIND_ICON = { plan: 'sparkle', redo: 'redo', cards: 'cards', topic: 'topics' };

function upNextCard(list) {
  if (!list.length) {
    const hasSubjects = S.subjects.length > 0;
    return `<div class="card"><h3>Up next</h3><div class="empty" style="padding:14px 0">
      <p>${hasSubjects ? 'Suggestions appear here once you’ve logged a mistake or rated a topic.' : 'Add your subjects and Study HQ will suggest what to work on, with a reason for each.'}</p>
      <p class="example">e.g. “Calculus — blurting · Confidence 2/5 · not studied for 12 days”</p>
      ${hasSubjects ? '' : `<a class="btn btn-soft" href="#settings/subjects">Add subjects</a>`}</div></div>`;
  }
  return `<div class="card up-next"><div class="card-head"><h3>Up next</h3><span class="tiny muted">Picked for you, with the reason</span></div><ul class="list">${list.map((it, i) => `
    <li><button class="list-item" data-act="item" data-i="${i}">
      <span class="num k-${it.kind}">${icon(KIND_ICON[it.kind] || 'chev', 16)}</span>
      <span class="grow"><span class="title">${esc(it.title)}</span>
      ${it.sub ? `<span class="muted small"> · ${esc(it.sub)}</span>` : ''}
      <span class="reason" style="display:block">${esc(it.reason)}</span></span>
      ${i === 0 ? '<span class="pill accent">First</span>' : ''}${icon('chev')}
    </button></li>`).join('')}</ul></div>`;
}

function heroCard(first, plan) {
  const fiveMain = on('justFiveMain');
  const startBtn = `<button class="btn ${fiveMain ? '' : 'btn-primary btn-big btn-start'}" data-act="start">${icon('play')} Start studying <span class="kbd">S</span></button>`;
  const fiveBtn = `<button class="btn ${fiveMain ? 'btn-primary btn-big btn-start' : ''}" data-act="five">${icon('timer', 18)} Just 5 minutes</button>`;
  const p = first?.prefill || {};
  const s = subjectById(p.subjectId || (first ? null : S.settings.lastSubjectId));
  const len = p.sprintLen || (p.type === 'blurting' ? 10 : S.settings.lastSetup?.sprintLen || S.settings.sprintLen || 20);
  const eyebrow = plan ? 'Your first step — set last night' : first ? 'Up next' : 'Ready when you are';
  const title = first ? first.title : (fiveMain ? 'Start tiny: just 5 minutes' : 'One focus session');
  const why = first ? first.reason : (fiveMain ? 'Starting is the hard part. Five minutes, then decide if you keep going.' : 'Everything is set up — press start and the timer runs.');
  return `<div class="hero"><div class="eyebrow">${esc(eyebrow)}</div>
    <div class="hero-title">${esc(title)}</div>
    <div class="hero-why">${esc(why)}</div>
    <div class="hero-meta">${s ? `<span class="tag" style="--c:${esc(s.color)}">${esc(subjectLabel(s))}</span>` : ''}${p.type ? `<span class="pill">${esc(typeLabel(p.type))}</span>` : ''}${first || !fiveMain ? `<span class="pill">${icon('timer', 13)} ${len} min</span>` : ''}</div>
    <div class="start-block">${fiveMain ? fiveBtn + startBtn : startBtn + fiveBtn}</div></div>`;
}

let items = [];

function render() {
  items = upNext();
  const plan = items.find((i) => i.kind === 'plan');
  const a = session.active();
  const hour = new Date().getHours();
  const tomorrowPlan = S.meta.plan && S.meta.plan.forDay === addDays(today(), 1);
  const evening = on('eveningPrompt') && hour >= 18 && !tomorrowPlan;
  const taskApp = S.settings.taskApp;
  const pending = S.meta.pendingImport;

  return `
    <div class="page-head"><div><div class="hello">${esc(greeting())}</div>
      <p class="muted">${new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</p></div></div>

    ${a ? `<div class="hero"><div class="eyebrow">Session in progress</div><div class="hero-title">${esc(session.describe(a) || 'Focus session')}</div>
      <div class="hero-why">Your timer is still running in the background.</div><div class="start-block"><a class="btn btn-primary btn-big" href="#focus">${icon('play')} Back to session</a></div></div>`
      : heroCard(items[0], plan)}

    ${pending ? `<div class="card soft"><div class="row between wrap"><div><b>A friend shared a pack with you</b><div class="small muted">Preview it before anything is added.</div></div>
      <div class="row"><button class="btn btn-ghost" data-act="dropPack">Not now</button><a class="btn btn-primary" href="#share/import/${esc(pending)}">Preview</a></div></div></div>` : ''}

    ${reviewDue() ? `<div class="card soft"><div class="row between wrap"><div><b>It’s weekly review day</b><div class="small muted">15 minutes to look back and pick next week’s focus topics.</div></div>
      <a class="btn btn-primary" href="#review">${icon('review', 18)} Start review</a></div></div>` : ''}

    ${evening ? `<div class="card soft"><div class="row between wrap"><div><b>Set up tomorrow?</b><div class="small muted">Pick one tiny first step so tomorrow starts itself.</div></div>
      <button class="btn btn-primary" data-act="tomorrow">Set up tomorrow</button></div></div>` : ''}

    ${upNextCard(items)}

    ${on('practiceLog') && practiceWeek().sets.length ? `<div class="grid2" style="margin-bottom:16px">${weekCard()}${weekPracticeCard({ compact: true })}</div>` : weekCard()}

    <div class="quick-actions">
      <button class="btn" data-act="newMistake">${icon('plus')} Log a mistake <span class="kbd" style="margin-left:auto">N</span></button>
      ${on('practiceLog') ? `<button class="btn" data-act="newPractice">${icon('practice', 18)} Log practice</button>` : ''}
      ${on('flashcards') ? `<button class="btn" data-act="newCard">${icon('cards', 18)} New flashcard</button>` : ''}
      ${evening ? '' : `<button class="btn" data-act="tomorrow">${icon('sparkle', 18)} ${tomorrowPlan ? 'Edit tomorrow’s step' : 'Set up tomorrow'}</button>`}
    </div>

    ${needsBackupReminder() ? `<div class="card quiet"><div class="row between wrap"><div><b>Time for a backup?</b>
      <div class="small muted">${backupDaysAgo() === null ? 'You haven’t backed up yet.' : `Last backup was ${backupDaysAgo()} days ago.`} It’s one tap and keeps your work safe.</div></div>
      <a class="btn" href="#settings/backup">${icon('download', 18)} Back up</a></div></div>` : ''}

    ${taskApp ? `<p class="tiny muted center" style="margin-top:24px">Deadlines live in ${esc(taskApp)} — Study HQ handles the studying.</p>` : ''}`;
}

// ---------- Set up tomorrow ----------
function openTomorrow() {
  const existing = S.meta.plan && S.meta.plan.forDay === addDays(today(), 1) ? S.meta.plan : null;
  const f = existing ? { ...existing } : {
    subjectId: S.settings.lastSubjectId || S.subjects[0]?.id || null,
    topicId: null, step: '', length: S.settings.sprintLen || 20,
  };
  const m = openModal({
    html: () => {
      const topics = f.subjectId ? topicsOf(f.subjectId) : [];
      return `${modalHead('Set up tomorrow', 'One tiny first step. Tomorrow’s Today screen shows it first.')}
      <form data-submit="save">
        ${S.subjects.length ? `<div class="field"><span>Subject</span>${chips('subjectId', subjectOptions(), f.subjectId, { act: 'pickT' })}</div>` : ''}
        ${topics.length ? `<label class="field"><span>Topic <span class="hint">(optional)</span></span>
          <select name="topicId" data-change="topic"><option value="">Any topic</option>${topics.map((t) => `<option value="${t.id}"${t.id === f.topicId ? ' selected' : ''}>${esc(topicLabel(t))}</option>`).join('')}</select></label>` : ''}
        <label class="field"><span>Tiny first step</span>
          <input type="text" name="step" required value="${esc(f.step)}" placeholder="e.g. Open Revision Village Calculus, do Q1 on the chain rule" autofocus></label>
        <div class="field"><span>Session length</span>${chips('length', [15, 20, 25, 45].map((n) => ({ value: String(n), label: `${n} min` })), String(f.length), { act: 'pickT' })}</div>
        <div class="row-actions end">${existing ? '<button type="button" class="btn btn-ghost" data-act="clear">Remove</button>' : ''}<button class="btn btn-primary" type="submit">Save for tomorrow</button></div>
      </form>`;
    },
    on: {
      pickT: (el) => {
        const stepVal = m.body.querySelector('[name=step]')?.value;
        if (stepVal !== undefined) f.step = stepVal;
        if (el.dataset.name === 'subjectId') { f.subjectId = el.dataset.value; f.topicId = null; } else f.length = Number(el.dataset.value);
        renderModal(m);
      },
      topic: (el) => { f.topicId = el.value || null; },
      clear: () => { setMeta('plan', null); closeModal(m); bus.refresh(); },
      save: () => {
        const stepText = m.body.querySelector('[name=step]').value.trim();
        if (!stepText) return;
        setMeta('plan', { id: uid(), forDay: addDays(today(), 1), subjectId: f.subjectId, topicId: f.topicId, step: stepText, length: f.length, type: 'practice', used: false });
        closeModal(m);
        toast('Saved. Tomorrow starts with that step.');
        bus.refresh();
      },
    },
  });
}

export default {
  render,
  on: {
    start: () => { focusView.prefill(items[0]?.prefill || null); bus.go('#focus'); },
    five: () => {
      const subjectId = S.settings.lastSubjectId && subjectById(S.settings.lastSubjectId) ? S.settings.lastSubjectId : (S.subjects[0]?.id || null);
      session.createSession({ subjectId, type: 'practice', quick5: true, sprintLen: 5, goal: 'Just start — 5 minutes' });
      bus.go('#focus');
    },
    item: (el) => {
      const it = items[Number(el.dataset.i)];
      if (!it) return;
      if (it.kind === 'redo') { openRedo({ ids: [it.mistakeId] }); return; }
      if (it.kind === 'cards') { openReview(); return; }
      focusView.prefill(it.prefill);
      bus.go('#focus');
    },
    tomorrow: openTomorrow,
    newPractice: () => openPracticeLog(),
    newCard: () => openCardEditor(),
    dropPack: () => { setMeta('pendingImport', null); bus.refresh(); },
    newMistake: async () => { const { openQuickAdd } = await import('./mistakes.js'); openQuickAdd(); },
  },
};
