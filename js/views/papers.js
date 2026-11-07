// Past paper tracker: papers to do, scores, user-entered grade boundaries, estimated grade and a % chart.
import { S, save, remove, saveMany } from '../store.js';
import {
  PAPER_STATUS, paperLabel, paperPct, boundaryFor, estimatedGrade, targetPct, subjectById, subjectLabel, subjectsByGap, gradeScale, today,
} from '../logic.js';
import { IB_GRADES, CORE_GRADES } from '../data-ib.js';
import {
  esc, icon, bus, chips, openModal, closeModal, renderModal, modalHead, toast, confirmDialog, emptyState, plural, subjectTag, subjectOptions, fmtDay,
} from '../ui.js';
import { openQuickAdd } from './mistakes.js';

const isIb = () => (S.profile?.course || 'ib') === 'ib';
const n = (v) => (v === '' || v === null || v === undefined ? null : Number(v));

function gradesFor(subjectId) {
  const s = subjectById(subjectId);
  const scale = gradeScale(s);
  if (scale === IB_GRADES) return [...IB_GRADES].reverse();
  if (scale === CORE_GRADES) return [...CORE_GRADES];
  return null;
}

// ---------- Paper editor ----------
/** opts: { edit, subjectId } */
export function openPaper(opts = {}) {
  const editing = opts.edit || null;
  const lastSubj = S.settings.lastSubjectId && subjectById(S.settings.lastSubjectId) ? S.settings.lastSubjectId : null;
  const f = editing ? { ...editing } : {
    subjectId: opts.subjectId ?? lastSubj ?? S.subjects[0]?.id ?? null, level: '', year: String(new Date().getFullYear() - 1),
    session: isIb() ? 'May' : '', paper: '1', tz: isIb() ? 'TZ1' : 'none', status: 'Not started', date: today(),
    timed: true, minutes: '', score: '', max: '', reviewDone: false,
  };
  if (!f.level) f.level = subjectById(f.subjectId)?.level || '';
  const hadScore = editing && editing.score !== null && editing.score !== '' && editing.score !== undefined;
  const read = () => ['level', 'year', 'session', 'paper', 'date', 'minutes', 'score', 'max'].forEach((k) => { const el = m.body.querySelector(`[name=${k}]`); if (el) f[k] = el.value; });
  const live = () => {
    const out = m.body.querySelector('#paper-live'); if (!out) return;
    const p = paperPct(f); const g = estimatedGrade({ ...f });
    out.innerHTML = p === null ? '' : `<b class="tabnum">${Math.round(p)}%</b>${g ? ` · estimated grade <b>${esc(g)}</b>` : boundaryFor(f) ? '' : ' <span class="muted">· add grade boundaries to see an estimated grade</span>'}`;
  };
  const m = openModal({
    html: () => `${modalHead(editing ? 'Edit paper' : 'Log a past paper', editing ? paperLabel(editing) : 'Score it, then log the marks you lost.')}
      <form data-submit="save" autocomplete="off">
        ${S.subjects.length ? `<div class="field"><span class="field-label">Subject</span>${chips('subjectId', subjectOptions(), f.subjectId, { act: 'pick' })}</div>` : ''}
        <div class="grid2">
          <label class="field"><span>Year</span><input type="number" name="year" min="1990" max="2100" value="${esc(f.year)}" inputmode="numeric"></label>
          ${isIb() ? `<div class="field"><span class="field-label">Session</span>${chips('session', ['May', 'Nov'], f.session, { act: 'pick' })}</div>`
            : `<label class="field"><span>Session</span><input type="text" name="session" value="${esc(f.session)}" placeholder="e.g. June, Winter, Mock"></label>`}
        </div>
        <div class="grid2">
          <div class="field"><span class="field-label">Paper</span>${chips('paper', ['1', '2', '3'], f.paper, { act: 'pick' })}</div>
          ${isIb() ? `<div class="field"><span class="field-label">Time zone</span>${chips('tz', [{ value: 'TZ1', label: 'TZ1' }, { value: 'TZ2', label: 'TZ2' }, { value: 'none', label: 'None' }], f.tz, { act: 'pick' })}</div>`
            : `<label class="field"><span>Level <span class="hint">(optional)</span></span><input type="text" name="level" value="${esc(f.level)}"></label>`}
        </div>
        <div class="field"><span class="field-label">Status</span>${chips('status', PAPER_STATUS.filter((s) => s !== 'Reviewed'), f.status === 'Reviewed' ? 'Done' : f.status, { act: 'pick' })}</div>
        ${f.status !== 'Not started' ? `<div class="grid2">
          <label class="field"><span>Score</span><input type="number" name="score" min="0" step="0.5" value="${esc(f.score)}" inputmode="decimal"></label>
          <label class="field"><span>Out of</span><input type="number" name="max" min="1" step="0.5" value="${esc(f.max)}" inputmode="decimal"></label></div>
          <p class="small" id="paper-live" style="margin:-6px 0 12px"></p>
          <div class="grid2"><label class="field"><span>Date</span><input type="date" name="date" value="${esc(f.date)}"></label>
          <label class="field"><span>Time taken <span class="hint">(min)</span></span><input type="number" name="minutes" min="0" value="${esc(f.minutes)}" inputmode="numeric"></label></div>
          <label class="toggle"><span><b>Done under timed conditions</b></span><input type="checkbox" data-change="timed" ${f.timed ? 'checked' : ''}><span class="switch"></span></label>
          <label class="toggle"><span><b>Review done</b><span class="small muted" style="display:block">Tick once you’ve gone through the markscheme and logged lost marks. Only then is it “Reviewed”.</span></span><input type="checkbox" data-change="reviewDone" ${f.reviewDone ? 'checked' : ''}><span class="switch"></span></label>` : ''}
        <div class="row-actions" style="justify-content:space-between">
          ${editing ? `<button type="button" class="btn btn-ghost btn-danger" data-act="del">${icon('trash', 18)} Delete</button>` : '<span></span>'}
          <button class="btn btn-primary" type="submit">Save</button></div>
      </form>`,
    mount: (body) => { body.querySelectorAll('[name=score],[name=max]').forEach((i) => i.addEventListener('input', () => { read(); live(); })); live(); },
    on: {
      pick: (el) => { read(); const { name, value } = el.dataset; f[name] = value; if (name === 'subjectId') f.level = subjectById(value)?.level || ''; renderModal(m); },
      timed: (el) => { f.timed = el.checked; },
      reviewDone: (el) => { f.reviewDone = el.checked; },
      save: async () => {
        read();
        const rec = { ...f, score: n(f.score), max: n(f.max), minutes: n(f.minutes), year: f.year ? String(f.year) : '' };
        if (rec.score !== null && rec.max && rec.score > rec.max) { toast('Score can’t be more than the total.'); return; }
        if (rec.score !== null && rec.status === 'Not started') rec.status = 'Done';
        rec.status = rec.status === 'Not started' ? 'Not started' : rec.reviewDone ? 'Reviewed' : 'Done';
        if (rec.status === 'Not started') { rec.reviewDone = false; }
        rec.pct = paperPct(rec);
        save('papers', rec);
        closeModal(m); bus.refresh();
        const newScore = rec.score !== null && !hadScore;
        if (newScore && rec.max && rec.score < rec.max) {
          const lost = rec.max - rec.score;
          if (await confirmDialog('Log your lost marks?', `You dropped ${lost} mark${lost === 1 ? '' : 's'}. Logging each one as a mistake is how papers turn into improvement. The paper is filled in as the source.`, 'Log lost marks')) {
            openQuickAdd({ subjectId: rec.subjectId, source: `${paperLabel(rec)} Q`, paperId: rec.id });
          }
        } else toast('Saved.');
      },
      del: async () => {
        if (!(await confirmDialog('Delete this paper?', 'Its score will be removed from your chart.', 'Delete', true))) return;
        remove('papers', editing.id); closeModal(m); bus.refresh();
      },
    },
  });
  return m;
}

