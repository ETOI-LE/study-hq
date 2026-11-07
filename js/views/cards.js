// Flashcards and key phrases: five boxes (1, 3, 7, 14, 30 days), a daily cap, maths via KaTeX.
import { S, save, remove, setMeta, saveSettings } from '../store.js';
import {
  CARD_TYPES, cardTypeLabel, newCardFields, gradeCard, dueCards, cardsLeftToday, cardsReviewedToday, dailyCap, BOX_DAYS,
  subjectById, subjectLabel, topicsOf, topicById, topicLabel, today, daysBetween,
} from '../logic.js';
import {
  esc, icon, bus, chips, openModal, closeModal, renderModal, modalHead, toast, confirmDialog, emptyState, plural, subjectTag, subjectOptions,
} from '../ui.js';
import { mathHtml, renderMath } from '../math.js';

const PLACEHOLDER = {
  formula: ['e.g. Derivative of $\\tan x$', 'e.g. $\\sec^2 x$'],
  explain: ['e.g. Explain why the resistance of a filament lamp increases', 'e.g. “Temperature increases, so lattice ions vibrate more, so electrons collide more often”'],
  definition: ['e.g. Opportunity cost', 'e.g. The value of the next best alternative given up'],
  gdc: ['e.g. Find the intersection of two graphs', 'e.g. Graph → Menu → Analyze graph → Intersection → pick both curves'],
  fix: ['e.g. Rounding in a multi-step question', 'e.g. Keep full calculator values; round only the final answer'],
};

function dueText(c) {
  if (!c.dueAt) return '';
  const n = daysBetween(today(), c.dueAt);
  if (n <= 0) return 'Due today';
  if (n === 1) return 'Due tomorrow';
  return `Due in ${n} days`;
}

