// Mistake log: quick add, list, redo mode, stats, fix sheet.
import { S, on, save, remove, savePhoto, photoUrl, deletePhotos, saveSettings } from '../store.js';
import {
  subjectById, subjectLabel, topicById, topicLabel, topicsOf, today, weekStart, dayStr,
  newMistakeFields, applyRedo, dueMistakes, dueLabel, isDue, addDays,
} from '../logic.js';
import {
  esc, icon, bus, chips, openModal, closeModal, renderModal, modalHead, toast, confirmDialog,
  subjectTag, subjectDot, emptyState, plural, fmtDay, subjectOptions,
} from '../ui.js';

export const MISTAKE_TYPES = ['Content', 'Didn’t know how to start', 'Careless', 'Time', 'Presentation'];
const DIFFICULTY = ['easy', 'medium', 'hard'];

// ---------- Photos ----------
export function compressImage(file, maxW = 1600) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxW / img.naturalWidth);
      const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not read image'))), 'image/jpeg', 0.82);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read image')); };
    img.src = url;
  });
}

function loadPhotos(root) {
  root.querySelectorAll('img[data-photo]').forEach(async (img) => {
    const url = await photoUrl(img.dataset.photo);
    if (url) img.src = url; else img.remove();
  });
}

// ---------- Quick add / edit ----------
const FIELDS = ['source', 'wrong', 'fix', 'topicId', 'date', 'marksLost', 'link', 'notes'];

function readForm(root, f) {
  for (const k of FIELDS) {
    const el = root.querySelector(`[name="${k}"]`);
    if (el) f[k] = el.value;
  }
}

