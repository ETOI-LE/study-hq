// Practice log: log a set in under 15 seconds; this week's questions, accuracy and share of hard questions.
import { S, save, remove, saveSettings } from '../store.js';
import {
  practiceSources, practiceWeek, setAccuracy, subjectById, subjectLabel, subjectsByGap, topicsOf, topicById, topicLabel, today, weekStart, addDays,
} from '../logic.js';
import {
  esc, icon, bus, chips, openModal, closeModal, renderModal, modalHead, toast, confirmDialog, emptyState, plural, subjectTag, subjectOptions, fmtDay, download,
} from '../ui.js';

const DIFF = ['easy', 'medium', 'hard'];
export const HARD_NUDGE = 'Most top-grade marks are in the harder questions. Try a few hard ones next.';
const pct = (x) => (x === null || x === undefined ? '–' : `${Math.round(x * 100)}%`);

/** opts: { edit, subjectId, topicId, minutes, sessionId, attempted, correct, onSaved } */
export function openPracticeLog(opts = {}) {
  const editing = opts.edit || null;
  const lastSubj = S.settings.lastSubjectId && subjectById(S.settings.lastSubjectId) ? S.settings.lastSubjectId : null;
  const f = editing ? { ...editing } : {
    subjectId: opts.subjectId ?? lastSubj ?? S.subjects[0]?.id ?? null, topicId: opts.topicId || '',
    source: S.settings.lastPracticeSource || practiceSources()[0], difficulty: 'medium', mode: S.settings.lastPracticeMode || 'questions',
    attempted: opts.attempted ?? '', correct: opts.correct ?? '', marksGot: '', marksMax: '', minutes: opts.minutes ?? '', date: today(), sessionId: opts.sessionId || null,
  };
  const read = () => ['topicId', 'attempted', 'correct', 'marksGot', 'marksMax', 'minutes', 'date'].forEach((k) => { const el = m.body.querySelector(`[name=${k}]`); if (el) f[k] = el.value; });
  const m = openModal({
    html: () => {
      const topics = f.subjectId ? topicsOf(f.subjectId) : [];
      return `${modalHead(editing ? 'Edit practice' : 'Log practice', editing ? fmtDay(editing.date) : 'Tap through — it takes about 10 seconds.')}
      <form data-submit="save" autocomplete="off">
        ${S.subjects.length ? `<div class="field"><span class="field-label">Subject</span>${chips('subjectId', subjectOptions(), f.subjectId, { act: 'pick' })}</div>` : ''}
        ${topics.length ? `<label class="field"><span>Topic <span class="hint">(optional)</span></span><select name="topicId"><option value="">No topic</option>${topics.filter((x) => !x.parentId).flatMap((x) => [x, ...topics.filter((c) => c.parentId === x.id)]).map((x) => `<option value="${x.id}"${x.id === f.topicId ? ' selected' : ''}>${esc(topicLabel(x))}</option>`).join('')}</select></label>` : ''}
        <div class="field"><span class="field-label">Source</span>${chips('source', practiceSources(), f.source, { act: 'pick' })}</div>
        <div class="field"><span class="field-label">Difficulty</span>${chips('difficulty', DIFF.map((d) => ({ value: d, label: d[0].toUpperCase() + d.slice(1) })), f.difficulty, { act: 'pick' })}</div>
        <div class="field"><div class="row between" style="margin-bottom:6px"><span class="field-label" style="margin:0">Result</span>
          <div class="seg" role="group"><button type="button" class="${f.mode === 'questions' ? 'on' : ''}" data-act="mode" data-v="questions">Questions</button><button type="button" class="${f.mode === 'marks' ? 'on' : ''}" data-act="mode" data-v="marks">Marks</button></div></div>
          ${f.mode === 'marks'
            ? `<div class="grid2"><label class="field" style="margin:0"><span class="hint">Marks gained</span><input type="number" min="0" step="0.5" inputmode="decimal" name="marksGot" value="${esc(f.marksGot)}" required></label>
               <label class="field" style="margin:0"><span class="hint">Out of</span><input type="number" min="1" step="0.5" inputmode="decimal" name="marksMax" value="${esc(f.marksMax)}" required></label></div>`
            : `<div class="grid2"><label class="field" style="margin:0"><span class="hint">Questions attempted</span><input type="number" min="1" inputmode="numeric" name="attempted" value="${esc(f.attempted)}" required autofocus></label>
               <label class="field" style="margin:0"><span class="hint">Correct</span><input type="number" min="0" inputmode="numeric" name="correct" value="${esc(f.correct)}" required></label></div>`}</div>
        <details class="more"><summary>More</summary>
          <div class="grid2"><label class="field"><span>Time spent <span class="hint">(min)</span></span><input type="number" min="0" inputmode="numeric" name="minutes" value="${esc(f.minutes)}"></label>
          <label class="field"><span>Date</span><input type="date" name="date" value="${esc(f.date)}"></label></div>
        </details>
        <div class="row-actions" style="justify-content:space-between">
          ${editing ? `<button type="button" class="btn btn-ghost btn-danger" data-act="del">${icon('trash', 18)} Delete</button>` : '<span></span>'}
          <button class="btn btn-primary" type="submit">Save</button></div>
      </form>`;
    },
    on: {
      pick: (el) => { read(); const { name, value } = el.dataset; if (name === 'subjectId' && f.subjectId !== value) f.topicId = ''; f[name] = value; renderModal(m); },
      mode: (el) => { read(); f.mode = el.dataset.v; renderModal(m); },
      save: () => {
        read();
        const n = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
        const rec = { ...f, topicId: f.topicId || null, attempted: n(f.attempted), correct: n(f.correct), marksGot: n(f.marksGot), marksMax: n(f.marksMax), minutes: n(f.minutes), date: f.date || today() };
        if (rec.mode === 'questions' && (!rec.attempted || rec.correct === null)) { m.body.querySelector('form').reportValidity(); return; }
        if (rec.mode === 'marks' && (rec.marksGot === null || !rec.marksMax)) { m.body.querySelector('form').reportValidity(); return; }
        if (rec.mode === 'questions' && rec.correct > rec.attempted) { toast('Correct can’t be more than attempted.'); return; }
        if (rec.mode === 'marks' && rec.marksGot > rec.marksMax) { toast('Marks gained can’t be more than the total.'); return; }
        save('practiceSets', rec);
        saveSettings({ lastPracticeSource: rec.source, lastPracticeMode: rec.mode, ...(rec.subjectId ? { lastSubjectId: rec.subjectId } : {}) });
        if (opts.onSaved) opts.onSaved(rec);
        closeModal(m); toast(editing ? 'Saved.' : 'Practice logged.'); bus.refresh();
      },
      del: async () => {
        if (!(await confirmDialog('Delete this practice set?', 'It will no longer count in your stats.', 'Delete', true))) return;
        remove('practiceSets', editing.id); closeModal(m); bus.refresh();
      },
    },
  });
  return m;
}