// ---------- Editor ----------
/** opts: { edit, subjectId, topicId, type, front, back, sourceMistakeId } */
export function openCardEditor(opts = {}) {
  const editing = opts.edit || null;
  const lastSubj = S.settings.lastSubjectId && subjectById(S.settings.lastSubjectId) ? S.settings.lastSubjectId : null;
  const f = editing ? { ...editing } : {
    type: opts.type || S.settings.lastCardType || 'definition', subjectId: opts.subjectId ?? lastSubj ?? S.subjects[0]?.id ?? null,
    topicId: opts.topicId || '', front: opts.front || '', back: opts.back || '', sourceMistakeId: opts.sourceMistakeId || null,
  };
  const read = () => { ['front', 'back', 'topicId'].forEach((k) => { const el = m.body.querySelector(`[name=${k}]`); if (el) f[k] = el.value; }); };
  const preview = () => {
    const box = m.body.querySelector('#card-preview');
    if (!box) return;
    const hasTex = /\$/.test(f.front + f.back);
    box.innerHTML = hasTex ? `<div class="eyebrow" style="margin-bottom:6px">Preview</div><div class="card-preview"><b>${mathHtml(f.front)}</b></div><div class="card-preview muted" style="margin-top:6px">${mathHtml(f.back)}</div>` : '';
    box.classList.toggle('hidden', !hasTex);
    renderMath(box);
  };
  let timer = null;
  const m = openModal({
    html: () => {
      const topics = f.subjectId ? topicsOf(f.subjectId) : [];
      const [ph1, ph2] = PLACEHOLDER[f.type] || PLACEHOLDER.definition;
      return `${modalHead(editing ? 'Edit card' : 'New flashcard', editing ? `Box ${editing.box} · ${dueText(editing)}` : 'Front and back. Maths works too: wrap it in $…$.')}
      <form data-submit="save" autocomplete="off">
        <div class="field"><span class="field-label">Type</span>${chips('type', CARD_TYPES.map((t) => ({ value: t.key, label: t.label })), f.type, { act: 'pick' })}</div>
        <label class="field"><span>Front</span><textarea name="front" required rows="2" placeholder="${esc(ph1)}" style="min-height:64px" autofocus>${esc(f.front)}</textarea></label>
        <label class="field"><span>Back</span><textarea name="back" required rows="3" placeholder="${esc(ph2)}">${esc(f.back)}</textarea></label>
        <div id="card-preview" class="card flat hidden" style="margin:-4px 0 14px"></div>
        ${S.subjects.length ? `<div class="field"><span class="field-label">Subject</span>${chips('subjectId', subjectOptions(), f.subjectId, { act: 'pick' })}</div>` : ''}
        ${topics.length ? `<label class="field"><span>Topic <span class="hint">(optional)</span></span><select name="topicId"><option value="">No topic</option>${topics.filter((x) => !x.parentId).flatMap((x) => [x, ...topics.filter((c) => c.parentId === x.id)]).map((x) => `<option value="${x.id}"${x.id === f.topicId ? ' selected' : ''}>${esc(topicLabel(x))}</option>`).join('')}</select></label>` : ''}
        <p class="tiny muted" style="margin:-4px 0 4px">Tip: <code>$\\frac{a}{b}$</code>, <code>$x^2$</code>, <code>$\\sqrt{x}$</code>, <code>$$\\int_0^1 x\\,dx$$</code> for a centred line.</p>
        <div class="row-actions" style="justify-content:space-between">
          ${editing ? `<button type="button" class="btn btn-ghost btn-danger" data-act="del">${icon('trash', 18)} Delete</button>` : `<button type="button" class="btn btn-ghost" data-act="saveAnother">Save & add another</button>`}
          <button class="btn btn-primary" type="submit">Save card</button></div>
      </form>`;
    },
    mount: (body) => {
      body.querySelectorAll('textarea').forEach((t) => t.addEventListener('input', () => { read(); clearTimeout(timer); timer = setTimeout(preview, 250); }));
      body.querySelector('form').addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); doSave(false); } });
      preview();
    },
    on: {
      pick: (el) => {
        read();
        const { name, value } = el.dataset;
        if (name === 'subjectId') { if (f.subjectId !== value) f.topicId = ''; f.subjectId = value; } else f[name] = value;
        renderModal(m);
      },
      save: () => doSave(false),
      saveAnother: () => doSave(true),
      del: async () => {
        if (!(await confirmDialog('Delete this card?', 'It will be removed from your reviews.', 'Delete', true))) return;
        remove('flashcards', editing.id); closeModal(m); bus.refresh();
      },
    },
  });
  function doSave(another) {
    read();
    if (!f.front.trim() || !f.back.trim()) { m.body.querySelector('form').reportValidity(); return; }
    const rec = { ...f, front: f.front.trim(), back: f.back.trim(), topicId: f.topicId || null, subjectId: f.subjectId || null };
    if (!editing) Object.assign(rec, newCardFields());
    save('flashcards', rec);
    saveSettings({ lastCardType: rec.type, ...(rec.subjectId ? { lastSubjectId: rec.subjectId } : {}) });
    if (opts.onSaved) opts.onSaved(rec);
    if (another) {
      Object.assign(f, { front: '', back: '', sourceMistakeId: null }); delete f.id; delete f.createdAt; delete f.updatedAt;
      ['box', 'dueAt', 'lastReviewed', 'history'].forEach((k) => delete f[k]);
      renderModal(m); toast('Card saved. Next one…');
    } else { closeModal(m); toast(editing ? 'Saved.' : 'Card saved — it’s in today’s reviews.'); }
    bus.refresh();
  }
  return m;
}

/** One tap from a mistake-log entry. */
export function cardFromMistake(mk) {
  if (S.flashcards.some((c) => c.sourceMistakeId === mk.id)) { toast('That mistake is already a flashcard.'); return null; }
  const c = save('flashcards', {
    type: 'fix', subjectId: mk.subjectId || null, topicId: mk.topicId || null,
    front: mk.wrong ? `${mk.wrong}` : mk.source, back: mk.fix, sourceMistakeId: mk.id, ...newCardFields(),
  });
  toast('Flashcard made from that fix.');
  return c;
}

/** One tap from a blurting gap. */
export function cardFromGap(text, { subjectId, topicId }) {
  const t = topicById(topicId);
  return save('flashcards', {
    type: 'definition', subjectId: subjectId || null, topicId: topicId || null,
    front: t ? `${t.name}: ${text}?` : `${text}?`, back: text, ...newCardFields(),
  });
}

