// Settings: my setup, features, subjects, defaults, checklists, look, backups, privacy.
import { S, FEATURES, save, remove, saveProfile, saveSettings, DEFAULT_RITUAL, DEFAULT_CARELESS } from '../store.js';
import { IB_SUBJECTS, IB_TOPICS, IB_GRADES, CORE_GRADES, SUBJECT_COLORS } from '../data-ib.js';
import { subjectLabel, topicsOf, gradeScale } from '../logic.js';
import { esc, icon, bus, chips, openModal, closeModal, renderModal, modalHead, toast, confirmDialog, plural } from '../ui.js';
import { HARDEST, DAY_NAMES, NOTES, FOCUS, labelOf } from './onboarding.js';
import { exportAll, readBackup, backupSummary, restoreBackup, exportMistakesCsv, eraseEverything } from '../backup.js';
import { hasSample, clearSampleData } from '../sample.js';
import { backupDaysAgo } from './today.js';
import * as session from '../session.js';

function setupSummary() {
  const a = S.profile?.answers || {};
  const rows = [
    ['Name', S.profile?.name || '—'],
    ['Studying', (a.course || 'ib') === 'ib' ? 'IB Diploma' : 'Other course'],
    ['Hardest for you', (a.hardest || []).length ? a.hardest.map((h) => labelOf(HARDEST, h)).join(', ') : '—'],
    ['Focus before a break', a.focus ? labelOf(FOCUS, a.focus) : 'Not sure'],
    ['Lose track of time', a.hyperfocus ? 'Yes' : 'No'],
    ['Practise on', (a.practice || []).join(', ') || '—'],
    ['Notes', a.notes ? labelOf(NOTES, a.notes) : '—'],
    ['Homework app', S.settings.taskApp || '—'],
    ['Weekly review day', DAY_NAMES[a.reviewDay ?? 0]],
    ['Started with', a.startMode === 'everything' ? 'Everything' : 'Simple'],
  ];
  return `<ul class="summary-list">${rows.map(([k, v]) => `<li><span class="k">${esc(k)}</span><span class="v">${esc(v)}</span></li>`).join('')}</ul>`;
}

function toggle(act, key, checked, title, desc, disabled = false) {
  return `<label class="toggle${disabled ? ' disabled' : ''}"><span><b>${esc(title)}</b>${desc ? `<span class="small muted" style="display:block">${esc(desc)}</span>` : ''}</span>
    <input type="checkbox" data-change="${act}" data-key="${key}" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span class="switch"></span></label>`;
}

function editList(name, items) {
  return `<div class="edit-list">${items.map((it, i) => `<div class="item"><input type="text" value="${esc(it)}" data-list="${name}" data-i="${i}" aria-label="Item ${i + 1}">
    <button class="icon-btn" data-act="rmItem" data-list="${name}" data-i="${i}" aria-label="Remove">${icon('close', 18)}</button></div>`).join('')}
    <form class="item" data-submit="addItem" data-list="${name}"><input type="text" placeholder="Add an item" name="item"><button class="btn" type="submit">Add</button></form>
    <button class="link-btn" data-act="resetList" data-list="${name}">Reset to defaults</button></div>`;
}