// ---------- Paper list (to do) ----------
function openBulkAdd() {
  const y = new Date().getFullYear() - 1;
  const f = { subjectId: S.settings.lastSubjectId && subjectById(S.settings.lastSubjectId) ? S.settings.lastSubjectId : S.subjects[0]?.id, from: String(y - 3), to: String(y), sessions: isIb() ? ['May'] : [], custom: '', papers: ['1', '2'], tzs: isIb() ? ['TZ1', 'TZ2'] : ['none'] };
  const read = () => ['from', 'to', 'custom'].forEach((k) => { const el = m.body.querySelector(`[name=${k}]`); if (el) f[k] = el.value; });
  const combos = () => {
    const out = []; const a = Math.min(Number(f.from), Number(f.to)), b = Math.max(Number(f.from), Number(f.to));
    if (!a || !b || b - a > 30) return out;
    const sessions = isIb() ? f.sessions : f.custom.split(',').map((x) => x.trim()).filter(Boolean);
    for (let yr = b; yr >= a; yr--) for (const s of (sessions.length ? sessions : [''])) for (const p of f.papers) for (const tz of f.tzs) out.push({ year: String(yr), session: s, paper: p, tz });
    return out;
  };
  const m = openModal({
    html: () => {
      const list = combos();
      const fresh = list.filter((c) => !S.papers.some((p) => p.subjectId === f.subjectId && p.year === c.year && (p.session || '') === c.session && String(p.paper) === c.paper && (p.tz || 'none') === c.tz));
      return `${modalHead('Add papers to do', 'Build your list once, then tick them off.')}
        ${S.subjects.length ? `<div class="field"><span class="field-label">Subject</span>${chips('subjectId', subjectOptions(), f.subjectId, { act: 'pick' })}</div>` : ''}
        <div class="grid2"><label class="field"><span>From year</span><input type="number" name="from" value="${esc(f.from)}" data-input="r"></label><label class="field"><span>To year</span><input type="number" name="to" value="${esc(f.to)}" data-input="r"></label></div>
        ${isIb() ? `<div class="field"><span class="field-label">Sessions</span>${chips('sessions', ['May', 'Nov'], f.sessions, { multi: true, act: 'multi' })}</div>`
          : `<label class="field"><span>Sessions <span class="hint">(comma-separated, optional)</span></span><input type="text" name="custom" value="${esc(f.custom)}" placeholder="e.g. June, November" data-input="r"></label>`}
        <div class="field"><span class="field-label">Papers</span>${chips('papers', ['1', '2', '3'], f.papers, { multi: true, act: 'multi' })}</div>
        ${isIb() ? `<div class="field"><span class="field-label">Time zones</span>${chips('tzs', [{ value: 'TZ1', label: 'TZ1' }, { value: 'TZ2', label: 'TZ2' }, { value: 'none', label: 'No time zone' }], f.tzs, { multi: true, act: 'multi' })}</div>` : ''}
        <p class="small" id="bulk-count">${fresh.length ? `Adds <b>${plural(fresh.length, 'paper')}</b>${list.length > fresh.length ? ` (${list.length - fresh.length} already on your list)` : ''}.` : 'Nothing new to add.'}</p>
        <div class="row-actions end"><button class="btn btn-primary" data-act="add" ${fresh.length ? '' : 'disabled'}>Add to my list</button></div>`;
    },
    mount: (body) => body.querySelectorAll('[data-input=r]').forEach((i) => i.addEventListener('change', () => { read(); renderModal(m); })),
    on: {
      pick: (el) => { read(); f.subjectId = el.dataset.value; renderModal(m); },
      multi: (el) => { read(); const k = el.dataset.name; const s = new Set(f[k]); s.has(el.dataset.value) ? s.delete(el.dataset.value) : s.add(el.dataset.value); f[k] = [...s]; renderModal(m); },
      add: () => {
        read();
        const subj = subjectById(f.subjectId);
        const fresh = combos().filter((c) => !S.papers.some((p) => p.subjectId === f.subjectId && p.year === c.year && (p.session || '') === c.session && String(p.paper) === c.paper && (p.tz || 'none') === c.tz));
        saveMany('papers', fresh.map((c) => ({ subjectId: f.subjectId, level: subj?.level || '', ...c, status: 'Not started', timed: true, score: null, max: null, minutes: null, date: null, reviewDone: false })));
        closeModal(m); toast(`Added ${plural(fresh.length, 'paper')} to your list.`); bus.refresh();
      },
    },
  });
}

