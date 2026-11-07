// Weekly review: a guided 15-minute review in five steps. Saved, and past reviews can be read back.
import { S, save, setMeta } from '../store.js';
import {
  weekStats, practiceWeek, weekStart, today, addDays, subjectById, subjectLabel, subjectsByGap, topicsOf, rankedTopics, topicLabel,
  activeFocusIds, paperLabel, typeLabel,
} from '../logic.js';
import { esc, icon, bus, chips, toast, plural, fmtDay, emptyState, confirmDialog } from '../ui.js';
import { MISTAKE_TYPES } from './mistakes.js';

const ACTIONS = {
  Careless: 'Use the careless-error checklist in every practice session this week.',
  Content: 'Revise that topic properly — notes first, then blurt it, then a few questions.',
  Time: 'Do a timed paper this week.',
  Presentation: 'Study the markscheme wording and add key-phrase flashcards.',
  'Didn’t know how to start': 'Study worked examples, then redo similar questions.',
};
const STEPS = ['This week', 'Mistakes', 'Confidence', 'Focus topics', 'Timed paper'];

let r = null; // draft review
let step = 0;
let viewing = null; // id of a past review

function fresh() {
  const ws = weekStart();
  const pw = practiceWeek(ws);
  const w = weekStats();
  const mk = S.mistakes.filter((m) => (m.date || '') >= ws);
  const tally = Object.fromEntries(MISTAKE_TYPES.map((t) => [t, mk.filter((m) => m.type === t).length]));
  const untyped = mk.filter((m) => !m.type).length;
  const biggest = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
  const suggested = rankedTopics().filter(({ topic }) => !topic.parentId).slice(0, 3).map(({ topic }) => topic.id);
  return {
    date: today(), week: ws,
    stats: {
      sessions: S.sessions.filter((s) => (s.day || '') >= ws).length,
      minutes: [...w.minutes.entries()].map(([id, mins]) => ({ subjectId: id === '_none' ? null : id, mins })),
      totalMinutes: w.total, daysStudied: w.studied.size,
      questions: pw.questions, hardShare: pw.hardShare, accuracy: pw.accuracy,
    },
    tally, untyped, biggest: biggest && biggest[1] > 0 ? biggest[0] : null,
    action: biggest && biggest[1] > 0 ? ACTIONS[biggest[0]] : '',
    confidence: {}, // topicId -> new value
    focusIds: activeFocusIds().length ? [...activeFocusIds()] : suggested, suggested,
    timedPaperId: null, timedPaperText: '',
  };
}

const pct = (x) => (x === null || x === undefined ? '–' : `${Math.round(x * 100)}%`);