// ---------- Review ----------
/** opts: { subjectId, topicIds, ids, cram } — cram = practice run that doesn't change the schedule or cap. */
export function openReview(opts = {}) {
  let queue;
  if (opts.ids) queue = opts.ids.map((id) => S.flashcards.find((c) => c.id === id)).filter(Boolean);
  else queue = dueCards({ subjectId: opts.subjectId, topicIds: opts.topicIds });
  const cram = !!opts.cram;
  if (!cram) queue = queue.slice(0, cardsLeftToday());
  if (!queue.length) {
    if (!cram && cardsLeftToday() === 0 && dueCards().length) toast(`That’s your ${dailyCap()} for today — the rest wait for tomorrow.`, 3500);
    else toast(cram ? 'No cards here yet.' : 'No cards due right now.');
    return;
  }
  let idx = 0, flipped = false;
  const tally = { again: 0, good: 0, easy: 0 };
  const nextBox = (c, g) => (g === 'again' ? 1 : Math.min(5, (c.box || 1) + (g === 'good' ? 1 : 2)));
  const daysLabel = (n) => (n === 1 ? '1 day' : `${n} days`);
  const m = openModal({
    full: true,
    html: () => {
      if (idx >= queue.length) {
        const left = cardsLeftToday();
        return `${modalHead(cram ? 'Practice run done' : 'Reviews done')}
          <div class="redo-card"><div class="tour-art" style="height:110px">${icon('check', 46)}</div>
          <p style="font-size:1.1rem;margin-bottom:6px">${plural(queue.length, 'card')} reviewed</p>
          <p class="muted small">${tally.again ? `${tally.again} back to box 1 · ` : ''}${tally.good} good · ${tally.easy} easy</p>
          ${cram ? '<p class="muted small">Practice runs don’t change your schedule.</p>' : `<p class="muted small">${left ? `${plural(left, 'more review')} allowed today.` : `That’s your ${dailyCap()} for today. Reviews never pile up — the rest wait for tomorrow.`}</p>`}
          <button class="btn btn-primary" data-act="__close">Close</button></div>`;
      }
      const c = S.flashcards.find((x) => x.id === queue[idx].id) || queue[idx];
      const t = topicById(c.topicId);
      return `${modalHead(cram ? 'Practice run' : 'Flashcards', `${idx + 1} of ${queue.length}${cram ? ' · doesn’t change your schedule' : ` · box ${c.box || 1}`}`)}
        <div class="progress-line" style="margin:-4px 0 18px"><div style="width:${(idx / queue.length) * 100}%"></div></div>
        <div class="row" style="justify-content:center;gap:8px;margin-bottom:6px">${subjectTag(c.subjectId)}${t ? `<span class="pill">${esc(topicLabel(t))}</span>` : ''}</div>
        <div class="flip${flipped ? ' flipped' : ''}" id="flip"><div class="flip-inner" data-act="flip" role="button" tabindex="0" aria-label="${flipped ? 'Card back' : 'Show the back'}">
          <div class="flip-face front"><span class="eyebrow">${esc(cardTypeLabel(c.type))}</span><div class="cardtext">${mathHtml(c.front)}</div><span class="hint-tap">Tap or press Space to flip</span></div>
          <div class="flip-face back"><span class="eyebrow">Answer</span><div class="cardtext">${mathHtml(c.back)}</div></div>
        </div></div>
        ${flipped ? `<div class="grade-btns swap-in">
            <button class="btn" data-act="grade" data-g="again">Again<small>1 · ${daysLabel(BOX_DAYS[0])}</small></button>
            <button class="btn btn-primary" data-act="grade" data-g="good">Good<small>2 · ${daysLabel(BOX_DAYS[nextBox(c, 'good') - 1])}</small></button>
            <button class="btn" data-act="grade" data-g="easy">Easy<small>3 · ${daysLabel(BOX_DAYS[nextBox(c, 'easy') - 1])}</small></button></div>`
          : `<div class="center"><button class="btn btn-soft" data-act="flip" style="min-width:180px">Show answer</button></div>`}`;
    },
    mount: (body) => renderMath(body),
    on: {
      flip: () => {
        flipped = !flipped;
        const el = m.body.querySelector('#flip');
        if (el) el.classList.toggle('flipped', flipped);
        setTimeout(() => renderModal(m), flipped ? 260 : 0);
      },
      grade: (el) => {
        const c = S.flashcards.find((x) => x.id === queue[idx].id);
        const g = el.dataset.g;
        tally[g]++;
        if (c && !cram) {
          save('flashcards', gradeCard(c, g));
          setMeta('cardReviews', { day: today(), n: cardsReviewedToday() + 1 });
        }
        idx++; flipped = false;
        renderModal(m);
      },
    },
    onClose: () => { document.removeEventListener('keydown', keys); bus.refresh(); },
  });
  function keys(e) {
    if (m.el !== document.querySelector('.modal-wrap:last-child')) return;
    if (idx >= queue.length) return;
    if (e.key === ' ' || e.key === 'Enter') { if (!flipped) { e.preventDefault(); m.on.flip(); } }
    else if (flipped && ['1', '2', '3'].includes(e.key)) {
      const b = m.body.querySelector(`[data-g="${['again', 'good', 'easy'][Number(e.key) - 1]}"]`);
      if (b) m.on.grade(b);
    }
  }
  document.addEventListener('keydown', keys);
}