function render() {
  const st = S.settings;
  const f = S.profile?.features || {};
  const days = backupDaysAgo();
  const backupLine = days === null ? 'No backup yet' : days === 0 ? 'Last backup: today' : `Last backup: ${plural(days, 'day')} ago`;
  return `<div class="page-head"><div><h1>Settings</h1><p class="muted">Everything here saves automatically.</p></div></div>

  <h2 class="section-title" id="sec-setup">My setup</h2>
  <div class="card">${setupSummary()}
    <div class="row-actions"><a class="btn" href="#onboarding/edit">Change my answers</a><a class="btn btn-ghost" href="#onboarding/redo">Redo onboarding</a></div></div>

  <h2 class="section-title" id="sec-features">Features</h2>
  <div class="card">${FEATURES.filter((x) => x.phase === 1).map((x) => toggle('feature', x.key, f[x.key], x.label, x.desc)).join('')}
    <div class="divider"></div>
    <p class="small muted" style="margin-bottom:4px">Coming in Phase 2 — these switch on by themselves when they arrive, based on your setup:</p>
    ${FEATURES.filter((x) => x.phase === 2).map((x) => toggle('feature', x.key, f[x.key], x.label, f[x.key] ? 'Will be on' : 'Will be off')).join('')}</div>

  <h2 class="section-title" id="sec-subjects">Subjects and topics</h2>
  <div class="card">${S.subjects.length ? `<ul class="list">${S.subjects.map((s) => `<li class="list-item" style="cursor:default;align-items:center">
      <span class="dot" style="background:${esc(s.color)};width:14px;height:14px"></span>
      <span class="grow"><b>${esc(subjectLabel(s))}</b>${s.sample ? ' <span class="pill">sample</span>' : ''}<span class="small muted" style="display:block">${plural(topicsOf(s.id).length, 'topic')}${s.current || s.target ? ` · ${esc(s.current || '–')} → ${esc(s.target || '–')}` : ''}</span></span>
      <a class="btn btn-ghost" href="#topics/${s.id}">Topics</a><button class="btn" data-act="editSubject" data-id="${s.id}">Edit</button></li>`).join('')}</ul>` : '<p class="muted">No subjects yet.</p>'}
    <div class="row-actions"><button class="btn btn-primary" data-act="addSubject">${icon('plus')} Add subject</button></div></div>

  <h2 class="section-title" id="sec-focus">Focus defaults</h2>
  <div class="card">
    <div class="field"><span class="field-label">Sprint length</span>${chips('sprintLen', [15, 20, 25, 45].map((n) => ({ value: String(n), label: `${n} min` })), String(st.sprintLen), { act: 'setNum' })}</div>
    <div class="field"><span class="field-label">Break length</span>${chips('breakLen', [3, 5, 10, 15].map((n) => ({ value: String(n), label: `${n} min` })), String(st.breakLen), { act: 'setNum' })}</div>
    <div class="field"><span class="field-label">Number of sprints</span>${chips('sprints', [1, 2, 3, 4].map((n) => ({ value: String(n), label: String(n) })), String(st.sprints), { act: 'setNum' })}</div>
    ${toggle('setting', 'hardStopOn', st.hardStopOn, 'Hard stop on by default', 'Each new session gets an alarm at a set clock time.')}
    <p class="small muted" style="margin:10px 0 0">New settings are used next time you open session setup. Your last session’s choices are remembered too.</p></div>

  <h2 class="section-title" id="sec-lists">Checklists</h2>
  <div class="grid2"><div class="card"><h3>Start ritual</h3><p class="small muted">Shown before the timer starts${f.startRitual ? '' : ' (switched off in Features)'}.</p>${editList('ritualItems', st.ritualItems || [])}</div>
    <div class="card"><h3>Careless-error checklist</h3><p class="small muted">Shown in practice sessions.</p>${editList('carelessItems', st.carelessItems || [])}</div></div>

  <h2 class="section-title" id="sec-look">Sound and look</h2>
  <div class="card">${toggle('setting', 'sound', st.sound, 'Sounds', 'A chime when a sprint or break ends.')}
    <div class="row" style="margin:6px 0 14px"><button class="btn btn-ghost" data-act="testSound">Play test sound</button>
      <button class="btn btn-ghost" data-act="notif">${icon('bell', 18)} ${'Notification' in window && Notification.permission === 'granted' ? 'Notifications are on' : 'Turn on notifications'}</button></div>
    <div class="field" style="margin:0"><span class="field-label">Theme</span>${chips('theme', [{ value: 'system', label: 'Match my device' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }], st.theme || 'system', { act: 'theme' })}</div></div>

  <h2 class="section-title" id="sec-backup">Backups</h2>
  <div class="card"><p><b>${esc(backupLine)}</b>${days !== null && days >= 7 ? ' — a fresh backup would be a good idea.' : ''}</p>
    <p class="small muted">A backup is one file with everything, including photos. Import it on another device or browser to move your data.</p>
    <div class="row-actions" style="margin-top:6px">
      <button class="btn btn-primary" data-act="export">${icon('download')} Export everything</button>
      <label class="btn">${icon('upload')} Import backup<input type="file" accept="application/json,.json" class="sr-only" data-change="import"></label>
      <button class="btn" data-act="csv">Mistake log as CSV</button>
    </div>
    <p class="tiny muted" style="margin:10px 0 0">Practice log CSV arrives with the practice log in Phase 2.</p>
    <div class="divider"></div>
    <div class="row wrap">${hasSample() ? `<button class="btn" data-act="clearSample">Clear sample data</button>` : '<span class="small muted">No sample data.</span>'}
      <button class="btn btn-ghost btn-danger" data-act="erase">Erase everything</button></div></div>

  <h2 class="section-title" id="sec-privacy">Privacy</h2>
  <div class="card"><p class="small">Your data is stored only in this browser on this device (IndexedDB). It is never sent to a server, and anyone else who opens the same link gets their own empty Study HQ — they can’t see yours.</p>
    <p class="small">No sign-up, no analytics, no tracking, no ads.</p>
    <p class="small muted" style="margin:0">Because data lives in this browser, clearing your browser’s site data deletes it. Use Export to keep a backup or move to another device.</p></div>
  <p class="tiny muted center" style="margin-top:24px">Study HQ · Phase 1</p>`;
}