// ---------- Grade boundaries ----------
function openBoundaries(opts = {}) {
  const editing = opts.edit || null;
  const subjectId = editing?.subjectId || opts.subjectId || S.subjects[0]?.id;
  const f = editing ? { ...editing, rows: editing.rows.map((r) => ({ ...r })) } : {
    subjectId, year: String(new Date().getFullYear() - 1), session: isIb() ? 'May' : '', paper: '1', max: '',
    rows: (gradesFor(subjectId) || ['', '', '']).map((g) => ({ grade: g, min: '' })),
  };
  const read = () => {
    ['year', 'session', 'max'].forEach((k) => { const el = m.body.querySelector(`[name=${k}]`); if (el) f[k] = el.value; });
    m.body.querySelectorAll('[data-row]').forEach((el) => { const i = Number(el.dataset.row); f.rows[i][el.dataset.k] = el.value; });
  };
  const m = openModal({
    html: () => {
      const fixedGrades = !!gradesFor(f.subjectId);
      return `${modalHead(editing ? 'Edit grade boundaries' : 'Add grade boundaries', 'They change every session, so enter them from the official boundaries for that paper.')}
      <form data-submit="save" autocomplete="off">
        ${!editing && S.subjects.length ? `<div class="field"><span class="field-label">Subject</span>${chips('subjectId', subjectOptions(), f.subjectId, { act: 'pick' })}</div>` : ''}
        <div class="grid3">
          <label class="field"><span>Year</span><input type="number" name="year" value="${esc(f.year)}" required></label>
          ${isIb() ? `<div class="field"><span class="field-label">Session</span>${chips('session', ['May', 'Nov'], f.session, { act: 'pick' })}</div>` : `<label class="field"><span>Session</span><input type="text" name="session" value="${esc(f.session)}"></label>`}
          <div class="field"><span class="field-label">Paper</span>${chips('paper', ['1', '2', '3'], f.paper, { act: 'pick' })}</div></div>
        <label class="field"><span>Paper total <span class="hint">(marks)</span></span><input type="number" name="max" value="${esc(f.max)}" min="1" style="max-width:160px" required></label>
        <div class="field"><span class="field-label">Lowest mark for each grade</span>
          ${f.rows.map((r, i) => `<div class="row" style="margin-bottom:8px">${fixedGrades ? `<span class="pill" style="min-width:44px;justify-content:center">${esc(r.grade)}</span>` : `<input type="text" data-row="${i}" data-k="grade" value="${esc(r.grade)}" placeholder="Grade" style="max-width:110px">`}
            <input type="number" data-row="${i}" data-k="min" value="${esc(r.min)}" min="0" placeholder="Min mark" inputmode="numeric" style="max-width:160px"></div>`).join('')}
          ${fixedGrades ? '' : '<button type="button" class="link-btn" data-act="addRow">+ Add a grade</button>'}</div>
        <div class="row-actions" style="justify-content:space-between">${editing ? `<button type="button" class="btn btn-ghost btn-danger" data-act="del">${icon('trash', 18)} Delete</button>` : '<span></span>'}
          <button class="btn btn-primary" type="submit">Save boundaries</button></div></form>`;
    },
    on: {
      pick: (el) => { read(); const { name, value } = el.dataset; f[name] = value; if (name === 'subjectId') f.rows = (gradesFor(value) || ['', '', '']).map((g) => ({ grade: g, min: '' })); renderModal(m); },
      addRow: () => { read(); f.rows.push({ grade: '', min: '' }); renderModal(m); },
      save: () => {
        read();
        const rows = f.rows.filter((r) => String(r.grade).trim() && r.min !== '').map((r) => ({ grade: String(r.grade).trim(), min: Number(r.min) }));
        if (!rows.length || !f.max) { toast('Add the paper total and at least one grade.'); return; }
        const dup = S.gradeBoundaries.find((b) => b.id !== f.id && b.subjectId === f.subjectId && String(b.year) === String(f.year) && (b.session || '') === (f.session || '') && String(b.paper) === String(f.paper));
        if (dup) { toast('Boundaries for that paper already exist — edit them instead.'); return; }
        save('gradeBoundaries', { ...f, year: String(f.year), max: Number(f.max), rows });
        closeModal(m); toast('Boundaries saved.'); bus.refresh();
      },
      del: async () => {
        if (!(await confirmDialog('Delete these boundaries?', 'Estimated grades for that paper will disappear.', 'Delete', true))) return;
        remove('gradeBoundaries', editing.id); closeModal(m); bus.refresh();
      },
    },
  });
}

