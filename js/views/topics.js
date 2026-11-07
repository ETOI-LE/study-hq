// Topic tracker: subjects overview and a subject page sorted by priority.
import { S, on, save, remove } from '../store.js';
import {
  subjectById, subjectLabel, subjectsByGap, topicsOf, childTopics, topicStats, topicLabel, suggestedType, rankedTopics,
} from '../logic.js';
import { esc, icon, bus, emptyState, openModal, closeModal, modalHead, confirmDialog, toast, plural } from '../ui.js';
import focusView from './focus.js';

const NOTES_EXAMPLE = {
  paper: 'e.g. Blue Physics folder › Fields, pages 3–8',
  tablet: 'e.g. reMarkable › Physics › Fields, p. 3–8',
  laptop: 'e.g. Google Drive › Physics › Fields notes',
  mix: 'e.g. reMarkable › Physics › Fields, p. 3–8',
};
export const notesPlaceholder = () => NOTES_EXAMPLE[S.profile?.answers?.notes] || NOTES_EXAMPLE.tablet;

let query = '';
let filterSubject = '';
let expanded = new Set();

function confButtons(t, color) {
  return `<div class="conf" role="group" aria-label="Confidence for ${esc(t.name)}" style="--c:${esc(color)}">${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="${t.confidence === n ? 'on' : ''}" data-act="conf" data-id="${t.id}" data-v="${n}" aria-pressed="${t.confidence === n}" aria-label="${n} out of 5">${n}</button>`).join('')}</div>`;
}

function topicRow(t, s, isSub = false) {
  const st = topicStats(t);
  const kids = childTopics(t.id);
  const showNotes = on('notesField') || expanded.has(t.id);
  return `<div class="topic-row${isSub ? ' sub' : ''}">
    <div class="row between wrap" style="align-items:flex-start">
      <div class="grow" style="min-width:200px">
        <div class="row" style="gap:8px"><b>${esc(t.name)}</b>${st.focus ? '<span class="pill accent">Focus</span>' : ''}</div>
        <div class="reason">${esc(st.reason)}</div>
        <div class="row" style="margin-top:6px;gap:12px"><div class="confbar" style="--c:${esc(s.color)}"><div style="width:${((t.confidence || 0) / 5) * 100}%"></div></div>
          <span class="tiny muted">Priority <span class="score">${st.score}</span></span>${on('practiceLog') && st.practiced ? `<span class="tiny muted">· ${st.practiced} questions practised</span>` : ''}</div>
      </div>
      <div class="row wrap" style="gap:6px">${confButtons(t, s.color)}
        <button class="icon-btn" data-act="study" data-id="${t.id}" aria-label="Study ${esc(t.name)} now" title="Start a session on this topic">${icon('play', 18)}</button>
        <button class="icon-btn" data-act="edit" data-id="${t.id}" aria-label="Edit ${esc(t.name)}" title="Edit">${icon('edit', 18)}</button></div>
    </div>
    ${showNotes ? `<label class="field" style="margin:10px 0 0"><span class="small muted" style="font-weight:500">Where my notes are</span>
      <input type="text" value="${esc(t.notes || '')}" placeholder="${esc(notesPlaceholder())}" data-notes="${t.id}"></label>`
      : t.notes ? `<p class="tiny muted" style="margin:6px 0 0">Notes: ${esc(t.notes)}</p>` : ''}
    ${!isSub ? `<div class="row" style="gap:4px;margin-top:4px">
        ${kids.length ? `<button class="link-btn" data-act="toggleKids" data-id="${t.id}">${expanded.has('k' + t.id) ? 'Hide' : 'Show'} ${plural(kids.length, 'subtopic')}</button>` : ''}
        <button class="link-btn" data-act="addSub" data-id="${t.id}">+ Subtopic</button></div>` : ''}
    ${!isSub && expanded.has('k' + t.id) ? kids.map((k) => topicRow(k, s, true)).join('') : ''}
  </div>`;
}

function subjectPage(id) {
  const s = subjectById(id);
  if (!s) return emptyState('Subject not found', 'It may have been deleted.', '', '<a class="btn" href="#topics">All subjects</a>');
  const ranked = rankedTopics(id).filter(({ topic }) => !topic.parentId);
  const q = query.trim().toLowerCase();
  const shown = ranked.filter(({ topic }) => !q || topic.name.toLowerCase().includes(q) || childTopics(topic.id).some((c) => c.name.toLowerCase().includes(q)) || (topic.notes || '').toLowerCase().includes(q));
  const grade = s.current || s.target ? `<span class="pill">${esc(s.current || '–')} → ${esc(s.target || '–')}</span>` : '';
  return `<div class="page-head"><div><a href="#topics" class="small muted" style="text-decoration:none">${icon('back', 16)} All subjects</a>
      <h1 class="row" style="gap:10px;margin-top:6px"><span class="dot" style="background:${esc(s.color)};width:14px;height:14px"></span>${esc(subjectLabel(s))}</h1>
      <p class="muted">Sorted by priority — the reason is under each topic. ${grade}</p></div></div>
    <form class="row" data-submit="addTopic" style="margin-bottom:14px"><input type="text" class="grow" id="new-topic" placeholder="Add a topic, e.g. Organic chemistry" aria-label="New topic name"><button class="btn" type="submit">${icon('plus')} Add</button></form>
    ${ranked.length > 5 ? `<div class="search" style="margin-bottom:12px">${icon('search')}<input type="search" placeholder="Search topics" value="${esc(query)}" data-input="q" aria-label="Search topics"></div>` : ''}
    <div class="card" id="topic-list">${ranked.length ? (shown.length ? shown.map(({ topic }) => topicRow(topic, s)).join('') : '<p class="muted">No topics match.</p>')
      : emptyState('Add topics', 'Add the topics in this subject so Study HQ can track confidence and suggest what to study.', 'e.g. “Organic chemistry” — split it into subtopics like “Isomers” later')}</div>`;
}

function overview() {
  if (!S.subjects.length) {
    return `<div class="page-head"><div><h1>Topics</h1></div></div>${emptyState('No subjects yet', 'Add your subjects in Settings. IB Maths, Physics, Chemistry, Biology and Economics come with topic lists.', 'e.g. Physics HL → A. Space, time and motion, B. The particulate nature of matter…', '<a class="btn btn-primary" href="#settings/subjects">Add subjects</a>')}`;
  }
  const q = query.trim().toLowerCase();
  const subs = subjectsByGap().filter((s) => !filterSubject || s.id === filterSubject);
  let results = '';
  if (q) {
    const hits = S.topics.filter((t) => subs.some((s) => s.id === t.subjectId) && (t.name.toLowerCase().includes(q) || (t.notes || '').toLowerCase().includes(q)));
    results = `<div class="card quiet"><h3>Matching topics</h3>${hits.length ? `<ul class="list">${hits.map((t) => `<li><a class="list-item" href="#topics/${t.subjectId}" style="text-decoration:none"><span class="dot" style="background:${esc(subjectById(t.subjectId)?.color)}"></span><span class="grow"><span class="title">${esc(topicLabel(t))}</span><span class="reason" style="display:block">${esc(subjectLabel(subjectById(t.subjectId)))} · ${esc(topicStats(t).reason)}</span></span></a></li>`).join('')}</ul>` : '<p class="muted small">No topics match.</p>'}</div>`;
  }
  return `<div class="page-head"><div><h1>Topics</h1><p class="muted">Subjects furthest from target come first.</p></div></div>
    <div class="filters"><div class="search">${icon('search')}<input type="search" placeholder="Search all topics" value="${esc(query)}" data-input="q" aria-label="Search topics" id="topic-search"></div>
    <select data-change="fsub" aria-label="Filter by subject"><option value="">All subjects</option>${S.subjects.map((s) => `<option value="${s.id}"${s.id === filterSubject ? ' selected' : ''}>${esc(subjectLabel(s))}</option>`).join('')}</select></div>
    <div id="topic-results">${results}</div>
    ${subs.map((s) => {
      const ts = topicsOf(s.id).filter((t) => !t.parentId);
      const top = rankedTopics(s.id)[0];
      const open = S.mistakes.filter((m) => m.subjectId === s.id && m.status === 'open').length;
      const rated = ts.filter((t) => t.confidence);
      const avg = rated.length ? (rated.reduce((a, t) => a + t.confidence, 0) / rated.length).toFixed(1) : null;
      return `<a class="card subject-card" href="#topics/${s.id}"><span class="swatch" style="background:${esc(s.color)}"></span>
        <span class="grow"><b>${esc(subjectLabel(s))}</b>${s.current || s.target ? ` <span class="pill">${esc(s.current || '–')} → ${esc(s.target || '–')}</span>` : ''}
        <span class="small muted" style="display:block">${ts.length ? `${plural(ts.length, 'topic')}${avg ? ` · avg confidence ${avg}/5` : ''} · ${plural(open, 'open mistake')}` : 'No topics yet — tap to add'}</span>
        ${top ? `<span class="reason" style="display:block">Top: ${esc(topicLabel(top.topic))} — ${esc(top.stats.reason)}</span>` : ''}</span>${icon('chev')}</a>`;
    }).join('')}`;
}

function editTopic(t) {
  const m = openModal({
    html: () => `${modalHead('Edit topic')}<form data-submit="save">
      <label class="field"><span>Name</span><input type="text" name="name" value="${esc(t.name)}" required></label>
      <label class="field"><span>Where my notes are</span><input type="text" name="notes" value="${esc(t.notes || '')}" placeholder="${esc(notesPlaceholder())}"></label>
      <div class="row-actions" style="justify-content:space-between"><button type="button" class="btn btn-ghost btn-danger" data-act="del">${icon('trash', 18)} Delete</button>
      <button class="btn btn-primary" type="submit">Save</button></div></form>`,
    on: {
      save: () => {
        const name = m.body.querySelector('[name=name]').value.trim(); if (!name) return;
        save('topics', { ...t, name, notes: m.body.querySelector('[name=notes]').value.trim() });
        closeModal(m); bus.refresh();
      },
      del: async () => {
        const kids = childTopics(t.id);
        if (!(await confirmDialog('Delete this topic?', `${kids.length ? `Its ${plural(kids.length, 'subtopic')} will be deleted too. ` : ''}Mistakes in it are kept but lose their topic.`, 'Delete', true))) return;
        const ids = [t.id, ...kids.map((k) => k.id)];
        ids.forEach((id) => remove('topics', id));
        S.mistakes.filter((x) => ids.includes(x.topicId)).forEach((x) => save('mistakes', { ...x, topicId: null }));
        closeModal(m); bus.refresh();
      },
    },
  });
}

function addSubtopic(parent) {
  const m = openModal({
    html: () => `${modalHead('Add subtopic', `Inside ${parent.name}`)}<form data-submit="save">
      <label class="field"><span>Subtopic name</span><input type="text" name="name" required placeholder="e.g. Chain rule" autofocus></label>
      <div class="row-actions end"><button class="btn btn-primary" type="submit">Add</button></div></form>`,
    on: {
      save: () => {
        const name = m.body.querySelector('[name=name]').value.trim(); if (!name) return;
        save('topics', { subjectId: parent.subjectId, parentId: parent.id, name, confidence: null, notes: '', order: childTopics(parent.id).length });
        expanded.add('k' + parent.id);
        closeModal(m); bus.refresh(); toast('Subtopic added.');
      },
    },
  });
}

let notesTimer = null;

export default {
  render(params) { return params[0] ? subjectPage(params[0]) : overview(); },
  enter() { query = ''; },
  mount(root, params) {
    root.querySelectorAll('[data-input="q"]').forEach((inp) => inp.addEventListener('input', () => {
      query = inp.value;
      if (params[0]) {
        const tmp = document.createElement('div'); tmp.innerHTML = subjectPage(params[0]);
        document.getElementById('topic-list').replaceWith(tmp.querySelector('#topic-list'));
      } else {
        const tmp = document.createElement('div'); tmp.innerHTML = overview();
        document.getElementById('topic-results').replaceWith(tmp.querySelector('#topic-results'));
      }
    }));
    root.querySelectorAll('[data-notes]').forEach((inp) => inp.addEventListener('input', () => {
      const id = inp.dataset.notes;
      clearTimeout(notesTimer);
      notesTimer = setTimeout(() => { const t = S.topics.find((x) => x.id === id); if (t) save('topics', { ...t, notes: inp.value.trim() }); }, 400);
    }));
  },
  on: {
    conf: (el) => {
      const t = S.topics.find((x) => x.id === el.dataset.id); if (!t) return;
      const v = Number(el.dataset.v);
      save('topics', { ...t, confidence: t.confidence === v ? null : v });
      bus.refresh();
    },
    study: (el) => {
      const t = S.topics.find((x) => x.id === el.dataset.id); if (!t) return;
      focusView.prefill({ subjectId: t.subjectId, topicIds: [t.id], type: suggestedType(t) });
      bus.go('#focus');
    },
    edit: (el) => { const t = S.topics.find((x) => x.id === el.dataset.id); if (t) editTopic(t); },
    addSub: (el) => { const t = S.topics.find((x) => x.id === el.dataset.id); if (t) addSubtopic(t); },
    toggleKids: (el) => { const k = 'k' + el.dataset.id; expanded.has(k) ? expanded.delete(k) : expanded.add(k); bus.refresh(); },
    addTopic: () => {
      const inp = document.getElementById('new-topic');
      const name = inp.value.trim(); if (!name) return;
      const subjectId = location.hash.split('/')[1];
      save('topics', { subjectId, parentId: null, name, confidence: null, notes: '', order: topicsOf(subjectId).length });
      bus.refresh();
      setTimeout(() => document.getElementById('new-topic')?.focus(), 0);
    },
    fsub: (el) => { filterSubject = el.value; bus.refresh(); },
  },
};