export function weekPracticeCard({ compact = false } = {}) {
  const w = practiceWeek();
  if (!w.sets.length) return compact ? '' : `<div class="card">${emptyState('No practice logged this week', 'Log each practice set to see questions per subject, your accuracy and how many were hard.', 'e.g. “Revision Village · Calculus · hard · 6 attempted, 4 correct”')}</div>`;
  const rows = [...w.bySubject.entries()].map(([k, r]) => ({ s: subjectById(k), ...r })).sort((a, b) => b.max - a.max);
  const max = Math.max(1, ...rows.map((r) => r.q || r.max));
  const nudge = w.hardShare !== null && w.hardShare < 0.4;
  return `<div class="card"><div class="card-head"><h3>Practice this week</h3><span class="tiny muted">${plural(w.sets.length, 'set')}</span></div>
    <div class="stat-nums" style="margin-bottom:16px">
      <div class="stat-num"><span>Questions</span><b data-count="${w.questions}">${w.questions}</b></div>
      <div class="stat-num"><span>Accuracy</span><b>${pct(w.accuracy)}</b></div>
      <div class="stat-num"><span>Hard questions</span><b>${pct(w.hardShare)}</b></div></div>
    ${compact ? '' : `<div class="bars">${rows.map((r) => `<div class="bar-row"><span class="label">${esc(r.s ? subjectLabel(r.s) : 'No subject')}</span>
      <div class="track"><div class="fill" style="width:${((r.q || r.max) / max) * 100}%;background:${esc(r.s?.color || 'var(--accent)')}"></div></div>
      <span class="small muted tabnum">${r.q ? `${r.q} q` : `${r.max} marks`} · ${pct(r.max ? r.got / r.max : null)} · ${pct(r.max ? r.hard / r.max : null)} hard</span></div>`).join('')}</div>`}
    ${nudge ? `<div class="nudge">${icon('flame', 18)}<span>${esc(HARD_NUDGE)}</span></div>` : ''}</div>`;
}

const flt = { q: '', subjectId: '', topicId: '' };

function filtered() {
  const q = flt.q.trim().toLowerCase();
  return S.practiceSets
    .filter((p) => !flt.subjectId || p.subjectId === flt.subjectId)
    .filter((p) => !flt.topicId || p.topicId === flt.topicId || topicById(p.topicId)?.parentId === flt.topicId)
    .filter((p) => !q || [p.source, p.difficulty, subjectLabel(subjectById(p.subjectId)), topicLabel(topicById(p.topicId))].join(' ').toLowerCase().includes(q))
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || ''));
}

