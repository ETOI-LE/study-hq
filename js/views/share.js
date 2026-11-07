// Share packs: share a flashcard deck, a subject's topic list or a fix sheet as a file, code or link.
// A pack only ever contains what the user picks — never sessions, stats, grades or the mistake log.
import { S, save, saveMany, setMeta, uid } from '../store.js';
import { SUBJECT_COLORS } from '../data-ib.js';
import {
  subjectById, subjectLabel, topicsOf, topicById, topicLabel, childTopics, newCardFields, cardTypeLabel, CARD_TYPES, today,
} from '../logic.js';
import { esc, icon, bus, openModal, closeModal, renderModal, modalHead, toast, emptyState, plural, download, fmtDay, confirmDialog } from '../ui.js';

const KINDS = {
  cards: { label: 'Flashcard deck', icon: 'cards', desc: 'Cards you pick, e.g. “Physics explain key phrases”.' },
  topics: { label: 'Topic list', icon: 'topics', desc: 'A subject’s topics and subtopics — no confidence or notes.' },
  fixes: { label: 'Fix sheet', icon: 'mistakes', desc: 'Only the fix/rule lines, grouped by topic.' },
};
const LINK_LIMIT = 6000;

// ---------- Encoding ----------
const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s) => { const b = atob(s.replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(b, (c) => c.charCodeAt(0)); };
async function pipe(bytes, stream) { const r = new Response(new Blob([bytes]).stream().pipeThrough(stream)); return new Uint8Array(await r.arrayBuffer()); }
export async function encodePack(pack) {
  const raw = new TextEncoder().encode(JSON.stringify(pack));
  if ('CompressionStream' in window) {
    const z = await pipe(raw, new CompressionStream('deflate-raw'));
    let out = ''; for (let i = 0; i < z.length; i += 8000) out += String.fromCharCode(...z.subarray(i, i + 8000));
    return 'z' + btoa(out).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  return 'j' + b64url(raw);
}
export async function decodePack(code) {
  const c = String(code || '').trim().replace(/^.*#share\/import\//, '').replace(/\s+/g, '');
  let bytes;
  try { bytes = unb64url(c.slice(1)); } catch { throw new Error('That code isn’t a Study HQ share pack.'); }
  if (c[0] === 'z') {
    if (!('DecompressionStream' in window)) throw new Error('This browser can’t open compressed packs. Try the file instead.');
    bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
  } else if (c[0] !== 'j') throw new Error('That code isn’t a Study HQ share pack.');
  return checkPack(JSON.parse(new TextDecoder().decode(bytes)));
}
function checkPack(p) {
  if (!p || p.app !== 'study-hq-pack' || !KINDS[p.kind] || !Array.isArray(p.items)) throw new Error('That isn’t a Study HQ share pack.');
  const str = (v, max = 2000) => String(v ?? '').slice(0, max);
  // Keep only the fields each kind is allowed to carry.
  p.title = str(p.title, 140);
  p.subject = p.subject ? { name: str(p.subject.name, 120), short: str(p.subject.short, 60), level: str(p.subject.level, 20), ibKey: p.subject.ibKey ? str(p.subject.ibKey, 40) : null } : null;
  if (p.kind === 'cards') p.items = p.items.slice(0, 2000).map((x) => ({ type: CARD_TYPES.some((t) => t.key === x.type) ? x.type : 'definition', front: str(x.front), back: str(x.back), topic: str(x.topic, 160) }));
  if (p.kind === 'topics') p.items = p.items.slice(0, 300).map((x) => ({ name: str(x.name, 160), children: (x.children || []).slice(0, 100).map((c) => str(c, 160)) }));
  if (p.kind === 'fixes') p.items = p.items.slice(0, 3000).map((x) => ({ topic: str(x.topic, 160), fix: str(x.fix) }));
  return p;
}
const subjInfo = (s) => (s ? { name: s.name, short: s.short || '', level: s.level || '', ibKey: s.ibKey || null } : null);

// ---------- Build a pack ----------
function openBuilder(kind) {
  const f = { kind, subjectId: S.settings.lastSubjectId && subjectById(S.settings.lastSubjectId) ? S.settings.lastSubjectId : S.subjects[0]?.id || '', topicId: '', type: '', topicIds: [], picked: null };
  const cardsFor = () => S.flashcards.filter((c) => (!f.subjectId || c.subjectId === f.subjectId) && (!f.topicId || c.topicId === f.topicId || topicById(c.topicId)?.parentId === f.topicId) && (!f.type || c.type === f.type));
  const fixesFor = () => S.mistakes.filter((x) => x.fix && x.subjectId === f.subjectId && (!f.topicIds.length || f.topicIds.includes(x.topicId) || f.topicIds.includes(topicById(x.topicId)?.parentId)));
  const m = openModal({
    wide: true,
    html: () => {
      const subjSel = `<label class="field"><span>Subject</span><select data-change="subj">${kind === 'cards' ? '<option value="">All subjects</option>' : ''}${S.subjects.map((s) => `<option value="${s.id}"${s.id === f.subjectId ? ' selected' : ''}>${esc(subjectLabel(s))}</option>`).join('')}</select></label>`;
      let body = '';
      if (kind === 'cards') {
        const list = cardsFor();
        if (!f.picked) f.picked = new Set(list.map((c) => c.id));
        const topics = f.subjectId ? topicsOf(f.subjectId) : [];
        body = `<div class="grid3">${subjSel}
          <label class="field"><span>Topic</span><select data-change="topic" ${topics.length ? '' : 'disabled'}><option value="">All topics</option>${topics.map((t) => `<option value="${t.id}"${t.id === f.topicId ? ' selected' : ''}>${esc(topicLabel(t))}</option>`).join('')}</select></label>
          <label class="field"><span>Type</span><select data-change="type"><option value="">All types</option>${CARD_TYPES.map((t) => `<option value="${t.key}"${t.key === f.type ? ' selected' : ''}>${esc(t.label)}</option>`).join('')}</select></label></div>
          ${list.length ? `<div class="row between" style="margin-bottom:6px"><span class="small muted">${f.picked.size} of ${list.length} picked</span><span><button class="link-btn" data-act="all">All</button> · <button class="link-btn" data-act="none">None</button></span></div>
          <div class="pick-list">${list.map((c) => `<label><input type="checkbox" data-change="pick" data-id="${c.id}" ${f.picked.has(c.id) ? 'checked' : ''}><span><b>${esc(c.front)}</b><span class="small muted" style="display:block">${esc(c.back)}</span></span></label>`).join('')}</div>` : '<p class="muted">No cards match.</p>'}`;
      } else if (kind === 'topics') {
        const ts = f.subjectId ? topicsOf(f.subjectId).filter((t) => !t.parentId) : [];
        body = `${subjSel}${ts.length ? `<div class="card flat"><p class="small muted" style="margin-top:0">This shares:</p><ul class="small" style="margin:0;padding-left:20px">${ts.map((t) => `<li>${esc(t.name)}${childTopics(t.id).length ? ` <span class="muted">(${childTopics(t.id).map((c) => esc(c.name)).join(', ')})</span>` : ''}</li>`).join('')}</ul></div>` : '<p class="muted">This subject has no topics yet.</p>'}`;
      } else {
        const ts = f.subjectId ? topicsOf(f.subjectId).filter((t) => !t.parentId) : [];
        const fixes = fixesFor();
        body = `${subjSel}${ts.length ? `<div class="field"><span class="field-label">Topics <span class="hint">(optional — all if none)</span></span><div class="chips">${ts.map((t) => `<button type="button" class="chip sm${f.topicIds.includes(t.id) ? ' on' : ''}" data-act="tp" data-id="${t.id}">${esc(t.name)}</button>`).join('')}</div></div>` : ''}
          <p class="small">${fixes.length ? `<b>${plural(fixes.length, 'fix line', 'fix lines')}</b> — just the rule, not the source or what went wrong.` : '<span class="muted">No fixes logged for this selection.</span>'}</p>`;
      }
      return `${modalHead(`Share a ${KINDS[kind].label.toLowerCase()}`, 'Only what you pick goes in. Nothing else from your Study HQ is shared.')}${body}
        <div class="row-actions end"><button class="btn btn-primary" data-act="make">${icon('share', 18)} Create share pack</button></div>`;
    },
    on: {
      subj: (el) => { f.subjectId = el.value; f.topicId = ''; f.topicIds = []; f.picked = null; renderModal(m); },
      topic: (el) => { f.topicId = el.value; f.picked = null; renderModal(m); },
      type: (el) => { f.type = el.value; f.picked = null; renderModal(m); },
      pick: (el) => { el.checked ? f.picked.add(el.dataset.id) : f.picked.delete(el.dataset.id); renderModal(m); },
      all: () => { f.picked = new Set(cardsFor().map((c) => c.id)); renderModal(m); },
      none: () => { f.picked = new Set(); renderModal(m); },
      tp: (el) => { const s = new Set(f.topicIds); s.has(el.dataset.id) ? s.delete(el.dataset.id) : s.add(el.dataset.id); f.topicIds = [...s]; renderModal(m); },
      make: async () => {
        const s = subjectById(f.subjectId);
        let pack;
        if (kind === 'cards') {
          const cards = cardsFor().filter((c) => f.picked.has(c.id));
          if (!cards.length) { toast('Pick at least one card.'); return; }
          const subjIds = new Set(cards.map((c) => c.subjectId));
          const one = subjIds.size === 1 ? subjectById([...subjIds][0]) : null;
          const typeName = f.type ? cardTypeLabel(f.type).toLowerCase() : 'flashcards';
          pack = { kind, title: `${one ? subjectLabel(one) + ' ' : ''}${f.topicId ? topicById(f.topicId)?.name + ' ' : ''}${typeName}`.trim(), subject: subjInfo(one),
            items: cards.map((c) => ({ type: c.type, front: c.front, back: c.back, topic: topicById(c.topicId)?.name || '' })) };
        } else if (kind === 'topics') {
          const ts = topicsOf(f.subjectId).filter((t) => !t.parentId);
          if (!ts.length) { toast('This subject has no topics yet.'); return; }
          pack = { kind, title: `${subjectLabel(s)} topics`, subject: subjInfo(s), items: ts.map((t) => ({ name: t.name, children: childTopics(t.id).map((c) => c.name) })) };
        } else {
          const fixes = fixesFor();
          if (!fixes.length) { toast('No fixes in this selection.'); return; }
          pack = { kind, title: `${subjectLabel(s)} fix sheet`, subject: subjInfo(s), items: fixes.map((x) => ({ topic: topicLabel(topicById(x.topicId)) || '', fix: x.fix })) };
        }
        closeModal(m);
        showPack({ app: 'study-hq-pack', v: 1, createdAt: today(), ...pack });
      },
    },
  });
}

async function showPack(pack) {
  const code = await encodePack(pack);
  const link = `${location.origin}${location.pathname}#share/import/${code}`;
  const linkOk = code.length <= LINK_LIMIT && location.protocol !== 'file:';
  const fname = `${pack.title.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'pack'}.studyhq.json`;
  openModal({
    html: () => `${modalHead('Share pack ready', `${pack.title} · ${plural(pack.items.length, pack.kind === 'topics' ? 'topic' : pack.kind === 'fixes' ? 'fix' : 'card', pack.kind === 'fixes' ? 'fixes' : undefined)}`)}
      <p class="small muted">Your friend previews what’s inside, then imports it with one tap. It goes into their own Study HQ — they can’t see anything else of yours.</p>
      <div class="grid3" style="margin-bottom:14px">
        ${linkOk ? `<button class="btn btn-primary" data-act="link">${icon('link', 18)} Copy link</button>` : ''}
        <button class="btn" data-act="code">${icon('copy', 18)} Copy code</button>
        <button class="btn" data-act="file">${icon('download', 18)} Download file</button></div>
      ${navigator.share ? `<button class="btn btn-ghost btn-wide" data-act="native">${icon('share', 18)} Share…</button>` : ''}
      ${linkOk ? '' : '<p class="tiny muted">This pack is too big for a link — send the file or the code instead.</p>'}
      <details class="more"><summary>Show the code</summary><div class="code-box">${esc(code)}</div></details>`,
    on: {
      link: () => copy(link, 'Link copied — paste it to a friend.'),
      code: () => copy(code, 'Code copied.'),
      file: () => download(fname, JSON.stringify(pack, null, 1), 'application/json'),
      native: async () => { try { await navigator.share({ title: pack.title, text: `Study HQ share pack: ${pack.title}`, ...(linkOk ? { url: link } : {}) }); } catch { /* cancelled */ } },
    },
  });
}
async function copy(text, msg) {
  try { await navigator.clipboard.writeText(text); toast(msg); } catch { toast('Couldn’t copy — select the code and copy it by hand.'); }
}

// ---------- Import ----------
function exactSubject(info) {
  if (!info) return null;
  return S.subjects.find((s) => info.ibKey && s.ibKey === info.ibKey && (s.level || '') === (info.level || ''))
    || S.subjects.find((s) => s.name.toLowerCase() === (info.name || '').toLowerCase() && (s.level || '') === (info.level || '')) || null;
}
function matchSubject(info) {
  if (!info) return null;
  return exactSubject(info) || S.subjects.find((s) => info.ibKey && s.ibKey === info.ibKey) || null;
}

export function previewImport(pack) {
  const match = matchSubject(pack.subject);
  const exact = exactSubject(pack.subject);
  const f = { target: match ? match.id : (pack.subject ? '_new' : '') };
  const m = openModal({
    html: () => {
      const sample = pack.items.slice(0, 6);
      return `${modalHead('Preview share pack', `${KINDS[pack.kind].label} · ${plural(pack.items.length, 'item')}`)}
        <div class="card flat"><b>${esc(pack.title)}</b>${pack.subject ? `<div class="small muted">${esc([pack.subject.name, pack.subject.level].filter(Boolean).join(' '))}</div>` : ''}
          <ul class="small" style="margin:10px 0 0;padding-left:20px">${sample.map((x) => `<li>${pack.kind === 'cards' ? `<b>${esc(x.front)}</b> — ${esc(x.back)}` : pack.kind === 'topics' ? `${esc(x.name)}${x.children.length ? ` <span class="muted">(${x.children.map(esc).join(', ')})</span>` : ''}` : `${esc(x.fix)}${x.topic ? ` <span class="muted">· ${esc(x.topic)}</span>` : ''}`}</li>`).join('')}
          ${pack.items.length > sample.length ? `<li class="muted">…and ${pack.items.length - sample.length} more</li>` : ''}</ul></div>
        ${pack.kind !== 'fixes' ? `<label class="field"><span>Add to</span><select data-change="target">
          ${pack.subject && !exact ? `<option value="_new"${f.target === '_new' ? ' selected' : ''}>New subject: ${esc([pack.subject.short || pack.subject.name, pack.subject.level].filter(Boolean).join(' '))}</option>` : ''}
          ${pack.kind === 'cards' ? `<option value=""${f.target === '' ? ' selected' : ''}>No subject</option>` : ''}
          ${S.subjects.map((s) => `<option value="${s.id}"${s.id === f.target ? ' selected' : ''}>${esc(subjectLabel(s))}</option>`).join('')}</select></label>`
          : '<p class="small muted">Fix sheets are kept on the Share page, where you can print them or turn the lines into flashcards.</p>'}
        <div class="row-actions end"><button class="btn btn-primary" data-act="go">${icon('download', 18)} Import</button></div>`;
    },
    on: {
      target: (el) => { f.target = el.value; },
      go: () => {
        const n = doImport(pack, f.target);
        closeModal(m);
        toast(n);
        setMeta('pendingImport', null);
        bus.go(pack.kind === 'cards' ? '#cards' : pack.kind === 'topics' && f.targetId ? `#topics/${f.targetId}` : '#share');
      },
    },
  });
  function doImport(p, target) {
    let subj = target && target !== '_new' ? subjectById(target) : null;
    if (target === '_new' && p.subject) {
      const used = new Set(S.subjects.map((s) => s.color));
      subj = save('subjects', { name: p.subject.name, short: p.subject.short, level: p.subject.level, ibKey: p.subject.ibKey, scale: p.subject.ibKey ? 'ib' : 'text', color: SUBJECT_COLORS.find((c) => !used.has(c)) || SUBJECT_COLORS[0], current: '', target: '', order: S.subjects.length });
    }
    f.targetId = subj?.id;
    const topicByName = (name) => (subj && name ? topicsOf(subj.id).find((t) => t.name.toLowerCase() === name.toLowerCase() || topicLabel(t).toLowerCase() === name.toLowerCase()) : null);
    if (p.kind === 'cards') {
      saveMany('flashcards', p.items.filter((x) => x.front && x.back).map((x) => ({ id: uid(), type: x.type, front: x.front, back: x.back, subjectId: subj?.id || null, topicId: topicByName(x.topic)?.id || null, imported: true, ...newCardFields() })));
      return `Imported ${plural(p.items.length, 'card')}. They’re in today’s reviews.`;
    }
    if (p.kind === 'topics') {
      if (!subj) return 'Pick a subject to add the topics to.';
      let added = 0;
      p.items.forEach((x) => {
        let t = topicByName(x.name);
        if (!t && x.name) { t = save('topics', { subjectId: subj.id, parentId: null, name: x.name, confidence: null, notes: '', order: topicsOf(subj.id).length }); added++; }
        x.children.forEach((c) => { if (c && !childTopics(t.id).some((k) => k.name.toLowerCase() === c.toLowerCase())) { save('topics', { subjectId: subj.id, parentId: t.id, name: c, confidence: null, notes: '', order: childTopics(t.id).length }); added++; } });
      });
      return added ? `Added ${plural(added, 'topic')} to ${subjectLabel(subj)}.` : 'You already had all of these topics.';
    }
    setMeta('sharedSheets', [{ id: uid(), title: p.title, subject: p.subject, items: p.items, importedAt: new Date().toISOString() }, ...(S.meta.sharedSheets || [])]);
    return `Saved “${p.title}” to your Share page.`;
  }
}

async function importCode(code) {
  try { previewImport(await decodePack(code)); } catch (e) { toast(e.message || 'Couldn’t read that pack.', 4500); }
}
async function importFile(file) {
  try { previewImport(checkPack(JSON.parse(await file.text()))); } catch (e) { toast(e.message?.startsWith('That') ? e.message : 'That file isn’t a Study HQ share pack.', 4500); }
}

// ---------- Shared fix sheets ----------
function openSheet(sh) {
  openModal({
    wide: true,
    html: () => {
      const groups = new Map();
      sh.items.forEach((x) => { const k = x.topic || 'Other'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(x.fix); });
      return `${modalHead(sh.title, `Imported ${fmtDay(sh.importedAt)}`)}<div class="fixsheet">${[...groups.entries()].map(([t, l]) => `<h4>${esc(t)}</h4><ul>${l.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`).join('')}</div>
        <div class="row-actions no-print" style="justify-content:space-between"><button class="btn btn-ghost btn-danger" data-act="del">${icon('trash', 18)} Remove</button>
        <div class="row">${S.profile?.features?.flashcards ? `<button class="btn" data-act="toCards">${icon('cards', 18)} Make ${plural(sh.items.length, 'flashcard')}</button>` : ''}<button class="btn btn-primary" data-act="print">${icon('print', 18)} Print</button></div></div>`;
    },
    on: {
      print: () => { document.body.classList.add('printing'); window.print(); setTimeout(() => document.body.classList.remove('printing'), 500); },
      toCards: (el) => {
        const subj = matchSubject(sh.subject);
        saveMany('flashcards', sh.items.map((x) => ({ id: uid(), type: 'fix', front: x.topic ? `${x.topic}: what’s the rule?` : 'What’s the rule?', back: x.fix, subjectId: subj?.id || null, topicId: subj && x.topic ? topicsOf(subj.id).find((t) => t.name === x.topic)?.id || null : null, imported: true, ...newCardFields() })));
        el.disabled = true; toast(`Made ${plural(sh.items.length, 'flashcard')}.`);
      },
      del: async () => {
        if (!(await confirmDialog('Remove this fix sheet?', 'Only the shared sheet is removed.', 'Remove', true))) return;
        setMeta('sharedSheets', (S.meta.sharedSheets || []).filter((x) => x.id !== sh.id)); closeModal(); bus.refresh();
      },
    },
  });
}

function render() {
  const sheets = S.meta.sharedSheets || [];
  return `<div class="page-head"><div><h1>Share packs</h1><p class="muted">Swap study material with friends. They only get what you pick.</p></div></div>
    <h2 class="section-title" style="margin-top:0">Share</h2>
    <div class="grid3">${Object.entries(KINDS).map(([k, v]) => `<button class="card link" data-act="build" data-k="${k}" style="text-align:left;font:inherit;color:inherit;cursor:pointer">
      <span class="row" style="gap:10px;margin-bottom:6px;color:var(--accent)">${icon(v.icon, 22)}<b style="color:var(--text)">${esc(v.label)}</b></span><span class="small muted">${esc(v.desc)}</span></button>`).join('')}</div>
    <h2 class="section-title">Import</h2>
    <div class="card"><form data-submit="paste"><label class="field"><span>Paste a link or code from a friend</span><textarea name="code" rows="2" placeholder="e.g. https://…/#share/import/z… or z…" style="min-height:60px"></textarea></label>
      <div class="row wrap"><button class="btn btn-primary" type="submit">Preview</button><label class="btn">${icon('upload', 18)} Open a pack file<input type="file" accept=".json,application/json" class="sr-only" data-change="file"></label></div></form></div>
    <p class="small muted">Packs never include sessions, stats, grades or your full mistake log.</p>
    ${sheets.length ? `<h2 class="section-title">Fix sheets from friends</h2><div class="card quiet"><ul class="list">${sheets.map((sh) => `<li><button class="list-item" data-act="sheet" data-id="${sh.id}"><span class="grow"><span class="title">${esc(sh.title)}</span><span class="reason" style="display:block">${plural(sh.items.length, 'fix', 'fixes')} · imported ${esc(fmtDay(sh.importedAt))}</span></span>${icon('chev')}</button></li>`).join('')}</ul></div>` : ''}`;
}

export default {
  render,
  enter(params) { if (params[0] === 'import' && params[1]) setTimeout(() => importCode(params[1]), 60); },
  on: {
    build: (el) => {
      const k = el.dataset.k;
      if (!S.subjects.length) { toast('Add a subject first.'); return; }
      if (k === 'cards' && !S.flashcards.length) { toast('You don’t have any flashcards yet.'); return; }
      openBuilder(k);
    },
    paste: (el) => { const v = el.querySelector('[name=code]').value.trim(); if (v) importCode(v); },
    file: (el) => { const file = el.files && el.files[0]; el.value = ''; if (file) importFile(file); },
    sheet: (el) => { const sh = (S.meta.sharedSheets || []).find((x) => x.id === el.dataset.id); if (sh) openSheet(sh); },
  },
};