// ---------- Page ----------
const flt = { q: '', subjectId: '', topicId: '', type: '' };

function filtered() {
  const q = flt.q.trim().toLowerCase();
  return S.flashcards
    .filter((c) => !flt.subjectId || c.subjectId === flt.subjectId)
    .filter((c) => !flt.topicId || c.topicId === flt.topicId || topicById(c.topicId)?.parentId === flt.topicId)
    .filter((c) => !flt.type || c.type === flt.type)
    .filter((c) => !q || [c.front, c.back, cardTypeLabel(c.type), subjectLabel(subjectById(c.subjectId)), topicLabel(topicById(c.topicId))].join(' ').toLowerCase().includes(q))
    .sort((a, b) => (a.dueAt || '').localeCompare(b.dueAt || '') || (b.createdAt || '').localeCompare(a.createdAt || ''));
}

function listHtml() {
  const list = filtered();
  if (!list.length) return '<p class="muted center" style="padding:20px;margin:0">No cards match.</p>';
  return `<ul class="list">${list.slice(0, 200).map((c) => `<li><button class="list-item" data-act="open" data-id="${c.id}">
    <span class="dot" style="background:${esc(subjectById(c.subjectId)?.color || 'var(--muted)')}"></span>
    <span class="grow"><span class="title">${mathHtml(c.front)}</span>
      <span class="small muted clamp" style="display:block">${mathHtml(c.back)}</span>
      <span class="meta"><span class="pill">${esc(cardTypeLabel(c.type))}</span>${c.topicId && topicById(c.topicId) ? `<span class="pill">${esc(topicLabel(topicById(c.topicId)))}</span>` : ''}
      <span class="pill">Box ${c.box || 1}</span><span class="pill ${c.dueAt <= today() ? 'accent' : ''}">${esc(dueText(c))}</span></span></span></button></li>`).join('')}</ul>
    ${list.length > 200 ? `<p class="small muted center">Showing 200 of ${list.length}. Search to narrow it down.</p>` : ''}`;
}