function listHtml() {
  const list = filtered();
  if (!list.length) return '<p class="muted center" style="padding:20px;margin:0">No practice matches.</p>';
  return `<ul class="list">${list.slice(0, 150).map((p) => {
    const acc = setAccuracy(p);
    return `<li><button class="list-item" data-act="open" data-id="${p.id}">
      <span class="dot" style="background:${esc(subjectById(p.subjectId)?.color || 'var(--muted)')}"></span>
      <span class="grow"><span class="title">${esc(p.source || 'Practice')}${p.topicId && topicById(p.topicId) ? ` · ${esc(topicLabel(topicById(p.topicId)))}` : ''}</span>
        <span class="meta">${subjectTag(p.subjectId)}<span class="pill ${p.difficulty === 'hard' ? 'accent' : ''}">${esc(p.difficulty || '–')}</span>
        <span class="pill tabnum">${p.mode === 'marks' ? `${p.marksGot}/${p.marksMax} marks` : `${p.correct}/${p.attempted} correct`} · ${pct(acc)}</span>
        ${p.minutes ? `<span class="pill">${p.minutes} min</span>` : ''}<span class="small muted">${esc(fmtDay(p.date))}</span></span></span></button></li>`;
  }).join('')}</ul>`;
}

function csvCell(v) { const s = v === null || v === undefined ? '' : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
export function exportPracticeCsv() {
  const head = ['Date', 'Subject', 'Topic', 'Source', 'Difficulty', 'Questions attempted', 'Correct', 'Marks gained', 'Marks available', 'Accuracy %', 'Minutes'];
  const rows = [...S.practiceSets].sort((a, b) => (a.date || '').localeCompare(b.date || '')).map((p) => {
    const acc = setAccuracy(p);
    return [p.date, subjectLabel(subjectById(p.subjectId)), topicLabel(topicById(p.topicId)), p.source, p.difficulty,
      p.mode === 'marks' ? '' : p.attempted, p.mode === 'marks' ? '' : p.correct, p.mode === 'marks' ? p.marksGot : '', p.mode === 'marks' ? p.marksMax : '',
      acc === null ? '' : Math.round(acc * 100), p.minutes];
  });
  download(`study-hq-practice-${today()}.csv`, '﻿' + [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
}

function lastWeeks() {
  // Four-week view of questions per week: a quick sense of momentum, no streaks.
  const ws = weekStart();
  return [3, 2, 1, 0].map((i) => { const s = addDays(ws, -7 * i); const w = practiceWeek(s); return { s, q: w.questions, total: w.total, hard: w.hardShare }; });
}

function render() {
  const topics = flt.subjectId ? topicsOf(flt.subjectId) : [];
  const sel = (name, opts, val, label) => `<select data-change="flt" data-name="${name}" aria-label="${label}">${opts.map(([v, l]) => `<option value="${esc(v)}"${v === val ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  const weeks = lastWeeks();
  const maxW = Math.max(1, ...weeks.map((w) => w.q || w.total));
  return `<div class="page-head"><div><h1>Practice log</h1><p class="muted">Every practice set, so you can see whether practice is turning into marks.</p></div>
    <button class="btn btn-primary" data-act="new">${icon('plus')} Log practice</button></div>
    ${weekPracticeCard()}
    ${S.practiceSets.length ? `<div class="card"><div class="card-head"><h3>Last four weeks</h3><span class="tiny muted">questions per week</span></div>
      <div class="bars">${weeks.map((w, i) => `<div class="bar-row"><span class="label">${i === 3 ? 'This week' : `Week of ${esc(fmtDay(w.s))}`}</span><div class="track"><div class="fill" style="width:${((w.q || w.total) / maxW) * 100}%"></div></div><span class="small muted tabnum">${w.q}</span></div>`).join('')}</div></div>
    <h2 class="section-title">All practice</h2>
    <div class="filters"><div class="search">${icon('search')}<input type="search" placeholder="Search practice" value="${esc(flt.q)}" id="practice-search" aria-label="Search practice"></div>
      ${sel('subjectId', [['', 'All subjects'], ...subjectsByGap().map((s) => [s.id, subjectLabel(s)])], flt.subjectId, 'Subject')}
      ${topics.length ? sel('topicId', [['', 'All topics'], ...topics.map((t) => [t.id, topicLabel(t)])], flt.topicId, 'Topic') : ''}</div>
    <div class="card quiet" id="practice-list">${listHtml()}</div>
    <button class="btn btn-ghost" data-act="csv">${icon('download', 18)} Practice log as CSV</button>` : ''}`;
}

export default {
  render,
  mount(root) {
    const q = root.querySelector('#practice-search');
    q?.addEventListener('input', () => { flt.q = q.value; document.getElementById('practice-list').innerHTML = listHtml(); });
  },
  on: {
    new: () => openPracticeLog({ subjectId: flt.subjectId || undefined }),
    open: (el) => { const p = S.practiceSets.find((x) => x.id === el.dataset.id); if (p) openPracticeLog({ edit: p }); },
    flt: (el) => { flt[el.dataset.name] = el.value; if (el.dataset.name === 'subjectId') flt.topicId = ''; bus.refresh(); },
    csv: exportPracticeCsv,
  },
};