// ---------- Subjects ----------
function nextColor() {
  const used = new Set(S.subjects.map((s) => s.color));
  return SUBJECT_COLORS.find((c) => !used.has(c)) || SUBJECT_COLORS[S.subjects.length % SUBJECT_COLORS.length];
}

function createSubject({ ibKey, level, name }) {
  const ib = ibKey ? IB_SUBJECTS.find((x) => x.key === ibKey) : null;
  const s = save('subjects', {
    name: ib ? ib.name : name, short: ib?.short || '', level: level || '', ibKey: ibKey || null,
    scale: ib ? (ib.scale || 'ib') : 'text', color: nextColor(), current: '', target: '', order: S.subjects.length,
  });
  const list = ibKey ? IB_TOPICS[ibKey] : null;
  if (list) list.forEach((n, i) => save('topics', { subjectId: s.id, parentId: null, name: n, confidence: null, notes: '', order: i }));
  return s;
}

function addSubjectModal() {
  let q = '';
  const isIb = (S.profile?.course || 'ib') === 'ib';
  const listHtml = () => IB_SUBJECTS.filter((s) => !q || s.name.toLowerCase().includes(q.toLowerCase()) || (s.short || '').toLowerCase().includes(q.toLowerCase()))
    .map((s) => `<div class="subj-item"><span class="name">${esc(s.name)}</span>${s.levels.map((lv) => {
      const has = S.subjects.some((x) => x.ibKey === s.key && x.level === lv);
      return `<button class="chip lv${has ? ' on' : ''}" data-act="addIb" data-key="${s.key}" data-level="${lv}" ${has ? 'disabled' : ''}>${lv}</button>`;
    }).join('')}</div>`).join('');
  const m = openModal({
    wide: true,
    html: () => `${modalHead('Add subject', isIb ? 'IB Maths, Physics, Chemistry, Biology and Economics come with topic lists.' : '')}
      ${`<div class="search">${icon('search')}<input type="search" placeholder="Search IB subjects" data-input="q" aria-label="Search IB subjects"></div>
      <div class="subj-list" id="add-subj-list">${listHtml()}</div>`}
      <form class="row wrap" data-submit="addCustom" style="margin-top:14px"><input type="text" name="name" placeholder="Or add your own, e.g. A-level Chemistry" style="flex:2 1 200px" required>
        <input type="text" name="level" placeholder="Level (optional)" style="flex:1 1 120px"><button class="btn" type="submit">${icon('plus')} Add</button></form>`,
    mount: (body) => {
      const inp = body.querySelector('[data-input=q]');
      inp?.addEventListener('input', () => { q = inp.value; body.querySelector('#add-subj-list').innerHTML = listHtml(); });
    },
    on: {
      addIb: (el) => {
        const s = createSubject({ ibKey: el.dataset.key, level: el.dataset.level });
        toast(`Added ${subjectLabel(s)}.`);
        m.body.querySelector('#add-subj-list').innerHTML = listHtml();
        bus.refresh();
      },
      addCustom: () => {
        const name = m.body.querySelector('[name=name]').value.trim(); if (!name) return;
        const s = createSubject({ name, level: m.body.querySelector('[name=level]').value.trim() });
        toast(`Added ${subjectLabel(s)}. Add its topics on the Topics page.`);
        closeModal(m); bus.refresh();
      },
    },
  });
}