// ---------- Chart: % over time, one small chart per subject, dashed line at the target grade ----------
function chartFor(s) {
  const pts = S.papers.filter((p) => p.subjectId === s.id && paperPct(p) !== null)
    .map((p) => ({ p, d: p.date || (p.updatedAt || '').slice(0, 10), v: paperPct(p) }))
    .filter((x) => x.d).sort((a, b) => a.d.localeCompare(b.d));
  if (!pts.length) return '';
  const tgt = targetPct(s);
  const W = 560, H = 200, L = 34, R = 60, T = 12, B = 26;
  const t0 = new Date(pts[0].d).getTime(), t1 = new Date(pts[pts.length - 1].d).getTime();
  const span = Math.max(1, t1 - t0);
  const x = (d) => (pts.length === 1 ? L + (W - L - R) / 2 : L + ((new Date(d).getTime() - t0) / span) * (W - L - R));
  const y = (v) => T + (1 - v / 100) * (H - T - B);
  const path = pts.map((q, i) => `${i ? 'L' : 'M'}${x(q.d).toFixed(1)},${y(q.v).toFixed(1)}`).join(' ');
  const ticks = [0, 25, 50, 75, 100];
  const xl = pts.length > 1 ? [pts[0], pts[pts.length - 1]] : [pts[0]];
  return `<div class="card"><div class="card-head"><h3 class="row" style="gap:8px"><span class="dot" style="background:${esc(s.color)}"></span>${esc(subjectLabel(s))}</h3>
      <span class="tiny muted">${tgt !== null ? `Target ${esc(s.target)} ≈ ${Math.round(tgt)}%` : s.target ? 'Add grade boundaries to see your target line' : 'Set a target grade in Settings'}</span></div>
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(subjectLabel(s))}: paper percentages over time">
      <g class="grid">${ticks.map((t) => `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/>`).join('')}</g>
      <g class="axis">${ticks.map((t) => `<text x="${L - 6}" y="${y(t) + 4}" text-anchor="end">${t}%</text>`).join('')}
        ${xl.map((q, i) => `<text x="${x(q.d)}" y="${H - 6}" text-anchor="${pts.length === 1 ? 'middle' : i ? 'end' : 'start'}">${esc(fmtDay(q.d))}</text>`).join('')}</g>
      ${tgt !== null ? `<line class="target" x1="${L}" x2="${W - R}" y1="${y(tgt)}" y2="${y(tgt)}"/><text class="target-label" x="${W - R + 8}" y="${y(tgt) + 4}" text-anchor="start">Target ${esc(s.target)}</text>` : ''}
      <path class="series" d="${path}" stroke="${esc(s.color)}"/>
      ${pts.map((q) => `<circle class="pt" cx="${x(q.d)}" cy="${y(q.v)}" r="5" fill="${esc(s.color)}"/><circle cx="${x(q.d)}" cy="${y(q.v)}" r="14" fill="transparent" data-tip="${esc(`${paperLabel(q.p)} · ${Math.round(q.v)}%${estimatedGrade(q.p) ? ` · est. ${estimatedGrade(q.p)}` : ''} · ${fmtDay(q.d)}`)}" style="cursor:default"/>`).join('')}
    </svg></div>`;
}

