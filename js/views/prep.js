// Test prep pack: pick a subject, topics and a test date; get a one-page checklist to tick off.
// It never creates deadlines or reminders — those stay in the user's own task app.
import { S, setMeta, uid } from '../store.js';
import {
  subjectById, subjectLabel, topicsOf, topicById, topicLabel, childTopics, today, daysBetween,
} from '../logic.js';
import { esc, icon, bus, chips, openModal, closeModal, renderModal, modalHead, toast, confirmDialog, emptyState, plural, subjectOptions, fmtDay } from '../ui.js';
import focusView from './focus.js';
import { openRedo } from './mistakes.js';
import { openReview } from './cards.js';
import { on } from '../store.js';

const packs = () => S.meta.prepPacks || [];
const savePacks = (list) => setMeta('prepPacks', list);
const famIds = (ids) => { const s = new Set(ids); ids.forEach((id) => childTopics(id).forEach((c) => s.add(c.id))); return s; };

function openNew(edit = null) {
  const f = edit ? { ...edit, topicIds: [...edit.topicIds] } : { subjectId: S.settings.lastSubjectId && subjectById(S.settings.lastSubjectId) ? S.settings.lastSubjectId : S.subjects[0]?.id, topicIds: [], testDate: '', name: '' };
  const m = openModal({
    html: () => {
      const topics = f.subjectId ? topicsOf(f.subjectId).filter((t) => !t.parentId) : [];
      return `${modalHead(edit ? 'Edit test prep' : 'New test prep pack', 'Pick what the test covers. Study HQ builds the checklist.')}
        <form data-submit="save">
        ${S.subjects.length ? `<div class="field"><span class="field-label">Subject</span>${chips('subjectId', subjectOptions(), f.subjectId, { act: 'pick' })}</div>` : ''}
        <div class="field"><span class="field-label">Topics</span>${topics.length ? chips('topicIds', topics.map((t) => ({ value: t.id, label: t.name })), f.topicIds, { multi: true, act: 'multi' }) : '<p class="small muted">This subject has no topics yet — add them on the Topics page.</p>'}</div>
        <div class="grid2"><label class="field"><span>Test date</span><input type="date" name="testDate" value="${esc(f.testDate)}"></label>
        <label class="field"><span>Name <span class="hint">(optional)</span></span><input type="text" name="name" value="${esc(f.name)}" placeholder="e.g. Unit test, Mocks"></label></div>
        <p class="tiny muted" style="margin:-4px 0 0">The date is only a label — no reminders. ${S.settings.taskApp ? `Put the test in ${esc(S.settings.taskApp)}.` : ''}</p>
        <div class="row-actions end"><button class="btn btn-primary" type="submit" ${f.topicIds.length ? '' : 'disabled'}>${edit ? 'Save' : 'Build my checklist'}</button></div></form>`;
    },
    on: {
      pick: (el) => { read(); f.subjectId = el.dataset.value; f.topicIds = []; renderModal(m); },
      multi: (el) => { read(); const s = new Set(f.topicIds); s.has(el.dataset.value) ? s.delete(el.dataset.value) : s.add(el.dataset.value); f.topicIds = [...s]; renderModal(m); },
      save: () => {
        read();
        if (!f.topicIds.length) return;
        const list = packs();
        if (edit) { savePacks(list.map((p) => (p.id === edit.id ? { ...p, ...f } : p))); closeModal(m); bus.refresh(); return; }
        const p = { id: uid(), ...f, createdAt: new Date().toISOString(), ticks: {} };
        savePacks([p, ...list]);
        closeModal(m); bus.go(`#prep/${p.id}`);
      },
    },
  });
  function read() { ['testDate', 'name'].forEach((k) => { const el = m.body.querySelector(`[name=${k}]`); if (el) f[k] = el.value; }); }
}