function editSubjectModal(s) {
  const f = { ...s };
  const m = openModal({
    html: () => {
      const scale = gradeScale(f);
      const gradeField = (key, label) => scale
        ? `<label class="field"><span>${label}</span><select name="${key}"><option value="">–</option>${scale.map((g) => `<option${String(f[key]) === g ? ' selected' : ''}>${g}</option>`).join('')}</select></label>`
        : `<label class="field"><span>${label}</span><input type="text" name="${key}" value="${esc(f[key] || '')}" placeholder="e.g. B"></label>`;
      return `${modalHead('Edit subject')}<form data-submit="save">
        <label class="field"><span>Name</span><input type="text" name="name" value="${esc(f.name)}" required></label>
        <div class="grid2"><label class="field"><span>Short name <span class="hint">(optional)</span></span><input type="text" name="short" value="${esc(f.short || '')}" placeholder="e.g. Maths AA"></label>
        <label class="field"><span>Level</span><input type="text" name="level" value="${esc(f.level || '')}" placeholder="e.g. HL"></label></div>
        <div class="grid2">${gradeField('current', 'Current grade')}${gradeField('target', 'Target grade')}</div>
        <div class="field"><span class="field-label">Colour</span><div class="chips">${SUBJECT_COLORS.map((c) => `<button type="button" class="chip${f.color === c ? ' on' : ''}" data-act="color" data-c="${c}" aria-label="Colour ${c}" style="padding:0 10px"><span class="dot" style="background:${c};width:18px;height:18px"></span></button>`).join('')}
          <label class="chip" style="padding:0 6px" title="Custom colour"><input type="color" value="${esc(f.color)}" data-change="customColor" style="width:30px;height:28px;border:0;background:none;padding:0"></label></div></div>
        <div class="row-actions" style="justify-content:space-between"><button type="button" class="btn btn-ghost btn-danger" data-act="del">${icon('trash', 18)} Delete subject</button>
          <button class="btn btn-primary" type="submit">Save</button></div></form>`;
    },
    on: {
      color: (el) => { read(); f.color = el.dataset.c; renderModal(m); },
      customColor: (el) => { read(); f.color = el.value; },
      save: () => {
        read(); if (!f.name.trim()) return;
        save('subjects', { ...f, name: f.name.trim() });
        closeModal(m); bus.refresh(); toast('Saved.');
      },
      del: async () => {
        const nT = topicsOf(s.id).length, nM = S.mistakes.filter((x) => x.subjectId === s.id).length;
        if (!(await confirmDialog(`Delete ${subjectLabel(s)}?`, `This deletes its ${plural(nT, 'topic')} and ${plural(nM, 'mistake')}. Past sessions are kept. You can’t undo this unless you have a backup.`, 'Delete', true))) return;
        topicsOf(s.id).forEach((t) => remove('topics', t.id));
        S.mistakes.filter((x) => x.subjectId === s.id).forEach((x) => remove('mistakes', x.id));
        remove('subjects', s.id);
        closeModal(m); bus.refresh();
      },
    },
  });
  function read() {
    ['name', 'short', 'level', 'current', 'target'].forEach((k) => { const el = m.body.querySelector(`[name=${k}]`); if (el) f[k] = el.value; });
  }
}

// ---------- Import ----------
async function importFile(file) {
  let obj;
  try { obj = await readBackup(file); } catch (e) { toast(e.message, 5000); return; }
  const sum = backupSummary(obj);
  const when = sum.exportedAt ? new Date(sum.exportedAt).toLocaleString() : 'unknown date';
  const ok = await confirmDialog('Restore this backup?',
    `Backup from ${when}: ${plural(sum.subjects, 'subject')}, ${plural(sum.mistakes, 'mistake')}, ${plural(sum.sessions, 'session')}, ${plural(sum.photos, 'photo')}. This replaces everything currently in Study HQ on this browser.`,
    'Restore', true);
  if (!ok) return;
  try {
    session.discard();
    await restoreBackup(obj);
    bus.applyTheme();
    toast('Backup restored.');
    bus.go('#today');
  } catch (e) {
    console.error(e);
    toast('Restore failed: ' + (e.message || e), 6000);
  }
}