function chartsHtml() {
  const html = subjectsByGap().map(chartFor).join('');
  return html || `<div class="card">${emptyState('No scores yet', 'Once you score a paper, its percentage shows here over time — one chart per subject, with a line at your target grade.', 'e.g. “May 2023 P2 · 68% · est. 6”')}</div>`;
}

// ---------- Page ----------
const flt = { subjectId: '', status: '' };
let tab = 'list';

function listHtml() {
  const list = S.papers.filter((p) => !flt.subjectId || p.subjectId === flt.subjectId).filter((p) => !flt.status || p.status === flt.status)
    .sort((a, b) => String(b.year).localeCompare(String(a.year)) || (a.session || '').localeCompare(b.session || '') || String(a.paper).localeCompare(String(b.paper)) || (a.tz || '').localeCompare(b.tz || ''));
  if (!S.papers.length) return emptyState('No papers yet', 'Add the papers you plan to do so you can see which ones are left, then log each score.', 'e.g. Physics HL · May 2019–2023 · Papers 1 and 2 · TZ1 and TZ2', `<div class="row" style="justify-content:center;gap:10px"><button class="btn btn-primary" data-act="bulk">${icon('plus')} Add papers to do</button><button class="btn" data-act="new">Log a paper</button></div>`);
  if (!list.length) return '<p class="muted center" style="padding:20px;margin:0">No papers match.</p>';
  return `<ul class="list">${list.map((p) => {
    const pc = paperPct(p); const g = estimatedGrade(p);
    return `<li><button class="list-item" data-act="open" data-id="${p.id}">
      <span class="dot" style="background:${esc(subjectById(p.subjectId)?.color || 'var(--muted)')}"></span>
      <span class="grow"><span class="title">${esc(paperLabel(p))}</span>
        <span class="meta">${subjectTag(p.subjectId)}<span class="pill ${p.status === 'Reviewed' ? 'ok' : p.status === 'Done' ? 'accent' : ''}">${esc(p.status)}</span>
        ${pc !== null ? `<span class="pill tabnum">${p.score}/${p.max} · ${Math.round(pc)}%</span>` : ''}${g ? `<span class="pill">est. ${esc(g)}</span>` : ''}
        ${p.status !== 'Not started' && p.timed ? '<span class="pill">timed</span>' : ''}${p.date && p.status !== 'Not started' ? `<span class="small muted">${esc(fmtDay(p.date))}</span>` : ''}</span></span></button></li>`;
  }).join('')}</ul>`;
}