function packItems(p) {
  const ids = famIds(p.topicIds);
  const since = p.createdAt;
  const inT = (x) => ids.has(x.topicId);
  const fixes = S.mistakes.filter((x) => x.subjectId === p.subjectId && inT(x) && x.fix);
  const open = S.mistakes.filter((x) => x.status === 'open' && inT(x));
  const cards = S.flashcards.filter(inT);
  const cardsDone = cards.length > 0 && cards.every((c) => c.lastReviewed && c.lastReviewed >= since.slice(0, 10));
  const items = [
    { key: 'fix', title: 'Read the fix sheet', sub: fixes.length ? `${plural(fixes.length, 'fix', 'fixes')} from your mistake log for these topics` : 'No fixes logged for these topics yet', auto: false, action: fixes.length ? `<button class="btn btn-sm" data-act="showFix">${icon('mistakes', 16)} Show fixes</button>` : '' },
    { key: 'redo', title: 'Redo open mistakes first', sub: open.length ? `${plural(open.length, 'open mistake')} in these topics` : 'No open mistakes left here', auto: open.length === 0 && fixes.length > 0, action: open.length ? `<button class="btn btn-sm btn-soft" data-act="redo">${icon('redo', 16)} Redo ${open.length}</button>` : '' },
  ];
  if (on('flashcards')) items.push({ key: 'cards', title: 'Go through the flashcards', sub: cards.length ? `${plural(cards.length, 'card')} for these topics` : 'No cards for these topics yet', auto: cardsDone, action: cards.length ? `<button class="btn btn-sm btn-soft" data-act="cards">${icon('cards', 16)} Review ${cards.length}</button>` : '' });
  const perTopic = p.topicIds.map((id) => topicById(id)).filter(Boolean).map((t) => {
    const fam = famIds([t.id]);
    const blurted = S.sessions.some((s) => s.type === 'blurting' && (s.endedAt || '') >= since && (s.topicIds || []).some((x) => fam.has(x)));
    const hard = S.practiceSets.filter((x) => x.difficulty === 'hard' && fam.has(x.topicId) && (x.createdAt || '') >= since).reduce((a, x) => a + (x.mode === 'marks' ? 0 : x.attempted || 0), 0);
    return { t, blurted, hard };
  });
  return { items, perTopic, fixes, open, cards };
}

function packPage(p) {
  const s = subjectById(p.subjectId);
  const { items, perTopic, fixes } = packItems(p);
  const tick = (key, auto) => auto || !!p.ticks[key];
  const all = [...items.map((i) => tick(i.key, i.auto)), ...perTopic.flatMap(({ t, blurted, hard }) => [tick(`blurt:${t.id}`, blurted), tick(`hard:${t.id}`, hard >= 3)])];
  const done = all.filter(Boolean).length;
  const dleft = p.testDate ? daysBetween(today(), p.testDate) : null;
  const row = (key, auto, title, sub, action = '') => `<div class="tick${tick(key, auto) ? ' done' : ''}"><input type="checkbox" data-change="tick" data-key="${esc(key)}" ${tick(key, auto) ? 'checked' : ''} ${auto ? 'disabled title="Ticked automatically"' : ''} aria-label="${esc(title)}">
    <div class="body"><b>${esc(title)}</b>${auto ? ' <span class="pill ok">done</span>' : ''}<div class="small muted">${esc(sub)}</div></div><div class="no-print">${action}</div></div>`;
  return `<div class="page-head"><div><a class="crumb no-print" href="#prep">${icon('back', 16)} Test prep</a>
      <h1>${esc(p.name || `${s ? subjectLabel(s) : 'Test'} prep`)}</h1>
      <p class="muted">${esc(s ? subjectLabel(s) : '')}${p.testDate ? ` · test on ${esc(fmtDay(p.testDate))}${dleft !== null && dleft >= 0 ? ` (${dleft === 0 ? 'today' : plural(dleft, 'day')})` : ''}` : ''} · ${esc(p.topicIds.map((id) => topicById(id)?.name).filter(Boolean).join(', '))}</p></div>
    <div class="row no-print"><button class="btn btn-ghost btn-danger" data-act="del" aria-label="Delete pack">${icon('trash', 18)}</button><button class="btn btn-ghost" data-act="edit">${icon('edit', 18)} Edit</button><button class="btn" data-act="print">${icon('print', 18)} Print</button></div></div>
    <div class="card"><div class="row between" style="margin-bottom:8px"><b>${done} of ${all.length} done</b><span class="small muted">Ticks update by themselves as you study</span></div>
      <div class="progress-line"><div style="width:${all.length ? (done / all.length) * 100 : 0}%"></div></div></div>
    <div class="card">${items.map((i) => row(i.key, i.auto, i.title, i.sub, i.action)).join('')}</div>
    <h2 class="section-title">For each topic</h2>
    <div class="card">${perTopic.map(({ t, blurted, hard }) => `<div style="padding:4px 0 10px"><div class="row" style="gap:8px;margin-top:8px"><span class="dot" style="background:${esc(s?.color || 'var(--accent)')}"></span><b>${esc(t.name)}</b></div>
      ${row(`blurt:${t.id}`, blurted, 'One blurting session', blurted ? 'Done since you made this pack' : 'Write everything you remember, then check what you missed', `<button class="btn btn-sm btn-soft" data-act="blurt" data-id="${t.id}">${icon('play', 14)} Blurt</button>`)}
      ${row(`hard:${t.id}`, hard >= 3, 'At least 3 hard questions', on('practiceLog') ? `${hard}/3 hard questions logged since you made this pack` : 'Tick when done')}</div>`).join('')}</div>
    <div class="card fixsheet ${p.showFix ? '' : 'print-only'}" id="prep-fix"><h3 style="margin-top:0">Fix sheet</h3>${fixes.length ? p.topicIds.map((id) => {
      const fam = famIds([id]); const list = fixes.filter((x) => fam.has(x.topicId));
      return list.length ? `<h4>${esc(topicById(id)?.name || '')}</h4><ul>${list.map((x) => `<li>${esc(x.fix)}${x.topicId !== id ? ` <span class="muted tiny">(${esc(topicLabel(topicById(x.topicId)))})</span>` : ''}</li>`).join('')}</ul>` : '';
    }).join('') : '<p class="muted small">No fixes yet for these topics.</p>'}</div>
    <p class="tiny muted center no-print">No deadlines or reminders here${S.settings.taskApp ? ` — the test date lives in ${esc(S.settings.taskApp)}` : ''}.</p>`;
}