/** opts: { subjectId, topicId, sessionId, onSaved, edit: mistake } */
export function openQuickAdd(opts = {}) {
  const editing = opts.edit || null;
  const lastSubj = S.settings.lastSubjectId && subjectById(S.settings.lastSubjectId) ? S.settings.lastSubjectId : null;
  const f = editing ? { ...editing } : {
    source: '', wrong: '', fix: '',
    subjectId: opts.subjectId ?? lastSubj ?? S.subjects[0]?.id ?? null,
    topicId: opts.topicId || '', date: today(), type: '', difficulty: '', marksLost: '',
    photoQ: null, photoSol: null, link: '', notes: '', sessionId: opts.sessionId || null,
  };
  const newPhotos = []; // added in this form; cleaned up if cancelled
  let saved = false;
  let moreOpen = !!editing;
  const sources = [...(S.settings.practiceSources || [])];
  const askType = on('askType');

  const photoField = (key, label) => `<div class="field"><span class="field-label">${label}</span>
    <div class="photo-pick">${f[key] ? `<img data-photo="${esc(f[key])}" alt=""><button type="button" class="btn btn-ghost" data-act="rmPhoto" data-key="${key}">Remove</button>`
      : `<label class="btn">${icon('camera')} Add photo<input type="file" accept="image/*" class="sr-only" data-change="photo" data-key="${key}"></label>`}</div></div>`;

  const typeChips = () => chips('type', MISTAKE_TYPES, f.type, { act: 'pick' });

  const m = openModal({
    html: () => {
      const topics = f.subjectId ? topicsOf(f.subjectId) : [];
      const s = subjectById(f.subjectId);
      const t = topicById(f.topicId);
      return `${modalHead(editing ? 'Edit mistake' : 'Log a mistake', editing ? dueLabel(editing) + (editing.status === 'open' && editing.dueAt ? ` · ${fmtDay(editing.dueAt)}` : '') : 'Three lines. Everything else is optional.')}
      <form data-submit="save" autocomplete="off">
        <label class="field"><span>Source and question</span>
          <input type="text" name="source" required value="${esc(f.source)}" placeholder="e.g. Revision Village Calculus Q14 or May 2023 P2 Q5" autofocus></label>
        ${sources.length && !editing ? `<div class="chips" style="margin:-6px 0 12px">${sources.map((x) => `<button type="button" class="chip" data-act="src" data-v="${esc(x)}" style="min-height:32px;font-size:.82rem">${esc(x)}</button>`).join('')}</div>` : ''}
        <label class="field"><span>What went wrong</span>
          <input type="text" name="wrong" required value="${esc(f.wrong)}" placeholder="e.g. Forgot to multiply by the derivative of the inside"></label>
        <label class="field"><span>Fix / rule</span>
          <input type="text" name="fix" required value="${esc(f.fix)}" placeholder="e.g. Chain rule: multiply by the derivative of the inside"></label>
        ${askType ? `<div class="field"><span class="field-label">Mistake type</span>${typeChips()}</div>` : ''}
        <p class="small muted" style="margin:-4px 0 6px">${s ? `${subjectDot(s.id)} ${esc(subjectLabel(s))}${t ? ` · ${esc(topicLabel(t))}` : ''}` : 'No subject'} <button type="button" class="link-btn" data-act="openMore">change</button></p>
        <details class="more" ${moreOpen ? 'open' : ''} data-more><summary>More</summary>
          ${S.subjects.length ? `<div class="field"><span class="field-label">Subject</span>${chips('subjectId', subjectOptions(), f.subjectId, { act: 'pick' })}</div>` : ''}
          ${topics.length ? `<label class="field"><span>Topic</span><select name="topicId"><option value="">No topic</option>${topics.filter((x) => !x.parentId).flatMap((x) => [x, ...topics.filter((c) => c.parentId === x.id)]).map((x) => `<option value="${x.id}"${x.id === f.topicId ? ' selected' : ''}>${esc(topicLabel(x))}</option>`).join('')}</select></label>` : ''}
          ${askType ? '' : `<div class="field"><span class="field-label">Mistake type</span>${typeChips()}</div>`}
          <div class="field"><span class="field-label">Difficulty</span>${chips('difficulty', DIFFICULTY, f.difficulty, { act: 'pick' })}</div>
          <div class="grid2">
            <label class="field"><span>Marks lost</span><input type="number" min="0" step="0.5" name="marksLost" value="${esc(f.marksLost)}" inputmode="decimal"></label>
            <label class="field"><span>Date</span><input type="date" name="date" value="${esc(f.date)}"></label>
          </div>
          <div class="grid2">${photoField('photoQ', 'Photo of the question')}${photoField('photoSol', 'Photo of my correct solution')}</div>
          <label class="field"><span>Link</span><input type="url" name="link" value="${esc(f.link)}" placeholder="https://"></label>
          <label class="field"><span>Notes</span><textarea name="notes" placeholder="Anything else worth remembering">${esc(f.notes)}</textarea></label>
        </details>
        ${editing && editing.redoHistory?.length ? `<p class="small muted">Redo history: ${editing.redoHistory.map((r) => `${fmtDay(r.day)} ${r.result === 'got' ? 'Got it' : 'Not yet'}`).join(' · ')}</p>` : ''}
        <div class="row-actions" style="justify-content:space-between">
          ${editing ? `<div class="row"><button type="button" class="btn btn-ghost btn-danger" data-act="del">${icon('trash', 18)} Delete</button>
            ${editing.status === 'fixed' ? '<button type="button" class="btn btn-ghost" data-act="reopen">Reopen</button>' : ''}</div>`
            : `<button type="button" class="btn btn-ghost" data-act="saveAnother">Save & add another</button>`}
          <button class="btn btn-primary" type="submit">Save</button>
        </div>
      </form>`;
    },
    mount: (body) => {
      loadPhotos(body);
      const det = body.querySelector('[data-more]');
      det?.addEventListener('toggle', () => { moreOpen = det.open; });
      body.querySelector('form').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); doSave(false); }
      });
      body.querySelectorAll('[data-change="photo"]').forEach((inp) => inp.addEventListener('change', async () => {
        const file = inp.files && inp.files[0]; if (!file) return;
        readForm(body, f);
        try {
          const blob = await compressImage(file);
          const id = await savePhoto(blob);
          newPhotos.push(id);
          f[inp.dataset.key] = id;
          renderModal(m);
        } catch (err) { toast(err.message || 'Could not add that photo.'); }
      }));
    },
    on: {
      pick: (el) => {
        readForm(m.body, f);
        const { name, value } = el.dataset;
        if (name === 'subjectId') { if (f.subjectId !== value) f.topicId = ''; f.subjectId = value; }
        else f[name] = f[name] === value ? '' : value;
        renderModal(m);
      },
      src: (el) => {
        const inp = m.body.querySelector('[name=source]');
        inp.value = `${el.dataset.v} `;
        inp.focus();
      },
      openMore: () => { const d = m.body.querySelector('[data-more]'); d.open = true; moreOpen = true; d.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
      rmPhoto: (el) => {
        readForm(m.body, f);
        const key = el.dataset.key;
        if (newPhotos.includes(f[key])) deletePhotos([f[key]]);
        f[key] = null;
        renderModal(m);
      },
      save: () => doSave(false),
      saveAnother: () => doSave(true),
      del: async () => {
        if (!(await confirmDialog('Delete this mistake?', 'It will be removed from your log and redo schedule.', 'Delete', true))) return;
        deletePhotos([editing.photoQ, editing.photoSol]);
        remove('mistakes', editing.id);
        saved = true;
        closeModal(m);
        bus.refresh();
      },
      reopen: () => {
        save('mistakes', { ...editing, status: 'open', gotIt: 0, lastGotItDay: null, dueAt: addDays(today(), 1), fixedAt: null });
        saved = true; closeModal(m); toast('Reopened — redo due tomorrow.'); bus.refresh();
      },
    },
    onClose: () => {
      if (!saved) deletePhotos(newPhotos);
    },
  });

  function doSave(another) {
    readForm(m.body, f);
    const missing = ['source', 'wrong', 'fix'].find((k) => !String(f[k] || '').trim());
    if (missing) { m.body.querySelector(`[name=${missing}]`).focus(); m.body.querySelector('form').reportValidity(); return; }
    const rec = {
      ...f,
      source: f.source.trim(), wrong: f.wrong.trim(), fix: f.fix.trim(),
      topicId: f.topicId || null, subjectId: f.subjectId || null,
      marksLost: f.marksLost === '' || f.marksLost === null ? null : Number(f.marksLost),
      date: f.date || today(),
    };
    if (editing) {
      // Remove photos that were replaced.
      const gone = ['photoQ', 'photoSol'].map((k) => (editing[k] && editing[k] !== rec[k] ? editing[k] : null));
      deletePhotos(gone);
      save('mistakes', rec);
    } else {
      Object.assign(rec, newMistakeFields(rec.date < today() ? today() : rec.date));
      save('mistakes', rec);
      if (rec.subjectId) saveSettings({ lastSubjectId: rec.subjectId });
    }
    saved = true;
    if (opts.onSaved) opts.onSaved(rec);
    if (another) {
      newPhotos.length = 0;
      saved = false;
      Object.assign(f, { id: undefined, createdAt: undefined, updatedAt: undefined, source: '', wrong: '', fix: '', photoQ: null, photoSol: null, marksLost: '', link: '', notes: '', type: '', difficulty: '' });
      delete f.id; delete f.createdAt; delete f.updatedAt; delete f.status; delete f.dueAt; delete f.gotIt; delete f.lastGotItDay; delete f.redoHistory;
      renderModal(m);
      toast('Saved. Next one…');
      setTimeout(() => m.body.querySelector('[name=source]')?.focus(), 30);
    } else {
      closeModal(m);
      toast(editing ? 'Saved.' : `Saved. First redo on ${fmtDay(rec.dueAt)}.`);
    }
    bus.refresh();
  }
  return m;
}