function stepHtml() {
  const st = r.stats;
  if (step === 0) {
    const max = Math.max(1, ...st.minutes.map((m) => m.mins));
    return `<h2>This week</h2><p class="muted">A quick look back. No judgement — just what happened.</p>
      <div class="stat-nums" style="margin:14px 0 18px">
        <div class="stat-num"><span>Days studied</span><b>${st.daysStudied}<span class="muted" style="font-size:1rem;font-weight:500"> / 7</span></b></div>
        <div class="stat-num"><span>Sessions</span><b>${st.sessions}</b></div>
        <div class="stat-num"><span>Minutes</span><b>${st.totalMinutes}</b></div>
        <div class="stat-num"><span>Questions</span><b>${st.questions}</b></div>
        <div class="stat-num"><span>Hard questions</span><b>${pct(st.hardShare)}</b></div></div>
      ${st.minutes.length ? `<div class="bars">${st.minutes.sort((a, b) => b.mins - a.mins).map((m) => { const s = subjectById(m.subjectId); return `<div class="bar-row"><span class="label">${esc(s ? subjectLabel(s) : 'General')}</span><div class="track"><div class="fill" style="width:${(m.mins / max) * 100}%;background:${esc(s?.color || 'var(--accent)')}"></div></div><span class="small muted">${m.mins} min</span></div>`; }).join('')}</div>`
        : '<p class="muted small">No sessions this week yet. That’s fine — this review is about next week.</p>'}`;
  }
  if (step === 1) {
    const rows = Object.entries(r.tally);
    const total = rows.reduce((a, [, v]) => a + v, 0) + r.untyped;
    const max = Math.max(1, ...rows.map(([, v]) => v));
    return `<h2>Mistakes</h2><p class="muted">${total ? `${plural(total, 'mistake')} logged this week, by type.` : 'No mistakes logged this week.'}</p>
      ${total ? `<div class="bars" style="margin:14px 0">${rows.map(([t, v]) => `<div class="bar-row"><span class="label">${esc(t)}</span><div class="track"><div class="fill" style="width:${(v / max) * 100}%"></div></div><span class="small muted tabnum">${v}</span></div>`).join('')}
        ${r.untyped ? `<p class="tiny muted">${plural(r.untyped, 'mistake')} without a type.</p>` : ''}</div>` : ''}
      ${r.biggest ? `<div class="callout">${icon('target', 20)}<div><b>Biggest type: ${esc(r.biggest)}</b><div>${esc(ACTIONS[r.biggest])}</div></div></div>`
        : '<div class="callout">' + icon('info', 20) + '<div>Log mistakes with a type during the week and this step will suggest exactly what to work on.</div></div>'}`;
  }
  if (step === 2) {
    const subs = subjectsByGap().filter((s) => topicsOf(s.id).some((t) => !t.parentId));
    if (!subs.length) return `<h2>Confidence</h2>${emptyState('No topics yet', 'Add topics to your subjects and you can update confidence here each week.', 'e.g. Calculus 2/5 → 3/5')}`;
    return `<h2>Confidence</h2><p class="muted">Tap a number for anything that changed. Leave the rest.</p>
      ${subs.map((s) => `<div class="card flat" style="margin:12px 0"><div class="row" style="gap:8px;margin-bottom:4px"><span class="dot" style="background:${esc(s.color)}"></span><b>${esc(subjectLabel(s))}</b></div>
        <div class="conf-grid">${topicsOf(s.id).filter((t) => !t.parentId).map((t) => {
          const v = r.confidence[t.id] ?? t.confidence;
          return `<div class="topic-mini"><span class="small">${esc(t.name)}</span><div class="conf" style="--c:${esc(s.color)}">${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="${v === n ? 'on' : ''}" data-act="conf" data-id="${t.id}" data-v="${n}" aria-label="${n} out of 5">${n}</button>`).join('')}</div></div>`;
        }).join('')}</div></div>`).join('')}`;
  }
  if (step === 3) {
    const ranked = rankedTopics().filter(({ topic }) => !topic.parentId).slice(0, 12);
    if (!ranked.length) return `<h2>Focus topics</h2>${emptyState('No topics yet', 'Once you have topics, pick up to 3 to focus on. They go to the top of Today’s suggestions.', 'e.g. Calculus, Fields, Organic chemistry')}`;
    return `<h2>Focus topics</h2><p class="muted">Pick up to 3 for next week. These are suggested by priority — they’ll lead Today’s suggestions.</p>
      <ul class="list" style="margin-top:10px">${ranked.map(({ topic, stats }) => {
        const on = r.focusIds.includes(topic.id);
        return `<li><button class="list-item" data-act="focus" data-id="${topic.id}" aria-pressed="${on}">
          <span class="num" style="width:26px;height:26px;border-radius:8px;display:grid;place-items:center;border:1.5px solid ${on ? 'var(--accent)' : 'var(--border-strong)'};background:${on ? 'var(--accent)' : 'transparent'};color:var(--accent-ink);flex:none">${on ? icon('check', 16) : ''}</span>
          <span class="grow"><span class="title">${esc(topicLabel(topic))}</span> <span class="small muted">· ${esc(subjectLabel(subjectById(topic.subjectId)))}</span>
          <span class="reason" style="display:block">${r.suggested.includes(topic.id) ? 'Suggested · ' : ''}${esc(stats.reason)}</span></span></button></li>`;
      }).join('')}</ul>
      <p class="small muted" style="margin-top:8px">${r.focusIds.length}/3 picked</p>`;
  }
  const todo = S.papers.filter((p) => p.status === 'Not started');
  const app = S.settings.taskApp;
  return `<h2>Timed paper</h2><p class="muted">Choose one past paper to do under timed conditions this week.</p>
    ${todo.length ? `<div class="chips" style="margin:12px 0">${todo.slice(0, 18).map((p) => `<button type="button" class="chip${r.timedPaperId === p.id ? ' on' : ''}" data-act="paper" data-id="${p.id}"><span class="dot" style="background:${esc(subjectById(p.subjectId)?.color || 'var(--muted)')}"></span>${esc(subjectLabel(subjectById(p.subjectId)))} · ${esc(paperLabel(p))}</button>`).join('')}</div>` : ''}
    <label class="field"><span>${todo.length ? 'Or type one' : 'Which paper?'}</span><input type="text" value="${esc(r.timedPaperText)}" data-tp placeholder="e.g. Physics HL May 2022 P2 TZ1"></label>
    <div class="callout">${icon('bell', 20)}<div>${app ? `<b>Add the date to ${esc(app)}.</b> Study HQ doesn’t do deadlines or reminders — ${esc(app)} does.` : '<b>Put a date on it</b> in whatever you use for homework. Study HQ doesn’t do deadlines or reminders.'}</div></div>`;
}

function wizard() {
  return `<div class="page-head"><div><a class="crumb" href="#review" data-act="cancel">${icon('back', 16)} Weekly review</a><h1>Weekly review</h1><p class="muted">About 15 minutes · step ${step + 1} of 5</p></div></div>
    <div class="steps" aria-hidden="true">${STEPS.map((_, i) => `<i class="${i <= step ? 'on' : ''}"></i>`).join('')}</div>
    <div class="card"><div class="wizard-body" id="wiz">${stepHtml()}</div>
      <div class="row-actions" style="justify-content:space-between">
        ${step ? `<button class="btn btn-ghost" data-act="back">${icon('back', 18)} Back</button>` : '<span></span>'}
        ${step < 4 ? `<button class="btn btn-primary" data-act="next">Next: ${esc(STEPS[step + 1])}</button>` : `<button class="btn btn-primary" data-act="finish">${icon('check')} Save review</button>`}
      </div></div>`;
}

function pastHtml(rv) {
  const st = rv.stats || {};
  const paper = rv.timedPaperId ? S.papers.find((p) => p.id === rv.timedPaperId) : null;
  const focus = (rv.focusIds || []).map((id) => S.topics.find((t) => t.id === id)).filter(Boolean);
  return `<div class="page-head"><div><a class="crumb" href="#review">${icon('back', 16)} Weekly review</a><h1>Review · ${esc(fmtDay(rv.date))}</h1><p class="muted">Week of ${esc(fmtDay(rv.week))}</p></div></div>
    <div class="card"><div class="stat-nums"><div class="stat-num"><span>Days studied</span><b>${st.daysStudied ?? '–'}</b></div><div class="stat-num"><span>Minutes</span><b>${st.totalMinutes ?? '–'}</b></div>
      <div class="stat-num"><span>Questions</span><b>${st.questions ?? '–'}</b></div><div class="stat-num"><span>Hard questions</span><b>${pct(st.hardShare)}</b></div></div></div>
    <div class="grid2"><div class="card"><h3>Mistakes</h3>${rv.biggest ? `<p><b>Biggest type: ${esc(rv.biggest)}</b></p><p class="small muted">${esc(rv.action)}</p>` : '<p class="muted small">No typed mistakes that week.</p>'}
      <p class="small muted" style="margin:0">${Object.entries(rv.tally || {}).filter(([, v]) => v).map(([t, v]) => `${esc(t)}: ${v}`).join(' · ')}</p></div>
    <div class="card"><h3>Next week</h3><p class="small"><b>Focus:</b> ${focus.length ? focus.map((t) => esc(topicLabel(t))).join(', ') : '—'}</p>
      <p class="small" style="margin:0"><b>Timed paper:</b> ${paper ? `${esc(subjectLabel(subjectById(paper.subjectId)))} · ${esc(paperLabel(paper))}` : esc(rv.timedPaperText || '—')}</p></div></div>
    ${Object.keys(rv.confidence || {}).length ? `<div class="card quiet"><h3>Confidence changes</h3><p class="small muted" style="margin:0">${Object.entries(rv.confidence).map(([id, v]) => { const t = S.topics.find((x) => x.id === id); return t ? `${esc(t.name)} → ${v}/5` : ''; }).filter(Boolean).join(' · ')}</p></div>` : ''}`;
}

function home() {
  const day = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][S.profile?.answers?.reviewDay ?? 0];
  const past = [...S.weeklyReviews].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const thisWeek = past.find((x) => x.date >= weekStart());
  const focus = activeFocusIds().map((id) => S.topics.find((t) => t.id === id)).filter(Boolean);
  return `<div class="page-head"><div><h1>Weekly review</h1><p class="muted">15 minutes to look back, pick what matters and set up next week. Suggested on ${esc(day)}s — any day works.</p></div></div>
    <div class="hero"><div class="eyebrow">${thisWeek ? 'Done this week' : 'Ready when you are'}</div>
      <div class="hero-title">${thisWeek ? 'You’ve reviewed this week' : 'Five short steps'}</div>
      <div class="hero-why">${thisWeek ? `Saved on ${esc(fmtDay(thisWeek.date))}. You can do another if things changed.` : 'This week → mistakes → confidence → focus topics → one timed paper.'}</div>
      <div class="start-block"><button class="btn btn-primary btn-big${thisWeek ? '' : ' btn-start'}" data-act="start">${icon('play')} ${thisWeek ? 'Review again' : 'Start weekly review'}</button></div></div>
    ${focus.length ? `<div class="card"><h3>This week’s focus topics</h3><div class="chips">${focus.map((t) => `<span class="pill accent">${esc(topicLabel(t))}</span>`).join('')}</div><p class="small muted" style="margin:10px 0 0">They add +3 to each topic’s priority, so they lead Today’s suggestions.</p></div>` : ''}
    <h2 class="section-title">Past reviews</h2>
    <div class="card quiet">${past.length ? `<ul class="list">${past.map((x) => `<li><a class="list-item" href="#review/${x.id}"><span class="grow"><span class="title">${esc(fmtDay(x.date))}</span>
      <span class="reason" style="display:block">${x.stats?.daysStudied ?? 0} days studied · ${x.stats?.totalMinutes ?? 0} min${x.biggest ? ` · biggest mistake type: ${esc(x.biggest)}` : ''}</span></span>${icon('chev')}</a></li>`).join('')}</ul>`
      : emptyState('No reviews yet', 'Each review is saved here so you can look back at how your weeks went.', 'e.g. “3 days studied · 140 min · biggest mistake type: Careless”')}</div>`;
}

function render(params) {
  if (params[0] === 'go' && r) return wizard();
  if (params[0] && params[0] !== 'go') {
    const rv = S.weeklyReviews.find((x) => x.id === params[0]);
    if (rv) return pastHtml(rv);
  }
  return home();
}

function swapStep() {
  bus.refresh();
  document.getElementById('wiz')?.scrollIntoView({ block: 'nearest' });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

export default {
  render,
  enter(params) { if (params[0] === 'go' && !r) { r = fresh(); step = 0; } },
  mount(root) {
    root.querySelector('[data-tp]')?.addEventListener('input', (e) => { r.timedPaperText = e.target.value; if (e.target.value) r.timedPaperId = null; });
  },
  on: {
    start: () => { r = fresh(); step = 0; bus.go('#review/go'); },
    cancel: async (el, ev) => {
      ev.preventDefault();
      if (step === 0 || await confirmDialog('Leave the review?', 'Your answers so far won’t be saved.', 'Leave')) { r = null; bus.go('#review'); }
    },
    next: () => { step = Math.min(4, step + 1); swapStep(); },
    back: () => { step = Math.max(0, step - 1); swapStep(); },
    conf: (el) => { const id = el.dataset.id; const v = Number(el.dataset.v); r.confidence[id] = r.confidence[id] === v ? (S.topics.find((t) => t.id === id)?.confidence ?? null) : v; bus.refresh(); },
    focus: (el) => {
      const id = el.dataset.id; const s = new Set(r.focusIds);
      if (s.has(id)) s.delete(id); else if (s.size >= 3) { toast('Up to 3 — untick one first.'); return; } else s.add(id);
      r.focusIds = [...s]; bus.refresh();
    },
    paper: (el) => { r.timedPaperId = r.timedPaperId === el.dataset.id ? null : el.dataset.id; if (r.timedPaperId) r.timedPaperText = ''; bus.refresh(); },
    finish: () => {
      for (const [id, v] of Object.entries(r.confidence)) { const t = S.topics.find((x) => x.id === id); if (t && t.confidence !== v) save('topics', { ...t, confidence: v }); }
      const rec = save('weeklyReviews', { ...r });
      setMeta('focusTopics', { ids: r.focusIds, from: today(), until: addDays(today(), 8), reviewId: rec.id });
      r = null; step = 0;
      toast('Review saved. Your focus topics now lead Today.');
      bus.go('#today');
    },
  },
};

export { typeLabel };