function home() {
  const list = packs();
  return `<div class="page-head"><div><h1>Test prep</h1><p class="muted">A one-page checklist for a test: fixes, redos, flashcards, blurting and hard questions.</p></div>
    <button class="btn btn-primary" data-act="new">${icon('plus')} New pack</button></div>
    <div class="card quiet">${list.length ? `<ul class="list">${list.map((p) => {
      const s = subjectById(p.subjectId);
      return `<li><a class="list-item" href="#prep/${p.id}"><span class="dot" style="background:${esc(s?.color || 'var(--muted)')}"></span><span class="grow"><span class="title">${esc(p.name || `${s ? subjectLabel(s) : 'Test'} prep`)}</span>
        <span class="reason" style="display:block">${p.testDate ? `Test ${esc(fmtDay(p.testDate))} · ` : ''}${plural(p.topicIds.length, 'topic')}</span></span>${icon('chev')}</a></li>`;
    }).join('')}</ul>` : emptyState('No test prep packs yet', 'Pick a subject, the topics on the test and the date. You get a checklist that ticks itself off as you study.', 'e.g. Physics HL · Fields + Nuclear physics · test on 12 Dec', `<button class="btn btn-primary" data-act="new">${icon('plus')} Make a pack</button>`)}</div>`;
}

let curId = null;
const cur = () => packs().find((p) => p.id === curId);
const patch = (fn) => savePacks(packs().map((p) => (p.id === curId ? fn({ ...p, ticks: { ...p.ticks } }) : p)));

export default {
  render(params) {
    curId = params[0] || null;
    const p = cur();
    if (curId && !p) return emptyState('Pack not found', 'It may have been deleted.', '', '<a class="btn" href="#prep">All packs</a>');
    return p ? packPage(p) : home();
  },
  on: {
    new: () => openNew(),
    edit: () => { const p = cur(); if (p) openNew(p); },
    tick: (el) => { patch((p) => { p.ticks[el.dataset.key] = el.checked; return p; }); bus.refresh(); },
    showFix: () => { patch((p) => ({ ...p, showFix: !p.showFix })); bus.refresh(); setTimeout(() => document.getElementById('prep-fix')?.scrollIntoView({ behavior: 'smooth' }), 50); },
    redo: () => { const p = cur(); openRedo({ ids: packItems(p).open.map((x) => x.id) }); },
    cards: () => { const p = cur(); openReview({ ids: packItems(p).cards.map((c) => c.id), cram: true }); },
    blurt: (el) => { const p = cur(); focusView.prefill({ subjectId: p.subjectId, topicIds: [el.dataset.id], type: 'blurting', sprintLen: 10, goal: 'Write down everything I remember' }); bus.go('#focus'); },
    print: () => { try { window.print(); } catch { toast('Printing isn’t available here.'); } },
    del: async () => {
      if (!(await confirmDialog('Delete this pack?', 'Only the checklist is deleted — your mistakes, cards and sessions stay.', 'Delete', true))) return;
      savePacks(packs().filter((p) => p.id !== curId)); bus.go('#prep');
    },
  },
};