// ---------- Redo mode ----------
/** opts: { ids } or { subjectId, topicId, allowOpen } */
export function openRedo(opts = {}) {
  let queue;
  if (opts.ids) queue = opts.ids.map((id) => S.mistakes.find((x) => x.id === id)).filter(Boolean);
  else queue = dueMistakes({ subjectId: opts.subjectId, topicId: opts.topicId });
  let usingOpen = false;
  if (!queue.length && opts.allowOpen) {
    queue = openMistakes(opts.subjectId, opts.topicId);
    usingOpen = true;
  }
  if (!queue.length) {
    toast(opts.subjectId ? 'No open mistakes here. Nice.' : 'Nothing is due for a redo right now.');
    return;
  }
  let idx = 0, revealed = false;
  const res = { got: 0, notyet: 0, fixed: 0 };
  let lastFixed = false;

  const m = openModal({
    full: true,
    html: () => {
      if (idx >= queue.length) {
        return `${modalHead('Redo done')}
          <div class="redo-card"><div class="tour-art" style="height:110px">${icon('check', 48)}</div>
          <p style="font-size:1.1rem">${plural(queue.length, 'mistake')} redone${res.fixed ? ` · ${res.fixed} fixed` : ''}.</p>
          <p class="muted small">The next redo dates are set. ${res.notyet ? 'The “not yet” ones come back in 2 days.' : ''}</p>
          <button class="btn btn-primary" data-act="__close">Close</button></div>`;
      }
      const x = S.mistakes.find((y) => y.id === queue[idx].id) || queue[idx];
      const t = topicById(x.topicId);
      return `${modalHead('Redo mode', `${idx + 1} of ${queue.length}${usingOpen ? ' · practising open mistakes' : ''}`)}
        <div class="redo-card">
          <div class="row" style="justify-content:center;gap:8px">${subjectTag(x.subjectId)}${t ? `<span class="pill">${esc(topicLabel(t))}</span>` : ''}</div>
          <div class="q">${esc(x.source)}</div>
          ${x.photoQ ? `<img class="photo-thumb" style="margin:0 auto 12px" data-photo="${esc(x.photoQ)}" alt="Question photo">` : ''}
          ${lastFixed ? `<p class="small" style="color:var(--ok)">Fixed! That last one is retired.</p>` : ''}
          ${revealed ? `<div class="reveal-box">
              <div class="small muted">What went wrong</div><p>${esc(x.wrong)}</p>
              <div class="small muted">Fix / rule</div><p class="fix">${esc(x.fix)}</p>
              ${x.photoSol ? `<img class="photo-thumb" data-photo="${esc(x.photoSol)}" alt="Solution photo">` : ''}
              ${x.link ? `<p class="small" style="margin-top:8px"><a href="${esc(x.link)}" target="_blank" rel="noopener noreferrer">${esc(x.link)}</a></p>` : ''}
              ${x.notes ? `<p class="small muted" style="margin-top:8px">${esc(x.notes)}</p>` : ''}
            </div>` : `<p class="muted small">Try it on paper first. Then check.</p>
              <button class="btn btn-soft" data-act="reveal" style="margin-bottom:18px">Reveal fix</button>`}
          <div class="row" style="justify-content:center;gap:12px;margin-top:8px">
            <button class="btn" data-act="grade" data-r="notyet" style="min-width:130px">Not yet</button>
            <button class="btn btn-primary" data-act="grade" data-r="got" style="min-width:130px">${icon('check')} Got it</button>
          </div>
        </div>`;
    },
    mount: (body) => loadPhotos(body),
    on: {
      reveal: () => { revealed = true; renderModal(m); },
      grade: (el) => {
        const x = S.mistakes.find((y) => y.id === queue[idx].id);
        if (!x) { idx++; renderModal(m); return; }
        const { mistake, fixed } = applyRedo(x, el.dataset.r);
        save('mistakes', mistake);
        if (el.dataset.r === 'got') res.got++; else res.notyet++;
        if (fixed) res.fixed++;
        lastFixed = fixed;
        idx++; revealed = false;
        renderModal(m);
      },
    },
    onClose: () => bus.refresh(),
  });
}