function boundariesHtml() {
  if (!S.gradeBoundaries.length) return `<div class="card">${emptyState('No grade boundaries yet', 'Boundaries change every session, so Study HQ never guesses them. Enter the official ones for a paper and your estimated grade appears.', 'e.g. Physics HL · May 2023 · Paper 2 · out of 90 · 7 from 62', `<button class="btn btn-primary" data-act="addB">${icon('plus')} Add boundaries</button>`)}</div>`;
  return `<div class="card quiet"><ul class="list">${[...S.gradeBoundaries].sort((a, b) => String(b.year).localeCompare(String(a.year))).map((b) => `<li><button class="list-item" data-act="editB" data-id="${b.id}">
    <span class="dot" style="background:${esc(subjectById(b.subjectId)?.color || 'var(--muted)')}"></span>
    <span class="grow"><span class="title">${esc([b.session, b.year, b.paper ? `P${b.paper}` : ''].filter(Boolean).join(' '))} · out of ${b.max}</span>
      <span class="meta">${subjectTag(b.subjectId)}<span class="small muted">${b.rows.map((r) => `${esc(r.grade)}: ${r.min}`).join(' · ')}</span></span></span>${icon('chev')}</button></li>`).join('')}</ul></div>
    <button class="btn" data-act="addB">${icon('plus')} Add boundaries</button>`;
}

