// Today: one big start button, what to do next (with reasons), this week.
import { S, on, setMeta, uid } from '../store.js';
import {
  upNext, weekStats, subjectById, subjectLabel, subjectsByGap, topicsOf, topicLabel, today, addDays, daysBetween, dayStr,
} from '../logic.js';
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
  const dots = w.days.map((d, i) => `<div class="d"><div class="c${w.studied.has(d) ? ' on' : ''}${d === t ? ' today' : ''}" title="${d}${w.studied.has(d) ? ' — studied' : ''}"></div>${labels[i]}</div>`).join('');
  const rows = subjectsByGap().map((s) => ({ s, m: w.minutes.get(s.id) || 0 })).filter((r) => r.m > 0);
  const none = w.minutes.get('_none') || 0;
  const max = Math.max(1, ...rows.map((r) => r.m), none);
  const bars = rows.map(({ s, m }) => `<div class="bar-row"><span class="label">${esc(subjectLabel(s))}</span><div class="track"><div class="fill" style="width:${(m / max) * 100}%;background:${esc(s.color)}"></div></div><span class="muted small">${m} min</span></div>`).join('')
    + (none ? `<div class="bar-row"><span class="label">General</span><div class="track"><div class="fill" style="width:${(none / max) * 100}%"></div></div><span class="muted small">${none} min</span></div>` : '');
  const n = w.studied.size;
  return `<div class="card"><div class="row between"><h3>This week</h3><span class="muted small">${n ? `${plural(n, 'day')} studied · ${w.total} min` : 'A fresh week'}</span></div>
    <div class="week-dots" aria-label="Days studied this week">${dots}</div>
    ${bars ? `<div class="bars">${bars}</div>` : `<p class="muted small" style="margin:0">Minutes per subject show up here after your first session.</p>`}</div>`;
}

function upNextCard(items) {
  if (!items.length) {
    const hasSubjects = S.subjects.length > 0;
    return `<div class="card"><h3>Up next</h3><div class="empty" style="padding:14px 0">
      <p>${hasSubjects ? 'Suggestions appear here once you’ve logged a mistake or rated a topic.' : 'Add your subjects and Study HQ will suggest what to work on, with a reason for each.'}</p>
      <p class="example">e.g. “Calculus — blurting · Confidence 2/5 · not studied for 12 days”</p>
      ${hasSubjects ? '' : `<a class="btn btn-soft" href="#settings/subjects">Add subjects</a>`}</div></div>`;
  }
  return `<div class="card up-next"><h3>Up next</h3><ul class="list">${items.map((it, i) => `
    <li><button class="list-item" data-act="item" data-i="${i}">
      <span class="num">${i + 1}</span>
      <span class="grow"><span class="title">${esc(it.title)}</span>
      ${it.sub ? `<span class="muted small"> · ${esc(it.sub)}</span>` : ''}
      <span class="reason" style="display:block">${esc(it.reason)}</span></span>
      ${icon('chev')}
    </button></li>`).join('')}</ul></div>`;
}

let items = [];

function render() {
  items = upNext();
  const plan = items.find((i) => i.kind === 'plan');
  const a = session.active();
  const fiveMain = on('justFiveMain');
  const startBtn = `<button class="btn ${fiveMain ? '' : 'btn-primary btn-big'}" data-act="start">${icon('play')} Start studying <span class="kbd">S</span></button>`;
  const fiveBtn = `<button class="btn ${fiveMain ? 'btn-primary btn-big' : ''}" data-act="five">Just 5 minutes</button>`;
  const hour = new Date().getHours();
  const tomorrowPlan = S.meta.plan && S.meta.plan.forDay === addDays(today(), 1);
  const evening = on('eveningPrompt') && hour >= 18 && !tomorrowPlan;
  const taskApp = S.settings.taskApp;

  return `
    <div class="page-head"><div><div class="hello">${esc(greeting())}</div>
      <p class="muted">${new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</p></div></div>

    ${a ? `<div class="card soft"><div class="row between wrap"><div><b>Session in progress</b><div class="small muted">${esc(session.describe(a) || 'Focus session')}</div></div>
      <a class="btn btn-primary" href="#focus">Back to session</a></div></div>` : ''}

    ${plan ? `<div class="card first-step"><div class="tiny muted" style="text-transform:uppercase;letter-spacing:.06em;font-weight:600">Your first step</div>
      <div style="font-size:1.15rem;font-weight:650;margin:4px 0">${esc(plan.title)}</div>
      <div class="small muted">${esc(plan.sub)}</div></div>` : ''}

    ${a ? '' : `<div class="start-block">${fiveMain ? fiveBtn + startBtn : startBtn + fiveBtn}</div>
      ${items[0] ? `<p class="small muted center" style="margin-top:2px">Starts with: ${esc(items[0].title)}</p>` : ''}`}

    ${evening ? `<div class="card soft"><div class="row between wrap"><div><b>Set up tomorrow?</b><div class="small muted">Pick one tiny first step so tomorrow starts itself.</div></div>
      <button class="btn btn-primary" data-act="tomorrow">Set up tomorrow</button></div></div>` : ''}

    ${upNextCard(items)}
    ${weekCard()}

    <div class="row wrap" style="gap:10px">
      ${evening ? '' : `<button class="btn" data-act="tomorrow">${tomorrowPlan ? 'Edit tomorrow’s first step' : 'Set up tomorrow'}</button>`}
      <button class="btn" data-act="newMistake">${icon('plus')} Log a mistake <span class="kbd">N</span></button>
    </div>

    ${needsBackupReminder() ? `<div class="card quiet" style="margin-top:16px"><div class="row between wrap"><div><b>Time for a backup?</b>
      <div class="small muted">${backupDaysAgo() === null ? 'You haven’t backed up yet.' : `Last backup was ${backupDaysAgo()} days ago.`} It’s one tap and keeps your work safe.</div></div>
      <a class="btn" href="#settings/backup">Back up</a></div></div>` : ''}

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
      focusView.prefill(it.prefill);
      bus.go('#focus');
    },
    tomorrow: openTomorrow,
    newMistake: async () => { const { openQuickAdd } = await import('./mistakes.js'); openQuickAdd(); },
  },
};