function openMistakes(subjectId, topicId) {
  return S.mistakes.filter((x) => x.status === 'open')
    .filter((x) => !subjectId || x.subjectId === subjectId)
    .filter((x) => !topicId || x.topicId === topicId || topicById(x.topicId)?.parentId === topicId)
    .sort((a, b) => (a.dueAt || '').localeCompare(b.dueAt || ''));
}

function openRedoPicker() {
  const f = { subjectId: '', topicId: '' };
  const m = openModal({
    html: () => {
      const due = dueMistakes({ subjectId: f.subjectId || null, topicId: f.topicId || null });
      const open = openMistakes(f.subjectId || null, f.topicId || null);
      const topics = f.subjectId ? topicsOf(f.subjectId) : [];
      return `${modalHead('Redo mode', 'Only the question is shown. The fix stays hidden until you tap Reveal.')}
        <div class="field"><span class="field-label">Subject</span>${chips('subjectId', [{ value: '', label: 'All subjects' }, ...subjectOptions()], f.subjectId, { act: 'pick' })}</div>
        ${topics.length ? `<label class="field"><span>Topic</span><select data-change="topic"><option value="">All topics</option>${topics.map((t) => `<option value="${t.id}"${t.id === f.topicId ? ' selected' : ''}>${esc(topicLabel(t))}</option>`).join('')}</select></label>` : ''}
        <p>${due.length ? `<b>${plural(due.length, 'mistake')}</b> ready to redo.` : 'Nothing due here right now.'} <span class="muted small">${plural(open.length, 'open mistake')} in total.</span></p>
        <div class="row-actions end">
          ${open.length && !due.length ? `<button class="btn btn-primary" data-act="go" data-all="1">Practise open ones anyway</button>` : ''}
          ${due.length ? `<button class="btn btn-primary" data-act="go">Start redo</button>` : ''}
        </div>`;
    },
    on: {
      pick: (el) => { f.subjectId = el.dataset.value; f.topicId = ''; renderModal(m); },
      topic: (el) => { f.topicId = el.value; renderModal(m); },
      go: (el) => {
        closeModal(m);
        const s = f.subjectId || null, t = f.topicId || null;
        if (el.dataset.all) openRedo({ ids: openMistakes(s, t).map((x) => x.id) });
        else openRedo({ subjectId: s, topicId: t });
      },
    },
  });
}