function render(params) {
  tab = ['chart', 'boundaries'].includes(params[0]) ? params[0] : 'list';
  const left = S.papers.filter((p) => p.status === 'Not started').length;
  const done = S.papers.filter((p) => p.status !== 'Not started').length;
  return `<div class="page-head"><div><h1>Past papers</h1><p class="muted">${S.papers.length ? `${plural(done, 'paper')} done · ${plural(left, 'paper')} still to do` : 'Your list of papers, scores and estimated grades.'}</p></div>
    <div class="row wrap"><button class="btn" data-act="bulk">${icon('plus')} Papers to do</button><button class="btn btn-primary" data-act="new">${icon('papers')} Log a paper</button></div></div>
    <div class="tabs" role="tablist">
      <a href="#papers" class="${tab === 'list' ? 'on' : ''}" role="tab" aria-selected="${tab === 'list'}">Papers</a>
      <a href="#papers/chart" class="${tab === 'chart' ? 'on' : ''}" role="tab" aria-selected="${tab === 'chart'}">Chart</a>
      <a href="#papers/boundaries" class="${tab === 'boundaries' ? 'on' : ''}" role="tab" aria-selected="${tab === 'boundaries'}">Grade boundaries</a></div>
    ${tab === 'list' ? `${S.papers.length ? `<div class="filters"><select data-change="flt" data-name="subjectId" aria-label="Subject"><option value="">All subjects</option>${S.subjects.map((s) => `<option value="${s.id}"${s.id === flt.subjectId ? ' selected' : ''}>${esc(subjectLabel(s))}</option>`).join('')}</select>
      <select data-change="flt" data-name="status" aria-label="Status"><option value="">Any status</option>${PAPER_STATUS.map((s) => `<option${s === flt.status ? ' selected' : ''}>${s}</option>`).join('')}</select></div>` : ''}
      <div class="card quiet">${listHtml()}</div>` : tab === 'chart' ? chartsHtml() : boundariesHtml()}`;
}

let tipEl = null;
export default {
  render,
  mount(root) {
    root.querySelectorAll('[data-tip]').forEach((c) => {
      c.addEventListener('pointerenter', () => {
        tipEl = tipEl || Object.assign(document.createElement('div'), { className: 'chart-tip' });
        document.body.appendChild(tipEl);
        tipEl.textContent = c.dataset.tip;
        const r = c.getBoundingClientRect();
        tipEl.style.left = `${r.left + r.width / 2}px`; tipEl.style.top = `${r.top + r.height / 2}px`;
      });
      c.addEventListener('pointerleave', () => tipEl?.remove());
    });
  },
  unmount() { tipEl?.remove(); },
  on: {
    new: () => openPaper({ subjectId: flt.subjectId || undefined }),
    bulk: openBulkAdd,
    open: (el) => { const p = S.papers.find((x) => x.id === el.dataset.id); if (p) openPaper({ edit: p }); },
    flt: (el) => { flt[el.dataset.name] = el.value; bus.refresh(); },
    addB: () => openBoundaries({ subjectId: flt.subjectId || undefined }),
    editB: (el) => { const b = S.gradeBoundaries.find((x) => x.id === el.dataset.id); if (b) openBoundaries({ edit: b }); },
  },
};