function render() {
  const due = dueCards().length;
  const left = cardsLeftToday();
  const ready = Math.min(due, left);
  const boxes = [1, 2, 3, 4, 5].map((b) => S.flashcards.filter((c) => (c.box || 1) === b).length);
  const maxB = Math.max(1, ...boxes);
  const topics = flt.subjectId ? topicsOf(flt.subjectId) : [];
  const sel = (name, opts, val, label) => `<select data-change="flt" data-name="${name}" aria-label="${label}">${opts.map(([v, l]) => `<option value="${esc(v)}"${v === val ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  return `<div class="page-head"><div><h1>Flashcards</h1><p class="muted">Formulas, key phrases, definitions and calculator steps — reviewed just before you’d forget them.</p></div>
    <div class="row wrap"><button class="btn" data-act="new">${icon('plus')} New card</button>
    <button class="btn btn-primary${ready ? ' btn-start' : ''}" data-act="review" ${ready ? '' : 'disabled'}>${icon('play')} Review${ready ? ` ${ready}` : ''}</button></div></div>

  ${S.flashcards.length ? `<div class="grid2" style="margin-bottom:16px">
    <div class="card"><div class="stat-nums">
      <div class="stat-num"><span>Ready now</span><b data-count="${ready}">${ready}</b></div>
      <div class="stat-num"><span>Reviewed today</span><b>${cardsReviewedToday()}<span class="muted" style="font-size:1rem;font-weight:500"> / ${dailyCap()}</span></b></div>
      <div class="stat-num"><span>All cards</span><b data-count="${S.flashcards.length}">${S.flashcards.length}</b></div></div>
      ${due > left ? `<p class="small muted" style="margin:12px 0 0">${plural(due - left, 'card')} will wait for tomorrow — the daily cap stops reviews piling up.</p>` : ''}</div>
    <div class="card"><div class="card-head"><h3>Boxes</h3><span class="tiny muted">1 → 30 days between reviews</span></div>
      <div class="boxes" aria-label="Cards per box">${boxes.map((n, i) => `<div class="b" title="Box ${i + 1}: ${n} cards, every ${BOX_DAYS[i]} day${BOX_DAYS[i] === 1 ? '' : 's'}"><i style="height:${Math.max(3, (n / maxB) * 44)}px;opacity:${0.45 + i * 0.13}"></i><span>${n}</span></div>`).join('')}</div>
      <div class="row between tiny muted" style="margin-top:4px"><span>New</span><span>Well known</span></div></div></div>

  <div class="filters"><div class="search">${icon('search')}<input type="search" placeholder="Search cards" value="${esc(flt.q)}" id="card-search" aria-label="Search cards"></div>
    ${sel('subjectId', [['', 'All subjects'], ...S.subjects.map((s) => [s.id, subjectLabel(s)])], flt.subjectId, 'Subject')}
    ${topics.length ? sel('topicId', [['', 'All topics'], ...topics.map((t) => [t.id, topicLabel(t)])], flt.topicId, 'Topic') : ''}
    ${sel('type', [['', 'All types'], ...CARD_TYPES.map((t) => [t.key, t.label])], flt.type, 'Type')}</div>
  <div class="card quiet" id="card-list">${listHtml()}</div>
  ${flt.subjectId || flt.topicId ? `<button class="btn btn-ghost" data-act="cram">${icon('cards', 18)} Practice these ${plural(filtered().length, 'card')} (doesn’t change the schedule)</button>` : ''}`
  : `<div class="card">${emptyState('No flashcards yet', 'Make cards for things that aren’t in the formula booklet, exact markscheme wording, definitions and GDC steps. Any mistake-log fix becomes a card in one tap.', 'e.g. Front “Explain why a filament lamp’s resistance rises” → Back “Ions vibrate more, so electrons collide more often”', `<button class="btn btn-primary" data-act="new">${icon('plus')} Make your first card</button>`)}</div>`}`;
}

export default {
  render,
  mount(root) {
    renderMath(root);
    const q = root.querySelector('#card-search');
    q?.addEventListener('input', () => { flt.q = q.value; const l = document.getElementById('card-list'); l.innerHTML = listHtml(); renderMath(l); });
  },
  on: {
    new: () => openCardEditor({ subjectId: flt.subjectId || undefined, topicId: flt.topicId || undefined }),
    review: () => openReview(),
    cram: () => openReview({ ids: filtered().map((c) => c.id), cram: true }),
    open: (el) => { const c = S.flashcards.find((x) => x.id === el.dataset.id); if (c) openCardEditor({ edit: c }); },
    flt: (el) => { flt[el.dataset.name] = el.value; if (el.dataset.name === 'subjectId') flt.topicId = ''; bus.refresh(); },
  },
};