// ---------- List ----------
const flt = { q: '', subjectId: '', topicId: '', type: '', status: 'open', due: '' };
let tab = 'list';

function filtered() {
  const q = flt.q.trim().toLowerCase();
  const d = today();
  const week = addDays(d, 7);
  return S.mistakes
    .filter((x) => !flt.subjectId || x.subjectId === flt.subjectId)
    .filter((x) => !flt.topicId || x.topicId === flt.topicId || topicById(x.topicId)?.parentId === flt.topicId)
    .filter((x) => !flt.type || (flt.type === '_none' ? !x.type : x.type === flt.type))
    .filter((x) => !flt.status || x.status === flt.status)
    .filter((x) => !flt.due || (flt.due === 'now' ? isDue(x, d) : x.status === 'open' && x.dueAt && x.dueAt <= week))
    .filter((x) => {
      if (!q) return true;
      const hay = [x.source, x.wrong, x.fix, x.notes, x.link, x.type, x.difficulty, subjectLabel(subjectById(x.subjectId)), topicLabel(topicById(x.topicId))].join(' ').toLowerCase();
      return hay.includes(q);
    })
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
      return (a.dueAt || '9999').localeCompare(b.dueAt || '9999') || (b.createdAt || '').localeCompare(a.createdAt || '');
    });
}

function listRows() {
  const list = filtered();
  if (!S.mistakes.length) {
    return emptyState('Your mistake log is empty',
      'Every question you get wrong goes here with a one-line fix. Study HQ brings it back for a redo until it sticks.',
      'e.g. “May 2023 P2 Q5 — forgot the chain rule → multiply by the derivative of the inside”',
      `<button class="btn btn-primary" data-act="new">${icon('plus')} Log your first mistake</button>`);
  }
  if (!list.length) return `<p class="muted center" style="padding:20px">No mistakes match these filters.</p>`;
  return `<ul class="list">${list.map((x) => `<li><button class="list-item" data-act="open" data-id="${x.id}">
      ${subjectDot(x.subjectId)}
      <span class="grow"><span class="title">${esc(x.source)}</span>
        <span class="small clamp" style="display:block">${esc(x.wrong)} <span class="muted">→ ${esc(x.fix)}</span></span>
        <span class="meta">${subjectTag(x.subjectId)}${x.topicId && topicById(x.topicId) ? `<span class="pill">${esc(topicLabel(topicById(x.topicId)))}</span>` : ''}
        ${x.type ? `<span class="pill">${esc(x.type)}</span>` : ''}
        <span class="pill ${x.status === 'fixed' ? 'ok' : isDue(x) ? 'accent' : ''}">${esc(dueLabel(x))}</span></span>
      </span></button></li>`).join('')}</ul>`;
}