let listTimer = null;

export default {
  render,
  mount(root, params) {
    if (params[0]) {
      const el = document.getElementById(`sec-${params[0]}`);
      if (el) setTimeout(() => el.scrollIntoView({ block: 'start' }), 0);
    }
    root.querySelectorAll('[data-list][data-i]').forEach((inp) => {
      if (inp.tagName !== 'INPUT') return;
      inp.addEventListener('input', () => {
        clearTimeout(listTimer);
        listTimer = setTimeout(() => {
          const name = inp.dataset.list;
          const items = [...(S.settings[name] || [])];
          items[Number(inp.dataset.i)] = inp.value;
          saveSettings({ [name]: items, ...(name === 'ritualItems' ? { ritualCustomised: true } : {}) });
        }, 300);
      });
    });
  },
  on: {
    feature: (el) => {
      saveProfile({ features: { ...(S.profile.features || {}), [el.dataset.key]: el.checked } });
      bus.refresh();
    },
    setting: (el) => { saveSettings({ [el.dataset.key]: el.checked }); },
    setNum: (el) => { saveSettings({ [el.dataset.name]: Number(el.dataset.value), lastSetup: { ...(S.settings.lastSetup || {}), [el.dataset.name]: Number(el.dataset.value) } }); bus.refresh(); },
    theme: (el) => { saveSettings({ theme: el.dataset.value }); bus.applyTheme(); bus.refresh(); },
    testSound: () => session.testSound(),
    notif: async () => {
      if (!('Notification' in window)) { toast('This browser doesn’t support notifications.'); return; }
      if (Notification.permission === 'denied') { toast('Notifications are blocked — allow them in your browser’s site settings.', 5000); return; }
      await session.askNotifications();
      bus.refresh();
    },
    rmItem: (el) => {
      const name = el.dataset.list;
      const items = (S.settings[name] || []).filter((_, i) => i !== Number(el.dataset.i));
      saveSettings({ [name]: items, ...(name === 'ritualItems' ? { ritualCustomised: true } : {}) });
      bus.refresh();
    },
    addItem: (el) => {
      const name = el.dataset.list;
      const v = el.querySelector('[name=item]').value.trim(); if (!v) return;
      saveSettings({ [name]: [...(S.settings[name] || []), v], ...(name === 'ritualItems' ? { ritualCustomised: true } : {}) });
      bus.refresh();
    },
    resetList: (el) => {
      const name = el.dataset.list;
      saveSettings({ [name]: name === 'ritualItems' ? [...DEFAULT_RITUAL] : [...DEFAULT_CARELESS] });
      bus.refresh();
    },
    addSubject: addSubjectModal,
    editSubject: (el) => { const s = S.subjects.find((x) => x.id === el.dataset.id); if (s) editSubjectModal(s); },
    export: async () => {
      try { await exportAll(); toast('Backup downloaded.'); bus.refresh(); } catch (e) { toast('Export failed: ' + (e.message || e), 5000); }
    },
    import: (el) => { const file = el.files && el.files[0]; el.value = ''; if (file) importFile(file); },
    csv: () => { if (!S.mistakes.length) { toast('No mistakes to export yet.'); return; } exportMistakesCsv(); },
    clearSample: async () => {
      if (!(await confirmDialog('Clear sample data?', 'Removes the sample subjects and everything logged under them (mistakes, sessions, topics). Your own subjects and their data stay.', 'Clear'))) return;
      clearSampleData(); toast('Sample data cleared.'); bus.refresh();
    },
    erase: async () => {
      if (!(await confirmDialog('Erase everything?', 'This deletes all your Study HQ data in this browser and starts onboarding again. Export a backup first if you might want it back.', 'Erase everything', true))) return;
      session.discard();
      await eraseEverything();
      bus.applyTheme();
      bus.go('#today');
    },
  },
};

export { IB_GRADES, CORE_GRADES };