function filtersHtml() {
  const topics = flt.subjectId ? topicsOf(flt.subjectId) : [];
  const sel = (name, opts, val, label) => `<select data-change="flt" data-name="${name}" aria-label="${label}">${opts.map(([v, l]) => `<option value="${esc(v)}"${v === val ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  return `<div class="filters no-print">
    <div class="search">${icon('search')}<input type="search" placeholder="Search all fields" value="${esc(flt.q)}" data-input="q" aria-label="Search mistakes" id="mistake-search"></div>
    ${sel('subjectId', [['', 'All subjects'], ...S.subjects.map((s) => [s.id, subjectLabel(s)])], flt.subjectId, 'Subject')}
    ${topics.length ? sel('topicId', [['', 'All topics'], ...topics.map((t) => [t.id, topicLabel(t)])], flt.topicId, 'Topic') : ''}
    ${sel('type', [['', 'All types'], ...MISTAKE_TYPES.map((t) => [t, t]), ['_none', 'No type']], flt.type, 'Type')}
    ${sel('status', [['open', 'Open'], ['fixed', 'Fixed'], ['', 'Open and fixed']], flt.status, 'Status')}
    ${sel('due', [['', 'Any due date'], ['now', 'Ready to redo'], ['week', 'Due within 7 days']], flt.due, 'Due')}
  </div>`;
}

// ---------- Stats ----------
function statsHtml() {
  const open = S.mistakes.filter((x) => x.status === 'open').length;
  const fixed = S.mistakes.length - open;
  const ws = weekStart();
  const thisWeek = S.mistakes.filter((x) => (x.date || dayStr(new Date(x.createdAt))) >= ws);
  const byType = (arr) => {
    const c = new Map([...MISTAKE_TYPES, 'Not set'].map((t) => [t, 0]));
    arr.forEach((x) => c.set(x.type || 'Not set', (c.get(x.type || 'Not set') || 0) + 1));
    return [...c.entries()];
  };
  const bars = (rows) => {
    const max = Math.max(1, ...rows.map((r) => r[1]));
    return `<div class="bars">${rows.map(([t, n]) => `<div class="bar-row"><span class="label">${esc(t)}</span><div class="track"><div class="fill" style="width:${(n / max) * 100}%"></div></div><span class="small muted" style="min-width:20px;text-align:right">${n}</span></div>`).join('')}</div>`;
  };
  if (!S.mistakes.length) return emptyState('No stats yet', 'Once you log mistakes, you’ll see open vs fixed and which kinds of mistakes you make most.', 'e.g. “Careless: 6 this week” is a sign to use the checklist.');
  return `<div class="card"><div class="stat-nums">
      <div class="stat-num"><span class="muted small">Open</span><b>${open}</b></div>
      <div class="stat-num"><span class="muted small">Fixed</span><b>${fixed}</b></div>
      <div class="stat-num"><span class="muted small">Ready to redo</span><b>${dueMistakes().length}</b></div>
      <div class="stat-num"><span class="muted small">Logged this week</span><b>${thisWeek.length}</b></div></div></div>
    <div class="grid2"><div class="card"><h3>By type — this week</h3>${bars(byType(thisWeek))}</div>
    <div class="card"><h3>By type — all time</h3>${bars(byType(S.mistakes))}</div></div>`;
}

// ---------- Fix sheet ----------
const fs = { subjects: [], topics: [] };

function fixSheetHtml() {
  if (!S.mistakes.length) return emptyState('No fixes yet', 'The fix sheet collects the one-line fix from every mistake, grouped by topic — perfect for the night before a test.', 'e.g. “Chain rule: multiply by the derivative of the inside”');
  const subs = fs.subjects.length ? fs.subjects : S.subjects.map((s) => s.id);
  const topicOpts = S.topics.filter((t) => fs.subjects.includes(t.subjectId));
  const rows = S.mistakes.filter((x) => subs.includes(x.subjectId) || (!x.subjectId && !fs.subjects.length))
    .filter((x) => !fs.topics.length || fs.topics.includes(x.topicId) || fs.topics.includes(topicById(x.topicId)?.parentId));
  const bySubject = new Map();
  rows.forEach((x) => {
    const sk = x.subjectId || '_none';
    if (!bySubject.has(sk)) bySubject.set(sk, new Map());
    const tk = x.topicId || '_none';
    const g = bySubject.get(sk);
    if (!g.has(tk)) g.set(tk, []);
    g.get(tk).push(x);
  });
  const sheet = [...bySubject.entries()].map(([sk, topics]) => {
    const s = subjectById(sk);
    return `<h3>${esc(s ? subjectLabel(s) : 'No subject')}</h3>${[...topics.entries()].map(([tk, list]) => `<h4>${esc(tk === '_none' ? 'No topic' : topicLabel(topicById(tk)))}</h4>
      <ul>${list.map((x) => `<li>${esc(x.fix)} <span class="muted tiny">(${esc(x.source)})</span></li>`).join('')}</ul>`).join('')}`;
  }).join('');
  return `<div class="card no-print"><div class="field"><span class="field-label">Subjects</span>${chips('fsSubject', subjectOptions(), fs.subjects, { multi: true, act: 'fs' })}</div>
      ${topicOpts.length ? `<div class="field" style="margin:0"><span class="field-label">Topics <span class="hint">(optional)</span></span>${chips('fsTopic', topicOpts.map((t) => ({ value: t.id, label: topicLabel(t) })), fs.topics, { multi: true, act: 'fs' })}</div>` : ''}
      <div class="row-actions"><button class="btn btn-primary" data-act="print">${icon('print')} Print fix sheet</button></div></div>
    <div class="card fixsheet"><h2>Fix sheet</h2><p class="muted small">${plural(rows.length, 'fix', 'fixes')} · ${new Date().toLocaleDateString()}</p>${sheet || '<p class="muted">No fixes for this selection.</p>'}</div>`;
}

function render(params) {
  tab = params[0] === 'stats' ? 'stats' : params[0] === 'fixsheet' ? 'fixsheet' : 'list';
  const due = dueMistakes().length;
  return `<div class="page-head no-print"><div><h1>Mistake log</h1><p class="muted">Log it, redo it, fix it for good.</p></div>
    <div class="row wrap"><button class="btn" data-act="redo">${icon('redo')} Redo${due ? ` (${due})` : ''}</button>
    <button class="btn btn-primary" data-act="new">${icon('plus')} Log mistake <span class="kbd" style="background:transparent;color:inherit;border-color:currentColor;opacity:.7">N</span></button></div></div>
    <div class="tabs no-print" role="tablist">
      <button class="${tab === 'list' ? 'on' : ''}" data-act="tab" data-t="" role="tab" aria-selected="${tab === 'list'}">List</button>
      <button class="${tab === 'stats' ? 'on' : ''}" data-act="tab" data-t="stats" role="tab" aria-selected="${tab === 'stats'}">Stats</button>
      <button class="${tab === 'fixsheet' ? 'on' : ''}" data-act="tab" data-t="fixsheet" role="tab" aria-selected="${tab === 'fixsheet'}">Fix sheet</button>
    </div>
    ${tab === 'list' ? `${S.mistakes.length ? filtersHtml() : ''}<div class="card quiet" id="mistake-list">${listRows()}</div>` : tab === 'stats' ? statsHtml() : fixSheetHtml()}`;
}

const view = {
  focusSearchNext: false,
  render,
  mount(root) {
    const q = root.querySelector('#mistake-search');
    if (q) {
      q.addEventListener('input', () => { flt.q = q.value; document.getElementById('mistake-list').innerHTML = listRows(); });
      if (view.focusSearchNext) { view.focusSearchNext = false; q.focus(); }
    }
  },
  on: {
    new: () => openQuickAdd(),
    redo: () => openRedoPicker(),
    open: (el) => { const x = S.mistakes.find((y) => y.id === el.dataset.id); if (x) openQuickAdd({ edit: x }); },
    tab: (el) => bus.go(`#mistakes${el.dataset.t ? '/' + el.dataset.t : ''}`),
    flt: (el) => {
      flt[el.dataset.name] = el.value;
      if (el.dataset.name === 'subjectId') flt.topicId = '';
      bus.refresh();
    },
    fs: (el) => {
      const key = el.dataset.name === 'fsSubject' ? 'subjects' : 'topics';
      const set = new Set(fs[key]); set.has(el.dataset.value) ? set.delete(el.dataset.value) : set.add(el.dataset.value);
      fs[key] = [...set];
      if (key === 'subjects') fs.topics = fs.topics.filter((id) => fs.subjects.includes(topicById(id)?.subjectId));
      bus.refresh();
    },
    print: () => { try { window.print(); } catch { toast('Printing isn’t available here.'); } },
  },
};

export default view;
export { MISTAKE_TYPES as TYPES };
